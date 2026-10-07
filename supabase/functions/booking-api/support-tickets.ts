// Support tickets logged from the SkyBook bubble (assets/js/skybook-support.js).
//
// A ticket is the staff member's message, a screenshot of the page they were
// on, and the page/browser context. Who logged it is never taken from the
// request body: it comes from the signed-in SkyBook profile the caller resolved
// from the access token. Each ticket is recorded in support_tickets (when that
// table exists), its screenshot is kept in the private support-tickets bucket,
// and it is emailed to Aero Digital support through Resend with the screenshot
// inline and attached.

type Json=Record<string,unknown>

const SUPPORT_TICKET_EMAIL_DEFAULT='info@aerodigital.space'
const SUPPORT_SENDER_DEFAULT='bookings@iventuretours.net'
const SUPPORT_SENDER_NAME='Iventure Support'
const SCREENSHOT_BUCKET='support-tickets'
const SCREENSHOT_CID='skybook-ticket-screenshot'
const MAX_MESSAGE_LENGTH=5000
const MAX_SCREENSHOT_BYTES=8*1024*1024
const TICKET_TIMEZONE='Africa/Windhoek'

const CATEGORIES:Record<string,{label:string,color:string,background:string}>={
  problem:{label:'Problem',color:'#9d1f2b',background:'#fbdedf'},
  question:{label:'Question',color:'#14509f',background:'#dbe8fa'},
  idea:{label:'Suggestion',color:'#1a6b3c',background:'#dcf3e4'}
}
const ROLE_LABELS:Record<string,string>={
  super_admin:'Super admin',
  manager:'Manager',
  booking_agent:'Booking agent',
  reservations:'Reservations',
  operations:'Operations',
  finance:'Finance'
}

const text=(value:unknown)=>String(value ?? '').trim()
const clip=(value:unknown,max:number)=>{
  const raw=text(value)
  return raw.length>max ? `${raw.slice(0,max-1)}…` : raw
}
const record=(value:unknown)=>(value&&typeof value==='object'&&!Array.isArray(value) ? value as Json : {})
const escapeHtml=(value:unknown)=>String(value ?? '')
  .replace(/&/g,'&amp;')
  .replace(/</g,'&lt;')
  .replace(/>/g,'&gt;')
  .replace(/"/g,'&quot;')
  .replace(/'/g,'&#39;')
const isMissingRelation=(error:unknown)=>{
  const err=record(error)
  const message=`${text(err.message)} ${text(err.details)}`.toLowerCase()
  return ['42P01','PGRST205','PGRST204'].includes(text(err.code)) || /does not exist|could not find the table|schema cache/.test(message)
}

/* ── Input ───────────────────────────────────────────────────────────── */

const parseScreenshot=(value:unknown)=>{
  const raw=text(value)
  if(!raw)return null
  const match=raw.match(/^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=\s]+)$/)
  if(!match)throw new Error('The screenshot could not be read. Retake it, or remove it and send the ticket without one.')
  const base64=match[2].replace(/\s+/g,'')
  const bytes=Math.floor(base64.length*3/4)
  if(bytes>MAX_SCREENSHOT_BYTES)throw new Error('The screenshot is too large to send. Retake it, or remove it and send the ticket without one.')
  const mime=match[1]
  const ext=mime==='image/png' ? 'png' : mime==='image/webp' ? 'webp' : 'jpg'
  return { base64, mime, ext, bytes }
}

const decodeBase64=(base64:string)=>{
  const binary=atob(base64)
  const out=new Uint8Array(binary.length)
  for(let i=0;i<binary.length;i++)out[i]=binary.charCodeAt(i)
  return out
}

