const bookingAdminShared=window.TrueTravelBooking
const EMAIL_TEMPLATE_META={
  booking_received:{label:'Booking Made',description:'Sent when a guest creates a booking.'},
  booking_confirmed:{label:'Booking Confirmed',description:'Sent when a booking is confirmed.'},
  payment_received:{label:'Payment Received',description:'Sent when payment is recorded as paid.'},
  cancellation_refund:{label:'Cancellation / Refund',description:'Sent when a booking is cancelled or refunded.'},
  status_changed:{label:'Status Update',description:'Used for broader booking updates and reminders.'}
}

const state={
  session:null,
  user:null,
  profile:null,
  activeTab:'dashboard',
  lastSyncedAt:'',
  staffDirectory:[],
  adminUsers:[],
  permissionCatalog:bookingAdminShared.clone(bookingAdminShared.SKYBOOK_PERMISSION_CATALOG||[]),
  roleDefaults:bookingAdminShared.clone(bookingAdminShared.SKYBOOK_ROLE_DEFAULTS||{}),
  brands:[],
  bookings:[],
  customers:[],
  payments:[],
  services:[],
  schedules:[],
  dateRules:[],
  blackoutDates:[],
  coupons:[],
  vouchers:[],
  agents:[],
  operators:[],
  bookingOperators:[],
  resources:[],
  resourceAllocations:[],
  invoices:[],
  officeInvoices:[],
  refunds:[],
  paymentTransactions:[],
  webhookEndpoints:[],
  supportedLanguages:[],
  supportedCurrencies:[],
  customerAccounts:[],
  calendarConnections:[],
  emailLogs:[],
  statusHistory:[],
  adminNotes:[],
  bookingTasks:[],
  bookingDocuments:[],
  bookingMemories:[],
  bookingDocumentVersions:[],
  portalRequests:[],
  portalSessions:[],
  systemJobs:[],
  healthEvents:[],
  reconciliationRecords:[],
  opsTemplates:{
    internalNoteTemplates:[],
    cancellationReasonTemplates:[],
    refundReasonTemplates:[]
  },
  lifecycleRules:{},
  settings:bookingAdminShared.readConfig(),
  emailTemplates:bookingAdminShared.clone(bookingAdminShared.DEFAULT_EMAIL_TEMPLATES),
  automationRules:{
    autoConfirmPaidBookings:true,
    autoCompletePastConfirmedBookings:false,
    autoCancelExpiredAwaitingPayment:false,
    awaitingPaymentExpiryHours:48,
    sendOnBookingMade:true,
    sendOnBookingConfirmed:true,
    sendOnPaymentReceived:true,
    sendOnCancellationRefund:true
  },
  portalSettings:{
    enabled:true,
    allowBookingLookup:true,
    allowSelfServiceRequests:false,
    allowDocumentDownloads:true,
    sessionDurationHours:72,
    portalBaseUrl:'/portal.html'
  },
  queueSettings:{
    enabled:true,
    autoProcessOnBootstrap:true,
    reminderDelayHours:12,
    maxJobsPerSweep:25
  },
  integrationSettings:{
    whatsapp:{enabled:false},
    googleCalendar:{enabled:false},
    webhooks:{enabled:true}
  },
  reportingSettings:{
    defaultWindowDays:30,
    showOutstandingCommissions:true,
    showRefundExposure:true
  },
  reports:{
    overview:{},
    status_breakdown:[],
    recent_guest_invoices:[],
    recent_office_invoices:[],
    recent_refunds:[]
  },
  calendarView:'day',
  calendarFocusDate:bookingAdminShared.currentDate(),
  bookingQuickFilter:'',
  selectedBookingId:'',
  selectedCustomerId:'',
  selectedServiceId:'',
  isServiceModalOpen:false,
  isBookingModalOpen:false
}

const getAdminRouteState=()=>{
  try{
    const params=new URLSearchParams(window.location.search)
    return {
      tab:String(params.get('tab')||'').trim(),
      serviceId:String(params.get('service')||'').trim(),
      bookingId:String(params.get('booking')||'').trim(),
      reservationId:String(params.get('reservation')||'').trim()
    }
  }catch{
    return {tab:'',serviceId:'',bookingId:'',reservationId:''}
  }
}

