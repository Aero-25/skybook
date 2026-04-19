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

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
  try{
    const provider=(new URL(request.url)).searchParams.get('provider') || 'custom'
    const payload=await request.json()
    const paymentId=String(payload.payment_id||payload.data?.object?.metadata?.payment_id||'')
    if(!paymentId){
      await recordHealthEvent({
        event_type:'payment_callback',
        severity:'error',
        summary:'Payment webhook received without payment_id',
        detail:'The webhook payload did not include a resolvable payment_id.',
        metadata:{ provider, payload }
      })
      return json(400,{error:'payment_id is required.'})
    }

    const nextStatus=String(payload.status||'paid')
    const amount=Number(payload.amount||payload.data?.object?.amount_total||0)/100 || 0
    const { data:payment,error:paymentError }=await supabase.from('payments').select('*').eq('id',paymentId).single()
    if(paymentError || !payment){
      await recordHealthEvent({
        event_type:'payment_callback',
        severity:'critical',
        summary:'Payment webhook could not match payment record',
        detail:String(paymentError?.message||'Payment not found.'),
        metadata:{ provider, payment_id:paymentId, payload }
      })
      return json(404,{error:'Payment not found.'})
    }

    const transactionInsert=await supabase.from('payment_transactions').insert({
      payment_id:payment.id,
      provider,
      transaction_reference:String(payload.transaction_reference||payload.id||''),
      transaction_type:'webhook',
      status:nextStatus,
      amount,
      currency_code:String(payment.currency_code||'NAD'),
      raw_payload:payload,
      reconciled_at:new Date().toISOString()
    })
    if(transactionInsert.error)throw transactionInsert.error

    const paymentUpdate=await supabase.from('payments').update({
      status:nextStatus,
      amount_received:amount || payment.amount_received,
      paid_at:nextStatus==='paid' ? new Date().toISOString() : null
    }).eq('id',payment.id)
    if(paymentUpdate.error)throw paymentUpdate.error

    if(nextStatus==='paid'){
      const bookingUpdate=await supabase.from('bookings').update({
        payment_status:'paid',
        status:'confirmed'
      }).eq('id',payment.booking_id)
      if(bookingUpdate.error)throw bookingUpdate.error
      const historyInsert=await supabase.from('booking_status_history').insert({
        booking_id:payment.booking_id,
        from_status:'awaiting_payment',
        to_status:'confirmed',
        reason:'Payment received via webhook',
        actor_label:`webhook:${provider}`
      })
      if(historyInsert.error)throw historyInsert.error
    }

    return json(200,{ok:true})
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
