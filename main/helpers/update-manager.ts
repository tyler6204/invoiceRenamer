import { autoUpdater } from 'electron-updater'
import { BrowserWindow } from 'electron'
import { GH_TOKEN } from '../../renderer/lib/apiKeys'

// Type for update event callbacks
type UpdateStatusCallback = (status: string, data?: any) => void

export class UpdateManager {
  private mainWindow: BrowserWindow
  private statusCallback: UpdateStatusCallback
  private autoCheckInterval: NodeJS.Timeout | null = null
  private isProd: boolean

  constructor(mainWindow: BrowserWindow, isProd: boolean) {
    this.mainWindow = mainWindow
    this.isProd = isProd
    
    // Don't auto download - we'll let users decide when to update
    autoUpdater.autoDownload = false
    
    // Configure GitHub token for private repository access
      autoUpdater.setFeedURL({
        provider: 'github',
        owner: 'tyler6204',
        repo: 'invoiceRenamer',
        private: true,
        token: GH_TOKEN
      });
    
    this.setupEventHandlers()
  }

  private setupEventHandlers() {
    // Handle events
    autoUpdater.on('checking-for-update', () => {
      this.sendStatus('checking-for-update')
    })
    
    autoUpdater.on('update-available', (info) => {
      this.sendStatus('update-available', info)
    })
    
    autoUpdater.on('update-not-available', () => {
      this.sendStatus('update-not-available')
    })
    
    autoUpdater.on('error', (err) => {
      this.sendStatus('update-error', err.toString())
    })
    
    autoUpdater.on('download-progress', (progressObj) => {
      this.sendStatus('download-progress', progressObj)
    })
    
    autoUpdater.on('update-downloaded', (info) => {
      this.sendStatus('update-downloaded', info)
    })
  }

  // Set up a callback function to receive update status
  setStatusCallback(callback: UpdateStatusCallback) {
    this.statusCallback = callback
  }

  // Send status to both the callback and renderer
  private sendStatus(status: string, data: any = null) {
    if (this.statusCallback) {
      this.statusCallback(status, data)
    }
    
    if (this.mainWindow && !this.mainWindow.isDestroyed()) {
      this.mainWindow.webContents.send('update-status', { status, data })
    }
  }

  // Check for updates
  checkForUpdates() {
    if (!this.isProd) {
      this.sendStatus('update-not-available', { message: 'Updates only available in production build' })
      
      return false
    }
    
    autoUpdater.checkForUpdates()
    return true
  }

  // Download update
  downloadUpdate() {
    if (this.isProd) {
      autoUpdater.downloadUpdate()
      return true
    }
    return false
  }

  // Install update
  installUpdate() {
    if (this.isProd) {
      autoUpdater.quitAndInstall()
      return true
    }
    return false
  }

  // Start automatic update checks
  startAutoCheck(intervalMs = 30 * 60 * 1000) {
    if (!this.isProd) return
    
    // Clear any existing interval
    this.stopAutoCheck()
    
    // Check initially
    this.checkForUpdates()
    
    // Then check periodically
    this.autoCheckInterval = setInterval(() => {
      this.checkForUpdates()
    }, intervalMs)
  }

  // Stop automatic update checks
  stopAutoCheck() {
    if (this.autoCheckInterval) {
      clearInterval(this.autoCheckInterval)
      this.autoCheckInterval = null
    }
  }
} 