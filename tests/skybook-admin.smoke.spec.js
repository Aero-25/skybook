const { test, expect } = require('@playwright/test')

const adminUsername=process.env.SKYBOOK_ADMIN_USERNAME || ''
const adminPassword=process.env.SKYBOOK_ADMIN_PASSWORD || ''
// The booking-api base URL and anon key are the same public, client-safe values already
// embedded in the shipped frontend (assets/js/shared.js DEFAULT_SUPABASE_CONFIG) — overridable
// via env vars for pointing this test at a different environment.
const bookingApiBaseUrl=process.env.SKYBOOK_BOOKING_API_URL || 'https://zegfirgyhdjyehvhlrnh.supabase.co/functions/v1/booking-api'
const bookingApiAnonKey=process.env.SKYBOOK_BOOKING_API_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InplZ2Zpcmd5aGRqeWVodmhscm5oIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzY0MTIwOTUsImV4cCI6MjA5MTk4ODA5NX0.1UB49GsmosKQzaLv05hHznVohzgVU0lMUAjzPKN9Jf8'

const futureDate=(offsetDays=5)=>{
  const date=new Date()
  date.setDate(date.getDate()+offsetDays)
  return date.toISOString().slice(0,10)
}

const uniqueGuestSeed=()=>Date.now().toString().slice(-8)

const signIn=async page=>{
  await page.goto('/login.html')
  await page.locator('input[name="username"]').fill(adminUsername)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button',{name:/sign in/i}).click()
  await expect.poll(()=>new URL(page.url()).pathname).toContain('booking-admin.html')
  await expect(page.locator('#adminAppShell')).toBeVisible()
}

// Seeds a real website-sourced reservation via the public booking API — the same endpoint the
// live booking widgets call. Admin-created bookings can never be 'provisional' under the current
// status model (see isReviewReservation in booking-admin.js), so the reservation-review flow can
// only be exercised against a real website-sourced booking, not one created through the admin form.
const seedWebsiteReservation=async(request,{guestName,guestEmail,guestPhone})=>{
  const servicesResponse=await request.get(`${bookingApiBaseUrl}/services`,{
    headers:{apikey:bookingApiAnonKey,'x-brand-code':'true-travel'}
  })
  if(!servicesResponse.ok())throw new Error(`Failed to fetch services: ${servicesResponse.status()} ${await servicesResponse.text()}`)
  const {services}=await servicesResponse.json()
  if(!services?.length)throw new Error('No active services available to seed a test reservation.')
  const serviceSlug=services[0].slug

  const bookingResponse=await request.post(`${bookingApiBaseUrl}/bookings`,{
    headers:{'content-type':'application/json',apikey:bookingApiAnonKey,'x-brand-code':'true-travel'},
    data:{
      service_slug:serviceSlug,
      brand_code:'true-travel',
      preferred_date:futureDate(10),
      quantity:2,
      accept_terms:true,
      customer:{full_name:guestName,email:guestEmail,phone:guestPhone},
      source:'true_travel_inline_reservation',
      notes:'Playwright smoke reservation.'
    }
  })
  if(!bookingResponse.ok())throw new Error(`Failed to seed reservation: ${bookingResponse.status()} ${await bookingResponse.text()}`)
  const {booking}=await bookingResponse.json()
  return booking
}

test.describe('SkyBook admin smoke flows',()=>{
  test.skip(!adminUsername || !adminPassword,'Set SKYBOOK_ADMIN_USERNAME and SKYBOOK_ADMIN_PASSWORD to run admin smoke tests.')

  test('reservation accept, trash recovery, booking edit, and customer popup',async({ page, request })=>{
    const seed=uniqueGuestSeed()
    const guestName=`Smoke Guest ${seed}`
    const guestEmail=`smoke.${seed}@example.com`
    const guestPhone=`+26481${seed}`
    const updatedPhone=`+26499${seed}`

    await seedWebsiteReservation(request,{guestName,guestEmail,guestPhone})

    await signIn(page)

    await page.locator('[data-admin-tab="reservations"]').click()
    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('reservations')
    await expect(page.locator('[data-reservation-id]').filter({ hasText: guestName }).first()).toBeVisible()
    await page.locator('[data-reservation-id]').filter({ hasText: guestName }).first().click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('reservation-management')
    await page.locator('[data-reservation-action="accept"]').first().click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('bookings')
    const bookingId=new URL(page.url()).searchParams.get('booking')
    expect(bookingId).toBeTruthy()

    await page.locator('[data-booking-inline-action="trash-booking"]').first().click()
    await expect(page.locator('#workflowModal')).toBeVisible()
    await page.locator('#workflowModal textarea[name="reason"]').fill('Playwright smoke archive test.')
    await page.locator('#workflowModalSubmitButton').click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('booking-trash')
    const trashRow=page.locator('#adminBookingTrashTable tr').filter({ hasText: guestName }).first()
    await expect(trashRow).toBeVisible()
    await trashRow.getByRole('button',{name:/restore/i}).click()

    await page.goto(`/booking-admin.html?tab=bookings&booking=${bookingId}`)
    await expect.poll(()=>new URL(page.url()).searchParams.get('booking')).toBe(bookingId)
    await expect(page.locator('body')).toContainText(guestName)

    await page.locator('[data-booking-inline-action="edit-booking"]').first().click()
    await expect(page.locator('#bookingModal')).toBeVisible()
    await page.locator('#adminBookingCustomerPhone').fill(updatedPhone)
    await page.locator('#adminBookingSaveButton').click()
    await expect(page.locator('body')).toContainText(updatedPhone)

    await page.locator('[data-admin-tab="customers"]').click()
    await page.locator('#customerFilterSearch').fill(guestEmail)
    const customerRow=page.locator('[data-customer-id]').filter({ hasText: guestName }).first()
    await expect(customerRow).toBeVisible()
    await customerRow.click()

    await expect(page.locator('#customerModal')).toBeVisible()
    await expect(page.locator('#customerModal')).toContainText(guestName)
    await page.locator('#closeCustomerModalButton').click()
    await expect(page.locator('#customerModal')).toBeHidden()
  })
})
