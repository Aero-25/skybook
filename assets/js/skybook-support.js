/* SkyBook support bubble — "Log a ticket" from any signed-in SkyBook page.
 *
 * A floating button opens a small panel that:
 *   1. captures a screenshot of the page underneath (html2canvas-pro, vendored),
 *   2. lets the staff member mark it up — box the problem, draw on it, or hide
 *      private details (hidden areas are painted over before anything is sent),
 *   3. sends their message, the screenshot and page/browser details to
 *      booking-api (POST admin/support-tickets), which emails Aero Digital support.
 *
 * Who logged the ticket is resolved on the server from the signed-in SkyBook
 * profile. The widget renders in a shadow root so page styles cannot reach it,
 * and needs only booking-shared.js (window.TrueTravelBooking) for the session.
 * It stays hidden on pages without a signed-in session.
 */
(()=>{
'use strict'
if(window.SkyBookSupport)return

const SCRIPT_SRC=document.currentScript?.src||''
const CAPTURE_LIB_LOCAL=(()=>{
  try{ return new URL('vendor/html2canvas-pro.min.js',SCRIPT_SRC||new URL('assets/js/',document.baseURI)).href }
  catch{ return 'assets/js/vendor/html2canvas-pro.min.js' }
})()
const CAPTURE_LIB_CDN='https://cdn.jsdelivr.net/npm/html2canvas-pro@2.4.5/dist/html2canvas-pro.min.js'
const MAX_SHOT_WIDTH=1920
const JPEG_QUALITY=0.86
const CAPTURE_TIMEOUT_MS=20000
const MAX_MESSAGE=5000
const DRAFT_KEY='skybook-support-draft'
const MARK_COLOR='#ff2d55'
const HIDE_COLOR='#0b1f3a'
const CATEGORIES=[
  {value:'problem',label:'Problem',hint:'Something is broken or wrong'},
  {value:'question',label:'Question',hint:'Not sure how something works'},
  {value:'idea',label:'Suggestion',hint:'An idea to make SkyBook better'}
]
const ROLE_LABELS={super_admin:'Super admin',manager:'Manager',booking_agent:'Booking agent',reservations:'Reservations',operations:'Operations',finance:'Finance'}

/* ── Errors seen before the ticket ─────────────────────────────────────
 * Uncaught errors, failed promises and the red error toasts the console
 * shows, so support sees what the staff member saw. */
const recentErrors=[]
const describeValue=value=>{
  if(value instanceof Error)return value.message||String(value)
  if(typeof value==='string')return value
  try{ return JSON.stringify(value) }catch{ return String(value) }
}
const rememberError=(source,message)=>{
  const clean=String(message||'').replace(/\s+/g,' ').trim()
  if(!clean)return
  const last=recentErrors[recentErrors.length-1]
  if(last&&last.message===clean&&last.source===source)return
  recentErrors.push({at:new Date().toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit',second:'2-digit'}),source,message:clean.slice(0,400)})
  if(recentErrors.length>12)recentErrors.shift()
}
window.addEventListener('error',event=>rememberError('Script error',event.message||describeValue(event.error)))
window.addEventListener('unhandledrejection',event=>rememberError('Unhandled failure',describeValue(event.reason)))
const watchToasts=()=>{
  const stack=document.getElementById('toastStack')
  if(!stack||!window.MutationObserver)return
  new MutationObserver(records=>{
    for(const entry of records)for(const node of entry.addedNodes){
      if(node.nodeType===1&&node.classList.contains('toast')&&node.classList.contains('is-error'))rememberError('Shown on screen',node.textContent)
    }
  }).observe(stack,{childList:true})
}

/* ── Small helpers ─────────────────────────────────────────────────── */
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))
const trimText=value=>String(value??'').replace(/\s+/g,' ').trim()
const humanize=value=>trimText(String(value||'').replace(/[-_]+/g,' ')).replace(/^\w/,c=>c.toUpperCase())
const prefersReducedMotion=()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches
const finePointer=()=>window.matchMedia?.('(pointer: fine)').matches
const isMac=/Mac|iPhone|iPad/.test(navigator.platform||navigator.userAgent)
const initialsOf=name=>{
  const parts=String(name||'').replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean)
  if(!parts.length)return 'SB'
  const last=parts.length>1 ? parts[parts.length-1][0] : (parts[0][1]||'')
  return `${parts[0][0]}${last}`.toUpperCase()
}
const readDraft=()=>{ try{ return JSON.parse(sessionStorage.getItem(DRAFT_KEY)||'{}')||{} }catch{ return {} } }
const writeDraft=draft=>{ try{ draft ? sessionStorage.setItem(DRAFT_KEY,JSON.stringify(draft)) : sessionStorage.removeItem(DRAFT_KEY) }catch{} }
const withTimeout=(promise,ms,message)=>Promise.race([promise,new Promise((_,reject)=>window.setTimeout(()=>reject(new Error(message)),ms))])

/* ── Where the staff member is, and on what ────────────────────────── */
const ownText=node=>trimText([...(node?.childNodes||[])].filter(child=>child.nodeType===3).map(child=>child.textContent).join(' '))
const visible=node=>Boolean(node&&!node.hidden&&node.getClientRects().length)
const safeUrl=()=>{
  try{
    const url=new URL(window.location.href)
    ;['token','access_token','refresh_token','code'].forEach(key=>url.searchParams.delete(key))
    if(/access_token|refresh_token/.test(url.hash))url.hash=''
    return url.href
  }catch{ return window.location.pathname }
}
const describeLocation=()=>{
  const navCurrent=document.querySelector('.adm-nav [aria-current]')
  const section=navCurrent ? (ownText(navCurrent)||trimText(navCurrent.textContent)) : ''
  const activeView=document.querySelector('.adm-view.is-active')
  const viewHeading=trimText(activeView?.querySelector('h1')?.textContent)
  const viewKey=humanize(activeView?.dataset?.adminView||'')
  let view=viewHeading&&viewHeading.toLowerCase()!==section.toLowerCase() ? viewHeading : ''
  if(!view&&viewKey&&viewKey.toLowerCase()!==section.toLowerCase())view=viewKey
  const dialogs=[...document.querySelectorAll('.adm-modal,.cal-day-panel,[role="dialog"]')]
    .filter(node=>!node.closest('#skybook-support')&&visible(node))
    .map(node=>trimText(node.querySelector('h2,h1')?.textContent))
    .filter(Boolean)
  const fallbackSection=section||trimText(window.location.hash.replace(/^#/,''))||trimText(document.querySelector('h1')?.textContent)
  return {
    title:trimText(document.title),
    section:fallbackSection.slice(0,120),
    view:view.slice(0,120),
    dialog:(dialogs[dialogs.length-1]||'').slice(0,160)
  }
}
const describeBrowser=()=>{
  const ua=navigator.userAgent||''
  const find=re=>ua.match(re)
  let match=null
  let name='Browser'
  if((match=find(/Edg(?:A|iOS)?\/(\d+)/)))name='Edge'
  else if((match=find(/OPR\/(\d+)/)))name='Opera'
  else if((match=find(/SamsungBrowser\/(\d+)/)))name='Samsung Internet'
  else if((match=find(/(?:Firefox|FxiOS)\/(\d+)/)))name='Firefox'
  else if((match=find(/CriOS\/(\d+)/)))name='Chrome'
  else if((match=find(/Chrome\/(\d+)/)))name='Chrome'
  else if((match=find(/Version\/(\d+(?:\.\d+)?).*Safari/)))name='Safari'
  const browser=match ? `${name} ${match[1]}` : name
  let os=''
  if(/iPad/.test(ua)||(/Macintosh/.test(ua)&&navigator.maxTouchPoints>1))os='iPadOS'
  else if(/iPhone/.test(ua))os='iOS'
  else if((match=find(/Android (\d+(?:\.\d+)?)/)))os=`Android ${match[1]}`
  else if(/Windows NT 10/.test(ua))os='Windows 10/11'
  else if(/Windows/.test(ua))os='Windows'
  else if(/CrOS/.test(ua))os='ChromeOS'
  else if(/Mac OS X/.test(ua))os='macOS'
  else if(/Linux/.test(ua))os='Linux'
  let app='Web browser'
  if(/SkyBookApp/.test(ua))app='SkyBook Android app'
  else if(/Electron/.test(ua))app='SkyBook desktop app'
  else if(window.matchMedia?.('(display-mode: standalone)').matches||navigator.standalone)app='Installed web app'
  return {browser,os,app,user_agent:ua}
}
const collectContext=()=>{
  const where=describeLocation()
  const device=describeBrowser()
  const now=new Date()
  let timezone=''
  try{ timezone=Intl.DateTimeFormat().resolvedOptions().timeZone||'' }catch{}
  return {
    url:safeUrl(),
    ...where,
    ...device,
    viewport:`${window.innerWidth}×${window.innerHeight}`,
    screen:window.screen ? `${window.screen.width}×${window.screen.height}` : '',
    pixel_ratio:String(Math.round((window.devicePixelRatio||1)*100)/100),
    language:navigator.language||'',
    timezone,
    local_time:now.toLocaleString('en-GB',{weekday:'short',day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}),
    online:navigator.onLine!==false
  }
}

/* ── Session + API (shares the page's single Supabase client) ──────── */
const booking=()=>window.TrueTravelBooking
const sessionFrom=async({refresh=false}={})=>{
  const api=booking()
  if(!api?.createSupabaseClient)return null
  const client=await api.createSupabaseClient()
  if(refresh){
    const {data}=await client.auth.refreshSession()
    return data?.session||null
  }
  const {data}=await client.auth.getSession()
  return data?.session||null
}
const isAuthError=error=>/authenticated admin user is required|jwt expired|invalid jwt|not authenticated|session/i.test(String(error?.message||error||''))
const callApi=async(path,options={})=>{
  const api=booking()
  if(!api?.apiRequest)throw new Error('SkyBook is still loading. Try again in a moment.')
  const send=session=>api.apiRequest(path,{...options,headers:{...api.getAuthHeaders(session?.access_token||'')}})
  const session=await sessionFrom()
  if(!session?.access_token)throw new Error('Your SkyBook session has ended. Sign in again, then log the ticket.')
  try{ return await send(session) }
  catch(error){
    if(!isAuthError(error))throw error
    const renewed=await sessionFrom({refresh:true}).catch(()=>null)
    if(!renewed?.access_token||renewed.access_token===session.access_token)throw error
    return send(renewed)
  }
}
const friendlyError=error=>{
  const message=trimText(error?.message||error)
  if(/route not found/i.test(message))return 'Support tickets aren’t switched on in SkyBook yet. Please try again a little later.'
  if(/failed to fetch|networkerror|load failed|unavailable/i.test(message))return 'SkyBook can’t reach the server. Check your connection and try again — your message is kept.'
  return message||'The ticket could not be sent. Please try again.'
}

/* ── Screenshot ───────────────────────────────────────────────────── */
let captureLib=null
const loadScript=src=>new Promise((resolve,reject)=>{
  const script=document.createElement('script')
  script.src=src
  script.async=true
  script.onload=()=>typeof window.html2canvas==='function' ? resolve(window.html2canvas) : reject(new Error('The screenshot tool did not load.'))
  script.onerror=()=>{ script.remove(); reject(new Error('The screenshot tool did not load.')) }
  document.head.appendChild(script)
})
const loadCaptureLib=()=>{
  if(typeof window.html2canvas==='function')return Promise.resolve(window.html2canvas)
  if(!captureLib)captureLib=loadScript(CAPTURE_LIB_LOCAL).catch(()=>loadScript(CAPTURE_LIB_CDN)).catch(error=>{ captureLib=null; throw error })
  return captureLib
}
const pageBackground=()=>{
  for(const node of [document.body,document.documentElement]){
    const color=node&&getComputedStyle(node).backgroundColor
    if(color&&color!=='transparent'&&!/rgba\(\s*0,\s*0,\s*0,\s*0\s*\)/.test(color))return color
  }
  return '#ffffff'
}
// The library writes the cloned page into an iframe and can start drawing
// before that copy's <link> stylesheets have applied, which renders the page
// unstyled. Hold the render until every stylesheet and font in the copy is in.
const waitForClonedStyles=async doc=>{
  const pending=[...doc.querySelectorAll('link[rel~="stylesheet"]')].filter(link=>!link.sheet).map(link=>new Promise(resolve=>{
    link.addEventListener('load',resolve,{once:true})
    link.addEventListener('error',resolve,{once:true})
    window.setTimeout(resolve,5000)
  }))
  await Promise.all(pending)
  if(doc.fonts?.ready)await Promise.race([doc.fonts.ready,new Promise(resolve=>window.setTimeout(resolve,3000))])
}
const downscale=source=>{
  if(source.width<=MAX_SHOT_WIDTH)return source
  const ratio=MAX_SHOT_WIDTH/source.width
  const out=document.createElement('canvas')
  out.width=MAX_SHOT_WIDTH
  out.height=Math.round(source.height*ratio)
  const ctx=out.getContext('2d')
  ctx.imageSmoothingQuality='high'
  ctx.drawImage(source,0,0,out.width,out.height)
  return out
}

/* ── Marks (boxes, freehand, hidden areas), in screenshot pixels ───── */
const strokeFor=base=>Math.max(3,Math.round(base.width/300))
const roundRect=(ctx,x,y,w,h,r)=>{
  ctx.beginPath()
  if(ctx.roundRect)ctx.roundRect(x,y,w,h,Math.min(r,Math.abs(w)/2,Math.abs(h)/2))
  else ctx.rect(x,y,w,h)
}
const tracePen=(ctx,points)=>{
  ctx.beginPath()
  ctx.moveTo(points[0][0],points[0][1])
  if(points.length<3){ points.slice(1).forEach(([x,y])=>ctx.lineTo(x,y)); return }
  for(let i=1;i<points.length-1;i++){
    const [x,y]=points[i]
    const [nx,ny]=points[i+1]
    ctx.quadraticCurveTo(x,y,(x+nx)/2,(y+ny)/2)
  }
  const [lx,ly]=points[points.length-1]
  ctx.lineTo(lx,ly)
}
const drawMarks=(ctx,marks,lineWidth)=>{
  ctx.save()
  ctx.lineCap='round'
  ctx.lineJoin='round'
  for(const mark of marks){
    if(mark.type==='hide'){
      ctx.fillStyle=HIDE_COLOR
      roundRect(ctx,mark.x,mark.y,mark.w,mark.h,lineWidth)
      ctx.fill()
      continue
    }
    const path=()=>mark.type==='box' ? roundRect(ctx,mark.x,mark.y,mark.w,mark.h,lineWidth*1.6) : tracePen(ctx,mark.points)
    ctx.strokeStyle='rgba(255,45,85,.28)'
    ctx.lineWidth=lineWidth*2.6
    path()
    ctx.stroke()
    ctx.strokeStyle=MARK_COLOR
    ctx.lineWidth=lineWidth
    path()
    ctx.stroke()
  }
  ctx.restore()
}
const normalizeRect=mark=>({...mark,x:Math.min(mark.x,mark.x+mark.w),y:Math.min(mark.y,mark.y+mark.h),w:Math.abs(mark.w),h:Math.abs(mark.h)})

/* ── Icons ────────────────────────────────────────────────────────── */
const svg=(paths,size=20)=>`<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${paths}</svg>`
const ICON={
  ticket:'<path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/><path d="M12 7v4"/><path d="M12 14.5h.01"/>',
  close:'<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
  pencil:'<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z"/>',
  retake:'<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M8 16H3v5"/>',
  trash:'<path d="M3 6h18"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6"/><path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>',
  camera:'<path d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"/><circle cx="12" cy="13" r="3"/>',
  send:'<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  box:'<rect x="3.5" y="5" width="17" height="14" rx="3"/>',
  pen:'<path d="M3 17c2.5-2.5 4-8 7-8s1 7 4.5 7S19 12 21 10"/>',
  hide:'<path d="M9.88 9.88a3 3 0 1 0 4.24 4.24"/><path d="M10.73 5.08A10.43 10.43 0 0 1 12 5c7 0 10 7 10 7a13.16 13.16 0 0 1-1.67 2.68"/><path d="M6.61 6.61A13.53 13.53 0 0 0 2 12s3 7 10 7a9.74 9.74 0 0 0 5.39-1.61"/><path d="m2 2 20 20"/>',
  undo:'<path d="M3 7v6h6"/><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13"/>',
  clear:'<path d="m7 21-4.3-4.3a1 1 0 0 1 0-1.4l10-10a1 1 0 0 1 1.4 0l5.6 5.6a1 1 0 0 1 0 1.4L13 19"/><path d="M22 21H7"/><path d="m5 11 9 9"/>',
  check:'<path d="M20 6 9 17l-5-5"/>',
  copy:'<rect x="9" y="9" width="13" height="13" rx="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/>',
  alert:'<circle cx="12" cy="12" r="10"/><path d="M12 8v4"/><path d="M12 16h.01"/>',
  expand:'<path d="M15 3h6v6"/><path d="M9 21H3v-6"/><path d="M21 3l-7 7"/><path d="M3 21l7-7"/>'
}

/* ── Styles (inside the shadow root) ──────────────────────────────── */
const STYLES=`
:host{all:initial}
*,*::before,*::after{box-sizing:border-box}
[hidden]{display:none!important}
.root{
  --navy:#092d52;--navy-2:#0c3a6a;--blue:#145bc7;--blue-2:#2f7ce6;--cyan:#8fd1ff;--aqua:#a5e8ef;
  --ink:#143148;--muted:#5b7083;--faint:#8a9aaa;--line:#dfe8f0;--soft:#f5f8fb;
  --ok:#1a8a52;--bad:#9d1f2b;--bad-bg:#fbe9ea;--bad-line:#f1cdd0;
  --ease:cubic-bezier(.22,1,.36,1);--spring:cubic-bezier(.34,1.56,.64,1);
  --font:'DM Sans',system-ui,-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;
  font-family:var(--font);color:var(--ink);font-size:14px;line-height:1.5;
  -webkit-font-smoothing:antialiased;-moz-osx-font-smoothing:grayscale;
}
button{font:inherit;color:inherit;cursor:pointer;-webkit-tap-highlight-color:transparent}
button:disabled{cursor:default}
:focus-visible{outline:2px solid var(--blue-2);outline-offset:2px}

/* Bubble */
.bubble{
  position:fixed;right:max(20px,env(safe-area-inset-right));bottom:max(20px,env(safe-area-inset-bottom));z-index:3;
  display:flex;align-items:center;height:56px;min-width:56px;padding:0;border:0;border-radius:28px;color:#fff;
  background:linear-gradient(145deg,#2a72e0 0%,#1453ad 40%,#092d52 100%);
  box-shadow:0 16px 36px -10px rgba(9,45,82,.6),0 4px 12px rgba(9,45,82,.22),inset 0 1px 0 rgba(255,255,255,.24),inset 0 0 0 1px rgba(255,255,255,.07);
  transition:transform .3s var(--ease),box-shadow .3s var(--ease),opacity .25s;
  animation:bubble-in .6s var(--spring) backwards;
}
.bubble:hover{transform:translateY(-2px);box-shadow:0 22px 44px -12px rgba(9,45,82,.65),0 6px 16px rgba(9,45,82,.24),inset 0 1px 0 rgba(255,255,255,.28),inset 0 0 0 1px rgba(255,255,255,.1)}
.bubble:active{transform:translateY(0) scale(.97)}
.bubble::after{content:'';position:absolute;inset:0;border-radius:inherit;pointer-events:none;box-shadow:0 0 0 0 rgba(143,209,255,.55);animation:bubble-ring 1.8s var(--ease) 1.2s 2}
.bubble-label{max-width:0;overflow:hidden;white-space:nowrap;opacity:0;padding-left:0;font-size:14px;font-weight:600;letter-spacing:-.01em;transition:max-width .4s var(--ease),opacity .2s,padding .4s var(--ease)}
.bubble:hover .bubble-label,.bubble:focus-visible .bubble-label{max-width:170px;opacity:1;padding-left:20px}
.bubble[aria-expanded="true"] .bubble-label{max-width:0;opacity:0;padding-left:0}
.bubble-icon{position:relative;display:grid;place-items:center;width:56px;height:56px;flex:none}
.bubble-icon svg{position:absolute;transition:transform .4s var(--ease),opacity .2s}
.bubble-icon .i-close{opacity:0;transform:rotate(-90deg) scale(.6)}
.bubble[aria-expanded="true"] .i-ticket{opacity:0;transform:rotate(90deg) scale(.6)}
.bubble[aria-expanded="true"] .i-close{opacity:1;transform:none}
@keyframes bubble-in{from{opacity:0;transform:translateY(14px) scale(.6)}to{opacity:1;transform:none}}
@keyframes bubble-ring{to{box-shadow:0 0 0 18px rgba(143,209,255,0)}}

/* Panel */
.scrim{position:fixed;inset:0;z-index:1;background:rgba(5,18,34,.42);opacity:0;pointer-events:none;transition:opacity .25s}
.panel{
  position:fixed;right:max(20px,env(safe-area-inset-right));bottom:calc(max(20px,env(safe-area-inset-bottom)) + 68px);z-index:2;
  display:flex;flex-direction:column;width:404px;max-width:calc(100vw - 24px);max-height:min(740px,calc(100dvh - 112px));
  background:#fff;border-radius:22px;overflow:hidden;
  box-shadow:0 44px 100px -24px rgba(2,16,31,.5),0 14px 34px -12px rgba(2,16,31,.28),0 0 0 1px rgba(9,45,82,.08);
  transform-origin:calc(100% - 28px) calc(100% + 40px);
  opacity:0;transform:translateY(14px) scale(.95);visibility:hidden;pointer-events:none;
  transition:opacity .2s ease,transform .35s var(--ease),visibility 0s linear .35s;
}
.root.is-open .panel{opacity:1;transform:none;visibility:visible;pointer-events:auto;transition:opacity .2s ease,transform .45s var(--spring),visibility 0s}

.head{position:relative;flex:none;padding:18px 22px 20px;color:#fff;overflow:hidden;
  background:radial-gradient(130% 150% at 100% 0%,rgba(143,209,255,.38) 0%,rgba(143,209,255,0) 46%),linear-gradient(150deg,#1a64d0 0%,#0c3a6a 56%,#092d52 100%)}
.head::after{content:'';position:absolute;right:-46px;bottom:-70px;width:190px;height:190px;border-radius:50%;border:1px solid rgba(165,232,239,.18);box-shadow:0 0 0 22px rgba(165,232,239,.05),0 0 0 46px rgba(165,232,239,.035);pointer-events:none}
.eyebrow{display:flex;align-items:center;gap:8px;font-size:11px;font-weight:700;letter-spacing:.14em;text-transform:uppercase;color:var(--aqua)}
.eyebrow b{font-weight:700;color:#fff;letter-spacing:-.02em;text-transform:none;font-size:13px}
.eyebrow b em{font-style:normal;color:var(--cyan)}
.eyebrow i{width:3px;height:3px;border-radius:50%;background:rgba(165,232,239,.6)}
.head h2{margin:8px 0 3px;font-size:22px;line-height:1.15;font-weight:600;letter-spacing:-.03em}
.head p{margin:0;max-width:34ch;font-size:13.5px;line-height:1.5;color:#cfe1f0;text-wrap:balance}
.close{position:absolute;top:14px;right:14px;display:grid;place-items:center;width:34px;height:34px;padding:0;border:1px solid rgba(255,255,255,.18);border-radius:11px;background:rgba(255,255,255,.08);color:#fff;transition:background .2s}
.close:hover{background:rgba(255,255,255,.18)}

.body{flex:1;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 20px 10px;display:grid;gap:16px;align-content:start}
.label-row{display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:8px}
.label{font-size:12px;font-weight:700;letter-spacing:.02em;color:var(--muted)}
.label small{font-weight:500;color:var(--faint);letter-spacing:0;margin-left:4px}

.reporter{display:flex;align-items:center;gap:10px;min-width:0;flex:1}
.avatar{display:grid;place-items:center;flex:none;width:36px;height:36px;border-radius:50%;background:linear-gradient(145deg,var(--blue-2),var(--navy-2));color:#fff;font-size:12.5px;font-weight:700;letter-spacing:.03em;box-shadow:inset 0 1px 0 rgba(255,255,255,.25),0 0 0 3px #eef4fb}
.who{min-width:0;flex:1;line-height:1.25}
.who small{display:block;font-size:10px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:var(--faint)}
.who strong{display:block;margin-top:2px;font-size:13.5px;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.who strong span{font-weight:500;color:var(--muted)}
.reporter.is-loading .avatar,.reporter.is-loading .who strong{color:transparent;background:linear-gradient(90deg,#e6edf3 0%,#f3f7fa 50%,#e6edf3 100%);background-size:200% 100%;animation:shimmer 1.3s linear infinite;border-radius:6px;box-shadow:none}
.reporter.is-loading .avatar{border-radius:50%}
.reporter.is-loading .who strong{width:110px}

.shot{position:relative;height:172px;border-radius:15px;overflow:hidden;background:#eef3f8;border:1px solid var(--line)}
.shot canvas{display:block;width:100%;height:100%;object-fit:cover;object-position:top center;cursor:zoom-in}
.shot-tools{position:absolute;inset:auto 0 0 0;display:flex;align-items:center;justify-content:space-between;gap:8px;padding:28px 10px 10px;background:linear-gradient(180deg,rgba(5,18,34,0) 0%,rgba(5,18,34,.62) 100%);opacity:0;transform:translateY(6px);transition:opacity .2s,transform .3s var(--ease)}
.shot:hover .shot-tools,.shot:focus-within .shot-tools{opacity:1;transform:none}
@media (hover:none){.shot-tools{opacity:1;transform:none}}
.chip{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 12px;border:0;border-radius:10px;font-size:12.5px;font-weight:600;white-space:nowrap;transition:background .2s,transform .2s var(--ease)}
.chip.primary{background:#fff;color:var(--navy);box-shadow:0 4px 14px rgba(2,16,31,.25)}
.chip.primary:hover{transform:translateY(-1px)}
.chip.glass{width:32px;padding:0;justify-content:center;background:rgba(255,255,255,.16);color:#fff;backdrop-filter:blur(6px);-webkit-backdrop-filter:blur(6px)}
.chip.glass:hover{background:rgba(255,255,255,.28)}
.chip-group{display:flex;gap:6px}
.badge{position:absolute;top:10px;left:10px;display:inline-flex;align-items:center;gap:6px;height:24px;padding:0 9px;border-radius:999px;background:rgba(255,45,85,.92);color:#fff;font-size:11px;font-weight:700;letter-spacing:.02em;box-shadow:0 4px 12px rgba(255,45,85,.35)}
.shot-state{position:absolute;inset:0;display:grid;place-items:center;align-content:center;gap:8px;padding:16px;text-align:center;color:var(--muted);font-size:13px}
.shot-state strong{display:block;font-size:13.5px;color:var(--ink);font-weight:600}
.shot-state .ico{display:grid;place-items:center;width:40px;height:40px;margin:0 auto;border-radius:12px;background:#fff;color:var(--blue);box-shadow:0 4px 14px rgba(9,45,82,.1)}
.shot.is-capturing{background:linear-gradient(100deg,#e9eff5 20%,#f6f9fb 40%,#e9eff5 60%);background-size:220% 100%;animation:shimmer 1.4s linear infinite}
.shot.is-capturing .ico{animation:pulse 1.2s ease-in-out infinite}
.shot.is-empty{border-style:dashed;border-color:#cfdbe6;background:var(--soft)}
.link-btn{display:inline-flex;align-items:center;gap:6px;margin-top:2px;padding:7px 12px;border:1px solid #cfdbe6;border-radius:10px;background:#fff;font-size:12.5px;font-weight:600;color:var(--blue);transition:border-color .2s,background .2s}
.link-btn:hover{border-color:var(--blue);background:#f4f8fe}

.seg{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:4px;padding:4px;border-radius:13px;background:#eef3f8}
.seg button{display:flex;align-items:center;justify-content:center;gap:7px;height:36px;padding:0 8px;border:0;border-radius:10px;background:transparent;font-size:13px;font-weight:600;color:var(--muted);transition:background .2s,color .2s,box-shadow .2s}
.seg button:hover{color:var(--ink)}
.seg button[aria-checked="true"]{background:#fff;color:var(--ink);box-shadow:0 1px 2px rgba(9,45,82,.12),0 3px 10px rgba(9,45,82,.08)}
.seg .dot{width:7px;height:7px;border-radius:50%;flex:none}
.dot.problem{background:#e5484d}.dot.question{background:#2f7ce6}.dot.idea{background:#30a46c}

.message{position:relative}
textarea{display:block;width:100%;min-height:118px;max-height:260px;margin:0;padding:12px 14px 22px;resize:none;border:1px solid #cfdbe6;border-radius:15px;background:#fff;font:400 14.5px/1.55 var(--font);color:var(--ink);transition:border-color .2s,box-shadow .2s}
textarea::placeholder{color:#97a8b8}
textarea:focus{outline:none;border-color:var(--blue);box-shadow:0 0 0 4px rgba(20,91,199,.13)}
textarea.is-invalid{border-color:#d4505a;box-shadow:0 0 0 4px rgba(212,80,90,.12)}
.count{position:absolute;right:12px;bottom:8px;font-size:11px;color:var(--faint);pointer-events:none}
.count.is-near{color:#b45309}
.helper{display:flex;justify-content:space-between;gap:10px;margin-top:7px;font-size:12px;color:var(--faint)}
.helper .keys{white-space:nowrap}

.alert{display:flex;gap:10px;align-items:flex-start;padding:11px 13px;border:1px solid var(--bad-line);border-radius:13px;background:var(--bad-bg);color:var(--bad);font-size:13px;line-height:1.45;animation:rise .3s var(--ease)}
.alert svg{flex:none;margin-top:1px}

.foot{flex:none;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:14px 20px 16px;border-top:1px solid #eef3f7;background:#fbfcfe}
kbd{display:inline-block;padding:1px 5px;border:1px solid #d9e3ea;border-bottom-width:2px;border-radius:5px;background:#fff;font:600 10.5px/1.4 var(--font);color:var(--muted)}
.foot-actions{display:flex;gap:10px;flex:none}
.foot.is-done{justify-content:flex-end}
.foot.is-done .foot-actions{flex:1}
.foot.is-done .btn{flex:1}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;height:44px;padding:0 18px;border:0;border-radius:13px;font-size:14.5px;font-weight:600;letter-spacing:-.01em;white-space:nowrap;transition:transform .2s var(--ease),box-shadow .2s,background .2s,opacity .2s}
.btn.primary{color:#fff;background:linear-gradient(145deg,#2a72e0 0%,#145bc7 50%,#0f4a92 100%);box-shadow:0 10px 22px -8px rgba(20,91,199,.7),inset 0 1px 0 rgba(255,255,255,.22)}
.btn.primary:hover:not(:disabled){transform:translateY(-1px);box-shadow:0 14px 26px -8px rgba(20,91,199,.75),inset 0 1px 0 rgba(255,255,255,.26)}
.btn.primary:active:not(:disabled){transform:none}
.btn.primary svg{transition:transform .3s var(--ease)}
.btn.primary:hover:not(:disabled) svg.i-send{transform:translate(2px,-2px)}
.btn.ghost{background:#eaf1f7;color:var(--navy)}
.btn.ghost:hover{background:#dbe7f1}
.btn:disabled{opacity:.7}
.spinner{width:16px;height:16px;border:2px solid rgba(255,255,255,.35);border-top-color:#fff;border-radius:50%;animation:spin .7s linear infinite}

.is-sending .body{opacity:.55;pointer-events:none;transition:opacity .2s}
.is-sending .close{opacity:.45;pointer-events:none}

/* Sent */
.done{display:grid;justify-items:center;gap:6px;padding:34px 26px 14px;text-align:center}
.tick{position:relative;display:grid;place-items:center;width:78px;height:78px;margin-bottom:12px;border-radius:50%;color:#fff;background:radial-gradient(circle at 32% 28%,#4fd897 0%,#1f9d5f 55%,#167a49 100%);box-shadow:0 18px 36px -12px rgba(26,138,82,.65),inset 0 1px 0 rgba(255,255,255,.35);animation:pop .6s var(--spring) both}
.tick::before,.tick::after{content:'';position:absolute;inset:-1px;border-radius:50%;border:2px solid rgba(48,164,108,.45);animation:burst 1.1s var(--ease) .15s both}
.tick::after{animation-delay:.32s}
.tick svg path{stroke-dasharray:28;stroke-dashoffset:28;animation:draw .45s ease .28s forwards}
.done h3{margin:0;font-size:23px;line-height:1.2;font-weight:600;letter-spacing:-.03em;color:var(--ink)}
.done p{margin:2px 0 0;max-width:34ch;font-size:13.5px;line-height:1.55;color:var(--muted);text-wrap:balance}
.ref{display:inline-flex;align-items:center;gap:8px;margin:10px 0 4px;padding:6px 6px 6px 14px;border:1px solid var(--line);border-radius:12px;background:var(--soft);font-size:15px;font-weight:700;letter-spacing:.02em;color:var(--navy)}
.ref button{display:grid;place-items:center;width:30px;height:30px;padding:0;border:0;border-radius:8px;background:#fff;color:var(--muted);box-shadow:0 1px 2px rgba(9,45,82,.1);transition:color .2s}
.ref button:hover{color:var(--blue)}
.sent-to{font-size:12px;color:var(--faint)}

/* Mark-up editor */
.markup{position:fixed;inset:0;z-index:5;display:flex;flex-direction:column;background:rgba(4,14,28,.88);-webkit-backdrop-filter:blur(10px);backdrop-filter:blur(10px);color:#fff;opacity:0;transition:opacity .25s}
.markup.is-open{opacity:1}
.markup-bar{display:flex;flex-wrap:wrap;align-items:center;justify-content:space-between;gap:12px 18px;padding:14px 20px;padding-top:max(14px,env(safe-area-inset-top))}
.markup-title strong{display:block;font-size:16px;font-weight:600;letter-spacing:-.02em}
.markup-title span{display:block;font-size:12.5px;color:#9fb4c8}
.tools{display:flex;align-items:center;gap:4px;padding:5px;border-radius:15px;background:rgba(255,255,255,.08);border:1px solid rgba(255,255,255,.12)}
.tools button{display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 12px;border:0;border-radius:11px;background:transparent;font-size:13px;font-weight:600;color:#d6e3ef;transition:background .2s,color .2s}
.tools button:hover:not(:disabled){background:rgba(255,255,255,.1);color:#fff}
.tools button[aria-pressed="true"]{background:#fff;color:var(--navy)}
.tools button[data-tool="box"][aria-pressed="true"] svg,.tools button[data-tool="pen"][aria-pressed="true"] svg{color:${MARK_COLOR}}
.tools button:disabled{opacity:.35}
.tools .sep{width:1px;height:22px;margin:0 4px;background:rgba(255,255,255,.16)}
.markup-actions{display:flex;gap:8px}
.markup-actions .btn{height:40px}
.markup-actions .btn.ghost{background:rgba(255,255,255,.1);color:#fff}
.markup-actions .btn.ghost:hover{background:rgba(255,255,255,.18)}
.stage{flex:1;min-height:0;display:grid;place-items:center;padding:6px 20px 24px;padding-bottom:max(24px,env(safe-area-inset-bottom))}
.stage canvas{display:block;border-radius:12px;background:#fff;box-shadow:0 30px 90px rgba(0,0,0,.55),0 0 0 1px rgba(255,255,255,.08);touch-action:none;cursor:crosshair}

@keyframes shimmer{to{background-position:-220% 0}}
@keyframes pulse{50%{transform:scale(.9);opacity:.7}}
@keyframes spin{to{transform:rotate(360deg)}}
@keyframes rise{from{opacity:0;transform:translateY(4px)}to{opacity:1;transform:none}}
@keyframes pop{from{opacity:0;transform:scale(.5)}to{opacity:1;transform:none}}
@keyframes burst{from{opacity:1;transform:scale(1)}to{opacity:0;transform:scale(1.7)}}
@keyframes draw{to{stroke-dashoffset:0}}

@media (max-width:560px){
  .root.is-open .scrim{opacity:1;pointer-events:auto}
  .panel{left:0;right:0;bottom:0;width:100%;max-width:none;max-height:calc(100dvh - 28px);border-radius:24px 24px 0 0;transform-origin:50% 100%;transform:translateY(40px)}
  .root.is-open .panel{transform:none}
  .head{padding-top:26px}
  .head::before{content:'';position:absolute;top:8px;left:50%;width:38px;height:4px;margin-left:-19px;border-radius:4px;background:rgba(255,255,255,.3)}
  .foot{padding-bottom:max(18px,env(safe-area-inset-bottom))}
  .root.is-open .bubble{opacity:0;pointer-events:none;transform:scale(.8)}
  .helper .keys{display:none}
  .tools .tool-label{display:none}
  .markup-title span{display:none}
  .markup-bar{gap:12px}
  .markup-title{flex:1;order:1;min-width:0}
  .markup-actions{order:2}
  .markup-actions .btn{height:38px;padding:0 14px}
  .tools{order:3;width:100%;justify-content:space-between}
  .tools .sep{margin:0}
}
@media (prefers-reduced-motion:reduce){
  *,*::before,*::after{animation-duration:.01ms!important;animation-iteration-count:1!important;transition-duration:.01ms!important}
}
`

/* Page-level tweaks so the bubble never covers the console's own toasts or
 * the last buttons of a scrolled modal. */
const PAGE_STYLES=`
@media print{#skybook-support{display:none!important}}
body.sb-support-on .toast-stack{bottom:92px}
body.sb-support-on .adm-modal{padding-bottom:104px}
body.sb-support-on .cal-day-panel-content{padding-bottom:104px}
`

/* ── Widget ───────────────────────────────────────────────────────── */
const draft=readDraft()
const state={
  ready:false,open:false,phase:'form',
  category:CATEGORIES.some(c=>c.value===draft.category) ? draft.category : 'problem',
  message:typeof draft.message==='string' ? draft.message.slice(0,MAX_MESSAGE) : '',
  shot:{status:'idle',base:null,marks:[]},
  context:null,me:null,meLoading:false,error:'',result:null,
  tool:'box',editMarks:[],drawing:null
}
let captureSeq=0
let capturePromise=null
let host,root,el={}

const reporterInfo=()=>{
  const me=state.me
  if(!me)return null
  const profile=me.profile||{}
  const name=trimText(profile.full_name)||trimText(profile.username)||trimText(me.user?.email)||'SkyBook user'
  const role=ROLE_LABELS[profile.role]||humanize(profile.role||'')
  const detail=[role,profile.username ? `@${profile.username}` : ''].filter(Boolean).join(' · ')
  return {name,role,detail}
}

const build=()=>{
  host=document.createElement('div')
  host.id='skybook-support'
  host.setAttribute('data-html2canvas-ignore','true')
  host.style.cssText='position:fixed;top:0;left:0;width:0;height:0;z-index:2147483000'
  const shadow=host.attachShadow({mode:'open'})
  const pageStyle=document.createElement('style')
  pageStyle.id='skybook-support-page-styles'
  pageStyle.textContent=PAGE_STYLES
  document.head.appendChild(pageStyle)
  if(!document.querySelector('link[href*="family=DM+Sans"]')){
    const font=document.createElement('link')
    font.rel='stylesheet'
    font.href='https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&display=swap'
    document.head.appendChild(font)
  }
  shadow.innerHTML=`<style>${STYLES}</style>
  <div class="root">
    <div class="scrim" data-act="close"></div>
    <section class="panel" id="sb-panel" role="dialog" aria-modal="false" aria-labelledby="sb-title" aria-describedby="sb-desc">
      <header class="head">
        <div class="eyebrow"><b>Sky<em>Book</em></b><i></i><span>Support</span></div>
        <h2 id="sb-title">Log a ticket</h2>
        <p id="sb-desc">Tell us what’s wrong. A screenshot of this page goes with your message.</p>
        <button class="close" type="button" data-act="close" aria-label="Close">${svg(ICON.close,18)}</button>
      </header>
      <div class="body" data-view="form">
        <div>
          <div class="label-row"><span class="label" id="sb-shot-label">Screenshot</span></div>
          <div class="shot" aria-labelledby="sb-shot-label"></div>
        </div>
        <div>
          <div class="label-row"><label class="label" for="sb-message">What’s the issue?</label></div>
          <div class="message">
            <textarea id="sb-message" maxlength="${MAX_MESSAGE}" placeholder="What happened, and what did you expect? Add the booking reference if it’s about a booking." aria-describedby="sb-helper"></textarea>
            <span class="count" aria-hidden="true"></span>
          </div>
          <div class="helper" id="sb-helper"><span>Page &amp; browser details are included.</span>${finePointer() ? `<span class="keys">${isMac ? '<kbd>⌘</kbd>' : '<kbd>Ctrl</kbd>'} + <kbd>Enter</kbd> sends</span>` : ''}</div>
        </div>
        <div>
          <div class="label-row"><span class="label" id="sb-type-label">Type</span></div>
          <div class="seg" role="radiogroup" aria-labelledby="sb-type-label">
            ${CATEGORIES.map(c=>`<button type="button" role="radio" data-category="${c.value}" title="${esc(c.hint)}"><span class="dot ${c.value}"></span>${esc(c.label)}</button>`).join('')}
          </div>
        </div>
        <div class="alert" role="alert" hidden></div>
      </div>
      <div class="body done" data-view="sent" hidden aria-live="polite"></div>
      <footer class="foot">
        <div class="reporter is-loading" title="Tickets are logged under your SkyBook profile">
          <div class="avatar" aria-hidden="true">··</div>
          <div class="who"><small>Logged by</small><strong>Loading…</strong></div>
        </div>
        <div class="foot-actions"><button class="btn primary" type="button" data-act="send">${svg(ICON.send,17).replace('<svg','<svg class="i-send"')}<span>Send ticket</span></button></div>
      </footer>
    </section>
    <button class="bubble" type="button" aria-label="Report an issue — log a support ticket" aria-expanded="false" aria-controls="sb-panel">
      <span class="bubble-label">Report an issue</span>
      <span class="bubble-icon">${svg(ICON.ticket,24).replace('<svg','<svg class="i-ticket"')}${svg(ICON.close,22).replace('<svg','<svg class="i-close"')}</span>
    </button>
    <div class="markup" role="dialog" aria-modal="true" aria-labelledby="sb-markup-title" hidden>
      <div class="markup-bar">
        <div class="markup-title"><strong id="sb-markup-title">Mark up screenshot</strong><span>Box or draw around the problem. Use Hide to cover guest or payment details.</span></div>
        <div class="tools" role="toolbar" aria-label="Mark-up tools">
          <button type="button" data-tool="box" aria-pressed="true" title="Draw a box (B)">${svg(ICON.box,17)}<span class="tool-label">Box</span></button>
          <button type="button" data-tool="pen" aria-pressed="false" title="Draw freehand (D)">${svg(ICON.pen,17)}<span class="tool-label">Draw</span></button>
          <button type="button" data-tool="hide" aria-pressed="false" title="Cover private details (H)">${svg(ICON.hide,17)}<span class="tool-label">Hide</span></button>
          <span class="sep" aria-hidden="true"></span>
          <button type="button" data-act="undo" title="Undo (${isMac ? '⌘' : 'Ctrl'}+Z)">${svg(ICON.undo,17)}<span class="tool-label">Undo</span></button>
          <button type="button" data-act="clear" title="Remove all marks">${svg(ICON.clear,17)}<span class="tool-label">Clear</span></button>
        </div>
        <div class="markup-actions">
          <button class="btn ghost" type="button" data-act="markup-cancel">Cancel</button>
          <button class="btn primary" type="button" data-act="markup-done">${svg(ICON.check,17)}<span>Done</span></button>
        </div>
      </div>
      <div class="stage"><canvas aria-label="Screenshot — drag to mark it up"></canvas></div>
    </div>
  </div>`
  root=shadow.querySelector('.root')
  el={
    shadow,
    bubble:shadow.querySelector('.bubble'),
    panel:shadow.querySelector('.panel'),
    form:shadow.querySelector('[data-view="form"]'),
    sent:shadow.querySelector('[data-view="sent"]'),
    reporter:shadow.querySelector('.reporter'),
    shot:shadow.querySelector('.shot'),
    seg:shadow.querySelector('.seg'),
    textarea:shadow.querySelector('textarea'),
    count:shadow.querySelector('.count'),
    alert:shadow.querySelector('.alert'),
    foot:shadow.querySelector('.foot'),
    footActions:shadow.querySelector('.foot-actions'),
    markup:shadow.querySelector('.markup'),
    stage:shadow.querySelector('.stage'),
    canvas:shadow.querySelector('.stage canvas')
  }
  el.textarea.value=state.message
  document.body.appendChild(host)
  document.body.classList.add('sb-support-on')
  bindEvents()
  renderCategory()
  renderCount()
  renderShot()
}

/* ── Rendering ────────────────────────────────────────────────────── */
const renderReporter=()=>{
  const info=reporterInfo()
  el.reporter.classList.toggle('is-loading',!info)
  if(!info)return
  el.reporter.innerHTML=`<div class="avatar" aria-hidden="true">${esc(initialsOf(info.name))}</div>
    <div class="who"><small>Logged by</small><strong>${esc(info.name)}${info.role ? ` <span>· ${esc(info.role)}</span>` : ''}</strong></div>`
  el.reporter.title=[info.name,info.detail].filter(Boolean).join(' — ')
}

const renderCategory=()=>{
  el.seg.querySelectorAll('[data-category]').forEach(button=>{
    const active=button.dataset.category===state.category
    button.setAttribute('aria-checked',active ? 'true' : 'false')
    button.tabIndex=active ? 0 : -1
  })
}

const renderCount=()=>{
  const length=el.textarea.value.length
  const near=length>MAX_MESSAGE*0.85
  el.count.textContent=length>MAX_MESSAGE*0.6 ? `${length.toLocaleString()} / ${MAX_MESSAGE.toLocaleString()}` : ''
  el.count.classList.toggle('is-near',near)
  el.textarea.style.height='auto'
  el.textarea.style.height=`${Math.min(260,Math.max(118,el.textarea.scrollHeight+2))}px`
}

const drawThumb=()=>{
  const {base,marks}=state.shot
  const canvas=el.shot.querySelector('canvas')
  if(!canvas||!base)return
  const width=Math.min(base.width,960)
  const k=width/base.width
  canvas.width=width
  canvas.height=Math.round(base.height*k)
  const ctx=canvas.getContext('2d')
  ctx.setTransform(k,0,0,k,0,0)
  ctx.drawImage(base,0,0)
  drawMarks(ctx,marks,strokeFor(base))
}

const renderShot=()=>{
  const {status,marks}=state.shot
  el.shot.className='shot'
  if(status==='capturing'||status==='idle'){
    el.shot.classList.add('is-capturing')
    el.shot.innerHTML=`<div class="shot-state" role="status"><span class="ico">${svg(ICON.camera,20)}</span><strong>Capturing your screen…</strong><span>Just a moment.</span></div>`
    return
  }
  if(status==='failed'){
    el.shot.classList.add('is-empty')
    el.shot.innerHTML=`<div class="shot-state"><span class="ico">${svg(ICON.camera,20)}</span><strong>Couldn’t capture this screen</strong><span>You can still send your ticket without it.</span><button class="link-btn" type="button" data-act="retake">${svg(ICON.retake,14)}Try again</button></div>`
    return
  }
  if(status==='removed'){
    el.shot.classList.add('is-empty')
    el.shot.innerHTML=`<div class="shot-state"><span class="ico">${svg(ICON.camera,20)}</span><strong>No screenshot</strong><span>This ticket will go without one.</span><button class="link-btn" type="button" data-act="retake">${svg(ICON.camera,14)}Add screenshot</button></div>`
    return
  }
  el.shot.innerHTML=`<canvas role="img" aria-label="Screenshot of this page${marks.length ? ', marked up' : ''}" data-act="markup" tabindex="-1"></canvas>
    ${marks.length ? `<span class="badge">${svg(ICON.pencil,12)}Marked up</span>` : ''}
    <div class="shot-tools">
      <button class="chip primary" type="button" data-act="markup">${svg(ICON.pencil,14)}${marks.length ? 'Edit marks' : 'Mark up'}</button>
      <span class="chip-group">
        <button class="chip glass" type="button" data-act="retake" title="Retake screenshot" aria-label="Retake screenshot">${svg(ICON.retake,15)}</button>
        <button class="chip glass" type="button" data-act="remove-shot" title="Send without a screenshot" aria-label="Remove screenshot">${svg(ICON.trash,15)}</button>
      </span>
    </div>`
  drawThumb()
}

const renderError=()=>{
  el.alert.hidden=!state.error
  el.alert.innerHTML=state.error ? `${svg(ICON.alert,17)}<span>${esc(state.error)}</span>` : ''
  if(state.error)el.alert.scrollIntoView({block:'nearest',behavior:prefersReducedMotion() ? 'auto' : 'smooth'})
}

const renderPhase=()=>{
  const sending=state.phase==='sending'
  const sent=state.phase==='sent'
  root.classList.toggle('is-sending',sending)
  el.form.hidden=sent
  el.sent.hidden=!sent
  el.reporter.hidden=sent
  el.foot.classList.toggle('is-done',sent)
  el.textarea.disabled=sending
  if(sent){
    const ref=state.result?.ticket?.reference||''
    const to=(state.result?.email?.to||[]).join(', ')
    el.sent.innerHTML=`<div class="tick">${svg(ICON.check,36).replace('stroke-width="2"','stroke-width="2.6"')}</div>
      <h3>Ticket sent</h3>
      ${ref ? `<div class="ref"><span>${esc(ref)}</span><button type="button" data-act="copy-ref" aria-label="Copy ticket number" title="Copy ticket number">${svg(ICON.copy,15)}</button></div>` : ''}
      <p>Aero Digital support has your message${state.result?.screenshot ? ' and screenshot' : ''}.${ref ? ` Quote ${esc(ref)} if you follow up.` : ''}</p>
      ${to ? `<span class="sent-to">Sent to ${esc(to)}</span>` : ''}`
    el.footActions.innerHTML=`<button class="btn ghost" type="button" data-act="another">Log another</button><button class="btn primary" type="button" data-act="close">Done</button>`
    return
  }
  el.footActions.innerHTML=`<button class="btn primary" type="button" data-act="send" ${sending ? 'disabled' : ''}>${sending ? '<span class="spinner" aria-hidden="true"></span><span>Sending…</span>' : `${svg(ICON.send,17).replace('<svg','<svg class="i-send"')}<span>Send ticket</span>`}</button>`
}

/* ── Capture ──────────────────────────────────────────────────────── */
const capture=()=>{
  const seq=++captureSeq
  state.shot={status:'capturing',base:null,marks:[]}
  state.context=collectContext()
  renderShot()
  const run=(async()=>{
    try{
      const html2canvas=await loadCaptureLib()
      const viewWidth=document.documentElement.clientWidth||window.innerWidth
      const viewHeight=window.innerHeight
      const raw=await withTimeout(html2canvas(document.body,{
        backgroundColor:pageBackground(),
        useCORS:true,
        logging:false,
        scale:Math.min(window.devicePixelRatio||1,2),
        x:window.scrollX,
        y:window.scrollY,
        width:viewWidth,
        height:viewHeight,
        windowWidth:viewWidth,
        windowHeight:viewHeight,
        ignoreElements:node=>node===host||node.id==='skybook-support',
        onclone:doc=>waitForClonedStyles(doc)
      }),CAPTURE_TIMEOUT_MS,'Capturing the screen took too long.')
      if(seq!==captureSeq)return
      state.shot={status:'ready',base:downscale(raw),marks:[]}
    }catch(error){
      if(seq!==captureSeq)return
      console.warn('[SkyBook support] screenshot failed',error)
      state.shot={status:'failed',base:null,marks:[]}
    }
    renderShot()
  })()
  capturePromise=run
  return run
}

const exportShot=()=>{
  const {base,marks}=state.shot
  if(!base)return ''
  const out=document.createElement('canvas')
  out.width=base.width
  out.height=base.height
  const ctx=out.getContext('2d')
  ctx.fillStyle='#ffffff'
  ctx.fillRect(0,0,out.width,out.height)
  ctx.drawImage(base,0,0)
  drawMarks(ctx,marks,strokeFor(base))
  return out.toDataURL('image/jpeg',JPEG_QUALITY)
}

/* ── Open / close ─────────────────────────────────────────────────── */
const loadMe=async()=>{
  if(state.me||state.meLoading)return
  state.meLoading=true
  try{
    state.me=await callApi('admin/me')
  }catch{
    // Older booking-api without admin/me: fall back to the session's own metadata.
    const session=await sessionFrom().catch(()=>null)
    const meta=session?.user?.user_metadata||{}
    const consoleName=trimText(document.getElementById('sessionUserName')?.textContent)
    const consoleRole=trimText(document.getElementById('sessionUserRole')?.textContent)
    state.me={user:{email:''},profile:{full_name:meta.full_name||consoleName||'',username:meta.username||'',role:meta.role||consoleRole.toLowerCase().replace(/\s+/g,'_')}}
  }finally{
    state.meLoading=false
    renderReporter()
  }
}

const open=()=>{
  if(!state.ready||state.open)return
  if(state.phase==='sent')resetForm()
  const keep=state.shot.status==='ready'&&state.shot.marks.length
  if(!keep)capture()
  else state.context=collectContext()
  state.open=true
  state.error=''
  renderError()
  root.classList.add('is-open')
  el.bubble.setAttribute('aria-expanded','true')
  el.bubble.setAttribute('aria-label','Close the support ticket panel')
  renderReporter()
  loadMe()
  if(finePointer())window.setTimeout(()=>{ if(state.open&&state.phase==='form')el.textarea.focus({preventScroll:true}) },80)
}

const close=({restoreFocus=true,force=false}={})=>{
  if(!state.open)return
  // The request is already on its way; keep the panel up so the result is seen.
  if(state.phase==='sending'&&!force)return
  state.open=false
  root.classList.remove('is-open')
  el.bubble.setAttribute('aria-expanded','false')
  el.bubble.setAttribute('aria-label','Report an issue — log a support ticket')
  if(state.phase==='sent')resetForm()
  if(restoreFocus)el.bubble.focus({preventScroll:true})
}

const resetForm=()=>{
  state.phase='form'
  state.result=null
  state.error=''
  state.message=''
  state.category='problem'
  state.shot={status:'idle',base:null,marks:[]}
  el.textarea.value=''
  writeDraft(null)
  renderCategory()
  renderCount()
  renderError()
  renderPhase()
  renderShot()
}

/* ── Send ─────────────────────────────────────────────────────────── */
const send=async()=>{
  if(state.phase!=='form')return
  const message=el.textarea.value.trim()
  if(message.length<3){
    state.error='Tell us what the issue is before sending.'
    renderError()
    el.textarea.classList.add('is-invalid')
    el.textarea.focus()
    return
  }
  state.phase='sending'
  state.error=''
  renderError()
  renderPhase()
  try{
    if(state.shot.status==='capturing'&&capturePromise)await capturePromise
    const screenshot=state.shot.status==='ready' ? exportShot() : ''
    const context={...(state.context||collectContext()),online:navigator.onLine!==false,errors:recentErrors.slice(-8),screenshot_marked_up:state.shot.marks.length>0}
    const result=await callApi('admin/support-tickets',{method:'POST',body:{message,category:state.category,screenshot,context}})
    state.result={...result,screenshot:Boolean(screenshot)}
    state.phase='sent'
    state.message=''
    el.textarea.value=''
    writeDraft(null)
    renderPhase()
    el.footActions.querySelector('[data-act="close"]')?.focus({preventScroll:true})
  }catch(error){
    state.phase='form'
    state.error=friendlyError(error)
    renderPhase()
    renderError()
  }
}

/* ── Mark-up editor ───────────────────────────────────────────────── */
let stageFit={k:1,dpr:1}
const layoutStage=()=>{
  const base=state.shot.base
  if(!base||el.markup.hidden)return
  const style=getComputedStyle(el.stage)
  const availableWidth=el.stage.clientWidth-parseFloat(style.paddingLeft)-parseFloat(style.paddingRight)
  const availableHeight=el.stage.clientHeight-parseFloat(style.paddingTop)-parseFloat(style.paddingBottom)
  const k=Math.min(availableWidth/base.width,availableHeight/base.height,1.5)
  const width=Math.max(1,Math.floor(base.width*k))
  const height=Math.max(1,Math.floor(base.height*k))
  const dpr=Math.min(window.devicePixelRatio||1,2)
  el.canvas.style.width=`${width}px`
  el.canvas.style.height=`${height}px`
  el.canvas.width=Math.round(width*dpr)
  el.canvas.height=Math.round(height*dpr)
  stageFit={k,dpr}
  drawStage()
}
const drawStage=()=>{
  const base=state.shot.base
  if(!base)return
  const ctx=el.canvas.getContext('2d')
  const scale=stageFit.k*stageFit.dpr
  ctx.setTransform(1,0,0,1,0,0)
  ctx.clearRect(0,0,el.canvas.width,el.canvas.height)
  ctx.setTransform(scale,0,0,scale,0,0)
  ctx.imageSmoothingQuality='high'
  ctx.drawImage(base,0,0)
  const marks=state.drawing ? [...state.editMarks,state.drawing.type==='pen' ? state.drawing : normalizeRect(state.drawing)] : state.editMarks
  drawMarks(ctx,marks,strokeFor(base))
  renderTools()
}
const renderTools=()=>{
  el.markup.querySelectorAll('[data-tool]').forEach(button=>button.setAttribute('aria-pressed',button.dataset.tool===state.tool ? 'true' : 'false'))
  const empty=!state.editMarks.length
  el.markup.querySelector('[data-act="undo"]').disabled=empty
  el.markup.querySelector('[data-act="clear"]').disabled=empty
}
const pointFrom=event=>{
  const rect=el.canvas.getBoundingClientRect()
  const base=state.shot.base
  const x=Math.max(0,Math.min(base.width,(event.clientX-rect.left)/rect.width*base.width))
  const y=Math.max(0,Math.min(base.height,(event.clientY-rect.top)/rect.height*base.height))
  return [x,y]
}
const openMarkup=()=>{
  if(state.shot.status!=='ready')return
  state.editMarks=[...state.shot.marks]
  state.drawing=null
  el.markup.hidden=false
  requestAnimationFrame(()=>{ el.markup.classList.add('is-open'); layoutStage() })
  el.markup.querySelector(`[data-tool="${state.tool}"]`)?.focus({preventScroll:true})
}
const closeMarkup=commit=>{
  if(el.markup.hidden)return
  if(commit){
    state.shot.marks=[...state.editMarks]
    renderShot()
  }
  state.drawing=null
  el.markup.classList.remove('is-open')
  window.setTimeout(()=>{ el.markup.hidden=true },prefersReducedMotion() ? 0 : 220)
  el.shot.querySelector('[data-act="markup"]')?.focus({preventScroll:true})
}

/* ── Events ───────────────────────────────────────────────────────── */
const bindEvents=()=>{
  el.bubble.addEventListener('click',()=>state.open ? close() : open())
  el.bubble.addEventListener('pointerenter',()=>{ loadCaptureLib().catch(()=>{}) },{once:true})
  el.bubble.addEventListener('focus',()=>{ loadCaptureLib().catch(()=>{}) },{once:true})

  el.shadow.addEventListener('click',event=>{
    const target=event.target.closest('[data-act],[data-category],[data-tool]')
    if(!target)return
    if(target.dataset.category){
      state.category=target.dataset.category
      renderCategory()
      writeDraft({message:el.textarea.value,category:state.category})
      return
    }
    if(target.dataset.tool){ state.tool=target.dataset.tool; renderTools(); return }
    const act=target.dataset.act
    if(act==='close')close()
    else if(act==='send')send()
    else if(act==='retake')capture()
    else if(act==='remove-shot'){ captureSeq++; state.shot={status:'removed',base:null,marks:[]}; renderShot() }
    else if(act==='markup')openMarkup()
    else if(act==='markup-cancel')closeMarkup(false)
    else if(act==='markup-done')closeMarkup(true)
    else if(act==='undo'){ state.editMarks.pop(); drawStage() }
    else if(act==='clear'){ state.editMarks=[]; drawStage() }
    else if(act==='another'){ resetForm(); capture(); el.textarea.focus({preventScroll:true}) }
    else if(act==='copy-ref'){
      const ref=state.result?.ticket?.reference||''
      navigator.clipboard?.writeText(ref).then(()=>{
        target.innerHTML=svg(ICON.check,15)
        window.setTimeout(()=>{ if(target.isConnected)target.innerHTML=svg(ICON.copy,15) },1600)
      }).catch(()=>{})
    }
  })

  el.seg.addEventListener('keydown',event=>{
    if(!['ArrowLeft','ArrowRight','ArrowUp','ArrowDown'].includes(event.key))return
    event.preventDefault()
    const index=CATEGORIES.findIndex(c=>c.value===state.category)
    const step=['ArrowLeft','ArrowUp'].includes(event.key) ? -1 : 1
    state.category=CATEGORIES[(index+step+CATEGORIES.length)%CATEGORIES.length].value
    renderCategory()
    el.seg.querySelector(`[data-category="${state.category}"]`)?.focus()
    writeDraft({message:el.textarea.value,category:state.category})
  })

  el.textarea.addEventListener('input',()=>{
    el.textarea.classList.remove('is-invalid')
    if(state.error){ state.error=''; renderError() }
    renderCount()
    writeDraft({message:el.textarea.value,category:state.category})
  })
  el.textarea.addEventListener('keydown',event=>{
    if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){ event.preventDefault(); send() }
  })

  el.shadow.addEventListener('keydown',event=>{
    if(!el.markup.hidden){
      if(event.key==='Escape'){ event.preventDefault(); closeMarkup(false); return }
      if(event.key==='Enter'&&!event.target.closest('button')){ event.preventDefault(); closeMarkup(true); return }
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){ event.preventDefault(); state.editMarks.pop(); drawStage(); return }
      const tool={b:'box',d:'pen',h:'hide'}[event.key.toLowerCase()]
      if(tool&&!event.metaKey&&!event.ctrlKey&&!event.altKey){ state.tool=tool; renderTools(); return }
      if(event.key==='Tab'){
        const focusable=[...el.markup.querySelectorAll('button:not(:disabled)')]
        const first=focusable[0]
        const last=focusable[focusable.length-1]
        const active=el.shadow.activeElement
        if(event.shiftKey&&active===first){ event.preventDefault(); last.focus() }
        else if(!event.shiftKey&&active===last){ event.preventDefault(); first.focus() }
      }
      return
    }
    if(event.key==='Escape'&&state.open){ event.preventDefault(); close() }
  })

  el.canvas.addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.pointerType==='mouse')return
    event.preventDefault()
    el.canvas.setPointerCapture?.(event.pointerId)
    const [x,y]=pointFrom(event)
    state.drawing=state.tool==='pen' ? {type:'pen',points:[[x,y]]} : {type:state.tool,x,y,w:0,h:0}
    drawStage()
  })
  el.canvas.addEventListener('pointermove',event=>{
    if(!state.drawing)return
    const [x,y]=pointFrom(event)
    if(state.drawing.type==='pen'){
      const last=state.drawing.points[state.drawing.points.length-1]
      if(Math.hypot(x-last[0],y-last[1])>1.5)state.drawing.points.push([x,y])
    }else{
      state.drawing.w=x-state.drawing.x
      state.drawing.h=y-state.drawing.y
    }
    drawStage()
  })
  const finish=()=>{
    const mark=state.drawing
    if(!mark)return
    state.drawing=null
    const min=Math.max(6,strokeFor(state.shot.base)*2)
    if(mark.type==='pen'){
      if(mark.points.length>1)state.editMarks.push(mark)
    }else{
      const rect=normalizeRect(mark)
      if(rect.w>=min&&rect.h>=min)state.editMarks.push(rect)
    }
    drawStage()
  }
  el.canvas.addEventListener('pointerup',finish)
  el.canvas.addEventListener('pointercancel',finish)
  el.canvas.addEventListener('lostpointercapture',finish)

  window.addEventListener('resize',()=>{ if(!el.markup.hidden)layoutStage() })
}

/* ── Start: only for a signed-in SkyBook session ──────────────────── */
const show=()=>{
  if(state.ready)return
  state.ready=true
  build()
  watchToasts()
  const idle=window.requestIdleCallback||(fn=>window.setTimeout(fn,1500))
  idle(()=>{ loadMe() })
}
const hide=()=>{
  if(!state.ready)return
  close({restoreFocus:false,force:true})
  host?.remove()
  document.getElementById('skybook-support-page-styles')?.remove()
  document.body.classList.remove('sb-support-on')
  state.ready=false
  state.me=null
}
const start=async(attempt=0)=>{
  const api=booking()
  if(!api?.createSupabaseClient){
    if(attempt<40)window.setTimeout(()=>start(attempt+1),250)
    return
  }
  try{
    const client=await api.createSupabaseClient()
    const {data}=await client.auth.getSession()
    if(data?.session)show()
    client.auth.onAuthStateChange((event,session)=>{
      if(session&&!state.ready)show()
      if(!session&&event==='SIGNED_OUT')hide()
    })
  }catch(error){
    console.warn('[SkyBook support] not started',error)
  }
}

window.SkyBookSupport={ open:()=>{ if(state.ready)open() }, close:()=>close() }
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>start(),{once:true})
else start()
})()
