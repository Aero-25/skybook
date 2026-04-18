const bookingAdminShared=window.TrueTravelBooking

const state={
  session:null,
  user:null,
  profile:null,
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
  settings:bookingAdminShared.readConfig(),
  emailTemplates:bookingAdminShared.clone(bookingAdminShared.DEFAULT_EMAIL_TEMPLATES),
  automationRules:{
    autoConfirmPaidBookings:true,
    autoCompletePastConfirmedBookings:false,
    autoCancelExpiredAwaitingPayment:false,
    awaitingPaymentExpiryHours:48
  },
  portalSettings:{
    enabled:true,
    allowBookingLookup:true,
    allowSelfServiceRequests:false
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
  selectedBookingId:'',
  selectedServiceId:''
}

const nodes={
  authGate:document.getElementById('adminAuthGate'),
  appShell:document.getElementById('adminAppShell'),
  authStatus:document.getElementById('authStatus'),
  loginForm:document.getElementById('loginForm'),
  logoutButton:document.getElementById('logoutButton'),
  sessionLabel:document.getElementById('sessionLabel'),
  adminStatus:document.getElementById('bookingAdminStatus'),
  tabs:[...document.querySelectorAll('[data-admin-tab]')],
  views:[...document.querySelectorAll('[data-admin-view]')],
  dashboardCards:document.getElementById('dashboardCards'),
  dashboardActionQueue:document.getElementById('dashboardActionQueue'),
  dashboardArrivalsTable:document.getElementById('dashboardArrivalsTable'),
  dashboardPendingTable:document.getElementById('dashboardPendingTable'),
  dashboardUnpaidTable:document.getElementById('dashboardUnpaidTable'),
  dashboardRefundsTable:document.getElementById('dashboardRefundsTable'),
  dashboardPayoutsTable:document.getElementById('dashboardPayoutsTable'),
  dashboardRecentBookingsTable:document.getElementById('dashboardRecentBookingsTable'),
  calendarViewButtons:[...document.querySelectorAll('[data-calendar-view]')],
  calendarFocusDate:document.getElementById('calendarFocusDate'),
  calendarSummaryCards:document.getElementById('calendarSummaryCards'),
  calendarCanvas:document.getElementById('calendarCanvas'),
  reportsOverviewCards:document.getElementById('reportsOverviewCards'),
  reportsStatusTable:document.getElementById('reportsStatusTable'),
  reportsGuestInvoicesTable:document.getElementById('reportsGuestInvoicesTable'),
  reportsOfficeInvoicesTable:document.getElementById('reportsOfficeInvoicesTable'),
  bookingFilterSearch:document.getElementById('bookingFilterSearch'),
  bookingFilterBrand:document.getElementById('bookingFilterBrand'),
  bookingFilterStatus:document.getElementById('bookingFilterStatus'),
  bookingFilterPaymentStatus:document.getElementById('bookingFilterPaymentStatus'),
  bookingFilterService:document.getElementById('bookingFilterService'),
  bookingFilterOperator:document.getElementById('bookingFilterOperator'),
  bookingFilterAgent:document.getElementById('bookingFilterAgent'),
  bookingFilterDateFrom:document.getElementById('bookingFilterDateFrom'),
  bookingFilterDateTo:document.getElementById('bookingFilterDateTo'),
  bookingsTable:document.getElementById('adminBookingsTable'),
  bookingDetail:document.getElementById('adminBookingDetail'),
  bookingForm:document.getElementById('adminBookingForm'),
  bookingReference:document.getElementById('adminBookingReference'),
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
  servicesTable:document.getElementById('adminServicesTable'),
  serviceForm:document.getElementById('adminServiceForm'),
  serviceId:document.getElementById('adminServiceId'),
  serviceName:document.getElementById('adminServiceName'),
  serviceSlug:document.getElementById('adminServiceSlug'),
  serviceCategory:document.getElementById('adminServiceCategory'),
  servicePrice:document.getElementById('adminServicePrice'),
  serviceDateRule:document.getElementById('adminServiceDateRule'),
  serviceDuration:document.getElementById('adminServiceDuration'),
  serviceSummary:document.getElementById('adminServiceSummary'),
  serviceHighlights:document.getElementById('adminServiceHighlights'),
  serviceActive:document.getElementById('adminServiceActive'),
  customersTable:document.getElementById('adminCustomersTable'),
  paymentsTable:document.getElementById('adminPaymentsTable'),
  adminUsersTable:document.getElementById('adminUsersTable'),
  adminUserForm:document.getElementById('adminUserForm'),
  adminUserId:document.getElementById('adminUserId'),
  adminUserEmail:document.getElementById('adminUserEmail'),
  adminUserFullName:document.getElementById('adminUserFullName'),
  adminUserRole:document.getElementById('adminUserRole'),
  adminUserActive:document.getElementById('adminUserActive'),
  adminUserPermissions:document.getElementById('adminUserPermissions'),
  adminUserSaveButton:document.getElementById('adminUserSaveButton'),
  settingsForm:document.getElementById('bookingSettingsForm'),
  emailTemplatesForm:document.getElementById('emailTemplatesForm'),
  exportButton:document.getElementById('exportBookingsCsv'),
  engineSchedulesTable:document.getElementById('adminEngineSchedulesTable'),
  commercialToolsTable:document.getElementById('adminCommercialToolsTable'),
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
  webhookForm:document.getElementById('adminWebhookForm'),
  webhookName:document.getElementById('adminWebhookName'),
  webhookUrl:document.getElementById('adminWebhookUrl'),
  webhookEvents:document.getElementById('adminWebhookEvents'),
  operatorForm:document.getElementById('adminOperatorForm'),
  operatorCode:document.getElementById('adminOperatorCode'),
  operatorCompany:document.getElementById('adminOperatorCompany'),
  operatorCommissionType:document.getElementById('adminOperatorCommissionType'),
  operatorCommissionValue:document.getElementById('adminOperatorCommissionValue'),
  operatorTerms:document.getElementById('adminOperatorTerms'),
  officeInvoiceForm:document.getElementById('adminOfficeInvoiceForm'),
  officeInvoiceBookingId:document.getElementById('adminOfficeInvoiceBookingId'),
  officeInvoiceType:document.getElementById('adminOfficeInvoiceType'),
  officePayeeType:document.getElementById('adminOfficePayeeType'),
  officeOperatorId:document.getElementById('adminOfficeOperatorId'),
  officeAgentId:document.getElementById('adminOfficeAgentId'),
  officeCommissionBase:document.getElementById('adminOfficeCommissionBase'),
  officeCommissionAmount:document.getElementById('adminOfficeCommissionAmount'),
  officeInvoiceNotes:document.getElementById('adminOfficeInvoiceNotes')
}

const setAdminStatus=(message,isError=false)=>{
  nodes.adminStatus.textContent=message
  nodes.adminStatus.classList.toggle('is-error',isError)
}

const setAuthStatus=(message,isError=false)=>{
  nodes.authStatus.textContent=message
  nodes.authStatus.classList.toggle('is-error',isError)
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
  if(['confirmed','completed','paid','active','default'].includes(normalized))return 'is-good'
  if(['pending','awaiting_payment','partially_paid','queued','issued'].includes(normalized))return 'is-warn'
  if(['cancelled','failed','refunded','inactive'].includes(normalized))return 'is-bad'
  return 'is-neutral'
}

const renderStatusBadge=(value,label='')=>`<span class="status-badge ${getStatusBadgeClass(value)}">${bookingAdminShared.escapeHtml(label||String(value||'—').replace(/_/g,' '))}</span>`

const sortByDateDesc=(items,key)=>[...items].sort((left,right)=>{
  const leftStamp=parseDateValue(left?.[key])?.getTime()||0
  const rightStamp=parseDateValue(right?.[key])?.getTime()||0
  return rightStamp-leftStamp
})

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

const sumAmounts=(rows,key)=>rows.reduce((sum,row)=>sum+Number(row?.[key]||0),0)

const renderEmptyRow=(colspan,message)=>`<tr><td colspan="${colspan}">${bookingAdminShared.escapeHtml(message)}</td></tr>`

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

const TAB_PERMISSION_MAP={
  dashboard:'dashboard',
  calendar:'calendar',
  reports:'reports',
  bookings:'bookings',
  payments:'payments',
  customers:'customers',
  services:'services',
  engine:'engine',
  platform:'finance',
  settings:'settings',
  emails:'emails',
  'admin-users':'admin_users'
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

const applyAccessControl=()=>{
  nodes.tabs.forEach(node=>{
    const permissionKey=TAB_PERMISSION_MAP[node.dataset.adminTab]
    const isAllowed=permissionKey ? canAccess(permissionKey) : true
    node.hidden=!isAllowed
    node.disabled=!isAllowed
  })
  nodes.views.forEach(node=>{
    const permissionKey=TAB_PERMISSION_MAP[node.dataset.adminView]
    node.hidden=permissionKey ? !canAccess(permissionKey) : false
  })
  const activeTab=nodes.tabs.find(node=>node.classList.contains('is-active') && !node.hidden)?.dataset.adminTab
  if(activeTab)return
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
  const nextTab=TAB_PERMISSION_MAP[tab] && !canAccess(TAB_PERMISSION_MAP[tab])
    ? (nodes.tabs.find(node=>!node.hidden)?.dataset.adminTab||'dashboard')
    : tab
  nodes.tabs.forEach(node=>node.classList.toggle('is-active',node.dataset.adminTab===nextTab))
  nodes.views.forEach(node=>node.classList.toggle('is-active',node.dataset.adminView===nextTab))
}

const requireClient=async()=>{
  if(!bookingAdminShared.createSupabaseClient)throw new Error('Supabase browser client is not configured.')
  return bookingAdminShared.createSupabaseClient()
}

const renderSession=()=>{
  const authenticated=Boolean(state.session?.access_token)
  nodes.authGate.hidden=authenticated
  nodes.appShell.hidden=!authenticated
  nodes.sessionLabel.textContent=authenticated
    ? `${state.profile?.full_name||state.user?.email||'Admin'} · ${state.profile?.role||'admin'}`
    : 'Not signed in'
}

const getFilteredBookings=()=>{
  const search=(nodes.bookingFilterSearch.value||'').trim().toLowerCase()
  const brand=(nodes.bookingFilterBrand.value||'').trim()
  const status=(nodes.bookingFilterStatus.value||'').trim()
  const paymentStatus=(nodes.bookingFilterPaymentStatus?.value||'').trim()
  const serviceSlug=(nodes.bookingFilterService?.value||'').trim()
  const operatorId=(nodes.bookingFilterOperator?.value||'').trim()
  const agentId=(nodes.bookingFilterAgent?.value||'').trim()
  const dateFrom=parseDateValue(nodes.bookingFilterDateFrom?.value||'')
  const dateTo=parseDateValue(nodes.bookingFilterDateTo?.value||'')
  return state.bookings.filter(booking=>{
    const haystack=[booking.reference,booking.customer_name,booking.customer_email,booking.service_name,booking.customer_phone].join(' ').toLowerCase()
    if(search&&!haystack.includes(search))return false
    if(brand&&booking.brand_code!==brand)return false
    if(status&&booking.status!==status)return false
    if(paymentStatus&&booking.payment_status!==paymentStatus)return false
    if(serviceSlug&&booking.service_slug!==serviceSlug)return false
    if(operatorId&&!getBookingOfficeInvoices(booking.id).some(invoice=>String(invoice.operator_id||'')===operatorId))return false
    if(agentId&&!getBookingOfficeInvoices(booking.id).some(invoice=>String(invoice.agent_id||'')===agentId))return false
    const bookingDate=parseDateValue(booking.preferred_date)
    if(dateFrom&&(!bookingDate||bookingDate<dateFrom))return false
    if(dateTo){
      const to=new Date(dateTo)
      to.setHours(23,59,59,999)
      if(!bookingDate||bookingDate>to)return false
    }
    return true
  })
}

const renderDashboard=()=>{
  const todayKey=getTodayKey()
  const totalRevenue=state.bookings.reduce((sum,booking)=>sum+Number(booking.total_amount||0),0)
  const todayArrivals=state.bookings.filter(booking=>sameDate(booking.preferred_date,todayKey))
  const pendingConfirmations=state.bookings.filter(item=>item.status==='pending')
  const unpaidBookings=state.bookings.filter(item=>['pending','unpaid','partially_paid','authorized'].includes(String(item.payment_status||'')) || Number(item.amount_due_later||0)>0)
  const unpaidExposure=unpaidBookings.reduce((sum,booking)=>sum+Number(booking.amount_due_now||0)+Number(booking.amount_due_later||0),0)
  const refundExposure=sumAmounts(state.refunds,'amount')
  const operatorPayoutsDue=state.officeInvoices.filter(invoice=>!['paid','settled','cancelled'].includes(String(invoice.status||'').toLowerCase()))
  const payoutExposure=sumAmounts(operatorPayoutsDue,'total_amount')
  const actionQueue=[
    {label:'Pending confirmations',value:pendingConfirmations.length,meta:'Bookings waiting for ops review'},
    {label:'Today arrivals',value:todayArrivals.length,meta:'Tours or pickups scheduled for today'},
    {label:'Unpaid balances',value:unpaidBookings.length,meta:'Bookings with money still outstanding'},
    {label:'Refund items',value:state.refunds.length,meta:'Refund records to verify or reconcile'},
    {label:'Operator payouts',value:operatorPayoutsDue.length,meta:'Office invoices not yet settled'}
  ]
  const metrics=[
    {label:'Today arrivals',value:String(todayArrivals.length)},
    {label:'Pending confirmations',value:String(pendingConfirmations.length)},
    {label:'Unpaid exposure',value:bookingAdminShared.formatMoney(unpaidExposure,state.settings.currency||'NAD')},
    {label:'Refund exposure',value:bookingAdminShared.formatMoney(refundExposure,state.settings.currency||'NAD')},
    {label:'Operator payouts due',value:bookingAdminShared.formatMoney(payoutExposure,state.settings.currency||'NAD')},
    {label:'Gross revenue',value:bookingAdminShared.formatMoney(totalRevenue,state.settings.currency||'NAD')},
    {label:'True Travel volume',value:String(state.bookings.filter(item=>item.brand_code==='true-travel').length)},
    {label:'Iventure volume',value:String(state.bookings.filter(item=>item.brand_code==='iventure').length)},
    {label:'Resources loaded',value:String(state.resources.length)}
  ]
  nodes.dashboardCards.innerHTML=metrics.map(metric=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(metric.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(metric.value)}</strong>
    </article>
  `).join('')
  nodes.dashboardActionQueue.innerHTML=actionQueue.map(item=>`
    <article class="queue-card">
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
      <td>${bookingAdminShared.escapeHtml(booking.brand_code||'')}</td>
      <td>${bookingAdminShared.escapeHtml(booking.service_name)}</td>
      <td>${bookingAdminShared.escapeHtml(String(booking.quantity||1))}</td>
      <td>${renderStatusBadge(booking.status)}</td>
    </tr>
  `).join('') : renderEmptyRow(5,'No arrivals are scheduled for today.')
  nodes.dashboardPendingTable.innerHTML=pendingConfirmations.length ? pendingConfirmations.slice(0,8).map(booking=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(booking.reference)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.customer_name)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.service_name)}</td>
      <td>${bookingAdminShared.escapeHtml(formatDateLabel(booking.preferred_date))}</td>
      <td>${renderStatusBadge(booking.status)}</td>
    </tr>
  `).join('') : renderEmptyRow(5,'No bookings are waiting for confirmation.')
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
      <td>${bookingAdminShared.escapeHtml(booking.brand_code||'')}</td>
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

const renderBookings=()=>{
  const filtered=getFilteredBookings()
  const brandMap=new Map(state.brands.map(brand=>[brand.code,brand.name]))
  nodes.bookingsTable.innerHTML=filtered.map(booking=>`
    <tr class="booking-row" data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
      <td>
        <strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong>
        <div class="table-subline">${bookingAdminShared.escapeHtml(booking.customer_email||'')}</div>
      </td>
      <td>${bookingAdminShared.escapeHtml(brandMap.get(booking.brand_code)||booking.brand_code||'')}</td>
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
  const allocations=getBookingAllocations(booking.id)
  const operatorCommission=getBookingOperatorCommission(booking)
  const agentCommission=sumAmounts(officeInvoices.filter(item=>item.agent_id),'commission_amount')
  const guestBalance=Number(invoice?.balance_amount ?? booking.amount_due_later ?? 0)
  const officeExposure=sumAmounts(officeInvoices,'total_amount')
  nodes.bookingDetail.innerHTML=`
    <div class="booking-detail-shell">
      <div class="booking-detail-main">
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
        </section>

        <section class="detail-section">
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
            <div><span>Source</span><strong>${bookingAdminShared.escapeHtml(booking.brand_code||'direct')}</strong></div>
          </div>
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
              <p class="muted-copy">Guest invoice, office invoices, queued emails, and linked allocations.</p>
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
              <p>${allocations.length ? allocations.map(item=>item.resource_name||item.resource_id).join(', ') : 'No resource assignments yet.'}</p>
            </article>
            <article class="detail-card">
              <span>Documents</span>
              <strong>Portal-ready</strong>
              <p>PDF invoices, receipts, manifests, and uploaded files can be attached from the next document layer.</p>
            </article>
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
          </div>
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
  nodes.bookingFilterBrand.innerHTML=`<option value="">All brands</option>${state.brands.map(brand=>`<option value="${bookingAdminShared.escapeHtml(brand.code)}">${bookingAdminShared.escapeHtml(brand.name)}</option>`).join('')}`
  nodes.bookingFilterBrand.value=currentBrandFilter
}

const fillBookingForm=(booking=null)=>{
  nodes.bookingReference.value=booking?.reference||''
  nodes.bookingService.value=booking?.service_slug||''
  nodes.bookingStatus.value=booking?.status||'pending'
  nodes.bookingPaymentStatus.value=booking?.payment_status||'pending'
  nodes.bookingDate.value=booking?.preferred_date||''
  nodes.bookingQuantity.value=booking?.quantity||2
  nodes.bookingCustomerName.value=booking?.customer_name||''
  nodes.bookingCustomerEmail.value=booking?.customer_email||''
  nodes.bookingCustomerPhone.value=booking?.customer_phone||''
  nodes.bookingNotes.value=booking?.notes||booking?.customer_notes||''
  nodes.bookingSaveButton.textContent=booking ? 'Save Booking' : 'Create Booking'
}

const renderServices=()=>{
  nodes.servicesTable.innerHTML=state.services.map(service=>`
    <tr data-service-id="${bookingAdminShared.escapeHtml(service.id)}">
      <td>${bookingAdminShared.escapeHtml(service.name)}</td>
      <td>${bookingAdminShared.escapeHtml(service.category_slug)}</td>
      <td>${bookingAdminShared.formatMoney(service.base_price,service.currency)}</td>
      <td>${bookingAdminShared.escapeHtml(service.preferred_date_mode)}</td>
      <td>${service.is_active ? 'Active' : 'Hidden'}</td>
    </tr>
  `).join('')
}

const fillServiceForm=(service=null)=>{
  nodes.serviceId.value=service?.id||''
  nodes.serviceName.value=service?.name||''
  nodes.serviceSlug.value=service?.slug||''
  nodes.serviceCategory.value=service?.category_slug||'coastal-tours'
  nodes.servicePrice.value=service?.base_price||''
  nodes.serviceDateRule.value=service?.preferred_date_mode||'optional'
  nodes.serviceDuration.value=service?.duration_label||''
  nodes.serviceSummary.value=service?.short_description||''
  nodes.serviceHighlights.value=(service?.highlight_points||[]).join(', ')
  nodes.serviceActive.checked=service?.is_active!==false
}

const renderCustomers=()=>{
  nodes.customersTable.innerHTML=state.customers.map(customer=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(customer.full_name)}</td>
      <td>${bookingAdminShared.escapeHtml(customer.email)}</td>
      <td>${bookingAdminShared.escapeHtml(customer.phone||'')}</td>
      <td>${bookingAdminShared.escapeHtml(customer.booking_count||0)}</td>
      <td>${bookingAdminShared.escapeHtml(customer.last_booking_reference||'')}</td>
    </tr>
  `).join('')
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
  nodes.settingsForm.supportEmail.value=state.settings.supportEmail||''
  nodes.settingsForm.supportPhone.value=state.settings.supportPhone||''
  nodes.settingsForm.defaultDepositValue.value=state.settings.defaultDepositValue||30
  nodes.settingsForm.taxRate.value=state.settings.taxRate||0
  nodes.settingsForm.serviceFee.value=state.settings.serviceFee||0
}

const renderEmailTemplates=()=>{
  nodes.emailTemplatesForm.innerHTML=Object.entries(state.emailTemplates).map(([key,template])=>`
    <article class="template-card">
      <h3>${bookingAdminShared.escapeHtml(key)}</h3>
      <label class="booking-field-full">
        <span>Subject</span>
        <input type="text" data-template-key="${bookingAdminShared.escapeHtml(key)}" data-template-field="subject" value="${bookingAdminShared.escapeHtml(template.subject)}">
      </label>
      <label class="booking-field-full">
        <span>Body</span>
        <textarea rows="8" data-template-key="${bookingAdminShared.escapeHtml(key)}" data-template-field="body">${bookingAdminShared.escapeHtml(template.body)}</textarea>
      </label>
    </article>
  `).join('')
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
    ...state.resources.map(resource=>({label:resource.name,type:`Resource · ${resource.resource_type||'resource'}`,status:resource.is_active===false ? 'Inactive' : 'Active',value:resource.capacity||'--'})),
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
    ...state.operators.map(operator=>({category:'Operator',name:operator.company_name,status:operator.is_active===false ? 'Inactive' : 'Active',value:`${operator.commission_type} ${operator.commission_value}`})),
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

const renderReportsWorkbench=()=>{
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
              <strong>${bookingAdminShared.escapeHtml(brand)}</strong>
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
  nodes.adminUserId.value=user?.id||''
  nodes.adminUserEmail.value=user?.email||''
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
      <td>${bookingAdminShared.escapeHtml(user.email||'')}</td>
      <td>${bookingAdminShared.escapeHtml(String(user.role||'').replace(/_/g,' '))}</td>
      <td>${renderStatusBadge(user.is_active ? 'active' : 'inactive',user.is_active ? 'Active' : 'Inactive')}</td>
      <td>${bookingAdminShared.escapeHtml(Object.entries(user.effective_permissions||({...state.roleDefaults?.[user.role],...(user.permissions||{})})).filter(([,allowed])=>allowed).map(([key])=>key.replace(/_/g,' ')).slice(0,3).join(', ')||'No access')}</td>
    </tr>
  `).join('') || renderEmptyRow(5,'No admin users loaded yet.')
}

const renderEngineWorkbench=()=>{
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
  const opRows=[
    ...state.resources.map(resource=>({label:resource.name,type:`Resource - ${resource.resource_type||'resource'}`,status:resource.is_active===false ? 'Inactive' : 'Active',value:resource.capacity||'--'})),
    ...state.invoices.slice(0,6).map(invoice=>({label:invoice.invoice_number,type:'Invoice',status:invoice.status,value:bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)})),
    ...state.refunds.slice(0,6).map(refund=>({label:refund.booking_id,type:'Refund',status:refund.status,value:bookingAdminShared.formatMoney(refund.amount||0,refund.currency_code||state.settings.currency)}))
  ]
  nodes.platformOperationsTable.innerHTML=opRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(String(row.label||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.type||''))}</td>
      <td>${renderStatusBadge(String(row.status||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
    </tr>
  `).join('') || renderEmptyRow(4,'No resources, invoices, or refunds loaded yet.')

  const configRows=[
    ...state.operators.map(operator=>({category:'Operator',name:operator.company_name,status:operator.is_active===false ? 'Inactive' : 'Active',value:`${operator.commission_type} ${operator.commission_value}`})),
    ...state.officeInvoices.map(invoice=>({category:'Office Invoice',name:invoice.invoice_number,status:invoice.status,value:bookingAdminShared.formatMoney(invoice.total_amount||0,invoice.currency_code||state.settings.currency)})),
    ...state.supportedLanguages.map(language=>({category:'Language',name:language.name,status:language.is_active===false ? 'Inactive' : (language.is_default ? 'Default' : 'Active'),value:language.code})),
    ...state.supportedCurrencies.map(currency=>({category:'Currency',name:currency.name,status:currency.is_active===false ? 'Inactive' : (currency.is_default ? 'Default' : 'Active'),value:`${currency.code} - ${currency.symbol||''}`})),
    ...state.webhookEndpoints.map(webhook=>({category:'Webhook',name:webhook.name,status:webhook.is_active===false ? 'Inactive' : 'Active',value:webhook.target_url})),
    ...state.calendarConnections.map(connection=>({category:'Calendar',name:connection.provider,status:connection.is_active===false ? 'Inactive' : 'Active',value:connection.external_calendar_id}))
  ]
  nodes.platformConfigTable.innerHTML=configRows.map(row=>`
    <tr>
      <td>${bookingAdminShared.escapeHtml(String(row.category||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.name||''))}</td>
      <td>${renderStatusBadge(String(row.status||''))}</td>
      <td>${bookingAdminShared.escapeHtml(String(row.value||''))}</td>
    </tr>
  `).join('') || renderEmptyRow(4,'No platform configuration records loaded yet.')
}

const renderAll=()=>{
  renderSession()
  applyAccessControl()
  renderDashboard()
  renderCalendar()
  renderBookings()
  renderBookingDetail()
  renderServiceOptions()
  renderBrandOptions()
  renderServices()
  renderCustomers()
  renderPaymentsWorkbench()
  renderAdminUsers()
  renderSettings()
  renderEmailTemplates()
  renderReportsWorkbench()
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
  state.settings={...bookingAdminShared.readConfig(),...(payload.settings||{})}
  state.emailTemplates=payload.email_templates||bookingAdminShared.clone(bookingAdminShared.DEFAULT_EMAIL_TEMPLATES)
  state.automationRules={...state.automationRules,...(payload.automation_rules||{})}
  state.portalSettings={...state.portalSettings,...(payload.portal_settings||{})}
  state.integrationSettings={...state.integrationSettings,...(payload.integration_settings||{})}
  state.reportingSettings={...state.reportingSettings,...(payload.reporting_settings||{})}
  state.reports={...state.reports,...(payload.reports||{})}
  fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  fillServiceForm(state.services.find(item=>item.id===state.selectedServiceId)||null)
  fillAdminUserForm(state.adminUsers.find(item=>item.id===nodes.adminUserId?.value)||null)
  renderAll()
}

const refreshAdmin=async(message='Booking operations console synced.')=>{
  await loadAdminData()
  setAdminStatus(message)
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
  setAdminStatus('Signed out.')
}

const handleBookingSave=async event=>{
  event.preventDefault()
  const payload={
    reference:nodes.bookingReference.value.trim(),
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
  const isEditing=Boolean(state.selectedBookingId)
  await bookingAdminShared.apiRequest(isEditing ? `admin/bookings/${encodeURIComponent(state.selectedBookingId)}` : 'admin/bookings',{
    method:isEditing ? 'PATCH' : 'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  })
  if(!isEditing){
    nodes.bookingForm.reset()
    nodes.bookingQuantity.value=2
    state.selectedBookingId=''
    fillBookingForm(null)
  }
  await refreshAdmin(isEditing ? 'Booking updated.' : 'Booking created.')
}

const handleServiceSave=async event=>{
  event.preventDefault()
  const payload={
    id:nodes.serviceId.value.trim(),
    slug:nodes.serviceSlug.value.trim(),
    name:nodes.serviceName.value.trim(),
    category_slug:nodes.serviceCategory.value,
    base_price:Number(nodes.servicePrice.value||0),
    preferred_date_mode:nodes.serviceDateRule.value,
    duration_label:nodes.serviceDuration.value.trim(),
    short_description:nodes.serviceSummary.value.trim(),
    highlight_points:nodes.serviceHighlights.value.split(',').map(item=>item.trim()).filter(Boolean),
    is_active:nodes.serviceActive.checked
  }
  await bookingAdminShared.apiRequest(payload.id ? `admin/services/${encodeURIComponent(payload.id)}` : 'admin/services',{
    method:payload.id ? 'PATCH' : 'POST',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  })
  state.selectedServiceId=''
  fillServiceForm(null)
  await refreshAdmin('Service saved.')
}

const handleAdminUserSave=async event=>{
  event.preventDefault()
  const payload={
    id:nodes.adminUserId.value.trim(),
    email:nodes.adminUserEmail.value.trim(),
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
    currency:String(data.get('currency')||'NAD'),
    supportEmail:String(data.get('supportEmail')||''),
    supportPhone:String(data.get('supportPhone')||''),
    defaultDepositValue:Number(data.get('defaultDepositValue')||30),
    taxRate:Number(data.get('taxRate')||0),
    serviceFee:Number(data.get('serviceFee')||0),
    supportWhatsApp:String(data.get('supportPhone')||'')
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
      capacity:Number(nodes.resourceCapacity.value||0)||null,
      is_active:true,
      metadata:{source:'admin-ui'}
    }
  })
  nodes.resourceForm.reset()
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
    body:{
      autoConfirmPaidBookings:nodes.automationAutoConfirmPaid.checked,
      autoCompletePastConfirmedBookings:nodes.automationAutoCompletePast.checked,
      awaitingPaymentExpiryHours:Number(nodes.automationExpiryHours.value||48)
    }
  })
  await refreshAdmin('Automation rules saved.')
}

const handlePortalSave=async event=>{
  event.preventDefault()
  await bookingAdminShared.apiRequest('admin/portal-settings',{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:{
      enabled:nodes.portalEnabled.checked,
      allowBookingLookup:nodes.portalLookupEnabled.checked,
      allowSelfServiceRequests:false
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
      commission_type:nodes.operatorCommissionType.value,
      commission_value:Number(nodes.operatorCommissionValue.value||0),
      payout_terms:nodes.operatorTerms.value.trim(),
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
  const csv=bookingAdminShared.toCsv(getFilteredBookings(),[
    {key:'reference',label:'Reference'},
    {key:'brand_code',label:'Brand'},
    {key:'customer_name',label:'Customer'},
    {key:'customer_email',label:'Email'},
    {key:'service_name',label:'Service'},
    {key:'status',label:'Status'},
    {key:'payment_status',label:'Payment Status'},
    {key:'preferred_date',label:'Preferred Date'},
    {key:'total_amount',label:'Total Amount'}
  ])
  const blob=new Blob([csv],{type:'text/csv;charset=utf-8'})
  const url=URL.createObjectURL(blob)
  const anchor=document.createElement('a')
  anchor.href=url
  anchor.download=`true-travel-bookings-${new Date().toISOString().slice(0,10)}.csv`
  anchor.click()
  URL.revokeObjectURL(url)
}

nodes.tabs.forEach(node=>node.addEventListener('click',()=>switchTab(node.dataset.adminTab)))
nodes.loginForm.addEventListener('submit',handleLogin)
nodes.logoutButton.addEventListener('click',()=>{void handleLogout()})
nodes.exportButton.addEventListener('click',exportBookingsCsv)
nodes.bookingFilterSearch.addEventListener('input',renderBookings)
nodes.bookingFilterBrand.addEventListener('change',renderBookings)
nodes.bookingFilterStatus.addEventListener('change',renderBookings)
nodes.bookingFilterPaymentStatus?.addEventListener('change',renderBookings)
nodes.bookingFilterService?.addEventListener('change',renderBookings)
nodes.bookingFilterOperator?.addEventListener('change',renderBookings)
nodes.bookingFilterAgent?.addEventListener('change',renderBookings)
nodes.bookingFilterDateFrom?.addEventListener('change',renderBookings)
nodes.bookingFilterDateTo?.addEventListener('change',renderBookings)
nodes.calendarViewButtons.forEach(button=>button.addEventListener('click',()=>{
  state.calendarView=button.dataset.calendarView||'day'
  renderCalendar()
}))
nodes.calendarFocusDate?.addEventListener('change',()=>{
  state.calendarFocusDate=nodes.calendarFocusDate.value||bookingAdminShared.currentDate()
  renderCalendar()
})
nodes.bookingForm.addEventListener('submit',event=>{void handleBookingSave(event)})
nodes.bookingNewButton.addEventListener('click',()=>{
  state.selectedBookingId=''
  fillBookingForm(null)
  renderBookingDetail()
})
nodes.serviceForm.addEventListener('submit',event=>{void handleServiceSave(event)})
nodes.adminUserForm?.addEventListener('submit',event=>{void handleAdminUserSave(event)})
nodes.adminUserRole?.addEventListener('change',()=>renderAdminUserPermissionEditor(collectPermissionOverrides(),nodes.adminUserRole.value))
nodes.settingsForm.addEventListener('submit',event=>{void handleSettingsSave(event)})
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
  state.selectedBookingId=booking.id
  fillBookingForm(booking)
  renderBookingDetail()
})

nodes.bookingDetail.addEventListener('click',event=>{
  const action=event.target.dataset.bookingAction
  if(!action||!state.selectedBookingId)return
  if(action==='resend'){
    void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}/resend`,{
      method:'POST',
      headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||'')
    }).then(()=>refreshAdmin('Confirmation email re-queued.')).catch(error=>setAdminStatus(error.message||'Email resend failed.',true))
    return
  }
  const payload=action==='paid'
    ? {status:'confirmed',payment_status:'paid'}
    : {status:action}
  void bookingAdminShared.apiRequest(`admin/bookings/${encodeURIComponent(state.selectedBookingId)}`,{
    method:'PATCH',
    headers:bookingAdminShared.getAuthHeaders(state.session?.access_token||''),
    body:payload
  }).then(()=>refreshAdmin(`Booking updated to ${action}.`)).catch(error=>setAdminStatus(error.message||'Booking update failed.',true))
})

nodes.servicesTable.addEventListener('click',event=>{
  const row=event.target.closest('[data-service-id]')
  if(!row)return
  const service=state.services.find(item=>item.id===row.dataset.serviceId)
  if(!service)return
  state.selectedServiceId=service.id
  fillServiceForm(service)
})

nodes.adminUsersTable?.addEventListener('click',event=>{
  const row=event.target.closest('[data-admin-user-id]')
  if(!row)return
  const adminUser=state.adminUsers.find(item=>item.id===row.dataset.adminUserId)
  if(!adminUser)return
  fillAdminUserForm(adminUser)
  switchTab('admin-users')
})

;(async()=>{
  try{
    const client=await requireClient()
    const { data:{ session } }=await client.auth.getSession()
    state.session=session
    renderSession()
    if(session){
      await refreshAdmin('Authenticated and loaded live booking data.')
    }else{
      setAuthStatus('Sign in with your Supabase admin account to manage bookings.')
    }
  }catch(error){
    setAuthStatus(error.message||'Admin authentication is not configured.',true)
  }
})()
