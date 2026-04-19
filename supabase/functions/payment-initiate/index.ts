import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl=Deno.env.get('SUPABASE_URL') ?? ''
const serviceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''

const supabase=createClient(supabaseUrl,serviceRoleKey,{
  auth:{ persistSession:false }
})

const json=(status:number,payload:Record<string,unknown>)=>new Response(JSON.stringify(payload),{
  status,
  headers:{ ...corsHeaders,'content-type':'application/json' }
})

type JsonRecord=Record<string,unknown>

type PaymentProviderPayload={
  provider:string
  booking_id:string
  amount?:number
  currency_code?:string
  success_url?:string
  cancel_url?:string
}

type PaymentContext={
  booking:JsonRecord
  customer:JsonRecord | null
  service:JsonRecord | null
  payment:JsonRecord
  amount:number
  currencyCode:string
}

interface PaymentProvider{
  initiatePayment(payload:PaymentProviderPayload,context:PaymentContext):Promise<Record<string,unknown>>
}

const safeText=(value:unknown)=>String(value ?? '').trim()
const normalizeProvider=(value:unknown)=>safeText(value).toLowerCase().replace(/[\s-]+/g,'_')
const nowIso=()=>new Date().toISOString()
const asNumber=(value:unknown,fallback=0)=>{
  const numeric=Number(value)
  return Number.isFinite(numeric) ? numeric : fallback
}
const xmlEscape=(value:unknown)=>String(value ?? '')
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&apos;')

