import { app, BrowserWindow, ipcMain, Menu } from 'electron'
import path from 'path'
import isDev from 'electron-is-dev'

let mainWindow: BrowserWindow | null = null

const createWindow = () => {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      nodeIntegration: false,
      contextIsolation: true,
      enableRemoteModule: false,
    },
  })

  const startUrl = isDev
    ? 'http://localhost:5173'
    : `file://${path.join(__dirname, '../dist/index.html')}`

  mainWindow.loadURL(startUrl)

  if (isDev) {
    mainWindow.webContents.openDevTools()
  }

  mainWindow.on('closed', () => {
    mainWindow = null
  })
}

const createMenu = () => {
  const template: Electron.MenuItemConstructorOptions[] = [
    {
      label: 'File',
      submenu: [
        {
          label: 'Exit',
          accelerator: 'CmdOrCtrl+Q',
          click: () => {
            app.quit()
          },
        },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { label: 'Undo', accelerator: 'CmdOrCtrl+Z', role: 'undo' },
        { label: 'Redo', accelerator: 'CmdOrCtrl+Y', role: 'redo' },
        { type: 'separator' },
        { label: 'Cut', accelerator: 'CmdOrCtrl+X', role: 'cut' },
        { label: 'Copy', accelerator: 'CmdOrCtrl+C', role: 'copy' },
        { label: 'Paste', accelerator: 'CmdOrCtrl+V', role: 'paste' },
      ],
    },
    {
      label: 'Help',
      submenu: [
        {
          label: 'About',
          click: () => {
            logger.info('About VPN Client')
          },
        },
      ],
    },
  ]

  const menu = Menu.buildFromTemplate(template)
  Menu.setApplicationMenu(menu)
}

app.on('ready', () => {
  createWindow()
  createMenu()
  logger.info('Application started')
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})

// IPC handlers for WireGuard management
ipcMain.handle('wireguard:start', async (event, config: string) => {
  try {
    logger.info('Starting WireGuard')
    // Implementation would spawn wireguard.exe or wg-quick
    return { success: true }
  } catch (error) {
    logger.error('Failed to start WireGuard:', error)
    throw error
  }
})

ipcMain.handle('wireguard:stop', async () => {
  try {
    logger.info('Stopping WireGuard')
    // Implementation would kill wireguard processes
    return { success: true }
  } catch (error) {
    logger.error('Failed to stop WireGuard:', error)
    throw error
  }
})

ipcMain.handle('wireguard:status', async () => {
  try {
    return { isRunning: false }
  } catch (error) {
    logger.error('Failed to get WireGuard status:', error)
    throw error
  }
})

ipcMain.handle('app:get-version', () => {
  return app.getVersion()
})

ipcMain.handle('app:quit', () => {
  app.quit()
})