const syncAdminRouteState=({tab='',serviceId='',bookingId='',reservationId=''}={})=>{
  try{
    const currentUrl=new URL(window.location.href)
    if(tab)currentUrl.searchParams.set('tab',tab)
    else currentUrl.searchParams.delete('tab')
    if(tab==='services'&&serviceId)currentUrl.searchParams.set('service',serviceId)
    else currentUrl.searchParams.delete('service')
    if(tab==='bookings'&&bookingId)currentUrl.searchParams.set('booking',bookingId)
    else currentUrl.searchParams.delete('booking')
    if(tab==='reservations'&&reservationId)currentUrl.searchParams.set('reservation',reservationId)
    else currentUrl.searchParams.delete('reservation')
    history.replaceState(null,'',`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
  }catch{}
}

const nodes={
  authGate:document.getElementById('adminAuthGate'),
  appShell:document.getElementById('adminAppShell'),
  loadingScreen:document.getElementById('adminLoadingScreen'),
  loadingStatus:document.getElementById('adminLoadingStatus'),
  authStatus:document.getElementById('authStatus'),
  resetAuthCacheButton:document.getElementById('resetAuthCacheButton'),
  authEnvironmentMeta:document.getElementById('authEnvironmentMeta'),
  loginForm:document.getElementById('loginForm'),
  logoutButton:document.getElementById('logoutButton'),
  sessionLabel:document.getElementById('sessionLabel'),
  topSessionLabel:document.getElementById('topSessionLabel'),
  adminStatus:document.getElementById('bookingAdminStatus'),
  moduleBreadcrumb:document.getElementById('moduleBreadcrumb'),
  moduleEyebrow:document.getElementById('moduleEyebrow'),
  moduleTitle:document.getElementById('moduleTitle'),
  moduleSubtitle:document.getElementById('moduleSubtitle'),
  tabs:[...document.querySelectorAll('[data-admin-tab]')],
  views:[...document.querySelectorAll('[data-admin-view]')],
  executiveRadarCards:document.getElementById('executiveRadarCards'),
  dashboardCards:document.getElementById('dashboardCards'),
  dashboardActionQueue:document.getElementById('dashboardActionQueue'),
  dashboardArrivalsTable:document.getElementById('dashboardArrivalsTable'),
  dashboardTomorrowPrepTable:document.getElementById('dashboardTomorrowPrepTable'),
  dashboardPendingTable:document.getElementById('dashboardPendingTable'),
  dashboardAlertsTable:document.getElementById('dashboardAlertsTable'),
  dashboardUnpaidTable:document.getElementById('dashboardUnpaidTable'),
  dashboardRefundsTable:document.getElementById('dashboardRefundsTable'),
  dashboardPayoutsTable:document.getElementById('dashboardPayoutsTable'),
  dashboardRecentBookingsTable:document.getElementById('dashboardRecentBookingsTable'),
  notificationCards:document.getElementById('notificationCards'),
  notificationsTable:document.getElementById('notificationsTable'),
  calendarViewButtons:[...document.querySelectorAll('[data-calendar-view]')],
  calendarFocusDate:document.getElementById('calendarFocusDate'),
  calendarSummaryCards:document.getElementById('calendarSummaryCards'),
  calendarCanvas:document.getElementById('calendarCanvas'),
  reportsOverviewCards:document.getElementById('reportsOverviewCards'),
  reportsStatusTable:document.getElementById('reportsStatusTable'),
  reportsGuestInvoicesTable:document.getElementById('reportsGuestInvoicesTable'),
  reportsOfficeInvoicesTable:document.getElementById('reportsOfficeInvoicesTable'),
  reconciliationCards:document.getElementById('reconciliationCards'),
  reconciliationTable:document.getElementById('reconciliationTable'),
  auditTable:document.getElementById('auditTable'),
  lifecycleMatrix:document.getElementById('lifecycleMatrix'),
  launchReadinessSummary:document.getElementById('launchReadinessSummary'),
  launchReadinessCards:document.getElementById('launchReadinessCards'),
  launchReadinessTable:document.getElementById('launchReadinessTable'),
  healthCards:document.getElementById('healthCards'),
  systemJobsTable:document.getElementById('systemJobsTable'),
  healthEventsTable:document.getElementById('healthEventsTable'),
  bookingFilterSearch:document.getElementById('bookingFilterSearch'),
  bookingFilterBrand:document.getElementById('bookingFilterBrand'),
  bookingFilterSource:document.getElementById('bookingFilterSource'),
  bookingFilterStatus:document.getElementById('bookingFilterStatus'),
  bookingFilterPaymentStatus:document.getElementById('bookingFilterPaymentStatus'),
  bookingFilterService:document.getElementById('bookingFilterService'),
  bookingFilterOperator:document.getElementById('bookingFilterOperator'),
  bookingFilterAgent:document.getElementById('bookingFilterAgent'),
  bookingFilterDateFrom:document.getElementById('bookingFilterDateFrom'),
  bookingFilterDateTo:document.getElementById('bookingFilterDateTo'),
  toggleBookingFilters:document.getElementById('toggleBookingFilters'),
  bookingFiltersPanel:document.getElementById('bookingFiltersPanel'),
  bookingsTable:document.getElementById('adminBookingsTable'),
  bookingDetail:document.getElementById('adminBookingDetail'),
  bookingForm:document.getElementById('adminBookingForm'),
  bookingModal:document.getElementById('bookingModal'),
  bookingModalTitle:document.getElementById('bookingModalTitle'),
  closeBookingModalButton:document.getElementById('closeBookingModalButton'),
  bookingReference:document.getElementById('adminBookingReference'),
  bookingBrand:document.getElementById('adminBookingBrand'),
  bookingSource:document.getElementById('adminBookingSource'),
  bookingService:document.getElementById('adminBookingService'),
  bookingStatus:document.getElementById('adminBookingStatusField'),
  bookingPaymentStatus:document.getElementById('adminBookingPaymentStatusField'),
  bookingDate:document.getElementById('adminBookingDate'),
  bookingQuantity:document.getElementById('adminBookingQuantity'),
  bookingCustomerName:document.getElementById('adminBookingCustomerName'),
  bookingCustomerEmail:document.getElementById('adminBookingCustomerEmail'),
  bookingCustomerPhone:document.getElementById('adminBookingCustomerPhone'),
  bookingNotes:document.getElementById('adminBookingNotes'),
  bookingSaveButton:document.getElementById('adminBookingSaveButton'),
  bookingNewButton:document.getElementById('adminBookingNewButton'),
  reservationsTable:document.getElementById('adminReservationsTable'),
  reservationDetail:document.getElementById('adminReservationDetail'),
  servicesTable:document.getElementById('adminServicesTable'),
  serviceOverviewCards:document.getElementById('serviceOverviewCards'),
  serviceFilterBrand:document.getElementById('serviceFilterBrand'),
  openServiceModalButton:document.getElementById('openServiceModalButton'),
  serviceModal:document.getElementById('serviceModal'),
  serviceModalTitle:document.getElementById('serviceModalTitle'),
  closeServiceModalButton:document.getElementById('closeServiceModalButton'),
  serviceForm:document.getElementById('adminServiceForm'),
  serviceId:document.getElementById('adminServiceId'),
  serviceName:document.getElementById('adminServiceName'),
  serviceSlug:document.getElementById('adminServiceSlug'),
  serviceCategory:document.getElementById('adminServiceCategory'),
  servicePrice:document.getElementById('adminServicePrice'),
  serviceDateRule:document.getElementById('adminServiceDateRule'),
  serviceDuration:document.getElementById('adminServiceDuration'),
  serviceMinPax:document.getElementById('adminServiceMinPax'),
  serviceDepartureWindow:document.getElementById('adminServiceDepartureWindow'),
  servicePickupTime:document.getElementById('adminServicePickupTime'),
  serviceSummary:document.getElementById('adminServiceSummary'),
  serviceLearnMoreDescription:document.getElementById('adminServiceLearnMoreDescription'),
  serviceHighlights:document.getElementById('adminServiceHighlights'),
  serviceLandscapeImages:document.getElementById('adminServiceLandscapeImages'),
  serviceBrandTrueTravel:document.getElementById('adminServiceBrandTrueTravel'),
  serviceBrandIventure:document.getElementById('adminServiceBrandIventure'),
  serviceActive:document.getElementById('adminServiceActive'),
  customersTable:document.getElementById('adminCustomersTable'),
  customerFilterSearch:document.getElementById('customerFilterSearch'),
  customerFilterBrand:document.getElementById('customerFilterBrand'),
  customerFilterSource:document.getElementById('customerFilterSource'),
  crmOverviewCards:document.getElementById('crmOverviewCards'),
  customerDetail:document.getElementById('adminCustomerDetail'),
  paymentsTable:document.getElementById('adminPaymentsTable'),
  refundsTable:document.getElementById('adminRefundsTable'),
  adminUsersTable:document.getElementById('adminUsersTable'),
  adminUserForm:document.getElementById('adminUserForm'),
  adminUserId:document.getElementById('adminUserId'),
  adminUserUsername:document.getElementById('adminUserUsername'),
  adminUserPassword:document.getElementById('adminUserPassword'),
  adminUserFullName:document.getElementById('adminUserFullName'),
  adminUserRole:document.getElementById('adminUserRole'),
  adminUserActive:document.getElementById('adminUserActive'),
  adminUserPermissions:document.getElementById('adminUserPermissions'),
  adminUserSaveButton:document.getElementById('adminUserSaveButton'),
  settingsForm:document.getElementById('bookingSettingsForm'),
  emailAutomationForm:document.getElementById('emailAutomationForm'),
  emailTriggerBookingMade:document.getElementById('emailTriggerBookingMade'),
  emailTriggerBookingConfirmed:document.getElementById('emailTriggerBookingConfirmed'),
  emailTriggerPaymentReceived:document.getElementById('emailTriggerPaymentReceived'),
  emailTriggerCancellationRefund:document.getElementById('emailTriggerCancellationRefund'),
  emailSenderTrueTravel:document.getElementById('emailSenderTrueTravel'),
  emailTemplatesForm:document.getElementById('emailTemplatesForm'),
  exportButton:document.getElementById('exportBookingsCsv'),
  enginePrimaryPanel:document.getElementById('adminEnginePrimaryPanel'),
  engineSecondaryPanel:document.getElementById('adminEngineSecondaryPanel'),
  enginePrimaryTitle:document.getElementById('adminEnginePrimaryTitle'),
  engineSecondaryTitle:document.getElementById('adminEngineSecondaryTitle'),
  engineSchedulesTable:document.getElementById('adminEngineSchedulesTable'),
  commercialToolsTable:document.getElementById('adminCommercialToolsTable'),
  platformPrimaryPanel:document.getElementById('adminPlatformPrimaryPanel'),
  platformSecondaryPanel:document.getElementById('adminPlatformSecondaryPanel'),
  platformPrimaryTitle:document.getElementById('adminPlatformPrimaryTitle'),
  platformSecondaryTitle:document.getElementById('adminPlatformSecondaryTitle'),
  platformOperationsTable:document.getElementById('adminPlatformOperationsTable'),
  platformConfigTable:document.getElementById('adminPlatformConfigTable'),
  scheduleForm:document.getElementById('adminScheduleForm'),
  scheduleService:document.getElementById('adminScheduleService'),
  scheduleDay:document.getElementById('adminScheduleDay'),
  scheduleStart:document.getElementById('adminScheduleStart'),
  scheduleEnd:document.getElementById('adminScheduleEnd'),
  scheduleCutoff:document.getElementById('adminScheduleCutoff'),
  blackoutForm:document.getElementById('adminBlackoutForm'),
  blackoutService:document.getElementById('adminBlackoutService'),
  blackoutStart:document.getElementById('adminBlackoutStart'),
  blackoutEnd:document.getElementById('adminBlackoutEnd'),
  blackoutReason:document.getElementById('adminBlackoutReason'),
  couponForm:document.getElementById('adminCouponForm'),
  couponCode:document.getElementById('adminCouponCode'),
  couponType:document.getElementById('adminCouponType'),
  couponValue:document.getElementById('adminCouponValue'),
  couponDescription:document.getElementById('adminCouponDescription'),
  voucherForm:document.getElementById('adminVoucherForm'),
  voucherCode:document.getElementById('adminVoucherCode'),
  voucherValue:document.getElementById('adminVoucherValue'),
  voucherExpiry:document.getElementById('adminVoucherExpiry'),
  agentForm:document.getElementById('adminAgentForm'),
  agentCode:document.getElementById('adminAgentCode'),
  agentCompany:document.getElementById('adminAgentCompany'),
  agentCommissionType:document.getElementById('adminAgentCommissionType'),
  agentCommissionValue:document.getElementById('adminAgentCommissionValue'),
  resourceForm:document.getElementById('adminResourceForm'),
  resourceName:document.getElementById('adminResourceName'),
  resourceSlug:document.getElementById('adminResourceSlug'),
  resourceType:document.getElementById('adminResourceType'),
  resourceCapacity:document.getElementById('adminResourceCapacity'),
  resourceAbundant:document.getElementById('adminResourceAbundant'),
  refundForm:document.getElementById('adminRefundForm'),
  refundBookingId:document.getElementById('adminRefundBookingId'),
  refundAmount:document.getElementById('adminRefundAmount'),
  refundReason:document.getElementById('adminRefundReason'),
  automationRulesForm:document.getElementById('automationRulesForm'),
  automationAutoConfirmPaid:document.getElementById('automationAutoConfirmPaid'),
  automationAutoCompletePast:document.getElementById('automationAutoCompletePast'),
  automationExpiryHours:document.getElementById('automationExpiryHours'),
  portalSettingsForm:document.getElementById('portalSettingsForm'),
  portalEnabled:document.getElementById('portalEnabled'),
  portalLookupEnabled:document.getElementById('portalLookupEnabled'),
  portalBaseUrl:document.getElementById('portalBaseUrl'),
  portalSessionDurationHours:document.getElementById('portalSessionDurationHours'),
  webhookForm:document.getElementById('adminWebhookForm'),
  webhookName:document.getElementById('adminWebhookName'),
  webhookUrl:document.getElementById('adminWebhookUrl'),
  webhookEvents:document.getElementById('adminWebhookEvents'),
  operatorForm:document.getElementById('adminOperatorForm'),
  operatorCode:document.getElementById('adminOperatorCode'),
  operatorCompany:document.getElementById('adminOperatorCompany'),
  operatorContactName:document.getElementById('adminOperatorContactName'),
  operatorEmail:document.getElementById('adminOperatorEmail'),
  operatorPhone:document.getElementById('adminOperatorPhone'),
  operatorPreferredContact:document.getElementById('adminOperatorPreferredContact'),
  operatorCommissionType:document.getElementById('adminOperatorCommissionType'),
  operatorCommissionValue:document.getElementById('adminOperatorCommissionValue'),
  operatorTerms:document.getElementById('adminOperatorTerms'),
  operatorServicesHandled:document.getElementById('adminOperatorServicesHandled'),
  operatorBankingDetails:document.getElementById('adminOperatorBankingDetails'),
  operatorSettlementMetadata:document.getElementById('adminOperatorSettlementMetadata'),
  officeInvoiceForm:document.getElementById('adminOfficeInvoiceForm'),
  officeInvoiceBookingId:document.getElementById('adminOfficeInvoiceBookingId'),
  officeInvoiceType:document.getElementById('adminOfficeInvoiceType'),
  officePayeeType:document.getElementById('adminOfficePayeeType'),
  officeOperatorId:document.getElementById('adminOfficeOperatorId'),
  officeAgentId:document.getElementById('adminOfficeAgentId'),
  officeCommissionBase:document.getElementById('adminOfficeCommissionBase'),
  officeCommissionAmount:document.getElementById('adminOfficeCommissionAmount'),
  officeInvoiceNotes:document.getElementById('adminOfficeInvoiceNotes'),
  openCommandPalette:document.getElementById('openCommandPalette'),
  toolbarCommandPalette:document.getElementById('toolbarCommandPalette'),
  quickCreateBooking:document.getElementById('quickCreateBooking'),
  toggleTableDensity:document.getElementById('toggleTableDensity'),
  sidebarToggle:document.getElementById('mobileSidebarToggle'),
  sidebarBackdrop:document.getElementById('sidebarBackdrop'),
  commandPalette:document.getElementById('commandPalette'),
  commandPaletteInput:document.getElementById('commandPaletteInput'),
  commandPaletteResults:document.getElementById('commandPaletteResults'),
  toastStack:document.getElementById('toastStack'),
  runJobsNowButton:document.getElementById('runJobsNowButton')
}

const isMobileSidebarViewport=()=>window.innerWidth<=980

const closeMobileSidebar=()=>{
  document.body.classList.remove('is-sidebar-open','skybook-sidebar-locked')
  nodes.sidebarToggle?.setAttribute('aria-expanded','false')
}

const openMobileSidebar=()=>{
  if(!isMobileSidebarViewport())return
  document.body.classList.add('is-sidebar-open','skybook-sidebar-locked')
  nodes.sidebarToggle?.setAttribute('aria-expanded','true')
}

const toggleMobileSidebar=()=>{
  if(document.body.classList.contains('is-sidebar-open'))closeMobileSidebar()
  else openMobileSidebar()
}

const MODULE_META={
  dashboard:{
    group:'Command',
    eyebrow:'Live Operations Dashboard',
    title:'Command Center',
    subtitle:'Enterprise control for arrivals, confirmations, unpaid exposure, supplier payouts, refunds, and multibrand guest service.'
  },
  notifications:{
    group:'Command',
    eyebrow:'Exceptions And Alerts',
    title:'Notification Center',
    subtitle:'Failed payments, overdue balances, unassigned operators, incomplete bookings, and operational follow-ups in one queue.'
  },
  calendar:{
    group:'Command',
    eyebrow:'Calendar And Manifest',
    title:'Operations Calendar',
    subtitle:'Day, week, and month planning for bookings, tours, pickup windows, assigned operators, vehicles, and resources.'
  },
  reservations:{
    group:'Reservations',
    eyebrow:'Reservation Review',
    title:'Reservations',
    subtitle:'Website submissions from True Travel and Iventure wait here for review before they become payable bookings.'
  },
  bookings:{
    group:'Reservations',
    eyebrow:'Booking Workspace',
    title:'Bookings',
    subtitle:'Accepted reservations and admin-created bookings that now need payment, documents, operators, notes, and guest communication.'
  },
  customers:{
    group:'Reservations',
    eyebrow:'Customer Intelligence',
    title:'Customers And CRM',
    subtitle:'Customer profiles, booking history, portal actions, communications, support context, and guest service follow-up.'
  },
  services:{
    group:'Reservations',
    eyebrow:'Tour Product Setup',
    title:'Services And Tours',
    subtitle:'Shared tour catalogue for True Travel and Iventure with pricing, summaries, duration, highlights, and availability rules.'
  },
  engine:{
    group:'Inventory',
    eyebrow:'Availability Engine',
    title:'Availability Engine',
    subtitle:'Operating schedules, blackout dates, departure windows, resources, vehicles, kayaks, boats, guides, drivers, rates, and vouchers.'
  },
  resources:{
    group:'Inventory',
    eyebrow:'Fleet And Capacity',
    title:'Resources And Capacity',
    subtitle:'Manage vehicles, vessels, guides, refund-linked operational assets, and live resource capacity for booked departures.'
  },
  rates:{
    group:'Inventory',
    eyebrow:'Commercial Tools',
    title:'Rates And Promotions',
    subtitle:'Control coupons, vouchers, reseller structures, and other commercial levers that shape the live booking offer.'
  },
  payments:{
    group:'Revenue',
    eyebrow:'Payment Operations',
    title:'Payments',
    subtitle:'Payment status, guest balances, deposits, provider timelines, and incoming payment activity across the booking system.'
  },
  refunds:{
    group:'Revenue',
    eyebrow:'Refund Control',
    title:'Refunds',
    subtitle:'A dedicated finance module for refund processing, cancellation payouts, and the refund register.'
  },
  reconciliation:{
    group:'Revenue',
    eyebrow:'Finance Control',
    title:'Reconciliation',
    subtitle:'Match guest payments, invoices, refunds, commissions, operator payouts, and settlement records in a finance-first workflow.'
  },
  platform:{
    group:'Revenue',
    eyebrow:'Documents And Settlements',
    title:'Invoices And Settlements',
    subtitle:'Guest invoices, receipts, vouchers, manifests, office invoices, operator statements, and commission/payout separation.'
  },
  invoices:{
    group:'Revenue',
    eyebrow:'Documents And Settlements',
    title:'Invoices And Settlements',
    subtitle:'Manage guest invoices, refunds, office settlements, operator configuration, and finance-facing integrations from one workspace.'
  },
  reports:{
    group:'Revenue',
    eyebrow:'Performance Analytics',
    title:'Reports And Analytics',
    subtitle:'Sales by brand, bookings by source, commission due, operator payouts, unpaid invoices, cancellations, refunds, and tour performance.'
  },
  emails:{
    group:'Automation',
    eyebrow:'Template Operations',
    title:'Templates And Reminders',
    subtitle:'Email, invoice, voucher, terms, reminder, follow-up, confirmation, and internal note templates by brand.'
  },
  health:{
    group:'Automation',
    eyebrow:'System Reliability',
    title:'System Health',
    subtitle:'Job queues, failed emails, failing webhooks, callback errors, automation readiness, and launch-grade operational monitoring.'
  },
  audit:{
    group:'Automation',
    eyebrow:'Accountability',
    title:'Audit Trail',
    subtitle:'Every booking change, payment update, refund action, admin action, and operational handoff captured for traceability.'
  },
  settings:{
    group:'Administration',
    eyebrow:'Platform Settings',
    title:'Settings',
    subtitle:'Brand rules, booking terms, portal defaults, API behavior, automation settings, payment gateway readiness, and production configuration.'
  },
  'admin-users':{
    group:'Administration',
    eyebrow:'Access Governance',
    title:'Users And Roles',
    subtitle:'Super admin role control for reservations, finance, operations, supplier management, reporting, design, and system settings.'
  }
}

const showToast=(message,type='info')=>{
  if(!nodes.toastStack||!message)return
  const toast=document.createElement('div')
  toast.className=`toast is-${type}`
  toast.textContent=message
  nodes.toastStack.appendChild(toast)
  window.setTimeout(()=>toast.classList.add('is-visible'),20)
  window.setTimeout(()=>{
    toast.classList.remove('is-visible')
    window.setTimeout(()=>toast.remove(),220)
  },4200)
}

const renderModuleChrome=tab=>{
  const meta=MODULE_META[tab]||MODULE_META.dashboard
  if(nodes.moduleBreadcrumb)nodes.moduleBreadcrumb.textContent=`SkyBook / ${meta.group} / ${meta.title}`
  if(nodes.moduleEyebrow)nodes.moduleEyebrow.textContent=meta.eyebrow
  if(nodes.moduleTitle)nodes.moduleTitle.textContent=meta.title
  if(nodes.moduleSubtitle)nodes.moduleSubtitle.textContent=meta.subtitle
}

const getDashboardUrl=()=>{
  const fallback='booking-admin.html'
  try{
    const next=new URLSearchParams(window.location.search).get('next')
    return next || fallback
  }catch{
    return fallback
  }
}

const redirectToLogin=()=>{
  const currentPath=`${window.location.pathname.split('/').pop()||'booking-admin.html'}${window.location.search}${window.location.hash}`
  const next=encodeURIComponent(currentPath)
  window.location.replace(`login.html?next=${next}`)
}

const setAdminStatus=(message,isError=false)=>{
  if(!nodes.adminStatus)return
  const timeLabel=new Date().toLocaleString('en-NA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
  nodes.adminStatus.textContent=isError ? message : `${message} Last sync ${timeLabel}.`
  nodes.adminStatus.classList.toggle('is-error',isError)
  const shouldToast=isError||/(saved|created|updated|generated|queued|sent|cancelled|cleared|assigned|paid|confirmed|completed|rescheduled|duplicated|signed out|failed)/i.test(message)
  if(shouldToast)showToast(message,isError?'error':'success')
}

const setAuthStatus=(message,isError=false)=>{
  if(!nodes.authStatus){
    if(nodes.loadingStatus){
      nodes.loadingStatus.textContent=message
      nodes.loadingStatus.classList.toggle('is-error',isError)
    }
    setAdminStatus(message,isError)
    return
  }
  nodes.authStatus.textContent=message
  nodes.authStatus.classList.toggle('is-error',isError)
}

const fixLegacyText=value=>{
  const source=window.TrueTravelShared?.fixLegacyText
  return source ? source(String(value ?? '')) : String(value ?? '')
}

const formatDisplayLabel=value=>fixLegacyText(value).replace(/_/g,' ').trim()
const normalizeText=value=>fixLegacyText(value ?? '').trim().toLowerCase()

const BRAND_VISIBILITY_LABELS={
  'true-travel':'True Travel',
  'iventure':'Iventure'
}

const normalizeCodeList=value=>(Array.isArray(value) ? value : []).map(item=>normalizeText(item)).filter(Boolean)
const formatBrandLabel=value=>BRAND_VISIBILITY_LABELS[normalizeText(value)] || formatDisplayLabel(value)
const formatSourceLabel=value=>formatDisplayLabel(value || 'website')
const renderChipGroup=(items,{formatter=value=>formatDisplayLabel(value),fallback='Not captured'}={})=>{
  const normalized=normalizeCodeList(items)
  if(!normalized.length)return `<div class="table-subline">${bookingAdminShared.escapeHtml(fallback)}</div>`
  return `<div class="badge-stack">${normalized.map(item=>`<span class="booking-chip">${bookingAdminShared.escapeHtml(formatter(item))}</span>`).join('')}</div>`
}

const rawEscapeHtml=bookingAdminShared.escapeHtml.bind(bookingAdminShared)
bookingAdminShared.escapeHtml=value=>rawEscapeHtml(fixLegacyText(value))

const clearSkybookCache=()=>{
  [
    'skybook-booking-config-v2',
    'skybook-booking-ui-state-v2',
    'skybook-booking-demo-db-v2',
    'skybook-supabase-config-v2',
    'true-travel-booking-config-v1',
    'true-travel-supabase-config-v1'
  ].forEach(key=>localStorage.removeItem(key))
}

const renderAuthEnvironmentMeta=()=>{
  if(!nodes.authEnvironmentMeta)return
  const config=bookingAdminShared.readConfig()
  nodes.authEnvironmentMeta.textContent=`Connected to ${config.supabaseUrl} using ${config.brandCode} defaults`
}

const syncSessionLabel=()=>{
  if(!state.session?.access_token)return
  const identity=state.profile?.full_name||state.profile?.username||state.user?.user_metadata?.username||state.user?.email||'Admin'
  const label=`${identity} - ${formatDisplayLabel(state.profile?.role||'admin')}`
  if(nodes.sessionLabel)nodes.sessionLabel.textContent=label
  if(nodes.topSessionLabel)nodes.topSessionLabel.textContent=label
}

const parseDateValue=value=>{
  if(!value)return null
  const stamp=String(value).includes('T') ? String(value) : `${value}T00:00:00`
  const next=new Date(stamp)
  return Number.isNaN(next.getTime()) ? null : next
}

const formatDateLabel=value=>{
  const parsed=parseDateValue(value)
  if(!parsed)return 'TBC'
  return parsed.toLocaleDateString('en-NA',{day:'2-digit',month:'short',year:'numeric'})
}

const formatDateTimeLabel=value=>{
  const parsed=parseDateValue(value)
  if(!parsed)return 'Not logged'
  return parsed.toLocaleString('en-NA',{day:'2-digit',month:'short',hour:'2-digit',minute:'2-digit'})
}

const getTodayKey=()=>bookingAdminShared.currentDate()
const normalizeDateKey=value=>parseDateValue(value)?.toISOString().slice(0,10)||''
const sameDate=(left,right)=>normalizeDateKey(left)===normalizeDateKey(right)

const getStatusBadgeClass=value=>{
  const normalized=String(value||'').toLowerCase()
  if(['ready','confirmed','completed','paid','active','default'].includes(normalized))return 'is-good'
  if(['attention','pending','awaiting_payment','partially_paid','queued','issued','investigating','processing','normal','high','needs_review'].includes(normalized))return 'is-warn'
  if(['blocked','cancelled','failed','refunded','inactive','critical','error'].includes(normalized))return 'is-bad'
  return 'is-neutral'
}

const renderStatusBadge=(value,label='')=>`<span class="status-badge ${getStatusBadgeClass(value)}">${bookingAdminShared.escapeHtml(label||String(value||'—').replace(/_/g,' '))}</span>`

const sortByDateDesc=(items,key)=>[...items].sort((left,right)=>{
  const leftStamp=parseDateValue(left?.[key])?.getTime()||0
  const rightStamp=parseDateValue(right?.[key])?.getTime()||0
  return rightStamp-leftStamp
})

const getServiceBrandCodes=service=>{
  const configured=Array.isArray(service?.brand_codes)
    ? service.brand_codes.map(value=>String(value||'').trim().toLowerCase()).filter(Boolean)
    : []
  return configured.length ? configured : ['true-travel','iventure']
}

const formatServiceBrandVisibility=service=>{
  const labels=getServiceBrandCodes(service)
    .map(code=>BRAND_VISIBILITY_LABELS[code]||formatDisplayLabel(code))
  if(labels.length===2)return 'True Travel + Iventure'
  return labels[0]||'No brands selected'
}

const formatServiceVisibilityLabel=service=>`${service?.is_active===false ? 'Hidden' : 'Active'} - ${formatServiceBrandVisibility(service)}`

const applyRequestedRoute=()=>{
  const routeState=getAdminRouteState()
  if(routeState.tab||routeState.serviceId||routeState.bookingId||routeState.reservationId){
    switchTab(routeState.tab||'services')
  }
  if(routeState.serviceId){
    const requestedService=state.services.find(item=>item.id===routeState.serviceId)
    if(requestedService)openServiceModal(requestedService)
  }
  const requestedReservationId=routeState.reservationId||''
  if(requestedReservationId){
    const requestedReservation=state.bookings.find(item=>item.id===requestedReservationId)
    if(requestedReservation){
      state.selectedBookingId=requestedReservation.id
      switchTab('reservations')
      renderReservations()
      renderReservationDetail()
    }
  }
  const requestedBookingId=routeState.bookingId||''
  if(requestedBookingId){
    const requestedBooking=state.bookings.find(item=>item.id===requestedBookingId)
    if(requestedBooking){
      openBookingManagementScreen(requestedBooking,{scroll:false})
    }
  }
}

const getBookingInvoices=bookingId=>state.invoices.filter(invoice=>invoice.booking_id===bookingId)
const getBookingOfficeInvoices=bookingId=>state.officeInvoices.filter(invoice=>invoice.booking_id===bookingId)
const getBookingPayments=bookingId=>state.payments.filter(payment=>payment.booking_id===bookingId)
const getBookingTransactions=bookingId=>{
  const paymentIds=new Set(getBookingPayments(bookingId).map(payment=>payment.id))
  return state.paymentTransactions.filter(transaction=>paymentIds.has(transaction.payment_id))
}
const getBookingRefunds=bookingId=>state.refunds.filter(refund=>refund.booking_id===bookingId)
const getBookingEmails=bookingId=>state.emailLogs.filter(log=>log.booking_id===bookingId)
const getBookingHistory=bookingId=>state.statusHistory.filter(history=>history.booking_id===bookingId)
const getBookingNotes=bookingId=>state.adminNotes.filter(note=>note.booking_id===bookingId)
const getBookingAllocations=bookingId=>state.resourceAllocations.filter(allocation=>allocation.booking_id===bookingId)
const getBookingOperatorAssignment=bookingId=>state.bookingOperators.find(item=>item.booking_id===bookingId)
const getBookingTasks=bookingId=>state.bookingTasks.filter(task=>task.booking_id===bookingId)
const getBookingDocuments=bookingId=>state.bookingDocuments.filter(document=>document.booking_id===bookingId)
const getBookingMemories=bookingId=>state.bookingMemories.filter(memory=>memory.booking_id===bookingId)
const getBookingDocumentVersions=bookingId=>state.bookingDocumentVersions.filter(version=>version.booking_id===bookingId)
const getBookingPortalRequests=bookingId=>state.portalRequests.filter(request=>request.booking_id===bookingId)
const getBookingPortalSessions=bookingId=>state.portalSessions.filter(session=>session.booking_id===bookingId)
const getBookingReconciliationRecord=bookingId=>state.reconciliationRecords.find(record=>record.booking_id===bookingId)
const getCustomerBookings=customer=>{
  const customerEmail=String(customer?.email||'').trim().toLowerCase()
  return state.bookings.filter(booking=>booking.customer_id===customer?.id || (customerEmail && String(booking.customer_email||'').trim().toLowerCase()===customerEmail))
}
const getCustomerEmails=customer=>getCustomerBookings(customer).flatMap(booking=>getBookingEmails(booking.id))
const getCustomerPortalRequests=customer=>getCustomerBookings(customer).flatMap(booking=>getBookingPortalRequests(booking.id))
const getCustomerPortalSessions=customer=>getCustomerBookings(customer).flatMap(booking=>getBookingPortalSessions(booking.id))
const normalizeBrandClass=brandCode=>{
  const code=normalizeText(brandCode)
  if(code==='true-travel')return 'true-travel'
  if(code==='iventure')return 'iventure'
  return 'neutral'
}
const getBrandName=brandCode=>state.brands.find(brand=>brand.code===brandCode)?.name||brandCode||'Unassigned'
const renderBrandPill=brandCode=>{
  const brandClass=normalizeBrandClass(brandCode)
  return `<span class="brand-pill is-${bookingAdminShared.escapeHtml(brandClass)}">${bookingAdminShared.escapeHtml(getBrandName(brandCode))}</span>`
}
const isReviewReservation=booking=>['draft','pending'].includes(normalizeText(booking?.status))
const getReviewReservations=()=>state.bookings.filter(isReviewReservation)
const getOperationalBookings=()=>state.bookings.filter(booking=>!isReviewReservation(booking))
const getResourceName=resourceId=>state.resources.find(item=>item.id===resourceId)?.name||resourceId
const isResourceAbundant=resource=>Boolean(resource?.metadata?.abundant_resources)
const getResourceCapacityLabel=resource=>{
  if(isResourceAbundant(resource))return 'Abundant'
  const capacity=Number(resource?.capacity||0)
  return capacity>0 ? String(capacity) : '--'
}
const getResourceStatusLabel=resource=>{
  if(resource?.is_active===false)return 'Inactive'
  return isResourceAbundant(resource) ? 'Abundant' : 'Active'
}
const buildManualEmailDraft=(booking,brandName)=>{
  const brandLabel=brandName || 'SkyBook'
  const guestName=booking?.customer_name || 'Guest'
  const serviceName=booking?.service_name || 'your booking'
  return {
    subject:brandLabel + ' update for ' + serviceName + ' (' + (booking?.reference || '') + ')',
    body:[
      'Hi ' + guestName + ',',
      '',
      'Here is an update on your booking.',
      '',
      'Reference: ' + (booking?.reference || 'TBC'),
      'Service: ' + serviceName,
      'Preferred date: ' + formatDateLabel(booking?.preferred_date),
      'Booking status: ' + formatDisplayLabel(booking?.status || 'pending'),
      'Payment status: ' + formatDisplayLabel(booking?.payment_status || 'pending'),
      '',
      'Kind regards,',
      brandLabel
    ].join('\n')
  }
}
const getStaffName=userId=>state.staffDirectory.find(item=>item.id===userId)?.full_name||state.adminUsers.find(item=>item.id===userId)?.full_name||''

const getOfficeInvoicePartnerName=invoice=>{
  if(invoice.operator_id){
    const operator=state.operators.find(item=>item.id===invoice.operator_id)
    if(operator)return operator.company_name
  }
  if(invoice.agent_id){
    const agent=state.agents.find(item=>item.id===invoice.agent_id)
    if(agent)return agent.company_name
  }
  return invoice.payee_type||'Office'
}

const getBookingOperatorName=booking=>{
  const assignment=getBookingOperatorAssignment(booking.id)
  if(assignment?.operator_id){
    const operator=state.operators.find(item=>item.id===assignment.operator_id)
    if(operator)return operator.company_name
  }
  const officeInvoice=getBookingOfficeInvoices(booking.id).find(invoice=>invoice.operator_id)
  if(officeInvoice)return getOfficeInvoicePartnerName(officeInvoice)
  return 'Unassigned'
}

const getBookingAgentName=booking=>{
  const officeInvoice=getBookingOfficeInvoices(booking.id).find(invoice=>invoice.agent_id)
  if(officeInvoice)return getOfficeInvoicePartnerName(officeInvoice)
  return 'Direct'
}

const getBookingOperatorCommission=booking=>{
  const assignment=getBookingOperatorAssignment(booking.id)
  if(assignment)return Number(assignment.commission_amount||0)
  return sumAmounts(getBookingOfficeInvoices(booking.id).filter(invoice=>invoice.operator_id),'commission_amount')
}

const getBookingChecklist=booking=>{
  const tasks=getBookingTasks(booking.id)
  const invoice=getBookingInvoices(booking.id)[0]
  const hasOperator=getBookingOperatorName(booking)!=='Unassigned'
  const hasResources=getBookingAllocations(booking.id).length>0
  const hasOutstandingPayment=Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0)>0
  const checklist=[
    {label:'Guest details verified',done:Boolean(booking.customer_email&&booking.customer_phone),team:'reservations'},
    {label:'Guest invoice generated',done:Boolean(invoice?.invoice_number),team:'finance'},
    {label:'Payment requirements reviewed',done:!hasOutstandingPayment || ['paid','partially_paid'].includes(String(booking.payment_status||'')),team:'finance'},
    {label:'Operator assigned',done:hasOperator,team:'supplier management'},
    {label:'Pickup resources linked',done:hasResources || !booking.preferred_date,team:'operations'},
    {label:'Follow-up tasks closed',done:tasks.filter(task=>String(task.status||'')==='open').length===0,team:'operations'}
  ]
  return checklist
}

const bookingHasOpenOperationalWork=booking=>{
  const status=String(booking?.status||'').toLowerCase()
  const paymentStatus=String(booking?.payment_status||'').toLowerCase()
  const openTasks=getBookingTasks(booking?.id).some(task=>String(task.status||'')==='open')
  const hasOutstanding=Number(booking?.amount_due_now||0)+Number(booking?.amount_due_later||0)>0
  const needsOperator=['pending','awaiting_payment','confirmed'].includes(status)&&getBookingOperatorName(booking)==='Unassigned'
  return openTasks||status==='pending'||status==='awaiting_payment'||needsOperator||hasOutstanding||['failed','unpaid','partially_paid'].includes(paymentStatus)
}

const bookingMatchesQuickFilter=(booking,filter=state.bookingQuickFilter)=>{
  const key=normalizeText(filter)
  if(!key)return true
  const status=String(booking?.status||'').toLowerCase()
  const paymentStatus=String(booking?.payment_status||'').toLowerCase()
  const hasOutstanding=Number(booking?.amount_due_now||0)+Number(booking?.amount_due_later||0)>0
  const bookingDate=parseDateValue(booking?.preferred_date)
  const today=parseDateValue(getTodayKey())
  const nextWeek=parseDateValue(getTodayKey())
  if(nextWeek)nextWeek.setDate(nextWeek.getDate()+7)
  if(key==='needs_action')return bookingHasOpenOperationalWork(booking)
  if(key==='unpaid')return hasOutstanding||['pending','unpaid','partially_paid','authorized','failed'].includes(paymentStatus)
  if(key==='unassigned')return ['pending','awaiting_payment','confirmed'].includes(status)&&getBookingOperatorName(booking)==='Unassigned'
  if(key==='upcoming')return Boolean(bookingDate&&today&&nextWeek&&bookingDate>=today&&bookingDate<=nextWeek&&!['cancelled','completed'].includes(status))
  return true
}

const updateBookingQuickFilterBar=()=>{
  document.querySelectorAll('[data-booking-quick-filter]').forEach(button=>{
    const key=button.dataset.bookingQuickFilter||''
    button.classList.toggle('is-active',key===state.bookingQuickFilter)
  })
  const operationalBookings=getOperationalBookings()
  const countMap={
    all:operationalBookings.length,
    needs_action:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'needs_action')).length,
    unpaid:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'unpaid')).length,
    unassigned:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'unassigned')).length,
    upcoming:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'upcoming')).length
  }
  Object.entries(countMap).forEach(([key,count])=>{
    const node=document.querySelector(`[data-filter-count="${key}"]`)
    if(node)node.textContent=String(count)
  })
}

const buildOperationalAlerts=()=>{
  const alerts=[]
  const now=new Date()
  const tomorrow=new Date(now)
  tomorrow.setDate(tomorrow.getDate()+1)
  const paymentByBooking=new Map(state.payments.map(payment=>[payment.booking_id,payment]))
  const officeInvoiceByBooking=new Map(state.officeInvoices.map(invoice=>[invoice.booking_id,invoice]))

  state.payments.forEach(payment=>{
    if(String(payment.status||'').toLowerCase()!=='failed')return
    alerts.push({
      category:'Failed payment',
      reference:payment.reference||'Unlinked payment',
      priority:'critical',
      message:`${payment.provider||'Payment provider'} failed to collect ${bookingAdminShared.formatMoney(payment.amount||0,payment.currency_code||state.settings.currency)}.`,
      when:payment.created_at||payment.paid_at||'',
      booking_id:payment.booking_id||''
    })
  })

  state.bookings.forEach(booking=>{
    const outstanding=Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0)
    const preferredDate=parseDateValue(booking.preferred_date)
    const openTasks=getBookingTasks(booking.id).filter(task=>String(task.status||'')==='open').length
    if(outstanding>0 && ['pending','awaiting_payment','confirmed'].includes(String(booking.status||''))){
      alerts.push({
        category:'Overdue balance',
        reference:booking.reference,
        priority:preferredDate && preferredDate < now ? 'critical' : 'high',
        message:`Outstanding balance ${bookingAdminShared.formatMoney(outstanding,booking.currency||state.settings.currency)} still open.`,
        when:booking.preferred_date||booking.created_at||'',
        booking_id:booking.id
      })
    }
    if(['confirmed','completed'].includes(String(booking.status||'')) && getBookingOperatorName(booking)==='Unassigned'){
      alerts.push({
        category:'Unassigned operator',
        reference:booking.reference,
        priority:'critical',
        message:'Booking is live but no operator has been assigned yet.',
        when:booking.preferred_date||booking.updated_at||'',
        booking_id:booking.id
      })
    }
    if(openTasks>0){
      alerts.push({
        category:'Incomplete workflow',
        reference:booking.reference,
        priority:openTasks>2 ? 'high' : 'normal',
        message:`${openTasks} open operational task${openTasks===1 ? '' : 's'} remain on this booking.`,
        when:booking.updated_at||booking.created_at||'',
        booking_id:booking.id
      })
    }
    if(preferredDate && normalizeDateKey(preferredDate)===normalizeDateKey(tomorrow) && officeInvoiceByBooking.has(booking.id)===false && getBookingOperatorName(booking)!=='Unassigned'){
      alerts.push({
        category:'Settlement follow-up',
        reference:booking.reference,
        priority:'normal',
        message:'Tomorrow departure has an operator but no office settlement attached yet.',
        when:booking.preferred_date,
        booking_id:booking.id
      })
    }
  })

  state.refunds.forEach(refund=>{
    if(!['processed','approved'].includes(String(refund.status||'').toLowerCase()))return
    alerts.push({
      category:'Refund review',
      reference:state.bookings.find(item=>item.id===refund.booking_id)?.reference||refund.booking_id||'',
      priority:'normal',
      message:refund.reason||'Refund logged and ready for reconciliation review.',
      when:refund.processed_at||refund.created_at||'',
      booking_id:refund.booking_id||''
    })
  })

  state.systemJobs.forEach(job=>{
    const status=String(job.status||'').toLowerCase()
    if(!['failed','queued'].includes(status))return
    alerts.push({
      category:status==='failed' ? 'Failed job' : 'Queued job',
      reference:job.job_type||'system job',
      priority:status==='failed' ? 'critical' : 'normal',
      message:job.last_error||`${formatDisplayLabel(job.job_type||'job')} is waiting to run.`,
      when:job.run_at||job.created_at||'',
      booking_id:job.booking_id||''
    })
  })

  state.emailLogs.forEach(log=>{
    if(String(log.status||'').toLowerCase()!=='failed')return
    alerts.push({
      category:'Failed email',
      reference:state.bookings.find(item=>item.id===log.booking_id)?.reference||log.recipient_email||'Email',
      priority:'high',
      message:log.error_message||log.subject||'Email delivery failed.',
      when:log.created_at||log.sent_at||'',
      booking_id:log.booking_id||''
    })
  })

  state.healthEvents.forEach(event=>{
    if(String(event.status||'').toLowerCase()==='resolved')return
    alerts.push({
      category:'System health',
      reference:event.source||'system',
      priority:String(event.severity||'normal').toLowerCase(),
      message:event.summary||event.detail||'A health event requires review.',
      when:event.created_at||'',
      booking_id:event.related_booking_id||''
    })
  })

  return sortByDateDesc(alerts,'when')
}

const buildAuditFeed=()=>{
  const auditEntries=[
    ...state.statusHistory.map(item=>({
      when:item.created_at,
      booking_id:item.booking_id,
      reference:state.bookings.find(booking=>booking.id===item.booking_id)?.reference||'',
      type:'Status',
      actor:getStaffName(item.actor_user_id)||item.actor_label||'System',
      summary:item.reason||`${formatDisplayLabel(item.from_status)} -> ${formatDisplayLabel(item.to_status)}`
    })),
    ...state.paymentTransactions.map(item=>({
      when:item.created_at,
      booking_id:state.payments.find(payment=>payment.id===item.payment_id)?.booking_id||'',
      reference:state.payments.find(payment=>payment.id===item.payment_id)?.reference||'',
      type:'Payment',
      actor:'Finance',
      summary:`${formatDisplayLabel(item.transaction_type||'transaction')} ${bookingAdminShared.formatMoney(item.amount||0,item.currency_code||state.settings.currency)}`
    })),
    ...state.bookingDocuments.map(item=>({
      when:item.generated_at||item.created_at,
      booking_id:item.booking_id,
      reference:state.bookings.find(booking=>booking.id===item.booking_id)?.reference||'',
      type:'Document',
      actor:getStaffName(item.created_by),
      summary:`${formatDisplayLabel(item.document_type)} generated`
    })),
    ...state.portalRequests.map(item=>({
      when:item.created_at,
      booking_id:item.booking_id,
      reference:state.bookings.find(booking=>booking.id===item.booking_id)?.reference||'',
      type:'Portal',
      actor:getStaffName(item.created_by),
      summary:`${formatDisplayLabel(item.request_type)} - ${formatDisplayLabel(item.status)}`
    })),
    ...state.bookingTasks.map(item=>({
      when:item.updated_at||item.created_at,
      booking_id:item.booking_id,
      reference:state.bookings.find(booking=>booking.id===item.booking_id)?.reference||'',
      type:'Task',
      actor:getStaffName(item.updated_by||item.created_by),
      summary:`${item.title} - ${formatDisplayLabel(item.status)}`
    })),
    ...state.adminNotes.map(item=>({
      when:item.created_at,
      booking_id:item.booking_id,
      reference:state.bookings.find(booking=>booking.id===item.booking_id)?.reference||'',
      type:'Note',
      actor:getStaffName(item.admin_user_id),
      summary:item.note||'Internal note'
    })),
    ...state.systemJobs.map(item=>({
      when:item.completed_at||item.started_at||item.created_at,
      booking_id:item.booking_id,
      reference:state.bookings.find(booking=>booking.id===item.booking_id)?.reference||'',
      type:'Job',
      actor:getStaffName(item.created_by)||'SkyBook Queue',
      summary:`${formatDisplayLabel(item.job_type)} - ${formatDisplayLabel(item.status)}`
    })),
    ...state.healthEvents.map(item=>({
      when:item.created_at,
      booking_id:item.related_booking_id,
      reference:state.bookings.find(booking=>booking.id===item.related_booking_id)?.reference||'',
      type:'Health',
      actor:'SkyBook Monitor',
      summary:item.summary||item.detail||'System health event'
    }))
  ].filter(item=>item.when)

  return sortByDateDesc(auditEntries,'when')
}

const buildCommandPaletteResults=query=>{
  const needle=String(query||'').trim().toLowerCase()
  if(!needle)return []
  const pushMatch=(rows,mapper)=>rows.slice(0,8).map(mapper)
  return [
    ...pushMatch(state.bookings.filter(item=>[
      item.reference,item.customer_name,item.customer_email,item.service_name,item.customer_phone
    ].join(' ').toLowerCase().includes(needle)),item=>({
      kind:'Booking',
      label:item.reference,
      meta:`${item.customer_name} · ${item.service_name}`,
      action:'bookings',
      bookingId:item.id
    })),
    ...pushMatch(state.customers.filter(item=>[
      item.full_name,item.email,item.phone,item.last_booking_reference
    ].join(' ').toLowerCase().includes(needle)),item=>({
      kind:'Customer',
      label:item.full_name||item.email,
      meta:item.email||item.phone||'',
      action:'customers',
      customerId:item.id
    })),
    ...pushMatch(state.invoices.filter(item=>[
      item.invoice_number,item.status
    ].join(' ').toLowerCase().includes(needle)),item=>({
      kind:'Guest Invoice',
      label:item.invoice_number,
      meta:`${item.status} · ${bookingAdminShared.formatMoney(item.total_amount||0,item.currency_code||state.settings.currency)}`,
      action:'reports',
      bookingId:item.booking_id
    })),
    ...pushMatch(state.officeInvoices.filter(item=>[
      item.invoice_number,item.invoice_type,item.status
    ].join(' ').toLowerCase().includes(needle)),item=>({
      kind:'Office Invoice',
      label:item.invoice_number,
      meta:`${item.invoice_type} · ${bookingAdminShared.formatMoney(item.total_amount||0,item.currency_code||state.settings.currency)}`,
      action:'reconciliation',
      bookingId:item.booking_id
    })),
    ...pushMatch(state.operators.filter(item=>[
      item.company_name,item.code,item.contact_name,item.email
    ].join(' ').toLowerCase().includes(needle)),item=>({
      kind:'Operator',
      label:item.company_name,
      meta:[item.code,item.contact_name,item.email].filter(Boolean).join(' · '),
      action:'platform'
    })),
    ...[
      { kind:'Shortcut', label:'Open Command Center', meta:'Daily operations dashboard', action:'dashboard' },
      { kind:'Shortcut', label:'Open Reconciliation Center', meta:'Finance matching and discrepancies', action:'reconciliation' },
      { kind:'Shortcut', label:'Open System Health', meta:'Jobs, failures, and callbacks', action:'health' }
    ].filter(item=>`${item.label} ${item.meta}`.toLowerCase().includes(needle))
  ].slice(0,20)
}

const buildHealthRows=()=>{
  const queuedJobs=state.systemJobs.filter(job=>String(job.status||'')==='queued')
  const failedJobs=state.systemJobs.filter(job=>String(job.status||'')==='failed')
  const failedEmails=state.emailLogs.filter(log=>String(log.status||'')==='failed')
  const callbackEvents=state.healthEvents.filter(event=>String(event.event_type||'').includes('payment'))
  const openEvents=state.healthEvents.filter(event=>String(event.status||'')==='open')
  return {
    cards:[
      {label:'Queued jobs',value:String(queuedJobs.length)},
      {label:'Failed jobs',value:String(failedJobs.length)},
      {label:'Failed emails',value:String(failedEmails.length)},
      {label:'Open health events',value:String(openEvents.length)},
      {label:'Payment callback alerts',value:String(callbackEvents.length)},
      {label:'Portal sessions',value:String(state.portalSessions.length)}
    ],
    jobs:[...state.systemJobs].sort((left,right)=>(parseDateValue(right.created_at)?.getTime()||0)-(parseDateValue(left.created_at)?.getTime()||0)),
    events:[...state.healthEvents].sort((left,right)=>(parseDateValue(right.created_at)?.getTime()||0)-(parseDateValue(left.created_at)?.getTime()||0))
  }
}

const buildLaunchReadinessRows=()=>{
  const config=bookingAdminShared.readConfig()
  const apiUrl=bookingAdminShared.getApiUrl('admin/bootstrap')
  const functionBase=bookingAdminShared.getFunctionBase()
  const paymentProviders=Array.isArray(config.paymentProviders) ? config.paymentProviders : []
  const failedJobs=state.systemJobs.filter(job=>String(job.status||'').toLowerCase()==='failed')
  const failedEmails=state.emailLogs.filter(log=>String(log.status||'').toLowerCase()==='failed')
  const openHealthEvents=state.healthEvents.filter(event=>String(event.status||'').toLowerCase()==='open')
  const hasTrueTravel=state.brands.some(brand=>brand.code==='true-travel')
  const hasIventure=state.brands.some(brand=>brand.code==='iventure')
  const hasAdminUsers=state.adminUsers.length>0
  const hasOperators=state.operators.length>0
  const hasServices=state.services.length>0
  const hasDocumentsLayer=Array.isArray(state.bookingDocuments)&&Array.isArray(state.bookingDocumentVersions)
  const isHttps=window.location.protocol==='https:' || bookingAdminShared.isLocalRuntime()
  const hasLiveSupabase=Boolean(config.supabaseUrl&&/^https:\/\/.+\.supabase\.co$/i.test(config.supabaseUrl))
  const hasAnonKey=Boolean(config.supabaseAnonKey&&String(config.supabaseAnonKey).split('.').length===3)
  const hasLiveApi=Boolean(/^https:\/\//i.test(apiUrl)&&apiUrl.includes('/functions/v1/booking-api/'))
  const hasFunctionBase=Boolean(/^https:\/\//i.test(functionBase)&&functionBase.includes('/functions/v1'))
  const demoFallbackOff=!bookingAdminShared.isDemoFallbackAllowed()
  return [
    {area:'Access',label:'HTTPS admin delivery',status:isHttps?'ready':'blocked',action:isHttps?'Admin is served over HTTPS or local development.':'Serve SkyBook from a HTTPS Cloudflare domain before launch.'},
    {area:'Access',label:'Admin authentication session',status:state.session?.access_token?'ready':'blocked',action:state.session?.access_token?'Current admin session is active.':'Confirm Supabase Auth login works on the live admin domain.'},
    {area:'Access',label:'Admin users and roles',status:hasAdminUsers?'ready':'attention',action:hasAdminUsers?'Admin user records are loaded.':'Create at least one super admin and role-scoped operational users.'},
    {area:'API',label:'Live Supabase project configured',status:hasLiveSupabase&&hasAnonKey?'ready':'blocked',action:hasLiveSupabase&&hasAnonKey?'Supabase URL and anon key are configured.':'Set production Supabase URL and publishable anon key.'},
    {area:'API',label:'Booking API endpoint',status:hasLiveApi?'ready':'blocked',action:hasLiveApi?'Booking API points at Supabase Edge Functions.':'Configure apiBase to the live booking-api function.'},
    {area:'API',label:'Payment function endpoint',status:hasFunctionBase?'ready':'blocked',action:hasFunctionBase?'Function base resolves to Supabase Edge Functions.':'Confirm payment-initiate and payment-webhook are deployed.'},
    {area:'Safety',label:'Production demo fallback disabled',status:demoFallbackOff?'ready':'blocked',action:demoFallbackOff?'Network failures will not create fake demo bookings.':'Disable allowDemoFallback before live bookings.'},
    {area:'Brands',label:'True Travel and Iventure loaded',status:hasTrueTravel&&hasIventure?'ready':'attention',action:hasTrueTravel&&hasIventure?'Both brands are visible in the shared backend.':'Seed or verify both brands in the production database.'},
    {area:'Catalog',label:'Services and tours loaded',status:hasServices?'ready':'blocked',action:hasServices?'Bookable services are loaded.':'Load all launch tours, rentals, activities, and pricing before launch.'},
    {area:'Inventory',label:'Operators/resources loaded',status:hasOperators||state.resources.length?'ready':'attention',action:hasOperators||state.resources.length?'Operator or resource records are loaded.':'Load operators, guides, vehicles, boats, rooms, and capacity rules.'},
    {area:'Payments',label:'Live payment providers',status:paymentProviders.some(provider=>['dpo','stripe','apple_pay','google_pay'].includes(provider))?'attention':'blocked',action:'Requires live DPO/Stripe wallet secrets and webhook verification before taking real money.'},
    {area:'Documents',label:'Document layer available',status:hasDocumentsLayer?'ready':'attention',action:hasDocumentsLayer?'Document records and version state are available.':'Verify PDF generation/storage with signed production links.'},
    {area:'Portal',label:'Customer portal enabled',status:state.portalSettings.enabled?'attention':'blocked',action:state.portalSettings.enabled?'Portal is enabled; test secure links, downloads, and change requests live.':'Enable and test the customer portal before launch.'},
    {area:'Automation',label:'Job queue enabled',status:state.queueSettings.enabled?'attention':'blocked',action:state.queueSettings.enabled?'Queue settings are enabled; run live reminder/settlement tests.':'Enable queue processing before launch.'},
    {area:'Health',label:'No failed jobs/emails/events',status:failedJobs.length||failedEmails.length||openHealthEvents.length?'attention':'ready',action:failedJobs.length||failedEmails.length||openHealthEvents.length?'Resolve failures before launch.':'No failed jobs, failed emails, or open health events are loaded.'}
  ]
}

const renderLaunchReadiness=()=>{
  if(!nodes.launchReadinessTable)return
  const rows=buildLaunchReadinessRows()
  const blocked=rows.filter(row=>row.status==='blocked')
  const attention=rows.filter(row=>row.status==='attention')
  const ready=rows.filter(row=>row.status==='ready')
  const summary=blocked.length ? `${blocked.length} blocked` : (attention.length ? `${attention.length} needs attention` : 'Launch checks clear')
  if(nodes.launchReadinessSummary){
    nodes.launchReadinessSummary.textContent=summary
    nodes.launchReadinessSummary.classList.toggle('is-danger',Boolean(blocked.length))
    nodes.launchReadinessSummary.classList.toggle('is-warning',!blocked.length&&Boolean(attention.length))
  }
  if(nodes.launchReadinessCards){
    const cards=[
      {label:'Ready',value:String(ready.length),tone:'good'},
      {label:'Needs attention',value:String(attention.length),tone:attention.length?'warn':'good'},
      {label:'Blocked',value:String(blocked.length),tone:blocked.length?'risk':'good'}
    ]
    nodes.launchReadinessCards.innerHTML=cards.map(card=>`
      <article class="metric-card is-${card.tone}">
        <span>${bookingAdminShared.escapeHtml(card.label)}</span>
        <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
      </article>
    `).join('')
  }
  nodes.launchReadinessTable.innerHTML=rows.map(row=>`
    <tr>
      <td>${renderStatusBadge(row.status,row.status)}</td>
      <td>${bookingAdminShared.escapeHtml(row.area)}</td>
      <td><strong>${bookingAdminShared.escapeHtml(row.label)}</strong></td>
      <td>${bookingAdminShared.escapeHtml(row.action)}</td>
    </tr>
  `).join('')
}

const renderReconciliationWorkbench=()=>{
  const cards=[
    {label:'Records',value:String(state.reconciliationRecords.length)},
    {label:'Open mismatches',value:String(state.reconciliationRecords.filter(item=>['open','discrepancy','needs_review'].includes(String(item.status||''))).length)},
    {label:'Guest outstanding',value:bookingAdminShared.formatMoney(sumAmounts(state.reconciliationRecords.map(item=>({amount:item.metadata?.guest_outstanding||0})),'amount'),state.settings.currency)},
    {label:'Operator payables',value:bookingAdminShared.formatMoney(sumAmounts(state.reconciliationRecords.map(item=>({amount:item.metadata?.office_payables||0})),'amount'),state.settings.currency)}
  ]
  nodes.reconciliationCards.innerHTML=cards.map(card=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(card.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
    </article>
  `).join('')
  nodes.reconciliationTable.innerHTML=state.reconciliationRecords.map(record=>{
    const booking=state.bookings.find(item=>item.id===record.booking_id)
    return `
      <tr data-reconciliation-id="${bookingAdminShared.escapeHtml(record.id)}">
        <td>
          <div class="badge-stack">
            ${renderStatusBadge(record.status)}
            <button class="booking-button ghost compact-button" type="button" data-reconciliation-action="open-booking" data-booking-id="${bookingAdminShared.escapeHtml(record.booking_id||'')}">Open</button>
          </div>
        </td>
        <td>
          <strong>${bookingAdminShared.escapeHtml(booking?.reference||record.booking_id||'')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(booking?.customer_name||record.assigned_team||'')}</div>
        </td>
        <td>${bookingAdminShared.formatMoney(record.mismatch_amount||0,booking?.currency||state.settings.currency)}</td>
        <td>
          <strong>${bookingAdminShared.escapeHtml(record.summary||'Reconciliation record')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(record.notes||'')}</div>
          <div class="table-subline inline-action-row">
            <button class="booking-button ghost compact-button" type="button" data-reconciliation-action="mark-review" data-reconciliation-id="${bookingAdminShared.escapeHtml(record.id)}">Needs Review</button>
            <button class="booking-button ghost compact-button" type="button" data-reconciliation-action="mark-clear" data-reconciliation-id="${bookingAdminShared.escapeHtml(record.id)}">Mark Clear</button>
          </div>
        </td>
        <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(record.last_checked_at||record.updated_at||record.created_at))}</td>
      </tr>
    `
  }).join('') || renderEmptyRow(5,'No reconciliation records yet.')
}

const renderHealthWorkbench=()=>{
  renderLaunchReadiness()
  const health=buildHealthRows()
  nodes.healthCards.innerHTML=health.cards.map(card=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(card.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
    </article>
  `).join('')
  nodes.systemJobsTable.innerHTML=health.jobs.slice(0,60).map(job=>`
    <tr data-job-id="${bookingAdminShared.escapeHtml(job.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(formatDisplayLabel(job.job_type||'job'))}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(job.job_group||'operations')}</div>
      </td>
      <td>${renderStatusBadge(job.status)}</td>
      <td>${renderStatusBadge(job.priority,job.priority)}</td>
      <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(job.run_at||job.created_at))}</td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(job.last_error||JSON.stringify(job.result||{}).slice(0,90)||'Healthy')}</strong>
        <div class="table-subline inline-action-row">
          <button class="booking-button ghost compact-button" type="button" data-job-action="retry" data-job-id="${bookingAdminShared.escapeHtml(job.id)}">Retry</button>
          <button class="booking-button ghost compact-button" type="button" data-job-action="cancel" data-job-id="${bookingAdminShared.escapeHtml(job.id)}">Cancel</button>
        </div>
      </td>
    </tr>
  `).join('') || renderEmptyRow(5,'No system jobs yet.')
  nodes.healthEventsTable.innerHTML=health.events.slice(0,60).map(event=>`
    <tr data-health-event-id="${bookingAdminShared.escapeHtml(event.id)}">
      <td>${renderStatusBadge(event.severity,event.severity)}</td>
      <td>${bookingAdminShared.escapeHtml(event.source||'system')}</td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(event.summary||'')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(event.detail||'')}</div>
      </td>
      <td>
        <div class="badge-stack">
          ${renderStatusBadge(event.status)}
          <button class="booking-button ghost compact-button" type="button" data-health-action="resolve" data-health-event-id="${bookingAdminShared.escapeHtml(event.id)}">Resolve</button>
        </div>
      </td>
      <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(event.created_at))}</td>
    </tr>
  `).join('') || renderEmptyRow(5,'No health events recorded.')
}

const sumAmounts=(rows,key)=>rows.reduce((sum,row)=>sum+Number(row?.[key]||0),0)

const renderEmptyRow=(colspan,message)=>`
  <tr class="empty-row">
    <td colspan="${colspan}">
      <div class="empty-state">
        <strong>No records to show</strong>
        <span>${bookingAdminShared.escapeHtml(message)}</span>
      </div>
    </td>
  </tr>