const readXmlTag=(xml:string,tag:string)=>{
  const match=xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`,'i'))
  return safeText(match?.[1] ?? '')
}

const appendQuery=(rawUrl:string,params:Record<string,string>)=>{
  const nextUrl=new URL(rawUrl)
  Object.entries(params).forEach(([key,value])=>{
    if(value)nextUrl.searchParams.set(key,value)
  })
  return nextUrl.toString()
}

const toMinorUnits=(amount:number)=>{
  return String(Math.max(0,Math.round((Number(amount || 0)+Number.EPSILON)*100)))
}

const buildManualInstructions=()=>{
  const configured=safeText(Deno.env.get('BANK_TRANSFER_INSTRUCTIONS'))
  if(configured)return configured
  return 'Bank transfer pending. Add your production EFT instructions in the BANK_TRANSFER_INSTRUCTIONS secret.'
}

const requireEnv=(key:string,message:string)=>{
  const value=safeText(Deno.env.get(key))
  if(!value)throw new Error(message)
  return value
}

const updatePaymentRecord=async(paymentId:string,payload:JsonRecord)=>{
  const { error }=await supabase.from('payments').update(payload).eq('id',paymentId)
  if(error)throw error
}

const loadContext=async(payload:PaymentProviderPayload):Promise<PaymentContext>=>{
  const bookingId=safeText(payload.booking_id)
  if(!bookingId)throw new Error('booking_id is required.')

  const { data:booking,error:bookingError }=await supabase
    .from('bookings')
    .select('id,reference,brand_code,customer_id,service_id,preferred_date,total_amount,amount_due_now,currency_code')
    .eq('id',bookingId)
    .single()

  if(bookingError || !booking)throw new Error('Booking not found.')

  const [{ data:customer },{ data:service },{ data:existingPayment }] = await Promise.all([
    supabase.from('customers').select('id,full_name,email,phone').eq('id',booking.customer_id).maybeSingle(),
    supabase.from('services').select('id,name').eq('id',booking.service_id).maybeSingle(),
    supabase.from('payments').select('*').eq('booking_id',booking.id).maybeSingle()
  ])

  const currencyCode=safeText(payload.currency_code || booking.currency_code || existingPayment?.currency_code || 'NAD').toUpperCase()
  const amount=Math.max(
    0,
    asNumber(payload.amount,asNumber(existingPayment?.amount,asNumber(booking.amount_due_now,asNumber(booking.total_amount,0))))
  )
  const provider=safeText(payload.provider || existingPayment?.provider || 'manual_eft')

  let payment=existingPayment
  if(payment){
    await updatePaymentRecord(String(payment.id),{
      provider,
      amount,
      currency_code:currencyCode,
      status:payment.status === 'paid' ? 'paid' : 'pending',
      updated_at:nowIso(),
      metadata:{
        ...(typeof payment.metadata === 'object' && payment.metadata ? payment.metadata : {}),
        source:'payment-initiate'
      }
    })
    payment={ ...payment, provider, amount, currency_code:currencyCode }
  }else{
    const { data:inserted,error:insertError }=await supabase
      .from('payments')
      .insert({
        booking_id:booking.id,
        provider,
        status:'pending',
        currency_code:currencyCode,
        amount,
        amount_received:0,
        metadata:{ source:'payment-initiate' }
      })
      .select('*')
      .single()
    if(insertError || !inserted)throw insertError ?? new Error('Payment record could not be created.')
    payment=inserted
  }

  return {
    booking,
    customer:customer ?? null,
    service:service ?? null,
    payment,
    amount,
    currencyCode
  }
}

class ManualEftProvider implements PaymentProvider{
  async initiatePayment(payload:PaymentProviderPayload,context:PaymentContext){
    await updatePaymentRecord(String(context.payment.id),{
      provider:payload.provider,
      status:'pending',
      external_checkout_url:null,
      metadata:{
        ...(typeof context.payment.metadata === 'object' && context.payment.metadata ? context.payment.metadata : {}),
        instructions:buildManualInstructions(),
        flow:'manual_eft'
      }
    })
    return {
      provider:payload.provider,
      status:'pending',
      instructions:buildManualInstructions(),
      redirect_url:null
    }
  }
}

class StripeWalletProvider implements PaymentProvider{
  constructor(private walletPreference:'stripe'|'apple_pay'|'google_pay'){}

  async initiatePayment(payload:PaymentProviderPayload,context:PaymentContext){
    const stripeSecret=requireEnv('STRIPE_SECRET_KEY','STRIPE_SECRET_KEY is missing. Add your Stripe secret key before enabling card or wallet checkout.')
    const successUrl=appendQuery(
      safeText(payload.success_url) || (()=>{ throw new Error('success_url is required for hosted checkout providers.') })(),
      {
        reference:safeText(context.booking.reference),
        provider:payload.provider,
        payment:'success',
        session_id:'{CHECKOUT_SESSION_ID}'
      }
    )
    const cancelUrl=appendQuery(
      safeText(payload.cancel_url) || safeText(payload.success_url) || (()=>{ throw new Error('cancel_url is required for hosted checkout providers.') })(),
      {
        reference:safeText(context.booking.reference),
        provider:payload.provider,
        payment:'cancelled'
      }
    )

    const params=new URLSearchParams()
    params.set('mode','payment')
    params.set('success_url',successUrl)
    params.set('cancel_url',cancelUrl)
    params.set('payment_method_types[0]','card')
    params.set('client_reference_id',safeText(context.booking.reference))
    params.set('line_items[0][price_data][currency]',context.currencyCode.toLowerCase())
    params.set('line_items[0][price_data][unit_amount]',toMinorUnits(context.amount))
    params.set('line_items[0][price_data][product_data][name]',safeText(context.service?.name || `Booking ${context.booking.reference}`))
    params.set('line_items[0][price_data][product_data][description]',`${safeText(context.booking.reference)} - ${safeText(context.booking.brand_code || 'SkyBook')}`)
    params.set('line_items[0][quantity]','1')
    params.set('payment_intent_data[metadata][payment_id]',safeText(context.payment.id))
    params.set('payment_intent_data[metadata][booking_id]',safeText(context.booking.id))
    params.set('payment_intent_data[metadata][booking_reference]',safeText(context.booking.reference))
    params.set('metadata[payment_id]',safeText(context.payment.id))
    params.set('metadata[booking_id]',safeText(context.booking.id))
    params.set('metadata[booking_reference]',safeText(context.booking.reference))
    params.set('metadata[wallet_preference]',this.walletPreference)
    if(safeText(context.customer?.email))params.set('customer_email',safeText(context.customer?.email))

    const response=await fetch('https://api.stripe.com/v1/checkout/sessions',{
      method:'POST',
      headers:{
        Authorization:`Bearer ${stripeSecret}`,
        'content-type':'application/x-www-form-urlencoded'
      },
      body:params.toString()
    })

    const result=await response.json().catch(()=>({}))
    if(!response.ok){
      throw new Error(safeText(result?.error?.message) || 'Stripe Checkout session could not be created.')
    }

    await updatePaymentRecord(String(context.payment.id),{
      provider:payload.provider,
      status:'pending',
      external_checkout_url:safeText(result.url),
      provider_reference:safeText(result.id),
      metadata:{
        ...(typeof context.payment.metadata === 'object' && context.payment.metadata ? context.payment.metadata : {}),
        stripe_checkout_session_id:safeText(result.id),
        wallet_preference:this.walletPreference,
        provider_engine:'stripe_checkout'
      }
    })

    const note=this.walletPreference === 'apple_pay'
      ? 'Apple Pay is presented by Stripe Checkout on supported Apple devices after domain registration in Stripe.'
      : this.walletPreference === 'google_pay'
        ? 'Google Pay is presented by Stripe Checkout on supported browsers and devices.'
        : 'Stripe-hosted checkout created.'

    return {
      provider:payload.provider,
      status:'pending',
      redirect_url:safeText(result.url),
      checkout_session_id:safeText(result.id),
      note
    }
  }
}

class DpoProvider implements PaymentProvider{
  async initiatePayment(payload:PaymentProviderPayload,context:PaymentContext){
    const companyToken=requireEnv('DPO_COMPANY_TOKEN','DPO_COMPANY_TOKEN is missing. Add your DPO merchant company token before enabling DPO checkout.')
    const serviceType=requireEnv('DPO_SERVICE_TYPE','DPO_SERVICE_TYPE is missing. Add your DPO service type before enabling DPO checkout.')
    const apiUrl=safeText(Deno.env.get('DPO_API_URL')) || 'https://secure.3gdirectpay.com/API/v6/'
    const paymentTimeLimit=safeText(Deno.env.get('DPO_PAYMENT_TIME_LIMIT_HOURS')) || '24'
    const preferredDate=safeText(context.booking.preferred_date)
    const serviceDate=preferredDate
      ? `${preferredDate.replace(/-/g,'/')} 08:00`
      : `${new Date().toISOString().slice(0,10).replace(/-/g,'/')} 08:00`

    const redirectUrl=appendQuery(
      safeText(payload.success_url) || (()=>{ throw new Error('success_url is required for DPO checkout.') })(),
      {
        reference:safeText(context.booking.reference),
        provider:'dpo',
        payment:'return'
      }
    )
    const callbackUrl=`${supabaseUrl.replace(/\/+$/,'')}/functions/v1/payment-webhook?provider=dpo&payment_id=${encodeURIComponent(safeText(context.payment.id))}&booking_id=${encodeURIComponent(safeText(context.booking.id))}`
    const xmlBody=`<?xml version="1.0" encoding="utf-8"?>
<API3G>
  <CompanyToken>${xmlEscape(companyToken)}</CompanyToken>
  <Request>createToken</Request>
  <Transaction>
    <PaymentAmount>${xmlEscape(context.amount.toFixed(2))}</PaymentAmount>
    <PaymentCurrency>${xmlEscape(context.currencyCode)}</PaymentCurrency>
    <CompanyRef>${xmlEscape(context.booking.reference)}</CompanyRef>
    <RedirectURL>${xmlEscape(redirectUrl)}</RedirectURL>
    <BackURL>${xmlEscape(callbackUrl)}</BackURL>
    <CompanyRefUnique>0</CompanyRefUnique>
    <PTL>${xmlEscape(paymentTimeLimit)}</PTL>
    <customerFirstName>${xmlEscape(safeText(context.customer?.full_name).split(' ')[0] || 'Guest')}</customerFirstName>
    <customerLastName>${xmlEscape(safeText(context.customer?.full_name).split(' ').slice(1).join(' ') || 'Booking')}</customerLastName>
    <customerEmail>${xmlEscape(safeText(context.customer?.email))}</customerEmail>
  </Transaction>
  <Services>
    <Service>
      <ServiceType>${xmlEscape(serviceType)}</ServiceType>
      <ServiceDescription>${xmlEscape(safeText(context.service?.name || `Booking ${context.booking.reference}`))}</ServiceDescription>
      <ServiceDate>${xmlEscape(serviceDate)}</ServiceDate>
    </Service>
  </Services>
</API3G>`

    const response=await fetch(apiUrl,{
      method:'POST',
      headers:{
        Accept:'application/xml',
        'content-type':'application/xml; charset=utf-8'
      },
      body:xmlBody
    })

    const xmlResponse=await response.text()
    if(!response.ok){
      throw new Error(`DPO token request failed with status ${response.status}.`)
    }

    const resultCode=readXmlTag(xmlResponse,'Result')
    const resultExplanation=readXmlTag(xmlResponse,'ResultExplanation')
    const transToken=readXmlTag(xmlResponse,'TransToken')
    const transRef=readXmlTag(xmlResponse,'TransRef')

    if(resultCode !== '000' || !transToken){
      throw new Error(resultExplanation || 'DPO did not return a valid transaction token.')
    }

    const hostedUrl=`https://secure.3gdirectpay.com/pay.asp?ID=${encodeURIComponent(transToken)}`
    await updatePaymentRecord(String(context.payment.id),{
      provider:'dpo',
      status:'pending',
      external_checkout_url:hostedUrl,
      provider_reference:transRef || transToken,
      metadata:{
        ...(typeof context.payment.metadata === 'object' && context.payment.metadata ? context.payment.metadata : {}),
        dpo_trans_token:transToken,
        dpo_trans_ref:transRef,
        provider_engine:'dpo'
      }
    })

    return {
      provider:'dpo',
      status:'pending',
      redirect_url:hostedUrl,
      transaction_token:transToken,
      transaction_reference:transRef || null,
      note:'Hosted DPO checkout created.'
    }
  }
}

const providers:Record<string,PaymentProvider>={
  manual_eft:new ManualEftProvider(),
  stripe:new StripeWalletProvider('stripe'),
  apple_pay:new StripeWalletProvider('apple_pay'),
  google_pay:new StripeWalletProvider('google_pay'),
  dpo:new DpoProvider()
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{ headers:corsHeaders })
  if(request.method!=='POST')return json(405,{ error:'Method not allowed.' })
  try{
    const payload=await request.json() as PaymentProviderPayload
    const providerKey=normalizeProvider(payload.provider || 'manual_eft')
    const provider=providers[providerKey]
    if(!provider)return json(400,{ error:'Unsupported payment provider.' })
    const normalizedPayload={...payload,provider:providerKey}
    const context=await loadContext(normalizedPayload)
    const payment=await provider.initiatePayment(normalizedPayload,context)
    return json(200,{ payment })
  }catch(error){
    return json(400,{ error:error instanceof Error ? error.message : 'Payment initiation failed.' })
  }
})
