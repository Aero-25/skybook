const bookingAdminShared=window.TrueTravelBooking
const bookingAdminModules=window.SkyBookAdminModules||{}
const bookingAdminSharedUi=bookingAdminModules.sharedUi||{}
const bookingAdminReports=bookingAdminModules.reports||{}
const normalizeJsonRecord=value=>(value&&typeof value==='object'&&!Array.isArray(value) ? value : {})
const EMAIL_TEMPLATE_META={
  booking_received:{label:'True Travel Under Review',description:'The only guest email sent automatically, after a True Travel reservation is submitted.'}
}
const BOOKING_EDITOR_DRAFT_KEY='skybook-booking-editor-draft-v1'
const ADMIN_DOCUMENT_TITLE='SkyBook Operations Console'
const ADMIN_LIVE_SYNC_INTERVAL_MS=3000
const ADMIN_LIVE_SYNC_ERROR_COOLDOWN_MS=60000
const CANCELLATION_REASON_OPTIONS=[
  {value:'no_show',label:'No Show'},
  {value:'payment_overdue',label:'Payment overdue'},
  {value:'guest_requested',label:'Guest requested cancellation'},
  {value:'operator_unavailable',label:'Operator unavailable'},
  {value:'weather_or_safety',label:'Weather or safety'},
  {value:'duplicate_booking',label:'Duplicate booking'},
  {value:'admin_error',label:'Admin error'},
  {value:'other',label:'Other'}
]

const state={
  session:null,
  user:null,
  profile:null,
  activeTab:'dashboard',
  activeBrandFilter:'',
  lastSyncedAt:'',
  adminRefreshPromise:null,
  adminLiveSyncTimer:null,
  adminLiveSyncLastErrorAt:0,
  staffDirectory:[],
  adminUsers:[],
  permissionCatalog:bookingAdminShared.clone(bookingAdminShared.SKYBOOK_PERMISSION_CATALOG||[]),
  roleDefaults:bookingAdminShared.clone(bookingAdminShared.SKYBOOK_ROLE_DEFAULTS||{}),
  brands:[],
  bookings:[],
  bookingFormFields:[],
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
  bookingAgents:[],
  bookingOperators:[],
  resources:[],
  resourceAllocations:[],
  invoices:[],
  officeInvoices:[],
  bookingDiscounts:[],
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
    autoCompletePastConfirmedBookings:true,
    autoCancelExpiredAwaitingPayment:false,
    awaitingPaymentExpiryHours:48,
    sendOnBookingMade:true,
    sendOnBookingConfirmed:false,
    sendOnPaymentReceived:false,
    sendOnCancellationRefund:false
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
  panelSelections:{},
  bookingRecordSectionState:{},
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
  selectedPartnerId:'',
  selectedPartnerType:'',
  selectedServiceId:'',
  isServiceModalOpen:false,
  isBookingModalOpen:false,
  isCustomerModalOpen:false,
  isPartnerModalOpen:false,
  isWorkflowModalOpen:false,
  workflowModalConfig:null,
  bookingFunctionsCollapsed:false,
  notificationAudioUnlocked:false,
  lastNotificationSoundAt:0,
  bookingEditor:{
    draftKey:'',
    baseline:'',
    isDirty:false,
    restoredDraft:false,
    lastAutosavedAt:'',
    autosaveTimer:null
  }
}

const getAdminRouteState=()=>{
  try{
    const params=new URLSearchParams(window.location.search)
    return {
      tab:String(params.get('tab')||'').trim(),
      view:String(params.get('view')||params.get('mode')||'').trim(),
      serviceId:String(params.get('service')||'').trim(),
      bookingId:String(params.get('booking')||'').trim(),
      reservationId:String(params.get('reservation')||'').trim()
    }
  }catch{
    return {tab:'',view:'',serviceId:'',bookingId:'',reservationId:''}
  }
}

const isBookingRecordMode=(routeState=getAdminRouteState())=>{
  const view=String(routeState.view||'').toLowerCase()
  const tab=String(routeState.tab||'').toLowerCase()
  return Boolean(routeState.bookingId&&(!tab||tab==='bookings')&&(!view||['booking','booking-detail','record'].includes(view)))
}

const getBookingDocumentLabel=booking=>{
  const reference=String(booking?.reference||'').trim()
  const guest=String(booking?.customer_name||booking?.customer_email||'Guest').trim()
  return [reference,guest].filter(Boolean).join(' - ')
}

const setAdminDocumentTitle=label=>{
  const title=String(label||'').trim()
  document.title=title ? `${title} | SkyBook` : ADMIN_DOCUMENT_TITLE
}

const normalizeAdminBookingReference=value=>String(value||'').trim().replace(/\s+/g,'-').replace(/[^A-Z0-9-]/gi,'').toUpperCase()
const normalizeAdminReferencePrefix=value=>normalizeAdminBookingReference(value).replace(/-/g,'').slice(0,8)||'TT'

const getBrandBookingPrefix=brandCode=>{
  const brand=state.brands.find(item=>String(item.code||'')===String(brandCode||''))
  const fallback=String(brandCode||'').toLowerCase()==='iventure' ? 'IV' : bookingAdminShared.readConfig().bookingPrefix || 'TT'
  return normalizeAdminReferencePrefix(brand?.booking_prefix||brand?.bookingPrefix||fallback)
}

const getReferenceEntropy=()=>{
  const cryptoApi=globalThis.crypto
  if(cryptoApi?.randomUUID)return cryptoApi.randomUUID().replace(/-/g,'').slice(0,8).toUpperCase()
  return `${Math.random().toString(36).slice(2,8)}${Date.now().toString(36).slice(-4)}`.slice(0,8).toUpperCase()
}

const createAdminBookingReference=brandCode=>{
  const stamp=new Date().toISOString().slice(2,10).replace(/-/g,'')
  return `${getBrandBookingPrefix(brandCode)}-${stamp}-${getReferenceEntropy()}`
}

const createUniqueAdminBookingReference=brandCode=>{
  for(let attempt=0;attempt<12;attempt+=1){
    const reference=createAdminBookingReference(brandCode)
    if(!state.bookings.some(item=>normalizeAdminBookingReference(item.reference)===reference))return reference
  }
  return createAdminBookingReference(brandCode)
}

const syncBookingReferenceField=({booking=null,reference='',brandCode='',forceNew=false}={})=>{
  if(!nodes.bookingReference)return
  const selectedBrand=brandCode||booking?.brand_code||nodes.bookingBrand?.value||bookingAdminShared.readConfig().brandCode||state.brands[0]?.code||''
  const existingReference=normalizeAdminBookingReference(reference||booking?.reference)
  nodes.bookingReference.value=forceNew||!existingReference
    ? createUniqueAdminBookingReference(selectedBrand)
    : existingReference
  nodes.bookingReference.readOnly=true
  nodes.bookingReference.setAttribute('aria-readonly','true')
  nodes.bookingReference.title='Booking references are generated by SkyBook and cannot be edited.'
}

const setBookingRecordMode=active=>{
  const isActive=Boolean(active)
  document.body.classList.toggle('is-booking-record-page',isActive)
  if(!isActive){
    document.body.classList.remove('is-booking-record-loading','is-booking-record-ready')
    setAdminDocumentTitle()
  }
}

const setAdminLoadingContent=(title,message,{isError=false}={})=>{
  if(nodes.loadingTitle&&title)nodes.loadingTitle.textContent=title
  if(nodes.loadingStatus&&message){
    nodes.loadingStatus.textContent=message
    nodes.loadingStatus.classList.toggle('is-error',isError)
  }
  if(nodes.loadingSpinner)nodes.loadingSpinner.hidden=Boolean(isError)
}

const showBookingRecordLoader=(message='Loading the full booking record, payments, tasks, documents, and finance history.')=>{
  document.body.classList.add('is-booking-record-loading')
  document.body.classList.remove('is-booking-record-ready')
  setAdminDocumentTitle('Loading booking')
  setAdminLoadingContent('Loading booking record',message)
  if(nodes.loadingScreen)nodes.loadingScreen.hidden=false
  if(nodes.appShell)nodes.appShell.hidden=true
}

const showAdminSessionLoader=()=>{
  setAdminLoadingContent('Checking admin session','Loading the protected operations workspace for reservations, finance, suppliers, and reporting.')
}

