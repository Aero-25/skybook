import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.4'
import { PDFDocument, StandardFonts, rgb } from 'https://esm.sh/pdf-lib@1.17.1'
import { corsHeaders } from '../_shared/cors.ts'

const supabaseUrl=Deno.env.get('SUPABASE_URL') ?? ''
const supabaseAnonKey=Deno.env.get('SUPABASE_ANON_KEY') ?? ''
const supabaseServiceRoleKey=Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? Deno.env.get('SERVICE_ROLE_KEY') ?? ''
const adminClient=createClient(supabaseUrl,supabaseServiceRoleKey,{auth:{persistSession:false}})

type Json=Record<string,unknown>
type SearchResult={ kind:string, id:string, label:string, meta:string, action:string, booking_id?:string | null }

const SKYBOOK_PERMISSION_CATALOG=[
  { key:'dashboard', label:'Dashboard', description:'Access the command center and operational snapshots.' },
  { key:'calendar', label:'Calendar', description:'Use the day, week, and month operations calendar.' },
  { key:'reports', label:'Reports', description:'View commercial, finance, and performance reporting.' },
  { key:'reconciliation', label:'Reconciliation', description:'Match payments, guest invoices, refunds, commissions, and operator payouts.' },
  { key:'health', label:'System Health', description:'Inspect jobs, email failures, webhook issues, and callback health.' },
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
  manager:Object.fromEntries(SKYBOOK_PERMISSION_KEYS.map(key=>[key,true])),
  booking_agent:{
    dashboard:true,
    calendar:true,
    reports:false,
    reconciliation:false,
    health:false,
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
    reconciliation:true,
    health:true,
    bookings:true,
    customers:true,
    payments:true,
    services:false,
    engine:false,
    finance:true,
    settings:false,
    emails:false,
    admin_users:false
  },
  reservations:{
    dashboard:true,
    calendar:true,
    reports:false,
    reconciliation:false,
    health:false,
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
  operations:{
    dashboard:true,
    calendar:true,
    reports:true,
    reconciliation:false,
    health:true,
    bookings:true,
    customers:true,
    payments:false,
    services:false,
    engine:true,
    finance:false,
    settings:false,
    emails:false,
    admin_users:false
  },
  supplier_management:{
    dashboard:true,
    calendar:true,
    reports:true,
    reconciliation:true,
    health:true,
    bookings:true,
    customers:false,
    payments:false,
    services:false,
    engine:true,
    finance:true,
    settings:false,
    emails:false,
    admin_users:false
  }
}

const BOOKING_STATUS_TRANSITIONS:Record<string,string[]>={
  // Four statuses only: a website booking starts provisional, an admin-created one starts
  // finalised directly. Cancelled and refunded are the only ways off finalised (besides no-show,
  // which is a cancellation with a reason — see isNoShowWorkflow).
  provisional:['finalised','cancelled'],
  finalised:['cancelled','refunded'],
  cancelled:['finalised','provisional'],
  refunded:[]
}

const DEFAULT_OPS_TEMPLATES={
  internalNoteTemplates:[
    'Follow up with guest about pickup timing, meeting point, and dietary notes.',
    'Payment chase required before confirmation can be finalized.',
    'Supplier confirmation required before documents can be released.'
  ],
  cancellationReasonTemplates:[
    'Guest changed travel dates.',
    'Operator or supplier unavailable.',
    'Weather or safety hold.'
  ],
  refundReasonTemplates:[
    'Service cancelled before departure.',
    'Duplicate payment received.',
    'Partial refund approved by finance.'
  ]
}
const DOCUMENT_BUCKET='skybook-documents'
const MEMORY_BUCKET='tour-memories'
const SERVICE_IMAGE_BUCKET='service-images'
const MEMORY_MIME_TYPES=new Set(['image/jpeg','image/png','image/webp','image/avif'])
const DEFAULT_QUEUE_SETTINGS={
  enabled:true,
  autoProcessOnBootstrap:true,
  reminderDelayHours:12,
  maxJobsPerSweep:25
}
const DEFAULT_AUTOMATION_RULES={
  autoConfirmPaidBookings:true,
  autoCompletePastConfirmedBookings:true,
  autoCancelExpiredAwaitingPayment:false,
  awaitingPaymentExpiryHours:48,
  sendOnBookingMade:true,
  sendOnBookingConfirmed:false,
  sendOnPaymentReceived:false,
  sendOnCancellationRefund:false
}
const DEFAULT_BOOKING_FORM_FIELDS:Json[]=[]
const BOOKING_FORM_FIELD_TYPES=new Set(['text','textarea','select','checkbox','number','date','email','tel'])
const MANUAL_PAYMENT_TYPES=new Set(['cash','eft','bank_transfer','card','voucher','other'])
const BRAND_SUPPORT_EMAILS={
  'true-travel':'bookings@truetravelnam.net',
  iventure:'info@iventuretours.net'
}
const BRAND_CONSULTANT_EMAILS={
  'true-travel':'bookings@truetravelnam.net',
  iventure:'info@iventuretours.net'
}
const BRAND_RESEND_KEYS:Record<string,string>={} // kept for backwards compat, unused
const BRAND_EMAIL_NAMES={
  'true-travel':'True Travel',
  iventure:'Iventure'
}
const DEFAULT_BRAND_DIRECTORY:Record<string,Json>={
  'true-travel':{
    code:'true-travel',
    name:'True Travel',
    booking_prefix:'TT',
    invoice_prefix:'TTN',
    logo_url:'https://zegfirgyhdjyehvhlrnh.supabase.co/storage/v1/object/public/True%20Travel/TT_Logo-removebg-preview.png',
    support_email:BRAND_SUPPORT_EMAILS['true-travel'],
    support_phone:'+264813224270',
    support_whatsapp:'+264813224270',
    website_url:'https://truetravelnam.net',
    document_company_line:'True Travel coastal reservations',
    document_footer:'Atlantic Street, Waterfront, Walvis Bay, Namibia',
    document_banking_line:'True Travel invoices show the latest SkyBook balance. Use the invoice number or booking reference as payment reference.',
    document_support_line:'bookings@truetravelnam.net · +264 81 322 4270'
  },
  iventure:{
    code:'iventure',
    name:'Iventure',
    booking_prefix:'IV',
    invoice_prefix:'IVT',
    logo_url:'https://zegfirgyhdjyehvhlrnh.supabase.co/storage/v1/object/public/Iventure/IV%20Logo.png',
    support_email:BRAND_SUPPORT_EMAILS.iventure,
    support_phone:'+264813224270',
    support_whatsapp:'+264813224270',
    website_url:'https://iventuretours.net',
    document_company_line:'Iventure desert-coast expedition desk',
    document_footer:'Walvis Bay, Namibia',
    document_banking_line:'Iventure invoices show the latest SkyBook balance. Use the invoice number or booking reference as payment reference.',
    document_support_line:'info@iventuretours.net · +264 81 322 4270'
  }
}

const json=(status:number,payload:Json)=>new Response(JSON.stringify(payload),{
  status,
  headers:{...corsHeaders,'content-type':'application/json'}
})

const readBody=async(request:Request)=>{
  const contentType=request.headers.get('content-type')||''
  if(!contentType.includes('application/json'))return {}
  try{return await request.json()}catch{return {}}
}

const normalizeText=(value:unknown)=>String(value ?? '').trim()
const getDefaultBrandProfile=(code:unknown)=>{
  const normalized=normalizeText(code) || 'true-travel'
  return (DEFAULT_BRAND_DIRECTORY[normalized as keyof typeof DEFAULT_BRAND_DIRECTORY] || DEFAULT_BRAND_DIRECTORY['true-travel']) as Json
}
const mergeBrandProfile=(brand:Json={})=>{
  const metadata=typeof brand?.metadata==='object' && brand.metadata && !Array.isArray(brand.metadata) ? brand.metadata as Json : {}
  const fallback=getDefaultBrandProfile(brand.code)
  return {
    ...fallback,
    ...brand,
    code:normalizeText(brand.code || fallback.code) || normalizeText(fallback.code),
    name:normalizeText(brand.name || metadata.name || fallback.name) || normalizeText(fallback.name),
    booking_prefix:normalizeText(brand.booking_prefix || metadata.booking_prefix || fallback.booking_prefix) || normalizeText(fallback.booking_prefix),
    invoice_prefix:normalizeText(brand.invoice_prefix || metadata.invoice_prefix || fallback.invoice_prefix) || normalizeText(fallback.invoice_prefix || fallback.booking_prefix),
    logo_url:normalizeText(brand.logo_url || metadata.logo_url || fallback.logo_url) || normalizeText(fallback.logo_url),
    support_email:normalizeText(brand.support_email || metadata.support_email || fallback.support_email) || normalizeText(fallback.support_email),
    support_phone:normalizeText(brand.support_phone || metadata.support_phone || fallback.support_phone) || normalizeText(fallback.support_phone),
    support_whatsapp:normalizeText(brand.support_whatsapp || metadata.support_whatsapp || fallback.support_whatsapp) || normalizeText(fallback.support_whatsapp),
    website_url:normalizeText(brand.website_url || metadata.website_url || fallback.website_url) || normalizeText(fallback.website_url),
    document_company_line:normalizeText(brand.document_company_line || metadata.document_company_line || fallback.document_company_line) || normalizeText(fallback.document_company_line),
    document_footer:normalizeText(brand.document_footer || metadata.document_footer || fallback.document_footer) || normalizeText(fallback.document_footer),
    document_support_line:normalizeText(brand.document_support_line || metadata.document_support_line || fallback.document_support_line) || normalizeText(fallback.document_support_line)
  }
}
const normalizeUsername=(value:unknown)=>normalizeText(value).toLowerCase().replace(/[^a-z0-9._-]/g,'')
const fallbackUsernameFromEmail=(value:unknown)=>normalizeUsername(normalizeText(value).split('@')[0] || '')
const resolveAuthUsername=(user:Json={})=>normalizeUsername(user.user_metadata?.username) || fallbackUsernameFromEmail(user.email)
const createInternalAdminEmail=username=>`${normalizeUsername(username)}@skybook.local`
const displayLabel=(value:unknown)=>normalizeText(value).replace(/_/g,' ').trim()
const nowIso=()=>new Date().toISOString()
const parseDateValue=(value:string)=>{
  const normalized=normalizeText(value)
  if(!normalized)return null
  const stamp=normalized.includes('T') ? normalized : `${normalized}T00:00:00`
  const next=new Date(stamp)
  return Number.isNaN(next.getTime()) ? null : next
}
const sanitizePermissionMap=(input:unknown)=>{
  const source=typeof input==='object' && input ? input as Record<string,unknown> : {}
  return Object.fromEntries(SKYBOOK_PERMISSION_KEYS.filter(key=>key in source).map(key=>[key,Boolean(source[key])]))
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
  const role=normalizeText(profile.role)
  if(role!=='super_admin'&&role!=='manager'){
    throw new Error('Manager or super admin access is required for admin user management.')
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
const getBearerToken=(request:Request)=>{
  const header=normalizeText(request.headers.get('authorization'))
  if(!header)return ''
  const match=header.match(/^bearer\s+(.+)$/i)
  return normalizeText(match?.[1] ?? '')
}

const bootstrapInitialSkybookAdmin=async(user:Json)=>{
  const seededAdmins=await safeTableSelect<Json>(
    adminClient
      .from('app_users')
      .select('id,is_active')
      .eq('is_active',true)
      .limit(1),
    []
  )
  if(seededAdmins.length)return null
  const seededProfile={
    id:normalizeText(user.id),
    full_name:normalizeText(user.user_metadata?.full_name) || normalizeText(user.email) || 'SkyBook Admin',
    role:'super_admin',
    is_active:true,
    permissions:sanitizePermissionMap({})
  }
  const { data,error }=await adminClient
    .from('app_users')
    .upsert(seededProfile,{ onConflict:'id' })
    .select('id,full_name,role,is_active,permissions')
    .single()
  if(error){
    if(isUniqueViolation(error)){
      return safeMaybeSingle<Json>(
        adminClient
          .from('app_users')
          .select('id,full_name,role,is_active,permissions')
          .eq('id',normalizeText(user.id))
          .maybeSingle()
      )
    }
    throw new Error(String(error.message || 'Unable to bootstrap the first SkyBook admin user.'))
  }
  return data || null
}

const getRequestBrandCode=(request:Request, payload:Json={})=>{
  const headerBrand=normalizeText(request.headers.get('x-brand-code'))
  const queryBrand=normalizeText(new URL(request.url).searchParams.get('brand'))
  const bodyBrand=normalizeText(payload.brand_code)
  return bodyBrand || headerBrand || queryBrand || 'true-travel'
}

const listBrands=async()=>{
  const brands=await safeTableSelect<Json>(adminClient.from('brands').select('*').order('sort_order',{ascending:true}),[])
  return brands.length ? brands.map(brand=>mergeBrandProfile(brand)) : Object.values(DEFAULT_BRAND_DIRECTORY).map(brand=>mergeBrandProfile(brand))
}

const getBrandByCode=async(code:string)=>{
  const brand=await safeMaybeSingle<Json>(adminClient.from('brands').select('*').eq('code',code).maybeSingle())
  return mergeBrandProfile(brand || { code })
}

const normalizeBookingReference=value=>normalizeText(value).replace(/\s+/g,'-').replace(/[^A-Z0-9-]/gi,'').toUpperCase()
const normalizeReferencePrefix=(prefix='TT')=>normalizeBookingReference(prefix).replace(/-/g,'').slice(0,8)||'TT'
const formatReference=(prefix='TT')=>{
  const stamp=new Date().toISOString().slice(2,10).replace(/-/g,'')
  const entropy=crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()
  return `${normalizeReferencePrefix(prefix)}-${stamp}-${entropy}`
}

const defaultEmailTemplates={
  booking_received:{
    subject:'We received your booking request {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nWe received your True Travel booking request for {{service_name}}.\nReference: {{booking_reference}}\nPreferred date: {{booking_date}}\n\nYour booking is under review by a True Travel consultant. A consultant will reach out shortly with the next steps.\n\nTrue Travel\n{{brand_support_email}}\n{{brand_support_phone}}'
  },
  true_travel_consultant_alert:{
    subject:'New True Travel reservation {{booking_reference}}',
    body:'A new True Travel reservation needs review.\n\nReference: {{booking_reference}}\nGuest: {{customer_name}}\nEmail: {{customer_email}}\nPhone: {{customer_phone}}\nService: {{service_name}}\nPreferred date: {{booking_date}}\nGuests: {{guest_count}}\nTotal: {{total_amount}}\nSource: {{booking_source}}\nCapture page: {{capture_page}}\nCreated via: {{created_via}}\nNotes: {{customer_notes}}\nCustom fields: {{custom_details}}\n\nOpen SkyBook and review this reservation before sending payment details.'
  },
  payment_request:{
    subject:'Payment request for {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nYour reservation for {{service_name}} has been reviewed.\nReference: {{booking_reference}}\nDate: {{booking_date}}\nTotal due: {{total_amount}}\n\nPlease use your booking reference when making payment. Reply to this message if you need help.\n\n{{brand_name}}\n{{brand_support_email}}\n{{brand_support_phone}}'
  },
  booking_confirmed:{
    subject:'Your booking {{booking_reference}} is confirmed',
    body:'Hi {{customer_name}},\n\nYour booking for {{service_name}} is confirmed.\nReference: {{booking_reference}}\nDate: {{booking_date}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nWe look forward to welcoming you.\n\n{{brand_name}}\n{{brand_support_email}}\n{{brand_support_phone}}'
  },
  payment_received:{
    subject:'Payment received for {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nWe received your payment for {{service_name}}.\nReference: {{booking_reference}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\nThank you.\n\n{{brand_name}}\n{{brand_support_email}}\n{{brand_support_phone}}'
  },
  cancellation_refund:{
    subject:'Update for {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nThere is an update for your booking {{booking_reference}} for {{service_name}}.\nDate: {{booking_date}}\nTotal: {{total_amount}}\n\nIf a refund applies, our team will confirm the next steps with you shortly.\n\n{{brand_name}}\n{{brand_support_email}}\n{{brand_support_phone}}'
  },
  status_changed:{
    subject:'Booking update for {{booking_reference}}',
    body:'Hi {{customer_name}},\n\nYour booking status changed.\nReference: {{booking_reference}}\nService: {{service_name}}\nDate: {{booking_date}}\nTotal: {{total_amount}}\nPayment status: {{payment_status}}\n\n{{brand_name}}\n{{brand_support_email}}\n{{brand_support_phone}}'
  }
}

const renderTemplate=(template:string,variables:Record<string,unknown>)=>template.replace(/\{\{(.*?)\}\}/g,(_,token)=>{
  const key=String(token).trim()
  return key in variables ? String(variables[key]) : ''
})

const safeUuid=(value:unknown)=>normalizeText(value) || null

const addHours=(base:Date,hours:number)=>{
  const next=new Date(base)
  next.setHours(next.getHours()+hours)
  return next.toISOString()
}

const validateBookingTransition=(fromStatus:unknown,toStatus:unknown,paymentStatus:unknown)=>{
  const from=normalizeText(fromStatus) || 'pending'
  const to=normalizeText(toStatus) || from
  if(!to || to===from)return
  const allowed=BOOKING_STATUS_TRANSITIONS[from] || []
  if(!allowed.includes(to)){
    throw new Error(`Cannot move a booking from ${from.replace(/_/g,' ')} to ${to.replace(/_/g,' ')}.`)
  }
  if(to==='refunded' && !['paid','partially_paid','refunded'].includes(normalizeText(paymentStatus))){
    throw new Error('Refunded status requires a paid or partially paid booking.')
  }
}

const getAuthenticatedAdmin=async(request:Request)=>{
  const accessToken=getBearerToken(request)
  if(!accessToken || accessToken===supabaseAnonKey){
    throw new Error('Authenticated admin user is required.')
  }
  const { data:{ user }, error:userError }=await adminClient.auth.getUser(accessToken)
  if(userError||!user)throw new Error('Authenticated admin user is required.')
  const { data:existingProfile,error:profileError }=await adminClient
    .from('app_users')
    .select('id,full_name,role,is_active,permissions')
    .eq('id',user.id)
    .maybeSingle()
  if(profileError)throw new Error('Unable to load SkyBook admin access.')
  const profile=existingProfile || await bootstrapInitialSkybookAdmin(user as unknown as Json)
  if(!profile?.is_active)throw new Error('Admin access is not configured for this user.')
  return {
    user,
    profile:{
      ...profile,
      username:resolveAuthUsername(user as unknown as Json),
      effective_permissions:resolveProfilePermissions(profile as unknown as Json)
    }
  }
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

const normalizeFieldId=(value:unknown,fallback='')=>{
  const normalized=normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g,'_')
    .replace(/^_+|_+$/g,'')
  return normalized || fallback
}

const normalizeBookingFieldOptions=(value:unknown)=>{
  const source=Array.isArray(value)
    ? value
    : normalizeText(value).split(/\r?\n|,/)
  return source.map((option,index)=>{
    const raw=typeof option==='object' && option ? option as Json : { label:option, value:option }
    const label=normalizeText(raw.label || raw.value)
    const optionValue=normalizeText(raw.value || label)
    return {
      value:normalizeFieldId(optionValue,`option_${index+1}`),
      label:label || optionValue || `Option ${index+1}`
    }
  }).filter(option=>option.value&&option.label)
}

const normalizeBookingFieldDefinitions=(input:unknown)=>{
  const source=Array.isArray(input)
    ? input
    : (typeof input==='object' && input && Array.isArray((input as Json).fields) ? (input as Json).fields as unknown[] : [])
  const seen=new Set<string>()
  return source.map((item,index)=>{
    const field=typeof item==='object' && item ? item as Json : {}
    const label=normalizeText(field.label)
    const id=normalizeFieldId(field.id || field.key || label,`field_${index+1}`)
    const type=BOOKING_FORM_FIELD_TYPES.has(normalizeText(field.type).toLowerCase())
      ? normalizeText(field.type).toLowerCase()
      : 'text'
    const brandCodes=Array.isArray(field.brand_codes)
      ? field.brand_codes.map(value=>normalizeFieldId(value)).filter(Boolean)
      : []
    const options=type==='select' ? normalizeBookingFieldOptions(field.options) : []
    return {
      id,
      label:label || displayLabel(id),
      type,
      required:Boolean(field.required),
      placeholder:normalizeText(field.placeholder),
      help_text:normalizeText(field.help_text || field.helper),
      brand_codes:brandCodes,
      options,
      sort_order:Number(field.sort_order ?? index),
      is_active:field.is_active===undefined ? true : Boolean(field.is_active)
    }
  }).filter(field=>{
    if(!field.id||!field.label||seen.has(field.id))return false
    seen.add(field.id)
    return true
  }).sort((left,right)=>Number(left.sort_order||0)-Number(right.sort_order||0))
}

const bookingFieldAppliesToBrand=(field:Json,brandCode:string)=>{
  const brandCodes=Array.isArray(field.brand_codes) ? field.brand_codes.map(value=>normalizeFieldId(value)).filter(Boolean) : []
  return !brandCodes.length || brandCodes.includes(normalizeFieldId(brandCode))
}

const getBookingFormFields=async(brandCode='',{publicOnly=true}={})=>{
  const fields=normalizeBookingFieldDefinitions(await getSettingValue('booking_fields',DEFAULT_BOOKING_FORM_FIELDS))
  return fields.filter(field=>{
    if(publicOnly && field.is_active===false)return false
    return bookingFieldAppliesToBrand(field,brandCode)
  })
}

const isEmptyCustomFieldValue=(value:unknown)=>{
  if(typeof value==='boolean')return value!==true
  if(Array.isArray(value))return value.length===0
  return normalizeText(value)===''
}

const validateCustomBookingFields=async(brandCode:string,metadata:Json,shouldValidate=false)=>{
  if(!shouldValidate)return
  const fields=await getBookingFormFields(brandCode,{publicOnly:true})
  const customValues=normalizeJsonRecord(metadata.custom_fields)
  for(const field of fields){
    if(field.required && isEmptyCustomFieldValue(customValues[field.id as string])){
      throw new Error(`${field.label} is required.`)
    }
  }
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

const isUniqueViolation=(error:unknown)=>String((error as { code?:unknown } | null)?.code || '')==='23505'

const bookingReferenceExists=async(reference:string)=>{
  if(!reference)return false
  const existing=await safeMaybeSingle<Json>(
    adminClient.from('bookings').select('id').eq('reference',reference).maybeSingle()
  )
  return Boolean(existing?.id)
}

const createUniqueBookingReference=async(prefix='TT')=>{
  for(let attempt=0;attempt<12;attempt+=1){
    const reference=formatReference(prefix)
    if(!(await bookingReferenceExists(reference)))return reference
  }
  throw new Error('Unable to generate a unique booking reference. Please try again.')
}

const encodeUtf8=(value:string)=>new TextEncoder().encode(value)
const toHex=(bytes:ArrayBuffer)=>Array.from(new Uint8Array(bytes)).map(value=>value.toString(16).padStart(2,'0')).join('')
const hashToken=async(value:string)=>toHex(await crypto.subtle.digest('SHA-256',encodeUtf8(value)))
const generatePortalToken=()=>`${crypto.randomUUID().replace(/-/g,'')}${crypto.randomUUID().replace(/-/g,'').slice(0,8)}`
const checksumBytes=async(bytes:Uint8Array)=>toHex(await crypto.subtle.digest('SHA-256',bytes))

const recordHealthEvent=async(payload:Json)=>{
  const { error }=await adminClient.from('system_health_events').insert({
    event_type:normalizeText(payload.event_type) || 'system',
    severity:normalizeText(payload.severity) || 'warning',
    status:normalizeText(payload.status) || 'open',
    source:normalizeText(payload.source) || 'booking-api',
    summary:normalizeText(payload.summary) || 'SkyBook system event',
    detail:normalizeText(payload.detail) || null,
    related_job_id:safeUuid(payload.related_job_id),
    related_booking_id:safeUuid(payload.related_booking_id),
    related_payment_id:safeUuid(payload.related_payment_id),
    related_webhook_endpoint_id:safeUuid(payload.related_webhook_endpoint_id),
    metadata:typeof payload.metadata==='object' && payload.metadata ? payload.metadata : {}
  })
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
}

const enqueueSystemJob=async(payload:Json)=>{
  const insertPayload={
    job_type:normalizeText(payload.job_type) || 'generic',
    job_group:normalizeText(payload.job_group) || 'operations',
    status:normalizeText(payload.status) || 'queued',
    priority:normalizeText(payload.priority) || 'normal',
    run_at:payload.run_at || nowIso(),
    booking_id:safeUuid(payload.booking_id),
    customer_id:safeUuid(payload.customer_id),
    related_table:normalizeText(payload.related_table) || null,
    related_id:safeUuid(payload.related_id),
    max_attempts:Number(payload.max_attempts || 3),
    payload:typeof payload.payload==='object' && payload.payload ? payload.payload : {},
    result:typeof payload.result==='object' && payload.result ? payload.result : {},
    created_by:safeUuid(payload.created_by)
  }
  const { data,error }=await adminClient.from('system_jobs').insert(insertPayload).select().single()
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
  return data || null
}

const updateSystemJob=async(jobId:string,payload:Json)=>{
  const { data,error }=await adminClient.from('system_jobs').update(payload).eq('id',jobId).select().single()
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
  return data || null
}

const createSignedDocumentUrl=async(storageBucket:string,storagePath:string,expiresIn=3600)=>{
  const bucket=normalizeText(storageBucket) || DOCUMENT_BUCKET
  const path=normalizeText(storagePath)
  if(!path)return null
  const { data,error }=await adminClient.storage.from(bucket).createSignedUrl(path,expiresIn)
  if(error){
    await recordHealthEvent({
      event_type:'document_storage',
      severity:'error',
      source:'booking-api',
      summary:'Document signed URL generation failed',
      detail:String(error.message || 'Unable to create signed URL.'),
      metadata:{ bucket, path }
    })
    return null
  }
  return data?.signedUrl || null
}

const createSignedMemoryUrl=async(storagePath:string,expiresIn=3600)=>{
  const path=normalizeText(storagePath)
  if(!path)return null
  const { data,error }=await adminClient.storage.from(MEMORY_BUCKET).createSignedUrl(path,expiresIn)
  if(error){
    await recordHealthEvent({
      event_type:'memory_storage',
      severity:'error',
      source:'booking-api',
      summary:'Tour memory signed URL generation failed',
      detail:String(error.message || 'Unable to create memory image link.'),
      metadata:{ bucket:MEMORY_BUCKET, path }
    })
    return null
  }
  return data?.signedUrl || null
}

const getBrandDocumentPalette=(brandCode:string)=>normalizeText(brandCode)==='iventure'
  ? {
      accent:rgb(0.82,0.54,0.14),
      accentSoft:rgb(0.97,0.92,0.8),
      ink:rgb(0.12,0.11,0.1),
      muted:rgb(0.42,0.34,0.24)
    }
  : {
      accent:rgb(0.09,0.23,0.36),
      accentSoft:rgb(0.89,0.95,0.98),
      ink:rgb(0.09,0.13,0.19),
      muted:rgb(0.4,0.5,0.58)
    }

const fetchBrandLogoAsset=async(brand:Json={})=>{
  const logoUrl=normalizeText(brand.logo_url)
  if(!logoUrl)return null
  try{
    const response=await fetch(logoUrl)
    if(!response.ok)return null
    const bytes=new Uint8Array(await response.arrayBuffer())
    if(!bytes.byteLength)return null
    const mimeType=normalizeText(response.headers.get('content-type')).toLowerCase()
    return { bytes, format:mimeType.includes('png') ? 'png' : 'jpg' }
  }catch{
    return null
  }
}

const sanitizeFileName=(value:unknown,fallback='tour-memory')=>{
  const raw=normalizeText(value) || fallback
  const clean=raw.replace(/[^a-zA-Z0-9._-]+/g,'-').replace(/^-+|-+$/g,'')
  return clean || fallback
}

const decodeBase64File=(value:unknown)=>{
  const raw=normalizeText(value)
  if(!raw)return new Uint8Array()
  const payload=raw.includes(',') ? raw.split(',').pop() || '' : raw
  return Uint8Array.from(atob(payload),char=>char.charCodeAt(0))
}

const normalizeMemoryReference=(value:unknown)=>normalizeBookingReference(value)

const fetchMemoryBookingByReference=async(referenceInput:unknown,brandCodeInput='')=>{
  const reference=normalizeMemoryReference(referenceInput)
  if(!reference)throw new Error('Booking reference is required.')
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,preferred_date,quantity,customers(full_name,email),services(name,slug)')
      .eq('reference',reference)
      .maybeSingle()
  )
  if(!booking)throw new Error('No memories found for that reference yet.')
  const requestedBrand=normalizeText(brandCodeInput)
  if(requestedBrand && normalizeText(booking.brand_code)!==requestedBrand){
    throw new Error('No memories found for that reference yet.')
  }
  return booking
}

const fetchMemoryBookingByDate=async(dateInput:unknown,brandCodeInput='')=>{
  const date=normalizeText(dateInput)
  if(!date)throw new Error('Tour date is required.')
  const {data,error}=await adminClient
    .from('bookings')
    .select('id,reference,brand_code,status,preferred_date,quantity,customers!inner(full_name,email),services(name,slug)')
    .eq('preferred_date',date)
    .limit(1)
    .maybeSingle()
  if(error)throw error
  const booking=data as Json|null
  if(!booking)throw new Error('No memories found for that date. Please check the date and try again.')
  const requestedBrand=normalizeText(brandCodeInput)
  if(requestedBrand && normalizeText(booking.brand_code)!==requestedBrand){
    throw new Error('No memories found for that date. Please check the date and try again.')
  }
  return booking
}

const decorateMemoryRows=async(rows:Json[])=>Promise.all(rows.map(async row=>({
  id:row.id,
  booking_reference:row.booking_reference,
  title:normalizeText(row.title) || normalizeText(row.file_name) || 'Tour memory',
  caption:normalizeText(row.caption),
  file_name:row.file_name,
  mime_type:row.mime_type,
  byte_size:row.byte_size,
  sort_order:row.sort_order,
  created_at:row.created_at,
  signed_url:await createSignedMemoryUrl(normalizeText(row.storage_path)),
  download_name:sanitizeFileName(row.file_name,`tour-memory-${normalizeText(row.booking_reference)}`)
})))

const listTourMemories=async(payload:Json,brandCode:string)=>{
  const booking=payload.date
    ? await fetchMemoryBookingByDate(payload.date,brandCode)
    : await fetchMemoryBookingByReference(payload.reference,brandCode)
  const rows=await safeTableSelect<Json>(
    adminClient
      .from('booking_memories')
      .select('*')
      .eq('booking_id',String(booking.id))
      .eq('is_active',true)
      .order('sort_order',{ascending:true})
      .order('created_at',{ascending:true}),
    []
  )
  if(!rows.length)throw new Error('No memories have been uploaded for your tour yet. Please check back soon or contact us.')
  return {
    booking:{
      reference:booking.reference,
      brand_code:booking.brand_code,
      preferred_date:booking.preferred_date,
      quantity:booking.quantity,
      customer_name:normalizeText((booking.customers as Json | null)?.full_name),
      service_name:normalizeText((booking.services as Json | null)?.name)
    },
    memories:await decorateMemoryRows(rows)
  }
}

const createTourMemoryUpload=async(payload:Json,userId:string)=>{
  const booking=normalizeText(payload.booking_id)
    ? await safeMaybeSingle<Json>(
        adminClient
          .from('bookings')
          .select('id,reference,brand_code,status')
          .eq('id',normalizeText(payload.booking_id))
          .maybeSingle()
      )
    : await fetchMemoryBookingByReference(payload.reference)
  if(!booking?.id)throw new Error('Booking not found for that reference.')
  if(normalizeText(booking.status)!=='completed')throw new Error('Tour memories can only be uploaded after the booking is finalised.')
  const files=Array.isArray(payload.files) ? payload.files as Json[] : []
  if(!files.length)throw new Error('Choose at least one image to upload.')
  const reference=normalizeMemoryReference(booking.reference)
  const brandCode=normalizeText(booking.brand_code) || 'true-travel'
  const existingRows=await safeTableSelect<Json>(
    adminClient.from('booking_memories').select('id').eq('booking_id',String(booking.id)),
    []
  )
  const uploaded:Json[]=[]
  for(const [index,file] of files.entries()){
    const fileName=sanitizeFileName(file.file_name,`memory-${index+1}.jpg`)
    const mimeType=normalizeText(file.mime_type) || 'image/jpeg'
    if(!MEMORY_MIME_TYPES.has(mimeType)){
      throw new Error(`${fileName} is not a supported image type.`)
    }
    const fileBytes=decodeBase64File(file.file_content_base64)
    if(!fileBytes.byteLength)throw new Error(`${fileName} is empty.`)
    if(fileBytes.byteLength>20*1024*1024)throw new Error(`${fileName} is larger than the 20MB image limit.`)
    const storagePath=`memories/${brandCode}/${reference}/${Date.now()}-${index+1}-${fileName}`
    const upload=await adminClient.storage.from(MEMORY_BUCKET).upload(storagePath,fileBytes,{
      contentType:mimeType,
      upsert:false
    })
    if(upload.error)throw new Error(String(upload.error.message || `Unable to upload ${fileName}.`))
    const memory=await safeMaybeSingle<Json>(
      adminClient
        .from('booking_memories')
        .insert({
          booking_id:String(booking.id),
          booking_reference:reference,
          brand_code:brandCode,
          title:normalizeText(file.title) || normalizeText(payload.title) || null,
          caption:normalizeText(file.caption) || normalizeText(payload.caption),
          file_name:fileName,
          storage_bucket:MEMORY_BUCKET,
          storage_path:storagePath,
          mime_type:mimeType,
          byte_size:fileBytes.byteLength,
          sort_order:existingRows.length+index+1,
          metadata:{
            original_name:normalizeText(file.original_name) || fileName,
            uploaded_from:'skybook-admin'
          },
          uploaded_by:safeUuid(userId)
        })
        .select()
        .single()
    )
    if(memory)uploaded.push(memory)
  }
  const currentStatus=normalizeText(booking.status) || 'pending'
  await insertStatusHistory(String(booking.id),currentStatus,currentStatus,`${uploaded.length} tour memor${uploaded.length===1 ? 'y' : 'ies'} uploaded`,'admin:' + userId,userId)
  return {
    success:true,
    memories:await decorateMemoryRows(uploaded)
  }
}

const buildDocumentPdfBytes=async(booking:Json,documentType:string,context:Json={})=>{
  const pdf=await PDFDocument.create()
  const page=pdf.addPage([595.28,841.89])
  const font=await pdf.embedFont(StandardFonts.Helvetica)
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  const brandCode=normalizeText(context.brand_code || booking.brand_code || 'true-travel') || 'true-travel'
  const brandProfile=mergeBrandProfile(typeof context.brand==='object' && context.brand && !Array.isArray(context.brand) ? context.brand as Json : { code:brandCode, name:context.brand_name })
  const brandName=normalizeText(context.brand_name || brandProfile.name) || 'SkyBook'
  const palette=getBrandDocumentPalette(brandCode)
  const logoAsset=await fetchBrandLogoAsset(brandProfile)
  let embeddedLogo:any=null
  if(logoAsset){
    try{embeddedLogo=logoAsset.format==='png' ? await pdf.embedPng(logoAsset.bytes) : await pdf.embedJpg(logoAsset.bytes)}catch{embeddedLogo=null}
  }
  const currency=normalizeText(booking.currency_code || booking.currency || 'NAD')
  const totalAmount=Number(context.invoice_total || booking.total_amount || 0)
  const balanceAmount=Number(context.balance_amount ?? (Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0)))
  const paymentsReceived=Number(context.payments_received || 0)
  const invoiceNumber=normalizeText(context.document_number) || normalizeText(booking.reference)
  const guestName=normalizeText(context.customer_name || booking.customer_name)
  const guestEmail=normalizeText(context.customer_email || '')
  const guestPhone=normalizeText(context.customer_phone || '')
  const serviceName=normalizeText(context.service_name || booking.service_name)
  const preferredDate=normalizeText(String(booking.preferred_date || 'TBC'))
  const bookingStatus=normalizeText(String(booking.status || 'pending')).replace(/_/g,' ')
  const paymentStatus=normalizeText(String(booking.payment_status || 'pending')).replace(/_/g,' ')
  const adultQty=Number(booking.adult_quantity||0)
  const childQty=Number(booking.child_quantity||0)
  const pax=adultQty+childQty||Number(booking.quantity||1)
  const paxLabel=adultQty+childQty>0 ? `${pax} (${adultQty} adult${adultQty!==1?'s':''}, ${childQty} child${childQty!==1?'ren':''})` : String(pax)
  const today=new Date().toLocaleDateString('en-NA',{day:'2-digit',month:'long',year:'numeric'})
  const fmtAmt=(n:number)=>`${currency} ${Number(n||0).toLocaleString('en-US',{minimumFractionDigits:2,maximumFractionDigits:2})}`
  const white=rgb(1,1,1)
  const lightGray=rgb(0.96,0.96,0.96)
  const midGray=rgb(0.80,0.80,0.80)
  const darkInk=rgb(0.09,0.09,0.11)
  const W=595.28
  const ML=40
  const usable=W-ML*2

  // ── HEADER BAR ────────────────────────────────────────────────────────────
  const hdrH=62,hdrY=841.89-hdrH
  page.drawRectangle({x:0,y:hdrY,width:W,height:hdrH,color:palette.accent})
  if(embeddedLogo){
    const maxH=46,scale=Math.min(maxH/embeddedLogo.height,88/embeddedLogo.width)
    const dims=embeddedLogo.scale(scale)
    page.drawImage(embeddedLogo,{x:ML,y:hdrY+(hdrH-dims.height)/2,width:dims.width,height:dims.height})
  }else{
    page.drawText(brandName,{x:ML,y:hdrY+22,size:16,font:bold,color:white})
  }
  const docLabel=documentType==='guest_invoice' ? 'guest invoice' : displayLabel(documentType)
  page.drawText(docLabel,{x:W-ML-148,y:hdrY+32,size:15,font:bold,color:white})
  page.drawText('Prepared in SkyBook',{x:W-ML-148,y:hdrY+14,size:9,font,color:rgb(0.93,0.95,0.97)})

  // ── BRAND STRIP ───────────────────────────────────────────────────────────
  const stpH=28,stpY=hdrY-stpH
  page.drawRectangle({x:ML-16,y:stpY,width:usable+32,height:stpH,color:palette.accentSoft})
  page.drawText(brandName,{x:ML,y:stpY+9,size:12,font:bold,color:palette.accent})
  const compLine=normalizeText(brandProfile.document_company_line)||''
  if(compLine)page.drawText(compLine,{x:ML+112,y:stpY+9,size:10,font,color:palette.muted,maxWidth:310})

  // ── HEADING + INVOICE NUMBER BLOCK ────────────────────────────────────────
  const hY=stpY-38
  page.drawText(`${brandName} ${docLabel}`,{x:ML,y:hY,size:20,font:bold,color:darkInk,maxWidth:290})
  const invX=W-ML-172
  page.drawText('INVOICE NUMBER',{x:invX,y:hY+2,size:8,font:bold,color:palette.muted})
  page.drawText(invoiceNumber,{x:invX,y:hY-15,size:12,font:bold,color:darkInk,maxWidth:168})
  page.drawText(today,{x:invX,y:hY-31,size:10,font,color:palette.muted})

  // ── DIVIDER ───────────────────────────────────────────────────────────────
  const div1Y=hY-46
  page.drawLine({start:{x:ML,y:div1Y},end:{x:W-ML,y:div1Y},thickness:0.5,color:midGray})

  // ── TWO-COLUMN DETAIL SECTION ─────────────────────────────────────────────
  const infoY=div1Y-14
  const col2X=W/2+8

  // Left — Bill To
  page.drawText('BILL TO',{x:ML,y:infoY,size:8,font:bold,color:palette.muted})
  page.drawText(guestName||'—',{x:ML,y:infoY-17,size:13,font:bold,color:darkInk,maxWidth:215})
  let lY=infoY-33
  if(guestEmail){page.drawText(guestEmail,{x:ML,y:lY,size:10,font,color:palette.ink,maxWidth:215});lY-=14}
  if(guestPhone){page.drawText(guestPhone,{x:ML,y:lY,size:10,font,color:palette.ink,maxWidth:215});lY-=14}

  // Right — Booking Details
  page.drawText('BOOKING DETAILS',{x:col2X,y:infoY,size:8,font:bold,color:palette.muted})
  const detailRows=[['Reference',normalizeText(booking.reference)],['Service',serviceName],['Tour Date',preferredDate],['Guests',paxLabel],['Status',bookingStatus],['Payment',paymentStatus]]
  let rY=infoY-17
  for(const [lbl,val] of detailRows){
    page.drawText(`${lbl}:`,{x:col2X,y:rY,size:9,font:bold,color:palette.muted,maxWidth:108})
    page.drawText(val,{x:col2X+118,y:rY,size:10,font,color:darkInk,maxWidth:148})
    rY-=16
  }

  // ── LINE ITEMS TABLE ──────────────────────────────────────────────────────
  const tblTopY=Math.min(lY,rY)-16
  page.drawLine({start:{x:ML,y:tblTopY+4},end:{x:W-ML,y:tblTopY+4},thickness:0.5,color:midGray})
  const tblY=tblTopY-14
  const colPax=ML+338,colAmt=ML+428

  // Header
  page.drawRectangle({x:ML,y:tblY-20,width:usable,height:28,color:darkInk})
  page.drawText('DESCRIPTION',{x:ML+12,y:tblY-8,size:9,font:bold,color:white})
  page.drawText('GUESTS',{x:colPax,y:tblY-8,size:9,font:bold,color:white})
  page.drawText('AMOUNT',{x:colAmt,y:tblY-8,size:9,font:bold,color:white})

  // Service row
  const svcY=tblY-46
  page.drawRectangle({x:ML,y:svcY-10,width:usable,height:28,color:lightGray})
  page.drawText(serviceName,{x:ML+12,y:svcY+4,size:11,font,color:darkInk,maxWidth:295})
  page.drawText(String(pax),{x:colPax,y:svcY+4,size:11,font,color:darkInk})
  page.drawText(fmtAmt(totalAmount),{x:colAmt,y:svcY+4,size:11,font:bold,color:darkInk,maxWidth:95})

  // Discount row
  let afterTbl=svcY-24
  const discountAmount=Number(context.discount_amount||0)
  if(discountAmount>0){
    page.drawText('Discount',{x:ML+12,y:afterTbl-4,size:10,font,color:palette.muted})
    page.drawText(`-${fmtAmt(discountAmount)}`,{x:colAmt,y:afterTbl-4,size:10,font,color:palette.muted,maxWidth:95})
    afterTbl-=20
  }

  // Total row
  page.drawLine({start:{x:ML,y:afterTbl+10},end:{x:W-ML,y:afterTbl+10},thickness:1,color:palette.accent})
  page.drawRectangle({x:ML,y:afterTbl-18,width:usable,height:28,color:palette.accentSoft})
  page.drawText('INVOICE TOTAL',{x:ML+12,y:afterTbl-4,size:10,font:bold,color:palette.ink})
  page.drawText(fmtAmt(totalAmount),{x:colAmt,y:afterTbl-4,size:13,font:bold,color:palette.accent,maxWidth:95})

  // ── BALANCE SECTION ───────────────────────────────────────────────────────
  const balY=afterTbl-50
  page.drawLine({start:{x:col2X,y:balY+30},end:{x:W-ML,y:balY+30},thickness:0.5,color:midGray})
  page.drawText('Payments Received',{x:col2X,y:balY+14,size:10,font,color:palette.muted})
  page.drawText(fmtAmt(paymentsReceived),{x:W-ML-98,y:balY+14,size:10,font,color:palette.muted,maxWidth:94})
  page.drawText('Balance Due',{x:col2X,y:balY,size:12,font:bold,color:darkInk})
  page.drawText(fmtAmt(balanceAmount),{x:W-ML-98,y:balY,size:13,font:bold,color:palette.accent,maxWidth:94})

  // ── PAYMENT INSTRUCTIONS BOX ──────────────────────────────────────────────
  const noteY=balY-46
  const bankingNote=normalizeText(brandProfile.document_banking_line)||'Banking details will be provided by your reservations consultant. Please quote your booking reference when making payment.'
  page.drawRectangle({x:ML,y:noteY-32,width:usable,height:50,color:lightGray})
  page.drawText('Payment Instructions',{x:ML+12,y:noteY+4,size:9,font:bold,color:palette.muted})
  page.drawText(bankingNote,{x:ML+12,y:noteY-10,size:9,font,color:palette.muted,maxWidth:usable-24})

  // Custom field notes (if any)
  const extraNotes=normalizeText(context.notes)
  if(extraNotes){
    const noteLines=extraNotes.split('\n').filter(Boolean)
    let ny=noteY-58
    for(const line of noteLines){
      page.drawText(line,{x:ML,y:ny,size:9,font,color:palette.muted,maxWidth:usable})
      ny-=14
    }
  }

  // ── FOOTER BAR ────────────────────────────────────────────────────────────
  page.drawRectangle({x:0,y:0,width:W,height:40,color:palette.accent})
  const supportLine=normalizeText(brandProfile.document_support_line||brandProfile.support_email||'')
  const websiteUrl=normalizeText(brandProfile.website_url)
  const locationLine=normalizeText(brandProfile.document_footer)
  const footerText=[supportLine,websiteUrl,locationLine].filter(Boolean).join('  ·  ')
  if(footerText)page.drawText(footerText,{x:ML,y:14,size:9,font,color:rgb(0.95,0.97,0.99),maxWidth:usable})

  return new Uint8Array(await pdf.save())
}

const fetchBookingDocumentContext=async(bookingId:string)=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,payment_status,preferred_date,total_amount,currency_code,customer_id,service_id,quantity,adult_quantity,child_quantity,infant_quantity,amount_due_now,amount_due_later,metadata,customers(full_name,email,phone),services(name,slug)')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)throw new Error('Booking not found.')
  const brand=await getBrandByCode(normalizeText(booking.brand_code) || 'true-travel')
  const bookingMetadata=normalizeJsonRecord(booking.metadata)
  const customerSnapshot=normalizeJsonRecord(bookingMetadata.customer_snapshot)
  return {
    booking,
    brand,
    customer_name:normalizeText(customerSnapshot.full_name) || normalizeText((booking.customers as Json | null)?.full_name),
    customer_email:normalizeText(customerSnapshot.email) || normalizeText((booking.customers as Json | null)?.email),
    customer_phone:normalizeText(customerSnapshot.phone) || normalizeText((booking.customers as Json | null)?.phone),
    service_name:normalizeText((booking.services as Json | null)?.name)
  }
}

const createStoredBookingDocument=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  if(!bookingId)throw new Error('Booking is required to generate a stored document.')
  const { booking, brand, customer_name, customer_email, service_name }=await fetchBookingDocumentContext(bookingId)
  const documentType=normalizeText(payload.document_type) || 'guest_invoice'
  const existingDocument=await safeMaybeSingle<Json>(
    adminClient
      .from('booking_documents')
      .select('*')
      .eq('booking_id',bookingId)
      .eq('document_type',documentType)
      .order('generated_at',{ascending:false})
      .limit(1)
      .maybeSingle()
  )
  const documentTitle=normalizeText(payload.title) || `${normalizeText(brand.name)} ${displayLabel(documentType)}`
  let linkedInvoice:Json | null=null
  if(documentType==='guest_invoice'){
    await syncInvoiceForBooking(bookingId)
    linkedInvoice=await safeMaybeSingle<Json>(adminClient.from('invoices').select('*').eq('booking_id',bookingId).maybeSingle())
  }
  const documentNumber=normalizeText(payload.document_number) || normalizeText(linkedInvoice?.invoice_number) || `${documentType.slice(0,3).toUpperCase()}-${normalizeText(booking.reference)}`
  const bookingDocument=existingDocument?.id
    ? await safeMaybeSingle<Json>(
        adminClient
          .from('booking_documents')
            .update({
              title:documentTitle,
              document_number:documentNumber,
              status:'generated',
              generated_at:nowIso(),
              metadata:{ ...(existingDocument.metadata || {}), generated_in:'skybook-storage', brand_code:normalizeText(brand.code || booking.brand_code) }
            })
          .eq('id',existingDocument.id)
          .select()
          .single()
      )
    : await safeMaybeSingle<Json>(
        adminClient
          .from('booking_documents')
          .insert({
            booking_id:bookingId,
            document_type:documentType,
              title:documentTitle,
              document_number:documentNumber,
              status:'generated',
              generated_at:nowIso(),
              metadata:{ generated_in:'skybook-storage', brand_code:normalizeText(brand.code || booking.brand_code) },
              created_by:safeUuid(userId)
            })
          .select()
          .single()
      )
  if(!bookingDocument?.id)throw new Error('Unable to create booking document record.')
  const existingVersions=await safeTableSelect<Json>(
    adminClient.from('booking_document_versions').select('id,version_number').eq('booking_document_id',String(bookingDocument.id)).order('version_number',{ascending:false}),
    []
  )
  const nextVersion=(Number(existingVersions[0]?.version_number || 0) + 1)
  const fileName=`${normalizeText(booking.reference).replace(/[^A-Z0-9-]/gi,'').toUpperCase()}-${documentType}-v${String(nextVersion).padStart(2,'0')}.pdf`
  const storagePath=`bookings/${bookingId}/${documentType}/v${nextVersion}/${fileName}`
  const bookingMetadata=normalizeJsonRecord(booking.metadata)
  const payloadMetadata=normalizeJsonRecord(payload.metadata)
  const customValues=normalizeJsonRecord(bookingMetadata.custom_fields)
  const customFieldLines=(await getBookingFormFields(normalizeText(brand.code || booking.brand_code),{publicOnly:true}))
    .map(field=>{
      const value=customValues[field.id as string]
      if(value===undefined||value===''||value===false)return ''
      return `${field.label}: ${value===true ? 'Yes' : value}`
    })
    .filter(Boolean)
  const invoiceTotal=Number(linkedInvoice?.total_amount || booking.total_amount || 0)
  const invoiceBalance=Number(linkedInvoice?.balance_amount ?? (Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0)))
  const paymentsReceived=Math.max(0,invoiceTotal-invoiceBalance)
  const { customer_phone }=await fetchBookingDocumentContext(bookingId)
  const pdfBytes=await buildDocumentPdfBytes(booking,documentType,{
    brand_code:normalizeText(brand.code || booking.brand_code) || 'true-travel',
    brand,
    brand_name:normalizeText(brand.name),
    customer_name,
    customer_email,
    customer_phone,
    service_name,
    document_number:documentNumber,
    invoice_total:invoiceTotal,
    balance_amount:invoiceBalance,
    payments_received:paymentsReceived,
    summary:normalizeText(payload.summary) || `${displayLabel(documentType)} prepared for ${normalizeText(brand.name)} booking operations.`,
    notes:[
      normalizeText(payload.notes) || normalizeText(payloadMetadata.notes),
      ...customFieldLines
    ].filter(Boolean).join('\n')
  })
  const uploadResult=await adminClient.storage.from(DOCUMENT_BUCKET).upload(storagePath,pdfBytes,{
    contentType:'application/pdf',
    upsert:true
  })
  if(uploadResult.error){
    await recordHealthEvent({
      event_type:'document_storage',
      severity:'critical',
      source:'booking-api',
      summary:'Document upload failed',
      detail:String(uploadResult.error.message || 'Unable to store generated PDF.'),
      related_booking_id:bookingId,
      metadata:{ document_type:documentType, storage_path:storagePath }
    })
    throw new Error(String(uploadResult.error.message || 'Unable to store generated PDF document.'))
  }
  const checksum=await checksumBytes(pdfBytes)
  const version=await safeMaybeSingle<Json>(
    adminClient
      .from('booking_document_versions')
        .insert({
          booking_document_id:String(bookingDocument.id),
          booking_id:bookingId,
          version_number:nextVersion,
          file_name:fileName,
        storage_bucket:DOCUMENT_BUCKET,
        storage_path:storagePath,
        mime_type:'application/pdf',
        byte_size:pdfBytes.byteLength,
        checksum,
          metadata:{ ...(typeof payload.metadata==='object' && payload.metadata ? payload.metadata : {}), generated_in:'skybook-storage', brand_code:normalizeText(brand.code || booking.brand_code) },
          created_by:safeUuid(userId)
        })
      .select()
      .single()
  )
  const signedUrl=await createSignedDocumentUrl(DOCUMENT_BUCKET,storagePath)
  await adminClient.from('booking_documents').update({
    public_url:signedUrl,
    updated_at:nowIso(),
    metadata:{ ...(bookingDocument.metadata || {}), latest_storage_path:storagePath, latest_version_number:nextVersion }
  }).eq('id',bookingDocument.id)
  return {
    success:true,
    document:bookingDocument,
    version:{ ...version, signed_url:signedUrl }
  }
}

