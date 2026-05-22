(()=>{
  const shared=window.TrueTravelBooking||window.bookingAdminShared
  const nodes={
    loadingCard:document.getElementById('changelogLoadingCard'),
    loadingTitle:document.getElementById('changelogLoadingTitle'),
    loadingStatus:document.getElementById('changelogLoadingStatus'),
    content:document.getElementById('changelogContent')
  }
  const params=new URLSearchParams(window.location.search)
  const bookingId=String(params.get('booking')||'').trim()
  const escapeHtml=value=>shared?.escapeHtml ? shared.escapeHtml(value) : String(value??'')
  const safeText=value=>String(value??'').trim()
  const normalize=value=>safeText(value).toLowerCase()
  const formatDateTime=value=>{
    if(!value)return 'Not captured'
    const date=new Date(value)
    if(Number.isNaN(date.getTime()))return safeText(value)
    return new Intl.DateTimeFormat('en-NA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(date)
  }
  const formatDate=value=>{
    if(!value)return 'To be confirmed'
    const date=new Date(`${value}T00:00:00`)
    if(Number.isNaN(date.getTime()))return safeText(value)
    return new Intl.DateTimeFormat('en-NA',{day:'2-digit',month:'short',year:'numeric'}).format(date)
  }
  const money=(value,currency='NAD')=>shared.formatMoney(Number(value||0),currency||'NAD')
  const statusBadge=(value,label='')=>`<span class="status-badge is-${escapeHtml((normalize(value)||'neutral').replace(/[^a-z0-9_-]+/g,'-'))}">${escapeHtml(label||safeText(value)||'Unknown')}</span>`
  const sortDesc=items=>[...items].sort((left,right)=>new Date(right.when||0)-new Date(left.when||0))
  const filterByBooking=(rows=[])=>(rows||[]).filter(row=>String(row?.booking_id||'')===String(bookingId)||String(row?.id||'')===String(bookingId))
  const setError=message=>{
    if(nodes.loadingTitle)nodes.loadingTitle.textContent='Changelog could not load'
    if(nodes.loadingStatus){
      nodes.loadingStatus.textContent=message
      nodes.loadingStatus.classList.add('is-error')
    }
  }
  const getBookingRecordUrl=()=>`booking-admin.html?tab=bookings&view=booking&booking=${encodeURIComponent(bookingId)}`
  const redirectToLogin=()=>{
    const next=encodeURIComponent(`booking-changelog.html?booking=${encodeURIComponent(bookingId)}`)
    window.location.replace(`login.html?next=${next}`)
  }
  const getCustomerName=(booking,customers=[])=>{
    const customer=customers.find(item=>String(item.id||'')===String(booking.customer_id||''))
    return booking.customer_name||customer?.full_name||'Guest'
  }
  const buildChangelogItems=(payload,booking)=>{
    const currency=booking.currency_code||booking.currency||'NAD'
    const items=[]
    filterByBooking(payload.status_history).forEach(row=>items.push({
      kind:'Status',
      when:row.created_at,
      title:`Status changed to ${safeText(row.to_status||row.status||'updated')}`,
      detail:row.reason||'Status updated',
      meta:row.actor_label||row.actor_type||'System'
    }))
    filterByBooking(payload.admin_notes).forEach(row=>items.push({
      kind:'Note',
      when:row.created_at,
      title:'Internal note added',
      detail:row.note||'No note text captured',
      meta:row.is_private ? 'Private office note' : 'Shared note'
    }))
    filterByBooking(payload.payments).forEach(row=>items.push({
      kind:'Payment',
      when:row.paid_at||row.created_at,
      title:`Payment ${safeText(row.status||'recorded')}`,
      detail:`${money(row.amount_received||row.amount||0,row.currency_code||currency)} via ${safeText(row.provider||'manual')}`,
      meta:row.provider_reference||'No provider reference'
    }))
    filterByBooking(payload.payment_transactions).forEach(row=>items.push({
      kind:'Transaction',
      when:row.created_at,
      title:`${safeText(row.transaction_type||'payment')} transaction`,
      detail:`${money(row.amount||0,row.currency_code||currency)} ${safeText(row.status||'recorded')}`,
      meta:row.provider_reference||row.gateway_reference||'No gateway reference'
    }))
    filterByBooking(payload.invoices).forEach(row=>items.push({
      kind:'Invoice',
      when:row.issued_at||row.created_at,
      title:`Invoice ${row.invoice_number||'created'}`,
      detail:`Total ${money(row.total_amount||0,row.currency_code||currency)} / balance ${money(row.balance_amount||0,row.currency_code||currency)}`,
      meta:row.status||'issued'
    }))
    filterByBooking(payload.office_invoices).forEach(row=>items.push({
      kind:'Office',
      when:row.issued_at||row.created_at,
      title:`Office invoice ${row.invoice_number||'created'}`,
      detail:`${money(row.total_amount||0,row.currency_code||currency)} payable to ${safeText(row.partner_name||row.payee_name||'partner')}`,
      meta:row.status||'issued'
    }))
    filterByBooking(payload.email_logs).forEach(row=>items.push({
      kind:'Email',
      when:row.sent_at||row.created_at,
      title:row.subject||`Email ${row.template_key||'queued'}`,
      detail:`To ${safeText(row.recipient_email||'recipient not captured')}`,
      meta:row.status||'queued'
    }))
    filterByBooking(payload.booking_tasks).forEach(row=>items.push({
      kind:'Task',
      when:row.updated_at||row.created_at,
      title:row.title||'Task updated',
      detail:row.description||`Task status ${safeText(row.status||'open')}`,
      meta:`${safeText(row.team||'operations')} / ${safeText(row.priority||'normal')}`
    }))
    filterByBooking(payload.booking_discounts).forEach(row=>items.push({
      kind:'Discount',
      when:row.created_at,
      title:`${safeText(row.discount_type||'manual')} discount`,
      detail:`${money(row.amount||row.discount_amount||0,currency)} - ${safeText(row.consultant_comment||row.reason||'No consultant comment')}`,
      meta:row.created_by ? 'Consultant recorded' : 'System recorded'
    }))
    filterByBooking(payload.refunds).forEach(row=>items.push({
      kind:'Refund',
      when:row.created_at,
      title:`Refund ${safeText(row.status||'logged')}`,
      detail:`${money(row.amount||0,row.currency_code||currency)} - ${safeText(row.reason||'No reason captured')}`,
      meta:row.provider_reference||'Manual refund record'
    }))
    filterByBooking(payload.booking_document_versions).forEach(row=>items.push({
      kind:'Document',
      when:row.created_at,
      title:`${safeText(row.document_type||'document')} v${row.version_number||1}`,
      detail:row.file_name||row.document_number||'Document generated',
      meta:row.status||'generated'
    }))
    return sortDesc(items)
  }
  const render=payload=>{
    const booking=(payload.bookings||[]).find(item=>String(item.id||'')===String(bookingId))
    if(!booking)throw new Error('That booking was not found in SkyBook.')
    const customerName=getCustomerName(booking,payload.customers||[])
    const items=buildChangelogItems(payload,booking)
    document.title=`${booking.reference||'Booking'} Changelog | SkyBook`
    nodes.content.innerHTML=`
      <header class="booking-changelog-hero">
        <div>
          <span class="booking-chip">Booking changelog</span>
          <h1>${escapeHtml(booking.reference||'Booking')}</h1>
          <p>${escapeHtml(customerName)} / ${escapeHtml(booking.service_name||'Service')} / ${escapeHtml(formatDate(booking.preferred_date))}</p>
        </div>
        <div class="booking-changelog-actions">
          <a class="booking-button ghost" href="${escapeHtml(getBookingRecordUrl())}">Back To Booking</a>
          <button class="booking-button" type="button" id="refreshChangelog">Refresh</button>
        </div>
      </header>
      <section class="detail-overview-grid booking-info-section">
        <article class="detail-card"><span>Status</span><strong>${statusBadge(booking.status)}</strong></article>
        <article class="detail-card"><span>Payment</span><strong>${statusBadge(booking.payment_status)}</strong></article>
        <article class="detail-card"><span>Total</span><strong>${money(booking.total_amount||0,booking.currency_code||booking.currency)}</strong></article>
        <article class="detail-card"><span>Entries</span><strong>${escapeHtml(String(items.length))}</strong></article>
      </section>
      <section class="booking-changelog-timeline">
        ${items.length ? items.map(item=>`
          <article class="booking-changelog-item">
            <div class="booking-changelog-date">
              <span>${escapeHtml(formatDateTime(item.when))}</span>
              <strong>${escapeHtml(item.kind)}</strong>
            </div>
            <div class="booking-changelog-card">
              <div>
                <h2>${escapeHtml(item.title)}</h2>
                <p>${escapeHtml(item.detail)}</p>
              </div>
              <span class="status-badge is-neutral">${escapeHtml(item.meta)}</span>
            </div>
          </article>
        `).join('') : '<article class="booking-panel"><h2>No changelog entries yet</h2><p class="muted-copy">SkyBook will log status changes, notes, payments, invoices, emails, tasks, documents, and discounts here.</p></article>'}
      </section>
    `
    nodes.content.hidden=false
    nodes.loadingCard.hidden=true
    document.getElementById('refreshChangelog')?.addEventListener('click',()=>{ void load() })
  }
  const load=async()=>{
    try{
      if(!bookingId)throw new Error('No booking id was supplied.')
      if(!shared?.createSupabaseClient)throw new Error('SkyBook shared booking library did not load. Refresh and try again.')
      if(nodes.loadingCard)nodes.loadingCard.hidden=false
      if(nodes.content)nodes.content.hidden=true
      const client=await shared.createSupabaseClient()
      const { data:{ session }={} }=await client.auth.getSession()
      if(!session?.access_token){
        redirectToLogin()
        return
      }
      const payload=await shared.apiRequest('admin/bootstrap',{
        headers:shared.getAuthHeaders(session.access_token)
      })
      render(payload||{})
    }catch(error){
      setError(error.message||'Unable to load the booking changelog.')
    }
  }
  void load()
})()
