import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders } from '../_shared/cors.ts'

const supabase=createClient(
  Deno.env.get('SUPABASE_URL') ?? '',
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? '',
  { auth:{persistSession:false} }
)

const json=(status:number,payload:Record<string,unknown>)=>new Response(JSON.stringify(payload),{
  status,
  headers:{...corsHeaders,'content-type':'application/json'}
})

const safeText=(value:unknown)=>String(value ?? '').trim()
const normalizeProvider=(value:unknown)=>safeText(value).toLowerCase().replace(/[\s-]+/g,'_')
const asNumber=(value:unknown,fallback=0)=>{
  const numeric=Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
const isTruthyEnv=(value:unknown)=>['1','true','yes','on'].includes(safeText(value).toLowerCase())
const readXmlTag=(xml:string,tag:string)=>{
  const match=xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,'i'))
  return safeText(match?.[1] ?? '')
}
const timingSafeEqual=(left:string,right:string)=>{
  if(left.length!==right.length)return false
  let mismatch=0
  for(let index=0;index<left.length;index+=1){
    mismatch|=left.charCodeAt(index)^right.charCodeAt(index)
  }
  return mismatch===0
}
const toHex=(bytes:ArrayBuffer)=>[...new Uint8Array(bytes)].map(value=>value.toString(16).padStart(2,'0')).join('')

const verifyStripeWebhookSignature=async(rawBody:string,signatureHeader:string,secret:string)=>{
  const components=signatureHeader.split(',').map(part=>part.trim()).filter(Boolean)
  const timestamp=components.find(part=>part.startsWith('t='))?.slice(2) || ''
  const signatures=components.filter(part=>part.startsWith('v1=')).map(part=>part.slice(3)).filter(Boolean)
  if(!timestamp || !signatures.length){
    throw new Error('Stripe webhook signature header is missing the expected timestamp or v1 signature.')
  }

  const toleranceSeconds=Math.max(0,asNumber(Deno.env.get('STRIPE_WEBHOOK_TOLERANCE_SECONDS'),300))
  const timestampSeconds=asNumber(timestamp,0)
  if(toleranceSeconds>0 && timestampSeconds>0){
    const ageSeconds=Math.abs(Math.floor(Date.now()/1000)-timestampSeconds)
    if(ageSeconds>toleranceSeconds){
      throw new Error('Stripe webhook timestamp is outside the allowed tolerance.')
    }
  }

  const encoder=new TextEncoder()
  const cryptoKey=await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name:'HMAC', hash:'SHA-256' },
    false,
    ['sign']
  )
  const digest=await crypto.subtle.sign('HMAC',cryptoKey,encoder.encode(`${timestamp}.${rawBody}`))
  const expectedSignature=toHex(digest)
  if(!signatures.some(signature=>timingSafeEqual(signature,expectedSignature))){
    throw new Error('Stripe webhook signature could not be verified.')
  }
}

const recordHealthEvent=async(payload:{
  event_type:string
  severity:string
  summary:string
  detail?:string
  related_booking_id?:string | null
  metadata?:Record<string,unknown>
})=>{
  try{
    await supabase.from('system_health_events').insert({
      event_type:payload.event_type,
      severity:payload.severity,
      source:'payment-webhook',
      summary:payload.summary,
      detail:payload.detail || null,
      related_booking_id:payload.related_booking_id || null,
      status:'open',
      metadata:payload.metadata || {}
    })
  }catch{}
}

const parsePayload=async(request:Request,url:URL)=>{
  if(request.method==='GET')return { payload:Object.fromEntries(url.searchParams.entries()), rawText:'' }
  const contentType=request.headers.get('content-type') || ''
  const clone=request.clone()
  const rawText=await request.text()
  if(contentType.includes('application/json')){
    return { payload:rawText ? JSON.parse(rawText) : {}, rawText }
  }
  if(contentType.includes('application/x-www-form-urlencoded')){
    return { payload:Object.fromEntries(new URLSearchParams(rawText).entries()), rawText }
  }
  if(contentType.includes('multipart/form-data')){
    const formData=await clone.formData()
    return {
      payload:Object.fromEntries([...formData.entries()].map(([key,value])=>[key,String(value)])),
      rawText
    }
  }
  if(contentType.includes('xml') || rawText.trim().startsWith('<')){
    return {
      payload:{
        Result:readXmlTag(rawText,'Result'),
        ResultExplanation:readXmlTag(rawText,'ResultExplanation'),
        TransToken:readXmlTag(rawText,'TransToken'),
        TransRef:readXmlTag(rawText,'TransRef')
      },
      rawText
    }
  }
  return { payload:Object.fromEntries(new URLSearchParams(rawText).entries()), rawText }
}