const finishBookingRecordLoader=()=>{
  document.body.classList.remove('is-booking-record-loading')
  document.body.classList.add('is-booking-record-ready')
  if(nodes.appShell)nodes.appShell.hidden=false
  if(nodes.loadingScreen)nodes.loadingScreen.hidden=true
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
    if(tab==='bookings'&&bookingId&&document.body.classList.contains('is-booking-record-page'))currentUrl.searchParams.set('view','booking')
    else currentUrl.searchParams.delete('view')
    if((tab==='reservations'||tab==='reservation-management')&&reservationId)currentUrl.searchParams.set('reservation',reservationId)
    else currentUrl.searchParams.delete('reservation')
    history.replaceState(null,'',`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
  }catch{}
}

const nodes={
  authGate:document.getElementById('adminAuthGate'),
  appShell:document.getElementById('adminAppShell'),
  loadingScreen:document.getElementById('adminLoadingScreen'),
  loadingTitle:document.getElementById('adminLoadingTitle'),
  loadingStatus:document.getElementById('adminLoadingStatus'),
  loadingSpinner:document.getElementById('adminLoadingSpinner'),
  authStatus:document.getElementById('authStatus'),
  resetAuthCacheButton:document.getElementById('resetAuthCacheButton'),
  authEnvironmentMeta:document.getElementById('authEnvironmentMeta'),
  loginForm:document.getElementById('loginForm'),
  logoutButton:document.getElementById('logoutButton'),
  sessionLabel:document.getElementById('sessionLabel'),
  topSessionLabel:document.getElementById('topSessionLabel'),
  adminStatus:document.getElementById('bookingAdminStatus'),
  globalBrandSwitch:document.getElementById('globalBrandSwitch'),
  reservationPipeline:document.getElementById('reservationPipeline'),
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
  printArrivalsList:document.getElementById('printArrivalsList'),
  reportsOverviewCards:document.getElementById('reportsOverviewCards'),
  reportsStatusTable:document.getElementById('reportsStatusTable'),
  reportsGuestInvoicesTable:document.getElementById('reportsGuestInvoicesTable'),
  reportsOfficeInvoicesTable:document.getElementById('reportsOfficeInvoicesTable'),
  reportsArrivalsDate:document.getElementById('reportsArrivalsDate'),
  printReportArrivals:document.getElementById('printReportArrivals'),
  reportsArrivalsTable:document.getElementById('reportsArrivalsTable'),
  reportsConsultantTable:document.getElementById('reportsConsultantTable'),
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
  bookingTrashTable:document.getElementById('adminBookingTrashTable'),
  bookingDetail:document.getElementById('adminBookingDetail'),
  bookingForm:document.getElementById('adminBookingForm'),
  bookingModal:document.getElementById('bookingModal'),
  bookingModalTitle:document.getElementById('bookingModalTitle'),
  bookingDraftStatus:document.getElementById('bookingDraftStatus'),
  closeBookingModalButton:document.getElementById('closeBookingModalButton'),
  bookingReference:document.getElementById('adminBookingReference'),
  bookingBrand:document.getElementById('adminBookingBrand'),
  bookingSource:document.getElementById('adminBookingSource'),
  bookingService:document.getElementById('adminBookingService'),
  bookingStatus:document.getElementById('adminBookingStatusField'),
  bookingPaymentStatus:document.getElementById('adminBookingPaymentStatusField'),
  bookingDate:document.getElementById('adminBookingDate'),
  bookingQuantity:document.getElementById('adminBookingQuantity'),
  bookingQuantityWrap:document.getElementById('adminBookingQuantityWrap'),
  bookingAdultQuantity:document.getElementById('adminBookingAdultQuantity'),
  bookingAdultWrap:document.getElementById('adminBookingAdultWrap'),
  bookingChildQuantity:document.getElementById('adminBookingChildQuantity'),
  bookingChildWrap:document.getElementById('adminBookingChildWrap'),
  bookingCustomerName:document.getElementById('adminBookingCustomerName'),
  bookingCustomerEmail:document.getElementById('adminBookingCustomerEmail'),
  bookingCustomerPhone:document.getElementById('adminBookingCustomerPhone'),
  bookingGuideName:document.getElementById('adminBookingGuideName'),
  bookingCustomFields:document.getElementById('adminBookingCustomFields'),
  bookingNotes:document.getElementById('adminBookingNotes'),
  bookingSaveButton:document.getElementById('adminBookingSaveButton'),
  bookingNewButton:document.getElementById('adminBookingNewButton'),
  reservationsTable:document.getElementById('adminReservationsTable'),
  reservationDetail:document.getElementById('adminReservationDetail'),
  reservationTrashTable:document.getElementById('adminReservationTrashTable'),
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
  servicePricingMode:document.getElementById('adminServicePricingMode'),
  servicePrice:document.getElementById('adminServicePrice'),
  serviceAdultPrice:document.getElementById('adminServiceAdultPrice'),
  serviceChildPrice:document.getElementById('adminServiceChildPrice'),
  serviceDateRule:document.getElementById('adminServiceDateRule'),
  serviceDuration:document.getElementById('adminServiceDuration'),
  serviceMinPax:document.getElementById('adminServiceMinPax'),
  serviceDepartureTimesList:document.getElementById('adminServiceDepartureTimesList'),
  serviceAddDepartureTime:document.getElementById('adminServiceAddDepartureTime'),
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
  customerModal:document.getElementById('customerModal'),
  customerModalTitle:document.getElementById('customerModalTitle'),
  closeCustomerModalButton:document.getElementById('closeCustomerModalButton'),
  partnerModal:document.getElementById('partnerModal'),
  partnerModalTitle:document.getElementById('partnerModalTitle'),
  partnerModalDescription:document.getElementById('partnerModalDescription'),
  partnerDetail:document.getElementById('adminPartnerDetail'),
  closePartnerModalButton:document.getElementById('closePartnerModalButton'),
  printPartnerStatementButton:document.getElementById('printPartnerStatementButton'),
  workflowModal:document.getElementById('workflowModal'),
  workflowModalTitle:document.getElementById('workflowModalTitle'),
  workflowModalDescription:document.getElementById('workflowModalDescription'),
  workflowModalFields:document.getElementById('workflowModalFields'),
  workflowModalForm:document.getElementById('workflowModalForm'),
  workflowModalSubmitButton:document.getElementById('workflowModalSubmitButton'),
  workflowModalCancelButton:document.getElementById('workflowModalCancelButton'),
  closeWorkflowModalButton:document.getElementById('closeWorkflowModalButton'),
  paymentsTable:document.getElementById('adminPaymentsTable'),
  refundsTable:document.getElementById('adminRefundsTable'),
  reservationTrashSearch:document.getElementById('reservationTrashSearch'),
  reservationTrashArchivedBy:document.getElementById('reservationTrashArchivedBy'),
  bookingTrashSearch:document.getElementById('bookingTrashSearch'),
  bookingTrashArchivedBy:document.getElementById('bookingTrashArchivedBy'),
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
  bookingCustomFieldsPanel:document.getElementById('bookingCustomFieldsPanel'),
  bookingFieldsForm:document.getElementById('bookingFieldsForm'),
  bookingFieldsList:document.getElementById('bookingFieldsList'),
  addBookingFieldButton:document.getElementById('addBookingFieldButton'),
  emailAutomationForm:document.getElementById('emailAutomationForm'),
  emailTriggerBookingMade:document.getElementById('emailTriggerBookingMade'),
  emailTriggerBookingConfirmed:document.getElementById('emailTriggerBookingConfirmed'),
  emailTriggerPaymentReceived:document.getElementById('emailTriggerPaymentReceived'),
  emailTriggerCancellationRefund:document.getElementById('emailTriggerCancellationRefund'),
  emailSenderTrueTravel:document.getElementById('emailSenderTrueTravel'),
  emailSenderIventure:document.getElementById('emailSenderIventure'),
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
  platformOperationsHead:document.getElementById('adminPlatformOperationsHead'),
  platformConfigHead:document.getElementById('adminPlatformConfigHead'),
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
  resourceNotes:document.getElementById('adminResourceNotes'),
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
  desktopSidebarToggle:document.getElementById('desktopSidebarToggle'),
  sidebarToggle:document.getElementById('mobileSidebarToggle'),
  sidebarBackdrop:document.getElementById('sidebarBackdrop'),
  commandPalette:document.getElementById('commandPalette'),
  commandPaletteInput:document.getElementById('commandPaletteInput'),
  commandPaletteResults:document.getElementById('commandPaletteResults'),
  toastStack:document.getElementById('toastStack'),
  runJobsNowButton:document.getElementById('runJobsNowButton')
}

const SIDEBAR_COLLAPSED_KEY='skybook-admin-sidebar-collapsed-v1'
const isMobileSidebarViewport=()=>window.innerWidth<=1100

const readDesktopSidebarCollapsed=()=>{
  try{
    return localStorage.getItem(SIDEBAR_COLLAPSED_KEY)==='true'
  }catch{
    return false
  }
}

const writeDesktopSidebarCollapsed=collapsed=>{
  try{
    localStorage.setItem(SIDEBAR_COLLAPSED_KEY,collapsed ? 'true' : 'false')
  }catch{}
}

const setDesktopSidebarCollapsed=(collapsed,{persist=true}={})=>{
  const nextCollapsed=Boolean(collapsed)&&!isMobileSidebarViewport()
  document.body.classList.toggle('is-sidebar-collapsed',nextCollapsed)
  if(nodes.desktopSidebarToggle){
    nodes.desktopSidebarToggle.setAttribute('aria-pressed',nextCollapsed ? 'true' : 'false')
    nodes.desktopSidebarToggle.setAttribute('aria-label',nextCollapsed ? 'Expand sidebar' : 'Collapse sidebar')
    const label=nodes.desktopSidebarToggle.querySelector('.sidebar-collapse-label')
    if(label)label.textContent=nextCollapsed ? 'Expand' : 'Collapse'
  }
  if(persist)writeDesktopSidebarCollapsed(Boolean(collapsed))
}

const syncDesktopSidebarCollapse=()=>{
  setDesktopSidebarCollapsed(readDesktopSidebarCollapsed(),{persist:false})
}

const toggleDesktopSidebar=()=>{
  setDesktopSidebarCollapsed(!document.body.classList.contains('is-sidebar-collapsed'))
}

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
  'reservation-trash':{
    group:'Administration',
    eyebrow:'Permanent Archive',
    title:'Reservation Trash',
    subtitle:'Soft-deleted reservation requests stay here for audit, recovery, and intake traceability.'
  },
  'reservation-management':{
    group:'Reservations',
    eyebrow:'Reservation Management',
    title:'Reservation Management',
    subtitle:'Open one reservation at a time to review details, add missing information, and decide whether to accept or decline it.'
  },
  bookings:{
    group:'Reservations',
    eyebrow:'Booking Workspace',
    title:'Bookings',
    subtitle:'Accepted reservations and admin-created bookings that now need payment, documents, operators, notes, and guest communication.'
  },
  'booking-trash':{
    group:'Administration',
    eyebrow:'Permanent Archive',
    title:'Booking Trash',
    subtitle:'Soft-deleted booking records stay here permanently for audit, recovery, and financial traceability.'
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
    eyebrow:'Partner Operations',
    title:'Partner Center',
    subtitle:'Manage selling partners and operating partners with statements, outstanding balances, and commercial context in one workspace.'
  },
  invoices:{
    group:'Revenue',
    eyebrow:'Finance Ledgers',
    title:'Debtors And Creditors',
    subtitle:'Work the debtor ledger, creditor ledger, receivables exposure, supplier payables, and partner settlements from one workspace.'
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

const setActionButtonLoading=(button,isLoading=true,label='Working')=>{
  if(!button||button.dataset.loadingExempt==='true')return
  if(isLoading){
    if(button.dataset.skybookLoading==='true')return
    button.dataset.skybookLoading='true'
    button.dataset.skybookOriginalDisabled=button.disabled ? 'true' : 'false'
    button.dataset.skybookOriginalAriaLabel=button.getAttribute('aria-label')||''
    button.dataset.skybookLoadingLabel=label
    button.disabled=true
    button.classList.add('is-loading')
    button.setAttribute('aria-busy','true')
    if(label)button.setAttribute('aria-label',label)
    return
  }
  if(button.dataset.skybookLoading!=='true')return
  const wasDisabled=button.dataset.skybookOriginalDisabled==='true'
  const originalAriaLabel=button.dataset.skybookOriginalAriaLabel||''
  button.disabled=wasDisabled
  button.classList.remove('is-loading')
  button.removeAttribute('aria-busy')
  if(originalAriaLabel)button.setAttribute('aria-label',originalAriaLabel)
  else button.removeAttribute('aria-label')
  delete button.dataset.skybookLoading
  delete button.dataset.skybookOriginalDisabled
  delete button.dataset.skybookOriginalAriaLabel
  delete button.dataset.skybookLoadingLabel
}

const runWithActionLoading=(button,task,label='Working')=>{
  setActionButtonLoading(button,true,label)
  return Promise.resolve()
    .then(()=>typeof task==='function' ? task() : task)
    .finally(()=>setActionButtonLoading(button,false))
}

const handleFormSubmitWithLoading=(event,handler,label='Saving')=>{
  const button=event?.submitter||event?.target?.querySelector?.('button[type="submit"]')
  void runWithActionLoading(button,()=>handler(event),label).catch(error=>setAdminStatus(error.message||'Action failed.',true))
}

const unlockSkybookNotificationSound=()=>{
  state.notificationAudioUnlocked=true
}

const playSkybookNotificationSound=()=>{
  const now=Date.now()
  if(!state.notificationAudioUnlocked || now-state.lastNotificationSoundAt<1200)return
  state.lastNotificationSoundAt=now
  try{
    const AudioContextClass=window.AudioContext||window.webkitAudioContext
    if(!AudioContextClass)return
    const context=new AudioContextClass()
    const gain=context.createGain()
    gain.gain.setValueAtTime(0.0001,context.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.18,context.currentTime+0.025)
    gain.gain.exponentialRampToValueAtTime(0.0001,context.currentTime+0.34)
    gain.connect(context.destination)
    ;[660,880].forEach((frequency,index)=>{
      const oscillator=context.createOscillator()
      oscillator.type='sine'
      oscillator.frequency.setValueAtTime(frequency,context.currentTime+(index*0.11))
      oscillator.connect(gain)
      oscillator.start(context.currentTime+(index*0.11))
      oscillator.stop(context.currentTime+(index*0.11)+0.18)
    })
    window.setTimeout(()=>context.close?.(),520)
  }catch{}
}

const renderModuleChrome=tab=>{
  const meta=MODULE_META[tab]||MODULE_META.dashboard
  if(nodes.moduleBreadcrumb)nodes.moduleBreadcrumb.textContent=`SkyBook / ${meta.group} / ${meta.title}`
  if(nodes.moduleEyebrow)nodes.moduleEyebrow.textContent=meta.eyebrow
  if(nodes.moduleTitle)nodes.moduleTitle.textContent=meta.title
  if(nodes.moduleSubtitle)nodes.moduleSubtitle.textContent=meta.subtitle
  document.body.classList.toggle('is-compact-admin-toolbar',['reservation-management','bookings'].includes(tab))
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
      if(isError&&nodes.loadingTitle)nodes.loadingTitle.textContent=document.body.classList.contains('is-booking-record-page') ? 'Booking could not load' : 'Admin could not load'
      nodes.loadingStatus.textContent=message
      nodes.loadingStatus.classList.toggle('is-error',isError)
      if(nodes.loadingSpinner)nodes.loadingSpinner.hidden=Boolean(isError)
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

const getAgeInDays=value=>{
  const parsed=parseDateValue(value)
  if(!parsed)return null
  const now=new Date()
  const oneDay=1000*60*60*24
  return Math.floor((now.getTime()-parsed.getTime())/oneDay)
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

const htmlAttribute=value=>bookingAdminShared.escapeHtml(String(value ?? ''))
const BOOKING_FIELD_TYPES=[
  {value:'text',label:'Text'},
  {value:'textarea',label:'Long Text'},
  {value:'select',label:'Dropdown'},
  {value:'checkbox',label:'Checkbox'},
  {value:'number',label:'Number'},
  {value:'date',label:'Date'},
  {value:'email',label:'Email'},
  {value:'tel',label:'Phone'}
]
const isSuperAdmin=()=>String(state.profile?.role||'')==='super_admin'
const normalizeFieldId=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'_').replace(/^_+|_+$/g,'')
const normalizeBookingFieldOptions=value=>(Array.isArray(value) ? value : String(value||'').split(/\r?\n|,/)).map((option,index)=>{
  const raw=option&&typeof option==='object' ? option : {label:option,value:option}
  const label=String(raw.label||raw.value||'').trim()
  const optionValue=normalizeFieldId(raw.value||label)||`option_${index+1}`
  return {value:optionValue,label:label||formatDisplayLabel(optionValue)}
}).filter(option=>option.value&&option.label)
const normalizeBookingFieldDefinitions=fields=>{
  const seen=new Set()
  return (Array.isArray(fields) ? fields : []).map((field,index)=>{
    const label=String(field?.label||'').trim()
    const id=normalizeFieldId(field?.id||field?.key||label)||`field_${index+1}`
    const type=BOOKING_FIELD_TYPES.some(item=>item.value===field?.type) ? field.type : 'text'
    const brandCodes=Array.isArray(field?.brand_codes) ? field.brand_codes.map(normalizeFieldId).filter(Boolean) : []
    return {
      id,
      label:label||formatDisplayLabel(id),
      type,
      required:Boolean(field?.required),
      placeholder:String(field?.placeholder||'').trim(),
      help_text:String(field?.help_text||field?.helper||'').trim(),
      brand_codes:brandCodes,
      options:type==='select' ? normalizeBookingFieldOptions(field?.options) : [],
      sort_order:Number(field?.sort_order ?? index),
      is_active:field?.is_active===undefined ? true : Boolean(field.is_active)
    }
  }).filter(field=>{
    if(!field.id||!field.label||seen.has(field.id))return false
    seen.add(field.id)
    return true
  }).sort((left,right)=>Number(left.sort_order||0)-Number(right.sort_order||0))
}
const bookingFieldAppliesToBrand=(field,brandCode)=>{
  const brandCodes=Array.isArray(field?.brand_codes) ? field.brand_codes.map(normalizeFieldId).filter(Boolean) : []
  return !brandCodes.length || brandCodes.includes(normalizeFieldId(brandCode))
}
const getActiveBookingFormFields=brandCode=>normalizeBookingFieldDefinitions(state.bookingFormFields)
  .filter(field=>field.is_active!==false&&bookingFieldAppliesToBrand(field,brandCode))
const getBookingCustomFieldValues=booking=>normalizeJsonRecord(normalizeJsonRecord(booking?.metadata).custom_fields)
const formatSubmittedDetailValue=value=>{
  if(value===true)return 'Yes'
  if(value===false)return 'No'
  if(Array.isArray(value))return value.map(item=>String(item??'').trim()).filter(Boolean).join(', ')
  if(value&&typeof value==='object'){
    return Object.entries(value)
      .map(([key,entry])=>{
        const entryValue=formatSubmittedDetailValue(entry)
        return entryValue ? `${formatDisplayLabel(key)}: ${entryValue}` : ''
      })
      .filter(Boolean)
      .join(' / ')
  }
  return String(value??'').trim()
}
const buildSubmittedBookingDetailRows=booking=>{
  const metadata=normalizeJsonRecord(booking?.metadata)
  const customValues=getBookingCustomFieldValues(booking)
  const fields=getActiveBookingFormFields(booking?.brand_code)
  const fieldLabelMap=new Map(fields.map(field=>[field.id,field.label]))
  const rows=[]
  const usedKeys=new Set()
  const addRow=(label,value,key='')=>{
    const displayValue=formatSubmittedDetailValue(value)
    if(!displayValue)return
    if(key)usedKeys.add(normalizeFieldId(key))
    rows.push({label,value:displayValue})
  }
  addRow('Reference',booking?.reference)
  addRow('Brand',formatBrandLabel(booking?.brand_code||''))
  addRow('Source',formatSourceLabel(booking?.source||metadata.source||'website'))
  addRow('Submitted from',metadata.source_page||metadata.capture_page)
  addRow('Created via',formatDisplayLabel(metadata.created_via||''))
  addRow('Guest name',booking?.customer_name)
  addRow('Guest email',booking?.customer_email)
  addRow('Guest phone',booking?.customer_phone)
  addRow('Tour',booking?.service_name)
  addRow('Preferred date',formatDateLabel(booking?.preferred_date))
  const adultQty=Number(booking?.adult_quantity||0)
  const childQty=Number(booking?.child_quantity||0)
  const guestLabel=adultQty+childQty>0 ? `${booking?.quantity||adultQty+childQty} (${adultQty} adult${adultQty!==1?'s':''}, ${childQty} child${childQty!==1?'ren':''})` : String(booking?.quantity||1)
  addRow('Guests',guestLabel)
  addRow('Total',bookingAdminShared.formatMoney(booking?.total_amount||0,booking?.currency||state.settings.currency))
  addRow('Guest notes',booking?.customer_notes||booking?.notes)
  ;[
    'pickup_location',
    'pickup_point',
    'pickup_notes',
    'collection_point',
    'dropoff_location',
    'dropoff_point',
    'dropoff_notes',
    'dietary_requirements',
    'dietary',
    'nationality',
    'contact_number',
    'whatsapp',
    'hotel',
    'room_number',
    'special_requests',
    'other_notes'
  ].forEach(key=>addRow(formatDisplayLabel(key),metadata[key],key))
  Object.entries(customValues).forEach(([key,value])=>{
    const normalizedKey=normalizeFieldId(key)
    if(usedKeys.has(normalizedKey))return
    addRow(fieldLabelMap.get(normalizedKey)||formatDisplayLabel(key),value,key)
  })
  return rows
}
const getBookingPaymentLinkMeta=booking=>normalizeJsonRecord(normalizeJsonRecord(booking?.metadata).payment_link)
const getBookingPaymentLink=booking=>normalizeText(getBookingPaymentLinkMeta(booking).url)
const copyTextToClipboard=async text=>{
  const value=normalizeText(text)
  if(!value)throw new Error('Nothing to copy.')
  if(navigator.clipboard?.writeText){
    await navigator.clipboard.writeText(value)
    return
  }
  const textarea=document.createElement('textarea')
  textarea.value=value
  textarea.setAttribute('readonly','')
  textarea.style.position='fixed'
  textarea.style.opacity='0'
  document.body.appendChild(textarea)
  textarea.select()
  document.execCommand('copy')
  textarea.remove()
}
const getCustomFieldInputName=field=>`custom_${normalizeFieldId(field.id)}`
const renderCustomFieldControl=(field,value='')=>{
  const inputName=htmlAttribute(getCustomFieldInputName(field))
  const label=bookingAdminShared.escapeHtml(field.label)
  const required=field.required ? 'required' : ''
  const helper=field.help_text ? `<small class="field-hint">${bookingAdminShared.escapeHtml(field.help_text)}</small>` : ''
  const baseClass=field.type==='textarea'||field.type==='checkbox' ? 'booking-field-full' : 'booking-field'
  if(field.type==='textarea'){
    return `
      <label class="${baseClass}" data-booking-custom-field="${htmlAttribute(field.id)}">
        <span>${label}${field.required ? ' *' : ''}</span>
        <textarea name="${inputName}" rows="3" placeholder="${htmlAttribute(field.placeholder||'')}" ${required}>${bookingAdminShared.escapeHtml(value||'')}</textarea>
        ${helper}
      </label>
    `
  }
  if(field.type==='select'){
    return `
      <label class="${baseClass}" data-booking-custom-field="${htmlAttribute(field.id)}">
        <span>${label}${field.required ? ' *' : ''}</span>
        <select name="${inputName}" ${required}>
          <option value="">Choose ${bookingAdminShared.escapeHtml(field.label)}</option>
          ${(field.options||[]).map(option=>`<option value="${htmlAttribute(option.value)}" ${String(option.value)===String(value||'') ? 'selected' : ''}>${bookingAdminShared.escapeHtml(option.label)}</option>`).join('')}
        </select>
        ${helper}
      </label>
    `
  }
  if(field.type==='checkbox'){
    return `
      <label class="${baseClass} inline-check" data-booking-custom-field="${htmlAttribute(field.id)}">
        <input name="${inputName}" type="checkbox" ${value===true||String(value)==='true' ? 'checked' : ''} ${required}>
        <span>${label}${field.required ? ' *' : ''}</span>
      </label>
    `
  }
  return `
    <label class="${baseClass}" data-booking-custom-field="${htmlAttribute(field.id)}">
      <span>${label}${field.required ? ' *' : ''}</span>
      <input name="${inputName}" type="${htmlAttribute(field.type||'text')}" value="${htmlAttribute(value||'')}" placeholder="${htmlAttribute(field.placeholder||'')}" ${required}>
      ${helper}
    </label>
  `
}
const renderAdminBookingCustomFields=(booking=null,existingValues=null)=>{
  if(!nodes.bookingCustomFields)return
  const brandCode=nodes.bookingBrand?.value||booking?.brand_code||state.brands[0]?.code||bookingAdminShared.readConfig().brandCode
  const values=existingValues||getBookingCustomFieldValues(booking)
  const fields=getActiveBookingFormFields(brandCode)
  nodes.bookingCustomFields.innerHTML=fields.map(field=>renderCustomFieldControl(field,values[field.id])).join('')
  setNodeVisibility(nodes.bookingCustomFields,fields.length>0)
}
const collectBookingCustomFieldValues=()=>{
  const values={}
  nodes.bookingCustomFields?.querySelectorAll('[data-booking-custom-field]').forEach(wrapper=>{
    const fieldId=wrapper.dataset.bookingCustomField
    const input=wrapper.querySelector('input, select, textarea')
    if(!fieldId||!input)return
    values[fieldId]=input.type==='checkbox' ? input.checked : input.value.trim()
  })
  return values
}
const createEmptyBookingField=()=>({
  id:`custom_${Date.now().toString(36)}`,
  label:'New field',
  type:'text',
  required:false,
  placeholder:'',
  help_text:'',
  brand_codes:[],
  options:[],
  sort_order:normalizeBookingFieldDefinitions(state.bookingFormFields).length,
  is_active:true
})
const renderBookingFieldManager=()=>{
  const canEdit=isSuperAdmin()
  setNodeVisibility(nodes.bookingCustomFieldsPanel,canEdit)
  if(!canEdit||!nodes.bookingFieldsList)return
  const fields=normalizeBookingFieldDefinitions(state.bookingFormFields)
  nodes.bookingFieldsList.innerHTML=fields.map((field,index)=>`
    <article class="booking-custom-field-row" data-booking-field-index="${index}">
      <div class="booking-form-grid">
        <label class="booking-field">
          <span>Field Label</span>
          <input data-field-prop="label" type="text" value="${htmlAttribute(field.label)}" required>
        </label>
        <label class="booking-field">
          <span>Field Key</span>
          <input data-field-prop="id" type="text" value="${htmlAttribute(field.id)}" required>
        </label>
        <label class="booking-field">
          <span>Type</span>
          <select data-field-prop="type">
            ${BOOKING_FIELD_TYPES.map(type=>`<option value="${htmlAttribute(type.value)}" ${type.value===field.type ? 'selected' : ''}>${bookingAdminShared.escapeHtml(type.label)}</option>`).join('')}
          </select>
        </label>
        <label class="booking-field">
          <span>Placeholder</span>
          <input data-field-prop="placeholder" type="text" value="${htmlAttribute(field.placeholder)}">
        </label>
        <label class="booking-field-full">
          <span>Help Text</span>
          <input data-field-prop="help_text" type="text" value="${htmlAttribute(field.help_text)}">
        </label>
        <label class="booking-field-full">
          <span>Dropdown Options</span>
          <textarea data-field-prop="options" rows="3" placeholder="One option per line">${bookingAdminShared.escapeHtml((field.options||[]).map(option=>option.label).join('\n'))}</textarea>
        </label>
        <div class="booking-field-full booking-custom-field-flags">
          <label class="inline-check"><input data-field-prop="required" type="checkbox" ${field.required ? 'checked' : ''}><span>Required</span></label>
          <label class="inline-check"><input data-field-prop="is_active" type="checkbox" ${field.is_active!==false ? 'checked' : ''}><span>Active</span></label>
          <label class="inline-check"><input data-field-brand="true-travel" type="checkbox" ${!field.brand_codes?.length||field.brand_codes.includes('true-travel') ? 'checked' : ''}><span>True Travel</span></label>
          <label class="inline-check"><input data-field-brand="iventure" type="checkbox" ${!field.brand_codes?.length||field.brand_codes.includes('iventure') ? 'checked' : ''}><span>Iventure</span></label>
          <button class="booking-button ghost compact-button" type="button" data-remove-booking-field="${index}">Remove</button>
        </div>
      </div>
    </article>
  `).join('') || '<p class="muted-copy">No custom booking form fields yet.</p>'
}
const collectBookingFieldManagerValues=()=>[...(nodes.bookingFieldsList?.querySelectorAll('[data-booking-field-index]')||[])].map((row,index)=>{
  const prop=value=>row.querySelector(`[data-field-prop="${value}"]`)
  const selectedBrands=[...row.querySelectorAll('[data-field-brand]:checked')].map(node=>node.dataset.fieldBrand).filter(Boolean)
  const allBrandsSelected=selectedBrands.includes('true-travel')&&selectedBrands.includes('iventure')
  return {
    id:normalizeFieldId(prop('id')?.value||prop('label')?.value)||`field_${index+1}`,
    label:prop('label')?.value?.trim()||`Field ${index+1}`,
    type:prop('type')?.value||'text',
    required:prop('required')?.checked===true,
    is_active:prop('is_active')?.checked!==false,
    placeholder:prop('placeholder')?.value?.trim()||'',
    help_text:prop('help_text')?.value?.trim()||'',
    brand_codes:allBrandsSelected ? [] : selectedBrands,
    options:normalizeBookingFieldOptions(prop('options')?.value||''),
    sort_order:index
  }
})
const collectBookingFormValues=()=>({
  reference:nodes.bookingReference?.value||'',
  brand_code:nodes.bookingBrand?.value||'',
  source:nodes.bookingSource?.value||'',
  service_slug:nodes.bookingService?.value||'',
  status:nodes.bookingStatus?.value||'',
  payment_status:nodes.bookingPaymentStatus?.value||'',
  preferred_date:nodes.bookingDate?.value||'',
  quantity:nodes.bookingQuantity?.value||'',
  adult_quantity:Number(nodes.bookingAdultQuantity?.value||0),
  child_quantity:Number(nodes.bookingChildQuantity?.value||0),
  guide_name:nodes.bookingGuideName?.value||'',
  customer_name:nodes.bookingCustomerName?.value||'',
  customer_email:nodes.bookingCustomerEmail?.value||'',
  customer_phone:nodes.bookingCustomerPhone?.value||'',
  custom_fields:collectBookingCustomFieldValues(),
  notes:nodes.bookingNotes?.value||''
})
const applyBookingFormValues=values=>{
  if(!values)return
  if(nodes.bookingBrand)nodes.bookingBrand.value=String(values.brand_code||nodes.bookingBrand.value||'')
  syncBookingReferenceField({
    reference:values.reference,
    brandCode:nodes.bookingBrand?.value||values.brand_code||'',
    forceNew:!state.selectedBookingId&&!values.reference
  })
  if(nodes.bookingSource)nodes.bookingSource.value=String(values.source||nodes.bookingSource.value||'admin')
  if(nodes.bookingService)nodes.bookingService.value=String(values.service_slug||'')
  if(nodes.bookingStatus)nodes.bookingStatus.value=String(values.status||nodes.bookingStatus.value||'awaiting_payment')
  if(nodes.bookingPaymentStatus)nodes.bookingPaymentStatus.value=String(values.payment_status||nodes.bookingPaymentStatus.value||'pending')
  if(nodes.bookingDate)nodes.bookingDate.value=String(values.preferred_date||'')
  if(nodes.bookingQuantity)nodes.bookingQuantity.value=String(values.quantity||nodes.bookingQuantity.value||2)
  if(nodes.bookingAdultQuantity)nodes.bookingAdultQuantity.value=String(values.adult_quantity||0)
  if(nodes.bookingChildQuantity)nodes.bookingChildQuantity.value=String(values.child_quantity||0)
  if(nodes.bookingGuideName)nodes.bookingGuideName.value=String(values.guide_name||'')
  if(nodes.bookingCustomerName)nodes.bookingCustomerName.value=String(values.customer_name||'')
  if(nodes.bookingCustomerEmail)nodes.bookingCustomerEmail.value=String(values.customer_email||'')
  if(nodes.bookingCustomerPhone)nodes.bookingCustomerPhone.value=String(values.customer_phone||'')
  if(values.custom_fields)renderAdminBookingCustomFields(null,normalizeJsonRecord(values.custom_fields))
  if(nodes.bookingNotes)nodes.bookingNotes.value=String(values.notes||'')
  syncBookingQuantityMode()
}
const createBookingFormSnapshot=()=>JSON.stringify(collectBookingFormValues())
const getBookingEditorDraftKey=()=>`${BOOKING_EDITOR_DRAFT_KEY}:${state.selectedBookingId||'new'}`
const renderBookingDraftStatus=()=>{
  if(!nodes.bookingDraftStatus)return
  let label='Changes save locally while you edit.'
  if(state.bookingEditor.isDirty){
    label=state.bookingEditor.lastAutosavedAt
      ? `Local draft saved ${formatDateTimeLabel(state.bookingEditor.lastAutosavedAt)}.`
      : 'Unsaved changes are still local to this browser.'
  }else if(state.bookingEditor.restoredDraft){
    label=state.bookingEditor.lastAutosavedAt
      ? `Local draft restored ${formatDateTimeLabel(state.bookingEditor.lastAutosavedAt)}.`
      : 'Local draft restored for this record.'
  }
  nodes.bookingDraftStatus.textContent=label
  nodes.bookingDraftStatus.classList.toggle('is-dirty',state.bookingEditor.isDirty)
  nodes.bookingDraftStatus.classList.toggle('is-restored',!state.bookingEditor.isDirty && state.bookingEditor.restoredDraft)
}
const resetBookingEditorState=()=>{
  window.clearTimeout(state.bookingEditor.autosaveTimer)
  state.bookingEditor={
    draftKey:'',
    baseline:'',
    isDirty:false,
    restoredDraft:false,
    lastAutosavedAt:'',
    autosaveTimer:null
  }
  renderBookingDraftStatus()
}
const clearBookingEditorDraft=()=>{
  if(state.bookingEditor.draftKey)localStorage.removeItem(state.bookingEditor.draftKey)
  resetBookingEditorState()
}
const syncBookingEditorDirtyState=()=>{
  state.bookingEditor.isDirty=Boolean(state.bookingEditor.baseline) && createBookingFormSnapshot()!==state.bookingEditor.baseline
  renderBookingDraftStatus()
}
const autosaveBookingEditorDraft=()=>{
  if(!state.isBookingModalOpen||!state.bookingEditor.draftKey)return
  const record={
    savedAt:new Date().toISOString(),
    values:collectBookingFormValues()
  }
  localStorage.setItem(state.bookingEditor.draftKey,JSON.stringify(record))
  state.bookingEditor.lastAutosavedAt=record.savedAt
  syncBookingEditorDirtyState()
}
const scheduleBookingEditorAutosave=()=>{
  window.clearTimeout(state.bookingEditor.autosaveTimer)
  state.bookingEditor.autosaveTimer=window.setTimeout(autosaveBookingEditorDraft,260)
}
const restoreBookingEditorDraftIfAvailable=()=>{
  if(!state.bookingEditor.draftKey)return false
  try{
    const raw=localStorage.getItem(state.bookingEditor.draftKey)
    if(!raw)return false
    const draftRecord=JSON.parse(raw)
    if(!draftRecord||typeof draftRecord!=='object'||!draftRecord.values)return false
    applyBookingFormValues(draftRecord.values)
    state.bookingEditor.restoredDraft=true
    state.bookingEditor.lastAutosavedAt=String(draftRecord.savedAt||'')
    return true
  }catch{
    localStorage.removeItem(state.bookingEditor.draftKey)
    return false
  }
}
const initialiseBookingEditorSession=()=>{
  state.bookingEditor.draftKey=getBookingEditorDraftKey()
  state.bookingEditor.baseline=createBookingFormSnapshot()
  state.bookingEditor.isDirty=false
  state.bookingEditor.restoredDraft=false
  state.bookingEditor.lastAutosavedAt=''
  restoreBookingEditorDraftIfAvailable()
  syncBookingEditorDirtyState()
}

const getTodayKey=()=>bookingAdminShared.currentDate()
const normalizeDateKey=value=>parseDateValue(value)?.toISOString().slice(0,10)||''
const sameDate=(left,right)=>normalizeDateKey(left)===normalizeDateKey(right)

const getStatusBadgeClass=value=>{
  const normalized=String(value||'').toLowerCase()
  if(['ready','confirmed','completed','paid','settled','approved','successful'].includes(normalized))return 'is-good'
  if(['attention','pending','awaiting_payment','partially_paid','queued','under_review','needs_review','payment_request_sent','rescheduled','draft'].includes(normalized))return 'is-warn'
  if(['blocked','cancelled','failed','refunded','inactive','critical','error','no_show'].includes(normalized))return 'is-bad'
  if(['active','default','issued','open','generated','processing','available','private','sent','info'].includes(normalized))return 'is-info'
  return 'is-neutral'
}

const renderStatusBadge=(value,label='')=>`<span class="status-badge ${getStatusBadgeClass(value)}">${bookingAdminShared.escapeHtml(label||String(value||'—').replace(/_/g,' '))}</span>`

const sortByDateDesc=(items,key)=>[...items].sort((left,right)=>{
  const leftStamp=parseDateValue(left?.[key])?.getTime()||0
  const rightStamp=parseDateValue(right?.[key])?.getTime()||0
  return rightStamp-leftStamp
})

const getBookingSectionTitle=section=>{
  if(section.classList.contains('sticky-actions'))return 'Booking actions'
  return section.querySelector('h4')?.textContent?.trim()
    || section.querySelector('.booking-chip')?.textContent?.trim()
    || 'Booking section'
}

const getBookingRecordSectionBucket=()=>{
  const bookingId=String(state.selectedBookingId||getAdminRouteState().bookingId||'').trim()
  if(!bookingId)return null
  if(!state.bookingRecordSectionState[bookingId])state.bookingRecordSectionState[bookingId]={}
  return state.bookingRecordSectionState[bookingId]
}

const getBookingRecordSectionKey=section=>{
  if(!section)return ''
  const explicit=String(section.id||section.dataset.bookingSectionKey||'').trim()
  if(explicit)return explicit
  return getBookingSectionTitle(section).toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||'booking-section'
}

const setBookingSectionCollapsed=(section,collapsed=true,{persist=true}={})=>{
  const body=section.querySelector(':scope > .detail-section-body')
  const toggle=section.querySelector(':scope > .detail-section-toggle')
  if(!body||!toggle)return
  section.classList.toggle('is-collapsed',collapsed)
  section.classList.toggle('is-expanded',!collapsed)
  body.hidden=collapsed
  toggle.setAttribute('aria-expanded',collapsed ? 'false' : 'true')
  const action=toggle.querySelector('.detail-section-toggle-action')
  if(action)action.textContent=collapsed ? 'Open' : 'Close'
  if(persist){
    const bucket=getBookingRecordSectionBucket()
    const key=getBookingRecordSectionKey(section)
    if(bucket&&key)bucket[key]=Boolean(collapsed)
  }
}

const setupBookingRecordAccordions=()=>{
  if(!document.body.classList.contains('is-booking-record-page'))return
  const shell=nodes.bookingDetail?.querySelector('.booking-screen-shell')
  const main=shell?.querySelector('.booking-detail-main')
  const hero=main?.querySelector('.booking-management-hero')
  const overview=main?.querySelector('.detail-overview-grid')
  if(hero&&overview&&hero.nextElementSibling!==overview){
    hero.insertAdjacentElement('afterend',overview)
  }
  if(overview){
    overview.classList.add('booking-info-section')
  }
  shell?.querySelectorAll('.detail-section').forEach(section=>{
    if(section.classList.contains('booking-info-section'))return
    if(section.dataset.bookingAccordionReady==='true')return
    section.dataset.bookingAccordionReady='true'
    const key=getBookingRecordSectionKey(section)
    section.dataset.bookingSectionKey=key
    section.classList.add('booking-accordion-section')
    const title=getBookingSectionTitle(section)
    const body=document.createElement('div')
    body.className='detail-section-body'
    ;[...section.childNodes].forEach(child=>body.appendChild(child))
    const toggle=document.createElement('button')
    toggle.className='detail-section-toggle'
    toggle.type='button'
    toggle.innerHTML=`
      <span>${bookingAdminShared.escapeHtml(title)}</span>
      <span class="detail-section-toggle-action">Close</span>
    `
    toggle.addEventListener('click',()=>setBookingSectionCollapsed(section,!section.classList.contains('is-collapsed')))
    section.append(toggle,body)
    const bucket=getBookingRecordSectionBucket()
    const shouldCollapse=bucket&&Object.prototype.hasOwnProperty.call(bucket,key)
      ? Boolean(bucket[key])
      : true
    setBookingSectionCollapsed(section,shouldCollapse,{persist:false})
  })
  shell?.querySelectorAll('.booking-management-nav a[href^="#"]').forEach(link=>{
    link.addEventListener('click',()=>{
      const target=shell.querySelector(link.getAttribute('href'))
      const section=target?.classList.contains('booking-accordion-section')
        ? target
        : target?.closest('.booking-accordion-section')
      if(section)setBookingSectionCollapsed(section,false)
    })
  })
}

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

const applyRequestedRoute=(routeState=getAdminRouteState(),{scrollToFocus=true}={})=>{
  setBookingRecordMode(isBookingRecordMode(routeState))
  const requestedBookingId=routeState.bookingId||''
  if(requestedBookingId){
    const requestedBooking=state.bookings.find(item=>String(item.id)===String(requestedBookingId))
    if(requestedBooking){
      openBookingManagementScreen(requestedBooking,{scroll:false})
      return true
    }
    state.selectedBookingId=requestedBookingId
    switchTab('bookings')
    renderBookingDetail()
    setAdminStatus('That booking link could not be matched to the loaded bookings.',true)
    return false
  }
  const requestedReservationId=routeState.reservationId||''
  if(requestedReservationId){
    const requestedReservation=state.bookings.find(item=>String(item.id)===String(requestedReservationId))
    if(requestedReservation){
      openReservationManagementScreen(requestedReservation,{scroll:false})
      return true
    }
    state.selectedBookingId=requestedReservationId
    switchTab('reservations')
    renderReservationDetail()
    setAdminStatus('That reservation link could not be matched to the loaded reservations.',true)
    return false
  }
  if(routeState.serviceId){
    switchTab('services',{scrollToFocus})
    const requestedService=state.services.find(item=>String(item.id)===String(routeState.serviceId))
    if(requestedService)openServiceModal(requestedService)
    return Boolean(requestedService)
  }
  if(routeState.tab){
    switchTab(routeState.tab,{scrollToFocus})
    return true
  }
  return false
}

const getBookingInvoices=bookingId=>state.invoices.filter(invoice=>invoice.booking_id===bookingId)
const getBookingOfficeInvoices=bookingId=>state.officeInvoices.filter(invoice=>invoice.booking_id===bookingId)
const getBookingDiscounts=bookingId=>state.bookingDiscounts.filter(discount=>discount.booking_id===bookingId)
const getManualBookingDiscount=bookingId=>getBookingDiscounts(bookingId).find(discount=>normalizeText(discount.source_type)==='manual')||null
const getBookingDiscountTotal=bookingId=>sumAmounts(getBookingDiscounts(bookingId),'amount')
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
const getBookingAgentAssignment=bookingId=>state.bookingAgents.find(item=>item.booking_id===bookingId)
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
const getCustomerTimelineNotes=customer=>{
  const bookingNotes=getCustomerBookings(customer).flatMap(booking=>[
    ...getBookingNotes(booking.id).map(note=>({
      created_at:note.created_at,
      booking_reference:booking.reference,
      note:note.note,
      source:'Internal note'
    })),
    ...[
      booking.customer_notes||booking.notes
    ].filter(Boolean).map(note=>({
      created_at:booking.updated_at||booking.created_at,
      booking_reference:booking.reference,
      note,
      source:'Booking note'
    }))
  ])
  return sortByDateDesc(bookingNotes,'created_at')
}
const getPartnerRecord=(partnerType,partnerId)=>{
  const source=partnerType==='agent' ? state.agents : state.operators
  return source.find(item=>item.id===partnerId)||null
}
const getPartnerBookings=(partnerType,partnerId)=>{
  const matches=state.bookings.filter(booking=>{
    if(partnerType==='agent'){
      return String(getBookingAgentAssignment(booking.id)?.agent_id||'')===String(partnerId)
        || getBookingOfficeInvoices(booking.id).some(invoice=>String(invoice.agent_id||'')===String(partnerId))
    }
    return String(getBookingOperatorAssignment(booking.id)?.operator_id||'')===String(partnerId)
      || getBookingOfficeInvoices(booking.id).some(invoice=>String(invoice.operator_id||'')===String(partnerId))
  })
  return sortByDateDesc(matches,'preferred_date')
}
const getPartnerStatements=(partnerType,partnerId)=>sortByDateDesc(
  state.officeInvoices.filter(invoice=>String(partnerType==='agent' ? invoice.agent_id : invoice.operator_id||'')===String(partnerId)),
  'issued_at'
)
const getPartnerTypeLabel=partnerType=>partnerType==='agent' ? 'Selling Partner' : 'Operating Partner'
const getPartnerStatementLabel=(partnerType,invoice)=>{
  const invoiceType=normalizeText(invoice?.invoice_type||invoice?.payee_type||'statement')
  if(partnerType==='agent'){
    return invoiceType==='agent_commission' ? 'Agent commission statement' : formatDisplayLabel(invoice?.invoice_type||'statement')
  }
  return invoiceType==='supplier_payable' ? 'Supplier payable statement' : formatDisplayLabel(invoice?.invoice_type||'statement')
}
const buildPartnerSummary=(partnerType,partner)=>{
  const bookings=getPartnerBookings(partnerType,partner?.id)
  const statements=getPartnerStatements(partnerType,partner?.id)
  const outstandingStatements=statements.filter(invoice=>!['paid','settled','cancelled'].includes(normalizeText(invoice.status)))
  const outstandingAmount=sumAmounts(outstandingStatements,'total_amount')
  const settledAmount=sumAmounts(statements.filter(invoice=>['paid','settled'].includes(normalizeText(invoice.status))),'total_amount')
  return {
    bookings,
    statements,
    outstandingStatements,
    outstandingAmount,
    settledAmount,
    bookingRevenue:sumAmounts(bookings,'total_amount'),
    latestStatement:statements[0]||null,
    noShows:bookings.filter(booking=>normalizeText(booking.status)==='no_show').length,
    cancellations:bookings.filter(booking=>normalizeText(booking.status)==='cancelled').length
  }
}
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
const isTrashedBooking=booking=>Boolean(booking?.metadata?.trash?.archived_at||booking?.metadata?.deleted_at)
const matchesGlobalBrand=booking=>!state.activeBrandFilter||booking?.brand_code===state.activeBrandFilter
const isReviewReservation=booking=>['draft','pending'].includes(normalizeText(booking?.status))
const getTrashHistoryEntry=bookingId=>sortByDateDesc(
  state.statusHistory.filter(item=>item.booking_id===bookingId && normalizeText(item.to_status)==='cancelled' && /trash/i.test(String(item.reason||''))),
  'created_at'
)[0]
const getTrashRestoreHistory=bookingId=>sortByDateDesc(
  state.statusHistory.filter(item=>item.booking_id===bookingId && /restored from trash/i.test(String(item.reason||''))),
  'created_at'
)
const getTrashScope=booking=>{
  const explicitScope=normalizeText(booking?.metadata?.trash?.scope || booking?.metadata?.trash?.record_type)
  if(explicitScope)return explicitScope
  const originalStatus=normalizeText(booking?.metadata?.trash?.original_status)
  if(['draft','pending'].includes(originalStatus))return 'reservation'
  if(originalStatus)return 'booking'
  const historyEntry=getTrashHistoryEntry(booking?.id)
  if(['draft','pending'].includes(normalizeText(historyEntry?.from_status)))return 'reservation'
  return 'booking'
}
const getVisibleBookings=()=>state.bookings.filter(booking=>matchesGlobalBrand(booking))
const getReviewReservations=()=>getVisibleBookings().filter(booking=>isReviewReservation(booking)&&!isTrashedBooking(booking))
const getOperationalBookings=()=>getVisibleBookings().filter(booking=>!isReviewReservation(booking)&&!isTrashedBooking(booking))
const getTrashedReservations=()=>getVisibleBookings().filter(booking=>isTrashedBooking(booking)&&getTrashScope(booking)==='reservation')
const getTrashedOperationalBookings=()=>getVisibleBookings().filter(booking=>isTrashedBooking(booking)&&getTrashScope(booking)!=='reservation')
const getBookingById=bookingId=>state.bookings.find(item=>String(item.id)===String(bookingId))
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
const getStaffName=userId=>state.staffDirectory.find(item=>item.id===userId)?.full_name||state.adminUsers.find(item=>item.id===userId)?.full_name||''
const getAssignableConsultants=()=>{
  const seen=new Set()
  return [...state.staffDirectory,...state.adminUsers].filter(person=>{
    const id=String(person?.id||'').trim()
    const fullName=String(person?.full_name||'').trim()
    if(!id||!fullName||seen.has(id))return false
    seen.add(id)
    return true
  }).sort((left,right)=>String(left.full_name||'').localeCompare(String(right.full_name||'')))
}
const getBookingConsultantOwnerId=booking=>{
  const metadata=normalizeJsonRecord(booking?.metadata)
  return String(
    metadata.consultant_owner_id
    || normalizeJsonRecord(metadata.management).consultant_owner_id
    || booking?.updated_by
    || booking?.created_by
    || ''
  ).trim()
}
const getBookingConsultantOwnerName=booking=>{
  const ownerId=getBookingConsultantOwnerId(booking)
  return getStaffName(ownerId)||'Unassigned'
}
const resolveConsultantOwnerName=(ownerId,booking=null)=>{
  if(ownerId&&ownerId!=='unassigned'){
    return getStaffName(ownerId)||String(ownerId)
  }
  return booking ? getBookingConsultantOwnerName(booking) : 'Unassigned'
}
const getBookingPickupSummary=booking=>{
  const allocations=getBookingAllocations(booking.id)
  const allocationSummary=allocations.map(allocation=>[
    allocation.pickup_location,
    allocation.pickup_point,
    allocation.pickup_label,
    allocation.resource_name ? `${allocation.resource_name}${allocation.start_time ? ` @ ${allocation.start_time}` : ''}` : ''
  ].map(value=>String(value||'').trim()).filter(Boolean).join(' ')).filter(Boolean)
  if(allocationSummary.length)return allocationSummary.join(' / ')
  const metadata=normalizeJsonRecord(booking?.metadata)
  return String(
    metadata.pickup_location
    || metadata.pickup_point
    || metadata.pickup_notes
    || metadata.collection_point
    || ''
  ).trim() || 'Pending pickup confirmation'
}
const getBookingDropoffSummary=booking=>{
  const metadata=normalizeJsonRecord(booking?.metadata)
  return String(
    metadata.dropoff_location
    || metadata.drop_off
    || metadata.dropoff_notes
    || metadata.dropoff_point
    || ''
  ).trim() || 'Not captured'
}
const getBookingOperationalNotesSummary=booking=>{
  const metadata=normalizeJsonRecord(booking?.metadata)
  return [
    booking?.customer_notes,
    booking?.notes,
    metadata.customer_notes,
    metadata.special_notes,
    metadata.internal_notes
  ].map(value=>String(value||'').trim()).filter(Boolean)[0] || 'No notes captured.'
}

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

const getBookingCommercialMeta=booking=>normalizeJsonRecord(booking?.metadata?.commercials)
const getBookingManagementMeta=booking=>normalizeJsonRecord(booking?.metadata?.management)
const getBookingSellingModel=booking=>{
  const explicitModel=normalizeText(getBookingCommercialMeta(booking).selling_model)
  if(explicitModel)return explicitModel
  return getBookingAgentAssignment(booking?.id)?.agent_id ? 'gross_commission' : 'direct'
}
const getBookingBillToLabel=booking=>{
  const commercialMeta=getBookingCommercialMeta(booking)
  const companyName=String(commercialMeta.bill_to_company_name||'').trim()
  if(normalizeText(commercialMeta.bill_to_type)==='company' && companyName){
    return companyName
  }
  return booking?.customer_name || 'Guest'
}

const getInvoiceOutstandingAmount=invoice=>{
  if(invoice&&Object.prototype.hasOwnProperty.call(invoice,'balance_amount'))return Number(invoice.balance_amount||0)
  return Number(invoice?.total_amount||0)
}

const getDebtorName=invoice=>{
  const booking=getBookingById(invoice?.booking_id)
  if(booking)return getBookingBillToLabel(booking)
  return invoice?.customer_name || invoice?.customer_email || invoice?.invoice_number || 'Guest debtor'
}

const getLedgerTimingLabel=(value,outstandingAmount,status='')=>{
  const normalizedStatus=normalizeText(status)
  if(outstandingAmount<=0 || ['paid','settled','cancelled','refunded'].includes(normalizedStatus))return 'Settled'
  const ageDays=getAgeInDays(value)
  if(ageDays===null)return 'Timing not set'
  if(ageDays<=-1)return `${Math.abs(ageDays)}d to due`
  if(ageDays===0)return 'Due today'
  return `${ageDays}d overdue`
}

const getBookingAgentName=booking=>{
  const assignment=getBookingAgentAssignment(booking.id)
  if(assignment?.agent_id){
    const agent=state.agents.find(item=>item.id===assignment.agent_id)
    if(agent)return agent.company_name
  }
  const officeInvoice=getBookingOfficeInvoices(booking.id).find(invoice=>invoice.agent_id)
  if(officeInvoice)return getOfficeInvoicePartnerName(officeInvoice)
  return 'Direct'
}

const getBookingAgentAssignmentAmount=booking=>{
  const assignment=getBookingAgentAssignment(booking.id)
  if(assignment)return Number(assignment.commission_amount||0)
  return sumAmounts(getBookingOfficeInvoices(booking.id).filter(invoice=>invoice.agent_id),'commission_amount')
}

const getBookingAgentExposure=booking=>{
  const sellingModel=getBookingSellingModel(booking)
  const officeInvoiceAmount=sumAmounts(getBookingOfficeInvoices(booking.id).filter(invoice=>invoice.agent_id),'commission_amount')
  if(officeInvoiceAmount>0)return officeInvoiceAmount
  return sellingModel==='gross_commission' ? getBookingAgentAssignmentAmount(booking) : 0
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
  if(['cancelled','completed','refunded'].includes(status)||['cancelled','refunded'].includes(paymentStatus))return false
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
  if(key==='open')return !['cancelled','completed','refunded','failed'].includes(status)
  if(key==='finalised')return status==='completed'
  if(key==='cancelled')return status==='cancelled'
  if(['cancelled','completed','refunded'].includes(status)||['cancelled','refunded'].includes(paymentStatus))return false
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
    open:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'open')).length,
    finalised:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'finalised')).length,
    cancelled:operationalBookings.filter(booking=>bookingMatchesQuickFilter(booking,'cancelled')).length,
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
    {label:'Debtors outstanding',value:bookingAdminShared.formatMoney(sumAmounts(state.reconciliationRecords.map(item=>({amount:item.metadata?.guest_outstanding||0})),'amount'),state.settings.currency)},
    {label:'Creditors payable',value:bookingAdminShared.formatMoney(sumAmounts(state.reconciliationRecords.map(item=>({amount:item.metadata?.office_payables||0})),'amount'),state.settings.currency)}
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
  'reservation-trash':'bookings',
  'reservation-management':'bookings',
  bookings:'bookings',
  'booking-trash':'bookings',
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
  'reservation-trash':{view:'reservation-trash',permission:'bookings'},
  'reservation-management':{view:'reservation-management',permission:'bookings'},
  bookings:{view:'bookings',permission:'bookings'},
  'booking-trash':{view:'booking-trash',permission:'bookings'},
  payments:{view:'payments',permission:'payments'},
  refunds:{view:'refunds',permission:'finance'},
  customers:{view:'customers',permission:'customers'},
  services:{view:'services',permission:'services'},
  engine:{view:'engine',permission:'engine',focusId:'adminEnginePrimaryPanel'},
  resources:{view:'platform',permission:'engine',focusId:'adminPlatformPrimaryPanel'},
  rates:{view:'engine',permission:'engine',focusId:'adminEngineSecondaryPanel'},
  platform:{view:'platform',permission:'finance',focusId:'adminPlatformPrimaryPanel'},
  invoices:{view:'platform',permission:'finance',focusId:'adminPlatformPrimaryPanel'},
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

const collapseOtherSidebarSections=openSection=>{
  document.querySelectorAll('.admin-menu-section').forEach(section=>{
    if(section!==openSection)section.open=false
  })
}

const syncManagementActionHeaders=()=>{
  const shouldShow=window.scrollY>140
  document.querySelectorAll('.management-scroll-header').forEach(header=>{
    const view=String(header.dataset.managementView||'').trim()
    header.classList.toggle('is-visible',shouldShow && state.activeTab===view)
  })
}

const getPanelSwitcherTitle=(panel,index)=>{
  const explicit=String(panel.dataset.panelTitle||'').trim()
  if(explicit)return explicit
  const heading=panel.querySelector('h3')
  if(heading?.textContent?.trim())return heading.textContent.trim()
  return `Panel ${index+1}`
}

const renderPanelSwitcherGroup=container=>{
  if(!container)return
  const panels=[...container.children].filter(child=>child.classList?.contains('booking-panel'))
  if(panels.length!==2)return
  const groupId=container.dataset.switcherGroupId||''
  const switcher=container.querySelector('.panel-switcher')
  const requestedIndex=Number(state.panelSelections[groupId]??0)
  const activeIndex=requestedIndex>=0&&requestedIndex<panels.length ? requestedIndex : 0
  state.panelSelections[groupId]=activeIndex
  if(switcher){
    switcher.innerHTML=panels.map((panel,index)=>`
      <button
        class="panel-switcher-button${index===activeIndex ? ' is-active' : ''}"
        type="button"
        data-switcher-group="${bookingAdminShared.escapeHtml(groupId)}"
        data-switcher-index="${bookingAdminShared.escapeHtml(String(index))}"
        aria-pressed="${index===activeIndex ? 'true' : 'false'}"
      >
        ${bookingAdminShared.escapeHtml(getPanelSwitcherTitle(panel,index))}
      </button>
    `).join('')
  }
  panels.forEach((panel,index)=>{
    const isActive=index===activeIndex
    panel.hidden=!isActive
    panel.classList.toggle('is-active-switch-panel',isActive)
  })
}

const ensurePanelSwitchers=()=>{
  const groups=[...document.querySelectorAll('.admin-panel-grid')]
  groups.forEach((container,index)=>{
    if(container.classList.contains('admin-panel-grid-single'))return
    const panels=[...container.children].filter(child=>child.classList?.contains('booking-panel'))
    if(panels.length!==2)return
    if(!container.dataset.switcherGroupId){
      container.dataset.switcherGroupId=`panel-group-${index}`
    }
    container.classList.add('panel-switcher-group')
    let switcher=container.querySelector('.panel-switcher')
    if(!switcher){
      switcher=document.createElement('div')
      switcher.className='panel-switcher'
      switcher.setAttribute('role','tablist')
      switcher.setAttribute('aria-label','Panel switcher')
      switcher.addEventListener('click',event=>{
        const button=event.target.closest('[data-switcher-index]')
        if(!button)return
        state.panelSelections[container.dataset.switcherGroupId]=Number(button.dataset.switcherIndex||0)
        renderPanelSwitcherGroup(container)
      })
      container.prepend(switcher)
    }
    renderPanelSwitcherGroup(container)
  })
}

const showSwitcherPanel=(panel,index=0)=>{
  const container=panel?.closest('.panel-switcher-group')
  const groupId=container?.dataset.switcherGroupId||''
  if(!container||!groupId)return
  state.panelSelections[groupId]=index
  renderPanelSwitcherGroup(container)
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

const switchTab=(tab,{scrollToFocus=true}={})=>{
  const nextTab=getTabRoute(tab).permission && !canAccess(getTabRoute(tab).permission)
    ? (nodes.tabs.find(node=>!node.hidden)?.dataset.adminTab||'dashboard')
    : tab
  if(nextTab!=='services'&&state.isServiceModalOpen)closeServiceModal()
  state.activeTab=nextTab
  const route=getTabRoute(nextTab)
  const isReservationManagement=nextTab==='reservation-management'
  nodes.tabs.forEach(node=>node.classList.toggle('is-active',node.dataset.adminTab===nextTab || (isReservationManagement&&node.dataset.adminTab==='reservations')))
  nodes.views.forEach(node=>node.classList.toggle('is-active',node.dataset.adminView===route.view))
  const activeMenuItem=nodes.tabs.find(node=>(node.dataset.adminTab===nextTab || (isReservationManagement&&node.dataset.adminTab==='reservations'))&&!node.hidden)
  const activeSection=activeMenuItem?.closest('details')
  document.querySelectorAll('.admin-menu-section').forEach(section=>{
    section.open=section===activeSection
  })
  syncAdminRouteState({
    tab:nextTab,
    serviceId:nextTab==='services' ? state.selectedServiceId : '',
    bookingId:nextTab==='bookings' ? state.selectedBookingId : '',
    reservationId:(nextTab==='reservations'||nextTab==='reservation-management') ? state.selectedBookingId : ''
  })
  renderModuleChrome(nextTab)
  if(!document.body.classList.contains('is-booking-record-page')){
    renderEngineWorkbench()
    renderPlatformWorkbench()
    ensurePanelSwitchers()
  }
  if(nextTab==='invoices')showSwitcherPanel(nodes.platformPrimaryPanel,0)
  syncManagementActionHeaders()
  closeMobileSidebar()
  if(scrollToFocus&&route.focusId){
    window.setTimeout(()=>document.getElementById(route.focusId)?.scrollIntoView?.({behavior:'smooth',block:'start'}),90)
  }
}

const requireClient=async()=>{
  if(!bookingAdminShared.createSupabaseClient)throw new Error('Supabase browser client is not configured.')
  return bookingAdminShared.createSupabaseClient()
}

const renderSession=()=>{
  const authenticated=Boolean(state.session?.access_token)
  const bookingRecordLoading=authenticated&&isBookingRecordMode()&&!document.body.classList.contains('is-booking-record-ready')
  if(!bookingRecordLoading&&!document.body.classList.contains('is-booking-record-page'))showAdminSessionLoader()
  if(nodes.authGate)nodes.authGate.hidden=authenticated
  if(nodes.appShell)nodes.appShell.hidden=!authenticated||bookingRecordLoading
  if(nodes.loadingScreen)nodes.loadingScreen.hidden=authenticated&&!bookingRecordLoading
  if(bookingRecordLoading)showBookingRecordLoader()
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
    if(agentId){
      const agentAssignment=getBookingAgentAssignment(booking.id)
      const hasAgentMatch=String(agentAssignment?.agent_id||'')===agentId
        || getBookingOfficeInvoices(booking.id).some(invoice=>String(invoice.agent_id||'')===agentId)
      if(!hasAgentMatch)return false
    }
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

const renderReservationPipeline=()=>{
  if(!nodes.reservationPipeline)return
  const visible=getVisibleBookings().filter(booking=>!isTrashedBooking(booking))
  const stages=[
    {key:'new',label:'New Reservation',count:visible.filter(booking=>isReviewReservation(booking)).length,tone:'review'},
    {key:'awaiting',label:'Awaiting Payment',count:visible.filter(booking=>normalizeText(booking.status)==='awaiting_payment').length,tone:'warn'},
    {key:'paid',label:'Paid',count:visible.filter(booking=>normalizeText(booking.payment_status)==='paid'&&!['confirmed','completed'].includes(normalizeText(booking.status))).length,tone:'paid'},
    {key:'confirmed',label:'Confirmed',count:visible.filter(booking=>normalizeText(booking.status)==='confirmed').length,tone:'good'},
    {key:'completed',label:'Completed',count:visible.filter(booking=>normalizeText(booking.status)==='completed').length,tone:'done'}
  ]
  nodes.reservationPipeline.innerHTML=`
    <div class="pipeline-heading">
      <div>
        <span class="booking-chip">${state.activeBrandFilter ? getBrandName(state.activeBrandFilter) : 'All brands'}</span>
        <h3>Reservation Pipeline</h3>
      </div>
      <small>New Reservation -> Awaiting Payment -> Paid -> Confirmed -> Completed</small>
    </div>
    <div class="pipeline-track">
      ${stages.map(stage=>`
        <button class="pipeline-stage is-${bookingAdminShared.escapeHtml(stage.tone)}" type="button" data-pipeline-stage="${bookingAdminShared.escapeHtml(stage.key)}">
          <span>${bookingAdminShared.escapeHtml(stage.label)}</span>
          <strong>${bookingAdminShared.escapeHtml(String(stage.count))}</strong>
        </button>
      `).join('')}
    </div>
  `
}

const renderDashboard=()=>{
  const todayKey=getTodayKey()
  const tomorrowDate=new Date(`${todayKey}T00:00:00`)
  tomorrowDate.setDate(tomorrowDate.getDate()+1)
  const tomorrowKey=tomorrowDate.toISOString().slice(0,10)
  const brandMap=new Map(state.brands.map(brand=>[brand.code,brand.name]))
  const dashboardBookings=getVisibleBookings().filter(booking=>!isTrashedBooking(booking))
  const totalRevenue=dashboardBookings.reduce((sum,booking)=>sum+Number(booking.total_amount||0),0)
  const todayArrivals=dashboardBookings.filter(booking=>sameDate(booking.preferred_date,todayKey))
  const tomorrowPrep=dashboardBookings.filter(booking=>sameDate(booking.preferred_date,tomorrowKey))
  const pendingConfirmations=dashboardBookings.filter(item=>item.status==='pending')
  const unpaidBookings=dashboardBookings.filter(item=>['pending','unpaid','partially_paid','authorized'].includes(String(item.payment_status||'')) || Number(item.amount_due_later||0)>0)
  const unpaidExposure=unpaidBookings.reduce((sum,booking)=>sum+Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0),0)
  const refundExposure=sumAmounts(state.refunds,'amount')
  const operatorPayoutsDue=state.officeInvoices.filter(invoice=>!['paid','settled','cancelled'].includes(String(invoice.status||'').toLowerCase()))
  const payoutExposure=sumAmounts(operatorPayoutsDue,'total_amount')
  const openTasks=state.bookingTasks.filter(task=>String(task.status||'')==='open')
  const alerts=buildOperationalAlerts()
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
    value:String(dashboardBookings.filter(item=>item.brand_code===brand.code).length),
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
  if(nodes.dashboardActionQueue){
    nodes.dashboardActionQueue.innerHTML=actionQueue.map(item=>`
      <article class="queue-card is-${bookingAdminShared.escapeHtml(item.tone||'neutral')}">
        <div>
          <strong>${bookingAdminShared.escapeHtml(String(item.value))}</strong>
          <span>${bookingAdminShared.escapeHtml(item.label)}</span>
        </div>
        <p>${bookingAdminShared.escapeHtml(item.meta)}</p>
      </article>
    `).join('')
  }
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
  if(state.activeTab!=='reservation-management')renderReservationDetail()
}

const renderReservationDetail=()=>{
  if(!nodes.reservationDetail)return
  const booking=getBookingById(state.selectedBookingId)
  const shouldPreserveScroll=state.activeTab==='reservation-management'
    && Boolean(nodes.reservationDetail.querySelector('.reservation-management-shell'))
  const viewportSnapshot=shouldPreserveScroll ? captureAdminViewport() : null
  if(!booking){
    nodes.reservationDetail.innerHTML='<div class="empty-state"><strong>Select a reservation</strong><span>Open a reservation from the review table to inspect guest details, add missing information, and decide what happens next.</span></div>'
    syncManagementActionHeaders()
    restoreAdminViewport(viewportSnapshot)
    return
  }
  if(!isReviewReservation(booking)){
    nodes.reservationDetail.innerHTML=`
      <div class="empty-state">
        <strong>This reservation is no longer waiting for review.</strong>
        <span>It has already moved forward in the booking lifecycle. Open the booking workspace to continue managing it.</span>
        <div class="detail-actions">
          <button type="button" data-reservation-nav="back">Back to reservations</button>
          <button type="button" data-reservation-nav="booking-workspace">Open booking workspace</button>
        </div>
      </div>
    `
    syncManagementActionHeaders()
    restoreAdminViewport(viewportSnapshot)
    return
  }
  const qualityChecks=[
    {label:'Guest name',done:Boolean(booking.customer_name)},
    {label:'Phone',done:Boolean(booking.customer_phone)},
    {label:'Email',done:Boolean(booking.customer_email)},
    {label:'Tour',done:Boolean(booking.service_name)},
    {label:'Date',done:Boolean(booking.preferred_date)},
    {label:'Pax',done:Number(booking.quantity||0)>0},
    {label:'Guide assigned',done:Boolean(booking.guide_name||booking.metadata?.guide_name)},
    {label:'Pickup / notes',done:Boolean(booking.customer_notes||booking.notes||booking.metadata?.pickup_location)},
    {label:'Price',done:Number(booking.total_amount||0)>0}
  ]
  const submittedDetailRows=buildSubmittedBookingDetailRows(booking)
  nodes.reservationDetail.innerHTML=`
    <div class="booking-detail-shell reservation-management-shell">
      <div class="management-scroll-header" data-management-view="reservation-management">
        <div class="management-scroll-header-inner">
          <strong>${bookingAdminShared.escapeHtml(booking.reference)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
          <div class="management-scroll-header-actions">
            <button type="button" data-reservation-nav="back">Back</button>
            <button type="button" data-reservation-action="edit">Edit</button>
            <button type="button" class="is-danger-action" data-reservation-action="delete">Delete</button>
            <button type="button" class="is-primary-action" data-reservation-action="accept">Accept</button>
          </div>
        </div>
      </div>
      <div class="booking-detail-main">
        <section class="booking-management-hero reservation-screen-shell">
          <div>
            <span class="booking-chip">Reservation management</span>
            <h3>${bookingAdminShared.escapeHtml(booking.reference)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</h3>
            <p>Review the guest request, complete any missing information, and decide whether this reservation should move into the live booking workspace.</p>
          </div>
          <nav class="booking-management-nav reservation-management-nav" aria-label="Reservation management navigation">
            <button type="button" data-reservation-nav="back">Back to reservations</button>
            <div class="reservation-decision-actions" role="group" aria-label="Reservation decisions">
              <button type="button" data-reservation-action="edit">Edit details</button>
              <button type="button" class="is-primary-action" data-reservation-action="accept">Accept reservation</button>
              <button type="button" class="is-danger-action" data-reservation-action="delete">Delete reservation</button>
            </div>
          </nav>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Reservation overview</h4>
              <p class="muted-copy">The core guest and trip information captured from the intake form.</p>
            </div>
            <div class="badge-stack">
              ${renderBrandPill(booking.brand_code)}
              ${renderStatusBadge(booking.status,'Needs review')}
            </div>
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
              <strong>${(()=>{const a=Number(booking.adult_quantity||0);const c=Number(booking.child_quantity||0);return bookingAdminShared.escapeHtml(a+c>0?`${booking.quantity||a+c} (${a}A / ${c}C)`:String(booking.quantity||1))})()}</strong>
            </article>
            <article class="detail-card">
              <span>Total</span>
              <strong>${bookingAdminShared.formatMoney(booking.total_amount,booking.currency||state.settings.currency)}</strong>
            </article>
          </div>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Guest details</h4>
              <p class="muted-copy">Captured guest identity, contact data, notes, and booking source.</p>
            </div>
          </div>
          <div class="detail-grid detail-grid-strong">
            <div><span>Guest</span><strong>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong></div>
            <div><span>Email</span><strong>${bookingAdminShared.escapeHtml(booking.customer_email||'No email captured')}</strong></div>
            <div><span>Phone</span><strong>${bookingAdminShared.escapeHtml(booking.customer_phone||'No phone captured')}</strong></div>
            <div><span>Source</span><strong>${bookingAdminShared.escapeHtml(formatSourceLabel(booking.source||booking.metadata?.source||'website'))}</strong></div>
            <div><span>Submitted</span><strong>${bookingAdminShared.escapeHtml(formatDateTimeLabel(booking.created_at))}</strong></div>
            <div><span>Payment state</span><strong>${bookingAdminShared.escapeHtml(formatDisplayLabel(booking.payment_status||'pending'))}</strong></div>
          </div>
          <p class="admin-inline-copy">${bookingAdminShared.escapeHtml(booking.customer_notes||booking.notes||'No guest notes or pickup instructions were captured yet.')}</p>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Submitted booking form details</h4>
              <p class="muted-copy">Every captured field from the guest booking form is shown here before acceptance.</p>
            </div>
          </div>
          <div class="detail-grid detail-grid-strong reservation-form-details-grid">
            ${submittedDetailRows.map(row=>`
              <div>
                <span>${bookingAdminShared.escapeHtml(row.label)}</span>
                <strong>${bookingAdminShared.escapeHtml(row.value)}</strong>
              </div>
            `).join('') || '<div class="detail-helper-copy">No submitted booking form details were captured.</div>'}
          </div>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Reservation quality check</h4>
              <p class="muted-copy">Anything marked missing should ideally be resolved before acceptance.</p>
            </div>
          </div>
          <div class="quality-check-grid">
            ${qualityChecks.map(check=>`
              <span class="quality-check ${check.done ? 'is-done' : 'is-missing'}">${bookingAdminShared.escapeHtml(check.done ? 'OK' : 'Missing')} ${bookingAdminShared.escapeHtml(check.label)}</span>
            `).join('')}
          </div>
        </section>
      </div>

      <aside class="booking-detail-rail">
        <div class="sticky-actions reservation-side-actions">
          <span class="booking-chip">Decision desk</span>
          <button class="booking-button" type="button" data-reservation-action="accept">Accept reservation</button>
          <button class="booking-button ghost" type="button" data-reservation-action="edit">Edit details</button>
          <button class="booking-button ghost danger" type="button" data-reservation-action="delete">Delete reservation</button>
        </div>
      </aside>
    </div>
  `
  syncManagementActionHeaders()
  restoreAdminViewport(viewportSnapshot)
}

const getRecordPageUrl=(tab,recordId)=>{
  const url=new URL(window.location.href)
  url.searchParams.set('tab',tab)
  url.searchParams.delete('service')
  if(tab==='reservations'){
    url.searchParams.set('reservation',recordId)
    url.searchParams.delete('booking')
    url.searchParams.delete('view')
  }else{
    url.searchParams.set('booking',recordId)
    url.searchParams.set('view','booking')
    url.searchParams.delete('reservation')
  }
  return `${url.pathname}${url.search}${url.hash}`
}

const getBookingChangelogPageUrl=bookingId=>{
  const url=new URL('booking-changelog.html',window.location.href)
  url.searchParams.set('booking',bookingId)
  return `${url.pathname}${url.search}${url.hash}`
}

const openBookingChangelogPage=bookingId=>{
  if(!bookingId)return
  const opened=window.open(getBookingChangelogPageUrl(bookingId),'_blank','noopener')
  try{ if(opened)opened.opener=null }catch{}
}

const renderBookings=()=>{
  const filtered=getFilteredBookings()
  updateBookingQuickFilterBar()
  nodes.bookingsTable.innerHTML=filtered.map(booking=>{
    const bookingUrl=getRecordPageUrl('bookings',booking.id)
    return `
    <tr class="booking-row is-${bookingAdminShared.escapeHtml(normalizeBrandClass(booking.brand_code))}${booking.id===state.selectedBookingId ? ' is-selected' : ''}" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
      <td>
        <strong><a class="table-primary-link" href="${htmlAttribute(bookingUrl)}" target="_blank" rel="noopener noreferrer">${bookingAdminShared.escapeHtml(booking.reference)}</a></strong>
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
  `
  }).join('') || renderEmptyRow(7,'No bookings match the current filters.')
}

const filterTrashRows=(rows,{search='',archivedBy=''})=>{
  const searchTerm=String(search||'').trim().toLowerCase()
  const archivedByTerm=String(archivedBy||'').trim().toLowerCase()
  return rows.filter(booking=>{
    const trashMeta=booking?.metadata?.trash||{}
    const archivedByLabel=(getStaffName(trashMeta.archived_by)||String(trashMeta.archived_by||'')).toLowerCase()
    const haystack=[
      booking.reference,
      booking.customer_name,
      booking.customer_email,
      booking.service_name,
      trashMeta.reason,
      trashMeta.original_status,
      archivedByLabel
    ].join(' ').toLowerCase()
    if(searchTerm&&!haystack.includes(searchTerm))return false
    if(archivedByTerm&&!archivedByLabel.includes(archivedByTerm))return false
    return true
  })
}

const renderTrashRows=(rows,emptyMessage)=>rows.map(booking=>{
  const trashMeta=booking?.metadata?.trash||{}
  const restoredHistory=getTrashRestoreHistory(booking.id)
  const archivedBy=getStaffName(trashMeta.archived_by)||String(trashMeta.archived_by||'System')
  const historyParts=[
    `Archived by ${archivedBy}`,
    trashMeta.original_status ? `Was ${formatDisplayLabel(trashMeta.original_status)}` : '',
    restoredHistory.length ? `Restored ${restoredHistory.length}x` : 'Not yet restored'
  ].filter(Boolean)
  return `
    <tr class="booking-row is-${bookingAdminShared.escapeHtml(normalizeBrandClass(booking.brand_code))}" data-trash-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
        <div class="table-subline">${renderStatusBadge(booking.status)}</div>
      </td>
      <td>${renderBrandPill(booking.brand_code)}</td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(booking.customer_email||booking.customer_phone||'')}</div>
      </td>
      <td>${bookingAdminShared.escapeHtml(booking.service_name||'')}</td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(formatDateTimeLabel(trashMeta.archived_at||booking.metadata?.deleted_at||booking.updated_at))}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(booking.metadata?.trash?.reason||booking.cancellation_reason||'Archived by admin')}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(historyParts.join(' | '))}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(restoredHistory[0]?.created_at ? `Last restore ${formatDateTimeLabel(restoredHistory[0].created_at)}` : 'Restore history will appear here.')}</div>
      </td>
      <td><button class="booking-button ghost compact-button" type="button" data-trash-action="restore" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">Restore</button></td>
    </tr>
  `
}).join('') || renderEmptyRow(7,emptyMessage)

const renderReservationTrash=()=>{
  if(!nodes.reservationTrashTable)return
  const trashed=filterTrashRows(
    getTrashedReservations().sort((left,right)=>(parseDateValue(right.metadata?.trash?.archived_at||right.metadata?.deleted_at)?.getTime()||0)-(parseDateValue(left.metadata?.trash?.archived_at||left.metadata?.deleted_at)?.getTime()||0)),
    {
      search:nodes.reservationTrashSearch?.value||'',
      archivedBy:nodes.reservationTrashArchivedBy?.value||''
    }
  )
  nodes.reservationTrashTable.innerHTML=renderTrashRows(trashed,'No reservations are in trash. Nothing is physically deleted from SkyBook.')
}

const renderBookingTrash=()=>{
  if(!nodes.bookingTrashTable)return
  const trashed=filterTrashRows(
    getTrashedOperationalBookings().sort((left,right)=>(parseDateValue(right.metadata?.trash?.archived_at||right.metadata?.deleted_at)?.getTime()||0)-(parseDateValue(left.metadata?.trash?.archived_at||left.metadata?.deleted_at)?.getTime()||0)),
    {
      search:nodes.bookingTrashSearch?.value||'',
      archivedBy:nodes.bookingTrashArchivedBy?.value||''
    }
  )
  nodes.bookingTrashTable.innerHTML=renderTrashRows(trashed,'No bookings are in trash. Nothing is physically deleted from SkyBook.')
}

const renderBookingDetail=()=>{
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  const brandName=state.brands.find(brand=>brand.code===booking?.brand_code)?.name||booking?.brand_code||''
  const sourceLabel=formatSourceLabel(booking?.source||booking?.metadata?.source||'website')
  const capturePage=String(booking?.metadata?.source_page||'').trim() || 'Not captured'
  const createdVia=formatDisplayLabel(booking?.metadata?.created_via||'website')
  if(!booking){
    if(document.body.classList.contains('is-booking-record-page')){
      setAdminDocumentTitle('Booking not found')
    }else{
      setAdminDocumentTitle()
    }
    nodes.bookingDetail.innerHTML='<p class="muted-copy">Choose a booking to review, edit, or change status.</p>'
    syncManagementActionHeaders()
    return
  }
  if(document.body.classList.contains('is-booking-record-page')){
    setAdminDocumentTitle(getBookingDocumentLabel(booking))
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
  const discounts=getBookingDiscounts(booking.id)
  const manualDiscount=getManualBookingDiscount(booking.id)
  const discountTotal=getBookingDiscountTotal(booking.id)
  const documentVersions=getBookingDocumentVersions(booking.id)
  const portalRequests=getBookingPortalRequests(booking.id)
  const portalSessions=getBookingPortalSessions(booking.id)
  const allocations=getBookingAllocations(booking.id)
  const commercialMeta=getBookingCommercialMeta(booking)
  const sellingModel=getBookingSellingModel(booking)
  const agentAssignment=getBookingAgentAssignment(booking.id)
  const operatorAssignment=getBookingOperatorAssignment(booking.id)
  const reconciliationRecord=getBookingReconciliationRecord(booking.id)
  const operatorCommission=getBookingOperatorCommission(booking)
  const agentCommission=getBookingAgentExposure(booking)
  const agentAssignmentAmount=getBookingAgentAssignmentAmount(booking)
  const guestBalance=Number(invoice?.balance_amount ?? (Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0)))
  const officeExposure=sumAmounts(officeInvoices,'total_amount')
  const internalMargin=Number((Number(booking.total_amount||0)-agentCommission-operatorCommission).toFixed(2))
  const operatorOptions=state.operators.map(operator=>`<option value="${bookingAdminShared.escapeHtml(operator.id)}" ${operatorAssignment?.operator_id===operator.id ? 'selected' : ''}>${bookingAdminShared.escapeHtml(operator.company_name)}</option>`).join('')
  const agentOptions=state.agents.map(agent=>`<option value="${bookingAdminShared.escapeHtml(agent.id)}" ${agentAssignment?.agent_id===agent.id ? 'selected' : ''}>${bookingAdminShared.escapeHtml(agent.company_name)}</option>`).join('')
  const consultantOptions=getAssignableConsultants().map(person=>`<option value="${bookingAdminShared.escapeHtml(person.id)}" ${getBookingConsultantOwnerId(booking)===person.id ? 'selected' : ''}>${bookingAdminShared.escapeHtml(person.full_name)}</option>`).join('')
  const openTasks=tasks.filter(task=>String(task.status||'')==='open')
  const checklist=getBookingChecklist(booking)
  const lastChangedBy=(booking.updated_by ? getStaffName(booking.updated_by) : '') || 'System'
  const noteTemplates=(state.opsTemplates?.internalNoteTemplates||[]).slice(0,3)
  const bookingAlerts=buildOperationalAlerts().filter(alert=>alert.booking_id===booking.id || alert.reference===booking.reference)
  const customFieldValues=getBookingCustomFieldValues(booking)
  const customFieldRows=getActiveBookingFormFields(booking.brand_code).map(field=>({
    label:field.label,
    value:field.type==='checkbox'
      ? (customFieldValues[field.id] ? 'Yes' : 'No')
      : String(customFieldValues[field.id] ?? '').trim()
  })).filter(item=>item.value)
  const canRecordPayments=canAccess('payments')
  const canIssueClientInvoices=canAccess('finance')
  const isFinalised=normalizeText(booking.status)==='completed'
  const paymentLinkMeta=getBookingPaymentLinkMeta(booking)
  const bookingPaymentLink=getBookingPaymentLink(booking)
  const paymentLinkGeneratedAt=normalizeText(paymentLinkMeta.generated_at)
  const functionsCollapsed=state.bookingFunctionsCollapsed===true
  nodes.bookingDetail.innerHTML=`
    <div class="booking-detail-shell booking-screen-shell">
      <div class="management-scroll-header" data-management-view="bookings">
        <div class="management-scroll-header-inner">
          <strong>${bookingAdminShared.escapeHtml(booking.reference)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</strong>
          <div class="management-scroll-header-actions">
            <button type="button" data-booking-inline-action="toggle-functions" data-loading-exempt="true">${functionsCollapsed ? 'Open Functions' : 'Booking Functions'}</button>
          </div>
        </div>
      </div>
      <div class="booking-detail-main">
        <section class="booking-management-hero">
          <div>
            <span class="booking-chip">Management workspace</span>
            <h3>${bookingAdminShared.escapeHtml(booking.reference)} · ${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</h3>
          </div>
          <nav class="booking-management-nav" aria-label="Booking management navigation">
            <a href="#booking-notification-panel">Notifications</a>
            <a href="#booking-guest-service-panel">Details</a>
            <a href="#booking-finance-panel">Finance</a>
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

        <section class="detail-section" id="booking-guest-service-panel">
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
            <div><span>Guests</span><strong>${(()=>{const a=Number(booking.adult_quantity||0);const c=Number(booking.child_quantity||0);return bookingAdminShared.escapeHtml(a+c>0?`${booking.quantity||a+c} (${a}A / ${c}C)`:String(booking.quantity||1))})()}</strong></div>
            <div><span>Source</span><strong>${bookingAdminShared.escapeHtml(sourceLabel)}</strong></div>
            <div><span>Capture page</span><strong>${bookingAdminShared.escapeHtml(capturePage)}</strong></div>
            <div><span>Created via</span><strong>${bookingAdminShared.escapeHtml(createdVia)}</strong></div>
          </div>
          ${customFieldRows.length ? `
            <div class="detail-grid detail-grid-strong admin-spacer">
              ${customFieldRows.map(item=>`<div><span>${bookingAdminShared.escapeHtml(item.label)}</span><strong>${bookingAdminShared.escapeHtml(item.value)}</strong></div>`).join('')}
            </div>
          ` : ''}
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Commercial structure</h4>
              <p class="muted-copy">Track who we invoice, who earns commission on the booking, and what margin remains after partner exposure.</p>
            </div>
          </div>
          <div class="detail-subgrid">
            <article class="detail-card">
              <span>Bill to</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingBillToLabel(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml(normalizeText(commercialMeta.bill_to_type)==='company' ? 'Company account / trade billing' : 'Guest direct billing')}</p>
            </article>
            <article class="detail-card">
              <span>Selling partner</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingAgentName(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml(sellingModel==='gross_commission' ? `Gross commission ${bookingAdminShared.formatMoney(agentAssignmentAmount,booking.currency||state.settings.currency)}` : sellingModel==='net_rate' ? 'Net rate / reseller pricing' : 'Direct booking with no selling partner payout')}</p>
            </article>
            <article class="detail-card">
              <span>Operating partner</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml(operatorCommission>0 ? `Supplier payout ${bookingAdminShared.formatMoney(operatorCommission,booking.currency||state.settings.currency)}` : 'No assisting operator payout linked yet.')}</p>
            </article>
            <article class="detail-card">
              <span>Internal margin</span>
              <strong>${bookingAdminShared.formatMoney(internalMargin,booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml('Booking total less agent commission and operator payout.')}</p>
            </article>
            <article class="detail-card">
              <span>Booking discount</span>
              <strong>${bookingAdminShared.formatMoney(discountTotal,booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(manualDiscount ? `${formatDisplayLabel(manualDiscount.discount_type||'fixed')} ${manualDiscount.discount_value||manualDiscount.amount} - ${manualDiscount.consultant_comment||'No comment captured'}` : 'No consultant discount applied.')}</p>
            </article>
            <article class="detail-card">
              <span>Consultant owner</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingConsultantOwnerName(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml('Used for manager productivity and turnover reporting.')}</p>
            </article>
          </div>
          <form class="booking-inline-form booking-inline-form-wide" data-inline-form="commercial-structure">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <label class="booking-field">
              <span>Bill To</span>
              <select name="bill_to_type">
                <option value="guest" ${normalizeText(commercialMeta.bill_to_type)!=='company' ? 'selected' : ''}>Guest</option>
                <option value="company" ${normalizeText(commercialMeta.bill_to_type)==='company' ? 'selected' : ''}>Company</option>
              </select>
            </label>
            <label class="booking-field">
              <span>Billing Company</span>
              <input name="bill_to_company_name" type="text" value="${bookingAdminShared.escapeHtml(normalizeText(commercialMeta.bill_to_company_name))}" placeholder="Corporate client / hotel / reseller">
            </label>
            <label class="booking-field">
              <span>Selling Model</span>
              <select name="selling_model">
                <option value="direct" ${sellingModel==='direct' ? 'selected' : ''}>Direct</option>
                <option value="gross_commission" ${sellingModel==='gross_commission' ? 'selected' : ''}>Gross Commission</option>
                <option value="net_rate" ${sellingModel==='net_rate' ? 'selected' : ''}>Net Rate</option>
              </select>
            </label>
            <label class="booking-field-full">
              <span>Selling Partner</span>
              <select name="agent_id">
                <option value="">No selling partner</option>
                ${agentOptions}
              </select>
            </label>
            <label class="booking-field">
              <span>Commission / Partner Amount</span>
              <input name="agent_commission_amount" type="number" min="0" step="0.01" value="${bookingAdminShared.escapeHtml(String(agentAssignmentAmount||''))}" placeholder="0.00">
            </label>
            <div class="detail-callout">
              <strong>How this behaves</strong>
              <p class="detail-helper-copy">${bookingAdminShared.escapeHtml(sellingModel==='gross_commission' ? 'SkyBook will treat the partner amount as commission payable to the selling company once the booking is confirmed.' : sellingModel==='net_rate' ? 'SkyBook stores this as a commercial flag for reseller / trade pricing without auto-creating a commission payable.' : 'Direct bookings do not create a selling partner payable.')}</p>
            </div>
            <div class="detail-inline-actions">
              <button class="booking-button" type="submit">Save Commercial Structure</button>
            </div>
          </form>
          <form class="booking-inline-form booking-inline-form-wide" data-inline-form="booking-discount">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <label class="booking-field">
              <span>Discount Type</span>
              <select name="discount_type">
                <option value="percentage" ${normalizeText(manualDiscount?.discount_type)!=='fixed' ? 'selected' : ''}>Percentage</option>
                <option value="fixed" ${normalizeText(manualDiscount?.discount_type)==='fixed' ? 'selected' : ''}>Fixed Amount</option>
              </select>
            </label>
            <label class="booking-field">
              <span>Discount Value</span>
              <input name="discount_value" type="number" min="0" step="0.01" value="${bookingAdminShared.escapeHtml(String(manualDiscount?.discount_value||''))}" placeholder="10 or 250.00">
            </label>
            <label class="booking-field-full">
              <span>Consultant Comment</span>
              <textarea name="consultant_comment" rows="3" placeholder="Reason for discount, approval note, or guest-care context" required>${bookingAdminShared.escapeHtml(manualDiscount?.consultant_comment||'')}</textarea>
            </label>
            <div class="detail-inline-actions">
              <button class="booking-button" type="submit">Apply Discount</button>
              ${manualDiscount ? '<button class="booking-button ghost" type="button" data-booking-inline-action="clear-discount">Clear Discount</button>' : ''}
            </div>
          </form>
        </section>

        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Internal ownership</h4>
              <p class="muted-copy">Assign a consultant when needed so manager reporting can track productivity and turnover without making ownership mandatory.</p>
            </div>
            <div class="booking-chip">Manager reporting</div>
          </div>
          <form class="booking-inline-form" data-inline-form="ownership">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <label class="booking-field-full">
              <span>Consultant owner</span>
              <select name="consultant_owner_id">
                <option value="">Unassigned</option>
                ${consultantOptions}
              </select>
            </label>
            <div class="detail-callout">
              <strong>Current owner</strong>
              <p class="detail-helper-copy">${bookingAdminShared.escapeHtml(getBookingConsultantOwnerName(booking))}</p>
            </div>
            <div class="detail-inline-actions">
              <button class="booking-button" type="submit">Save Ownership</button>
            </div>
          </form>
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

        <section class="detail-section" id="booking-documents-panel">
          <div class="section-heading">
            <div>
              <h4>Documents and communications</h4>
              <p class="muted-copy">Guest invoice, receipts, manifests, vouchers, office settlements, and stored booking documents.</p>
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
              <p>${isFinalised ? (memories.length ? `${memories.length} private image${memories.length===1 ? '' : 's'} ready for reference ${bookingAdminShared.escapeHtml(booking.reference)}.` : 'Upload guest images here so only this booking reference can unlock them.') : 'Tour memories unlock after the booking is finalised.'}</p>
            </article>
          </div>
          ${isFinalised ? `<div class="memory-admin-panel">
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
          </div>` : `
          <div class="memory-admin-panel">
            <div>
              <span class="booking-chip">Finalised bookings only</span>
              <h5>Tour memories are locked</h5>
              <p class="muted-copy">Finalise the booking before uploading the private guest gallery.</p>
            </div>
          </div>`}
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
                ].map(item=>`
                  <tr>
                    <td>${bookingAdminShared.escapeHtml(item.label)}</td>
                    <td>${bookingAdminShared.escapeHtml(item.type)}</td>
                    <td>${renderStatusBadge(item.status)}</td>
                    <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(item.when))}</td>
                    <td>${item.actions||''}</td>
                  </tr>
                `).join('') || renderEmptyRow(5,'No documents have been logged yet.')}
              </tbody>
            </table>
          </div>
        </section>
      </div>

      <aside class="booking-detail-rail">
        <section class="booking-function-sidebar booking-functions-menu detail-actions sticky-actions ${functionsCollapsed ? 'is-collapsed' : ''}" aria-label="Booking functions">
          <button class="booking-function-sidebar-toggle" type="button" data-booking-inline-action="toggle-functions" data-loading-exempt="true" aria-expanded="${functionsCollapsed ? 'false' : 'true'}">
            <span>
              <small>Booking menu</small>
              <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
            </span>
            <span class="booking-function-toggle-copy">${functionsCollapsed ? 'Open' : 'Collapse'}</span>
          </button>
          <div class="booking-function-sidebar-body" ${functionsCollapsed ? 'hidden' : ''}>
            <div class="booking-function-status">
              ${renderStatusBadge(booking.status)}
              ${renderStatusBadge(booking.payment_status,'Payment ' + String(booking.payment_status||'').replace(/_/g,' '))}
            </div>
            <div class="booking-function-group">
              <button type="button" data-booking-inline-action="edit-booking">Edit Booking Details</button>
              <button type="button" data-booking-inline-action="generate-payment-link">Generate Payment Link</button>
              ${bookingPaymentLink ? '<button type="button" data-booking-inline-action="copy-payment-link">Copy Payment Link</button>' : ''}
              ${canRecordPayments ? '<button type="button" data-booking-inline-action="load-payment" data-loading-exempt="true">Load Manual Payment</button>' : ''}
              ${canIssueClientInvoices ? '<button type="button" data-booking-inline-action="issue-client-invoice">Invoice Client</button>' : ''}
              <button type="button" data-booking-inline-action="open-changelog" data-loading-exempt="true">Open Changelog</button>
              <button type="button" data-booking-inline-action="duplicate">Duplicate Booking</button>
              <button type="button" data-booking-inline-action="reschedule">Reschedule</button>
              ${isFinalised ? '<button type="button" data-booking-inline-action="memories-focus" data-loading-exempt="true">Upload Tour Memories</button>' : ''}
              <button type="button" class="is-danger-action" data-booking-action="cancelled">Cancel Booking</button>
            </div>
            <p class="booking-function-note">Status updates are handled by payment, cancellation, reschedule, and automation workflows.</p>
          </div>
        </section>
        <section class="detail-section" id="booking-finance-panel">
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
              <span>Discounts</span>
              <strong>${bookingAdminShared.formatMoney(discountTotal,booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(`${discounts.length} discount record${discounts.length===1 ? '' : 's'}`)}</p>
            </article>
            <article class="detail-card booking-payment-link-card">
              <span>Payment link</span>
              <strong>${bookingPaymentLink ? 'Ready' : 'Not generated'}</strong>
              <p>${bookingPaymentLink ? `Generated ${bookingAdminShared.escapeHtml(formatDateTimeLabel(paymentLinkGeneratedAt))}` : 'Generate a booking-specific link before asking the client to pay.'}</p>
              <div class="detail-inline-actions">
                <button type="button" class="booking-button compact-button" data-booking-inline-action="generate-payment-link">${bookingPaymentLink ? 'Regenerate' : 'Generate'}</button>
                ${bookingPaymentLink ? `<button type="button" class="booking-button ghost compact-button" data-booking-inline-action="copy-payment-link">Copy</button><a class="booking-button ghost compact-button" href="${bookingAdminShared.escapeHtml(bookingPaymentLink)}" target="_blank" rel="noopener noreferrer">Open</a>` : ''}
              </div>
              ${bookingPaymentLink ? `<input class="payment-link-display" type="text" value="${bookingAdminShared.escapeHtml(bookingPaymentLink)}" readonly>` : ''}
            </article>
            <article class="detail-card">
              <span>Office exposure</span>
              <strong>${bookingAdminShared.formatMoney(officeExposure,booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(`${officeInvoices.length} office invoice${officeInvoices.length===1 ? '' : 's'}`)}</p>
            </article>
            <article class="detail-card">
              <span>Partner exposure</span>
              <strong>${bookingAdminShared.formatMoney(operatorCommission+agentCommission,booking.currency||state.settings.currency)}</strong>
              <p>${bookingAdminShared.escapeHtml(`Operating partner ${bookingAdminShared.formatMoney(operatorCommission,booking.currency||state.settings.currency)} / Selling partner ${bookingAdminShared.formatMoney(agentCommission,booking.currency||state.settings.currency)}`)}</p>
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
          ${canRecordPayments ? `
            <form class="booking-inline-form booking-inline-form-wide admin-spacer" data-inline-form="manual-payment">
              <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
              <label class="booking-field">
                <span>Payment Type</span>
                <select name="payment_type" required>
                  <option value="eft">EFT / Bank Transfer</option>
                  <option value="card">Card Machine</option>
                  <option value="cash">Cash</option>
                  <option value="voucher">Voucher</option>
                  <option value="other">Other</option>
                </select>
              </label>
              <label class="booking-field">
                <span>Amount Received</span>
                <input name="amount" type="number" min="0.01" step="0.01" value="${bookingAdminShared.escapeHtml(String(Math.max(0,guestBalance||booking.amount_due_now||booking.total_amount||0)))}" required>
              </label>
              <label class="booking-field">
                <span>Reference</span>
                <input name="provider_reference" type="text" placeholder="EFT ref, receipt, or slip number">
              </label>
              <label class="booking-field" data-card-payment-field hidden>
                <span>Terminal Serial</span>
                <input name="terminal_serial_number" type="text" placeholder="Required for card">
              </label>
              <label class="booking-field" data-card-payment-field hidden>
                <span>Batch Number</span>
                <input name="batch_number" type="text" placeholder="Required for card">
              </label>
              <label class="booking-field-full">
                <span>Payment Note</span>
                <input name="notes" type="text" placeholder="Optional finance note">
              </label>
              <div class="detail-inline-actions">
                <button class="booking-button" type="submit">Load Payment</button>
              </div>
            </form>
          ` : ''}
        </section>
        <section class="detail-section">
          <h4>Commercials</h4>
          <div class="detail-rail-stats">
            <article class="detail-card">
              <span>Billing party</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingBillToLabel(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml(sellingModel==='net_rate' ? 'Net-rate company billing' : sellingModel==='gross_commission' ? 'Commission payable after sale' : 'Direct guest billing')}</p>
            </article>
            <article class="detail-card">
              <span>Selling partner</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingAgentName(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml(agentCommission>0 ? bookingAdminShared.formatMoney(agentCommission,booking.currency||state.settings.currency) : 'No commission exposure yet.')}</p>
            </article>
            <article class="detail-card">
              <span>Operating partner</span>
              <strong>${bookingAdminShared.escapeHtml(getBookingOperatorName(booking))}</strong>
              <p>${bookingAdminShared.escapeHtml(operatorCommission>0 ? bookingAdminShared.formatMoney(operatorCommission,booking.currency||state.settings.currency) : 'No supplier payout recorded yet.')}</p>
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
              <h4>Documents</h4>
              <p class="muted-copy">Generate stored PDFs and keep booking documents in one place.</p>
            </div>
          </div>
          <div class="detail-actions vertical-actions">
            <button type="button" data-booking-inline-action="document:guest_invoice">Guest Invoice PDF</button>
            <button type="button" data-booking-inline-action="document:receipt">Receipt PDF</button>
            <button type="button" data-booking-inline-action="document:manifest">Manifest PDF</button>
            ${isFinalised ? '<button type="button" data-booking-inline-action="memories-focus">Upload Tour Memories</button>' : ''}
          </div>
        </section>
        <section class="detail-section">
          <div class="section-heading">
            <div>
              <h4>Operating partner & payout</h4>
              <p class="muted-copy">Attach the assisting company we need to pay for helping us deliver the tour.</p>
            </div>
          </div>
          <form class="booking-inline-form" data-inline-form="operator-assignment">
            <input type="hidden" name="booking_id" value="${bookingAdminShared.escapeHtml(booking.id)}">
            <label class="booking-field-full">
              <span>Operating Partner</span>
              <select name="operator_id">
                <option value="">Unassigned</option>
                ${operatorOptions}
              </select>
            </label>
            <label class="booking-field">
              <span>Payout Amount</span>
              <input type="number" name="commission_amount" min="0" step="0.01" value="${bookingAdminShared.escapeHtml(String(operatorAssignment?.commission_amount||''))}" placeholder="Leave blank for automatic calculation">
            </label>
            <div class="detail-callout">
              <strong>Automatic creditor calculation</strong>
              <p class="detail-helper-copy">${bookingAdminShared.escapeHtml(operatorAssignment?.operator_id ? `${getBookingOperatorName(booking)} currently calculates to ${bookingAdminShared.formatMoney(operatorCommission,booking.currency||state.settings.currency)}.` : 'Choose an operating partner and leave payout blank to use the partner percentage or fixed take configured in Partner Center.')}</p>
            </div>
            <div class="detail-inline-actions">
              <button class="booking-button" type="submit">Save Operating Partner</button>
              <button class="booking-button ghost" type="button" data-booking-inline-action="clear-operator">Clear Operating Partner</button>
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
  setupBookingRecordAccordions()
  nodes.bookingDetail.querySelectorAll('form[data-inline-form="manual-payment"]').forEach(syncManualPaymentCardRequirements)
  syncManagementActionHeaders()
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
  if(nodes.globalBrandSwitch){
    nodes.globalBrandSwitch.innerHTML=`<option value="">All brands</option>${brandOptions}`
    nodes.globalBrandSwitch.value=state.activeBrandFilter
  }
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
  const brandCode=booking?.brand_code||bookingAdminShared.readConfig().brandCode||state.brands[0]?.code||''
  if(nodes.bookingBrand)nodes.bookingBrand.value=brandCode
  syncBookingReferenceField({booking,brandCode,forceNew:!booking})
  if(nodes.bookingSource)nodes.bookingSource.value=booking?.source||'admin'
  nodes.bookingService.value=booking?.service_slug||''
  nodes.bookingStatus.value=booking?.status||'awaiting_payment'
  nodes.bookingPaymentStatus.value=booking?.payment_status||'pending'
  const statusIsSystemManaged=Boolean(booking)
  ;[nodes.bookingStatus,nodes.bookingPaymentStatus].forEach(input=>{
    if(!input)return
    input.disabled=statusIsSystemManaged
    input.setAttribute('aria-disabled',String(statusIsSystemManaged))
    input.title=statusIsSystemManaged ? 'Booking status is updated by SkyBook workflows.' : ''
    input.closest('.booking-field')?.classList.toggle('is-system-managed-field',statusIsSystemManaged)
  })
  nodes.bookingDate.value=booking?.preferred_date||''
  nodes.bookingQuantity.value=booking?.quantity||2
  nodes.bookingCustomerName.value=booking?.customer_name||''
  nodes.bookingCustomerEmail.value=booking?.customer_email||''
  nodes.bookingCustomerPhone.value=booking?.customer_phone||''
  renderAdminBookingCustomFields(booking)
  nodes.bookingNotes.value=booking?.notes||booking?.customer_notes||''
  nodes.bookingSaveButton.textContent=booking ? 'Save Booking' : 'Create Booking'
}

const openBookingModal=(booking=null)=>{
  const requestedBooking=booking&&typeof booking==='object' ? booking : null
  state.selectedBookingId=requestedBooking?.id||''
  fillBookingForm(requestedBooking)
  if(nodes.bookingModalTitle)nodes.bookingModalTitle.textContent=requestedBooking ? 'Edit booking' : 'Create booking'
  setBookingModalState(true)
  initialiseBookingEditorSession()
  window.setTimeout(()=>nodes.bookingCustomerName?.focus(),60)
}

const closeBookingModal=()=>{
  if(!state.isBookingModalOpen && !nodes.bookingModal)return
  fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  if(nodes.bookingModalTitle)nodes.bookingModalTitle.textContent='Create booking'
  setBookingModalState(false)
}

const openReservationManagementScreen=(booking,{scroll=true}={})=>{
  if(!booking)return
  state.selectedBookingId=booking.id
  switchTab('reservation-management')
  renderReservations()
  renderReservationDetail()
  const detailPanel=nodes.reservationDetail?.closest('.reservation-management-panel')
  if(scroll){
    window.setTimeout(()=>detailPanel?.scrollIntoView?.({behavior:'smooth',block:'start'}),80)
  }
}

const openBookingManagementScreen=(booking,{scroll=true}={})=>{
  if(!booking)return
  state.selectedBookingId=booking.id
  switchTab('bookings')
  fillBookingForm(booking)
  if(!document.body.classList.contains('is-booking-record-page'))renderBookings()
  renderBookingDetail()
  if(!document.body.classList.contains('is-booking-record-page'))showSwitcherPanel(nodes.bookingDetail?.closest('.booking-detail-panel'),1)
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
  document.body.classList.toggle('is-modal-open',state.isServiceModalOpen||state.isBookingModalOpen||state.isCustomerModalOpen||state.isPartnerModalOpen||state.isWorkflowModalOpen)
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

const setCustomerModalState=isOpen=>{
  if(!nodes.customerModal)return
  state.isCustomerModalOpen=Boolean(isOpen)
  nodes.customerModal.hidden=!state.isCustomerModalOpen
  nodes.customerModal.setAttribute('aria-hidden',String(!state.isCustomerModalOpen))
  syncModalBodyState()
}

const setPartnerModalState=isOpen=>{
  if(!nodes.partnerModal)return
  state.isPartnerModalOpen=Boolean(isOpen)
  nodes.partnerModal.hidden=!state.isPartnerModalOpen
  nodes.partnerModal.setAttribute('aria-hidden',String(!state.isPartnerModalOpen))
  syncModalBodyState()
}

const renderWorkflowModal=()=>{
  const config=state.workflowModalConfig||{}
  if(nodes.workflowModalTitle)nodes.workflowModalTitle.textContent=config.title||'Workflow action'
  if(nodes.workflowModalDescription)nodes.workflowModalDescription.textContent=config.description||'Complete the required details to continue.'
  if(nodes.workflowModalSubmitButton)nodes.workflowModalSubmitButton.textContent=config.submitLabel||'Confirm'
  if(nodes.workflowModalFields){
    nodes.workflowModalFields.innerHTML=typeof bookingAdminSharedUi.renderWorkflowFields==='function'
      ? bookingAdminSharedUi.renderWorkflowFields(config.fields||[],{
        escapeHtml:bookingAdminShared.escapeHtml,
        htmlAttribute
      })
      : ''
  }
}

const setWorkflowModalState=isOpen=>{
  if(!nodes.workflowModal)return
  state.isWorkflowModalOpen=Boolean(isOpen)
  nodes.workflowModal.hidden=!state.isWorkflowModalOpen
  nodes.workflowModal.setAttribute('aria-hidden',String(!state.isWorkflowModalOpen))
  syncModalBodyState()
}

const openWorkflowModal=config=>{
  state.workflowModalConfig=config||null
  renderWorkflowModal()
  setWorkflowModalState(true)
  window.setTimeout(()=>{
    nodes.workflowModalForm?.querySelector('input, select, textarea, button')?.focus?.()
  },60)
}

const closeWorkflowModal=()=>{
  if(!state.isWorkflowModalOpen && !nodes.workflowModal)return
  state.workflowModalConfig=null
  if(nodes.workflowModalFields)nodes.workflowModalFields.innerHTML=''
  if(nodes.workflowModalTitle)nodes.workflowModalTitle.textContent='Workflow action'
  if(nodes.workflowModalDescription)nodes.workflowModalDescription.textContent='Complete the required details to continue.'
  if(nodes.workflowModalSubmitButton)nodes.workflowModalSubmitButton.textContent='Confirm'
  setWorkflowModalState(false)
}

const readWorkflowModalValues=form=>{
  const config=state.workflowModalConfig||{}
  const data=new FormData(form)
  return Object.fromEntries((config.fields||[]).map(field=>{
    if(field.type==='checkbox')return [field.name,form.querySelector(`[name="${field.name}"]`)?.checked===true]
    return [field.name,String(data.get(field.name)||'').trim()]
  }))
}

const buildDepartureTimeRow=(label='',time='')=>{
  const row=document.createElement('div')
  row.style.cssText='display:flex;gap:8px;align-items:center'
  row.innerHTML=`<input type="text" placeholder="Label (e.g. AM)" value="${label.replace(/"/g,'&quot;')}" data-dep-label style="flex:1;min-width:0"><input type="time" value="${time}" data-dep-time style="flex:1;min-width:0"><button type="button" data-dep-remove style="background:none;border:none;cursor:pointer;font-size:16px;padding:0 4px;opacity:.6" aria-label="Remove">×</button>`
  row.querySelector('[data-dep-remove]').addEventListener('click',()=>row.remove())
  return row
}

const getDepartureTimes=()=>{
  const list=nodes.serviceDepartureTimesList
  if(!list)return []
  return Array.from(list.querySelectorAll('div')).map(row=>({
    label:(row.querySelector('[data-dep-label]')?.value||'').trim(),
    time:(row.querySelector('[data-dep-time]')?.value||'').trim()
  })).filter(item=>item.label||item.time)
}

if(nodes.serviceAddDepartureTime){
  nodes.serviceAddDepartureTime.addEventListener('click',()=>{
    if(nodes.serviceDepartureTimesList)nodes.serviceDepartureTimesList.appendChild(buildDepartureTimeRow())
  })
}

const fillServiceForm=(service=null)=>{
  const brandCodes=getServiceBrandCodes(service)
  nodes.serviceId.value=service?.id||''
  nodes.serviceName.value=service?.name||''
  nodes.serviceSlug.value=service?.slug||''
  nodes.serviceCategory.value=service?.category_slug||'coastal-tours'
  if(nodes.servicePricingMode)nodes.servicePricingMode.value=service?.pricing_mode||'fixed'
  nodes.servicePrice.value=service?.base_price||''
  if(nodes.serviceAdultPrice)nodes.serviceAdultPrice.value=service?.adult_price||''
  if(nodes.serviceChildPrice)nodes.serviceChildPrice.value=service?.child_price||''
  nodes.serviceDateRule.value=service?.preferred_date_mode||'optional'
  nodes.serviceDuration.value=service?.duration_label||''
  if(nodes.serviceMinPax)nodes.serviceMinPax.value=service?.minimum_pax||1
  if(nodes.serviceDepartureTimesList){
    nodes.serviceDepartureTimesList.innerHTML=''
    const times=Array.isArray(service?.departure_times) ? service.departure_times : []
    times.forEach(item=>{
      const label=typeof item==='object' ? (item.label||'') : String(item||'')
      const time=typeof item==='object' ? (item.time||'') : ''
      nodes.serviceDepartureTimesList.appendChild(buildDepartureTimeRow(label,time))
    })
  }
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

const openCustomerModal=customer=>{
  if(!customer)return
  state.selectedCustomerId=customer.id
  renderCustomers()
  renderCustomerDetail()
  if(nodes.customerModalTitle)nodes.customerModalTitle.textContent=customer.full_name||'Customer details'
  setCustomerModalState(true)
  window.setTimeout(()=>nodes.closeCustomerModalButton?.focus(),60)
}

const closeCustomerModal=()=>{
  if(!state.isCustomerModalOpen && !nodes.customerModal)return
  setCustomerModalState(false)
}

const renderPartnerDetail=()=>{
  if(!nodes.partnerDetail)return
  const partner=getPartnerRecord(state.selectedPartnerType,state.selectedPartnerId)
  if(!partner){
    if(nodes.partnerModalTitle)nodes.partnerModalTitle.textContent='Partner profile'
    if(nodes.partnerModalDescription)nodes.partnerModalDescription.textContent='Review partner exposure, outstanding balances, and statement history.'
    nodes.partnerDetail.innerHTML='<div class="empty-state"><strong>Select a partner</strong><span>Open a selling partner or operating partner from Partner Center to inspect their profile and statements.</span></div>'
    return
  }
  const summary=buildPartnerSummary(state.selectedPartnerType,partner)
  const kindLabel=getPartnerTypeLabel(state.selectedPartnerType)
  const rateLabel=partner.commission_type&&partner.commission_value!==undefined
    ? `${formatDisplayLabel(partner.commission_type)} ${partner.commission_value}`
    : 'Commercial model not configured'
  if(nodes.partnerModalTitle)nodes.partnerModalTitle.textContent=partner.company_name||'Partner profile'
  if(nodes.partnerModalDescription)nodes.partnerModalDescription.textContent=`${kindLabel} profile with statement history, outstanding balances, and linked bookings.`
  nodes.partnerDetail.innerHTML=`
    <div class="profile-summary-grid">
      <article class="metric-card is-info">
        <span class="metric-label">${bookingAdminShared.escapeHtml(kindLabel)}</span>
        <strong>${bookingAdminShared.escapeHtml(partner.company_name||'Unnamed partner')}</strong>
        <small>${bookingAdminShared.escapeHtml(partner.code||'No partner code')}</small>
      </article>
      <article class="metric-card ${summary.outstandingAmount>0 ? 'is-warn' : 'is-good'}">
        <span class="metric-label">Outstanding balance</span>
        <strong>${bookingAdminShared.formatMoney(summary.outstandingAmount,state.settings.currency||'NAD')}</strong>
        <small>${bookingAdminShared.escapeHtml(`${summary.outstandingStatements.length} open statement${summary.outstandingStatements.length===1 ? '' : 's'}`)}</small>
      </article>
      <article class="metric-card is-good">
        <span class="metric-label">Settled</span>
        <strong>${bookingAdminShared.formatMoney(summary.settledAmount,state.settings.currency||'NAD')}</strong>
        <small>${bookingAdminShared.escapeHtml(`${summary.statements.length} total statement${summary.statements.length===1 ? '' : 's'}`)}</small>
      </article>
      <article class="metric-card ${summary.noShows||summary.cancellations ? 'is-risk' : 'is-info'}">
        <span class="metric-label">Linked trips</span>
        <strong>${bookingAdminShared.escapeHtml(String(summary.bookings.length))}</strong>
        <small>${bookingAdminShared.escapeHtml(`${summary.noShows} no-show / ${summary.cancellations} cancelled`)}</small>
      </article>
    </div>
    <section class="detail-section">
      <div class="section-heading">
        <div>
          <h4>Partner profile</h4>
          <p class="muted-copy">Core commercial settings, contact preference, and operating coverage.</p>
        </div>
      </div>
      <div class="detail-grid detail-grid-strong">
        <div><span>Code</span><strong>${bookingAdminShared.escapeHtml(partner.code||'Not set')}</strong></div>
        <div><span>Commercial model</span><strong>${bookingAdminShared.escapeHtml(rateLabel)}</strong></div>
        <div><span>Preferred contact</span><strong>${bookingAdminShared.escapeHtml(partner.preferred_contact_method||'Not set')}</strong></div>
        <div><span>Contact name</span><strong>${bookingAdminShared.escapeHtml(partner.contact_name||'Not captured')}</strong></div>
        <div><span>Email</span><strong>${bookingAdminShared.escapeHtml(partner.email||'Not captured')}</strong></div>
        <div><span>Phone</span><strong>${bookingAdminShared.escapeHtml(partner.phone||'Not captured')}</strong></div>
      </div>
      <p class="admin-inline-copy">${bookingAdminShared.escapeHtml(partner.payout_terms||partner.settlement_metadata?.summary||partner.banking_details?.summary||'No settlement notes captured for this partner yet.')}</p>
    </section>
    <section class="detail-section">
      <div class="section-heading">
        <div>
          <h4>${bookingAdminShared.escapeHtml(state.selectedPartnerType==='agent' ? 'Agent commission statement' : 'Supplier payable statement')}</h4>
          <p class="muted-copy">Statement history and outstanding exposure linked to this partner.</p>
        </div>
      </div>
      <div class="table-wrap detail-table">
        <table>
          <thead><tr><th>Statement</th><th>Booking</th><th>Status</th><th>Amount</th><th>When</th></tr></thead>
          <tbody>
            ${summary.statements.map(invoice=>{
              const booking=getBookingById(invoice.booking_id)
              return `
                <tr${booking?.id ? ` class="booking-row" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}"` : ''}>
                  <td>
                    <strong>${bookingAdminShared.escapeHtml(getPartnerStatementLabel(state.selectedPartnerType,invoice))}</strong>
                    <div class="table-subline">${bookingAdminShared.escapeHtml(invoice.invoice_number||'Pending statement number')}</div>
                  </td>
                  <td>
                    <strong>${bookingAdminShared.escapeHtml(booking?.reference||'No linked booking')}</strong>
                    <div class="table-subline">${bookingAdminShared.escapeHtml(booking?.customer_name||'')}</div>
                  </td>
                  <td>
                    ${renderStatusBadge(invoice.status||'issued')}
                    <div class="table-subline">${bookingAdminShared.escapeHtml(invoice.notes||'Awaiting settlement')}</div>
                  </td>
                  <td>${bookingAdminShared.formatMoney(invoice.total_amount||invoice.commission_amount||0,invoice.currency_code||state.settings.currency)}</td>
                  <td>${bookingAdminShared.escapeHtml(formatDateTimeLabel(invoice.due_at||invoice.issued_at||invoice.created_at))}</td>
                </tr>
              `
            }).join('') || renderEmptyRow(5,'No partner statements have been logged yet.')}
          </tbody>
        </table>
      </div>
    </section>
    <section class="detail-section">
      <div class="section-heading">
        <div>
          <h4>Linked bookings</h4>
          <p class="muted-copy">Trips currently associated with this partner relationship.</p>
        </div>
      </div>
      <div class="table-wrap detail-table">
        <table>
          <thead><tr><th>Reference</th><th>Guest</th><th>Service</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${summary.bookings.map(booking=>`
              <tr class="booking-row" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
                <td>${bookingAdminShared.escapeHtml(booking.reference||'Draft booking')}</td>
                <td>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</td>
                <td>${bookingAdminShared.escapeHtml(booking.service_name||'Service pending')}</td>
                <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date||booking.created_at))}</td>
                <td>${bookingAdminShared.formatMoney(booking.total_amount||0,booking.currency||state.settings.currency)}</td>
                <td>${renderStatusBadge(booking.status)}</td>
              </tr>
            `).join('') || renderEmptyRow(6,'No bookings are currently linked to this partner.')}
          </tbody>
        </table>
      </div>
    </section>
  `
}

const openPartnerModal=(partnerType,partnerId)=>{
  if(!partnerType||!partnerId)return
  state.selectedPartnerType=partnerType
  state.selectedPartnerId=partnerId
  renderPartnerDetail()
  setPartnerModalState(true)
  window.setTimeout(()=>nodes.closePartnerModalButton?.focus(),60)
}

const closePartnerModal=()=>{
  if(!state.isPartnerModalOpen && !nodes.partnerModal)return
  setPartnerModalState(false)
}

const printPartnerStatement=()=>{
  const partner=getPartnerRecord(state.selectedPartnerType,state.selectedPartnerId)
  if(!partner)throw new Error('Choose a partner first.')
  const summary=buildPartnerSummary(state.selectedPartnerType,partner)
  const title=`${partner.company_name} - ${state.selectedPartnerType==='agent' ? 'Agent Commission Statement' : 'Supplier Payable Statement'}`
  const statementRows=summary.statements.map(invoice=>{
    const booking=getBookingById(invoice.booking_id)
    return `
      <tr>
        <td>${bookingAdminShared.escapeHtml(invoice.invoice_number||'Pending statement')}</td>
        <td>${bookingAdminShared.escapeHtml(booking?.reference||'No linked booking')}</td>
        <td>${bookingAdminShared.escapeHtml(formatDisplayLabel(invoice.status||'issued'))}</td>
        <td>${bookingAdminShared.formatMoney(invoice.total_amount||invoice.commission_amount||0,invoice.currency_code||state.settings.currency)}</td>
        <td>${bookingAdminShared.escapeHtml(formatDateLabel(invoice.due_at||invoice.issued_at||invoice.created_at))}</td>
      </tr>
    `}).join('') || '<tr><td colspan="5">No statements logged yet.</td></tr>'
  const printWindow=window.open('','_blank','noopener,noreferrer,width=1180,height=820')
  if(!printWindow)throw new Error('Pop-up blocked while opening the statement.')
  printWindow.document.write(`<!doctype html><html><head><meta charset="utf-8"><title>${bookingAdminShared.escapeHtml(title)}</title><style>
    body{font-family:Arial,sans-serif;padding:28px;color:#132433}
    h1{margin:0 0 12px;font-size:28px}
    p{margin:0 0 8px;color:#546a7c}
    .summary{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:14px;margin:24px 0}
    .card{padding:16px;border:1px solid #dbe7f2;border-radius:14px}
    table{width:100%;border-collapse:collapse;margin-top:20px}
    th,td{padding:10px;border-bottom:1px solid #dbe7f2;text-align:left}
    th{text-transform:uppercase;font-size:11px;letter-spacing:.14em;color:#5a7082}
  </style></head><body>
    <h1>${bookingAdminShared.escapeHtml(title)}</h1>
    <p>${bookingAdminShared.escapeHtml(getPartnerTypeLabel(state.selectedPartnerType))} code: ${bookingAdminShared.escapeHtml(partner.code||'Not set')}</p>
    <p>Printed ${bookingAdminShared.escapeHtml(formatDateTimeLabel(new Date().toISOString()))}</p>
    <div class="summary">
      <div class="card"><strong>Outstanding</strong><p>${bookingAdminShared.formatMoney(summary.outstandingAmount,state.settings.currency||'NAD')}</p></div>
      <div class="card"><strong>Settled</strong><p>${bookingAdminShared.formatMoney(summary.settledAmount,state.settings.currency||'NAD')}</p></div>
      <div class="card"><strong>Linked bookings</strong><p>${bookingAdminShared.escapeHtml(String(summary.bookings.length))}</p></div>
    </div>
    <table><thead><tr><th>Statement</th><th>Booking</th><th>Status</th><th>Amount</th><th>When</th></tr></thead><tbody>${statementRows}</tbody></table>
  </body></html>`)
  printWindow.document.close()
  printWindow.focus()
  window.setTimeout(()=>printWindow.print(),120)
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
    if(nodes.customerModalTitle)nodes.customerModalTitle.textContent='Customer details'
    nodes.customerDetail.innerHTML='<div class="empty-state"><strong>Select a customer</strong><span>Choose a guest from the customer table to open their client details.</span></div>'
    return
  }
  const bookings=sortByDateDesc(getCustomerBookings(customer),'created_at')
  const activeTrips=bookings.filter(booking=>!['cancelled','failed','no_show'].includes(normalizeText(booking.status)))
  const latestBooking=bookings[0]||null
  const customerMetadata=normalizeJsonRecord(customer.metadata)
  const latestCustomValues=getBookingCustomFieldValues(latestBooking)
  const latestCustomLabels=new Map(getActiveBookingFormFields(latestBooking?.brand_code||customer.last_brand_code).map(field=>[field.id,field.label]))
  const clientDetailRows=[
    ['Full name',customer.full_name],
    ['Email',customer.email],
    ['Phone',customer.phone],
    ['Latest brand',formatBrandLabel(customer.last_brand_code||latestBooking?.brand_code||'')],
    ['Latest source',formatSourceLabel(customer.last_source||latestBooking?.source||latestBooking?.metadata?.source||'website')],
    ['First seen',formatDateLabel(customer.created_at)],
    ['Last updated',formatDateTimeLabel(customer.updated_at||customer.created_at)],
    ['Latest reference',customer.last_booking_reference||latestBooking?.reference],
    ['Latest service',latestBooking?.service_name],
    ['Latest date',formatDateLabel(customer.last_booking_date||latestBooking?.preferred_date)],
    ['Booking count',customer.booking_count||bookings.length],
    ['Active bookings',activeTrips.length],
    ['Nationality',customerMetadata.nationality],
    ['WhatsApp',customerMetadata.whatsapp],
    ['Preferred contact',customerMetadata.preferred_contact_method],
    ['Source page',customerMetadata.latest_source_page||latestBooking?.metadata?.source_page]
  ].map(([label,value])=>({label,value:formatSubmittedDetailValue(value)})).filter(row=>row.value)
  const submittedRows=Object.entries(latestCustomValues).map(([key,value])=>({
    label:latestCustomLabels.get(normalizeFieldId(key))||formatDisplayLabel(key),
    value:formatSubmittedDetailValue(value)
  })).filter(row=>row.value)
  if(nodes.customerModalTitle)nodes.customerModalTitle.textContent=customer.full_name||'Customer details'
  nodes.customerDetail.innerHTML=`
    <section class="detail-section client-details-section">
      <div class="section-heading">
        <div>
          <h4>Client details</h4>
          <p class="muted-copy">Clean guest identity and contact information only.</p>
        </div>
      </div>
      <div class="detail-grid detail-grid-strong client-details-grid">
        ${clientDetailRows.map(row=>`
          <div>
            <span>${bookingAdminShared.escapeHtml(row.label)}</span>
            <strong>${bookingAdminShared.escapeHtml(row.value)}</strong>
          </div>
        `).join('')}
      </div>
      ${submittedRows.length ? `
        <div class="admin-spacer">
          <h4>Submitted form details</h4>
          <div class="detail-grid detail-grid-strong client-details-grid">
            ${submittedRows.map(row=>`
              <div>
                <span>${bookingAdminShared.escapeHtml(row.label)}</span>
                <strong>${bookingAdminShared.escapeHtml(row.value)}</strong>
              </div>
            `).join('')}
          </div>
        </div>
      ` : ''}
    </section>
    <section class="detail-section">
      <div class="section-heading">
        <div>
          <h4>Linked bookings</h4>
          <p class="muted-copy">References connected to this client profile.</p>
        </div>
      </div>
      <div class="table-wrap detail-table">
        <table>
          <thead><tr><th>Reference</th><th>Brand</th><th>Service</th><th>Date</th><th>Total</th><th>Status</th></tr></thead>
          <tbody>
            ${bookings.map(booking=>`
              <tr class="booking-row" data-customer-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
                <td>${bookingAdminShared.escapeHtml(booking.reference||'Draft booking')}</td>
                <td>${bookingAdminShared.escapeHtml(formatBrandLabel(booking.brand_code||''))}</td>
                <td>${bookingAdminShared.escapeHtml(booking.service_name||'Service pending')}</td>
                <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date||booking.created_at))}</td>
                <td>${bookingAdminShared.formatMoney(booking.total_amount||0,booking.currency||state.settings.currency)}</td>
                <td>
                  <div class="badge-stack">
                    ${renderStatusBadge(booking.status)}
                    ${renderStatusBadge(booking.payment_status,`Payment ${String(booking.payment_status||'').replace(/_/g,' ')}`)}
                  </div>
                </td>
              </tr>
            `).join('') || renderEmptyRow(6,'This customer does not have any linked bookings yet.')}
          </tbody>
        </table>
      </div>
    </section>
  `
}