`

const createDateRange=(focusDate,span)=>{
  const base=parseDateValue(focusDate)||parseDateValue(getTodayKey())||new Date()
  const start=new Date(base)
  start.setHours(0,0,0,0)
  if(span==='week'){
    const day=start.getDay()
    start.setDate(start.getDate()-day)
  }else if(span==='month'){
    start.setDate(1)
  }
  const dates=[]
  const total=span==='day' ? 1 : span==='week' ? 7 : 42
  for(let index=0;index<total;index+=1){
    const next=new Date(start)
    next.setDate(start.getDate()+index)
    dates.push(next)
  }
  return dates
}

const VIEW_PERMISSION_MAP={
  dashboard:'dashboard',
  notifications:'dashboard',
  calendar:'calendar',
  reports:'reports',
  reconciliation:'reconciliation',
  audit:'bookings',
  health:'health',
  reservations:'bookings',
  bookings:'bookings',
  payments:'payments',
  refunds:'finance',
  customers:'customers',
  services:'services',
  engine:'engine',
  platform:'finance',
  settings:'settings',
  emails:'emails',
  'admin-users':'admin_users'
}
const TAB_ROUTE_MAP={
  dashboard:{view:'dashboard',permission:'dashboard'},
  notifications:{view:'notifications',permission:'dashboard'},
  calendar:{view:'calendar',permission:'calendar'},
  reports:{view:'reports',permission:'reports'},
  reconciliation:{view:'reconciliation',permission:'reconciliation'},
  audit:{view:'audit',permission:'bookings'},
  health:{view:'health',permission:'health'},
  reservations:{view:'reservations',permission:'bookings'},
  bookings:{view:'bookings',permission:'bookings'},
  payments:{view:'payments',permission:'payments'},
  refunds:{view:'refunds',permission:'finance'},
  customers:{view:'customers',permission:'customers'},
  services:{view:'services',permission:'services'},
  engine:{view:'engine',permission:'engine',focusId:'adminEnginePrimaryPanel'},
  resources:{view:'platform',permission:'engine',focusId:'adminPlatformPrimaryPanel'},
  rates:{view:'engine',permission:'engine',focusId:'adminEngineSecondaryPanel'},
  platform:{view:'platform',permission:'finance',focusId:'adminPlatformPrimaryPanel'},
  invoices:{view:'platform',permission:'finance',focusId:'adminPlatformSecondaryPanel'},
  settings:{view:'settings',permission:'settings'},
  emails:{view:'emails',permission:'emails'},
  'admin-users':{view:'admin-users',permission:'admin_users'}
}
const getTabRoute=tab=>TAB_ROUTE_MAP[tab]||{view:tab,permission:VIEW_PERMISSION_MAP[tab]||'',focusId:''}

const setNodeVisibility=(node,isVisible=true)=>{
  if(!node)return
  node.hidden=!isVisible
}

const getEffectivePermissions=profile=>{
  const role=String(profile?.role||'booking_agent')
  const defaults=state.roleDefaults?.[role]||{}
  const overrides=profile?.effective_permissions||profile?.permissions||{}
  return {...defaults,...overrides}
}

const canAccess=permissionKey=>{
  if(!permissionKey)return true
  if(permissionKey==='admin_users')return String(state.profile?.role||'')==='super_admin'
  return Boolean(getEffectivePermissions(state.profile)[permissionKey])
}

const applySidebarVisibility=()=>{
  document.querySelectorAll('[data-admin-permission]').forEach(node=>{
    const permissionKey=String(node.dataset.adminPermission||'').trim()
    const isAllowed=permissionKey ? canAccess(permissionKey) : true
    node.hidden=!isAllowed
    if('disabled' in node)node.disabled=!isAllowed
  })
  document.querySelectorAll('.admin-menu-section').forEach(section=>{
    const hasVisibleItems=[...section.querySelectorAll('.admin-subnav > *')].some(item=>!item.hidden)
    section.hidden=!hasVisibleItems
    if(!hasVisibleItems)section.open=false
  })
}

const applyAccessControl=()=>{
  nodes.tabs.forEach(node=>{
    const permissionKey=getTabRoute(node.dataset.adminTab).permission
    const isAllowed=permissionKey ? canAccess(permissionKey) : true
    node.hidden=!isAllowed
    node.disabled=!isAllowed
  })
  nodes.views.forEach(node=>{
    const permissionKey=VIEW_PERMISSION_MAP[node.dataset.adminView]
    node.hidden=permissionKey ? !canAccess(permissionKey) : false
  })
  applySidebarVisibility()
  const activeTab=nodes.tabs.find(node=>node.classList.contains('is-active') && !node.hidden)?.dataset.adminTab
  if(activeTab){
    switchTab(activeTab)
    return
  }
  const fallbackTab=nodes.tabs.find(node=>!node.hidden)?.dataset.adminTab||'dashboard'
  switchTab(fallbackTab)
}

const collectPermissionOverrides=()=>{
  if(!nodes.adminUserPermissions)return {}
  return Object.fromEntries([...nodes.adminUserPermissions.querySelectorAll('input[type="checkbox"][data-permission-key]')].map(input=>[
    input.dataset.permissionKey,
    input.checked
  ]))
}

const switchTab=tab=>{
  const nextTab=getTabRoute(tab).permission && !canAccess(getTabRoute(tab).permission)
    ? (nodes.tabs.find(node=>!node.hidden)?.dataset.adminTab||'dashboard')
    : tab
  if(nextTab!=='services'&&state.isServiceModalOpen)closeServiceModal()
  state.activeTab=nextTab
  const route=getTabRoute(nextTab)
  nodes.tabs.forEach(node=>node.classList.toggle('is-active',node.dataset.adminTab===nextTab))
  nodes.views.forEach(node=>node.classList.toggle('is-active',node.dataset.adminView===route.view))
  const activeMenuItem=nodes.tabs.find(node=>node.dataset.adminTab===nextTab&&!node.hidden)
  const activeSection=activeMenuItem?.closest('details')
  document.querySelectorAll('.admin-menu-section').forEach(section=>{
    section.open=section===activeSection
  })
  syncAdminRouteState({
    tab:nextTab,
    serviceId:nextTab==='services' ? state.selectedServiceId : '',
    bookingId:nextTab==='bookings' ? state.selectedBookingId : '',
    reservationId:nextTab==='reservations' ? state.selectedBookingId : ''
  })
  renderModuleChrome(nextTab)
  renderEngineWorkbench()
  renderPlatformWorkbench()
  closeMobileSidebar()
  if(route.focusId){
    window.setTimeout(()=>document.getElementById(route.focusId)?.scrollIntoView?.({behavior:'smooth',block:'start'}),90)
  }
}

const requireClient=async()=>{
  if(!bookingAdminShared.createSupabaseClient)throw new Error('Supabase browser client is not configured.')
  return bookingAdminShared.createSupabaseClient()
}

const renderSession=()=>{
  const authenticated=Boolean(state.session?.access_token)
  if(nodes.authGate)nodes.authGate.hidden=authenticated
  if(nodes.appShell)nodes.appShell.hidden=!authenticated
  if(nodes.loadingScreen)nodes.loadingScreen.hidden=authenticated
  const label='Not signed in'
  const safeLabel=authenticated
    ? `${state.profile?.full_name||state.user?.email||'Admin'} - ${formatDisplayLabel(state.profile?.role||'admin')}`
    : label
  if(nodes.sessionLabel)nodes.sessionLabel.textContent=safeLabel
  if(nodes.topSessionLabel)nodes.topSessionLabel.textContent=authenticated ? safeLabel : 'SkyBook'
  if(!authenticated)closeMobileSidebar()
}

const getFilteredBookings=()=>{
  const search=(nodes.bookingFilterSearch.value||'').trim().toLowerCase()
  const brand=(nodes.bookingFilterBrand.value||'').trim()
  const source=(nodes.bookingFilterSource?.value||'').trim()
  const status=(nodes.bookingFilterStatus.value||'').trim()
  const paymentStatus=(nodes.bookingFilterPaymentStatus?.value||'').trim()
  const serviceSlug=(nodes.bookingFilterService?.value||'').trim()
  const operatorId=(nodes.bookingFilterOperator?.value||'').trim()
  const agentId=(nodes.bookingFilterAgent?.value||'').trim()
  const dateFrom=parseDateValue(nodes.bookingFilterDateFrom?.value||'')
  const dateTo=parseDateValue(nodes.bookingFilterDateTo?.value||'')
  return getOperationalBookings().filter(booking=>{
    const bookingSource=normalizeText(booking.source) || normalizeText(booking.metadata?.source) || 'website'
    const haystack=[
      booking.reference,
      booking.customer_name,
      booking.customer_email,
      booking.service_name,
      booking.customer_phone,
      booking.brand_code,
      bookingSource
    ].join(' ').toLowerCase()
    if(search&&!haystack.includes(search))return false
    if(brand&&booking.brand_code!==brand)return false
    if(source&&bookingSource!==source)return false
    if(status&&booking.status!==status)return false
    if(paymentStatus&&booking.payment_status!==paymentStatus)return false
    if(serviceSlug&&booking.service_slug!==serviceSlug)return false
    if(operatorId){
      const operatorAssignment=getBookingOperatorAssignment(booking.id)
      const hasOperatorMatch=String(operatorAssignment?.operator_id||'')===operatorId
        || getBookingOfficeInvoices(booking.id).some(invoice=>String(invoice.operator_id||'')===operatorId)
      if(!hasOperatorMatch)return false
    }
    if(agentId&&!getBookingOfficeInvoices(booking.id).some(invoice=>String(invoice.agent_id||'')===agentId))return false
    const bookingDate=parseDateValue(booking.preferred_date)
    if(dateFrom&&(!bookingDate||bookingDate<dateFrom))return false
    if(dateTo){
      const to=new Date(dateTo)
      to.setHours(23,59,59,999)
      if(!bookingDate||bookingDate>to)return false
    }
    if(!bookingMatchesQuickFilter(booking))return false
    return true
  })
}

const renderDashboard=()=>{
  const todayKey=getTodayKey()
  const tomorrowDate=new Date(`${todayKey}T00:00:00`)
  tomorrowDate.setDate(tomorrowDate.getDate()+1)
  const tomorrowKey=tomorrowDate.toISOString().slice(0,10)
  const brandMap=new Map(state.brands.map(brand=>[brand.code,brand.name]))
  const totalRevenue=state.bookings.reduce((sum,booking)=>sum+Number(booking.total_amount||0),0)
  const todayArrivals=state.bookings.filter(booking=>sameDate(booking.preferred_date,todayKey))
  const tomorrowPrep=state.bookings.filter(booking=>sameDate(booking.preferred_date,tomorrowKey))
  const pendingConfirmations=state.bookings.filter(item=>item.status==='pending')
  const unpaidBookings=state.bookings.filter(item=>['pending','unpaid','partially_paid','authorized'].includes(String(item.payment_status||'')) || Number(item.amount_due_later||0)>0)
  const unpaidExposure=unpaidBookings.reduce((sum,booking)=>sum+Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0),0)
  const refundExposure=sumAmounts(state.refunds,'amount')
  const operatorPayoutsDue=state.officeInvoices.filter(invoice=>!['paid','settled','cancelled'].includes(String(invoice.status||'').toLowerCase()))
  const payoutExposure=sumAmounts(operatorPayoutsDue,'total_amount')
  const openTasks=state.bookingTasks.filter(task=>String(task.status||'')==='open')
  const alerts=buildOperationalAlerts()
  const unassignedOperators=state.bookings.filter(booking=>{
    const status=String(booking.status||'').toLowerCase()
    return ['pending','awaiting_payment','confirmed'].includes(status) && getBookingOperatorName(booking)==='Unassigned'
  })
  const failedJobs=state.systemJobs.filter(job=>String(job.status||'').toLowerCase()==='failed')
  const failedEmails=state.emailLogs.filter(log=>String(log.status||'').toLowerCase()==='failed')
  if(nodes.executiveRadarCards){
    const radarCards=[
      {
        label:'Reservations readiness',
        value:pendingConfirmations.length ? `${pendingConfirmations.length} pending` : 'Clear',
        meta:pendingConfirmations.length ? 'Confirm or decline pending bookings.' : 'No reservations are waiting for confirmation.',
        tone:pendingConfirmations.length?'warn':'good'
      },
      {
        label:'Finance control',
        value:unpaidExposure ? bookingAdminShared.formatMoney(unpaidExposure,state.settings.currency||'NAD') : 'Balanced',
        meta:unpaidExposure ? 'Outstanding guest exposure requires follow-up.' : 'No unpaid exposure is currently loaded.',
        tone:unpaidExposure?'risk':'good'
      },
      {
        label:'Supplier coverage',
        value:unassignedOperators.length ? `${unassignedOperators.length} unassigned` : 'Covered',
        meta:unassignedOperators.length ? 'Assign operators, guides, vehicles, or resources.' : 'Active bookings have operator coverage.',
        tone:unassignedOperators.length?'warn':'good'
      },
      {
        label:'Automation health',
        value:(failedJobs.length+failedEmails.length) ? `${failedJobs.length+failedEmails.length} failures` : 'Healthy',
        meta:(failedJobs.length+failedEmails.length) ? 'Review failed jobs, emails, webhooks, or payment callbacks.' : 'No failed jobs or emails are currently loaded.',
        tone:(failedJobs.length+failedEmails.length)?'risk':'good'
      }
    ]
    nodes.executiveRadarCards.innerHTML=radarCards.map(card=>`
      <article class="radar-card is-${bookingAdminShared.escapeHtml(card.tone)}">
        <span>${bookingAdminShared.escapeHtml(card.label)}</span>
        <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
        <p>${bookingAdminShared.escapeHtml(card.meta)}</p>
      </article>
    `).join('')
  }
  const cancellationAlerts=[
    ...state.bookings.filter(booking=>String(booking.status||'').toLowerCase()==='cancelled').slice(0,6).map(booking=>({
      booking:booking.reference,
      type:'Cancelled booking',
      reason:booking.cancellation_reason||booking.customer_notes||'Cancelled without a captured reason.',
      amount:booking.total_amount||0,
      status:booking.status
    })),
    ...state.refunds.slice(0,6).map(refund=>({
      booking:state.bookings.find(item=>item.id===refund.booking_id)?.reference||refund.booking_id||'',
      type:'Refund',
      reason:refund.reason||'Refund recorded',
      amount:refund.amount||0,
      status:refund.status
    }))
  ].slice(0,8)
  const brandMetrics=state.brands.map(brand=>({
    label:`${brand.name} volume`,
    value:String(state.bookings.filter(item=>item.brand_code===brand.code).length),
    meta:'Brand-specific booking volume',
    tone:'neutral'
  }))
  const actionQueue=[
    {label:'Pending confirmations',value:pendingConfirmations.length,meta:'Bookings waiting for ops review',tone:pendingConfirmations.length?'warn':'good'},
    {label:'Today arrivals',value:todayArrivals.length,meta:'Tours or pickups scheduled for today',tone:'blue'},
    {label:'Tomorrow prep',value:tomorrowPrep.length,meta:'Bookings that need operator and pickup checks',tone:'neutral'},
    {label:'Unpaid balances',value:unpaidBookings.length,meta:'Bookings with money still outstanding',tone:unpaidBookings.length?'risk':'good'},
    {label:'Open tasks',value:openTasks.length,meta:'Operational tasks still waiting on action',tone:openTasks.length?'warn':'good'},
    {label:'Live alerts',value:alerts.length,meta:'Failed payments, missing operators, and overdue workflows',tone:alerts.length?'risk':'good'},
    {label:'Operator payouts',value:operatorPayoutsDue.length,meta:'Office invoices not yet settled',tone:operatorPayoutsDue.length?'warn':'good'}
  ]
  const metrics=[
    {label:'Today arrivals',value:String(todayArrivals.length),meta:'Departures and pickups due today',tone:'blue'},
    {label:'Tomorrow prep',value:String(tomorrowPrep.length),meta:'Bookings requiring next-day readiness',tone:'neutral'},
    {label:'Pending confirmations',value:String(pendingConfirmations.length),meta:'Reservations desk queue',tone:pendingConfirmations.length?'warn':'good'},
    {label:'Unpaid exposure',value:bookingAdminShared.formatMoney(unpaidExposure,state.settings.currency||'NAD'),meta:'Outstanding guest balances',tone:unpaidExposure?'risk':'good'},
    {label:'Refund exposure',value:bookingAdminShared.formatMoney(refundExposure,state.settings.currency||'NAD'),meta:'Refunds requiring review',tone:refundExposure?'risk':'good'},
    {label:'Operator payouts due',value:bookingAdminShared.formatMoney(payoutExposure,state.settings.currency||'NAD'),meta:'Supplier settlement exposure',tone:payoutExposure?'warn':'good'},
    {label:'Gross revenue',value:bookingAdminShared.formatMoney(totalRevenue,state.settings.currency||'NAD'),meta:'All loaded bookings',tone:'blue'},
    {label:'Open tasks',value:String(openTasks.length),meta:'Follow-ups and operational work',tone:openTasks.length?'warn':'good'},
    {label:'Documents generated',value:String(state.bookingDocuments.length),meta:'Invoices, receipts, manifests, vouchers',tone:'neutral'},
    ...brandMetrics,
    {label:'Resources loaded',value:String(state.resources.length),meta:'Vehicles, vessels, guides, kayaks',tone:'neutral'}
  ]
  nodes.dashboardCards.innerHTML=metrics.map(metric=>`
    <article class="metric-card is-${bookingAdminShared.escapeHtml(metric.tone||'neutral')}">
      <span>${bookingAdminShared.escapeHtml(metric.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(metric.value)}</strong>
      ${metric.meta ? `<small>${bookingAdminShared.escapeHtml(metric.meta)}</small>` : ''}
    </article>
  `).join('')
  nodes.dashboardActionQueue.innerHTML=actionQueue.map(item=>`
    <article class="queue-card is-${bookingAdminShared.escapeHtml(item.tone||'neutral')}">
      <div>
        <strong>${bookingAdminShared.escapeHtml(String(item.value))}</strong>
        <span>${bookingAdminShared.escapeHtml(item.label)}</span>
      </div>
      <p>${bookingAdminShared.escapeHtml(item.meta)}</p>
    </article>
  `).join('')
  nodes.dashboardArrivalsTable.innerHTML=todayArrivals.length ? todayArrivals.map(booking=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(booking.reference)}</td>
      <td>${bookingAdminShared.escapeHtml(brandMap.get(booking.brand_code)||booking.brand_code||'')}</td>
      <td>${bookingAdminShared.escapeHtml(booking.service_name)}</td>
      <td>${bookingAdminShared.escapeHtml(String(booking.quantity||1))}</td>
      <td>${renderStatusBadge(booking.status)}</td>
    </tr>
  `).join('') : renderEmptyRow(5,'No arrivals are scheduled for today.')
  nodes.dashboardTomorrowPrepTable.innerHTML=tomorrowPrep.length ? tomorrowPrep.slice(0,8).map(booking=>{
    const allocations=getBookingAllocations(booking.id)
    return `
      <tr>
        <td>${bookingAdminShared.escapeHtml(booking.reference)}</td>
        <td>${bookingAdminShared.escapeHtml(booking.service_name)}</td>
        <td>${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</td>
        <td>${bookingAdminShared.escapeHtml(allocations.map(item=>getResourceName(item.resource_id)).join(', ')||'Unassigned')}</td>
        <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</td>
      </tr>
    `
  }).join('') : renderEmptyRow(5,'Nothing is scheduled for tomorrow yet.')
  nodes.dashboardPendingTable.innerHTML=pendingConfirmations.length ? pendingConfirmations.slice(0,8).map(booking=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(booking.reference)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.customer_name)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.service_name)}</td>
      <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</td>
      <td>${renderStatusBadge(booking.status)}</td>
    </tr>
  `).join('') : renderEmptyRow(5,'No bookings are waiting for confirmation.')
  nodes.dashboardAlertsTable.innerHTML=cancellationAlerts.length ? cancellationAlerts.map(item=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(item.booking)}</td>
      <td>${bookingAdminShared.escapeHtml(item.type)}</td>
      <td>${bookingAdminShared.escapeHtml(item.reason)}</td>
      <td>${bookingAdminShared.formatMoney(item.amount||0,state.settings.currency||'NAD')}</td>
      <td>${renderStatusBadge(item.status)}</td>
    </tr>
  `).join('') : renderEmptyRow(5,'No cancellation or refund alerts are active.')
  nodes.dashboardUnpaidTable.innerHTML=unpaidBookings.length ? unpaidBookings.slice(0,8).map(booking=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(booking.reference)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.customer_name)}</td>
      <td>${bookingAdminShared.formatMoney(booking.amount_due_now||0,booking.currency||state.settings.currency)}</td>
      <td>${bookingAdminShared.formatMoney(booking.amount_due_later||0,booking.currency||state.settings.currency)}</td>
      <td>${renderStatusBadge(booking.payment_status,'Payment ' + String(booking.payment_status||'').replace(/_/g,' '))}</td>
    </tr>
  `).join('') : renderEmptyRow(5,'No unpaid balances are outstanding.')
  nodes.dashboardRefundsTable.innerHTML=state.refunds.length ? state.refunds.slice(0,8).map(refund=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(refund.booking_id||'')}</td>
      <td>${renderStatusBadge(refund.status||'pending')}</td>
      <td>${bookingAdminShared.formatMoney(refund.amount||0,refund.currency_code||state.settings.currency)}</td>
      <td>${bookingAdminShared.escapeHtml(refund.reason||'No reason captured')}</td>
    </tr>
  `).join('') : renderEmptyRow(4,'No refunds have been logged.')
  nodes.dashboardPayoutsTable.innerHTML=operatorPayoutsDue.length ? operatorPayoutsDue.slice(0,8).map(invoice=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(invoice.invoice_number||'')}</td>
      <td>${bookingAdminShared.escapeHtml(getOfficeInvoicePartnerName(invoice))}</td>
      <td>${renderStatusBadge(invoice.status||'issued')}</td>
      <td>${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)}</td>
    </tr>
  `).join('') : renderEmptyRow(4,'No operator or payee settlements are due.')
  nodes.dashboardRecentBookingsTable.innerHTML=sortByDateDesc(state.bookings,'created_at').slice(0,8).map(booking=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(booking.reference)}</td>
      <td>${bookingAdminShared.escapeHtml(brandMap.get(booking.brand_code)||booking.brand_code||'')}</td>
      <td>${bookingAdminShared.escapeHtml(booking.service_name)}</td>
      <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(booking.created_at))}</td>
      <td>${bookingAdminShared.formatMoney(booking.total_amount||0,booking.currency||state.settings.currency)}</td>
    </tr>
  `).join('') || renderEmptyRow(5,'No bookings have been created yet.')
}