const resolvePaymentId=(provider:string,payload:Record<string,unknown>,url:URL)=>{
  const nestedObject=((payload.data as Record<string,unknown> | undefined)?.object ?? {}) as Record<string,unknown>
  const nestedMetadata=(nestedObject.metadata ?? {}) as Record<string,unknown>
  const payloadMetadata=(payload.metadata ?? {}) as Record<string,unknown>
  return safeText(
    url.searchParams.get('payment_id')
      || payload.payment_id
      || nestedMetadata.payment_id
      || payloadMetadata.payment_id
      || ''
  )
}

const resolveWebhookProvider=(payload:Record<string,unknown>,url:URL)=>{
  const explicit=normalizeProvider(url.searchParams.get('provider') || payload.provider)
  if(explicit)return explicit
  const nestedObject=((payload.data as Record<string,unknown> | undefined)?.object ?? {}) as Record<string,unknown>
  const eventType=safeText(payload.type)
  const objectType=safeText(nestedObject.object || payload.object)
  if(eventType.startsWith('checkout.') || eventType.startsWith('payment_') || objectType.includes('checkout'))return 'stripe'
  if(payload.Result || payload.TransToken || payload.TransRef || payload.TransactionToken || payload.TransactionRef)return 'dpo'
  return 'custom'
}

const resolveNextStatus=(provider:string,payload:Record<string,unknown>)=>{
  if(provider==='dpo'){
    const result=safeText(payload.Result || payload.result || payload.status)
    if(result==='000')return 'paid'
    if(result)return 'failed'
    return 'pending'
  }
  const eventType=safeText(payload.type)
  const nestedObject=((payload.data as Record<string,unknown> | undefined)?.object ?? {}) as Record<string,unknown>
  const checkoutPaymentStatus=safeText(nestedObject.payment_status)
  if(eventType==='checkout.session.completed' || checkoutPaymentStatus==='paid')return 'paid'
  if(eventType.includes('payment_failed') || safeText(payload.status).toLowerCase()==='failed')return 'failed'
  if(['paid','pending','failed','cancelled','refunded'].includes(safeText(payload.status).toLowerCase()))return safeText(payload.status).toLowerCase()
  return 'pending'
}

const resolveAmount=(provider:string,payload:Record<string,unknown>,payment:Record<string,unknown>)=>{
  if(provider==='dpo'){
    return asNumber(payload.Amount || payload.amount,payment.amount ? asNumber(payment.amount) : 0)
  }
  const nestedObject=((payload.data as Record<string,unknown> | undefined)?.object ?? {}) as Record<string,unknown>
  const stripeAmount=asNumber(nestedObject.amount_total,0)
  if(stripeAmount>0)return stripeAmount/100
  const payloadAmount=asNumber(payload.amount,0)
  if(payloadAmount>0 && payloadAmount > 999)return payloadAmount/100
  return payloadAmount || asNumber(payment.amount_received,asNumber(payment.amount,0))
}

const resolveProviderReference=(provider:string,payload:Record<string,unknown>)=>{
  if(provider==='dpo'){
    return safeText(payload.TransRef || payload.TransactionRef || payload.TransToken || payload.TransactionToken || payload.id)
  }
  const nestedObject=((payload.data as Record<string,unknown> | undefined)?.object ?? {}) as Record<string,unknown>
  return safeText(payload.transaction_reference || payload.id || nestedObject.payment_intent || nestedObject.id)
}