const renderCustomers=()=>{
  if(!nodes.customersTable)return
  const filteredCustomers=getFilteredCustomers()
  if(state.selectedCustomerId && !filteredCustomers.some(customer=>customer.id===state.selectedCustomerId)){
    state.selectedCustomerId=''
  }
  nodes.customersTable.innerHTML=filteredCustomers.map(customer=>`
    <tr class="customer-row${customer.id===state.selectedCustomerId ? ' is-active' : ''}" data-customer-id="${bookingAdminShared.escapeHtml(customer.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(customer.full_name)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatDateLabel(customer.created_at))}</div>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(customer.email)}</strong>
      </td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(customer.phone||'No phone captured')}</strong>
      </td>
      <td>${renderChipGroup(customer.brand_codes,{formatter:formatBrandLabel,fallback:'No brand history yet'})}</td>
      <td>${renderChipGroup(customer.booking_sources,{formatter:formatSourceLabel,fallback:'No source history yet'})}</td>
      <td>
        <strong>${bookingAdminShared.escapeHtml(customer.last_booking_reference||'No booking yet')}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatDateLabel(customer.last_booking_date||customer.created_at))}</div>
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

const getBrandSupportEmailSetting=(brandCode,fallback='')=>{
  const configuredSupportEmails=state.settings.supportEmailsByBrand||{}
  const brand=state.brands.find(item=>normalizeText(item.code)===normalizeText(brandCode))
  return String(configuredSupportEmails[brandCode]||brand?.support_email||fallback||'').trim()
}

const renderSettings=()=>{
  const trueTravelEmail=getBrandSupportEmailSetting('true-travel',state.settings.supportEmail||'bookings@truetravelnam.net')
  const iventureEmail=getBrandSupportEmailSetting('iventure','info@aerodigital.space')
  nodes.settingsForm.currency.value=state.settings.currency||'NAD'
  if(nodes.settingsForm.supportEmailTrueTravel)nodes.settingsForm.supportEmailTrueTravel.value=trueTravelEmail
  if(nodes.settingsForm.supportEmailIventure)nodes.settingsForm.supportEmailIventure.value=iventureEmail
  nodes.settingsForm.supportPhone.value=state.settings.supportPhone||''
  nodes.settingsForm.defaultDepositValue.value=state.settings.defaultDepositValue||30
  nodes.settingsForm.taxRate.value=state.settings.taxRate||0
  nodes.settingsForm.serviceFee.value=state.settings.serviceFee||0
  if(nodes.portalBaseUrl)nodes.portalBaseUrl.value=state.portalSettings.portalBaseUrl||'/portal.html'
  if(nodes.portalSessionDurationHours)nodes.portalSessionDurationHours.value=state.portalSettings.sessionDurationHours||72
  renderBookingFieldManager()
}

const renderEmailTemplates=()=>{
  const mergedTemplates={...bookingAdminShared.clone(bookingAdminShared.DEFAULT_EMAIL_TEMPLATES),...(state.emailTemplates||{})}
  const orderedKeys=[
    ...Object.keys(EMAIL_TEMPLATE_META)
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
    nodes.emailSenderTrueTravel.textContent=getBrandSupportEmailSetting('true-travel',state.settings.supportEmail||'bookings@truetravelnam.net')
  }
  if(nodes.emailSenderIventure){
    nodes.emailSenderIventure.textContent=getBrandSupportEmailSetting('iventure','info@aerodigital.space')
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

const buildConsultantProductivityRows=bookings=>{
  if(typeof bookingAdminReports.buildConsultantProductivityRows==='function'){
    return bookingAdminReports.buildConsultantProductivityRows({
      bookings,
      getOwnerId:getBookingConsultantOwnerId,
      resolveOwnerName:resolveConsultantOwnerName
    })
  }
  return []
}

const buildArrivalsManifestRows=targetDate=>{
  const activeBookings=getVisibleBookings().filter(booking=>!isTrashedBooking(booking)&&!['cancelled','failed','refunded','no_show'].includes(normalizeText(booking.status)))
  if(typeof bookingAdminReports.buildArrivalsManifestRows==='function'){
    return bookingAdminReports.buildArrivalsManifestRows({
      bookings:activeBookings,
      targetDate,
      getPickupSummary:getBookingPickupSummary,
      getDropoffSummary:getBookingDropoffSummary,
      getNotes:getBookingOperationalNotesSummary,
      getOperatorName:getBookingOperatorName
    })
  }
  return []
}

const renderReportsWorkbench=()=>{
  const overview=state.reports?.overview||{}
  const brandMap=new Map(state.brands.map(brand=>[brand.code,brand.name]))
  const reportBookings=getVisibleBookings().filter(booking=>!isTrashedBooking(booking))
  const byBrand=reportBookings.reduce((accumulator,booking)=>{
    const key=booking.brand_code||'unassigned'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const byService=reportBookings.reduce((accumulator,booking)=>{
    const key=booking.service_name||'Unknown service'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const bySource=reportBookings.reduce((accumulator,booking)=>{
    const key=booking.source||booking.metadata?.source||'website'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  const cancelledBookings=reportBookings.filter(booking=>String(booking.status||'').toLowerCase()==='cancelled')
  const noShowBookings=reportBookings.filter(booking=>normalizeText(booking.status)==='no_show')
  const acceptedBookings=reportBookings.filter(booking=>!['draft','pending','cancelled','failed'].includes(normalizeText(booking.status)))
  const paidBookings=reportBookings.filter(booking=>['paid','partially_paid'].includes(normalizeText(booking.payment_status)))
  const consultantRows=buildConsultantProductivityRows(reportBookings)
  if(nodes.reportsArrivalsDate && !nodes.reportsArrivalsDate.value)nodes.reportsArrivalsDate.value=getTodayKey()
  const arrivalsRows=buildArrivalsManifestRows(nodes.reportsArrivalsDate?.value||getTodayKey())
  const cancellationReasons=cancelledBookings.reduce((accumulator,booking)=>{
    const reason=booking.cancellation_reason||booking.metadata?.trash?.reason||booking.customer_notes||'No reason captured'
    accumulator[reason]=(accumulator[reason]||0)+1
    return accumulator
  },{})
  const topAgents=state.officeInvoices.reduce((accumulator,invoice)=>{
    const booking=getBookingById(invoice.booking_id)
    if(state.activeBrandFilter&&booking?.brand_code!==state.activeBrandFilter)return accumulator
    const agent=invoice.agent_name||invoice.payee_name||invoice.operator_name||'Unassigned'
    accumulator[agent]=accumulator[agent]||{count:0,revenue:0}
    accumulator[agent].count+=1
    accumulator[agent].revenue+=Number(invoice.total_amount||invoice.commission_amount||0)
    return accumulator
  },{})
  const unpaidInvoices=state.invoices.filter(invoice=>Number(invoice.balance_amount||0)>0)
  const commissionDue=sumAmounts(state.officeInvoices.filter(invoice=>!['paid','cancelled'].includes(String(invoice.status||'').toLowerCase())),'commission_amount')
  const operatorPayoutsDue=sumAmounts(state.officeInvoices.filter(invoice=>String(invoice.payee_type||'').toLowerCase()==='operator' && !['paid','cancelled'].includes(String(invoice.status||'').toLowerCase())),'total_amount')
  const agentPayoutsDue=sumAmounts(state.officeInvoices.filter(invoice=>String(invoice.payee_type||'').toLowerCase()==='agent' && !['paid','cancelled'].includes(String(invoice.status||'').toLowerCase())),'total_amount')
  const cards=[
    {label:'Gross Revenue',value:bookingAdminShared.formatMoney(overview.gross_revenue||0,state.settings.currency||'NAD')},
    {label:'Paid Revenue',value:bookingAdminShared.formatMoney(overview.paid_revenue||0,state.settings.currency||'NAD')},
    {label:'Debtors Outstanding',value:bookingAdminShared.formatMoney(overview.guest_outstanding||0,state.settings.currency||'NAD')},
    {label:'Creditors Payable',value:bookingAdminShared.formatMoney(overview.office_payables||0,state.settings.currency||'NAD')},
    {label:'Refund Exposure',value:bookingAdminShared.formatMoney(overview.refund_exposure||0,state.settings.currency||'NAD')},
    {label:'Commission Due',value:bookingAdminShared.formatMoney(commissionDue,state.settings.currency||'NAD')},
    {label:'Supplier Payables',value:bookingAdminShared.formatMoney(operatorPayoutsDue,state.settings.currency||'NAD')},
    {label:'Open Debtor Accounts',value:String(unpaidInvoices.length)},
    {label:'Conversion',value:`${reportBookings.length ? Math.round((acceptedBookings.length/reportBookings.length)*100) : 0}% accepted`},
    {label:'Paid Pipeline',value:`${paidBookings.length}/${reportBookings.length}`},
    {label:'No Shows',value:String(noShowBookings.length)}
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
            <strong>Selling partner commission due</strong>
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
            <span>${bookingAdminShared.escapeHtml(String(reportBookings.length))}</span>
          </div>
          <div>
            <strong>Cancellation reasons</strong>
            <span>${Object.entries(cancellationReasons).map(([reason,count])=>`${bookingAdminShared.escapeHtml(reason)} (${bookingAdminShared.escapeHtml(String(count))})`).join(', ')||'No cancellations logged'}</span>
          </div>
          <div>
            <strong>Top selling partners</strong>
            <span>${Object.entries(topAgents).sort((left,right)=>right[1].count-left[1].count).slice(0,3).map(([agent,metrics])=>`${bookingAdminShared.escapeHtml(agent)} (${bookingAdminShared.escapeHtml(String(metrics.count))})`).join(', ')||'No commission sources yet'}</span>
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
  nodes.reportsGuestInvoicesTable.innerHTML=(state.reports?.recent_guest_invoices||[]).map(invoice=>{
    const booking=getBookingById(invoice.booking_id)
    return `
      <tr>
        <td>
          <strong>${bookingAdminShared.escapeHtml(getDebtorName(invoice))}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(invoice.invoice_number||booking?.reference||'')}</div>
        </td>
        <td>${renderStatusBadge(invoice.status)}</td>
        <td>${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)}</td>
        <td>${bookingAdminShared.formatMoney(getInvoiceOutstandingAmount(invoice),invoice.currency_code||state.settings.currency)}</td>
      </tr>
    `
  }).join('') || renderEmptyRow(4,'No debtor records yet.')
  nodes.reportsOfficeInvoicesTable.innerHTML=(state.reports?.recent_office_invoices||[]).map(invoice=>`
    <tr>
      <td>
        <strong>${bookingAdminShared.escapeHtml(getOfficeInvoicePartnerName(invoice))}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(invoice.invoice_number||invoice.booking_id||'')}</div>
      </td>
      <td>${bookingAdminShared.escapeHtml(formatDisplayLabel(invoice.invoice_type||''))}</td>
      <td>${renderStatusBadge(invoice.status)}</td>
      <td>${bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)}</td>
    </tr>
  `).join('') || renderEmptyRow(4,'No creditor records yet.')
  if(nodes.reportsConsultantTable){
    nodes.reportsConsultantTable.innerHTML=consultantRows.map(row=>`
      <tr>
        <td><strong>${bookingAdminShared.escapeHtml(row.name||'Unassigned')}</strong></td>
        <td>${bookingAdminShared.escapeHtml(String(row.bookings||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.accepted||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.completed||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.cancelled||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.noShows||0))}</td>
        <td>${bookingAdminShared.formatMoney(row.gross||0,state.settings.currency||'NAD')}</td>
        <td>${bookingAdminShared.formatMoney(row.paid||0,state.settings.currency||'NAD')}</td>
      </tr>
    `).join('') || renderEmptyRow(8,'No consultant-owned bookings have been recorded yet.')
  }
  if(nodes.reportsArrivalsTable){
    nodes.reportsArrivalsTable.innerHTML=arrivalsRows.map(row=>`
      <tr data-booking-id="${bookingAdminShared.escapeHtml(row.id||'')}">
        <td>
          <strong>${bookingAdminShared.escapeHtml(row.guest||'Guest')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(row.reference||'')}</div>
        </td>
        <td>${bookingAdminShared.escapeHtml(row.tour||'Service')}</td>
        <td>${bookingAdminShared.escapeHtml(row.pickups||'Pending')}</td>
        <td>${bookingAdminShared.escapeHtml(row.dropoffs||'Pending')}</td>
        <td>${bookingAdminShared.escapeHtml(row.notes||'No notes captured.')}</td>
        <td>${bookingAdminShared.escapeHtml(row.operator||'Unassigned')}</td>
        <td>${renderStatusBadge(row.status||'pending')}</td>
      </tr>
    `).join('') || renderEmptyRow(7,'No arrivals scheduled for this date.')
  }
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
        <div class="table-subline">${bookingAdminShared.escapeHtml(formatDisplayLabel(payment.payment_type||payment.provider||'manual'))}</div>
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
  setNodeVisibility(nodes.agentForm,false)
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
  const workspaceMode=state.activeTab==='resources' ? 'resources' : state.activeTab==='invoices' ? 'finance' : 'platform'
  const showResources=workspaceMode==='resources'
  const showFinance=workspaceMode==='finance'
  const showPlatformAdmin=workspaceMode==='platform'
  if(nodes.platformPrimaryTitle)nodes.platformPrimaryTitle.textContent=showResources
    ? 'Resources & Capacity'
    : showFinance
      ? 'Debtors Ledger'
      : 'Selling Partners'
  if(nodes.platformSecondaryTitle)nodes.platformSecondaryTitle.textContent=showResources
    ? 'Supporting Inventory Overview'
    : showFinance
      ? 'Creditors Ledger'
      : 'Operating Partners'
  if(nodes.platformOperationsHead)nodes.platformOperationsHead.innerHTML=showResources
    ? '<tr><th>Resource</th><th>Type</th><th>Status</th><th>Capacity</th></tr>'
    : showFinance
      ? '<tr><th>Debtor</th><th>Reference</th><th>Status</th><th>Exposure</th></tr>'
      : '<tr><th>Partner</th><th>Model</th><th>Outstanding</th><th>Statement</th></tr>'
  if(nodes.platformConfigHead)nodes.platformConfigHead.innerHTML=showResources
    ? '<tr><th>Category</th><th>Name</th><th>Status</th><th>Value</th></tr>'
    : showFinance
      ? '<tr><th>Creditor</th><th>Payable</th><th>Status</th><th>Amount</th></tr>'
      : '<tr><th>Partner</th><th>Services</th><th>Outstanding</th><th>Statement</th></tr>'
  setNodeVisibility(nodes.resourceForm,showResources)
  setNodeVisibility(nodes.agentForm,showPlatformAdmin)
  setNodeVisibility(nodes.operatorForm,showFinance||showPlatformAdmin)
  setNodeVisibility(nodes.officeInvoiceForm,showFinance||showPlatformAdmin)
  setNodeVisibility(nodes.automationRulesForm,showPlatformAdmin)
  setNodeVisibility(nodes.portalSettingsForm,showPlatformAdmin)
  setNodeVisibility(nodes.webhookForm,showPlatformAdmin)

  if(showResources){
    const opRows=state.resources.map(resource=>({label:resource.name,type:`Resource - ${resource.resource_type||'resource'}`,status:getResourceStatusLabel(resource),value:getResourceCapacityLabel(resource)}))
    nodes.platformOperationsTable.innerHTML=opRows.map(row=>`
      <tr>
        <td>${bookingAdminShared.escapeHtml(String(row.label||''))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.type||''))}</td>
        <td>${renderStatusBadge(String(row.status||''))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
      </tr>
    `).join('') || renderEmptyRow(4,'No resources loaded yet.')

    const configRows=[
      ...state.supportedLanguages.map(language=>({category:'Language',name:language.name,status:language.is_active===false ? 'Inactive' : (language.is_default ? 'Default' : 'Active'),value:language.code})),
      ...state.supportedCurrencies.map(currency=>({category:'Currency',name:currency.name,status:currency.is_active===false ? 'Inactive' : (currency.is_default ? 'Default' : 'Active'),value:`${currency.code} - ${currency.symbol||''}`})),
      ...state.calendarConnections.map(connection=>({category:'Calendar',name:connection.provider,status:connection.is_active===false ? 'Inactive' : 'Active',value:connection.external_calendar_id}))
    ]
    nodes.platformConfigTable.innerHTML=configRows.map(row=>`
      <tr>
        <td>${bookingAdminShared.escapeHtml(String(row.category||''))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.name||''))}</td>
        <td>${renderStatusBadge(String(row.status||''))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
      </tr>
    `).join('') || renderEmptyRow(4,'No supporting inventory records loaded yet.')
    return
  }

  if(showFinance){
    const debtorRows=state.invoices
      .filter(invoice=>{
        const booking=getBookingById(invoice.booking_id)
        return !state.activeBrandFilter || !booking || booking.brand_code===state.activeBrandFilter
      })
      .sort((left,right)=>{
        const exposureDiff=getInvoiceOutstandingAmount(right)-getInvoiceOutstandingAmount(left)
        if(exposureDiff!==0)return exposureDiff
        return (parseDateValue(left.due_at||left.issued_at||left.created_at)?.getTime()||0)-(parseDateValue(right.due_at||right.issued_at||right.created_at)?.getTime()||0)
      })
    nodes.platformOperationsTable.innerHTML=debtorRows.map(invoice=>{
      const booking=getBookingById(invoice.booking_id)
      const outstanding=getInvoiceOutstandingAmount(invoice)
      const totalAmount=Number(invoice.total_amount||0)
      const timingLabel=getLedgerTimingLabel(invoice.due_at||invoice.issued_at||invoice.created_at,outstanding,invoice.status)
      return `
        <tr${booking?.id ? ` class="booking-row" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}"` : ''}>
          <td>
            <strong>${bookingAdminShared.escapeHtml(getDebtorName(invoice))}</strong>
            <div class="table-subline">${bookingAdminShared.escapeHtml(booking?.customer_name||booking?.customer_email||'')}</div>
          </td>
          <td>
            <strong>${bookingAdminShared.escapeHtml(invoice.invoice_number||'Draft invoice')}</strong>
            <div class="table-subline">${bookingAdminShared.escapeHtml(booking?.reference||'No linked booking')}</div>
          </td>
          <td>
            ${renderStatusBadge(String(invoice.status||'issued'))}
            <div class="table-subline">${bookingAdminShared.escapeHtml(timingLabel)}</div>
          </td>
          <td>
            <strong>${bookingAdminShared.formatMoney(outstanding,invoice.currency_code||state.settings.currency)}</strong>
            <div class="table-subline">${bookingAdminShared.escapeHtml(`${bookingAdminShared.formatMoney(totalAmount,invoice.currency_code||state.settings.currency)} total`)}</div>
          </td>
        </tr>
      `
    }).join('') || renderEmptyRow(4,'No debtor records are loaded yet.')

    const creditorRows=state.officeInvoices
      .filter(invoice=>{
        const booking=getBookingById(invoice.booking_id)
        return !state.activeBrandFilter || !booking || booking.brand_code===state.activeBrandFilter
      })
      .sort((left,right)=>{
        const amountDiff=Number(right.total_amount||0)-Number(left.total_amount||0)
        if(amountDiff!==0)return amountDiff
        return (parseDateValue(left.due_at||left.issued_at||left.created_at)?.getTime()||0)-(parseDateValue(right.due_at||right.issued_at||right.created_at)?.getTime()||0)
      })
    nodes.platformConfigTable.innerHTML=creditorRows.map(invoice=>{
      const booking=getBookingById(invoice.booking_id)
      const amount=Number(invoice.total_amount||invoice.commission_amount||0)
      const timingLabel=getLedgerTimingLabel(invoice.due_at||invoice.issued_at||invoice.created_at,amount,invoice.status)
      return `
        <tr${booking?.id ? ` class="booking-row" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}"` : ''}>
          <td>
            <strong>${bookingAdminShared.escapeHtml(getOfficeInvoicePartnerName(invoice))}</strong>
            <div class="table-subline">${bookingAdminShared.escapeHtml(booking?.reference||invoice.invoice_number||'No linked booking')}</div>
          </td>
          <td>
            <strong>${bookingAdminShared.escapeHtml(formatDisplayLabel(invoice.invoice_type||invoice.payee_type||'settlement'))}</strong>
            <div class="table-subline">${bookingAdminShared.escapeHtml(invoice.invoice_number||'Pending settlement record')}</div>
          </td>
          <td>
            ${renderStatusBadge(String(invoice.status||'issued'))}
            <div class="table-subline">${bookingAdminShared.escapeHtml(timingLabel)}</div>
          </td>
          <td>
            <strong>${bookingAdminShared.formatMoney(amount,invoice.currency_code||state.settings.currency)}</strong>
            <div class="table-subline">${bookingAdminShared.escapeHtml(invoice.notes||'Awaiting settlement')}</div>
          </td>
        </tr>
      `
    }).join('') || renderEmptyRow(4,'No creditor records are loaded yet.')
    return
  }

  nodes.platformOperationsTable.innerHTML=state.agents.map(agent=>{
    const summary=buildPartnerSummary('agent',agent)
    return `
      <tr class="booking-row" data-partner-type="agent" data-partner-id="${bookingAdminShared.escapeHtml(agent.id)}">
        <td>
          <strong>${bookingAdminShared.escapeHtml(agent.company_name||'Unnamed partner')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(agent.code||'No agent code')}</div>
        </td>
        <td>
          ${renderStatusBadge(agent.is_active===false ? 'inactive' : 'active',agent.is_active===false ? 'Inactive' : 'Active')}
          <div class="table-subline">${bookingAdminShared.escapeHtml(`${formatDisplayLabel(agent.commission_type||'percentage')} ${agent.commission_value||0}`)}</div>
        </td>
        <td>
          <strong>${bookingAdminShared.formatMoney(summary.outstandingAmount,state.settings.currency||'NAD')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(`${summary.outstandingStatements.length} open statement${summary.outstandingStatements.length===1 ? '' : 's'}`)}</div>
        </td>
        <td>
          <strong>${bookingAdminShared.escapeHtml(summary.latestStatement?.invoice_number||'No statement yet')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(summary.latestStatement ? formatDateLabel(summary.latestStatement.issued_at||summary.latestStatement.created_at) : `${summary.bookings.length} linked booking${summary.bookings.length===1 ? '' : 's'}`)}</div>
        </td>
      </tr>
    `
  }).join('') || renderEmptyRow(4,'No selling partners have been configured yet.')

  nodes.platformConfigTable.innerHTML=state.operators.map(operator=>{
    const summary=buildPartnerSummary('operator',operator)
    const servicesHandled=Array.isArray(operator.services_handled) ? operator.services_handled.join(', ') : String(operator.services_handled||'').trim()
    return `
      <tr class="booking-row" data-partner-type="operator" data-partner-id="${bookingAdminShared.escapeHtml(operator.id)}">
        <td>
          <strong>${bookingAdminShared.escapeHtml(operator.company_name||'Unnamed operator')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(operator.code||'No operator code')}</div>
        </td>
        <td>
          ${renderStatusBadge(operator.is_active===false ? 'inactive' : 'active',operator.is_active===false ? 'Inactive' : 'Active')}
          <div class="table-subline">${bookingAdminShared.escapeHtml(servicesHandled||operator.preferred_contact_method||'Services not listed')}</div>
        </td>
        <td>
          <strong>${bookingAdminShared.formatMoney(summary.outstandingAmount,state.settings.currency||'NAD')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(`${summary.outstandingStatements.length} open statement${summary.outstandingStatements.length===1 ? '' : 's'}`)}</div>
        </td>
        <td>
          <strong>${bookingAdminShared.escapeHtml(summary.latestStatement?.invoice_number||'No statement yet')}</strong>
          <div class="table-subline">${bookingAdminShared.escapeHtml(summary.latestStatement ? formatDateLabel(summary.latestStatement.issued_at||summary.latestStatement.created_at) : `${summary.bookings.length} linked booking${summary.bookings.length===1 ? '' : 's'}`)}</div>
        </td>
      </tr>
    `
  }).join('') || renderEmptyRow(4,'No operating partners have been configured yet.')
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
  renderReservationPipeline()
  renderDashboard()
  renderNotifications()
  renderCalendar()
  renderReservations()
  renderReservationDetail()
  renderReservationTrash()
  renderBookings()
  renderBookingTrash()
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
  ensurePanelSwitchers()
  syncManagementActionHeaders()
}

const renderBookingRecordPage=(routeState,{skipDetailRender=false}={})=>{
  renderSession()
  renderAuthEnvironmentMeta()
  syncSessionLabel()
  renderServiceOptions()
  renderBrandOptions()
  renderSourceFilters()
  if(!skipDetailRender){
    fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
    applyRequestedRoute(routeState,{scrollToFocus:false})
    syncManagementActionHeaders()
  }
  finishBookingRecordLoader()
}

const loadAdminData=async(options={})=>{
  const shouldRender=options.render!==false
  const requestedRouteState=getAdminRouteState()
  const bookingRecordMode=isBookingRecordMode(requestedRouteState)
  const bookingRecordWasReady=document.body.classList.contains('is-booking-record-ready')
  if(shouldRender){
    setBookingRecordMode(bookingRecordMode)
    if(bookingRecordMode&&!bookingRecordWasReady)showBookingRecordLoader()
  }
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
  state.bookingFormFields=normalizeBookingFieldDefinitions(payload.booking_form_fields||[])
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
  state.bookingAgents=payload.booking_agents||[]
  state.bookingOperators=payload.booking_operators||[]
  state.resources=payload.resources||[]
  state.resourceAllocations=payload.resource_allocations||[]
  state.invoices=payload.invoices||[]
  state.officeInvoices=payload.office_invoices||[]
  state.bookingDiscounts=payload.booking_discounts||[]
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
  if(!shouldRender)return
  if(bookingRecordMode){
    const shouldSkipBookingRecordRender=Boolean(
      options.silent
      && bookingRecordWasReady
      && requestedRouteState.bookingId
      && String(state.selectedBookingId||'')===String(requestedRouteState.bookingId)
      && state.bookings.some(item=>String(item.id)===String(requestedRouteState.bookingId))
    )
    renderBookingRecordPage(requestedRouteState,{skipDetailRender:shouldSkipBookingRecordRender})
    return
  }
  fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  fillServiceForm(state.services.find(item=>item.id===state.selectedServiceId)||null)
  fillAdminUserForm(state.adminUsers.find(item=>item.id===nodes.adminUserId?.value)||null)
  renderAll()
  applyRequestedRoute(requestedRouteState,{scrollToFocus:!options.silent})
}

const getLoadedBookingIdSet=()=>new Set((state.bookings||[]).map(item=>String(item?.id||'').trim()).filter(Boolean))
const captureAdminViewport=()=>({
  x:window.scrollX||window.pageXOffset||0,
  y:window.scrollY||window.pageYOffset||0,
  activeId:document.activeElement?.id||''
})
const restoreAdminViewport=snapshot=>{
  if(!snapshot)return
  window.requestAnimationFrame(()=>{
    const activeElement=snapshot.activeId ? document.getElementById(snapshot.activeId) : null
    if(activeElement&&['INPUT','SELECT','TEXTAREA','BUTTON'].includes(activeElement.tagName)){
      activeElement.focus({preventScroll:true})
    }
    window.scrollTo(snapshot.x||0,snapshot.y||0)
  })
}
const renderSilentLiveAdminUpdates=()=>{
  if(document.body.classList.contains('is-booking-record-page'))return
  const snapshot=captureAdminViewport()
  try{
    renderReservationPipeline()
    renderDashboard()
    renderReservations()
    renderBookings()
    renderNotifications()
    updateBookingQuickFilterBar()
    syncManagementActionHeaders()
  }finally{
    restoreAdminViewport(snapshot)
  }
}
const announceNewLiveBookings=newBookings=>{
  if(!newBookings?.length)return
  renderSilentLiveAdminUpdates()
  playSkybookNotificationSound()
  const message=newBookings.length===1
    ? `New booking received: ${newBookings[0].reference||'latest booking'}.`
    : `${newBookings.length} new bookings received.`
  setAdminStatus(message)
}
const isRecordWorkspaceOpen=()=>Boolean(
  document.body.classList.contains('is-booking-record-page')
  || state.activeTab==='reservation-management'
  || (state.activeTab==='bookings' && state.selectedBookingId && nodes.bookingDetail?.closest('.booking-detail-panel')?.classList.contains('is-management-open'))
)
const shouldPauseLiveAdminSync=()=>Boolean(
  !state.session?.access_token
  || document.hidden
  || state.adminRefreshPromise
  || isRecordWorkspaceOpen()
  || state.isBookingModalOpen
  || state.isServiceModalOpen
  || state.isCustomerModalOpen
  || state.isPartnerModalOpen
  || state.isWorkflowModalOpen
  || state.bookingEditor?.isDirty
)
const refreshAdmin=async(message='Booking operations console synced.',options={})=>{
  if(state.adminRefreshPromise)return state.adminRefreshPromise
  const previousBookingIds=getLoadedBookingIdSet()
  const stableBookingRecordRefresh=document.body.classList.contains('is-booking-record-page')&&document.body.classList.contains('is-booking-record-ready')
  const willRender=options.render ?? !options.silent
  const viewportSnapshot=(willRender&&(options.silent||options.preserveViewport||stableBookingRecordRefresh)) ? captureAdminViewport() : null
  state.adminRefreshPromise=(async()=>{
    await loadAdminData({
      ...options,
      render:willRender
    })
    restoreAdminViewport(viewportSnapshot)
    state.lastSyncedAt=new Date().toISOString()
    const newBookings=(state.bookings||[]).filter(item=>{
      const id=String(item?.id||'').trim()
      return id&&!previousBookingIds.has(id)
    })
    if(options.silent&&newBookings.length){
      announceNewLiveBookings(newBookings)
    }else if(!options.silent||options.updateStatus!==false){
      setAdminStatus(message)
    }
  })()
  try{
    await state.adminRefreshPromise
  }finally{
    state.adminRefreshPromise=null
  }
}

const syncAdminInBackground=async()=>{
  if(shouldPauseLiveAdminSync())return
  try{
    await refreshAdmin('Live booking data synced.',{silent:true})
  }catch(error){
    const now=Date.now()
    if(now-state.adminLiveSyncLastErrorAt>ADMIN_LIVE_SYNC_ERROR_COOLDOWN_MS){
      state.adminLiveSyncLastErrorAt=now
      setAdminStatus(error.message||'Live booking sync failed.',true)
    }
  }
}

const startLiveAdminSync=()=>{
  if(state.adminLiveSyncTimer)return
  state.adminLiveSyncTimer=window.setInterval(()=>{ void syncAdminInBackground() },ADMIN_LIVE_SYNC_INTERVAL_MS)
}

const stopLiveAdminSync=()=>{
  if(!state.adminLiveSyncTimer)return
  window.clearInterval(state.adminLiveSyncTimer)
  state.adminLiveSyncTimer=null
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

const handleBookingCommercialStructureSave=async form=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||'').trim()
  if(!bookingId)return
  const booking=getBookingById(bookingId)
  if(!booking)throw new Error('Booking not found.')
  const existingCommercials=getBookingCommercialMeta(booking)
  const billToType=String(data.get('bill_to_type')||'guest').trim()||'guest'
  const billToCompanyName=String(data.get('bill_to_company_name')||'').trim()
  const sellingModel=String(data.get('selling_model')||'direct').trim()||'direct'
  await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}`,{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      metadata:{
        ...normalizeJsonRecord(booking.metadata),
        commercials:{
          ...existingCommercials,
          bill_to_type:billToType,
          bill_to_company_name:billToType==='company' ? billToCompanyName : '',
          selling_model:sellingModel
        }
      },
      reason:'Commercial structure updated in admin'
    }
  })
  await bookingAdminShared.apiRequest('admin/booking-agents',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      booking_id:bookingId,
      agent_id:String(data.get('agent_id')||'').trim(),
      commission_amount:Number(data.get('agent_commission_amount')||0),
      selling_model:sellingModel
    }
  })
  await refreshAdmin('Booking commercial structure updated.')
}