const getDocumentVersionSignedUrl=async(versionId:string)=>{
  const version=await safeMaybeSingle<Json>(adminClient.from('booking_document_versions').select('*').eq('id',versionId).maybeSingle())
  if(!version)throw new Error('Document version not found.')
  return {
    success:true,
    version:{ ...version, signed_url:await createSignedDocumentUrl(normalizeText(version.storage_bucket) || DOCUMENT_BUCKET,normalizeText(version.storage_path)) }
  }
}

const createPortalAccessSession=async(bookingId:string,userId:string | null,request:Request)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('id,brand_code,customer_id').eq('id',bookingId).maybeSingle())
  if(!booking?.customer_id)throw new Error('Booking not found.')
  const portalSettings=await getSettingValue('portal',{
    enabled:true,
    allowBookingLookup:true,
    allowSelfServiceRequests:true,
    allowDocumentDownloads:true,
    sessionDurationHours:72,
    portalBaseUrl:'/portal.html'
  })
  const rawToken=generatePortalToken()
  const tokenHash=await hashToken(rawToken)
  const expiresAt=addHours(new Date(),Number((portalSettings as Json).sessionDurationHours || 72))
  const { data:session,error }=await adminClient.from('customer_portal_sessions').insert({
    booking_id:bookingId,
    customer_id:booking.customer_id,
    brand_code:normalizeText(booking.brand_code) || 'true-travel',
    purpose:'portal_access',
    status:'active',
    token_hash:tokenHash,
    expires_at:expiresAt,
    issued_by:safeUuid(userId),
    metadata:{ created_from:'skybook-admin' }
  }).select().single()
  if(error)throw error
  const origin=new URL(request.url)
  const configuredPath=normalizeText((portalSettings as Json).portalBaseUrl) || '/portal.html'
  const portalBase=configuredPath.startsWith('http')
    ? configuredPath
    : `${origin.protocol}//${origin.host}${configuredPath.startsWith('/') ? configuredPath : `/${configuredPath}`}`
  const url=`${portalBase}${portalBase.includes('?') ? '&' : '?'}token=${encodeURIComponent(rawToken)}`
  return { success:true, portal_session:session, portal_url:url }
}

const resolvePortalSessionContext=async(rawToken:string)=>{
  const tokenHash=await hashToken(rawToken)
  const session=await safeMaybeSingle<Json>(
    adminClient
      .from('customer_portal_sessions')
      .select('*')
      .eq('token_hash',tokenHash)
      .in('status',['active','used'])
      .maybeSingle()
  )
  if(!session)throw new Error('Portal link is invalid or has expired.')
  const expiresAt=parseDateValue(normalizeText(session.expires_at))
  if(!expiresAt || expiresAt < new Date()){
    await adminClient.from('customer_portal_sessions').update({ status:'expired' }).eq('id',session.id)
    throw new Error('Portal link has expired.')
  }
  const accessedAt=nowIso()
  const nextStatus=normalizeText(session.status)==='active' ? 'used' : normalizeText(session.status) || 'used'
  await adminClient.from('customer_portal_sessions').update({
    last_accessed_at:accessedAt,
    status:nextStatus
  }).eq('id',session.id)
  const resolvedSession={...session,last_accessed_at:accessedAt,status:nextStatus}
  const bookingContext=await fetchBookingDocumentContext(String(session.booking_id))
  const requests=await safeTableSelect<Json>(adminClient.from('booking_portal_requests').select('*').eq('booking_id',String(session.booking_id)).order('created_at',{ascending:false}),[])
  const documents=await safeTableSelect<Json>(adminClient.from('booking_documents').select('*').eq('booking_id',String(session.booking_id)).order('generated_at',{ascending:false}),[])
  const versions=await safeTableSelect<Json>(adminClient.from('booking_document_versions').select('*').eq('booking_id',String(session.booking_id)).order('created_at',{ascending:false}),[])
  const documentsWithLinks=await Promise.all(versions.map(async version=>({
    ...version,
    signed_url:await createSignedDocumentUrl(normalizeText(version.storage_bucket) || DOCUMENT_BUCKET,normalizeText(version.storage_path))
  })))
  return {
    success:true,
    portal_session:resolvedSession,
    booking:{
      id:bookingContext.booking.id,
      reference:bookingContext.booking.reference,
      brand_code:bookingContext.booking.brand_code,
      status:bookingContext.booking.status,
      payment_status:bookingContext.booking.payment_status,
      preferred_date:bookingContext.booking.preferred_date,
      total_amount:bookingContext.booking.total_amount,
      currency_code:bookingContext.booking.currency_code,
      customer_name:bookingContext.customer_name,
      customer_email:bookingContext.customer_email,
      service_name:bookingContext.service_name,
      quantity:bookingContext.booking.quantity
    },
    portal_requests:requests,
    booking_documents:documents,
    document_versions:documentsWithLinks
  }
}