const renderCalendar=()=>{
  const focusDate=nodes.calendarFocusDate?.value||state.calendarFocusDate||getTodayKey()
  state.calendarFocusDate=focusDate
  nodes.calendarViewButtons.forEach(button=>button.classList.toggle('is-active',button.dataset.calendarView===state.calendarView))
  if(nodes.calendarFocusDate&&nodes.calendarFocusDate.value!==focusDate)nodes.calendarFocusDate.value=focusDate
  const dates=createDateRange(focusDate,state.calendarView)
  const rangeBookings=state.bookings.filter(booking=>{
    const key=normalizeDateKey(booking.preferred_date)
    return key && dates.some(date=>normalizeDateKey(date)===key)
  })
  const summaryCards=[
    {label:'Visible bookings',value:String(rangeBookings.length)},
    {label:'Assigned resources',value:String(state.resourceAllocations.filter(row=>dates.some(date=>normalizeDateKey(date)===normalizeDateKey(row.allocation_date))).length)},
    {label:'Operators in window',value:String(new Set(rangeBookings.map(getBookingOperatorName).filter(name=>name&&name!=='Unassigned')).size)},
    {label:'Pending in window',value:String(rangeBookings.filter(item=>item.status==='pending').length)}
  ]
  nodes.calendarSummaryCards.innerHTML=summaryCards.map(card=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(card.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
    </article>
  `).join('')

  if(state.calendarView==='day'){
    const dayBookings=rangeBookings
    nodes.calendarCanvas.innerHTML=`
      <div class="calendar-day-stack">
        ${dayBookings.length ? dayBookings.map(booking=>{
          const allocations=getBookingAllocations(booking.id)
          return `
            <article class="calendar-entry-card">
              <div class="calendar-entry-top">
                <div>
                  <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
                  <p>${bookingAdminShared.escapeHtml(booking.service_name)} · ${bookingAdminShared.escapeHtml(booking.customer_name)}</p>
                </div>
                <div class="calendar-entry-badges">
                  ${renderStatusBadge(booking.status)}
                  ${renderStatusBadge(booking.payment_status,'Payment ' + String(booking.payment_status||'').replace(/_/g,' '))}
                </div>
              </div>
              <div class="calendar-entry-meta">
                <span>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</span>
                <span>${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</span>
                <span>${bookingAdminShared.escapeHtml(allocations.map(item=>item.resource_name||item.resource_id).filter(Boolean).join(', ')||'No resources assigned')}</span>
              </div>
            </article>
          `
        }).join('') : '<p class="muted-copy">No bookings are scheduled for the selected day.</p>'}
      </div>
    `
    return
  }

  if(state.calendarView==='week'){
    nodes.calendarCanvas.innerHTML=`
      <div class="calendar-week-grid">
        ${dates.map(date=>{
          const key=normalizeDateKey(date)
          const bookings=rangeBookings.filter(booking=>normalizeDateKey(booking.preferred_date)===key)
          return `
            <section class="calendar-cell">
              <header>
                <span>${date.toLocaleDateString('en-NA',{weekday:'short'})}</span>
                <strong>${date.toLocaleDateString('en-NA',{day:'2-digit',month:'short'})}</strong>
              </header>
              <div class="calendar-cell-body">
                ${bookings.length ? bookings.map(booking=>`
                  <article class="calendar-mini-card">
                    <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
                    <span>${bookingAdminShared.escapeHtml(booking.service_name)}</span>
                    ${renderStatusBadge(booking.status)}
                  </article>
                `).join('') : '<p class="muted-copy">No bookings</p>'}
              </div>
            </section>
          `
        }).join('')}
      </div>
    `
    return
  }

  nodes.calendarCanvas.innerHTML=`
    <div class="calendar-month-grid">
      ${dates.map(date=>{
        const key=normalizeDateKey(date)
        const bookings=rangeBookings.filter(booking=>normalizeDateKey(booking.preferred_date)===key)
        const isCurrentMonth=parseDateValue(focusDate)?.getMonth()===date.getMonth()
        return `
          <section class="calendar-cell ${isCurrentMonth ? '' : 'is-muted'}">
            <header>
              <strong>${date.getDate()}</strong>
              <span>${bookings.length} booking${bookings.length===1 ? '' : 's'}</span>
            </header>
            <div class="calendar-cell-body">
              ${bookings.slice(0,4).map(booking=>`
                <article class="calendar-mini-card">
                  <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
                  <span>${bookingAdminShared.escapeHtml(booking.service_name)}</span>
                </article>
              `).join('') || '<p class="muted-copy">No activity</p>'}
            </div>
          </section>
        `
      }).join('')}
    </div>
  `
}

const renderReports=()=>{
  const overview=state.reports?.overview||{}
  const byBrand=state.bookings.reduce((accumulator,booking)=>{
    const key=booking.brand_code||'unassigned'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const byService=state.bookings.reduce((accumulator,booking)=>{
    const key=booking.service_name||'Unknown service'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const cards=[
    {label:'Gross Revenue',value:bookingAdminShared.formatMoney(overview.gross_revenue||0,state.settings.currency||'NAD')},
    {label:'Paid Revenue',value:bookingAdminShared.formatMoney(overview.paid_revenue||0,state.settings.currency||'NAD')},
    {label:'Guest Outstanding',value:bookingAdminShared.formatMoney(overview.guest_outstanding||0,state.settings.currency||'NAD')},
    {label:'Office Payables',value:bookingAdminShared.formatMoney(overview.office_payables||0,state.settings.currency||'NAD')},
    {label:'Refund Exposure',value:bookingAdminShared.formatMoney(overview.refund_exposure||0,state.settings.currency||'NAD')},
    {label:'Total Bookings',value:String(overview.total_bookings||0)}
  ]
  const performanceMarkup=`
    <div class="report-split-grid">
      <article>
        <h4>Sales by brand</h4>
        <div class="report-stat-list">
          ${Object.entries(byBrand).map(([brand,metrics])=>`
            <div>
              <strong>${bookingAdminShared.escapeHtml(brand)}</strong>
              <span>${bookingAdminShared.escapeHtml(String(metrics.count))} bookings · ${bookingAdminShared.formatMoney(metrics.revenue,state.settings.currency||'NAD')}</span>
            </div>
          `).join('') || '<p class="muted-copy">No brand data yet.</p>'}
        </div>
      </article>
      <article>
        <h4>Performance by tour</h4>
        <div class="report-stat-list">
          ${Object.entries(byService).sort((left,right)=>right[1].revenue-left[1].revenue).slice(0,6).map(([service,metrics])=>`
            <div>
              <strong>${bookingAdminShared.escapeHtml(service)}</strong>
              <span>${bookingAdminShared.escapeHtml(String(metrics.count))} bookings · ${bookingAdminShared.formatMoney(metrics.revenue,state.settings.currency||'NAD')}</span>
            </div>
          `).join('') || '<p class="muted-copy">No service performance data yet.</p>'}
        </div>
      </article>
    </div>
  `
  nodes.reportsOverviewCards.innerHTML=cards.map(card=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(card.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
    </article>
  `).join('') + performanceMarkup
  nodes.reportsStatusTable.innerHTML=(state.reports?.status_breakdown||[]).map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(row.status)}</td>
      <td>${bookingAdminShared.escapeHtml(row.count)}</td>
    </tr>
  `).join('') || '<tr><td colspan="2">No report data yet.</td></tr>'
  nodes.reportsGuestInvoicesTable.innerHTML=(state.reports?.recent_guest_invoices||[]).map(invoice=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(invoice.invoice_number||'')}</td>
      <td>${bookingAdminShared.escapeHtml(invoice.status||'')}</td>
      <td>${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)}</td>
      <td>${bookingAdminShared.formatMoney(invoice.balance_amount||0,invoice.currency_code||state.settings.currency)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No guest invoices yet.</td></tr>'
  nodes.reportsOfficeInvoicesTable.innerHTML=(state.reports?.recent_office_invoices||[]).map(invoice=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(invoice.invoice_number||'')}</td>
      <td>${bookingAdminShared.escapeHtml(invoice.invoice_type||'')}</td>
      <td>${bookingAdminShared.escapeHtml(invoice.status||'')}</td>
      <td>${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No office invoices yet.</td></tr>'
  if(nodes.reportsStatusTable.parentElement?.parentElement){
    nodes.reportsStatusTable.parentElement.parentElement.querySelector('h3').textContent='Status + Performance'
  }
}

const renderReservations=()=>{
  if(!nodes.reservationsTable)return
  const reservations=getReviewReservations().sort((left,right)=>(parseDateValue(right.created_at)?.getTime()||0)-(parseDateValue(left.created_at)?.getTime()||0))
  nodes.reservationsTable.innerHTML=reservations.map(booking=>`
    <tr class="reservation-row is-${bookingAdminShared.escapeHtml(normalizeBrandClass(booking.brand_code))}${booking.id===state.selectedBookingId ? ' is-selected' : ''}" data-reservation-id="${bookingAdminShared.escapeHtml(booking.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatDateTimeLabel(booking.created_at))}</div>
      </td>
      <td>
        ${renderBrandPill(booking.brand_code)}
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatSourceLabel(booking.source||booking.metadata?.source||'website'))}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(booking.customer_email||booking.customer_phone||'')}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.service_name||'Tour not selected')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(String(booking.quantity||1))} guest${Number(booking.quantity||1)===1 ? '' : 's'}</div>
      </td>
      <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</td>
      <td>${bookingAdminShared.formatMoney(booking.total_amount,booking.currency||state.settings.currency)}</td>
      <td>
        <div class="badge-stack">
          ${renderStatusBadge(booking.status,'Needs review')}
          <button class="booking-button ghost compact-button" type="button" data-reservation-open="${bookingAdminShared.escapeHtml(booking.id)}">Open</button>
        </div>
      </td>
    </tr>
  `).join('') || renderEmptyRow(7,'No reservations are waiting for review.')
  renderReservationDetail()
}

const renderReservationDetail=()=>{
  if(!nodes.reservationDetail)return
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId&&isReviewReservation(item))
  if(!booking){
    nodes.reservationDetail.innerHTML='<p class="muted-copy">Choose a reservation to review, amend, accept, or decline.</p>'
    return
  }
  nodes.reservationDetail.innerHTML=`
    <div class="reservation-review-card">
      <div class="panel-header-inline">
        <div>
          <span class="booking-chip">Reservation screen</span>
          <h3>${bookingAdminShared.escapeHtml(booking.reference)} - ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</h3>
        </div>
        ${renderBrandPill(booking.brand_code)}
      </div>
      <div class="detail-overview-grid">
        <article class="detail-card">
          <span>Tour</span>
          <strong>${bookingAdminShared.escapeHtml(booking.service_name||'Tour not selected')}</strong>
        </article>
        <article class="detail-card">
          <span>Preferred date</span>
          <strong>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</strong>
        </article>
        <article class="detail-card">
          <span>Guests</span>
          <strong>${bookingAdminShared.escapeHtml(String(booking.quantity||1))}</strong>
        </article>
        <article class="detail-card">
          <span>Total</span>
          <strong>${bookingAdminShared.formatMoney(booking.total_amount,booking.currency||state.settings.currency)}</strong>
        </article>
      </div>
      <div class="detail-section">
        <h4>Guest details</h4>
        <p class="muted-copy">${bookingAdminShared.escapeHtml(booking.customer_email||'No email')} - ${bookingAdminShared.escapeHtml(booking.customer_phone||'No phone')}</p>
        <p>${bookingAdminShared.escapeHtml(booking.customer_notes||booking.notes||'No notes captured.')}</p>
      </div>
      <div class="reservation-review-actions">
        <button class="booking-button" type="button" data-reservation-action="accept">Accept reservation</button>
        <button class="booking-button ghost" type="button" data-reservation-action="edit">Amend reservation</button>
        <button class="booking-button ghost" type="button" data-reservation-action="decline">Decline</button>
      </div>
    </div>
  `
}

const renderBookings=()=>{
  const filtered=getFilteredBookings()
  updateBookingQuickFilterBar()
  nodes.bookingsTable.innerHTML=filtered.map(booking=>`
    <tr class="booking-row is-${bookingAdminShared.escapeHtml(normalizeBrandClass(booking.brand_code))}${booking.id===state.selectedBookingId ? ' is-selected' : ''}" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(booking.customer_email||'')}</div>
      </td>
      <td>
        ${renderBrandPill(booking.brand_code)}
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatSourceLabel(booking.source||booking.metadata?.source||'website'))}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.customer_name)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(booking.customer_phone||'')}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.service_name)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</div>
      </td>
      <td>
        <div class="badge-stack">
          ${renderStatusBadge(booking.status)}
          ${renderStatusBadge(booking.payment_status,'Payment ' + String(booking.payment_status||'').replace(/_/g,' '))}
        </div>
      </td>
      <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</td>
      <td>${bookingAdminShared.formatMoney(booking.total_amount,booking.currency||state.settings.currency)}</td>
    </tr>
  `).join('') || renderEmptyRow(7,'No bookings match the current filters.')
}

const renderBookingDetail=()=>{
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  const brandName=state.brands.find(brand=>brand.code===booking?.brand_code)?.name||booking?.brand_code||''
  const sourceLabel=formatSourceLabel(booking?.source||booking?.metadata?.source||'website')
  const capturePage=String(booking?.metadata?.source_page||'').trim() || 'Not captured'
  const createdVia=formatDisplayLabel(booking?.metadata?.created_via||'website')
  const manualEmailDraft=buildManualEmailDraft(booking,brandName)
  if(!booking){
    nodes.bookingDetail.innerHTML='<p class="muted-copy">Choose a booking to review, edit, or change status.</p>'
    return
  }
  const invoice=getBookingInvoices(booking.id)[0]
  const officeInvoices=getBookingOfficeInvoices(booking.id)
  const payments=getBookingPayments(booking.id)
  const transactions=getBookingTransactions(booking.id)
  const refunds=getBookingRefunds(booking.id)
  const emails=getBookingEmails(booking.id)
  const history=getBookingHistory(booking.id)
  const notes=getBookingNotes(booking.id)
  const tasks=getBookingTasks(booking.id)
  const documents=getBookingDocuments(booking.id)
  const memories=getBookingMemories(booking.id)
  const documentVersions=getBookingDocumentVersions(booking.id)
  const portalRequests=getBookingPortalRequests(booking.id)
  const portalSessions=getBookingPortalSessions(booking.id)
  const allocations=getBookingAllocations(booking.id)
  const operatorAssignment=getBookingOperatorAssignment(booking.id)
  const reconciliationRecord=getBookingReconciliationRecord(booking.id)
  const operatorCommission=getBookingOperatorCommission(booking)
  const agentCommission=sumAmounts(officeInvoices.filter(item=>item.agent_id),'commission_amount')
  const guestBalance=Number(invoice?.balance_amount ?? (Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0)))
  const officeExposure=sumAmounts(officeInvoices,'total_amount')
  const operatorOptions=state.operators.map(operator=>`<option value="${bookingAdminShared.escapeHtml(operator.id)}" ${operatorAssignment?.operator_id===operator.id ? 'selected' : ''}>${bookingAdminShared.escapeHtml(operator.company_name)}</option>`).join('')
  const openTasks=tasks.filter(task=>String(task.status||'')==='open')
  const checklist=getBookingChecklist(booking)
  const lastChangedBy=(booking.updated_by ? getStaffName(booking.updated_by) : '') || 'System'
  const noteTemplates=(state.opsTemplates?.internalNoteTemplates||[]).slice(0,3)
  const bookingAlerts=buildOperationalAlerts().filter(alert=>alert.booking_id===booking.id || alert.reference===booking.reference)
  nodes.bookingDetail.innerHTML=`
    <div class="booking-detail-shell">
      <div class="booking-detail-main">
        <section class="booking-management-hero">
          <div>
            <span class="booking-chip">Management workspace</span>
            <h3>${bookingAdminShared.escapeHtml(booking.reference)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</h3>
            <p>Communicate with the guest, update booking details, track notifications, manage payments, assign operators, and generate guest documents without leaving this record.</p>
          </div>
          <nav class="booking-management-nav" aria-label="Booking management navigation">
            <button type="button" data-booking-inline-action="edit-booking">Edit booking</button>
            <a href="#booking-guest-email">Email guest</a>
            <a href="#booking-notification-panel">Notifications</a>
            <a href="#booking-documents-panel">Documents</a>
          </nav>
        </section>

        <section class="detail-section" id="booking-notification-panel">
          <div class="section-heading">
            <div>
              <h4>Notifications for this booking</h4>
              <p class="muted-copy">Operational signals that need admin attention before the guest experience is affected.</p>
            </div>
            ${renderStatusBadge(bookingAlerts.length ? 'pending' : 'completed',bookingAlerts.length ? `${bookingAlerts.length} alert${bookingAlerts.length===1 ? '' : 's'}` : 'No alerts')}
          </div>
          <div class="booking-alert-strip">
            ${bookingAlerts.length ? bookingAlerts.map(alert=>`
              <article class="booking-alert-card is-${bookingAdminShared.escapeHtml(alert.priority||'normal')}">
                <span>${bookingAdminShared.escapeHtml(alert.category||'Alert')}</span>
                <strong>${bookingAdminShared.escapeHtml(alert.message||'Review this booking.')}</strong>
                <small>${bookingAdminShared.escapeHtml(formatDateTimeLabel(alert.when))}</small>
              </article>
            `).join('') : `
              <article class="booking-alert-card is-clear">
                <span>Clear</span>
                <strong>No booking notifications are currently open.</strong>
                <small>SkyBook will surface payment, assignment, task, and departure signals here.</small>
              </article>
            `}
          </div>
        </section>

        <section class="detail-section detail-overview-grid">
          <article class="detail-card">
            <span>Reference</span>
            <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
          </article>
          <article class="detail-card">
            <span>Brand</span>
            <strong>${bookingAdminShared.escapeHtml(brandName)}</strong>
          </article>
          <article class="detail-card">
            <span>Preferred date</span>
            <strong>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</strong>
          </article>
            <article class="detail-card">
              <span>Total tracked</span>
              <strong>${bookingAdminShared.formatMoney(booking.total_amount,booking.currency||state.settings.currency)}</strong>
            </article>
            <article class="detail-card">
              <span>Last changed</span>
              <strong>${bookingAdminShared.escapeHtml(formatDateTimeLabel(booking.updated_at||booking.created_at))}</strong>
              <p>${bookingAdminShared.escapeHtml(lastChangedBy)}</p>
            </article>
        </section>

        <section class="detail-section" id="booking-documents-panel">
          <div class="section-heading">
            <div>
              <h4>Guest and service</h4>
              <p class="muted-copy">Core trip context, pickup timing, and brand source.</p>
            </div>
            <div class="badge-stack">
              ${renderStatusBadge(booking.status)}
              ${renderStatusBadge(booking.payment_status,'Payment ' + String(booking.payment_status||'').replace(/_/g,' '))}
            </div>
          </div>
          <div class="detail-grid detail-grid-strong">
            <div><span>Guest</span><strong>${bookingAdminShared.escapeHtml(booking.customer_name)}</strong></div>
            <div><span>Service</span><strong>${bookingAdminShared.escapeHtml(booking.service_name)}</strong></div>
            <div><span>Email</span><strong>${bookingAdminShared.escapeHtml(booking.customer_email)}</strong></div>
            <div><span>Phone</span><strong>${bookingAdminShared.escapeHtml(booking.customer_phone||'')}</strong></div>
            <div><span>Guests</span><strong>${bookingAdminShared.escapeHtml(String(booking.quantity||1))}</strong></div>
            <div><span>Source</span><strong>${bookingAdminShared.escapeHtml(sourceLabel)}</strong></div>
            <div><span>Capture page</span><strong>${bookingAdminShared.escapeHtml(capturePage)}</strong></div>
            <div><span>Created via</span><strong>${bookingAdminShared.escapeHtml(createdVia)}</strong></div>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Lifecycle checklist & tasking</h4>
              <p class="muted-copy">SkyBook keeps every team aligned on the next required action for this booking.</p>
            </div>
            <div class="badge-stack">
              ${renderStatusBadge(openTasks.length ? 'pending' : 'completed',openTasks.length ? `${openTasks.length} open task${openTasks.length===1 ? '' : 's'}` : 'All tasks cleared')}
            </div>
          </div>
          <div class="detail-subgrid">
            ${checklist.map(item=>`
              <article class="detail-card checklist-card ${item.done ? 'is-complete' : 'is-open'}">
                <span>${bookingAdminShared.escapeHtml(item.team)}</span>
                <strong>${bookingAdminShared.escapeHtml(item.label)}</strong>
                <p>${item.done ? 'Completed or already satisfied.' : 'Still needs staff action.'}</p>
              </article>
            `).join('')}
          </div>
          <div class="table-wrap detail-table">
            <table>
              <thead><tr><th>Task</th><th>Team</th><th>Priority</th><th>Due</th><th>Status</th></tr></thead>
              <tbody>
                ${tasks.length ? tasks.map(task=>`
                  <tr>
                    <td>
                      <strong>${bookingAdminShared.escapeHtml(task.title)}</strong>
                      <div class="table-subline">${bookingAdminShared.escapeHtml(task.description||'No extra detail')}</div>
                    </td>
                    <td>${bookingAdminShared.escapeHtml(formatDisplayLabel(task.team||'operations'))}</td>
                    <td>${renderStatusBadge(task.priority||'normal',task.priority||'normal')}</td>
                    <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(task.due_at||task.created_at))}</td>
                    <td>
                      <div class="badge-stack">
                        ${renderStatusBadge(task.status)}
                        ${String(task.status||'')==='open' ? `<button class="booking-button ghost compact-button" type="button" data-booking-inline-action="complete-task" data-task-id="${bookingAdminShared.escapeHtml(task.id)}">Done</button>` : ''}
                      </div>
                    </td>
                  </tr>
                `).join('') : renderEmptyRow(5,'No tasks have been logged yet.')}
              </tbody>
            </table>
          </div>
          <form class="booking-inline-form booking-inline-form-wide" data-inline-form="task">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <label class="booking-field">
              <span>Task Title</span>
              <input name="title" type="text" placeholder="Follow up with guest, confirm supplier, reconcile payment" required>
            </label>
            <label class="booking-field">
              <span>Task Type</span>
              <select name="task_type">
                <option value="follow_up">Follow Up</option>
                <option value="payment_chase">Payment Chase</option>
                <option value="supplier_confirm">Supplier Confirm</option>
                <option value="pickup_reconfirm">Pickup Reconfirm</option>
                <option value="refund_review">Refund Review</option>
              </select>
            </label>
            <label class="booking-field">
              <span>Team</span>
              <select name="team">
                <option value="reservations">Reservations</option>
                <option value="finance">Finance</option>
                <option value="operations">Operations</option>
                <option value="supplier_management">Supplier Management</option>
              </select>
            </label>
            <label class="booking-field">
              <span>Priority</span>
              <select name="priority">
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="critical">Critical</option>
              </select>
            </label>
            <label class="booking-field">
              <span>Due</span>
              <input name="due_at" type="datetime-local">
            </label>
            <label class="booking-field-full">
              <span>Description</span>
              <textarea name="description" rows="3" placeholder="What exactly needs to happen next?"></textarea>
            </label>
            <div class="detail-inline-actions">
              <button class="booking-button" type="submit">Add Task</button>
            </div>
          </form>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Timeline and audit trail</h4>
              <p class="muted-copy">Every booking change, email event, and internal note in one place.</p>
            </div>
          </div>
          <div class="timeline-stack">
            ${sortByDateDesc([
              ...history.map(item=>({kind:'status',date:item.created_at,title:`Status: ${item.to_status||'updated'}`,body:item.reason||'Status updated',meta:item.actor_label||'system'})),
              ...transactions.map(item=>({kind:'payment',date:item.created_at,title:`Payment: ${item.transaction_type||'transaction'}`,body:bookingAdminShared.formatMoney(item.amount||0,item.currency_code||booking.currency||state.settings.currency),meta:item.status||'recorded'})),
              ...emails.map(item=>({kind:'email',date:item.created_at,title:item.subject||'Email event',body:item.rendered_body||'Email queued',meta:item.status||'queued'})),
              ...notes.map(item=>({kind:'note',date:item.created_at,title:'Internal note',body:item.note||'',meta:item.is_private ? 'private' : 'shared'}))
            ],'date').map(item=>`
              <article class="timeline-item">
                <div class="timeline-dot ${item.kind}"></div>
                <div class="timeline-content">
                  <div class="timeline-top">
                    <strong>${bookingAdminShared.escapeHtml(item.title)}</strong>
                    <span>${bookingAdminShared.escapeHtml(formatDateTimeLabel(item.date))}</span>
                  </div>
                  <p>${bookingAdminShared.escapeHtml(item.body||'')}</p>
                  <small>${bookingAdminShared.escapeHtml(item.meta||'')}</small>
                </div>
              </article>
            `).join('') || '<p class="muted-copy">No history has been logged yet.</p>'}
          </div>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Documents and communications</h4>
              <p class="muted-copy">Guest invoice, receipts, manifests, vouchers, office settlements, and customer portal requests.</p>
            </div>
          </div>
          <div class="detail-subgrid">
            <article class="detail-card">
              <span>Guest invoice</span>
              <strong>${bookingAdminShared.escapeHtml(invoice?.invoice_number||'Not generated yet')}</strong>
              <p>${invoice ? `${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)} · ${invoice.status}` : 'The guest invoice will appear here once synced from the booking record.'}</p>
            </article>
            <article class="detail-card">
              <span>Office invoices</span>
              <strong>${bookingAdminShared.escapeHtml(String(officeInvoices.length))}</strong>
              <p>${officeInvoices.length ? officeInvoices.map(item=>`${item.invoice_number||'Office invoice'} · ${getOfficeInvoicePartnerName(item)}`).join(' / ') : 'No office invoice or commission record attached yet.'}</p>
            </article>
            <article class="detail-card">
              <span>Resources / pickups</span>
              <strong>${bookingAdminShared.escapeHtml(String(allocations.length))}</strong>
              <p>${allocations.length ? allocations.map(item=>getResourceName(item.resource_id)).join(', ') : 'No resource assignments yet.'}</p>
            </article>
            <article class="detail-card">
              <span>Documents</span>
              <strong>${bookingAdminShared.escapeHtml(String(documentVersions.length||documents.length))}</strong>
              <p>${documentVersions.length ? documentVersions.map(item=>`${formatDisplayLabel(item.document_type)} v${item.version_number||1}`).slice(0,3).join(' / ') : 'Generate invoice, receipt, manifest, voucher, or settlement documents directly from this record.'}</p>
            </article>
            <article class="detail-card">
              <span>Tour memories</span>
              <strong>${bookingAdminShared.escapeHtml(String(memories.length))}</strong>
              <p>${memories.length ? `${memories.length} private image${memories.length===1 ? '' : 's'} ready for reference ${bookingAdminShared.escapeHtml(booking.reference)}.` : 'Upload guest images here so only this booking reference can unlock them.'}</p>
            </article>
            <article class="detail-card">
              <span>Portal links</span>
              <strong>${bookingAdminShared.escapeHtml(String(portalSessions.length))}</strong>
              <p>${portalSessions.length ? `${portalSessions.length} secure access link${portalSessions.length===1 ? '' : 's'} issued.` : 'Create secure guest portal access with document downloads and self-service requests.'}</p>
            </article>
          </div>
          <div class="memory-admin-panel">
            <div>
              <span class="booking-chip">Guest gallery</span>
              <h5>Upload tour memories for ${bookingAdminShared.escapeHtml(booking.reference)}</h5>
              <p class="muted-copy">Images stay private in SkyBook and guests unlock only this gallery with their booking reference on the public sites.</p>
            </div>
            ${memories.length ? `
              <div class="memory-admin-grid">
                ${memories.slice(0,6).map(memory=>`
                  <article class="memory-admin-thumb"${memory.signed_url ? ` style="background-image:linear-gradient(180deg,rgba(6,30,44,0),rgba(6,30,44,.72)),url('${bookingAdminShared.escapeHtml(memory.signed_url)}')"` : ''}>
                    <div>${bookingAdminShared.escapeHtml(String(memory.file_name||'Tour memory'))}</div>
                    <span>${bookingAdminShared.escapeHtml(formatDateTimeLabel(memory.created_at))}</span>
                  </article>
                `).join('')}
              </div>
            ` : '<p class="detail-helper-copy">No guest memory images uploaded yet.</p>'}
            <form class="booking-inline-form booking-inline-form-wide memory-upload-form" data-inline-form="memories">
              <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
              <input type="hidden" name="reference" value="${bookingAdminShared.escapeHtml(booking.reference)}">
              <label class="booking-field-full">
                <span>Tour Images</span>
                <input name="memories" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple required>
              </label>
              <label class="booking-field-full">
                <span>Gallery note</span>
                <input name="caption" type="text" placeholder="Optional note shown with each uploaded image">
              </label>
              <div class="detail-inline-actions">
                <button class="booking-button" type="submit">Upload Tour Memories</button>
              </div>
            </form>
          </div>
          <form class="booking-inline-form booking-inline-form-wide" data-inline-form="email" id="booking-guest-email">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <div class="booking-form-grid">
              <label class="booking-field-full">
                <span>Email subject</span>
                <input type="text" name="subject" value="${bookingAdminShared.escapeHtml(manualEmailDraft.subject)}" required>
              </label>
              <label class="booking-field-full">
                <span>Message</span>
                <textarea name="body" rows="6" required>${bookingAdminShared.escapeHtml(manualEmailDraft.body)}</textarea>
              </label>
              <div class="booking-field-full detail-inline-actions">
                <button class="booking-button" type="submit">Send Guest Email</button>
              </div>
            </div>
          </form>
          <div class="table-wrap detail-table">
            <table>
              <thead><tr><th>Document / Request</th><th>Type</th><th>Status</th><th>When</th><th>Actions</th></tr></thead>
              <tbody>
                ${[
                  ...memories.map(item=>({
                    label:item.file_name||'Tour memory',
                    type:'Tour Memory Image',
                    status:item.is_active===false ? 'inactive' : 'private',
                    when:item.created_at,
                    actions:''
                  })),
                  ...documentVersions.map(item=>({
                    label:item.file_name||item.document_number||formatDisplayLabel(item.document_type),
                    type:`${formatDisplayLabel(item.document_type)} v${item.version_number||1}`,
                    status:item.status||'generated',
                    when:item.created_at,
                    actions:item.signed_url ? `<a class="booking-button ghost compact-button" href="${bookingAdminShared.escapeHtml(item.signed_url)}" target="_blank" rel="noopener noreferrer">Download</a>` : ''
                  })),
                  ...portalRequests.map(item=>({
                    label:item.message||formatDisplayLabel(item.request_type),
                    type:`Portal ${formatDisplayLabel(item.request_type)}`,
                    status:item.status||'open',
                    when:item.created_at,
                    actions:item.attachment_url ? `<span class="status-badge is-neutral">Attachment Logged</span>` : ''
                  })),
                  ...portalSessions.map(item=>({
                    label:`Portal session ${formatDateTimeLabel(item.created_at)}`,
                    type:'Secure Portal Link',
                    status:item.status||'active',
                    when:item.expires_at||item.created_at,
                    actions:''
                  }))
                ].map(item=>`
                  <tr>
                    <td>${bookingAdminShared.escapeHtml(item.label)}</td>
                    <td>${bookingAdminShared.escapeHtml(item.type)}</td>
                    <td>${renderStatusBadge(item.status)}</td>
                    <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(item.when))}</td>
                    <td>${item.actions||''}</td>
                  </tr>
                `).join('') || renderEmptyRow(5,'No documents or portal requests have been logged yet.')}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="booking-detail-rail">
        <div class="detail-actions sticky-actions">
          <button type="button" data-booking-action="confirmed">Confirm</button>
          <button type="button" data-booking-action="paid">Mark Paid</button>
          <button type="button" data-booking-action="awaiting_payment">Awaiting Payment</button>
          <button type="button" data-booking-action="completed">Complete</button>
          <button type="button" data-booking-action="cancelled">Cancel</button>
          <button type="button" data-booking-action="resend">Resend Email</button>
          <button type="button" data-booking-inline-action="duplicate">Duplicate</button>
          <button type="button" data-booking-inline-action="reschedule">Reschedule</button>
          <button type="button" data-booking-inline-action="portal-access">Create Portal Link</button>
        </div>
        <section class="detail-section">
          <h4>Finance</h4>
          <div class="detail-rail-stats">
            <article class="detail-card">
              <span>Guest invoice</span>
              <strong>${bookingAdminShared.formatMoney(invoice?.total_amount||booking.total_amount||0,invoice?.currency_code||booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(invoice?.status||'Unissued')}</p>
            </article>
            <article class="detail-card">
              <span>Guest balance</span>
              <strong>${bookingAdminShared.formatMoney(guestBalance,invoice?.currency_code||booking.currency||state.settings.currency)}</strong>
              <p>${renderStatusBadge(booking.payment_status)}</p>
            </article>
            <article class="detail-card">
              <span>Office exposure</span>
              <strong>${bookingAdminShared.formatMoney(officeExposure,booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(`${officeInvoices.length} office invoice${officeInvoices.length===1 ? '' : 's'}`)}</p>
            </article>
            <article class="detail-card">
              <span>Commission breakdown</span>
              <strong>${bookingAdminShared.formatMoney(operatorCommission+agentCommission,booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(`Operator ${bookingAdminShared.formatMoney(operatorCommission,booking.currency||state.settings.currency)} / Agent ${bookingAdminShared.formatMoney(agentCommission,booking.currency||state.settings.currency)}`)}</p>
            </article>
            <article class="detail-card">
              <span>Refunds</span>
              <strong>${bookingAdminShared.formatMoney(sumAmounts(refunds,'amount'),booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(`${refunds.length} refund record${refunds.length===1 ? '' : 's'}`)}</p>
            </article>
            <article class="detail-card">
              <span>Reconciliation</span>
              <strong>${renderStatusBadge(reconciliationRecord?.status||'open',reconciliationRecord?.status||'open')}</strong>
              <p>${bookingAdminShared.escapeHtml(reconciliationRecord?.summary||'Waiting for finance review.')}</p>
            </article>
          </div>
        </section>
        <section class="detail-section">
          <h4>Operator & settlement</h4>
          <div class="detail-rail-stats">
            <article class="detail-card">
              <span>Assigned operator</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml(getBookingAgentName(booking))}</p>
            </article>
            <article class="detail-card">
              <span>Payment timeline</span>
              <strong>${bookingAdminShared.escapeHtml(String(payments.length))}</strong>
              <p>${payments.length ? payments.map(item=>`${item.provider} · ${item.status}`).join(' / ') : 'No payment records yet.'}</p>
            </article>
            <article class="detail-card">
              <span>Email log</span>
              <strong>${bookingAdminShared.escapeHtml(String(emails.length))}</strong>
              <p>${emails.length ? bookingAdminShared.escapeHtml(emails[0].subject||'Latest email queued') : 'No email has been logged yet.'}</p>
            </article>
            <article class="detail-card">
              <span>Last changed</span>
              <strong>${bookingAdminShared.escapeHtml(formatDateTimeLabel(booking.updated_at||booking.created_at))}</strong>
              <p>${bookingAdminShared.escapeHtml(lastChangedBy)}</p>
            </article>
          </div>
        </section>
        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Documents & portal actions</h4>
              <p class="muted-copy">Generate stored PDFs, create secure guest access links, and log customer self-service actions.</p>
            </div>
          </div>
          <div class="detail-actions vertical-actions">
            <button type="button" data-booking-inline-action="document:guest_invoice">Guest Invoice PDF</button>
            <button type="button" data-booking-inline-action="document:receipt">Receipt PDF</button>
            <button type="button" data-booking-inline-action="document:manifest">Manifest PDF</button>
            <button type="button" data-booking-inline-action="document:voucher">Voucher PDF</button>
            <button type="button" data-booking-inline-action="document:settlement">Office Settlement PDF</button>
            <button type="button" data-booking-inline-action="memories-focus">Upload Tour Memories</button>
            <button type="button" data-booking-inline-action="portal:request_change">Portal: Request Change</button>
            <button type="button" data-booking-inline-action="portal:upload_info">Portal: Upload Passport / Info</button>
            <button type="button" data-booking-inline-action="portal:confirm_pickup">Portal: Confirm Pickup</button>
          </div>
        </section>
        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Assignment control</h4>
              <p class="muted-copy">Attach the operating company directly to the booking record so filters, payouts, and reporting stay in sync.</p>
            </div>
          </div>
          <form class="booking-inline-form" data-inline-form="operator-assignment">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <label class="booking-field-full">
              <span>Operator</span>
              <select name="operator_id">
                <option value="">Unassigned</option>
                ${operatorOptions}
              </select>
            </label>
            <label class="booking-field">
              <span>Commission Amount</span>
              <input type="number" name="commission_amount" min="0" step="0.01" value="${bookingAdminShared.escapeHtml(String(operatorAssignment?.commission_amount||''))}" placeholder="0.00">
            </label>
            <div class="detail-callout">
              <strong>Current assignment</strong>
              <p class="detail-helper-copy">${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</p>
            </div>
            <div class="detail-inline-actions">
              <button class="booking-button" type="submit">Save Assignment</button>
              <button class="booking-button ghost" type="button" data-booking-inline-action="clear-operator">Clear Assignment</button>
            </div>
          </form>
        </section>
        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Internal notes</h4>
              <p class="muted-copy">Capture office handover notes, payment exceptions, or guest service context without leaving the booking.</p>
            </div>
          </div>
          <div class="template-chip-row">
            ${noteTemplates.map(template=>`<button class="booking-button ghost compact-button" type="button" data-booking-inline-action="note-template" data-template-value="${bookingAdminShared.escapeHtml(template)}">${bookingAdminShared.escapeHtml(template)}</button>`).join('')}
          </div>
          <form class="booking-inline-form" data-inline-form="note">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <label class="booking-field-full">
              <span>New note</span>
              <textarea name="note" rows="4" placeholder="Add an internal note for operations, finance, or guest care." required></textarea>
            </label>
            <label class="inline-check">
              <input type="checkbox" name="is_private" checked>
              <span>Keep this note private to internal staff.</span>
            </label>
            <div class="detail-inline-actions">
              <button class="booking-button" type="submit">Add Internal Note</button>
            </div>
          </form>
        </section>
      </aside>
    </div>
  `
}

const renderServiceOptions=()=>{
  const currentServiceFilter=nodes.bookingFilterService?.value||''
  const currentOperatorFilter=nodes.bookingFilterOperator?.value||''
  const currentAgentFilter=nodes.bookingFilterAgent?.value||''
  const options=state.services.map(service=>`<option value="${bookingAdminShared.escapeHtml(service.slug)}">${bookingAdminShared.escapeHtml(service.name)}</option>`).join('')
  nodes.bookingService.innerHTML=`<option value="">Choose service</option>${options}`
  if(nodes.scheduleService)nodes.scheduleService.innerHTML=`<option value="">Choose service</option>${options}`
  if(nodes.blackoutService)nodes.blackoutService.innerHTML=`<option value="">All services</option>${options}`
  if(nodes.bookingFilterService){
    nodes.bookingFilterService.innerHTML=`<option value="">All services</option>${options}`
    nodes.bookingFilterService.value=currentServiceFilter
  }
  if(nodes.officeOperatorId){
    nodes.officeOperatorId.innerHTML=`<option value="">Choose operator</option>${state.operators.map(operator=>`<option value="${bookingAdminShared.escapeHtml(operator.id)}">${bookingAdminShared.escapeHtml(operator.company_name)}</option>`).join('')}`
  }
  if(nodes.bookingFilterOperator){
    nodes.bookingFilterOperator.innerHTML=`<option value="">All operators</option>${state.operators.map(operator=>`<option value="${bookingAdminShared.escapeHtml(operator.id)}">${bookingAdminShared.escapeHtml(operator.company_name)}</option>`).join('')}`
    nodes.bookingFilterOperator.value=currentOperatorFilter
  }
  if(nodes.officeAgentId){
    nodes.officeAgentId.innerHTML=`<option value="">Choose agent</option>${state.agents.map(agent=>`<option value="${bookingAdminShared.escapeHtml(agent.id)}">${bookingAdminShared.escapeHtml(agent.company_name)}</option>`).join('')}`
  }
  if(nodes.bookingFilterAgent){
    nodes.bookingFilterAgent.innerHTML=`<option value="">All agents</option>${state.agents.map(agent=>`<option value="${bookingAdminShared.escapeHtml(agent.id)}">${bookingAdminShared.escapeHtml(agent.company_name)}</option>`).join('')}`
    nodes.bookingFilterAgent.value=currentAgentFilter
  }
}

const renderBrandOptions=()=>{
  if(!nodes.bookingFilterBrand)return
  const currentBrandFilter=nodes.bookingFilterBrand.value||''
  const currentCustomerBrandFilter=nodes.customerFilterBrand?.value||''
  const currentBookingBrand=nodes.bookingBrand?.value||''
  const brandOptions=state.brands.map(brand=>`<option value="${bookingAdminShared.escapeHtml(brand.code)}">${bookingAdminShared.escapeHtml(brand.name)}</option>`).join('')
  nodes.bookingFilterBrand.innerHTML=`<option value="">All brands</option>${brandOptions}`
  nodes.bookingFilterBrand.value=currentBrandFilter
  if(nodes.customerFilterBrand){
    nodes.customerFilterBrand.innerHTML=`<option value="">All brands</option>${brandOptions}`
    nodes.customerFilterBrand.value=currentCustomerBrandFilter
  }
  if(nodes.bookingBrand){
    nodes.bookingBrand.innerHTML=`<option value="">Choose brand</option>${brandOptions}`
    nodes.bookingBrand.value=currentBookingBrand || bookingAdminShared.readConfig().brandCode || state.brands[0]?.code || ''
  }
}

const renderSourceFilters=()=>{
  const sourceValues=new Set(['website','admin'])
  state.bookings.forEach(booking=>{
    const bookingSource=normalizeText(booking.source) || normalizeText(booking.metadata?.source)
    if(bookingSource)sourceValues.add(bookingSource)
  })
  state.customers.forEach(customer=>{
    normalizeCodeList(customer.booking_sources).forEach(source=>sourceValues.add(source))
    const latestSource=normalizeText(customer.last_source)
    if(latestSource)sourceValues.add(latestSource)
  })
  const sourceOptions=[...sourceValues].sort((left,right)=>left.localeCompare(right)).map(source=>`<option value="${bookingAdminShared.escapeHtml(source)}">${bookingAdminShared.escapeHtml(formatSourceLabel(source))}</option>`).join('')
  if(nodes.bookingFilterSource){
    const currentBookingSource=nodes.bookingFilterSource.value||''
    nodes.bookingFilterSource.innerHTML=`<option value="">All sources</option>${sourceOptions}`
    nodes.bookingFilterSource.value=currentBookingSource
  }
  if(nodes.customerFilterSource){
    const currentCustomerSource=nodes.customerFilterSource.value||''
    nodes.customerFilterSource.innerHTML=`<option value="">All sources</option>${sourceOptions}`
    nodes.customerFilterSource.value=currentCustomerSource
  }
}

const fillBookingForm=(booking=null)=>{
  nodes.bookingReference.value=booking?.reference||''
  if(nodes.bookingBrand)nodes.bookingBrand.value=booking?.brand_code||bookingAdminShared.readConfig().brandCode||state.brands[0]?.code||''
  if(nodes.bookingSource)nodes.bookingSource.value=booking?.source||'admin'
  nodes.bookingService.value=booking?.service_slug||''
  nodes.bookingStatus.value=booking?.status||'awaiting_payment'
  nodes.bookingPaymentStatus.value=booking?.payment_status||'pending'
  nodes.bookingDate.value=booking?.preferred_date||''
  nodes.bookingQuantity.value=booking?.quantity||2
  nodes.bookingCustomerName.value=booking?.customer_name||''
  nodes.bookingCustomerEmail.value=booking?.customer_email||''
  nodes.bookingCustomerPhone.value=booking?.customer_phone||''
  nodes.bookingNotes.value=booking?.notes||booking?.customer_notes||''
  nodes.bookingSaveButton.textContent=booking ? 'Save Booking' : 'Create Booking'
}

const openBookingModal=(booking=null)=>{
  const requestedBooking=booking&&typeof booking==='object' ? booking : null
  state.selectedBookingId=requestedBooking?.id||''
  fillBookingForm(requestedBooking)
  if(nodes.bookingModalTitle)nodes.bookingModalTitle.textContent=requestedBooking ? 'Edit booking' : 'Create booking'
  setBookingModalState(true)
  window.setTimeout(()=>nodes.bookingCustomerName?.focus(),60)
}

const closeBookingModal=()=>{
  if(!state.isBookingModalOpen && !nodes.bookingModal)return
  fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  if(nodes.bookingModalTitle)nodes.bookingModalTitle.textContent='Create booking'
  setBookingModalState(false)
}

const openBookingManagementScreen=(booking,{scroll=true}={})=>{
  if(!booking)return
  state.selectedBookingId=booking.id
  switchTab('bookings')
  fillBookingForm(booking)
  renderBookings()
  renderBookingDetail()
  const detailPanel=nodes.bookingDetail?.closest('.booking-detail-panel')
  detailPanel?.classList.add('is-management-open')
  if(scroll){
    window.setTimeout(()=>detailPanel?.scrollIntoView?.({behavior:'smooth',block:'start'}),80)
  }
}

const getFilteredServices=()=>{
  const visibilityFilter=normalizeText(nodes.serviceFilterBrand?.value)
  return [...state.services].filter(service=>{
    const brandCodes=getServiceBrandCodes(service)
    if(visibilityFilter==='shared')return brandCodes.includes('true-travel') && brandCodes.includes('iventure')
    if(visibilityFilter)return brandCodes.includes(visibilityFilter)
    return true
  })
}

const renderServices=()=>{
  const filteredServices=getFilteredServices()
  if(nodes.serviceOverviewCards){
    const activeServices=state.services.filter(service=>service.is_active!==false)
    const sharedServices=activeServices.filter(service=>{
      const brandCodes=getServiceBrandCodes(service)
      return brandCodes.includes('true-travel') && brandCodes.includes('iventure')
    })
    const trueTravelOnly=activeServices.filter(service=>{
      const brandCodes=getServiceBrandCodes(service)
      return brandCodes.includes('true-travel') && !brandCodes.includes('iventure')
    })
    const iventureOnly=activeServices.filter(service=>{
      const brandCodes=getServiceBrandCodes(service)
      return brandCodes.includes('iventure') && !brandCodes.includes('true-travel')
    })
    nodes.serviceOverviewCards.innerHTML=[
      {label:'Visible now',value:String(filteredServices.length),meta:'Tours shown in the current filter.'},
      {label:'Shared catalog',value:String(sharedServices.length),meta:'Available on both True Travel and Iventure.'},
      {label:'True Travel only',value:String(trueTravelOnly.length),meta:'Brand-exclusive tours on True Travel.'},
      {label:'Iventure only',value:String(iventureOnly.length),meta:'Brand-exclusive tours on Iventure.'}
    ].map(card=>`
      <article class="metric-card compact">
        <span>${bookingAdminShared.escapeHtml(card.label)}</span>
        <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
        <small>${bookingAdminShared.escapeHtml(card.meta)}</small>
      </article>
    `).join('')
  }
  nodes.servicesTable.innerHTML=filteredServices.map(service=>`
    <tr data-service-id="${bookingAdminShared.escapeHtml(service.id)}">
      <td>${bookingAdminShared.escapeHtml(service.name)}</td>
      <td>${bookingAdminShared.escapeHtml(service.category_slug)}</td>
      <td>${bookingAdminShared.formatMoney(service.base_price,service.currency)}</td>
      <td>${bookingAdminShared.escapeHtml(service.minimum_pax||1)}</td>
      <td>${bookingAdminShared.escapeHtml(service.preferred_date_mode)}</td>
      <td>${bookingAdminShared.escapeHtml(formatServiceVisibilityLabel(service))}</td>
    </tr>
  `).join('') || renderEmptyRow(6,'No tours match the selected visibility filter.')
}

const syncModalBodyState=()=>{
  document.body.classList.toggle('is-modal-open',state.isServiceModalOpen||state.isBookingModalOpen)
}

const setServiceModalState=isOpen=>{
  if(!nodes.serviceModal)return
  state.isServiceModalOpen=Boolean(isOpen)
  nodes.serviceModal.hidden=!state.isServiceModalOpen
  nodes.serviceModal.setAttribute('aria-hidden',String(!state.isServiceModalOpen))
  syncModalBodyState()
}

const setBookingModalState=isOpen=>{
  if(!nodes.bookingModal)return
  state.isBookingModalOpen=Boolean(isOpen)
  nodes.bookingModal.hidden=!state.isBookingModalOpen
  nodes.bookingModal.setAttribute('aria-hidden',String(!state.isBookingModalOpen))
  syncModalBodyState()
}

const fillServiceForm=(service=null)=>{
  const brandCodes=getServiceBrandCodes(service)
  nodes.serviceId.value=service?.id||''
  nodes.serviceName.value=service?.name||''
  nodes.serviceSlug.value=service?.slug||''
  nodes.serviceCategory.value=service?.category_slug||'coastal-tours'
  nodes.servicePrice.value=service?.base_price||''
  nodes.serviceDateRule.value=service?.preferred_date_mode||'optional'
  nodes.serviceDuration.value=service?.duration_label||''
  if(nodes.serviceMinPax)nodes.serviceMinPax.value=service?.minimum_pax||1
  if(nodes.serviceDepartureWindow)nodes.serviceDepartureWindow.value=service?.departure_window||''
  if(nodes.servicePickupTime)nodes.servicePickupTime.value=service?.pickup_time||''
  nodes.serviceSummary.value=service?.short_description||''
  if(nodes.serviceLearnMoreDescription)nodes.serviceLearnMoreDescription.value=service?.full_description||service?.short_description||''
  nodes.serviceHighlights.value=(service?.highlight_points||[]).join(', ')
  if(nodes.serviceLandscapeImages)nodes.serviceLandscapeImages.value=(service?.media_gallery||[]).map(item=>String(item?.url||'').trim()).filter(Boolean).join('\n')
  if(nodes.serviceBrandTrueTravel)nodes.serviceBrandTrueTravel.checked=brandCodes.includes('true-travel')
  if(nodes.serviceBrandIventure)nodes.serviceBrandIventure.checked=brandCodes.includes('iventure')
  nodes.serviceActive.checked=service?.is_active!==false
}

const openServiceModal=(service=null)=>{
  const requestedService=service&&typeof service==='object' ? service : null
  state.selectedServiceId=requestedService?.id||''
  fillServiceForm(requestedService)
  if(nodes.serviceModalTitle)nodes.serviceModalTitle.textContent=requestedService ? 'Edit service' : 'Create service'
  syncAdminRouteState({tab:'services',serviceId:state.selectedServiceId})
  setServiceModalState(true)
  window.setTimeout(()=>nodes.serviceName?.focus(),60)
}

const closeServiceModal=()=>{
  if(!state.isServiceModalOpen && !nodes.serviceModal)return
  state.selectedServiceId=''
  fillServiceForm(null)
  if(nodes.serviceModalTitle)nodes.serviceModalTitle.textContent='Create service'
  setServiceModalState(false)
  syncAdminRouteState({tab:'services',serviceId:''})
}

const getFilteredCustomers=()=>{
  const search=(nodes.customerFilterSearch?.value||'').trim().toLowerCase()
  const brand=(nodes.customerFilterBrand?.value||'').trim()
  const source=(nodes.customerFilterSource?.value||'').trim()
  return [...state.customers]
    .filter(customer=>{
      const brandCodes=normalizeCodeList(customer.brand_codes)
      const sourceCodes=normalizeCodeList(customer.booking_sources)
      const haystack=[
        customer.full_name,
        customer.email,
        customer.phone,
        customer.last_booking_reference,
        customer.latest_customer_note
      ].join(' ').toLowerCase()
      if(search&&!haystack.includes(search))return false
      if(brand&&!(brandCodes.includes(brand)||normalizeText(customer.last_brand_code)===brand))return false
      if(source&&!(sourceCodes.includes(source)||normalizeText(customer.last_source)===source))return false
      return true
    })
    .sort((left,right)=>(parseDateValue(right.last_booking_date||right.updated_at||right.created_at)?.getTime()||0)-(parseDateValue(left.last_booking_date||left.updated_at||left.created_at)?.getTime()||0))
}

const renderCustomerDetail=()=>{
  if(!nodes.customerDetail)return
  const customer=state.customers.find(item=>item.id===state.selectedCustomerId)
  if(!customer){
    nodes.customerDetail.innerHTML='<div class="empty-state"><strong>Select a customer</strong><span>Choose a CRM record to review booking history, communication, source history, and portal activity.</span></div>'
    return
  }
  const bookings=sortByDateDesc(getCustomerBookings(customer),'created_at')
  const emails=sortByDateDesc(getCustomerEmails(customer),'created_at')
  const portalRequests=sortByDateDesc(getCustomerPortalRequests(customer),'created_at')
  const portalSessions=sortByDateDesc(getCustomerPortalSessions(customer),'created_at')
  const totalRevenue=bookings.reduce((sum,booking)=>sum+Number(booking.total_amount||0),0)
  const outstandingExposure=bookings.reduce((sum,booking)=>sum+Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0),0)
  nodes.customerDetail.innerHTML=`
    <div class="crm-profile-grid">
      <article class="metric-card">
        <span class="metric-label">Guest</span>
        <strong>${bookingAdminShared.escapeHtml(customer.full_name||'Unnamed customer')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(customer.email||'No email captured')}</div>
        <div class="table-subline">${bookingAdminShared.escapeHtml(customer.phone||'No phone captured')}</div>
      </article>
      <article class="metric-card">
        <span class="metric-label">Brand footprint</span>
        <strong>${bookingAdminShared.escapeHtml(formatBrandLabel(customer.last_brand_code||''))}</strong>
        ${renderChipGroup(customer.brand_codes,{formatter:formatBrandLabel,fallback:'No brand history yet'})}
      </article>
      <article class="metric-card">
        <span class="metric-label">Source footprint</span>
        <strong>${bookingAdminShared.escapeHtml(formatSourceLabel(customer.last_source||'website'))}</strong>
        ${renderChipGroup(customer.booking_sources,{formatter:formatSourceLabel,fallback:'No source history yet'})}
      </article>
      <article class="metric-card">
        <span class="metric-label">Commercials</span>
        <strong>${bookingAdminShared.formatMoney(totalRevenue,state.settings.currency||'NAD')}</strong>
        <div class="table-subline">Outstanding ${bookingAdminShared.formatMoney(outstandingExposure,state.settings.currency||'NAD')}</div>
      </article>
    </div>
    <section class="detail-section">
      <div class="section-heading">
        <div>
          <h4>Booking history</h4>
        </div>
      </div>
      <div class="crm-booking-list">
        ${bookings.map(booking=>`
          <button class="crm-booking-item" type="button" data-customer-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
            <div class="crm-booking-item-top">
              <strong>${bookingAdminShared.escapeHtml(booking.reference||'Draft booking')}</strong>
              <span>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date||booking.created_at))}</span>
            </div>
            <div class="crm-booking-item-meta">
              <span>${bookingAdminShared.escapeHtml(formatBrandLabel(booking.brand_code||''))}</span>
              <span>${bookingAdminShared.escapeHtml(formatSourceLabel(booking.source||booking.metadata?.source||'website'))}</span>
              <span>${bookingAdminShared.escapeHtml(booking.service_name||'Service pending')}</span>
              <span>${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</span>
              <span>${bookingAdminShared.formatMoney(booking.total_amount||0,booking.currency||state.settings.currency)}</span>
            </div>
            <div class="badge-stack">
              ${renderStatusBadge(booking.status)}
              ${renderStatusBadge(booking.payment_status,`Payment ${String(booking.payment_status||'').replace(/_/g,' ')}`)}
            </div>
          </button>
        `).join('') || '<div class="empty-state"><strong>No bookings yet</strong><span>This customer exists in CRM but has no linked bookings yet.</span></div>'}
      </div>
    </section>
    <section class="detail-section">
      <div class="section-heading">
        <div>
          <h4>Communication & portal</h4>
        </div>
      </div>
      <div class="crm-profile-grid">
        <article class="metric-card">
          <span class="metric-label">Emails sent</span>
          <strong>${bookingAdminShared.escapeHtml(String(emails.length))}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(formatDateTimeLabel(emails[0]?.created_at))}</div>
        </article>
        <article class="metric-card">
          <span class="metric-label">Portal requests</span>
          <strong>${bookingAdminShared.escapeHtml(String(portalRequests.length))}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(formatDateTimeLabel(portalRequests[0]?.created_at))}</div>
        </article>
        <article class="metric-card">
          <span class="metric-label">Portal sessions</span>
          <strong>${bookingAdminShared.escapeHtml(String(portalSessions.length))}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(formatDateTimeLabel(portalSessions[0]?.created_at))}</div>
        </article>
        <article class="metric-card">
          <span class="metric-label">Latest note</span>
          <strong>${bookingAdminShared.escapeHtml(customer.latest_customer_note||'No note captured')}</strong>
          <div class="table-subline">Created ${bookingAdminShared.escapeHtml(formatDateLabel(customer.created_at))}</div>
        </article>
      </div>
    </section>
  `
}

const renderCustomers=()=>{
  if(!nodes.customersTable)return
  const filteredCustomers=getFilteredCustomers()
  if(filteredCustomers.length && !filteredCustomers.some(customer=>customer.id===state.selectedCustomerId)){
    state.selectedCustomerId=filteredCustomers[0].id
  }
  if(!filteredCustomers.length){
    state.selectedCustomerId=''
  }
  if(nodes.crmOverviewCards){
    const totalCustomers=filteredCustomers.length
    const websiteCustomers=filteredCustomers.filter(customer=>normalizeCodeList(customer.booking_sources).includes('website') || normalizeText(customer.last_source)==='website').length
    const sharedCustomers=filteredCustomers.filter(customer=>normalizeCodeList(customer.brand_codes).length>1).length
    const activeCustomers=filteredCustomers.filter(customer=>Number(customer.booking_count||0)>0).length
    nodes.crmOverviewCards.innerHTML=[
      {label:'Visible in CRM',value:String(totalCustomers),meta:'Customer records loaded across both brands.'},
      {label:'Website-sourced',value:String(websiteCustomers),meta:'Guests captured directly from True Travel or Iventure.'},
      {label:'Shared between brands',value:String(sharedCustomers),meta:'Guests with booking history across both storefronts.'},
      {label:'With live bookings',value:String(activeCustomers),meta:'Customers that already have at least one booking.'}
    ].map(card=>`
      <article class="metric-card">
        <span class="metric-label">${bookingAdminShared.escapeHtml(card.label)}</span>
        <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(card.meta)}</div>
      </article>
    `).join('')
  }
  nodes.customersTable.innerHTML=filteredCustomers.map(customer=>`
    <tr class="customer-row${customer.id===state.selectedCustomerId ? ' is-active' : ''}" data-customer-id="${bookingAdminShared.escapeHtml(customer.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(customer.full_name)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(customer.latest_customer_note||'Website enquiries and booking notes will accumulate here.')}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(customer.email)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(customer.phone||'No phone captured')}</div>
      </td>
      <td>${renderChipGroup(customer.brand_codes,{formatter:formatBrandLabel,fallback:'No brand history yet'})}</td>
      <td>${renderChipGroup(customer.booking_sources,{formatter:formatSourceLabel,fallback:'No source history yet'})}</td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(String(customer.booking_count||0))} booking${Number(customer.booking_count||0)===1 ? '' : 's'}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatDateLabel(customer.last_booking_date||customer.created_at))}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(customer.last_booking_reference||'No booking yet')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatBrandLabel(customer.last_brand_code||''))}</div>
      </td>
    </tr>
  `).join('') || renderEmptyRow(6,'No customers are loaded yet.')
  renderCustomerDetail()
}

const renderPayments=()=>{
  nodes.paymentsTable.innerHTML=state.payments.map(payment=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(payment.reference||'')}</td>
      <td>${bookingAdminShared.escapeHtml(payment.provider)}</td>
      <td>${bookingAdminShared.escapeHtml(payment.status)}</td>
      <td>${bookingAdminShared.formatMoney(payment.amount,payment.currency||state.settings.currency)}</td>
      <td>${bookingAdminShared.escapeHtml(payment.created_at||'')}</td>
    </tr>
  `).join('')
}