const handleBookingDiscountSave=async(form,{clear=false}={})=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||'').trim()
  if(!bookingId)return
  const consultantComment=String(data.get('consultant_comment')||'').trim()
  if(!consultantComment)throw new Error('A consultant comment is required for booking discounts.')
  await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}/discount`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:clear
      ? { clear:true, consultant_comment:consultantComment }
      : {
        discount_type:String(data.get('discount_type')||'percentage').trim(),
        discount_value:Number(data.get('discount_value')||0),
        consultant_comment:consultantComment
      }
  })
  await refreshAdmin(clear ? 'Booking discount cleared.' : 'Booking discount applied.')
}

const handleBookingOwnershipSave=async form=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||'').trim()
  if(!bookingId)return
  const booking=getBookingById(bookingId)
  if(!booking)throw new Error('Booking not found.')
  const consultantOwnerId=String(data.get('consultant_owner_id')||'').trim()
  const existingMetadata=normalizeJsonRecord(booking.metadata)
  await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}`,{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      metadata:{
        ...existingMetadata,
        consultant_owner_id:consultantOwnerId,
        management:{
          ...getBookingManagementMeta(booking),
          consultant_owner_id:consultantOwnerId
        }
      },
      reason:consultantOwnerId ? 'Consultant owner assigned in admin' : 'Consultant owner cleared in admin'
    }
  })
  await refreshAdmin(consultantOwnerId ? 'Consultant owner updated.' : 'Consultant owner cleared.')
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
  const booking=getBookingById(bookingId)
  const fileInput=form.querySelector('input[type="file"][name="memories"]')
  const files=[...(fileInput?.files||[])]
  if(!bookingId||!reference)throw new Error('Choose a booking before uploading memories.')
  if(normalizeText(booking?.status)!=='completed')throw new Error('Tour memories can only be uploaded after the booking is finalised.')
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