const createPortalSelfServiceRequest=async(rawToken:string,payload:Json)=>{
  const portalContext=await resolvePortalSessionContext(rawToken)
  const bookingId=String((portalContext.portal_session as Json).booking_id || '')
  if(!bookingId)throw new Error('Portal session is invalid.')
  let attachmentUrl=null
  const fileName=normalizeText(payload.file_name)
  const fileBase64=normalizeText(payload.file_content_base64)
  if(fileName && fileBase64){
    const cleanBase64=fileBase64.includes(',') ? fileBase64.split(',').pop() || '' : fileBase64
    const fileBytes=Uint8Array.from(atob(cleanBase64),char=>char.charCodeAt(0))
    const uploadPath=`portal-uploads/${bookingId}/${Date.now()}-${fileName.replace(/[^a-zA-Z0-9._-]/g,'-')}`
    const upload=await adminClient.storage.from(DOCUMENT_BUCKET).upload(uploadPath,fileBytes,{
      contentType:normalizeText(payload.mime_type) || 'application/octet-stream',
      upsert:true
    })
    if(upload.error)throw new Error(String(upload.error.message || 'Upload failed.'))
    attachmentUrl=uploadPath
  }
  return createPortalRequest({
    booking_id:bookingId,
    request_type:normalizeText(payload.request_type) || 'request_change',
    message:normalizeText(payload.message) || 'Portal request submitted by guest.',
    attachment_url:attachmentUrl,
    metadata:{
      created_from:'customer-portal',
      guest_email:(portalContext.booking as Json).customer_email || '',
      requested_date:normalizeText(payload.requested_date) || null
    }
  },'')
}

const syncReconciliationRecordForBooking=async(bookingId:string,userId:string | null='')=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)return null
  const invoice=await safeMaybeSingle<Json>(adminClient.from('invoices').select('*').eq('booking_id',bookingId).maybeSingle())
  const payment=await safeMaybeSingle<Json>(adminClient.from('payments').select('*').eq('booking_id',bookingId).maybeSingle())
  const officeInvoices=await safeTableSelect<Json>(adminClient.from('office_invoices').select('*').eq('booking_id',bookingId),[])
  const refunds=await safeTableSelect<Json>(adminClient.from('refunds').select('*').eq('booking_id',bookingId),[])
  const guestOutstanding=Math.max(0,Number(invoice?.balance_amount || 0))
  const guestPaid=Math.max(0,Number(payment?.amount_received || payment?.amount || 0))
  const refundAmount=refunds.reduce((sum,refund)=>sum+Number(refund.amount || 0),0)
  const officePayables=officeInvoices.filter(item=>!['cancelled','paid','settled'].includes(normalizeText(item.status))).reduce((sum,item)=>sum+Number(item.total_amount || 0),0)
  const mismatchAmount=Number(Math.max(0,guestOutstanding + officePayables + refundAmount).toFixed(2))
  const status=mismatchAmount===0
    ? 'matched'
    : guestOutstanding>0 || officePayables>0
      ? 'open'
      : 'needs_review'
  const summary=[
    guestOutstanding>0 ? `Guest balance ${guestOutstanding.toFixed(2)} outstanding` : 'Guest fully reconciled',
    officePayables>0 ? `Office payables ${officePayables.toFixed(2)} pending` : 'No pending operator payout',
    refundAmount>0 ? `Refunds ${refundAmount.toFixed(2)} logged` : 'No refunds logged'
  ].join(' · ')
  const existing=await safeMaybeSingle<Json>(adminClient.from('reconciliation_records').select('*').eq('booking_id',bookingId).eq('reconciliation_type','booking_finance').maybeSingle())
  const row={
    booking_id:bookingId,
    invoice_id:safeUuid(invoice?.id),
    office_invoice_id:safeUuid(officeInvoices[0]?.id),
    payment_id:safeUuid(payment?.id),
    refund_id:safeUuid(refunds[0]?.id),
    reconciliation_type:'booking_finance',
    assigned_team:'finance',
    status,
    mismatch_amount:mismatchAmount,
    summary,
    metadata:{
      booking_total:Number(booking.total_amount || 0),
      guest_paid:guestPaid,
      guest_outstanding:guestOutstanding,
      office_payables:officePayables,
      refund_amount:refundAmount
    },
    last_checked_at:nowIso(),
    last_checked_by:safeUuid(userId)
  }
  const result=existing?.id
    ? await safeMaybeSingle<Json>(adminClient.from('reconciliation_records').update(row).eq('id',existing.id).select().single())
    : await safeMaybeSingle<Json>(adminClient.from('reconciliation_records').insert(row).select().single())
  return result
}

const syncAllReconciliationRecords=async(userId:string | null='')=>{
  const bookings=await safeTableSelect<Json>(adminClient.from('bookings').select('id').order('created_at',{ascending:false}).limit(250),[])
  for(const booking of bookings){
    await syncReconciliationRecordForBooking(String(booking.id || ''),userId)
  }
}

const updateReconciliationRecord=async(recordId:string,payload:Json,userId:string)=>{
  const updatePayload:Json={
    last_checked_at:nowIso(),
    last_checked_by:safeUuid(userId)
  }
  if(Object.prototype.hasOwnProperty.call(payload,'status'))updatePayload.status=normalizeText(payload.status)
  if(Object.prototype.hasOwnProperty.call(payload,'notes'))updatePayload.notes=normalizeText(payload.notes)
  if(Object.prototype.hasOwnProperty.call(payload,'summary'))updatePayload.summary=normalizeText(payload.summary)
  const record=await safeMaybeSingle<Json>(adminClient.from('reconciliation_records').update(updatePayload).eq('id',recordId).select().single())
  if(!record)throw new Error('Reconciliation record not found.')
  return { success:true, reconciliation_record:record }
}

const searchAdminEntities=(payload:{
  query:string
  bookings:Json[]
  customers:Json[]
  invoices:Json[]
  officeInvoices:Json[]
  operators:Json[]
}):SearchResult[]=>{
  const query=normalizeText(payload.query).toLowerCase()
  if(!query)return []
  const take=<T>(rows:T[],mapper:(row:T)=>SearchResult)=>rows.slice(0,8).map(mapper)
  return [
    ...take(payload.bookings.filter(item=>[
      item.reference,item.customer_name,item.customer_email,item.service_name
    ].join(' ').toLowerCase().includes(query)),item=>({
      kind:'booking',
      id:String(item.id || ''),
      label:String(item.reference || ''),
      meta:`${String(item.customer_name || '')} · ${String(item.service_name || '')}`,
      action:'bookings',
      booking_id:String(item.id || '')
    })),
    ...take(payload.customers.filter(item=>[
      item.full_name,item.email,item.phone
    ].join(' ').toLowerCase().includes(query)),item=>({
      kind:'customer',
      id:String(item.id || ''),
      label:String(item.full_name || item.email || ''),
      meta:String(item.email || item.phone || ''),
      action:'customers'
    })),
    ...take(payload.invoices.filter(item=>[
      item.invoice_number,item.status
    ].join(' ').toLowerCase().includes(query)),item=>({
      kind:'guest_invoice',
      id:String(item.id || ''),
      label:String(item.invoice_number || ''),
      meta:`${String(item.status || '')} · ${Number(item.total_amount || 0).toFixed(2)}`,
      action:'reports',
      booking_id:String(item.booking_id || '')
    })),
    ...take(payload.officeInvoices.filter(item=>[
      item.invoice_number,item.invoice_type,item.status
    ].join(' ').toLowerCase().includes(query)),item=>({
      kind:'office_invoice',
      id:String(item.id || ''),
      label:String(item.invoice_number || ''),
      meta:`${String(item.invoice_type || '')} · ${Number(item.total_amount || 0).toFixed(2)}`,
      action:'reconciliation',
      booking_id:String(item.booking_id || '')
    })),
    ...take(payload.operators.filter(item=>[
      item.company_name,item.code,item.contact_name,item.email
    ].join(' ').toLowerCase().includes(query)),item=>({
      kind:'operator',
      id:String(item.id || ''),
      label:String(item.company_name || ''),
      meta:String(item.code || item.email || ''),
      action:'platform'
    })),
    ...[
      { label:'Open reconciliation center', meta:'Finance workflow', action:'reconciliation' },
      { label:'Open system health', meta:'Jobs, emails, webhooks, callbacks', action:'health' },
      { label:'Open command center', meta:'Daily operations dashboard', action:'dashboard' }
    ].filter(item=>item.label.toLowerCase().includes(query) || item.meta.toLowerCase().includes(query)).map(item=>({
      kind:'shortcut',
      id:item.action,
      label:item.label,
      meta:item.meta,
      action:item.action
    }))
  ].slice(0,20)
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
    const username=resolveAuthUsername(user as unknown as Json)
    return {
      id:user.id,
      username,
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
    return String(left.username).localeCompare(String(right.username))
  })
}

const upsertSkybookAdminUser=async(payload:Json)=>{
  const requestedRole=normalizeText(payload.role).toLowerCase() || 'booking_agent'
  if(!(requestedRole in SKYBOOK_ROLE_DEFAULTS))throw new Error('Invalid admin role.')
  const requestedId=normalizeText(payload.id)
  const requestedUsername=normalizeUsername(payload.username)
  const requestedPassword=normalizeText(payload.password)
  if(!requestedUsername)throw new Error('Username is required.')
  const authUsers=await listAllAuthUsers()
  const existingByUsername=authUsers.find(user=>resolveAuthUsername(user as unknown as Json)===requestedUsername)
  if(existingByUsername && requestedId && existingByUsername.id!==requestedId){
    throw new Error('That username is already in use.')
  }
  let authUser=authUsers.find(user=>requestedId ? user.id===requestedId : resolveAuthUsername(user as unknown as Json)===requestedUsername)
  if(!authUser && !requestedPassword)throw new Error('Password is required when creating a new admin user.')
  if(!authUser){
    const syntheticEmail=createInternalAdminEmail(requestedUsername)
    const { data,error }=await adminClient.auth.admin.createUser({
      email:syntheticEmail,
      password:requestedPassword,
      email_confirm:true,
      user_metadata:{
        username:requestedUsername,
        full_name:normalizeText(payload.full_name) || requestedUsername
      }
    })
    if(error || !data?.user)throw new Error(String(error?.message || 'Unable to create admin credentials.'))
    authUser=data.user
  }else{
    const authUpdatePayload:Record<string,unknown>={
      user_metadata:{
        ...(authUser.user_metadata||{}),
        username:requestedUsername,
        full_name:normalizeText(payload.full_name) || normalizeText(authUser.user_metadata?.full_name) || normalizeText(authUser.email)
      }
    }
    if(requestedPassword)authUpdatePayload.password=requestedPassword
    const { error }=await adminClient.auth.admin.updateUserById(authUser.id,authUpdatePayload)
    if(error)throw new Error(String(error.message || 'Unable to update admin credentials.'))
  }
  const fullName=normalizeText(payload.full_name) || normalizeText(authUser.user_metadata?.full_name) || requestedUsername
  const isNewUser=!authUsers.find(user=>requestedId ? user.id===requestedId : resolveAuthUsername(user as unknown as Json)===requestedUsername) || !requestedId && !authUsers.find(user=>resolveAuthUsername(user as unknown as Json)===requestedUsername)
  const row={
    id:authUser.id,
    full_name:fullName,
    role:requestedRole,
    is_active:payload.is_active!==false,
    permissions:sanitizePermissionMap(payload.permissions),
    ...(isNewUser ? {must_change_password:true} : {})
  }
  const { error }=await adminClient.from('app_users').upsert(row,{onConflict:'id'})
  if(error)throw new Error(String(error.message || 'Unable to save admin user.'))
  return { success:true, admin_user:row }
}

const loginAdminWithUsername=async(payload:Json)=>{
  const username=normalizeUsername(payload.username)
  const password=normalizeText(payload.password)
  if(!username || !password)throw new Error('Username and password are required.')
  const authUsers=await listAllAuthUsers()
  const authUser=authUsers.find(user=>resolveAuthUsername(user as unknown as Json)===username)
  if(!authUser?.email)throw new Error('Invalid username or password.')
  const authBrowser=createClient(supabaseUrl,supabaseAnonKey,{auth:{persistSession:false}})
  const { data,error }=await authBrowser.auth.signInWithPassword({
    email:normalizeText(authUser.email),
    password
  })
  if(error || !data?.session)throw new Error('Invalid username or password.')
  const { data:appUser }=await adminClient.from('app_users').select('must_change_password').eq('id',authUser.id).maybeSingle()
  return { session:data.session, user:data.user, must_change_password:Boolean(appUser?.must_change_password) }
}

const normalizeDiscountAmount=(total:number,discountType:string,discountValue:number)=>{
  if(discountType==='fixed')return Number(Math.min(total,discountValue).toFixed(2))
  return Number(Math.min(total,total*(discountValue/100)).toFixed(2))
}

const normalizeInvoicePrefix=(value:unknown,fallback='SB')=>{
  const normalized=normalizeText(value).replace(/[^A-Z0-9]/gi,'').toUpperCase()
  return normalized || fallback
}

const reserveInvoiceNumber=async(scope:'guest_invoice' | 'office_invoice',brandCode:string,prefix:string,bookingId='')=>{
  const preferredPrefix=normalizeInvoicePrefix(prefix,scope==='office_invoice' ? 'OFF' : 'INV')
  const { data,error }=await adminClient.rpc('reserve_invoice_number',{
    p_invoice_scope:scope,
    p_brand_code:normalizeText(brandCode) || 'true-travel',
    p_preferred_prefix:preferredPrefix,
    p_booking_id:safeUuid(bookingId)
  })
  if(!error&&normalizeText(data))return normalizeText(data)
  if(error&&!['42883','PGRST202','PGRST205'].includes(String(error.code || '')))throw error
  return `${preferredPrefix}-${scope==='office_invoice' ? 'OFF' : 'INV'}-${new Date().toISOString().slice(0,10).replace(/-/g,'')}-${crypto.randomUUID().slice(0,8).toUpperCase()}`
}

const isSafeMediaUrl=(url:string)=>/^https?:\/\//i.test(url)
const normalizeServiceMedia=(value:unknown,serviceName='')=>{
  if(!Array.isArray(value))return []
  return value.map((item,index)=>{
    if(typeof item==='string'){
      const url=normalizeText(item)
      if(!url||!isSafeMediaUrl(url))return null
      return {
        url,
        alt:serviceName ? `${serviceName} image ${index+1}` : '',
        caption:''
      }
    }
    if(!item || typeof item!=='object' || Array.isArray(item))return null
    const media=normalizeJsonRecord(item)
    const url=normalizeText(media.url || media.src)
    if(!url||!isSafeMediaUrl(url))return null
    return {
      url,
      alt:normalizeText(media.alt || media.label || (serviceName ? `${serviceName} image ${index+1}` : '')),
      caption:normalizeText(media.caption)
    }
  }).filter(item=>Boolean(item?.url))
}

const fetchServices=async({slug='',includeInactive=false,brandCode=''}:{slug?:string,includeInactive?:boolean,brandCode?:string}={})=>{
  let query=adminClient
    .from('services')
    .select('id,slug,name,short_description,full_description,duration_label,unit_label,preferred_date_mode,base_price,adult_price,child_price,currency_code,is_active,requires_manual_confirmation,payment_mode,deposit_type,deposit_value,metadata,media')
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
    adult_price:service.adult_price!=null ? Number(service.adult_price) : null,
    child_price:service.child_price!=null ? Number(service.child_price) : null,
    currency:service.currency_code||'NAD',
    is_active:service.is_active,
    requires_manual_confirmation:service.requires_manual_confirmation,
    payment_mode:service.payment_mode,
    deposit_type:service.deposit_type,
    deposit_value:Number(service.deposit_value||0),
    media_url:Array.isArray(service.media)&&service.media.length ? String(service.media[0]?.url||'') : '',
    media_gallery:normalizeServiceMedia(service.media,service.name),
    is_quote_only:Boolean(service.metadata?.is_quote_only),
    highlight_points:Array.isArray(service.metadata?.highlight_points) ? service.metadata.highlight_points : [],
    brand_codes:Array.isArray(service.metadata?.brand_codes) ? service.metadata.brand_codes : [],
    minimum_pax:Math.max(1,Number(service.metadata?.minimum_pax||1)||1),
    departure_window:normalizeText(service.metadata?.departure_window),
    pickup_time:normalizeText(service.metadata?.pickup_time),
    departure_times:Array.isArray(service.metadata?.departure_times)
      ? (service.metadata.departure_times as Array<{label?:string,time?:string,pickup_time?:string}|string>).map(item=>
          typeof item==='object' && item!==null
            ? {label:normalizeText(item.label),time:normalizeText(item.time),pickup_time:normalizeText(item.pickup_time)}
            : {label:normalizeText(item as string),time:'',pickup_time:''}
        ).filter(item=>item.label||item.time)
      : [],
    addons:[]
  }))
}

const getServiceBySlug=async(slug:string,includeInactive=false,brandCode='')=>{
  const services=await fetchServices({slug,includeInactive,brandCode})
  if(!services.length)throw new Error('Service not found.')
  return services[0]
}

const calculatePricing=(service:Json,payload:Json,settings:Json,discountAmount=0)=>{
  const minimumPax=Math.max(1,Number(service.minimum_pax||1)||1)
  const adultQty=Math.max(0,Number(payload.adult_quantity||0)||0)
  const childQty=Math.max(0,Number(payload.child_quantity||0)||0)
  const splitQty=adultQty+childQty
  const quantity=splitQty>0 ? Math.max(minimumPax,splitQty) : Math.max(minimumPax,Number(payload.quantity||minimumPax)||minimumPax)
  const basePrice=Number(service.base_price||0)
  const adultPrice=service.adult_price!=null ? Number(service.adult_price) : null
  const childPrice=service.child_price!=null ? Number(service.child_price) : null
  // When the service carries adult/child pricing, total = adults×adult_price + children×child_price.
  // Otherwise fall back to the flat base_price × quantity. This mirrors booking-shared.js so the
  // saved total matches the admin price preview and the public booking page.
  const hasAdultChildPricing=adultPrice!=null && adultPrice>0
  const subtotal=hasAdultChildPricing && splitQty>0
    ? Number(((adultQty*(adultPrice||0))+(childQty*(childPrice||0))).toFixed(2))
    : Number((basePrice*quantity).toFixed(2))
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
    adultQuantity:adultQty,
    childQuantity:childQty,
    adultPrice:hasAdultChildPricing ? adultPrice : null,
    childPrice:hasAdultChildPricing ? (childPrice||0) : null,
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
  const isAdmin=payload.admin_created===true
  const errors:string[]=[]
  const minimumPax=Math.max(1,Number(service.minimum_pax||1)||1)
  if(!normalizeText(payload.service_slug))errors.push('Service is required.')
  if(!isAdmin&&!normalizeText(customer.full_name))errors.push('Customer full name is required.')
  if(!isAdmin){
    if(!normalizeText(customer.email)||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeText(customer.email)))errors.push('Valid customer email is required.')
    if(!normalizeText(customer.phone))errors.push('Phone or WhatsApp is required.')
  }else{
    const email=normalizeText(customer.email)
    if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email))errors.push('Enter a valid email address.')
  }
  if(!isAdmin && Number(payload.quantity||0)<minimumPax)errors.push(`Quantity must be at least ${minimumPax}.`)
  if(String(service.preferred_date_mode)==='required'&&!normalizeText(payload.preferred_date))errors.push('Preferred date is required for this service.')
  if(payload.accept_terms!==true && !isAdmin)errors.push('Terms acceptance is required.')
  if(errors.length)throw new Error(errors[0])
}

const normalizeJsonRecord=(value:unknown):Json=>{
  if(value && typeof value==='object' && !Array.isArray(value))return value as Json
  return {}
}

const mergeNormalizedTextSet=(...values:unknown[])=>Array.from(new Set(
  values.flatMap(value=>Array.isArray(value) ? value : [value]).map(item=>normalizeText(item)).filter(Boolean)
))

const buildCustomerMetadata=(existingMetadata:Json,context:{
  brandCode?:string
  bookingSource?:string
  sourcePage?:string
  createdVia?:string
  notes?:string
})=>{
  const brandCode=normalizeText(context.brandCode)
  const bookingSource=normalizeText(context.bookingSource)
  const sourcePage=normalizeText(context.sourcePage)
  const createdVia=normalizeText(context.createdVia)
  const notes=normalizeText(context.notes)
  return {
    ...existingMetadata,
    last_booking_at:nowIso(),
    first_brand_code:normalizeText(existingMetadata.first_brand_code) || brandCode,
    last_brand_code:brandCode || normalizeText(existingMetadata.last_brand_code),
    last_booking_source:bookingSource || normalizeText(existingMetadata.last_booking_source),
    latest_source_page:sourcePage || normalizeText(existingMetadata.latest_source_page),
    latest_created_via:createdVia || normalizeText(existingMetadata.latest_created_via),
    latest_customer_note:notes || normalizeText(existingMetadata.latest_customer_note),
    brand_codes:mergeNormalizedTextSet(existingMetadata.brand_codes,brandCode),
    booking_sources:mergeNormalizedTextSet(existingMetadata.booking_sources,bookingSource)
  }
}

const buildBookingCustomerSnapshot=(customer:Json={})=>({
  full_name:normalizeText(customer.full_name),
  email:normalizeText(customer.email),
  phone:normalizeText(customer.phone),
  whatsapp:normalizeText(customer.whatsapp)||normalizeText(customer.phone),
  snapshot_at:nowIso()
})

const upsertCustomer=async(customer:Json,context:{
  brandCode?:string
  bookingSource?:string
  sourcePage?:string
  createdVia?:string
  notes?:string
  preserveExistingIdentity?:boolean
}={})=>{
  const rawEmail=normalizeText(customer.email).toLowerCase()
  const email=rawEmail||`noemail-${crypto.randomUUID()}@skybook.placeholder`
  const { data:existing }=await adminClient.from('customers').select('*').ilike('email',rawEmail?email:'').maybeSingle()
  if(existing){
    const existingMetadata=normalizeJsonRecord(existing.metadata)
    const identityPayload=context.preserveExistingIdentity
      ? {}
      : {
        full_name:normalizeText(customer.full_name)||existing.full_name,
        phone:normalizeText(customer.phone)||existing.phone,
        whatsapp:normalizeText(customer.whatsapp)||normalizeText(customer.phone)||existing.whatsapp
      }
    const { data,error }=await adminClient.from('customers').update({
      ...identityPayload,
      metadata:buildCustomerMetadata(existingMetadata,context)
    }).eq('id',existing.id).select().single()
    if(error)throw error
    return data
  }
  const { data,error }=await adminClient.from('customers').insert({
    full_name:normalizeText(customer.full_name)||'Guest',
    email,
    phone:normalizeText(customer.phone),
    whatsapp:normalizeText(customer.whatsapp)||normalizeText(customer.phone),
    metadata:buildCustomerMetadata({},context)
  }).select().single()
  if(error)throw error
  return data
}

const queueEmailLog=async({bookingId,customerId,recipientEmail,templateKey,subject,body,status='queued',metadata={}}:{
  bookingId:string
  customerId:string
  recipientEmail:string
  templateKey:string
  subject:string
  body:string
  status?:string
  metadata?:Json
})=>{
  const { data,error }=await adminClient.from('email_logs').insert({
    booking_id:bookingId,
    customer_id:customerId,
    template_key:templateKey,
    recipient_email:recipientEmail,
    subject,
    rendered_body:body,
    status,
    metadata
  }).select().single()
  if(error)throw error
  return data
}

const readEmailIntegrationConfig=async(brandCode='true-travel')=>{
  const integrations=normalizeJsonRecord(await getSettingValue('integrations',{}))
  const emailConfig=normalizeJsonRecord(integrations.email)
  return {
    provider:normalizeText(Deno.env.get('EMAIL_PROVIDER') || emailConfig.provider || 'emailjs'),
    emailjsServiceId:normalizeText(Deno.env.get('EMAILJS_SERVICE_ID') || emailConfig.emailjs_service_id),
    emailjsPublicKey:normalizeText(Deno.env.get('EMAILJS_PUBLIC_KEY') || emailConfig.emailjs_public_key),
    emailjsPrivateKey:normalizeText(Deno.env.get('EMAILJS_PRIVATE_KEY') || emailConfig.emailjs_private_key),
    emailjsTemplateBookingReceived:normalizeText(Deno.env.get('EMAILJS_TEMPLATE_BOOKING_RECEIVED') || emailConfig.emailjs_template_booking_received || 'template_booking_received'),
    emailjsTemplateConsultantAlert:normalizeText(Deno.env.get('EMAILJS_TEMPLATE_CONSULTANT_ALERT') || emailConfig.emailjs_template_consultant_alert || 'template_consultant_alert')
  }
}

const tryParseJson=async(response:Response)=>{
  try{
    return await response.json()
  }catch{
    return {}
  }
}

const getConfiguredBrandSupportEmail=async(brandCode:string)=>{
  const config=normalizeJsonRecord(await getSettingValue('config',{
    supportEmail:BRAND_SUPPORT_EMAILS['true-travel'],
    supportEmailsByBrand:BRAND_SUPPORT_EMAILS
  }))
  const supportEmailsByBrand=normalizeJsonRecord(config.supportEmailsByBrand)
  return normalizeText(
    supportEmailsByBrand[brandCode]
    || config.supportEmail
    || BRAND_SUPPORT_EMAILS[brandCode as keyof typeof BRAND_SUPPORT_EMAILS]
  )
}

const dispatchEmailLog=async(emailLog:Json)=>{
  const brandCode=normalizeText(emailLog.metadata?.brand_code) || 'true-travel'
  const config=await readEmailIntegrationConfig(brandCode)
  const provider=normalizeText(config.provider)
  if(provider!=='emailjs' || !config.emailjsServiceId || !config.emailjsPublicKey || !config.emailjsPrivateKey){
    await adminClient.from('email_logs').update({
      status:'queued',
      metadata:{
        ...normalizeJsonRecord(emailLog.metadata),
        dispatch_provider:provider || 'log_only',
        dispatch_mode:'queue_only'
      }
    }).eq('id',String(emailLog.id || ''))
    return { status:'queued', provider:provider || 'log_only' }
  }

  const templateKey=normalizeText(emailLog.metadata?.template_key) || normalizeText(emailLog.template_key) || 'booking_received'
  const templateId=templateKey==='consultant_alert'
    ? config.emailjsTemplateConsultantAlert
    : config.emailjsTemplateBookingReceived

  const response=await fetch('https://api.emailjs.com/api/v1.0/email/send',{
    method:'POST',
    headers:{ 'Content-Type':'application/json' },
    body:JSON.stringify({
      service_id:config.emailjsServiceId,
      template_id:templateId,
      user_id:config.emailjsPublicKey,
      accessToken:config.emailjsPrivateKey,
      template_params:{
        to_email:String(emailLog.recipient_email || ''),
        subject:String(emailLog.subject || ''),
        message:String(emailLog.rendered_body || ''),
        html_content:normalizeText(emailLog.metadata?.rendered_html) || '',
        brand_code:brandCode
      }
    })
  })

  if(!response.ok){
    const errorText=await response.text().catch(()=>'')
    const errorMessage=normalizeText(errorText) || ('EmailJS dispatch failed with status ' + response.status + '.')
    await adminClient.from('email_logs').update({
      status:'failed',
      error_message:errorMessage,
      metadata:{
        ...normalizeJsonRecord(emailLog.metadata),
        dispatch_provider:'emailjs',
        response_status:response.status
      }
    }).eq('id',String(emailLog.id || ''))
    throw new Error(errorMessage)
  }

  await adminClient.from('email_logs').update({
    status:'sent',
    sent_at:nowIso(),
    error_message:null,
    metadata:{
      ...normalizeJsonRecord(emailLog.metadata),
      dispatch_provider:'emailjs',
      response_status:response.status
    }
  }).eq('id',String(emailLog.id || ''))
  return { status:'sent', provider:'emailjs' }
}

const readWhatsAppConfig=()=>({
  provider:normalizeText(Deno.env.get('WHATSAPP_PROVIDER')) || 'log_only',
  twilioAccountSid:normalizeText(Deno.env.get('TWILIO_ACCOUNT_SID')),
  twilioAuthToken:normalizeText(Deno.env.get('TWILIO_AUTH_TOKEN')),
  twilioFrom:normalizeText(Deno.env.get('TWILIO_WHATSAPP_FROM')),
  ultraMsgInstanceId:normalizeText(Deno.env.get('ULTRAMSG_INSTANCE_ID')),
  ultraMsgToken:normalizeText(Deno.env.get('ULTRAMSG_TOKEN')),
  greenApiInstanceId:normalizeText(Deno.env.get('GREENAPI_INSTANCE_ID')),
  greenApiToken:normalizeText(Deno.env.get('GREENAPI_TOKEN'))
})

