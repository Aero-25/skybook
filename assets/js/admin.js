const shared=window.TrueTravelShared||{}
const bookingCatalog=window.TrueTravelBooking||null
const escapeHtml=shared.escapeHtml
  ? value=>shared.escapeHtml(value)
  : value=>String(value??'')
    .replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]))

const DESIGNER_CONFIG=window.SkyBookConfig||{}
const DESIGNER_BRAND_STORAGE_KEY=DESIGNER_CONFIG.brandStorageKey||'skybook_designer_brand'
const GALLERY_TABLE='brand_gallery_assets'
const GALLERY_PATH_PREFIX='gallery'
const GALLERY_BUCKET='True Travel'

const DESIGNER_BRANDS=DESIGNER_CONFIG.brands||{
  'true-travel':{
    label:'True Travel',
    vibe:'Ocean-led public site',
    siteBase:'https://true-travel-site.pages.dev',
    homePath:'index.html',
    toursPath:'tours.html',
    toursLabel:'Tours',
    galleryPath:'gallery.html',
    galleryBucket:GALLERY_BUCKET,
    galleryPathPrefix:'gallery/true-travel',
    pages:[
      {key:'index',label:'Homepage',path:'index.html',description:'Landing hero, coastal storytelling, and the main booking handoff.'},
      {key:'tours',label:'Tours',path:'tours.html',description:'Tour discovery, normal vs combo distinction, and guided booking handoff.'},
      {key:'gallery',label:'Gallery',path:'gallery.html',description:'Public image collection powered by the True Travel gallery library.'},
      {key:'contact',label:'Contact',path:'contact.html',description:'Lean contact details and map experience.'},
      {key:'booking',label:'Booking Form',path:'booking.html',description:'True Travel reservation form and payment handoff.'},
      {key:'services',label:'Services Feed',path:'services.html',description:'Service list powered by the shared SkyBook catalog.'},
      {key:'service-detail',label:'Service Detail',path:'service.html?service=pelican-point-kayaking',description:'Single service storytelling and booking entry.'},
      {key:'lookup',label:'Booking Lookup',path:'booking-lookup.html',description:'Guest lookup experience for existing reservations.'},
      {key:'success',label:'Booking Success',path:'booking-success.html',description:'Post-booking confirmation state for guests.'}
    ]
  },
  iventure:{
    label:'Iventure',
    vibe:'Sand-and-dune public site',
    siteBase:'https://iventuretours.net',
    homePath:'index.html',
    toursPath:'services.html',
    toursLabel:'Services',
    galleryPath:'index.html',
    galleryBucket:GALLERY_BUCKET,
    galleryPathPrefix:'gallery/iventure',
    pages:[
      {key:'index',label:'Homepage',path:'index.html',description:'Desert-coast landing page and brand entry.'},
      {key:'services',label:'Services',path:'services.html',description:'Iventure expedition catalog and booking links.'},
      {key:'service-detail',label:'Service Detail',path:'service.html?service=sandwich-harbour-dune-drive',description:'Single route detail and booking handoff.'},
      {key:'booking',label:'Booking Form',path:'booking.html',description:'Shared booking capture for the Iventure guest journey.'},
      {key:'lookup',label:'Booking Lookup',path:'booking-lookup.html',description:'Guest booking lookup flow.'},
      {key:'success',label:'Booking Success',path:'booking-success.html',description:'Guest confirmation screen after booking creation.'}
    ]
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
const getBrandPages=brand=>Array.isArray(brand?.pages)&&brand.pages.length ? brand.pages : [{key:'index',label:'Homepage',path:brand?.homePath||'index.html',description:'Public homepage workspace.'}]
const isStudioPanel=value=>['pages','catalog','gallery'].includes(String(value||'').trim())

const toSlug=value=>String(value||'').trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')
const safeText=value=>String(value??'').trim()
const getActiveBrand=()=>getBrandConfig(activeBrandCode)
const getDefaultPageKey=brand=>getBrandPages(brand)[0]?.key||'index'
const getPageConfig=(brand,pageKey)=>getBrandPages(brand).find(page=>page.key===pageKey)||getBrandPages(brand)[0]

const parseStudioHash=()=>{
  const raw=window.location.hash.replace(/^#/,'').trim()
  if(!raw)return {panel:'pages',pageKey:''}
  const [panelCandidate,pageCandidate='']=raw.split('/')
  const panel=isStudioPanel(panelCandidate) ? panelCandidate : 'pages'
  return {
    panel,
    pageKey:panel==='pages' ? safeText(pageCandidate) : ''
  }
}

const requestedRoute=parseStudioHash()

let activeBrandCode=isValidBrandCode(requestedBrandCode)
  ? requestedBrandCode
  : (isValidBrandCode(storedBrandCode) ? storedBrandCode : 'true-travel')

let activePanel=requestedRoute.panel
let activePageKey=requestedRoute.pageKey
let catalogServices=[]
let catalogLoaded=false
let galleryLibraryItems=[]
let galleryLoadedBrandCode=''
let isGalleryUploading=false

const shouldPromptForBrand=!isValidBrandCode(requestedBrandCode)

const frame=document.getElementById('previewFrame')
const statusNode=document.getElementById('adminStatus')
const tourGrid=document.getElementById('tourGrid')
const pageWorkspaceGrid=document.getElementById('pageWorkspaceGrid')
const reloadToursButton=document.getElementById('reloadToursFromRemote')
const sitePicker=document.getElementById('sitePicker')
const brandSelectButtons=[...document.querySelectorAll('[data-brand-select]')]
const brandSwitchButtons=[...document.querySelectorAll('[data-brand-switch]')]
const panelButtons=[...document.querySelectorAll('[data-page]')]
const openSiteEditorLink=document.getElementById('openSiteEditor')
const viewSiteLink=document.getElementById('viewSiteLink')
const openCatalogAdminLink=document.getElementById('openCatalogAdminLink')
const openToursPageLink=document.getElementById('openToursPage')
const activeBrandNameNode=document.getElementById('activeBrandName')
const activeBrandVibeNode=document.getElementById('activeBrandVibe')
const mobileBrandSummaryNode=document.getElementById('mobileBrandSummary')
const workspaceBrandKickerNode=document.getElementById('workspaceBrandKicker')
const workspaceTitleNode=document.getElementById('workspaceTitle')
const workspaceDescriptionNode=document.getElementById('workspaceDescription')
const libraryBrandKickerNode=document.getElementById('libraryBrandKicker')
const libraryTitleNode=document.getElementById('libraryTitle')
const libraryDescriptionNode=document.getElementById('libraryDescription')
const galleryBrandKickerNode=document.getElementById('galleryBrandKicker')
const galleryTitleNode=document.getElementById('galleryTitle')
const galleryDescriptionNode=document.getElementById('galleryDescription')
const galleryStatusNode=document.getElementById('galleryStatus')
const galleryLibraryTitleNode=document.getElementById('galleryLibraryTitle')
const galleryLibraryDescriptionNode=document.getElementById('galleryLibraryDescription')
const galleryLibraryCountNode=document.getElementById('galleryLibraryCount')
const galleryLibraryGrid=document.getElementById('galleryLibraryGrid')
const galleryUploadForm=document.getElementById('galleryUploadForm')
const galleryImageTitleInput=document.getElementById('galleryImageTitle')
const galleryImageCategoryInput=document.getElementById('galleryImageCategory')
const galleryImageCaptionInput=document.getElementById('galleryImageCaption')
const galleryImageSortOrderInput=document.getElementById('galleryImageSortOrder')
const galleryImagePublishedInput=document.getElementById('galleryImagePublished')
const galleryImageFileInput=document.getElementById('galleryImageFile')
const galleryUploadSubmit=document.getElementById('galleryUploadSubmit')
const reloadGalleryCollectionButton=document.getElementById('reloadGalleryCollection')
const openGalleryPageLink=document.getElementById('openGalleryPage')
const studioSidebarToggle=document.getElementById('mobileStudioToggle')
const studioSidebarBackdrop=document.getElementById('studioSidebarBackdrop')

const isStudioMobileViewport=()=>window.innerWidth<=980

const closeStudioSidebar=()=>{
  document.body.classList.remove('is-studio-sidebar-open')
  studioSidebarToggle?.setAttribute('aria-expanded','false')
}

const openStudioSidebar=()=>{
  if(!isStudioMobileViewport())return
  document.body.classList.add('is-studio-sidebar-open')
  studioSidebarToggle?.setAttribute('aria-expanded','true')
}

const toggleStudioSidebar=()=>{
  if(document.body.classList.contains('is-studio-sidebar-open'))closeStudioSidebar()
  else openStudioSidebar()
}

const setStatus=(message,isError=false)=>{
  if(!statusNode){
    if(isError)console.error(message)
    else console.info(message)
    return
  }
  statusNode.textContent=message
  statusNode.classList.toggle('is-error',isError)
}

const setGalleryStatus=(message,isError=false)=>{
  if(!galleryStatusNode){
    if(isError)console.error(message)
    else console.info(message)
    return
  }
  galleryStatusNode.textContent=message
  galleryStatusNode.classList.toggle('is-error',isError)
}

const appendSearchParams=(path,extraSearch='')=>{
  const safePath=safeText(path)||'index.html'
  const [pathname,existingSearch='']=safePath.split('?')
  const params=new URLSearchParams(existingSearch)
  const extra=safeText(extraSearch).replace(/^[?#&]+/,'')
  if(extra){
    new URLSearchParams(extra).forEach((value,key)=>{params.set(key,value)})
  }
  const nextSearch=params.toString()
  return `${pathname}${nextSearch ? `?${nextSearch}` : ''}`
}

const buildSiteUrl=(brand,path,extraSearch='')=>{
  const base=String(brand.siteBase||'').replace(/\/+$/,'')
  const resolvedPath=appendSearchParams(path||brand.homePath||'index.html',extraSearch)
  return `${base}/${resolvedPath}`
}

const buildWorkspaceUrl=(brand,pageKey=activePageKey)=>{
  const selectedPage=getPageConfig(brand,pageKey||getDefaultPageKey(brand))
  return buildSiteUrl(brand,selectedPage?.path||brand.homePath||'index.html','?admin=1')
}

const buildStudioHash=(panel=activePanel,pageKey=activePageKey)=>{
  if(panel==='pages'){
    const brand=getActiveBrand()
    const selectedPage=getPageConfig(brand,pageKey||getDefaultPageKey(brand))
    return selectedPage?.key ? `#pages/${selectedPage.key}` : '#pages'
  }
  return `#${panel}`
}

const buildDesignStudioUrl=(panel=activePanel,pageKey=activePageKey)=>{
  return `design-admin.html?brand=${encodeURIComponent(activeBrandCode)}${buildStudioHash(panel,pageKey)}`
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
  if(isVisible)closeStudioSidebar()
}

const syncBrandUrl=()=>{
  const currentUrl=new URL(window.location.href)
  currentUrl.searchParams.set('brand',activeBrandCode)
  currentUrl.hash=buildStudioHash()
  history.replaceState(null,'',`${currentUrl.pathname}${currentUrl.search}${currentUrl.hash}`)
}

const getServiceBrandCodes=service=>{
  const normalized=Array.isArray(service?.brand_codes)
    ? service.brand_codes.map(value=>String(value||'').trim().toLowerCase()).filter(Boolean)
    : []
  return normalized.length ? normalized : Object.keys(DESIGNER_BRANDS)
}

const formatMoney=(value,currency='NAD')=>{
  if(bookingCatalog?.formatMoney)return bookingCatalog.formatMoney(value,currency)
  const amount=Number(value||0)
  const normalizedCurrency=String(currency||'NAD').trim().toUpperCase()
  if(normalizedCurrency==='NAD' || normalizedCurrency==='N$'){
    const formattedAmount=new Intl.NumberFormat('en-NA',{
      minimumFractionDigits:2,
      maximumFractionDigits:2
    }).format(Math.abs(amount))
    return `${amount<0 ? '-' : ''}N$${formattedAmount}`
  }
  return new Intl.NumberFormat('en-NA',{style:'currency',currency:normalizedCurrency,maximumFractionDigits:2}).format(amount)
}

const formatDateTime=value=>{
  if(!value)return 'Unscheduled'
  const date=new Date(value)
  if(Number.isNaN(date.getTime()))return 'Unscheduled'
  return new Intl.DateTimeFormat('en-NA',{
    day:'2-digit',
    month:'short',
    year:'numeric'
  }).format(date)
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

const renderPageWorkspaceGrid=()=>{
  if(!pageWorkspaceGrid)return
  const brand=getActiveBrand()
  const pages=getBrandPages(brand)
  pageWorkspaceGrid.innerHTML=pages.map((page,index)=>`
    <button
      type="button"
      class="workspace-page-card${page.key===activePageKey ? ' is-active' : ''}"
      data-workspace-page-key="${escapeHtml(page.key)}"
      aria-pressed="${page.key===activePageKey ? 'true' : 'false'}"
    >
      <span>Page ${(index+1).toString().padStart(2,'0')}</span>
      <strong>${escapeHtml(page.label)}</strong>
      <p>${escapeHtml(page.description||`Preview the ${page.label} workspace.`)}</p>
    </button>
  `).join('')
}

const renderGalleryLibrary=()=>{
  if(!galleryLibraryGrid)return
  const brand=getActiveBrand()
  if(!galleryLibraryItems.length){
    galleryLibraryGrid.innerHTML=`
      <article class="tour-grid-empty">
        No gallery images have been published for ${escapeHtml(brand.label)} yet.
        Upload the first hero-quality image and it will flow straight into the public gallery collection.
      </article>
    `
    if(galleryLibraryCountNode)galleryLibraryCountNode.textContent='0'
    return
  }

  galleryLibraryGrid.innerHTML=galleryLibraryItems.map(item=>`
    <article class="gallery-media-card">
      <img src="${escapeHtml(item.image_url)}" alt="${escapeHtml(item.title)}" loading="lazy" decoding="async">
      <div class="gallery-media-meta">
        <span class="gallery-media-pill${item.is_published ? ' is-published' : ''}">${escapeHtml(item.is_published ? 'Published' : 'Draft')}</span>
        <span class="gallery-media-pill">${escapeHtml(item.category||'Collection')}</span>
      </div>
      <strong>${escapeHtml(item.title)}</strong>
      <p>${escapeHtml(item.caption||'No caption added yet.')}</p>
      <p>Sort order ${escapeHtml(item.sort_order)}. Saved ${escapeHtml(formatDateTime(item.created_at))}.</p>
      <a href="${escapeHtml(item.image_url)}" target="_blank" rel="noopener">Open image</a>
    </article>
  `).join('')

  if(galleryLibraryCountNode)galleryLibraryCountNode.textContent=String(galleryLibraryItems.length)
}

const updateGalleryUploadState=()=>{
  if(galleryUploadSubmit){
    galleryUploadSubmit.disabled=isGalleryUploading
    galleryUploadSubmit.textContent=isGalleryUploading ? 'Uploading...' : 'Upload To Gallery'
  }
}

const getGalleryBucket=brand=>safeText(brand.galleryBucket)||GALLERY_BUCKET
const getGalleryPathPrefix=brand=>safeText(brand.galleryPathPrefix)||`${GALLERY_PATH_PREFIX}/${activeBrandCode}`
const getGalleryPagePath=brand=>safeText(brand.galleryPath)||getPageConfig(brand,'gallery')?.path||brand.homePath||'index.html'

const getGalleryLibraryDescription=brand=>{
  if(activeBrandCode==='true-travel'){
    return 'These images feed the True Travel gallery page once they are published.'
  }
  return 'These images are stored in the shared brand library for future Iventure gallery use.'
}

const updatePageWorkspaceChrome=()=>{
  const brand=getActiveBrand()
  const page=getPageConfig(brand,activePageKey)

  if(workspaceBrandKickerNode)workspaceBrandKickerNode.textContent=`${brand.label} Pages`
  if(workspaceTitleNode)workspaceTitleNode.textContent=`${brand.label} ${page.label}`
  if(workspaceDescriptionNode)workspaceDescriptionNode.textContent=page.description||`Open the live ${brand.label} ${page.label.toLowerCase()} workspace and place imagery directly on that page.`
  if(openSiteEditorLink){
    openSiteEditorLink.href=buildWorkspaceUrl(brand,page.key)
    openSiteEditorLink.textContent=`Open ${page.label} Live Editor`
  }
  if(viewSiteLink){
    viewSiteLink.href=buildSiteUrl(brand,page.path)
    viewSiteLink.textContent=`View ${page.label}`
  }
}

const updateBrandChrome=()=>{
  const brand=getActiveBrand()

  if(!getBrandPages(brand).some(page=>page.key===activePageKey)){
    activePageKey=getDefaultPageKey(brand)
  }

  document.title=`SkyBook Design Studio - ${brand.label}`

  if(activeBrandNameNode)activeBrandNameNode.textContent=brand.label
  if(activeBrandVibeNode)activeBrandVibeNode.textContent=brand.vibe
  if(mobileBrandSummaryNode)mobileBrandSummaryNode.textContent=`${brand.label} pages only`
  if(libraryBrandKickerNode)libraryBrandKickerNode.textContent=`${brand.label} Catalog`
  if(libraryTitleNode)libraryTitleNode.textContent=`${brand.label} Catalog Preview`
  if(libraryDescriptionNode)libraryDescriptionNode.textContent=`Tours are loaded in the shared SkyBook admin. This panel shows which tours the ${brand.label} site can display and hands you back to the central catalog when something needs to be added or changed.`
  if(galleryBrandKickerNode)galleryBrandKickerNode.textContent=`${brand.label} Gallery Upload`
  if(galleryTitleNode)galleryTitleNode.textContent=`Publish images for ${brand.label}`
  if(galleryDescriptionNode)galleryDescriptionNode.textContent=`Upload ${brand.label} visuals into Supabase once, save them in the gallery database, and let the public collection page read the same published image library.`
  if(galleryLibraryTitleNode)galleryLibraryTitleNode.textContent=`${brand.label} gallery library`
  if(galleryLibraryDescriptionNode)galleryLibraryDescriptionNode.textContent=getGalleryLibraryDescription(brand)

  if(openGalleryPageLink){
    openGalleryPageLink.href=buildSiteUrl(brand,getGalleryPagePath(brand))
    openGalleryPageLink.textContent=activeBrandCode==='true-travel' ? 'Open Gallery Page' : 'Open Brand Site'
  }
  if(openCatalogAdminLink){
    openCatalogAdminLink.href='booking-admin.html?tab=services'
  }
  if(openToursPageLink){
    openToursPageLink.href=buildSiteUrl(brand,brand.toursPath||brand.homePath||'index.html')
    openToursPageLink.textContent=`Open ${brand.toursLabel||'Catalog'} Page`
  }

  brandSelectButtons.forEach(button=>button.classList.toggle('is-active',button.dataset.brandSelect===activeBrandCode))
  brandSwitchButtons.forEach(button=>button.classList.toggle('is-current',button.dataset.brandSwitch===activeBrandCode))

  updatePageWorkspaceChrome()
  renderPageWorkspaceGrid()
  renderGalleryLibrary()
}

const reloadPreview=()=>{
  if(!frame)return
  const brand=getActiveBrand()
  const page=getPageConfig(brand,activePageKey)
  frame.src=`${buildWorkspaceUrl(brand,page.key)}&v=${Date.now()}`
  frame.title=`${brand.label} ${page.label} workspace preview`
}

const updateActivePanel=(panel,{updateHash=true,refreshPreview=true}={})=>{
  const nextPanel=isStudioPanel(panel) ? panel : 'pages'
  activePanel=nextPanel

  panelButtons.forEach(node=>node.classList.toggle('is-active',node.dataset.page===nextPanel))
  document.querySelectorAll('[data-panel-view]').forEach(node=>node.classList.toggle('is-active',node.dataset.panelView===nextPanel))
  closeStudioSidebar()

  if(updateHash){
    syncBrandUrl()
  }

  if(nextPanel==='pages'&&refreshPreview){
    reloadPreview()
    setStatus(`${getActiveBrand().label} ${getPageConfig(getActiveBrand(),activePageKey).label} workspace loaded.`)
  }
  if(nextPanel==='catalog'){
    if(!catalogLoaded){
      setStatus(`Loading the ${getActiveBrand().label} catalog preview from SkyBook...`)
      void loadCatalog()
    }else{
      setStatus(`${getActiveBrand().label} catalog preview loaded.`)
    }
  }
  if(nextPanel==='gallery'&&galleryLoadedBrandCode!==activeBrandCode){
    setGalleryStatus(`Loading the ${getActiveBrand().label} gallery library from Supabase...`)
    void loadGalleryLibrary({announce:false})
  }
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

const requireGalleryClient=async()=>{
  if(!bookingCatalog?.createSupabaseClient){
    throw new Error('Supabase browser client is unavailable in this designer build.')
  }
  const client=await bookingCatalog.createSupabaseClient()
  const sessionResult=await client.auth.getSession()
  const session=sessionResult?.data?.session||null
  if(!session?.user?.id){
    throw new Error('Sign in through SkyBook first so gallery uploads can be saved with your admin session.')
  }
  return {client,session}
}

const loadGalleryLibrary=async({announce=false}={})=>{
  try{
    const {client}=await requireGalleryClient()
    const result=await client
      .from(GALLERY_TABLE)
      .select('id, brand_code, title, caption, category, image_url, sort_order, is_published, created_at, storage_bucket, storage_path')
      .eq('brand_code',activeBrandCode)
      .order('sort_order',{ascending:true})
      .order('created_at',{ascending:false})

    if(result.error)throw result.error

    galleryLibraryItems=Array.isArray(result.data) ? result.data : []
    galleryLoadedBrandCode=activeBrandCode
    renderGalleryLibrary()

    if(galleryLibraryItems.length){
      setGalleryStatus(`${galleryLibraryItems.length} gallery images are available for ${getActiveBrand().label}.`)
    }else{
      setGalleryStatus(`No gallery images have been uploaded for ${getActiveBrand().label} yet.`)
    }
    if(announce){
      setStatus(`${getActiveBrand().label} gallery library reloaded from Supabase.`)
    }
  }catch(error){
    galleryLibraryItems=[]
    galleryLoadedBrandCode=''
    renderGalleryLibrary()
    setGalleryStatus(error?.message||'The gallery library could not be loaded.',true)
  }
}

const getFileExtension=file=>{
  const explicit=safeText(file?.name).split('.').pop()
  if(explicit&&explicit!==safeText(file?.name))return explicit.toLowerCase()
  if(String(file?.type||'').toLowerCase().includes('png'))return 'png'
  if(String(file?.type||'').toLowerCase().includes('webp'))return 'webp'
  if(String(file?.type||'').toLowerCase().includes('avif'))return 'avif'
  if(String(file?.type||'').toLowerCase().includes('gif'))return 'gif'
  return 'jpg'
}

const buildGalleryStoragePath=file=>{
  const brand=getActiveBrand()
  const prefix=getGalleryPathPrefix(brand).replace(/^\/+|\/+$/g,'')
  const extension=getFileExtension(file)
  const fileStem=toSlug(safeText(file?.name).replace(/\.[^.]+$/,''))||'gallery-image'
  return `${prefix}/${Date.now()}-${fileStem}.${extension}`
}

const submitGalleryUpload=async event=>{
  event.preventDefault()
  if(isGalleryUploading)return

  const file=galleryImageFileInput?.files?.[0]||null
  const title=safeText(galleryImageTitleInput?.value)
  const category=safeText(galleryImageCategoryInput?.value)||'Collection'
  const caption=safeText(galleryImageCaptionInput?.value)
  const sortOrder=Math.max(0,Number(galleryImageSortOrderInput?.value||0)||0)
  const isPublished=galleryImagePublishedInput?.checked!==false

  if(!file){
    setGalleryStatus('Choose an image file before uploading to the gallery.',true)
    return
  }
  if(!title){
    setGalleryStatus('Add a clear image title before uploading to the gallery.',true)
    return
  }

  isGalleryUploading=true
  updateGalleryUploadState()
  setGalleryStatus(`Uploading ${title} into the ${getActiveBrand().label} gallery...`)

  try{
    const {client,session}=await requireGalleryClient()
    const brand=getActiveBrand()
    const bucket=getGalleryBucket(brand)
    const storagePath=buildGalleryStoragePath(file)
    const uploadResult=await client.storage.from(bucket).upload(storagePath,file,{
      cacheControl:'3600',
      upsert:false,
      contentType:file.type||undefined
    })

    if(uploadResult.error)throw uploadResult.error

    const publicUrlResult=client.storage.from(bucket).getPublicUrl(storagePath)
    const imageUrl=publicUrlResult?.data?.publicUrl||''
    if(!imageUrl)throw new Error('The uploaded image URL could not be resolved.')

    const insertResult=await client
      .from(GALLERY_TABLE)
      .insert({
        brand_code:activeBrandCode,
        title,
        caption,
        category,
        image_url:imageUrl,
        storage_bucket:bucket,
        storage_path:storagePath,
        sort_order:sortOrder,
        is_published:isPublished,
        metadata:{
          fileName:file.name,
          fileSize:file.size,
          contentType:file.type||'application/octet-stream'
        },
        created_by:session.user.id
      })
      .select('id')
      .single()

    if(insertResult.error)throw insertResult.error

    galleryUploadForm?.reset()
    if(galleryImageSortOrderInput)galleryImageSortOrderInput.value='0'
    if(galleryImagePublishedInput)galleryImagePublishedInput.checked=true

    setGalleryStatus(`${title} is now stored in Supabase and ready for the public gallery.`)
    setStatus(`${getActiveBrand().label} gallery image uploaded successfully.`)
    galleryLoadedBrandCode=''
    await loadGalleryLibrary()
  }catch(error){
    setGalleryStatus(error?.message||'The gallery upload failed.',true)
  }finally{
    isGalleryUploading=false
    updateGalleryUploadState()
  }
}

const setActivePage=pageKey=>{
  const brand=getActiveBrand()
  if(!getBrandPages(brand).some(page=>page.key===pageKey))return
  activePageKey=pageKey
  updateBrandChrome()
  if(activePanel==='pages'){
    updateActivePanel('pages')
  }else{
    syncBrandUrl()
  }
}

const setActiveBrand=brandCode=>{
  if(!isValidBrandCode(brandCode))return
  activeBrandCode=brandCode
  window.localStorage.setItem(DESIGNER_BRAND_STORAGE_KEY,brandCode)
  closeStudioSidebar()

  const brand=getActiveBrand()
  if(!getBrandPages(brand).some(page=>page.key===activePageKey)){
    activePageKey=getDefaultPageKey(brand)
  }

  catalogServices=[]
  catalogLoaded=false
  galleryLibraryItems=[]
  galleryLoadedBrandCode=''

  updateBrandChrome()
  renderCatalogGrid()
  syncBrandUrl()
  setPickerVisibility(false)

  if(activePanel==='pages'){
    updateActivePanel('pages',{updateHash:false})
  }else if(activePanel==='catalog'){
    updateActivePanel('catalog',{updateHash:false})
  }else if(activePanel==='gallery'){
    setGalleryStatus(`Loading the ${brand.label} gallery library from Supabase...`)
    void loadGalleryLibrary()
  }
}

reloadToursButton?.addEventListener('click',()=>{
  setStatus(`Refreshing the live SkyBook catalog for ${getActiveBrand().label}...`)
  void loadCatalog({announce:true})
})

reloadGalleryCollectionButton?.addEventListener('click',()=>{
  setGalleryStatus(`Refreshing the ${getActiveBrand().label} gallery library...`)
  galleryLoadedBrandCode=''
  void loadGalleryLibrary({announce:true})
})

galleryUploadForm?.addEventListener('submit',submitGalleryUpload)

studioSidebarToggle?.addEventListener('click',toggleStudioSidebar)
studioSidebarBackdrop?.addEventListener('click',closeStudioSidebar)

panelButtons.forEach(button=>{
  button.addEventListener('click',()=>{updateActivePanel(button.dataset.page)})
})

pageWorkspaceGrid?.addEventListener('click',event=>{
  const card=event.target.closest('[data-workspace-page-key]')
  if(!card)return
  setActivePage(card.dataset.workspacePageKey)
})

brandSelectButtons.forEach(button=>{
  button.addEventListener('click',()=>{setActiveBrand(button.dataset.brandSelect)})
})

brandSwitchButtons.forEach(button=>{
  button.addEventListener('click',()=>{setActiveBrand(button.dataset.brandSwitch)})
})

window.addEventListener('hashchange',()=>{
  const route=parseStudioHash()
  if(route.pageKey&&route.panel==='pages'){
    const brand=getActiveBrand()
    if(getBrandPages(brand).some(page=>page.key===route.pageKey)){
      activePageKey=route.pageKey
      updateBrandChrome()
    }
  }
  updateActivePanel(route.panel,{updateHash:false})
})

window.addEventListener('message',event=>{
  const payload=event.data
  if(!payload||payload.type!=='true-travel-admin-status')return
  setStatus(payload.message,Boolean(payload.isError))
})

document.addEventListener('keydown',event=>{
  if(event.key==='Escape'&&document.body.classList.contains('is-studio-sidebar-open')){
    closeStudioSidebar()
  }
})

window.addEventListener('resize',()=>{
  if(!isStudioMobileViewport())closeStudioSidebar()
})

const initialBrand=getActiveBrand()
if(!getBrandPages(initialBrand).some(page=>page.key===activePageKey)){
  activePageKey=getDefaultPageKey(initialBrand)
}

updateGalleryUploadState()
updateBrandChrome()
renderCatalogGrid()
renderGalleryLibrary()
updateActivePanel(activePanel,{updateHash:false,refreshPreview:true})

if(shouldPromptForBrand){
  setPickerVisibility(true)
  setStatus('Choose which brand you want to edit, then move page by page through its live design workspace.')
}else{
  setPickerVisibility(false)
  if(activePanel==='gallery'){
    setStatus(`${getActiveBrand().label} design workspace loaded.`)
    setGalleryStatus(`Loading the ${getActiveBrand().label} gallery library from Supabase...`)
    void loadGalleryLibrary()
  }else if(activePanel==='catalog'){
    setStatus(`Loading the ${getActiveBrand().label} catalog preview from SkyBook...`)
  }else{
    setStatus(`${getActiveBrand().label} ${getPageConfig(getActiveBrand(),activePageKey).label} workspace loaded.`)
  }
}
