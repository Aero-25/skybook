/* SkyBook console — the lean SkyTrack-style admin.
 *
 * What it does, and nothing more:
 *   1. Website reservations from True Travel / Iventure wait for approval.
 *   2. Staff create manual bookings (the booking form is unchanged).
 *   3. Tours (services) and users are maintained here.
 *   4. The five reports, with PDF export.
 *
 * Everything talks to the booking-api Edge Function through booking-shared.js.
 */
const shared=window.TrueTravelBooking
if(!shared)throw new Error('booking-shared.js must load before skybook-admin.js')

/* ── Small helpers ───────────────────────────────────────────────────── */
const esc=value=>shared.escapeHtml(String(value ?? ''))
const attr=value=>shared.escapeHtml(String(value ?? ''))
const text=value=>String(value ?? '').trim()
const lower=value=>text(value).toLowerCase()
const record=value=>(value&&typeof value==='object'&&!Array.isArray(value) ? value : {})
const label=value=>text(value).replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase())
const sum=(rows,key)=>rows.reduce((total,row)=>total+Number(row?.[key]||0),0)
const parseDate=value=>{
  if(value instanceof Date)return Number.isNaN(value.getTime()) ? null : value
  const raw=text(value)
  if(!raw)return null
  const dateOnly=raw.match(/^(\d{4})-(\d{2})-(\d{2})$/)
  const parsed=dateOnly ? new Date(Number(dateOnly[1]),Number(dateOnly[2])-1,Number(dateOnly[3])) : new Date(raw)
  return Number.isNaN(parsed.getTime()) ? null : parsed
}
const dateKey=value=>{
  const d=parseDate(value)
  if(!d)return ''
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`
}
const todayKey=()=>dateKey(new Date())
const fmtDate=value=>{
  const d=parseDate(value)
  return d ? d.toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'}) : (text(value)||'—')
}
const fmtDateTime=value=>{
  const d=parseDate(value)
  return d ? d.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : (text(value)||'—')
}
const money=(amount,currency)=>shared.formatMoney(amount||0,currency||state.settings.currency||'NAD')
const byDateDesc=(rows,key)=>[...rows].sort((a,b)=>(parseDate(b?.[key])?.getTime()||0)-(parseDate(a?.[key])?.getTime()||0))
const emptyRow=(colspan,message)=>`<tr><td class="adm-empty" colspan="${colspan}">${esc(message)}</td></tr>`
const tag=(value,textLabel='')=>{
  const key=lower(value).replace(/[^a-z0-9_-]+/g,'_')||'not_set'
  return `<span class="tag tag-${attr(key)}">${esc(textLabel||label(value||'Not set'))}</span>`
}

/* ── State ───────────────────────────────────────────────────────────── */
const state={
  session:null,user:null,profile:null,
  activeTab:'dashboard',selectedBookingId:'',selectedServiceId:'',
  brands:[],bookings:[],services:[],customers:[],payments:[],paymentTransactions:[],refunds:[],
  officeInvoices:[],invoices:[],statusHistory:[],adminNotes:[],staffDirectory:[],adminUsers:[],
  bookingFormFields:[],permissionCatalog:shared.clone(shared.SKYBOOK_PERMISSION_CATALOG||[]),
  roleDefaults:shared.clone(shared.SKYBOOK_ROLE_DEFAULTS||{}),
  settings:shared.readConfig(),
  bookingQuickFilter:'today',calendarView:'month',calendarFocusDate:todayKey(),calendarSelectedDay:'',
  isBookingModalOpen:false,isServiceModalOpen:false,isCruiseModalOpen:false,
  workflow:null,liveTimer:null,refreshing:null,editingBookingId:''
}

const $=id=>document.getElementById(id)
const nodes={
  loading:$('adminLoadingScreen'),loadingTitle:$('adminLoadingTitle'),loadingStatus:$('adminLoadingStatus'),loadingSpinner:$('adminLoadingSpinner'),
  bar:$('adminBar'),shell:$('adminAppShell'),foot:$('adminFoot'),menuToggle:$('menuToggle'),
  userName:$('sessionUserName'),userRole:$('sessionUserRole'),logout:$('logoutButton'),brandHome:$('brandHome'),
  reservationBadge:$('reservationNavBadge'),
  // dashboard
  dashboardDate:$('dashboardDate'),dashboardStats:$('dashboardStats'),dashboardAlerts:$('dashboardAlerts'),
  dashboardToday:$('dashboardTodayTable'),dashboardReservations:$('dashboardReservationsTable'),
  dashboardUpcoming:$('dashboardUpcomingTable'),dashboardUnpaid:$('dashboardUnpaidTable'),
  // reservations
  reservationsSummary:$('reservationsSummary'),reservationsTable:$('reservationsTable'),reservationsDeclined:$('reservationsDeclinedTable'),reservationDetail:$('reservationDetail'),
  // bookings
  bookingsSummary:$('bookingsSummary'),bookingsTable:$('bookingsTable'),bookingDetail:$('bookingDetail'),
  bookingFilterSearch:$('bookingFilterSearch'),bookingFilterBrand:$('bookingFilterBrand'),bookingFilterService:$('bookingFilterService'),
  bookingFilterDateFrom:$('bookingFilterDateFrom'),bookingFilterDateTo:$('bookingFilterDateTo'),bookingQuickFilters:$('bookingQuickFilters'),
  // booking form
  bookingModal:$('bookingModal'),bookingModalTitle:$('bookingModalTitle'),bookingModalSubtitle:$('bookingModalSubtitle'),bookingForm:$('adminBookingForm'),
  bookingReference:$('adminBookingReference'),bookingBrand:$('adminBookingBrand'),bookingSource:$('adminBookingSource'),bookingService:$('adminBookingService'),
  bookingStatus:$('adminBookingStatusField'),bookingDate:$('adminBookingDate'),bookingDepartureWrap:$('adminBookingDepartureWrap'),bookingDeparture:$('adminBookingDeparture'),
  bookingPickupWrap:$('adminBookingPickupWrap'),bookingPickup:$('adminBookingPickup'),bookingQuantity:$('adminBookingQuantity'),
  bookingAdultQuantity:$('adminBookingAdultQuantity'),bookingChildQuantity:$('adminBookingChildQuantity'),bookingInfantQuantity:$('adminBookingInfantQuantity'),
  bookingCustomerName:$('adminBookingCustomerName'),bookingCustomerEmail:$('adminBookingCustomerEmail'),bookingCustomerPhone:$('adminBookingCustomerPhone'),
  bookingGuideList:$('adminBookingGuideList'),bookingAddGuide:$('adminBookingAddGuide'),bookingSkipperList:$('adminBookingSkipperList'),bookingAddSkipper:$('adminBookingAddSkipper'),
  bookingNationality:$('adminBookingNationality'),bookingBookedBy:$('adminBookingBookedBy'),bookingAgent:$('adminBookingAgent'),bookingDietary:$('adminBookingDietary'),
  bookedByDatalist:$('bookedByDatalist'),agentDatalist:$('agentDatalist'),
  bookingSelfDrive:$('adminBookingSelfDrive'),bookingTransfer:$('adminBookingTransfer'),bookingCustomFields:$('adminBookingCustomFields'),bookingNotes:$('adminBookingNotes'),
  bookingPriceBreakdown:$('adminBookingPriceBreakdown'),bookingPriceTotal:$('adminBookingPriceTotal'),bookingPriceOverride:$('adminBookingPriceOverride'),
  bookingOverrideTagRow:$('adminBookingOverrideTagRow'),bookingRevertPricing:$('adminBookingRevertPricing'),bookingPaymentStatus:$('adminBookingPaymentStatusField'),
  bookingPaymentRowsList:$('adminBookingPaymentRowsList'),bookingAddPaymentRow:$('adminBookingAddPaymentRow'),bookingSaveButton:$('adminBookingSaveButton'),
  closeBookingModal:$('closeBookingModalButton'),
  // cruise liner
  cruiseModal:$('cruiseLinerModal'),cruiseForm:$('cruiseLinerForm'),
  // services
  servicesSummary:$('servicesSummary'),servicesTable:$('servicesTable'),serviceFilterBrand:$('serviceFilterBrand'),openServiceModal:$('openServiceModalButton'),
  serviceModal:$('serviceModal'),serviceModalTitle:$('serviceModalTitle'),serviceForm:$('adminServiceForm'),closeServiceModal:$('closeServiceModalButton'),
  serviceId:$('adminServiceId'),serviceSlug:$('adminServiceSlug'),serviceName:$('adminServiceName'),serviceCategory:$('adminServiceCategory'),
  servicePricingMode:$('adminServicePricingMode'),servicePrice:$('adminServicePrice'),serviceAdultPrice:$('adminServiceAdultPrice'),serviceChildPrice:$('adminServiceChildPrice'),
  serviceQuoteOnly:$('adminServiceQuoteOnly'),serviceDuration:$('adminServiceDuration'),serviceMinPax:$('adminServiceMinPax'),
  serviceDepartureTimesList:$('adminServiceDepartureTimesList'),serviceAddDepartureTime:$('adminServiceAddDepartureTime'),servicePickupTime:$('adminServicePickupTime'),
  serviceSummary:$('adminServiceSummary'),serviceLearnMoreDescription:$('adminServiceLearnMoreDescription'),
  serviceImageDropZone:$('adminServiceImageDropZone'),serviceImageInput:$('adminServiceImageInput'),serviceImagePreviews:$('adminServiceImagePreviews'),serviceLandscapeImages:$('adminServiceLandscapeImages'),
  serviceBrandTrueTravel:$('adminServiceBrandTrueTravel'),serviceBrandIventure:$('adminServiceBrandIventure'),serviceActive:$('adminServiceActive'),deleteService:$('deleteServiceButton'),
  // users
  adminUsersTable:$('adminUsersTable'),adminUserForm:$('adminUserForm'),adminUserFormTitle:$('adminUserFormTitle'),adminUserId:$('adminUserId'),adminUserUsername:$('adminUserUsername'),
  adminUserFullName:$('adminUserFullName'),adminUserPassword:$('adminUserPassword'),adminUserRole:$('adminUserRole'),adminUserActive:$('adminUserActive'),
  adminUserPermissions:$('adminUserPermissions'),adminUserSaveButton:$('adminUserSaveButton'),adminUserReset:$('adminUserResetButton'),
  // reports
  reportsRangePreset:$('reportsRangePreset'),reportsRangeFrom:$('reportsRangeFrom'),reportsRangeTo:$('reportsRangeTo'),reportsRangeSummary:$('reportsRangeSummary'),
  salesReportCards:$('salesReportCards'),salesReportBody:$('salesReportBody'),paymentReportCards:$('paymentReportCards'),paymentReportBody:$('paymentReportBody'),
  agentReportCards:$('agentReportCards'),agentReportBody:$('agentReportBody'),invoicedReportCards:$('invoicedReportCards'),invoicedReportBody:$('invoicedReportBody'),
  guidesReportCards:$('guidesReportCards'),guidesReportBody:$('guidesReportBody'),exportCsv:$('exportBookingsCsv'),
  // workflow modal
  workflowModal:$('workflowModal'),workflowTitle:$('workflowModalTitle'),workflowDescription:$('workflowModalDescription'),workflowForm:$('workflowModalForm'),
  workflowFields:$('workflowModalFields'),workflowSubmit:$('workflowModalSubmit'),
  toastStack:$('toastStack')
}

/* ── Feedback ────────────────────────────────────────────────────────── */
const toast=(message,type='info')=>{
  if(!nodes.toastStack||!message)return
  const el=document.createElement('div')
  el.className=`toast is-${type}`
  el.textContent=message
  nodes.toastStack.appendChild(el)
  window.setTimeout(()=>el.remove(),type==='error' ? 7000 : 4000)
}
const notify=message=>toast(message,'success')
const fail=error=>{
  const message=error?.message||String(error||'Something went wrong.')
  console.error('[SkyBook]',error)
  toast(message,'error')
}
const setLoading=(title,message,{isError=false}={})=>{
  if(nodes.loadingTitle&&title)nodes.loadingTitle.textContent=title
  if(nodes.loadingStatus){nodes.loadingStatus.textContent=message||'';nodes.loadingStatus.classList.toggle('is-error',isError)}
  if(nodes.loadingSpinner)nodes.loadingSpinner.hidden=isError
}
const withButtonLoading=async(button,task,busyLabel='Working…')=>{
  const original=button?.textContent
  if(button){button.disabled=true;button.textContent=busyLabel}
  try{ return await task() }
  finally{ if(button&&button.isConnected){button.disabled=false;button.textContent=original} }
}

/* ── Session + API ───────────────────────────────────────────────────── */
const isAuthError=error=>/authenticated admin user is required|jwt expired|invalid jwt|auth session missing|not authenticated|session is missing/i.test(String(error?.message||error||''))
const client=()=>shared.createSupabaseClient()
const tokenFresh=session=>{
  if(!session?.access_token)return false
  const expiresAt=Number(session.expires_at||0)
  return !expiresAt || expiresAt-60>Math.floor(Date.now()/1000)
}
let renewal=null
const renewSession=async force=>{
  try{
    const sb=await client()
    let session=null
    if(!force){
      const {data,error}=await sb.auth.getSession()
      if(error)throw error
      session=data?.session||null
    }
    if(force||!tokenFresh(session)){
      const {data,error}=await sb.auth.refreshSession()
      if(error)throw error
      session=data?.session||session
    }
    if(session?.access_token)state.session=session
  }catch(error){
    if(isAuthError(error))throw new Error('Authenticated admin user is required.')
  }
  return state.session
}
const freshSession=async({force=false}={})=>{
  if(!force&&tokenFresh(state.session))return state.session
  if(!renewal)renewal=renewSession(force).finally(()=>{renewal=null})
  return renewal
}
const api=async(path,options={})=>{
  await freshSession()
  if(!state.session?.access_token)throw new Error('Authenticated admin user is required.')
  const send=()=>shared.apiRequest(path,{...options,headers:{...shared.getAuthHeaders(state.session?.access_token||''),...(options.headers||{})}})
  try{ return await send() }
  catch(error){
    if(!isAuthError(error))throw error
    const rejected=state.session?.access_token||''
    await freshSession({force:true})
    if(!state.session?.access_token||state.session.access_token===rejected)throw error
    return send()
  }
}
const redirectToLogin=()=>{
  const current=`${window.location.pathname.split('/').pop()||'booking-admin.html'}${window.location.search}${window.location.hash}`
  window.location.replace(`login.html?next=${encodeURIComponent(current)}`)
}
const signOut=async()=>{
  try{ const sb=await client(); await sb.auth.signOut() }catch{}
  state.session=null
  window.location.replace('login.html')
}

/* ── Permissions ─────────────────────────────────────────────────────── */
const permissions=()=>{
  const role=String(state.profile?.role||'booking_agent')
  return {...(state.roleDefaults?.[role]||{}),...(state.profile?.effective_permissions||state.profile?.permissions||{})}
}
// A key the catalog does not know about (older bootstrap payloads) is not a restriction.
const can=key=>!key||Boolean(permissions()[key])||!state.permissionCatalog.some(item=>item.key===key)
const TAB_PERMISSION={dashboard:'dashboard',calendar:'calendar',reservations:'bookings','reservation-detail':'bookings',bookings:'bookings','booking-detail':'bookings',services:'services',reports:'reports',users:'admin_users'}

/* ── Modals ──────────────────────────────────────────────────────────── */
const setModal=(modal,open)=>{
  if(!modal)return
  modal.hidden=!open
  modal.setAttribute('aria-hidden',open ? 'false' : 'true')
  const anyOpen=[nodes.bookingModal,nodes.serviceModal,nodes.cruiseModal,nodes.workflowModal].some(m=>m&&!m.hidden)
  document.body.classList.toggle('has-modal',anyOpen)
}
const anyModalOpen=()=>document.body.classList.contains('has-modal')

/* Generic dialog: a title, some fields, and an onSubmit that receives the values. */
const openWorkflow=config=>{
  state.workflow=config
  nodes.workflowTitle.textContent=config.title||'Confirm'
  nodes.workflowDescription.textContent=config.description||''
  nodes.workflowSubmit.textContent=config.submitLabel||'Confirm'
  nodes.workflowSubmit.className=`adm-btn${config.danger ? ' danger' : ''}`
  nodes.workflowFields.innerHTML=(config.fields||[]).map(field=>{
    const name=attr(field.name)
    const req=field.required ? 'required' : ''
    const hint=field.helper ? `<p class="field-hint">${esc(field.helper)}</p>` : ''
    if(field.type==='textarea')return `<label class="adm-field"><span>${esc(field.label)}</span><textarea name="${name}" rows="${attr(field.rows||3)}" placeholder="${attr(field.placeholder||'')}" ${req}>${esc(field.value||'')}</textarea>${hint}</label>`
    if(field.type==='select')return `<label class="adm-field"><span>${esc(field.label)}</span><select name="${name}" ${req}>${(field.options||[]).map(o=>`<option value="${attr(o.value)}" ${String(o.value)===String(field.value??'') ? 'selected' : ''}>${esc(o.label||o.value)}</option>`).join('')}</select>${hint}</label>`
    if(field.type==='checkbox')return `<label class="adm-check"><input type="checkbox" name="${name}" ${field.checked ? 'checked' : ''}><span>${esc(field.label)}</span></label>`
    return `<label class="adm-field"><span>${esc(field.label)}</span><input type="${attr(field.type||'text')}" name="${name}" value="${attr(field.value||'')}" placeholder="${attr(field.placeholder||'')}" ${field.min!=null ? `min="${attr(field.min)}"` : ''} ${field.step ? `step="${attr(field.step)}"` : ''} ${req}>${hint}</label>`
  }).join('')
  setModal(nodes.workflowModal,true)
  window.setTimeout(()=>nodes.workflowFields.querySelector('input,select,textarea')?.focus(),50)
}
const closeWorkflow=()=>{ state.workflow=null; setModal(nodes.workflowModal,false) }
nodes.workflowForm.addEventListener('submit',event=>{
  event.preventDefault()
  const config=state.workflow
  if(!config)return
  const values={}
  nodes.workflowFields.querySelectorAll('input,select,textarea').forEach(input=>{
    values[input.name]=input.type==='checkbox' ? input.checked : input.value.trim()
  })
  for(const field of config.fields||[]){
    if(field.required&&field.type!=='checkbox'&&!text(values[field.name])){ toast(`${field.label} is required.`,'error'); return }
  }
  withButtonLoading(nodes.workflowSubmit,async()=>{
    await config.onSubmit(values)
    closeWorkflow()
  },'Working…').catch(fail)
})

/* ── Data ────────────────────────────────────────────────────────────── */
const loadData=async()=>{
  const payload=await api('admin/bootstrap')
  if(!payload||typeof payload!=='object')throw new Error('Admin bootstrap returned an empty response. Check the deployed booking-api function.')
  state.user=payload.user||null
  state.profile=payload.profile||null
  state.staffDirectory=payload.staff_directory||[]
  state.adminUsers=payload.admin_users||[]
  state.permissionCatalog=payload.permission_catalog||state.permissionCatalog
  state.roleDefaults=payload.role_defaults||state.roleDefaults
  state.brands=payload.brands||[]
  state.bookings=payload.bookings||[]
  state.bookingFormFields=normalizeFieldDefinitions(payload.booking_form_fields||[])
  state.customers=payload.customers||[]
  state.payments=payload.payments||[]
  state.paymentTransactions=payload.payment_transactions||[]
  state.refunds=payload.refunds||[]
  state.invoices=payload.invoices||[]
  state.officeInvoices=payload.office_invoices||[]
  state.statusHistory=payload.status_history||[]
  state.adminNotes=payload.admin_notes||[]
  state.services=(payload.services||[]).map(shared.normalizeService)
  state.settings={...shared.readConfig(),...(payload.settings||{})}
}
const refresh=async(message='')=>{
  if(state.refreshing)return state.refreshing
  state.refreshing=(async()=>{
    try{
      await loadData()
      renderAll()
      if(message)notify(message)
    }catch(error){
      if(isAuthError(error)){redirectToLogin();return}
      throw error
    }finally{ state.refreshing=null }
  })()
  return state.refreshing
}
// Quiet background sync so new website reservations appear without a reload.
const LIVE_SYNC_MS=30000
const startLiveSync=()=>{
  stopLiveSync()
  state.liveTimer=window.setInterval(()=>{
    if(document.hidden||anyModalOpen()||state.refreshing)return
    const before=new Set(state.bookings.map(b=>b.id))
    loadData().then(()=>{
      const fresh=state.bookings.filter(b=>!before.has(b.id)&&isReservation(b))
      renderAll()
      if(fresh.length)toast(`${fresh.length} new website reservation${fresh.length===1?'':'s'} arrived.`,'info')
    }).catch(error=>{ if(isAuthError(error))redirectToLogin() })
  },LIVE_SYNC_MS)
}
const stopLiveSync=()=>{ if(state.liveTimer)window.clearInterval(state.liveTimer); state.liveTimer=null }

/* ── Booking classification ──────────────────────────────────────────── */
const meta=booking=>{
  const m=booking?.metadata
  if(m&&typeof m==='object'&&!Array.isArray(m))return m
  if(typeof m==='string'&&m.trim().startsWith('{')){ try{ return JSON.parse(m) }catch{} }
  return {}
}
const isTrashed=b=>Boolean(meta(b).trash?.archived_at||meta(b).deleted_at)
const isCruise=b=>Boolean(meta(b).cruise_liner)
const isAdminEntered=b=>!isCruise(b)&&(lower(b?.source||meta(b).source||'website')==='admin'||Boolean(meta(b).admin_created))
// A website submission waits as 'provisional' until staff accept it.
const isReservation=b=>lower(b?.status)==='provisional'&&!isAdminEntered(b)&&!isTrashed(b)
const wasDeclinedReservation=b=>lower(b?.status)==='cancelled'&&!isTrashed(b)&&!isAdminEntered(b)&&/reservation declined/i.test(`${meta(b).cancellation_reason||''} ${state.adminNotes.filter(n=>n.booking_id===b.id).map(n=>n.note).join(' ')}`)
const liveBookings=()=>state.bookings.filter(b=>!isTrashed(b)&&!isReservation(b))
const reservations=()=>byDateDesc(state.bookings.filter(isReservation),'created_at')
const bookingById=id=>state.bookings.find(b=>String(b.id)===String(id))
const paxOf=b=>{
  const a=Number(b?.adult_quantity||0),c=Number(b?.child_quantity||0),i=Number(b?.infant_quantity||meta(b).infant_quantity||0)
  return a+c+i||Number(b?.quantity||1)
}
const paxLabel=b=>{
  const a=Number(b?.adult_quantity||0),c=Number(b?.child_quantity||0),i=Number(b?.infant_quantity||meta(b).infant_quantity||0)
  const parts=[a>0?`${a}A`:'',c>0?`${c}C`:'',i>0?`${i}I`:''].filter(Boolean).join('+')
  return parts ? `${paxOf(b)} (${parts})` : String(paxOf(b))
}
const paymentsOf=id=>state.payments.filter(p=>p.booking_id===id)
const PAID_STATUSES=['paid','fully_paid','cash','card','eft','voucher','foc','invoiced']
// A payment process on the booking means it is fully paid, whatever the payment rows say.
const isSettled=b=>PAID_STATUSES.includes(lower(b?.payment_status))
const receivedOf=b=>isSettled(b) ? Number(b?.total_amount||0) : Number(paymentsOf(b?.id)[0]?.amount_received||0)
const outstandingOf=b=>{
  if(isSettled(b)||['cancelled','refunded'].includes(lower(b?.status)))return 0
  return Math.max(0,Number((Number(b?.total_amount||0)-receivedOf(b)).toFixed(2)))
}
const PAYMENT_LABELS={partially_paid:'Partially paid',fully_paid:'Fully paid',foc:'FOC',paid:'Paid',refunded:'Refunded',cancelled:'Cancelled',failed:'Failed',invoiced:'Invoiced',eft:'EFT',card:'Card',cash:'Cash',voucher:'Voucher'}
const paymentLabel=status=>{ const key=lower(status); return key ? (PAYMENT_LABELS[key]||label(key)) : 'Unpaid' }
const paymentTag=b=>{
  const key=lower(b?.payment_status)
  if(!key)return receivedOf(b)>0 ? tag('partially_paid','Partially paid') : tag('unpaid','Unpaid')
  return tag(key,paymentLabel(key))
}
const statusTag=b=>{
  const key=lower(b?.status)
  if(key==='provisional')return tag('provisional','Awaiting approval')
  return tag(key||'not_set')
}
const brandName=code=>state.brands.find(b=>b.code===code)?.name||(code==='iventure' ? 'Iventure' : code==='true-travel' ? 'True Travel' : label(code||'Unassigned'))
const brandTag=code=>tag(code||'not_set',brandName(code))
const sourceLabel=b=>label(b?.source||meta(b).source||'website')
const staffName=id=>state.staffDirectory.find(u=>u.id===id)?.full_name||state.adminUsers.find(u=>u.id===id)?.full_name||''
const ownerName=b=>{
  const m=meta(b)
  return staffName(String(m.consultant_owner_id||record(m.management).consultant_owner_id||b?.updated_by||b?.created_by||''))||'—'
}
const guideNames=b=>{
  const m=meta(b)
  const raw=b?.guide_name||m.guide_name||m.guides||m.guide||''
  return String(Array.isArray(raw) ? raw.join(', ') : raw).split(/[,;]+/).map(s=>s.trim()).filter(Boolean)
}
const pickupModeLabel=mode=>mode==='self_drive' ? 'Self Drive' : mode==='transfer' ? 'Transfer' : ''
const pickupLabel=b=>{ const m=meta(b); return [m.departure_label,m.pickup_time].filter(Boolean).join(' · ')||'TBC' }

/* ── Navigation / routing ────────────────────────────────────────────── */
const routeState=()=>{
  const params=new URLSearchParams(window.location.search)
  return {tab:text(params.get('tab')),bookingId:text(params.get('booking')),reservationId:text(params.get('reservation')),serviceId:text(params.get('service'))}
}
const syncRoute=({tab='',bookingId='',reservationId=''}={})=>{
  const url=new URL(window.location.href)
  ;['tab','booking','reservation','service'].forEach(key=>url.searchParams.delete(key))
  if(tab)url.searchParams.set('tab',tab)
  if(bookingId)url.searchParams.set('booking',bookingId)
  if(reservationId)url.searchParams.set('reservation',reservationId)
  window.history.replaceState({},'',url.toString())
}
const NAV_PARENT={'reservation-detail':'reservations','booking-detail':'bookings'}
const switchTab=(tab,{scroll=true}={})=>{
  const target=TAB_PERMISSION[tab]!==undefined ? tab : 'calendar'
  if(!can(TAB_PERMISSION[target])){ toast('Your role does not allow that section.','error'); return }
  state.activeTab=target
  document.querySelectorAll('[data-admin-view]').forEach(view=>view.classList.toggle('is-active',view.dataset.adminView===target))
  const navKey=NAV_PARENT[target]||target
  document.querySelectorAll('.adm-nav [data-admin-tab]').forEach(btn=>{
    if(btn.dataset.adminTab===navKey)btn.setAttribute('aria-current','page'); else btn.removeAttribute('aria-current')
  })
  nodes.bar?.classList.remove('is-open')
  syncRoute({
    tab:target,
    bookingId:target==='booking-detail' ? state.selectedBookingId : '',
    reservationId:target==='reservation-detail' ? state.selectedBookingId : ''
  })
  document.title=`${{dashboard:'Dashboard',calendar:'Calendar',reservations:'Reservations','reservation-detail':'Reservation',bookings:'Bookings','booking-detail':'Booking',services:'Tours',reports:'Reports',users:'Users'}[target]||'SkyBook'} · SkyBook`
  if(scroll)window.scrollTo({top:0})
}
const applyNavVisibility=()=>{
  document.querySelectorAll('[data-admin-tab][data-permission]').forEach(btn=>{ btn.hidden=!can(btn.dataset.permission) })
}
const openReservation=id=>{ state.selectedBookingId=id; renderReservationDetail(); switchTab('reservation-detail') }
const openBooking=id=>{ state.selectedBookingId=id; renderBookingDetail(); switchTab('booking-detail') }

/* ── Session chrome ──────────────────────────────────────────────────── */
const renderSession=()=>{
  const authed=Boolean(state.session?.access_token)
  nodes.bar.hidden=!authed
  nodes.shell.hidden=!authed
  nodes.foot.hidden=!authed
  if(authed)nodes.loading.hidden=true
  nodes.userName.textContent=state.profile?.full_name||state.user?.email||'Admin'
  nodes.userRole.textContent=label(state.profile?.role||'admin')
}

/* ── Dashboard ───────────────────────────────────────────────────────── */
const rowLink=(b,labelText)=>`<button type="button" class="adm-link-btn" data-open-booking="${attr(b.id)}">${esc(labelText||b.reference||'Open')}</button>`
const renderDashboard=()=>{
  const today=todayKey()
  nodes.dashboardDate.textContent=new Date().toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  const active=liveBookings().filter(b=>!['cancelled','refunded'].includes(lower(b.status)))
  const todays=active.filter(b=>dateKey(b.preferred_date)===today).sort((a,b)=>pickupLabel(a).localeCompare(pickupLabel(b)))
  const pending=reservations()
  const monthKey=today.slice(0,7)
  const thisMonth=active.filter(b=>dateKey(b.preferred_date).slice(0,7)===monthKey)
  const unpaid=active.filter(b=>outstandingOf(b)>0&&dateKey(b.preferred_date)>=today).sort((a,b)=>dateKey(a.preferred_date).localeCompare(dateKey(b.preferred_date)))
  const end=new Date(); end.setDate(end.getDate()+7)
  const upcoming=active.filter(b=>{ const k=dateKey(b.preferred_date); return k>today&&k<=dateKey(end) }).sort((a,b)=>dateKey(a.preferred_date).localeCompare(dateKey(b.preferred_date)))
  nodes.dashboardStats.innerHTML=[
    {value:todays.length,label:'Tours today'},
    {value:pending.length,label:'Website reservations to approve',cls:pending.length ? 'is-warn' : ''},
    {value:thisMonth.length,label:'Bookings this month'},
    {value:unpaid.length,label:'Upcoming with balance due',cls:unpaid.length ? 'is-bad' : ''}
  ].map(s=>`<div class="adm-card adm-stat ${s.cls||''}"><strong>${esc(String(s.value))}</strong><span>${esc(s.label)}</span></div>`).join('')
  const overdueUnpaid=active.filter(b=>outstandingOf(b)>0&&dateKey(b.preferred_date)<today)
  nodes.dashboardAlerts.innerHTML=[
    pending.length ? `<p class="adm-note warn" style="margin-bottom:18px"><strong>${pending.length} website reservation${pending.length===1?'':'s'}</strong> waiting for approval. <button type="button" class="adm-link-btn" data-admin-tab="reservations">Review them</button>.</p>` : '',
    overdueUnpaid.length ? `<p class="adm-note err" style="margin-bottom:18px"><strong>${overdueUnpaid.length} past booking${overdueUnpaid.length===1?'':'s'} still unpaid:</strong> ${overdueUnpaid.slice(0,5).map(b=>`${esc(b.customer_name||'Guest')} (${esc(b.reference)}, ${money(outstandingOf(b),b.currency)})`).join('; ')}${overdueUnpaid.length>5 ? ' …' : ''}</p>` : ''
  ].join('')
  nodes.dashboardToday.innerHTML=todays.map(b=>`<tr class="is-clickable" data-open-booking="${attr(b.id)}">
    <td><strong>${esc(b.customer_name||'Guest')}</strong><span class="sub">${esc(b.reference)} · ${esc(b.customer_phone||b.customer_email||'')}</span></td>
    <td>${esc(b.service_name||meta(b).display_name||'—')}${guideNames(b).length ? `<span class="sub">Guide: ${esc(guideNames(b).join(', '))}</span>` : ''}</td>
    <td class="num">${esc(pickupLabel(b))}</td>
    <td class="num">${esc(paxLabel(b))}</td>
    <td>${paymentTag(b)}</td>
  </tr>`).join('')||emptyRow(5,'No tours scheduled for today.')
  nodes.dashboardReservations.innerHTML=pending.slice(0,6).map(b=>`<tr class="is-clickable" data-open-reservation="${attr(b.id)}">
    <td class="num">${esc(b.reference)}<span class="sub">${esc(fmtDateTime(b.created_at))}</span></td>
    <td><strong>${esc(b.customer_name||'Guest')}</strong><span class="sub">${brandTag(b.brand_code)}</span></td>
    <td>${esc(b.service_name||'—')}</td>
    <td class="num">${esc(fmtDate(b.preferred_date))}</td>
  </tr>`).join('')||emptyRow(4,'No new website reservations. Requests from the websites land here.')
  nodes.dashboardUpcoming.innerHTML=upcoming.slice(0,10).map(b=>`<tr class="is-clickable" data-open-booking="${attr(b.id)}">
    <td class="num">${esc(fmtDate(b.preferred_date))}</td>
    <td><strong>${esc(b.customer_name||'Guest')}</strong><span class="sub">${esc(b.reference)}</span></td>
    <td>${esc(b.service_name||meta(b).display_name||'—')}</td>
    <td class="num">${esc(paxLabel(b))}</td>
    <td>${paymentTag(b)}</td>
  </tr>`).join('')||emptyRow(5,'Nothing booked for the next seven days.')
  nodes.dashboardUnpaid.innerHTML=unpaid.slice(0,10).map(b=>`<tr class="is-clickable" data-open-booking="${attr(b.id)}">
    <td><strong>${esc(b.customer_name||'Guest')}</strong><span class="sub">${esc(b.reference)}</span></td>
    <td>${esc(b.service_name||'—')}</td>
    <td class="num">${esc(fmtDate(b.preferred_date))}</td>
    <td class="num"><strong>${money(outstandingOf(b),b.currency)}</strong></td>
  </tr>`).join('')||emptyRow(4,'Every upcoming booking is settled.')
}

/* ── Reservations ────────────────────────────────────────────────────── */
const renderReservations=()=>{
  const open=reservations()
  const declined=byDateDesc(state.bookings.filter(wasDeclinedReservation),'updated_at').slice(0,40)
  nodes.reservationBadge.textContent=String(open.length)
  nodes.reservationBadge.hidden=open.length===0
  nodes.reservationsSummary.textContent=`${open.length} awaiting approval · requests from True Travel and Iventure land here.`
  nodes.reservationsTable.innerHTML=open.map(b=>`<tr data-open-reservation="${attr(b.id)}" class="is-clickable">
    <td class="num">${esc(b.reference)}<span class="sub">${esc(fmtDateTime(b.created_at))}</span></td>
    <td><strong>${esc(b.customer_name||'Guest')}</strong><span class="sub">${esc(b.customer_email||'')}${b.customer_phone ? ` · ${esc(b.customer_phone)}` : ''}</span><span class="sub">${brandTag(b.brand_code)}</span></td>
    <td>${esc(b.service_name||'Tour not selected')}<span class="sub">${esc(pickupLabel(b))}</span></td>
    <td class="num">${esc(fmtDate(b.preferred_date))}</td>
    <td class="num">${esc(paxLabel(b))}</td>
    <td class="num">${money(b.total_amount,b.currency)}</td>
    <td class="actions"><div class="adm-inline">
      <button class="adm-btn small" type="button" data-reservation-action="accept" data-id="${attr(b.id)}">Approve</button>
      <button class="adm-btn ghost small" type="button" data-open-reservation="${attr(b.id)}">Review</button>
      <button class="adm-btn danger small" type="button" data-reservation-action="decline" data-id="${attr(b.id)}">Decline</button>
    </div></td>
  </tr>`).join('')||emptyRow(7,'Nothing waiting. Website reservations from True Travel and Iventure land here.')
  nodes.reservationsDeclined.innerHTML=declined.map(b=>`<tr>
    <td class="num">${esc(b.reference)}</td>
    <td>${esc(b.customer_name||'Guest')}<span class="sub">${brandTag(b.brand_code)}</span></td>
    <td>${esc(b.service_name||'—')}</td>
    <td class="num">${esc(fmtDate(b.preferred_date))}</td>
    <td class="num">${money(b.total_amount,b.currency)}</td>
    <td>${tag('declined','Declined')}</td>
    <td class="actions"><button class="adm-btn ghost small" type="button" data-reservation-action="reinstate" data-id="${attr(b.id)}">Reinstate</button></td>
  </tr>`).join('')||emptyRow(7,'No declined reservations.')
}

const submittedRows=b=>{
  const m=meta(b)
  const custom=record(m.custom_fields)
  const fields=activeFormFields(b.brand_code)
  const labels=new Map(fields.map(f=>[f.id,f.label]))
  const rows=[]
  const used=new Set()
  const add=(labelText,value,key='')=>{
    const display=formatSubmitted(value)
    if(!display)return
    if(key)used.add(fieldId(key))
    rows.push({label:labelText,value:display})
  }
  add('Reference',b.reference)
  add('Brand',brandName(b.brand_code))
  add('Source',sourceLabel(b))
  add('Submitted from',m.source_page||m.capture_page)
  add('Guest name',b.customer_name)
  add('Guest email',b.customer_email)
  add('Guest phone',b.customer_phone)
  add('Tour',b.service_name)
  add('Preferred date',fmtDate(b.preferred_date))
  add('Departure',m.departure_label)
  add('Pickup time',m.pickup_time)
  add('Transport',pickupModeLabel(m.pickup_mode))
  add('Nationality',m.nationality||b.nationality)
  add('Booked by',m.booked_by||b.booked_by)
  add('Agent / reseller',m.agent||b.agent)
  add('Dietary requirements',m.dietary_requirements||m.dietary)
  add('Guide(s)',guideNames(b).join(', '))
  add('Skipper(s)',m.skipper_name)
  add('Guests',paxLabel(b))
  add('Total',money(b.total_amount,b.currency))
  add('Guest notes',b.customer_notes||b.notes)
  ;['contact_number','whatsapp','room_number','special_requests','other_notes'].forEach(key=>add(label(key),m[key],key))
  Object.entries(custom).forEach(([key,value])=>{ if(!used.has(fieldId(key)))add(labels.get(fieldId(key))||label(key),value,key) })
  return rows
}
const formatSubmitted=value=>{
  if(value===true)return 'Yes'
  if(value===false)return 'No'
  if(Array.isArray(value))return value.map(v=>text(v)).filter(Boolean).join(', ')
  if(value&&typeof value==='object')return Object.entries(value).map(([k,v])=>{ const inner=formatSubmitted(v); return inner ? `${label(k)}: ${inner}` : '' }).filter(Boolean).join(' / ')
  return text(value)
}
const detailGrid=rows=>`<div class="detail-grid">${rows.map(r=>`<div><span>${esc(r.label)}</span><strong>${esc(r.value)}</strong></div>`).join('')}</div>`

const renderReservationDetail=()=>{
  const b=bookingById(state.selectedBookingId)
  if(!b){ nodes.reservationDetail.innerHTML=`<div class="adm-head"><div><h1>Reservation</h1></div></div><div class="adm-card"><p class="adm-empty">Select a reservation from the list. <button type="button" class="adm-link-btn" data-admin-tab="reservations">Back to reservations</button></p></div>`; return }
  const checks=[
    {label:'Guest name',done:Boolean(b.customer_name)},{label:'Phone',done:Boolean(b.customer_phone)},{label:'Email',done:Boolean(b.customer_email)},
    {label:'Tour',done:Boolean(b.service_name)},{label:'Date',done:Boolean(b.preferred_date)},{label:'Pax',done:paxOf(b)>0},{label:'Price',done:Number(b.total_amount||0)>0}
  ]
  const stillOpen=isReservation(b)
  const repeat=state.bookings.filter(o=>o.id!==b.id&&!['cancelled'].includes(lower(o.status))&&lower(o.customer_email)&&lower(o.customer_email)===lower(b.customer_email))
  nodes.reservationDetail.innerHTML=`
    <div class="adm-head">
      <div>
        <p><button type="button" class="adm-link-btn" data-admin-tab="reservations">← Reservations</button></p>
        <h1>${esc(b.customer_name||'Guest')} · ${esc(b.service_name||'Tour')}</h1>
        <p>${esc(b.reference)} · submitted ${esc(fmtDateTime(b.created_at))} via ${esc(sourceLabel(b))}</p>
      </div>
      <div class="adm-head-actions">
        ${stillOpen ? `
          <button class="adm-btn ghost" type="button" data-reservation-action="edit" data-id="${attr(b.id)}">Edit details</button>
          <button class="adm-btn danger" type="button" data-reservation-action="delete" data-id="${attr(b.id)}">Delete</button>
          <button class="adm-btn danger" type="button" data-reservation-action="decline" data-id="${attr(b.id)}">Decline</button>
          <button class="adm-btn" type="button" data-reservation-action="accept" data-id="${attr(b.id)}">Approve → booking</button>
        ` : `<button class="adm-btn" type="button" data-open-booking="${attr(b.id)}">Open booking</button>`}
      </div>
    </div>
    ${stillOpen ? '' : `<p class="adm-note info" style="margin-bottom:18px">This reservation has already been handled — it is now ${esc(label(b.status))}.</p>`}
    ${repeat.length ? `<p class="adm-note ok" style="margin-bottom:18px"><strong>Returning guest</strong> — ${repeat.length} previous booking${repeat.length===1?'':'s'}. Last tour: ${esc(byDateDesc(repeat,'preferred_date')[0].service_name||'—')} on ${esc(fmtDate(byDateDesc(repeat,'preferred_date')[0].preferred_date))}.</p>` : ''}
    <div class="adm-grid cols-4">
      <div class="adm-card adm-stat"><strong style="font-size:1.6rem">${esc(b.service_name||'—')}</strong><span>Tour</span></div>
      <div class="adm-card adm-stat"><strong style="font-size:1.6rem">${esc(fmtDate(b.preferred_date))}</strong><span>Preferred date</span></div>
      <div class="adm-card adm-stat"><strong>${esc(String(paxOf(b)))}</strong><span>Guests (${esc(paxLabel(b))})</span></div>
      <div class="adm-card adm-stat"><strong style="font-size:1.8rem">${money(b.total_amount,b.currency)}</strong><span>Quoted total</span></div>
    </div>
    <div class="adm-grid cols-2">
      <section class="adm-card">
        <h2>Guest</h2>
        ${detailGrid([
          {label:'Name',value:b.customer_name||'—'},{label:'Email',value:b.customer_email||'—'},{label:'Phone',value:b.customer_phone||'—'},
          {label:'Brand',value:brandName(b.brand_code)},{label:'Source',value:sourceLabel(b)},{label:'Pickup',value:pickupLabel(b)}
        ])}
        <div class="detail-notes">${esc(b.customer_notes||b.notes||'No guest notes or pickup instructions were captured.')}</div>
      </section>
      <section class="adm-card">
        <h2>Ready to approve?</h2>
        <div class="quality-grid">${checks.map(c=>`<span class="tag ${c.done ? 'tag-ok' : 'tag-missing'}">${c.done ? '✓' : '!'} ${esc(c.label)}</span>`).join('')}</div>
        <p class="adm-muted" style="margin-top:12px">Approving turns this request into a finalised booking. Use <em>Edit details</em> first to fix anything marked missing, assign a guide or set a price.</p>
      </section>
    </div>
    <section class="adm-card">
      <h2>Everything the guest submitted</h2>
      ${detailGrid(submittedRows(b))}
    </section>
  `
}

/* ── Bookings list ───────────────────────────────────────────────────── */
const quickFilterMatch=(b,filter)=>{
  const key=dateKey(b.preferred_date), today=todayKey(), status=lower(b.status)
  if(filter==='today')return key===today&&!['cancelled','refunded'].includes(status)
  if(filter==='upcoming')return key>=today&&!['cancelled','refunded'].includes(status)
  if(filter==='finalised')return status==='finalised'
  if(filter==='unpaid')return outstandingOf(b)>0
  if(filter==='cancelled')return status==='cancelled'
  if(filter==='refunded')return status==='refunded'
  return true
}
const filteredBookings=()=>{
  const search=lower(nodes.bookingFilterSearch.value)
  const brand=text(nodes.bookingFilterBrand.value)
  const service=text(nodes.bookingFilterService.value)
  const from=parseDate(nodes.bookingFilterDateFrom.value)
  const to=parseDate(nodes.bookingFilterDateTo.value)
  if(to)to.setHours(23,59,59,999)
  return liveBookings().filter(b=>{
    if(search&&![b.reference,b.customer_name,b.customer_email,b.customer_phone,b.service_name,meta(b).display_name,b.brand_code].join(' ').toLowerCase().includes(search))return false
    if(brand&&b.brand_code!==brand)return false
    if(service&&b.service_slug!==service)return false
    const d=parseDate(b.preferred_date)
    if(from&&(!d||d<from))return false
    if(to&&(!d||d>to))return false
    return quickFilterMatch(b,state.bookingQuickFilter)
  }).sort((a,b)=>{
    // Today/upcoming read best in date order; everything else newest first.
    if(['today','upcoming'].includes(state.bookingQuickFilter))return dateKey(a.preferred_date).localeCompare(dateKey(b.preferred_date))||pickupLabel(a).localeCompare(pickupLabel(b))
    return (parseDate(b.created_at)?.getTime()||0)-(parseDate(a.created_at)?.getTime()||0)
  })
}
const renderBookings=()=>{
  const all=liveBookings()
  nodes.bookingQuickFilters.querySelectorAll('[data-quick-filter]').forEach(chip=>{
    const key=chip.dataset.quickFilter
    chip.setAttribute('aria-pressed',key===state.bookingQuickFilter ? 'true' : 'false')
    const count=chip.querySelector('[data-filter-count]')
    if(count)count.textContent=String(all.filter(b=>quickFilterMatch(b,key)).length)
  })
  const rows=filteredBookings()
  nodes.bookingsSummary.textContent=`${rows.length} shown · ${all.filter(b=>quickFilterMatch(b,'upcoming')).length} upcoming · ${all.filter(b=>outstandingOf(b)>0&&quickFilterMatch(b,'upcoming')).length} with a balance due`
  nodes.bookingsTable.innerHTML=rows.map(b=>`<tr class="is-clickable${b.id===state.selectedBookingId ? ' is-selected' : ''}" data-open-booking="${attr(b.id)}">
    <td class="num">${esc(b.reference)}<span class="sub">${brandTag(b.brand_code)}</span></td>
    <td><strong>${esc(b.customer_name||'Guest')}</strong><span class="sub">${esc(b.customer_phone||b.customer_email||'')}</span></td>
    <td>${esc(b.service_name||meta(b).display_name||'—')}<span class="sub">${esc(pickupLabel(b))}${guideNames(b).length ? ` · ${esc(guideNames(b).join(', '))}` : ''}</span></td>
    <td class="num">${esc(fmtDate(b.preferred_date))}</td>
    <td class="num">${esc(paxLabel(b))}</td>
    <td class="num">${money(b.total_amount,b.currency)}${outstandingOf(b)>0 ? `<span class="sub">${money(outstandingOf(b),b.currency)} due</span>` : ''}</td>
    <td>${statusTag(b)}</td>
    <td>${paymentTag(b)}</td>
    <td class="actions"><button class="adm-btn ghost small" type="button" data-open-booking="${attr(b.id)}">Open</button></td>
  </tr>`).join('')||emptyRow(9,'No bookings match the current filters.')
}

/* ── Booking detail ──────────────────────────────────────────────────── */
const renderBookingDetail=()=>{
  const b=bookingById(state.selectedBookingId)
  if(!b){ nodes.bookingDetail.innerHTML=`<div class="adm-head"><div><h1>Booking</h1></div></div><div class="adm-card"><p class="adm-empty">Select a booking from the list. <button type="button" class="adm-link-btn" data-admin-tab="bookings">Back to bookings</button></p></div>`; return }
  const status=lower(b.status)
  const m=meta(b)
  const payments=paymentsOf(b.id)
  const received=receivedOf(b)
  const outstanding=outstandingOf(b)
  const transactions=state.paymentTransactions.filter(t=>payments.some(p=>p.id===t.payment_id)&&['paid','captured','succeeded','manual_payment'].includes(lower(t.status||t.transaction_type)))
  const notes=byDateDesc(state.adminNotes.filter(n=>n.booking_id===b.id),'created_at')
  const history=byDateDesc(state.statusHistory.filter(h=>h.booking_id===b.id),'created_at')
  const isCancelled=status==='cancelled', isRefunded=status==='refunded', isProvisional=status==='provisional'
  const canPay=!isCancelled&&!isRefunded&&!isSettled(b)&&Number(b.total_amount||0)>0
  nodes.bookingDetail.innerHTML=`
    <div class="adm-head">
      <div>
        <p><button type="button" class="adm-link-btn" data-admin-tab="bookings">← Bookings</button></p>
        <h1>${esc(b.customer_name||'Guest')} · ${esc(b.service_name||m.display_name||'Tour')}</h1>
        <p>${esc(b.reference)} · ${esc(fmtDate(b.preferred_date))} · ${esc(brandName(b.brand_code))} · ${esc(sourceLabel(b))}${isCruise(b) ? ' · Cruise liner group' : ''}</p>
      </div>
      <div class="adm-head-actions">
        ${statusTag(b)} ${paymentTag(b)}
        ${isCancelled ? `<button class="adm-btn ghost" type="button" data-booking-action="reinstate">Reinstate</button>` : ''}
        ${isProvisional ? `<button class="adm-btn" type="button" data-booking-action="confirm">Finalise</button>` : ''}
        ${!isCancelled&&!isRefunded ? `<button class="adm-btn ghost" type="button" data-booking-action="edit">Edit</button>` : ''}
        ${!isCancelled&&!isRefunded ? `<button class="adm-btn danger" type="button" data-booking-action="cancel">Cancel booking</button>` : ''}
        <button class="adm-btn ghost" type="button" data-booking-action="print">Print</button>
      </div>
    </div>
    ${isCancelled&&m.cancellation_reason ? `<p class="adm-note err" style="margin-bottom:18px"><strong>Cancelled:</strong> ${esc(m.cancellation_reason)}</p>` : ''}
    <div class="adm-grid cols-4">
      <div class="adm-card adm-stat"><strong style="font-size:1.8rem">${money(b.total_amount,b.currency)}</strong><span>Total${m.price_override>0||b.price_override>0 ? ' (custom price)' : ''}</span></div>
      <div class="adm-card adm-stat"><strong style="font-size:1.8rem">${money(received,b.currency)}</strong><span>Received</span></div>
      <div class="adm-card adm-stat ${outstanding>0 ? 'is-bad' : ''}"><strong style="font-size:1.8rem">${money(outstanding,b.currency)}</strong><span>Outstanding</span></div>
      <div class="adm-card adm-stat"><strong>${esc(String(paxOf(b)))}</strong><span>Guests (${esc(paxLabel(b))})</span></div>
    </div>
    <div class="adm-grid cols-2">
      <section class="adm-card">
        <h2>Guest &amp; trip</h2>
        ${detailGrid([
          {label:'Name',value:b.customer_name||'—'},{label:'Email',value:b.customer_email||'—'},{label:'Phone',value:b.customer_phone||'—'},
          {label:'Tour',value:b.service_name||m.display_name||'—'},{label:'Date',value:fmtDate(b.preferred_date)},{label:'Pickup',value:pickupLabel(b)},
          {label:'Transport',value:pickupModeLabel(m.pickup_mode)||'—'},{label:'Guide(s)',value:guideNames(b).join(', ')||'—'},{label:'Skipper(s)',value:m.skipper_name||'—'},
          {label:'Nationality',value:m.nationality||'—'},{label:'Booked by',value:m.booked_by||'—'},{label:'Agent / reseller',value:m.agent||'—'},
          {label:'Dietary',value:m.dietary_requirements||m.dietary||'—'},{label:'Entered by',value:ownerName(b)},{label:'Created',value:fmtDateTime(b.created_at)}
        ])}
        ${Object.keys(record(m.custom_fields)).length ? `<div style="margin-top:14px">${detailGrid(Object.entries(record(m.custom_fields)).map(([k,v])=>({label:activeFormFields(b.brand_code).find(f=>f.id===fieldId(k))?.label||label(k),value:formatSubmitted(v)||'—'})))}</div>` : ''}
        <div class="detail-notes">${esc(b.notes||b.customer_notes||'No notes.')}</div>
      </section>
      <section class="adm-card">
        <div class="adm-card-head"><h2>Payments</h2>${canPay ? `<button class="adm-btn small" type="button" data-booking-action="load-payment">Record payment</button>` : ''}</div>
        <div class="adm-scroll"><table class="adm-table">
          <thead><tr><th>When</th><th>Method</th><th>Reference</th><th class="num">Amount</th></tr></thead>
          <tbody>${transactions.map(t=>`<tr><td class="num">${esc(fmtDateTime(t.created_at))}</td><td>${esc(paymentMethodLabel(record(t.raw_payload).payment_type||t.provider||''))}</td><td>${esc(record(t.raw_payload).provider_reference||t.provider_reference||'—')}</td><td class="num">${money(t.amount,b.currency)}</td></tr>`).join('')
            ||(received>0 ? `<tr><td class="num">${esc(fmtDateTime(payments[0]?.updated_at||payments[0]?.created_at))}</td><td>${esc(paymentMethodLabel(payments[0]?.payment_type||payments[0]?.provider||''))}</td><td>—</td><td class="num">${money(received,b.currency)}</td></tr>` : '')
            ||emptyRow(4,isSettled(b) ? `Marked ${paymentLabel(b.payment_status)} — no individual payments recorded.` : 'No payments recorded yet.')}</tbody>
        </table></div>
        ${canPay ? `
        <form class="adm-form" id="manualPaymentForm" style="margin-top:16px;padding-top:16px;border-top:1px solid var(--line)" hidden>
          <div class="row three">
            <label class="adm-field"><span>Method</span><select name="payment_type"><option value="eft">EFT / Bank transfer</option><option value="card">Card machine</option><option value="cash">Cash</option><option value="voucher">Voucher</option><option value="other">Other</option></select></label>
            <label class="adm-field"><span>Amount</span><input name="amount" type="number" min="0.01" step="0.01" value="${attr(outstanding>0 ? outstanding.toFixed(2) : '')}" required></label>
            <label class="adm-field"><span>Reference</span><input name="provider_reference" type="text" placeholder="Optional"></label>
          </div>
          <div class="row" data-card-fields hidden>
            <label class="adm-field"><span>Terminal serial</span><input name="terminal_serial_number" type="text"></label>
            <label class="adm-field"><span>Batch number</span><input name="batch_number" type="text"></label>
          </div>
          <div class="adm-actions"><button class="adm-btn" type="submit">Save payment</button><button class="adm-btn ghost" type="button" data-booking-action="hide-payment">Close</button></div>
        </form>` : ''}
        <h2 style="margin-top:22px">Internal notes</h2>
        <form class="adm-inline" id="bookingNoteForm" style="margin-bottom:12px"><input class="adm-input" name="note" type="text" placeholder="Add a note for the team" style="flex:1;width:auto" required><button class="adm-btn small" type="submit">Add</button></form>
        <ul class="adm-timeline">${notes.slice(0,12).map(n=>`<li>${esc(n.note)}<small>${esc(fmtDateTime(n.created_at))}${n.created_by ? ` · ${esc(staffName(n.created_by)||'')}` : ''}</small></li>`).join('')||'<li class="adm-muted">No notes yet.</li>'}</ul>
      </section>
    </div>
    <section class="adm-card">
      <h2>History</h2>
      <ul class="adm-timeline">${history.slice(0,15).map(h=>`<li>${esc(label(h.from_status||'new'))} → <strong>${esc(label(h.to_status||''))}</strong>${h.reason ? ` — ${esc(h.reason)}` : ''}<small>${esc(fmtDateTime(h.created_at))}${h.changed_by ? ` · ${esc(staffName(h.changed_by)||'')}` : ''}</small></li>`).join('')||'<li class="adm-muted">No status changes recorded.</li>'}</ul>
    </section>
  `
}
const paymentMethodLabel=value=>{
  const key=lower(value||'manual').replace(/_/g,' ')
  if(['eft','bank transfer','manual eft'].includes(key))return 'EFT'
  if(['card','credit card','debit card'].includes(key))return 'Card'
  if(key==='cash')return 'Cash'
  if(key==='voucher')return 'Voucher'
  if(key==='dpo')return 'DPO'
  return label(key||'Manual')
}

/* ── Reservation + booking actions ───────────────────────────────────── */
const addNote=(bookingId,note)=>bookingId&&note ? api('admin/notes',{method:'POST',body:{booking_id:bookingId,note,is_private:true}}) : Promise.resolve()

const acceptReservation=async(id,button)=>{
  const b=bookingById(id)
  if(!b)return
  const missing=[!b.customer_name&&'guest name',!b.service_slug&&!b.service_name&&'tour',!b.preferred_date&&'date'].filter(Boolean)
  if(missing.length){ toast(`Add the ${missing.join(', ')} (Edit details) before approving.`,'error'); return }
  await withButtonLoading(button,async()=>{
    await api(`admin/bookings/${encodeURIComponent(id)}`,{method:'PATCH',body:{workflow_action:'accept_reservation',status:'finalised',reason:'Reservation approved and moved to bookings.'}})
    await addNote(id,'Reservation approved and moved to bookings.')
    await refresh()
    notify(`Reservation ${b.reference} approved — it is now a booking.`)
    openBooking(id)
  },'Approving…')
}
const declineReservation=id=>{
  const b=bookingById(id)
  if(!b)return
  openWorkflow({
    title:`Decline ${b.reference}`,description:'Tell the team why this website request is not going ahead. The guest is not emailed automatically.',submitLabel:'Decline reservation',danger:true,
    fields:[{name:'reason',label:'Reason',type:'textarea',required:true,value:'Reservation declined after review.'}],
    onSubmit:async values=>{
      await api(`admin/bookings/${encodeURIComponent(id)}`,{method:'PATCH',body:{workflow_action:'cancel_booking',status:'cancelled',payment_status:'',reason:values.reason,notes:values.reason}})
      await addNote(id,`Reservation declined: ${values.reason}`)
      await refresh()
      notify('Reservation declined.')
      if(state.activeTab==='reservation-detail')switchTab('reservations')
    }
  })
}
const deleteReservation=id=>{
  const b=bookingById(id)
  if(!b)return
  openWorkflow({
    title:`Delete ${b.reference}`,description:'Removes this request from SkyBook. It stays archived for audit but will not show anywhere in the console.',submitLabel:'Delete reservation',danger:true,
    fields:[{name:'reason',label:'Reason',type:'textarea',required:true,placeholder:'Duplicate or spam request.'},{name:'confirm',label:'I understand this cannot be undone from the console.',type:'checkbox'}],
    onSubmit:async values=>{
      if(values.confirm!==true)throw new Error('Tick the confirmation box first.')
      await api(`admin/bookings/${encodeURIComponent(id)}/trash`,{method:'POST',body:{reason:values.reason}})
      await refresh()
      notify('Reservation deleted.')
      switchTab('reservations')
    }
  })
}
const reinstate=(id,toStatus)=>{
  const b=bookingById(id)
  if(!b)return
  openWorkflow({
    title:`Reinstate ${b.reference}`,description:toStatus==='provisional' ? 'Puts the request back in the approval queue.' : 'Returns this cancelled booking to active (finalised).',submitLabel:'Reinstate',
    fields:[{name:'reason',label:'Reason',type:'textarea',required:true,placeholder:'Guest came back, cancelled in error, etc.'}],
    onSubmit:async values=>{
      await api(`admin/bookings/${encodeURIComponent(id)}`,{method:'PATCH',body:{status:toStatus,...(toStatus==='provisional' ? {payment_status:''} : {}),reason:values.reason,workflow_action:'reinstate'}})
      await addNote(id,`Reinstated: ${values.reason}`)
      await refresh()
      notify('Reinstated.')
      if(toStatus==='provisional')openReservation(id); else renderBookingDetail()
    }
  })
}
const CANCEL_REASONS=[
  {value:'payment_overdue',label:'Payment overdue'},{value:'guest_request',label:'Guest requested cancellation'},{value:'weather',label:'Weather / sea conditions'},
  {value:'no_show',label:'No-show'},{value:'operational',label:'Operational reasons'},{value:'duplicate',label:'Duplicate booking'},{value:'other',label:'Other'}
]
const cancelBooking=id=>{
  const b=bookingById(id)
  if(!b)return
  const received=receivedOf(b)
  openWorkflow({
    title:`Cancel ${b.reference}`,description:received>0 ? `${money(received,b.currency)} has been received on this booking — arrange any refund outside SkyBook and note it below.` : 'A reason is required and is kept in the booking history.',submitLabel:'Cancel booking',danger:true,
    fields:[
      {name:'reason_type',label:'Reason',type:'select',value:'guest_request',options:CANCEL_REASONS,required:true},
      {name:'comment',label:'Comment',type:'textarea',required:true,placeholder:'Context, who approved it, what the guest was told.'}
    ],
    onSubmit:async values=>{
      const reason=`${CANCEL_REASONS.find(r=>r.value===values.reason_type)?.label||label(values.reason_type)}: ${values.comment}`
      await api(`admin/bookings/${encodeURIComponent(id)}`,{method:'PATCH',body:{workflow_action:'cancel_booking',status:'cancelled',reason,notes:values.comment,metadata:{...meta(b),cancellation_reason:reason,no_show:values.reason_type==='no_show'}}})
      await addNote(id,`Booking cancelled — ${reason}`)
      await refresh()
      notify('Booking cancelled.')
      renderBookingDetail()
    }
  })
}
const confirmBooking=async(id,button)=>{
  const b=bookingById(id)
  if(!b)return
  await withButtonLoading(button,async()=>{
    await api(`admin/bookings/${encodeURIComponent(id)}`,{method:'PATCH',body:{status:'finalised',workflow_action:'confirm_booking'}})
    await addNote(id,'Booking finalised.')
    await refresh()
    notify('Booking finalised.')
    renderBookingDetail()
  },'Finalising…')
}
const saveManualPayment=async(form,bookingId)=>{
  const data=new FormData(form)
  const body={
    payment_type:text(data.get('payment_type'))||'eft',amount:Number(data.get('amount')||0),provider_reference:text(data.get('provider_reference')),
    terminal_serial_number:text(data.get('terminal_serial_number')),batch_number:text(data.get('batch_number')),notes:'',allow_overpayment:false
  }
  if(!(body.amount>0))throw new Error('Enter the amount received.')
  if(body.payment_type==='card'&&(!body.terminal_serial_number||!body.batch_number))throw new Error('Card payments need the terminal serial and batch number.')
  const b=bookingById(bookingId)
  const outstanding=outstandingOf(b)
  if(body.amount>outstanding+0.01){
    const ok=window.confirm(`Outstanding balance is ${money(outstanding,b?.currency)}. Recording ${money(body.amount,b?.currency)} puts the booking in credit. Continue?`)
    if(!ok)throw new Error('Payment not recorded.')
    body.allow_overpayment=true
  }
  await api(`admin/bookings/${encodeURIComponent(bookingId)}/payments`,{method:'POST',body})
  await refresh()
  notify('Payment recorded.')
  renderBookingDetail()
}

/* Printable day sheet / booking sheet, rendered in a new tab for printing. */
const PRINT_CSS='*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:28px 32px;color:#142438;line-height:1.45}h1{font-size:22px;margin:0 0 4px}h2{font-size:15px;margin:22px 0 8px;color:#145bc7}p{margin:0 0 6px;color:#516678;font-size:13px}table{width:100%;border-collapse:collapse;margin-top:8px;font-size:12.5px}th{text-align:left;font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#516678;padding:0 8px 6px;border-bottom:1px solid #d9e3ea}td{padding:7px 8px;border-bottom:1px solid #eef3f7;vertical-align:top}dl{display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px 18px;margin:0;font-size:13px}dt{font-size:10px;letter-spacing:.06em;text-transform:uppercase;color:#516678}dd{margin:2px 0 0}.foot{margin-top:24px;font-size:10px;color:#8299ad;text-align:center}@media print{body{padding:12px}}'
const openPrintWindow=(title,markup)=>{
  const w=window.open('','_blank')
  if(!w){ toast('Allow pop-ups to print from SkyBook.','error'); return }
  w.document.open()
  w.document.write(`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PRINT_CSS}</style></head><body>${markup}<div class="foot">SkyBook · printed ${esc(fmtDateTime(new Date().toISOString()))}</div><script>window.addEventListener('load',()=>setTimeout(()=>window.print(),300))<\/script></body></html>`)
  w.document.close()
}
const printBooking=b=>{
  const rows=submittedRows(b)
  openPrintWindow(`Booking ${b.reference}`,`<h1>${esc(b.customer_name||'Guest')} · ${esc(b.service_name||meta(b).display_name||'Tour')}</h1><p>${esc(b.reference)} · ${esc(brandName(b.brand_code))} · ${esc(label(b.status))} · ${esc(paymentLabel(b.payment_status))}</p><h2>Details</h2><dl>${rows.map(r=>`<div><dt>${esc(r.label)}</dt><dd>${esc(r.value)}</dd></div>`).join('')}</dl>`)
}
const printDaySheet=(key=todayKey())=>{
  const rows=liveBookings().filter(b=>dateKey(b.preferred_date)===key&&!['cancelled','refunded'].includes(lower(b.status))).sort((a,b)=>pickupLabel(a).localeCompare(pickupLabel(b)))
  openPrintWindow(`Day sheet ${fmtDate(key)}`,`<h1>Day sheet — ${esc(fmtDate(key))}</h1><p>${rows.length} booking${rows.length===1?'':'s'} · ${rows.reduce((s,b)=>s+paxOf(b),0)} guests</p>
    <table><thead><tr><th>Pickup</th><th>Guest</th><th>Tour</th><th>Pax</th><th>Transport</th><th>Guide</th><th>Payment</th><th>Notes</th></tr></thead><tbody>
    ${rows.map(b=>`<tr><td>${esc(pickupLabel(b))}</td><td><strong>${esc(b.customer_name||'Guest')}</strong><br>${esc(b.customer_phone||'')}</td><td>${esc(b.service_name||meta(b).display_name||'—')}</td><td>${esc(paxLabel(b))}</td><td>${esc(pickupModeLabel(meta(b).pickup_mode)||'—')}</td><td>${esc(guideNames(b).join(', ')||'—')}</td><td>${esc(paymentLabel(b.payment_status))}${outstandingOf(b)>0 ? `<br>${money(outstandingOf(b),b.currency)} due` : ''}</td><td>${esc(b.notes||b.customer_notes||'')}</td></tr>`).join('')||'<tr><td colspan="8">Nothing scheduled.</td></tr>'}
    </tbody></table>`)
}

/* ── Booking form (fields unchanged from the original SkyBook form) ───── */
const FIELD_TYPES=['text','textarea','select','checkbox','number','date','email','tel']
const fieldId=value=>text(value).toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
const normalizeFieldOptions=value=>(Array.isArray(value) ? value : String(value||'').split(/\r?\n|,/)).map((option,index)=>{
  const raw=option&&typeof option==='object' ? option : {label:option,value:option}
  const optionLabel=text(raw.label||raw.value)
  const optionValue=fieldId(raw.value||optionLabel)||`option_${index+1}`
  return {value:optionValue,label:optionLabel||label(optionValue)}
}).filter(o=>o.value&&o.label)
const normalizeFieldDefinitions=fields=>{
  const seen=new Set()
  return (Array.isArray(fields) ? fields : []).map((field,index)=>{
    const fieldLabel=text(field?.label)
    const id=fieldId(field?.id||field?.key||fieldLabel)||`field_${index+1}`
    const type=FIELD_TYPES.includes(field?.type) ? field.type : 'text'
    return {
      id,label:fieldLabel||label(id),type,required:Boolean(field?.required),placeholder:text(field?.placeholder),help_text:text(field?.help_text||field?.helper),
      brand_codes:Array.isArray(field?.brand_codes) ? field.brand_codes.map(fieldId).filter(Boolean) : [],
      options:type==='select' ? normalizeFieldOptions(field?.options) : [],sort_order:Number(field?.sort_order ?? index),is_active:field?.is_active===undefined ? true : Boolean(field.is_active)
    }
  }).filter(f=>{ if(!f.id||!f.label||seen.has(f.id))return false; seen.add(f.id); return true }).sort((a,b)=>a.sort_order-b.sort_order)
}
const activeFormFields=brandCode=>state.bookingFormFields.filter(f=>f.is_active!==false&&(!f.brand_codes.length||f.brand_codes.includes(fieldId(brandCode))))
const renderCustomField=(field,value='')=>{
  const name=attr(`custom_${field.id}`)
  const req=field.required ? 'required' : ''
  const helper=field.help_text ? `<small class="field-hint">${esc(field.help_text)}</small>` : ''
  const cls=field.type==='textarea'||field.type==='checkbox' ? 'booking-field-full' : 'booking-field'
  const star=field.required ? ' *' : ''
  if(field.type==='textarea')return `<label class="${cls}" data-booking-custom-field="${attr(field.id)}"><span>${esc(field.label)}${star}</span><textarea name="${name}" rows="3" placeholder="${attr(field.placeholder)}" ${req}>${esc(value||'')}</textarea>${helper}</label>`
  if(field.type==='select')return `<label class="${cls}" data-booking-custom-field="${attr(field.id)}"><span>${esc(field.label)}${star}</span><select name="${name}" ${req}><option value="">Choose ${esc(field.label)}</option>${field.options.map(o=>`<option value="${attr(o.value)}" ${String(o.value)===String(value||'') ? 'selected' : ''}>${esc(o.label)}</option>`).join('')}</select>${helper}</label>`
  if(field.type==='checkbox')return `<label class="${cls} inline-check" data-booking-custom-field="${attr(field.id)}"><input name="${name}" type="checkbox" ${value===true||String(value)==='true' ? 'checked' : ''} ${req}><span>${esc(field.label)}${star}</span></label>`
  return `<label class="${cls}" data-booking-custom-field="${attr(field.id)}"><span>${esc(field.label)}${star}</span><input name="${name}" type="${attr(field.type)}" value="${attr(value||'')}" placeholder="${attr(field.placeholder)}" ${req}>${helper}</label>`
}
const renderBookingCustomFields=(booking=null,existing=null)=>{
  const brandCode=nodes.bookingBrand.value||booking?.brand_code||state.brands[0]?.code||shared.readConfig().brandCode
  const values=existing||record(meta(booking).custom_fields)
  const fields=activeFormFields(brandCode)
  nodes.bookingCustomFields.innerHTML=fields.map(f=>renderCustomField(f,values[f.id])).join('')
  nodes.bookingCustomFields.hidden=fields.length===0
}
const collectCustomFields=()=>{
  const values={}
  nodes.bookingCustomFields.querySelectorAll('[data-booking-custom-field]').forEach(wrap=>{
    const input=wrap.querySelector('input,select,textarea')
    if(input)values[wrap.dataset.bookingCustomField]=input.type==='checkbox' ? input.checked : input.value.trim()
  })
  return values
}

// Reference generation: <BRAND>-<yymmdd>-<8 random chars>, unique among loaded bookings.
const normalizeReference=value=>text(value).replace(/\s+/g,'-').replace(/[^A-Z0-9-]/gi,'').toUpperCase()
const brandPrefix=code=>{
  const brand=state.brands.find(b=>String(b.code||'')===String(code||''))
  const fallback=lower(code)==='iventure' ? 'IV' : (shared.readConfig().bookingPrefix||'TT')
  return normalizeReference(brand?.booking_prefix||brand?.bookingPrefix||fallback).replace(/-/g,'').slice(0,8)||'TT'
}
const entropy=()=>globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase() : `${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-4)}`.slice(0,8).toUpperCase()
const newReference=code=>{
  for(let attempt=0;attempt<12;attempt+=1){
    const ref=`${brandPrefix(code)}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${entropy()}`
    if(!state.bookings.some(b=>normalizeReference(b.reference)===ref))return ref
  }
  return `${brandPrefix(code)}-${new Date().toISOString().slice(2,10).replace(/-/g,'')}-${entropy()}`
}
const syncReference=({booking=null,brandCode='',forceNew=false}={})=>{
  const code=brandCode||booking?.brand_code||nodes.bookingBrand.value||shared.readConfig().brandCode||state.brands[0]?.code||''
  const existing=normalizeReference(booking?.reference)
  nodes.bookingReference.value=forceNew||!existing ? newReference(code) : existing
}

const personRow=(value='')=>{
  const row=document.createElement('div')
  row.className='adm-person-row'
  row.innerHTML=`<input type="text" placeholder="Full name" value="${attr(value)}" data-person-name><button type="button" class="adm-remove" data-person-remove aria-label="Remove">×</button>`
  row.querySelector('[data-person-remove]').addEventListener('click',()=>row.remove())
  return row
}
const renderPersonRows=(list,names=[])=>{ list.innerHTML=''; (names.length ? names : ['']).forEach(n=>list.appendChild(personRow(n))) }
const personNames=list=>Array.from(list.querySelectorAll('[data-person-name]')).map(i=>i.value.trim()).filter(Boolean)
const splitNames=value=>String(value||'').split(/[,;]+/).map(s=>s.trim()).filter(Boolean)
const pickupMode=()=>nodes.bookingSelfDrive.checked ? 'self_drive' : nodes.bookingTransfer.checked ? 'transfer' : ''

const paymentRow=()=>{
  const row=document.createElement('div')
  row.className='booking-payment-row'
  row.style.cssText='display:flex;flex-wrap:wrap;gap:8px;align-items:center;border:1px solid var(--line);border-radius:9px;padding:10px'
  row.innerHTML=`
    <select data-pay-type style="flex:1;min-width:140px"><option value="eft">EFT / Bank Transfer</option><option value="card">Card Machine</option><option value="cash">Cash</option><option value="voucher">Voucher</option><option value="other">Other</option></select>
    <input type="number" min="0.01" step="0.01" placeholder="Amount" data-pay-amount style="flex:1;min-width:110px">
    <input type="text" placeholder="Reference (optional)" data-pay-reference style="flex:1;min-width:140px">
    <input type="text" placeholder="Terminal serial" data-pay-terminal hidden style="flex:1;min-width:120px">
    <input type="text" placeholder="Batch number" data-pay-batch hidden style="flex:1;min-width:120px">
    <button type="button" class="adm-remove" data-pay-remove aria-label="Remove payment">×</button>`
  const typeEl=row.querySelector('[data-pay-type]')
  const syncCard=()=>{ const isCard=typeEl.value==='card'; row.querySelector('[data-pay-terminal]').hidden=!isCard; row.querySelector('[data-pay-batch]').hidden=!isCard }
  typeEl.addEventListener('change',syncCard)
  row.querySelector('[data-pay-remove]').addEventListener('click',()=>row.remove())
  return row
}
const paymentRows=()=>Array.from(nodes.bookingPaymentRowsList.querySelectorAll('.booking-payment-row')).map(row=>({
  payment_type:row.querySelector('[data-pay-type]').value||'eft',amount:Number(row.querySelector('[data-pay-amount]').value||0),
  provider_reference:row.querySelector('[data-pay-reference]').value.trim(),terminal_serial_number:row.querySelector('[data-pay-terminal]').value.trim(),batch_number:row.querySelector('[data-pay-batch]').value.trim()
})).filter(r=>r.amount>0)

const syncDepartureFields=(serviceSlug='',selectedLabel='',selectedPickup='')=>{
  const service=state.services.find(s=>s.slug===serviceSlug)
  const times=Array.isArray(service?.departure_times) ? service.departure_times.filter(t=>t.label||t.time) : []
  if(!times.length){ nodes.bookingDepartureWrap.hidden=true; nodes.bookingPickupWrap.hidden=true; return }
  nodes.bookingDeparture.innerHTML=`<option value="">Any / TBC</option>${times.map(t=>`<option value="${attr(t.label)}" data-pickup="${attr(t.pickup_time||'')}">${esc(t.label)}${t.time ? ` · ${esc(t.time)}` : ''}${t.pickup_time ? ` (pickup ${esc(t.pickup_time)})` : ''}</option>`).join('')}`
  nodes.bookingDeparture.value=selectedLabel||''
  const matched=times.find(t=>t.label===nodes.bookingDeparture.value)
  const pickup=selectedPickup||matched?.pickup_time||''
  nodes.bookingPickup.value=pickup
  nodes.bookingPickupWrap.hidden=!pickup
  nodes.bookingDepartureWrap.hidden=false
}
const updateOverrideTag=()=>{ nodes.bookingOverrideTagRow.hidden=!(Number(nodes.bookingPriceOverride.value||0)>0) }
const updatePricePreview=()=>{
  updateOverrideTag()
  const service=state.services.find(s=>s.slug===nodes.bookingService.value)
  if(!service){ nodes.bookingPriceBreakdown.textContent='Select a tour to see the calculated price'; nodes.bookingPriceTotal.textContent=''; return }
  const adults=Math.max(0,Number(nodes.bookingAdultQuantity.value||0)), children=Math.max(0,Number(nodes.bookingChildQuantity.value||0)), infants=Math.max(0,Number(nodes.bookingInfantQuantity.value||0))
  const total=adults+children+infants
  if(!total){ nodes.bookingPriceBreakdown.textContent='Add guests to see the price'; nodes.bookingPriceTotal.textContent=''; return }
  const pricing=shared.calculatePricing(service,{adult_quantity:adults,child_quantity:children,quantity:Math.max(1,total),addons:[]})
  const currency=service.currency||state.settings.currency||'NAD'
  const lines=[]
  if(service.adult_price!=null&&Number(service.adult_price)>0){
    if(adults>0)lines.push(`${adults} adult${adults!==1?'s':''} × ${money(service.adult_price,currency)}`)
    if(children>0)lines.push(`${children} child${children!==1?'ren':''} (4–12) × ${money(service.child_price||0,currency)}`)
  }else lines.push(`${total} guest${total!==1?'s':''} × ${money(service.base_price||0,currency)}`)
  if(infants>0)lines.push(`${infants} under 4 — complimentary`)
  nodes.bookingPriceBreakdown.textContent=lines.join(' · ')
  nodes.bookingPriceTotal.textContent=money(pricing.total_amount,currency)
}
const renderFormOptions=()=>{
  const serviceOptions=state.services.map(s=>`<option value="${attr(s.slug)}">${esc(s.name)}${s.is_active===false ? ' (hidden)' : ''}</option>`).join('')
  nodes.bookingService.innerHTML=`<option value="">Choose service</option>${serviceOptions}`
  const currentFilterService=nodes.bookingFilterService.value
  nodes.bookingFilterService.innerHTML=`<option value="">All tours</option>${serviceOptions}`
  nodes.bookingFilterService.value=currentFilterService
  const brandOptions=state.brands.map(b=>`<option value="${attr(b.code)}">${esc(b.name)}</option>`).join('')
  const currentBrand=nodes.bookingBrand.value
  nodes.bookingBrand.innerHTML=`<option value="">Choose brand</option>${brandOptions}`
  nodes.bookingBrand.value=currentBrand||shared.readConfig().brandCode||state.brands[0]?.code||''
  const currentFilterBrand=nodes.bookingFilterBrand.value
  nodes.bookingFilterBrand.innerHTML=`<option value="">All brands</option>${brandOptions}`
  nodes.bookingFilterBrand.value=currentFilterBrand
  const uniq=values=>[...new Set(values.map(text).filter(Boolean))].sort((a,b)=>a.localeCompare(b))
  nodes.bookedByDatalist.innerHTML=uniq(state.bookings.map(b=>meta(b).booked_by)).map(v=>`<option value="${attr(v)}">`).join('')
  nodes.agentDatalist.innerHTML=uniq(state.bookings.map(b=>meta(b).agent)).map(v=>`<option value="${attr(v)}">`).join('')
}
const fillBookingForm=(booking=null)=>{
  const m=meta(booking)
  const brandCode=booking?.brand_code||shared.readConfig().brandCode||state.brands[0]?.code||''
  nodes.bookingBrand.value=brandCode
  syncReference({booking,brandCode,forceNew:!booking})
  nodes.bookingSource.value=booking?.source||'website'
  nodes.bookingService.value=booking?.service_slug||''
  nodes.bookingStatus.value=booking?.status||'finalised'
  nodes.bookingPaymentStatus.value=String(booking?.payment_status||'')
  nodes.bookingPaymentRowsList.innerHTML=''
  nodes.bookingDate.value=booking?.preferred_date ? dateKey(booking.preferred_date) : ''
  syncDepartureFields(booking?.service_slug||'',m.departure_label||'',m.pickup_time||'')
  nodes.bookingQuantity.value=booking?.quantity||2
  const adults=Number(booking?.adult_quantity||0), children=Number(booking?.child_quantity||0), infants=Number(booking?.infant_quantity||m.infant_quantity||0), total=Number(booking?.quantity||0)
  // A legacy booking may carry only a head count; infer adults as the remainder so an under-4 is never charged as an adult.
  const resolvedAdults=(adults<=0&&children<=0&&total>0) ? Math.max(0,total-children-infants) : adults
  nodes.bookingAdultQuantity.value=String(resolvedAdults>0||children>0||infants>0 ? resolvedAdults : (total||2))
  nodes.bookingChildQuantity.value=String(children)
  nodes.bookingInfantQuantity.value=String(infants)
  nodes.bookingCustomerName.value=booking?.customer_name||''
  nodes.bookingCustomerEmail.value=booking?.customer_email||''
  nodes.bookingCustomerPhone.value=booking?.customer_phone||''
  renderPersonRows(nodes.bookingGuideList,splitNames(m.guide_name||booking?.guide_name||''))
  renderPersonRows(nodes.bookingSkipperList,splitNames(m.skipper_name||''))
  nodes.bookingNationality.value=m.nationality||booking?.nationality||''
  nodes.bookingBookedBy.value=m.booked_by||booking?.booked_by||''
  nodes.bookingDietary.value=m.dietary_requirements||m.dietary||''
  nodes.bookingAgent.value=m.agent||''
  nodes.bookingSelfDrive.checked=m.pickup_mode==='self_drive'
  nodes.bookingTransfer.checked=m.pickup_mode==='transfer'
  renderBookingCustomFields(booking)
  nodes.bookingNotes.value=booking?.notes||booking?.customer_notes||''
  const override=booking?.price_override ?? m.price_override ?? ''
  nodes.bookingPriceOverride.value=Number(override)>0 ? String(override) : ''
  nodes.bookingSaveButton.textContent=booking ? 'Save changes' : 'Create booking'
  updatePricePreview()
}
const openBookingModal=(booking=null,{date=''}={})=>{
  state.editingBookingId=booking?.id||''
  fillBookingForm(booking)
  if(!booking&&date)nodes.bookingDate.value=date
  nodes.bookingModalTitle.textContent=booking ? (isReservation(booking) ? 'Edit reservation' : 'Edit booking') : 'Create booking'
  nodes.bookingModalSubtitle.textContent=booking ? `${booking.reference} · saving keeps its current status.` : 'Manual bookings are saved as finalised straight away.'
  setModal(nodes.bookingModal,true)
  window.setTimeout(()=>nodes.bookingCustomerName.focus(),60)
}
const closeBookingModal=()=>{ state.editingBookingId=''; setModal(nodes.bookingModal,false) }

const validateBookingForm=isEditing=>{
  const errors=[]
  if(!isEditing||nodes.bookingStatus.value==='provisional')return errors
  if(!nodes.bookingBrand.value)errors.push('Select a brand (True Travel or Iventure).')
  if(!nodes.bookingService.value)errors.push('Select a tour.')
  if(!nodes.bookingCustomerName.value.trim())errors.push('Guest name is required.')
  if(!nodes.bookingDate.value)errors.push('A tour date is required.')
  const email=nodes.bookingCustomerEmail.value.trim()
  if(email&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.toLowerCase()))errors.push('Enter a valid email address.')
  const phone=nodes.bookingCustomerPhone.value.trim()
  if(phone&&phone.replace(/[^\d+]/g,'').length<7)errors.push('Enter a valid phone or WhatsApp number.')
  return errors
}
const saveBooking=async()=>{
  const editingId=state.editingBookingId
  const isEditing=Boolean(editingId)
  const existing=isEditing ? bookingById(editingId) : null
  if(isEditing&&!existing)throw new Error('The booking being edited could not be found. Refresh and try again.')
  const errors=validateBookingForm(isEditing)
  if(errors.length){ toast(errors.join(' '),'error'); return }
  if(!isEditing){
    const email=lower(nodes.bookingCustomerEmail.value), slug=nodes.bookingService.value, date=nodes.bookingDate.value
    const dup=email&&slug&&date&&state.bookings.find(b=>lower(b.customer_email)===email&&(b.service_slug||'')===slug&&dateKey(b.preferred_date)===date&&b.status!=='cancelled')
    if(dup&&!window.confirm(`A booking already exists for ${email} on ${date} for this tour (Ref: ${dup.reference}). Save anyway?`))return
  }
  const adults=Number(nodes.bookingAdultQuantity.value||0), children=Number(nodes.bookingChildQuantity.value||0), infants=Number(nodes.bookingInfantQuantity.value||0)
  const wasReservation=existing ? isReservation(existing) : false
  const payload={
    reference:nodes.bookingReference.value.trim(),
    brand_code:nodes.bookingBrand.value||shared.readConfig().brandCode||'true-travel',
    source:nodes.bookingSource.value||'website',
    service_slug:nodes.bookingService.value,
    // A reservation being edited stays provisional until it is approved; new manual bookings are finalised.
    status:wasReservation ? 'provisional' : (nodes.bookingStatus.value||'finalised'),
    payment_status:isEditing ? nodes.bookingPaymentStatus.value : '',
    preferred_date:nodes.bookingDate.value,
    adult_quantity:adults,child_quantity:children,infant_quantity:infants,
    quantity:(adults+children+infants)>0 ? adults+children+infants : Number(nodes.bookingQuantity.value||1),
    price_override:Number(nodes.bookingPriceOverride.value||0)||0,
    guide_name:personNames(nodes.bookingGuideList).join(', '),
    notes:nodes.bookingNotes.value.trim(),
    metadata:{
      ...meta(existing),
      custom_fields:collectCustomFields(),departure_label:nodes.bookingDeparture.value||'',pickup_time:nodes.bookingPickup.value||'',
      nationality:nodes.bookingNationality.value.trim(),booked_by:nodes.bookingBookedBy.value.trim(),agent:nodes.bookingAgent.value.trim(),
      dietary_requirements:nodes.bookingDietary.value.trim(),skipper_name:personNames(nodes.bookingSkipperList).join(', '),pickup_mode:pickupMode(),
      infant_quantity:infants,price_override:Number(nodes.bookingPriceOverride.value||0)||0,
      ...(wasReservation ? {} : {admin_created:true,created_via:'skybook_admin'})
    },
    customer:{full_name:nodes.bookingCustomerName.value.trim(),email:nodes.bookingCustomerEmail.value.trim(),phone:nodes.bookingCustomerPhone.value.trim(),whatsapp:nodes.bookingCustomerPhone.value.trim()}
  }
  if(isEditing)payload.workflow_action='admin_edit'
  const response=await api(isEditing ? `admin/bookings/${encodeURIComponent(editingId)}` : 'admin/bookings',{method:isEditing ? 'PATCH' : 'POST',body:payload})
  const savedId=text(response?.booking?.id)||text(response?.id)||editingId
  await loadData()
  // Split-payment rows post against the real, priced booking once it exists.
  const rows=paymentRows()
  const failures=[]
  let loaded=0
  for(const row of rows){
    if(row.payment_type==='card'&&(!row.terminal_serial_number||!row.batch_number)){ failures.push('Card payment skipped (terminal serial + batch number required).'); continue }
    try{ await api(`admin/bookings/${encodeURIComponent(savedId)}/payments`,{method:'POST',body:{...row,notes:'',allow_overpayment:false}}); loaded+=1 }
    catch(error){ failures.push(error?.message||'Payment failed.') }
  }
  if(loaded)await loadData()
  renderAll()
  closeBookingModal()
  const saved=bookingById(savedId)
  const summary=`${isEditing ? 'Booking updated' : 'Booking created'}${saved ? ` · ${saved.reference}` : ''}${loaded ? ` · ${loaded} payment${loaded===1?'':'s'} recorded` : ''}`
  notify(summary)
  if(failures.length)toast(`Some payments were not recorded: ${failures.join(' ')}`,'error')
  if(saved){ if(isReservation(saved))openReservation(saved.id); else openBooking(saved.id) }
}

/* ── Cruise liner (group bookings for Akron / ATC) ───────────────────── */
const cruiseField=id=>document.getElementById(id)
const updateCruisePaxPerCar=()=>{
  const pax=Number(cruiseField('cruisePax').value||0), cars=Number(cruiseField('cruiseCars').value||0)
  cruiseField('cruisePaxPerCarValue').textContent=cars>0 ? String(Math.ceil(pax/cars)) : '—'
}
const openCruiseModal=(dateKey='')=>{
  nodes.cruiseForm.reset()
  cruiseField('cruiseDate').value=dateKey||todayKey()
  cruiseField('cruisePax').value='1'; cruiseField('cruiseBoats').value='1'; cruiseField('cruiseBuses').value='0'; cruiseField('cruiseCars').value='0'
  cruiseField('cruiseBoatsField').hidden=true
  updateCruisePaxPerCar()
  setModal(nodes.cruiseModal,true)
}
const saveCruiseBooking=async()=>{
  const company=cruiseField('cruiseCompany').value, date=cruiseField('cruiseDate').value, time=cruiseField('cruiseTime').value.trim()
  const pax=Math.max(1,Number(cruiseField('cruisePax').value||1)), buses=Number(cruiseField('cruiseBuses').value||0), cars=Number(cruiseField('cruiseCars').value||0), boats=Number(cruiseField('cruiseBoats').value||0)
  const bookingType=cruiseField('cruiseBookingType').value||'pax', paxPerCar=cars>0 ? Math.ceil(pax/cars) : 0
  const typeLabel=cruiseField('cruiseType').value.trim(), notes=cruiseField('cruiseNotes').value.trim()
  if(!company)throw new Error('Select a cruise company (Akron or ATC).')
  if(!date)throw new Error('Select a date.')
  const companyLabel=company==='akron' ? 'Akron' : 'ATC'
  const tourName=typeLabel ? `${typeLabel} — ${companyLabel} Cruise Liner` : `${companyLabel} Cruise Liner Transfer`
  const serviceSlug=state.services.find(s=>s.is_active!==false)?.slug||''
  if(!serviceSlug)throw new Error('No tours loaded — add a tour first.')
  const noteParts=[tourName,`PAX: ${pax}`,`Buses: ${buses} | Cars: ${cars}${paxPerCar>0 ? ` (${paxPerCar} PAX/car)` : ''}`,bookingType==='full_boat' ? `Boats: ${boats}` : '',time ? `Time: ${time}` : '',notes].filter(Boolean)
  await api('admin/bookings',{method:'POST',body:{
    brand_code:shared.readConfig().brandCode||'true-travel',service_slug:serviceSlug,status:'finalised',payment_status:'invoiced',total_amount:0,preferred_date:date,
    quantity:pax,adult_quantity:pax,child_quantity:0,infant_quantity:0,source:'admin',notes:noteParts.join('\n'),
    metadata:{cruise_liner:true,cruise_company:company,cruise_company_label:companyLabel,booking_type:bookingType,buses,cars,boats:bookingType==='full_boat' ? boats : 0,pax,pax_per_car:paxPerCar,time,type:typeLabel,display_name:tourName,pickup_time:time},
    customer:{full_name:`${companyLabel} Group`,email:'',phone:'',whatsapp:''}
  }})
  setModal(nodes.cruiseModal,false)
  await refresh(`Cruise liner booking created for ${companyLabel} on ${fmtDate(date)}.`)
}

/* ── Tours (services) ────────────────────────────────────────────────── */
const serviceBrands=service=>{
  const codes=Array.isArray(service?.brand_codes) ? service.brand_codes : (Array.isArray(record(service?.metadata).brand_codes) ? record(service.metadata).brand_codes : [])
  const normalized=codes.map(lower).filter(Boolean)
  return normalized.length ? normalized : ['true-travel','iventure']
}
const serviceVisibility=service=>{
  const codes=serviceBrands(service)
  const both=codes.includes('true-travel')&&codes.includes('iventure')
  return `${service.is_active===false ? tag('inactive','Hidden') : tag('active','Active')} <span class="adm-muted">${both ? 'Both sites' : codes.map(brandName).join(', ')}</span>`
}
const filteredServices=()=>{
  const filter=lower(nodes.serviceFilterBrand.value)
  return state.services.filter(s=>{
    const codes=serviceBrands(s)
    if(filter==='shared')return codes.includes('true-travel')&&codes.includes('iventure')
    if(filter)return codes.includes(filter)
    return true
  }).sort((a,b)=>a.name.localeCompare(b.name))
}
const renderServices=()=>{
  const rows=filteredServices()
  nodes.servicesSummary.textContent=`${state.services.filter(s=>s.is_active!==false).length} active tours · shared catalogue for True Travel and Iventure.`
  nodes.servicesTable.innerHTML=rows.map(s=>`<tr class="is-clickable" data-open-service="${attr(s.id)}">
    <td><strong>${esc(s.name)}</strong><span class="sub">${esc(s.duration_label||'')}${s.pricing_mode==='quote'||record(s.metadata).is_quote_only ? ' · quote only' : ''}</span></td>
    <td>${esc(label(String(s.category_slug||'').replace(/-/g,' ')))}</td>
    <td class="num">${s.adult_price!=null&&Number(s.adult_price)>0 ? `${money(s.adult_price,s.currency)}<span class="sub">child ${money(s.child_price||0,s.currency)}</span>` : money(s.base_price,s.currency)}</td>
    <td class="num">${esc(String(s.minimum_pax||1))}</td>
    <td>${esc((s.departure_times||[]).map(t=>[t.label,t.time].filter(Boolean).join(' ')).join(', ')||'—')}</td>
    <td>${serviceVisibility(s)}</td>
    <td class="actions"><button class="adm-btn ghost small" type="button" data-open-service="${attr(s.id)}">Edit</button></td>
  </tr>`).join('')||emptyRow(7,'No tours match this filter.')
}
const departureRow=(labelText='',time='',pickup='')=>{
  const row=document.createElement('div')
  row.className='adm-person-row'
  row.style.flexWrap='wrap'
  row.innerHTML=`<input type="text" placeholder="Label (e.g. AM)" value="${attr(labelText)}" data-dep-label style="min-width:110px"><input type="time" value="${attr(time)}" data-dep-time style="min-width:120px"><input type="text" placeholder="Pickup time (e.g. 07:30 or TBC)" value="${attr(pickup)}" data-dep-pickup style="flex:2;min-width:160px"><button type="button" class="adm-remove" data-dep-remove aria-label="Remove pickup time">×</button>`
  row.querySelector('[data-dep-remove]').addEventListener('click',()=>row.remove())
  return row
}
const departureTimes=()=>Array.from(nodes.serviceDepartureTimesList.querySelectorAll('.adm-person-row')).map(row=>({
  label:row.querySelector('[data-dep-label]').value.trim(),time:row.querySelector('[data-dep-time]').value.trim(),pickup_time:row.querySelector('[data-dep-pickup]').value.trim()
})).filter(t=>t.label||t.time)
const serviceImageUrls=()=>nodes.serviceLandscapeImages.value.split(/\r?\n/).map(s=>s.trim()).filter(Boolean)
const renderServiceImages=urls=>{
  nodes.serviceLandscapeImages.value=urls.join('\n')
  nodes.serviceImagePreviews.innerHTML=urls.map((url,i)=>`<div><img src="${attr(url)}" alt=""><button type="button" data-img-remove="${i}" aria-label="Remove image">×</button></div>`).join('')
  nodes.serviceImagePreviews.querySelectorAll('[data-img-remove]').forEach(btn=>btn.addEventListener('click',()=>renderServiceImages(serviceImageUrls().filter((_,i)=>i!==Number(btn.dataset.imgRemove)))))
}
const uploadServiceImages=async files=>{
  const list=[...files].filter(f=>f.type.startsWith('image/'))
  if(!list.length)return
  const zone=nodes.serviceImageDropZone
  const original=zone.innerHTML
  zone.style.pointerEvents='none'
  try{
    for(let i=0;i<list.length;i+=1){
      zone.textContent=`Uploading ${i+1} of ${list.length}…`
      const form=new FormData()
      form.append('file',list[i])
      const result=await api('admin/service-images',{method:'POST',rawBody:form})
      if(result?.url)renderServiceImages([...serviceImageUrls(),result.url])
    }
    notify(`${list.length} image${list.length===1?'':'s'} uploaded.`)
  }catch(error){ fail(error) }
  finally{ zone.style.pointerEvents=''; zone.innerHTML=original; wireDropZone() }
}
const wireDropZone=()=>{
  const zone=nodes.serviceImageDropZone
  const input=zone.querySelector('input[type=file]')||nodes.serviceImageInput
  zone.onclick=()=>input?.click()
  if(input)input.onchange=()=>{ uploadServiceImages(input.files); input.value='' }
  zone.ondragover=e=>{ e.preventDefault(); zone.style.borderColor='var(--blue)' }
  zone.ondragleave=()=>{ zone.style.borderColor='' }
  zone.ondrop=e=>{ e.preventDefault(); zone.style.borderColor=''; uploadServiceImages(e.dataTransfer.files) }
}
const fillServiceForm=(service=null)=>{
  const codes=serviceBrands(service)
  nodes.serviceId.value=service?.id||''
  nodes.serviceSlug.value=service?.slug||''
  nodes.serviceName.value=service?.name||''
  nodes.serviceCategory.value=service?.category_slug||'coastal-tours'
  nodes.servicePricingMode.value=service?.pricing_mode||'fixed'
  nodes.servicePrice.value=service?.base_price||''
  nodes.serviceAdultPrice.value=service?.adult_price||''
  nodes.serviceChildPrice.value=service?.child_price||''
  nodes.serviceQuoteOnly.checked=Boolean(record(service?.metadata).is_quote_only)
  nodes.serviceDuration.value=service?.duration_label||''
  nodes.serviceMinPax.value=service?.minimum_pax||1
  nodes.serviceDepartureTimesList.innerHTML=''
  ;(Array.isArray(service?.departure_times) ? service.departure_times : []).forEach(t=>nodes.serviceDepartureTimesList.appendChild(departureRow(t.label||'',t.time||'',t.pickup_time||service?.pickup_time||'')))
  nodes.servicePickupTime.value=service?.pickup_time||''
  nodes.serviceSummary.value=service?.short_description||''
  nodes.serviceLearnMoreDescription.value=service?.full_description||service?.short_description||''
  renderServiceImages((service?.media_gallery||[]).map(i=>text(i?.url)).filter(Boolean))
  nodes.serviceBrandTrueTravel.checked=codes.includes('true-travel')
  nodes.serviceBrandIventure.checked=codes.includes('iventure')
  nodes.serviceActive.checked=service?.is_active!==false
  nodes.deleteService.hidden=!service
}
const openServiceModal=(service=null)=>{
  state.selectedServiceId=service?.id||''
  fillServiceForm(service)
  nodes.serviceModalTitle.textContent=service ? `Edit ${service.name}` : 'Add tour'
  setModal(nodes.serviceModal,true)
  window.setTimeout(()=>nodes.serviceName.focus(),60)
}
const closeServiceModal=()=>{ state.selectedServiceId=''; setModal(nodes.serviceModal,false) }
const saveService=async()=>{
  const errors=[]
  if(!nodes.serviceName.value.trim())errors.push('Tour name is required.')
  if(!nodes.serviceSummary.value.trim())errors.push('A summary is required — it is shown on the booking site.')
  if(!nodes.serviceQuoteOnly.checked&&Number(nodes.servicePrice.value||0)<=0)errors.push('Enter a price, or tick "Quote request only".')
  const brandCodes=[nodes.serviceBrandTrueTravel.checked ? 'true-travel' : '',nodes.serviceBrandIventure.checked ? 'iventure' : ''].filter(Boolean)
  if(!brandCodes.length)errors.push('Select at least one brand.')
  if(errors.length){ toast(errors.join(' '),'error'); return }
  const payload={
    id:nodes.serviceId.value.trim(),slug:nodes.serviceSlug.value.trim(),name:nodes.serviceName.value.trim(),category_slug:nodes.serviceCategory.value,
    pricing_mode:nodes.servicePricingMode.value||'fixed',base_price:Number(nodes.servicePrice.value||0),
    adult_price:nodes.serviceAdultPrice.value ? Number(nodes.serviceAdultPrice.value) : null,child_price:nodes.serviceChildPrice.value ? Number(nodes.serviceChildPrice.value) : null,
    preferred_date_mode:'required',is_quote_only:nodes.serviceQuoteOnly.checked,duration_label:nodes.serviceDuration.value.trim(),
    minimum_pax:Math.max(1,Number(nodes.serviceMinPax.value||1)||1),departure_times:departureTimes(),pickup_time:nodes.servicePickupTime.value.trim(),
    short_description:nodes.serviceSummary.value.trim(),full_description:nodes.serviceLearnMoreDescription.value.trim()||nodes.serviceSummary.value.trim(),
    highlight_points:[],media_urls:serviceImageUrls(),brand_codes:brandCodes,is_active:nodes.serviceActive.checked
  }
  await api(payload.id ? `admin/services/${encodeURIComponent(payload.id)}` : 'admin/services',{method:payload.id ? 'PATCH' : 'POST',body:payload})
  closeServiceModal()
  await refresh(payload.id ? `Tour updated: ${payload.name}` : `Tour created: ${payload.name}`)
}
const deleteService=async()=>{
  const service=state.services.find(s=>s.id===state.selectedServiceId)
  if(!service)return
  const hasBookings=state.bookings.some(b=>b.service_slug===service.slug||b.service_id===service.id)
  if(!window.confirm(`Delete "${service.name}"? This cannot be undone.${hasBookings ? '\n\nThis tour has bookings; they are kept.' : ''}`))return
  await api(`admin/services/${encodeURIComponent(service.id)}`,{method:'DELETE'})
  closeServiceModal()
  await refresh(`Tour deleted: ${service.name}`)
}

/* ── Users ───────────────────────────────────────────────────────────── */
const renderPermissionEditor=(perms={},role='booking_agent')=>{
  const defaults=state.roleDefaults?.[role]||{}
  nodes.adminUserPermissions.innerHTML=state.permissionCatalog.map(item=>`<article class="permission-card"><label><input type="checkbox" data-permission-key="${attr(item.key)}" ${(perms?.[item.key] ?? defaults[item.key])===true ? 'checked' : ''}><span>${esc(item.label)}</span></label><small>${esc(item.description)}</small></article>`).join('')
}
const fillUserForm=(user=null)=>{
  nodes.adminUserId.value=user?.id||''
  nodes.adminUserUsername.value=user?.username||String(user?.email||'').split('@')[0]||''
  nodes.adminUserPassword.value=''
  nodes.adminUserFullName.value=user?.full_name||''
  nodes.adminUserRole.value=user?.role||'booking_agent'
  if(!nodes.adminUserRole.value)nodes.adminUserRole.value='booking_agent'
  nodes.adminUserActive.checked=user?.is_active!==false
  renderPermissionEditor(user?.permissions||{},nodes.adminUserRole.value)
  nodes.adminUserFormTitle.textContent=user ? `Edit ${user.full_name||user.username||'user'}` : 'Add a user'
  nodes.adminUserSaveButton.textContent=user ? 'Save changes' : 'Create user'
  nodes.adminUserPassword.placeholder=user ? 'Leave blank to keep the current password' : 'Required for new users'
}
const renderUsers=()=>{
  nodes.adminUsersTable.innerHTML=state.adminUsers.map(u=>`<tr class="is-clickable${u.id===nodes.adminUserId.value ? ' is-selected' : ''}" data-open-user="${attr(u.id)}">
    <td><strong>${esc(u.full_name||'')}</strong><span class="sub">${esc(u.last_sign_in_at ? `Last sign-in ${fmtDateTime(u.last_sign_in_at)}` : 'No sign-in yet')}</span></td>
    <td>${esc(u.username||String(u.email||'').split('@')[0]||'')}</td>
    <td>${esc(label(u.role||''))}</td>
    <td>${u.is_active ? tag('active','Active') : tag('inactive','Inactive')}</td>
  </tr>`).join('')||emptyRow(4,'No users loaded.')
}
const saveUser=async()=>{
  const permissions={}
  nodes.adminUserPermissions.querySelectorAll('[data-permission-key]').forEach(cb=>{ permissions[cb.dataset.permissionKey]=cb.checked })
  const payload={
    id:nodes.adminUserId.value.trim(),username:nodes.adminUserUsername.value.trim(),password:nodes.adminUserPassword.value.trim(),
    full_name:nodes.adminUserFullName.value.trim(),role:nodes.adminUserRole.value,is_active:nodes.adminUserActive.checked,permissions
  }
  if(!payload.username)throw new Error('Username is required.')
  if(!payload.id&&!payload.password)throw new Error('A password is required for a new user.')
  await api(payload.id ? `admin/users/${encodeURIComponent(payload.id)}` : 'admin/users',{method:payload.id ? 'PATCH' : 'POST',body:payload})
  fillUserForm(null)
  await refresh(payload.id ? 'User updated.' : 'User created.')
}

/* ── Reports (the five workbench reports, unchanged rules) ───────────── */
const isCancelledFinancial=b=>['cancelled','refunded'].includes(lower(b?.status))||lower(b?.payment_status)==='cancelled'
const financeBookings=rows=>rows.filter(b=>!isCancelledFinancial(b))
const reportPaymentRows=(bookings=[])=>{
  const ids=new Set(bookings.map(b=>String(b.id||'')))
  const rows=new Map()
  const add=(method,amount,count=1)=>{
    const key=paymentMethodLabel(method)
    const current=rows.get(key)||{method:key,count:0,amount:0}
    current.count+=count; current.amount+=Number(amount||0)
    rows.set(key,current)
  }
  state.paymentTransactions.forEach(t=>{
    const payment=state.payments.find(p=>p.id===t.payment_id)
    if(!payment||!ids.has(String(payment.booking_id||'')))return
    if(!['paid','captured','succeeded','manual_payment'].includes(lower(t.status||t.transaction_type)))return
    add(record(t.raw_payload).payment_type||payment.payment_type||payment.provider,t.amount)
  })
  if(!rows.size)state.payments.forEach(p=>{
    if(!ids.has(String(p.booking_id||'')))return
    if(!['paid','partially_paid'].includes(lower(p.status)))return
    add(p.payment_type||p.provider,Number(p.amount_received||p.amount||0))
  })
  return [...rows.values()].sort((a,b)=>b.amount-a.amount)
}
const barChart=(items,{currency=null,maxBars=8}={})=>{
  const top=items.slice(0,maxBars)
  if(!top.length)return '<p class="muted-copy">No data available yet.</p>'
  const max=Math.max(...top.map(i=>Number(i.value||0)),1)
  const fmt=v=>currency ? money(v,currency) : String(v)
  return `<div class="bar-chart">${top.map(i=>{
    const v=Number(i.value||0), name=String(i.label||'')
    return `<div class="bar-row"><span title="${attr(name)}">${esc(name.length>22 ? name.slice(0,20)+'…' : name)}</span><div class="bar-track"><div class="bar-fill" style="width:${((v/max)*100).toFixed(1)}%"></div></div><span>${esc(fmt(v))}</span></div>`
  }).join('')}</div>`
}
const monthlyChart=(bookings,{mode='count',currency='NAD'}={})=>{
  const now=new Date()
  const months=Array.from({length:6},(_,i)=>{ const d=new Date(now.getFullYear(),now.getMonth()-5+i,1); return {key:`${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}`,label:d.toLocaleDateString('en-GB',{month:'short',year:'2-digit'}),count:0,revenue:0} })
  bookings.forEach(b=>{ const bucket=months.find(m=>m.key===dateKey(b.preferred_date||b.created_at).slice(0,7)); if(bucket){bucket.count+=1;bucket.revenue+=Number(b.total_amount||0)} })
  return barChart(months.map(m=>({label:m.label,value:m[mode]})),{currency:mode==='revenue' ? currency : null,maxBars:6})
}
const guideWindow=b=>{
  const m=meta(b)
  const match=String(m.pickup_time||'').trim().match(/^(\d{1,2}):(\d{2})/)
  if(match)return Number(match[1])<12 ? 'morning' : 'afternoon'
  const l=String(m.departure_label||'').toLowerCase()
  if(/\bam\b|morning/.test(l))return 'morning'
  if(/\bpm\b|afternoon|evening|sunset/.test(l))return 'afternoon'
  return 'unscheduled'
}
const presetRange=preset=>{
  if(preset==='all')return {start:null,end:null}
  const end=new Date(); end.setHours(23,59,59,999)
  const start=new Date(); start.setHours(0,0,0,0)
  if(preset==='week'){ const day=start.getDay()||7; start.setDate(start.getDate()-day+1) }
  else if(preset==='30days')start.setDate(start.getDate()-29)
  else start.setDate(1)
  return {start,end}
}
const reportRange=()=>{
  const preset=nodes.reportsRangePreset.value||'all'
  let start=null,end=null
  if(preset==='custom'){
    start=parseDate(nodes.reportsRangeFrom.value); end=parseDate(nodes.reportsRangeTo.value)
    if(start&&end&&start>end)[start,end]=[end,start]
    if(start)start.setHours(0,0,0,0)
    if(end)end.setHours(23,59,59,999)
  }else ({start,end}=presetRange(preset))
  const rangeLabel=(start||end) ? `${start ? fmtDate(start) : 'Start'} to ${end ? fmtDate(end) : 'Today'}` : 'All time'
  return {preset,start,end,label:rangeLabel}
}
const inRange=(b,range)=>{
  if(!range.start&&!range.end)return true
  const d=parseDate(b.preferred_date||b.created_at)
  if(!d)return false
  if(range.start&&d<range.start)return false
  if(range.end&&d>range.end)return false
  return true
}
const guidesReport=(bookings,{start,end}={})=>{
  const byGuideDate=new Map()
  bookings.forEach(b=>{
    const names=guideNames(b)
    if(!names.length)return
    const d=parseDate(b.preferred_date)
    if(d){ if(start&&d<start)return; if(end&&d>end)return }
    const key=d ? dateKey(b.preferred_date) : ''
    const bucket=d ? guideWindow(b) : 'unscheduled'
    names.forEach(guide=>{
      const k=`${guide}||${key}`
      if(!byGuideDate.has(k))byGuideDate.set(k,{guide,dateKey:key,morning:[],afternoon:[],unscheduled:[]})
      byGuideDate.get(k)[bucket].push(b)
    })
  })
  const dayRows=[...byGuideDate.values()].map(e=>({...e,countedUnits:(e.morning.length?1:0)+(e.afternoon.length?1:0)+e.unscheduled.length,rawBookings:e.morning.length+e.afternoon.length+e.unscheduled.length})).sort((a,b)=>a.guide.localeCompare(b.guide)||a.dateKey.localeCompare(b.dateKey))
  const byGuide=new Map()
  dayRows.forEach(r=>{ const g=byGuide.get(r.guide)||{guide:r.guide,days:0,counted:0,raw:0,unscheduled:0}; g.days+=1; g.counted+=r.countedUnits; g.raw+=r.rawBookings; g.unscheduled+=r.unscheduled.length; byGuide.set(r.guide,g) })
  return {dayRows,guideRows:[...byGuide.values()].sort((a,b)=>b.counted-a.counted||a.guide.localeCompare(b.guide))}
}
const metricCards=cards=>cards.map(c=>`<article class="metric-card"><span>${esc(c.label)}</span><strong>${esc(c.value)}</strong></article>`).join('')
const groupBy=(rows,keyFn)=>rows.reduce((acc,b)=>{ const k=keyFn(b); acc[k]=acc[k]||{count:0,revenue:0}; acc[k].count+=1; acc[k].revenue+=Number(b.total_amount||0); return acc },{})

const renderReports=()=>{
  const range=reportRange()
  if(range.preset!=='custom'){
    if(document.activeElement!==nodes.reportsRangeFrom)nodes.reportsRangeFrom.value=range.start ? dateKey(range.start) : ''
    if(document.activeElement!==nodes.reportsRangeTo)nodes.reportsRangeTo.value=range.end ? dateKey(range.end) : ''
  }
  const reportBookings=state.bookings.filter(b=>!isTrashed(b)&&inRange(b,range))
  nodes.reportsRangeSummary.textContent=`${reportBookings.length} booking${reportBookings.length===1?'':'s'} · ${range.label}`
  const finance=financeBookings(reportBookings)
  const cancelled=reportBookings.filter(isCancelledFinancial)
  const currency=state.settings.currency||'NAD'
  const m=v=>money(v,currency)

  // 1. Sales
  const byBrand=groupBy(finance,b=>b.brand_code||'unassigned')
  const byService=groupBy(finance,b=>b.service_name||'Unknown service')
  const bySource=groupBy(finance,b=>b.source||meta(b).source||'website')
  const accepted=finance.filter(b=>!['provisional','cancelled','failed'].includes(lower(b.status)))
  const paid=finance.filter(b=>['paid','partially_paid','cash','card','eft','voucher','foc'].includes(lower(b.payment_status)))
  const gross=sum(finance,'total_amount')
  nodes.salesReportCards.innerHTML=metricCards([
    {label:'Gross revenue',value:m(gross)},{label:'Paid revenue',value:m(sum(paid,'total_amount'))},{label:'Active bookings',value:String(finance.length)},
    {label:'Avg. booking value',value:m(finance.length ? gross/finance.length : 0)},{label:'Conversion',value:`${finance.length ? Math.round((accepted.length/finance.length)*100) : 0}% accepted`},{label:'Cancelled / refunded',value:String(cancelled.length)}
  ])
  const sorted=(obj,key)=>Object.entries(obj).sort((a,b)=>b[1][key]-a[1][key])
  nodes.salesReportBody.innerHTML=`
    <div class="report-split-grid">
      <article><h4>Bookings per month (last 6 months)</h4>${monthlyChart(finance,{mode:'count'})}</article>
      <article><h4>Revenue per month (last 6 months)</h4>${monthlyChart(finance,{mode:'revenue',currency})}</article>
    </div>
    <div class="report-split-grid">
      <article><h4>Revenue by tour</h4>${barChart(sorted(byService,'revenue').slice(0,8).map(([l,v])=>({label:l,value:v.revenue})),{currency})}</article>
      <article><h4>Bookings by tour</h4>${barChart(sorted(byService,'count').slice(0,8).map(([l,v])=>({label:l,value:v.count})))}</article>
    </div>
    <div class="report-split-grid">
      <article><h4>Sales by brand</h4><div class="report-stat-list">${Object.entries(byBrand).map(([code,v])=>`<div><strong>${esc(brandName(code))}</strong><span>${v.count} bookings — ${m(v.revenue)}</span></div>`).join('')||'<p class="muted-copy">No brand data yet.</p>'}</div></article>
      <article><h4>Bookings by source</h4>${barChart(sorted(bySource,'count').map(([l,v])=>({label:label(l),value:v.count})))}</article>
    </div>`

  // 2. Payment process
  const payRows=reportPaymentRows(finance)
  const received=sum(payRows,'amount')
  const statusCounts=finance.reduce((acc,b)=>{ const k=lower(b.payment_status)||'not_set'; acc[k]=(acc[k]||0)+1; return acc },{})
  const outstanding=finance.filter(b=>!['paid','partially_paid','cash','card','eft','voucher','foc','invoiced'].includes(lower(b.payment_status)))
  nodes.paymentReportCards.innerHTML=metricCards([
    {label:'Received (all methods)',value:m(received)},{label:'Payments logged',value:String(sum(payRows,'count'))},{label:'Paid bookings',value:`${paid.length}/${finance.length}`},
    {label:'Not yet paid',value:String(outstanding.length)},{label:'Not yet paid — value',value:m(sum(outstanding,'total_amount'))}
  ])
  nodes.paymentReportBody.innerHTML=`
    <div class="report-split-grid">
      <article><h4>Payments received by method</h4>${barChart(payRows.map(r=>({label:r.method,value:r.amount})),{currency})}</article>
      <article><h4>Payments received — detail</h4><div class="table-wrap"><table><thead><tr><th>Method</th><th>Payments</th><th>Amount</th><th>%</th></tr></thead><tbody>
        ${payRows.map(r=>`<tr><td>${esc(r.method)}</td><td>${r.count}</td><td>${m(r.amount)}</td><td>${received>0 ? Math.round((r.amount/received)*100) : 0}%</td></tr>`).join('')||emptyRow(4,'No received payments recorded yet.')}
      </tbody></table></div></article>
    </div>
    <div class="report-split-grid">
      <article><h4>Bookings by payment process status</h4><div class="table-wrap"><table><thead><tr><th>Status</th><th>Bookings</th><th>%</th></tr></thead><tbody>
        ${Object.entries(statusCounts).sort((a,b)=>b[1]-a[1]).map(([s,c])=>`<tr><td>${tag(s,s==='not_set' ? 'Not set / unpaid' : paymentLabel(s))}</td><td>${c}</td><td>${finance.length ? Math.round((c/finance.length)*100) : 0}%</td></tr>`).join('')||emptyRow(3,'No bookings yet.')}
      </tbody></table></div></article>
      <article><h4>Outstanding balances (not yet paid)</h4><div class="table-wrap"><table><thead><tr><th>Guest</th><th>Tour</th><th>Total</th></tr></thead><tbody>
        ${outstanding.slice(0,25).map(b=>`<tr><td><strong>${esc(b.customer_name||'Guest')}</strong><div class="table-subline">${esc(b.reference||'')}</div></td><td>${esc(b.service_name||'—')}</td><td>${m(b.total_amount||0)}</td></tr>`).join('')||emptyRow(3,'Nothing outstanding — every active booking has a payment method recorded.')}
      </tbody></table>${outstanding.length>25 ? `<p class="field-hint">Showing 25 of ${outstanding.length}.</p>` : ''}</div></article>
    </div>`

  // 3. Agent / booked by
  const byBookedBy=groupBy(finance,b=>lower(meta(b).booked_by||b.booked_by||'')||'(Direct / not recorded)')
  const byAgent=finance.reduce((acc,b)=>{ const k=text(meta(b).agent); if(!k)return acc; acc[k]=acc[k]||{count:0,revenue:0}; acc[k].count+=1; acc[k].revenue+=Number(b.total_amount||0); return acc },{})
  const agentCount=Object.values(byAgent).reduce((s,v)=>s+v.count,0)
  const commissionDue=sum(state.officeInvoices.filter(i=>!['paid','cancelled'].includes(lower(i.status))),'commission_amount')
  const groupedTable=(entries,first)=>`<div class="table-wrap"><table><thead><tr><th>${esc(first)}</th><th>Bookings</th><th>Revenue</th><th>Avg / booking</th></tr></thead><tbody>
    ${entries.map(([name,v])=>`<tr><td><strong>${esc(name)}</strong></td><td>${v.count}</td><td>${m(v.revenue)}</td><td>${m(v.count ? v.revenue/v.count : 0)}</td></tr>`).join('')||emptyRow(4,'No bookings recorded yet.')}
  </tbody></table></div>`
  nodes.agentReportCards.innerHTML=metricCards([
    {label:'Agent-sourced bookings',value:String(agentCount)},{label:'Agent revenue',value:m(Object.values(byAgent).reduce((s,v)=>s+v.revenue,0))},{label:'Commission due',value:m(commissionDue)},
    {label:'Distinct agents',value:String(Object.keys(byAgent).length)},{label:'Distinct booked-by sources',value:String(Object.keys(byBookedBy).length)}
  ])
  nodes.agentReportBody.innerHTML=`<div class="report-split-grid"><article><h4>By agent / selling partner</h4>${groupedTable(sorted(byAgent,'revenue'),'Agent')}</article><article><h4>By booked by</h4>${groupedTable(sorted(byBookedBy,'revenue'),'Booked by')}</article></div>`

  // 4. Invoiced
  const invoiced=reportBookings.filter(b=>lower(b.payment_status)==='invoiced')
  const invoicedSorted=[...invoiced].sort((a,b)=>dateKey(b.preferred_date).localeCompare(dateKey(a.preferred_date)))
  const oldest=[...invoiced].sort((a,b)=>dateKey(a.preferred_date).localeCompare(dateKey(b.preferred_date)))[0]
  nodes.invoicedReportCards.innerHTML=metricCards([
    {label:'Invoiced bookings',value:String(invoiced.length)},{label:'Total pax',value:String(invoiced.reduce((s,b)=>s+paxOf(b),0))},{label:'Invoiced value',value:m(sum(invoiced,'total_amount'))},{label:'Oldest open',value:oldest ? fmtDate(oldest.preferred_date) : '—'}
  ])
  nodes.invoicedReportBody.innerHTML=`<div class="table-wrap"><table><thead><tr><th>Date</th><th>Reference</th><th>Company / guest</th><th>Tour</th><th>Pax</th><th>Amount</th></tr></thead><tbody>
    ${invoicedSorted.map(b=>`<tr><td>${esc(fmtDate(b.preferred_date))}</td><td>${esc(b.reference||'')}</td><td><strong>${esc(b.customer_name||'Guest')}</strong></td><td>${esc(b.service_name||meta(b).display_name||'—')}</td><td>${paxOf(b)}</td><td>${m(b.total_amount||0)}</td></tr>`).join('')||emptyRow(6,'No bookings are currently invoiced.')}
  </tbody></table>${invoiced.length ? '<p class="field-hint">Cruise liner group bookings are settled directly with the cruise company outside SkyBook, so Amount shows 0.</p>' : ''}</div>`

  // 5. Guides
  const guides=guidesReport(finance,range)
  nodes.guidesReportCards.innerHTML=metricCards([
    {label:'Distinct guides',value:String(guides.guideRows.length)},{label:'Counted shifts (AM/PM rule)',value:String(guides.guideRows.reduce((s,r)=>s+r.counted,0))},
    {label:'Raw guide bookings',value:String(guides.guideRows.reduce((s,r)=>s+r.raw,0))},{label:'Unscheduled (counted individually)',value:String(guides.guideRows.reduce((s,r)=>s+r.unscheduled,0))}
  ])
  const allGuideBookings=state.bookings.filter(b=>!isTrashed(b)&&!isCancelledFinancial(b)&&guideNames(b).length)
  const guidesEmpty=allGuideBookings.length ? `${allGuideBookings.length} guide-assigned booking${allGuideBookings.length===1?' falls':'s fall'} outside the selected date range — widen the range above to see them.` : 'No guide-assigned bookings yet — add names in the Guide(s) field of a booking.'
  const ref=b=>esc(String(b.reference||b.service_name||'—'))
  nodes.guidesReportBody.innerHTML=`
    <div class="table-wrap" style="margin-bottom:18px"><table><thead><tr><th>Guide</th><th>Days worked</th><th>Counted shifts</th><th>Raw bookings</th><th>Unscheduled</th></tr></thead><tbody>
      ${guides.guideRows.map(r=>`<tr><td><strong>${esc(r.guide)}</strong></td><td>${r.days}</td><td>${r.counted}</td><td>${r.raw}</td><td>${r.unscheduled ? `<span class="status-badge is-bad">${r.unscheduled}</span>` : '0'}</td></tr>`).join('')||emptyRow(5,guidesEmpty)}
    </tbody></table></div>
    <div class="table-wrap"><table><thead><tr><th>Guide</th><th>Date</th><th>Morning</th><th>Afternoon</th><th>Unscheduled</th><th>Counted</th></tr></thead><tbody>
      ${guides.dayRows.map(r=>`<tr><td><strong>${esc(r.guide)}</strong></td><td>${r.dateKey ? esc(fmtDate(r.dateKey)) : '<em>No tour date</em>'}</td><td>${r.morning.length ? r.morning.map(ref).join(', ') : '—'}</td><td>${r.afternoon.length ? r.afternoon.map(ref).join(', ') : '—'}</td><td>${r.unscheduled.length ? r.unscheduled.map(ref).join(', ') : '—'}</td><td><strong>${r.countedUnits}</strong></td></tr>`).join('')||emptyRow(6,guidesEmpty)}
    </tbody></table></div>`
}

/* PDF export: the on-screen report markup rendered through html2pdf in a hidden iframe. */
const PDF_LIB_URL=(()=>{ try{ return new URL('assets/js/vendor/html2pdf.bundle.min.js',document.baseURI).href }catch{ return 'assets/js/vendor/html2pdf.bundle.min.js' } })()
const PDF_LIB_FALLBACK='https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.2/html2pdf.bundle.min.js'
const PDF_CSS='*{box-sizing:border-box}body{font-family:Arial,Helvetica,sans-serif;padding:24px 30px 16px;color:#142438;background:#fff;line-height:1.45}header{background:#092d52;color:#fff;padding:20px 24px;border-radius:12px;margin-bottom:4px}header h1{color:#fff;font-size:22px;margin:0 0 4px}header small{color:#cfe1f0;display:block;font-size:12px}.pill{display:inline-block;padding:4px 10px;border-radius:999px;background:rgba(255,255,255,.18);color:#fff;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em}section{margin-top:16px;padding-top:14px;border-top:1px solid #e1ecf6}.metric-cards{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin-top:14px}.metric-card{padding:12px 14px;border:1px solid #dde6ee;border-left:4px solid #145bc7;border-radius:10px;background:#f8fbfd;page-break-inside:avoid}.metric-card span{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.07em;color:#516678}.metric-card strong{display:block;margin-top:6px;font-size:18px;font-weight:800;color:#0f2b52}.report-split-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;page-break-inside:avoid}.report-split-grid+.report-split-grid{margin-top:14px}.report-split-grid article{border:1px solid #dde6ee;border-radius:10px;padding:14px;background:#fff;min-width:0;page-break-inside:avoid}.report-split-grid h4{margin:0 0 10px;color:#145bc7;font-size:11px;text-transform:uppercase;letter-spacing:.05em;border-bottom:2px solid #e1ecf6;padding-bottom:6px}.report-stat-list{display:grid;gap:6px}.report-stat-list div{padding:8px 10px;border:1px solid #dde6ee;border-radius:8px;background:#f8fbfd}.report-stat-list strong{display:block}.report-stat-list span{display:block;margin-top:2px;color:#516678;font-size:11px}.bar-chart{display:flex;flex-direction:column;gap:6px}.bar-row{display:grid;grid-template-columns:120px 1fr 80px;align-items:center;gap:8px;font-size:11px}.bar-track{background:#edf2f7;border-radius:999px;height:12px;overflow:hidden}.bar-fill{height:100%;background:#145bc7;border-radius:999px}.bar-row>span:last-child{text-align:right;font-weight:700}table{width:100%;border-collapse:collapse;margin-top:10px;table-layout:fixed}th{text-align:left;background:#092d52;color:#fff;font-size:9px;text-transform:uppercase;letter-spacing:.04em;padding:7px 6px}td{padding:7px 8px;border-bottom:1px solid #e1ecf6;font-size:11px;vertical-align:top;overflow-wrap:break-word}tbody tr:nth-child(even){background:#f7fbff}.tag,.status-badge{display:inline-block;padding:2px 8px;border-radius:999px;background:#e8f4ff;color:#1e5b93;font-size:10px;font-weight:700}.status-badge.is-bad{background:#fdecec;color:#a33a3a}.muted-copy,.field-hint,.table-subline{color:#5f6f80;font-size:11px}.adm-empty{text-align:center;color:#5f6f80}.foot{margin-top:16px;padding-top:10px;border-top:1px solid #e1ecf6;text-align:center;font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#8299ad}'
const REPORT_EXPORTS={
  sales:{title:'Sales Report',cards:'salesReportCards',body:'salesReportBody'},payments:{title:'Payment Process Report',cards:'paymentReportCards',body:'paymentReportBody'},
  agents:{title:'Agent / Booked By Report',cards:'agentReportCards',body:'agentReportBody'},invoiced:{title:'Invoiced Report',cards:'invoicedReportCards',body:'invoicedReportBody'},
  guides:{title:'Guides Report',cards:'guidesReportCards',body:'guidesReportBody'}
}
const renderPdf=(title,bodyHtml,filename)=>{
  const fullHtml=`<!DOCTYPE html><html><head><meta charset="utf-8"><title>${esc(title)}</title><style>${PDF_CSS}</style></head><body>${bodyHtml}</body></html>`
  const tab=window.open('','_blank')
  if(tab){ try{ tab.document.open(); tab.document.write('<!DOCTYPE html><html><head><meta charset="utf-8"><title>Generating PDF…</title></head><body style="margin:0;font-family:Arial,sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#092d52;color:#fff"><div style="text-align:center"><div style="font-size:15px;font-weight:700">Generating PDF…</div><div style="margin-top:6px;font-size:12px;opacity:.7">SkyBook</div></div></body></html>'); tab.document.close() }catch{} }
  let done=false
  const cb=`__sbPdf${Math.random().toString(36).slice(2)}`
  const iframe=document.createElement('iframe')
  iframe.setAttribute('aria-hidden','true')
  iframe.style.cssText='position:fixed;left:-12000px;top:0;width:820px;height:1160px;border:0;z-index:-1;pointer-events:none'
  const finish=blob=>{
    if(done)return
    done=true
    try{ delete window[cb] }catch{}
    try{ iframe.remove() }catch{}
    if(blob){
      const url=URL.createObjectURL(blob)
      const link=document.createElement('a'); link.href=url; link.download=filename; document.body.appendChild(link); link.click(); link.remove()
      if(tab){ try{ tab.close() }catch{} }
      window.setTimeout(()=>URL.revokeObjectURL(url),15000)
    }else{
      // html2pdf could not run — fall back to the browser's own print dialog.
      const w=tab||window.open('','_blank')
      if(!w){ toast('Allow pop-ups to download reports.','error'); return }
      try{ w.document.open(); w.document.write(fullHtml); w.document.close(); w.focus(); w.setTimeout(()=>{ try{ w.print() }catch{} },400) }catch{}
    }
  }
  window[cb]=finish
  window.setTimeout(()=>{ if(!done)finish(null) },20000)
  document.body.appendChild(iframe)
  const gen=`<script src="${PDF_LIB_URL}"><\/script><script>(function(){var CB=parent["${cb}"];function run(){try{html2pdf().set({margin:[6,6,8,6],image:{type:"jpeg",quality:0.98},html2canvas:{scale:2,backgroundColor:"#ffffff",useCORS:true,logging:false},jsPDF:{unit:"mm",format:"a4",orientation:"portrait"},pagebreak:{mode:["css","legacy"]}}).from(document.body).toPdf().get("pdf").then(function(p){try{var innerH=283,innerW=198;var ratio=innerW/document.body.scrollWidth;var hMm=document.body.scrollHeight*ratio;var pages=p.internal.getNumberOfPages();var last=hMm-(pages-1)*innerH;if(pages>1&&last<8)p.deletePage(pages)}catch(e){}CB&&CB(p.output("blob"))}).catch(function(){CB&&CB(null)})}catch(e){CB&&CB(null)}}window.addEventListener("load",function(){if(typeof html2pdf!=="undefined")return run();var f=document.createElement("script");f.src="${PDF_LIB_FALLBACK}";f.onload=run;f.onerror=function(){CB&&CB(null)};document.body.appendChild(f)})})()<\/script>`
  try{ const doc=iframe.contentWindow.document; doc.open(); doc.write(fullHtml.replace(/<\/body>/i,`${gen}</body>`)); doc.close() }catch{ finish(null) }
}
const downloadReportPdf=key=>{
  const config=REPORT_EXPORTS[key]
  if(!config)return
  renderReports()
  const range=reportRange()
  const title=`${config.title} — ${range.label}`
  renderPdf(title,`<header><span class="pill">SkyBook</span><h1>${esc(title)}</h1><small>All brands · generated ${esc(fmtDateTime(new Date().toISOString()))}</small></header><div class="metric-cards">${nodes[config.cards].innerHTML}</div><section>${nodes[config.body].innerHTML}</section><div class="foot">SkyBook — Tour operations &amp; bookings</div>`,`skybook-${key}-report-${todayKey()}.pdf`)
}
const exportBookingsCsv=()=>{
  const rows=state.bookings.filter(b=>!isTrashed(b)).map(b=>({
    reference:b.reference,brand:brandName(b.brand_code),status:label(b.status),payment:paymentLabel(b.payment_status),date:dateKey(b.preferred_date),pickup:pickupLabel(b),
    guest:b.customer_name,email:b.customer_email,phone:b.customer_phone,tour:b.service_name||meta(b).display_name,adults:b.adult_quantity||0,children:b.child_quantity||0,
    infants:b.infant_quantity||meta(b).infant_quantity||0,total:Number(b.total_amount||0).toFixed(2),received:receivedOf(b).toFixed(2),outstanding:outstandingOf(b).toFixed(2),
    guides:guideNames(b).join('; '),booked_by:meta(b).booked_by||'',agent:meta(b).agent||'',source:sourceLabel(b),created:b.created_at,notes:b.notes||b.customer_notes||''
  }))
  const columns=Object.keys(rows[0]||{reference:''}).map(key=>({key,label:label(key)}))
  const blob=new Blob([shared.toCsv(rows,columns)],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const link=document.createElement('a'); link.href=url; link.download=`skybook-bookings-${todayKey()}.csv`; document.body.appendChild(link); link.click(); link.remove()
  window.setTimeout(()=>URL.revokeObjectURL(url),15000)
}


/* ── Calendar (day / week / month, day panel, printed arrivals) ─────── */
const calendarNodes={
  canvas:$('calendarCanvas'),label:$('calNavLabel'),focus:$('calendarFocusDate'),prev:$('calNavPrev'),next:$('calNavNext'),today:$('calNavToday'),
  print:$('printArrivalsList'),views:[...document.querySelectorAll('[data-calendar-view]')],
  panel:$('calendarDayPanel'),panelBackdrop:$('calendarDayPanelBackdrop'),panelTitle:$('calendarDayPanelTitle'),panelSummary:$('calendarDayPanelSummary'),
  panelClose:$('calendarDayPanelClose'),create:$('calDayCreateBooking'),cruise:$('calDayCreateCruise'),view:$('calDayViewBookings'),dayPrint:$('calDayPrint'),dayBookings:$('calendarDayBookings')
}
const createDateRange=(focusDate,span)=>{
  const start=parseDate(focusDate)||new Date()
  start.setHours(0,0,0,0)
  if(span==='week'){ const day=start.getDay(); start.setDate(start.getDate()+(day===0 ? -6 : 1-day)) }
  else if(span==='month'){ start.setDate(1); const day=start.getDay(); start.setDate(start.getDate()+(day===0 ? -6 : 1-day)) }
  const total=span==='day' ? 1 : span==='week' ? 7 : 42
  return Array.from({length:total},(_,i)=>{ const d=new Date(start); d.setDate(start.getDate()+i); return d })
}
const rowStatusClass=b=>{
  if(isCruise(b))return 'is-cruise-liner'
  const s=lower(b?.status)
  return ['cancelled','failed','no_show'].includes(s) ? 'status-cancelled' : s ? `status-${s}` : ''
}
const calendarBookings=()=>state.bookings.filter(b=>!isTrashed(b)&&dateKey(b.preferred_date)&&lower(b.status)!=='cancelled')
const calendarName=b=>isCruise(b) ? (meta(b).display_name||`${meta(b).cruise_company_label||'Cruise'} Group`) : (b.customer_name||'Guest')
const calendarTour=b=>b.service_name||meta(b).display_name||'Tour'
const renderCalendar=()=>{
  if(!calendarNodes.canvas)return
  const focusDate=calendarNodes.focus.value||state.calendarFocusDate||todayKey()
  state.calendarFocusDate=focusDate
  if(calendarNodes.focus.value!==focusDate)calendarNodes.focus.value=focusDate
  calendarNodes.views.forEach(btn=>btn.setAttribute('aria-pressed',btn.dataset.calendarView===state.calendarView ? 'true' : 'false'))
  const focus=parseDate(focusDate)||new Date()
  const dates=createDateRange(focusDate,state.calendarView)
  if(state.calendarView==='month')calendarNodes.label.textContent=focus.toLocaleDateString('en-GB',{month:'long',year:'numeric'})
  else if(state.calendarView==='week')calendarNodes.label.textContent=`${dates[0].toLocaleDateString('en-GB',{day:'numeric',month:'short'})} – ${dates[6].toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'})}`
  else calendarNodes.label.textContent=focus.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  const keys=new Set(dates.map(dateKey))
  const rangeBookings=calendarBookings().filter(b=>keys.has(dateKey(b.preferred_date))).sort((a,b)=>dateKey(a.preferred_date).localeCompare(dateKey(b.preferred_date))||pickupLabel(a).localeCompare(pickupLabel(b)))
  const guests=rangeBookings.reduce((s,b)=>s+paxOf(b),0)
  $('calendarSummary').textContent=`${rangeBookings.length} booking${rangeBookings.length===1?'':'s'} · ${guests} guest${guests===1?'':'s'} in view. Click a day to add a booking or see who is on it.`
  const today=todayKey()
  if(state.calendarView==='day'){
    calendarNodes.canvas.innerHTML=`<div class="calendar-day-stack">${rangeBookings.map(b=>`
      <article class="calendar-entry-card ${rowStatusClass(b)}" data-open-booking="${attr(b.id)}" title="${attr(`${calendarName(b)} · ${calendarTour(b)} · ${b.reference}`)}">
        <div><strong>${esc(calendarName(b))}</strong><p>${esc(calendarTour(b))} · ${esc(b.reference)}</p></div>
        <div class="calendar-entry-meta"><span>${esc(pickupLabel(b))}</span><span>${esc(paxLabel(b))} pax</span><span>${esc(pickupModeLabel(meta(b).pickup_mode)||'Transport TBC')}</span>${guideNames(b).length ? `<span>Guide: ${esc(guideNames(b).join(', '))}</span>` : ''}</div>
        <div>${statusTag(b)} ${paymentTag(b)}</div>
      </article>`).join('')||'<p class="adm-empty">No bookings are scheduled for this day.</p>'}</div>
      <p style="margin-top:14px"><button type="button" class="adm-btn ghost small" data-cal-day="${attr(focusDate)}">Add a booking on this day</button></p>`
    return
  }
  if(state.calendarView==='week'){
    calendarNodes.canvas.innerHTML=`<div class="calendar-week-grid">${dates.map(d=>{
      const key=dateKey(d)
      const items=rangeBookings.filter(b=>dateKey(b.preferred_date)===key)
      return `<section class="calendar-cell${key===today ? ' is-today' : ''}">
        <header><strong>${esc(d.toLocaleDateString('en-GB',{weekday:'short',day:'numeric'}))}</strong><span>${items.length||''}</span></header>
        <div class="calendar-cell-body">${items.map(b=>`<article class="calendar-mini-card is-clickable ${rowStatusClass(b)}" data-open-booking="${attr(b.id)}" title="${attr(`${calendarName(b)} — ${calendarTour(b)} (${b.reference})`)}"><strong>${esc(calendarName(b))}</strong><span>${esc(calendarTour(b))} · ${esc(paxLabel(b))}</span>${statusTag(b)}</article>`).join('')}
          <button type="button" class="cal-overflow-pill" data-cal-day="${attr(key)}">${items.length ? 'Day view / add' : '+ Add'}</button></div>
      </section>`
    }).join('')}</div>`
    return
  }
  const DAY_NAMES=['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
  const todayIdx=(new Date().getDay()+6)%7
  calendarNodes.canvas.innerHTML=`<div class="calendar-month-grid">
    ${DAY_NAMES.map((n,i)=>`<div class="cal-day-label${i===todayIdx ? ' is-today-col' : ''}">${n}</div>`).join('')}
    ${dates.map(d=>{
      const key=dateKey(d)
      const items=rangeBookings.filter(b=>dateKey(b.preferred_date)===key)
      return `<section class="calendar-cell${focus.getMonth()===d.getMonth() ? '' : ' is-muted'}${key===today ? ' is-today' : ''}" data-cal-day="${attr(key)}">
        <header><strong>${d.getDate()}</strong><span>${items.length||''}</span></header>
        <div class="calendar-cell-body">
          ${items.slice(0,3).map(b=>`<article class="calendar-mini-card ${rowStatusClass(b)}"><strong>${esc(calendarName(b))}</strong><span>${esc(calendarTour(b))}</span></article>`).join('')}
          ${items.length>3 ? `<button type="button" class="cal-overflow-pill" data-cal-day="${attr(key)}">+${items.length-3} more</button>` : ''}
        </div>
      </section>`
    }).join('')}
  </div>`
}
const shiftCalendar=delta=>{
  const next=parseDate(calendarNodes.focus.value||state.calendarFocusDate)||new Date()
  if(state.calendarView==='month')next.setMonth(next.getMonth()+delta)
  else if(state.calendarView==='week')next.setDate(next.getDate()+delta*7)
  else next.setDate(next.getDate()+delta)
  calendarNodes.focus.value=dateKey(next)
  renderCalendar()
}
const openCalendarDayPanel=key=>{
  const d=parseDate(key)
  if(!d)return
  state.calendarSelectedDay=key
  const items=calendarBookings().filter(b=>dateKey(b.preferred_date)===key)
  calendarNodes.panelTitle.textContent=d.toLocaleDateString('en-GB',{weekday:'long',day:'numeric',month:'long',year:'numeric'})
  calendarNodes.panelSummary.textContent=items.length ? `${items.length} booking${items.length===1?'':'s'} · ${items.reduce((s,b)=>s+paxOf(b),0)} guests` : 'Nothing booked yet.'
  calendarNodes.dayBookings.hidden=true
  calendarNodes.panel.hidden=false
  document.body.classList.add('has-modal')
  if(items.length)renderCalendarDayBookings(key)
}
const closeCalendarDayPanel=()=>{ calendarNodes.panel.hidden=true; state.calendarSelectedDay=''; document.body.classList.toggle('has-modal',[nodes.bookingModal,nodes.serviceModal,nodes.cruiseModal,nodes.workflowModal].some(m=>m&&!m.hidden)) }
const renderCalendarDayBookings=key=>{
  const items=calendarBookings().filter(b=>dateKey(b.preferred_date)===key).sort((a,b)=>pickupLabel(a).localeCompare(pickupLabel(b)))
  calendarNodes.dayBookings.innerHTML=items.map(b=>{
    const m=meta(b)
    const notes=byDateDesc(state.adminNotes.filter(n=>n.booking_id===b.id),'created_at')
    const a=Number(b.adult_quantity||0),c=Number(b.child_quantity||0),i=Number(b.infant_quantity||m.infant_quantity||0)
    const parts=[a>0?`${a} adult${a!==1?'s':''}`:'',c>0?`${c} child${c!==1?'ren':''}`:'',i>0?`${i} infant${i!==1?'s':''}`:''].filter(Boolean)
    const pax=parts.length ? `${paxOf(b)} pax (${parts.join(', ')})` : `${paxOf(b)} pax`
    return `<article class="cal-day-block ${rowStatusClass(b)}" data-cal-block="${attr(b.id)}">
        <strong>${esc(calendarName(b))}</strong>
        <span>${esc(calendarTour(b))} · ${esc(pickupLabel(b))}</span>
        <span>${esc(pax)}${isCruise(b)&&m.buses>0 ? ` · ${m.buses} bus${m.buses>1?'es':''}` : ''}</span>
        <div class="cal-day-block-tags">${statusTag(b)} ${paymentTag(b)}</div>
        <div class="block-amount">${money(b.total_amount,b.currency)}</div>
      </article>
      <div class="cal-day-block-detail" id="block-detail-${attr(b.id)}">
        <dl>
          <dt>Name</dt><dd>${esc(b.customer_name||calendarName(b))}</dd>
          <dt>Pax</dt><dd>${esc(pax)}</dd>
          <dt>Activity</dt><dd>${esc(calendarTour(b))}</dd>
          <dt>Amount</dt><dd>${money(b.total_amount,b.currency)}</dd>
          <dt>Status</dt><dd>${statusTag(b)}</dd>
          <dt>Payment</dt><dd>${paymentTag(b)}</dd>
          <dt>Booked by</dt><dd>${esc(m.booked_by||'—')}</dd>
          <dt>Contact</dt><dd>${esc(b.customer_phone||b.customer_email||'—')}</dd>
          <dt>Transport</dt><dd>${esc(pickupModeLabel(m.pickup_mode)||'—')}</dd>
          ${guideNames(b).length ? `<dt>Guide(s)</dt><dd>${esc(guideNames(b).join(', '))}</dd>` : ''}
          ${m.skipper_name ? `<dt>Skipper</dt><dd>${esc(m.skipper_name)}</dd>` : ''}
          ${b.notes||b.customer_notes ? `<dt>Notes</dt><dd>${esc(b.notes||b.customer_notes)}</dd>` : ''}
          ${notes.length ? `<dt>Internal</dt><dd>${notes.map(n=>esc(n.note)).join('<br>')}</dd>` : ''}
        </dl>
        <div class="cal-day-block-actions"><button type="button" class="adm-btn small" data-open-booking="${attr(b.id)}">Open booking →</button></div>
      </div>`
  }).join('')||'<p class="adm-empty">No bookings for this day.</p>'
  calendarNodes.dayBookings.hidden=false
}
// Printed arrivals sheet: one card per booking with everything the guide and driver need.
const printArrivals=(key=todayKey())=>{
  const rows=calendarBookings().filter(b=>dateKey(b.preferred_date)===key&&lower(b.status)!=='refunded').sort((a,b)=>pickupLabel(a).localeCompare(pickupLabel(b)))
  const field=(l,v)=>v&&v!=='—' ? `<div class="field"><span class="label">${esc(l)}</span><span class="value">${esc(String(v))}</span></div>` : ''
  const cards=rows.map(b=>{
    const m=meta(b)
    const a=Number(b.adult_quantity||0),c=Number(b.child_quantity||0),i=Number(b.infant_quantity||m.infant_quantity||0)
    const parts=[a>0?`${a} Adult${a>1?'s':''}`:'',c>0?`${c} Child${c>1?'ren':''} (4–12)`:'',i>0?`${i} Under 4`:''].filter(Boolean)
    return `<div class="booking-card">
      <div class="card-header">
        <div><div class="guest-name">${esc(calendarName(b))}</div><div class="tour-name">${esc(calendarTour(b))}${pickupLabel(b)!=='TBC' ? ` · ${esc(pickupLabel(b))}` : ''}</div></div>
        <div class="card-meta"><div class="ref">${esc(b.reference)}</div>${isAdminEntered(b) ? '' : `<div class="status-pill">${esc(lower(b.status)==='provisional' ? 'Awaiting approval' : label(b.status))}</div>`}<div class="amount">${money(b.total_amount,b.currency)}</div></div>
      </div>
      <div class="card-body">
        <div class="fields-col">${field('Pax',parts.join(', ')||`${paxOf(b)} guests`)}${field('Transport',pickupModeLabel(m.pickup_mode))}${field('Guide(s)',guideNames(b).join(', '))}${field('Skipper(s)',m.skipper_name)}${field('Contact',b.customer_phone)}${field('Email',b.customer_email)}</div>
        <div class="fields-col">${field('Dietary',m.dietary_requirements||m.dietary)}${field('Nationality',m.nationality)}${field('Booked by',m.booked_by)}${field('Agent',m.agent)}${field('Payment',paymentLabel(b.payment_status))}${field('Notes',b.customer_notes||b.notes)}</div>
      </div>
    </div>`
  }).join('<hr class="card-divider">')
  const css='.page-header{display:flex;justify-content:space-between;align-items:flex-end;padding-bottom:14px;border-bottom:3px solid #092d52;margin-bottom:20px}.page-header h1{font-size:22px;color:#092d52}.count{display:inline-block;background:#092d52;color:#fff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;margin-left:8px;vertical-align:middle}.booking-card{padding:14px 0 6px;page-break-inside:avoid}.card-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px}.guest-name{font-size:17px;font-weight:800;color:#092d52}.tour-name{font-size:13px;color:#3a6480;font-weight:600;margin-top:2px}.card-meta{text-align:right;margin-left:20px;flex-shrink:0}.ref{font-size:11px;color:#516678;letter-spacing:.06em;font-weight:700}.status-pill{display:inline-block;margin-top:4px;padding:2px 9px;border-radius:999px;font-size:10px;font-weight:700;text-transform:uppercase;background:#dbe8fa;color:#14509f}.amount{font-size:15px;font-weight:800;color:#092d52;margin-top:4px}.card-body{display:grid;grid-template-columns:1fr 1fr;gap:0 28px}.fields-col{display:flex;flex-direction:column;gap:4px}.field{display:flex;gap:8px;align-items:baseline}.label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.06em;color:#516678;min-width:90px;white-space:nowrap}.value{font-size:13px;color:#142438}.card-divider{border:0;border-top:1px solid #dde9f2;margin:8px 0}'
  openPrintWindow(`Arrivals — ${fmtDate(key)}`,`<style>${css}</style><div class="page-header"><div><h1>Arrivals<span class="count">${rows.length}</span></h1><p>${esc(fmtDate(key))} · ${rows.reduce((s,b)=>s+paxOf(b),0)} guests</p></div><div><p>Printed ${esc(fmtDateTime(new Date().toISOString()))}</p></div></div>${cards||`<p>No arrivals scheduled for ${esc(fmtDate(key))}.</p>`}`)
}
calendarNodes.views.forEach(btn=>btn.addEventListener('click',()=>{ state.calendarView=btn.dataset.calendarView||'month'; renderCalendar() }))
calendarNodes.focus.addEventListener('change',renderCalendar)
calendarNodes.prev.addEventListener('click',()=>shiftCalendar(-1))
calendarNodes.next.addEventListener('click',()=>shiftCalendar(1))
calendarNodes.today.addEventListener('click',()=>{ calendarNodes.focus.value=todayKey(); renderCalendar() })
calendarNodes.print.addEventListener('click',()=>openWorkflow({
  title:'Print arrivals',description:'Choose the tour date to print. The sheet lists every booking with pickup, pax, guide, transport and notes.',submitLabel:'Print',
  fields:[{name:'date',label:'Tour date',type:'date',value:calendarNodes.focus.value||todayKey(),required:true}],
  onSubmit:async values=>printArrivals(values.date)
}))
calendarNodes.canvas.addEventListener('click',event=>{
  if(event.target.closest('[data-open-booking]'))return // handled by the global click handler
  const day=event.target.closest('[data-cal-day]')
  if(day)openCalendarDayPanel(day.dataset.calDay)
})
calendarNodes.panelClose.addEventListener('click',closeCalendarDayPanel)
calendarNodes.panelBackdrop.addEventListener('click',closeCalendarDayPanel)
calendarNodes.create.addEventListener('click',()=>{ const key=state.calendarSelectedDay; closeCalendarDayPanel(); openBookingModal(null,{date:key}) })
calendarNodes.cruise.addEventListener('click',()=>{ const key=state.calendarSelectedDay; closeCalendarDayPanel(); openCruiseModal(key) })
calendarNodes.view.addEventListener('click',()=>{ const key=state.calendarSelectedDay; closeCalendarDayPanel(); calendarNodes.focus.value=key; state.calendarView='day'; renderCalendar(); switchTab('calendar') })
calendarNodes.dayPrint.addEventListener('click',()=>printArrivals(state.calendarSelectedDay||todayKey()))
calendarNodes.dayBookings.addEventListener('click',event=>{
  if(event.target.closest('[data-open-booking]')){ closeCalendarDayPanel(); return }
  const block=event.target.closest('[data-cal-block]')
  if(!block)return
  const detail=document.getElementById(`block-detail-${block.dataset.calBlock}`)
  if(detail&&detail.classList.toggle('is-open'))detail.scrollIntoView({behavior:'smooth',block:'nearest'})
})

/* ── Render everything ───────────────────────────────────────────────── */
const renderAll=()=>{
  renderSession()
  applyNavVisibility()
  renderFormOptions()
  renderDashboard()
  renderCalendar()
  renderReservations()
  renderBookings()
  renderServices()
  renderUsers()
  renderReports()
  if(state.activeTab==='reservation-detail')renderReservationDetail()
  if(state.activeTab==='booking-detail')renderBookingDetail()
  if(!nodes.adminUserId.value&&!nodes.adminUserPermissions.children.length)fillUserForm(null)
}

/* ── Events ──────────────────────────────────────────────────────────── */
// One delegated click handler covers navigation, row links and action buttons everywhere.
document.addEventListener('click',event=>{
  const target=event.target.closest('button,a,tr')
  if(!target)return
  const tabBtn=event.target.closest('[data-admin-tab]')
  if(tabBtn){ switchTab(tabBtn.dataset.adminTab); return }
  const closeBtn=event.target.closest('[data-close-modal]')
  if(closeBtn){
    const which=closeBtn.dataset.closeModal
    if(which==='booking')closeBookingModal()
    else if(which==='service')closeServiceModal()
    else if(which==='cruise')setModal(nodes.cruiseModal,false)
    else if(which==='workflow')closeWorkflow()
    return
  }
  if(event.target.closest('[data-open-new-booking]')){ openBookingModal(null); return }
  if(event.target.closest('[data-open-cruise]')){ openCruiseModal(); return }
  if(event.target.closest('[data-print-today]')){ printDaySheet(); return }
  const reservationAction=event.target.closest('[data-reservation-action]')
  if(reservationAction){
    event.stopPropagation()
    const id=reservationAction.dataset.id||state.selectedBookingId
    const action=reservationAction.dataset.reservationAction
    if(action==='accept')acceptReservation(id,reservationAction).catch(fail)
    else if(action==='decline')declineReservation(id)
    else if(action==='delete')deleteReservation(id)
    else if(action==='reinstate')reinstate(id,'provisional')
    else if(action==='edit'){ const b=bookingById(id); if(b)openBookingModal(b) }
    return
  }
  const bookingAction=event.target.closest('[data-booking-action]')
  if(bookingAction){
    const id=state.selectedBookingId
    const action=bookingAction.dataset.bookingAction
    const b=bookingById(id)
    if(!b)return
    if(action==='edit')openBookingModal(b)
    else if(action==='cancel')cancelBooking(id)
    else if(action==='reinstate')reinstate(id,'finalised')
    else if(action==='confirm')confirmBooking(id,bookingAction).catch(fail)
    else if(action==='print')printBooking(b)
    else if(action==='load-payment'){ const form=document.getElementById('manualPaymentForm'); if(form){ form.hidden=false; form.querySelector('[name=amount]')?.focus() } }
    else if(action==='hide-payment'){ const form=document.getElementById('manualPaymentForm'); if(form)form.hidden=true }
    return
  }
  const openBookingEl=event.target.closest('[data-open-booking]')
  if(openBookingEl){ openBooking(openBookingEl.dataset.openBooking); return }
  const openReservationEl=event.target.closest('[data-open-reservation]')
  if(openReservationEl){ openReservation(openReservationEl.dataset.openReservation); return }
  const openServiceEl=event.target.closest('[data-open-service]')
  if(openServiceEl){ const s=state.services.find(x=>x.id===openServiceEl.dataset.openService); if(s)openServiceModal(s); return }
  const openUserEl=event.target.closest('[data-open-user]')
  if(openUserEl){ const u=state.adminUsers.find(x=>x.id===openUserEl.dataset.openUser); if(u){ fillUserForm(u); renderUsers(); nodes.adminUserForm.scrollIntoView({behavior:'smooth',block:'start'}) } return }
  const pdfBtn=event.target.closest('[data-report-pdf]')
  if(pdfBtn){ event.preventDefault(); event.stopPropagation(); try{ downloadReportPdf(pdfBtn.dataset.reportPdf) }catch(error){ fail(error) } return }
})
document.addEventListener('submit',event=>{
  const form=event.target
  if(form.id==='manualPaymentForm'){ event.preventDefault(); withButtonLoading(form.querySelector('[type=submit]'),()=>saveManualPayment(form,state.selectedBookingId),'Saving…').catch(fail) }
  if(form.id==='bookingNoteForm'){
    event.preventDefault()
    const note=text(new FormData(form).get('note'))
    if(!note)return
    withButtonLoading(form.querySelector('[type=submit]'),async()=>{ await addNote(state.selectedBookingId,note); await refresh(); renderBookingDetail(); notify('Note added.') },'…').catch(fail)
  }
})
document.addEventListener('change',event=>{
  const cardFields=event.target.closest('#manualPaymentForm')?.querySelector('[data-card-fields]')
  if(cardFields&&event.target.name==='payment_type')cardFields.hidden=event.target.value!=='card'
})
document.addEventListener('keydown',event=>{
  if(event.key!=='Escape')return
  if(state.workflow)closeWorkflow()
  else if(calendarNodes.panel&&!calendarNodes.panel.hidden)closeCalendarDayPanel()
  else if(state.isBookingModalOpen||!nodes.bookingModal.hidden)closeBookingModal()
  else if(!nodes.serviceModal.hidden)closeServiceModal()
  else if(!nodes.cruiseModal.hidden)setModal(nodes.cruiseModal,false)
})
nodes.menuToggle.addEventListener('click',()=>{ const open=nodes.bar.classList.toggle('is-open'); nodes.menuToggle.setAttribute('aria-expanded',open ? 'true' : 'false') })
nodes.brandHome.addEventListener('click',()=>switchTab('calendar'))
nodes.logout.addEventListener('click',()=>{ void signOut() })
;['input','change'].forEach(evt=>{
  nodes.bookingFilterSearch.addEventListener(evt,renderBookings)
  ;[nodes.bookingFilterBrand,nodes.bookingFilterService,nodes.bookingFilterDateFrom,nodes.bookingFilterDateTo].forEach(el=>el.addEventListener('change',renderBookings))
})
nodes.bookingQuickFilters.addEventListener('click',event=>{
  const chip=event.target.closest('[data-quick-filter]')
  if(!chip)return
  state.bookingQuickFilter=chip.dataset.quickFilter
  renderBookings()
})
// Booking form
nodes.bookingForm.addEventListener('submit',event=>{ event.preventDefault(); withButtonLoading(nodes.bookingSaveButton,saveBooking,'Saving…').catch(fail) })
nodes.bookingForm.addEventListener('input',event=>{
  if([nodes.bookingAdultQuantity,nodes.bookingChildQuantity,nodes.bookingInfantQuantity].includes(event.target))updatePricePreview()
  if(event.target===nodes.bookingPriceOverride)updateOverrideTag()
})
nodes.bookingForm.addEventListener('change',event=>{
  if(event.target===nodes.bookingBrand){
    renderBookingCustomFields(null,collectCustomFields())
    if(!state.editingBookingId)syncReference({brandCode:nodes.bookingBrand.value,forceNew:true})
  }
  if(event.target===nodes.bookingService){ syncDepartureFields(nodes.bookingService.value); updatePricePreview() }
  if(event.target===nodes.bookingDeparture){
    const pickup=nodes.bookingDeparture.selectedOptions[0]?.dataset.pickup||''
    nodes.bookingPickup.value=pickup
    nodes.bookingPickupWrap.hidden=!pickup
  }
})
nodes.bookingRevertPricing.addEventListener('click',()=>{ nodes.bookingPriceOverride.value=''; updatePricePreview(); toast('Reverted to calculated pax pricing — save the booking to apply.','info') })
nodes.bookingAddGuide.addEventListener('click',()=>nodes.bookingGuideList.appendChild(personRow()))
nodes.bookingAddSkipper.addEventListener('click',()=>nodes.bookingSkipperList.appendChild(personRow()))
nodes.bookingAddPaymentRow.addEventListener('click',()=>nodes.bookingPaymentRowsList.appendChild(paymentRow()))
nodes.bookingSelfDrive.addEventListener('change',()=>{ if(nodes.bookingSelfDrive.checked)nodes.bookingTransfer.checked=false })
nodes.bookingTransfer.addEventListener('change',()=>{ if(nodes.bookingTransfer.checked)nodes.bookingSelfDrive.checked=false })
nodes.closeBookingModal.addEventListener('click',closeBookingModal)
// Pre-fill a returning guest's phone and show their history when the email matches.
nodes.bookingCustomerEmail.addEventListener('blur',()=>{
  const email=lower(nodes.bookingCustomerEmail.value)
  if(!email)return
  const prior=byDateDesc(state.bookings.filter(b=>b.id!==state.editingBookingId&&lower(b.status)!=='cancelled'&&lower(b.customer_email)===email),'preferred_date')
  if(!prior.length)return
  if(!nodes.bookingCustomerName.value.trim()&&prior[0].customer_name)nodes.bookingCustomerName.value=prior[0].customer_name
  if(!nodes.bookingCustomerPhone.value.trim()&&prior[0].customer_phone)nodes.bookingCustomerPhone.value=prior[0].customer_phone
  toast(`Returning guest — ${prior.length} previous booking${prior.length===1?'':'s'}. Last: ${prior[0].service_name||'—'} on ${fmtDate(prior[0].preferred_date)}.`,'info')
})
// Cruise liner
nodes.cruiseForm.addEventListener('submit',event=>{ event.preventDefault(); withButtonLoading(nodes.cruiseForm.querySelector('[type=submit]'),saveCruiseBooking,'Creating…').catch(fail) })
nodes.cruiseForm.addEventListener('input',updateCruisePaxPerCar)
cruiseField('cruiseBookingType').addEventListener('change',()=>{ cruiseField('cruiseBoatsField').hidden=cruiseField('cruiseBookingType').value!=='full_boat' })
// Tours
nodes.serviceFilterBrand.addEventListener('change',renderServices)
nodes.openServiceModal.addEventListener('click',()=>openServiceModal(null))
nodes.closeServiceModal.addEventListener('click',closeServiceModal)
nodes.serviceForm.addEventListener('submit',event=>{ event.preventDefault(); withButtonLoading(document.getElementById('adminServiceSaveButton'),saveService,'Saving…').catch(fail) })
nodes.serviceAddDepartureTime.addEventListener('click',()=>nodes.serviceDepartureTimesList.appendChild(departureRow()))
nodes.deleteService.addEventListener('click',()=>withButtonLoading(nodes.deleteService,deleteService,'Deleting…').catch(fail))
wireDropZone()
// Users
nodes.adminUserForm.addEventListener('submit',event=>{ event.preventDefault(); withButtonLoading(nodes.adminUserSaveButton,saveUser,'Saving…').catch(fail) })
nodes.adminUserRole.addEventListener('change',()=>renderPermissionEditor({},nodes.adminUserRole.value))
nodes.adminUserReset.addEventListener('click',()=>{ fillUserForm(null); renderUsers() })
// Reports
;[nodes.reportsRangePreset,nodes.reportsRangeFrom,nodes.reportsRangeTo].forEach(el=>el.addEventListener('change',()=>{
  if(el!==nodes.reportsRangePreset)nodes.reportsRangePreset.value='custom'
  renderReports()
}))
nodes.exportCsv.addEventListener('click',exportBookingsCsv)
window.addEventListener('pagehide',stopLiveSync,{once:true})

/* ── Boot ────────────────────────────────────────────────────────────── */
const applyInitialRoute=()=>{
  const route=routeState()
  if(route.bookingId&&bookingById(route.bookingId)){ openBooking(route.bookingId); return }
  if(route.reservationId&&bookingById(route.reservationId)){ openReservation(route.reservationId); return }
  if(route.serviceId){ const s=state.services.find(x=>x.id===route.serviceId); switchTab('services'); if(s)openServiceModal(s); return }
  switchTab(route.tab||'calendar',{scroll:false})
}
;(async()=>{
  try{
    const sb=await client()
    let confirmed=false
    sb.auth.onAuthStateChange((event,session)=>{
      const previous=state.session?.access_token||''
      state.session=session
      if(!session){ stopLiveSync(); if(confirmed)redirectToLogin(); return }
      if(confirmed&&session.access_token!==previous&&['SIGNED_IN','TOKEN_REFRESHED'].includes(event)&&!renewal&&!anyModalOpen()){
        loadData().then(renderAll).catch(()=>{})
      }
    })
    const {data:{session}}=await sb.auth.getSession()
    state.session=session
    if(!session){ redirectToLogin(); return }
    confirmed=true
    setLoading('Loading your workspace','Fetching reservations, bookings and tours.')
    await loadData()
    renderAll()
    applyInitialRoute()
    startLiveSync()
  }catch(error){
    if(isAuthError(error)){ redirectToLogin(); return }
    console.error('[SkyBook]',error)
    setLoading('SkyBook could not load',error?.message||'Admin authentication is not configured.',{isError:true})
  }
})()