const renderSettings=()=>{
  nodes.settingsForm.currency.value=state.settings.currency||'NAD'
  nodes.settingsForm.supportEmail.value=state.settings.supportEmail||state.settings.supportEmailsByBrand?.['true-travel']||'bookings@truetravelnam.net'
  nodes.settingsForm.supportPhone.value=state.settings.supportPhone||''
  nodes.settingsForm.defaultDepositValue.value=state.settings.defaultDepositValue||30
  nodes.settingsForm.taxRate.value=state.settings.taxRate||0
  nodes.settingsForm.serviceFee.value=state.settings.serviceFee||0
  if(nodes.portalBaseUrl)nodes.portalBaseUrl.value=state.portalSettings.portalBaseUrl||'/portal.html'
  if(nodes.portalSessionDurationHours)nodes.portalSessionDurationHours.value=state.portalSettings.sessionDurationHours||72
}

const renderEmailTemplates=()=>{
  const mergedTemplates={...bookingAdminShared.clone(bookingAdminShared.DEFAULT_EMAIL_TEMPLATES),...(state.emailTemplates||{})}
  const orderedKeys=[
    ...Object.keys(EMAIL_TEMPLATE_META),
    ...Object.keys(mergedTemplates).filter(key=>!Object.prototype.hasOwnProperty.call(EMAIL_TEMPLATE_META,key))
  ]
  nodes.emailTemplatesForm.innerHTML=orderedKeys.map(key=>{
    const template=mergedTemplates[key]||{subject:'',body:''}
    const meta=EMAIL_TEMPLATE_META[key]||{label:key,description:'Custom template.'}
    return `
    <article class="template-card">
      <h3>${bookingAdminShared.escapeHtml(meta.label)}</h3>
      <p class="admin-inline-copy">${bookingAdminShared.escapeHtml(meta.description)}</p>
      <label class="booking-field-full">
        <span>Subject</span>
        <input type="text" data-template-key="${bookingAdminShared.escapeHtml(key)}" data-template-field="subject" value="${bookingAdminShared.escapeHtml(template.subject)}">
      </label>
      <label class="booking-field-full">
        <span>Body</span>
        <textarea rows="8" data-template-key="${bookingAdminShared.escapeHtml(key)}" data-template-field="body">${bookingAdminShared.escapeHtml(template.body)}</textarea>
      </label>
    </article>
  `
  }).join('')
  if(nodes.emailTriggerBookingMade)nodes.emailTriggerBookingMade.checked=state.automationRules.sendOnBookingMade!==false
  if(nodes.emailTriggerBookingConfirmed)nodes.emailTriggerBookingConfirmed.checked=state.automationRules.sendOnBookingConfirmed!==false
  if(nodes.emailTriggerPaymentReceived)nodes.emailTriggerPaymentReceived.checked=state.automationRules.sendOnPaymentReceived!==false
  if(nodes.emailTriggerCancellationRefund)nodes.emailTriggerCancellationRefund.checked=state.automationRules.sendOnCancellationRefund!==false
  if(nodes.emailSenderTrueTravel){
    const configuredSupportEmails=state.settings.supportEmailsByBrand||{}
    nodes.emailSenderTrueTravel.textContent=configuredSupportEmails['true-travel']||state.settings.supportEmail||'bookings@truetravelnam.net'
  }
}

