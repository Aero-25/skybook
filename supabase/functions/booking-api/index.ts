import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl=Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAnonKey=Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const supabaseServiceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const adminClient=createClient(supabaseUrl,supabaseServiceRoleKey,{auth:{persistSession:false}})

type Json=Record<string,unknown>

const SKYBOOK_PERMISSION_CATALOG=[
  { key:'dashboard', label:'Dashboard', description:'Access the command center and operational snapshots.' },
  { key:'calendar', label:'Calendar', description:'Use the day, week, and month operations calendar.' },
  { key:'reports', label:'Reports', description:'View commercial, finance, and performance reporting.' },
  { key:'bookings', label:'Bookings', description:'Create, edit, confirm, cancel, and resend bookings.' },
  { key:'customers', label:'Customers', description:'View customer history and guest records.' },
  { key:'payments', label:'Payments', description:'Track guest payments and payment reconciliation.' },
  { key:'services', label:'Services', description:'Manage services, packages, and catalog setup.' },
  { key:'engine', label:'Booking Engine', description:'Manage schedules, blackout dates, vouchers, resources, and operators.' },
  { key:'finance', label:'Finance', description:'Manage office invoices, refunds, commissions, and settlements.' },
  { key:'settings', label:'Settings', description:'Change booking configuration and platform settings.' },
  { key:'emails', label:'Email Templates', description:'Manage operational email templates and communication tooling.' },
  { key:'admin_users', label:'Admin Users', description:'Grant staff access, roles, and section permissions.' }
] as const

const SKYBOOK_PERMISSION_KEYS=SKYBOOK_PERMISSION_CATALOG.map(item=>item.key)

const SKYBOOK_ROLE_DEFAULTS:Record<string,Record<string,boolean>>={
  super_admin:Object.fromEntries(SKYBOOK_PERMISSION_KEYS.map(key=>[key,true])),
  manager:{
    dashboard:true,
    calendar:true,
    reports:true,
    bookings:true,
    customers:true,
    payments:true,
    services:true,
    engine:true,
    finance:true,
    settings:true,
    emails:true,
    admin_users:false
  },
  booking_agent:{
    dashboard:true,
    calendar:true,
    reports:false,
    bookings:true,
    customers:true,
    payments:false,
    services:false,
    engine:false,
    finance:false,
    settings:false,
    emails:false,
    admin_users:false
  },
  finance:{
    dashboard:true,
    calendar:false,
    reports:true,
    bookings:true,
    customers:true,
    payments:true,
    services:false,
    engine:false,
    finance:true,
    settings:false,
    emails:false,
    admin_users:false
  }
}

const json=(status:number,payload:Json)=>new Response(JSON.stringify(payload),{
  status,
  headers:{...corsHeaders,'content-type':'application/json'}
})

const readBody=async(request:Request)=>{
  try{return await request.json()}catch{return {}}
}

const normalizeText=(value:unknown)=>String(value ?? '').trim()
const nowIso=()=>new Date().toISOString()
const sanitizePermissionMap=(input:unknown)=>{
  const source=typeof input==='object' && input ? input as Record<string,unknown> : {}
  return Object.fromEntries(SKYBOOK_PERMISSION_KEYS.map(key=>[key,Boolean(source[key])]))
}
const resolveProfilePermissions=(profile:Json={})=>{
  const role=normalizeText(profile.role).toLowerCase() || 'booking_agent'
  const defaults=SKYBOOK_ROLE_DEFAULTS[role] || SKYBOOK_ROLE_DEFAULTS.booking_agent
  const overrides=sanitizePermissionMap(profile.permissions)
  return {...defaults,...overrides}
}
const hasSkybookPermission=(profile:Json,key:string)=>Boolean(resolveProfilePermissions(profile)[key])
const requireSkybookPermission=(profile:Json,key:string)=>{
  if(!hasSkybookPermission(profile,key))throw new Error(`You do not have access to ${key.replace(/_/g,' ')}.`)
}
const requireSuperAdmin=(profile:Json)=>{
  if(normalizeText(profile.role)!=='super_admin'){
    throw new Error('Super admin access is required for admin user management.')
  }
}
const routeParts=(request:Request)=>{
  const parts=new URL(request.url).pathname.split('/').filter(Boolean)
  while(parts.length&&['functions','v1','booking-api'].includes(parts[0]))parts.shift()
  return parts
}
const authClient=(request:Request)=>createClient(supabaseUrl,supabaseAnonKey,{
  global:{headers:{Authorization:request.headers.get('authorization') || `Bearer ${supabaseAnonKey}`}},
  auth:{persistSession:false}
})

const getRequestBrandCode=(request:Request, payload:Json={})=>{
  const headerBrand=normalizeText(request.headers.get('x-brand-code'))
  const queryBrand=normalizeText(new URL(request.url).searchParams.get('brand'))
  const bodyBrand=normalizeText(payload.brand_code)
  return bodyBrand || headerBrand || queryBrand || 'true-travel'
}

const listBrands=async()=>{
  const brands=await safeTableSelect<Json>(adminClient.from('brands').select('*').order('sort_order',{ascending:true}),[])
  return brands.length ? brands : [
    { code:'true-travel', name:'True Travel', booking_prefix:'TT' },
    { code:'iventure', name:'Iventure', booking_prefix:'IV' }
  ]
}

const getBrandByCode=async(code:string)=>{
  const brand=await safeMaybeSingle<Json>(adminClient.from('brands').select('*').eq('code',code).maybeSingle())
  return brand || { code, name:code==='iventure' ? 'Iventure' : 'True Travel', booking_prefix:code==='iventure' ? 'IV' : 'TT' }
}

const formatReference=(prefix='TT')=>`${prefix}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,4).toUpperCase()}`

const defaultEmailTemplates={
  booking_received:{
    subject:'We received your booking request {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nWe received your booking request for {{service_name}}.\nReference: {{booking_reference}}\nPreferred date: {{booking_date}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nWe will confirm the next steps shortly.\n\nTrue Travel'
  },
  booking_confirmed:{
    subject:'Your booking {{booking_reference}} is confirmed',
    body:'Hi {{customer_name}},\n\nYour booking for {{service_name}} is confirmed.\nReference: {{booking_reference}}\nDate: {{booking_date}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nWe look forward to welcoming you.\n\nTrue Travel'
  },
  payment_received:{
    subject:'Payment received for {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nWe received your payment for {{service_name}}.\nReference: {{booking_reference}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nThank you.\n\nTrue Travel'
  },
  status_changed:{
    subject:'Booking update for {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nYour booking status changed.\nReference: {{booking_reference}}\nService: {{service_name}}\nDate: {{booking_date}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nTrue Travel'
  }
}

const renderTemplate=(template:string,variables:Record<string,unknown>)=>template.replace(/\{\{(.*?)\}\}/g,(_,token)=>{
  const key=String(token).trim()
  return key in variables ? String(variables[key]) : ''
})

const getAuthenticatedAdmin=async(request:Request)=>{
  const client=authClient(request)
  const { data:{ user }, error:userError }=await client.auth.getUser()
  if(userError||!user)throw new Error('Authenticated admin user is required.')
  const { data:profile,error:profileError }=await adminClient
    .from('app_users')
    .select('id,full_name,role,is_active,permissions')
    .eq('id',user.id)
    .maybeSingle()
  if(profileError||!profile?.is_active)throw new Error('Admin access is not configured for this user.')
  return { user, profile:{...profile,effective_permissions:resolveProfilePermissions(profile as unknown as Json)} }
}

const getSettingValue=async<T>(settingKey:string,fallback:T)=>{
  const { data }=await adminClient
    .from('settings')
    .select('setting_value')
    .eq('setting_group','booking')
    .eq('setting_key',settingKey)
    .maybeSingle()
  return (data?.setting_value as T) ?? fallback
}

