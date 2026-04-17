import { corsHeaders } from '../_shared/cors.ts'

const json=(status:number,payload:Record<string,unknown>)=>new Response(JSON.stringify(payload),{
  status,
  headers:{...corsHeaders,'content-type':'application/json'}
})

type PaymentProviderPayload={
  provider:string
  booking_id:string
  amount:number
  currency_code:string
  success_url?:string
  cancel_url?:string
}

interface PaymentProvider{
  initiatePayment(payload:PaymentProviderPayload):Promise<Record<string,unknown>>
}

class ManualEftProvider implements PaymentProvider{
  async initiatePayment(payload:PaymentProviderPayload){
    return {
      provider:payload.provider,
      status:'pending',
      instructions:'Bank transfer pending. Replace this with your business EFT details in production.',
      redirect_url:null
    }
  }
}

class StripeProvider implements PaymentProvider{
  async initiatePayment(payload:PaymentProviderPayload){
    return {
      provider:payload.provider,
      status:'pending',
      redirect_url:'https://example.com/stripe-checkout-placeholder',
      note:`Attach Stripe credentials and checkout session logic for booking ${payload.booking_id}.`
    }
  }
}

class PaypalProvider implements PaymentProvider{
  async initiatePayment(payload:PaymentProviderPayload){
    return {
      provider:payload.provider,
      status:'pending',
      redirect_url:'https://example.com/paypal-checkout-placeholder',
      note:`Attach PayPal client credentials and order creation for booking ${payload.booking_id}.`
    }
  }
}

const providers:Record<string,PaymentProvider>={
  manual_eft:new ManualEftProvider(),
  stripe:new StripeProvider(),
  paypal:new PaypalProvider()
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  if(request.method!=='POST')return json(405,{error:'Method not allowed.'})
  const payload=await request.json()
  const provider=providers[String(payload.provider||'manual_eft')]
  if(!provider)return json(400,{error:'Unsupported payment provider.'})
  return json(200,{payment:await provider.initiatePayment(payload)})
})