const printableMoney=(amount,currency)=>bookingAdminShared.formatMoney(Number(amount||0),currency||state.settings.currency||'NAD')

const printableBookingRows=bookings=>bookings.map(booking=>`
  <tr>
    <td><strong>${bookingAdminShared.escapeHtml(booking.reference||'')}</strong></td>
    <td>${bookingAdminShared.escapeHtml(getBrandName(booking.brand_code))}</td>
    <td>${bookingAdminShared.escapeHtml(booking.customer_name||'Guest')}</td>
    <td>${bookingAdminShared.escapeHtml(booking.service_name||'Tour pending')}</td>
    <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</td>
    <td>${bookingAdminShared.escapeHtml(String(booking.quantity||1))}</td>
    <td>${bookingAdminShared.escapeHtml(formatDisplayLabel(booking.status||''))}</td>
    <td>${printableMoney(booking.total_amount,booking.currency||booking.currency_code)}</td>
  </tr>
`).join('')

const openSkyBookPrintWindow=(title,markup)=>{
  openDocumentPrintWindow(title,`
    <header>
      <span class="pill">SkyBook</span>
      <h1>${bookingAdminShared.escapeHtml(title)}</h1>
      <small>${bookingAdminShared.escapeHtml(state.activeBrandFilter ? getBrandName(state.activeBrandFilter) : 'All brands')} - Printed ${bookingAdminShared.escapeHtml(formatDateTimeLabel(new Date().toISOString()))}</small>
    </header>
    ${markup}
  `)
}

