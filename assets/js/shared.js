window.TrueTravelShared=(()=>{
  const STORAGE_KEYS={
    ASSET_STORAGE_KEY:'true-travel-index-assets-v1',
    ASSET_SIGNAL_KEY:'true-travel-index-assets-sync-v1',
    SUPABASE_CONFIG_KEY:'skybook-supabase-config-v2',
    TOURS_DATA_STORAGE_KEY:'true-travel-tours-data-v1',
    TOURS_DATA_SIGNAL_KEY:'true-travel-tours-data-sync-v1'
  }

  const DEFAULT_SUPABASE_CONFIG={
    url:'https://zegfirgyhdjyehvhlrnh.supabase.co',
    bucket:'Demo Bucket',
    assetPathPrefix:'index-assets',
    manifestPath:'index-assets/manifest.json',
    anonKey:'AeyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplZ2Zpcmd5aGRqeWVodmhscm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTIwOTUsImV4cCI6MjA5MTk4ODA5NX0.1UB49GsmosKQzaLv05hHznVohzgVU0lMUAjzPKN9Jf8'
  }

  const DEFAULT_TOURS_DATA={
    tours:[
      {
        id:'pelican-point-kayaking',
        name:'Pelican Point Kayaking',
        tourType:'tour',
        durationLabel:'Half Day · 3 Hours',
        timeSlots:['Morning'],
        departureTimes:['8:00 AM'],
        featuredOnIndex:true,
        seasons:[{id:'2026-standard',label:'2026 Standard',startDate:'2026-01-01',endDate:'2026-12-31',adultPrice:3850,childPrice:''}]
      },
      {
        id:'dolphin-seal-boat-cruise',
        name:'Dolphin & Seal Boat Cruise',
        tourType:'tour',
        durationLabel:'Half Day · 3 Hours',
        timeSlots:['Morning'],
        departureTimes:['8:15 AM'],
        featuredOnIndex:true,
        seasons:[{id:'2026-standard',label:'2026 Standard',startDate:'2026-01-01',endDate:'2026-12-31',adultPrice:3850,childPrice:''}]
      },
      {
        id:'sandwich-harbour-dune-drive',
        name:'Sandwich Harbour Dune Drive',
        tourType:'tour',
        durationLabel:'AM/PM · 4 Hours',
        timeSlots:['Morning','Afternoon'],
        departureTimes:['8:00 AM','12:00 PM'],
        featuredOnIndex:true,
        seasons:[{id:'2026-standard',label:'2026 Standard',startDate:'2026-01-01',endDate:'2026-12-31',adultPrice:3850,childPrice:''}]
      },
      {
        id:'moon-landscape-excursion',
        name:'Moon Landscape Excursion',
        tourType:'tour',
        durationLabel:'Half Day · 5 Hours',
        timeSlots:['Morning'],
        departureTimes:['8:00 AM'],
        featuredOnIndex:true,
        seasons:[{id:'2026-standard',label:'2026 Standard',startDate:'2026-01-01',endDate:'2026-12-31',adultPrice:3850,childPrice:''}]
      },
      {
        id:'kayak-sandwich-combo',
        name:'Kayak + Sandwich Harbour Combo',
        tourType:'combo',
        durationLabel:'Full Day · Min 3 Pax',
        timeSlots:['Full Day'],
        departureTimes:['8:00 AM'],
        featuredOnIndex:true,
        seasons:[{id:'2026-standard',label:'2026 Standard',startDate:'2026-01-01',endDate:'2026-12-31',adultPrice:3850,childPrice:''}]
      },
      {
        id:'boat-sandwich-combo',
        name:'Boat + Sandwich Harbour Combo',
        tourType:'combo',
        durationLabel:'Full Day · Combo',
        timeSlots:['Full Day'],
        departureTimes:['8:15 AM'],
        featuredOnIndex:false,
        seasons:[{id:'2026-standard',label:'2026 Standard',startDate:'2026-01-01',endDate:'2026-12-31',adultPrice:3850,childPrice:''}]
      },
      {
        id:'sandwich-beach-braai',
        name:'Half Day Sandwich + Beach Braai',
        tourType:'combo',
        durationLabel:'Half Day · Braai',
        timeSlots:['Afternoon'],
        departureTimes:['12:00 PM'],
        featuredOnIndex:false,
        seasons:[{id:'2026-standard',label:'2026 Standard',startDate:'2026-01-01',endDate:'2026-12-31',adultPrice:3850,childPrice:''}]
      }
    ]
  }

  const clone=value=>JSON.parse(JSON.stringify(value))
  const readJsonStorage=(key,fallback)=>{
    try{
      const raw=localStorage.getItem(key)
      return raw ? JSON.parse(raw) : fallback
    }catch{
      return fallback
    }
  }

  const fixLegacyText=value=>String(value??'')
    .replaceAll('Ã¢â‚¬â€','—')
    .replaceAll('â€”','—')
    .replaceAll('Ã‚Â·','·')
    .replaceAll('Â·','·')
    .replaceAll('Ã¢â€ â€™','→')
    .replaceAll('â†’','→')
    .replaceAll('Ã¢â‚¬Â¢','•')
    .replaceAll('â€¢','•')
    .replaceAll('âˆ’','−')
    .replaceAll('âœ“','✓')

  const normalizeOptionText=value=>fixLegacyText(value)
    .replaceAll('—',' — ')
    .replaceAll('·',' · ')
    .replaceAll('→',' → ')
    .replace(/\s{2,}/g,' ')
    .trim()

  const normalizeSupabaseConfig=config=>{
    const next={...DEFAULT_SUPABASE_CONFIG,...config}
    next.url=String(next.url||DEFAULT_SUPABASE_CONFIG.url).trim().replace(/\/+$/,'')
    next.bucket=String(next.bucket||DEFAULT_SUPABASE_CONFIG.bucket).trim()||DEFAULT_SUPABASE_CONFIG.bucket
    next.assetPathPrefix=String(next.assetPathPrefix||DEFAULT_SUPABASE_CONFIG.assetPathPrefix).trim().replace(/^\/+|\/+$/g,'')||DEFAULT_SUPABASE_CONFIG.assetPathPrefix
    next.manifestPath=`${next.assetPathPrefix}/manifest.json`
    next.anonKey=String(next.anonKey||DEFAULT_SUPABASE_CONFIG.anonKey).trim()||DEFAULT_SUPABASE_CONFIG.anonKey
    return next
  }

  const readSupabaseConfig=()=>normalizeSupabaseConfig(readJsonStorage(STORAGE_KEYS.SUPABASE_CONFIG_KEY,{}))
  const writeSupabaseConfig=config=>{
    const next=normalizeSupabaseConfig(config)
    localStorage.setItem(STORAGE_KEYS.SUPABASE_CONFIG_KEY,JSON.stringify({anonKey:next.anonKey}))
  }

  const defaultToursData=clone(DEFAULT_TOURS_DATA)
  const normalizeTourType=value=>String(value||'').trim().toLowerCase().includes('combo') ? 'combo' : 'tour'
  const inferTourType=tour=>{
    const explicitType=String(tour?.tourType||tour?.type||tour?.category||'').trim()
    if(explicitType)return normalizeTourType(explicitType)

    const idReference=String(tour?.id||'').toLowerCase()
    const nameReference=String(tour?.name||'').toLowerCase()
    return idReference.includes('combo')||nameReference.includes('combo')||String(tour?.name||'').includes('+') ? 'combo' : 'tour'
  }
  const normalizeTourSeason=(season,index=0)=>({
    id:String(season?.id||season?.label||`season-${index+1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||`season-${index+1}`,
    label:String(season?.label||`Season ${index+1}`).trim()||`Season ${index+1}`,
    startDate:String(season?.startDate||'').trim(),
    endDate:String(season?.endDate||'').trim(),
    adultPrice:Number(season?.adultPrice||0)||0,
    childPrice:season?.childPrice===0 ? 0 : String(season?.childPrice||'').trim()
  })

  const normalizeTour=(tour,index=0)=>({
    id:String(tour?.id||tour?.name||`tour-${index+1}`).trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'')||`tour-${index+1}`,
    name:String(tour?.name||`Tour ${index+1}`).trim()||`Tour ${index+1}`,
    tourType:inferTourType(tour),
    summary:fixLegacyText(String(tour?.summary||'').trim()),
    imageUrl:String(tour?.imageUrl||'').trim(),
    durationLabel:fixLegacyText(String(tour?.durationLabel||'Custom Duration').trim()||'Custom Duration'),
    timeSlots:Array.isArray(tour?.timeSlots) ? tour.timeSlots.map(item=>fixLegacyText(String(item).trim())).filter(Boolean) : String(tour?.timeSlots||'').split(',').map(item=>fixLegacyText(item.trim())).filter(Boolean),
    departureTimes:Array.isArray(tour?.departureTimes) ? tour.departureTimes.map(item=>fixLegacyText(String(item).trim())).filter(Boolean) : String(tour?.departureTimes||'').split(',').map(item=>fixLegacyText(item.trim())).filter(Boolean),
    featuredOnIndex:tour?.featuredOnIndex!==false,
    seasons:(Array.isArray(tour?.seasons)&&tour.seasons.length ? tour.seasons : [{label:'Default',startDate:'',endDate:'',adultPrice:0,childPrice:''}]).map(normalizeTourSeason)
  })

  const normalizeToursData=data=>({
    tours:(Array.isArray(data?.tours)&&data.tours.length ? data.tours : defaultToursData.tours).map(normalizeTour)
  })

  const readToursData=()=>normalizeToursData(readJsonStorage(STORAGE_KEYS.TOURS_DATA_STORAGE_KEY,defaultToursData))
  const writeToursData=data=>{
    localStorage.setItem(STORAGE_KEYS.TOURS_DATA_STORAGE_KEY,JSON.stringify(normalizeToursData(data)))
    localStorage.setItem(STORAGE_KEYS.TOURS_DATA_SIGNAL_KEY,String(Date.now()))
  }

  const encodeStoragePath=path=>String(path||'').split('/').map(segment=>encodeURIComponent(segment)).join('/')
  const getPublicObjectUrl=(config,objectPath)=>{
    const safeConfig=normalizeSupabaseConfig(config)
    return `${safeConfig.url}/storage/v1/object/public/${encodeURIComponent(safeConfig.bucket)}/${encodeStoragePath(objectPath)}`
  }
  const getManifestPublicUrl=(config,cacheBust='')=>{
    const safeConfig=normalizeSupabaseConfig(config)
    const base=getPublicObjectUrl(safeConfig,safeConfig.manifestPath)
    return cacheBust ? `${base}?v=${cacheBust}` : base
  }
  const getToursDataPath=config=>`${normalizeSupabaseConfig(config).assetPathPrefix}/tours-data.json`

  const uploadObjectToSupabase=async(config,objectPath,filePayload)=>{
    const safeConfig=normalizeSupabaseConfig(config)
    const response=await fetch(`${safeConfig.url}/storage/v1/object/${encodeURIComponent(safeConfig.bucket)}/${encodeStoragePath(objectPath)}`,{
      method:'POST',
      headers:{
        apikey:safeConfig.anonKey,
        Authorization:`Bearer ${safeConfig.anonKey}`,
        'x-upsert':'true',
        'content-type':filePayload.contentType,
        'cache-control':'3600'
      },
      body:filePayload.blob
    })
    if(response.ok)return
    let detail=''
    try{detail=await response.text()}catch{}
    throw new Error(detail||'Supabase request failed.')
  }

  const loadRemoteManifest=async(config,cacheBust='')=>{
    try{
      const response=await fetch(getManifestPublicUrl(config,cacheBust||Date.now()),{cache:'no-store'})
      if(!response.ok)return null
      const payload=await response.json()
      return payload&&typeof payload.assets==='object'&&payload.assets ? payload.assets : {}
    }catch{
      return null
    }
  }

  const persistRemoteManifest=async(config,assets={})=>{
    const safeConfig=normalizeSupabaseConfig(config)
    const payload={updatedAt:new Date().toISOString(),assets}
    await uploadObjectToSupabase(safeConfig,safeConfig.manifestPath,{
      blob:new Blob([JSON.stringify(payload,null,2)],{type:'application/json'}),
      contentType:'application/json'
    })
  }

  const loadRemoteToursData=async(config,cacheBust='')=>{
    const safeConfig=normalizeSupabaseConfig(config)
    try{
      const response=await fetch(`${getPublicObjectUrl(safeConfig,getToursDataPath(safeConfig))}?v=${cacheBust||Date.now()}`,{cache:'no-store'})
      if(!response.ok)return null
      return normalizeToursData(await response.json())
    }catch{
      return null
    }
  }

  const persistRemoteToursData=async(config,data)=>{
    const safeConfig=normalizeSupabaseConfig(config)
    await uploadObjectToSupabase(safeConfig,getToursDataPath(safeConfig),{
      blob:new Blob([JSON.stringify(normalizeToursData(data),null,2)],{type:'application/json'}),
      contentType:'application/json'
    })
  }

  const tourPriceFormatter=new Intl.NumberFormat('en-US')
  const formatTourPrice=value=>`N$${tourPriceFormatter.format(Number(value||0))}`

  const getTourSeasonForDate=(tour,dateString='')=>{
    const seasons=Array.isArray(tour?.seasons)&&tour.seasons.length ? tour.seasons : []
    if(!seasons.length)return {adultPrice:0,childPrice:'',label:'Default',startDate:'',endDate:''}
    const targetDate=dateString ? new Date(`${dateString}T00:00:00`) : new Date()
    const validDate=Number.isNaN(targetDate.getTime()) ? new Date() : targetDate
    const match=seasons.find(season=>{
      const start=season.startDate ? new Date(`${season.startDate}T00:00:00`) : null
      const end=season.endDate ? new Date(`${season.endDate}T23:59:59`) : null
      if(start&&Number.isNaN(start.getTime()))return false
      if(end&&Number.isNaN(end.getTime()))return false
      if(start&&validDate<start)return false
      if(end&&validDate>end)return false
      return true
    })
    return match||seasons[0]
  }

  const parseListInput=value=>String(value||'').split(',').map(item=>fixLegacyText(item.trim())).filter(Boolean)
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[char]))

  return {
    STORAGE_KEYS,
    DEFAULT_SUPABASE_CONFIG,
    DEFAULT_TOURS_DATA:clone(DEFAULT_TOURS_DATA),
    clone,
    fixLegacyText,
    normalizeOptionText,
    normalizeSupabaseConfig,
    readSupabaseConfig,
    writeSupabaseConfig,
    normalizeTourType,
    normalizeTourSeason,
    normalizeTour,
    normalizeToursData,
    readToursData,
    writeToursData,
    encodeStoragePath,
    getPublicObjectUrl,
    getManifestPublicUrl,
    getToursDataPath,
    uploadObjectToSupabase,
    loadRemoteManifest,
    persistRemoteManifest,
    loadRemoteToursData,
    persistRemoteToursData,
    formatTourPrice,
    getTourSeasonForDate,
    parseListInput,
    escapeHtml
  }
})()