const sendWhatsAppMessage=async(to:string,body:string)=>{
  const cfg=readWhatsAppConfig()
  const normalizedTo=normalizeText(to).replace(/\s/g,'').replace(/^\+/,'')
  if(!normalizedTo||!body)return
  if(cfg.provider==='greenapi'&&cfg.greenApiInstanceId&&cfg.greenApiToken){
    const chatId=`${normalizedTo}@c.us`
    await fetch(`https://api.green-api.com/waInstance${cfg.greenApiInstanceId}/sendMessage/${cfg.greenApiToken}`,{
      method:'POST',
      headers:{'Content-Type':'application/json'},
      body:JSON.stringify({chatId,message:body})
    })
    return
  }
  if(cfg.provider==='twilio'&&cfg.twilioAccountSid&&cfg.twilioAuthToken&&cfg.twilioFrom){
    const fromNumber=cfg.twilioFrom.startsWith('whatsapp:') ? cfg.twilioFrom : `whatsapp:${cfg.twilioFrom}`
    const toNumber=`whatsapp:+${normalizedTo}`
    const credentials=btoa(`${cfg.twilioAccountSid}:${cfg.twilioAuthToken}`)
    await fetch(`https://api.twilio.com/2010-04-01/Accounts/${cfg.twilioAccountSid}/Messages.json`,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded',Authorization:`Basic ${credentials}`},
      body:new URLSearchParams({From:fromNumber,To:toNumber,Body:body}).toString()
    })
    return
  }
  if(cfg.provider==='ultramsg'&&cfg.ultraMsgInstanceId&&cfg.ultraMsgToken){
    await fetch(`https://api.ultramsg.com/${cfg.ultraMsgInstanceId}/messages/chat`,{
      method:'POST',
      headers:{'Content-Type':'application/x-www-form-urlencoded'},
      body:new URLSearchParams({token:cfg.ultraMsgToken,to:`+${normalizedTo}`,body}).toString()
    })
    return
  }
  console.info(`[WhatsApp log_only] to=${normalizedTo} body=${body}`)
}

const loadBookingEmailContext=async(bookingId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found for queued email.')
  const [customer,service,brand]=await Promise.all([
    safeMaybeSingle<Json>(adminClient.from('customers').select('*').eq('id',String(booking.customer_id || '')).maybeSingle()),
    safeMaybeSingle<Json>(adminClient.from('services').select('*').eq('id',String(booking.service_id || '')).maybeSingle()),
    getBrandByCode(normalizeText(booking.brand_code) || 'true-travel')
  ])
  return { booking, customer, service, brand }
}

const normalizeAbsoluteUrl=(value:unknown)=>{
  const raw=normalizeText(value)
  if(!raw)return ''
  const withProtocol=/^https?:\/\//i.test(raw) ? raw : `https://${raw}`
  try{return new URL(withProtocol).toString().replace(/\/+$/,'')}catch{return ''}
}

const buildBookingPaymentPageUrl=(booking:Json,brand:Json | null=null,token='')=>{
  const brandProfile=mergeBrandProfile(brand || getDefaultBrandProfile(booking.brand_code))
  const baseUrl=normalizeAbsoluteUrl(brandProfile.website_url) || 'https://truetravelnam.net'
  const paymentUrl=new URL('payment.html',`${baseUrl}/`)
  const reference=normalizeText(booking.reference)
  const paymentToken=normalizeText(token || normalizeJsonRecord(normalizeJsonRecord(booking.metadata).payment_link).token)
  if(reference)paymentUrl.searchParams.set('reference',reference)
  if(paymentToken)paymentUrl.searchParams.set('token',paymentToken)
  paymentUrl.searchParams.set('source','skybook')
  paymentUrl.searchParams.set('pay','1')
  return paymentUrl.toString()
}

const enqueueBookingEmailJob=async({
  bookingId,
  customerId,
  templateKey,
  priority='normal',
  runAt=nowIso(),
  createdBy=null,
  payload={}
}:{
  bookingId:string
  customerId:string
  templateKey:string
  priority?:string
  runAt?:string
  createdBy?:string | null
  payload?:Json
})=>{
  await enqueueSystemJob({
    job_type:'email_notification',
    job_group:'communications',
    priority,
    run_at:runAt,
    booking_id:bookingId,
    customer_id:customerId,
    related_table:'email_logs',
    payload:{ template_key:templateKey, ...(payload||{}) },
    created_by:createdBy
  })
}

const renderBookingReceivedHtml=(vars:Record<string,string>,brandCode:string):string=>{
  const isTT=brandCode==='true-travel'
  const primary=isTT?'#0E3A52':'#17110d'
  const accent=isTT?'#2B8BAD':'#f5a400'
  const bg=isTT?'#F7F0E3':'#faf7f0'
  const logo=isTT
    ?'https://zegfirgyhdjyehvhlrnh.supabase.co/storage/v1/object/public/True%20Travel/TT_Logo-removebg-preview.png'
    :'https://zegfirgyhdjyehvhlrnh.supabase.co/storage/v1/object/public/Iventure/IV%20Logo.png'
  const brand=vars.brand_name||'True Travel'
  const em=vars.brand_support_email||''
  const ph=vars.brand_support_phone||''
  const emailRow=em?`<p style="margin:4px 0;font-size:14px"><a href="mailto:${em}" style="color:${accent};text-decoration:none">${em}</a></p>`:''
  const phoneRow=ph?`<p style="margin:4px 0;font-size:14px;color:#555">${ph}</p>`:''
  return `<!DOCTYPE html><html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Booking Received – ${brand}</title></head>
<body style="margin:0;padding:0;background:${bg};font-family:Arial,Helvetica,sans-serif">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${bg}"><tr><td align="center" style="padding:32px 16px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 12px rgba(0,0,0,.08)">
<tr><td style="background:${primary};padding:36px;text-align:center">
<img src="${logo}" alt="${brand}" height="64" style="height:64px;max-width:180px;object-fit:contain;display:block;margin:0 auto">
<p style="margin:16px 0 0;color:rgba(255,255,255,.75);font-size:12px;letter-spacing:3px;text-transform:uppercase">Booking Request Received</p>
</td></tr>
<tr><td style="padding:40px 40px 28px">
<p style="margin:0 0 8px;color:#333;font-size:16px">Hi <strong>${vars.customer_name}</strong>,</p>
<p style="margin:0 0 28px;color:#555;font-size:15px;line-height:1.65">Thank you for choosing <strong>${brand}</strong>! We have received your booking request and a consultant will be in touch shortly to confirm timing, pickup details, and payment.</p>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px"><tr>
<td style="background:${bg};border-radius:8px;padding:22px;text-align:center;border:2px solid ${accent}">
<p style="margin:0 0 6px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:#888">Booking Reference</p>
<p style="margin:0;font-size:30px;font-weight:700;color:${primary};letter-spacing:3px">${vars.booking_reference}</p>
</td></tr></table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;border-radius:8px;overflow:hidden;border:1px solid #e8e8e8">
<tr style="background:${primary}"><td colspan="2" style="padding:12px 18px;font-size:11px;letter-spacing:2px;text-transform:uppercase;color:rgba(255,255,255,.85);font-weight:600">Your Booking Details</td></tr>
<tr><td style="padding:14px 18px;font-size:13px;color:#888;width:42%;border-bottom:1px solid #f0f0f0">Activity / Tour</td><td style="padding:14px 18px;font-size:14px;color:#222;font-weight:600;border-bottom:1px solid #f0f0f0">${vars.service_name}</td></tr>
<tr style="background:#fafafa"><td style="padding:14px 18px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0">Preferred Date</td><td style="padding:14px 18px;font-size:14px;color:#222;font-weight:600;border-bottom:1px solid #f0f0f0">${vars.booking_date}</td></tr>
<tr><td style="padding:14px 18px;font-size:13px;color:#888;border-bottom:1px solid #f0f0f0">Guests</td><td style="padding:14px 18px;font-size:14px;color:#222;font-weight:600;border-bottom:1px solid #f0f0f0">${vars.guest_count}</td></tr>
<tr style="background:#fafafa"><td style="padding:14px 18px;font-size:13px;color:#888">Total Amount</td><td style="padding:14px 18px;font-size:15px;color:${primary};font-weight:700">${vars.total_amount}</td></tr>
</table>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin-bottom:28px;background:${bg};border-radius:8px;border-left:4px solid ${accent}">
<tr><td style="padding:20px">
<p style="margin:0 0 8px;font-size:12px;font-weight:700;color:${primary};letter-spacing:1px;text-transform:uppercase">What happens next</p>
<p style="margin:0;font-size:14px;color:#555;line-height:1.7">A ${brand} consultant will contact you within a few hours to confirm your booking, arrange pickup, and share payment instructions. Please keep your reference number handy.</p>
</td></tr></table>
<p style="margin:0 0 6px;font-size:14px;color:#555">Questions? We are always here:</p>
${emailRow}${phoneRow}
</td></tr>
<tr><td style="background:${primary};padding:24px 40px;text-align:center">
<p style="margin:0 0 4px;font-size:13px;color:rgba(255,255,255,.6)">${brand} · Walvis Bay, Namibia</p>
<p style="margin:0;font-size:12px;color:rgba(255,255,255,.35)">This is an automated booking confirmation. Please do not reply to this email.</p>
</td></tr>
</table>
</td></tr></table>
</body></html>`
}

const performQueuedEmailJob=async(job:Json)=>{
  const bookingId=normalizeText(job.booking_id)
  const templateKey=normalizeText(job.payload?.template_key) || 'status_changed'
  if(!bookingId)throw new Error('Queued email job is missing booking_id.')
  if(!['booking_received','consultant_alert'].includes(templateKey))return
  const { booking, customer, service, brand }=await loadBookingEmailContext(bookingId)
  const isConsultantAlert=templateKey==='consultant_alert'
  const recipientEmail=isConsultantAlert ? (BRAND_CONSULTANT_EMAILS[normalizeText(booking.brand_code) as keyof typeof BRAND_CONSULTANT_EMAILS] || BRAND_CONSULTANT_EMAILS['true-travel']) : String(customer?.email || '')
  if(!recipientEmail)throw new Error('Email recipient is missing for queued email delivery.')
  let subject=normalizeText(job.payload?.subject)
  let body=normalizeText(job.payload?.body)
  if(!subject || !body){
    const emailTemplates=await getSettingValue('email_templates',defaultEmailTemplates)
    const fallbackTemplate=(defaultEmailTemplates as unknown as Record<string,Json>)[templateKey] || defaultEmailTemplates.status_changed
    const configuredTemplate=(((emailTemplates||{}) as Json)[templateKey] || fallbackTemplate) as Json
    const template=templateKey==='booking_received' && normalizeText(booking.brand_code)==='true-travel'
      ? defaultEmailTemplates.booking_received as unknown as Json
      : configuredTemplate
    const configuredSupportEmail=await getConfiguredBrandSupportEmail(normalizeText(booking.brand_code) || 'true-travel')
    const bookingMetadata=normalizeJsonRecord(booking.metadata)
    const customFields=normalizeJsonRecord(bookingMetadata.custom_fields)
    const customDetails=Object.keys(customFields).length ? JSON.stringify(customFields) : 'None captured'
    const totalAmount=`${normalizeText(booking.currency_code) || 'NAD'} ${Number(booking.total_amount || 0).toFixed(2)}`
    const templateVariables={
      customer_name:customer?.full_name || 'Guest',
      customer_email:customer?.email || '',
      customer_phone:customer?.phone || '',
      booking_reference:booking.reference,
      service_name:service?.name || 'Service',
      booking_date:booking.preferred_date || 'To be confirmed',
      total_amount:totalAmount,
      guest_count:String(booking.quantity || 1),
      booking_source:normalizeText(booking.source) || normalizeText(bookingMetadata.source) || 'website',
      capture_page:normalizeText(bookingMetadata.source_page) || 'Not captured',
      created_via:normalizeText(bookingMetadata.created_via) || 'website',
      customer_notes:normalizeText(booking.customer_notes) || 'No notes captured',
      custom_details:customDetails,
      booking_status:booking.status,
      payment_status:booking.payment_status,
      refund_amount:normalizeText(job.payload?.refund_amount),
      brand_name:normalizeText(brand?.name) || BRAND_EMAIL_NAMES[normalizeText(booking.brand_code) as keyof typeof BRAND_EMAIL_NAMES] || 'SkyBook',
      brand_support_email:configuredSupportEmail || normalizeText(brand?.support_email) || BRAND_SUPPORT_EMAILS[normalizeText(booking.brand_code) as keyof typeof BRAND_SUPPORT_EMAILS] || '',
      brand_support_phone:normalizeText(brand?.support_phone),
      brand_website:normalizeText(brand?.website_url)
    }
    subject=renderTemplate(String(template.subject || fallbackTemplate.subject),templateVariables)
    body=renderTemplate(String(template.body || fallbackTemplate.body),templateVariables)
  }
  const brandCodeForHtml=normalizeText(booking.brand_code) || 'true-travel'
  const renderedHtml=!isConsultantAlert && templateKey==='booking_received'
    ? renderBookingReceivedHtml(templateVariables as unknown as Record<string,string>,brandCodeForHtml)
    : ''
  const emailLog=await queueEmailLog({
    bookingId,
    customerId:String(customer?.id || booking.customer_id || ''),
    recipientEmail,
    templateKey,
    subject,
    body,
    status:'queued',
    metadata:{
      brand_code:brandCodeForHtml,
      source:'system_job',
      job_id:String(job.id || ''),
      delivery_intent:isConsultantAlert ? 'consultant_alert' : 'automatic',
      ...(renderedHtml ? {rendered_html:renderedHtml} : {})
    }
  })
  await dispatchEmailLog(emailLog)
}

const runStatusAutomations=async(job:Json)=>{
  const automationRules=await getSettingValue('automation_rules',DEFAULT_AUTOMATION_RULES)
  const bookingId=normalizeText(job.booking_id)
  if(bookingId){
    const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
    if(!booking)return
    if(Boolean((automationRules as Json).autoConfirmPaidBookings) && normalizeText(booking.payment_status)==='paid' && ['provisional','pending','draft','payment_pending','awaiting_payment'].includes(normalizeText(booking.status))){
      await updateBooking(bookingId,{ status:'confirmed', payment_status:'paid', reason:'Auto-confirmed (paid) by SkyBook automation' },'')
    }
    if(Boolean((automationRules as Json).autoCompletePastConfirmedBookings) && normalizeText(booking.payment_status)==='paid' && normalizeText(booking.status)==='confirmed'){
      const preferredDate=parseDateValue(String(booking.preferred_date || ''))
      if(preferredDate && preferredDate < new Date()){
        await updateBooking(bookingId,{ status:'finalised', reason:'Auto-finalised by SkyBook automation' },'')
      }
    }
    return
  }
  if(Boolean((automationRules as Json).autoCompletePastConfirmedBookings)){
    const confirmedBookings=await safeTableSelect<Json>(adminClient.from('bookings').select('*').eq('status','confirmed').eq('payment_status','paid'),[])
    for(const booking of confirmedBookings){
      const preferredDate=parseDateValue(String(booking.preferred_date || ''))
      if(preferredDate && preferredDate < new Date()){
        await updateBooking(String(booking.id || ''),{ status:'finalised', reason:'Auto-finalised by SkyBook automation' },'')
      }
    }
  }
}

const processSystemJob=async(job:Json)=>{
  const jobId=normalizeText(job.id)
  if(!jobId)return null
  await updateSystemJob(jobId,{
    status:'processing',
    started_at:nowIso(),
    attempts:Number(job.attempts || 0) + 1
  })
  try{
    switch(normalizeText(job.job_type)){
      case 'email_notification':
        await performQueuedEmailJob(job)
        break
      case 'status_automation':
        await runStatusAutomations(job)
        break
      case 'operator_settlement_check':
        if(normalizeText(job.booking_id))await maybeCreateAutomatedOfficeSettlement(normalizeText(job.booking_id),safeUuid(job.created_by))
        break
      case 'payment_reminder':
        await performQueuedEmailJob({ ...job, payload:{ ...(job.payload || {}), template_key:'status_changed' } })
        break
      default:
        break
    }
    await updateSystemJob(jobId,{
      status:'completed',
      completed_at:nowIso(),
      result:{ processed_at:nowIso() },
      last_error:null
    })
    return true
  }catch(error){
    const attempts=Number(job.attempts || 0) + 1
    const nextStatus=attempts >= Number(job.max_attempts || 3) ? 'failed' : 'queued'
    await updateSystemJob(jobId,{
      status:nextStatus,
      completed_at:nextStatus==='failed' ? nowIso() : null,
      last_error:error instanceof Error ? error.message : 'System job failed.',
      run_at:nextStatus==='queued' ? addHours(new Date(),1) : job.run_at
    })
    await recordHealthEvent({
      event_type:'job_failure',
      severity:attempts >= Number(job.max_attempts || 3) ? 'critical' : 'error',
      source:'booking-api',
      summary:`System job ${normalizeText(job.job_type) || 'unknown'} failed`,
      detail:error instanceof Error ? error.message : 'System job failed.',
      related_job_id:jobId,
      related_booking_id:normalizeText(job.booking_id) || null,
      metadata:{ attempts, payload:job.payload || {} }
    })
    return false
  }
}

const sweepPaymentPendingTransitions=async()=>{
  const now=new Date()
  const todayDate=now.toISOString().slice(0,10)
  const cutoffDate=new Date(now.getTime()+24*60*60*1000).toISOString().slice(0,10)
  const unpaidInvoiced=await safeTableSelect<Json>(
    adminClient.from('bookings')
      .select('id,status,preferred_date,payment_status')
      .not('status','in','(cancelled,refunded,failed,no_show)')
      .not('payment_status','in','(paid,partially_paid)')
      .gte('preferred_date',todayDate)
      .lte('preferred_date',cutoffDate),
    []
  )
  // Imminent unpaid tours are flagged by their payment_status (to_pay) + tour date; we no longer
  // overwrite the lifecycle status (Status 3) with a payment value like payment_pending.
  for(const b of unpaidInvoiced){
    if(normalizeText(b.payment_status)!=='to_pay'){
      await updateBooking(String(b.id),{ payment_status:'to_pay', workflow_action:'system_automation', reason:'Tour within 24 hours — flagged To Pay by SkyBook automation' },'')
    }
  }
}

