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
    supportEmailsByBrand:{
      'true-travel':'bookings@truetravelnam.net',
      iventure:'info@aerodigital.space'
    },
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
      supportEmail:'info@aerodigital.space',
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
      body:'Hi {{customer_name}},\n\nWe received your True Travel booking request for {{service_name}}.\nReference: {{booking_reference}}\nPreferred date: {{booking_date}}\n\nYour booking is under review by a True Travel consultant. A consultant will reach out shortly with the next steps.\n\nTrue Travel\n{{brand_support_email}}\n{{brand_support_phone}}'
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
      body:'Hi {{customer_name}},\n\nYour booking status changed to {{payment_status}} for {{service_name}}.\nReference: {{booking_reference}}\nDate: {{booking_date}}\nTotal: {{total_amount}}\n\n{{brand_name}}\n{{brand_support_email}}\n{{brand_support_phone}}'
    }
  }

  const ADDON_TYPES=['per_booking','per_person']
  const DATE_REQUIREMENT_TYPES=['optional','required','hidden']
  const BOOKING_STATUSES=['draft','pending','payment_request_sent','awaiting_payment','confirmed','cancelled','completed','refunded','failed']
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
    manager:Object.fromEntries(SKYBOOK_PERMISSION_KEYS.map(key=>[key,true])),
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
  const normalizeCurrencyCode=value=>{
    const normalized=String(value||'').trim().toUpperCase()
    if(!normalized)return 'NAD'
    if(normalized==='N$')return 'NAD'
    const compact=normalized.replace(/[^A-Z$]/g,'')
    if(compact==='N$' || compact==='NAD' || compact.includes('N$'))return 'NAD'
    return compact.replace(/[^A-Z]/g,'')||'NAD'
  }
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
    return {
      ...stored,
      ...getBrandConfig(brandCode),
      currency:normalizeCurrencyCode(stored.currency||DEFAULT_CONFIG.currency),
      brandCode
    }
  }
  const writeConfig=config=>{
    const nextConfig={...readConfig(),...config}
    nextConfig.currency=normalizeCurrencyCode(nextConfig.currency)
    writeJson(STORAGE_KEYS.BOOKING_CONFIG_KEY,nextConfig)
  }
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
    }
    if(token){
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
    const locale=readConfig().locale||'en-NA'
    const normalizedCurrency=normalizeCurrencyCode(currency||readConfig().currency)
    if(normalizedCurrency==='NAD'){
      const formattedAmount=new Intl.NumberFormat(locale,{
        minimumFractionDigits:2,
        maximumFractionDigits:2
      }).format(Math.abs(amount))
      const symbol=readConfig().currencySymbol||'N$'
      return `${amount<0 ? '-' : ''}${symbol}${formattedAmount}`
    }
    return new Intl.NumberFormat(locale,{
      style:'currency',
      currency:normalizedCurrency,
      maximumFractionDigits:2
    }).format(amount)
  }
  const getReferenceEntropy=()=>{
    const cryptoApi=globalThis.crypto
    if(cryptoApi?.randomUUID)return cryptoApi.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()
    return `${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-4)}`.slice(0,8).toUpperCase()
  }
  const createReference=()=>{
    const config=readConfig()
    const stamp=new Date().toISOString().slice(2,10).replace(/-/g,'')
    const rand=getReferenceEntropy()
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
        media_gallery:tour.imageUrl ? [{url:tour.imageUrl,alt:tour.name,caption:''}] : [],
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

  const normalizeService=service=>{
    const metadata=service?.metadata && typeof service.metadata==='object' && !Array.isArray(service.metadata) ? service.metadata : {}
    const mediaGallerySource=Array.isArray(service?.media_gallery)
      ? service.media_gallery
      : (Array.isArray(service?.media) ? service.media : (Array.isArray(metadata.media_gallery) ? metadata.media_gallery : []))
    return {
      id:service?.id||uid('svc'),
      slug:toSlug(service?.slug||service?.name||uid('service')),
      category_slug:toSlug(service?.category_slug||service?.categorySlug||metadata.category_slug||'coastal-tours'),
      name:safeText(service?.name)||'Untitled Service',
      short_description:safeText(service?.short_description||service?.shortDescription||''),
      full_description:safeText(service?.full_description||service?.fullDescription||service?.short_description||''),
      duration_label:safeText(service?.duration_label||service?.durationLabel||'Flexible'),
      unit_label:safeText(service?.unit_label||service?.unitLabel||'guest'),
      preferred_date_mode:DATE_REQUIREMENT_TYPES.includes(service?.preferred_date_mode) ? service.preferred_date_mode : 'optional',
      pricing_mode:['fixed','quote'].includes(service?.pricing_mode) ? service.pricing_mode : 'fixed',
      base_price:Number(service?.base_price||service?.basePrice||0),
      adult_price:service?.adult_price!=null ? Number(service.adult_price) : null,
      child_price:service?.child_price!=null ? Number(service.child_price) : null,
      currency:normalizeCurrencyCode(service?.currency||'NAD'),
      is_active:service?.is_active!==false,
      requires_manual_confirmation:service?.requires_manual_confirmation!==false,
      payment_mode:safeText(service?.payment_mode||'deposit')||'deposit',
      deposit_type:safeText(service?.deposit_type||'percentage')||'percentage',
      deposit_value:Number(service?.deposit_value||30),
      minimum_pax:Math.max(1,Number(service?.minimum_pax ?? metadata.minimum_pax ?? 1)||1),
      departure_window:safeText(service?.departure_window ?? metadata.departure_window ?? ''),
      pickup_time:safeText(service?.pickup_time ?? metadata.pickup_time ?? ''),
      departure_times:(()=>{
        const raw=Array.isArray(service?.departure_times) ? service.departure_times : (Array.isArray(metadata.departure_times) ? metadata.departure_times : [])
        return raw.map(item=>typeof item==='object'&&item!==null ? {label:safeText(item.label),time:safeText(item.time),pickup_time:safeText(item.pickup_time)} : {label:safeText(item),time:'',pickup_time:''}).filter(item=>item.label||item.time)
      })(),
      media_url:safeText(service?.media_url||service?.imageUrl||''),
      media_gallery:mediaGallerySource.map((item,index)=>{
        if(!item)return null
        if(typeof item==='string'){
          const url=safeText(item)
          if(!url)return null
          return {url,alt:`${safeText(service?.name||'Service')} image ${index+1}`,caption:''}
        }
        const url=safeText(item?.url||item?.src)
        if(!url)return null
        return {
          url,
          alt:safeText(item?.alt||item?.label||service?.name||`Service image ${index+1}`),
          caption:safeText(item?.caption||'')
        }
      }).filter(Boolean),
      highlight_points:Array.isArray(service?.highlight_points)
        ? service.highlight_points.map(safeText).filter(Boolean)
        : (Array.isArray(metadata.highlight_points) ? metadata.highlight_points.map(safeText).filter(Boolean) : []),
      metadata,
      brand_codes:Array.from(new Set(
        (
          Array.isArray(service?.brand_codes)
            ? service.brand_codes
            : (Array.isArray(metadata.brand_codes) ? metadata.brand_codes : Object.keys(BRAND_CATALOG))
        ).map(value=>safeText(value)).filter(Boolean)
      )),
      addons:Array.isArray(service?.addons) ? service.addons.map(normalizeAddon) : [],
      sort_order:Number(service?.sort_order||0)||0
    }
  }

  const normalizeCustomer=input=>({
    full_name:safeText(input?.full_name||input?.fullName||''),
    email:safeText(input?.email||'').toLowerCase(),
    phone:safeText(input?.phone||''),
    whatsapp:safeText(input?.whatsapp||input?.phone||''),
    notes:safeText(input?.notes||'')
  })

  const calculatePricing=(service,payload,config=readConfig())=>{
    const normalizedService=normalizeService(service)
    const minimumPax=Math.max(1,Number(normalizedService.minimum_pax||1)||1)
    const adultQty=Math.max(0,Number(payload?.adult_quantity||0)||0)
    const childQty=Math.max(0,Number(payload?.child_quantity||0)||0)
    const splitQty=adultQty+childQty
    const quantity=splitQty>0 ? Math.max(minimumPax,splitQty) : Math.max(minimumPax,Number(payload?.quantity||payload?.persons||1)||1)
    const selectedAddons=Array.isArray(payload?.addons) ? payload.addons : []
    const addonRows=normalizedService.addons.filter(addon=>selectedAddons.includes(addon.slug))
    const hasAdultChildPricing=normalizedService.adult_price!=null&&normalizedService.adult_price>0
    const baseSubtotal=hasAdultChildPricing && splitQty>0
      ? (adultQty*(normalizedService.adult_price||0))+(childQty*(normalizedService.child_price||0))
      : normalizedService.base_price*quantity
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
    quantity(value,minValue=1){
      const numeric=Number(value||0)
      if(!Number.isFinite(numeric)||numeric<1)return 'Quantity must be at least 1.'
      if(numeric<Math.max(1,Number(minValue||1)||1))return `This tour requires at least ${Math.max(1,Number(minValue||1)||1)} guests.`
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
    errors.quantity=validators.quantity(payload.quantity,normalizedService.minimum_pax)
    errors.preferred_date=validators.preferredDate(payload.preferred_date,normalizedService.preferred_date_mode)
    errors.terms=validators.acceptedTerms(Boolean(payload.accept_terms))
    return Object.fromEntries(Object.entries(errors).filter(([,value])=>value))
  }

  const readDemoDb=()=>{
    const existing=readJson(STORAGE_KEYS.BOOKING_DEMO_DB_KEY,null)
    if(existing){
      return {
        ...existing,
        services:Array.isArray(existing.services)&&existing.services.length ? existing.services : getSeedServices(),
        customers:Array.isArray(existing.customers) ? existing.customers : [],
        bookings:Array.isArray(existing.bookings) ? existing.bookings : [],
        payments:Array.isArray(existing.payments) ? existing.payments : [],
        app_users:Array.isArray(existing.app_users) ? existing.app_users : [],
        notes:Array.isArray(existing.notes) ? existing.notes : [],
        email_logs:Array.isArray(existing.email_logs) ? existing.email_logs : [],
        status_history:Array.isArray(existing.status_history) ? existing.status_history : [],
        agents:Array.isArray(existing.agents) ? existing.agents : [],
        operators:Array.isArray(existing.operators) ? existing.operators : [],
        booking_agents:Array.isArray(existing.booking_agents) ? existing.booking_agents : [],
        booking_operators:Array.isArray(existing.booking_operators) ? existing.booking_operators : [],
        booking_discounts:Array.isArray(existing.booking_discounts) ? existing.booking_discounts : [],
        office_invoices:Array.isArray(existing.office_invoices) ? existing.office_invoices : [],
        refunds:Array.isArray(existing.refunds) ? existing.refunds : [],
        payment_transactions:Array.isArray(existing.payment_transactions) ? existing.payment_transactions : [],
        resources:Array.isArray(existing.resources) ? existing.resources : [],
        resource_allocations:Array.isArray(existing.resource_allocations) ? existing.resource_allocations : []
      }
    }
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
    const agent={
      id:'agent-demo-1',
      company_name:'Atlantic Travel Desk',
      contact_name:'Leah Martin',
      contact_email:'agents@example.com',
      commission_type:'percentage',
      commission_value:12,
      is_active:true,
      created_at:nowIso(),
      updated_at:nowIso()
    }
    const operator={
      id:'operator-demo-1',
      company_name:'Walvis Bay Marine Support',
      contact_name:'Jacob Paulus',
      contact_email:'ops@example.com',
      commission_type:'fixed',
      commission_value:1850,
      is_active:true,
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
      agents:[agent],
      operators:[operator],
      booking_agents:[],
      booking_operators:[],
      booking_discounts:[],
      office_invoices:[],
      refunds:[],
      payment_transactions:[],
      resources:[],
      resource_allocations:[],
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
    const resolvePartnerAmount=(baseAmount,partner)=>{
      if(!partner)return 0
      const commissionType=safeText(partner.commission_type).toLowerCase()
      const commissionValue=Number(partner.commission_value||0)
      return commissionType==='fixed'
        ? commissionValue
        : Number(((Number(baseAmount||0)*commissionValue)/100).toFixed(2))
    }
    const resolveDiscountAmount=(baseAmount,discountType,discountValue)=>{
      const total=Number(baseAmount||0)
      const value=Number(discountValue||0)
      return safeText(discountType).toLowerCase()==='fixed'
        ? Number(Math.min(total,value).toFixed(2))
        : Number(Math.min(total,total*(value/100)).toFixed(2))
    }
    const repriceDemoBooking=booking=>{
      if(!booking)return
      const baseTotal=Number((Number(booking.subtotal_amount||0)+Number(booking.tax_amount||0)+Number(booking.service_fee_amount||0)).toFixed(2))
      const discountTotal=(db.booking_discounts||[])
        .filter(discount=>discount.booking_id===booking.id)
        .reduce((sum,discount)=>sum+Number(discount.amount||0),0)
      booking.addons_amount=0-discountTotal
      booking.total_amount=Number(Math.max(0,baseTotal-discountTotal).toFixed(2))
      if(['paid','cancelled','refunded'].includes(safeText(booking.payment_status).toLowerCase())){
        booking.amount_due_now=0
        booking.amount_due_later=0
      }else{
        booking.amount_due_now=Number((booking.total_amount*0.3).toFixed(2))
        booking.amount_due_later=Number(Math.max(0,booking.total_amount-booking.amount_due_now).toFixed(2))
      }
      const assignment=db.booking_operators.find(item=>item.booking_id===booking.id)
      const operator=assignment ? db.operators.find(item=>item.id===assignment.operator_id) : null
      if(assignment&&operator)assignment.commission_amount=resolvePartnerAmount(booking.total_amount,operator)
      booking.updated_at=nowIso()
    }
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
      let reference=createReference()
      for(let attempt=0;attempt<10&&db.bookings.some(item=>item.reference===reference);attempt+=1)reference=createReference()
      if(db.bookings.some(item=>item.reference===reference))throw new Error('Unable to generate a unique booking reference. Please try again.')
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
      const token=safeText(body?.payment_token||body?.token)
      const booking=token
        ? db.bookings.find(item=>safeText(item?.metadata?.payment_link?.token)===token)
        : db.bookings.find(item=>item.reference===safeText(body?.reference) && item.customer_email.toLowerCase()===safeText(body?.email).toLowerCase())
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
        office_invoices:db.office_invoices,
        refunds:db.refunds,
        payment_transactions:db.payment_transactions,
        resources:db.resources,
        resource_allocations:db.resource_allocations,
        operators:db.operators,
        booking_operators:db.booking_operators,
        agents:db.agents,
        booking_agents:db.booking_agents,
        booking_discounts:db.booking_discounts,
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
    if(method==='POST'&&normalizedPath==='admin/login'){
      const username=safeText(body?.username).toLowerCase()
      const password=safeText(body?.password)
      const matchedUser=db.app_users.find(item=>{
        const storedUsername=safeText(item.username||item.email).split('@')[0].toLowerCase()
        return storedUsername===username && safeText(item.password||'demo123')===password
      })
      if(!matchedUser)throw new Error('Invalid username or password.')
      return {
        session:{
          access_token:uid('access'),
          refresh_token:uid('refresh')
        },
        user:{
          id:matchedUser.id,
          email:matchedUser.email||`${username}@skybook.local`,
          user_metadata:{
            username,
            full_name:matchedUser.full_name||username
          }
        }
      }
    }
    if(method==='POST'&&normalizedPath==='admin/users'){
      const username=safeText(body?.username).toLowerCase()
      const existing=db.app_users.find(item=>item.id===safeText(body?.id) || safeText(item.username).toLowerCase()===username)
      const nextUser={
        id:safeText(body?.id)||existing?.id||uid('auth'),
        email:existing?.email||`${username}@skybook.local`,
        username:username||existing?.username||'',
        password:safeText(body?.password)||existing?.password||'demo123',
        full_name:safeText(body?.full_name)||existing?.full_name||username,
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
    if(method==='POST'&&normalizedPath==='admin/notes'){
      const booking=db.bookings.find(item=>item.id===safeText(body?.booking_id))
      db.notes.unshift({
        id:uid('note'),
        booking_id:booking?.id||safeText(body?.booking_id)||null,
        customer_id:booking?.customer_id||null,
        note:safeText(body?.note),
        is_private:body?.is_private!==false,
        created_at:nowIso()
      })
      writeDemoDb(db)
      return {success:true,note:db.notes[0]}
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
      if(booking.status==='cancelled'&&safeText(previousStatus)!=='cancelled'&&!safeText(body?.reason))throw new Error('A cancellation reason is required before cancelling a booking.')
      if(body?.metadata&&typeof body.metadata==='object'&&!Array.isArray(body.metadata)){
        booking.metadata={...(booking.metadata||{}),...body.metadata}
      }
      booking.updated_at=nowIso()
      if(booking.status==='confirmed'&&booking.payment_status==='pending'&&booking.amount_due_now===0)booking.payment_status='unpaid'
      if(booking.status==='cancelled'){
        booking.cancellation_reason=safeText(body?.reason)
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
      writeDemoDb(db)
      return {success:true,booking}
    }
    if(method==='POST'&&normalizedPath==='admin/booking-agents'){
      const bookingId=safeText(body?.booking_id)
      if(!bookingId)throw new Error('Booking is required for selling partner assignment.')
      const booking=db.bookings.find(item=>item.id===bookingId)
      if(!booking)throw new Error('Booking not found.')
      const agentId=safeText(body?.agent_id)
      db.booking_agents=db.booking_agents.filter(item=>item.booking_id!==bookingId)
      if(agentId){
        const agent=db.agents.find(item=>item.id===agentId)
        if(!agent)throw new Error('Selling partner not found.')
        const explicitAmount=Number(body?.commission_amount||0)
        const commissionAmount=explicitAmount>0 ? explicitAmount : resolvePartnerAmount(booking.total_amount,agent)
        db.booking_agents.unshift({
          id:uid('bagt'),
          booking_id:bookingId,
          agent_id:agentId,
          commission_amount:commissionAmount,
          created_at:nowIso(),
          updated_at:nowIso()
        })
      }
      writeDemoDb(db)
      return {success:true}
    }
    if(method==='POST'&&normalizedPath==='admin/booking-operators'){
      const bookingId=safeText(body?.booking_id)
      if(!bookingId)throw new Error('Booking is required for operating partner assignment.')
      const booking=db.bookings.find(item=>item.id===bookingId)
      if(!booking)throw new Error('Booking not found.')
      const operatorId=safeText(body?.operator_id)
      db.booking_operators=db.booking_operators.filter(item=>item.booking_id!==bookingId)
      if(operatorId){
        const operator=db.operators.find(item=>item.id===operatorId)
        if(!operator)throw new Error('Operating partner not found.')
        const explicitAmount=Number(body?.commission_amount||0)
        const commissionAmount=explicitAmount>0 ? explicitAmount : resolvePartnerAmount(booking.total_amount,operator)
        db.booking_operators.unshift({
          id:uid('bopt'),
          booking_id:bookingId,
          operator_id:operatorId,
          commission_amount:commissionAmount,
          created_at:nowIso(),
          updated_at:nowIso()
        })
      }
      writeDemoDb(db)
      return {success:true}
    }
    if(method==='POST'&&parts[0]==='admin'&&parts[1]==='bookings'&&parts[2]&&parts[3]==='discount'){
      const booking=db.bookings.find(item=>item.id===parts[2])
      if(!booking)throw new Error('Booking not found.')
      const comment=safeText(body?.consultant_comment||body?.comment)
      if(!comment)throw new Error('A consultant comment is required for booking discounts.')
      db.booking_discounts=db.booking_discounts.filter(item=>!(item.booking_id===booking.id&&safeText(item.source_type)==='manual'))
      if(body?.clear!==true){
        const discountType=safeText(body?.discount_type)||'percentage'
        const discountValue=Number(body?.discount_value||0)
        if(discountValue<=0)throw new Error('Discount value must be greater than zero.')
        const baseTotal=Number((Number(booking.subtotal_amount||0)+Number(booking.tax_amount||0)+Number(booking.service_fee_amount||0)).toFixed(2))
        const amount=resolveDiscountAmount(baseTotal,discountType,discountValue)
        db.booking_discounts.unshift({
          id:uid('disc'),
          booking_id:booking.id,
          source_type:'manual',
          source_id:null,
          code:'MANUAL',
          description:'Consultant booking discount',
          amount,
          discount_type:discountType,
          discount_value:discountValue,
          consultant_comment:comment,
          created_at:nowIso()
        })
      }
      repriceDemoBooking(booking)
      db.notes.unshift({id:uid('note'),booking_id:booking.id,customer_id:booking.customer_id,note:body?.clear===true ? `Manual booking discount cleared: ${comment}` : `Manual booking discount applied: ${comment}`,is_private:true,created_at:nowIso()})
      db.status_history.unshift({id:uid('hist'),booking_id:booking.id,from_status:booking.status,to_status:booking.status,reason:body?.clear===true ? 'Manual booking discount cleared' : `Manual booking discount applied: ${comment}`,actor_label:'admin',created_at:nowIso()})
      writeDemoDb(db)
      return {success:true,booking}
    }
    if(method==='POST'&&parts[0]==='admin'&&parts[1]==='bookings'&&parts[2]&&['payment-link','payment-request'].includes(parts[3])){
      const booking=db.bookings.find(item=>item.id===parts[2])
      if(!booking)throw new Error('Booking not found.')
      const previousStatus=booking.status
      const token=uid('paylink')
      const url=new URL('payment.html','https://truetravelnam.net/')
      url.searchParams.set('reference',booking.reference)
      url.searchParams.set('token',token)
      url.searchParams.set('source','skybook')
      url.searchParams.set('pay','1')
      booking.status=['draft','pending','payment_request_sent'].includes(booking.status) ? 'awaiting_payment' : booking.status
      if(!['paid','partially_paid'].includes(booking.payment_status))booking.payment_status='pending'
      booking.metadata={...(booking.metadata||{}),payment_link:{token,url:url.toString(),generated_at:nowIso(),generated_by:'demo',reference:booking.reference,payment_provider:'dpo',payment_page:'true_travel'}}
      booking.updated_at=nowIso()
      db.status_history.unshift({
        id:uid('hist'),
        booking_id:booking.id,
        from_status:previousStatus,
        to_status:booking.status,
        reason:'Payment link generated for booking.',
        actor_label:'admin',
        created_at:nowIso()
      })
      db.notes.unshift({id:uid('note'),booking_id:booking.id,customer_id:booking.customer_id,note:'Payment link generated and added to booking.',is_private:true,created_at:nowIso()})
      writeDemoDb(db)
      return {success:true,booking,payment_link:url.toString(),payment_token:token}
    }
    if(method==='POST'&&parts[0]==='admin'&&parts[1]==='bookings'&&parts[2]&&parts[3]==='trash'){
      const booking=db.bookings.find(item=>item.id===parts[2])
      if(!booking)throw new Error('Booking not found.')
      const previousStatus=booking.status
      const previousPaymentStatus=booking.payment_status
      const recordScope=['draft','pending'].includes(safeText(booking.status).toLowerCase()) ? 'reservation' : 'booking'
      const recordLabel=recordScope==='reservation' ? 'Reservation' : 'Booking'
      const reason=safeText(body?.reason)||'Booking moved to trash.'
      booking.status='cancelled'
      booking.payment_status='cancelled'
      booking.cancellation_reason=reason
      booking.metadata={
        ...(booking.metadata||{}),
        trash:{
          ...(((booking.metadata&&typeof booking.metadata==='object'&&!Array.isArray(booking.metadata)&&booking.metadata.trash&&typeof booking.metadata.trash==='object'&&!Array.isArray(booking.metadata.trash)) ? booking.metadata.trash : {})),
          archived_at:nowIso(),
          reason,
          archived_by:'demo',
          scope:recordScope,
          original_status:safeText(previousStatus).toLowerCase(),
          original_payment_status:safeText(previousPaymentStatus).toLowerCase()
        }
      }
      booking.updated_at=nowIso()
      db.status_history.unshift({id:uid('hist'),booking_id:booking.id,from_status:previousStatus,to_status:'cancelled',reason:`${recordLabel} moved to trash: ${reason}`,actor_label:'admin',created_at:nowIso()})
      db.notes.unshift({id:uid('note'),booking_id:booking.id,customer_id:booking.customer_id,note:`${recordLabel} moved to trash: ${reason}`,is_private:true,created_at:nowIso()})
      writeDemoDb(db)
      return {success:true,booking}
    }
    if(method==='POST'&&parts[0]==='admin'&&parts[1]==='bookings'&&parts[2]&&parts[3]==='restore'){
      const booking=db.bookings.find(item=>item.id===parts[2])
      if(!booking)throw new Error('Booking not found.')
      const previousStatus=booking.status
      booking.metadata={...(booking.metadata||{})}
      const trashMeta=booking.metadata&&typeof booking.metadata==='object'&&!Array.isArray(booking.metadata)&&booking.metadata.trash&&typeof booking.metadata.trash==='object'&&!Array.isArray(booking.metadata.trash) ? booking.metadata.trash : {}
      const originalStatus=safeText(trashMeta.original_status).toLowerCase()
      const originalPaymentStatus=safeText(trashMeta.original_payment_status).toLowerCase()
      const fallbackPaymentStatus=safeText(booking.payment_status).toLowerCase()==='cancelled' ? 'pending' : safeText(booking.payment_status).toLowerCase() || 'pending'
      const recordScope=safeText(trashMeta.scope).toLowerCase() || (['draft','pending'].includes(originalStatus) ? 'reservation' : 'booking')
      const recordLabel=recordScope==='reservation' ? 'Reservation' : 'Booking'
      delete booking.metadata.trash
      delete booking.metadata.deleted_at
      booking.status=originalStatus && originalStatus!=='cancelled' ? originalStatus : (fallbackPaymentStatus==='paid' ? 'confirmed' : 'awaiting_payment')
      booking.payment_status=originalPaymentStatus || fallbackPaymentStatus
      booking.cancellation_reason=''
      booking.updated_at=nowIso()
      db.status_history.unshift({id:uid('hist'),booking_id:booking.id,from_status:previousStatus,to_status:booking.status,reason:`${recordLabel} restored from trash.`,actor_label:'admin',created_at:nowIso()})
      db.notes.unshift({id:uid('note'),booking_id:booking.id,customer_id:booking.customer_id,note:`${recordLabel} restored from trash.`,is_private:true,created_at:nowIso()})
      writeDemoDb(db)
      return {success:true,booking}
    }
    if(method==='POST'&&parts[0]==='admin'&&parts[1]==='bookings'&&parts[3]==='resend'){
      throw new Error('SkyBook guest email sending is disabled.')
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
  const isNonProductionEnvironment=()=>{
    const environment=safeText(readConfig().environment).toLowerCase()
    return ['development','dev','demo','staging','test','local'].includes(environment)
  }
  const isDemoFallbackAllowed=()=>{
    const query=new URLSearchParams(window.location.search)
    const config=readConfig()
    if(isLocalRuntime())return query.get('demo')==='1' || config.allowDemoFallback===true
    return query.get('demo')==='1' && config.allowDemoFallback===true && isNonProductionEnvironment()
  }
  const getLiveApiUnavailableError=()=>new Error('Live SkyBook API is unavailable. Demo fallback is disabled in production so no fake bookings or payments are created.')

  const apiRequest=async(path,{method='GET',body,headers={}}={})=>{
    const config=readConfig()
    try{
      const defaultHeaders={
        'content-type':'application/json',
        'x-project-name':config.projectName,
        'x-brand-code':config.brandCode,
        ...(config.supabaseAnonKey ? { apikey:config.supabaseAnonKey } : {})
      }
      const response=await fetch(getApiUrl(path),{
        method,
        headers:{...defaultHeaders,...headers},
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
      const defaultHeaders={
        'content-type':'application/json',
        'x-project-name':config.projectName,
        'x-brand-code':config.brandCode,
        ...(config.supabaseAnonKey ? { apikey:config.supabaseAnonKey } : {})
      }
      const response=await fetch(getFunctionUrl('payment-initiate'),{
        method:'POST',
        headers:{...defaultHeaders,...headers},
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
    normalizeCurrencyCode,
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