Deno.serve(async request=>{
  const url=new URL(request.url)
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(!['POST','GET'].includes(request.method))return json(405,{error:'Method not allowed.'})
  try{
    const { payload, rawText }=await parsePayload(request,url)
    const parsedPayload=payload as Record<string,unknown>
    const gatewayProvider=resolveWebhookProvider(parsedPayload,url)
    if(request.method==='GET' && gatewayProvider!=='dpo'){
      return json(405,{error:'Method not allowed.'})
    }
    if(gatewayProvider==='stripe'){
      if(request.method!=='POST'){
        return json(405,{error:'Method not allowed.'})
      }
      const stripeWebhookSecret=safeText(Deno.env.get('STRIPE_WEBHOOK_SECRET'))
      if(stripeWebhookSecret){
        await verifyStripeWebhookSignature(rawText,request.headers.get('stripe-signature') || '',stripeWebhookSecret)
      }else if(isTruthyEnv(Deno.env.get('REQUIRE_STRIPE_WEBHOOK_SIGNATURE'))){
        throw new Error('STRIPE_WEBHOOK_SECRET is required to verify Stripe webhooks.')
      }
    }
    const paymentId=resolvePaymentId(gatewayProvider,parsedPayload,url)
    if(!paymentId){
      await recordHealthEvent({
        event_type:'payment_callback',
        severity:'error',
        summary:'Payment webhook received without payment_id',
        detail:'The webhook payload did not include a resolvable payment_id.',
        metadata:{ provider:gatewayProvider, payload:parsedPayload }
      })
      return json(400,{error:'payment_id is required.'})
    }

    const { data:payment,error:paymentError }=await supabase.from('payments').select('*').eq('id',paymentId).single()
    if(paymentError || !payment){
      await recordHealthEvent({
        event_type:'payment_callback',
        severity:'critical',
        summary:'Payment webhook could not match payment record',
        detail:String(paymentError?.message || 'Payment not found.'),
        metadata:{ provider:gatewayProvider, payment_id:paymentId, payload:parsedPayload }
      })
      return json(404,{error:'Payment not found.'})
    }

    const paymentProvider=safeText(payment.provider || gatewayProvider || 'custom')
    const nextStatus=resolveNextStatus(gatewayProvider,parsedPayload)
    const amount=resolveAmount(gatewayProvider,parsedPayload,payment)
    const providerReference=resolveProviderReference(gatewayProvider,parsedPayload)

    const transactionInsert=await supabase.from('payment_transactions').insert({
      payment_id:payment.id,
      provider:gatewayProvider,
      transaction_reference:providerReference,
      transaction_type:'webhook',
      status:nextStatus,
      amount,
      currency_code:String(payment.currency_code || 'NAD'),
      raw_payload:parsedPayload,
      reconciled_at:new Date().toISOString()
    })
    if(transactionInsert.error)throw transactionInsert.error

    const paymentUpdate=await supabase.from('payments').update({
      provider:paymentProvider,
      provider_reference:providerReference || payment.provider_reference || null,
      status:nextStatus,
      amount_received:nextStatus==='paid' ? amount || payment.amount : payment.amount_received,
      paid_at:nextStatus==='paid' ? new Date().toISOString() : null,
      metadata:{
        ...(typeof payment.metadata === 'object' && payment.metadata ? payment.metadata : {}),
        webhook_provider:gatewayProvider
      }
    }).eq('id',payment.id)
    if(paymentUpdate.error)throw paymentUpdate.error

    if(nextStatus==='paid'){
      const { data:booking }=await supabase.from('bookings').select('id,status').eq('id',payment.booking_id).maybeSingle()
      const priorStatus=safeText(booking?.status || 'awaiting_payment')
      const bookingUpdate=await supabase.from('bookings').update({
        payment_status:'paid',
        status:['completed','cancelled','refunded'].includes(priorStatus) ? priorStatus : 'confirmed'
      }).eq('id',payment.booking_id)
      if(bookingUpdate.error)throw bookingUpdate.error
      if(priorStatus !== 'confirmed'){
        const historyInsert=await supabase.from('booking_status_history').insert({
          booking_id:payment.booking_id,
          from_status:priorStatus,
          to_status:'confirmed',
          reason:'Payment received via webhook',
          actor_label:`webhook:${gatewayProvider}`
        })
        if(historyInsert.error)throw historyInsert.error
      }
    }else if(nextStatus==='failed'){
      await recordHealthEvent({
        event_type:'payment_callback',
        severity:'warning',
        summary:'Payment callback reported a failed payment',
        detail:safeText(parsedPayload.ResultExplanation || parsedPayload.message || 'Gateway returned a failed payment status.'),
        related_booking_id:safeText(payment.booking_id),
        metadata:{ provider:gatewayProvider, payment_id:paymentId, provider_reference:providerReference }
      })
    }

    return json(200,{ok:true,status:nextStatus})
  }catch(error){
    await recordHealthEvent({
      event_type:'payment_callback',
      severity:'critical',
      summary:'Payment webhook processing failed',
      detail:error instanceof Error ? error.message : 'Unknown webhook processing error.'
    })
    return json(500,{error:error instanceof Error ? error.message : 'Payment webhook failed.'})
  }
})