const processDueSystemJobs=async()=>{
  const queueSettings=await getSettingValue('queue',DEFAULT_QUEUE_SETTINGS)
  if((queueSettings as Json).enabled===false)return []
  const jobs=await safeTableSelect<Json>(
    adminClient
      .from('system_jobs')
      .select('*')
      .eq('status','queued')
      .lte('run_at',nowIso())
      .order('priority',{ascending:false})
      .order('run_at',{ascending:true})
      .limit(Number((queueSettings as Json).maxJobsPerSweep || DEFAULT_QUEUE_SETTINGS.maxJobsPerSweep)),
    []
  )
  const processed:string[]=[]
  for(const job of jobs){
    await processSystemJob(job)
    processed.push(String(job.id || ''))
  }
  void sweepPaymentPendingTransitions().catch(()=>{})
  return processed
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

const createOrUpdatePayment=async(bookingId:string,paymentStatus:string,amount:number,currencyCode:string,provider='manual_eft')=>{
  const paymentsStatus=paymentStatus||'pending'
  const { data:existing }=await adminClient.from('payments').select('*').eq('booking_id',bookingId).maybeSingle()
  if(existing){
    const { error }=await adminClient.from('payments').update({
      provider,
      status:paymentsStatus,
      amount,
      amount_received:paymentsStatus==='paid' ? Math.max(Number(existing.amount_received||0),Number(amount||0)) : Number(existing.amount_received||0),
      paid_at:paymentsStatus==='paid' ? nowIso() : null
    }).eq('id',existing.id)
    if(error)throw error
    return
  }
  const { error }=await adminClient.from('payments').insert({
    booking_id:bookingId,
    provider,
    status:paymentsStatus,
    currency_code:currencyCode,
    amount,
    amount_received:paymentsStatus==='paid' ? amount : 0,
    paid_at:paymentsStatus==='paid' ? nowIso() : null,
    metadata:{source:'booking-api'}
  })
  if(error)throw error
}

const normalizeManualPaymentType=(value:unknown)=>{
  const normalized=normalizeFieldId(value)
  return MANUAL_PAYMENT_TYPES.has(normalized) ? normalized : 'eft'
}

const getProviderForManualPaymentType=(paymentType:string)=>['eft','bank_transfer'].includes(paymentType) ? 'manual_eft' : 'custom'

const createManualBookingPayment=async(bookingId:string,payload:Json,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const amount=Number(payload.amount || payload.amount_received || 0)
  if(!Number.isFinite(amount)||amount<=0)throw new Error('Payment amount must be greater than zero.')
  const paymentType=normalizeManualPaymentType(payload.payment_type || payload.type)
  const terminalSerialNumber=normalizeText(payload.terminal_serial_number || payload.serial_number)
  const batchNumber=normalizeText(payload.batch_number)
  if(paymentType==='card' && (!terminalSerialNumber||!batchNumber)){
    throw new Error('Card payments require terminal serial number and batch number.')
  }
  const provider=getProviderForManualPaymentType(paymentType)
  const existingPayment=await safeMaybeSingle<Json>(
    adminClient.from('payments').select('*').eq('booking_id',bookingId).order('created_at',{ascending:true}).limit(1).maybeSingle()
  )
  const previousReceived=Number(existingPayment?.amount_received || 0)
  const totalAmount=Number(booking.total_amount || existingPayment?.amount || 0)
  const allowOverpayment=payload.allow_overpayment===true
  const outstandingBeforeThis=Number(Math.max(0,(totalAmount-previousReceived)).toFixed(2))
  if(!allowOverpayment){
    if(normalizeText(booking.payment_status)==='foc' || totalAmount<=0){
      throw new Error('This booking is Free of Charge — there is nothing to pay. Tick "Allow overpayment" only if you must record money against it.')
    }
    if(previousReceived+0.01>=totalAmount && totalAmount>0){
      throw new Error(`Booking is already fully paid (received ${previousReceived.toFixed(2)} of ${totalAmount.toFixed(2)}). Tick "Allow overpayment" to record an additional amount.`)
    }
    if(amount>outstandingBeforeThis+0.01){
      throw new Error(`Payment of ${amount.toFixed(2)} exceeds the outstanding balance of ${outstandingBeforeThis.toFixed(2)}. Reduce the amount or tick "Allow overpayment".`)
    }
  }
  const nextReceived=Number((previousReceived+amount).toFixed(2))
  const nextPaymentStatus=nextReceived>0 && nextReceived+0.01>=totalAmount ? 'paid' : 'partially_paid'
  const outstandingAmount=Math.max(0,Number((totalAmount-nextReceived).toFixed(2)))
  const providerReference=normalizeText(payload.provider_reference || payload.reference) || `MAN-${Date.now()}`
  const manualPaymentMeta={
    payment_type:paymentType,
    provider_reference:providerReference,
    terminal_serial_number:terminalSerialNumber,
    batch_number:batchNumber,
    received_at:nowIso(),
    received_by:userId,
    notes:normalizeText(payload.notes)
  }
  const paymentPayload={
    booking_id:bookingId,
    provider,
    status:nextPaymentStatus,
    currency_code:normalizeText(payload.currency_code || booking.currency_code) || 'NAD',
    amount:totalAmount || nextReceived,
    amount_received:nextReceived,
    provider_reference:providerReference,
    paid_at:nextPaymentStatus==='paid' ? nowIso() : (existingPayment?.paid_at || null),
    metadata:{
      ...normalizeJsonRecord(existingPayment?.metadata),
      source:'manual_admin_payment',
      latest_manual_payment:manualPaymentMeta
    }
  }
  const payment=existingPayment?.id
    ? await safeMaybeSingle<Json>(adminClient.from('payments').update(paymentPayload).eq('id',String(existingPayment.id)).select().single())
    : await safeMaybeSingle<Json>(adminClient.from('payments').insert(paymentPayload).select().single())
  if(!payment?.id)throw new Error('Unable to record payment.')
  const transaction=await safeMaybeSingle<Json>(
    adminClient
      .from('payment_transactions')
      .insert({
        payment_id:String(payment.id),
        provider,
        transaction_reference:providerReference,
        transaction_type:'manual_payment',
        status:'paid',
        amount,
        currency_code:normalizeText(payload.currency_code || booking.currency_code) || 'NAD',
        raw_payload:{
          ...manualPaymentMeta,
          booking_reference:booking.reference
        },
        reconciled_at:nowIso()
      })
      .select()
      .single()
  )
  const currentStatus=normalizeText(booking.status)
  // Lifecycle (status) stays a lifecycle value; payment outcome lives in payment_status.
  // A recorded payment promotes a still-pending lifecycle to confirmed (never to a payment value).
  const lifecyclePromotes=['draft','pending','provisional','payment_pending','awaiting_payment','payment_request_sent'].includes(currentStatus)
  const nextBookingStatus=(nextPaymentStatus==='paid'||nextPaymentStatus==='partially_paid') && lifecyclePromotes ? 'confirmed' : currentStatus
  const existingMetadata=normalizeJsonRecord(booking.metadata)
  const { error:bookingUpdateError }=await adminClient.from('bookings').update({
    status:nextBookingStatus,
    payment_status:nextPaymentStatus,
    amount_due_now:outstandingAmount,
    amount_due_later:0,
    metadata:{
      ...existingMetadata,
      latest_manual_payment:manualPaymentMeta
    },
    updated_by:safeUuid(userId)
  }).eq('id',bookingId)
  if(bookingUpdateError)throw bookingUpdateError
  await insertStatusHistory(
    bookingId,
    String(booking.status),
    nextBookingStatus,
    `Manual ${displayLabel(paymentType)} payment recorded: ${amount.toFixed(2)} ${normalizeText(payload.currency_code || booking.currency_code) || 'NAD'}`,
    `admin:${userId}`,
    userId
  )
  await createAdminNote({
    booking_id:bookingId,
    note:`Manual ${displayLabel(paymentType)} payment recorded for ${amount.toFixed(2)} ${normalizeText(payload.currency_code || booking.currency_code) || 'NAD'}.${paymentType==='card' ? ` Serial ${terminalSerialNumber}, batch ${batchNumber}.` : ''}`,
    is_private:true
  },userId)
  await syncInvoiceForBooking(bookingId)
  await syncLifecycleTasks(bookingId,userId)
  await syncReconciliationRecordForBooking(bookingId,userId)
  await enqueueSystemJob({
    job_type:'payment_reconciliation',
    job_group:'finance',
    priority:'high',
    booking_id:bookingId,
    related_table:'payments',
    related_id:String(payment.id),
    created_by:userId,
    payload:{ payment_type:paymentType, provider_reference:providerReference }
  })
  await processDueSystemJobs()
  return { success:true, payment, transaction, payment_status:nextPaymentStatus, amount_received:nextReceived, balance_amount:outstandingAmount }
}

const resolveOutstandingAmounts=(pricing:{
  amountDueNow:number
  amountDueLater:number
},paymentStatus:string)=>{
  const normalized=normalizeText(paymentStatus).toLowerCase()
  if(['paid','refunded','cancelled','foc'].includes(normalized)){
    return { amountDueNow:0, amountDueLater:0 }
  }
  return {
    amountDueNow:Number(pricing.amountDueNow || 0),
    amountDueLater:Number(pricing.amountDueLater || 0)
  }
}

const syncBookingItems=async(bookingId:string,service:{ id:string, name:string },pricing:{
  quantity:number
  subtotalAmount:number
  discountAmount?:number
  adultQuantity?:number
  childQuantity?:number
  adultPrice?:number | null
  childPrice?:number | null
})=>{
  // Clear the previous service line(s) so adult/child splits never stack across edits.
  const deleteServiceLines=await adminClient.from('booking_items').delete().eq('booking_id',bookingId).eq('item_type','service')
  if(deleteServiceLines.error && !['42P01','PGRST205'].includes(String(deleteServiceLines.error.code || '')))throw deleteServiceLines.error
  const adultQty=Math.max(0,Number(pricing.adultQuantity||0))
  const childQty=Math.max(0,Number(pricing.childQuantity||0))
  const adultPrice=pricing.adultPrice!=null ? Number(pricing.adultPrice) : null
  const childPrice=pricing.childPrice!=null ? Number(pricing.childPrice) : null
  const splitPriced=adultPrice!=null && (adultQty+childQty)>0
  // Split-priced services get one line per pax type so invoices read "2 × Adult, 2 × Child".
  // Flat-priced services keep the single blended line they always had.
  const serviceLines=splitPriced
    ? [
        adultQty>0 ? { description:`${service.name} — Adult`, quantity:adultQty, unit_price:Number((adultPrice||0).toFixed(2)), line_total:Number((adultQty*(adultPrice||0)).toFixed(2)) } : null,
        childQty>0 ? { description:`${service.name} — Child (4–12)`, quantity:childQty, unit_price:Number((childPrice||0).toFixed(2)), line_total:Number((childQty*(childPrice||0)).toFixed(2)) } : null
      ].filter(Boolean) as Array<{ description:string, quantity:number, unit_price:number, line_total:number }>
    : [{
        description:service.name,
        quantity:Number(pricing.quantity || 1),
        unit_price:Number((Number(pricing.subtotalAmount || 0) / Math.max(1,Number(pricing.quantity || 1))).toFixed(2)),
        line_total:Number(pricing.subtotalAmount || 0)
      }]
  for(const line of serviceLines){
    const { error }=await adminClient.from('booking_items').insert({
      booking_id:bookingId,
      item_type:'service',
      service_id:service.id,
      ...line,
      metadata:{ source:'booking-api' }
    })
    if(error)throw error
  }
  const discountAmount=Number(pricing.discountAmount || 0)
  const deleteDiscounts=await adminClient.from('booking_items').delete().eq('booking_id',bookingId).eq('item_type','discount')
  if(deleteDiscounts.error && !['42P01','PGRST205'].includes(String(deleteDiscounts.error.code || '')))throw deleteDiscounts.error
  if(discountAmount>0){
    const insertDiscount=await adminClient.from('booking_items').insert({
      booking_id:bookingId,
      item_type:'discount',
      service_id:service.id,
      description:'Booking discount',
      quantity:1,
      unit_price:Number((0-discountAmount).toFixed(2)),
      line_total:Number((0-discountAmount).toFixed(2)),
      metadata:{ source:'booking-api' }
    })
    if(insertDiscount.error && !['42P01','PGRST205'].includes(String(insertDiscount.error.code || '')))throw insertDiscount.error
  }
}

const applyPromotions=async(service:Json,payload:Json,pricingBase:{ totalAmount:number })=>{
  const couponCode=normalizeText(payload.coupon_code).toUpperCase()
  const voucherCode=normalizeText(payload.voucher_code).toUpperCase()
  const agentCode=normalizeText(payload.agent_code).toUpperCase()
  const discounts:{ source_type:string, source_id:string | null, code:string, description:string, amount:number }[]=[]
  let voucherRow:Json | null=null
  let agentRow:Json | null=null
  let couponReserved:{id:string,amount:number}|null=null

  if(couponCode){
    const brandForCoupon=normalizeText(payload.brand_code)||'true-travel'
    const serviceIdForCoupon=String((service as Json)?.id || '')||null
    const { data:redeemRows, error:redeemError }=await adminClient.rpc('redeem_coupon',{
      p_code:couponCode, p_brand:brandForCoupon, p_service_id:serviceIdForCoupon
    })
    if(redeemError)throw new Error(redeemError.message)
    const reserved=Array.isArray(redeemRows)?redeemRows[0]:redeemRows
    if(reserved){
      const amount=normalizeDiscountAmount(pricingBase.totalAmount,String(reserved.discount_type || 'percentage'),Number(reserved.discount_value || 0))
      if(amount>0){
        discounts.push({source_type:'coupon',source_id:String(reserved.id),code:couponCode,description:String(reserved.description || `Coupon ${couponCode}`),amount})
        couponReserved={id:String(reserved.id),amount}
      }else{
        await adminClient.rpc('release_coupon',{p_coupon_id:String(reserved.id)})
      }
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
    agentRow,
    couponReserved
  }
}

const CROCKFORD='0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const generateCouponCode=(len=11)=>{
  const bytes=new Uint8Array(len)
  crypto.getRandomValues(bytes)
  let out=''
  for(let i=0;i<len;i++)out+=CROCKFORD[bytes[i]%32]
  return out
}

const brandBookingUrl=async(brandCode:string)=>{
  // The stored value is the FULL booking page URL for the brand
  // (e.g. True Travel -> homepage reservation form, Iventure -> /booking.html).
  const map=await getSettingValue<Record<string,string>>('brand_booking_urls',{})
  const base=normalizeText(map?.[brandCode])
  if(!base)throw new Error(`No booking URL configured for brand ${brandCode}. Set the booking 'brand_booking_urls' setting.`)
  return base
}

const createDiscountQr=async(payload:Json)=>{
  const brand=normalizeText(payload.brand_code)
  if(!['true-travel','iventure'].includes(brand))throw new Error('A valid brand_code is required.')
  const discountType=normalizeText(payload.discount_type)||'percentage'
  if(!['percentage','fixed'].includes(discountType))throw new Error('discount_type must be percentage or fixed.')
  const discountValue=Number(payload.discount_value||0)
  if(!(discountValue>0))throw new Error('discount_value must be greater than zero.')
  const kind=normalizeText(payload.kind)||'campaign'
  if(!['single_use','campaign'].includes(kind))throw new Error('kind must be single_use or campaign.')
  const maxRedemptions=payload.max_redemptions==null||payload.max_redemptions==='' ? null : Number(payload.max_redemptions)
  if(maxRedemptions!=null&&!(maxRedemptions>0))throw new Error('max_redemptions must be a positive number.')
  const endsAt=normalizeText(payload.ends_at)||null
  const serviceId=normalizeText(payload.service_id)||null
  const label=normalizeText(payload.label)||null

  let code=generateCouponCode()
  for(let attempt=0;attempt<5;attempt++){
    const clash=await safeMaybeSingle<Json>(adminClient.from('coupons').select('id').eq('code',code).maybeSingle())
    if(!clash)break
    code=generateCouponCode()
  }

  const insert=await adminClient.from('coupons').insert({
    code,
    description:label||`${brand} ${discountType==='percentage'?discountValue+'%':discountValue} discount`,
    discount_type:discountType,
    discount_value:discountValue,
    is_active:true,
    is_qr:true,
    kind,
    brand_code:brand,
    service_id:serviceId,
    label,
    usage_limit:kind==='single_use' ? 1 : maxRedemptions,
    usage_count:0,
    ends_at:endsAt
  }).select('*').single()
  if(insert.error)throw new Error(insert.error.message)

  const bookingUrl=await brandBookingUrl(brand)
  const url=`${bookingUrl}${bookingUrl.includes('?')?'&':'?'}promo=${encodeURIComponent(code)}`
  return { coupon:insert.data, code, url }
}

const listDiscountQr=async()=>{
  const rows=await safeTableSelect<Json>(
    adminClient.from('coupons').select('*').eq('is_qr',true).order('created_at',{ascending:false}),
    []
  )
  return { discount_qr:rows }
}

const disableDiscountQr=async(id:string)=>{
  const update=await adminClient.from('coupons').update({is_active:false}).eq('id',id).eq('is_qr',true).select('id').single()
  if(update.error)throw new Error(update.error.message)
  return { success:true }
}

const previewHits=new Map<string,{count:number,reset:number}>()
const previewRateLimited=(ip:string)=>{
  const now=Date.now()
  const slot=previewHits.get(ip)
  if(!slot||now>slot.reset){previewHits.set(ip,{count:1,reset:now+60_000});return false}
  slot.count++
  return slot.count>30 // max 30 previews/min/IP
}

const previewDiscountCode=async(code:string,brand:string)=>{
  const coupon=await safeMaybeSingle<Json>(
    adminClient.from('coupons').select('*').eq('code',normalizeText(code).toUpperCase()).eq('is_active',true).maybeSingle()
  )
  if(!coupon)return { valid:false }
  if(normalizeText(coupon.brand_code)!==brand)return { valid:false }
  if(coupon.ends_at&&new Date(String(coupon.ends_at)).getTime()<=Date.now())return { valid:false }
  if(coupon.usage_limit!=null&&Number(coupon.usage_count||0)>=Number(coupon.usage_limit))return { valid:false }
  let serviceSlug:string|null=null
  if(coupon.service_id){
    const svc=await safeMaybeSingle<Json>(adminClient.from('services').select('slug').eq('id',String(coupon.service_id)).maybeSingle())
    serviceSlug=svc?svc.slug as string:null
  }
  return {
    valid:true,
    discount_type:String(coupon.discount_type||'percentage'),
    discount_value:Number(coupon.discount_value||0),
    label:String(coupon.description||coupon.label||'Discount'),
    service_slug:serviceSlug
  }
}

type BookingDiscountInput={
  source_type:string
  source_id:string | null
  code:string
  description:string
  amount:number
  discount_type?:string | null
  discount_value?:number | null
  consultant_comment?:string
  created_by?:string | null
}

const maybeCreateBookingDiscounts=async(bookingId:string,discounts:BookingDiscountInput[])=>{
  if(!discounts.length)return
  const { error }=await adminClient.from('booking_discounts').insert(discounts.map(discount=>({
    booking_id:bookingId,
    source_type:discount.source_type,
    source_id:discount.source_id,
    code:discount.code,
    description:discount.description,
    amount:discount.amount,
    discount_type:discount.discount_type || null,
    discount_value:discount.discount_value ?? null,
    consultant_comment:discount.consultant_comment || null,
    created_by:safeUuid(discount.created_by)
  })))
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
}

const getStoredBookingDiscountRows=async(bookingId:string)=>safeTableSelect<Json>(
  adminClient
    .from('booking_discounts')
    .select('*')
    .eq('booking_id',bookingId),
  []
)

const normalizeStoredBookingDiscountAmount=(row:Json,baseTotal:number)=>{
  const discountType=normalizeText(row.discount_type)
  const discountValue=Number(row.discount_value || 0)
  if(discountType&&discountValue>0)return normalizeDiscountAmount(baseTotal,discountType,discountValue)
  return Number(Math.min(baseTotal,Number(row.amount || 0)).toFixed(2))
}

const syncStoredBookingDiscountAmounts=async(bookingId:string,baseTotal:number)=>{
  const rows=await getStoredBookingDiscountRows(bookingId)
  let total=0
  for(const row of rows){
    const amount=normalizeStoredBookingDiscountAmount(row,baseTotal)
    total+=amount
    if(row.id&&Math.abs(Number(row.amount || 0)-amount)>=0.01){
      await adminClient.from('booking_discounts').update({ amount }).eq('id',String(row.id))
    }
  }
  return Number(Math.min(baseTotal,total).toFixed(2))
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

const syncBookingOperatorAssignmentAmount=async(bookingId:string,totalAmount:number)=>{
  const assignment=await safeMaybeSingle<Json>(
    adminClient.from('booking_operators').select('id,operator_id').eq('booking_id',bookingId).maybeSingle()
  )
  if(!assignment?.operator_id)return 0
  const operator=await safeMaybeSingle<Json>(
    adminClient.from('operators').select('*').eq('id',String(assignment.operator_id)).maybeSingle()
  )
  if(!operator)return 0
  const commissionAmount=normalizeDiscountAmount(Number(totalAmount || 0),String(operator.commission_type || 'percentage'),Number(operator.commission_value || 0))
  const { error }=await adminClient.from('booking_operators').update({ commission_amount:commissionAmount }).eq('id',String(assignment.id))
  if(error && !['42P01','PGRST205'].includes(String(error.code || '')))throw error
  return commissionAmount
}

const upsertBookingAgentAssignment=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  if(!bookingId)throw new Error('Booking is required for selling partner assignment.')
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('id,status,total_amount,metadata').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const agentId=normalizeText(payload.agent_id)
  if(!agentId){
    const deleteResult=await adminClient.from('booking_agents').delete().eq('booking_id',bookingId)
    if(deleteResult.error && !['42P01','PGRST205'].includes(String(deleteResult.error.code || '')))throw deleteResult.error
    await insertStatusHistory(bookingId,String(booking.status || ''),String(booking.status || ''),'Selling partner cleared',`admin:${userId}`,userId)
    await maybeCreateAutomatedOfficeSettlement(bookingId,userId)
    await syncReconciliationRecordForBooking(bookingId,userId)
    return { success:true, cleared:true }
  }
  const agent=await safeMaybeSingle<Json>(adminClient.from('agents').select('*').eq('id',agentId).maybeSingle())
  if(!agent)throw new Error('Selling partner not found.')
  const explicitCommission=Number(payload.commission_amount || 0)
  const commissionAmount=explicitCommission>0
    ? explicitCommission
    : normalizeDiscountAmount(Number(booking.total_amount || 0),String(agent.commission_type || 'percentage'),Number(agent.commission_value || 0))
  await maybeLinkBookingAgent(bookingId,agent,commissionAmount)
  await insertStatusHistory(bookingId,String(booking.status || ''),String(booking.status || ''),`Selling partner assigned to ${normalizeText(agent.company_name) || 'partner'}`,`admin:${userId}`,userId)
  await maybeCreateAutomatedOfficeSettlement(bookingId,userId)
  await syncReconciliationRecordForBooking(bookingId,userId)
  return { success:true, agent_id:agentId, commission_amount:commissionAmount }
}

const upsertBookingOperatorAssignment=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  if(!bookingId)throw new Error('Booking is required for operator assignment.')
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('id,status,total_amount').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const operatorId=normalizeText(payload.operator_id)
  if(!operatorId){
    const deleteResult=await adminClient.from('booking_operators').delete().eq('booking_id',bookingId)
    if(deleteResult.error && !['42P01','PGRST205'].includes(String(deleteResult.error.code || '')))throw deleteResult.error
    await insertStatusHistory(bookingId,String(booking.status || ''),String(booking.status || ''),'Operator assignment cleared',`admin:${userId}`,userId)
    await syncLifecycleTasks(bookingId,userId)
    return { success:true, cleared:true }
  }
  const operator=await safeMaybeSingle<Json>(adminClient.from('operators').select('*').eq('id',operatorId).maybeSingle())
  if(!operator)throw new Error('Operator not found.')
  const explicitCommission=Number(payload.commission_amount || 0)
  const commissionAmount=explicitCommission>0
    ? explicitCommission
    : normalizeDiscountAmount(Number(booking.total_amount || 0),String(operator.commission_type || 'percentage'),Number(operator.commission_value || 0))
  await maybeLinkBookingOperator(bookingId,operator,commissionAmount)
  await insertStatusHistory(bookingId,String(booking.status || ''),String(booking.status || ''),`Operator assigned to ${normalizeText(operator.company_name) || 'operator'}`,`admin:${userId}`,userId)
  await syncLifecycleTasks(bookingId,userId)
  await maybeCreateAutomatedOfficeSettlement(bookingId,userId)
  await syncReconciliationRecordForBooking(bookingId,userId)
  await enqueueSystemJob({
    job_type:'operator_settlement_check',
    job_group:'finance',
    priority:'high',
    booking_id:bookingId,
    created_by:userId
  })
  return { success:true, operator_id:operatorId, commission_amount:commissionAmount }
}

const createAdminNote=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  const note=normalizeText(payload.note)
  if(!note)throw new Error('A note is required.')
  const booking=bookingId
    ? await safeMaybeSingle<Json>(adminClient.from('bookings').select('id,customer_id').eq('id',bookingId).maybeSingle())
    : null
  if(bookingId && !booking)throw new Error('Booking not found.')
  const { data,error }=await adminClient.from('admin_notes').insert({
    booking_id:bookingId || null,
    customer_id:booking?.customer_id || null,
    admin_user_id:userId,
    note,
    is_private:payload.is_private!==false
  }).select().single()
  if(error)throw error
  return { success:true, note:data }
}

const buildLifecycleTaskBlueprints=(booking:Json,{ hasOperator, hasResources }:{ hasOperator:boolean, hasResources:boolean })=>{
  const status=normalizeText(booking.status)
  const paymentStatus=normalizeText(booking.payment_status)
  const outstanding=Math.max(0,Number(booking.amount_due_now || 0) + Number(booking.amount_due_later || 0))
  const preferredDate=parseDateValue(String(booking.preferred_date || ''))
  const now=new Date()
  const blueprints:{
    auto_key:string
    task_type:string
    title:string
    description:string
    team:string
    priority:'low'|'normal'|'high'|'critical'
    due_at:string | null
    sort_order:number
  }[]=[]

  if(['draft','pending'].includes(status)){
    blueprints.push({
      auto_key:'follow_up_review',
      task_type:'follow_up',
      title:'Review booking and confirm guest expectations',
      description:'Validate service details, guest notes, and brand source before moving the booking forward.',
      team:'reservations',
      priority:'high',
      due_at:addHours(now,6),
      sort_order:10
    })
  }

  if(['pending','unpaid','partially_paid','authorized'].includes(paymentStatus) && outstanding>0){
    blueprints.push({
      auto_key:'payment_chase',
      task_type:'payment_chase',
      title:'Chase outstanding payment',
      description:`Outstanding balance of ${outstanding.toFixed(2)} is still open on the booking.`,
      team:'finance',
      priority:status==='awaiting_payment' ? 'critical' : 'high',
      due_at:addHours(now,12),
      sort_order:20
    })
  }

  if(status==='confirmed' && !hasOperator){
    blueprints.push({
      auto_key:'supplier_confirm',
      task_type:'supplier_confirm',
      title:'Assign and confirm operator',
      description:'The booking is confirmed but no operator has been assigned yet.',
      team:'supplier_management',
      priority:'critical',
      due_at:preferredDate ? addHours(preferredDate,-24) : addHours(now,8),
      sort_order:30
    })
  }

  if(status==='confirmed' && preferredDate && !hasResources){
    blueprints.push({
      auto_key:'pickup_reconfirm',
      task_type:'pickup_reconfirm',
      title:'Reconfirm pickup and resources',
      description:'Verify driver, vehicle, guide, and pickup notes before the tour departs.',
      team:'operations',
      priority:'high',
      due_at:addHours(preferredDate,-18),
      sort_order:40
    })
  }

  if(['refunded','cancelled'].includes(status) || paymentStatus==='refunded'){
    blueprints.push({
      auto_key:'refund_review',
      task_type:'refund_review',
      title:'Review refund and cancellation trail',
      description:'Confirm finance entries, guest communication, and settlement impact.',
      team:'finance',
      priority:'normal',
      due_at:addHours(now,24),
      sort_order:50
    })
  }

  return blueprints
}

const syncLifecycleTasks=async(bookingId:string,userId:string | null='')=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,status,payment_status,preferred_date,amount_due_now,amount_due_later')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)return []
  const [assignment,allocations,existingTasks]=await Promise.all([
    safeMaybeSingle<Json>(adminClient.from('booking_operators').select('id').eq('booking_id',bookingId).maybeSingle()),
    safeTableSelect<Json>(adminClient.from('resource_allocations').select('id').eq('booking_id',bookingId),[]),
    safeTableSelect<Json>(adminClient.from('booking_tasks').select('*').eq('booking_id',bookingId),[])
  ])
  const desired=buildLifecycleTaskBlueprints(booking,{
    hasOperator:Boolean(assignment?.id),
    hasResources:allocations.length>0
  })
  const desiredKeys=new Set(desired.map(item=>item.auto_key))
  const existingByKey=new Map(existingTasks.map(task=>[normalizeText(task.metadata?.auto_key),task]))

  for(const task of desired){
    const existingTask=existingByKey.get(task.auto_key)
    if(existingTask){
      if(normalizeText(existingTask.status)==='cancelled'){
        const reopenResult=await adminClient.from('booking_tasks').update({
          status:'open',
          due_at:task.due_at,
          team:task.team,
          priority:task.priority,
          title:task.title,
          description:task.description,
          updated_by:safeUuid(userId)
        }).eq('id',existingTask.id)
        if(reopenResult.error && !['42P01','PGRST205'].includes(String(reopenResult.error.code || '')))throw reopenResult.error
      }
      continue
    }
    const insertResult=await adminClient.from('booking_tasks').insert({
      booking_id:bookingId,
      task_type:task.task_type,
      title:task.title,
      description:task.description,
      team:task.team,
      priority:task.priority,
      status:'open',
      due_at:task.due_at,
      sort_order:task.sort_order,
      metadata:{ auto_generated:true, auto_key:task.auto_key },
      created_by:safeUuid(userId),
      updated_by:safeUuid(userId)
    })
    if(insertResult.error && !['42P01','PGRST205'].includes(String(insertResult.error.code || '')))throw insertResult.error
  }

  for(const task of existingTasks){
    const autoKey=normalizeText(task.metadata?.auto_key)
    if(!autoKey || task.metadata?.auto_generated!==true)continue
    if(desiredKeys.has(autoKey))continue
    if(normalizeText(task.status)!=='open')continue
    const cancelResult=await adminClient.from('booking_tasks').update({
      status:'cancelled',
      completed_at:nowIso(),
      completed_by:safeUuid(userId),
      updated_by:safeUuid(userId)
    }).eq('id',task.id)
    if(cancelResult.error && !['42P01','PGRST205'].includes(String(cancelResult.error.code || '')))throw cancelResult.error
  }

  return desired
}

const createBookingTask=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  if(!bookingId)throw new Error('Booking is required for task creation.')
  const { data:task,error }=await adminClient.from('booking_tasks').insert({
    booking_id:bookingId,
    task_type:normalizeText(payload.task_type) || 'follow_up',
    title:normalizeText(payload.title),
    description:normalizeText(payload.description),
    team:normalizeText(payload.team) || 'reservations',
    priority:normalizeText(payload.priority) || 'normal',
    status:normalizeText(payload.status) || 'open',
    due_at:payload.due_at || null,
    sort_order:Number(payload.sort_order || 0),
    assigned_user_id:safeUuid(payload.assigned_user_id),
    metadata:typeof payload.metadata==='object' && payload.metadata ? payload.metadata : {},
    created_by:safeUuid(userId),
    updated_by:safeUuid(userId),
    completed_at:normalizeText(payload.status)==='done' ? nowIso() : null,
    completed_by:normalizeText(payload.status)==='done' ? safeUuid(userId) : null
  }).select().single()
  if(error)throw error
  return { success:true, task }
}

const updateBookingTask=async(taskId:string,payload:Json,userId:string)=>{
  const updatePayload:Json={ updated_by:safeUuid(userId) }
  if(Object.prototype.hasOwnProperty.call(payload,'title'))updatePayload.title=normalizeText(payload.title)
  if(Object.prototype.hasOwnProperty.call(payload,'description'))updatePayload.description=normalizeText(payload.description)
  if(Object.prototype.hasOwnProperty.call(payload,'team'))updatePayload.team=normalizeText(payload.team)
  if(Object.prototype.hasOwnProperty.call(payload,'priority'))updatePayload.priority=normalizeText(payload.priority)
  if(Object.prototype.hasOwnProperty.call(payload,'due_at'))updatePayload.due_at=payload.due_at || null
  if(Object.prototype.hasOwnProperty.call(payload,'assigned_user_id'))updatePayload.assigned_user_id=safeUuid(payload.assigned_user_id)
  if(Object.prototype.hasOwnProperty.call(payload,'status')){
    updatePayload.status=normalizeText(payload.status) || 'open'
    updatePayload.completed_at=normalizeText(payload.status)==='done' ? nowIso() : null
    updatePayload.completed_by=normalizeText(payload.status)==='done' ? safeUuid(userId) : null
  }
  const { data:task,error }=await adminClient.from('booking_tasks').update(updatePayload).eq('id',taskId).select().single()
  if(error)throw error
  return { success:true, task }
}

const logBookingDocument=async(payload:Json,userId:string)=>{
  return createStoredBookingDocument(payload,userId)
}

const createPortalRequest=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  if(!bookingId)throw new Error('Booking is required for portal requests.')
  const { data:portalRequest,error }=await adminClient.from('booking_portal_requests').insert({
    booking_id:bookingId,
    request_type:normalizeText(payload.request_type) || 'request_change',
    status:normalizeText(payload.status) || 'open',
    message:normalizeText(payload.message),
    attachment_url:normalizeText(payload.attachment_url) || null,
    metadata:typeof payload.metadata==='object' && payload.metadata ? payload.metadata : {},
    created_by:safeUuid(userId)
  }).select().single()
  if(error)throw error
  return { success:true, portal_request:portalRequest }
}

const syncInvoiceForBooking=async(bookingId:string)=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,payment_status,preferred_date,subtotal_amount,tax_amount,service_fee_amount,total_amount,currency_code,amount_due_now,amount_due_later,service_id,quantity,adult_quantity,child_quantity')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)return
  const service=await safeMaybeSingle<Json>(adminClient.from('services').select('name,adult_price,child_price').eq('id',booking.service_id).maybeSingle())
  const existingInvoice=await safeMaybeSingle<{ invoice_number:string, issued_at:string | null }>(adminClient.from('invoices').select('invoice_number,issued_at').eq('booking_id',bookingId).maybeSingle())
  const brandProfile=await getBrandByCode(normalizeText(booking.brand_code) || 'true-travel')
  const invoicePrefix=normalizeInvoicePrefix(brandProfile.invoice_prefix || brandProfile.booking_prefix || 'SB','SB')
  const invoiceNumber=normalizeText(existingInvoice?.invoice_number) || await reserveInvoiceNumber('guest_invoice',normalizeText(booking.brand_code) || 'true-travel',invoicePrefix,bookingId)
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
    issued_at:existingInvoice?.issued_at || nowIso(),
    due_at:booking.preferred_date || null,
    currency_code:String(booking.currency_code || 'NAD'),
    subtotal_amount:Number(booking.subtotal_amount || 0),
    tax_amount:Number(booking.tax_amount || 0),
    total_amount:Number(booking.total_amount || 0),
    balance_amount:String(booking.payment_status)==='paid'
      ? 0
      : Number((Number(booking.amount_due_now || 0) + Number(booking.amount_due_later || 0) || Number(booking.total_amount || 0))),
    metadata:{ source:'booking-api', brand_code:booking.brand_code, invoice_prefix:invoicePrefix }
  }
  const { data:invoice,error:invoiceError }=await adminClient.from('invoices').upsert(invoicePayload,{ onConflict:'booking_id' }).select().single()
  if(invoiceError && !['42P01','PGRST205'].includes(String(invoiceError.code || '')))throw invoiceError
  if(!invoice?.id)return
  await adminClient.from('invoice_items').delete().eq('invoice_id',invoice.id)
  const discountAmount=Number(Math.max(0,Number(booking.subtotal_amount || 0)+Number(booking.tax_amount || 0)+Number(booking.service_fee_amount || 0)-Number(booking.total_amount || 0)).toFixed(2))
  // Split the service line into Adult / Child rows when the per-pax prices reconstruct the stored
  // subtotal exactly. The exact-match guard keeps overridden or discounted bookings on a single
  // blended line so the invoice items always sum to subtotal_amount.
  const invAdultQty=Number(booking.adult_quantity || 0)
  const invChildQty=Number(booking.child_quantity || 0)
  const invAdultPrice=service?.adult_price!=null ? Number(service.adult_price) : null
  const invChildPrice=service?.child_price!=null ? Number(service.child_price) : null
  const invSplitSubtotal=invAdultPrice!=null ? Number(((invAdultQty*(invAdultPrice||0))+(invChildQty*(invChildPrice||0))).toFixed(2)) : null
  const invUseSplit=invAdultPrice!=null && (invAdultQty+invChildQty)>0 && Math.abs(Number(invSplitSubtotal||0)-Number(booking.subtotal_amount||0))<0.01
  const serviceInvoiceLines=invUseSplit
    ? [
        invAdultQty>0 ? { invoice_id:invoice.id, description:`${String(service?.name || 'Booking service')} — Adult`, quantity:invAdultQty, unit_price:Number((invAdultPrice||0).toFixed(2)), line_total:Number((invAdultQty*(invAdultPrice||0)).toFixed(2)), metadata:{ booking_reference:booking.reference } } : null,
        invChildQty>0 ? { invoice_id:invoice.id, description:`${String(service?.name || 'Booking service')} — Child (4–12)`, quantity:invChildQty, unit_price:Number((invChildPrice||0).toFixed(2)), line_total:Number((invChildQty*(invChildPrice||0)).toFixed(2)), metadata:{ booking_reference:booking.reference } } : null
      ].filter(Boolean) as Array<Record<string,unknown>>
    : [{
        invoice_id:invoice.id,
        description:String(service?.name || 'Booking service'),
        quantity:Number(booking.quantity || 1),
        unit_price:Number(booking.subtotal_amount || 0) / Math.max(1,Number(booking.quantity || 1)),
        line_total:Number(booking.subtotal_amount || 0),
        metadata:{ booking_reference:booking.reference }
      }]
  const invoiceItems=[
    ...serviceInvoiceLines,
    ...(discountAmount>0 ? [{
      invoice_id:invoice.id,
      description:'Booking discount',
      quantity:1,
      unit_price:Number((0-discountAmount).toFixed(2)),
      line_total:Number((0-discountAmount).toFixed(2)),
      metadata:{ booking_reference:booking.reference, item_type:'discount' }
    }] : [])
  ]
  const insertResult=await adminClient.from('invoice_items').insert(invoiceItems)
  if(insertResult.error && !['42P01','PGRST205'].includes(String(insertResult.error.code || '')))throw insertResult.error
}

