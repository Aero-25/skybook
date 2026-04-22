const {
  clone,
  escapeHtml,
  formatTourPrice,
  getTourSeasonForDate,
  normalizeTour,
  normalizeTourSeason,
  normalizeToursData,
  parseListInput,
  persistRemoteToursData,
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
    siteBase:'../true-travel-site',
    homePath:'index.html',
    toursPath:'tours.html',
    toursLabel:'Tours'
  },
  'iventure':{
    label:'Iventure',
    vibe:'Sand-and-dune public site',
    siteBase:'../iventure-site',
    homePath:'index.html',
    toursPath:'services.html',
    toursLabel:'Services'
  }
}

const params=new URLSearchParams(window.location.search)
const requestedTourId=params.get('tour')?.trim()||''
const requestedBrandCode=params.get('brand')?.trim().toLowerCase()||''
const storedBrandCode=(window.localStorage.getItem(DESIGNER_BRAND_STORAGE_KEY)||'').trim().toLowerCase()

const isValidBrandCode=brandCode=>Boolean(brandCode)&&Object.prototype.hasOwnProperty.call(DESIGNER_BRANDS,brandCode)
const activeBrandCode=isValidBrandCode(requestedBrandCode)
  ? requestedBrandCode
  : (isValidBrandCode(storedBrandCode) ? storedBrandCode : 'true-travel')
const activeBrand=DESIGNER_BRANDS[activeBrandCode]||DESIGNER_BRANDS['true-travel']

window.localStorage.setItem(DESIGNER_BRAND_STORAGE_KEY,activeBrandCode)

const modeLabelNode=document.getElementById('editorModeLabel')
const titleNode=document.getElementById('editorTitle')
const introNode=document.getElementById('editorIntro')
const statusNode=document.getElementById('editorStatus')
const summaryCard=document.getElementById('editorSummaryCard')
const editorForm=document.getElementById('tourEditorForm')
const seasonStack=document.getElementById('seasonStack')
const addSeasonButton=document.getElementById('addSeasonButton')
const saveTourButton=document.getElementById('saveTourButton')
const saveAndReturnButton=document.getElementById('saveAndReturnButton')
const backToDesignStudioLink=document.getElementById('backToDesignStudioLink')
const backToGridLink=document.getElementById('backToGridLink')
const openToursPageLink=document.getElementById('openToursPageLink')

const fieldRefs={
  id:document.getElementById('tourId'),
  name:document.getElementById('tourName'),
  durationLabel:document.getElementById('tourDurationLabel'),
  tourType:document.getElementById('tourType'),
  imageUrl:document.getElementById('tourImageUrl'),
  departureTimes:document.getElementById('tourDepartureTimes'),
  timeSlots:document.getElementById('tourTimeSlots'),
  summary:document.getElementById('tourSummary'),
  featuredOnIndex:document.getElementById('tourFeaturedOnIndex')
}

let toursData=normalizeToursData(readToursData())
let isNewMode=params.get('new')==='1'||!requestedTourId
let originalTourId=requestedTourId
let idManuallyEdited=!isNewMode
let state=isNewMode ? createEmptyTour() : clone(toursData.tours.find(tour=>tour.id===requestedTourId))

function createEmptyTour(){
  return {
    id:'',
    name:'',
    tourType:'tour',
    summary:'',
    imageUrl:'',
    durationLabel:'',
    timeSlots:[],
    departureTimes:[],
    featuredOnIndex:false,
    seasons:[{label:'Season 1',startDate:'',endDate:'',adultPrice:'',childPrice:''}]
  }
}

const slugify=value=>String(value||'')
  .trim()
  .toLowerCase()
  .replace(/[^a-z0-9]+/g,'-')
  .replace(/^-|-$/g,'')

const buildSiteUrl=(path,search='')=>{
  const base=String(activeBrand.siteBase||'').replace(/\/+$/,'')
  return `${base}/${search ? `${path}${search}` : path}`
}

