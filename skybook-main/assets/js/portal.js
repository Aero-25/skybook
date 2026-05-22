const bookingPortalShared=window.TrueTravelBooking

const portalState={
  token:'',
  booking:null,
  requests:[],
  documents:[],
  versions:[],
  session:null
}

const portalNodes={
  app:document.getElementById('portalApp'),
  statusBanner:document.getElementById('portalStatusBanner'),
  sessionState:document.getElementById('portalSessionState'),
  bookingSummary:document.getElementById('portalBookingSummary'),
  documentsTable:document.getElementById('portalDocumentsTable'),
  requestsTable:document.getElementById('portalRequestsTable'),
  changeRequestForm:document.getElementById('portalChangeRequestForm'),
  uploadInfoForm:document.getElementById('portalUploadInfoForm'),
  pickupForm:document.getElementById('portalPickupForm')
}

const readPortalToken=()=>new URLSearchParams(window.location.search).get('token')||''

const setPortalStatus=(message,isError=false)=>{
  portalNodes.statusBanner.textContent=message
  portalNodes.statusBanner.classList.toggle('is-error',Boolean(isError))
}

const formatDateLabel=value=>{
  if(!value)return 'Not scheduled'
  const parsed=new Date(value)
  if(Number.isNaN(parsed.getTime()))return String(value)
  return parsed.toLocaleString('en-NA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
}

const renderPortal=()=>{
  if(!portalState.booking){
    portalNodes.app.hidden=true
    return
  }
  portalNodes.app.hidden=false
  portalNodes.sessionState.textContent=portalState.session?.status==='used' ? 'Portal link active' : 'Secure link issued'
  portalNodes.bookingSummary.innerHTML=[
    {label:'Reference',value:portalState.booking.reference},
    {label:'Brand',value:portalState.booking.brand_code},
    {label:'Service',value:portalState.booking.service_name},
    {label:'Guest',value:portalState.booking.customer_name},
    {label:'Preferred Date',value:formatDateLabel(portalState.booking.preferred_date)},
    {label:'Status',value:String(portalState.booking.status||'').replace(/_/g,' ')},
    {label:'Payment',value:String(portalState.booking.payment_status||'').replace(/_/g,' ')},
    {label:'Total',value:bookingPortalShared.formatMoney(portalState.booking.total_amount||0,portalState.booking.currency_code||bookingPortalShared.readConfig().currency)}
  ].map(item=>`
    <article class="detail-card">
      <span>${bookingPortalShared.escapeHtml(item.label)}</span>
      <strong>${bookingPortalShared.escapeHtml(item.value||'')}</strong>
    </article>
  `).join('')

  portalNodes.documentsTable.innerHTML=portalState.versions.map(version=>`
    <tr>
      <td>
        <strong>${bookingPortalShared.escapeHtml(version.file_name||version.document_type||'Document')}</strong>
        <div class="table-subline">${bookingPortalShared.escapeHtml(String(version.document_type||'').replace(/_/g,' '))}</div>
      </td>
      <td><span class="status-badge is-good">${bookingPortalShared.escapeHtml(version.status||'ready')}</span></td>
      <td>${bookingPortalShared.escapeHtml(formatDateLabel(version.created_at))}</td>
      <td>${version.signed_url ? `<a class="booking-button ghost compact-button" href="${bookingPortalShared.escapeHtml(version.signed_url)}" target="_blank" rel="noopener noreferrer">Download</a>` : ''}</td>
    </tr>
  `).join('') || '<tr><td colspan="4">No documents are available yet.</td></tr>'

  portalNodes.requestsTable.innerHTML=portalState.requests.map(request=>`
    <tr>
      <td>
        <strong>${bookingPortalShared.escapeHtml(String(request.request_type||'').replace(/_/g,' '))}</strong>
        <div class="table-subline">${bookingPortalShared.escapeHtml(request.message||'')}</div>
      </td>
      <td><span class="status-badge ${String(request.status||'open')==='resolved' ? 'is-good' : 'is-warn'}">${bookingPortalShared.escapeHtml(request.status||'open')}</span></td>
      <td>${bookingPortalShared.escapeHtml(formatDateLabel(request.created_at))}</td>
    </tr>
  `).join('') || '<tr><td colspan="3">No portal requests have been sent yet.</td></tr>'
}

const fileToBase64=file=>new Promise((resolve,reject)=>{
  if(!file){
    resolve(null)
    return
  }
  const reader=new FileReader()
  reader.onload=()=>resolve(String(reader.result||''))
  reader.onerror=()=>reject(new Error('Attachment could not be read.'))
  reader.readAsDataURL(file)
})

const submitPortalRequest=async({requestType,message,file})=>{
  const base64=file ? await fileToBase64(file) : null
  const payload={
    token:portalState.token,
    request_type:requestType,
    message
  }
  if(file && base64){
    payload.file_name=file.name
    payload.mime_type=file.type||'application/octet-stream'
    payload.file_content_base64=base64
  }
  await bookingPortalShared.apiRequest('portal/session/request',{
    method:'POST',
    body:payload
  })
}

const resolvePortal=async()=>{
  portalState.token=readPortalToken()
  if(!portalState.token){
    setPortalStatus('This portal link is missing its secure token.',true)
    return
  }
  try{
    const payload=await bookingPortalShared.apiRequest('portal/session/resolve',{
      method:'POST',
      body:{ token:portalState.token }
    })
    portalState.booking=payload.booking||null
    portalState.requests=payload.portal_requests||[]
    portalState.documents=payload.booking_documents||[]
    portalState.versions=payload.document_versions||[]
    portalState.session=payload.portal_session||null
    renderPortal()
    setPortalStatus('Secure booking portal loaded.')
  }catch(error){
    setPortalStatus(error instanceof Error ? error.message : 'This portal link is invalid or has expired.',true)
  }
}

portalNodes.changeRequestForm?.addEventListener('submit',event=>{
  event.preventDefault()
  const form=new FormData(portalNodes.changeRequestForm)
  void submitPortalRequest({
    requestType:'request_change',
    message:String(form.get('message')||'').trim(),
    file:null
  }).then(()=>{
    portalNodes.changeRequestForm.reset()
    return resolvePortal()
  }).then(()=>{
    setPortalStatus('Change request sent to the reservations team.')
  }).catch(error=>setPortalStatus(error.message||'Change request failed.',true))
})

portalNodes.uploadInfoForm?.addEventListener('submit',event=>{
  event.preventDefault()
  const form=new FormData(portalNodes.uploadInfoForm)
  const attachment=portalNodes.uploadInfoForm.querySelector('input[name="attachment"]')?.files?.[0]||null
  void submitPortalRequest({
    requestType:'upload_info',
    message:String(form.get('message')||'').trim(),
    file:attachment
  }).then(()=>{
    portalNodes.uploadInfoForm.reset()
    return resolvePortal()
  }).then(()=>{
    setPortalStatus('Travel information uploaded to SkyBook.')
  }).catch(error=>setPortalStatus(error.message||'Upload failed.',true))
})

portalNodes.pickupForm?.addEventListener('submit',event=>{
  event.preventDefault()
  const form=new FormData(portalNodes.pickupForm)
  void submitPortalRequest({
    requestType:'confirm_pickup',
    message:String(form.get('message')||'').trim(),
    file:null
  }).then(()=>{
    portalNodes.pickupForm.reset()
    return resolvePortal()
  }).then(()=>{
    setPortalStatus('Pickup confirmation sent to the operations team.')
  }).catch(error=>setPortalStatus(error.message||'Pickup confirmation failed.',true))
})

void resolvePortal()
