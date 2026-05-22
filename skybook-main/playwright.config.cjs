const { defineConfig } = require('@playwright/test')

const baseURL=process.env.SKYBOOK_BASE_URL || 'http://127.0.0.1:4173'

module.exports=defineConfig({
  testDir:'./tests',
  timeout:120000,
  expect:{ timeout:15000 },
  retries:process.env.CI ? 2 : 0,
  reporter:process.env.CI ? [['list'],['html',{open:'never'}]] : 'list',
  use:{
    baseURL,
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    video:'retain-on-failure'
  },
  webServer:process.env.SKYBOOK_BASE_URL ? undefined : {
    command:'node scripts/smoke-server.mjs',
    url:`${baseURL}/login.html`,
    reuseExistingServer:!process.env.CI,
    timeout:120000
  }
})