// Only the context keys the bubble sends, each trimmed to a sane length, so a
// crafted request cannot bloat the row or the email.
const sanitizeContext=(value:unknown)=>{
  const source=record(value)
  const pick=(key:string,max=300)=>clip(source[key],max)
  const errors=(Array.isArray(source.errors) ? source.errors : []).slice(-8).map(item=>{
    const entry=record(item)
    return { at:clip(entry.at,40), source:clip(entry.source,40), message:clip(entry.message,400) }
  }).filter(entry=>entry.message)
  return {
    url:pick('url',600),
    title:pick('title',200),
    section:pick('section',120),
    view:pick('view',120),
    dialog:pick('dialog',160),
    app:pick('app',60),
    browser:pick('browser',120),
    os:pick('os',120),
    viewport:pick('viewport',40),
    screen:pick('screen',40),
    pixel_ratio:pick('pixel_ratio',10),
    language:pick('language',40),
    timezone:pick('timezone',60),
    local_time:pick('local_time',80),
    online:typeof source.online==='boolean' ? source.online : null,
    user_agent:pick('user_agent',400),
    screenshot_marked_up:source.screenshot_marked_up===true,
    errors
  }
}

const describeReporter=(user:Json,profile:Json)=>{
  const username=text(profile.username)
  const authEmail=text(user.email)
  // SkyBook usernames sign in through an internal username@skybook.local
  // address — that is not a mailbox anyone can reply to.
  const email=authEmail&&!/@skybook\.local$/i.test(authEmail) ? authEmail : ''
  const name=text(profile.full_name) || username || email || 'SkyBook user'
  const role=text(profile.role)
  return {
    id:text(user.id) || null,
    name,
    username,
    email,
    role,
    role_label:ROLE_LABELS[role] || role.replace(/_/g,' ').replace(/\b\w/g,c=>c.toUpperCase()) || 'Staff'
  }
}

const initialsOf=(name:string)=>{
  const parts=name.replace(/[^\p{L}\p{N}\s]/gu,' ').split(/\s+/).filter(Boolean)
  if(!parts.length)return 'SB'
  const first=parts[0][0] || ''
  const last=parts.length>1 ? parts[parts.length-1][0] : (parts[0][1] || '')
  return `${first}${last}`.toUpperCase()
}

/* ── Email ───────────────────────────────────────────────────────────── */

const formatTicketTime=(iso:string)=>{
  const date=new Date(iso)
  if(Number.isNaN(date.getTime()))return iso
  const day=new Intl.DateTimeFormat('en-GB',{ timeZone:TICKET_TIMEZONE, weekday:'short', day:'numeric', month:'short', year:'numeric' }).format(date)
  const time=new Intl.DateTimeFormat('en-GB',{ timeZone:TICKET_TIMEZONE, hour:'2-digit', minute:'2-digit', hour12:false }).format(date)
  return `${day} at ${time}`
}

const senderAddress=()=>{
  const explicit=text(Deno.env.get('RESEND_FROM_SUPPORT'))
  if(explicit)return explicit
  // Tickets come from Iventure: the address the Iventure booking emails
  // already send from (verified in Resend), under a support display name.
  const configured=text(Deno.env.get('RESEND_FROM_IVENTURE'))
  const address=(configured.match(/<([^>]+)>/)?.[1] || (configured.includes('@') ? configured : '') || SUPPORT_SENDER_DEFAULT).trim()
  return `${SUPPORT_SENDER_NAME} <${address}>`
}

const recipients=()=>{
  const configured=text(Deno.env.get('SUPPORT_TICKET_EMAIL'))
  const list=(configured || SUPPORT_TICKET_EMAIL_DEFAULT).split(/[,;]/).map(item=>item.trim()).filter(Boolean)
  return list.length ? list : [SUPPORT_TICKET_EMAIL_DEFAULT]
}

type TicketEmailInput={
  reference:string
  createdAt:string
  category:string
  message:string
  reporter:ReturnType<typeof describeReporter>
  context:ReturnType<typeof sanitizeContext>
  hasScreenshot:boolean
}

