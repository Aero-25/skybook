(function(){
  const root=window.SkyBookAdminModules=window.SkyBookAdminModules||{}

  const normalizeText=value=>String(value ?? '').trim().toLowerCase()
  const normalizeDateKey=value=>{
    const input=String(value ?? '').trim()
    if(!input)return ''
    const parsed=new Date(input)
    return Number.isNaN(parsed.getTime()) ? input.slice(0,10) : parsed.toISOString().slice(0,10)
  }

  const buildConsultantProductivityRows=({bookings=[],getOwnerId,resolveOwnerName}={})=>{
    const grouped=bookings.reduce((accumulator,booking)=>{
      const ownerId=typeof getOwnerId==='function' ? (getOwnerId(booking)||'unassigned') : 'unassigned'
      const ownerName=typeof resolveOwnerName==='function' ? (resolveOwnerName(ownerId,booking)||'Unassigned') : 'Unassigned'
      const bucket=accumulator[ownerId] || {
        id:ownerId,
        name:ownerName,
        bookings:0,
        accepted:0,
        completed:0,
        cancelled:0,
        noShows:0,
        gross:0,
        paid:0
      }
      const status=normalizeText(booking?.status)
      const paymentStatus=normalizeText(booking?.payment_status)
      bucket.bookings+=1
      if(!['draft','pending','cancelled','failed'].includes(status))bucket.accepted+=1
      if(status==='completed')bucket.completed+=1
      if(status==='cancelled')bucket.cancelled+=1
      if(status==='no_show')bucket.noShows+=1
      bucket.gross+=Number(booking?.total_amount||0)
      if(['paid','partially_paid'].includes(paymentStatus))bucket.paid+=Number(booking?.total_amount||0)
      accumulator[ownerId]=bucket
      return accumulator
    },{})
    return Object.values(grouped).sort((left,right)=>right.gross-left.gross)
  }

  const buildArrivalsManifestRows=({
    bookings=[],
    targetDate='',
    getPickupSummary,
    getDropoffSummary,
    getNotes,
    getOperatorName
  }={})=>{
    const dateKey=normalizeDateKey(targetDate)
    return bookings
      .filter(booking=>normalizeDateKey(booking?.preferred_date)===dateKey)
      .map(booking=>({
        id:booking?.id||'',
        reference:booking?.reference||'',
        guest:booking?.customer_name||booking?.customer_email||'Guest',
        tour:booking?.service_name||'Service',
        pickups:typeof getPickupSummary==='function' ? (getPickupSummary(booking)||'Pending') : 'Pending',
        dropoffs:typeof getDropoffSummary==='function' ? (getDropoffSummary(booking)||'Pending') : 'Pending',
        notes:typeof getNotes==='function' ? (getNotes(booking)||'No notes captured.') : 'No notes captured.',
        operator:typeof getOperatorName==='function' ? (getOperatorName(booking)||'Unassigned') : 'Unassigned',
        status:booking?.status||'pending',
        total:Number(booking?.total_amount||0)
      }))
      .sort((left,right)=>left.guest.localeCompare(right.guest))
  }

  root.reports={
    buildConsultantProductivityRows,
    buildArrivalsManifestRows
  }
})()