const upsertBookingSetting=async(settingKey:string,value:unknown,isPublic=false)=>{
  const { error }=await adminClient.from('settings').upsert({
    setting_group:'booking',
    setting_key:settingKey,
    setting_value:value,
    is_public:isPublic
  },{onConflict:'setting_group,setting_key'})
  if(error)throw error
}

const safeTableSelect=async<T>(query:Promise<any>,fallback:T[]=[] as T[])=>{
  const { data,error }=await query
  if(error){
    const code=String(error.code || '')
    if(['42P01','42703','PGRST205'].includes(code))return fallback
    throw new Error(String(error.message || 'Database query failed.'))
  }
  return data || fallback
}

const safeMaybeSingle=async<T>(query:Promise<any>,fallback:T | null=null)=>{
  const { data,error }=await query
  if(error){
    const code=String(error.code || '')
    if(['42P01','42703','PGRST116','PGRST205'].includes(code))return fallback
    throw new Error(String(error.message || 'Database query failed.'))
  }
  return data ?? fallback
}

const listAllAuthUsers=async()=>{
  const users:any[]=[]
  let page=1
  while(true){
    const { data,error }=await adminClient.auth.admin.listUsers({ page, perPage:200 })
    if(error)throw new Error(String(error.message || 'Failed to list auth users.'))
    const batch=data?.users || []
    users.push(...batch)
    if(batch.length<200)break
    page+=1
  }
  return users
}

const listSkybookAdminUsers=async()=>{
  const [authUsers,appUsers]=await Promise.all([
    listAllAuthUsers(),
    safeTableSelect<Json>(adminClient.from('app_users').select('id,full_name,role,is_active,permissions').order('created_at',{ascending:true}),[])
  ])
  const appById=new Map(appUsers.map(user=>[String(user.id),user]))
  return authUsers.map(user=>{
    const appUser=appById.get(String(user.id)) || {}
    const role=normalizeText(appUser.role) || 'booking_agent'
    return {
      id:user.id,
      email:user.email || '',
      full_name:normalizeText(appUser.full_name) || normalizeText(user.user_metadata?.full_name) || normalizeText(user.email),
      role,
      is_active:appUser.is_active===undefined ? false : Boolean(appUser.is_active),
      permissions:sanitizePermissionMap(appUser.permissions),
      effective_permissions:{...resolveProfilePermissions({ role }),...sanitizePermissionMap(appUser.permissions)},
      last_sign_in_at:user.last_sign_in_at || null,
      created_at:user.created_at || null,
      has_access:appUser.is_active===true
    }
  }).sort((left,right)=>{
    if(left.has_access!==right.has_access)return left.has_access ? -1 : 1
    return String(left.email).localeCompare(String(right.email))
  })
}

const upsertSkybookAdminUser=async(payload:Json)=>{
  const requestedRole=normalizeText(payload.role).toLowerCase() || 'booking_agent'
  if(!(requestedRole in SKYBOOK_ROLE_DEFAULTS))throw new Error('Invalid admin role.')
  const requestedId=normalizeText(payload.id)
  const requestedEmail=normalizeText(payload.email).toLowerCase()
  const authUsers=await listAllAuthUsers()
  const authUser=authUsers.find(user=>requestedId ? user.id===requestedId : normalizeText(user.email).toLowerCase()===requestedEmail)
  if(!authUser)throw new Error('Auth user not found. Create or invite the user in Supabase Auth first.')
  const fullName=normalizeText(payload.full_name) || normalizeText(authUser.user_metadata?.full_name) || normalizeText(authUser.email)
  const row={
    id:authUser.id,
    full_name:fullName,
    role:requestedRole,
    is_active:payload.is_active!==false,
    permissions:sanitizePermissionMap(payload.permissions)
  }
  const { error }=await adminClient.from('app_users').upsert(row,{onConflict:'id'})
  if(error)throw new Error(String(error.message || 'Unable to save admin user.'))
  return { success:true, admin_user:row }
}

const normalizeDiscountAmount=(total:number,discountType:string,discountValue:number)=>{
  if(discountType==='fixed')return Number(Math.min(total,discountValue).toFixed(2))
  return Number(Math.min(total,total*(discountValue/100)).toFixed(2))
}

const fetchServices=async({slug='',includeInactive=false,brandCode=''}:{slug?:string,includeInactive?:boolean,brandCode?:string}={})=>{
  let query=adminClient
    .from('services')
    .select('id,slug,name,short_description,full_description,duration_label,unit_label,preferred_date_mode,base_price,currency_code,is_active,requires_manual_confirmation,payment_mode,deposit_type,deposit_value,metadata,media')
    .order('name',{ascending:true})
  if(!includeInactive)query=query.eq('is_active',true)
  if(slug)query=query.eq('slug',slug)
  const { data,error }=await query
  if(error)throw error
  return (data||[])
    .filter(service=>{
      if(!brandCode)return true
      const configured=Array.isArray(service.metadata?.brand_codes) ? service.metadata.brand_codes : []
      return !configured.length || configured.includes(brandCode)
    })
    .map(service=>({
    id:service.id,
    slug:service.slug,
    category_slug:String(service.metadata?.category_slug||'coastal-tours'),
    name:service.name,
    short_description:service.short_description||'',
    full_description:service.full_description||service.short_description||'',
    duration_label:service.duration_label||'Flexible',
    unit_label:service.unit_label||'guest',
    preferred_date_mode:service.preferred_date_mode,
    base_price:Number(service.base_price||0),
    currency:service.currency_code||'NAD',
    is_active:service.is_active,
    requires_manual_confirmation:service.requires_manual_confirmation,
    payment_mode:service.payment_mode,
    deposit_type:service.deposit_type,
    deposit_value:Number(service.deposit_value||0),
    media_url:Array.isArray(service.media)&&service.media.length ? String(service.media[0]?.url||'') : '',
    highlight_points:Array.isArray(service.metadata?.highlight_points) ? service.metadata.highlight_points : [],
    brand_codes:Array.isArray(service.metadata?.brand_codes) ? service.metadata.brand_codes : [],
    addons:[]
  }))
}

const getServiceBySlug=async(slug:string,includeInactive=false,brandCode='')=>{
  const services=await fetchServices({slug,includeInactive,brandCode})
  if(!services.length)throw new Error('Service not found.')
  return services[0]
}

const calculatePricing=(service:Json,payload:Json,settings:Json,discountAmount=0)=>{
  const quantity=Math.max(1,Number(payload.quantity||1)||1)
  const basePrice=Number(service.base_price||0)
  const subtotal=Number((basePrice*quantity).toFixed(2))
  const taxRate=Number(payload.taxRate ?? settings.taxRate ?? 0)
  const serviceFee=Number(payload.serviceFee ?? settings.serviceFee ?? 0)
  const taxAmount=Number((subtotal*(taxRate/100)).toFixed(2))
  const totalBeforeDiscount=Number((subtotal+taxAmount+serviceFee).toFixed(2))
  const totalAmount=Number(Math.max(0,totalBeforeDiscount-discountAmount).toFixed(2))
  const paymentMode=String(payload.payment_mode||service.payment_mode||settings.paymentMode||'deposit')
  const depositType=String(service.deposit_type||settings.defaultDepositType||'percentage')
  const depositValue=Number(service.deposit_value ?? settings.defaultDepositValue ?? 30)
  const amountDueNow=paymentMode==='full'
    ? totalAmount
    : depositType==='fixed'
      ? Math.min(totalAmount,depositValue)
      : Number((totalAmount*(depositValue/100)).toFixed(2))
  return {
    quantity,
    subtotalAmount:subtotal,
    taxAmount,
    serviceFeeAmount:Number(serviceFee.toFixed(2)),
    discountAmount:Number(discountAmount.toFixed(2)),
    totalBeforeDiscount,
    totalAmount,
    amountDueNow:Number(amountDueNow.toFixed(2)),
    amountDueLater:Number(Math.max(0,totalAmount-amountDueNow).toFixed(2))
  }
}

