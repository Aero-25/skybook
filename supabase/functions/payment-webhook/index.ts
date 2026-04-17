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

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
  const provider=(new URL(request.url)).searchParams.get('provider') || 'custom'
  const payload=await request.json()
  const paymentId=String(payload.payment_id||payload.data?.object?.metadata?.payment_id||'')
  if(!paymentId)return json(400,{error:'payment_id is required.'})

  const nextStatus=String(payload.status||'paid')
  const amount=Number(payload.amount||payload.data?.object?.amount_total||0)/100 || 0
  const { data:payment,error:paymentError }=await supabase.from('payments').select('*').eq('id',paymentId).single()
  if(paymentError)return json(404,{error:'Payment not found.'})

  await supabase.from('payment_transactions').insert({
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

  await supabase.from('payments').update({
    status:nextStatus,
    amount_received:amount || payment.amount_received,
    paid_at:nextStatus==='paid' ? new Date().toISOString() : null
  }).eq('id',payment.id)

  if(nextStatus==='paid'){
    await supabase.from('bookings').update({
      payment_status:'paid',
      status:'confirmed'
    }).eq('id',payment.booking_id)
    await supabase.from('booking_status_history').insert({
      booking_id:payment.booking_id,
      from_status:'awaiting_payment',
      to_status:'confirmed',
      reason:'Payment received via webhook',
      actor_label:`webhook:${provider}`
    })
  }

  return json(200,{ok:true})
})
