const { test, expect } = require('@playwright/test')

const adminUsername=process.env.SKYBOOK_ADMIN_USERNAME || ''
const adminPassword=process.env.SKYBOOK_ADMIN_PASSWORD || ''

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

const selectFirstRealOption=async pageSelector=>{
  const count=await pageSelector.locator('option').count()
  for(let index=0;index<count;index+=1){
    const option=pageSelector.locator('option').nth(index)
    const value=await option.getAttribute('value')
    if(value) return value
  }
  throw new Error('No selectable option was available.')
}

test.describe('SkyBook admin smoke flows',()=>{
  test.skip(!adminUsername || !adminPassword,'Set SKYBOOK_ADMIN_USERNAME and SKYBOOK_ADMIN_PASSWORD to run admin smoke tests.')

  test('reservation accept, trash recovery, booking edit, and customer popup',async({ page })=>{
    const seed=uniqueGuestSeed()
    const guestName=`Smoke Guest ${seed}`
    const guestEmail=`smoke.${seed}@example.com`
    const guestPhone=`+26481${seed}`
    const updatedPhone=`+26499${seed}`

    await signIn(page)

    await page.getByRole('button',{name:/new booking/i}).click()
    await expect(page.locator('#bookingModal')).toBeVisible()

    const serviceSelect=page.locator('#adminBookingService')
    await expect.poll(async()=>serviceSelect.locator('option').count()).toBeGreaterThan(1)
    const serviceValue=await selectFirstRealOption(serviceSelect)

    await serviceSelect.selectOption(serviceValue)
    await page.locator('#adminBookingStatusField').selectOption('pending')
    await page.locator('#adminBookingPaymentStatusField').selectOption('pending')
    await page.locator('#adminBookingDate').fill(futureDate())
    await page.locator('#adminBookingCustomerName').fill(guestName)
    await page.locator('#adminBookingCustomerEmail').fill(guestEmail)
    await page.locator('#adminBookingCustomerPhone').fill(guestPhone)
    await page.locator('#adminBookingNotes').fill('Playwright smoke reservation.')
    await page.locator('#adminBookingSaveButton').click()

    await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('bookings')

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