const validatePublicBookingPayload=(service:Json,payload:Json)=>{
  const customer=(payload.customer||{}) as Json
  const errors:string[]=[]
  if(!normalizeText(payload.service_slug))errors.push('Service is required.')
  if(!normalizeText(customer.full_name))errors.push('Customer full name is required.')
  if(!normalizeText(customer.email)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(customer.email)))errors.push('Valid customer email is required.')
  if(!normalizeText(customer.phone))errors.push('Phone or WhatsApp is required.')
  if(Number(payload.quantity||0)<1)errors.push('Quantity must be at least 1.')
  if(String(service.preferred_date_mode)==='required'&&!normalizeText(payload.preferred_date))errors.push('Preferred date is required for this service.')
  if(payload.accept_terms!==true && payload.admin_created!==true)errors.push('Terms acceptance is required.')
  if(errors.length)throw new Error(errors[0])
}

const upsertCustomer=async(customer:Json)=>{
  const email=normalizeText(customer.email).toLowerCase()
  const { data:existing }=await adminClient.from('customers').select('*').ilike('email',email).maybeSingle()
  if(existing){
    const { data,error }=await adminClient.from('customers').update({
      full_name:normalizeText(customer.full_name)||existing.full_name,
      phone:normalizeText(customer.phone)||existing.phone,
      whatsapp:normalizeText(customer.whatsapp)||normalizeText(customer.phone)||existing.whatsapp,
      metadata:{...(existing.metadata||{}),last_booking_at:nowIso()}
    }).eq('id',existing.id).select().single()
    if(error)throw error
    return data
  }
  const { data,error }=await adminClient.from('customers').insert({
    full_name:normalizeText(customer.full_name),
    email,
    phone:normalizeText(customer.phone),
    whatsapp:normalizeText(customer.whatsapp)||normalizeText(customer.phone)
  }).select().single()
  if(error)throw error
  return data
}

const queueEmailLog=async({bookingId,customerId,recipientEmail,templateKey,subject,body,status='queued'}:{
  bookingId:string
  customerId:string
  recipientEmail:string
  templateKey:string
  subject:string
  body:string
  status?:string
})=>{
  const { error }=await adminClient.from('email_logs').insert({
    booking_id:bookingId,
    customer_id:customerId,
    template_key:templateKey,
    recipient_email:recipientEmail,
    subject,
    rendered_body:body,
    status
  })
  if(error)throw error
}

const insertStatusHistory=async(bookingId:string,fromStatus:string|null,toStatus:string,reason:string,actorLabel:string,actorUserId:string|null=null)=>{
  const { error }=await adminClient.from('booking_status_history').insert({
    booking_id:bookingId,
    from_status:fromStatus,
    to_status:toStatus,
    reason,
    actor_label:actorLabel,
    actor_user_id:actorUserId
  })
  if(error)throw error
}

const createOrUpdatePayment=async(bookingId:string,paymentStatus:string,amount:number,currencyCode:string)=>{
  const { data:existing }=await adminClient.from('payments').select('*').eq('booking_id',bookingId).maybeSingle()
  if(existing){
    const { error }=await adminClient.from('payments').update({
      status:paymentStatus,
      amount,
      amount_received:paymentStatus==='paid' ? amount : Number(existing.amount_received||0),
      paid_at:paymentStatus==='paid' ? nowIso() : null
    }).eq('id',existing.id)
    if(error)throw error
    return
  }
  const { error }=await adminClient.from('payments').insert({
    booking_id:bookingId,
    provider:'manual_eft',
    status:paymentStatus,
    currency_code:currencyCode,
    amount,
    amount_received:paymentStatus==='paid' ? amount : 0,
    paid_at:paymentStatus==='paid' ? nowIso() : null,
    metadata:{source:'booking-api'}
  })
  if(error)throw error
}

const applyPromotions=async(service:Json,payload:Json,pricingBase:{ totalAmount:number })=>{
  const couponCode=normalizeText(payload.coupon_code).toUpperCase()
  const voucherCode=normalizeText(payload.voucher_code).toUpperCase()
  const agentCode=normalizeText(payload.agent_code).toUpperCase()
  const discounts:{ source_type:string, source_id:string | null, code:string, description:string, amount:number }[]=[]
  let voucherRow:Json | null=null
  let agentRow:Json | null=null

  if(couponCode){
    const coupon=await safeMaybeSingle<Json>(
      adminClient
        .from('coupons')
        .select('*')
        .eq('code',couponCode)
        .eq('is_active',true)
        .maybeSingle()
    )
    if(coupon){
      const amount=normalizeDiscountAmount(pricingBase.totalAmount,String(coupon.discount_type || 'percentage'),Number(coupon.discount_value || 0))
      if(amount>0)discounts.push({source_type:'coupon',source_id:String(coupon.id),code:couponCode,description:String(coupon.description || `Coupon ${couponCode}`),amount})
    }
  }

  if(voucherCode){
    voucherRow=await safeMaybeSingle<Json>(
      adminClient
        .from('vouchers')
        .select('*')
        .eq('code',voucherCode)
        .eq('is_active',true)
        .maybeSingle()
    )
    if(voucherRow){
      const amount=Number(Math.min(pricingBase.totalAmount,Number(voucherRow.remaining_value || 0)).toFixed(2))
      if(amount>0)discounts.push({source_type:'voucher',source_id:String(voucherRow.id),code:voucherCode,description:String(voucherRow.description || `Voucher ${voucherCode}`),amount})
    }
  }

  if(agentCode){
    agentRow=await safeMaybeSingle<Json>(
      adminClient
        .from('agents')
        .select('*')
        .eq('code',agentCode)
        .eq('is_active',true)
        .maybeSingle()
    )
    if(agentRow){
      const commissionAmount=normalizeDiscountAmount(pricingBase.totalAmount,String(agentRow.commission_type || 'percentage'),Number(agentRow.commission_value || 0))
      if(commissionAmount>0)discounts.push({source_type:'agent',source_id:String(agentRow.id),code:agentCode,description:`Agent ${String(agentRow.company_name || agentCode)}`,amount:commissionAmount})
    }
  }

  return {
    discounts,
    totalDiscountAmount:Number(discounts.reduce((sum,item)=>sum+item.amount,0).toFixed(2)),
    voucherRow,
    agentRow
  }
}

const maybeCreateBookingDiscounts=async(bookingId:string,discounts:{ source_type:string, source_id:string | null, code:string, description:string, amount:number }[])=>{
  if(!discounts.length)return
  const { error }=await adminClient.from('booking_discounts').insert(discounts.map(discount=>({
    booking_id:bookingId,
    source_type:discount.source_type,
    source_id:discount.source_id,
    code:discount.code,
    description:discount.description,
    amount:discount.amount
  })))
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
}

const maybeApplyVoucherRedemption=async(bookingId:string,voucherRow:Json | null,amount:number)=>{
  if(!voucherRow||amount<=0)return
  const voucherId=String(voucherRow.id || '')
  if(!voucherId)return
  const insertResult=await adminClient.from('voucher_redemptions').insert({
    voucher_id:voucherId,
    booking_id:bookingId,
    amount
  })
  if(insertResult.error && !['42P01','PGRST205','23505'].includes(String(insertResult.error.code || '')))throw insertResult.error
  const nextRemaining=Math.max(0,Number(voucherRow.remaining_value || 0)-amount)
  const updateResult=await adminClient.from('vouchers').update({remaining_value:nextRemaining}).eq('id',voucherId)
  if(updateResult.error && !['42P01','PGRST205'].includes(String(updateResult.error.code || '')))throw updateResult.error
}

const maybeLinkBookingAgent=async(bookingId:string,agentRow:Json | null,commissionAmount:number)=>{
  if(!agentRow)return
  const { error }=await adminClient.from('booking_agents').upsert({
    booking_id:bookingId,
    agent_id:agentRow.id,
    commission_amount:commissionAmount
  },{ onConflict:'booking_id' })
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
}