const printArrivalsForDate=(selectedDate='')=>{
  const dateKey=selectedDate||nodes.calendarFocusDate?.value||state.calendarFocusDate||getTodayKey()
  const arrivals=buildArrivalsManifestRows(dateKey)
  openSkyBookPrintWindow(`Arrivals List - ${formatDateLabel(dateKey)}`,`
    <section>
      <h2>Arrivals</h2>
      <table>
        <thead><tr><th>Reference</th><th>Guest</th><th>Tour</th><th>Pickups</th><th>Drop offs</th><th>Notes</th><th>Operator</th><th>Status</th><th>Total</th></tr></thead>
        <tbody>${arrivals.map(row=>{
          const booking=getBookingById(row.id)
          return `
            <tr>
              <td><strong>${bookingAdminShared.escapeHtml(row.reference||'')}</strong><div class="table-subline">${bookingAdminShared.escapeHtml(getBrandName(booking?.brand_code||''))}</div></td>
              <td>${bookingAdminShared.escapeHtml(row.guest||'Guest')}<div class="table-subline">${bookingAdminShared.escapeHtml(String(booking?.quantity||1))} pax</div></td>
              <td>${bookingAdminShared.escapeHtml(row.tour||'Tour pending')}<div class="table-subline">${bookingAdminShared.escapeHtml(formatDateLabel(booking?.preferred_date||dateKey))}</div></td>
              <td>${bookingAdminShared.escapeHtml(row.pickups||'Pending')}</td>
              <td>${bookingAdminShared.escapeHtml(row.dropoffs||'Pending')}</td>
              <td>${bookingAdminShared.escapeHtml(row.notes||'No notes')}</td>
              <td>${bookingAdminShared.escapeHtml(row.operator||'Unassigned')}</td>
              <td>${bookingAdminShared.escapeHtml(formatDisplayLabel(row.status||''))}</td>
              <td>${printableMoney(booking?.total_amount||row.total||0,booking?.currency||booking?.currency_code)}</td>
            </tr>
          `
        }).join('') || '<tr><td colspan="9">No arrivals for this date.</td></tr>'}</tbody>
      </table>
    </section>
  `)
}