export const buildSupportTicketEmail=({ reference, createdAt, category, message, reporter, context, hasScreenshot }:TicketEmailInput)=>{
  const tone=CATEGORIES[category] || CATEGORIES.problem
  const when=formatTicketTime(createdAt)
  const summary=clip(message.replace(/\s+/g,' '),70)
  const subject=`[SkyBook] ${reference} · ${tone.label} from ${reporter.name} — ${summary}`
  const font=`'DM Sans',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif`
  const mono=`ui-monospace,SFMono-Regular,Menlo,Consolas,monospace`
  const roleLine=[reporter.role_label,reporter.username ? `@${reporter.username}` : ''].filter(Boolean).join(' · ')

  const place=[
    ['Page',context.title],
    ['Section',[context.section,context.view].filter(Boolean).join(' › ')],
    ['Open dialog',context.dialog],
    ['Address',context.url]
  ].filter(([,value])=>text(value))
  const device=[
    ['App',context.app],
    ['Browser',[context.browser,context.os].filter(Boolean).join(' on ')],
    ['Window',[context.viewport,context.screen ? `screen ${context.screen}` : '',context.pixel_ratio ? `${context.pixel_ratio}x` : ''].filter(Boolean).join(' · ')],
    ['Their clock',[context.local_time,context.timezone].filter(Boolean).join(' · ')],
    ['Language',context.language],
    ['Connection',context.online===false ? 'Offline when logged' : context.online===true ? 'Online' : '']
  ].filter(([,value])=>text(value))

  const sectionLabel=(label:string)=>`<div style="margin:0 0 10px;font-family:${font};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6b7f91">${escapeHtml(label)}</div>`
  const rows=(items:string[][])=>items.map(([key,value],index)=>{
    const isUrl=key==='Address'&&/^https?:\/\//i.test(value)
    const cell=isUrl
      ? `<a href="${escapeHtml(value)}" style="color:#145bc7;text-decoration:none;word-break:break-all">${escapeHtml(value)}</a>`
      : escapeHtml(value)
    const border=index ? 'border-top:1px solid #eef3f7;' : ''
    return `<tr><td style="${border}padding:9px 12px 9px 0;width:118px;vertical-align:top;font-family:${font};font-size:13px;line-height:19px;color:#6b7f91;white-space:nowrap">${escapeHtml(key)}</td><td style="${border}padding:9px 0;vertical-align:top;font-family:${font};font-size:14px;line-height:20px;color:#143148;word-break:break-word">${cell}</td></tr>`
  }).join('')
  const block=(inner:string,top=28)=>`<tr><td style="padding:${top}px 32px 0">${inner}</td></tr>`

  const errorsHtml=context.errors.length ? block(
    sectionLabel('Errors on screen before the ticket')+
    `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#fff7f7;border:1px solid #f1cdd0;border-radius:10px">${context.errors.map((entry,index)=>`<tr><td style="${index ? 'border-top:1px solid #f6dfe1;' : ''}padding:10px 14px;font-family:${mono};font-size:12px;line-height:18px;color:#9d1f2b;word-break:break-word"><span style="color:#b9666e">${escapeHtml([entry.at,entry.source].filter(Boolean).join(' · '))}</span><br>${escapeHtml(entry.message)}</td></tr>`).join('')}</table>`
  ) : ''

  const screenshotHtml=hasScreenshot ? block(
    sectionLabel(context.screenshot_marked_up ? `Screenshot · marked up by ${reporter.name}` : 'Screenshot of their screen')+
    `<a href="cid:${SCREENSHOT_CID}" style="text-decoration:none"><img src="cid:${SCREENSHOT_CID}" width="576" alt="Screenshot of SkyBook when the ticket was logged" style="display:block;width:100%;max-width:576px;height:auto;border:1px solid #d9e3ea;border-radius:12px"></a>`+
    `<div style="margin-top:8px;font-family:${font};font-size:12px;line-height:18px;color:#8a9aaa">Also attached at full size.</div>`
  ) : block(
    sectionLabel('Screenshot')+
    `<div style="padding:14px 16px;border:1px dashed #cfdbe6;border-radius:10px;font-family:${font};font-size:13px;line-height:19px;color:#6b7f91">${escapeHtml(reporter.name)} sent this ticket without a screenshot.</div>`
  )

  const replyLine=reporter.email
    ? `Reply to this email to answer ${escapeHtml(reporter.name)} directly at <a href="mailto:${escapeHtml(reporter.email)}" style="color:#145bc7;text-decoration:none">${escapeHtml(reporter.email)}</a>.`
    : `${escapeHtml(reporter.name)} signs in with a SkyBook username, so there is no email to reply to — get back to them on their usual channel.`

  const html=`<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:0;background:#eef3f8;-webkit-text-size-adjust:100%">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;color:#eef3f8">${escapeHtml(`${reporter.name}: ${clip(message.replace(/\s+/g,' '),140)}`)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#eef3f8">
<tr><td align="center" style="padding:32px 12px 40px">
<table role="presentation" width="640" cellpadding="0" cellspacing="0" style="width:100%;max-width:640px;border-collapse:separate;background:#ffffff;border:1px solid #dde6ee;border-radius:18px;overflow:hidden">
  <tr><td bgcolor="#092d52" style="background:#092d52;background-image:linear-gradient(135deg,#145bc7 0%,#0c3a6a 48%,#092d52 100%);padding:22px 32px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr>
      <td style="font-family:${font};font-size:21px;line-height:26px;font-weight:700;letter-spacing:-0.6px;color:#ffffff">Sky<span style="color:#8fd1ff">Book</span><div style="margin-top:2px;font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.6px;text-transform:uppercase;color:#a5e8ef">Support ticket</div></td>
      <td align="right" style="vertical-align:middle"><span style="display:inline-block;padding:6px 12px;border-radius:999px;background:${tone.background};color:${tone.color};font-family:${font};font-size:12px;line-height:16px;font-weight:700;letter-spacing:0.3px">${escapeHtml(tone.label)}</span></td>
    </tr></table>
  </td></tr>
  <tr><td style="padding:28px 32px 0">
    <div style="font-family:${font};font-size:32px;line-height:38px;font-weight:700;letter-spacing:-1px;color:#092d52">${escapeHtml(reference)}</div>
    <div style="margin-top:4px;font-family:${font};font-size:14px;line-height:20px;color:#516678">Logged ${escapeHtml(when)} · Namibia time</div>
  </td></tr>
  ${block(`<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="border-collapse:separate;background:#f6f9fc;border:1px solid #e3eaf1;border-radius:14px"><tr>
      <td width="64" style="padding:16px 0 16px 16px;vertical-align:middle"><div style="width:46px;height:46px;border-radius:23px;background:#145bc7;background-image:linear-gradient(145deg,#2f7ce6,#0c3a6a);color:#ffffff;font-family:${font};font-size:16px;line-height:46px;font-weight:700;text-align:center;letter-spacing:0.5px">${escapeHtml(initialsOf(reporter.name))}</div></td>
      <td style="padding:16px 16px 16px 4px;vertical-align:middle">
        <div style="font-family:${font};font-size:11px;line-height:16px;font-weight:700;letter-spacing:1.4px;text-transform:uppercase;color:#6b7f91">Logged by</div>
        <div style="font-family:${font};font-size:17px;line-height:24px;font-weight:700;color:#143148">${escapeHtml(reporter.name)}</div>
        <div style="font-family:${font};font-size:13px;line-height:19px;color:#516678">${escapeHtml(roleLine)}${reporter.email ? ` · <a href="mailto:${escapeHtml(reporter.email)}" style="color:#145bc7;text-decoration:none">${escapeHtml(reporter.email)}</a>` : ''}</div>
      </td>
    </tr></table>`,22)}
  ${block(sectionLabel('What they reported')+`<div style="padding:16px 18px;background:#f4f7fa;border-left:4px solid #145bc7;border-radius:4px 12px 12px 4px;font-family:${font};font-size:15px;line-height:24px;color:#143148;white-space:pre-wrap;word-break:break-word">${escapeHtml(message)}</div>`)}
  ${screenshotHtml}
  ${place.length ? block(sectionLabel('Where it happened')+`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(place)}</table>`) : ''}
  ${device.length ? block(sectionLabel('Device')+`<table role="presentation" width="100%" cellpadding="0" cellspacing="0">${rows(device)}</table>`) : ''}
  ${errorsHtml}
  <tr><td style="padding:30px 32px 0"><div style="height:1px;background:#e3eaf1;line-height:1px;font-size:1px">&nbsp;</div></td></tr>
  <tr><td style="padding:18px 32px 26px;font-family:${font};font-size:13px;line-height:20px;color:#6b7f91">${replyLine}</td></tr>
</table>
<div style="padding-top:16px;font-family:${font};font-size:12px;line-height:18px;color:#8a9aaa;text-align:center">Logged from the SkyBook support bubble · True Travel &amp; Iventure</div>
</td></tr>
</table>
</body>
</html>`

  const line=(key:string,value:string)=>`${key.padEnd(12,' ')} ${value}`
  const textBody=[
    `SkyBook support ticket ${reference} (${tone.label})`,
    `Logged ${when} (Namibia time)`,
    '',
    'LOGGED BY',
    line('Name',reporter.name),
    line('Role',roleLine),
    ...(reporter.email ? [line('Email',reporter.email)] : []),
    '',
    'WHAT THEY REPORTED',
    message,
    '',
    hasScreenshot ? `Screenshot attached${context.screenshot_marked_up ? ' (marked up by the reporter)' : ''}.` : 'No screenshot was included.',
    ...(place.length ? ['','WHERE IT HAPPENED',...place.map(([key,value])=>line(key,value))] : []),
    ...(device.length ? ['','DEVICE',...device.map(([key,value])=>line(key,value))] : []),
    ...(context.errors.length ? ['','ERRORS ON SCREEN BEFORE THE TICKET',...context.errors.map(entry=>`- ${[entry.at,entry.source].filter(Boolean).join(' · ')}: ${entry.message}`)] : []),
    '',
    reporter.email ? `Reply to this email to answer ${reporter.name} directly.` : `${reporter.name} has no email on file — reply on their usual channel.`
  ].join('\n')

  return { subject, html, text:textBody }
}