const maybeLinkBookingOperator=async(bookingId:string,operatorRow:Json | null,commissionAmount:number)=>{
  if(!operatorRow)return
  const { error }=await adminClient.from('booking_operators').upsert({
    booking_id:bookingId,
    operator_id:operatorRow.id,
    commission_amount:commissionAmount
  },{ onConflict:'booking_id' })
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
}

const syncInvoiceForBooking=async(bookingId:string)=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,status,payment_status,preferred_date,subtotal_amount,tax_amount,total_amount,currency_code,amount_due_later,service_id,quantity')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)return
  const service=await safeMaybeSingle<Json>(adminClient.from('services').select('name').eq('id',booking.service_id).maybeSingle())
  const existingInvoice=await safeMaybeSingle<{ invoice_number:string }>(adminClient.from('invoices').select('invoice_number').eq('booking_id',bookingId).maybeSingle())
  const invoiceNumber=normalizeText(existingInvoice?.invoice_number) || `INV-${normalizeText(booking.reference).replace(/[^A-Z0-9-]/gi,'').toUpperCase()}`
  const invoiceStatus=String(booking.payment_status)==='paid'
    ? 'paid'
    : String(booking.payment_status)==='partially_paid'
      ? 'partially_paid'
      : String(booking.status)==='cancelled'
        ? 'cancelled'
        : 'issued'
  const invoicePayload={
    booking_id:bookingId,
    invoice_number:invoiceNumber,
    status:invoiceStatus,
    issued_at:nowIso(),
    due_at:booking.preferred_date || null,
    currency_code:String(booking.currency_code || 'NAD'),
    subtotal_amount:Number(booking.subtotal_amount || 0),
    tax_amount:Number(booking.tax_amount || 0),
    total_amount:Number(booking.total_amount || 0),
    balance_amount:String(booking.payment_status)==='paid' ? 0 : Number(booking.amount_due_later || booking.total_amount || 0),
    metadata:{ source:'booking-api' }
  }
  const { data:invoice,error:invoiceError }=await adminClient.from('invoices').upsert(invoicePayload,{ onConflict:'booking_id' }).select().single()
  if(invoiceError && !['42P01','PGRST205'].includes(String(invoiceError.code || '')))throw invoiceError
  if(!invoice?.id)return
  await adminClient.from('invoice_items').delete().eq('invoice_id',invoice.id)
  const insertResult=await adminClient.from('invoice_items').insert({
    invoice_id:invoice.id,
    description:String(service?.name || 'Booking service'),
    quantity:Number(booking.quantity || 1),
    unit_price:Number(booking.subtotal_amount || 0) / Math.max(1,Number(booking.quantity || 1)),
    line_total:Number(booking.subtotal_amount || 0),
    metadata:{ booking_reference:booking.reference }
  })
  if(insertResult.error && !['42P01','PGRST205'].includes(String(insertResult.error.code || '')))throw insertResult.error
}

const maybeAllocateResources=async(bookingId:string,serviceId:string,preferredDate:string,quantity:number)=>{
  if(!preferredDate)return
  const links=await safeTableSelect<Json>(
    adminClient.from('service_resources').select('resource_id,allocation_mode,quantity_required').eq('service_id',serviceId),
    []
  )
  if(!links.length)return
  await adminClient.from('resource_allocations').delete().eq('booking_id',bookingId)
  const rows=links.map(link=>({
    booking_id:bookingId,
    service_id:serviceId,
    resource_id:link.resource_id,
    allocation_date:preferredDate,
    allocated_quantity:String(link.allocation_mode)==='per_person'
      ? Math.max(1,quantity) * Math.max(1,Number(link.quantity_required || 1))
      : Math.max(1,Number(link.quantity_required || 1)),
    status:'reserved',
    metadata:{ source:'booking-api' }
  }))
  const { error }=await adminClient.from('resource_allocations').insert(rows)
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
}

const createRefund=async(bookingId:string,payload:Json,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const payment=await safeMaybeSingle<Json>(adminClient.from('payments').select('*').eq('booking_id',bookingId).maybeSingle())
  const amount=Math.max(0,Number(payload.amount || booking.total_amount || 0))
  const { data:refund,error }=await adminClient.from('refunds').insert({
    booking_id:bookingId,
    payment_id:payment?.id || null,
    amount,
    currency_code:String(booking.currency_code || 'NAD'),
    status:'processed',
    reason:normalizeText(payload.reason) || 'Refund processed in admin',
    processed_at:nowIso(),
    metadata:{ actor_user_id:userId }
  }).select().single()
  if(error)throw error
  await adminClient.from('bookings').update({
    status:'refunded',
    payment_status:'refunded',
    updated_by:userId
  }).eq('id',bookingId)
  if(payment?.id){
    await adminClient.from('payments').update({
      status:'refunded',
      amount_received:Number(Math.max(0,Number(payment.amount_received || 0)-amount).toFixed(2))
    }).eq('id',payment.id)
  }
  await insertStatusHistory(bookingId,String(booking.status), 'refunded','Refund processed',`admin:${userId}`,userId)
  await syncInvoiceForBooking(bookingId)
  return { success:true, refund }
}

const createOfficeInvoice=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  const invoiceType=normalizeText(payload.invoice_type) || 'operator_commission'
  const payeeType=normalizeText(payload.payee_type) || 'operator'
  const booking=bookingId
    ? await safeMaybeSingle<Json>(adminClient.from('bookings').select('id,reference,total_amount,currency_code,service_id').eq('id',bookingId).maybeSingle())
    : null
  const operator=normalizeText(payload.operator_id)
    ? await safeMaybeSingle<Json>(adminClient.from('operators').select('*').eq('id',normalizeText(payload.operator_id)).maybeSingle())
    : null
  const agent=normalizeText(payload.agent_id)
    ? await safeMaybeSingle<Json>(adminClient.from('agents').select('*').eq('id',normalizeText(payload.agent_id)).maybeSingle())
    : null
  const commissionBase=Number(payload.commission_base_amount || booking?.total_amount || 0)
  let commissionAmount=Number(payload.commission_amount || 0)
  if(!commissionAmount && operator){
    commissionAmount=normalizeDiscountAmount(commissionBase,String(operator.commission_type || 'percentage'),Number(operator.commission_value || 0))
  }
  if(!commissionAmount && agent){
    commissionAmount=normalizeDiscountAmount(commissionBase,String(agent.commission_type || 'percentage'),Number(agent.commission_value || 0))
  }
  const subtotalAmount=Number(payload.subtotal_amount || commissionBase || 0)
  const taxAmount=Number(payload.tax_amount || 0)
  const totalAmount=Number((subtotalAmount + commissionAmount + taxAmount).toFixed(2))
  const invoiceNumber=normalizeText(payload.invoice_number) || `OFF-${Date.now()}`
  const { data:invoice,error }=await adminClient.from('office_invoices').insert({
    booking_id:bookingId || null,
    invoice_number:invoiceNumber,
    invoice_type:invoiceType,
    payee_type:payeeType,
    agent_id:agent?.id || null,
    operator_id:operator?.id || null,
    status:normalizeText(payload.status) || 'issued',
    currency_code:String(payload.currency_code || booking?.currency_code || 'NAD'),
    subtotal_amount:subtotalAmount,
    commission_amount:commissionAmount,
    tax_amount:taxAmount,
    total_amount:totalAmount,
    issued_at:nowIso(),
    due_at:payload.due_at || null,
    notes:normalizeText(payload.notes),
    metadata:{ actor_user_id:userId, source:'booking-api' }
  }).select().single()
  if(error)throw error
  const itemDescription=normalizeText(payload.line_description) || `${payeeType==='agent' ? 'Agent' : 'Operator'} commission settlement`
  const itemInsert=await adminClient.from('office_invoice_items').insert({
    office_invoice_id:invoice.id,
    description:itemDescription,
    quantity:1,
    unit_price:totalAmount,
    line_total:totalAmount,
    metadata:{ booking_reference:booking?.reference || '' }
  })
  if(itemInsert.error && !['42P01','PGRST205'].includes(String(itemInsert.error.code || '')))throw itemInsert.error
  if(bookingId && operator)await maybeLinkBookingOperator(bookingId,operator,commissionAmount)
  if(bookingId && agent)await maybeLinkBookingAgent(bookingId,agent,commissionAmount)
  return { success:true, office_invoice:invoice }
}