const issueClientInvoice=async(bookingId:string,userId:string)=>{
  await syncInvoiceForBooking(bookingId)
  const invoice=await safeMaybeSingle<Json>(adminClient.from('invoices').select('*').eq('booking_id',bookingId).maybeSingle())
  if(!invoice)throw new Error('Unable to create client invoice for this booking.')
  const documentResult=await createStoredBookingDocument({
    booking_id:bookingId,
    document_type:'guest_invoice',
    title:'Client Invoice',
    document_number:normalizeText(invoice.invoice_number),
    summary:'Client invoice issued from SkyBook.',
    metadata:{
      invoice_id:invoice.id,
      generated_in:'client_invoice_action'
    }
  },userId)
  return { success:true, invoice, ...documentResult }
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

const UUID_RE=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const resolveBookingByIdOrReference=async(value:string):Promise<Json>=>{
  const raw=String(value||'').trim()
  if(!raw)throw new Error('A booking ID or reference is required.')
  if(UUID_RE.test(raw)){
    const byId=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',raw).maybeSingle())
    if(byId)return byId
  }
  const byRef=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').ilike('reference',raw).maybeSingle())
  if(byRef)return byRef
  throw new Error(`No booking found for "${raw}".`)
}
const createRefund=async(bookingIdOrRef:string,payload:Json,userId:string)=>{
  const booking=await resolveBookingByIdOrReference(bookingIdOrRef)
  const bookingId=String(booking.id)
  const payment=await safeMaybeSingle<Json>(adminClient.from('payments').select('*').eq('booking_id',bookingId).maybeSingle())
  const amountPaid=Number(Math.max(0,Number(payment?.amount_received || payment?.amount || 0)))
  const requested=Math.max(0,Number(payload.amount || booking.total_amount || 0))
  if(amountPaid<=0)throw new Error('Nothing has been paid on this booking, so there is nothing to refund.')
  const amount=Number(Math.min(requested,amountPaid).toFixed(2))
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
  await syncLifecycleTasks(bookingId,userId)
  await syncReconciliationRecordForBooking(bookingId,userId)
  return { success:true, refund }
}

const repriceBookingFromStoredDiscounts=async(bookingId:string,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,brand_code,service_id,quantity,adult_quantity,child_quantity,payment_status,currency_code')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)throw new Error('Booking not found.')
  const service=(await fetchServices({ includeInactive:true, brandCode:normalizeText(booking.brand_code) || '' }))
    .find(item=>String(item.id)===String(booking.service_id))
  if(!service)throw new Error('Service not found.')
  const settings=await getSettingValue('config',{
    currency:'NAD',
    paymentMode:'deposit',
    defaultDepositValue:30,
    taxRate:0,
    serviceFee:0
  })
  // Carry the pax split so repricing a split-priced booking (after a discount change) keeps the
  // adult/child total instead of collapsing to base_price × quantity.
  const pricingPayload={ quantity:Number(booking.quantity || 1), adult_quantity:Number(booking.adult_quantity || 0), child_quantity:Number(booking.child_quantity || 0) }
  const basePricing=calculatePricing(service,pricingPayload,settings as Json)
  const discountAmount=await syncStoredBookingDiscountAmounts(bookingId,basePricing.totalAmount)
  const pricing=calculatePricing(service,pricingPayload,settings as Json,discountAmount)
  const outstandingAmounts=resolveOutstandingAmounts(pricing,normalizeText(booking.payment_status) || 'pending')
  const { error }=await adminClient.from('bookings').update({
    subtotal_amount:pricing.subtotalAmount,
    addons_amount:0-pricing.discountAmount,
    tax_amount:pricing.taxAmount,
    service_fee_amount:pricing.serviceFeeAmount,
    total_amount:pricing.totalAmount,
    amount_due_now:outstandingAmounts.amountDueNow,
    amount_due_later:outstandingAmounts.amountDueLater,
    updated_by:userId
  }).eq('id',bookingId)
  if(error)throw error
  await syncBookingItems(bookingId,service,pricing)
  await syncBookingOperatorAssignmentAmount(bookingId,Number(pricing.totalAmount || 0))
  await syncInvoiceForBooking(bookingId)
  await maybeCreateAutomatedOfficeSettlement(bookingId,userId)
  await syncReconciliationRecordForBooking(bookingId,userId)
  return pricing
}

const upsertManualBookingDiscount=async(bookingId:string,payload:Json,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,status,total_amount,brand_code')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)throw new Error('Booking not found.')
  const consultantComment=normalizeText(payload.consultant_comment || payload.comment)
  if(!consultantComment)throw new Error('A consultant comment is required for booking discounts.')
  const clearDiscount=payload.clear===true || normalizeText(payload.action)==='clear'
  const deleteExisting=await adminClient.from('booking_discounts').delete().eq('booking_id',bookingId).eq('source_type','manual')
  if(deleteExisting.error && !['42P01','PGRST205'].includes(String(deleteExisting.error.code || '')))throw deleteExisting.error
  let discount:Json | null=null
  if(!clearDiscount){
    const discountType=normalizeText(payload.discount_type) || 'percentage'
    if(!['percentage','fixed'].includes(discountType))throw new Error('Discount type must be percentage or fixed.')
    const discountValue=Number(payload.discount_value || 0)
    if(discountValue<=0)throw new Error('Discount value must be greater than zero.')
    const amount=normalizeDiscountAmount(Number(booking.total_amount || 0),discountType,discountValue)
    const insert=await safeMaybeSingle<Json>(
      adminClient
        .from('booking_discounts')
        .insert({
          booking_id:bookingId,
          source_type:'manual',
          source_id:null,
          code:'MANUAL',
          description:normalizeText(payload.description) || 'Consultant booking discount',
          amount,
          discount_type:discountType,
          discount_value:discountValue,
          consultant_comment:consultantComment,
          created_by:safeUuid(userId)
        })
        .select()
        .single()
    )
    discount=insert
  }
  const pricing=await repriceBookingFromStoredDiscounts(bookingId,userId)
  await insertStatusHistory(
    bookingId,
    String(booking.status || ''),
    String(booking.status || ''),
    clearDiscount ? 'Manual booking discount cleared' : `Manual booking discount applied: ${consultantComment}`,
    `admin:${userId}`,
    userId
  )
  await createAdminNote({
    booking_id:bookingId,
    note:clearDiscount ? `Manual booking discount cleared: ${consultantComment}` : `Manual booking discount applied: ${consultantComment}`,
    is_private:true
  },userId)
  return { success:true, discount, pricing }
}

const createOfficeInvoice=async(payload:Json,userId:string)=>{
  const bookingId=normalizeText(payload.booking_id)
  const invoiceType=normalizeText(payload.invoice_type) || 'operator_commission'
  const payeeType=normalizeText(payload.payee_type) || 'operator'
  const booking=bookingId
    ? await safeMaybeSingle<Json>(adminClient.from('bookings').select('id,reference,brand_code,total_amount,currency_code,service_id').eq('id',bookingId).maybeSingle())
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
  const subtotalAmount=Object.prototype.hasOwnProperty.call(payload,'subtotal_amount')
    ? Number(payload.subtotal_amount || 0)
    : (['agent','operator'].includes(payeeType) ? 0 : commissionBase || 0)
  const taxAmount=Number(payload.tax_amount || 0)
  const totalAmount=Number((subtotalAmount + commissionAmount + taxAmount).toFixed(2))
  const officeBrandCode=normalizeText(booking?.brand_code || payload.brand_code) || 'true-travel'
  const brandProfile=await getBrandByCode(officeBrandCode)
  const invoicePrefix=normalizeInvoicePrefix(brandProfile.invoice_prefix || brandProfile.booking_prefix || 'SB','SB')
  const invoiceNumber=normalizeText(payload.invoice_number) || await reserveInvoiceNumber('office_invoice',officeBrandCode,invoicePrefix,bookingId)
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
    metadata:{ actor_user_id:safeUuid(userId), source:'booking-api' }
  }).select().single()
  if(error)throw error
  const itemDescription=normalizeText(payload.line_description) || (
    payeeType==='agent'
      ? 'Agent commission payable'
      : payeeType==='operator'
        ? 'Operator / supplier payable'
        : 'Internal settlement'
  )
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
  if(bookingId)await syncReconciliationRecordForBooking(bookingId,userId)
  return { success:true, office_invoice:invoice }
}

const maybeCreateAutomatedOfficeSettlement=async(bookingId:string,userId:string | null='')=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,status,total_amount,currency_code,metadata')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)return null
  if(!['confirmed','completed'].includes(normalizeText(booking.status)))return null
  const commercials=normalizeJsonRecord((booking.metadata as Json)?.commercials)
  const sellingModel=normalizeText(commercials.selling_model)
  const operatorAssignment=await safeMaybeSingle<Json>(adminClient.from('booking_operators').select('*').eq('booking_id',bookingId).maybeSingle())
  const agentAssignment=await safeMaybeSingle<Json>(adminClient.from('booking_agents').select('*').eq('booking_id',bookingId).maybeSingle())
  let latestInvoice:Json | null=null
  if(operatorAssignment?.operator_id && Number(operatorAssignment.commission_amount || 0)>0){
    const existingOperatorInvoice=await safeMaybeSingle<Json>(
      adminClient
        .from('office_invoices')
        .select('id,status')
        .eq('booking_id',bookingId)
        .in('invoice_type',['supplier_payable','operator_commission'])
        .neq('status','cancelled')
        .maybeSingle()
    )
    if(existingOperatorInvoice?.id){
      const nextAmount=Number(operatorAssignment.commission_amount || 0)
      if(['draft','issued','approved'].includes(normalizeText(existingOperatorInvoice.status) || 'issued')){
        const updateInvoice=await adminClient.from('office_invoices').update({
          commission_amount:nextAmount,
          total_amount:nextAmount,
          updated_at:nowIso()
        }).eq('id',String(existingOperatorInvoice.id))
        if(updateInvoice.error && !['42P01','PGRST205'].includes(String(updateInvoice.error.code || '')))throw updateInvoice.error
        const deleteItems=await adminClient.from('office_invoice_items').delete().eq('office_invoice_id',String(existingOperatorInvoice.id))
        if(deleteItems.error && !['42P01','PGRST205'].includes(String(deleteItems.error.code || '')))throw deleteItems.error
        const insertItem=await adminClient.from('office_invoice_items').insert({
          office_invoice_id:String(existingOperatorInvoice.id),
          description:'Operator / supplier payable',
          quantity:1,
          unit_price:nextAmount,
          line_total:nextAmount,
          metadata:{ booking_reference:booking.reference || '' }
        })
        if(insertItem.error && !['42P01','PGRST205'].includes(String(insertItem.error.code || '')))throw insertItem.error
      }
      latestInvoice=existingOperatorInvoice
    }else{
      const result=await createOfficeInvoice({
        booking_id:bookingId,
        operator_id:operatorAssignment.operator_id,
        invoice_type:'supplier_payable',
        payee_type:'operator',
        subtotal_amount:0,
        commission_base_amount:Number(booking.total_amount || 0),
        commission_amount:Number(operatorAssignment.commission_amount || 0),
        currency_code:String(booking.currency_code || 'NAD'),
        notes:'Auto-generated operating partner payable from booking confirmation/completion.'
      },String(userId || ''))
      latestInvoice=result.office_invoice || latestInvoice
    }
  }
  if(agentAssignment?.agent_id && sellingModel==='gross_commission' && Number(agentAssignment.commission_amount || 0)>0){
    const existingAgentInvoice=await safeMaybeSingle<Json>(
      adminClient
        .from('office_invoices')
        .select('id')
        .eq('booking_id',bookingId)
        .eq('invoice_type','agent_commission')
        .neq('status','cancelled')
        .maybeSingle()
    )
    if(!existingAgentInvoice?.id){
      const result=await createOfficeInvoice({
        booking_id:bookingId,
        agent_id:agentAssignment.agent_id,
        invoice_type:'agent_commission',
        payee_type:'agent',
        subtotal_amount:0,
        commission_base_amount:Number(booking.total_amount || 0),
        commission_amount:Number(agentAssignment.commission_amount || 0),
        currency_code:String(booking.currency_code || 'NAD'),
        notes:'Auto-generated selling partner commission from booking confirmation/completion.'
      },String(userId || ''))
      latestInvoice=result.office_invoice || latestInvoice
    }
  }
  return latestInvoice
}

const buildReports=({
  bookings,
  payments,
  invoices,
  officeInvoices,
  refunds
}:{ bookings:Json[], payments:Json[], invoices:Json[], officeInvoices:Json[], refunds:Json[] })=>{
  const isCancelledBooking=(booking:Json)=>['cancelled','refunded'].includes(normalizeText(booking.status)) || normalizeText(booking.payment_status)==='cancelled'
  const liveBookings=bookings.filter(booking=>!isCancelledBooking(booking))
  const liveBookingIds=new Set(liveBookings.map(booking=>String(booking.id || '')))
  const livePayments=payments.filter(payment=>liveBookingIds.has(String(payment.booking_id || '')))
  const liveInvoices=invoices.filter(invoice=>liveBookingIds.has(String(invoice.booking_id || '')))
  const liveOfficeInvoices=officeInvoices.filter(invoice=>!invoice.booking_id || liveBookingIds.has(String(invoice.booking_id || '')))
  const liveRefunds=refunds.filter(refund=>!refund.booking_id || liveBookingIds.has(String(refund.booking_id || '')))
  const grossRevenue=liveBookings.reduce((sum,booking)=>sum+Number(booking.total_amount || 0),0)
  const paidRevenue=livePayments
    .filter(payment=>['paid','partially_paid'].includes(String(payment.status || '')))
    .reduce((sum,payment)=>sum+Number(payment.amount_received || payment.amount || 0),0)
  const refundExposure=liveRefunds.reduce((sum,refund)=>sum+Number(refund.amount || 0),0)
  const guestOutstanding=liveInvoices
    .filter(invoice=>!['paid','cancelled','refunded'].includes(String(invoice.status || '')))
    .reduce((sum,invoice)=>sum+Number(invoice.balance_amount || 0),0)
  const officePayables=liveOfficeInvoices
    .filter(invoice=>!['paid','cancelled'].includes(String(invoice.status || '')))
    .reduce((sum,invoice)=>sum+Number(invoice.total_amount || 0),0)
  const statusBreakdown=['provisional','payment_pending','invoice','invoiced','partially_paid','fully_paid','finalised','cancelled'].map(status=>({
    status,
    count:bookings.filter(booking=>String(booking.status || '')===status).length
  }))
  return {
    overview:{
      total_bookings:liveBookings.length,
      cancelled_bookings:bookings.length-liveBookings.length,
      gross_revenue:Number(grossRevenue.toFixed(2)),
      paid_revenue:Number(paidRevenue.toFixed(2)),
      guest_outstanding:Number(guestOutstanding.toFixed(2)),
      office_payables:Number(officePayables.toFixed(2)),
      refund_exposure:Number(refundExposure.toFixed(2))
    },
    status_breakdown:statusBreakdown,
    recent_guest_invoices:liveInvoices.slice(0,8),
    recent_office_invoices:liveOfficeInvoices.slice(0,8),
    recent_refunds:liveRefunds.slice(0,8)
  }
}

