const skybookShared=window.TrueTravelBooking

const loginNodes={
  form:document.getElementById('loginForm'),
  status:document.getElementById('authStatus'),
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

loginNodes.form?.addEventListener('submit',event=>{void handleLogin(event)})
loginNodes.resetButton?.addEventListener('click',()=>{void clearSkybookCache()})

;(async()=>{
  renderEnvironmentMeta()
  try{
    const client=await requireClient()
    const { data:{ session } }=await client.auth.getSession()
    if(session?.access_token){
      setLoginStatus('You are already signed in. Opening the console...')
      redirectToConsole()
    }
  }catch(error){
    setLoginStatus(error instanceof Error ? error.message : 'Admin authentication is not configured.',true)
  }
})()
