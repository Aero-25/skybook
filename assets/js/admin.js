const {
  STORAGE_KEYS:{
    TOURS_DATA_STORAGE_KEY,
    TOURS_DATA_SIGNAL_KEY
  },
  escapeHtml,
  formatTourPrice,
  getTourSeasonForDate,
  loadRemoteToursData,
  normalizeToursData,
  readSupabaseConfig,
  readToursData,
  writeToursData
}=window.TrueTravelShared

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

const pageUrl=new URL(window.location.href)
const requestedBrandCode=pageUrl.searchParams.get('brand')?.trim().toLowerCase()||''
const storedBrandCode=(window.localStorage.getItem(DESIGNER_BRAND_STORAGE_KEY)||'').trim().toLowerCase()

const isValidBrandCode=brandCode=>Boolean(brandCode)&&Object.prototype.hasOwnProperty.call(DESIGNER_BRANDS,brandCode)
const getBrandConfig=brandCode=>DESIGNER_BRANDS[brandCode]||DESIGNER_BRANDS['true-travel']
let activeBrandCode=isValidBrandCode(requestedBrandCode)
  ? requestedBrandCode
  : (isValidBrandCode(storedBrandCode) ? storedBrandCode : 'true-travel')

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
const openToursPageLink=document.getElementById('openToursPage')
const activeBrandNameNode=document.getElementById('activeBrandName')
const activeBrandVibeNode=document.getElementById('activeBrandVibe')
const workspaceBrandKickerNode=document.getElementById('workspaceBrandKicker')
const workspaceTitleNode=document.getElementById('workspaceTitle')
const workspaceDescriptionNode=document.getElementById('workspaceDescription')
const libraryBrandKickerNode=document.getElementById('libraryBrandKicker')
const libraryTitleNode=document.getElementById('libraryTitle')
const libraryDescriptionNode=document.getElementById('libraryDescription')

let toursData=normalizeToursData(readToursData())

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

