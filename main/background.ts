import path from 'path'
import { app, ipcMain, shell, BrowserWindow } from 'electron'
import serve from 'electron-serve'
import { createWindow, UpdateManager } from './helpers'
import fs from 'fs'

// Detect if we're in a packaged app (more reliable than NODE_ENV)
const isPackaged = app.isPackaged
// Check if --force-prod-mode argument was passed
// Use all checks for maximum compatibility
const isProd = process.env.NODE_ENV === 'production' || isPackaged

// Set up file logging that works in both dev and production
const userDataPath = app.getPath('userData')
const logDir = path.join(userDataPath, 'logs')
const logFilePath = path.join(logDir, 'app.log')

// Ensure log directory exists
try {
  if (!fs.existsSync(logDir)) {
    fs.mkdirSync(logDir, { recursive: true })
  }
} catch (err) {
  console.error('Failed to create log directory:', err)
}

function logToFile(message) {
  try {
    const timestamp = new Date().toISOString()
    const logMessage = `${timestamp} - ${message}\n`
    fs.appendFileSync(logFilePath, logMessage)
  } catch (err) {
    console.error('Failed to write to log file:', err)
  }
}

// Create a global console log override to capture all console logs
const originalConsoleLog = console.log
const originalConsoleError = console.error
console.log = function() {
  logToFile('[LOG] ' + Array.from(arguments).join(' '))
  originalConsoleLog.apply(console, arguments)
}
console.error = function() {
  logToFile('[ERROR] ' + Array.from(arguments).join(' '))
  originalConsoleError.apply(console, arguments)
}

// Catch global errors
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  logToFile(`Uncaught Exception: ${error.stack || error}`)
})

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  logToFile(`Unhandled Rejection: ${reason}`)
})

// Configure electron-serve for production
let loadURL: serve.loadURL
if (isProd) {
  loadURL = serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

// Global reference to mainWindow
let mainWindow: BrowserWindow = null

// Global reference to update manager
let updateManager: UpdateManager = null


;(async () => {
  await app.whenReady()
  logToFile('App ready')

  mainWindow = createWindow('main', {
    width: 600,
    height: 900,
    title: "Invoice Renamer",
    icon: path.join(__dirname, '../renderer/public/images/logo.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
    },
  })

  // Initialize update manager after window is created
  updateManager = new UpdateManager(mainWindow, isProd)

  try {
    if (isProd) {
      // Use the loadURL function from electron-serve for production
      logToFile('Loading production URL')
      
      await mainWindow.loadURL('app://./')
    } else {
      // In development mode, get port from arguments or use a default
      const port = process.argv[2] || '8888'
      logToFile(`Loading development URL: http://localhost:${port}/`)
      await mainWindow.loadURL(`http://localhost:${port}/`)
    }
  } catch (error) {
    logToFile(`Failed to load URL: ${error.message}`)
    console.error('Failed to load URL:', error)
    
    // Show error in a window
    mainWindow.webContents.loadURL(`data:text/html,<html><body><h1>Failed to load app</h1><pre>${error.message}</pre></body></html>`)
  }  

  // Start automatic update checks
  updateManager.startAutoCheck(30 * 60 * 1000); // 30 minutes
})()


// Handle update-related IPC messages from renderer
ipcMain.handle('check-for-updates', () => {
  if (updateManager) {
    return { success: updateManager.checkForUpdates() }
  }
  return { success: false, message: 'Update manager not initialized' }
})

ipcMain.handle('download-update', () => {
  if (updateManager) {
    return { success: updateManager.downloadUpdate() }
  }
  return { success: false, message: 'Update manager not initialized' }
})

ipcMain.handle('install-update', () => {
  if (updateManager) {
    return { success: updateManager.installUpdate() }
  }
  return { success: false, message: 'Update manager not initialized' }
})

app.on('window-all-closed', () => {
  app.quit()
})

// Open file in default application or reveal in file explorer
ipcMain.handle('open-file', async (_, filePath) => {
  try {    
    // Check if file exists
    const fileExists = fs.existsSync(filePath);
    
    if (!fileExists) {
      return { success: false, error: 'File does not exist' };
    }
    const result = await shell.openPath(filePath);
    
    // Empty string means success according to Electron docs
    if (result === '') {
      return { success: true };
    } else {
      return { success: false, error: result };
    }
  } catch (error) {
    console.error('Failed to open file:', error);
    return { success: false, error: error.message };
  }
})

// Check if file exists
ipcMain.handle('check-file-exists', async (_, filePath) => {
  try {
    const exists = fs.existsSync(filePath);
    return { exists };
  } catch (error) {
    console.error('Error checking file existence:', error);
    return { exists: false, error: error.message };
  }
})

// Rename file
ipcMain.handle('rename-file', async (_, oldPath, newPath) => {
  try {
    await fs.promises.rename(oldPath, newPath)
    return { success: true, newPath }
  } catch (error) {
    console.error('Failed to rename file:', error)
    return { success: false, error: error.message }
  }
})

// Duplicate file handler
ipcMain.handle('duplicate-file', async (_, sourcePath, targetPath) => {
  try {
    await fs.promises.copyFile(sourcePath, targetPath)
    return { success: true, targetPath }
  } catch (error) {
    console.error('Failed to duplicate file:', error)
    return { success: false, error: error.message }
  }
})


// Log message handler
ipcMain.handle('log-message', async (_, message) => {
  logToFile(`[Renderer] ${message}`)
  return { success: true }
})

ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})
