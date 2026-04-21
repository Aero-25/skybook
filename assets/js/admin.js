const shared=window.TrueTravelShared||{}
const bookingCatalog=window.TrueTravelBooking||null
const escapeHtml=shared.escapeHtml
  ? value=>shared.escapeHtml(value)
  : value=>String(value??'')
    .replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))

const DESIGNER_CONFIG=window.SkyBookConfig||{}
const DESIGNER_BRAND_STORAGE_KEY=DESIGNER_CONFIG.brandStorageKey||'skybook_designer_brand'
const DESIGNER_BRANDS=DESIGNER_CONFIG.brands||{
  'true-travel':{
    label:'True Travel',
    vibe:'Ocean-led public site',
    siteBase:'../sites/true-travel',
    homePath:'index.html',
    toursPath:'tours.html',
    toursLabel:'Tours'
  },
  'iventure':{
    label:'Iventure',
    vibe:'Sand-and-dune public site',
    siteBase:'../sites/iventure',
    homePath:'index.html',
    toursPath:'services.html',
    toursLabel:'Services'
  }
}

const CATEGORY_GROUPS=[
  {
    key:'coastal-tours',
    title:'Core Tours',
    description:'Primary shared tours that are currently assigned to this brand.'
  },
  {
    key:'combo-tours',
    title:'Combo Tours',
    description:'Multi-experience packages managed centrally in the SkyBook catalog.'
  },
  {
    key:'private-experiences',
    title:'Private Experiences',
    description:'Premium or custom departures that still flow through the shared backend.'
  }
]

const pageUrl=new URL(window.location.href)
const requestedBrandCode=pageUrl.searchParams.get('brand')?.trim().toLowerCase()||''
const storedBrandCode=(window.localStorage.getItem(DESIGNER_BRAND_STORAGE_KEY)||'').trim().toLowerCase()

const isValidBrandCode=brandCode=>Boolean(brandCode)&&Object.prototype.hasOwnProperty.call(DESIGNER_BRANDS,brandCode)
const getBrandConfig=brandCode=>DESIGNER_BRANDS[brandCode]||DESIGNER_BRANDS['true-travel']

let activeBrandCode=isValidBrandCode(requestedBrandCode)
  ? requestedBrandCode
  : (isValidBrandCode(storedBrandCode) ? storedBrandCode : 'true-travel')

let catalogServices=[]
let catalogLoaded=false

const shouldPromptForBrand=!isValidBrandCode(requestedBrandCode)

const frame=document.getElementById('previewFrame')
const statusNode=document.getElementById('adminStatus')
const tourGrid=document.getElementById('tourGrid')
const reloadToursButton=document.getElementById('reloadToursFromRemote')
const sitePicker=document.getElementById('sitePicker')
const brandSelectButtons=[...document.querySelectorAll('[data-brand-select]')]
const brandSwitchButtons=[...document.querySelectorAll('[data-brand-switch]')]
const openSiteEditorLink=document.getElementById('openSiteEditor')
const viewSiteLink=document.getElementById('viewSiteLink')
const openCatalogAdminLink=document.getElementById('openCatalogAdminLink')
const openToursPageLink=document.getElementById('openToursPage')
const activeBrandNameNode=document.getElementById('activeBrandName')
const activeBrandVibeNode=document.getElementById('activeBrandVibe')
const workspaceBrandKickerNode=document.getElementById('workspaceBrandKicker')
const workspaceTitleNode=document.getElementById('workspaceTitle')
const workspaceDescriptionNode=document.getElementById('workspaceDescription')
const libraryBrandKickerNode=document.getElementById('libraryBrandKicker')
const libraryTitleNode=document.getElementById('libraryTitle')
const libraryDescriptionNode=document.getElementById('libraryDescription')

const setStatus=(message,isError=false)=>{
  if(!statusNode){
    if(isError)console.error(message)
    else console.info(message)
    return
  }
  statusNode.textContent=message
  statusNode.classList.toggle('is-error',isError)
}

const getActiveBrand=()=>getBrandConfig(activeBrandCode)

const buildSiteUrl=(brand,path,search='')=>{
  const base=String(brand.siteBase||'').replace(/\/+$/,'')
  const suffix=search ? `${path}${search}` : path
  return `${base}/${suffix}`
}