const sendNewBookingPush=async(info:{guestName:string, brandLabel:string, serviceName:string, bookingId:string})=>{
  // Best-effort push for new GUEST bookings. Never throws — a push failure must not
  // affect the booking. No-ops until the OneSignal secrets are configured.
  try{
    const appId=normalizeText(Deno.env.get('ONESIGNAL_APP_ID'))
    const restKey=normalizeText(Deno.env.get('ONESIGNAL_REST_API_KEY'))
    if(!appId||!restKey)return // feature dark until configured
    const launchUrl=`https://skybook-8rd.pages.dev/booking-admin.html?tab=bookings&booking=${encodeURIComponent(info.bookingId)}&view=booking`
    const body={
      app_id:appId,
      // This OneSignal app's default broadcast segment is "Total Subscriptions"
      // (newer naming). The legacy "Subscribed Users" segment is empty here and
      // returns "All included players are not subscribed".
      included_segments:['Total Subscriptions'],
      headings:{ en:`New ${info.brandLabel} booking` },
      contents:{ en:`${info.guestName}${info.serviceName?` · ${info.serviceName}`:''}` },
      // Sent as custom data (not top-level `url`) so the Android app opens the
      // booking inside its own WebView instead of the system browser.
      data:{ open_url:launchUrl },
      // web_url is WEB-ONLY: makes a tap on the iPad PWA / desktop browser open
      // the booking. The native Android app ignores it (it uses data.open_url).
      web_url:launchUrl
    }
    // Newer OneSignal keys (os_v2_...) use "Key", legacy keys use "Basic".
    const authHeader=restKey.startsWith('os_v2_') ? `Key ${restKey}` : `Basic ${restKey}`
    const res=await fetch('https://api.onesignal.com/notifications',{
      method:'POST',
      headers:{ 'Content-Type':'application/json', 'Authorization':authHeader },
      body:JSON.stringify(body)
    })
    if(!res.ok){
      const txt=await res.text().catch(()=> '')
      console.error('OneSignal push failed',res.status,txt)
    }
  }catch(err){
    console.error('OneSignal push error',err instanceof Error ? err.message : String(err))
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
  let bookingPersisted=false
  try{
  const pricing=calculatePricing(service,payload,settings as Json,promotionState.totalDiscountAmount)
  const requestMetadata=(payload.metadata && typeof payload.metadata==='object' && !Array.isArray(payload.metadata) ? payload.metadata : {}) as Json
  await validateCustomBookingFields(String(brand.code || brandCode),requestMetadata,true)
  const requestSource=normalizeText(payload.source) || normalizeText(requestMetadata.source)
  const bookingSource=requestSource || (isAdmin ? 'admin' : 'website')
  const customerSnapshot=buildBookingCustomerSnapshot(payload.customer as Json||{})
  const customer=await upsertCustomer(payload.customer as Json||{},{
    brandCode:String(brand.code || brandCode),
    bookingSource,
    sourcePage:normalizeText(payload.source_page) || normalizeText(requestMetadata.source_page),
    createdVia:normalizeText(payload.created_via) || normalizeText(requestMetadata.created_via) || (isAdmin ? 'skybook_admin' : 'website'),
    notes:normalizeText(((payload.customer as Json)||{}).notes) || normalizeText(payload.notes)
  })
  const requestedReference=normalizeBookingReference(payload.reference)
  const bookingPrefix=String(brand.booking_prefix || 'TT')
  if(requestedReference && await bookingReferenceExists(requestedReference)){
    throw new Error('Booking reference already exists. Please use a unique reference.')
  }
  let reference=requestedReference || await createUniqueBookingReference(bookingPrefix)
  const desiredStatus=normalizeText(payload.status)
  const desiredPaymentStatus=normalizeText(payload.payment_status)
  const selectedPaymentProvider=normalizeText(payload.payment_provider || payload.provider) || 'manual_eft'
  const priceOverrideCreate=Number(payload.price_override||requestMetadata.price_override||0)
  const finalPricingCreate=priceOverrideCreate>0
    ? {...pricing,totalAmount:priceOverrideCreate,subtotalAmount:priceOverrideCreate,amountDueNow:priceOverrideCreate,amountDueLater:0,taxAmount:0,serviceFeeAmount:0,discountAmount:0}
    : pricing
  const bookingStatus=(['provisional','finalised','cancelled'].includes(desiredStatus) ? desiredStatus : null) || (isAdmin ? 'finalised' : 'provisional')
  // Payment Process: payment_status now directly holds the settlement method (cash/card/eft/voucher/foc)
  // or blank if not yet recorded. New bookings — admin or website — always start unpaid unless the
  // caller explicitly supplied a method.
  const paymentStatus=desiredPaymentStatus || ''
  const outstandingAmounts=resolveOutstandingAmounts(finalPricingCreate,paymentStatus)
  const buildBookingInsert=(nextReference:string)=>({
    reference:nextReference,
    brand_code:String(brand.code || brandCode),
    customer_id:customer.id,
    service_id:service.id,
    status:bookingStatus,
    payment_status:paymentStatus,
    source:bookingSource,
    preferred_date:normalizeText(payload.preferred_date) || null,
    confirmed_date:bookingStatus==='finalised' ? (normalizeText(payload.preferred_date)||null) : null,
    quantity:finalPricingCreate.quantity,
    adult_quantity:Number(payload.adult_quantity||0),
    child_quantity:Number(payload.child_quantity||0),
    infant_quantity:Number(payload.infant_quantity||requestMetadata.infant_quantity||0),
    currency_code:service.currency,
    subtotal_amount:finalPricingCreate.subtotalAmount,
    addons_amount:0-finalPricingCreate.discountAmount,
    tax_amount:finalPricingCreate.taxAmount,
    service_fee_amount:finalPricingCreate.serviceFeeAmount,
    total_amount:finalPricingCreate.totalAmount,
    amount_due_now:outstandingAmounts.amountDueNow,
    amount_due_later:outstandingAmounts.amountDueLater,
    customer_notes:normalizeText(payload.notes),
    lookup_email:customer.email,
    metadata:{
      ...requestMetadata,
      ...(normalizeText(payload.guide_name) ? {guide_name:normalizeText(payload.guide_name)} : {}),
      source:bookingSource,
      brand_code:String(brand.code || brandCode),
      source_page:normalizeText(payload.source_page) || normalizeText(requestMetadata.source_page),
      created_via:normalizeText(payload.created_via) || normalizeText(requestMetadata.created_via) || (isAdmin ? 'skybook_admin' : 'website'),
      customer_snapshot:customerSnapshot
    }
  })

  let booking:Json | null=null
  let lastInsertError:unknown=null
  for(let attempt=0;attempt<6;attempt+=1){
    const { data,error }=await adminClient.from('bookings').insert(buildBookingInsert(reference)).select().single()
    if(!error){
      booking=data
      break
    }
    lastInsertError=error
    if(isUniqueViolation(error)&&!requestedReference){
      reference=await createUniqueBookingReference(bookingPrefix)
      continue
    }
    if(isUniqueViolation(error)&&requestedReference){
      throw new Error('Booking reference already exists. Please use a unique reference.')
    }
    throw new Error((error as {message?:string})?.message || 'Booking insert failed.')
  }
  if(!booking)throw new Error(((lastInsertError as {message?:string})?.message) || 'Unable to create booking with a unique reference.')
  const bookingId=String(booking.id || '')
  if(!bookingId)throw new Error('Booking was created without an id.')
  bookingPersisted=true

  await syncBookingItems(bookingId,service,pricing)
  await createOrUpdatePayment(
    bookingId,
    paymentStatus,
    paymentStatus==='paid' ? pricing.totalAmount : outstandingAmounts.amountDueNow,
    service.currency,
    selectedPaymentProvider
  )
  await maybeCreateBookingDiscounts(bookingId,promotionState.discounts)
  if(promotionState.couponReserved){
    const auditInsert=await adminClient.from('coupon_redemptions').insert({
      coupon_id:promotionState.couponReserved.id,
      booking_id:bookingId,
      brand_code:brandCode,
      amount:promotionState.couponReserved.amount
    })
    if(auditInsert.error && !String(auditInsert.error.code||'').includes('23505')){
      console.error('coupon_redemptions insert failed',auditInsert.error.message)
    }
  }
  const voucherDiscount=promotionState.discounts.find(item=>item.source_type==='voucher')?.amount || 0
  const agentDiscount=promotionState.discounts.find(item=>item.source_type==='agent')?.amount || 0
  await maybeApplyVoucherRedemption(bookingId,promotionState.voucherRow,voucherDiscount)
  await maybeLinkBookingAgent(bookingId,promotionState.agentRow,agentDiscount)
  await maybeAllocateResources(bookingId,String(service.id || ''),normalizeText(payload.preferred_date),pricing.quantity)
  await insertStatusHistory(bookingId,null,bookingStatus,isAdmin ? 'Booking created in admin' : `Booking created via ${bookingSource}`,isAdmin ? 'admin' : bookingSource,userId||null)
  await syncInvoiceForBooking(bookingId)
  await syncLifecycleTasks(bookingId,userId || null)
  await maybeCreateAutomatedOfficeSettlement(bookingId,userId || null)
  await syncReconciliationRecordForBooking(bookingId,userId || null)
  await enqueueBookingEmailJob({
    bookingId,
    customerId:customer.id,
    templateKey:'booking_received',
    priority:'high',
    createdBy:userId || null
  })
  await enqueueBookingEmailJob({
    bookingId,
    customerId:customer.id,
    templateKey:'consultant_alert',
    priority:'high',
    createdBy:userId || null
  })
  const consultantWhatsApp=normalizeText(brand.support_whatsapp) || '+264813224270'
  const waMeta=normalizeJsonRecord(requestMetadata)
  const waOpDetails=normalizeJsonRecord(waMeta.operational_details??waMeta)
  const waAdults=Number(payload.adult_quantity||0)
  const waChildren=Number(payload.child_quantity||0)
  const waPaxLabel=waAdults+waChildren>0 ? `${waAdults+waChildren} (${waAdults} adult${waAdults!==1?'s':''}, ${waChildren} child${waChildren!==1?'ren':''})` : String(pricing.quantity||1)
  const waLines=[
    `New ${normalizeText(brand.name)||'True Travel'} booking!`,
    '',
    `Customer: ${normalizeText(customer.full_name)||'Guest'}`,
    `Phone: ${normalizeText(customer.phone)||'Not provided'}`,
    normalizeText(customer.email) ? `Email: ${normalizeText(customer.email)}` : '',
    `Tour: ${normalizeText(service.name)||'Service'}`,
    `Date: ${normalizeText(payload.preferred_date)||'TBC'}`,
    `Guests: ${waPaxLabel}`,
    normalizeText(String(waOpDetails.accommodation||waMeta.pickup_location||waMeta.hotel||'')) ? `Accommodation: ${normalizeText(String(waOpDetails.accommodation||waMeta.pickup_location||waMeta.hotel||''))}` : '',
    normalizeText(String(waOpDetails.pickup_location||waMeta.pickup_location||'')) ? `Pick-up: ${normalizeText(String(waOpDetails.pickup_location||waMeta.pickup_location||''))}` : '',
    normalizeText(String(waOpDetails.dropoff_location||waMeta.dropoff_location||'')) ? `Drop-off: ${normalizeText(String(waOpDetails.dropoff_location||waMeta.dropoff_location||''))}` : '',
    normalizeText(String(waOpDetails.departure_time||waOpDetails.departure_window||waMeta.departure_label||'')) ? `Departure: ${normalizeText(String(waOpDetails.departure_time||waOpDetails.departure_window||waMeta.departure_label||''))}` : '',
    normalizeText(String(waOpDetails.nationality||waMeta.nationality||'')) ? `Nationality: ${normalizeText(String(waOpDetails.nationality||waMeta.nationality||''))}` : '',
    normalizeText(String(waOpDetails.dietary_requirements||waMeta.dietary_requirements||'')) ? `Dietary: ${normalizeText(String(waOpDetails.dietary_requirements||waMeta.dietary_requirements||''))}` : '',
    normalizeText(String(waMeta.booked_by||waOpDetails.booked_by||'')) ? `Booked by: ${normalizeText(String(waMeta.booked_by||waOpDetails.booked_by||''))}` : '',
    normalizeText(String(waMeta.guide_name||payload.guide_name||'')) ? `Guide: ${normalizeText(String(waMeta.guide_name||payload.guide_name||''))}` : '',
    normalizeText(payload.notes) ? `Notes: ${normalizeText(payload.notes)}` : '',
    '',
    `Total: ${normalizeText(service.currency)||'NAD'} ${Number(pricing.totalAmount||0).toFixed(2)}`,
    `Ref: ${reference}`
  ].filter(line=>line!==undefined&&line!=='')
  const waBody=waLines.join('\n')
  void sendWhatsAppMessage(consultantWhatsApp,waBody).catch(err=>console.error('WhatsApp alert failed:',err?.message))
  await enqueueSystemJob({
    job_type:'status_automation',
    job_group:'operations',
    priority:'normal',
    booking_id:bookingId,
    created_by:userId || null
  })
  await processDueSystemJobs()

  if(!isAdmin){
    await sendNewBookingPush({
      guestName:normalizeText(customer.full_name) || 'Guest',
      brandLabel:String((brand as Json)?.name || brand.code || brandCode),
      serviceName:String((service as Json)?.name || ''),
      bookingId
    })
  }

  return {
    id:bookingId,
    reference,
    brand_code:String(brand.code || brandCode),
    status:bookingStatus,
    payment_status:paymentStatus,
    total_amount:pricing.totalAmount,
    currency:service.currency,
    discount_applied:Boolean(promotionState.couponReserved)
  }
  }catch(err){
    if(!bookingPersisted && promotionState?.couponReserved){
      await adminClient.rpc('release_coupon',{p_coupon_id:promotionState.couponReserved.id})
    }
    throw err
  }
}

const updateBooking=async(id:string,payload:Json,userId:string)=>{
  const { data:existing,error:existingError }=await adminClient.from('bookings').select('*').eq('id',id).single()
  if(existingError||!existing)throw new Error('Booking not found.')
  const { data:existingPayment }=await adminClient.from('payments').select('*').eq('booking_id',id).maybeSingle()
  const settings=await getSettingValue('config',{
    currency:'NAD',
    paymentMode:'deposit',
    defaultDepositValue:30,
    taxRate:0,
    serviceFee:0
  })
  const currentCustomer=await adminClient.from('customers').select('*').eq('id',existing.customer_id).single()
  const incomingCustomer=(payload.customer as Json)||{}
  const requestMetadata=(payload.metadata && typeof payload.metadata==='object' && !Array.isArray(payload.metadata) ? payload.metadata : {}) as Json
  const nextBrandCode=normalizeText(payload.brand_code)||normalizeText(existing.brand_code)
  await validateCustomBookingFields(nextBrandCode,requestMetadata,Object.prototype.hasOwnProperty.call(requestMetadata,'custom_fields'))
  const nextSource=(Object.prototype.hasOwnProperty.call(payload,'source') ? normalizeText(payload.source) : '') || normalizeText(requestMetadata.source) || normalizeText(existing.source) || 'admin'
  const nextCustomerPayload={
    full_name:normalizeText(incomingCustomer.full_name ?? payload.customer_name ?? currentCustomer.data?.full_name),
    email:normalizeText(incomingCustomer.email ?? payload.customer_email ?? currentCustomer.data?.email),
    phone:normalizeText(incomingCustomer.phone ?? payload.customer_phone ?? currentCustomer.data?.phone),
    whatsapp:normalizeText(incomingCustomer.whatsapp ?? payload.customer_phone ?? currentCustomer.data?.whatsapp)
  }
  const customerSnapshot=buildBookingCustomerSnapshot(nextCustomerPayload)
  const customer=await upsertCustomer(nextCustomerPayload,{
    brandCode:nextBrandCode,
    bookingSource:nextSource,
    sourcePage:normalizeText(payload.source_page) || normalizeText(requestMetadata.source_page) || normalizeText(existing.metadata?.source_page),
    createdVia:normalizeText(payload.created_via) || normalizeText(requestMetadata.created_via) || normalizeText(existing.metadata?.created_via) || 'skybook_admin',
    notes:normalizeText(incomingCustomer.notes) || normalizeText(payload.notes) || normalizeText(existing.customer_notes),
    preserveExistingIdentity:true
  })
  let serviceId=existing.service_id
  let serviceSlug=''
  let service=(
    await fetchServices({
      includeInactive:true,
      brandCode:nextBrandCode
    })
  ).find(item=>String(item.id)===String(serviceId))
  if(normalizeText(payload.service_slug)){
    service=await getServiceBySlug(normalizeText(payload.service_slug),true,nextBrandCode)
    serviceId=service.id
    serviceSlug=service.slug
  }
  if(!service)throw new Error('Service not found.')
  const nextStatus=normalizeText(payload.status)||existing.status
  let nextPaymentStatus=normalizeText(payload.payment_status)||existing.payment_status
  const workflowAction=normalizeText(payload.workflow_action || payload.workflow || payload.system_action)
  const statusChangeRequested=Object.prototype.hasOwnProperty.call(payload,'status')&&nextStatus!==normalizeText(existing.status)
  const paymentStatusChangeRequested=Object.prototype.hasOwnProperty.call(payload,'payment_status')&&nextPaymentStatus!==normalizeText(existing.payment_status)
  const isSystemActor=!normalizeText(userId) || workflowAction==='system_automation'
  // isNoShowWorkflow now targets 'cancelled' (no-show folds into cancellation, same reason requirement).
  const isCancellationWorkflow=workflowAction==='cancel_booking'&&nextStatus==='cancelled'&&Boolean(normalizeText(payload.reason))
  const isNoShowWorkflow=workflowAction==='no_show'&&nextStatus==='cancelled'&&Boolean(normalizeText(payload.reason))
  // Reschedule no longer changes status at all (see rescheduleBooking) — no flag needed for it here;
  // a reschedule PATCH never includes `status`, so statusChangeRequested is false and this whole
  // authorization block is skipped for that call entirely.
  // isReservationAcceptanceWorkflow now only ever targets 'finalised' (accepting a website booking).
  // Declining one goes through isCancellationWorkflow instead (nextStatus:'cancelled', reason).
  const isReservationAcceptanceWorkflow=workflowAction==='accept_reservation'
    && ['provisional'].includes(normalizeText(existing.status))
    && nextStatus==='finalised'
  // isReinstateWorkflow now serves two callers: reinstating a cancelled booking back to active
  // (finalised), and reinstating a declined reservation back to needing review (provisional).
  const isReinstateWorkflow=workflowAction==='reinstate'
    && normalizeText(existing.status)==='cancelled'
    && ['finalised','provisional'].includes(nextStatus)
    && Boolean(normalizeText(payload.reason))
  const isConfirmBookingWorkflow=workflowAction==='confirm_booking'
    && normalizeText(existing.status)==='provisional'
    && nextStatus==='finalised'
  const isUpdatePaymentStatusWorkflow=workflowAction==='update_payment_status'
    && normalizeText(existing.status)==='finalised'
    && ['','cash','card','eft','voucher','foc'].includes(nextPaymentStatus)
  const isAdminEditWorkflow=workflowAction==='admin_edit'
  if((statusChangeRequested||paymentStatusChangeRequested)&&!isSystemActor&&!isAdminEditWorkflow&&!isCancellationWorkflow&&!isNoShowWorkflow&&!isReservationAcceptanceWorkflow&&!isReinstateWorkflow&&!isConfirmBookingWorkflow&&!isUpdatePaymentStatusWorkflow){
    throw new Error('Booking status is controlled by SkyBook workflows. Use payment, cancellation, reservation acceptance, reinstate, or automation actions.')
  }
  const selectedPaymentProvider=normalizeText(payload.payment_provider || payload.provider) || normalizeText(existingPayment?.provider) || 'manual_eft'
  if(!isAdminEditWorkflow)validateBookingTransition(existing.status,nextStatus,nextPaymentStatus)
  if(nextStatus==='cancelled'&&normalizeText(existing.status)!=='cancelled'&&!normalizeText(payload.reason)){
    throw new Error('A cancellation reason is required before cancelling a booking.')
  }
  const nextPreferredDate=Object.prototype.hasOwnProperty.call(payload,'preferred_date')
    ? (normalizeText(payload.preferred_date)||null)
    : existing.preferred_date
  const nextQuantity=Math.max(1,Number(payload.quantity||existing.quantity||1))
  const nextAdultQuantity=Object.prototype.hasOwnProperty.call(payload,'adult_quantity') ? Number(payload.adult_quantity||0) : Number(existing.adult_quantity||0)
  const nextChildQuantity=Object.prototype.hasOwnProperty.call(payload,'child_quantity') ? Number(payload.child_quantity||0) : Number(existing.child_quantity||0)
  // Always carry the pax split into repricing so a partial update (e.g. a status-only PATCH that
  // omits adult/child) reprices from the booking's real adults/children instead of collapsing to
  // base_price × quantity and wiping a correct split-priced total.
  const pricingPayload={...(payload.quantity!==undefined ? payload : {}),quantity:nextQuantity,adult_quantity:nextAdultQuantity,child_quantity:nextChildQuantity}
  const basePricing=calculatePricing(service,pricingPayload,settings as Json)
  const storedDiscountAmount=await syncStoredBookingDiscountAmounts(id,basePricing.totalAmount)
  const pricing=calculatePricing(service,pricingPayload,settings as Json,storedDiscountAmount)
  // price_override is a DELIBERATE admin-typed manual price ("only fill this to override the
  // calculated price"). Honour it whenever set; a booking with no override reprices from pax.
  // (Do NOT treat override==total as "stale" — ~69 prod bookings are intentionally custom-priced
  // and that heuristic would wipe their price on the next edit.)
  const priceOverride=Number(payload.price_override||requestMetadata.price_override||0)
  const finalTotalAmount=priceOverride>0 ? priceOverride : pricing.totalAmount
  const receivedAmount=Number(existingPayment?.amount_received || 0)
  if(receivedAmount>0 && !['cancelled','refunded'].includes(normalizeText(nextPaymentStatus))){
    nextPaymentStatus=receivedAmount+0.01>=Number(finalTotalAmount || 0) ? 'paid' : 'partially_paid'
  }
  const calculatedOutstandingAmounts=priceOverride>0
    ? resolveOutstandingAmounts({...pricing,totalAmount:priceOverride,subtotalAmount:priceOverride,amountDueNow:priceOverride,amountDueLater:0},nextPaymentStatus)
    : resolveOutstandingAmounts(pricing,nextPaymentStatus)
  const outstandingAmounts=receivedAmount>0 && !['cancelled','refunded','paid'].includes(normalizeText(nextPaymentStatus))
    ? { amountDueNow:Math.max(0,Number((Number(finalTotalAmount || 0)-receivedAmount).toFixed(2))), amountDueLater:0 }
    : calculatedOutstandingAmounts
  const isFoc=normalizeText(nextPaymentStatus)==='foc'
  const focTotal=isFoc ? 0 : finalTotalAmount
  const focSubtotal=isFoc ? 0 : (priceOverride>0 ? priceOverride : pricing.subtotalAmount)
  const focTax=isFoc ? 0 : (priceOverride>0 ? 0 : pricing.taxAmount)
  const focServiceFee=isFoc ? 0 : (priceOverride>0 ? 0 : pricing.serviceFeeAmount)
  const focDueNow=isFoc ? 0 : outstandingAmounts.amountDueNow
  const focDueLater=isFoc ? 0 : outstandingAmounts.amountDueLater
  const existingMetadata=normalizeJsonRecord(existing.metadata)
  const cancellationReason=normalizeText(payload.reason)
  const cancellationCategory=normalizeText(payload.cancellation_reason_type || payload.reason_type || requestMetadata.cancellation_reason_type)
  const consultantComment=normalizeText(payload.consultant_comment || payload.cancellation_comment || payload.notes)
  const updatePayload:Json={
    reference:normalizeText(payload.reference)||existing.reference,
    brand_code:nextBrandCode,
    customer_id:customer.id,
    service_id:serviceId,
    status:nextStatus,
    payment_status:nextPaymentStatus,
    source:nextSource,
    preferred_date:nextPreferredDate,
    confirmed_date:['confirmed','completed'].includes(String(nextStatus)) ? (nextPreferredDate || existing.confirmed_date) : existing.confirmed_date,
    quantity:nextQuantity,
    adult_quantity:Object.prototype.hasOwnProperty.call(payload,'adult_quantity') ? Number(payload.adult_quantity||0) : Number(existing.adult_quantity||0),
    child_quantity:Object.prototype.hasOwnProperty.call(payload,'child_quantity') ? Number(payload.child_quantity||0) : Number(existing.child_quantity||0),
    infant_quantity:Number(payload.infant_quantity||requestMetadata.infant_quantity||existing.infant_quantity||0),
    subtotal_amount:focSubtotal,
    tax_amount:focTax,
    service_fee_amount:focServiceFee,
    total_amount:focTotal,
    amount_due_now:focDueNow,
    amount_due_later:focDueLater,
    currency_code:String(service.currency || existing.currency_code || 'NAD'),
    customer_notes:Object.prototype.hasOwnProperty.call(payload,'notes') ? normalizeText(payload.notes) : existing.customer_notes,
    lookup_email:customer.email,
    cancellation_reason:nextStatus==='cancelled'
      ? cancellationReason
      : (normalizeText(existing.status)==='cancelled'&&nextStatus!=='cancelled' ? null : existing.cancellation_reason),
    metadata:{
      ...existingMetadata,
      ...requestMetadata,
      ...(normalizeText(payload.guide_name) ? {guide_name:normalizeText(payload.guide_name)} : {}),
      source:nextSource,
      brand_code:nextBrandCode,
      source_page:normalizeText(payload.source_page) || normalizeText(requestMetadata.source_page) || normalizeText(existingMetadata.source_page),
      created_via:normalizeText(payload.created_via) || normalizeText(requestMetadata.created_via) || normalizeText(existingMetadata.created_via) || 'skybook_admin',
      customer_snapshot:customerSnapshot,
      price_override:priceOverride,
      ...(nextStatus==='cancelled' ? {
        cancellation:{
          reason_type:cancellationCategory,
          reason:cancellationReason,
          consultant_comment:consultantComment,
          cancelled_at:nowIso(),
          cancelled_by:userId
        }
      } : {}),
      ...(isReinstateWorkflow ? {
        reinstatement:{
          reason:cancellationReason,
          reinstated_at:nowIso(),
          reinstated_by:userId
        },
        cancellation:null
      } : {})
    },
    updated_by:userId
  }
  const { error:updateError }=await adminClient.from('bookings').update(updatePayload).eq('id',id)
  if(updateError)throw updateError
  await createOrUpdatePayment(
    id,
    String(updatePayload.payment_status),
    Number(updatePayload.total_amount || finalTotalAmount || 0),
    String(updatePayload.currency_code || existing.currency_code || 'NAD'),
    selectedPaymentProvider
  )
  await syncBookingItems(id,service,pricing)
  await syncBookingOperatorAssignmentAmount(id,Number(pricing.totalAmount || 0))
  // Build structured field-level diff for amendment tracking
  const amendmentChanges:string[]=[]
  if(updatePayload.preferred_date!==existing.preferred_date)
    amendmentChanges.push(`Date: ${normalizeText(existing.preferred_date)||'Not set'} → ${normalizeText(String(updatePayload.preferred_date||''))||'Not set'}`)
  if(Number(updatePayload.quantity)!==Number(existing.quantity))
    amendmentChanges.push(`Guests: ${existing.quantity} → ${updatePayload.quantity}`)
  if(Number(updatePayload.adult_quantity||0)!==Number(existing.adult_quantity||0))
    amendmentChanges.push(`Adults: ${existing.adult_quantity||0} → ${updatePayload.adult_quantity||0}`)
  if(Number(updatePayload.child_quantity||0)!==Number(existing.child_quantity||0))
    amendmentChanges.push(`Children: ${existing.child_quantity||0} → ${updatePayload.child_quantity||0}`)
  if(String(updatePayload.service_id||'')!==String(existing.service_id||''))
    amendmentChanges.push(`Tour: ${normalizeText(existing.service_name||existing.service_id||'—')} → ${normalizeText(service?.name||String(updatePayload.service_id||'—'))}`)
  if(normalizeText(String(updatePayload.customer_notes||''))!==normalizeText(String(existing.customer_notes||'')))
    amendmentChanges.push(`Notes updated`)
  if(normalizeText(String(updatePayload.source||''))!==normalizeText(String(existing.source||'')))
    amendmentChanges.push(`Source: ${existing.source||'—'} → ${updatePayload.source||'—'}`)
  if(Number(updatePayload.total_amount)!==Number(existing.total_amount))
    amendmentChanges.push(`Total: ${existing.total_amount||0} → ${updatePayload.total_amount||0} ${String(updatePayload.currency_code||existing.currency_code||'NAD')}`)
  // Check metadata field changes (nationality, dietary, pickup, etc.)
  const metaFields:Record<string,string>={nationality:'Nationality',booked_by:'Booked by',dietary_requirements:'Dietary',pickup_location:'Pickup location',dropoff_location:'Drop-off',guide_name:'Guide',departure_label:'Departure',pickup_time:'Pickup time'}
  Object.entries(metaFields).forEach(([key,label])=>{
    const oldVal=normalizeText(String(existingMetadata[key]||''))
    const newVal=normalizeText(String(requestMetadata[key]||payload?.metadata?.[key]||''))
    if(newVal&&oldVal!==newVal)amendmentChanges.push(`${label}: ${oldVal||'—'} → ${newVal}`)
  })
  if(amendmentChanges.length>0){
    const amendmentReason=`Amendment — ${amendmentChanges.join(' | ')}`
    await insertStatusHistory(id,String(updatePayload.status),String(updatePayload.status),amendmentReason,`admin:${userId}`,userId)
  }
  if(updatePayload.status!==existing.status){
    await insertStatusHistory(id,String(existing.status),String(updatePayload.status),normalizeText(payload.reason)||'Booking updated in admin',`admin:${userId}`,userId)
  }
  if(nextStatus==='cancelled'&&cancellationReason){
    await createAdminNote({
      booking_id:id,
      note:[
        cancellationCategory ? `Cancellation reason: ${cancellationCategory}` : 'Cancellation recorded',
        cancellationReason,
        consultantComment ? `Consultant comment: ${consultantComment}` : ''
      ].filter(Boolean).join(' - '),
      is_private:true
    },userId)
  }
  await maybeAllocateResources(id,String(serviceId),normalizeText(String(updatePayload.preferred_date || '')),Number(updatePayload.quantity || existing.quantity || 1))
  await syncInvoiceForBooking(id)
  await syncLifecycleTasks(id,userId)
  await maybeCreateAutomatedOfficeSettlement(id,userId)
  await syncReconciliationRecordForBooking(id,userId)
  if(String(updatePayload.payment_status)==='paid' || String(updatePayload.status)!==String(existing.status)){
    await enqueueSystemJob({
      job_type:'status_automation',
      job_group:'operations',
      priority:String(updatePayload.payment_status)==='paid' ? 'high' : 'normal',
      booking_id:id,
      created_by:userId
    })
  }
  if(['confirmed','completed'].includes(String(updatePayload.status))){
    await enqueueSystemJob({
      job_type:'operator_settlement_check',
      job_group:'finance',
      priority:'high',
      booking_id:id,
      created_by:userId
    })
  }
  await processDueSystemJobs()
  return {success:true,id,service_slug:serviceSlug}
}

const archiveBooking=async(bookingId:string,payload:Json,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const currentStatus=normalizeText(booking.status)
  if(!['draft','pending'].includes(currentStatus)){
    throw new Error('Only reservations may be moved to trash. Cancel bookings with a valid reason instead.')
  }
  const existingMetadata=normalizeJsonRecord(booking.metadata)
  const recordScope='reservation'
  const recordLabel='Reservation'
  const reason=normalizeText(payload.reason)
  if(!reason)throw new Error('A deletion reason is required before deleting a reservation.')
  const archivedAt=nowIso()
  const nextMetadata={
    ...existingMetadata,
    trash:{
      ...normalizeJsonRecord(existingMetadata.trash),
      archived_at:archivedAt,
      reason,
      archived_by:userId,
      scope:recordScope,
      original_status:normalizeText(booking.status) || '',
      original_payment_status:normalizeText(booking.payment_status) || ''
    }
  }
  const { error }=await adminClient.from('bookings').update({
    status:'cancelled',
    payment_status:'',
    cancellation_reason:reason,
    metadata:nextMetadata,
    updated_by:userId
  }).eq('id',bookingId)
  if(error)throw error
  await insertStatusHistory(bookingId,String(booking.status || ''),'cancelled',`${recordLabel} moved to trash: ${reason}`,`admin:${userId}`,userId)
  await createAdminNote({ booking_id:bookingId, note:`${recordLabel} moved to trash: ${reason}`, is_private:true },userId)
  await syncInvoiceForBooking(bookingId)
  return { success:true, id:bookingId, archived_at:archivedAt }
}

const restoreBooking=async(bookingId:string,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found.')
  const metadata=normalizeJsonRecord(booking.metadata)
  const originalStatus=normalizeText(metadata.trash?.original_status)
  const originalPaymentStatus=normalizeText(metadata.trash?.original_payment_status)
  const fallbackPaymentStatus=normalizeText(booking.payment_status)==='cancelled' ? 'pending' : normalizeText(booking.payment_status) || 'pending'
  const nextStatus=originalStatus && originalStatus!=='cancelled'
    ? originalStatus
    : (fallbackPaymentStatus==='paid' ? 'confirmed' : 'awaiting_payment')
  const nextPaymentStatus=originalPaymentStatus || fallbackPaymentStatus
  const recordScope=normalizeText(metadata.trash?.scope) || (['draft','pending'].includes(nextStatus) ? 'reservation' : 'booking')
  const recordLabel=recordScope==='reservation' ? 'Reservation' : 'Booking'
  delete metadata.trash
  delete metadata.deleted_at
  const { error }=await adminClient.from('bookings').update({
    status:nextStatus,
    payment_status:nextPaymentStatus,
    cancellation_reason:null,
    metadata,
    updated_by:userId
  }).eq('id',bookingId)
  if(error)throw error
  await insertStatusHistory(bookingId,String(booking.status || ''),nextStatus,`${recordLabel} restored from trash.`,`admin:${userId}`,userId)
  await createAdminNote({ booking_id:bookingId, note:`${recordLabel} restored from trash.`, is_private:true },userId)
  await syncInvoiceForBooking(bookingId)
  return { success:true, id:bookingId }
}

const duplicateBooking=async(bookingId:string,payload:Json,userId:string)=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,preferred_date,quantity,customer_notes,customer_id,service_id,services(slug),customers(full_name,email,phone)')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)throw new Error('Booking not found.')
  const duplicatePayload={
    brand_code:normalizeText(payload.brand_code) || normalizeText(booking.brand_code) || 'true-travel',
    service_slug:normalizeText(payload.service_slug) || normalizeText((booking.services as Json | null)?.slug),
    preferred_date:normalizeText(payload.preferred_date) || normalizeText(booking.preferred_date),
    quantity:Number(payload.quantity || booking.quantity || 1),
    notes:normalizeText(payload.notes) || `Duplicated from ${normalizeText(booking.reference)}`,
    status:normalizeText(payload.status) || 'pending',
    payment_status:normalizeText(payload.payment_status) || 'pending',
    customer:{
      full_name:normalizeText((booking.customers as Json | null)?.full_name),
      email:normalizeText((booking.customers as Json | null)?.email),
      phone:normalizeText((booking.customers as Json | null)?.phone)
    },
    customer_name:normalizeText((booking.customers as Json | null)?.full_name),
    customer_email:normalizeText((booking.customers as Json | null)?.email),
    customer_phone:normalizeText((booking.customers as Json | null)?.phone)
  }
  return { success:true, booking:await createBooking(duplicatePayload,{ isAdmin:true, userId, brandCode:duplicatePayload.brand_code }) }
}

const rescheduleBooking=async(bookingId:string,payload:Json,userId:string)=>{
  const preferredDate=normalizeText(payload.preferred_date)
  if(!preferredDate)throw new Error('A new preferred date is required to reschedule.')
  const existing=await safeMaybeSingle<Json>(adminClient.from('bookings').select('status').eq('id',bookingId).maybeSingle())
  if(!existing)throw new Error('Booking not found.')
  const existingStatus=normalizeText(existing.status)
  const nextStatus=['completed','cancelled','refunded'].includes(existingStatus) ? existingStatus : 'rescheduled'
  return updateBooking(bookingId,{
    preferred_date:preferredDate,
    status:nextStatus,
    reason:normalizeText(payload.reason) || 'Booking rescheduled in SkyBook',
    workflow_action:'reschedule'
  },userId)
}

const slugifyServiceName=(name:string)=>name.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,80)

