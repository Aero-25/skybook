const { test, expect } = require('@playwright/test')

const adminUsername=process.env.SKYBOOK_ADMIN_USERNAME || ''
const adminPassword=process.env.SKYBOOK_ADMIN_PASSWORD || ''

const signIn=async page=>{
  await page.goto('/login.html')
  await page.locator('input[name="username"]').fill(adminUsername)
  await page.locator('input[name="password"]').fill(adminPassword)
  await page.getByRole('button',{name:/sign in/i}).click()
  await expect.poll(()=>new URL(page.url()).pathname).toContain('booking-admin.html')
  await expect(page.locator('#adminAppShell')).toBeVisible()
}

test.describe('SkyBook console',()=>{
  test('unauthenticated visit is sent to sign in',async({ page })=>{
    await page.goto('/booking-admin.html')
    await expect.poll(()=>new URL(page.url()).pathname).toContain('login.html')
    await expect(page.locator('#loginForm')).toBeVisible()
  })

  test.describe('signed in',()=>{
    test.skip(!adminUsername || !adminPassword,'Set SKYBOOK_ADMIN_USERNAME and SKYBOOK_ADMIN_PASSWORD to run signed-in smoke tests.')

    test('dashboard, reservations, bookings, tours and reports render',async({ page })=>{
      await signIn(page)
      await expect(page.locator('[data-admin-view="dashboard"].is-active')).toBeVisible()
      await expect(page.locator('#dashboardStats .adm-stat')).toHaveCount(4)

      await page.locator('.adm-nav [data-admin-tab="reservations"]').click()
      await expect.poll(()=>new URL(page.url()).searchParams.get('tab')).toBe('reservations')
      await expect(page.locator('#reservationsTable')).toBeVisible()

      await page.locator('.adm-nav [data-admin-tab="bookings"]').click()
      await expect(page.locator('#bookingsTable')).toBeVisible()
      await page.locator('[data-open-new-booking]').first().click()
      await expect(page.locator('#bookingModal')).toBeVisible()
      await expect(page.locator('#adminBookingReference')).not.toHaveValue('')
      await page.locator('#closeBookingModalButton').click()
      await expect(page.locator('#bookingModal')).toBeHidden()

      await page.locator('.adm-nav [data-admin-tab="services"]').click()
      await expect(page.locator('#servicesTable tr').first()).toBeVisible()

      await page.locator('.adm-nav [data-admin-tab="reports"]').click()
      await expect(page.locator('#salesReportCards .metric-card')).toHaveCount(6)
    })
  })
})
