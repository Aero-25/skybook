const { app, BrowserWindow, shell, Menu } = require('electron')
const path = require('path')

const SKYBOOK_URL = 'https://skybook.aerodigital.space'

function createWindow () {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 1024,
    minHeight: 700,
    icon: path.join(__dirname, '..', 'build', 'icon.png'),
    title: 'SkyBook',
    backgroundColor: '#eef6fc',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: false
    }
  })

  win.loadURL(SKYBOOK_URL)

  // Open target="_blank" links in the system browser, not a new Electron window
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })

  const isMac = process.platform === 'darwin'

  const menu = Menu.buildFromTemplate([
    ...(isMac ? [{ label: app.name, submenu: [{ role: 'about' }, { type: 'separator' }, { role: 'hide' }, { role: 'hideOthers' }, { role: 'unhide' }, { type: 'separator' }, { role: 'quit' }] }] : []),
    {
      label: 'File',
      submenu: [
        { label: 'Reload', accelerator: 'CmdOrCtrl+R', click: () => win.reload() },
        { type: 'separator' },
        isMac ? { role: 'close' } : { role: 'quit' }
      ]
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo' }, { role: 'redo' }, { type: 'separator' },
        { role: 'cut' }, { role: 'copy' }, { role: 'paste' }, { role: 'selectAll' }
      ]
    },
    {
      label: 'View',
      submenu: [
        {
          label: 'Zoom In', accelerator: 'CmdOrCtrl+=',
          click: () => { const z = win.webContents.getZoomLevel(); win.webContents.setZoomLevel(z + 0.5) }
        },
        {
          label: 'Zoom Out', accelerator: 'CmdOrCtrl+-',
          click: () => { const z = win.webContents.getZoomLevel(); win.webContents.setZoomLevel(z - 0.5) }
        },
        {
          label: 'Reset Zoom', accelerator: 'CmdOrCtrl+0',
          click: () => win.webContents.setZoomLevel(0)
        },
        { type: 'separator' },
        { role: 'togglefullscreen' }
      ]
    }
  ])

  Menu.setApplicationMenu(menu)
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