const buildReports=({
  bookings,
  payments,
  invoices,
  officeInvoices,
  refunds
}:{ bookings:Json[], payments:Json[], invoices:Json[], officeInvoices:Json[], refunds:Json[] })=>{
  const grossRevenue=bookings.reduce((sum,booking)=>sum+Number(booking.total_amount || 0),0)
  const paidRevenue=payments
    .filter(payment=>['paid','partially_paid'].includes(String(payment.status || '')))
    .reduce((sum,payment)=>sum+Number(payment.amount || 0),0)
  const refundExposure=refunds.reduce((sum,refund)=>sum+Number(refund.amount || 0),0)
  const guestOutstanding=invoices
    .filter(invoice=>!['paid','cancelled','refunded'].includes(String(invoice.status || '')))
    .reduce((sum,invoice)=>sum+Number(invoice.balance_amount || 0),0)
  const officePayables=officeInvoices
    .filter(invoice=>!['paid','cancelled'].includes(String(invoice.status || '')))
    .reduce((sum,invoice)=>sum+Number(invoice.total_amount || 0),0)
  const statusBreakdown=['pending','awaiting_payment','confirmed','completed','cancelled','refunded','failed'].map(status=>({
    status,
    count:bookings.filter(booking=>String(booking.status || '')===status).length
  }))
  return {
    overview:{
      total_bookings:bookings.length,
      gross_revenue:Number(grossRevenue.toFixed(2)),
      paid_revenue:Number(paidRevenue.toFixed(2)),
      guest_outstanding:Number(guestOutstanding.toFixed(2)),
      office_payables:Number(officePayables.toFixed(2)),
      refund_exposure:Number(refundExposure.toFixed(2))
    },
    status_breakdown:statusBreakdown,
    recent_guest_invoices:invoices.slice(0,8),
    recent_office_invoices:officeInvoices.slice(0,8),
    recent_refunds:refunds.slice(0,8)
  }
}

const createBooking=async(payload:Json,{isAdmin=false,userId='',brandCode='true-travel'}={})=>{
  const settings=await getSettingValue('config',{
    currency:'NAD',
    paymentMode:'deposit',
    defaultDepositValue:30,
    taxRate:0,
    serviceFee:0
  })
  const brand=await getBrandByCode(brandCode)
  const service=await getServiceBySlug(normalizeText(payload.service_slug),true,brandCode)
  validatePublicBookingPayload(service,{...payload,admin_created:isAdmin})
  const basePricing=calculatePricing(service,payload,settings as Json)
  const promotionState=await applyPromotions(service as unknown as Json,payload,basePricing)
  const pricing=calculatePricing(service,payload,settings as Json,promotionState.totalDiscountAmount)
  const customer=await upsertCustomer(payload.customer as Json||{})
  const reference=normalizeText(payload.reference)||formatReference(String(brand.booking_prefix || 'TT'))
  const desiredStatus=normalizeText(payload.status)
  const desiredPaymentStatus=normalizeText(payload.payment_status)
  const bookingStatus=desiredStatus || (service.requires_manual_confirmation && !isAdmin ? 'pending' : (pricing.amountDueNow>0 ? 'awaiting_payment' : 'confirmed'))
  const paymentStatus=desiredPaymentStatus || (pricing.amountDueNow>0 ? 'pending' : 'unpaid')
  const { data:booking,error }=await adminClient.from('bookings').insert({
    reference,
    brand_code:String(brand.code || brandCode),
    customer_id:customer.id,
    service_id:service.id,
    status:bookingStatus,
    payment_status:paymentStatus,
    source:isAdmin ? 'admin' : 'website',
    preferred_date:normalizeText(payload.preferred_date) || null,
    confirmed_date:bookingStatus==='confirmed' ? (normalizeText(payload.preferred_date)||null) : null,
    quantity:pricing.quantity,
    currency_code:service.currency,
    subtotal_amount:pricing.subtotalAmount,
    addons_amount:0-pricing.discountAmount,
    tax_amount:pricing.taxAmount,
    service_fee_amount:pricing.serviceFeeAmount,
    total_amount:pricing.totalAmount,
    amount_due_now:pricing.amountDueNow,
    amount_due_later:pricing.amountDueLater,
    customer_notes:normalizeText(payload.notes),
    lookup_email:customer.email,
    metadata:{source:isAdmin ? 'admin' : 'website_booking_module',brand_code:String(brand.code || brandCode)}
  }).select().single()
  if(error)throw error

  const { error:itemError }=await adminClient.from('booking_items').insert({
    booking_id:booking.id,
    item_type:'service',
    service_id:service.id,
    description:service.name,
    quantity:pricing.quantity,
    unit_price:Number(service.base_price||0),
    line_total:pricing.subtotalAmount,
    metadata:{source:isAdmin ? 'admin' : 'website'}
  })
  if(itemError)throw itemError

  await createOrUpdatePayment(booking.id,paymentStatus,paymentStatus==='paid' ? pricing.totalAmount : pricing.amountDueNow,service.currency)
  await maybeCreateBookingDiscounts(booking.id,promotionState.discounts)
  const voucherDiscount=promotionState.discounts.find(item=>item.source_type==='voucher')?.amount || 0
  const agentDiscount=promotionState.discounts.find(item=>item.source_type==='agent')?.amount || 0
  await maybeApplyVoucherRedemption(booking.id,promotionState.voucherRow,voucherDiscount)
  await maybeLinkBookingAgent(booking.id,promotionState.agentRow,agentDiscount)
  await maybeAllocateResources(booking.id,String(service.id || ''),normalizeText(payload.preferred_date),pricing.quantity)
  await insertStatusHistory(booking.id,null,bookingStatus,isAdmin ? 'Booking created in admin' : 'Booking created via website flow',isAdmin ? 'admin' : 'website',userId||null)
  await syncInvoiceForBooking(booking.id)

  const emailTemplates=await getSettingValue('email_templates',defaultEmailTemplates)
  const template=(((emailTemplates||{}) as Json).booking_received || defaultEmailTemplates.booking_received) as Json
  await queueEmailLog({
    bookingId:booking.id,
    customerId:customer.id,
    recipientEmail:customer.email,
    templateKey:'booking_received',
    subject:renderTemplate(String(template.subject||defaultEmailTemplates.booking_received.subject),{
      booking_reference:reference
    }),
    body:renderTemplate(String(template.body||defaultEmailTemplates.booking_received.body),{
      customer_name:customer.full_name,
      booking_reference:reference,
      service_name:service.name,
      booking_date:normalizeText(payload.preferred_date)||'To be confirmed',
      total_amount:pricing.totalAmount,
      payment_status:paymentStatus
    }),
    status:isAdmin ? 'queued' : 'queued'
  })

  return {
    id:booking.id,
    reference,
    brand_code:String(brand.code || brandCode),
    status:bookingStatus,
    payment_status:paymentStatus,
    total_amount:pricing.totalAmount,
    currency:service.currency
  }
}