const renderEngine=()=>{
  const serviceNameById=new Map(state.services.map(service=>[service.id,service.name]))
  const scheduleRows=state.schedules.map(schedule=>({
    label:serviceNameById.get(schedule.service_id)||schedule.service_id,
    type:'Operating Window',
    value:`${schedule.day_of_week} · ${schedule.start_time} - ${schedule.end_time}`,
    status:schedule.is_active===false ? 'Inactive' : 'Active'
  }))
  const blackoutRows=state.blackoutDates.map(rule=>({
    label:serviceNameById.get(rule.service_id)||'All services',
    type:'Blackout',
    value:`${rule.starts_on} → ${rule.ends_on}`,
    status:rule.reason||'Blocked'
  }))
  const rows=[...scheduleRows,...blackoutRows]
  nodes.engineSchedulesTable.innerHTML=rows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(row.label)}</td>
      <td>${bookingAdminShared.escapeHtml(row.type)}</td>
      <td>${bookingAdminShared.escapeHtml(row.value)}</td>
      <td>${bookingAdminShared.escapeHtml(row.status)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No schedules or blackout ranges configured yet.</td></tr>'

  const commercialRows=[
    ...state.coupons.map(coupon=>({type:'Coupon',code:coupon.code,value:`${coupon.discount_type} ${coupon.discount_value}`,status:coupon.is_active===false ? 'Inactive' : 'Active'})),
    ...state.vouchers.map(voucher=>({type:'Voucher',code:voucher.code,value:bookingAdminShared.formatMoney(voucher.remaining_value||voucher.initial_value||0,voucher.currency_code||state.settings.currency),status:voucher.is_active===false ? 'Inactive' : 'Active'})),
    ...state.agents.map(agent=>({type:'Agent',code:agent.code,value:`${agent.company_name} · ${agent.commission_type} ${agent.commission_value}`,status:agent.is_active===false ? 'Inactive' : 'Active'}))
  ]
  nodes.commercialToolsTable.innerHTML=commercialRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(row.type)}</td>
      <td>${bookingAdminShared.escapeHtml(row.code)}</td>
      <td>${bookingAdminShared.escapeHtml(row.value)}</td>
      <td>${bookingAdminShared.escapeHtml(row.status)}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No coupons, vouchers, or agents configured yet.</td></tr>'
}

const renderPlatform=()=>{
  const opRows=[
    ...state.resources.map(resource=>({label:resource.name,type:`Resource · ${resource.resource_type||'resource'}`,status:getResourceStatusLabel(resource),value:getResourceCapacityLabel(resource)})),
    ...state.invoices.slice(0,6).map(invoice=>({label:invoice.invoice_number,type:'Invoice',status:invoice.status,value:bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)})),
    ...state.refunds.slice(0,6).map(refund=>({label:refund.booking_id,type:'Refund',status:refund.status,value:bookingAdminShared.formatMoney(refund.amount||0,refund.currency_code||state.settings.currency)}))
  ]
  nodes.platformOperationsTable.innerHTML=opRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(String(row.label||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.type||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.status||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No resources, invoices, or refunds loaded yet.</td></tr>'

  const configRows=[
    ...state.operators.map(operator=>({
      category:'Operator',
      name:operator.company_name,
      status:operator.is_active===false ? 'Inactive' : 'Active',
      value:[
        `${operator.commission_type} ${operator.commission_value}`,
        operator.preferred_contact_method || 'contact not set',
        operator.payout_terms || 'payout terms missing'
      ].filter(Boolean).join(' - ')
    })),
    ...state.officeInvoices.map(invoice=>({category:'Office Invoice',name:invoice.invoice_number,status:invoice.status,value:bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)})),
    ...state.supportedLanguages.map(language=>({category:'Language',name:language.name,status:language.is_active===false ? 'Inactive' : (language.is_default ? 'Default' : 'Active'),value:language.code})),
    ...state.supportedCurrencies.map(currency=>({category:'Currency',name:currency.name,status:currency.is_active===false ? 'Inactive' : (currency.is_default ? 'Default' : 'Active'),value:`${currency.code} · ${currency.symbol||''}`})),
    ...state.webhookEndpoints.map(webhook=>({category:'Webhook',name:webhook.name,status:webhook.is_active===false ? 'Inactive' : 'Active',value:webhook.target_url})),
    ...state.calendarConnections.map(connection=>({category:'Calendar',name:connection.provider,status:connection.is_active===false ? 'Inactive' : 'Active',value:connection.external_calendar_id}))
  ]
  nodes.platformConfigTable.innerHTML=configRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(String(row.category||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.name||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.status||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No platform configuration records loaded yet.</td></tr>'

  nodes.automationAutoConfirmPaid.checked=Boolean(state.automationRules.autoConfirmPaidBookings)
  nodes.automationAutoCompletePast.checked=Boolean(state.automationRules.autoCompletePastConfirmedBookings)
  nodes.automationExpiryHours.value=state.automationRules.awaitingPaymentExpiryHours||48
  nodes.portalEnabled.checked=Boolean(state.portalSettings.enabled)
  nodes.portalLookupEnabled.checked=Boolean(state.portalSettings.allowBookingLookup)
}

const buildAutomationRulesPayload=()=>({
  autoConfirmPaidBookings:Boolean(nodes.automationAutoConfirmPaid?.checked),
  autoCompletePastConfirmedBookings:Boolean(nodes.automationAutoCompletePast?.checked),
  autoCancelExpiredAwaitingPayment:Boolean(state.automationRules.autoCancelExpiredAwaitingPayment),
  awaitingPaymentExpiryHours:Number(nodes.automationExpiryHours?.value||48),
  sendOnBookingMade:Boolean(nodes.emailTriggerBookingMade?.checked),
  sendOnBookingConfirmed:Boolean(nodes.emailTriggerBookingConfirmed?.checked),
  sendOnPaymentReceived:Boolean(nodes.emailTriggerPaymentReceived?.checked),
  sendOnCancellationRefund:Boolean(nodes.emailTriggerCancellationRefund?.checked)
})

const renderReportsWorkbench=()=>{
  const overview=state.reports?.overview||{}
  const brandMap=new Map(state.brands.map(brand=>[brand.code,brand.name]))
  const byBrand=state.bookings.reduce((accumulator,booking)=>{
    const key=booking.brand_code||'unassigned'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const byService=state.bookings.reduce((accumulator,booking)=>{
    const key=booking.service_name||'Unknown service'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const bySource=state.bookings.reduce((accumulator,booking)=>{
    const key=booking.source||booking.metadata?.source||'website'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const cancelledBookings=state.bookings.filter(booking=>String(booking.status||'').toLowerCase()==='cancelled')
  const unpaidInvoices=state.invoices.filter(invoice=>Number(invoice.balance_amount||0)>0)
  const commissionDue=sumAmounts(state.officeInvoices.filter(invoice=>!['paid','cancelled'].includes(String(invoice.status||'').toLowerCase())),'commission_amount')
  const operatorPayoutsDue=sumAmounts(state.officeInvoices.filter(invoice=>String(invoice.payee_type||'').toLowerCase()==='operator' && !['paid','cancelled'].includes(String(invoice.status||'').toLowerCase())),'total_amount')
  const agentPayoutsDue=sumAmounts(state.officeInvoices.filter(invoice=>String(invoice.payee_type||'').toLowerCase()==='agent' && !['paid','cancelled'].includes(String(invoice.status||'').toLowerCase())),'total_amount')
  const cards=[
    {label:'Gross Revenue',value:bookingAdminShared.formatMoney(overview.gross_revenue||0,state.settings.currency||'NAD')},
    {label:'Paid Revenue',value:bookingAdminShared.formatMoney(overview.paid_revenue||0,state.settings.currency||'NAD')},
    {label:'Guest Outstanding',value:bookingAdminShared.formatMoney(overview.guest_outstanding||0,state.settings.currency||'NAD')},
    {label:'Office Payables',value:bookingAdminShared.formatMoney(overview.office_payables||0,state.settings.currency||'NAD')},
    {label:'Refund Exposure',value:bookingAdminShared.formatMoney(overview.refund_exposure||0,state.settings.currency||'NAD')},
    {label:'Commission Due',value:bookingAdminShared.formatMoney(commissionDue,state.settings.currency||'NAD')},
    {label:'Operator Payouts',value:bookingAdminShared.formatMoney(operatorPayoutsDue,state.settings.currency||'NAD')},
    {label:'Unpaid Invoices',value:String(unpaidInvoices.length)}
  ]
  nodes.reportsOverviewCards.innerHTML=cards.map(card=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(card.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
    </article>
  `).join('') + `
    <div class="report-split-grid">
      <article>
        <h4>Sales by brand</h4>
        <div class="report-stat-list">
          ${Object.entries(byBrand).map(([brand,metrics])=>`
            <div>
              <strong>${bookingAdminShared.escapeHtml(brandMap.get(brand)||brand)}</strong>
              <span>${bookingAdminShared.escapeHtml(String(metrics.count))} bookings - ${bookingAdminShared.formatMoney(metrics.revenue,state.settings.currency||'NAD')}</span>
            </div>
          `).join('') || '<p class="muted-copy">No brand data yet.</p>'}
        </div>
      </article>
      <article>
        <h4>Performance by tour</h4>
        <div class="report-stat-list">
          ${Object.entries(byService).sort((left,right)=>right[1].revenue-left[1].revenue).slice(0,6).map(([service,metrics])=>`
            <div>
              <strong>${bookingAdminShared.escapeHtml(service)}</strong>
              <span>${bookingAdminShared.escapeHtml(String(metrics.count))} bookings - ${bookingAdminShared.formatMoney(metrics.revenue,state.settings.currency||'NAD')}</span>
            </div>
          `).join('') || '<p class="muted-copy">No service performance data yet.</p>'}
        </div>
      </article>
    </div>
    <div class="report-split-grid">
      <article>
        <h4>Bookings by source</h4>
        <div class="report-stat-list">
          ${Object.entries(bySource).sort((left,right)=>right[1].count-left[1].count).map(([source,metrics])=>`
            <div>
              <strong>${bookingAdminShared.escapeHtml(source)}</strong>
              <span>${bookingAdminShared.escapeHtml(String(metrics.count))} bookings - ${bookingAdminShared.formatMoney(metrics.revenue,state.settings.currency||'NAD')}</span>
            </div>
          `).join('') || '<p class="muted-copy">No source data yet.</p>'}
        </div>
      </article>
      <article>
        <h4>Settlements & risk</h4>
        <div class="report-stat-list">
          <div>
            <strong>Agent commission due</strong>
            <span>${bookingAdminShared.formatMoney(agentPayoutsDue,state.settings.currency||'NAD')}</span>
          </div>
          <div>
            <strong>Cancelled bookings</strong>
            <span>${bookingAdminShared.escapeHtml(String(cancelledBookings.length))}</span>
          </div>
          <div>
            <strong>Refund records</strong>
            <span>${bookingAdminShared.escapeHtml(String(state.refunds.length))}</span>
          </div>
          <div>
            <strong>Total bookings</strong>
            <span>${bookingAdminShared.escapeHtml(String(overview.total_bookings||state.bookings.length))}</span>
          </div>
        </div>
      </article>
    </div>
  `
  nodes.reportsStatusTable.innerHTML=(state.reports?.status_breakdown||[]).map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(row.status)}</td>
      <td>${bookingAdminShared.escapeHtml(row.count)}</td>
    </tr>
  `).join('') || renderEmptyRow(2,'No report data yet.')
  nodes.reportsGuestInvoicesTable.innerHTML=(state.reports?.recent_guest_invoices||[]).map(invoice=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(invoice.invoice_number||'')}</td>
      <td>${renderStatusBadge(invoice.status)}</td>
      <td>${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)}</td>
      <td>${bookingAdminShared.formatMoney(invoice.balance_amount||0,invoice.currency_code||state.settings.currency)}</td>
    </tr>
  `).join('') || renderEmptyRow(4,'No guest invoices yet.')
  nodes.reportsOfficeInvoicesTable.innerHTML=(state.reports?.recent_office_invoices||[]).map(invoice=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(invoice.invoice_number||'')}</td>
      <td>${bookingAdminShared.escapeHtml(invoice.invoice_type||'')}</td>
      <td>${renderStatusBadge(invoice.status)}</td>
      <td>${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)}</td>
    </tr>
  `).join('') || renderEmptyRow(4,'No office invoices yet.')
  const reportHeading=nodes.reportsStatusTable.parentElement?.parentElement?.querySelector('h3')
  if(reportHeading)reportHeading.textContent='Status Breakdown'
}

const renderNotifications=()=>{
  const alerts=buildOperationalAlerts()
  const byCategory=alerts.reduce((accumulator,alert)=>{
    accumulator[alert.category]=accumulator[alert.category]||0
    accumulator[alert.category]+=1
    return accumulator
  },{})
  const cards=[
    {label:'Total alerts',value:String(alerts.length)},
    {label:'Critical',value:String(alerts.filter(item=>item.priority==='critical').length)},
    {label:'High priority',value:String(alerts.filter(item=>item.priority==='high').length)},
    {label:'Open tasks',value:String(state.bookingTasks.filter(item=>String(item.status||'')==='open').length)}
  ]
  nodes.notificationCards.innerHTML=cards.map(card=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(card.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
    </article>
  `).join('') + Object.entries(byCategory).slice(0,4).map(([category,count])=>`
    <article class="metric-card compact">
      <span>${bookingAdminShared.escapeHtml(category)}</span>
      <strong>${bookingAdminShared.escapeHtml(String(count))}</strong>
    </article>
  `).join('')
  nodes.notificationsTable.innerHTML=alerts.slice(0,40).map(alert=>`
    <tr data-alert-booking-id="${bookingAdminShared.escapeHtml(alert.booking_id||'')}">
      <td>${bookingAdminShared.escapeHtml(alert.category)}</td>
      <td>${bookingAdminShared.escapeHtml(alert.reference||'')}</td>
      <td>${renderStatusBadge(alert.priority,alert.priority)}</td>
      <td>${bookingAdminShared.escapeHtml(alert.message)}</td>
      <td>
        ${bookingAdminShared.escapeHtml(formatDateTimeLabel(alert.when))}
        ${alert.booking_id ? '<div class="table-subline">Click to open management screen</div>' : ''}
      </td>
    </tr>
  `).join('') || renderEmptyRow(5,'No active alerts right now.')
}

const renderAuditWorkbench=()=>{
  const auditFeed=buildAuditFeed()
  nodes.auditTable.innerHTML=auditFeed.slice(0,60).map(entry=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(entry.when))}</td>
      <td>${bookingAdminShared.escapeHtml(entry.reference||'')}</td>
      <td>${bookingAdminShared.escapeHtml(entry.type)}</td>
      <td>${bookingAdminShared.escapeHtml(entry.actor||'System')}</td>
      <td>${bookingAdminShared.escapeHtml(entry.summary)}</td>
    </tr>
  `).join('') || renderEmptyRow(5,'No audit entries are available yet.')
  nodes.lifecycleMatrix.innerHTML=Object.entries(state.lifecycleRules||{}).map(([fromState,toStates])=>`
    <article class="detail-card">
      <span>${bookingAdminShared.escapeHtml(formatDisplayLabel(fromState))}</span>
      <strong>${bookingAdminShared.escapeHtml((toStates||[]).map(formatDisplayLabel).join(', ')||'Final state')}</strong>
      <p>${bookingAdminShared.escapeHtml((toStates||[]).length ? 'Allowed next states from this stage.' : 'No further transitions are allowed from this state.')}</p>
    </article>
  `).join('') || '<p class="muted-copy">Lifecycle rules are not available yet.</p>'
}

const renderPaymentsWorkbench=()=>{
  nodes.paymentsTable.innerHTML=state.payments.map(payment=>`
    <tr>
      <td>
        <strong>${bookingAdminShared.escapeHtml(payment.reference||'')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(payment.provider||'manual')}</div>
      </td>
      <td>${renderStatusBadge(payment.status)}</td>
      <td>
        <strong>${bookingAdminShared.formatMoney(payment.amount||0,payment.currency_code||payment.currency||state.settings.currency)}</strong>
        <div class="table-subline">Received ${bookingAdminShared.formatMoney(payment.amount_received||0,payment.currency_code||payment.currency||state.settings.currency)}</div>
      </td>
      <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(payment.paid_at||payment.created_at||''))}</td>
      <td>${bookingAdminShared.escapeHtml(payment.provider_reference||payment.transaction_reference||payment.external_checkout_url||'Tracked in booking')}</td>
    </tr>
  `).join('') || renderEmptyRow(5,'No payments recorded yet.')
}

const renderRefundsWorkbench=()=>{
  if(!nodes.refundsTable)return
  const refunds=[...state.refunds].sort((left,right)=>(new Date(right.processed_at||right.created_at||0)).getTime()-(new Date(left.processed_at||left.created_at||0)).getTime())
  nodes.refundsTable.innerHTML=refunds.map(refund=>{
    const booking=state.bookings.find(item=>item.id===refund.booking_id)
    return `
    <tr data-booking-id="${bookingAdminShared.escapeHtml(refund.booking_id||'')}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking?.reference||refund.booking_id||'')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(booking?.customer_name||booking?.service_name||'Booking record')}</div>
      </td>
      <td>${renderStatusBadge(refund.status||'processed')}</td>
      <td><strong>${bookingAdminShared.formatMoney(refund.amount||0,refund.currency_code||state.settings.currency)}</strong></td>
      <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(refund.processed_at||refund.created_at||''))}</td>
      <td>${bookingAdminShared.escapeHtml(refund.reason||'No reason captured')}</td>
    </tr>
  `
  }).join('') || renderEmptyRow(5,'No refunds have been processed yet.')
}

const renderAdminUserPermissionEditor=(permissions={},selectedRole='booking_agent')=>{
  if(!nodes.adminUserPermissions)return
  const defaults=state.roleDefaults?.[selectedRole]||{}
  nodes.adminUserPermissions.innerHTML=state.permissionCatalog.map(item=>{
    const checked=(permissions?.[item.key] ?? defaults[item.key])===true
    return `
      <article class="permission-card">
        <label>
          <input type="checkbox" data-permission-key="${bookingAdminShared.escapeHtml(item.key)}" ${checked ? 'checked' : ''}>
          <span>${bookingAdminShared.escapeHtml(item.label)}</span>
        </label>
        <small>${bookingAdminShared.escapeHtml(item.description)}</small>
      </article>
    `
  }).join('')
}

const fillAdminUserForm=(user=null)=>{
  if(!nodes.adminUserForm)return
  const username=user?.username||String(user?.email||'').split('@')[0]||''
  nodes.adminUserId.value=user?.id||''
  nodes.adminUserUsername.value=username
  nodes.adminUserPassword.value=''
  nodes.adminUserFullName.value=user?.full_name||''
  nodes.adminUserRole.value=user?.role||'booking_agent'
  nodes.adminUserActive.checked=user?.is_active!==false
  renderAdminUserPermissionEditor(user?.permissions||{},nodes.adminUserRole.value)
  if(nodes.adminUserSaveButton)nodes.adminUserSaveButton.textContent=user ? 'Save Admin Access' : 'Create Admin Access'
}

const renderAdminUsers=()=>{
  if(!nodes.adminUsersTable)return
  nodes.adminUsersTable.innerHTML=state.adminUsers.map(user=>`
    <tr data-admin-user-id="${bookingAdminShared.escapeHtml(user.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(user.full_name||'')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(user.last_sign_in_at ? formatDateTimeLabel(user.last_sign_in_at) : 'No sign-in yet')}</div>
      </td>
      <td>${bookingAdminShared.escapeHtml(user.username||String(user.email||'').split('@')[0]||'')}</td>
      <td>${bookingAdminShared.escapeHtml(String(user.role||'').replace(/_/g,' '))}</td>
      <td>${renderStatusBadge(user.is_active ? 'active' : 'inactive',user.is_active ? 'Active' : 'Inactive')}</td>
      <td>${bookingAdminShared.escapeHtml(Object.entries(user.effective_permissions||({...state.roleDefaults?.[user.role],...(user.permissions||{})})).filter(([,allowed])=>allowed).map(([key])=>key.replace(/_/g,' ')).slice(0,3).join(', ')||'No access')}</td>
    </tr>
  `).join('') || renderEmptyRow(5,'No admin users loaded yet.')
}

const renderEngineWorkbench=()=>{
  const scopedTab=state.activeTab==='rates' ? 'rates' : 'engine'
  if(nodes.enginePrimaryTitle)nodes.enginePrimaryTitle.textContent='Schedules & Date Rules'
  if(nodes.engineSecondaryTitle)nodes.engineSecondaryTitle.textContent='Commercial Tools'
  setNodeVisibility(nodes.scheduleForm,scopedTab==='engine')
  setNodeVisibility(nodes.blackoutForm,scopedTab==='engine')
  setNodeVisibility(nodes.couponForm,scopedTab==='rates')
  setNodeVisibility(nodes.voucherForm,scopedTab==='rates')
  setNodeVisibility(nodes.agentForm,scopedTab==='rates')
  const serviceNameById=new Map(state.services.map(service=>[service.id,service.name]))
  const rows=[
    ...state.schedules.map(schedule=>({
      label:serviceNameById.get(schedule.service_id)||schedule.service_id,
      type:'Operating Window',
      value:`${schedule.day_of_week} - ${schedule.start_time} to ${schedule.end_time}`,
      status:schedule.is_active===false ? 'Inactive' : 'Active'
    })),
    ...state.dateRules.map(rule=>({
      label:serviceNameById.get(rule.service_id)||rule.service_id,
      type:'Date Rule',
      value:`${rule.rule_type} - ${JSON.stringify(rule.rule_value||{})}`,
      status:rule.is_active===false ? 'Inactive' : 'Active'
    })),
    ...state.blackoutDates.map(rule=>({
      label:serviceNameById.get(rule.service_id)||'All services',
      type:'Blackout',
      value:`${rule.starts_on} -> ${rule.ends_on}`,
      status:rule.reason||'Blocked'
    }))
  ]
  nodes.engineSchedulesTable.innerHTML=rows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(row.label)}</td>
      <td>${bookingAdminShared.escapeHtml(row.type)}</td>
      <td>${bookingAdminShared.escapeHtml(row.value)}</td>
      <td>${renderStatusBadge(row.status)}</td>
    </tr>
  `).join('') || renderEmptyRow(4,'No schedules or blackout ranges configured yet.')

  const commercialRows=[
    ...state.coupons.map(coupon=>({type:'Coupon',code:coupon.code,value:`${coupon.discount_type} ${coupon.discount_value}`,status:coupon.is_active===false ? 'Inactive' : 'Active'})),
    ...state.vouchers.map(voucher=>({type:'Voucher',code:voucher.code,value:bookingAdminShared.formatMoney(voucher.remaining_value||voucher.initial_value||0,voucher.currency_code||state.settings.currency),status:voucher.is_active===false ? 'Inactive' : 'Active'})),
    ...state.agents.map(agent=>({type:'Agent',code:agent.code,value:`${agent.company_name} - ${agent.commission_type} ${agent.commission_value}`,status:agent.is_active===false ? 'Inactive' : 'Active'}))
  ]
  nodes.commercialToolsTable.innerHTML=commercialRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(row.type)}</td>
      <td>${bookingAdminShared.escapeHtml(row.code)}</td>
      <td>${bookingAdminShared.escapeHtml(row.value)}</td>
      <td>${renderStatusBadge(row.status)}</td>
    </tr>
  `).join('') || renderEmptyRow(4,'No coupons, vouchers, or agents configured yet.')
}

const renderPlatformWorkbench=()=>{
  const showResources=state.activeTab!=='invoices'
  if(nodes.platformPrimaryTitle)nodes.platformPrimaryTitle.textContent=showResources ? 'Resources & Capacity' : 'Guest Invoices & Refunds'
  if(nodes.platformSecondaryTitle)nodes.platformSecondaryTitle.textContent=showResources ? 'Supporting Inventory Overview' : 'Office Invoices & Settlements'
  setNodeVisibility(nodes.resourceForm,showResources)
  setNodeVisibility(nodes.operatorForm,!showResources)
  setNodeVisibility(nodes.officeInvoiceForm,!showResources)
  setNodeVisibility(nodes.automationRulesForm,!showResources)
  setNodeVisibility(nodes.portalSettingsForm,!showResources)
  setNodeVisibility(nodes.webhookForm,!showResources)
  const opRows=showResources
    ? state.resources.map(resource=>({label:resource.name,type:`Resource - ${resource.resource_type||'resource'}`,status:getResourceStatusLabel(resource),value:getResourceCapacityLabel(resource)}))
    : [
        ...state.invoices.slice(0,10).map(invoice=>({label:invoice.invoice_number,type:'Invoice',status:invoice.status,value:bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)})),
        ...state.refunds.slice(0,10).map(refund=>({label:refund.booking_id,type:'Refund',status:refund.status,value:bookingAdminShared.formatMoney(refund.amount||0,refund.currency_code||state.settings.currency)}))
      ]
  nodes.platformOperationsTable.innerHTML=opRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(String(row.label||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.type||''))}</td>
      <td>${renderStatusBadge(String(row.status||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
    </tr>
  `).join('') || renderEmptyRow(4,showResources ? 'No resources loaded yet.' : 'No guest invoices or refunds loaded yet.')

  const configRows=showResources
    ? [
        ...state.supportedLanguages.map(language=>({category:'Language',name:language.name,status:language.is_active===false ? 'Inactive' : (language.is_default ? 'Default' : 'Active'),value:language.code})),
        ...state.supportedCurrencies.map(currency=>({category:'Currency',name:currency.name,status:currency.is_active===false ? 'Inactive' : (currency.is_default ? 'Default' : 'Active'),value:`${currency.code} - ${currency.symbol||''}`})),
        ...state.calendarConnections.map(connection=>({category:'Calendar',name:connection.provider,status:connection.is_active===false ? 'Inactive' : 'Active',value:connection.external_calendar_id}))
      ]
    : [
        ...state.operators.map(operator=>({category:'Operator',name:operator.company_name,status:operator.is_active===false ? 'Inactive' : 'Active',value:`${operator.commission_type} ${operator.commission_value}`})),
        ...state.officeInvoices.map(invoice=>({category:'Office Invoice',name:invoice.invoice_number,status:invoice.status,value:bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)})),
        ...state.webhookEndpoints.map(webhook=>({category:'Webhook',name:webhook.name,status:webhook.is_active===false ? 'Inactive' : 'Active',value:webhook.target_url}))
      ]
  nodes.platformConfigTable.innerHTML=configRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(String(row.category||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.name||''))}</td>
      <td>${renderStatusBadge(String(row.status||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
    </tr>
  `).join('') || renderEmptyRow(4,showResources ? 'No supporting inventory records loaded yet.' : 'No office invoices, operators, or settlement records loaded yet.')
}

const renderAll=()=>{
  renderSession()
  renderAuthEnvironmentMeta()
  syncSessionLabel()
  applyAccessControl()
  renderServiceOptions()
  renderBrandOptions()
  renderSourceFilters()
  fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  fillServiceForm(state.services.find(item=>item.id===state.selectedServiceId)||null)
  fillAdminUserForm(state.adminUsers.find(item=>item.id===nodes.adminUserId?.value)||null)
  renderDashboard()
  renderNotifications()
  renderCalendar()
  renderReservations()
  renderBookings()
  renderBookingDetail()
  renderServices()
  renderCustomers()
  renderPaymentsWorkbench()
  renderRefundsWorkbench()
  renderAdminUsers()
  renderSettings()
  renderEmailTemplates()
  renderReportsWorkbench()
  renderReconciliationWorkbench()
  renderAuditWorkbench()
  renderHealthWorkbench()
  renderEngineWorkbench()
  renderPlatformWorkbench()
}

const loadAdminData=async()=>{
  const payload=await bookingAdminShared.apiRequest('admin/bootstrap',{
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||'')
  })
  if(!payload||typeof payload!=='object'){
    throw new Error('Admin bootstrap returned an empty response. Check the deployed booking-api function and Supabase logs.')
  }
  state.user=payload.user||null
  state.profile=payload.profile||null
  state.staffDirectory=payload.staff_directory||[]
  state.adminUsers=payload.admin_users||[]
  state.permissionCatalog=payload.permission_catalog||state.permissionCatalog
  state.roleDefaults=payload.role_defaults||state.roleDefaults
  state.brands=payload.brands||[]
  state.bookings=payload.bookings||[]
  state.customers=payload.customers||[]
  state.payments=payload.payments||[]
  state.services=(payload.services||[]).map(bookingAdminShared.normalizeService)
  state.schedules=payload.schedules||[]
  state.dateRules=payload.date_rules||[]
  state.blackoutDates=payload.blackout_dates||[]
  state.coupons=payload.coupons||[]
  state.vouchers=payload.vouchers||[]
  state.agents=payload.agents||[]
  state.operators=payload.operators||[]
  state.bookingOperators=payload.booking_operators||[]
  state.resources=payload.resources||[]
  state.resourceAllocations=payload.resource_allocations||[]
  state.invoices=payload.invoices||[]
  state.officeInvoices=payload.office_invoices||[]
  state.refunds=payload.refunds||[]
  state.paymentTransactions=payload.payment_transactions||[]
  state.webhookEndpoints=payload.webhook_endpoints||[]
  state.supportedLanguages=payload.supported_languages||[]
  state.supportedCurrencies=payload.supported_currencies||[]
  state.customerAccounts=payload.customer_accounts||[]
  state.calendarConnections=payload.calendar_connections||[]
  state.emailLogs=payload.email_logs||[]
  state.statusHistory=payload.status_history||[]
  state.adminNotes=payload.admin_notes||[]
  state.bookingTasks=payload.booking_tasks||[]
  state.bookingDocuments=payload.booking_documents||[]
  state.bookingMemories=payload.booking_memories||[]
  state.bookingDocumentVersions=payload.booking_document_versions||[]
  state.portalRequests=payload.portal_requests||[]
  state.portalSessions=payload.portal_sessions||[]
  state.systemJobs=payload.system_jobs||[]
  state.healthEvents=payload.health_events||[]
  state.reconciliationRecords=payload.reconciliation_records||[]
  state.opsTemplates={...state.opsTemplates,...(payload.ops_templates||{})}
  state.lifecycleRules=payload.lifecycle_rules||{}
  state.settings={...bookingAdminShared.readConfig(),...(payload.settings||{})}
  state.emailTemplates={...bookingAdminShared.clone(bookingAdminShared.DEFAULT_EMAIL_TEMPLATES),...(payload.email_templates||{})}
  state.automationRules={...state.automationRules,...(payload.automation_rules||{})}
  state.portalSettings={...state.portalSettings,...(payload.portal_settings||{})}
  state.queueSettings={...state.queueSettings,...(payload.queue_settings||{})}
  state.integrationSettings={...state.integrationSettings,...(payload.integration_settings||{})}
  state.reportingSettings={...state.reportingSettings,...(payload.reporting_settings||{})}
  state.reports={...state.reports,...(payload.reports||{})}
  fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  fillServiceForm(state.services.find(item=>item.id===state.selectedServiceId)||null)
  fillAdminUserForm(state.adminUsers.find(item=>item.id===nodes.adminUserId?.value)||null)
  renderAll()
  applyRequestedRoute()
}

const refreshAdmin=async(message='Booking operations console synced.')=>{
  await loadAdminData()
  state.lastSyncedAt=new Date().toISOString()
  setAdminStatus(message)
}

const handleBookingOperatorAssignmentSave=async form=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||'').trim()
  if(!bookingId)return
  await bookingAdminShared.apiRequest('admin/booking-operators',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      booking_id:bookingId,
      operator_id:String(data.get('operator_id')||'').trim(),
      commission_amount:Number(data.get('commission_amount')||0)
    }
  })
  await refreshAdmin('Booking assignment updated.')
}

const handleBookingNoteSave=async form=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||'').trim()
  const note=String(data.get('note')||'').trim()
  if(!bookingId||!note)throw new Error('A note is required.')
  await bookingAdminShared.apiRequest('admin/notes',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      booking_id:bookingId,
      note,
      is_private:data.get('is_private')==='on'
    }
  })
  form.reset()
  const privacyToggle=form.querySelector('input[name="is_private"]')
  if(privacyToggle)privacyToggle.checked=true
  await refreshAdmin('Internal note added.')
}