const resolveReportPeriod=choice=>{
  const normalized=normalizeText(choice || 'month').toLowerCase()
  return ['day','week','month','all'].includes(normalized) ? normalized : 'month'
}

const getReportDateRange=period=>{
  if(period==='all')return {label:'All time',start:null,end:null}
  const focus=parseDateValue(nodes.calendarFocusDate?.value||state.calendarFocusDate||getTodayKey())||new Date()
  const start=new Date(focus)
  const end=new Date(focus)
  if(period==='day'){
    start.setHours(0,0,0,0)
    end.setHours(23,59,59,999)
    return {label:formatDateLabel(start.toISOString()),start,end}
  }
  if(period==='week'){
    const day=start.getDay()||7
    start.setDate(start.getDate()-day+1)
    start.setHours(0,0,0,0)
    end.setTime(start.getTime())
    end.setDate(start.getDate()+6)
    end.setHours(23,59,59,999)
    return {label:`Week of ${formatDateLabel(start.toISOString())}`,start,end}
  }
  start.setDate(1)
  start.setHours(0,0,0,0)
  end.setMonth(start.getMonth()+1,0)
  end.setHours(23,59,59,999)
  return {label:start.toLocaleDateString('en-NA',{month:'long',year:'numeric'}),start,end}
}

const groupReportRows=(bookings,keyGetter)=>{
  const grouped=bookings.reduce((accumulator,booking)=>{
    const key=keyGetter(booking)||'Unassigned'
    accumulator[key]=accumulator[key]||{count:0,revenue:0}
    accumulator[key].count+=1
    accumulator[key].revenue+=Number(booking.total_amount||0)
    return accumulator
  },{})
  return Object.entries(grouped).sort((left,right)=>right[1].revenue-left[1].revenue).map(([label,metrics])=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(label)}</td>
      <td>${bookingAdminShared.escapeHtml(String(metrics.count))}</td>
      <td>${printableMoney(metrics.revenue)}</td>
    </tr>
  `).join('')
}

const printSkyBookReport=(type,selectedPeriod='month')=>{
  const period=resolveReportPeriod(selectedPeriod)
  const range=getReportDateRange(period)
  const bookings=getVisibleBookings()
    .filter(booking=>!isTrashedBooking(booking))
    .filter(booking=>{
      if(!range.start||!range.end)return true
      const date=parseDateValue(booking.preferred_date||booking.created_at)
      return Boolean(date&&date>=range.start&&date<=range.end)
    })
  const accepted=bookings.filter(booking=>!['draft','pending','cancelled','failed'].includes(normalizeText(booking.status))).length
  const declined=bookings.filter(booking=>normalizeText(booking.status)==='cancelled').length
  const paid=bookings.filter(booking=>['paid','partially_paid'].includes(normalizeText(booking.payment_status))).length
  const gross=sumAmounts(bookings,'total_amount')
  const consultantRows=buildConsultantProductivityRows(bookings).map(row=>`
      <tr>
        <td>${bookingAdminShared.escapeHtml(row.name||'Unassigned')}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.bookings||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.accepted||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.completed||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.cancelled||0))}</td>
        <td>${bookingAdminShared.escapeHtml(String(row.noShows||0))}</td>
        <td>${printableMoney(row.gross||0)}</td>
        <td>${printableMoney(row.paid||0)}</td>
      </tr>
    `).join('')
  const commissionRows=state.officeInvoices
    .filter(invoice=>!state.activeBrandFilter || getBookingById(invoice.booking_id)?.brand_code===state.activeBrandFilter)
    .map(invoice=>`
      <tr>
        <td>${bookingAdminShared.escapeHtml(invoice.invoice_number||'')}</td>
        <td>${bookingAdminShared.escapeHtml(invoice.payee_name||invoice.operator_name||invoice.agent_name||'Payee')}</td>
        <td>${bookingAdminShared.escapeHtml(formatDisplayLabel(invoice.payee_type||invoice.invoice_type||'commission'))}</td>
        <td>${printableMoney(invoice.commission_amount||invoice.total_amount,invoice.currency_code)}</td>
      </tr>
    `).join('')
  const titleMap={bookings:'Booking Report',financial:'Financial Report',commissions:'Commission Report',consultants:'Consultant Report'}
  openSkyBookPrintWindow(`${titleMap[type]||'SkyBook Report'} - ${range.label}`,`
    <section>
      <h2>Summary</h2>
      <div class="meta">
        <div class="card"><strong>Total bookings</strong><div>${bookingAdminShared.escapeHtml(String(bookings.length))}</div></div>
        <div class="card"><strong>Gross revenue</strong><div>${printableMoney(gross)}</div></div>
        <div class="card"><strong>Accepted</strong><div>${bookingAdminShared.escapeHtml(String(accepted))}</div></div>
        <div class="card"><strong>Declined</strong><div>${bookingAdminShared.escapeHtml(String(declined))}</div></div>
        <div class="card"><strong>Paid</strong><div>${bookingAdminShared.escapeHtml(String(paid))}</div></div>
        <div class="card"><strong>Conversion</strong><div>${bookings.length ? Math.round((accepted/bookings.length)*100) : 0}% accepted</div></div>
      </div>
    </section>
    <section>
      <h2>Revenue by brand</h2>
      <table><thead><tr><th>Brand</th><th>Bookings</th><th>Revenue</th></tr></thead><tbody>${groupReportRows(bookings,booking=>getBrandName(booking.brand_code)) || '<tr><td colspan="3">No brand revenue yet.</td></tr>'}</tbody></table>
    </section>
    <section>
      <h2>Revenue by tour</h2>
      <table><thead><tr><th>Tour</th><th>Bookings</th><th>Revenue</th></tr></thead><tbody>${groupReportRows(bookings,booking=>booking.service_name) || '<tr><td colspan="3">No tour revenue yet.</td></tr>'}</tbody></table>
    </section>
    <section>
      <h2>Revenue by source</h2>
      <table><thead><tr><th>Source</th><th>Bookings</th><th>Revenue</th></tr></thead><tbody>${groupReportRows(bookings,booking=>formatSourceLabel(booking.source||booking.metadata?.source||'website')) || '<tr><td colspan="3">No source revenue yet.</td></tr>'}</tbody></table>
    </section>
    ${type==='commissions' ? `<section><h2>Commission detail</h2><table><thead><tr><th>Invoice</th><th>Payee</th><th>Type</th><th>Commission</th></tr></thead><tbody>${commissionRows || '<tr><td colspan="4">No commission records yet.</td></tr>'}</tbody></table></section>` : ''}
    ${type==='consultants' ? `<section><h2>Consultant productivity</h2><table><thead><tr><th>Consultant</th><th>Bookings</th><th>Accepted</th><th>Completed</th><th>Cancelled</th><th>No Shows</th><th>Gross</th><th>Paid</th></tr></thead><tbody>${consultantRows || '<tr><td colspan="8">No consultant productivity data yet.</td></tr>'}</tbody></table></section>` : ''}
    ${type==='bookings' ? `<section><h2>Booking detail</h2><table><thead><tr><th>Reference</th><th>Brand</th><th>Guest</th><th>Tour</th><th>Date</th><th>Pax</th><th>Status</th><th>Total</th></tr></thead><tbody>${printableBookingRows(bookings) || '<tr><td colspan="8">No bookings in this period.</td></tr>'}</tbody></table></section>` : ''}
  `)
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
          <tr><td>Guests</td><td>${(()=>{const a=Number(booking.adult_quantity||0);const c=Number(booking.child_quantity||0);return bookingAdminShared.escapeHtml(a+c>0?`${booking.quantity||a+c} (${a} adult${a!==1?'s':''}, ${c} child${c!==1?'ren':''})`:String(booking.quantity||1))})()}</td></tr>
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

const openArrivalsPrintModal=()=>{
  openWorkflowModal({
    title:'Print arrivals list',
    description:'Choose the service date you want to print. The arrivals printout includes guest names, pickups, drop offs, notes, and financial context.',
    submitLabel:'Print arrivals',
    fields:[
      {
        name:'preferred_date',
        label:'Service date',
        type:'date',
        value:nodes.calendarFocusDate?.value||state.calendarFocusDate||getTodayKey(),
        required:true
      }
    ],
    onSubmit:async values=>{
      printArrivalsForDate(values.preferred_date)
    }
  })
}

const openReportPrintModal=reportType=>{
  openWorkflowModal({
    title:'Print report',
    description:'Choose the reporting window for the printable SkyBook report.',
    submitLabel:'Print report',
    fields:[
      {
        name:'period',
        label:'Reporting window',
        type:'select',
        value:'month',
        options:[
          {value:'day',label:'Day'},
          {value:'week',label:'Week'},
          {value:'month',label:'Month'},
          {value:'all',label:'All time'}
        ],
        required:true
      }
    ],
    onSubmit:async values=>{
      printSkyBookReport(reportType,values.period)
    }
  })
}

const openRefundWorkspaceForBooking=(booking,reason='')=>{
  if(!booking||!nodes.refundBookingId||!nodes.refundAmount||!nodes.refundReason)return
  const invoice=getBookingInvoices(booking.id)[0]
  const payments=getBookingPayments(booking.id)
  const paidAmount=sumAmounts(payments,'amount_received')||sumAmounts(payments,'amount')
  const suggestedAmount=Math.max(0,Number(paidAmount || invoice?.total_amount || booking.total_amount || 0))
  switchTab('refunds')
  nodes.refundBookingId.value=booking.id
  nodes.refundAmount.value=suggestedAmount ? String(Number(suggestedAmount.toFixed(2))) : ''
  nodes.refundReason.value=reason||''
  renderRefundsWorkbench()
  window.setTimeout(()=>nodes.refundAmount?.focus(),80)
}

const openReservationDeclineModal=defaultReason=>{
  openWorkflowModal({
    title:'Decline reservation',
    description:'Record why this reservation should not move into the live booking workspace.',
    submitLabel:'Decline reservation',
    fields:[
      {
        name:'reason',
        label:'Decline reason',
        type:'textarea',
        value:defaultReason||'Reservation declined after review.',
        required:true,
        helper:'This reason is stored in the reservation history and internal notes.'
      }
    ],
    onSubmit:async values=>{
      if(!state.selectedBookingId)return
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{ status:'cancelled', payment_status:'cancelled', reason:values.reason, notes:values.reason }
      })
      await createActivityNote(state.selectedBookingId,`Reservation declined: ${values.reason}`)
      await refreshAdmin('Reservation declined.')
    }
  })
}

const openTrashWorkflowModal=({recordType,reasonPlaceholder,successMessage,nextTab})=>{
  const recordLabel=String(recordType||'record').trim()||'record'
  const lowerRecordLabel=recordLabel.toLowerCase()
  openWorkflowModal({
    title:`Delete ${lowerRecordLabel}`,
    description:`Confirm deletion and record why this ${lowerRecordLabel} should leave the active review queue. It will stay in trash with full history for audit and restore.`,
    submitLabel:`Delete ${lowerRecordLabel}`,
    fields:[
      {
        name:'reason',
        label:'Deletion reason',
        type:'textarea',
        placeholder:reasonPlaceholder,
        required:true,
        helper:'A reason is required and appears in the recovery center and audit history.'
      },
      {
        name:'confirm_delete',
        label:`I confirm this ${lowerRecordLabel} should be deleted from active reservation review.`,
        type:'checkbox'
      }
    ],
    onSubmit:async values=>{
      if(!state.selectedBookingId)return
      const reason=normalizeText(values.reason)
      if(!reason)throw new Error('A deletion reason is required.')
      if(values.confirm_delete!==true)throw new Error('Confirm deletion before continuing.')
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}/trash`,{
        method:'POST',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{ reason }
      })
      await refreshAdmin(successMessage)
      switchTab(nextTab)
    }
  })
}

const openBookingCancellationModal=()=>{
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  if(!booking)return
  const paymentRecords=getBookingPayments(booking.id)
  const hasPaidExposure=(sumAmounts(paymentRecords,'amount_received')||sumAmounts(paymentRecords,'amount'))>0
  openWorkflowModal({
    title:'Cancel booking',
    description:'Choose a valid cancellation reason and capture the consultant comment before moving the booking to cancelled.',
    submitLabel:'Cancel booking',
    fields:[
      {
        name:'reason_type',
        label:'Cancellation reason',
        type:'select',
        value:'payment_overdue',
        options:CANCELLATION_REASON_OPTIONS,
        required:true,
        helper:'This places the record in the Cancelled booking pocket.'
      },
      {
        name:'consultant_comment',
        label:'Consultant comment',
        type:'textarea',
        placeholder:'Add the specific context, approval, or guest communication note.',
        required:true,
        helper:'Stored on the booking timeline and internal notes.'
      },
      {
        name:'process_refund',
        label:'Open the refund workflow after cancellation',
        type:'checkbox',
        checked:hasPaidExposure
      }
    ],
    onSubmit:async values=>{
      const reasonOption=CANCELLATION_REASON_OPTIONS.find(option=>option.value===values.reason_type)
      const reason=[reasonOption?.label||values.reason_type,values.consultant_comment].filter(Boolean).join(' - ')
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{
          workflow_action:'cancel_booking',
          status:'cancelled',
          payment_status:'cancelled',
          reason,
          reason_type:values.reason_type,
          cancellation_reason_type:values.reason_type,
          consultant_comment:values.consultant_comment,
          metadata:{
            ...normalizeJsonRecord(booking.metadata),
            cancellation:{
              reason_type:values.reason_type,
              reason,
              consultant_comment:values.consultant_comment,
              cancelled_at:new Date().toISOString()
            }
          }
        }
      })
      state.bookingQuickFilter='cancelled'
      await refreshAdmin(values.process_refund ? 'Booking cancelled. Refund workflow is ready.' : 'Booking cancelled.')
      if(values.process_refund){
        openRefundWorkspaceForBooking(booking,reason)
      }else{
        renderBookings()
      }
    }
  })
}

const openNoShowWorkflowModal=()=>{
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  if(!booking)return
  openWorkflowModal({
    title:'Mark booking as no-show',
    description:'Capture why the guest did not take the service without treating the booking as completed or cancelled.',
    submitLabel:'Save no-show',
    fields:[
      {
        name:'reason',
        label:'No-show reason',
        type:'textarea',
        value:'Guest did not arrive for departure.',
        required:true
      }
    ],
    onSubmit:async values=>{
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}`,{
        method:'PATCH',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{
          workflow_action:'no_show',
          status:'no_show',
          reason:values.reason,
          notes:values.reason,
          metadata:{
            ...normalizeJsonRecord(booking.metadata),
            no_show:{
              reason:values.reason,
              recorded_at:new Date().toISOString()
            }
          }
        }
      })
      await refreshAdmin('Booking marked as no-show.')
    }
  })
}

const openRescheduleWorkflowModal=()=>{
  if(!state.selectedBookingId)return
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  openWorkflowModal({
    title:'Reschedule booking',
    description:'Move the booking to a new service date and record the reason for the change.',
    submitLabel:'Save reschedule',
    fields:[
      {
        name:'preferred_date',
        label:'New preferred date',
        type:'date',
        value:booking?.preferred_date||getTodayKey(),
        required:true
      },
      {
        name:'reason',
        label:'Reschedule reason',
        type:'textarea',
        value:'Booking rescheduled in SkyBook',
        required:true
      }
    ],
    onSubmit:async values=>{
      await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}/reschedule`,{
        method:'POST',
        headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
        body:{
          preferred_date:values.preferred_date,
          reason:values.reason
        }
      })
      await refreshAdmin('Booking rescheduled.')
    }
  })
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
      if(action==='reservations'&&isReviewReservation(booking))openReservationManagementScreen(booking,{scroll:true})
      else openBookingManagementScreen(booking,{scroll:true})
    }
  }
  if(customerId){
    const customer=state.customers.find(item=>item.id===customerId)
    if(customer){
      openCustomerModal(customer)
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
  openRescheduleWorkflowModal()
}

const createActivityNote=async(bookingId,note,{isPrivate=true}={})=>{
  if(!bookingId||!note)return
  await bookingAdminShared.apiRequest('admin/notes',{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{ booking_id:bookingId, note, is_private:isPrivate }
  })
}

const generatePaymentLink=async booking=>{
  if(!booking?.id)return
  const response=await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}/payment-link`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{reuse_existing:false}
  })
  let copied=false
  if(response?.payment_link){
    copied=await copyTextToClipboard(response.payment_link).then(()=>true).catch(()=>false)
  }
  response.copied=copied
  return response
}

const handleManualPaymentSave=async form=>{
  const data=new FormData(form)
  const bookingId=String(data.get('booking_id')||state.selectedBookingId||'').trim()
  const paymentType=String(data.get('payment_type')||'eft').trim()
  const body={
    payment_type:paymentType,
    amount:Number(data.get('amount')||0),
    provider_reference:String(data.get('provider_reference')||'').trim(),
    terminal_serial_number:String(data.get('terminal_serial_number')||'').trim(),
    batch_number:String(data.get('batch_number')||'').trim(),
    notes:String(data.get('notes')||'').trim()
  }
  if(paymentType==='card'&&(!body.terminal_serial_number||!body.batch_number)){
    throw new Error('Card payments require terminal serial number and batch number.')
  }
  await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}/payments`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body
  })
  await refreshAdmin('Manual payment loaded on the booking.')
}

const issueClientInvoice=async booking=>{
  if(!booking?.id)return
  const response=await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(booking.id)}/client-invoice`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{}
  })
  if(response?.version?.signed_url){
    window.open(response.version.signed_url,'_blank','noopener,noreferrer')
  }
  await refreshAdmin('Client invoice generated.')
}

const syncManualPaymentCardRequirements=form=>{
  if(!form)return
  const requiresCardDetails=form.querySelector('[name="payment_type"]')?.value==='card'
  form.querySelectorAll('[data-card-payment-field]').forEach(wrapper=>{
    const input=wrapper.querySelector('input')
    if(input)input.required=requiresCardDetails
    wrapper.hidden=!requiresCardDetails
    wrapper.classList.toggle('is-required',requiresCardDetails)
    wrapper.classList.toggle('is-hidden',!requiresCardDetails)
  })
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

const syncBookingQuantityMode=()=>{
  const service=state.services.find(s=>s.slug===nodes.bookingService?.value)
  const hasAdultChild=service?.adult_price!=null&&Number(service.adult_price)>0
  if(nodes.bookingQuantityWrap)nodes.bookingQuantityWrap.hidden=hasAdultChild
  if(nodes.bookingQuantity)nodes.bookingQuantity.required=!hasAdultChild
  if(nodes.bookingAdultWrap)nodes.bookingAdultWrap.hidden=!hasAdultChild
  if(nodes.bookingChildWrap)nodes.bookingChildWrap.hidden=!hasAdultChild
}

const handleBookingSave=async event=>{
  event.preventDefault()
  const returnToReservationManagement=state.activeTab==='reservation-management'
  const wasEditing=Boolean(state.selectedBookingId)
  const previousSelectedId=state.selectedBookingId
  const existingBooking=state.bookings.find(item=>item.id===previousSelectedId)||null
  const requestedStatus=nodes.bookingStatus.value
  const requestedPaymentStatus=nodes.bookingPaymentStatus.value
  const isReservationAcceptanceWorkflow=returnToReservationManagement&&wasEditing&&!isReviewReservation({status:requestedStatus})
  const payload={
    reference:nodes.bookingReference.value.trim(),
    brand_code:nodes.bookingBrand?.value||bookingAdminShared.readConfig().brandCode||'true-travel',
    source:nodes.bookingSource?.value||'admin',
    service_slug:nodes.bookingService.value,
    status:(!wasEditing||isReservationAcceptanceWorkflow) ? requestedStatus : (existingBooking?.status||requestedStatus),
    payment_status:(!wasEditing||isReservationAcceptanceWorkflow) ? requestedPaymentStatus : (existingBooking?.payment_status||requestedPaymentStatus),
    preferred_date:nodes.bookingDate.value,
    adult_quantity:Number(nodes.bookingAdultQuantity?.value||0),
    child_quantity:Number(nodes.bookingChildQuantity?.value||0),
    quantity:(()=>{const a=Number(nodes.bookingAdultQuantity?.value||0);const c=Number(nodes.bookingChildQuantity?.value||0);return(a+c)>0?a+c:Number(nodes.bookingQuantity.value||1)})(),
    guide_name:nodes.bookingGuideName?.value.trim()||'',
    notes:nodes.bookingNotes.value.trim(),
    metadata:{
      ...(existingBooking?.metadata||{}),
      custom_fields:collectBookingCustomFieldValues()
    },
    customer:{
      full_name:nodes.bookingCustomerName.value.trim(),
      email:nodes.bookingCustomerEmail.value.trim(),
      phone:nodes.bookingCustomerPhone.value.trim(),
      whatsapp:nodes.bookingCustomerPhone.value.trim()
    }
  }
  if(isReservationAcceptanceWorkflow)payload.workflow_action='accept_reservation'
  const shouldOpenAcceptedBookingRecord=isReservationAcceptanceWorkflow
  const pendingAcceptedBookingWindow=shouldOpenAcceptedBookingRecord
    ? openPendingBookingRecordWindow({
      reference:payload.reference,
      customer_name:payload.customer.full_name
    })
    : null
  const originalSaveButtonLabel=nodes.bookingSaveButton?.textContent||''
  if(shouldOpenAcceptedBookingRecord&&nodes.bookingSaveButton){
    nodes.bookingSaveButton.disabled=true
    nodes.bookingSaveButton.textContent='Accepting...'
    nodes.bookingSaveButton.classList.add('is-loading')
    setAdminStatus('Accepting reservation changes and preparing the full booking view...')
  }
  try{
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
    clearBookingEditorDraft()
    closeBookingModal()
    if(returnToReservationManagement && isReviewReservation(savedBooking)){
      openReservationManagementScreen(savedBooking,{scroll:true})
      setAdminStatus(wasEditing ? 'Reservation updated.' : 'Reservation created.')
      return
    }
    if(returnToReservationManagement && !isReviewReservation(savedBooking)){
      renderReservations()
      renderReservationDetail()
      const opened=navigatePendingBookingRecordWindow(pendingAcceptedBookingWindow,savedBooking.id)
      if(opened)setAdminStatus('Reservation accepted. Full booking view opened in a new page.')
      else setAdminStatus('Reservation accepted. Pop-up was blocked, so open the booking from the Bookings table.',true)
      return
    }
    openBookingManagementScreen(savedBooking,{scroll:true})
    setAdminStatus(wasEditing ? 'Booking updated and management screen opened.' : 'Booking created and management screen opened.')
    return
  }
  closePendingBookingRecordWindow(pendingAcceptedBookingWindow)
  if(shouldOpenAcceptedBookingRecord&&nodes.bookingSaveButton){
    nodes.bookingSaveButton.disabled=false
    nodes.bookingSaveButton.textContent=originalSaveButtonLabel||'Save Booking'
    nodes.bookingSaveButton.classList.remove('is-loading')
  }
  closeBookingModal()
  clearBookingEditorDraft()
  renderAll()
  setAdminStatus(wasEditing ? 'Booking updated.' : 'Booking created.')
  }catch(error){
    closePendingBookingRecordWindow(pendingAcceptedBookingWindow)
    if(shouldOpenAcceptedBookingRecord&&nodes.bookingSaveButton){
      nodes.bookingSaveButton.disabled=false
      nodes.bookingSaveButton.textContent=originalSaveButtonLabel||'Save Booking'
      nodes.bookingSaveButton.classList.remove('is-loading')
    }
    setAdminStatus(error.message||'Booking could not be saved.',true)
  }
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
    pricing_mode:nodes.servicePricingMode?.value||'fixed',
    base_price:Number(nodes.servicePrice.value||0),
    adult_price:nodes.serviceAdultPrice?.value ? Number(nodes.serviceAdultPrice.value) : null,
    child_price:nodes.serviceChildPrice?.value ? Number(nodes.serviceChildPrice.value) : null,
    preferred_date_mode:nodes.serviceDateRule.value,
    duration_label:nodes.serviceDuration.value.trim(),
    minimum_pax:Math.max(1,Number(nodes.serviceMinPax?.value||1)||1),
    departure_times:getDepartureTimes(),
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
  const trueTravelEmail=String(data.get('supportEmailTrueTravel')||'').trim()||'bookings@truetravelnam.net'
  const iventureEmail=String(data.get('supportEmailIventure')||'').trim()||'info@aerodigital.space'
  const payload={
    currency:bookingAdminShared.normalizeCurrencyCode
      ? bookingAdminShared.normalizeCurrencyCode(String(data.get('currency')||'NAD'))
      : String(data.get('currency')||'NAD'),
    supportEmail:trueTravelEmail,
    supportPhone:String(data.get('supportPhone')||''),
    defaultDepositValue:Number(data.get('defaultDepositValue')||30),
    taxRate:Number(data.get('taxRate')||0),
    serviceFee:Number(data.get('serviceFee')||0),
    supportWhatsApp:String(data.get('supportPhone')||''),
    supportEmailsByBrand:{
      ...(state.settings.supportEmailsByBrand||{}),
      'true-travel':trueTravelEmail,
      iventure:iventureEmail
    }
  }
  await bookingAdminShared.apiRequest('admin/settings',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  })
  await refreshAdmin('Settings saved.')
}

const handleBookingFieldsSave=async event=>{
  event.preventDefault()
  if(!isSuperAdmin()){
    setAdminStatus('Only super admins can edit booking form fields.',true)
    return
  }
  const fields=normalizeBookingFieldDefinitions(collectBookingFieldManagerValues())
  const response=await bookingAdminShared.apiRequest('admin/booking-fields',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{fields}
  })
  state.bookingFormFields=normalizeBookingFieldDefinitions(response?.fields||fields)
  renderBookingFieldManager()
  renderAdminBookingCustomFields(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  await refreshAdmin('Booking form fields saved.')
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
        abundant_resources:Boolean(nodes.resourceAbundant.checked),
        notes:nodes.resourceNotes?.value.trim()||''
      }
    }
  })
  nodes.resourceForm.reset()
  if(nodes.resourceAbundant)nodes.resourceAbundant.checked=true
  if(nodes.resourceNotes)nodes.resourceNotes.value=''
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
  await refreshAdmin('Guest email automation saved.')
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
  await refreshAdmin('Operating partner saved.')
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
  await refreshAdmin('Creditor entry created.')
}

const exportBookingsCsv=()=>{
  const customFields=normalizeBookingFieldDefinitions(state.bookingFormFields).filter(field=>field.is_active!==false)
  const filtered=getFilteredBookings().map(booking=>({
    ...booking,
    operator_name:getBookingOperatorName(booking),
    agent_name:getBookingAgentName(booking),
    booking_source:booking.source||booking.metadata?.source||'website',
    amount_due_now:Number(booking.amount_due_now||0),
    amount_due_later:Number(booking.amount_due_later||0),
    ...Object.fromEntries(customFields.map(field=>{
      const values=getBookingCustomFieldValues(booking)
      return [`custom_${field.id}`,field.type==='checkbox' ? (values[field.id] ? 'Yes' : 'No') : (values[field.id]||'')]
    }))
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
    {key:'total_amount',label:'Total Amount'},
    ...customFields.map(field=>({key:`custom_${field.id}`,label:field.label}))
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
  window.open(getRecordPageUrl(tab,recordId),'_blank','noopener')
}

const writePendingBookingRecordWindow=(targetWindow,booking={})=>{
  if(!targetWindow)return
  try{
    const reference=bookingAdminShared.escapeHtml(booking.reference||'Booking')
    const guest=bookingAdminShared.escapeHtml(booking.customer_name||booking.customer?.full_name||'Guest')
    targetWindow.document.open()
    targetWindow.document.write(`<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Opening booking | SkyBook</title>