const updateBooking=async(id:string,payload:Json,userId:string)=>{
  const { data:existing,error:existingError }=await adminClient.from('bookings').select('*').eq('id',id).single()
  if(existingError||!existing)throw new Error('Booking not found.')
  const currentCustomer=await adminClient.from('customers').select('*').eq('id',existing.customer_id).single()
  const incomingCustomer=(payload.customer as Json)||{}
  const nextCustomerPayload={
    full_name:normalizeText(incomingCustomer.full_name ?? payload.customer_name ?? currentCustomer.data?.full_name),
    email:normalizeText(incomingCustomer.email ?? payload.customer_email ?? currentCustomer.data?.email),
    phone:normalizeText(incomingCustomer.phone ?? payload.customer_phone ?? currentCustomer.data?.phone),
    whatsapp:normalizeText(incomingCustomer.whatsapp ?? payload.customer_phone ?? currentCustomer.data?.whatsapp)
  }
  const customer=await upsertCustomer(nextCustomerPayload)
  let serviceId=existing.service_id
  let serviceSlug=''
  if(normalizeText(payload.service_slug)){
    const service=await getServiceBySlug(normalizeText(payload.service_slug),true)
    serviceId=service.id
    serviceSlug=service.slug
  }
  const updatePayload:Json={
    reference:normalizeText(payload.reference)||existing.reference,
    customer_id:customer.id,
    service_id:serviceId,
    status:normalizeText(payload.status)||existing.status,
    payment_status:normalizeText(payload.payment_status)||existing.payment_status,
    preferred_date:normalizeText(payload.preferred_date)||existing.preferred_date,
    quantity:Number(payload.quantity||existing.quantity||1),
    customer_notes:normalizeText(payload.notes)||existing.customer_notes,
    lookup_email:customer.email,
    updated_by:userId
  }
  const { error:updateError }=await adminClient.from('bookings').update(updatePayload).eq('id',id)
  if(updateError)throw updateError
  if(updatePayload.payment_status!==existing.payment_status){
    await createOrUpdatePayment(id,String(updatePayload.payment_status),String(updatePayload.payment_status)==='paid' ? Number(existing.total_amount||0) : Number(existing.amount_due_now||0),String(existing.currency_code||'NAD'))
  }
  if(updatePayload.status!==existing.status){
    await insertStatusHistory(id,String(existing.status),String(updatePayload.status),normalizeText(payload.reason)||'Booking updated in admin',`admin:${userId}`,userId)
  }
  await maybeAllocateResources(id,String(serviceId),normalizeText(String(updatePayload.preferred_date || '')),Number(updatePayload.quantity || existing.quantity || 1))
  await syncInvoiceForBooking(id)
  return {success:true,id,service_slug:serviceSlug}
}

const upsertService=async(payload:Json)=>{
  const categorySlug=normalizeText(payload.category_slug)||'coastal-tours'
  const { data:category }=await adminClient.from('service_categories').select('id').eq('slug',categorySlug).maybeSingle()
  const servicePayload={
    category_id:category?.id||null,
    slug:normalizeText(payload.slug),
    name:normalizeText(payload.name),
    short_description:normalizeText(payload.short_description),
    full_description:normalizeText(payload.full_description||payload.short_description),
    duration_label:normalizeText(payload.duration_label),
    unit_label:'guest',
    preferred_date_mode:normalizeText(payload.preferred_date_mode)||'optional',
    base_price:Number(payload.base_price||0),
    currency_code:'NAD',
    payment_mode:'deposit',
    deposit_type:'percentage',
    deposit_value:30,
    requires_manual_confirmation:true,
    is_active:Boolean(payload.is_active!==false),
    metadata:{
      category_slug:categorySlug,
      highlight_points:Array.isArray(payload.highlight_points) ? payload.highlight_points : []
    },
    media:[]
  }
  if(normalizeText(payload.id)){
    const { error }=await adminClient.from('services').update(servicePayload).eq('id',normalizeText(payload.id))
    if(error)throw error
    return {success:true,id:normalizeText(payload.id)}
  }
  const { data,error }=await adminClient.from('services').insert(servicePayload).select().single()
  if(error)throw error
  return {success:true,id:data.id}
}

const lookupBooking=async(payload:Json)=>{
  const reference=normalizeText(payload.reference)
  const email=normalizeText(payload.email).toLowerCase()
  const { data:booking,error }=await adminClient
    .from('booking_admin_overview')
    .select('*')
    .eq('reference',reference)
    .maybeSingle()
  if(error||!booking)throw new Error('Booking not found.')
  const { data:raw }=await adminClient.from('bookings').select('lookup_email,payment_status,preferred_date,total_amount,currency_code').eq('reference',reference).maybeSingle()
  if(!raw||String(raw.lookup_email).toLowerCase()!==email)throw new Error('Booking not found.')
  return {
    booking:{
      reference:booking.reference,
      status:booking.status,
      payment_status:raw.payment_status,
      preferred_date:raw.preferred_date,
      total_amount:Number(raw.total_amount||0),
      currency:raw.currency_code,
      service_name:booking.service_name
    }
  }
}

const upsertEngineRow=async(table:string,payload:Json,allowedFields:string[])=>{
  const sanitized=Object.fromEntries(
    allowedFields
      .filter(field=>field in payload)
      .map(field=>[field,payload[field]])
  )
  if(normalizeText(payload.id)){
    const { error }=await adminClient.from(table).update(sanitized).eq('id',normalizeText(payload.id))
    if(error)throw error
    return { success:true, id:normalizeText(payload.id) }
  }
  const { data,error }=await adminClient.from(table).insert(sanitized).select('id').single()
  if(error)throw error
  return { success:true, id:data.id }
}