const buildTourEditorUrl=({tourId='',isNew=false}={})=>{
  const nextUrl=new URL('tour-editor.html',window.location.href)
  nextUrl.searchParams.set('brand',activeBrandCode)
  if(isNew)nextUrl.searchParams.set('new','1')
  else if(tourId)nextUrl.searchParams.set('tour',tourId)
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

const updateBrandChrome=()=>{
  const brand=getActiveBrand()
  const brandToursLabel=brand.toursLabel||'Tours'

  document.title=`SkyBook Design Studio · ${brand.label}`

  if(activeBrandNameNode)activeBrandNameNode.textContent=brand.label
  if(activeBrandVibeNode)activeBrandVibeNode.textContent=brand.vibe
  if(workspaceBrandKickerNode)workspaceBrandKickerNode.textContent=`${brand.label} Workspace`
  if(workspaceTitleNode)workspaceTitleNode.textContent=`${brand.label} Homepage`
  if(workspaceDescriptionNode)workspaceDescriptionNode.textContent=`Preview and visually inspect the ${brand.label} homepage in admin mode. Use the brand switcher if you want to jump to the other public site.`
  if(libraryBrandKickerNode)libraryBrandKickerNode.textContent=`${brand.label} Library`
  if(libraryTitleNode)libraryTitleNode.textContent=`${brand.label} ${brandToursLabel}`
  if(libraryDescriptionNode)libraryDescriptionNode.textContent=`Browse the shared tour library, then open a dedicated editor page while keeping the ${brand.label} preview context active.`

  if(openSiteEditorLink){
    openSiteEditorLink.href=buildSiteUrl(brand,brand.homePath,'?admin=1')
    openSiteEditorLink.textContent=`Open ${brand.label} Editor`
  }
  if(viewSiteLink){
    viewSiteLink.href=buildSiteUrl(brand,brand.homePath)
    viewSiteLink.textContent=`View ${brand.label} Site`
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

const getListLabel=(items,fallback)=>items.length ? items.join(' / ') : fallback
const getTourTypeLabel=tour=>tour.tourType==='combo' ? 'Combo Tour' : 'Tour'

const getTourSummary=tour=>{
  if(tour.summary?.trim())return tour.summary.trim()
  return 'Open this tour to manage timing, pricing seasons, imagery, and homepage visibility.'
}

const buildTourCardMarkup=(tour,index)=>{
  const activeSeason=getTourSeasonForDate(tour)
  const childSummary=activeSeason.childPrice!==''&&Number(activeSeason.childPrice)>0 ? ` + Child ${formatTourPrice(activeSeason.childPrice)}` : ''
  return `
    <a class="tour-grid-card" href="${escapeHtml(buildTourEditorUrl({tourId:tour.id}))}">
      <div class="tour-grid-card-top">
        <div>
          <div class="tour-grid-kicker">${escapeHtml(getTourTypeLabel(tour))} · Tour ${(index+1).toString().padStart(2,'0')}</div>
          <h3>${escapeHtml(tour.name)}</h3>
        </div>
        <div class="tour-grid-badges">
          <div class="tour-grid-badge is-type${tour.tourType==='combo' ? ' is-combo' : ''}">${escapeHtml(getTourTypeLabel(tour))}</div>
          <div class="tour-grid-badge${tour.featuredOnIndex ? ' is-featured' : ''}">${tour.featuredOnIndex ? 'Featured on Home' : 'Booking Only'}</div>
        </div>
      </div>
      <p class="tour-grid-copy">${escapeHtml(getTourSummary(tour))}</p>
      <div class="tour-grid-stats">
        <div class="tour-grid-stat">
          <span>Current Price</span>
          <strong>${formatTourPrice(activeSeason.adultPrice)}${childSummary}</strong>
        </div>
        <div class="tour-grid-stat">
          <span>Season Count</span>
          <strong>${tour.seasons.length}</strong>
        </div>
        <div class="tour-grid-stat">
          <span>Time Slots</span>
          <strong>${escapeHtml(getListLabel(tour.timeSlots,'Custom'))}</strong>
        </div>
        <div class="tour-grid-stat">
          <span>Departures</span>
          <strong>${escapeHtml(getListLabel(tour.departureTimes,'By request'))}</strong>
        </div>
      </div>
      <div class="tour-grid-card-footer">
        <span>Open Tour Editor</span>
        <strong>→</strong>
      </div>
    </a>
  `
}

const buildTourGroupMarkup=({title,description,tours,startIndex=0,emptyLabel})=>{
  const cards=tours.length
    ? tours.map((tour,index)=>buildTourCardMarkup(tour,startIndex+index)).join('')
    : `<article class="tour-grid-empty">${escapeHtml(emptyLabel)}</article>`

  return `
    <section class="tour-grid-group">
      <div class="tour-grid-group-head">
        <div>
          <h2>${escapeHtml(title)}</h2>
          <p class="tour-grid-group-copy">${escapeHtml(description)}</p>
        </div>
        <div class="tour-grid-group-count">${tours.length}</div>
      </div>
      <div class="tours-grid">${cards}</div>
    </section>
  `
}

const renderToursGrid=()=>{
  toursData=normalizeToursData(toursData)
  if(!tourGrid)return

  const addCard=`
    <a class="tour-grid-card tour-grid-card-add" href="${escapeHtml(buildTourEditorUrl({isNew:true}))}">
      <div class="tour-grid-add-mark">+</div>
      <h3>Add New Tour</h3>
      <p class="tour-grid-copy">Create a fresh tour, then choose whether it belongs under Tours or Combo Tours inside the editor.</p>
      <div class="tour-grid-card-footer">
        <span>Open New Tour Page</span>
        <strong>→</strong>
      </div>
    </a>
  `

  const standardTours=toursData.tours.filter(tour=>tour.tourType!=='combo')
  const comboTours=toursData.tours.filter(tour=>tour.tourType==='combo')

  tourGrid.innerHTML=`
    ${addCard}
    ${buildTourGroupMarkup({
      title:'Tours',
      description:'Your standard standalone tours appear here.',
      tours:standardTours,
      startIndex:0,
      emptyLabel:'No standard tours yet.'
    })}
    ${buildTourGroupMarkup({
      title:'Combo Tours',
      description:'These are tours made up of two or more experiences combined together.',
      tours:comboTours,
      startIndex:standardTours.length,
      emptyLabel:'No combo tours yet.'
    })}
  `
}

const setActiveBrand=brandCode=>{
  if(!isValidBrandCode(brandCode))return
  activeBrandCode=brandCode
  window.localStorage.setItem(DESIGNER_BRAND_STORAGE_KEY,brandCode)
  syncBrandUrl()
  updateBrandChrome()
  renderToursGrid()
  updateActivePanel(getRequestedPage(),{updateHash:false})
  setPickerVisibility(false)
  setStatus(`${getActiveBrand().label} design workspace loaded.`)
}

reloadToursButton?.addEventListener('click',async()=>{
  try{
    const remoteTours=await loadRemoteToursData(readSupabaseConfig())
    if(!remoteTours){
      setStatus('No live tours dataset was found on Supabase yet. The grid is showing the current local tours.',true)
      return
    }
    toursData=remoteTours
    writeToursData(toursData)
    renderToursGrid()
    setStatus(`Live tours were loaded from Supabase for the ${getActiveBrand().label} workspace.`)
    reloadPreview()
  }catch(error){
    setStatus(error?.message||'The live tours could not be loaded.',true)
  }
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

window.addEventListener('storage',event=>{
  if(event.key===TOURS_DATA_STORAGE_KEY||event.key===TOURS_DATA_SIGNAL_KEY){
    toursData=normalizeToursData(readToursData())
    renderToursGrid()
  }
})

window.addEventListener('message',event=>{
  const payload=event.data
  if(!payload||payload.type!=='true-travel-admin-status')return
  setStatus(payload.message,Boolean(payload.isError))
})

;(async()=>{
  try{
    const remoteTours=await loadRemoteToursData(readSupabaseConfig())
    if(remoteTours){
      toursData=remoteTours
      writeToursData(toursData)
    }
  }catch{}

  updateBrandChrome()
  renderToursGrid()
  updateActivePanel(getRequestedPage(),{updateHash:false})

  if(shouldPromptForBrand){
    setPickerVisibility(true)
    setStatus('Choose which brand you want to edit before opening the design workspace.')
  }else{
    setPickerVisibility(false)
    setStatus(`${getActiveBrand().label} design workspace loaded.`)
  }
})()