<style>
  :root{color-scheme:light;font-family:Manrope,Arial,sans-serif;background:#eef7ff;color:#111820}
  body{min-height:100vh;margin:0;display:grid;place-items:center;background:linear-gradient(135deg,#eef7ff,#d9edfd)}
  article{width:min(520px,calc(100% - 32px));display:grid;grid-template-columns:48px 1fr;gap:18px;align-items:center;padding:28px;border:1px solid #c9deef;border-radius:28px;background:#fff;box-shadow:0 24px 70px rgba(23,105,170,.14)}
  span{width:34px;height:34px;border:3px solid rgba(23,105,170,.16);border-top-color:#1769aa;border-radius:50%;animation:spin .75s linear infinite}
  h1{margin:0 0 8px;font-size:28px;line-height:1.1}
  p{margin:0;color:#52677a;line-height:1.6}
  strong{color:#111820}
  @keyframes spin{to{transform:rotate(360deg)}}
</style>
</head>
<body>
  <article>
    <span aria-hidden="true"></span>
    <div>
      <h1>Opening full booking view</h1>
      <p><strong>${reference}</strong> ${guest ? `- ${guest}` : ''}<br>SkyBook is accepting the reservation and preparing the full booking record.</p>
    </div>
  </article>
</body>
</html>`)
    targetWindow.document.close()
  }catch{}
}

const openPendingBookingRecordWindow=booking=>{
  const targetWindow=window.open('about:blank','_blank')
  if(!targetWindow)return null
  try{ targetWindow.opener=null }catch{}
  writePendingBookingRecordWindow(targetWindow,booking)
  return targetWindow
}

const closePendingBookingRecordWindow=targetWindow=>{
  try{
    if(targetWindow&&!targetWindow.closed)targetWindow.close()
  }catch{}
}

const navigatePendingBookingRecordWindow=(targetWindow,bookingId)=>{
  if(!bookingId)return false
  const recordUrl=new URL(getRecordPageUrl('bookings',bookingId),window.location.href).href
  try{
    if(targetWindow&&!targetWindow.closed){
      targetWindow.location.replace(recordUrl)
      return true
    }
  }catch{}
  const fallbackWindow=window.open(recordUrl,'_blank')
  try{
    if(fallbackWindow)fallbackWindow.opener=null
  }catch{}
  return Boolean(fallbackWindow)
}

const setReservationAcceptanceLoading=(isLoading,message='Accepting reservation and preparing the booking view...')=>{
  if(!nodes.reservationDetail)return
  const shell=nodes.reservationDetail.querySelector('.reservation-management-shell')
  if(!shell)return
  shell.classList.toggle('is-reservation-accepting',isLoading)
  let loader=shell.querySelector('[data-reservation-acceptance-loader]')
  if(isLoading&&!loader){
    loader=document.createElement('div')
    loader.className='reservation-acceptance-loader'
    loader.dataset.reservationAcceptanceLoader='true'
    loader.innerHTML=`
      <span class="admin-loading-spinner" aria-hidden="true"></span>
      <div>
        <strong>Accepting reservation</strong>
        <p>${bookingAdminShared.escapeHtml(message)}</p>
      </div>
    `
    const main=shell.querySelector('.booking-detail-main')
    if(main)main.prepend(loader)
    else shell.prepend(loader)
  }
  if(loader){
    loader.hidden=!isLoading
    const copy=loader.querySelector('p')
    if(copy)copy.textContent=message
  }
  nodes.reservationDetail.querySelectorAll('[data-reservation-action],[data-reservation-nav]').forEach(button=>{
    if(!button.dataset.originalLabel)button.dataset.originalLabel=button.textContent
    button.disabled=isLoading
    button.classList.toggle('is-loading',isLoading&&button.dataset.reservationAction==='accept')
    if(button.dataset.reservationAction==='accept'){
      button.setAttribute('aria-busy',String(isLoading))
      button.textContent=isLoading ? 'Accepting...' : button.dataset.originalLabel
    }
  })
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

nodes.tabs.forEach(node=>{
  if(!node.title){
    const labelNode=[...node.querySelectorAll('span')].find(item=>!item.classList.contains('admin-tab-icon'))
    const label=(labelNode?.textContent||node.textContent||'').trim()
    if(label)node.title=label
  }
  node.addEventListener('click',()=>switchTab(node.dataset.adminTab))
})
document.querySelectorAll('.admin-menu-section').forEach(section=>section.addEventListener('toggle',()=>{
  if(section.open)collapseOtherSidebarSections(section)
}))
nodes.loginForm?.addEventListener('submit',handleLogin)
nodes.logoutButton?.addEventListener('click',()=>{void handleLogout()})
nodes.resetAuthCacheButton?.addEventListener('click',handleAuthCacheReset)
nodes.exportButton.addEventListener('click',exportBookingsCsv)
nodes.quickCreateBooking?.addEventListener('click',openNewBookingWorkspace)
nodes.globalBrandSwitch?.addEventListener('change',()=>{
  state.activeBrandFilter=nodes.globalBrandSwitch.value||''
  if(nodes.bookingFilterBrand)nodes.bookingFilterBrand.value=state.activeBrandFilter
  if(nodes.customerFilterBrand)nodes.customerFilterBrand.value=state.activeBrandFilter
  renderAll()
})
nodes.reservationPipeline?.addEventListener('click',event=>{
  const stage=event.target.closest('[data-pipeline-stage]')?.dataset.pipelineStage
  if(!stage)return
  if(stage==='new')switchTab('reservations')
  else switchTab('bookings')
  if(stage==='reviewed'&&nodes.bookingFilterStatus)nodes.bookingFilterStatus.value='awaiting_payment'
  if(stage==='awaiting'&&nodes.bookingFilterStatus)nodes.bookingFilterStatus.value='awaiting_payment'
  if(stage==='confirmed'&&nodes.bookingFilterStatus)nodes.bookingFilterStatus.value='confirmed'
  if(stage==='completed'&&nodes.bookingFilterStatus)nodes.bookingFilterStatus.value='completed'
  if(stage==='paid'&&nodes.bookingFilterPaymentStatus)nodes.bookingFilterPaymentStatus.value='paid'
  renderBookings()
})
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
nodes.printArrivalsList?.addEventListener('click',()=>{
  try{ openArrivalsPrintModal() }catch(error){ setAdminStatus(error.message||'Could not open arrivals print dialog.',true) }
})
document.querySelectorAll('[data-print-report]').forEach(button=>button.addEventListener('click',()=>{
  try{ openReportPrintModal(button.dataset.printReport||'bookings') }catch(error){ setAdminStatus(error.message||'Could not open report print dialog.',true) }
}))
nodes.reportsArrivalsDate?.addEventListener('change',renderReportsWorkbench)
nodes.printReportArrivals?.addEventListener('click',()=>{
  try{ printArrivalsForDate(nodes.reportsArrivalsDate?.value||getTodayKey()) }catch(error){ setAdminStatus(error.message||'Could not print arrivals list.',true) }
})
nodes.bookingForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleBookingSave,'Saving booking'))
nodes.bookingForm.addEventListener('input',scheduleBookingEditorAutosave)
window.addEventListener('pointerdown',unlockSkybookNotificationSound,{once:true,passive:true})
window.addEventListener('keydown',unlockSkybookNotificationSound,{once:true})
nodes.bookingForm.addEventListener('change',event=>{
  if(event.target===nodes.bookingBrand){
    const currentValues=collectBookingCustomFieldValues()
    renderAdminBookingCustomFields(null,currentValues)
    if(!state.selectedBookingId){
      syncBookingReferenceField({brandCode:nodes.bookingBrand?.value||'',forceNew:true})
    }
  }
  if(event.target===nodes.bookingService)syncBookingQuantityMode()
  scheduleBookingEditorAutosave()
})
nodes.bookingNewButton.addEventListener('click',openNewBookingWorkspace)
nodes.closeBookingModalButton?.addEventListener('click',closeBookingModal)
nodes.closeCustomerModalButton?.addEventListener('click',closeCustomerModal)
nodes.closeWorkflowModalButton?.addEventListener('click',closeWorkflowModal)
nodes.workflowModalCancelButton?.addEventListener('click',closeWorkflowModal)
nodes.workflowModalForm?.addEventListener('submit',event=>{
  event.preventDefault()
  const onSubmit=state.workflowModalConfig?.onSubmit
  if(typeof onSubmit!=='function'){
    closeWorkflowModal()
    return
  }
  const values=readWorkflowModalValues(event.target)
  setActionButtonLoading(nodes.workflowModalSubmitButton,true,'Working')
  Promise.resolve(onSubmit(values,event.target))
    .then(()=>closeWorkflowModal())
    .catch(error=>setAdminStatus(error.message||'Workflow action failed.',true))
    .finally(()=>{
      setActionButtonLoading(nodes.workflowModalSubmitButton,false)
    })
})
nodes.serviceFilterBrand?.addEventListener('change',renderServices)
nodes.openServiceModalButton?.addEventListener('click',()=>openServiceModal())
nodes.closeServiceModalButton?.addEventListener('click',closeServiceModal)
nodes.serviceForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleServiceSave,'Saving service'))
nodes.adminUserForm?.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleAdminUserSave,'Saving user'))
nodes.adminUserRole?.addEventListener('change',()=>renderAdminUserPermissionEditor(collectPermissionOverrides(),nodes.adminUserRole.value))
nodes.settingsForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleSettingsSave,'Saving settings'))
nodes.bookingFieldsForm?.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleBookingFieldsSave,'Saving fields'))
nodes.addBookingFieldButton?.addEventListener('click',()=>{
  state.bookingFormFields=normalizeBookingFieldDefinitions([...collectBookingFieldManagerValues(),createEmptyBookingField()])
  renderBookingFieldManager()
})
nodes.bookingFieldsList?.addEventListener('click',event=>{
  const removeButton=event.target.closest('[data-remove-booking-field]')
  if(!removeButton)return
  state.bookingFormFields=normalizeBookingFieldDefinitions(collectBookingFieldManagerValues()).filter((_,index)=>index!==Number(removeButton.dataset.removeBookingField))
  renderBookingFieldManager()
})
nodes.emailAutomationForm?.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleEmailAutomationSave,'Saving automation'))
nodes.emailTemplatesForm.addEventListener('submit',event=>{
  event.preventDefault()
  handleFormSubmitWithLoading(event,()=>handleTemplateSave(),'Saving template')
})
nodes.scheduleForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleScheduleSave,'Saving schedule'))
nodes.blackoutForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleBlackoutSave,'Saving blackout'))
nodes.couponForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleCouponSave,'Saving coupon'))
nodes.voucherForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleVoucherSave,'Saving voucher'))
nodes.agentForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleAgentSave,'Saving partner'))
nodes.resourceForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleResourceSave,'Saving resource'))
nodes.resourceAbundant?.addEventListener('change',syncResourceCapacityState)
nodes.refundForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleRefundSave,'Saving refund'))
nodes.automationRulesForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleAutomationSave,'Saving rules'))
nodes.portalSettingsForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handlePortalSave,'Saving portal settings'))
nodes.webhookForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleWebhookSave,'Saving webhook'))
nodes.operatorForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleOperatorSave,'Saving operator'))
nodes.officeInvoiceForm.addEventListener('submit',event=>handleFormSubmitWithLoading(event,handleOfficeInvoiceSave,'Saving invoice'))

nodes.bookingsTable.addEventListener('click',event=>{
  if(event.target.closest('a,button,input,select,textarea,label,[role="button"]'))return
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
  const reservation=state.bookings.find(item=>item.id===reservationId)
  if(reservation)openReservationManagementScreen(reservation,{scroll:true})
})

nodes.reportsArrivalsTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-booking-id]')
  const bookingId=row?.dataset.bookingId||''
  if(!bookingId)return
  handleCommandNavigation('bookings',bookingId)
})

nodes.bookingTrashTable?.addEventListener('click',event=>{
  const action=event.target.dataset.trashAction
  const bookingId=event.target.dataset.bookingId||event.target.closest('[data-trash-booking-id]')?.dataset.trashBookingId
  if(action!=='restore'||!bookingId)return
  void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}/restore`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{}
  }).then(()=>refreshAdmin('Booking restored from trash.')).catch(error=>setAdminStatus(error.message||'Booking restore failed.',true))
})

nodes.reservationTrashTable?.addEventListener('click',event=>{
  const action=event.target.dataset.trashAction
  const bookingId=event.target.dataset.bookingId||event.target.closest('[data-trash-booking-id]')?.dataset.trashBookingId
  if(action!=='restore'||!bookingId)return
  void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(bookingId)}/restore`,{
    method:'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{}
  }).then(()=>refreshAdmin('Reservation restored from trash.')).catch(error=>setAdminStatus(error.message||'Reservation restore failed.',true))
})

nodes.reservationTrashSearch?.addEventListener('input',renderReservationTrash)
nodes.reservationTrashArchivedBy?.addEventListener('input',renderReservationTrash)
nodes.bookingTrashSearch?.addEventListener('input',renderBookingTrash)
nodes.bookingTrashArchivedBy?.addEventListener('input',renderBookingTrash)

nodes.customersTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-customer-id]')
  if(!row)return
  const customer=state.customers.find(item=>item.id===row.dataset.customerId)
  if(!customer)return
  openCustomerModal(customer)
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
  const navigationAction=event.target.closest('[data-reservation-nav]')?.dataset.reservationNav
  if(navigationAction==='back'){
    switchTab('reservations')
    return
  }
  if(navigationAction==='booking-workspace'){
    const reservationBooking=state.bookings.find(item=>item.id===state.selectedBookingId)
    if(reservationBooking)openBookingManagementScreen(reservationBooking,{scroll:true})
    return
  }
  const actionButton=event.target.closest('[data-reservation-action]')
  const action=actionButton?.dataset.reservationAction
  if(!action||!state.selectedBookingId)return
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  if(!booking)return
  if(action==='edit'||action==='accept-with-changes'){
    const modalBooking=action==='accept-with-changes'
      ? {...booking,status:'awaiting_payment',payment_status:booking.payment_status||'pending',__statusWorkflow:'accept_reservation'}
      : booking
    openBookingModal(modalBooking)
    return
  }
  if(action==='decline'||action==='decline-template'){
    const defaultReason=actionButton?.dataset.declineReason||'Reservation declined after review.'
    openReservationDeclineModal(defaultReason)
    return
  }
  if(action==='trash'||action==='delete'){
    openTrashWorkflowModal({
      recordType:'Reservation',
      reasonPlaceholder:'Duplicate or invalid reservation request.',
      successMessage:'Reservation deleted and moved to trash.',
      nextTab:'reservation-trash'
    })
    return
  }
  if(action==='accept'){
    const reservationId=state.selectedBookingId
    if(!booking.guide_name&&!booking.metadata?.guide_name){
      setAdminStatus('A guide must be assigned before accepting this reservation. Edit the reservation and add the guide name.',true)
      return
    }
    const pendingWindow=openPendingBookingRecordWindow(booking)
    setReservationAcceptanceLoading(true,'Accepting this reservation and opening the full booking view in a new page.')
    setAdminStatus('Accepting reservation and preparing the full booking view...')
    void (async()=>{
      try{
        await bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(reservationId)}`,{
          method:'PATCH',
          headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
          body:{ workflow_action:'accept_reservation', status:'awaiting_payment', payment_status:'pending', reason:'Reservation accepted and moved to bookings.' }
        })
        await createActivityNote(reservationId,'Reservation accepted and moved to bookings.')
        await refreshAdmin('Reservation accepted. Full booking view opened in a new page.')
        const acceptedBooking=state.bookings.find(item=>item.id===reservationId)
        if(!acceptedBooking){
          closePendingBookingRecordWindow(pendingWindow)
          setAdminStatus('Reservation accepted, but the booking record was not found after sync. Open Bookings to continue.',true)
          return
        }
        const opened=navigatePendingBookingRecordWindow(pendingWindow,acceptedBooking.id)
        if(!opened){
          setAdminStatus('Reservation accepted. Pop-up was blocked, so open the booking from the Bookings table.',true)
          return
        }
        setAdminStatus('Reservation accepted. Full booking view opened in a new page.')
      }catch(error){
        closePendingBookingRecordWindow(pendingWindow)
        setReservationAcceptanceLoading(false)
        setAdminStatus(error.message||'Reservation acceptance failed.',true)
      }
    })()
  }
})

nodes.bookingDetail.addEventListener('click',event=>{
  const actionButton=event.target.closest('button')
  const actionElement=event.target.closest('[data-booking-action],[data-booking-inline-action]')
  const action=actionElement?.dataset.bookingAction
  const inlineAction=actionElement?.dataset.bookingInlineAction
  const runDetailButtonAction=(task,errorMessage,label='Working')=>{
    void runWithActionLoading(actionButton,task,label).catch(error=>setAdminStatus(error.message||errorMessage,true))
  }
  if(inlineAction==='toggle-functions'){
    state.bookingFunctionsCollapsed=!state.bookingFunctionsCollapsed
    renderBookingDetail()
    return
  }
  if(inlineAction==='open-changelog'){
    openBookingChangelogPage(state.selectedBookingId)
    return
  }
  if(inlineAction==='clear-operator'&&state.selectedBookingId){
    runDetailButtonAction(()=>bookingAdminShared.apiRequest('admin/booking-operators',{
      method:'POST',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{
        booking_id:state.selectedBookingId,
        operator_id:'',
        commission_amount:0
      }
    }).then(()=>refreshAdmin('Booking assignment cleared.')),'Assignment update failed.','Clearing assignment')
    return
  }
  if(inlineAction==='clear-discount'){
    const discountForm=event.target.closest('form[data-inline-form="booking-discount"]')||nodes.bookingDetail.querySelector('form[data-inline-form="booking-discount"]')
    if(discountForm)runDetailButtonAction(()=>handleBookingDiscountSave(discountForm,{clear:true}),'Discount update failed.','Clearing discount')
    return
  }
  if(inlineAction==='duplicate'){
    runDetailButtonAction(()=>handleBookingDuplicate(),'Booking duplication failed.','Duplicating')
    return
  }
  if(inlineAction==='edit-booking'){
    const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
    if(booking)openBookingModal(booking)
    return
  }
  if(inlineAction==='generate-payment-link'){
    const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
    if(booking){
      runDetailButtonAction(()=>generatePaymentLink(booking).then(response=>refreshAdmin(response?.copied ? 'Payment link generated and copied.' : 'Payment link generated.')),'Payment link generation failed.','Generating link')
    }
    return
  }
  if(inlineAction==='copy-payment-link'){
    const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
    const paymentLink=getBookingPaymentLink(booking)
    if(paymentLink){
      void copyTextToClipboard(paymentLink).then(()=>setAdminStatus('Payment link copied.')).catch(error=>setAdminStatus(error.message||'Payment link could not be copied.',true))
    }else{
      setAdminStatus('Generate a payment link first.',true)
    }
    return
  }
  if(inlineAction==='load-payment'){
    const paymentForm=nodes.bookingDetail.querySelector('form[data-inline-form="manual-payment"]')
    paymentForm?.scrollIntoView?.({behavior:'smooth',block:'center'})
    window.setTimeout(()=>paymentForm?.querySelector('[name="amount"]')?.focus?.(),180)
    return
  }
  if(inlineAction==='issue-client-invoice'){
    const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
    if(booking){
      runDetailButtonAction(()=>issueClientInvoice(booking),'Client invoice failed.','Generating invoice')
    }
    return
  }
  if(inlineAction==='trash-booking'){
    setAdminStatus('Only reservations can be moved to trash. Cancel this booking with a reason instead.',true)
    return
  }
  if(inlineAction==='reschedule'){
    runDetailButtonAction(()=>handleBookingReschedule(),'Booking reschedule failed.','Rescheduling')
    return
  }
  if(inlineAction==='portal-access'){
    setAdminStatus('Guest portal links are disabled. Use booking-specific payment links and internal documents.',true)
    return
  }
  if(inlineAction==='memories-focus'){
    const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
    if(normalizeText(booking?.status)!=='completed'){
      setAdminStatus('Finalise the booking before uploading tour memories.',true)
      return
    }
    const fileInput=nodes.bookingDetail.querySelector('form[data-inline-form="memories"] input[type="file"]')
    fileInput?.scrollIntoView?.({behavior:'smooth',block:'center'})
    window.setTimeout(()=>fileInput?.focus?.(),260)
    return
  }
  if(inlineAction==='complete-task'&&actionElement?.dataset.taskId){
    runDetailButtonAction(()=>bookingAdminShared.apiRequest(`admin/booking-tasks/${encodeURIComponent(actionElement.dataset.taskId)}`,{
      method:'PATCH',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
      body:{ status:'done' }
    }).then(()=>refreshAdmin('Task completed.')),'Task update failed.','Completing task')
    return
  }
  if(inlineAction==='note-template'){
    const noteInput=nodes.bookingDetail.querySelector('form[data-inline-form="note"] textarea[name="note"]')
    if(noteInput)noteInput.value=actionElement?.dataset.templateValue||''
    return
  }
  if(inlineAction?.startsWith('document:')){
    runDetailButtonAction(()=>handleDocumentGeneration(inlineAction.split(':')[1]),'Document generation failed.','Generating document')
    return
  }
  if(inlineAction?.startsWith('portal:')){
    setAdminStatus('Guest portal actions are disabled in SkyBook.',true)
    return
  }
  if(!action||!state.selectedBookingId)return
  if(action==='cancelled'){
    openBookingCancellationModal()
    return
  }
  setAdminStatus('Booking status is controlled by SkyBook workflows. Use payment, cancellation, reschedule, or automation actions instead.',true)
})

nodes.bookingDetail.addEventListener('submit',event=>{
  const form=event.target.closest('[data-inline-form]')
  if(!form)return
  event.preventDefault()
  const formType=form.dataset.inlineForm
  const submitButton=event.submitter||form.querySelector('button[type="submit"]')
  const runInlineFormAction=(task,errorMessage,label='Saving')=>{
    void runWithActionLoading(submitButton,task,label).catch(error=>setAdminStatus(error.message||errorMessage,true))
  }
  if(formType==='operator-assignment'){
    runInlineFormAction(()=>handleBookingOperatorAssignmentSave(form),'Assignment update failed.','Saving assignment')
    return
  }
  if(formType==='commercial-structure'){
    runInlineFormAction(()=>handleBookingCommercialStructureSave(form),'Commercial structure update failed.','Saving commercials')
    return
  }
  if(formType==='booking-discount'){
    runInlineFormAction(()=>handleBookingDiscountSave(form),'Discount could not be saved.','Saving discount')
    return
  }
  if(formType==='ownership'){
    runInlineFormAction(()=>handleBookingOwnershipSave(form),'Ownership update failed.','Saving owner')
    return
  }
  if(formType==='manual-payment'){
    runInlineFormAction(()=>handleManualPaymentSave(form),'Payment could not be loaded.','Loading payment')
    return
  }
  if(formType==='note'){
    runInlineFormAction(()=>handleBookingNoteSave(form),'Note could not be saved.','Saving note')
    return
  }
  if(formType==='task'){
    runInlineFormAction(()=>handleBookingTaskSave(form),'Task could not be saved.','Adding task')
    return
  }
  if(formType==='memories'){
    runInlineFormAction(()=>handleMemoryUploadSave(form),'Tour memories could not be uploaded.','Uploading')
    return
  }
})

nodes.bookingDetail.addEventListener('change',event=>{
  const form=event.target.closest('form[data-inline-form="manual-payment"]')
  if(form)syncManualPaymentCardRequirements(form)
})

nodes.platformOperationsTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-booking-id]')
  const bookingId=row?.dataset.bookingId||''
  if(!bookingId)return
  handleCommandNavigation('bookings',bookingId)
})

nodes.platformConfigTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-booking-id]')
  const bookingId=row?.dataset.bookingId||''
  if(!bookingId)return
  handleCommandNavigation('bookings',bookingId)
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
nodes.desktopSidebarToggle?.addEventListener('click',toggleDesktopSidebar)
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
  if(event.key==='Escape'&&state.isWorkflowModalOpen){
    closeWorkflowModal()
    return
  }
  if(event.key==='Escape'&&document.body.classList.contains('is-sidebar-open')){
    closeMobileSidebar()
  }
})

window.addEventListener('resize',()=>{
  syncManagementActionHeaders()
  if(!isMobileSidebarViewport())closeMobileSidebar()
  syncDesktopSidebarCollapse()
})

window.addEventListener('scroll',syncManagementActionHeaders,{passive:true})
window.addEventListener('focus',()=>{ void syncAdminInBackground() })
document.addEventListener('visibilitychange',()=>{
  if(!document.hidden)void syncAdminInBackground()
})

setBookingFiltersCollapsed(true)
syncResourceCapacityState()
syncDesktopSidebarCollapse()

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
        stopLiveAdminSync()
        renderSession()
        redirectToLogin()
        return
      }
      startLiveAdminSync()
      if(session.access_token!==previousToken && ['SIGNED_IN','TOKEN_REFRESHED'].includes(event)){
        const quietRecordRefresh=isRecordWorkspaceOpen()
        void refreshAdmin('Admin session refreshed.',quietRecordRefresh ? {silent:true,updateStatus:false} : {}).catch(error=>setAuthStatus(error.message||'Admin session refresh failed.',true))
      }
    })
    const { data:{ session } }=await client.auth.getSession()
    state.session=session
    renderSession()
    if(session){
      await refreshAdmin('Authenticated and loaded live booking data.')
      startLiveAdminSync()
      void syncAdminInBackground()
    }else{
      stopLiveAdminSync()
      redirectToLogin()
    }
  }catch(error){
    setAuthStatus(error.message||'Admin authentication is not configured.',true)
  }
})()
