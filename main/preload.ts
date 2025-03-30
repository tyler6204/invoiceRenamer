import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils, app } from 'electron'

// Log preload initialization
console.log('Preload script starting')

const handler = {
  send(channel: string, value: unknown) {
    ipcRenderer.send(channel, value)
  },
  on(channel: string, callback: (...args: unknown[]) => void) {
    const subscription = (_event: IpcRendererEvent, ...args: unknown[]) =>
      callback(...args)
    ipcRenderer.on(channel, subscription)

    return () => {
      ipcRenderer.removeListener(channel, subscription)
    }
  },
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  renameFile: (oldPath: string, newPath: string) => ipcRenderer.invoke('rename-file', oldPath, newPath),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('check-file-exists', filePath),
  duplicateFile: (sourcePath: string, targetPath: string) => ipcRenderer.invoke('duplicate-file', sourcePath, targetPath),
  getPathForFile: (file: File) => {
    if (webUtils && webUtils.getPathForFile) {
      return webUtils.getPathForFile(file);
    }
    return null;
  },
  // Auto-update related functions
  checkForUpdates: () => ipcRenderer.invoke('check-for-updates'),
  downloadUpdate: () => ipcRenderer.invoke('download-update'),
  installUpdate: () => ipcRenderer.invoke('install-update'),
  onUpdateStatus: (callback: (status: any) => void) => {
    const subscription = (_event: IpcRendererEvent, status: any) => callback(status)
    ipcRenderer.on('update-status', subscription)
    return () => {
      ipcRenderer.removeListener('update-status', subscription)
    }
  },
  // Add a logging function that can be called from the renderer
  log: (message: string) => {
    console.log(`[Renderer Log] ${message}`)
    return ipcRenderer.invoke('log-message', message)
  },
}

// Expose protected methods that allow the renderer process to use the ipcRenderer
// without exposing the entire API
contextBridge.exposeInMainWorld('ipc', handler)

console.log('Preload script completed')

export type IpcHandler = typeof handler
