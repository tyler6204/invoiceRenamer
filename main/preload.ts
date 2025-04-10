import { contextBridge, ipcRenderer, IpcRendererEvent, webUtils } from 'electron' // Removed 'app' import as it's not typically used directly in preload

// Log preload initialization
console.log('Preload script starting')

const handler = {
  // --- Basic Send/On (Keep) ---
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

  // --- File Path Getter (Keep) ---
  getPathForFile: (file: File): string | null => { // Added return type
    // Need to check if webUtils and getPathForFile exist due to potential sandbox restrictions
    // In newer Electron versions with sandbox enabled by default, this might not work reliably.
    // Consider alternative methods if sandboxed.
    if (typeof webUtils?.getPathForFile === 'function') {
        try {
            return webUtils.getPathForFile(file);
        } catch (error) {
            console.error("Error calling webUtils.getPathForFile:", error);
            return null; // Return null on error
        }
    } else {
        console.warn("webUtils.getPathForFile is not available. Ensure sandbox is configured appropriately if needed.");
        // Fallback or error handling might be needed depending on sandbox settings
        // For non-sandboxed renderers, accessing file.path *might* work but is deprecated/discouraged.
        // return (file as any).path || null; // Use with caution, likely won't work in sandboxed environments
         return null;
    }
  },

  // --- Core File Operations (Use NEW handlers) ---
  openFile: (filePath: string) => ipcRenderer.invoke('open-file', filePath),
  checkFileExists: (filePath: string) => ipcRenderer.invoke('check-file-exists', filePath),
  resolveAndRename: (originalFilePath: string, desiredNewBaseName: string, fileExtension: string) =>
    ipcRenderer.invoke('resolve-and-rename', originalFilePath, desiredNewBaseName, fileExtension),
  resolveAndDuplicate: (sourcePath: string, desiredTargetPath: string) =>
    ipcRenderer.invoke('resolve-and-duplicate', sourcePath, desiredTargetPath),

  // --- Auto-update related functions (Keep) ---
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

  // --- Logging (Keep) ---
  log: (message: string) => {
    console.log(`[Renderer Log] ${message}`) // Log locally too for immediate feedback
    // Send to main process for persistent logging
    return ipcRenderer.invoke('log-message', message)
  },
}

// Expose protected methods
contextBridge.exposeInMainWorld('ipc', handler)

console.log('Preload script completed')

export type IpcHandler = typeof handler