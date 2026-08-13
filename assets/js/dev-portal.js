/* Developer Portal — True Sky Ventures */
;(()=>{
  const API='https://asagrwkixsaltkkrqdsz.supabase.co/functions/v1/booking-api'
  const TOKEN_KEY='dev-portal-token-v1'

  // ── Helpers ──────────────────────────────────────────────────────────────
  const $=id=>document.getElementById(id)
  const byQ=sel=>document.querySelector(sel)
  const escHtml=s=>String(s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const fmtDate=iso=>{
    if(!iso)return '—'
    try{
      return new Date(iso).toLocaleString('en-ZA',{day:'2-digit',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'})
    }catch{return iso}
  }
  const timeAgo=iso=>{
    if(!iso)return '—'
    const diff=Date.now()-new Date(iso).getTime()
    const m=Math.floor(diff/60000)
    if(m<1)return 'Just now'
    if(m<60)return `${m}m ago`
    const h=Math.floor(m/60)
    if(h<24)return `${h}h ago`
    const d=Math.floor(h/24)
    if(d<7)return `${d}d ago`
    return fmtDate(iso)
  }

  // ── Token management ─────────────────────────────────────────────────────
  let devToken=sessionStorage.getItem(TOKEN_KEY)||''

  const api=async(path,opts={})=>{
    const res=await fetch(`${API}/${path}`,{
      method:opts.method||'GET',
      headers:{'Content-Type':'application/json','x-dev-token':devToken,...(opts.headers||{})},
      ...(opts.body ? {body:JSON.stringify(opts.body)} : {})
    })
    if(res.status===401)throw new Error('Access denied. Check your token.')
    const text=await res.text()
    let data
    try{data=JSON.parse(text)}catch{data={error:text}}
    if(!res.ok)throw new Error(data?.error||`Request failed (${res.status})`)
    return data
  }

  // ── Toast ────────────────────────────────────────────────────────────────
  let toastTimer
  const toast=(msg,ok=true)=>{
    const el=$('devToast')
    el.textContent=msg
    el.className='show '+(ok ? 'ok' : 'err')
    clearTimeout(toastTimer)
    toastTimer=setTimeout(()=>el.className='',2800)
  }

  // ── Clock ────────────────────────────────────────────────────────────────
  const tickClock=()=>{
    const el=$('devClock')
    if(el)el.textContent=new Date().toLocaleTimeString('en-ZA',{hour:'2-digit',minute:'2-digit',second:'2-digit'})
  }

  // ── Gate ─────────────────────────────────────────────────────────────────
  const showGate=msg=>{
    $('devGate').style.display='flex'
    $('devShell').style.display='none'
    if(msg)$('devGateError').textContent=msg
  }
  const showShell=()=>{
    $('devGate').style.display='none'
    $('devShell').style.display='flex'
    loadUsers()
    loadSystem()
    tickClock()
    setInterval(tickClock,1000)
  }

  $('devTokenBtn').addEventListener('click',async()=>{
    const token=$('devTokenInput').value.trim()
    if(!token)return
    devToken=token
    $('devGateError').textContent=''
    $('devTokenBtn').textContent='Checking…'
    try{
      await api('developer/users')
      sessionStorage.setItem(TOKEN_KEY,token)
      showShell()
    }catch(e){
      $('devGateError').textContent=e.message
      devToken=''
    }finally{
      $('devTokenBtn').textContent='Access Portal'
    }
  })

  $('devTokenInput').addEventListener('keydown',e=>{ if(e.key==='Enter')$('devTokenBtn').click() })

  $('devLogout').addEventListener('click',()=>{
    sessionStorage.removeItem(TOKEN_KEY)
    devToken=''
    $('devTokenInput').value=''
    $('devGateError').textContent=''
    showGate()
  })

  // ── Navigation ───────────────────────────────────────────────────────────
  document.querySelectorAll('.dev-nav-btn').forEach(btn=>{
    btn.addEventListener('click',()=>{
      document.querySelectorAll('.dev-nav-btn').forEach(b=>b.classList.remove('active'))
      document.querySelectorAll('.dev-view').forEach(v=>v.classList.remove('active'))
      btn.classList.add('active')
      const view=btn.dataset.view
      const el=$('view-'+view)
      if(el)el.classList.add('active')
    })
  })

  // ── Role tag ─────────────────────────────────────────────────────────────
  const roleTag=role=>`<span class="dev-tag ${escHtml(role)||'default'}">${escHtml(role||'—')}</span>`
  const statusTag=active=>`<span class="dev-tag ${active ? 'active' : 'inactive'}">${active ? 'Active' : 'Inactive'}</span>`

  // ── Users ────────────────────────────────────────────────────────────────
  let allUsers=[]

  const renderUsers=(filter='')=>{
    const q=filter.toLowerCase()
    const rows=(q ? allUsers.filter(u=>
      String(u.full_name||'').toLowerCase().includes(q)||
      String(u.username||'').toLowerCase().includes(q)||
      String(u.role||'').toLowerCase().includes(q)
    ) : allUsers)

    const tbody=$('usersTableBody')
    if(!rows.length){
      tbody.innerHTML=`<tr><td colspan="7" class="dev-empty">${q ? 'No users match your search.' : 'No users found.'}</td></tr>`
      return
    }
    tbody.innerHTML=rows.map(u=>`
      <tr>
        <td class="dev-cell-name">${escHtml(u.full_name||'—')}</td>
        <td class="dev-cell-mono">${escHtml(u.username||'—')}</td>
        <td>${roleTag(u.role)}</td>
        <td>${statusTag(u.is_active)}</td>
        <td title="${escHtml(u.last_sign_in_at||'')}" style="color:var(--muted);font-size:13px">${timeAgo(u.last_sign_in_at)}</td>
        <td style="color:var(--muted);font-size:13px">${fmtDate(u.created_at)}</td>
        <td>
          <div class="dev-cell-actions">
            <button class="dev-btn ghost sm" data-action="edit" data-id="${escHtml(u.id)}">Edit</button>
            <button class="dev-btn danger sm" data-action="delete" data-id="${escHtml(u.id)}" data-name="${escHtml(u.full_name||u.username||'this user')}">Delete</button>
          </div>
        </td>
      </tr>
    `).join('')

    tbody.querySelectorAll('[data-action="edit"]').forEach(btn=>{
      btn.addEventListener('click',()=>{
        const u=allUsers.find(x=>x.id===btn.dataset.id)
        if(u)openUserModal(u)
      })
    })
    tbody.querySelectorAll('[data-action="delete"]').forEach(btn=>{
      btn.addEventListener('click',()=>openConfirm(btn.dataset.id,btn.dataset.name))
    })
  }

  const loadUsers=async()=>{
    try{
      const data=await api('developer/users')
      allUsers=data.users||[]
      renderUsers($('userSearch').value)
    }catch(e){
      $('usersTableBody').innerHTML=`<tr><td colspan="7" class="dev-empty" style="color:var(--red)">${escHtml(e.message)}</td></tr>`
    }
  }

  $('userSearch').addEventListener('input',e=>renderUsers(e.target.value))
  $('addUserBtn').addEventListener('click',()=>openUserModal(null))

  // ── User Modal ───────────────────────────────────────────────────────────
  const openUserModal=(user=null)=>{
    $('editUserId').value=user?.id||''
    $('editFullName').value=user?.full_name||''
    $('editUsername').value=user?.username||''
    $('editPassword').value=''
    $('editRole').value=user?.role||'booking_agent'
    $('editActive').checked=user?.is_active!==false
    $('userModalTitle').textContent=user ? 'Edit User' : 'Add User'
    $('editPasswordNote').style.display=user ? '' : 'none'
    $('userModalStatus').textContent=''
    $('userModal').classList.add('open')
  }
  const closeUserModal=()=>$('userModal').classList.remove('open')

  $('userModalClose').addEventListener('click',closeUserModal)
  $('userModalCancel').addEventListener('click',closeUserModal)
  $('userModal').addEventListener('click',e=>{ if(e.target===$('userModal'))closeUserModal() })

  $('userModalSave').addEventListener('click',async()=>{
    $('userModalStatus').textContent=''
    const id=$('editUserId').value.trim()
    const payload={
      full_name:$('editFullName').value.trim(),
      username:$('editUsername').value.trim(),
      password:$('editPassword').value,
      role:$('editRole').value,
      is_active:$('editActive').checked
    }
    if(!payload.username){$('userModalStatus').textContent='Username is required.';return}
    if(!id&&!payload.password){$('userModalStatus').textContent='Password is required for new users.';return}

    $('userModalSave').textContent='Saving…'
    $('userModalSave').disabled=true
    try{
      if(id){
        await api(`developer/users/${encodeURIComponent(id)}`,{method:'PATCH',body:payload})
      }else{
        await api('developer/users',{method:'POST',body:payload})
      }
      closeUserModal()
      await loadUsers()
      toast(id ? 'User updated.' : 'User created.')
    }catch(e){
      $('userModalStatus').textContent=e.message
    }finally{
      $('userModalSave').textContent='Save User'
      $('userModalSave').disabled=false
    }
  })

  // ── Confirm Delete ───────────────────────────────────────────────────────
  let pendingDeleteId=null

  const openConfirm=(id,name)=>{
    pendingDeleteId=id
    $('confirmTitle').textContent='Delete User'
    $('confirmMessage').textContent=`Permanently remove "${name}"? This cannot be undone and will revoke their login immediately.`
    $('confirmModal').classList.add('open')
  }
  const closeConfirm=()=>{ pendingDeleteId=null; $('confirmModal').classList.remove('open') }

  $('confirmClose').addEventListener('click',closeConfirm)
  $('confirmCancel').addEventListener('click',closeConfirm)
  $('confirmModal').addEventListener('click',e=>{ if(e.target===$('confirmModal'))closeConfirm() })

  $('confirmOk').addEventListener('click',async()=>{
    if(!pendingDeleteId)return
    $('confirmOk').textContent='Deleting…'
    $('confirmOk').disabled=true
    try{
      await api(`developer/users/${encodeURIComponent(pendingDeleteId)}`,{method:'DELETE'})
      closeConfirm()
      await loadUsers()
      toast('User deleted.')
    }catch(e){
      toast(e.message,false)
      closeConfirm()
    }finally{
      $('confirmOk').textContent='Delete'
      $('confirmOk').disabled=false
    }
  })

  // ── System ───────────────────────────────────────────────────────────────
  const STATUS_LABELS={
    pending:'Pending',awaiting_payment:'Awaiting Payment',payment_request_sent:'Payment Sent',
    confirmed:'Confirmed',cancelled:'Cancelled',completed:'Completed',draft:'Draft',failed:'Failed'
  }
  const statusColor=s=>({confirmed:'green',completed:'green',pending:'yellow',awaiting_payment:'yellow',payment_request_sent:'yellow',cancelled:'red',failed:'red'}[s]||'')

  const loadSystem=async()=>{
    try{
      const d=await api('developer/system')
      $('statBookings').textContent=d.bookings?.total??'—'
      $('statCustomers').textContent=d.customers??'—'
      $('statServices').textContent=d.services??'—'
      $('statEmailSent').textContent=d.emails?.by_status?.sent??0
      $('statEmailFailed').textContent=d.emails?.by_status?.failed??0
      const pending=(d.bookings?.by_status?.pending||0)+(d.bookings?.by_status?.awaiting_payment||0)
      $('statPending').textContent=pending

      const bookingRows=$('sysBookingRows')
      const bs=d.bookings?.by_status||{}
      bookingRows.innerHTML=Object.entries(bs).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`
        <div class="dev-sys-row">
          <span class="dev-sys-key">${STATUS_LABELS[s]||s}</span>
          <span class="dev-sys-val ${statusColor(s)}">${n}</span>
        </div>
      `).join('')||'<div style="color:var(--muted);font-size:13px">No data.</div>'

      const emailRows=$('sysEmailRows')
      const es=d.emails?.by_status||{}
      emailRows.innerHTML=Object.entries(es).sort((a,b)=>b[1]-a[1]).map(([s,n])=>`
        <div class="dev-sys-row">
          <span class="dev-sys-key">${s.charAt(0).toUpperCase()+s.slice(1)}</span>
          <span class="dev-sys-val ${s==='sent'?'green':s==='failed'?'red':''}">${n}</span>
        </div>
      `).join('')||'<div style="color:var(--muted);font-size:13px">No data.</div>'
    }catch(e){
      toast('Could not load system data: '+e.message,false)
    }
  }

  // ── Init ─────────────────────────────────────────────────────────────────
  if(devToken){
    api('developer/users').then(()=>showShell()).catch(()=>showGate())
  }else{
    showGate()
  }
})()
