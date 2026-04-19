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
  manager:{
    dashboard:true,
    calendar:true,
    reports:true,
    reconciliation:true,
    health:true,
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
  draft:['pending','awaiting_payment','cancelled','failed'],
  pending:['awaiting_payment','confirmed','cancelled','failed'],
  awaiting_payment:['confirmed','cancelled','failed'],
  confirmed:['completed','cancelled','refunded'],
  completed:['refunded'],
  cancelled:[],
  refunded:[],
  failed:['pending','cancelled']
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
const DEFAULT_QUEUE_SETTINGS={
  enabled:true,
  autoProcessOnBootstrap:true,
  reminderDelayHours:12,
  maxJobsPerSweep:25
}

const json=(status:number,payload:Json)=>new Response(JSON.stringify(payload),{
  status,
  headers:{...corsHeaders,'content-type':'application/json'}
})

const readBody=async(request:Request)=>{
  try{return await request.json()}catch{return {}}
}

const normalizeText=(value:unknown)=>String(value ?? '').trim()
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

const buildDocumentPdfBytes=async(booking:Json,documentType:string,context:Json={})=>{
  const pdf=await PDFDocument.create()
  let page=pdf.addPage([595.28,841.89])
  const font=await pdf.embedFont(StandardFonts.Helvetica)
  const bold=await pdf.embedFont(StandardFonts.HelveticaBold)
  const brandName=normalizeText(context.brand_name) || 'SkyBook'
  const currency=normalizeText(booking.currency_code || booking.currency || 'NAD')
  const totalAmount=Number(booking.total_amount || 0).toFixed(2)
  const invoiceNumber=normalizeText(context.document_number) || normalizeText(booking.reference)
  const lines=[
    'SkyBook Enterprise',
    `${brandName} ${displayLabel(documentType)}`,
    '',
    `Reference: ${normalizeText(booking.reference)}`,
    `Document Number: ${invoiceNumber}`,
    `Guest: ${normalizeText(context.customer_name || booking.customer_name)}`,
    `Service: ${normalizeText(context.service_name || booking.service_name)}`,
    `Preferred Date: ${normalizeText(String(booking.preferred_date || context.preferred_date || 'TBC'))}`,
    `Status: ${normalizeText(String(booking.status || 'pending')).replace(/_/g,' ')}`,
    `Payment Status: ${normalizeText(String(booking.payment_status || 'pending')).replace(/_/g,' ')}`,
    `Total Amount: ${currency} ${totalAmount}`,
    `Generated At: ${nowIso()}`,
    '',
    normalizeText(context.summary) || 'Operational document generated by SkyBook.',
    '',
    normalizeText(context.notes) || ''
  ].filter(line=>line!==undefined)
  let y=790
  page.drawText(lines[0],{ x:40, y, size:24, font:bold, color:rgb(0.09,0.2,0.35) })
  y-=30
  page.drawText(lines[1],{ x:40, y, size:18, font:bold, color:rgb(0.12,0.36,0.58) })
  y-=28
  for(const line of lines.slice(2)){
    if(y<60){
      y=790
      page=pdf.addPage([595.28,841.89])
    }
    page.drawText(line || ' ',{ x:40, y, size:11, font, color:rgb(0.1,0.13,0.18), maxWidth:510 })
    y-=18
  }
  return new Uint8Array(await pdf.save())
}

const fetchBookingDocumentContext=async(bookingId:string)=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,payment_status,preferred_date,total_amount,currency_code,customer_id,service_id,quantity,amount_due_now,amount_due_later,customers(full_name,email,phone),services(name,slug)')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)throw new Error('Booking not found.')
  const brand=await getBrandByCode(normalizeText(booking.brand_code) || 'true-travel')
  return {
    booking,
    brand,
    customer_name:normalizeText((booking.customers as Json | null)?.full_name),
    customer_email:normalizeText((booking.customers as Json | null)?.email),
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
  const documentTitle=normalizeText(payload.title) || `SkyBook ${displayLabel(documentType)}`
  const documentNumber=normalizeText(payload.document_number) || `${documentType.slice(0,3).toUpperCase()}-${normalizeText(booking.reference)}`
  const bookingDocument=existingDocument?.id
    ? await safeMaybeSingle<Json>(
        adminClient
          .from('booking_documents')
          .update({
            title:documentTitle,
            document_number:documentNumber,
            status:'generated',
            generated_at:nowIso(),
            metadata:{ ...(existingDocument.metadata || {}), generated_in:'skybook-storage' }
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
            metadata:{ generated_in:'skybook-storage' },
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
  const pdfBytes=await buildDocumentPdfBytes(booking,{
    brand_name:normalizeText(brand.name),
    customer_name,
    customer_email,
    service_name,
    document_number:documentNumber,
    summary:normalizeText(payload.summary) || `${displayLabel(documentType)} prepared for ${normalizeText(brand.name)} booking operations.`,
    notes:normalizeText(payload.notes) || normalizeText(payload.metadata?.notes)
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
        metadata:{ ...(typeof payload.metadata==='object' && payload.metadata ? payload.metadata : {}), generated_in:'skybook-storage' },
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
      .eq('status','active')
      .maybeSingle()
  )
  if(!session)throw new Error('Portal link is invalid or has expired.')
  const expiresAt=parseDateValue(normalizeText(session.expires_at))
  if(!expiresAt || expiresAt < new Date()){
    await adminClient.from('customer_portal_sessions').update({ status:'expired' }).eq('id',session.id)
    throw new Error('Portal link has expired.')
  }
  await adminClient.from('customer_portal_sessions').update({
    last_accessed_at:nowIso(),
    status:'used'
  }).eq('id',session.id)
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
    portal_session:session,
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

const loadBookingEmailContext=async(bookingId:string)=>{
  const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
  if(!booking)throw new Error('Booking not found for queued email.')
  const [customer,service]=await Promise.all([
    safeMaybeSingle<Json>(adminClient.from('customers').select('*').eq('id',String(booking.customer_id || '')).maybeSingle()),
    safeMaybeSingle<Json>(adminClient.from('services').select('*').eq('id',String(booking.service_id || '')).maybeSingle())
  ])
  return { booking, customer, service }
}

const enqueueBookingEmailJob=async({
  bookingId,
  customerId,
  templateKey,
  priority='normal',
  runAt=nowIso(),
  createdBy=null
}:{
  bookingId:string
  customerId:string
  templateKey:string
  priority?:string
  runAt?:string
  createdBy?:string | null
})=>{
  await enqueueSystemJob({
    job_type:'email_notification',
    job_group:'communications',
    priority,
    run_at:runAt,
    booking_id:bookingId,
    customer_id:customerId,
    related_table:'email_logs',
    payload:{ template_key:templateKey },
    created_by:createdBy
  })
}

const performQueuedEmailJob=async(job:Json)=>{
  const bookingId=normalizeText(job.booking_id)
  const templateKey=normalizeText(job.payload?.template_key) || 'status_changed'
  if(!bookingId)throw new Error('Queued email job is missing booking_id.')
  const { booking, customer, service }=await loadBookingEmailContext(bookingId)
  if(!customer?.email)throw new Error('Customer email is missing for queued email delivery.')
  const emailTemplates=await getSettingValue('email_templates',defaultEmailTemplates)
  const fallbackTemplate=(defaultEmailTemplates as unknown as Record<string,Json>)[templateKey] || defaultEmailTemplates.status_changed
  const template=(((emailTemplates||{}) as Json)[templateKey] || fallbackTemplate) as Json
  await queueEmailLog({
    bookingId,
    customerId:String(customer.id || booking.customer_id || ''),
    recipientEmail:String(customer.email),
    templateKey,
    subject:renderTemplate(String(template.subject || fallbackTemplate.subject),{
      customer_name:customer.full_name || 'Guest',
      booking_reference:booking.reference,
      service_name:service?.name || 'Service',
      booking_date:booking.preferred_date || 'To be confirmed',
      total_amount:booking.total_amount,
      payment_status:booking.payment_status
    }),
    body:renderTemplate(String(template.body || fallbackTemplate.body),{
      customer_name:customer.full_name || 'Guest',
      booking_reference:booking.reference,
      service_name:service?.name || 'Service',
      booking_date:booking.preferred_date || 'To be confirmed',
      total_amount:booking.total_amount,
      payment_status:booking.payment_status
    }),
    status:'queued'
  })
}

const runStatusAutomations=async(job:Json)=>{
  const automationRules=await getSettingValue('automation_rules',{
    autoConfirmPaidBookings:true,
    autoCompletePastConfirmedBookings:false,
    autoCancelExpiredAwaitingPayment:false,
    awaitingPaymentExpiryHours:48
  })
  const bookingId=normalizeText(job.booking_id)
  if(bookingId){
    const booking=await safeMaybeSingle<Json>(adminClient.from('bookings').select('*').eq('id',bookingId).maybeSingle())
    if(!booking)return
    if(Boolean((automationRules as Json).autoConfirmPaidBookings) && normalizeText(booking.payment_status)==='paid' && ['pending','awaiting_payment'].includes(normalizeText(booking.status))){
      await updateBooking(bookingId,{ status:'confirmed', payment_status:'paid', reason:'Auto-confirmed by SkyBook automation' },'')
    }
    if(Boolean((automationRules as Json).autoCompletePastConfirmedBookings) && normalizeText(booking.status)==='confirmed'){
      const preferredDate=parseDateValue(String(booking.preferred_date || ''))
      if(preferredDate && preferredDate < new Date()){
        await updateBooking(bookingId,{ status:'completed', reason:'Auto-completed by SkyBook automation' },'')
      }
    }
    return
  }
  if(Boolean((automationRules as Json).autoCompletePastConfirmedBookings)){
    const confirmedBookings=await safeTableSelect<Json>(adminClient.from('bookings').select('*').eq('status','confirmed'),[])
    for(const booking of confirmedBookings){
      const preferredDate=parseDateValue(String(booking.preferred_date || ''))
      if(preferredDate && preferredDate < new Date()){
        await updateBooking(String(booking.id || ''),{ status:'completed', reason:'Auto-completed by SkyBook automation' },'')
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

const resolveOutstandingAmounts=(pricing:{
  amountDueNow:number
  amountDueLater:number
},paymentStatus:string)=>{
  const normalized=normalizeText(paymentStatus).toLowerCase()
  if(['paid','refunded','cancelled'].includes(normalized)){
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
})=>{
  const existingLine=await safeMaybeSingle<Json>(
    adminClient
      .from('booking_items')
      .select('id')
      .eq('booking_id',bookingId)
      .eq('item_type','service')
      .maybeSingle()
  )
  const linePayload={
    booking_id:bookingId,
    item_type:'service',
    service_id:service.id,
    description:service.name,
    quantity:pricing.quantity,
    unit_price:Number((Number(pricing.subtotalAmount || 0) / Math.max(1,Number(pricing.quantity || 1))).toFixed(2)),
    line_total:Number(pricing.subtotalAmount || 0),
    metadata:{ source:'booking-api' }
  }
  if(existingLine?.id){
    const { error }=await adminClient.from('booking_items').update(linePayload).eq('id',existingLine.id)
    if(error)throw error
    return
  }
  const { error }=await adminClient.from('booking_items').insert(linePayload)
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
      .select('id,reference,status,payment_status,preferred_date,subtotal_amount,tax_amount,total_amount,currency_code,amount_due_now,amount_due_later,service_id,quantity')
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
    balance_amount:String(booking.payment_status)==='paid'
      ? 0
      : Number((Number(booking.amount_due_now || 0) + Number(booking.amount_due_later || 0) || Number(booking.total_amount || 0))),
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
  await syncLifecycleTasks(bookingId,userId)
  await syncReconciliationRecordForBooking(bookingId,userId)
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
    metadata:{ actor_user_id:safeUuid(userId), source:'booking-api' }
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
  if(bookingId)await syncReconciliationRecordForBooking(bookingId,userId)
  return { success:true, office_invoice:invoice }
}

const maybeCreateAutomatedOfficeSettlement=async(bookingId:string,userId:string | null='')=>{
  const booking=await safeMaybeSingle<Json>(
    adminClient
      .from('bookings')
      .select('id,reference,status,total_amount,currency_code')
      .eq('id',bookingId)
      .maybeSingle()
  )
  if(!booking)return null
  if(!['confirmed','completed'].includes(normalizeText(booking.status)))return null
  const assignment=await safeMaybeSingle<Json>(adminClient.from('booking_operators').select('*').eq('booking_id',bookingId).maybeSingle())
  if(!assignment?.operator_id)return null
  const existing=await safeMaybeSingle<Json>(
    adminClient
      .from('office_invoices')
      .select('id')
      .eq('booking_id',bookingId)
      .eq('operator_id',assignment.operator_id)
      .eq('invoice_type','operator_commission')
      .neq('status','cancelled')
      .maybeSingle()
  )
  if(existing?.id)return existing
  const result=await createOfficeInvoice({
    booking_id:bookingId,
    operator_id:assignment.operator_id,
    invoice_type:'operator_commission',
    payee_type:'operator',
    commission_base_amount:Number(booking.total_amount || 0),
    commission_amount:Number(assignment.commission_amount || 0),
    currency_code:String(booking.currency_code || 'NAD'),
    notes:'Auto-generated from booking confirmation/completion.'
  },String(userId || ''))
  return result.office_invoice || null
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
  const outstandingAmounts=resolveOutstandingAmounts(pricing,paymentStatus)
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
    amount_due_now:outstandingAmounts.amountDueNow,
    amount_due_later:outstandingAmounts.amountDueLater,
    customer_notes:normalizeText(payload.notes),
    lookup_email:customer.email,
    metadata:{source:isAdmin ? 'admin' : 'website_booking_module',brand_code:String(brand.code || brandCode)}
  }).select().single()
  if(error)throw error

  await syncBookingItems(booking.id,service,pricing)
  await createOrUpdatePayment(booking.id,paymentStatus,paymentStatus==='paid' ? pricing.totalAmount : outstandingAmounts.amountDueNow,service.currency)
  await maybeCreateBookingDiscounts(booking.id,promotionState.discounts)
  const voucherDiscount=promotionState.discounts.find(item=>item.source_type==='voucher')?.amount || 0
  const agentDiscount=promotionState.discounts.find(item=>item.source_type==='agent')?.amount || 0
  await maybeApplyVoucherRedemption(booking.id,promotionState.voucherRow,voucherDiscount)
  await maybeLinkBookingAgent(booking.id,promotionState.agentRow,agentDiscount)
  await maybeAllocateResources(booking.id,String(service.id || ''),normalizeText(payload.preferred_date),pricing.quantity)
  await insertStatusHistory(booking.id,null,bookingStatus,isAdmin ? 'Booking created in admin' : 'Booking created via website flow',isAdmin ? 'admin' : 'website',userId||null)
  await syncInvoiceForBooking(booking.id)
  await syncLifecycleTasks(booking.id,userId || null)
  await maybeCreateAutomatedOfficeSettlement(booking.id,userId || null)
  await syncReconciliationRecordForBooking(booking.id,userId || null)
  await enqueueBookingEmailJob({
    bookingId:booking.id,
    customerId:customer.id,
    templateKey:'booking_received',
    priority:'high',
    createdBy:userId || null
  })
  if(outstandingAmounts.amountDueNow>0){
    await enqueueBookingEmailJob({
      bookingId:booking.id,
      customerId:customer.id,
      templateKey:'status_changed',
      priority:'normal',
      runAt:addHours(new Date(),Number((await getSettingValue('queue',DEFAULT_QUEUE_SETTINGS) as Json).reminderDelayHours || DEFAULT_QUEUE_SETTINGS.reminderDelayHours)),
      createdBy:userId || null
    })
  }
  await enqueueSystemJob({
    job_type:'status_automation',
    job_group:'operations',
    priority:'normal',
    booking_id:booking.id,
    created_by:userId || null
  })
  await processDueSystemJobs()

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
  const settings=await getSettingValue('config',{
    currency:'NAD',
    paymentMode:'deposit',
    defaultDepositValue:30,
    taxRate:0,
    serviceFee:0
  })
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
  let service=(
    await fetchServices({
      includeInactive:true,
      brandCode:normalizeText(payload.brand_code) || normalizeText(existing.brand_code)
    })
  ).find(item=>String(item.id)===String(serviceId))
  if(normalizeText(payload.service_slug)){
    service=await getServiceBySlug(normalizeText(payload.service_slug),true,normalizeText(payload.brand_code) || normalizeText(existing.brand_code))
    serviceId=service.id
    serviceSlug=service.slug
  }
  if(!service)throw new Error('Service not found.')
  const nextStatus=normalizeText(payload.status)||existing.status
  const nextPaymentStatus=normalizeText(payload.payment_status)||existing.payment_status
  validateBookingTransition(existing.status,nextStatus,nextPaymentStatus)
  const nextPreferredDate=Object.prototype.hasOwnProperty.call(payload,'preferred_date')
    ? (normalizeText(payload.preferred_date)||null)
    : existing.preferred_date
  const nextQuantity=Math.max(1,Number(payload.quantity||existing.quantity||1))
  const pricing=calculatePricing(service,payload.quantity!==undefined ? {...payload,quantity:nextQuantity} : {quantity:nextQuantity},settings as Json)
  const outstandingAmounts=resolveOutstandingAmounts(pricing,nextPaymentStatus)
  const updatePayload:Json={
    reference:normalizeText(payload.reference)||existing.reference,
    brand_code:normalizeText(payload.brand_code)||existing.brand_code,
    customer_id:customer.id,
    service_id:serviceId,
    status:nextStatus,
    payment_status:nextPaymentStatus,
    preferred_date:nextPreferredDate,
    confirmed_date:['confirmed','completed'].includes(String(nextStatus)) ? (nextPreferredDate || existing.confirmed_date) : existing.confirmed_date,
    quantity:nextQuantity,
    subtotal_amount:pricing.subtotalAmount,
    tax_amount:pricing.taxAmount,
    service_fee_amount:pricing.serviceFeeAmount,
    total_amount:pricing.totalAmount,
    amount_due_now:outstandingAmounts.amountDueNow,
    amount_due_later:outstandingAmounts.amountDueLater,
    currency_code:String(service.currency || existing.currency_code || 'NAD'),
    customer_notes:Object.prototype.hasOwnProperty.call(payload,'notes') ? normalizeText(payload.notes) : existing.customer_notes,
    lookup_email:customer.email,
    updated_by:userId
  }
  const { error:updateError }=await adminClient.from('bookings').update(updatePayload).eq('id',id)
  if(updateError)throw updateError
  await createOrUpdatePayment(
    id,
    String(updatePayload.payment_status),
    String(updatePayload.payment_status)==='paid' ? Number(pricing.totalAmount || 0) : Number(outstandingAmounts.amountDueNow || 0),
    String(updatePayload.currency_code || existing.currency_code || 'NAD')
  )
  await syncBookingItems(id,service,pricing)
  if(updatePayload.status!==existing.status){
    await insertStatusHistory(id,String(existing.status),String(updatePayload.status),normalizeText(payload.reason)||'Booking updated in admin',`admin:${userId}`,userId)
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
  if(String(updatePayload.status)==='confirmed'){
    await enqueueBookingEmailJob({
      bookingId:id,
      customerId:String(customer.id || ''),
      templateKey:'booking_confirmed',
      priority:'high',
      createdBy:userId
    })
  }else if(String(updatePayload.status)!==String(existing.status) || String(updatePayload.payment_status)!==String(existing.payment_status)){
    await enqueueBookingEmailJob({
      bookingId:id,
      customerId:String(customer.id || ''),
      templateKey:'status_changed',
      priority:'normal',
      createdBy:userId
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
  return updateBooking(bookingId,{
    preferred_date:preferredDate,
    status:normalizeText(payload.status) || normalizeText(existing.status),
    reason:normalizeText(payload.reason) || 'Booking rescheduled in SkyBook'
  },userId)
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
  const queueSettings=await getSettingValue('queue',DEFAULT_QUEUE_SETTINGS)
  if((queueSettings as Json).autoProcessOnBootstrap!==false){
    await processDueSystemJobs()
  }
  await syncAllReconciliationRecords(String(user.id || ''))
  const [bookingsResult,customersResult,paymentsResult,services,settings,emailTemplates,automationRules,portalSettings,integrationSettings,reportingSettings,opsTemplates,brands]=await Promise.all([
    adminClient
      .from('bookings')
      .select('id,reference,brand_code,status,payment_status,preferred_date,confirmed_date,quantity,total_amount,currency_code,amount_due_now,amount_due_later,source,customer_notes,cancellation_reason,metadata,created_at,updated_at,updated_by,customer_id,service_id,customers(full_name,email,phone),services(name,slug)')
      .order('created_at',{ascending:false}),
    adminClient.from('customers').select('id,full_name,email,phone,created_at').order('created_at',{ascending:false}),
    adminClient.from('payments').select('id,booking_id,provider,status,amount,amount_received,currency_code,provider_reference,external_checkout_url,paid_at,created_at').order('created_at',{ascending:false}),
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
      allowSelfServiceRequests:true,
      allowDocumentDownloads:true,
      sessionDurationHours:72,
      portalBaseUrl:'/portal.html'
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
    getSettingValue('ops_templates',DEFAULT_OPS_TEMPLATES),
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
    confirmed_date:row.confirmed_date,
    quantity:row.quantity,
    total_amount:Number(row.total_amount||0),
    currency:row.currency_code,
    amount_due_now:Number(row.amount_due_now||0),
    amount_due_later:Number(row.amount_due_later||0),
    source:row.source || 'website',
    cancellation_reason:row.cancellation_reason || '',
    metadata:row.metadata || {},
    customer_name:row.customers?.full_name||'',
    customer_email:row.customers?.email||'',
    customer_phone:row.customers?.phone||'',
    service_name:row.services?.name||'',
    service_slug:row.services?.slug||'',
    customer_notes:row.customer_notes||'',
    customer_id:row.customer_id || null,
    service_id:row.service_id || null,
    updated_at:row.updated_at || row.created_at,
    updated_by:row.updated_by || null,
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
      amount_received:Number(payment.amount_received||0),
      currency:payment.currency_code,
      currency_code:payment.currency_code,
      provider_reference:payment.provider_reference || null,
      external_checkout_url:payment.external_checkout_url || null,
      paid_at:payment.paid_at || null,
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
    adminNotes,
    bookingTasks,
    bookingDocuments,
    portalRequests,
    staffDirectory,
    documentVersionsRaw,
    portalSessions,
    systemJobs,
    healthEvents,
    reconciliationRecords
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
    safeTableSelect<Json>(adminClient.from('admin_notes').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('booking_tasks').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('booking_documents').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('booking_portal_requests').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('app_users').select('id,full_name,role,is_active').order('full_name',{ascending:true})),
    safeTableSelect<Json>(adminClient.from('booking_document_versions').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('customer_portal_sessions').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('system_jobs').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('system_health_events').select('*').order('created_at',{ascending:false})),
    safeTableSelect<Json>(adminClient.from('reconciliation_records').select('*').order('created_at',{ascending:false}))
  ])
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
  const documentVersions=await Promise.all((documentVersionsRaw || []).slice(0,160).map(async version=>({
    ...version,
    signed_url:await createSignedDocumentUrl(normalizeText(version.storage_bucket) || DOCUMENT_BUCKET,normalizeText(version.storage_path))
  })))
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
    booking_operators:canSeeAssignments ? bookingOperators : [],
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
  const { data:booking,error }=await adminClient.from('bookings').select('id,reference,lookup_email,customer_id,preferred_date,total_amount,payment_status,status,service_id').eq('id',bookingId).single()
  if(error||!booking)throw new Error('Booking not found.')
  await enqueueBookingEmailJob({
    bookingId:booking.id,
    customerId:String(booking.customer_id || ''),
    templateKey:'status_changed',
    priority:'high',
    createdBy:userId
  })
  await processDueSystemJobs()
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

    if(resource==='portal' && request.method==='POST' && id==='session' && subresource==='resolve'){
      return json(200,await resolvePortalSessionContext(normalizeText(requestBody.token)))
    }

    if(resource==='portal' && request.method==='POST' && id==='session' && subresource==='request'){
      return json(201,await createPortalSelfServiceRequest(normalizeText(requestBody.token),requestBody))
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

      if(request.method==='GET'&&id==='document-versions'&&subresource&&parts[3]==='signed-url'){
        requireSkybookPermission(adminProfile,'bookings')
        return json(200,await getDocumentVersionSignedUrl(subresource))
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
