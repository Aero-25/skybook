const skybookShared=window.TrueTravelBooking

const loginNodes={
  form:document.getElementById('loginForm'),
  changeForm:document.getElementById('changePasswordForm'),
  newPassword:document.getElementById('newPassword'),
  confirmPassword:document.getElementById('confirmPassword'),
  status:document.getElementById('authStatus'),
  title:document.getElementById('skybookLoginTitle'),
  subtitle:document.getElementById('skybookLoginSubtitle'),
  resetButton:document.getElementById('resetAuthCacheButton'),
  environmentMeta:document.getElementById('authEnvironmentMeta')
}

const cacheKeys=[
  'skybook-booking-config-v2',
  'skybook-booking-ui-state-v2',
  'skybook-booking-demo-db-v2',
  'skybook-supabase-config-v2',
  'true-travel-booking-config-v1',
  'true-travel-supabase-config-v1'
]

// Temporary session held between login and password change
let pendingSession=null

const setLoginStatus=(message,isError=false)=>{
  if(!loginNodes.status)return
  loginNodes.status.textContent=message
  loginNodes.status.hidden=!String(message||'').trim()
  loginNodes.status.classList.toggle('is-error',isError)
}

const getSafeNextUrl=()=>{
  const fallback='booking-admin.html'
  try{
    const requested=new URLSearchParams(window.location.search).get('next')
    if(!requested)return fallback
    const decoded=decodeURIComponent(requested)
    if(/^https?:\/\//i.test(decoded))return fallback
    if(decoded.includes('//'))return fallback
    return decoded || fallback
  }catch{
    return fallback
  }
}

const renderEnvironmentMeta=()=>{
  if(!loginNodes.environmentMeta)return
  try{
    const config=skybookShared.readConfig()
    loginNodes.environmentMeta.textContent=`Connected to ${config.supabaseUrl} using ${config.brandCode} defaults`
  }catch{
    loginNodes.environmentMeta.textContent='Live environment not configured yet.'
  }
}

const requireClient=async()=>{
  if(!skybookShared?.createSupabaseClient)throw new Error('Supabase browser client is not configured.')
  return skybookShared.createSupabaseClient()
}

const clearSkybookCache=async()=>{
  cacheKeys.forEach(key=>localStorage.removeItem(key))
  try{
    const client=await requireClient()
    await client.auth.signOut()
  }catch{}
  renderEnvironmentMeta()
  setLoginStatus('Local SkyBook cache cleared. Sign in again with the live project settings.')
}

const redirectToConsole=()=>window.location.replace(getSafeNextUrl())

const showChangePasswordScreen=(username)=>{
  if(loginNodes.form)loginNodes.form.hidden=true
  if(loginNodes.changeForm)loginNodes.changeForm.hidden=false
  if(loginNodes.title)loginNodes.title.textContent='Set a new password'
  if(loginNodes.subtitle){
    loginNodes.subtitle.textContent=`Welcome, ${username}. Choose a new password to continue.`
    loginNodes.subtitle.hidden=false
  }
  setLoginStatus('')
  loginNodes.newPassword?.focus()
}

const handleLogin=async event=>{
  event.preventDefault()
  const submitButton=loginNodes.form?.querySelector('button[type="submit"]')
  try{
    const client=await requireClient()
    const formData=new FormData(loginNodes.form)
    setLoginStatus('Signing in securely...')
    if(submitButton)submitButton.disabled=true
    const result=await skybookShared.apiRequest('admin/login',{
      method:'POST',
      body:{
        username:String(formData.get('username')||'').trim(),
        password:String(formData.get('password')||'')
      }
    })
    if(!result?.session?.access_token || !result?.session?.refresh_token){
      setLoginStatus('Supabase did not return a valid admin session.',true)
      return
    }
    if(result.must_change_password){
      // Hold the session temporarily — set it after password change
      pendingSession=result.session
      const username=String(formData.get('username')||'').trim()
      showChangePasswordScreen(username)
      return
    }
    const { error }=await client.auth.setSession({
      access_token:String(result.session.access_token),
      refresh_token:String(result.session.refresh_token)
    })
    if(error){
      setLoginStatus(error.message,true)
      return
    }
    setLoginStatus('Signed in. Opening SkyBook operations console...')
    redirectToConsole()
  }catch(error){
    setLoginStatus(error instanceof Error ? error.message : 'SkyBook sign in failed.',true)
  }finally{
    if(submitButton)submitButton.disabled=false
  }
}

const handleChangePassword=async event=>{
  event.preventDefault()
  const submitButton=loginNodes.changeForm?.querySelector('button[type="submit"]')
  try{
    const newPw=loginNodes.newPassword?.value||''
    const confirmPw=loginNodes.confirmPassword?.value||''
    if(newPw.length<8){setLoginStatus('Password must be at least 8 characters.',true);return}
    if(newPw!==confirmPw){setLoginStatus('Passwords do not match.',true);return}
    setLoginStatus('Updating password...')
    if(submitButton)submitButton.disabled=true

    // Use the access token from the pending session directly — avoids the shared
    // client auth state not being set yet at this point in the flow.
    const config=skybookShared.readConfig()
    const apiBase=config.apiBase||'https://zegfirgyhdjyehvhlrnh.supabase.co/functions/v1/booking-api'
    const res=await fetch(`${apiBase}/admin/change-password`,{
      method:'POST',
      headers:{'Content-Type':'application/json','Authorization':`Bearer ${pendingSession.access_token}`},
      body:JSON.stringify({new_password:newPw})
    })
    const data=await res.json().catch(()=>({}))
    if(!res.ok)throw new Error(data?.error||'Password change failed.')

    // Session is valid — store it so the console opens authenticated
    const client=await requireClient()
    await client.auth.setSession({
      access_token:String(pendingSession.access_token),
      refresh_token:String(pendingSession.refresh_token)
    })
    setLoginStatus('Password updated. Opening SkyBook operations console...')
    setTimeout(redirectToConsole,800)
  }catch(error){
    setLoginStatus(error instanceof Error ? error.message : 'Password change failed.',true)
  }finally{
    if(submitButton)submitButton.disabled=false
  }
}

loginNodes.form?.addEventListener('submit',event=>{void handleLogin(event)})
loginNodes.changeForm?.addEventListener('submit',event=>{void handleChangePassword(event)})
loginNodes.resetButton?.addEventListener('click',()=>{void clearSkybookCache()})

;(async()=>{
  renderEnvironmentMeta()
  try{
    const client=await requireClient()
    await client.auth.signOut()
  }catch{}
})()
