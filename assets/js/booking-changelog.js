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
  const esc=value=>shared?.escapeHtml ? shared.escapeHtml(value) : String(value??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const safe=value=>String(value??'').trim()
  const norm=value=>safe(value).toLowerCase()
  const money=(value,currency='NAD')=>shared.formatMoney(Number(value||0),currency||'NAD')

  const formatDateTime=value=>{
    if(!value)return 'Not captured'
    const d=new Date(value)
    if(Number.isNaN(d.getTime()))return safe(value)
    return new Intl.DateTimeFormat('en-NA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}).format(d)
  }
  const formatDate=value=>{
    if(!value)return 'TBC'
    const d=new Date(`${value}T00:00:00`)
    return Number.isNaN(d.getTime()) ? safe(value) : new Intl.DateTimeFormat('en-NA',{day:'2-digit',month:'long',year:'numeric'}).format(d)
  }

  const setError=message=>{
    if(nodes.loadingTitle)nodes.loadingTitle.textContent='Changelog could not load'
    if(nodes.loadingStatus){nodes.loadingStatus.textContent=message;nodes.loadingStatus.classList.add('is-error')}
  }
  const getBookingRecordUrl=()=>`booking-admin.html?tab=bookings&view=booking&booking=${encodeURIComponent(bookingId)}`
  const redirectToLogin=()=>{
    const next=encodeURIComponent(`booking-changelog.html?booking=${encodeURIComponent(bookingId)}`)
    window.location.replace(`login.html?next=${next}`)
  }

  const getActorName=(userId,actorLabel,staffDirectory=[],adminUsers=[])=>{
    if(userId){
      const staff=[...staffDirectory,...adminUsers].find(p=>String(p.id||'')===String(userId))
      if(staff?.full_name)return staff.full_name
    }
    if(actorLabel){
      if(norm(actorLabel).startsWith('admin:'))return actorLabel.slice(6).trim()||'Admin'
      if(norm(actorLabel)==='admin')return 'SkyBook Admin'
      if(norm(actorLabel)==='system')return 'SkyBook System'
      return actorLabel
    }
    return 'System'
  }

  const kindConfig={
    'Amendment':   {icon:'✏',color:'#5b3fa0',bg:'#f0eaff'},
    'Status':      {icon:'⟳',color:'#1a4fa0',bg:'#e5f0ff'},
    'Note':        {icon:'📝',color:'#0e3a52',bg:'#e8f4fb'},
    'Payment':     {icon:'💳',color:'#1a6640',bg:'#e8f7ee'},
    'Transaction': {icon:'↔',color:'#1a6640',bg:'#e8f7ee'},
    'Invoice':     {icon:'🧾',color:'#9b6b08',bg:'#fff7e8'},
    'Office':      {icon:'🏢',color:'#567087',bg:'#edf2f7'},
    'Email':       {icon:'✉',color:'#0e3a52',bg:'#e8f4fb'},
    'Task':        {icon:'☑',color:'#567087',bg:'#edf2f7'},
    'Discount':    {icon:'%',color:'#a33a3a',bg:'#fee9e9'},
    'Refund':      {icon:'↩',color:'#a33a3a',bg:'#fee9e9'},
    'Document':    {icon:'📄',color:'#567087',bg:'#edf2f7'},
    'Created':     {icon:'✦',color:'#1a6640',bg:'#e8f7ee'},
    'Portal':      {icon:'🔗',color:'#0e3a52',bg:'#e8f4fb'},
    'Health':      {icon:'⚡',color:'#a33a3a',bg:'#fee9e9'},
    'Job':         {icon:'⚙',color:'#567087',bg:'#edf2f7'},
  }

  const renderDiffLines=diffText=>{
    if(!diffText)return ''
    return diffText.split(' | ').map(line=>{
      const m=line.match(/^(.+?):\s*(.+?)\s*→\s*(.+)$/)
      if(m){
        return `<div class="changelog-diff-row">
          <span class="changelog-diff-label">${esc(m[1])}</span>
          <span class="changelog-diff-old">${esc(m[2])}</span>
          <span class="changelog-diff-arrow">→</span>
          <span class="changelog-diff-new">${esc(m[3])}</span>
        </div>`
      }
      return `<div class="changelog-diff-row"><span class="changelog-diff-label">${esc(line)}</span></div>`
    }).join('')
  }

  const buildChangelogItems=(payload,booking,staffDirectory,adminUsers)=>{
    const currency=booking.currency_code||booking.currency||'NAD'
    const filterByB=(rows=[])=>(rows||[]).filter(row=>String(row?.booking_id||'')===String(bookingId)||String(row?.id||'')===String(bookingId))
    const items=[]

    // Status history — split amendments from status changes
    filterByB(payload.status_history).forEach(row=>{
      const actor=getActorName(row.actor_user_id,row.actor_label,staffDirectory,adminUsers)
      const reason=safe(row.reason||'')
      const isAmendment=reason.toLowerCase().startsWith('amendment —')
      const isCreation=!row.from_status
      const statusChanged=row.from_status&&row.from_status!==row.to_status
      if(isCreation){
        items.push({kind:'Created',when:row.created_at,actor,title:'Booking created',detail:reason||'New booking record created in SkyBook',diffText:'',fromStatus:'',toStatus:row.to_status})
      }else if(isAmendment){
        const diffText=reason.replace(/^Amendment — /i,'')
        items.push({kind:'Amendment',when:row.created_at,actor,title:'Booking amended',detail:'Field-level changes recorded below.',diffText,fromStatus:'',toStatus:''})
      }else{
        const label=statusChanged
          ? `Status: ${safe(row.from_status).replace(/_/g,' ')} → ${safe(row.to_status).replace(/_/g,' ')}`
          : `Booking updated (${safe(row.to_status).replace(/_/g,' ')})`
        items.push({kind:'Status',when:row.created_at,actor,title:label,detail:reason,diffText:'',fromStatus:row.from_status,toStatus:row.to_status})
      }
    })

    filterByB(payload.admin_notes).forEach(row=>{
      const actor=getActorName(row.admin_user_id||row.created_by,'',staffDirectory,adminUsers)
      items.push({kind:'Note',when:row.created_at,actor,title:row.is_private ? 'Private internal note' : 'Shared note',detail:row.note||'No note text captured',diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.payments).forEach(row=>{
      items.push({kind:'Payment',when:row.paid_at||row.created_at,actor:'Finance',title:`Payment ${safe(row.status||'recorded')}`,detail:`${money(row.amount_received||row.amount||0,row.currency_code||currency)} via ${safe(row.provider||'manual')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.payment_transactions).forEach(row=>{
      items.push({kind:'Transaction',when:row.created_at,actor:'Payment gateway',title:`${safe(row.transaction_type||'payment').replace(/_/g,' ')} transaction`,detail:`${money(row.amount||0,row.currency_code||currency)} — ${safe(row.status||'recorded')} — Ref: ${safe(row.provider_reference||row.gateway_reference||'—')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.invoices).forEach(row=>{
      items.push({kind:'Invoice',when:row.issued_at||row.created_at,actor:'Finance',title:`Invoice ${row.invoice_number||'created'}`,detail:`Total ${money(row.total_amount||0,row.currency_code||currency)} / balance ${money(row.balance_amount||0,row.currency_code||currency)} — Status: ${safe(row.status||'issued')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.office_invoices).forEach(row=>{
      items.push({kind:'Office',when:row.issued_at||row.created_at,actor:'Finance',title:`Office invoice ${row.invoice_number||'created'}`,detail:`${money(row.total_amount||0,row.currency_code||currency)} payable to ${safe(row.partner_name||row.payee_name||'partner')} — ${safe(row.status||'issued')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.email_logs).forEach(row=>{
      const actor=getActorName(row.created_by,'SkyBook Queue',staffDirectory,adminUsers)
      items.push({kind:'Email',when:row.sent_at||row.queued_at||row.created_at,actor,title:row.subject||`Email ${safe(row.template_key||'queued').replace(/_/g,' ')}`,detail:`To: ${safe(row.recipient_email||'recipient not captured')} — Status: ${safe(row.status||'queued')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.booking_tasks).forEach(row=>{
      const actor=getActorName(row.updated_by||row.created_by,'',staffDirectory,adminUsers)
      items.push({kind:'Task',when:row.updated_at||row.created_at,actor,title:safe(row.title||'Task'),detail:`Status: ${safe(row.status||'open')} — ${safe(row.description||'')||'No description'}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.booking_discounts).forEach(row=>{
      const actor=getActorName(row.created_by,'Consultant',staffDirectory,adminUsers)
      items.push({kind:'Discount',when:row.created_at,actor,title:`${safe(row.discount_type||'manual').replace(/_/g,' ')} discount applied`,detail:`${money(row.amount||row.discount_amount||0,currency)} — ${safe(row.consultant_comment||row.reason||'No comment')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.refunds).forEach(row=>{
      const actor=getActorName(row.created_by,'Finance',staffDirectory,adminUsers)
      items.push({kind:'Refund',when:row.created_at,actor,title:`Refund ${safe(row.status||'logged')}`,detail:`${money(row.amount||0,row.currency_code||currency)} — ${safe(row.reason||'No reason captured')} — Ref: ${safe(row.provider_reference||'Manual')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.booking_document_versions).forEach(row=>{
      const actor=getActorName(row.created_by,'SkyBook System',staffDirectory,adminUsers)
      items.push({kind:'Document',when:row.created_at,actor,title:`${safe(row.document_type||'document').replace(/_/g,' ')} v${row.version_number||1}`,detail:safe(row.file_name||row.document_number||'Document generated'),diffText:'',fromStatus:'',toStatus:''})
    })

    filterByB(payload.portal_requests||payload.portalRequests||[]).forEach(row=>{
      items.push({kind:'Portal',when:row.created_at,actor:'Guest portal',title:`Guest ${safe(row.request_type||'request').replace(/_/g,' ')}`,detail:`Status: ${safe(row.status||'pending')}`,diffText:'',fromStatus:'',toStatus:''})
    })

    return [...items].sort((a,b)=>new Date(b.when||0)-new Date(a.when||0))
  }

  const render=(payload,staffDirectory,adminUsers)=>{
    const booking=(payload.bookings||[]).find(item=>String(item.id||'')===String(bookingId))
    if(!booking)throw new Error('That booking was not found in SkyBook.')
    const items=buildChangelogItems(payload,booking,staffDirectory,adminUsers)
    document.title=`${booking.reference||'Booking'} Changelog | SkyBook`
    const meta=typeof booking.metadata==='object'&&booking.metadata ? booking.metadata : {}
    nodes.content.innerHTML=`
      <style>
        .cl-summary{display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:1px;background:#e8edf2;border:1px solid #e8edf2;border-radius:14px;overflow:hidden;margin-bottom:24px}
        .cl-summary-item{background:#fff;padding:14px 18px}
        .cl-summary-label{display:block;font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#8fa3b2;margin-bottom:4px}
        .cl-summary-value{display:block;font-size:14px;font-weight:700;color:#0d2535}
        .cl-timeline{position:relative;padding:4px 0}
        .cl-item{display:flex;gap:14px;padding-bottom:22px;position:relative}
        .cl-item:last-child{padding-bottom:0}
        .cl-item:not(:last-child)::before{content:'';position:absolute;left:15px;top:32px;bottom:0;width:2px;background:#e8edf2;z-index:0}
        .cl-icon{width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:14px;flex-shrink:0;position:relative;z-index:1;margin-top:1px}
        .cl-body{flex:1;min-width:0;padding-top:2px}
        .cl-row1{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin-bottom:3px}
        .cl-title{font-size:14px;font-weight:700;color:#0d2535;flex:1;min-width:0}
        .cl-kind-tag{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;padding:2px 9px;border-radius:999px;white-space:nowrap;flex-shrink:0}
        .cl-when{font-size:11px;color:#8fa3b2;white-space:nowrap;flex-shrink:0}
        .cl-detail{font-size:13px;color:#567087;margin:0 0 6px;line-height:1.5}
        .cl-meta{display:flex;gap:8px;align-items:center;flex-wrap:wrap;margin-top:4px}
        .cl-actor{font-size:11px;color:#8fa3b2;font-weight:600}
        .cl-status-arrow{font-size:11px;color:#567087;background:#f1f5f9;border-radius:6px;padding:2px 8px}
        .cl-diff{background:#fafbfc;border:1px solid #e8edf2;border-radius:10px;padding:10px 14px;margin:6px 0 8px}
        .changelog-diff-row{display:flex;align-items:baseline;gap:8px;padding:4px 0;border-bottom:1px solid rgba(0,0,0,.05);font-size:13px;flex-wrap:wrap}
        .changelog-diff-row:last-child{border-bottom:none}
        .changelog-diff-label{font-weight:700;color:#0e3a52;min-width:120px;flex-shrink:0}
        .changelog-diff-old{color:#a33a3a;text-decoration:line-through;opacity:.75}
        .changelog-diff-arrow{color:#8fa3b2;font-weight:700}
        .changelog-diff-new{color:#1a6640;font-weight:700}
        @media print{.booking-changelog-actions{display:none}}
      </style>
      <header class="booking-changelog-hero">
        <div>
          <span class="booking-chip">Booking changelog</span>
          <h1>${esc(booking.customer_name||'Guest')} · ${esc(booking.service_name||'Tour')}</h1>
          <p style="opacity:.7;font-size:13px">${esc(booking.reference)} · ${esc(formatDate(booking.preferred_date))}</p>
        </div>
        <div class="booking-changelog-actions" style="display:flex;gap:10px;align-items:center;flex-wrap:wrap">
          <a class="booking-button ghost" href="${esc(getBookingRecordUrl())}">← Back to booking</a>
          <button class="booking-button ghost" type="button" onclick="window.print()">Print</button>
          <button class="booking-button" type="button" id="refreshChangelog">Refresh</button>
        </div>
      </header>
      <div class="cl-summary">
        <div class="cl-summary-item"><span class="cl-summary-label">Status</span><span class="cl-summary-value">${esc(safe(booking.status||'—').replace(/_/g,' '))}</span></div>
        <div class="cl-summary-item"><span class="cl-summary-label">Payment</span><span class="cl-summary-value">${esc(safe(booking.payment_status||'—').replace(/_/g,' '))}</span></div>
        <div class="cl-summary-item"><span class="cl-summary-label">Total</span><span class="cl-summary-value">${esc(money(booking.total_amount||0,booking.currency_code||booking.currency))}</span></div>
        <div class="cl-summary-item"><span class="cl-summary-label">Date</span><span class="cl-summary-value">${esc(formatDate(booking.preferred_date))}</span></div>
        <div class="cl-summary-item"><span class="cl-summary-label">Guide</span><span class="cl-summary-value">${esc(booking.guide_name||meta.guide_name||'Unassigned')}</span></div>
        <div class="cl-summary-item"><span class="cl-summary-label">Entries</span><span class="cl-summary-value">${esc(String(items.length))}</span></div>
      </div>
      <section class="booking-panel" style="padding:20px 24px">
        <div class="cl-timeline">
          ${items.length ? items.map(item=>{
            const cfg=kindConfig[item.kind]||{icon:'•',color:'#567087',bg:'#edf2f7'}
            return `<div class="cl-item">
              <div class="cl-icon" style="background:${esc(cfg.bg)};color:${esc(cfg.color)}">${cfg.icon}</div>
              <div class="cl-body">
                <div class="cl-row1">
                  <span class="cl-title">${esc(item.title)}</span>
                  <span class="cl-kind-tag" style="background:${esc(cfg.bg)};color:${esc(cfg.color)}">${esc(item.kind)}</span>
                  <span class="cl-when">${esc(formatDateTime(item.when))}</span>
                </div>
                ${item.detail ? `<p class="cl-detail">${esc(item.detail)}</p>` : ''}
                ${item.diffText ? `<div class="cl-diff">${renderDiffLines(item.diffText)}</div>` : ''}
                <div class="cl-meta">
                  <span class="cl-actor">${esc(item.actor||'System')}</span>
                  ${item.fromStatus&&item.toStatus&&item.fromStatus!==item.toStatus ? `<span class="cl-status-arrow">${esc(item.fromStatus.replace(/_/g,' '))} → ${esc(item.toStatus.replace(/_/g,' '))}</span>` : ''}
                </div>
              </div>
            </div>`
          }).join('') : `<div style="padding:32px;text-align:center"><p class="muted-copy">No changelog entries yet.</p></div>`}
        </div>
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
      if(!session?.access_token){ redirectToLogin(); return }
      const payload=await shared.apiRequest('admin/bootstrap',{
        headers:shared.getAuthHeaders(session.access_token)
      })
      const staffDirectory=payload?.staff_directory||[]
      const adminUsers=payload?.admin_users||[]
      render(payload||{},staffDirectory,adminUsers)
    }catch(error){
      setError(error.message||'Unable to load the booking changelog.')
    }
  }
  void load()
})()
