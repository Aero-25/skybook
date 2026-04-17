const bookingAdminShared=window.TrueTravelBooking

const state={
  session:null,
  user:null,
  profile:null,
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
  resources:[],
  resourceAllocations:[],
  invoices:[],
  officeInvoices:[],
  refunds:[],
  webhookEndpoints:[],
  supportedLanguages:[],
  supportedCurrencies:[],
  customerAccounts:[],
  calendarConnections:[],
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
  reportsOverviewCards:document.getElementById('reportsOverviewCards'),
  reportsStatusTable:document.getElementById('reportsStatusTable'),
  reportsGuestInvoicesTable:document.getElementById('reportsGuestInvoicesTable'),
  reportsOfficeInvoicesTable:document.getElementById('reportsOfficeInvoicesTable'),
  bookingFilterSearch:document.getElementById('bookingFilterSearch'),
  bookingFilterBrand:document.getElementById('bookingFilterBrand'),
  bookingFilterStatus:document.getElementById('bookingFilterStatus'),
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

const switchTab=tab=>{
  nodes.tabs.forEach(node=>node.classList.toggle('is-active',node.dataset.adminTab===tab))
  nodes.views.forEach(node=>node.classList.toggle('is-active',node.dataset.adminView===tab))
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
  return state.bookings.filter(booking=>{
    const haystack=[booking.reference,booking.customer_name,booking.customer_email,booking.service_name].join(' ').toLowerCase()
    if(search&&!haystack.includes(search))return false
    if(brand&&booking.brand_code!==brand)return false
    if(status&&booking.status!==status)return false
    return true
  })
}

const renderDashboard=()=>{
  const totalRevenue=state.bookings.reduce((sum,booking)=>sum+Number(booking.total_amount||0),0)
  const metrics=[
    {label:'Total bookings',value:String(state.bookings.length)},
    {label:'True Travel',value:String(state.bookings.filter(item=>item.brand_code==='true-travel').length)},
    {label:'Iventure',value:String(state.bookings.filter(item=>item.brand_code==='iventure').length)},
    {label:'Pending review',value:String(state.bookings.filter(item=>item.status==='pending').length)},
    {label:'Awaiting payment',value:String(state.bookings.filter(item=>item.status==='awaiting_payment').length)},
    {label:'Revenue tracked',value:bookingAdminShared.formatMoney(totalRevenue,state.settings.currency||'NAD')},
    {label:'Operators loaded',value:String(state.operators.length)},
    {label:'Office invoices',value:String(state.officeInvoices.length)}
  ]
  nodes.dashboardCards.innerHTML=metrics.map(metric=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(metric.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(metric.value)}</strong>
    </article>
  `).join('')
}

const renderReports=()=>{
  const overview=state.reports?.overview||{}
  const cards=[
    {label:'Gross Revenue',value:bookingAdminShared.formatMoney(overview.gross_revenue||0,state.settings.currency||'NAD')},
    {label:'Paid Revenue',value:bookingAdminShared.formatMoney(overview.paid_revenue||0,state.settings.currency||'NAD')},
    {label:'Guest Outstanding',value:bookingAdminShared.formatMoney(overview.guest_outstanding||0,state.settings.currency||'NAD')},
    {label:'Office Payables',value:bookingAdminShared.formatMoney(overview.office_payables||0,state.settings.currency||'NAD')},
    {label:'Refund Exposure',value:bookingAdminShared.formatMoney(overview.refund_exposure||0,state.settings.currency||'NAD')},
    {label:'Total Bookings',value:String(overview.total_bookings||0)}
  ]
  nodes.reportsOverviewCards.innerHTML=cards.map(card=>`
    <article class="metric-card">
      <span>${bookingAdminShared.escapeHtml(card.label)}</span>
      <strong>${bookingAdminShared.escapeHtml(card.value)}</strong>
    </article>
  `).join('')
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
}

const renderBookings=()=>{
  const filtered=getFilteredBookings()
  const brandMap=new Map(state.brands.map(brand=>[brand.code,brand.name]))
  nodes.bookingsTable.innerHTML=filtered.map(booking=>`
    <tr data-booking-id="${bookingAdminShared.escapeHtml(booking.id)}">
      <td>${bookingAdminShared.escapeHtml(booking.reference)}</td>
      <td>${bookingAdminShared.escapeHtml(brandMap.get(booking.brand_code)||booking.brand_code||'')}</td>
      <td>${bookingAdminShared.escapeHtml(booking.customer_name)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.service_name)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.status)}</td>
      <td>${bookingAdminShared.escapeHtml(booking.preferred_date||'TBC')}</td>
      <td>${bookingAdminShared.formatMoney(booking.total_amount,booking.currency||state.settings.currency)}</td>
    </tr>
  `).join('')
}

const renderBookingDetail=()=>{
  const booking=state.bookings.find(item=>item.id===state.selectedBookingId)
  const brandName=state.brands.find(brand=>brand.code===booking?.brand_code)?.name||booking?.brand_code||''
  nodes.bookingDetail.innerHTML=booking ? `
    <div class="detail-grid">
      <div><span>Reference</span><strong>${bookingAdminShared.escapeHtml(booking.reference)}</strong></div>
      <div><span>Brand</span><strong>${bookingAdminShared.escapeHtml(brandName)}</strong></div>
      <div><span>Status</span><strong>${bookingAdminShared.escapeHtml(booking.status)}</strong></div>
      <div><span>Payment</span><strong>${bookingAdminShared.escapeHtml(booking.payment_status)}</strong></div>
      <div><span>Preferred date</span><strong>${bookingAdminShared.escapeHtml(booking.preferred_date||'TBC')}</strong></div>
      <div><span>Customer</span><strong>${bookingAdminShared.escapeHtml(booking.customer_name)}</strong></div>
      <div><span>Email</span><strong>${bookingAdminShared.escapeHtml(booking.customer_email)}</strong></div>
      <div><span>Phone</span><strong>${bookingAdminShared.escapeHtml(booking.customer_phone||'')}</strong></div>
      <div><span>Total</span><strong>${bookingAdminShared.formatMoney(booking.total_amount,booking.currency||state.settings.currency)}</strong></div>
    </div>
    <div class="detail-actions">
      <button type="button" data-booking-action="confirmed">Confirm</button>
      <button type="button" data-booking-action="awaiting_payment">Awaiting Payment</button>
      <button type="button" data-booking-action="completed">Complete</button>
      <button type="button" data-booking-action="cancelled">Cancel</button>
      <button type="button" data-booking-action="paid">Mark Paid</button>
      <button type="button" data-booking-action="resend">Resend Email</button>
    </div>
  ` : '<p class="muted-copy">Choose a booking to review, edit, or change status.</p>'
}

const renderServiceOptions=()=>{
  const options=state.services.map(service=>`<option value="${bookingAdminShared.escapeHtml(service.slug)}">${bookingAdminShared.escapeHtml(service.name)}</option>`).join('')
  nodes.bookingService.innerHTML=`<option value="">Choose service</option>${options}`
  if(nodes.scheduleService)nodes.scheduleService.innerHTML=`<option value="">Choose service</option>${options}`
  if(nodes.blackoutService)nodes.blackoutService.innerHTML=`<option value="">All services</option>${options}`
  if(nodes.officeOperatorId){
    nodes.officeOperatorId.innerHTML=`<option value="">Choose operator</option>${state.operators.map(operator=>`<option value="${bookingAdminShared.escapeHtml(operator.id)}">${bookingAdminShared.escapeHtml(operator.company_name)}</option>`).join('')}`
  }
  if(nodes.officeAgentId){
    nodes.officeAgentId.innerHTML=`<option value="">Choose agent</option>${state.agents.map(agent=>`<option value="${bookingAdminShared.escapeHtml(agent.id)}">${bookingAdminShared.escapeHtml(agent.company_name)}</option>`).join('')}`
  }
}

const renderBrandOptions=()=>{
  if(!nodes.bookingFilterBrand)return
  nodes.bookingFilterBrand.innerHTML=`<option value="">All brands</option>${state.brands.map(brand=>`<option value="${bookingAdminShared.escapeHtml(brand.code)}">${bookingAdminShared.escapeHtml(brand.name)}</option>`).join('')}`
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

const renderAll=()=>{
  renderSession()
  renderDashboard()
  renderBookings()
  renderBookingDetail()
  renderServiceOptions()
  renderBrandOptions()
  renderServices()
  renderCustomers()
  renderPayments()
  renderSettings()
  renderEmailTemplates()
  renderReports()
  renderEngine()
  renderPlatform()
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
  state.resources=payload.resources||[]
  state.resourceAllocations=payload.resource_allocations||[]
  state.invoices=payload.invoices||[]
  state.officeInvoices=payload.office_invoices||[]
  state.refunds=payload.refunds||[]
  state.webhookEndpoints=payload.webhook_endpoints||[]
  state.supportedLanguages=payload.supported_languages||[]
  state.supportedCurrencies=payload.supported_currencies||[]
  state.customerAccounts=payload.customer_accounts||[]
  state.calendarConnections=payload.calendar_connections||[]
  state.settings={...bookingAdminShared.readConfig(),...(payload.settings||{})}
  state.emailTemplates=payload.email_templates||bookingAdminShared.clone(bookingAdminShared.DEFAULT_EMAIL_TEMPLATES)
  state.automationRules={...state.automationRules,...(payload.automation_rules||{})}
  state.portalSettings={...state.portalSettings,...(payload.portal_settings||{})}
  state.integrationSettings={...state.integrationSettings,...(payload.integration_settings||{})}
  state.reportingSettings={...state.reportingSettings,...(payload.reporting_settings||{})}
  state.reports={...state.reports,...(payload.reports||{})}
  fillBookingForm(state.bookings.find(item=>item.id===state.selectedBookingId)||null)
  fillServiceForm(state.services.find(item=>item.id===state.selectedServiceId)||null)
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
nodes.bookingForm.addEventListener('submit',event=>{void handleBookingSave(event)})
nodes.bookingNewButton.addEventListener('click',()=>{
  state.selectedBookingId=''
  fillBookingForm(null)
  renderBookingDetail()
})
nodes.serviceForm.addEventListener('submit',event=>{void handleServiceSave(event)})
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