const sendViaResend=async({ reference, email, screenshot, replyTo }:{
  reference:string
  email:{subject:string,html:string,text:string}
  screenshot:ReturnType<typeof parseScreenshot>
  replyTo:string
})=>{
  const apiKey=text(Deno.env.get('RESEND_API_KEY'))
  if(!apiKey)throw new Error('Email is not set up on the server yet (RESEND_API_KEY is missing).')
  const payload:Json={
    from:senderAddress(),
    to:recipients(),
    subject:email.subject,
    html:email.html,
    text:email.text,
    headers:{ 'X-Entity-Ref-ID':reference },
    ...(replyTo ? { reply_to:replyTo } : {}),
    ...(screenshot ? { attachments:[{
      filename:`${reference}-screenshot.${screenshot.ext}`,
      content:screenshot.base64,
      content_type:screenshot.mime,
      content_id:SCREENSHOT_CID
    }] } : {})
  }
  const response=await fetch('https://api.resend.com/emails',{
    method:'POST',
    headers:{ 'Content-Type':'application/json', Authorization:`Bearer ${apiKey}` },
    body:JSON.stringify(payload)
  })
  const raw=await response.text().catch(()=>'')
  let result:Json={}
  try{ result=raw ? JSON.parse(raw) : {} }catch{}
  if(!response.ok){
    throw new Error(text(result.message) || text(raw) || `The email service answered ${response.status}.`)
  }
  return text(result.id)
}