const upsertService=async(payload:Json)=>{
  const categorySlug=normalizeText(payload.category_slug)||'coastal-tours'
  const { data:category }=await adminClient.from('service_categories').select('id').eq('slug',categorySlug).maybeSingle()
  const brandCodes=Array.isArray(payload.brand_codes)
    ? Array.from(new Set(payload.brand_codes.map(value=>normalizeText(value)).filter(Boolean)))
    : []
  const minimumPax=Math.max(1,Number(payload.minimum_pax||1)||1)
  const mediaGallery=normalizeServiceMedia(payload.media_urls || payload.media,normalizeText(payload.name))
  const rawSlug=normalizeText(payload.slug)||slugifyServiceName(String(payload.name||''))
  const servicePayload={
    category_id:category?.id||null,
    slug:rawSlug,
    name:normalizeText(payload.name),
    short_description:normalizeText(payload.short_description),
    full_description:normalizeText(payload.full_description||payload.short_description),
    duration_label:normalizeText(payload.duration_label),
    unit_label:'guest',
    preferred_date_mode:'required',
    base_price:Number(payload.base_price||0),
    adult_price:payload.adult_price!=null ? Number(payload.adult_price) : null,
    child_price:payload.child_price!=null ? Number(payload.child_price) : null,
    currency_code:'NAD',
    payment_mode:'deposit',
    deposit_type:'percentage',
    deposit_value:30,
    requires_manual_confirmation:true,
    is_active:Boolean(payload.is_active!==false),
    metadata:{
      category_slug:categorySlug,
      highlight_points:Array.isArray(payload.highlight_points) ? payload.highlight_points : [],
      brand_codes:brandCodes,
      minimum_pax:minimumPax,
      departure_window:normalizeText(payload.departure_window),
      pickup_time:normalizeText(payload.pickup_time),
      is_quote_only:Boolean(payload.is_quote_only),
      departure_times:Array.isArray(payload.departure_times)
        ? payload.departure_times.map((item:unknown)=>({
            label:normalizeText((item as Record<string,unknown>)?.label),
            time:normalizeText((item as Record<string,unknown>)?.time),
            pickup_time:normalizeText((item as Record<string,unknown>)?.pickup_time)
          })).filter((item:{label:string,time:string,pickup_time:string})=>item.label||item.time)
        : []
    },
    media:mediaGallery
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
  const paymentToken=normalizeText(payload.payment_token || payload.token)
  if(paymentToken){
    const { data:raw,error }=await adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,payment_status,preferred_date,total_amount,amount_due_now,amount_due_later,currency_code,metadata,customers(email),services(name)')
      .filter('metadata->payment_link->>token','eq',paymentToken)
      .maybeSingle()
    if(error||!raw)throw new Error('Payment link not found.')
    const paymentLinkMeta=normalizeJsonRecord(normalizeJsonRecord(raw.metadata).payment_link)
    if(normalizeText(paymentLinkMeta.token)!==paymentToken || normalizeText(paymentLinkMeta.revoked_at)){
      throw new Error('Payment link is no longer active.')
    }
    const { data:payment }=await adminClient
      .from('payments')
      .select('provider,external_checkout_url')
      .eq('booking_id',raw.id)
      .order('created_at',{ascending:false})
      .limit(1)
      .maybeSingle()
    return {
      booking:{
        id:raw.id,
        reference:raw.reference,
        brand_code:raw.brand_code,
        status:raw.status,
        payment_status:raw.payment_status,
        preferred_date:raw.preferred_date,
        total_amount:Number(raw.total_amount||0),
        amount_due_now:Number(raw.amount_due_now||0),
        amount_due_later:Number(raw.amount_due_later||0),
        currency:raw.currency_code,
        service_name:raw.services?.name || 'Selected tour',
        payment_provider:payment?.provider || 'dpo',
        payment_url:payment?.external_checkout_url || null
      }
    }
  }
  if(!reference || !email)throw new Error('Booking reference and email are required.')
  const { data:booking,error }=await adminClient
    .from('booking_admin_overview')
    .select('*')
    .eq('reference',reference)
    .maybeSingle()
  if(error||!booking)throw new Error('Booking not found.')
  const [{ data:raw },{ data:payment }] = await Promise.all([
    adminClient.from('bookings').select('id,brand_code,lookup_email,payment_status,preferred_date,total_amount,amount_due_now,amount_due_later,currency_code').eq('reference',reference).maybeSingle(),
    adminClient.from('payments').select('provider,external_checkout_url').eq('booking_id',booking.id).order('created_at',{ascending:false}).limit(1).maybeSingle()
  ])
  if(!raw||String(raw.lookup_email).toLowerCase()!==email)throw new Error('Booking not found.')
  return {
    booking:{
      id:raw.id || booking.id,
      reference:booking.reference,
      brand_code:raw.brand_code || booking.brand_code,
      status:booking.status,
      payment_status:raw.payment_status,
      preferred_date:raw.preferred_date,
      total_amount:Number(raw.total_amount||0),
      amount_due_now:Number(raw.amount_due_now||0),
      amount_due_later:Number(raw.amount_due_later||0),
      currency:raw.currency_code,
      service_name:booking.service_name,
      payment_provider:payment?.provider || null,
      payment_url:payment?.external_checkout_url || null
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
  const queueSettings=await getSettingValue('queue',DEFAULT_QUEUE_SETTINGS)
  // Fire-and-forget — don't block login on maintenance tasks
  if((queueSettings as Json).autoProcessOnBootstrap!==false){
    void processDueSystemJobs().catch(()=>{})
  }
  void syncAllReconciliationRecords(String(user.id || '')).catch(()=>{})
  const [bookingsResult,customersResult,paymentsResult,services,settings,emailTemplates,automationRules,portalSettings,integrationSettings,reportingSettings,opsTemplates,bookingFields,brands,schedules,dateRules,blackoutDates,coupons,vouchers,agents,operators,bookingAgents,bookingOperators,bookingDiscounts,resources,resourceAllocations,invoices,officeInvoices,refunds,paymentTransactions,webhookEndpoints,supportedLanguages,supportedCurrencies,customerAccounts,calendarConnections,emailLogs,statusHistory,adminNotes,bookingTasks,bookingDocuments,bookingMemories,portalRequests,staffDirectory,documentVersionsRaw,portalSessions,systemJobs,healthEvents,reconciliationRecords]=await Promise.all([
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,payment_status,preferred_date,confirmed_date,quantity,adult_quantity,child_quantity,infant_quantity,total_amount,currency_code,amount_due_now,amount_due_later,source,customer_notes,cancellation_reason,metadata,created_at,updated_at,updated_by,customer_id,service_id,customers(full_name,email,phone),services(name,slug)')
      .order('created_at',{ascending:false})
      .limit(600),
    adminClient.from('customers').select('id,full_name,email,phone,metadata,created_at,updated_at').order('created_at',{ascending:false}).limit(600),
    adminClient.from('payments').select('id,booking_id,provider,status,amount,amount_received,currency_code,provider_reference,external_checkout_url,paid_at,metadata,created_at').order('created_at',{ascending:false}).limit(400),
    fetchServices({includeInactive:true}),
    getSettingValue('config',{
      currency:'NAD',
      paymentMode:'deposit',
      defaultDepositValue:30,
      taxRate:0,
      serviceFee:0,
      supportEmail:'bookings@truetravelnam.net',
      supportPhone:'+264813224270',
      supportWhatsApp:'+264813224270',
      supportEmailsByBrand:BRAND_SUPPORT_EMAILS
    }),
    getSettingValue('email_templates',defaultEmailTemplates),
    getSettingValue('automation_rules',DEFAULT_AUTOMATION_RULES),
    getSettingValue('portal',{
      enabled:true,
      allowBookingLookup:true,
      allowSelfServiceRequests:true,
      allowDocumentDownloads:true,
      sessionDurationHours:72,
      portalBaseUrl:'/portal.html'
    }),
    getSettingValue('integrations',{
      whatsapp:{enabled:false},
      googleCalendar:{enabled:false},
      webhooks:{enabled:true},
      email:{
        from_email_by_brand:BRAND_SUPPORT_EMAILS,
        from_name_by_brand:BRAND_EMAIL_NAMES
      }
    }),
    getSettingValue('reporting',{
      defaultWindowDays:30,
      showOutstandingCommissions:true,
      showRefundExposure:true
    }),
    getSettingValue('ops_templates',DEFAULT_OPS_TEMPLATES),
    getSettingValue('booking_fields',DEFAULT_BOOKING_FORM_FIELDS),
    listBrands(),
    safeTableSelect<Json>(adminClient.from('service_operating_windows').select('*').order('day_of_week',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('service_date_rules').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('service_blackout_dates').select('*').order('starts_on',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('coupons').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('vouchers').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('agents').select('*').order('company_name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('operators').select('*').order('company_name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('booking_agents').select('*').order('created_at',{ascending:false}).limit(400)),
    safeTableSelect<Json>(adminClient.from('booking_operators').select('*').order('created_at',{ascending:false}).limit(400)),
    safeTableSelect<Json>(adminClient.from('booking_discounts').select('*').order('created_at',{ascending:false}).limit(400)),
    safeTableSelect<Json>(adminClient.from('resources').select('*').order('name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('resource_allocations').select('*').order('allocation_date',{ascending:false}).limit(400)),
    safeTableSelect<Json>(adminClient.from('invoices').select('*').order('created_at',{ascending:false}).limit(400)),
    safeTableSelect<Json>(adminClient.from('office_invoices').select('*').order('created_at',{ascending:false}).limit(300)),
    safeTableSelect<Json>(adminClient.from('refunds').select('*').order('created_at',{ascending:false}).limit(300)),
    safeTableSelect<Json>(adminClient.from('payment_transactions').select('*').order('created_at',{ascending:false}).limit(300)),
    safeTableSelect<Json>(adminClient.from('webhook_endpoints').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('supported_languages').select('*').order('code',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('supported_currencies').select('*').order('code',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('customer_accounts').select('*').order('created_at',{ascending:false}).limit(400)),
    safeTableSelect<Json>(adminClient.from('calendar_sync_connections').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('email_logs').select('*').order('created_at',{ascending:false}).limit(300)),
    safeTableSelect<Json>(adminClient.from('booking_status_history').select('*').order('created_at',{ascending:false}).limit(400)),
    safeTableSelect<Json>(adminClient.from('admin_notes').select('*').order('created_at',{ascending:false}).limit(300)),
    safeTableSelect<Json>(adminClient.from('booking_tasks').select('*').order('created_at',{ascending:false}).limit(300)),
    safeTableSelect<Json>(adminClient.from('booking_documents').select('*').order('created_at',{ascending:false}).limit(200)),
    safeTableSelect<Json>(adminClient.from('booking_memories').select('*').order('created_at',{ascending:false}).limit(200)),
    safeTableSelect<Json>(adminClient.from('booking_portal_requests').select('*').order('created_at',{ascending:false}).limit(200)),
    safeTableSelect<Json>(adminClient.from('app_users').select('id,full_name,role,is_active').order('full_name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('booking_document_versions').select('*').order('created_at',{ascending:false}).limit(150)),
    safeTableSelect<Json>(adminClient.from('customer_portal_sessions').select('*').order('created_at',{ascending:false}).limit(200)),
    safeTableSelect<Json>(adminClient.from('system_jobs').select('*').order('created_at',{ascending:false}).limit(200)),
    safeTableSelect<Json>(adminClient.from('system_health_events').select('*').order('created_at',{ascending:false}).limit(200)),
    safeTableSelect<Json>(adminClient.from('reconciliation_records').select('*').order('created_at',{ascending:false}).limit(400))
  ])
  if(bookingsResult.error)throw bookingsResult.error
  if(customersResult.error)throw customersResult.error
  if(paymentsResult.error)throw paymentsResult.error

  const bookings=(bookingsResult.data||[]).map(row=>{
    const metadata=normalizeJsonRecord(row.metadata)
    const customerSnapshot=normalizeJsonRecord(metadata.customer_snapshot)
    return {
      id:row.id,
      reference:row.reference,
      brand_code:row.brand_code || 'true-travel',
      status:row.status,
      payment_status:row.payment_status,
      preferred_date:row.preferred_date,
      confirmed_date:row.confirmed_date,
      quantity:row.quantity,
      adult_quantity:Number(row.adult_quantity||0),
      child_quantity:Number(row.child_quantity||0),
      infant_quantity:Number(row.infant_quantity||0),
      total_amount:Number(row.total_amount||0),
      currency:row.currency_code,
      amount_due_now:Number(row.amount_due_now||0),
      amount_due_later:Number(row.amount_due_later||0),
      source:row.source || 'website',
      cancellation_reason:row.cancellation_reason || '',
      metadata,
      customer_name:normalizeText(customerSnapshot.full_name)||row.customers?.full_name||'',
      customer_email:normalizeText(customerSnapshot.email)||row.customers?.email||'',
      customer_phone:normalizeText(customerSnapshot.phone)||row.customers?.phone||'',
      service_name:row.services?.name||'',
      service_slug:row.services?.slug||'',
      customer_notes:row.customer_notes||'',
      customer_id:row.customer_id || null,
      service_id:row.service_id || null,
      updated_at:row.updated_at || row.created_at,
      updated_by:row.updated_by || null,
      created_at:row.created_at
    }
  })
  const bookingsByCustomer=new Map<string,{
    booking_count:number
    last_booking_reference:string
    last_booking_date:string
    brand_codes:Set<string>
    booking_sources:Set<string>
    last_brand_code:string
    last_source:string
  }>()
  for(const booking of bookings){
    const key=String(booking.customer_id || booking.customer_email || '')
    if(!key)continue
    const current=bookingsByCustomer.get(key)||{
      booking_count:0,
      last_booking_reference:'',
      last_booking_date:'',
      brand_codes:new Set<string>(),
      booking_sources:new Set<string>(),
      last_brand_code:'',
      last_source:''
    }
    current.booking_count+=1
    if(!current.last_booking_reference){
      current.last_booking_reference=String(booking.reference || '')
      current.last_booking_date=String(booking.created_at || booking.preferred_date || '')
      current.last_brand_code=String(booking.brand_code || '')
      current.last_source=String(booking.source || booking.metadata?.source || '')
    }
    if(booking.brand_code)current.brand_codes.add(String(booking.brand_code))
    const bookingSource=String(booking.source || booking.metadata?.source || '')
    if(bookingSource)current.booking_sources.add(bookingSource)
    bookingsByCustomer.set(key,current)
  }
  const customers=(customersResult.data||[]).map(customer=>{
    const metadata=normalizeJsonRecord(customer.metadata)
    const summary=bookingsByCustomer.get(String(customer.id || customer.email || ''))
      || bookingsByCustomer.get(String(customer.email || ''))
    return ({
      ...customer,
      metadata,
      booking_count:summary?.booking_count||0,
      last_booking_reference:summary?.last_booking_reference||'',
      last_booking_date:summary?.last_booking_date||'',
      last_brand_code:summary?.last_brand_code||normalizeText(metadata.last_brand_code),
      last_source:summary?.last_source||normalizeText(metadata.last_booking_source),
      brand_codes:Array.from(summary?.brand_codes || new Set(mergeNormalizedTextSet(metadata.brand_codes))),
      booking_sources:Array.from(summary?.booking_sources || new Set(mergeNormalizedTextSet(metadata.booking_sources))),
      latest_customer_note:normalizeText(metadata.latest_customer_note)
    })
  })
  const payments=(paymentsResult.data||[]).map(payment=>{
    const booking=bookings.find(row=>row.id===payment.booking_id)
    const metadata=normalizeJsonRecord(payment.metadata)
    const latestManualPayment=normalizeJsonRecord(metadata.latest_manual_payment)
    return {
      id:payment.id,
      booking_id:payment.booking_id,
      reference:booking?.reference||'',
      provider:payment.provider,
      payment_type:normalizeText(latestManualPayment.payment_type) || normalizeText(metadata.payment_type),
      status:payment.status,
      amount:Number(payment.amount||0),
      amount_received:Number(payment.amount_received||0),
      currency:payment.currency_code,
      currency_code:payment.currency_code,
      provider_reference:payment.provider_reference || null,
      external_checkout_url:payment.external_checkout_url || null,
      paid_at:payment.paid_at || null,
      metadata,
      created_at:payment.created_at
    }
  })
  const adminUsers=permissions.admin_users ? await listSkybookAdminUsers() : []
  const canSeeBookings=permissions.bookings || permissions.dashboard || permissions.calendar || permissions.reports
  const canSeeCustomers=permissions.customers || permissions.bookings
  const canSeePayments=permissions.payments || permissions.dashboard || permissions.reports || permissions.finance
  const canSeeServices=permissions.services || permissions.bookings || permissions.engine
  const canSeeEngine=permissions.engine || permissions.calendar
  const canSeeFinance=permissions.finance || permissions.dashboard || permissions.reports
  const canSeeReconciliation=permissions.reconciliation || permissions.finance || permissions.reports
  const canSeeHealth=permissions.health || permissions.dashboard
  const canSeeEmails=permissions.emails || permissions.bookings
  const canSeeAssignments=permissions.bookings || permissions.engine || permissions.finance || permissions.dashboard
  // Signed URLs generated on demand via /admin/documents/:id/url — not blocking bootstrap
  const documentVersions=documentVersionsRaw||[]
  const bookingMemoriesWithLinks=bookingMemories||[]
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
    booking_form_fields:canSeeBookings ? normalizeBookingFieldDefinitions(bookingFields) : [],
    email_templates:permissions.emails ? emailTemplates : {},
    ops_templates:canSeeBookings ? opsTemplates : DEFAULT_OPS_TEMPLATES,
    automation_rules:automationRules,
    portal_settings:portalSettings,
    queue_settings:queueSettings,
    integration_settings:integrationSettings,
    reporting_settings:reportingSettings,
    schedules:canSeeEngine ? schedules : [],
    date_rules:canSeeEngine ? dateRules : [],
    blackout_dates:canSeeEngine ? blackoutDates : [],
    coupons:canSeeEngine ? coupons : [],
    vouchers:canSeeEngine ? vouchers : [],
    agents:(canSeeEngine || canSeeFinance) ? agents : [],
    operators:canSeeAssignments ? operators : [],
    booking_agents:canSeeAssignments ? bookingAgents : [],
    booking_operators:canSeeAssignments ? bookingOperators : [],
    booking_discounts:canSeeBookings ? bookingDiscounts : [],
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
    booking_tasks:canSeeBookings ? bookingTasks : [],
    booking_documents:canSeeBookings ? bookingDocuments : [],
    booking_memories:canSeeBookings ? bookingMemoriesWithLinks : [],
    booking_document_versions:canSeeBookings ? documentVersions : [],
    portal_requests:canSeeBookings ? portalRequests : [],
    portal_sessions:canSeeBookings ? portalSessions : [],
    staff_directory:canSeeBookings ? staffDirectory : [],
    lifecycle_rules:BOOKING_STATUS_TRANSITIONS,
    system_jobs:canSeeHealth ? systemJobs : [],
    health_events:canSeeHealth ? healthEvents : [],
    reconciliation_records:canSeeReconciliation ? reconciliationRecords : [],
    admin_users:adminUsers,
    permission_catalog:SKYBOOK_PERMISSION_CATALOG,
    role_defaults:SKYBOOK_ROLE_DEFAULTS,
    reports:safeReports
  }
}

const resendBookingEmail=async(bookingId:string,userId:string)=>{
  throw new Error('SkyBook guest email sending is disabled. True Travel reservation received emails are the only automatic guest emails.')
}

const sendBookingCustomEmail=async(bookingId:string,payload:Json,userId:string)=>{
  throw new Error('SkyBook guest email sending is disabled. Generate a payment link on the booking instead.')
}

const generateBookingPaymentLink=async(bookingId:string,payload:Json,userId:string)=>{
  const { booking, brand }=await loadBookingEmailContext(bookingId)
  if(!booking)throw new Error('Booking not found.')
  if(normalizeText(booking.brand_code)!=='true-travel')throw new Error('Payment links are currently enabled for True Travel bookings only.')
  const currentMetadata=normalizeJsonRecord(booking.metadata)
  const existingPaymentLink=normalizeJsonRecord(currentMetadata.payment_link)
  const shouldReuse=Boolean(payload.reuse_existing!==false && normalizeText(existingPaymentLink.url) && normalizeText(existingPaymentLink.token) && !normalizeText(existingPaymentLink.revoked_at))
  const paymentToken=shouldReuse ? normalizeText(existingPaymentLink.token) : crypto.randomUUID()
  const paymentLink=buildBookingPaymentPageUrl({...booking,metadata:{...currentMetadata,payment_link:{...existingPaymentLink,token:paymentToken}}},brand,paymentToken)
  const currentStatus=normalizeText(booking.status)
  const currentPaymentStatus=normalizeText(booking.payment_status)
  const nextStatus=['draft','pending','payment_request_sent'].includes(currentStatus) ? 'awaiting_payment' : currentStatus
  const nextPaymentStatus=['paid','partially_paid'].includes(currentPaymentStatus) ? currentPaymentStatus : 'pending'
  const { error }=await adminClient.from('bookings').update({
    status:nextStatus,
    payment_status:nextPaymentStatus,
    metadata:{
      ...currentMetadata,
      payment_link:{
        ...existingPaymentLink,
        token:paymentToken,
        url:paymentLink,
        generated_at:nowIso(),
        generated_by:userId,
        reference:normalizeText(booking.reference),
        amount:Number(booking.amount_due_now || booking.total_amount || 0),
        currency_code:normalizeText(booking.currency_code) || 'NAD',
        payment_provider:'dpo',
        payment_page:normalizeText(brand?.code)==='iventure' ? 'iventure' : 'true_travel'
      }
    },
    updated_by:userId
  }).eq('id',bookingId)
  if(error)throw error
  if(nextStatus!==currentStatus){
    await insertStatusHistory(bookingId,currentStatus,nextStatus,'Payment link generated for booking.',`admin:${userId}`,userId)
  }
  await createAdminNote({ booking_id:bookingId, note:'Payment link generated and added to booking.', is_private:true },userId)
  await syncInvoiceForBooking(bookingId)
  return { success:true, status:nextStatus, payment_status:nextPaymentStatus, payment_link:paymentLink, payment_token:paymentToken }
}

// ── Guest review helpers ────────────────────────────────────────────────────
const submitGuestReview=async(payload:Json)=>{
  const guestName=String(payload.guest_name||'').trim()
  const reviewText=String(payload.review_text||'').trim()
  const rating=Number(payload.rating)
  if(!guestName)throw new Error('Please provide your name.')
  if(!reviewText)throw new Error('Please write your review.')
  if(!rating||rating<1||rating>5)throw new Error('Please select a rating between 1 and 5.')
  const {data,error}=await adminClient.from('guest_reviews').insert({
    brand_code:normalizeText(payload.brand_code)||'true-travel',
    guest_name:guestName.slice(0,100),
    guest_country:String(payload.guest_country||'').trim().slice(0,100),
    guest_country_code:normalizeText(payload.guest_country_code).slice(0,10),
    service_name:String(payload.service_name||'').trim().slice(0,200),
    rating,
    review_text:reviewText.slice(0,2000),
    booking_reference:normalizeText(payload.booking_reference).slice(0,50)
  }).select().single()
  if(error)throw new Error(error.message)
  return {review:data,message:'Thank you for your review! It will appear on site after moderation.'}
}

const getApprovedReviews=async(brandCode:string)=>{
  let query=adminClient.from('guest_reviews').select('id,guest_name,guest_country,guest_country_code,service_name,rating,review_text,created_at').eq('status','approved').order('created_at',{ascending:false}).limit(50)
  if(brandCode)query=query.eq('brand_code',brandCode)
  const {data,error}=await query
  if(error)throw new Error(error.message)
  return data||[]
}

const listAdminReviews=async(status?:string)=>{
  let query=adminClient.from('guest_reviews').select('*').order('created_at',{ascending:false})
  if(status&&['pending','approved','rejected'].includes(status))query=query.eq('status',status)
  const {data,error}=await query
  if(error)throw new Error(error.message)
  return data||[]
}

const updateReviewStatus=async(reviewId:string,payload:Json)=>{
  const status=normalizeText(payload.status)
  if(!['approved','rejected','pending'].includes(status))throw new Error('Invalid review status.')
  const {data,error}=await adminClient.from('guest_reviews').update({status}).eq('id',reviewId).select().single()
  if(error)throw new Error(error.message)
  return {review:data}
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

    if(request.method==='GET'&&resource==='booking-fields'&&!id){
      return json(200,{fields:await getBookingFormFields(brandCode,{publicOnly:true})})
    }

    if(request.method==='GET'&&resource==='discount-codes'&&id){
      const ip=normalizeText(request.headers.get('x-forwarded-for')).split(',')[0]||'unknown'
      if(previewRateLimited(ip))return json(429,{valid:false,error:'rate_limited'})
      return json(200,await previewDiscountCode(id,brandCode))
    }

    if(request.method==='POST'&&resource==='bookings'&&!id){
      return json(201,{booking:await createBooking(requestBody,{brandCode})})
    }

    if(request.method==='POST'&&resource==='bookings'&&id==='lookup'){
      return json(200,await lookupBooking(requestBody))
    }

    if(request.method==='POST'&&resource==='memories'&&id==='lookup'){
      return json(200,await listTourMemories(requestBody,brandCode))
    }

    if(request.method==='POST'&&resource==='reviews'&&!id){
      return json(201,await submitGuestReview(requestBody))
    }

    if(request.method==='GET'&&resource==='reviews'&&!id){
      return json(200,{reviews:await getApprovedReviews(brandCode)})
    }

    if(resource==='portal' && request.method==='POST' && id==='session' && subresource==='resolve'){
      return json(200,await resolvePortalSessionContext(normalizeText(requestBody.token)))
    }

    if(resource==='portal' && request.method==='POST' && id==='session' && subresource==='request'){
      return json(201,await createPortalSelfServiceRequest(normalizeText(requestBody.token),requestBody))
    }

    if(resource==='admin' && request.method==='POST' && id==='login'){
      return json(200,await loginAdminWithUsername(requestBody))
    }

    if(resource==='admin'){
      const { user, profile }=await getAuthenticatedAdmin(request)
      const adminProfile=profile as unknown as Json

      if(request.method==='GET'&&id==='bootstrap'){
        return json(200,await fetchAdminBootstrap(user as unknown as Json,profile as unknown as Json))
      }

      if(request.method==='GET'&&id==='search'){
        const bootstrap=await fetchAdminBootstrap(user as unknown as Json,profile as unknown as Json)
        return json(200,{
          results:searchAdminEntities({
            query:normalizeText(new URL(request.url).searchParams.get('q')),
            bookings:(bootstrap.bookings as Json[]) || [],
            customers:(bootstrap.customers as Json[]) || [],
            invoices:(bootstrap.invoices as Json[]) || [],
            officeInvoices:(bootstrap.office_invoices as Json[]) || [],
            operators:(bootstrap.operators as Json[]) || []
          })
        })
      }

      if(request.method==='POST'&&id==='jobs'&&subresource==='run'){
        requireSkybookPermission(adminProfile,'health')
        return json(200,{ success:true, processed_jobs:await processDueSystemJobs() })
      }

      if(request.method==='POST'&&id==='jobs'&&subresource && parts[3]==='retry'){
        requireSkybookPermission(adminProfile,'health')
        await updateSystemJob(subresource,{ status:'queued', run_at:nowIso(), last_error:null, completed_at:null })
        return json(200,{ success:true })
      }

      if(request.method==='POST'&&id==='jobs'&&subresource && parts[3]==='cancel'){
        requireSkybookPermission(adminProfile,'health')
        await updateSystemJob(subresource,{ status:'cancelled', completed_at:nowIso() })
        return json(200,{ success:true })
      }

      if(request.method==='PATCH'&&id==='health-events'&&subresource){
        requireSkybookPermission(adminProfile,'health')
        const nextStatus=normalizeText(requestBody.status) || 'resolved'
        const { data,error }=await adminClient.from('system_health_events').update({
          status:nextStatus,
          resolved_at:['resolved','ignored'].includes(nextStatus) ? nowIso() : null,
          resolved_by:safeUuid(user.id)
        }).eq('id',subresource).select().single()
        if(error)throw error
        return json(200,{ success:true, health_event:data })
      }

      if(request.method==='POST'&&id==='bookings'&&!subresource){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,{booking:await createBooking(requestBody,{isAdmin:true,userId:user.id,brandCode})})
      }

      if(request.method==='PATCH'&&id==='bookings'&&subresource){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await updateBooking(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='duplicate'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await duplicateBooking(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='reschedule'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await rescheduleBooking(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&['payment-link','payment-request'].includes(parts[3])){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await generateBookingPaymentLink(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='payments'){
        requireSkybookPermission(adminProfile,'payments')
        return json(201,await createManualBookingPayment(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='client-invoice'){
        requireSkybookPermission(adminProfile,'finance')
        return json(201,await issueClientInvoice(subresource,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='discount'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await upsertManualBookingDiscount(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='trash'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await archiveBooking(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='restore'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await restoreBooking(subresource,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='documents'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await logBookingDocument({...requestBody,booking_id:subresource},user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='portal-access'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await createPortalAccessSession(subresource,user.id,request))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='portal-requests'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await createPortalRequest({...requestBody,booking_id:subresource},user.id))
      }

      if(request.method==='POST'&&id==='memories'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await createTourMemoryUpload(requestBody,user.id))
      }

      if(request.method==='GET'&&id==='document-versions'&&subresource&&parts[3]==='signed-url'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await getDocumentVersionSignedUrl(subresource))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='resend'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await resendBookingEmail(subresource,user.id))
      }

      if(request.method==='POST'&&id==='bookings'&&parts[3]==='email'){
        requireSkybookPermission(adminProfile,'emails')
        return json(200,await sendBookingCustomEmail(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='services'){
        requireSkybookPermission(adminProfile,'services')
        return json(201,await upsertService(requestBody))
      }

      if(request.method==='PATCH'&&id==='services'&&subresource){
        requireSkybookPermission(adminProfile,'services')
        return json(200,await upsertService({...requestBody,id:subresource}))
      }

      if(request.method==='DELETE'&&id==='services'&&subresource){
        requireSkybookPermission(adminProfile,'services')
        const { error }=await adminClient.from('services').delete().eq('id',subresource)
        if(error)throw new Error(error.message)
        return json(200,{deleted:true,id:subresource})
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

      if(request.method==='POST'&&id==='discount-qr'&&!subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(201,await createDiscountQr(requestBody))
      }
      if(request.method==='GET'&&id==='discount-qr'&&!subresource){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await listDiscountQr())
      }
      if(request.method==='POST'&&id==='discount-qr'&&parts[3]==='disable'){
        requireSkybookPermission(adminProfile,'engine')
        return json(200,await disableDiscountQr(subresource))
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
          'code','company_name','contact_name','email','phone','commission_type','commission_value','payout_terms','preferred_contact_method','services_handled','banking_details','settlement_metadata','is_active','metadata'
        ]))
      }

      if(request.method==='PATCH'&&id==='operators'&&subresource){
        requireSkybookPermission(adminProfile,'finance')
        return json(200,await upsertEngineRow('operators',{...requestBody,id:subresource},[
          'id','code','company_name','contact_name','email','phone','commission_type','commission_value','payout_terms','preferred_contact_method','services_handled','banking_details','settlement_metadata','is_active','metadata'
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

      if(request.method==='POST'&&id==='booking-operators'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await upsertBookingOperatorAssignment(requestBody,user.id))
      }

      if(request.method==='POST'&&id==='booking-agents'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await upsertBookingAgentAssignment(requestBody,user.id))
      }

      if(request.method==='POST'&&id==='notes'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await createAdminNote(requestBody,user.id))
      }

      if(request.method==='POST'&&id==='booking-tasks'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(201,await createBookingTask(requestBody,user.id))
      }

      if(request.method==='PATCH'&&id==='booking-tasks'&&subresource){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await updateBookingTask(subresource,requestBody,user.id))
      }

      if(request.method==='POST'&&id==='office-invoices'){
        requireSkybookPermission(adminProfile,'finance')
        return json(201,await createOfficeInvoice(requestBody,user.id))
      }

      if(request.method==='PATCH'&&id==='reconciliation'&&subresource){
        requireSkybookPermission(adminProfile,'reconciliation')
        return json(200,await updateReconciliationRecord(subresource,requestBody,user.id))
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

      if(request.method==='PATCH'&&id==='booking-fields'){
        requireSuperAdmin(adminProfile)
        const fields=normalizeBookingFieldDefinitions(requestBody.fields ?? requestBody)
        await upsertBookingSetting('booking_fields',fields,true)
        return json(200,{success:true,fields})
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

      if(request.method==='POST'&&id==='service-images'){
        requireSkybookPermission(adminProfile,'services')
        const formData=await request.formData()
        const file=formData.get('file') as File|null
        if(!file)throw new Error('No file uploaded.')
        const ext=file.name.split('.').pop()?.toLowerCase()||'jpg'
        if(!['jpg','jpeg','png','webp','avif'].includes(ext))throw new Error('Only image files are allowed.')
        const storagePath=`${crypto.randomUUID()}.${ext}`
        const bytes=await file.arrayBuffer()
        const {error}=await adminClient.storage.from(SERVICE_IMAGE_BUCKET).upload(storagePath,bytes,{contentType:file.type,upsert:false})
        if(error)throw new Error(error.message)
        const publicUrl=`${supabaseUrl}/storage/v1/object/public/${SERVICE_IMAGE_BUCKET}/${storagePath}`
        return json(200,{url:publicUrl})
      }

      if(request.method==='GET'&&id==='reviews'){
        requireSkybookPermission(adminProfile,'bookings')
        const statusFilter=new URL(request.url).searchParams.get('status')||''
        return json(200,{reviews:await listAdminReviews(statusFilter)})
      }

      if(request.method==='PATCH'&&id==='reviews'&&subresource){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await updateReviewStatus(subresource,requestBody))
      }

      if(request.method==='POST'&&id==='change-password'){
        const newPassword=normalizeText(requestBody.new_password)
        if(!newPassword || newPassword.length<8)throw new Error('New password must be at least 8 characters.')
        const { error:pwError }=await adminClient.auth.admin.updateUserById(user.id,{password:newPassword})
        if(pwError)throw new Error(pwError.message||'Password update failed.')
        await adminClient.from('app_users').update({must_change_password:false}).eq('id',user.id)
        return json(200,{success:true})
      }
    }

    // ── Developer portal routes ─────────────────────────────────────────────
    if(resource==='developer'){
      const devToken=request.headers.get('x-dev-token')||''
      const expectedToken=normalizeText(Deno.env.get('DEV_PORTAL_TOKEN'))
      if(!expectedToken||!devToken||devToken!==expectedToken)return json(401,{error:'Developer portal access denied.'})

      if(request.method==='GET'&&id==='users'){
        return json(200,{users:await listSkybookAdminUsers()})
      }

      if(request.method==='POST'&&id==='users'){
        return json(200,await upsertSkybookAdminUser(requestBody))
      }

      if(request.method==='PATCH'&&id==='users'&&subresource){
        return json(200,await upsertSkybookAdminUser({...requestBody,id:subresource}))
      }

      if(request.method==='DELETE'&&id==='users'&&subresource){
        await adminClient.from('app_users').delete().eq('id',subresource)
        await adminClient.auth.admin.deleteUser(subresource)
        return json(200,{success:true})
      }

      if(request.method==='GET'&&id==='system'){
        const [bookingCounts,emailCounts,customerCount,serviceCount]=await Promise.all([
          adminClient.from('bookings').select('status',{count:'exact',head:false}),
          adminClient.from('email_logs').select('status',{count:'exact',head:false}),
          adminClient.from('customers').select('id',{count:'exact',head:true}),
          adminClient.from('services').select('id',{count:'exact',head:true})
        ])
        const bookingsByStatus:Record<string,number>={}
        ;(bookingCounts.data||[]).forEach((row:{status:string})=>{ bookingsByStatus[row.status]=(bookingsByStatus[row.status]||0)+1 })
        const emailsByStatus:Record<string,number>={}
        ;(emailCounts.data||[]).forEach((row:{status:string})=>{ emailsByStatus[row.status]=(emailsByStatus[row.status]||0)+1 })
        return json(200,{
          bookings:{total:(bookingCounts.data||[]).length,by_status:bookingsByStatus},
          emails:{total:(emailCounts.data||[]).length,by_status:emailsByStatus},
          customers:customerCount.count||0,
          services:serviceCount.count||0
        })
      }
    }

    return json(404,{error:'Route not found.'})
  }catch(error){
    const msg=error instanceof Error ? error.message : ((error as {message?:string})?.message ? String((error as {message?:string}).message) : 'Unexpected booking API error.')
    return json(400,{error:msg})
  }
})