const fetchAdminBootstrap=async(user:Json,profile:Json)=>{
  const permissions=resolveProfilePermissions(profile)
  const [bookingsResult,customersResult,paymentsResult,services,settings,emailTemplates,automationRules,portalSettings,integrationSettings,reportingSettings,brands]=await Promise.all([
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,payment_status,preferred_date,quantity,total_amount,currency_code,customer_notes,created_at,customers(full_name,email,phone),services(name,slug)')
      .order('created_at',{ascending:false}),
    adminClient.from('customers').select('id,full_name,email,phone,created_at').order('created_at',{ascending:false}),
    adminClient.from('payments').select('id,booking_id,provider,status,amount,currency_code,created_at').order('created_at',{ascending:false}),
    fetchServices({includeInactive:true}),
    getSettingValue('config',{
      currency:'NAD',
      paymentMode:'deposit',
      defaultDepositValue:30,
      taxRate:0,
      serviceFee:0,
      supportEmail:'bookings@truetravelnam.net',
      supportPhone:'+264813224270',
      supportWhatsApp:'+264813224270'
    }),
    getSettingValue('email_templates',defaultEmailTemplates),
    getSettingValue('automation_rules',{
      autoConfirmPaidBookings:true,
      autoCompletePastConfirmedBookings:false,
      autoCancelExpiredAwaitingPayment:false,
      awaitingPaymentExpiryHours:48
    }),
    getSettingValue('portal',{
      enabled:true,
      allowBookingLookup:true,
      allowSelfServiceRequests:false
    }),
    getSettingValue('integrations',{
      whatsapp:{enabled:false},
      googleCalendar:{enabled:false},
      webhooks:{enabled:true}
    }),
    getSettingValue('reporting',{
      defaultWindowDays:30,
      showOutstandingCommissions:true,
      showRefundExposure:true
    }),
    listBrands()
  ])
  if(bookingsResult.error)throw bookingsResult.error
  if(customersResult.error)throw customersResult.error
  if(paymentsResult.error)throw paymentsResult.error

  const bookings=(bookingsResult.data||[]).map(row=>({
    id:row.id,
    reference:row.reference,
    brand_code:row.brand_code || 'true-travel',
    status:row.status,
    payment_status:row.payment_status,
    preferred_date:row.preferred_date,
    quantity:row.quantity,
    total_amount:Number(row.total_amount||0),
    currency:row.currency_code,
    customer_name:row.customers?.full_name||'',
    customer_email:row.customers?.email||'',
    customer_phone:row.customers?.phone||'',
    service_name:row.services?.name||'',
    service_slug:row.services?.slug||'',
    customer_notes:row.customer_notes||'',
    created_at:row.created_at
  }))
  const bookingsByCustomer=new Map<string,{booking_count:number,last_booking_reference:string}>()
  for(const booking of bookings){
    const current=bookingsByCustomer.get(String(booking.customer_email))||{booking_count:0,last_booking_reference:''}
    current.booking_count+=1
    if(!current.last_booking_reference)current.last_booking_reference=String(booking.reference)
    bookingsByCustomer.set(String(booking.customer_email),current)
  }
  const customers=(customersResult.data||[]).map(customer=>({
    ...customer,
    booking_count:bookingsByCustomer.get(String(customer.email))?.booking_count||0,
    last_booking_reference:bookingsByCustomer.get(String(customer.email))?.last_booking_reference||''
  }))
  const payments=(paymentsResult.data||[]).map(payment=>{
    const booking=bookings.find(row=>row.id===payment.booking_id)
    return {
      id:payment.id,
      booking_id:payment.booking_id,
      reference:booking?.reference||'',
      provider:payment.provider,
      status:payment.status,
      amount:Number(payment.amount||0),
      currency:payment.currency_code,
      created_at:payment.created_at
    }
  })
  const [
    schedules,
    dateRules,
    blackoutDates,
    coupons,
    vouchers,
    agents,
    operators,
    bookingOperators,
    resources,
    resourceAllocations,
    invoices,
    officeInvoices,
    refunds,
    paymentTransactions,
    webhookEndpoints,
    supportedLanguages,
    supportedCurrencies,
    customerAccounts,
    calendarConnections,
    emailLogs,
    statusHistory,
    adminNotes
  ]=await Promise.all([
    safeTableSelect<Json>(adminClient.from('service_operating_windows').select('*').order('day_of_week',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('service_date_rules').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('service_blackout_dates').select('*').order('starts_on',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('coupons').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('vouchers').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('agents').select('*').order('company_name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('operators').select('*').order('company_name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('booking_operators').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('resources').select('*').order('name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('resource_allocations').select('*').order('allocation_date',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('invoices').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('office_invoices').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('refunds').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('payment_transactions').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('webhook_endpoints').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('supported_languages').select('*').order('code',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('supported_currencies').select('*').order('code',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('customer_accounts').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('calendar_sync_connections').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('email_logs').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('booking_status_history').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('admin_notes').select('*').order('created_at',{ascending:false}))
  ])
  const adminUsers=permissions.admin_users ? await listSkybookAdminUsers() : []
  const canSeeBookings=permissions.bookings || permissions.dashboard || permissions.calendar || permissions.reports
  const canSeeCustomers=permissions.customers || permissions.bookings
  const canSeePayments=permissions.payments || permissions.dashboard || permissions.reports || permissions.finance
  const canSeeServices=permissions.services || permissions.bookings || permissions.engine
  const canSeeEngine=permissions.engine || permissions.calendar
  const canSeeFinance=permissions.finance || permissions.dashboard || permissions.reports
  const canSeeEmails=permissions.emails || permissions.bookings
  const safeReports=permissions.reports ? buildReports({
    bookings,
    payments,
    invoices,
    officeInvoices,
    refunds
  }) : { overview:{}, status_breakdown:[], recent_guest_invoices:[], recent_office_invoices:[], recent_refunds:[] }
  return {
    user,
    profile:{...profile,effective_permissions:permissions},
    brands,
    bookings:canSeeBookings ? bookings : [],
    customers:canSeeCustomers ? customers : [],
    payments:canSeePayments ? payments : [],
    services:canSeeServices ? services : [],
    settings:permissions.settings ? settings : {},
    email_templates:permissions.emails ? emailTemplates : {},
    automation_rules:automationRules,
    portal_settings:portalSettings,
    integration_settings:integrationSettings,
    reporting_settings:reportingSettings,
    schedules:canSeeEngine ? schedules : [],
    date_rules:canSeeEngine ? dateRules : [],
    blackout_dates:canSeeEngine ? blackoutDates : [],
    coupons:canSeeEngine ? coupons : [],
    vouchers:canSeeEngine ? vouchers : [],
    agents:(canSeeEngine || canSeeFinance) ? agents : [],
    operators:canSeeFinance ? operators : [],
    booking_operators:canSeeFinance ? bookingOperators : [],
    resources:canSeeEngine ? resources : [],
    resource_allocations:canSeeEngine ? resourceAllocations : [],
    invoices:canSeePayments ? invoices : [],
    office_invoices:canSeeFinance ? officeInvoices : [],
    refunds:canSeeFinance ? refunds : [],
    payment_transactions:canSeePayments ? paymentTransactions : [],
    webhook_endpoints:permissions.settings ? webhookEndpoints : [],
    supported_languages:supportedLanguages,
    supported_currencies:supportedCurrencies,
    customer_accounts:customerAccounts,
    calendar_connections:permissions.settings ? calendarConnections : [],
    email_logs:canSeeEmails ? emailLogs : [],
    status_history:canSeeBookings ? statusHistory : [],
    admin_notes:canSeeBookings ? adminNotes : [],
    admin_users:adminUsers,
    permission_catalog:SKYBOOK_PERMISSION_CATALOG,
    role_defaults:SKYBOOK_ROLE_DEFAULTS,
    reports:safeReports
  }
}

const resendBookingEmail=async(bookingId:string,userId:string)=>{
  const { data:booking,error }=await adminClient.from('bookings').select('id,reference,lookup_email,customer_id,preferred_date,total_amount,payment_status,status,service_id').eq('id',bookingId).single()
  if(error||!booking)throw new Error('Booking not found.')
  const { data:service }=await adminClient.from('services').select('name').eq('id',booking.service_id).single()
  const { data:customer }=await adminClient.from('customers').select('full_name').eq('id',booking.customer_id).single()
  const emailTemplates=await getSettingValue('email_templates',defaultEmailTemplates)
  const template=((emailTemplates as Json).status_changed || defaultEmailTemplates.status_changed) as Json
  await queueEmailLog({
    bookingId:booking.id,
    customerId:booking.customer_id,
    recipientEmail:String(booking.lookup_email),
    templateKey:'status_changed',
    subject:renderTemplate(String(template.subject||defaultEmailTemplates.status_changed.subject),{
      booking_reference:booking.reference
    }),
    body:renderTemplate(String(template.body||defaultEmailTemplates.status_changed.body),{
      customer_name:customer?.full_name||'Guest',
      booking_reference:booking.reference,
      service_name:service?.name||'Service',
      booking_date:booking.preferred_date||'To be confirmed',
      total_amount:booking.total_amount,
      payment_status:booking.payment_status
    }),
    status:'queued'
  })
  await insertStatusHistory(booking.id,String(booking.status),String(booking.status),'Confirmation email re-queued',`admin:${userId}`,userId)
  return {success:true}
}

Deno.serve(async request=>{
  if(request.method==='OPTIONS')return new Response('ok',{headers:corsHeaders})
  try{
    const parts=routeParts(request)
    const [resource,id,subresource]=parts
    const requestBody=['POST','PATCH','PUT'].includes(request.method) ? await readBody(request) : {}
    const brandCode=getRequestBrandCode(request,requestBody)

    if(request.method==='GET'&&resource==='services'&&!id){
      return json(200,{services:await fetchServices({brandCode})})
    }

    if(request.method==='GET'&&resource==='services'&&id){
      return json(200,{service:await getServiceBySlug(id,false,brandCode)})
    }

    if(request.method==='POST'&&resource==='bookings'&&!id){
      return json(201,{booking:await createBooking(requestBody,{brandCode})})
    }

    if(request.method==='POST'&&resource==='bookings'&&id==='lookup'){
      return json(200,await lookupBooking(requestBody))
    }

    if(resource==='admin'){
      const { user, profile }=await getAuthenticatedAdmin(request)
      const adminProfile=profile as unknown as Json

      if(request.method==='GET'&&id==='bootstrap'){
        return json(200,await fetchAdminBootstrap(user as unknown as Json,profile as unknown as Json))
      }

      if(request.method==='POST'&&id==='bookings'&&!subresource){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,{booking:await createBooking(requestBody,{isAdmin:true,userId:user.id,brandCode})})
      }

      if(request.method==='PATCH'&&id==='bookings'&&subresource){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await updateBooking(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='resend'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await resendBookingEmail(subresource,user.id))
      }

      if(request.method==='POST'&&id==='services'){
        requireSkybookPermission(adminProfile,'services')
        return json(201,await upsertService(requestBody))
      }

      if(request.method==='PATCH'&&id==='services'&&subresource){
        requireSkybookPermission(adminProfile,'services')
        return json(200,await upsertService({...requestBody,id:subresource}))
      }

      if(request.method==='POST'&&id==='service-schedules'){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await upsertEngineRow('service_operating_windows',requestBody,[
          'service_id','day_of_week','start_time','end_time','slot_label','cutoff_hours','max_party_size','is_active'
        ]))
      }

      if(request.method==='PATCH'&&id==='service-schedules'&&subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await upsertEngineRow('service_operating_windows',{...requestBody,id:subresource},[
          'id','service_id','day_of_week','start_time','end_time','slot_label','cutoff_hours','max_party_size','is_active'
        ]))
      }

      if(request.method==='POST'&&id==='date-rules'){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await upsertEngineRow('service_date_rules',requestBody,[
          'service_id','rule_type','rule_value','is_active'
        ]))
      }

      if(request.method==='PATCH'&&id==='date-rules'&&subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await upsertEngineRow('service_date_rules',{...requestBody,id:subresource},[
          'id','service_id','rule_type','rule_value','is_active'
        ]))
      }

      if(request.method==='POST'&&id==='blackout-dates'){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await upsertEngineRow('service_blackout_dates',requestBody,[
          'service_id','starts_on','ends_on','reason','applies_to_all'
        ]))
      }

      if(request.method==='PATCH'&&id==='blackout-dates'&&subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await upsertEngineRow('service_blackout_dates',{...requestBody,id:subresource},[
          'id','service_id','starts_on','ends_on','reason','applies_to_all'
        ]))
      }

      if(request.method==='POST'&&id==='coupons'){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await upsertEngineRow('coupons',requestBody,[
          'code','description','discount_type','discount_value','starts_at','ends_at','usage_limit','usage_count','is_active','metadata'
        ]))
      }

      if(request.method==='PATCH'&&id==='coupons'&&subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await upsertEngineRow('coupons',{...requestBody,id:subresource},[
          'id','code','description','discount_type','discount_value','starts_at','ends_at','usage_limit','usage_count','is_active','metadata'
        ]))
      }

      if(request.method==='POST'&&id==='vouchers'){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await upsertEngineRow('vouchers',requestBody,[
          'code','description','initial_value','remaining_value','currency_code','expires_at','is_active','metadata'
        ]))
      }

      if(request.method==='PATCH'&&id==='vouchers'&&subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await upsertEngineRow('vouchers',{...requestBody,id:subresource},[
          'id','code','description','initial_value','remaining_value','currency_code','expires_at','is_active','metadata'
        ]))
      }

      if(request.method==='POST'&&id==='agents'){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await upsertEngineRow('agents',requestBody,[
          'code','company_name','contact_name','email','phone','commission_type','commission_value','is_active','metadata'
        ]))
      }

      if(request.method==='PATCH'&&id==='agents'&&subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await upsertEngineRow('agents',{...requestBody,id:subresource},[
          'id','code','company_name','contact_name','email','phone','commission_type','commission_value','is_active','metadata'
        ]))
      }

      if(request.method==='POST'&&id==='operators'){
        requireSkybookPermission(adminProfile,'finance')
        return json(201,await upsertEngineRow('operators',requestBody,[
          'code','company_name','contact_name','email','phone','commission_type','commission_value','payout_terms','is_active','metadata'
        ]))
      }

      if(request.method==='PATCH'&&id==='operators'&&subresource){
        requireSkybookPermission(adminProfile,'finance')
        return json(200,await upsertEngineRow('operators',{...requestBody,id:subresource},[
          'id','code','company_name','contact_name','email','phone','commission_type','commission_value','payout_terms','is_active','metadata'
        ]))
      }

      if(request.method==='POST'&&id==='resources'){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await upsertEngineRow('resources',requestBody,[
          'slug','name','resource_type','capacity','is_active','metadata'
        ]))
      }

      if(request.method==='PATCH'&&id==='resources'&&subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await upsertEngineRow('resources',{...requestBody,id:subresource},[
          'id','slug','name','resource_type','capacity','is_active','metadata'
        ]))
      }

      if(request.method==='POST'&&id==='webhook-endpoints'){
        requireSkybookPermission(adminProfile,'settings')
        return json(201,await upsertEngineRow('webhook_endpoints',requestBody,[
          'name','target_url','secret_key','subscribed_events','is_active'
        ]))
      }

      if(request.method==='PATCH'&&id==='webhook-endpoints'&&subresource){
        requireSkybookPermission(adminProfile,'settings')
        return json(200,await upsertEngineRow('webhook_endpoints',{...requestBody,id:subresource},[
          'id','name','target_url','secret_key','subscribed_events','is_active'
        ]))
      }

      if(request.method==='POST'&&id==='refunds'&&subresource){
        requireSkybookPermission(adminProfile,'finance')
        return json(200,await createRefund(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='office-invoices'){
        requireSkybookPermission(adminProfile,'finance')
        return json(201,await createOfficeInvoice(requestBody,user.id))
      }

      if(request.method==='PATCH'&&id==='settings'){
        requireSkybookPermission(adminProfile,'settings')
        await upsertBookingSetting('config',requestBody,true)
        return json(200,{success:true})
      }

      if(request.method==='PATCH'&&id==='email-templates'){
        requireSkybookPermission(adminProfile,'emails')
        await upsertBookingSetting('email_templates',requestBody,false)
        return json(200,{success:true})
      }

      if(request.method==='PATCH'&&id==='automation-rules'){
        requireSkybookPermission(adminProfile,'settings')
        await upsertBookingSetting('automation_rules',requestBody,false)
        return json(200,{success:true})
      }

      if(request.method==='PATCH'&&id==='portal-settings'){
        requireSkybookPermission(adminProfile,'settings')
        await upsertBookingSetting('portal',requestBody,true)
        return json(200,{success:true})
      }

      if(request.method==='PATCH'&&id==='integrations'){
        requireSkybookPermission(adminProfile,'settings')
        await upsertBookingSetting('integrations',requestBody,false)
        return json(200,{success:true})
      }

      if(request.method==='PATCH'&&id==='reporting-settings'){
        requireSkybookPermission(adminProfile,'reports')
        await upsertBookingSetting('reporting',requestBody,false)
        return json(200,{success:true})
      }

      if(request.method==='GET'&&id==='users'){
        requireSuperAdmin(adminProfile)
        return json(200,{admin_users:await listSkybookAdminUsers(),permission_catalog:SKYBOOK_PERMISSION_CATALOG,role_defaults:SKYBOOK_ROLE_DEFAULTS})
      }

      if(request.method==='POST'&&id==='users'){
        requireSuperAdmin(adminProfile)
        return json(200,await upsertSkybookAdminUser(requestBody))
      }

      if(request.method==='PATCH'&&id==='users'&&subresource){
        requireSuperAdmin(adminProfile)
        return json(200,await upsertSkybookAdminUser({...requestBody,id:subresource}))
      }
    }

    return json(404,{error:'Route not found.'})
  }catch(error){
    return json(400,{error:error instanceof Error ? error.message : 'Unexpected booking API error.'})
  }
})