const buildDesignStudioUrl=hash=>`design-admin.html?brand=${encodeURIComponent(activeBrandCode)}${hash||''}`
const buildEditorUrl=searchParams=>{
  const nextUrl=new URL('tour-editor.html',window.location.href)
  nextUrl.searchParams.set('brand',activeBrandCode)
  Object.entries(searchParams||{}).forEach(([key,value])=>{
    nextUrl.searchParams.set(key,value)
  })
  return `${nextUrl.pathname}${nextUrl.search}`
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

const goBackToGrid=()=>{window.location.href=buildDesignStudioUrl('#pages')}

const applyBrandChrome=()=>{
  document.title=`SkyBook Tour Editor · ${activeBrand.label}`
  if(backToDesignStudioLink)backToDesignStudioLink.href=buildDesignStudioUrl('#pages')
  if(backToGridLink)backToGridLink.href=buildDesignStudioUrl('#pages')
  if(openToursPageLink){
    openToursPageLink.href=buildSiteUrl(activeBrand.toursPath)
    openToursPageLink.textContent=`Open ${activeBrand.toursLabel||'Tours'} Page`
  }
}

if(!state){
  setStatus('That tour could not be found. Returning to the tours grid...',true)
  window.setTimeout(goBackToGrid,900)
  throw new Error('Requested tour not found.')
}

const syncStateFromFields=()=>{
  state.id=fieldRefs.id.value.trim()
  state.name=fieldRefs.name.value.trim()
  state.durationLabel=fieldRefs.durationLabel.value.trim()
  state.tourType=fieldRefs.tourType.value
  state.imageUrl=fieldRefs.imageUrl.value.trim()
  state.departureTimes=parseListInput(fieldRefs.departureTimes.value)
  state.timeSlots=parseListInput(fieldRefs.timeSlots.value)
  state.summary=fieldRefs.summary.value.trim()
  state.featuredOnIndex=fieldRefs.featuredOnIndex.checked
}

const buildSeasonMarkup=(season,seasonIndex,totalSeasons)=>`
  <div class="season-card" data-season-index="${seasonIndex}">
    <div class="season-head">
      <div class="season-title">Season ${seasonIndex+1}</div>
      <button class="season-remove" type="button" data-remove-season ${totalSeasons===1 ? 'disabled' : ''}>Remove</button>
    </div>
    <div class="season-grid">
      <label class="season-field">
        <span>Season Label</span>
        <input type="text" data-season-field="label" value="${escapeHtml(season.label||'')}" placeholder="2027 Peak Season">
      </label>
      <label class="season-field">
        <span>Adult Price</span>
        <input type="number" min="0" step="0.01" data-season-field="adultPrice" value="${escapeHtml(season.adultPrice)}" placeholder="3850">
      </label>
      <label class="season-field">
        <span>Start Date</span>
        <input type="date" data-season-field="startDate" value="${escapeHtml(season.startDate||'')}">
      </label>
      <label class="season-field">
        <span>End Date</span>
        <input type="date" data-season-field="endDate" value="${escapeHtml(season.endDate||'')}">
      </label>
      <label class="season-field">
        <span>Child Price</span>
        <input type="number" min="0" step="0.01" data-season-field="childPrice" value="${escapeHtml(season.childPrice)}" placeholder="Optional">
      </label>
    </div>
  </div>
`

const renderHeader=()=>{
  modeLabelNode.textContent=`${activeBrand.label} · ${isNewMode ? 'New Tour' : 'Tour Editor'}`
  titleNode.textContent=isNewMode ? (state.name||`Create New Tour for ${activeBrand.label}`) : (state.name||'Edit Tour')
  introNode.textContent=isNewMode
    ? `Create one tour at a time, then save it back into the shared tours dataset used by ${activeBrand.label}.`
    : `Update this tour on its own page, then save changes back into the shared tours dataset while keeping the ${activeBrand.label} workspace active.`
}

const buildPreviewTour=()=>{
  const previewId=slugify(state.id||state.name)||`tour-${toursData.tours.length+1}`
  return normalizeTour({
    ...state,
    id:previewId,
    name:state.name||'Untitled Tour',
    durationLabel:state.durationLabel||'Custom Duration',
    seasons:state.seasons.length ? state.seasons : [{label:'Season 1',startDate:'',endDate:'',adultPrice:0,childPrice:''}]
  })
}

const renderSummaryCard=()=>{
  const previewTour=buildPreviewTour()
  const activeSeason=getTourSeasonForDate(previewTour)
  const childSummary=activeSeason.childPrice!==''&&Number(activeSeason.childPrice)>0 ? ` + Child ${formatTourPrice(activeSeason.childPrice)}` : ''
  summaryCard.innerHTML=`
    <span>${previewTour.tourType==='combo' ? 'Combo Tour' : 'Tour'} · ${previewTour.featuredOnIndex ? 'Featured on Home' : 'Booking Only'}</span>
    <strong>${formatTourPrice(activeSeason.adultPrice)}${childSummary}</strong>
    <p>${escapeHtml(previewTour.seasons.length)} season${previewTour.seasons.length===1 ? '' : 's'} · ${escapeHtml(previewTour.timeSlots.length ? previewTour.timeSlots.join(' / ') : 'Custom slots')}</p>
  `
}

const renderSeasons=()=>{
  seasonStack.innerHTML=state.seasons.map((season,seasonIndex)=>buildSeasonMarkup(season,seasonIndex,state.seasons.length)).join('')
}

const renderForm=()=>{
  fieldRefs.id.value=state.id||''
  fieldRefs.name.value=state.name||''
  fieldRefs.durationLabel.value=state.durationLabel||''
  fieldRefs.tourType.value=state.tourType||'tour'
  fieldRefs.imageUrl.value=state.imageUrl||''
  fieldRefs.departureTimes.value=state.departureTimes.join(', ')
  fieldRefs.timeSlots.value=state.timeSlots.join(', ')
  fieldRefs.summary.value=state.summary||''
  fieldRefs.featuredOnIndex.checked=Boolean(state.featuredOnIndex)
  renderHeader()
  renderSummaryCard()
  renderSeasons()
}

const getNormalizedTourFromForm=()=>{
  syncStateFromFields()

  const normalizedId=slugify(state.id)||slugify(state.name)
  if(!normalizedId){
    setStatus('Add a tour name or slug before saving.',true)
    fieldRefs.name.focus()
    return null
  }

  if(!state.name){
    setStatus('Add a tour name before saving.',true)
    fieldRefs.name.focus()
    return null
  }

  fieldRefs.id.value=normalizedId
  state.id=normalizedId

  const normalizedSeasons=(state.seasons.length ? state.seasons : [createEmptyTour().seasons[0]]).map((season,seasonIndex)=>normalizeTourSeason({
    id:season.id,
    label:season.label||`Season ${seasonIndex+1}`,
    startDate:season.startDate||'',
    endDate:season.endDate||'',
    adultPrice:season.adultPrice,
    childPrice:season.childPrice
  },seasonIndex))

  return normalizeTour({
    ...state,
    id:normalizedId,
    seasons:normalizedSeasons
  })
}

const persistToursRemotelyIfPossible=async nextToursData=>{
  const supabaseConfig=readSupabaseConfig()
  if(!supabaseConfig.anonKey)return `Tour saved locally for the ${activeBrand.label} workspace. Remote sync is not configured on this machine.`
  try{
    await persistRemoteToursData(supabaseConfig,nextToursData)
    return `Tour saved locally and synced to Supabase for ${activeBrand.label}.`
  }catch(error){
    return `Tour saved locally for ${activeBrand.label}. Remote sync failed: ${error?.message||'Unknown error.'}`
  }
}

const saveTour=async({shouldReturn=false}={})=>{
  const nextTour=getNormalizedTourFromForm()
  if(!nextTour)return

  const workingData=normalizeToursData(toursData)
  const currentIndex=workingData.tours.findIndex(tour=>tour.id===originalTourId)
  const conflictingIndex=workingData.tours.findIndex(tour=>tour.id===nextTour.id)

  if(conflictingIndex!==-1&&conflictingIndex!==currentIndex){
    setStatus('Another tour already uses that slug. Choose a different Tour ID / Slug.',true)
    fieldRefs.id.focus()
    return
  }

  if(currentIndex===-1)workingData.tours.push(nextTour)
  else workingData.tours[currentIndex]=nextTour

  toursData=workingData
  writeToursData(toursData)

  originalTourId=nextTour.id
  isNewMode=false
  idManuallyEdited=true
  state=clone(nextTour)
  history.replaceState(null,'',buildEditorUrl({tour:nextTour.id}))
  renderForm()

  const message=await persistToursRemotelyIfPossible(toursData)
  setStatus(message)

  if(shouldReturn)goBackToGrid()
}

fieldRefs.name.addEventListener('input',()=>{
  if(isNewMode&&!idManuallyEdited)fieldRefs.id.value=slugify(fieldRefs.name.value)
  syncStateFromFields()
  renderHeader()
  renderSummaryCard()
})

fieldRefs.id.addEventListener('input',()=>{
  idManuallyEdited=true
  syncStateFromFields()
  renderSummaryCard()
})

;[fieldRefs.durationLabel,fieldRefs.tourType,fieldRefs.imageUrl,fieldRefs.departureTimes,fieldRefs.timeSlots,fieldRefs.summary].forEach(field=>{
  field.addEventListener('input',()=>{
    syncStateFromFields()
    renderSummaryCard()
  })
})

fieldRefs.featuredOnIndex.addEventListener('change',()=>{
  syncStateFromFields()
  renderSummaryCard()
})

seasonStack.addEventListener('input',event=>{
  const seasonCard=event.target.closest('[data-season-index]')
  if(!seasonCard)return
  const season=state.seasons[Number(seasonCard.dataset.seasonIndex)]
  if(!season)return
  const seasonField=event.target.dataset.seasonField
  if(!seasonField)return

  season[seasonField]=event.target.value
  renderSummaryCard()
})

seasonStack.addEventListener('click',event=>{
  const removeButton=event.target.closest('[data-remove-season]')
  if(!removeButton||state.seasons.length===1)return
  const seasonCard=removeButton.closest('[data-season-index]')
  if(!seasonCard)return
  state.seasons.splice(Number(seasonCard.dataset.seasonIndex),1)
  renderSeasons()
  renderSummaryCard()
})

addSeasonButton.addEventListener('click',()=>{
  state.seasons.push({
    label:`Season ${state.seasons.length+1}`,
    startDate:'',
    endDate:'',
    adultPrice:'',
    childPrice:''
  })
  renderSeasons()
  renderSummaryCard()
})

saveTourButton.addEventListener('click',()=>{void saveTour()})
saveAndReturnButton.addEventListener('click',()=>{void saveTour({shouldReturn:true})})

editorForm.addEventListener('submit',event=>{
  event.preventDefault()
  void saveTour()
})

applyBrandChrome()
setStatus(`Editing the shared tours dataset in the ${activeBrand.label} workspace.`)
renderForm()