const handleBookingTaskSave=async form=>{
  const data=new FormData(form)
  await bookingAdminShared.apiRequest('admin/booking-tasks',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      booking_id:String(data.get('booking_id')||'').trim(),
      task_type:String(data.get('task_type')||'').trim(),
      title:String(data.get('title')||'').trim(),
      description:String(data.get('description')||'').trim(),
      team:String(data.get('team')||'').trim(),
      priority:String(data.get('priority')||'').trim(),
      due_at:String(data.get('due_at')||'').trim() || null
    }
  })
  form.reset()
  await refreshAdmin('Booking task added.')
}

const handleBookingEmailSave=async form=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||'').trim()
  const subject=String(data.get('subject')||'').trim()
  const body=String(data.get('body')||'').trim()
  if(!bookingId||!subject||!body)throw new Error('Subject and message are required before sending email.')
  const response=await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}/email`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{ subject, body }
  })
  await refreshAdmin(response?.delivery_status==='sent' ? 'Guest email sent.' : 'Guest email queued.')
}

const readFileAsDataUrl=file=>new Promise((resolve,reject)=>{
  const reader=new FileReader()
  reader.addEventListener('load',()=>resolve(String(reader.result||'')),{once:true})
  reader.addEventListener('error',()=>reject(new Error(`Could not read ${file?.name||'image file'}.`)),{once:true})
  reader.readAsDataURL(file)
})

const handleMemoryUploadSave=async form=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||'').trim()
  const reference=String(data.get('reference')||'').trim()
  const caption=String(data.get('caption')||'').trim()
  const fileInput=form.querySelector('input[type="file"][name="memories"]')
  const files=[...(fileInput?.files||[])]
  if(!bookingId||!reference)throw new Error('Choose a booking before uploading memories.')
  if(!files.length)throw new Error('Choose at least one guest image.')
  const submitButton=form.querySelector('button[type="submit"]')
  const originalLabel=submitButton?.textContent||'Upload Tour Memories'
  if(submitButton){
    submitButton.disabled=true
    submitButton.textContent='Uploading memories...'
  }
  try{
    const payloadFiles=await Promise.all(files.map(async file=>({
      file_name:file.name,
      original_name:file.name,
      mime_type:file.type||'image/jpeg',
      caption,
      file_content_base64:await readFileAsDataUrl(file)
    })))
    await bookingAdminShared.apiRequest('admin/memories',{
      method:'POST',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{
        booking_id:bookingId,
        reference,
        caption,
        files:payloadFiles
      }
    })
    form.reset()
    await refreshAdmin(`${files.length} tour memor${files.length===1 ? 'y' : 'ies'} uploaded.`)
  }finally{
    if(submitButton){
      submitButton.disabled=false
      submitButton.textContent=originalLabel
    }
  }
}

const openDocumentPrintWindow=(title,markup)=>{
  const nextWindow=window.open('','_blank','noopener,noreferrer,width=960,height=720')
  if(!nextWindow)throw new Error('Allow popups to generate documents from SkyBook.')
  nextWindow.document.write(`<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${bookingAdminShared.escapeHtml(title)}</title><style>body{font-family:Arial,sans-serif;padding:40px;color:#142438;background:#fff}h1,h2,h3{margin:0 0 12px}section{margin-top:24px;padding-top:18px;border-top:1px solid #d8e4ef}.meta{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px;margin-top:14px}.card{padding:14px;border:1px solid #d9e6f0;border-radius:12px;background:#f7fbff}table{width:100%;border-collapse:collapse;margin-top:14px}th,td{padding:10px;border-bottom:1px solid #d9e6f0;text-align:left}small{color:#5f6f80}.pill{display:inline-block;padding:6px 10px;border-radius:999px;background:#e8f4ff;color:#1e5b93;font-size:12px;font-weight:700;text-transform:uppercase;letter-spacing:.08em}</style></head><body>${markup}</body></html>`)
  nextWindow.document.close()
  nextWindow.focus()
  nextWindow.print()
}

const buildDocumentMarkup=(documentType,booking)=>{
  const invoice=getBookingInvoices(booking.id)[0]
  const officeInvoices=getBookingOfficeInvoices(booking.id)
  const payments=getBookingPayments(booking.id)
  const allocations=getBookingAllocations(booking.id)
  const guestBalance=Number(invoice?.balance_amount ?? (Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0)))
  const documentTitles={
    guest_invoice:'Guest Invoice',
    receipt:'Payment Receipt',
    manifest:'Departure Manifest',
    voucher:'Service Voucher',
    settlement:'Office Settlement Statement'
  }
  const title=documentTitles[documentType]||'SkyBook Document'
  const officeInvoice=officeInvoices[0]
  const paymentTotal=sumAmounts(payments,'amount_received')||sumAmounts(payments,'amount')
  const numberMap={
    guest_invoice:invoice?.invoice_number||`INV-${booking.reference}`,
    receipt:`RCT-${booking.reference}`,
    manifest:`MAN-${booking.reference}`,
    voucher:`VCH-${booking.reference}`,
    settlement:officeInvoice?.invoice_number||`OFF-${booking.reference}`
  }
  const body=`
    <header>
      <div class="pill">SkyBook Enterprise</div>
      <h1>${bookingAdminShared.escapeHtml(title)}</h1>
      <small>${bookingAdminShared.escapeHtml(numberMap[documentType]||booking.reference)}</small>
    </header>
    <section>
      <div class="meta">
        <div class="card"><strong>Booking</strong><div>${bookingAdminShared.escapeHtml(booking.reference)}</div></div>
        <div class="card"><strong>Brand</strong><div>${bookingAdminShared.escapeHtml(state.brands.find(item=>item.code===booking.brand_code)?.name||booking.brand_code||'')}</div></div>
        <div class="card"><strong>Guest</strong><div>${bookingAdminShared.escapeHtml(booking.customer_name)}</div></div>
        <div class="card"><strong>Service</strong><div>${bookingAdminShared.escapeHtml(booking.service_name)}</div></div>
        <div class="card"><strong>Date</strong><div>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</div></div>
        <div class="card"><strong>Operator</strong><div>${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</div></div>
      </div>
    </section>
    <section>
      <h2>Financial Summary</h2>
      <table>
        <thead><tr><th>Label</th><th>Value</th></tr></thead>
        <tbody>
          <tr><td>Booking total</td><td>${bookingAdminShared.formatMoney(booking.total_amount||0,booking.currency||state.settings.currency)}</td></tr>
          <tr><td>Guest invoice</td><td>${bookingAdminShared.escapeHtml(invoice?.invoice_number||'Pending')}</td></tr>
          <tr><td>Guest balance</td><td>${bookingAdminShared.formatMoney(guestBalance,booking.currency||state.settings.currency)}</td></tr>
          <tr><td>Payments received</td><td>${bookingAdminShared.formatMoney(paymentTotal,booking.currency||state.settings.currency)}</td></tr>
          <tr><td>Office settlement</td><td>${bookingAdminShared.formatMoney(sumAmounts(officeInvoices,'total_amount'),booking.currency||state.settings.currency)}</td></tr>
        </tbody>
      </table>
    </section>
    <section>
      <h2>${bookingAdminShared.escapeHtml(documentType==='manifest' ? 'Manifest' : documentType==='voucher' ? 'Guest entitlement' : 'Operational notes')}</h2>
      <table>
        <thead><tr><th>Item</th><th>Details</th></tr></thead>
        <tbody>
          <tr><td>Guests</td><td>${bookingAdminShared.escapeHtml(String(booking.quantity||1))}</td></tr>
          <tr><td>Pickup resources</td><td>${bookingAdminShared.escapeHtml(allocations.map(item=>getResourceName(item.resource_id)).join(', ')||'Not assigned')}</td></tr>
          <tr><td>Notes</td><td>${bookingAdminShared.escapeHtml(booking.customer_notes||booking.cancellation_reason||'No additional notes')}</td></tr>
        </tbody>
      </table>
    </section>
  `
  return { title, documentNumber:numberMap[documentType]||booking.reference, markup:body }
}

const handleDocumentGeneration=async documentType=>{
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  if(!booking)return
  const response=await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}/documents`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      document_type:documentType,
      title:`SkyBook ${formatDisplayLabel(documentType)}`,
      document_number:`${String(documentType||'doc').slice(0,3).toUpperCase()}-${booking.reference}`,
      metadata:{
        booking_reference:booking.reference,
        generated_in:'skybook-storage'
      }
    }
  })
  if(response?.version?.signed_url){
    window.open(response.version.signed_url,'_blank','noopener,noreferrer')
  }
  await refreshAdmin(`${formatDisplayLabel(documentType)} generated and stored.`)
}

const handlePortalAction=async requestType=>{
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  if(!booking)return
  const messages={
    request_change:'Customer can request service/date changes through the portal.',
    upload_info:'Customer can upload passport details, waivers, or travel documents.',
    confirm_pickup:'Customer can confirm pickup details and meeting instructions.'
  }
  await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}/portal-requests`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      request_type:requestType,
      message:messages[requestType]||'Portal action logged from SkyBook.',
      metadata:{ generated_by:'skybook-admin' }
    }
  })
  await refreshAdmin('Portal action logged.')
}

const handlePortalAccessLink=async()=>{
  if(!state.selectedBookingId)return
  const response=await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}/portal-access`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{}
  })
  const portalUrl=String(response?.portal_url||'').trim()
  if(portalUrl){
    if(navigator.clipboard?.writeText){
      await navigator.clipboard.writeText(portalUrl).catch(()=>{})
    }
    window.open(portalUrl,'_blank','noopener,noreferrer')
  }
  await refreshAdmin('Secure portal link generated.')
}

const handleRunDueJobs=async()=>{
  await bookingAdminShared.apiRequest('admin/jobs/run',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{}
  })
  await refreshAdmin('Queued jobs processed.')
}

const handleSystemJobAction=async(jobId,action)=>{
  if(!jobId||!action)return
  await bookingAdminShared.apiRequest(`admin/jobs/${encodeURIComponent(jobId)}/${encodeURIComponent(action)}`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{}
  })
  await refreshAdmin(action==='retry' ? 'Job re-queued.' : 'Job cancelled.')
}

const handleHealthEventResolve=async(eventId)=>{
  if(!eventId)return
  await bookingAdminShared.apiRequest(`admin/health-events/${encodeURIComponent(eventId)}`,{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{ status:'resolved' }
  })
  await refreshAdmin('Health event resolved.')
}

const handleReconciliationAction=async(recordId,status)=>{
  if(!recordId||!status)return
  await bookingAdminShared.apiRequest(`admin/reconciliation/${encodeURIComponent(recordId)}`,{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      status,
      notes:status==='cleared' ? 'Cleared in SkyBook reconciliation center.' : 'Flagged for review in SkyBook reconciliation center.'
    }
  })
  await refreshAdmin(status==='cleared' ? 'Reconciliation record cleared.' : 'Reconciliation record flagged for review.')
}

let commandPaletteTimer=null

const normalizeCommandResult=result=>({
  kind:result.kind||'Result',
  label:result.label||result.meta||'Untitled',
  meta:result.meta||'',
  action:result.action||'dashboard',
  bookingId:result.bookingId||result.booking_id||'',
  customerId:result.customerId||result.customer_id||'',
  id:result.id||''
})

const renderCommandPalette=results=>{
  const rows=(results||[]).map(normalizeCommandResult)
  nodes.commandPaletteResults.innerHTML=rows.map(result=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(result.kind)}</td>
      <td><strong>${bookingAdminShared.escapeHtml(result.label)}</strong></td>
      <td>${bookingAdminShared.escapeHtml(result.meta||'')}</td>
      <td><button class="booking-button ghost compact-button" type="button" data-command-action="${bookingAdminShared.escapeHtml(result.action)}" data-command-booking-id="${bookingAdminShared.escapeHtml(result.bookingId||'')}" data-command-customer-id="${bookingAdminShared.escapeHtml(result.customerId||'')}">Open</button></td>
    </tr>
  `).join('') || renderEmptyRow(4,'No results yet. Try a booking reference, guest, invoice, or operator.')
}

const closeCommandPalette=()=>{
  nodes.commandPalette.hidden=true
}

const handleCommandNavigation=(action,bookingId='',customerId='')=>{
  switchTab(action||'dashboard')
  if(bookingId){
    const booking=state.bookings.find(item=>item.id===bookingId)
    if(booking){
      openBookingManagementScreen(booking,{scroll:true})
    }
  }
  if(customerId){
    const customer=state.customers.find(item=>item.id===customerId)
    if(customer){
      state.selectedCustomerId=customer.id
      renderCustomers()
    }
  }
  closeCommandPalette()
}

const performCommandPaletteSearch=async query=>{
  const trimmed=String(query||'').trim()
  if(!trimmed){
    renderCommandPalette([])
    return
  }
  let results=buildCommandPaletteResults(trimmed)
  try{
    const response=await bookingAdminShared.apiRequest(`admin/search?q=${encodeURIComponent(trimmed)}`,{
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||'')
    })
    const seen=new Set()
    results=[...results,...(response?.results||[])].map(normalizeCommandResult).filter(result=>{
      const key=`${result.action}|${result.bookingId||result.customerId||result.id}|${result.label}`
      if(seen.has(key))return false
      seen.add(key)
      return true
    }).slice(0,20)
  }catch{}
  renderCommandPalette(results)
}

const openCommandPalette=()=>{
  nodes.commandPalette.hidden=false
  nodes.commandPaletteInput.focus()
  void performCommandPaletteSearch(nodes.commandPaletteInput.value||'')
}

const handleBookingDuplicate=async()=>{
  if(!state.selectedBookingId)return
  const response=await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}/duplicate`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{}
  })
  if(response?.booking?.id)state.selectedBookingId=response.booking.id
  await refreshAdmin('Booking duplicated.')
}

const handleBookingReschedule=async()=>{
  if(!state.selectedBookingId)return
  const nextDate=window.prompt('Enter the new preferred date in YYYY-MM-DD format.')
  if(!nextDate)return
  await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}/reschedule`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      preferred_date:nextDate,
      reason:'Booking rescheduled in SkyBook'
    }
  })
  await refreshAdmin('Booking rescheduled.')
}

const handleAuthCacheReset=async()=>{
  try{
    const client=await requireClient()
    await client.auth.signOut()
  }catch{}
  clearSkybookCache()
  state.session=null
  state.user=null
  state.profile=null
  renderAuthEnvironmentMeta()
  renderSession()
  setAuthStatus('Local SkyBook cache cleared. Sign in again to load fresh live settings.')
}

const handleLogin=async event=>{
  event.preventDefault()
  try{
    const client=await requireClient()
    const data=new FormData(nodes.loginForm)
    setAuthStatus('Signing in...')
    const { data:authData, error }=await client.auth.signInWithPassword({
      email:String(data.get('email')||''),
      password:String(data.get('password')||'')
    })
    if(error){
      setAuthStatus(error.message,true)
      return
    }
    state.session=authData.session
    setAuthStatus('Signed in. Loading admin workspace...')
    await refreshAdmin('Authenticated and loaded live booking data.')
  }catch(error){
    const message=error instanceof Error ? error.message : 'Admin bootstrap failed after sign-in.'
    state.session=null
    state.user=null
    state.profile=null
    renderSession()
    setAuthStatus(message,true)
  }
}

const handleLogout=async()=>{
  try{
    const client=await requireClient()
    await client.auth.signOut()
  }catch{}
  state.session=null
  state.user=null
  state.profile=null
  renderSession()
  renderAuthEnvironmentMeta()
  setAdminStatus('Signed out.')
  window.location.replace('login.html')
}

const handleBookingSave=async event=>{
  event.preventDefault()
  const wasEditing=Boolean(state.selectedBookingId)
  const previousSelectedId=state.selectedBookingId
  const payload={
    reference:nodes.bookingReference.value.trim(),
    brand_code:nodes.bookingBrand?.value||bookingAdminShared.readConfig().brandCode||'true-travel',
    source:nodes.bookingSource?.value||'admin',
    service_slug:nodes.bookingService.value,
    status:nodes.bookingStatus.value,
    payment_status:nodes.bookingPaymentStatus.value,
    preferred_date:nodes.bookingDate.value,
    quantity:Number(nodes.bookingQuantity.value||1),
    notes:nodes.bookingNotes.value.trim(),
    customer:{
      full_name:nodes.bookingCustomerName.value.trim(),
      email:nodes.bookingCustomerEmail.value.trim(),
      phone:nodes.bookingCustomerPhone.value.trim(),
      whatsapp:nodes.bookingCustomerPhone.value.trim()
    }
  }
  const response=await bookingAdminShared.apiRequest(wasEditing ? `admin/bookings/${encodeURIComponent(previousSelectedId)}` : 'admin/bookings',{
    method:wasEditing ? 'PATCH' : 'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  })
  const savedReference=normalizeText(response?.booking?.reference)||normalizeText(response?.reference)||normalizeText(payload.reference)
  const savedBookingId=normalizeText(response?.booking?.id)||normalizeText(response?.id)||previousSelectedId
  await loadAdminData()
  const savedBooking=state.bookings.find(booking=>booking.id===savedBookingId)
    || state.bookings.find(booking=>savedReference&&normalizeText(booking.reference)===savedReference)
    || (wasEditing ? state.bookings.find(booking=>booking.id===previousSelectedId) : null)
  if(savedBooking){
    closeBookingModal()
    openBookingManagementScreen(savedBooking,{scroll:true})
    setAdminStatus(wasEditing ? 'Booking updated and management screen opened.' : 'Booking created and management screen opened.')
    return
  }
  closeBookingModal()
  renderAll()
  setAdminStatus(wasEditing ? 'Booking updated.' : 'Booking created.')
}

const handleServiceSave=async event=>{
  event.preventDefault()
  const brandCodes=[
    nodes.serviceBrandTrueTravel?.checked ? 'true-travel' : '',
    nodes.serviceBrandIventure?.checked ? 'iventure' : ''
  ].filter(Boolean)
  if(!brandCodes.length){
    setAdminStatus('Choose at least one brand before saving this tour.',true)
    return
  }
  const payload={
    id:nodes.serviceId.value.trim(),
    slug:nodes.serviceSlug.value.trim(),
    name:nodes.serviceName.value.trim(),
    category_slug:nodes.serviceCategory.value,
    base_price:Number(nodes.servicePrice.value||0),
    preferred_date_mode:nodes.serviceDateRule.value,
    duration_label:nodes.serviceDuration.value.trim(),
    minimum_pax:Math.max(1,Number(nodes.serviceMinPax?.value||1)||1),
    departure_window:nodes.serviceDepartureWindow?.value?.trim()||'',
    pickup_time:nodes.servicePickupTime?.value?.trim()||'',
    short_description:nodes.serviceSummary.value.trim(),
    full_description:nodes.serviceLearnMoreDescription?.value?.trim()||nodes.serviceSummary.value.trim(),
    highlight_points:nodes.serviceHighlights.value.split(',').map(item=>item.trim()).filter(Boolean),
    media_urls:(nodes.serviceLandscapeImages?.value||'').split(/\r?\n/).map(item=>item.trim()).filter(Boolean),
    brand_codes:brandCodes,
    is_active:nodes.serviceActive.checked
  }
  const response=await bookingAdminShared.apiRequest(payload.id ? `admin/services/${encodeURIComponent(payload.id)}` : 'admin/services',{
    method:payload.id ? 'PATCH' : 'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  })
  state.selectedServiceId=String(response?.id||payload.id||state.selectedServiceId||'').trim()
  await refreshAdmin('Service saved.')
  closeServiceModal()
}

const handleAdminUserSave=async event=>{
  event.preventDefault()
  const payload={
    id:nodes.adminUserId.value.trim(),
    username:nodes.adminUserUsername.value.trim(),
    password:nodes.adminUserPassword.value,
    full_name:nodes.adminUserFullName.value.trim(),
    role:nodes.adminUserRole.value,
    is_active:nodes.adminUserActive.checked,
    permissions:collectPermissionOverrides()
  }
  await bookingAdminShared.apiRequest(payload.id ? `admin/users/${encodeURIComponent(payload.id)}` : 'admin/users',{
    method:payload.id ? 'PATCH' : 'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  })
  nodes.adminUserForm.reset()
  nodes.adminUserActive.checked=true
  fillAdminUserForm(null)
  await refreshAdmin('Admin access updated.')
}

const handleSettingsSave=async event=>{
  event.preventDefault()
  const data=new FormData(nodes.settingsForm)
  const payload={
    currency:bookingAdminShared.normalizeCurrencyCode
      ? bookingAdminShared.normalizeCurrencyCode(String(data.get('currency')||'NAD'))
      : String(data.get('currency')||'NAD'),
    supportEmail:String(data.get('supportEmail')||''),
    supportPhone:String(data.get('supportPhone')||''),
    defaultDepositValue:Number(data.get('defaultDepositValue')||30),
    taxRate:Number(data.get('taxRate')||0),
    serviceFee:Number(data.get('serviceFee')||0),
    supportWhatsApp:String(data.get('supportPhone')||''),
    supportEmailsByBrand:{
      ...(state.settings.supportEmailsByBrand||{}),
      'true-travel':String(data.get('supportEmail')||'').trim()||'bookings@truetravelnam.net',
      iventure:(state.settings.supportEmailsByBrand||{}).iventure||'info@aerodigital.space'
    }
  }
  await bookingAdminShared.apiRequest('admin/settings',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  })
  await refreshAdmin('Settings saved.')
}

const handleTemplateSave=async()=>{
  const nextTemplates={}
  nodes.emailTemplatesForm.querySelectorAll('[data-template-key]').forEach(node=>{
    const key=node.dataset.templateKey
    const field=node.dataset.templateField
    nextTemplates[key]=nextTemplates[key]||{}
    nextTemplates[key][field]=node.value
  })
  await bookingAdminShared.apiRequest('admin/email-templates',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:nextTemplates
  })
  await refreshAdmin('Email templates saved.')
}

const handleScheduleSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/service-schedules',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      service_id:state.services.find(service=>service.slug===nodes.scheduleService.value)?.id||'',
      day_of_week:Number(nodes.scheduleDay.value||0),
      start_time:nodes.scheduleStart.value,
      end_time:nodes.scheduleEnd.value,
      cutoff_hours:Number(nodes.scheduleCutoff.value||0),
      is_active:true
    }
  })
  nodes.scheduleForm.reset()
  await refreshAdmin('Operating window saved.')
}

const handleBlackoutSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/blackout-dates',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      service_id:state.services.find(service=>service.slug===nodes.blackoutService.value)?.id||null,
      starts_on:nodes.blackoutStart.value,
      ends_on:nodes.blackoutEnd.value,
      reason:nodes.blackoutReason.value.trim(),
      applies_to_all:!nodes.blackoutService.value
    }
  })
  nodes.blackoutForm.reset()
  await refreshAdmin('Blackout range saved.')
}

const handleCouponSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/coupons',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      code:nodes.couponCode.value.trim().toUpperCase(),
      description:nodes.couponDescription.value.trim(),
      discount_type:nodes.couponType.value,
      discount_value:Number(nodes.couponValue.value||0),
      is_active:true,
      metadata:{source:'admin-ui'}
    }
  })
  nodes.couponForm.reset()
  await refreshAdmin('Coupon saved.')
}

const handleVoucherSave=async event=>{
  event.preventDefault()
  const amount=Number(nodes.voucherValue.value||0)
  await bookingAdminShared.apiRequest('admin/vouchers',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      code:nodes.voucherCode.value.trim().toUpperCase(),
      description:'Gift / credit voucher',
      initial_value:amount,
      remaining_value:amount,
      currency_code:state.settings.currency||'NAD',
      expires_at:nodes.voucherExpiry.value ? new Date(nodes.voucherExpiry.value).toISOString() : null,
      is_active:true,
      metadata:{source:'admin-ui'}
    }
  })
  nodes.voucherForm.reset()
  await refreshAdmin('Voucher saved.')
}

const handleAgentSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/agents',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      code:nodes.agentCode.value.trim().toUpperCase(),
      company_name:nodes.agentCompany.value.trim(),
      commission_type:nodes.agentCommissionType.value,
      commission_value:Number(nodes.agentCommissionValue.value||0),
      is_active:true,
      metadata:{source:'admin-ui'}
    }
  })
  nodes.agentForm.reset()
  await refreshAdmin('Agent / reseller saved.')
}

const handleResourceSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/resources',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      name:nodes.resourceName.value.trim(),
      slug:nodes.resourceSlug.value.trim(),
      resource_type:nodes.resourceType.value.trim()||'vehicle',
      capacity:nodes.resourceAbundant.checked ? null : (Number(nodes.resourceCapacity.value||0)||null),
      is_active:true,
      metadata:{
        source:'admin-ui',
        abundant_resources:Boolean(nodes.resourceAbundant.checked)
      }
    }
  })
  nodes.resourceForm.reset()
  if(nodes.resourceAbundant)nodes.resourceAbundant.checked=true
  syncResourceCapacityState()
  await refreshAdmin('Resource saved.')
}

const handleRefundSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest(`admin/refunds/${encodeURIComponent(nodes.refundBookingId.value.trim())}`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      amount:Number(nodes.refundAmount.value||0),
      reason:nodes.refundReason.value.trim()
    }
  })
  nodes.refundForm.reset()
  await refreshAdmin('Refund processed.')
}

const handleAutomationSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/automation-rules',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:buildAutomationRulesPayload()
  })
  await refreshAdmin('Automation rules saved.')
}

const handleEmailAutomationSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/automation-rules',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:buildAutomationRulesPayload()
  })
  await refreshAdmin('Email triggers saved.')
}

const syncResourceCapacityState=()=>{
  if(!nodes.resourceCapacity||!nodes.resourceAbundant)return
  const isAbundant=Boolean(nodes.resourceAbundant.checked)
  nodes.resourceCapacity.disabled=isAbundant
  if(isAbundant)nodes.resourceCapacity.value=''
  nodes.resourceCapacity.placeholder=isAbundant ? 'Not needed for abundant resources' : ''
}

const handlePortalSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/portal-settings',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      enabled:nodes.portalEnabled.checked,
      allowBookingLookup:nodes.portalLookupEnabled.checked,
      allowSelfServiceRequests:state.portalSettings.allowSelfServiceRequests!==false,
      allowDocumentDownloads:state.portalSettings.allowDocumentDownloads!==false,
      portalBaseUrl:nodes.portalBaseUrl?.value?.trim()||'/portal.html',
      sessionDurationHours:Number(nodes.portalSessionDurationHours?.value||72)
    }
  })
  await refreshAdmin('Portal settings saved.')
}

const handleWebhookSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/webhook-endpoints',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      name:nodes.webhookName.value.trim(),
      target_url:nodes.webhookUrl.value.trim(),
      subscribed_events:nodes.webhookEvents.value.split(',').map(item=>item.trim()).filter(Boolean),
      is_active:true
    }
  })
  nodes.webhookForm.reset()
  await refreshAdmin('Webhook endpoint saved.')
}

const handleOperatorSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/operators',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      code:nodes.operatorCode.value.trim().toUpperCase(),
      company_name:nodes.operatorCompany.value.trim(),
      contact_name:nodes.operatorContactName.value.trim(),
      email:nodes.operatorEmail.value.trim(),
      phone:nodes.operatorPhone.value.trim(),
      preferred_contact_method:nodes.operatorPreferredContact.value,
      commission_type:nodes.operatorCommissionType.value,
      commission_value:Number(nodes.operatorCommissionValue.value||0),
      payout_terms:nodes.operatorTerms.value.trim(),
      services_handled:nodes.operatorServicesHandled.value.split(',').map(value=>value.trim()).filter(Boolean),
      banking_details:{ summary:nodes.operatorBankingDetails.value.trim() },
      settlement_metadata:{ summary:nodes.operatorSettlementMetadata.value.trim() },
      is_active:true,
      metadata:{source:'admin-ui'}
    }
  })
  nodes.operatorForm.reset()
  await refreshAdmin('Operator saved.')
}

const handleOfficeInvoiceSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/office-invoices',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      booking_id:nodes.officeInvoiceBookingId.value.trim(),
      invoice_type:nodes.officeInvoiceType.value,
      payee_type:nodes.officePayeeType.value,
      operator_id:nodes.officeOperatorId.value,
      agent_id:nodes.officeAgentId.value,
      commission_base_amount:Number(nodes.officeCommissionBase.value||0),
      commission_amount:Number(nodes.officeCommissionAmount.value||0),
      notes:nodes.officeInvoiceNotes.value.trim()
    }
  })
  nodes.officeInvoiceForm.reset()
  await refreshAdmin('Office invoice generated.')
}

const exportBookingsCsv=()=>{
  const filtered=getFilteredBookings().map(booking=>({
    ...booking,
    operator_name:getBookingOperatorName(booking),
    agent_name:getBookingAgentName(booking),
    booking_source:booking.source||booking.metadata?.source||'website',
    amount_due_now:Number(booking.amount_due_now||0),
    amount_due_later:Number(booking.amount_due_later||0)
  }))
  const csv=bookingAdminShared.toCsv(filtered,[
    {key:'reference',label:'Reference'},
    {key:'brand_code',label:'Brand'},
    {key:'booking_source',label:'Source'},
    {key:'customer_name',label:'Customer'},
    {key:'customer_email',label:'Email'},
    {key:'service_name',label:'Service'},
    {key:'operator_name',label:'Operator'},
    {key:'agent_name',label:'Agent'},
    {key:'status',label:'Status'},
    {key:'payment_status',label:'Payment Status'},
    {key:'preferred_date',label:'Preferred Date'},
    {key:'amount_due_now',label:'Due Now'},
    {key:'amount_due_later',label:'Due Later'},
    {key:'total_amount',label:'Total Amount'}
  ])
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download=`skybook-bookings-${new Date().toISOString().slice(0,10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

const openRecordInNewTab=(tab,recordId)=>{
  if(!recordId)return
  const url=new URL(window.location.href)
  url.searchParams.set('tab',tab)
  url.searchParams.delete('service')
  if(tab==='reservations'){
    url.searchParams.set('reservation',recordId)
    url.searchParams.delete('booking')
  }else{
    url.searchParams.set('booking',recordId)
    url.searchParams.delete('reservation')
  }
  window.open(`${url.pathname}${url.search}${url.hash}`,'_blank','noopener')
}

const openNewBookingWorkspace=()=>{
  switchTab('bookings')
  state.selectedBookingId=''
  renderBookingDetail()
  openBookingModal()
  showToast('New booking popup opened.','info')
}

const toggleTableDensity=()=>{
  document.body.classList.toggle('is-compact-tables')
  const isCompact=document.body.classList.contains('is-compact-tables')
  if(nodes.toggleTableDensity)nodes.toggleTableDensity.textContent=isCompact ? 'Comfort Tables' : 'Compact Tables'
  showToast(isCompact ? 'Compact table mode enabled.' : 'Comfort table mode enabled.','info')
}

const setBookingFiltersCollapsed=collapsed=>{
  if(!nodes.bookingFiltersPanel||!nodes.toggleBookingFilters)return
  nodes.bookingFiltersPanel.hidden=collapsed
  nodes.bookingFiltersPanel.classList.toggle('is-collapsed',collapsed)
  nodes.toggleBookingFilters.setAttribute('aria-expanded',collapsed ? 'false' : 'true')
  nodes.toggleBookingFilters.textContent=collapsed ? 'Show filters' : 'Hide filters'
}

const toggleBookingFiltersPanel=()=>{
  const isCollapsed=nodes.bookingFiltersPanel?.hidden!==false
  setBookingFiltersCollapsed(!isCollapsed)
}

nodes.tabs.forEach(node=>node.addEventListener('click',()=>switchTab(node.dataset.adminTab)))
nodes.loginForm?.addEventListener('submit',handleLogin)
nodes.logoutButton?.addEventListener('click',()=>{void handleLogout()})
nodes.resetAuthCacheButton?.addEventListener('click',handleAuthCacheReset)
nodes.exportButton.addEventListener('click',exportBookingsCsv)
nodes.quickCreateBooking?.addEventListener('click',openNewBookingWorkspace)
nodes.toggleTableDensity?.addEventListener('click',toggleTableDensity)
nodes.toggleBookingFilters?.addEventListener('click',toggleBookingFiltersPanel)
nodes.bookingFilterSearch.addEventListener('input',renderBookings)
nodes.bookingFilterBrand.addEventListener('change',renderBookings)
nodes.bookingFilterSource?.addEventListener('change',renderBookings)
nodes.bookingFilterStatus.addEventListener('change',renderBookings)
nodes.bookingFilterPaymentStatus?.addEventListener('change',renderBookings)
nodes.bookingFilterService?.addEventListener('change',renderBookings)
nodes.bookingFilterOperator?.addEventListener('change',renderBookings)
nodes.bookingFilterAgent?.addEventListener('change',renderBookings)
nodes.bookingFilterDateFrom?.addEventListener('change',renderBookings)
nodes.bookingFilterDateTo?.addEventListener('change',renderBookings)
document.querySelectorAll('[data-booking-quick-filter]').forEach(button=>button.addEventListener('click',()=>{
  state.bookingQuickFilter=button.dataset.bookingQuickFilter||''
  renderBookings()
}))
document.querySelector('[data-booking-filter-reset]')?.addEventListener('click',()=>{
  state.bookingQuickFilter=''
  if(nodes.bookingFilterSearch)nodes.bookingFilterSearch.value=''
  if(nodes.bookingFilterBrand)nodes.bookingFilterBrand.value=''
  if(nodes.bookingFilterSource)nodes.bookingFilterSource.value=''
  if(nodes.bookingFilterStatus)nodes.bookingFilterStatus.value=''
  if(nodes.bookingFilterPaymentStatus)nodes.bookingFilterPaymentStatus.value=''
  if(nodes.bookingFilterService)nodes.bookingFilterService.value=''
  if(nodes.bookingFilterOperator)nodes.bookingFilterOperator.value=''
  if(nodes.bookingFilterAgent)nodes.bookingFilterAgent.value=''
  if(nodes.bookingFilterDateFrom)nodes.bookingFilterDateFrom.value=''
  if(nodes.bookingFilterDateTo)nodes.bookingFilterDateTo.value=''
  setBookingFiltersCollapsed(true)
  renderBookings()
})
nodes.customerFilterSearch?.addEventListener('input',renderCustomers)
nodes.customerFilterBrand?.addEventListener('change',renderCustomers)
nodes.customerFilterSource?.addEventListener('change',renderCustomers)
nodes.calendarViewButtons.forEach(button=>button.addEventListener('click',()=>{
  state.calendarView=button.dataset.calendarView||'day'
  renderCalendar()
}))
nodes.calendarFocusDate?.addEventListener('change',()=>{
  state.calendarFocusDate=nodes.calendarFocusDate.value||bookingAdminShared.currentDate()
  renderCalendar()
})
nodes.bookingForm.addEventListener('submit',event=>{void handleBookingSave(event)})
nodes.bookingNewButton.addEventListener('click',openNewBookingWorkspace)
nodes.closeBookingModalButton?.addEventListener('click',closeBookingModal)
nodes.serviceFilterBrand?.addEventListener('change',renderServices)
nodes.openServiceModalButton?.addEventListener('click',()=>openServiceModal())
nodes.closeServiceModalButton?.addEventListener('click',closeServiceModal)
nodes.serviceForm.addEventListener('submit',event=>{void handleServiceSave(event)})
nodes.adminUserForm?.addEventListener('submit',event=>{void handleAdminUserSave(event)})
nodes.adminUserRole?.addEventListener('change',()=>renderAdminUserPermissionEditor(collectPermissionOverrides(),nodes.adminUserRole.value))
nodes.settingsForm.addEventListener('submit',event=>{void handleSettingsSave(event)})
nodes.emailAutomationForm?.addEventListener('submit',event=>{void handleEmailAutomationSave(event)})
nodes.emailTemplatesForm.addEventListener('submit',event=>{
  event.preventDefault()
  void handleTemplateSave()
})
nodes.scheduleForm.addEventListener('submit',event=>{void handleScheduleSave(event)})
nodes.blackoutForm.addEventListener('submit',event=>{void handleBlackoutSave(event)})
nodes.couponForm.addEventListener('submit',event=>{void handleCouponSave(event)})
nodes.voucherForm.addEventListener('submit',event=>{void handleVoucherSave(event)})
nodes.agentForm.addEventListener('submit',event=>{void handleAgentSave(event)})
nodes.resourceForm.addEventListener('submit',event=>{void handleResourceSave(event)})
nodes.resourceAbundant?.addEventListener('change',syncResourceCapacityState)
nodes.refundForm.addEventListener('submit',event=>{void handleRefundSave(event)})
nodes.automationRulesForm.addEventListener('submit',event=>{void handleAutomationSave(event)})
nodes.portalSettingsForm.addEventListener('submit',event=>{void handlePortalSave(event)})
nodes.webhookForm.addEventListener('submit',event=>{void handleWebhookSave(event)})
nodes.operatorForm.addEventListener('submit',event=>{void handleOperatorSave(event)})
nodes.officeInvoiceForm.addEventListener('submit',event=>{void handleOfficeInvoiceSave(event)})

nodes.bookingsTable.addEventListener('click',event=>{
  const row=event.target.closest('[data-booking-id]')
  if(!row)return
  const booking=state.bookings.find(item=>item.id===row.dataset.bookingId)
  if(!booking)return
  openRecordInNewTab('bookings',booking.id)
})

nodes.reservationsTable?.addEventListener('click',event=>{
  const reservationId=event.target.closest('[data-reservation-open]')?.dataset.reservationOpen
    || event.target.closest('[data-reservation-id]')?.dataset.reservationId
  if(!reservationId)return
  openRecordInNewTab('reservations',reservationId)
})

nodes.customersTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-customer-id]')
  if(!row)return
  const customer=state.customers.find(item=>item.id===row.dataset.customerId)
  if(!customer)return
  state.selectedCustomerId=customer.id
  renderCustomers()
})

nodes.customerDetail?.addEventListener('click',event=>{
  const bookingId=event.target.closest('[data-customer-booking-id]')?.dataset.customerBookingId
  if(!bookingId)return
  handleCommandNavigation('bookings',bookingId)
})

nodes.notificationsTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-alert-booking-id]')
  const bookingId=row?.dataset.alertBookingId||''
  if(!bookingId)return
  const booking=state.bookings.find(item=>item.id===bookingId)
  if(booking)openBookingManagementScreen(booking,{scroll:true})
})

nodes.reservationDetail?.addEventListener('click',event=>{
  const action=event.target.dataset.reservationAction
  if(!action||!state.selectedBookingId)return
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  if(!booking)return
  if(action==='edit'){
    openBookingModal(booking)
    return
  }
  if(action==='decline'){
    const reason=window.prompt('Enter a decline reason.','Reservation declined after review.')
    if(reason===null)return
    void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
      method:'PATCH',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{ status:'cancelled', payment_status:'cancelled', reason, notes:reason }
    }).then(()=>refreshAdmin('Reservation declined.')).catch(error=>setAdminStatus(error.message||'Reservation update failed.',true))
    return
  }
  if(action==='accept'){
    void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
      method:'PATCH',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{ status:'awaiting_payment', payment_status:'pending', reason:'Reservation accepted and moved to bookings.' }
    }).then(async()=>{
      await refreshAdmin('Reservation accepted and moved to bookings.')
      const acceptedBooking=state.bookings.find(item=>item.id===state.selectedBookingId)
      if(acceptedBooking)openBookingManagementScreen(acceptedBooking,{scroll:true})
    }).catch(error=>setAdminStatus(error.message||'Reservation acceptance failed.',true))
  }
})

nodes.bookingDetail.addEventListener('click',event=>{
  const action=event.target.dataset.bookingAction
  const inlineAction=event.target.dataset.bookingInlineAction
  if(inlineAction==='clear-operator'&&state.selectedBookingId){
    void bookingAdminShared.apiRequest('admin/booking-operators',{
      method:'POST',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{
        booking_id:state.selectedBookingId,
        operator_id:'',
        commission_amount:0
      }
    }).then(()=>refreshAdmin('Booking assignment cleared.')).catch(error=>setAdminStatus(error.message||'Assignment update failed.',true))
    return
  }
  if(inlineAction==='duplicate'){
    void handleBookingDuplicate().catch(error=>setAdminStatus(error.message||'Booking duplication failed.',true))
    return
  }
  if(inlineAction==='edit-booking'){
    const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
    if(booking)openBookingModal(booking)
    return
  }
  if(inlineAction==='reschedule'){
    void handleBookingReschedule().catch(error=>setAdminStatus(error.message||'Booking reschedule failed.',true))
    return
  }
  if(inlineAction==='portal-access'){
    void handlePortalAccessLink().catch(error=>setAdminStatus(error.message||'Portal link generation failed.',true))
    return
  }
  if(inlineAction==='memories-focus'){
    const fileInput=nodes.bookingDetail.querySelector('form[data-inline-form="memories"] input[type="file"]')
    fileInput?.scrollIntoView?.({behavior:'smooth',block:'center'})
    window.setTimeout(()=>fileInput?.focus?.(),260)
    return
  }
  if(inlineAction==='complete-task'&&event.target.dataset.taskId){
    void bookingAdminShared.apiRequest(`admin/booking-tasks/${encodeURIComponent(event.target.dataset.taskId)}`,{
      method:'PATCH',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{ status:'done' }
    }).then(()=>refreshAdmin('Task completed.')).catch(error=>setAdminStatus(error.message||'Task update failed.',true))
    return
  }
  if(inlineAction==='note-template'){
    const noteInput=nodes.bookingDetail.querySelector('form[data-inline-form="note"] textarea[name="note"]')
    if(noteInput)noteInput.value=event.target.dataset.templateValue||''
    return
  }
  if(inlineAction?.startsWith('document:')){
    void handleDocumentGeneration(inlineAction.split(':')[1]).catch(error=>setAdminStatus(error.message||'Document generation failed.',true))
    return
  }
  if(inlineAction?.startsWith('portal:')){
    void handlePortalAction(inlineAction.split(':')[1]).catch(error=>setAdminStatus(error.message||'Portal action failed.',true))
    return
  }
  if(!action||!state.selectedBookingId)return
  const activeBooking=state.bookings.find(item=>item.id===state.selectedBookingId)
  if(action==='resend'){
    void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}/resend`,{
      method:'POST',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||'')
    }).then(()=>refreshAdmin('Confirmation email re-queued.')).catch(error=>setAdminStatus(error.message||'Email resend failed.',true))
    return
  }
  if(action==='cancelled'){
    const reason=window.prompt('Enter a cancellation reason.',state.opsTemplates?.cancellationReasonTemplates?.[0]||'Guest changed travel dates.')
    if(reason===null)return
    void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
      method:'PATCH',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{ status:'cancelled', reason, notes:reason }
    }).then(()=>refreshAdmin('Booking cancelled.')).catch(error=>setAdminStatus(error.message||'Booking update failed.',true))
    return
  }
  const payload=action==='paid'
    ? {status:activeBooking?.status==='completed' ? 'completed' : 'confirmed',payment_status:'paid'}
    : action==='awaiting_payment'
      ? {status:'awaiting_payment',payment_status:'pending'}
      : {status:action}
  void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  }).then(()=>refreshAdmin(`Booking updated to ${action}.`)).catch(error=>setAdminStatus(error.message||'Booking update failed.',true))
})

nodes.bookingDetail.addEventListener('submit',event=>{
  const form=event.target.closest('[data-inline-form]')
  if(!form)return
  event.preventDefault()
  const formType=form.dataset.inlineForm
  if(formType==='operator-assignment'){
    void handleBookingOperatorAssignmentSave(form).catch(error=>setAdminStatus(error.message||'Assignment update failed.',true))
    return
  }
  if(formType==='note'){
    void handleBookingNoteSave(form).catch(error=>setAdminStatus(error.message||'Note could not be saved.',true))
    return
  }
  if(formType==='task'){
    void handleBookingTaskSave(form).catch(error=>setAdminStatus(error.message||'Task could not be saved.',true))
    return
  }
  if(formType==='memories'){
    void handleMemoryUploadSave(form).catch(error=>setAdminStatus(error.message||'Tour memories could not be uploaded.',true))
    return
  }
  if(formType==='email'){
    void handleBookingEmailSave(form).catch(error=>setAdminStatus(error.message||'Email could not be sent.',true))
  }
})

nodes.servicesTable.addEventListener('click',event=>{
  const row=event.target.closest('[data-service-id]')
  if(!row)return
  const service=state.services.find(item=>item.id===row.dataset.serviceId)
  if(!service)return
  switchTab('services')
  openServiceModal(service)
})

nodes.refundsTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-booking-id]')
  const bookingId=row?.dataset.bookingId||''
  if(!bookingId)return
  handleCommandNavigation('bookings',bookingId)
})

nodes.adminUsersTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-admin-user-id]')
  if(!row)return
  const adminUser=state.adminUsers.find(item=>item.id===row.dataset.adminUserId)
  if(!adminUser)return
  fillAdminUserForm(adminUser)
  switchTab('admin-users')
})

nodes.reconciliationTable?.addEventListener('click',event=>{
  const action=event.target.dataset.reconciliationAction
  if(!action)return
  if(action==='open-booking'&&event.target.dataset.bookingId){
    handleCommandNavigation('bookings',event.target.dataset.bookingId)
    return
  }
  const recordId=event.target.dataset.reconciliationId
  if(action==='mark-review'){
    void handleReconciliationAction(recordId,'needs_review').catch(error=>setAdminStatus(error.message||'Reconciliation update failed.',true))
    return
  }
  if(action==='mark-clear'){
    void handleReconciliationAction(recordId,'cleared').catch(error=>setAdminStatus(error.message||'Reconciliation update failed.',true))
  }
})

nodes.systemJobsTable?.addEventListener('click',event=>{
  const action=event.target.dataset.jobAction
  const jobId=event.target.dataset.jobId
  if(!action||!jobId)return
  void handleSystemJobAction(jobId,action).catch(error=>setAdminStatus(error.message||'Job action failed.',true))
})

nodes.healthEventsTable?.addEventListener('click',event=>{
  const action=event.target.dataset.healthAction
  const eventId=event.target.dataset.healthEventId
  if(action!=='resolve'||!eventId)return
  void handleHealthEventResolve(eventId).catch(error=>setAdminStatus(error.message||'Health event update failed.',true))
})

nodes.runJobsNowButton?.addEventListener('click',()=>{
  void handleRunDueJobs().catch(error=>setAdminStatus(error.message||'Job run failed.',true))
})

nodes.openCommandPalette?.addEventListener('click',openCommandPalette)
nodes.toolbarCommandPalette?.addEventListener('click',openCommandPalette)
nodes.sidebarToggle?.addEventListener('click',toggleMobileSidebar)
nodes.sidebarBackdrop?.addEventListener('click',closeMobileSidebar)
nodes.commandPalette?.addEventListener('click',event=>{
  if(event.target.dataset.commandDismiss==='true')closeCommandPalette()
})
nodes.commandPaletteInput?.addEventListener('input',()=>{
  window.clearTimeout(commandPaletteTimer)
  commandPaletteTimer=window.setTimeout(()=>{
    void performCommandPaletteSearch(nodes.commandPaletteInput.value||'')
  },180)
})
nodes.commandPaletteResults?.addEventListener('click',event=>{
  const action=event.target.dataset.commandAction
  if(!action)return
  handleCommandNavigation(action,event.target.dataset.commandBookingId||'',event.target.dataset.commandCustomerId||'')
})

document.addEventListener('keydown',event=>{
  const isModifier=(event.ctrlKey||event.metaKey)&&String(event.key||'').toLowerCase()==='k'
  if(isModifier){
    event.preventDefault()
    openCommandPalette()
    return
  }
  if(event.key==='Escape'&&!nodes.commandPalette.hidden){
    closeCommandPalette()
    return
  }
  if(event.key==='Escape'&&document.body.classList.contains('is-sidebar-open')){
    closeMobileSidebar()
  }
})

window.addEventListener('resize',()=>{
  if(!isMobileSidebarViewport())closeMobileSidebar()
})

setBookingFiltersCollapsed(true)
syncResourceCapacityState()

;(async()=>{
  try{
    renderAuthEnvironmentMeta()
    const client=await requireClient()
    client.auth.onAuthStateChange((event,session)=>{
      const previousToken=state.session?.access_token||''
      state.session=session
      if(!session){
        state.user=null
        state.profile=null
        renderSession()
        redirectToLogin()
        return
      }
      if(session.access_token!==previousToken && ['SIGNED_IN','TOKEN_REFRESHED'].includes(event)){
        void refreshAdmin('Admin session refreshed.').catch(error=>setAuthStatus(error.message||'Admin session refresh failed.',true))
      }
    })
    const { data:{ session } }=await client.auth.getSession()
    state.session=session
    renderSession()
    if(session){
      await refreshAdmin('Authenticated and loaded live booking data.')
    }else{
      redirectToLogin()
    }
  }catch(error){
    setAuthStatus(error.message||'Admin authentication is not configured.',true)
  }
})()