/* ── Ticket ──────────────────────────────────────────────────────────── */

// Used only when support_tickets has not been created yet, so a ticket still
// gets a reference the reporter and support can quote.
const fallbackReference=()=>{
  const now=new Date()
  const stamp=`${String(now.getUTCFullYear()).slice(2)}${String(now.getUTCMonth()+1).padStart(2,'0')}${String(now.getUTCDate()).padStart(2,'0')}`
  const suffix=Math.random().toString(36).slice(2,6).toUpperCase()
  return `TKT-${stamp}-${suffix}`
}

export const createSupportTicket=async({ adminClient, user, profile, body }:{
  // deno-lint-ignore no-explicit-any
  adminClient:any
  user:Json
  profile:Json
  body:Json
})=>{
  const message=text(body.message).replace(/\r\n/g,'\n').slice(0,MAX_MESSAGE_LENGTH)
  if(message.length<3)throw new Error('Describe the issue before sending the ticket.')
  const category=CATEGORIES[text(body.category)] ? text(body.category) : 'problem'
  const context=sanitizeContext(body.context)
  const screenshot=parseScreenshot(body.screenshot)
  const reporter=describeReporter(user,profile)
  const createdAt=new Date().toISOString()

  let ticketId=''
  let reference=''
  const { data:row,error:insertError }=await adminClient.from('support_tickets').insert({
    category,
    message,
    reporter_id:reporter.id,
    reporter_name:reporter.name,
    reporter_username:reporter.username || null,
    reporter_role:reporter.role || null,
    reporter_email:reporter.email || null,
    page_url:context.url || null,
    page_title:context.title || null,
    page_view:[context.section,context.view].filter(Boolean).join(' › ') || null,
    context,
    created_at:createdAt
  }).select('id,ticket_number').single()
  if(insertError){
    if(!isMissingRelation(insertError))console.error('[support-tickets] could not record ticket',insertError)
  }else{
    ticketId=text(row?.id)
    reference=row?.ticket_number ? `TKT-${row.ticket_number}` : ''
  }
  if(!reference)reference=fallbackReference()

  const updateTicket=async(patch:Json)=>{
    if(!ticketId)return
    const { error }=await adminClient.from('support_tickets').update({ ...patch, updated_at:new Date().toISOString() }).eq('id',ticketId)
    if(error)console.error('[support-tickets] could not update ticket',error)
  }

  if(screenshot){
    const month=createdAt.slice(0,7)
    const path=`${month}/${reference}.${screenshot.ext}`
    const { error:uploadError }=await adminClient.storage.from(SCREENSHOT_BUCKET).upload(path,decodeBase64(screenshot.base64),{
      contentType:screenshot.mime,
      upsert:true
    })
    if(uploadError)console.error('[support-tickets] screenshot not stored',uploadError)
    else await updateTicket({ screenshot_path:path })
  }

  const email=buildSupportTicketEmail({ reference, createdAt, category, message, reporter, context, hasScreenshot:Boolean(screenshot) })
  try{
    const emailId=await sendViaResend({ reference, email, screenshot, replyTo:reporter.email })
    await updateTicket({ email_status:'sent', email_id:emailId || null, email_error:null, emailed_at:new Date().toISOString() })
    return {
      ticket:{ id:ticketId || null, reference, category, created_at:createdAt, recorded:Boolean(ticketId) },
      email:{ status:'sent', id:emailId || null, to:recipients() }
    }
  }catch(error){
    const reason=error instanceof Error ? error.message : String(error)
    await updateTicket({ email_status:'failed', email_error:reason })
    throw new Error(`Your ticket could not be emailed to support: ${reason}`)
  }
}