const buildDesignStudioUrl=hash=>{
  const nextHash=hash||window.location.hash||''
  return `design-admin.html?brand=${encodeURIComponent(activeBrandCode)}${nextHash}`
}

const buildSkyBookCatalogUrl=serviceId=>{
  const nextUrl=new URL('booking-admin.html',window.location.href)
  nextUrl.searchParams.set('tab','services')
  if(serviceId)nextUrl.searchParams.set('service',serviceId)
  return `${nextUrl.pathname}${nextUrl.search}`
}

const setPickerVisibility=isVisible=>{
  if(!sitePicker)return
  sitePicker.hidden=!isVisible
  sitePicker.classList.toggle('is-visible',isVisible)
  document.body.classList.toggle('has-site-picker',isVisible)
}

const syncBrandUrl=()=>{
  const currentUrl=new URL(window.location.href)
  currentUrl.searchParams.set('brand',activeBrandCode)
  history.replaceState(null,'',`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
}

const reloadPreview=()=>{
  if(!frame)return
  const brand=getActiveBrand()
  frame.src=buildSiteUrl(brand,brand.homePath,`?admin=1&v=${Date.now()}`)
  frame.title=`${brand.label} editor preview`
}

const getRequestedPage=()=>window.location.hash.replace(/^#/,'').trim()==='tours' ? 'tours' : 'index'

const getServiceBrandCodes=service=>{
  const normalized=Array.isArray(service?.brand_codes)
    ? service.brand_codes.map(value=>String(value||'').trim().toLowerCase()).filter(Boolean)
    : []
  return normalized.length ? normalized : Object.keys(DESIGNER_BRANDS)
}

const formatMoney=(value,currency='NAD')=>{
  if(bookingCatalog?.formatMoney)return bookingCatalog.formatMoney(value,currency)
  return new Intl.NumberFormat('en-NA',{style:'currency',currency,maximumFractionDigits:2}).format(Number(value||0))
}

const getBrandVisibilityLabel=service=>{
  const labels=getServiceBrandCodes(service).map(code=>getBrandConfig(code).label)
  if(labels.length===2)return 'True Travel + Iventure'
  return labels[0]||'No brands selected'
}

const getBrandAssignmentLabel=service=>{
  const labels=getServiceBrandCodes(service)
  return labels.length>1 ? 'Shared across both brands' : `${getActiveBrand().label} only`
}

const getCategoryGroup=categorySlug=>{
  return CATEGORY_GROUPS.find(group=>group.key===categorySlug)||{
    key:categorySlug||'uncategorised',
    title:(categorySlug||'uncategorised').replace(/-/g,' ').replace(/\b\w/g,char=>char.toUpperCase()),
    description:'Additional catalog items from the shared SkyBook service library.'
  }
}

const getServiceSummary=service=>{
  const summary=String(service?.short_description||service?.full_description||'').trim()
  if(summary)return summary
  return 'This tour is managed centrally in SkyBook. Use the admin catalog to adjust pricing, availability rules, and brand visibility.'
}

const sortCatalogServices=services=>[...services].sort((left,right)=>{
  const orderDelta=(Number(left?.sort_order||0)-Number(right?.sort_order||0))
  if(orderDelta!==0)return orderDelta
  return String(left?.name||'').localeCompare(String(right?.name||''))
})

const buildServiceCardMarkup=(service,index)=>`
  <a class="tour-grid-card" href="${escapeHtml(buildSkyBookCatalogUrl(service.id))}">
    <div class="tour-grid-card-top">
      <div>
        <div class="tour-grid-kicker">SkyBook Tour ${(index+1).toString().padStart(2,'0')}</div>
        <h3>${escapeHtml(service.name)}</h3>
      </div>
      <div class="tour-grid-badges">
        <div class="tour-grid-badge is-type">${escapeHtml(getCategoryGroup(service.category_slug).title)}</div>
        <div class="tour-grid-badge${getServiceBrandCodes(service).length>1 ? ' is-featured' : ''}">${escapeHtml(getBrandAssignmentLabel(service))}</div>
      </div>
    </div>
    <p class="tour-grid-copy">${escapeHtml(getServiceSummary(service))}</p>
    <div class="tour-grid-stats">
      <div class="tour-grid-stat">
        <span>Base Price</span>
        <strong>${escapeHtml(formatMoney(service.base_price,service.currency||'NAD'))}</strong>
      </div>
      <div class="tour-grid-stat">
        <span>Duration</span>
        <strong>${escapeHtml(service.duration_label||'Flexible')}</strong>
      </div>
      <div class="tour-grid-stat">
        <span>Date Rule</span>
        <strong>${escapeHtml(String(service.preferred_date_mode||'optional').replace(/_/g,' '))}</strong>
      </div>
      <div class="tour-grid-stat">
        <span>Visibility</span>
        <strong>${escapeHtml(getBrandVisibilityLabel(service))}</strong>
      </div>
    </div>
    <div class="tour-grid-card-footer">
      <span>Manage in SkyBook Admin</span>
      <strong>&rarr;</strong>
    </div>
  </a>
`

const buildServiceGroupMarkup=({group,services,startIndex=0})=>{
  const cards=services.length
    ? services.map((service,index)=>buildServiceCardMarkup(service,startIndex+index)).join('')
    : `<article class="tour-grid-empty">No services assigned to ${escapeHtml(getActiveBrand().label)} in this group yet.</article>`

  return `
    <section class="tour-grid-group">
      <div class="tour-grid-group-head">
        <div>
          <h2>${escapeHtml(group.title)}</h2>
          <p class="tour-grid-group-copy">${escapeHtml(group.description)}</p>
        </div>
        <div class="tour-grid-group-count">${services.length}</div>
      </div>
      <div class="tours-grid">${cards}</div>
    </section>
  `
}

const renderCatalogGrid=()=>{
  if(!tourGrid)return
  if(!catalogLoaded){
    tourGrid.innerHTML=`<article class="tour-grid-empty">Loading the shared SkyBook catalog for ${escapeHtml(getActiveBrand().label)}...</article>`
    return
  }
  if(!catalogServices.length){
    tourGrid.innerHTML=`
      <article class="tour-grid-empty">
        No tours are currently assigned to ${escapeHtml(getActiveBrand().label)}.
        Add tours in SkyBook Admin, then tick ${escapeHtml(getActiveBrand().label)} in brand visibility to make them available here.
      </article>
    `
    return
  }

  let runningIndex=0
  const groupedMarkup=CATEGORY_GROUPS.map(group=>{
    const services=catalogServices.filter(service=>service.category_slug===group.key)
    if(!services.length)return ''
    const markup=buildServiceGroupMarkup({group,services,startIndex:runningIndex})
    runningIndex+=services.length
    return markup
  }).filter(Boolean)

  const uncategorised=catalogServices.filter(service=>!CATEGORY_GROUPS.some(group=>group.key===service.category_slug))
  if(uncategorised.length){
    groupedMarkup.push(buildServiceGroupMarkup({
      group:getCategoryGroup(uncategorised[0]?.category_slug||'uncategorised'),
      services:uncategorised,
      startIndex:runningIndex
    }))
  }

  tourGrid.innerHTML=groupedMarkup.join('')
}

const updateBrandChrome=()=>{
  const brand=getActiveBrand()
  const brandToursLabel=brand.toursLabel||'Tours'

  document.title=`SkyBook Design Studio · ${brand.label}`

  if(activeBrandNameNode)activeBrandNameNode.textContent=brand.label
  if(activeBrandVibeNode)activeBrandVibeNode.textContent=brand.vibe
  if(workspaceBrandKickerNode)workspaceBrandKickerNode.textContent=`${brand.label} Workspace`
  if(workspaceTitleNode)workspaceTitleNode.textContent=`${brand.label} Homepage`
  if(workspaceDescriptionNode)workspaceDescriptionNode.textContent=`Preview and visually inspect the ${brand.label} homepage in admin mode. Tour loading now happens centrally in SkyBook, while this workspace stays focused on presentation and layout.`
  if(libraryBrandKickerNode)libraryBrandKickerNode.textContent=`${brand.label} Catalog`
  if(libraryTitleNode)libraryTitleNode.textContent=`${brand.label} Catalog Preview`
  if(libraryDescriptionNode)libraryDescriptionNode.textContent=`Tours are loaded in the shared SkyBook admin. This panel shows which tours the ${brand.label} site can display and hands you back to the central catalog when something needs to be added or changed.`

  if(openSiteEditorLink){
    openSiteEditorLink.href=buildSiteUrl(brand,brand.homePath,'?admin=1')
    openSiteEditorLink.textContent=`Open ${brand.label} Editor`
  }
  if(viewSiteLink){
    viewSiteLink.href=buildSiteUrl(brand,brand.homePath)
    viewSiteLink.textContent=`View ${brand.label} Site`
  }
  if(openCatalogAdminLink){
    openCatalogAdminLink.href=buildSkyBookCatalogUrl()
    openCatalogAdminLink.textContent='Open Catalog In SkyBook'
  }
  if(openToursPageLink){
    openToursPageLink.href=buildSiteUrl(brand,brand.toursPath)
    openToursPageLink.textContent=`Open ${brandToursLabel} Page`
  }

  brandSelectButtons.forEach(button=>button.classList.toggle('is-active',button.dataset.brandSelect===activeBrandCode))
  brandSwitchButtons.forEach(button=>button.classList.toggle('is-current',button.dataset.brandSwitch===activeBrandCode))
}

const updateActivePanel=(page,{updateHash=true}={})=>{
  document.querySelectorAll('[data-page]').forEach(node=>node.classList.toggle('is-active',node.dataset.page===page))
  document.querySelectorAll('[data-panel-view]').forEach(node=>node.classList.toggle('is-active',node.dataset.panelView===page))

  if(updateHash){
    const nextHash=page==='tours' ? '#tours' : ''
    history.replaceState(null,'',buildDesignStudioUrl(nextHash))
  }

  if(page==='index')reloadPreview()
}

const loadCatalog=async({announce=false}={})=>{
  catalogLoaded=false
  renderCatalogGrid()
  try{
    if(!bookingCatalog?.apiRequest||!bookingCatalog?.normalizeService){
      throw new Error('SkyBook catalog client is unavailable in this designer build.')
    }
    const payload=await bookingCatalog.apiRequest('services',{
      headers:{'x-brand-code':activeBrandCode}
    })
    catalogServices=sortCatalogServices((payload?.services||[]).map(service=>bookingCatalog.normalizeService(service)))
    catalogLoaded=true
    renderCatalogGrid()
    if(announce)setStatus(`${getActiveBrand().label} catalog preview synced from SkyBook.`)
  }catch(error){
    catalogServices=[]
    catalogLoaded=true
    renderCatalogGrid()
    setStatus(error?.message||'The shared SkyBook catalog could not be loaded.',true)
  }
}

const setActiveBrand=brandCode=>{
  if(!isValidBrandCode(brandCode))return
  activeBrandCode=brandCode
  window.localStorage.setItem(DESIGNER_BRAND_STORAGE_KEY,brandCode)
  syncBrandUrl()
  updateBrandChrome()
  renderCatalogGrid()
  updateActivePanel(getRequestedPage(),{updateHash:false})
  setPickerVisibility(false)
  setStatus(`${getActiveBrand().label} design workspace loaded. Syncing the shared SkyBook catalog...`)
  void loadCatalog()
}

reloadToursButton?.addEventListener('click',()=>{
  setStatus(`Refreshing the live SkyBook catalog for ${getActiveBrand().label}...`)
  void loadCatalog({announce:true})
})

document.querySelectorAll('[data-page]').forEach(button=>{
  button.addEventListener('click',()=>{updateActivePanel(button.dataset.page)})
})

brandSelectButtons.forEach(button=>{
  button.addEventListener('click',()=>{setActiveBrand(button.dataset.brandSelect)})
})

brandSwitchButtons.forEach(button=>{
  button.addEventListener('click',()=>{setActiveBrand(button.dataset.brandSwitch)})
})

window.addEventListener('hashchange',()=>{
  updateActivePanel(getRequestedPage(),{updateHash:false})
})

window.addEventListener('message',event=>{
  const payload=event.data
  if(!payload||payload.type!=='true-travel-admin-status')return
  setStatus(payload.message,Boolean(payload.isError))
})

updateBrandChrome()
renderCatalogGrid()
updateActivePanel(getRequestedPage(),{updateHash:false})

if(shouldPromptForBrand){
  setPickerVisibility(true)
  setStatus('Choose which brand you want to edit. Tour creation, pricing, and brand visibility now live in SkyBook Admin.')
}else{
  setPickerVisibility(false)
  setStatus(`${getActiveBrand().label} design workspace loaded. Syncing the shared SkyBook catalog...`)
  void loadCatalog()
}
