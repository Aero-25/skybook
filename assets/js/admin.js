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

const frame=document.getElementById('previewFrame')
const statusNode=document.getElementById('adminStatus')
const tourGrid=document.getElementById('tourGrid')
const reloadToursButton=document.getElementById('reloadToursFromRemote')

let toursData=normalizeToursData(readToursData())
const trueTravelSiteBase=(window.SkyBookConfig?.trueTravelSiteBase||'https://www.truetravelnam.net').replace(/\/+$/,'')

const setStatus=(message,isError=false)=>{
  if(!statusNode){
    if(isError)console.error(message)
    else console.info(message)
    return
  }
  statusNode.textContent=message
  statusNode.classList.toggle('is-error',isError)
}

const reloadPreview=()=>{
  if(!frame)return
  frame.src=`${trueTravelSiteBase}/index.html?admin=1&v=${Date.now()}`
}

const getRequestedPage=()=>window.location.hash.replace(/^#/,'').trim()==='tours' ? 'tours' : 'index'

const updateActivePanel=(page,{updateHash=true}={})=>{
  document.querySelectorAll('[data-page]').forEach(node=>node.classList.toggle('is-active',node.dataset.page===page))
  document.querySelectorAll('[data-panel-view]').forEach(node=>node.classList.toggle('is-active',node.dataset.panelView===page))

  if(updateHash){
    const nextHash=page==='tours' ? '#tours' : ''
    history.replaceState(null,'',`${window.location.pathname}${nextHash}`)
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
    <a class="tour-grid-card" href="tour-editor.html?tour=${encodeURIComponent(tour.id)}">
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
    <a class="tour-grid-card tour-grid-card-add" href="tour-editor.html?new=1">
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
    setStatus('Live tours were loaded from Supabase.')
    reloadPreview()
  }catch(error){
    setStatus(error?.message||'The live tours could not be loaded.',true)
  }
})

document.querySelectorAll('[data-page]').forEach(button=>{
  button.addEventListener('click',()=>{
    updateActivePanel(button.dataset.page)
  })
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

  renderToursGrid()
  updateActivePanel(getRequestedPage(),{updateHash:false})
})()
