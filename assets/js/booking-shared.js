window.TrueTravelBooking=(()=>{
  const shared=window.TrueTravelShared||{}
  const STORAGE_KEYS={
    BOOKING_CONFIG_KEY:'skybook-booking-config-v2',
    BOOKING_UI_STATE_KEY:'skybook-booking-ui-state-v2',
    BOOKING_DEMO_DB_KEY:'skybook-booking-demo-db-v2'
  }

  const DEFAULT_CONFIG={
    projectName:'True Travel',
    brandCode:'true-travel',
    currency:'NAD',
    currencySymbol:'N$',
    locale:'en-NA',
    supportEmail:'bookings@truetravelnam.net',
    supportPhone:'+264813224270',
    supportWhatsApp:'+264813224270',
    lookupWindowDays:365,
    apiBase:'https://zegfirgyhdjyehvhlrnh.supabase.co/functions/v1/booking-api',
    paymentProviders:['dpo','apple_pay','google_pay','manual_eft','stripe'],
    paymentMode:'deposit',
    defaultDepositType:'percentage',
    defaultDepositValue:30,
    taxRate:0,
    serviceFee:0,
    environment:'production',
    allowDemoFallback:false,
    supabaseUrl:'https://zegfirgyhdjyehvhlrnh.supabase.co',
    supabaseAnonKey:(shared.DEFAULT_SUPABASE_CONFIG?.anonKey)||''
  }

  const BRAND_CATALOG={
    'true-travel':{
      code:'true-travel',
      projectName:'True Travel',
      supportEmail:'bookings@truetravelnam.net',
      supportPhone:'+264813224270',
      supportWhatsApp:'+264813224270',
      bookingPrefix:'TT'
    },
    iventure:{
      code:'iventure',
      projectName:'Iventure',
      supportEmail:'bookings@iventure.com.na',
      supportPhone:'+264813224270',
      supportWhatsApp:'+264813224270',
      bookingPrefix:'IV'
    }
  }

  const DEFAULT_CATEGORIES=[
    {slug:'coastal-tours',name:'Coastal Tours',description:'Signature ocean-and-dune experiences around Walvis Bay.'},
    {slug:'combo-tours',name:'Combo Tours',description:'Fuller itineraries that combine multiple highlights into one booking.'},
    {slug:'private-experiences',name:'Private Experiences',description:'Tailored experiences for couples, families, and small groups.'}
  ]

  const DEFAULT_EMAIL_TEMPLATES={
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
      body:'Hi {{customer_name}},\n\nYour booking status changed to {{payment_status}} for {{service_name}}.\nReference: {{booking_reference}}\nDate: {{booking_date}}\nTotal: {{total_amount}}\n\nTrue Travel'
    }
  }

  const ADDON_TYPES=['per_booking','per_person']
  const DATE_REQUIREMENT_TYPES=['optional','required','hidden']
  const BOOKING_STATUSES=['draft','pending','awaiting_payment','confirmed','cancelled','completed','refunded','failed']
  const PAYMENT_STATUSES=['unpaid','pending','authorized','paid','partially_paid','failed','refunded','cancelled']
  const PAYMENT_PROVIDERS=['manual_eft','stripe','apple_pay','google_pay','dpo','custom']
  const SKYBOOK_PERMISSION_CATALOG=[
    { key:'dashboard', label:'Dashboard', description:'Access the command center and operational snapshots.' },
    { key:'calendar', label:'Calendar', description:'Use the day, week, and month operations calendar.' },
    { key:'reports', label:'Reports', description:'View commercial, finance, and performance reporting.' },
    { key:'reconciliation', label:'Reconciliation', description:'Match guest invoices, refunds, commissions, and operator payables.' },
    { key:'health', label:'System Health', description:'Monitor queues, failed jobs, email errors, webhooks, and callbacks.' },
    { key:'bookings', label:'Bookings', description:'Create, edit, confirm, cancel, resend, and action bookings.' },
    { key:'customers', label:'Customers', description:'View customer history and guest records.' },
    { key:'payments', label:'Payments', description:'Track guest payments and payment reconciliation.' },
    { key:'services', label:'Services', description:'Manage services, packages, and catalog setup.' },
    { key:'engine', label:'Booking Engine', description:'Manage schedules, blackout dates, vouchers, resources, and operators.' },
    { key:'finance', label:'Finance', description:'Manage office invoices, refunds, commissions, and settlements.' },
    { key:'settings', label:'Settings', description:'Change booking configuration and platform settings.' },
    { key:'emails', label:'Email Templates', description:'Manage operational email templates and communication tooling.' },
    { key:'admin_users', label:'Admin Users', description:'Grant staff access, roles, and section permissions.' }
  ]
  const SKYBOOK_PERMISSION_KEYS=SKYBOOK_PERMISSION_CATALOG.map(item=>item.key)
  const SKYBOOK_ROLE_DEFAULTS={
    super_admin:Object.fromEntries(SKYBOOK_PERMISSION_KEYS.map(key=>[key,true])),
    manager:{dashboard:true,calendar:true,reports:true,reconciliation:true,health:true,bookings:true,customers:true,payments:true,services:true,engine:true,finance:true,settings:true,emails:true,admin_users:false},
    booking_agent:{dashboard:true,calendar:true,reports:false,reconciliation:false,health:false,bookings:true,customers:true,payments:false,services:false,engine:false,finance:false,settings:false,emails:false,admin_users:false},
    reservations:{dashboard:true,calendar:true,reports:false,reconciliation:false,health:false,bookings:true,customers:true,payments:false,services:false,engine:false,finance:false,settings:false,emails:true,admin_users:false},
    operations:{dashboard:true,calendar:true,reports:true,reconciliation:false,health:true,bookings:true,customers:true,payments:false,services:false,engine:true,finance:false,settings:false,emails:false,admin_users:false},
    supplier_management:{dashboard:true,calendar:true,reports:true,reconciliation:true,health:false,bookings:true,customers:false,payments:false,services:false,engine:true,finance:true,settings:false,emails:false,admin_users:false},
    finance:{dashboard:true,calendar:false,reports:true,reconciliation:true,health:true,bookings:true,customers:true,payments:true,services:false,engine:false,finance:true,settings:false,emails:false,admin_users:false}
  }
  const sanitizePermissions=input=>{
    const source=typeof input==='object' && input ? input : {}
    return Object.fromEntries(SKYBOOK_PERMISSION_KEYS.map(key=>[key,Boolean(source[key])]))
  }

  const clone=value=>JSON.parse(JSON.stringify(value))
  const toSlug=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
  const capitalize=value=>String(value||'').charAt(0).toUpperCase()+String(value||'').slice(1)
  const readJson=(key,fallback)=>{
    try{
      const raw=localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    }catch{
      return fallback
    }
  }
  const writeJson=(key,value)=>localStorage.setItem(key,JSON.stringify(value))
  const getPageBrandCode=()=>{
    const queryBrand=new URLSearchParams(window.location.search).get('brand')
    if(queryBrand&&BRAND_CATALOG[toSlug(queryBrand)])return toSlug(queryBrand)
    const bodyBrand=document.body?.dataset?.brand||document.documentElement?.dataset?.brand||''
    if(bodyBrand&&BRAND_CATALOG[toSlug(bodyBrand)])return toSlug(bodyBrand)
    const host=String(window.location.hostname||'').toLowerCase()
    if(host.includes('iventure'))return 'iventure'
    return ''
  }
  const detectBrandCode=()=>{
    const pageBrand=getPageBrandCode()
    if(pageBrand)return pageBrand
    return 'true-travel'
  }
  const getBrandConfig=brandCode=>BRAND_CATALOG[toSlug(brandCode)]||BRAND_CATALOG['true-travel']
  const readConfig=()=>{
    const savedConfig=readJson(STORAGE_KEYS.BOOKING_CONFIG_KEY,{})
    const stored={...DEFAULT_CONFIG,...savedConfig}
    const brandCode=toSlug(getPageBrandCode()||savedConfig.brandCode||DEFAULT_CONFIG.brandCode)||'true-travel'
    return {...stored,...getBrandConfig(brandCode),brandCode}
  }
  const writeConfig=config=>writeJson(STORAGE_KEYS.BOOKING_CONFIG_KEY,{...readConfig(),...config})
  let supabaseBrowserModulePromise=null
  const loadSupabaseBrowserModule=()=>{
    if(supabaseBrowserModulePromise)return supabaseBrowserModulePromise
    supabaseBrowserModulePromise=import('https://esm.sh/@supabase/supabase-js@2.49.4')
    return supabaseBrowserModulePromise
  }
  const createSupabaseClient=async()=>{
    const config=readConfig()
    if(!config.supabaseUrl||!config.supabaseAnonKey)throw new Error('Supabase URL or anon key is missing from booking configuration.')
    const { createClient }=await loadSupabaseBrowserModule()
    return createClient(config.supabaseUrl,config.supabaseAnonKey)
  }
  const getAuthHeaders=token=>{
    const config=readConfig()
    const headers={}
    headers['x-brand-code']=config.brandCode
    if(config.supabaseAnonKey){
      headers.apikey=config.supabaseAnonKey
      headers.Authorization=`Bearer ${token||config.supabaseAnonKey}`
    }else if(token){
      headers.Authorization=`Bearer ${token}`
    }
    return headers
  }
  const readUiState=()=>readJson(STORAGE_KEYS.BOOKING_UI_STATE_KEY,{})
  const writeUiState=state=>writeJson(STORAGE_KEYS.BOOKING_UI_STATE_KEY,state)
  const escapeHtml=value=>shared.escapeHtml ? shared.escapeHtml(value) : String(value??'')
    .replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))
  const safeText=value=>String(value??'').trim()
  const nowIso=()=>new Date().toISOString()
  const currentDate=()=>new Date().toISOString().slice(0,10)
  const uid=(prefix='tt')=>`${prefix}_${Math.random().toString(36).slice(2,10)}${Date.now().toString(36).slice(-4)}`
  const formatMoney=(value,currency=readConfig().currency)=>{
    const amount=Number(value||0)
    return new Intl.NumberFormat(readConfig().locale,{style:'currency',currency,maximumFractionDigits:2}).format(amount)
  }
  const createReference=()=>{
    const config=readConfig()
    const stamp=new Date().toISOString().slice(2,10).replace(/-/g,'')
    const rand=Math.random().toString(36).slice(2,6).toUpperCase()
    return `${config.bookingPrefix||'TT'}-${stamp}-${rand}`
  }

  const getDefaultServices=()=>{
    const toursData=shared.readToursData ? shared.readToursData() : {tours:[]}
    return toursData.tours.map((tour,index)=>{
      const season=shared.getTourSeasonForDate ? shared.getTourSeasonForDate(tour,currentDate()) : {adultPrice:0}
      return {
        id:uid('svc'),
        slug:tour.id,
        category_slug:tour.tourType==='combo' ? 'combo-tours' : 'coastal-tours',
        name:tour.name,
        short_description:tour.summary||'Professionally guided coastal experience.',
        full_description:tour.summary||'Professionally guided coastal experience with a premium booking flow.',
        duration_label:tour.durationLabel||'Custom duration',
        unit_label:'guest',
        preferred_date_mode:'optional',
        base_price:Number(season.adultPrice||0),
        currency:'NAD',
        is_active:true,
        requires_manual_confirmation:true,
        payment_mode:'deposit',
        deposit_type:'percentage',
        deposit_value:30,
        media_url:tour.imageUrl||'',
        highlight_points:tour.timeSlots||[],
        brand_codes:Object.keys(BRAND_CATALOG),
        addons:[],
        sort_order:index+1
      }
    })
  }

  const getSeedServices=()=>getDefaultServices().map((service,index)=>normalizeService({
    ...service,
    id:`svc-seed-${index+1}`,
    addons:[]
  }))

  const normalizeAddon=addon=>({
    id:addon?.id||uid('add'),
    name:safeText(addon?.name)||'Add-on',
    slug:toSlug(addon?.slug||addon?.name||uid('addon')),
    price:Number(addon?.price||0),
    pricing_type:ADDON_TYPES.includes(addon?.pricing_type) ? addon.pricing_type : 'per_booking',
    is_active:addon?.is_active!==false
  })

  const normalizeService=service=>({
    id:service?.id||uid('svc'),
    slug:toSlug(service?.slug||service?.name||uid('service')),
    category_slug:toSlug(service?.category_slug||service?.categorySlug||'coastal-tours'),
    name:safeText(service?.name)||'Untitled Service',
    short_description:safeText(service?.short_description||service?.shortDescription||''),
    full_description:safeText(service?.full_description||service?.fullDescription||service?.short_description||''),
    duration_label:safeText(service?.duration_label||service?.durationLabel||'Flexible'),
    unit_label:safeText(service?.unit_label||service?.unitLabel||'guest'),
    preferred_date_mode:DATE_REQUIREMENT_TYPES.includes(service?.preferred_date_mode) ? service.preferred_date_mode : 'optional',
    base_price:Number(service?.base_price||service?.basePrice||0),
    currency:safeText(service?.currency||'NAD')||'NAD',
    is_active:service?.is_active!==false,
    requires_manual_confirmation:service?.requires_manual_confirmation!==false,
    payment_mode:safeText(service?.payment_mode||'deposit')||'deposit',
    deposit_type:safeText(service?.deposit_type||'percentage')||'percentage',
    deposit_value:Number(service?.deposit_value||30),
    media_url:safeText(service?.media_url||service?.imageUrl||''),
    highlight_points:Array.isArray(service?.highlight_points) ? service.highlight_points.map(safeText).filter(Boolean) : [],
    brand_codes:Array.from(new Set(
      (
        Array.isArray(service?.brand_codes)
          ? service.brand_codes
          : (Array.isArray(service?.metadata?.brand_codes) ? service.metadata.brand_codes : Object.keys(BRAND_CATALOG))
      ).map(value=>safeText(value)).filter(Boolean)
    )),
    addons:Array.isArray(service?.addons) ? service.addons.map(normalizeAddon) : [],
    sort_order:Number(service?.sort_order||0)||0
  })

  const normalizeCustomer=input=>({
    full_name:safeText(input?.full_name||input?.fullName||''),
    email:safeText(input?.email||'').toLowerCase(),
    phone:safeText(input?.phone||''),
    whatsapp:safeText(input?.whatsapp||input?.phone||''),
    notes:safeText(input?.notes||'')
  })

  const calculatePricing=(service,payload,config=readConfig())=>{
    const normalizedService=normalizeService(service)
    const quantity=Math.max(1,Number(payload?.quantity||payload?.persons||1)||1)
    const selectedAddons=Array.isArray(payload?.addons) ? payload.addons : []
    const addonRows=normalizedService.addons.filter(addon=>selectedAddons.includes(addon.slug))
    const baseSubtotal=normalizedService.base_price*quantity
    const addonsSubtotal=addonRows.reduce((sum,addon)=>sum+(
      addon.pricing_type==='per_person' ? addon.price*quantity : addon.price
    ),0)
    const serviceFee=Number(payload?.serviceFee ?? config.serviceFee ?? 0)
    const taxRate=Number(payload?.taxRate ?? config.taxRate ?? 0)
    const subtotal=baseSubtotal+addonsSubtotal
    const taxAmount=subtotal*(taxRate/100)
    const total=subtotal+serviceFee+taxAmount
    const wantsFullPayment=(payload?.payment_mode||normalizedService.payment_mode)==='full'
    const depositMode=normalizedService.deposit_type==='fixed'
      ? Number(normalizedService.deposit_value||0)
      : total*(Number(normalizedService.deposit_value||0)/100)
    const amountDueNow=wantsFullPayment ? total : Math.min(total,Number(depositMode.toFixed(2)))
    return {
      currency:normalizedService.currency,
      quantity,
      base_unit_price:normalizedService.base_price,
      base_subtotal:Number(baseSubtotal.toFixed(2)),
      addons:addonRows.map(addon=>({
        slug:addon.slug,
        name:addon.name,
        amount:Number((addon.pricing_type==='per_person' ? addon.price*quantity : addon.price).toFixed(2))
      })),
      addons_subtotal:Number(addonsSubtotal.toFixed(2)),
      service_fee:Number(serviceFee.toFixed(2)),
      tax_rate:Number(taxRate.toFixed(2)),
      tax_amount:Number(taxAmount.toFixed(2)),
      total_amount:Number(total.toFixed(2)),
      amount_due_now:Number(amountDueNow.toFixed(2)),
      amount_due_later:Number(Math.max(0,total-amountDueNow).toFixed(2))
    }
  }

  const validators={
    required(value,label){
      if(!safeText(value))return `${label} is required.`
      return ''
    },
    email(value){
      const normalized=safeText(value).toLowerCase()
      if(!normalized)return 'Email is required.'
      if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized))return 'Enter a valid email address.'
      return ''
    },
    phone(value){
      const normalized=safeText(value)
      if(!normalized)return 'Phone or WhatsApp number is required.'
      if(normalized.replace(/[^\d+]/g,'').length<7)return 'Enter a valid phone or WhatsApp number.'
      return ''
    },
    quantity(value){
      const numeric=Number(value||0)
      if(!Number.isFinite(numeric)||numeric<1)return 'Quantity must be at least 1.'
      if(numeric>99)return 'Quantity must be 99 or fewer.'
      return ''
    },
    preferredDate(value,mode){
      if(mode==='required'&&!safeText(value))return 'Preferred date is required for this service.'
      return ''
    },
    acceptedTerms(value){
      return value ? '' : 'You must accept the booking terms before continuing.'
    }
  }

  const validateBookingPayload=(service,payload)=>{
    const normalizedService=normalizeService(service)
    const customer=normalizeCustomer(payload.customer||payload)
    const errors={}
    errors.service=validators.required(payload.service_slug||normalizedService.slug,'Service')
    errors.full_name=validators.required(customer.full_name,'Full name')
    errors.email=validators.email(customer.email)
    errors.phone=validators.phone(customer.phone||customer.whatsapp)
    errors.quantity=validators.quantity(payload.quantity)
    errors.preferred_date=validators.preferredDate(payload.preferred_date,normalizedService.preferred_date_mode)
    errors.terms=validators.acceptedTerms(Boolean(payload.accept_terms))
    return Object.fromEntries(Object.entries(errors).filter(([,value])=>value))
  }

  const readDemoDb=()=>{
    const existing=readJson(STORAGE_KEYS.BOOKING_DEMO_DB_KEY,null)
    if(existing)return existing
    const services=getSeedServices()
    const customer={
      id:'cust-demo-1',
      full_name:'Demo Guest',
      email:'guest@example.com',
      phone:'+264810000000',
      whatsapp:'+264810000000',
      notes:''
    }
    const booking={
      id:'bkg-demo-1',
      reference:'TT-260417-DEMO',
      status:'pending',
      payment_status:'pending',
      customer_id:customer.id,
      customer_name:customer.full_name,
      customer_email:customer.email,
      customer_phone:customer.phone,
      service_id:services[0]?.id||'svc-seed-1',
      service_slug:services[0]?.slug||'pelican-point-kayaking',
      service_name:services[0]?.name||'Pelican Point Kayaking',
      brand_code:readConfig().brandCode,
      preferred_date:currentDate(),
      quantity:2,
      currency:'NAD',
      subtotal_amount:Number((services[0]?.base_price||0)*2),
      addons_amount:0,
      tax_amount:0,
      service_fee_amount:0,
      total_amount:Number((services[0]?.base_price||0)*2),
      amount_due_now:Number(((services[0]?.base_price||0)*2*0.3).toFixed(2)),
      amount_due_later:Number((((services[0]?.base_price||0)*2)*0.7).toFixed(2)),
      notes:'Anniversary travellers',
      created_at:nowIso(),
      updated_at:nowIso()
    }
    const payment={
      id:'pay-demo-1',
      booking_id:booking.id,
      reference:booking.reference,
      provider:'manual_eft',
      status:'pending',
      amount:booking.amount_due_now,
      currency:'NAD',
      created_at:nowIso()
    }
    const db={
      services,
      customers:[customer],
      bookings:[booking],
      payments:[payment],
      app_users:[{
        id:'auth-demo-1',
        email:'demo@local.test',
        full_name:'Local Demo Admin',
        role:'super_admin',
        is_active:true,
        permissions:sanitizePermissions({})
      }],
      notes:[],
      email_logs:[{
        id:'email-demo-1',
        booking_id:booking.id,
        customer_id:customer.id,
        template_key:'booking_received',
        recipient_email:customer.email,
        subject:`We received your booking request ${booking.reference}`,
        rendered_body:'Demo email log entry.',
        status:'queued',
        created_at:nowIso()
      }],
      status_history:[{
        id:'hist-demo-1',
        booking_id:booking.id,
        from_status:null,
        to_status:'pending',
        reason:'Demo seed',
        actor_label:'system',
        created_at:nowIso()
      }]
    }
    writeJson(STORAGE_KEYS.BOOKING_DEMO_DB_KEY,db)
    return db
  }

  const writeDemoDb=db=>{
    writeJson(STORAGE_KEYS.BOOKING_DEMO_DB_KEY,db)
    return db
  }

  const buildAdminSnapshot=db=>{
    const customerMap=new Map(db.customers.map(customer=>[customer.id,customer]))
    const paymentMap=new Map(db.payments.map(payment=>[payment.booking_id,payment]))
    const bookings=db.bookings.map(booking=>({
      ...booking,
      customer_name:customerMap.get(booking.customer_id)?.full_name||booking.customer_name,
      customer_email:customerMap.get(booking.customer_id)?.email||booking.customer_email,
      customer_phone:customerMap.get(booking.customer_id)?.phone||booking.customer_phone
    }))
    const customers=db.customers.map(customer=>{
      const customerBookings=bookings.filter(booking=>booking.customer_id===customer.id)
      return {
        ...customer,
        booking_count:customerBookings.length,
        last_booking_reference:customerBookings[0]?.reference||''
      }
    })
    const payments=db.payments.map(payment=>({
      ...payment,
      reference:bookings.find(booking=>booking.id===payment.booking_id)?.reference||payment.reference||''
    }))
    return {bookings,customers,payments}
  }

  const localApiRequest=async(path,{method='GET',body,headers={}}={})=>{
    const db=readDemoDb()
    const normalizedPath=String(path||'').replace(/^\/+/,'')
    const parts=normalizedPath.split('/').filter(Boolean)
    const requestedBrandCode=safeText(headers?.['x-brand-code']||headers?.['X-Brand-Code']||body?.brand_code||readConfig().brandCode)
    const isVisibleForBrand=(service,brandCode='')=>{
      const normalizedService=normalizeService(service)
      return !brandCode || normalizedService.brand_codes.includes(brandCode)
    }

    if(method==='GET'&&normalizedPath==='services'){
      return {services:db.services.filter(service=>isVisibleForBrand(service,requestedBrandCode))}
    }
    if(method==='GET'&&parts[0]==='services'&&parts[1]){
      const service=db.services.find(item=>item.slug===parts[1]&&isVisibleForBrand(item,requestedBrandCode))
      if(!service)throw new Error('Service not found.')
      return {service}
    }
    if(method==='POST'&&normalizedPath==='bookings'){
      const service=db.services.find(item=>item.slug===body?.service_slug)
      if(!service)throw new Error('Service not found.')
      const errors=validateBookingPayload(service,body||{})
      if(Object.keys(errors).length)throw new Error(Object.values(errors)[0])
      const customerInput=normalizeCustomer(body.customer||body)
      let customer=db.customers.find(item=>item.email===customerInput.email)
      if(!customer){
        customer={id:uid('cust'),...customerInput}
        db.customers.unshift(customer)
      }else{
        Object.assign(customer,customerInput)
      }
      const pricing=calculatePricing(service,body)
      const reference=createReference()
      const bookingStatus=service.requires_manual_confirmation ? 'pending' : (pricing.amount_due_now>0 ? 'awaiting_payment' : 'confirmed')
      const paymentStatus=pricing.amount_due_now>0 ? 'pending' : 'unpaid'
      const booking={
        id:uid('bkg'),
        reference,
        brand_code:readConfig().brandCode,
        status:bookingStatus,
        payment_status:paymentStatus,
        customer_id:customer.id,
        customer_name:customer.full_name,
        customer_email:customer.email,
        customer_phone:customer.phone,
        service_id:service.id,
        service_slug:service.slug,
        service_name:service.name,
        preferred_date:safeText(body.preferred_date),
        quantity:pricing.quantity,
        currency:pricing.currency,
        subtotal_amount:pricing.base_subtotal,
        addons_amount:pricing.addons_subtotal,
        tax_amount:pricing.tax_amount,
        service_fee_amount:pricing.service_fee,
        total_amount:pricing.total_amount,
        amount_due_now:pricing.amount_due_now,
        amount_due_later:pricing.amount_due_later,
        notes:safeText(body.notes),
        created_at:nowIso(),
        updated_at:nowIso()
      }
      db.bookings.unshift(booking)
      if(pricing.amount_due_now>0){
        db.payments.unshift({
          id:uid('pay'),
          booking_id:booking.id,
          reference,
          provider:'manual_eft',
          status:'pending',
          amount:pricing.amount_due_now,
          currency:pricing.currency,
          created_at:nowIso()
        })
      }
      db.email_logs.unshift({
        id:uid('email'),
        booking_id:booking.id,
        customer_id:customer.id,
        template_key:'booking_received',
        recipient_email:customer.email,
        subject:`We received your booking request ${reference}`,
        rendered_body:renderTemplate(DEFAULT_EMAIL_TEMPLATES.booking_received.body,{
          customer_name:customer.full_name,
          booking_reference:reference,
          service_name:service.name,
          booking_date:booking.preferred_date||'To be confirmed',
          total_amount:formatMoney(booking.total_amount,booking.currency),
          payment_status:paymentStatus
        }),
        status:'queued',
        created_at:nowIso()
      })
      db.status_history.unshift({
        id:uid('hist'),
        booking_id:booking.id,
        from_status:null,
        to_status:bookingStatus,
        reason:'Booking created via booking form',
        actor_label:'website',
        created_at:nowIso()
      })
      writeDemoDb(db)
      return {booking}
    }
    if(method==='POST'&&normalizedPath==='payment-initiate'){
      const provider=safeText(body?.provider||'manual_eft')||'manual_eft'
      const booking=db.bookings.find(item=>item.id===body?.booking_id)
      if(!booking)throw new Error('Booking not found.')
      let payment=db.payments.find(item=>item.booking_id===booking.id)
      if(!payment){
        payment={
          id:uid('pay'),
          booking_id:booking.id,
          reference:booking.reference,
          provider,
          status:'pending',
          amount:Number(body?.amount||booking.amount_due_now||0),
          currency:booking.currency,
          created_at:nowIso()
        }
        db.payments.unshift(payment)
      }
      payment.provider=provider
      payment.status='pending'
      payment.updated_at=nowIso()
      payment.external_checkout_url=provider==='manual_eft' ? null : (safeText(body?.success_url) ? `${safeText(body.success_url)}${safeText(body.success_url).includes('?') ? '&' : '?'}reference=${encodeURIComponent(booking.reference)}&provider=${encodeURIComponent(provider)}&payment=demo` : null)
      writeDemoDb(db)
      return {
        payment:{
          provider,
          status:'pending',
          instructions:provider==='manual_eft' ? 'Demo EFT instructions. Replace with your live banking details.' : null,
          redirect_url:payment.external_checkout_url||null,
          note:provider==='manual_eft' ? null : 'Demo mode: hosted checkout simulated locally.'
        }
      }
    }
    if(method==='POST'&&normalizedPath==='bookings/lookup'){
      const booking=db.bookings.find(item=>item.reference===safeText(body?.reference) && item.customer_email.toLowerCase()===safeText(body?.email).toLowerCase())
      if(!booking)throw new Error('Booking not found.')
      return {booking}
    }
    if(method==='GET'&&normalizedPath==='admin/bookings'){
      return buildAdminSnapshot(db)
    }
    if(method==='GET'&&normalizedPath==='admin/bootstrap'){
      const snapshot=buildAdminSnapshot(db)
      return {
        user:{email:'demo@local.test'},
        profile:{full_name:'Local Demo Admin',role:'super_admin',is_active:true,permissions:sanitizePermissions({}),effective_permissions:SKYBOOK_ROLE_DEFAULTS.super_admin},
        brands:Object.values(BRAND_CATALOG),
        bookings:snapshot.bookings,
        customers:snapshot.customers,
        payments:snapshot.payments,
        services:db.services,
        settings:readConfig(),
        email_templates:DEFAULT_EMAIL_TEMPLATES,
        invoices:[],
        office_invoices:[],
        refunds:[],
        payment_transactions:[],
        resources:[],
        resource_allocations:[],
        operators:[],
        booking_operators:[],
        agents:[],
        email_logs:db.email_logs,
        status_history:db.status_history,
        admin_notes:db.notes,
        admin_users:db.app_users,
        permission_catalog:SKYBOOK_PERMISSION_CATALOG,
        role_defaults:SKYBOOK_ROLE_DEFAULTS
      }
    }
    if(method==='GET'&&normalizedPath==='admin/users'){
      return {admin_users:db.app_users,permission_catalog:SKYBOOK_PERMISSION_CATALOG,role_defaults:SKYBOOK_ROLE_DEFAULTS}
    }
    if(method==='POST'&&normalizedPath==='admin/users'){
      const email=safeText(body?.email).toLowerCase()
      const existing=db.app_users.find(item=>item.id===safeText(body?.id) || item.email===email)
      const nextUser={
        id:safeText(body?.id)||existing?.id||uid('auth'),
        email:email||existing?.email||'',
        full_name:safeText(body?.full_name)||existing?.full_name||email,
        role:safeText(body?.role)||existing?.role||'booking_agent',
        is_active:body?.is_active!==false,
        permissions:sanitizePermissions(body?.permissions||existing?.permissions||{})
      }
      if(existing){
        Object.assign(existing,nextUser)
      }else{
        db.app_users.unshift(nextUser)
      }
      writeDemoDb(db)
      return {success:true,admin_user:nextUser}
    }
    if(method==='PATCH'&&parts[0]==='admin'&&parts[1]==='users'&&parts[2]){
      return localApiRequest('admin/users',{method:'POST',body:{...body,id:parts[2]}})
    }
    if(method==='POST'&&normalizedPath==='admin/bookings'){
      return localApiRequest('bookings',{method:'POST',body:{...body,accept_terms:true}})
    }
    if(method==='PATCH'&&parts[0]==='admin'&&parts[1]==='bookings'&&parts[2]){
      const booking=db.bookings.find(item=>item.id===parts[2])
      if(!booking)throw new Error('Booking not found.')
      const previousStatus=booking.status
      booking.status=safeText(body?.status)||booking.status
      booking.payment_status=safeText(body?.payment_status)||booking.payment_status
      booking.updated_at=nowIso()
      if(booking.status==='confirmed'&&booking.payment_status==='pending'&&booking.amount_due_now===0)booking.payment_status='unpaid'
      if(booking.status==='cancelled'){
        const payment=db.payments.find(item=>item.booking_id===booking.id)
        if(payment)payment.status='cancelled'
      }
      if(body?.payment_status==='paid'){
        const payment=db.payments.find(item=>item.booking_id===booking.id)
        if(payment){
          payment.status='paid'
          payment.updated_at=nowIso()
        }
      }
      db.status_history.unshift({
        id:uid('hist'),
        booking_id:booking.id,
        from_status:previousStatus,
        to_status:booking.status,
        reason:safeText(body?.reason)||'Updated from booking admin',
        actor_label:'admin',
        created_at:nowIso()
      })
      if(body?.status==='confirmed'){
        db.email_logs.unshift({
          id:uid('email'),
          booking_id:booking.id,
          customer_id:booking.customer_id,
          template_key:'booking_confirmed',
          recipient_email:booking.customer_email,
          subject:renderTemplate(DEFAULT_EMAIL_TEMPLATES.booking_confirmed.subject,{booking_reference:booking.reference}),
          rendered_body:renderTemplate(DEFAULT_EMAIL_TEMPLATES.booking_confirmed.body,{
            customer_name:booking.customer_name,
            booking_reference:booking.reference,
            service_name:booking.service_name,
            booking_date:booking.preferred_date||'To be confirmed',
            total_amount:formatMoney(booking.total_amount,booking.currency),
            payment_status:booking.payment_status
          }),
          status:'queued',
          created_at:nowIso()
        })
      }
      writeDemoDb(db)
      return {success:true,booking}
    }
    if(method==='POST'&&parts[0]==='admin'&&parts[1]==='bookings'&&parts[3]==='resend'){
      const booking=db.bookings.find(item=>item.id===parts[2])
      if(!booking)throw new Error('Booking not found.')
      db.email_logs.unshift({
        id:uid('email'),
        booking_id:booking.id,
        customer_id:booking.customer_id,
        template_key:'status_changed',
        recipient_email:booking.customer_email,
        subject:`Booking update for ${booking.reference}`,
        rendered_body:`Demo resend for ${booking.reference}.`,
        status:'queued',
        created_at:nowIso()
      })
      writeDemoDb(db)
      return {success:true}
    }
    if(method==='POST'&&normalizedPath==='admin/services'){
      const nextService=normalizeService({
        id:uid('svc'),
        ...body,
        short_description:body?.short_description||'',
        full_description:body?.full_description||body?.short_description||'',
        addons:[]
      })
      db.services.unshift(nextService)
      writeDemoDb(db)
      return {success:true,id:nextService.id}
    }
    if(method==='PATCH'&&parts[0]==='admin'&&parts[1]==='services'&&parts[2]){
      const service=db.services.find(item=>item.id===parts[2])
      if(!service)throw new Error('Service not found.')
      Object.assign(service,normalizeService({...service,...body,id:service.id,addons:[]}))
      writeDemoDb(db)
      return {success:true,id:service.id}
    }
    if(method==='PATCH'&&normalizedPath==='admin/settings'){
      writeConfig(body||{})
      return {success:true}
    }
    if(method==='PATCH'&&normalizedPath==='admin/email-templates'){
      return {success:true}
    }
    throw new Error('Demo route not implemented.')
  }

  const getFunctionBase=()=>{
    const config=readConfig()
    const explicitBase=safeText(config.apiBase)
    if(/^https?:\/\//i.test(explicitBase)){
      return explicitBase.replace(/\/booking-api$/,'').replace(/\/+$/,'')
    }
    const supabaseBase=safeText(config.supabaseUrl).replace(/\/+$/,'')
    if(supabaseBase && explicitBase.startsWith('/functions/')){
      return `${supabaseBase}/functions/v1`
    }
    return explicitBase.replace(/\/booking-api$/,'').replace(/\/+$/,'')
  }

  const getApiUrl=path=>{
    const base=safeText(readConfig().apiBase).replace(/\/+$/,'')
    const nextPath=String(path||'').replace(/^\/+/,'')
    if(/^https?:\/\//i.test(base))return `${base}/${nextPath}`
    if(base.startsWith('/functions/') && safeText(readConfig().supabaseUrl)){
      return `${safeText(readConfig().supabaseUrl).replace(/\/+$/,'')}${base}/${nextPath}`
    }
    return `${base}/${nextPath}`
  }

  const getFunctionUrl=name=>`${getFunctionBase()}/${String(name||'').replace(/^\/+/,'')}`
  const isLocalRuntime=()=>{
    const host=String(window.location.hostname||'').toLowerCase()
    return window.location.protocol==='file:' || ['localhost','127.0.0.1','::1'].includes(host)
  }
  const isDemoFallbackAllowed=()=>{
    const query=new URLSearchParams(window.location.search)
    if(query.get('demo')==='1')return true
    const config=readConfig()
    return config.allowDemoFallback===true && isLocalRuntime()
  }
  const getLiveApiUnavailableError=()=>new Error('Live SkyBook API is unavailable. Demo fallback is disabled in production so no fake bookings or payments are created.')

  const apiRequest=async(path,{method='GET',body,headers={}}={})=>{
    const config=readConfig()
    try{
    const response=await fetch(getApiUrl(path),{
        method,
        headers:{
          'content-type':'application/json',
          'x-project-name':config.projectName,
          'x-brand-code':config.brandCode,
          ...(config.supabaseAnonKey ? {
            apikey:config.supabaseAnonKey,
            Authorization:`Bearer ${config.supabaseAnonKey}`
          } : {}),
          ...headers
        },
        body:body ? JSON.stringify(body) : undefined
      })
      let payload=null
      try{payload=await response.json()}catch{}
      if(!response.ok){
        throw new Error(payload?.error||payload?.message||'Booking request failed.')
      }
      return payload
    }catch(error){
      const message=String(error?.message||'')
      const shouldFallback=error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(message)
      if(!shouldFallback)throw error
      if(!isDemoFallbackAllowed())throw getLiveApiUnavailableError()
      return localApiRequest(path,{method,body,headers})
    }
  }

  const initiatePayment=async(payload,{headers={}}={})=>{
    const config=readConfig()
    try{
      const response=await fetch(getFunctionUrl('payment-initiate'),{
        method:'POST',
        headers:{
          'content-type':'application/json',
          'x-project-name':config.projectName,
          'x-brand-code':config.brandCode,
          ...(config.supabaseAnonKey ? {
            apikey:config.supabaseAnonKey,
            Authorization:`Bearer ${config.supabaseAnonKey}`
          } : {}),
          ...headers
        },
        body:JSON.stringify(payload||{})
      })
      const result=await response.json().catch(()=>null)
      if(!response.ok)throw new Error(result?.error||'Payment initiation failed.')
      return result
    }catch(error){
      const message=String(error?.message||'')
      const shouldFallback=error instanceof TypeError||/failed to fetch|networkerror|load failed/i.test(message)
      if(!shouldFallback)throw error
      if(!isDemoFallbackAllowed())throw getLiveApiUnavailableError()
      return localApiRequest('payment-initiate',{method:'POST',body:payload,headers})
    }
  }

  const renderTemplate=(template,variables={})=>String(template||'').replace(/\{\{(.*?)\}\}/g,(_,token)=>{
    const key=safeText(token)
    return key in variables ? String(variables[key]) : ''
  })

  const toCsv=(rows,columns)=>{
    const escapeCell=value=>`"${String(value??'').replace(/"/g,'""')}"`
    return [
      columns.map(column=>escapeCell(column.label)).join(','),
      ...rows.map(row=>columns.map(column=>escapeCell(row[column.key])).join(','))
    ].join('\n')
  }

  return {
    STORAGE_KEYS,
    DEFAULT_CONFIG:clone(DEFAULT_CONFIG),
    BRAND_CATALOG:clone(BRAND_CATALOG),
    DEFAULT_CATEGORIES:clone(DEFAULT_CATEGORIES),
    DEFAULT_EMAIL_TEMPLATES:clone(DEFAULT_EMAIL_TEMPLATES),
    SKYBOOK_PERMISSION_CATALOG:clone(SKYBOOK_PERMISSION_CATALOG),
    SKYBOOK_ROLE_DEFAULTS:clone(SKYBOOK_ROLE_DEFAULTS),
    ADDON_TYPES:[...ADDON_TYPES],
    DATE_REQUIREMENT_TYPES:[...DATE_REQUIREMENT_TYPES],
    BOOKING_STATUSES:[...BOOKING_STATUSES],
    PAYMENT_STATUSES:[...PAYMENT_STATUSES],
    PAYMENT_PROVIDERS:[...PAYMENT_PROVIDERS],
    clone,
    toSlug,
    capitalize,
    readConfig,
    writeConfig,
    detectBrandCode,
    getBrandConfig,
    loadSupabaseBrowserModule,
    createSupabaseClient,
    getAuthHeaders,
    readUiState,
    writeUiState,
    escapeHtml,
    safeText,
    nowIso,
    currentDate,
    uid,
    formatMoney,
    createReference,
    getDefaultServices,
    getSeedServices,
    readDemoDb,
    writeDemoDb,
    buildAdminSnapshot,
    localApiRequest,
    getFunctionBase,
    getFunctionUrl,
    isLocalRuntime,
    isDemoFallbackAllowed,
    normalizeAddon,
    normalizeService,
    normalizeCustomer,
    calculatePricing,
    validateBookingPayload,
    validators,
    getApiUrl,
    apiRequest,
    initiatePayment,
    renderTemplate,
    toCsv
  }
})()
