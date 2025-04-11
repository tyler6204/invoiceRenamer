import path from 'path'
import { app, ipcMain, shell, BrowserWindow } from 'electron'
import serve from 'electron-serve'
import { createWindow, UpdateManager } from './helpers'
import fs from 'fs' // Use fs/promises for async

// --- Logging Setup (Keep your existing logging) ---
const userDataPath = app.getPath('userData')
const logDir = path.join(userDataPath, 'logs')
const logFilePath = path.join(logDir, 'app.log')

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
// Override console logs (Keep your existing overrides)
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
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error)
  logToFile(`Uncaught Exception: ${error.stack || error}`)
})
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason)
  logToFile(`Unhandled Rejection: ${reason}`)
})
// --- End Logging Setup ---


// Check production status (Keep your existing logic)
const isPackaged = app.isPackaged
const isProd = process.env.NODE_ENV === 'production' || isPackaged
let loadURL: serve.loadURL | undefined = undefined; // Define loadURL variable
if (isProd) {
  loadURL = serve({ directory: 'app' })
} else {
  app.setPath('userData', `${app.getPath('userData')} (development)`)
}

let mainWindow: BrowserWindow | null = null
let updateManager: UpdateManager | null = null

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
      // sandbox: false // Consider if needed, but be aware of security implications
    },
  })

  updateManager = new UpdateManager(mainWindow, isProd)

  try {
    if (isProd && loadURL) { // Check if loadURL is defined
      logToFile('Loading production URL')
      await loadURL(mainWindow); // Use loadURL function correctly
    } else {
      const port = process.argv[2] || '8888'
      logToFile(`Loading development URL: http://localhost:${port}/`)
      await mainWindow.loadURL(`http://localhost:${port}/`)
      // mainWindow.webContents.openDevTools(); // Optionally open dev tools
    }
  } catch (error: any) {
    logToFile(`Failed to load URL: ${error.message}`)
    console.error('Failed to load URL:', error)
    mainWindow.webContents.loadURL(`data:text/html,<html><body><h1>Failed to load app</h1><pre>${error.message}</pre></body></html>`)
  }

  updateManager.startAutoCheck(30 * 60 * 1000); // 30 minutes
})()

app.on('window-all-closed', () => {
  app.quit()
})

// --- IPC Handlers ---

// Log message handler (Keep)
ipcMain.handle('log-message', async (_, message) => {
  logToFile(`[Renderer] ${message}`)
  return { success: true }
})

// Open file handler (Keep)
ipcMain.handle('open-file', async (_, filePath) => {
  logToFile(`[open-file] Request for path: "${filePath}"`);
  try {
     if (!filePath || typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
        logToFile(`[open-file] Failed: Path is not absolute or invalid: "${filePath}"`);
        return { success: false, error: 'Cannot open file: Path must be absolute and valid.' };
     }
    // Check existence before opening
    await fs.promises.access(filePath, fs.constants.F_OK);
    logToFile(`[open-file] Path exists, attempting to open: "${filePath}"`);
    const result = await shell.openPath(filePath);
    if (result === '') {
      logToFile(`[open-file] Successfully opened: "${filePath}"`);
      return { success: true };
    } else {
      logToFile(`[open-file] Failed to open: "${filePath}". Result: ${result}`);
      return { success: false, error: result };
    }
  } catch (error: any) {
    // Handle file not found specifically
    if (error.code === 'ENOENT') {
        logToFile(`[open-file] Failed: File does not exist at "${filePath}"`);
        return { success: false, error: 'File does not exist.' };
    }
    console.error('[open-file] Error:', error);
    logToFile(`[open-file] Error opening file "${filePath}": ${error.message}`);
    return { success: false, error: error.message };
  }
})

// Check file exists handler (Keep, ensure it's robust)
ipcMain.handle('check-file-exists', async (_, filePath) => {
  logToFile(`[check-file-exists] Request for path: "${filePath}"`);
  try {
    if (!filePath || typeof filePath !== 'string' || !path.isAbsolute(filePath)) {
       logToFile(`[check-file-exists] Failed: Path is not absolute or invalid: "${filePath}"`);
       return { exists: false, error: 'Path must be absolute for existence check' };
    }
    await fs.promises.access(filePath, fs.constants.F_OK);
    logToFile(`[check-file-exists] Success: "${filePath}" exists.`);
    return { exists: true };
  } catch (error: any) {
    if (error.code === 'ENOENT') {
      logToFile(`[check-file-exists] Success: "${filePath}" does not exist.`);
      return { exists: false };
    }
    console.error('[check-file-exists] Error checking file existence:', error);
    logToFile(`[check-file-exists] Error checking file existence for "${filePath}": ${error.message}`);
    return { exists: false, error: error.message };
  }
});

// *** NEW: Resolve and Rename Handler ***
ipcMain.handle('resolve-and-rename', async (_, originalFilePath: string, desiredNewBaseName: string, fileExtension: string) => {
  logToFile(`[resolve-and-rename] Request: original="${originalFilePath}", desiredBase="${desiredNewBaseName}", ext="${fileExtension}"`);
  try {
    // --- Validation ---
    if (!originalFilePath || typeof originalFilePath !== 'string' || !path.isAbsolute(originalFilePath)) {
      throw new Error(`Invalid originalFilePath: Must be an absolute path. Received: "${originalFilePath}"`);
    }
    if (!desiredNewBaseName || typeof desiredNewBaseName !== 'string') {
       throw new Error(`Invalid desiredNewBaseName. Received: "${desiredNewBaseName}"`);
    }
     if (typeof fileExtension !== 'string') { // Allow empty extension, but must be string
       throw new Error(`Invalid fileExtension. Received: "${fileExtension}"`);
    }
    // Basic check on extension format
    if (fileExtension.length > 0 && !fileExtension.startsWith('.')) {
        logToFile(`[resolve-and-rename] Warning: fileExtension "${fileExtension}" does not start with '.', adding it.`);
        fileExtension = '.' + fileExtension;
    }

    // --- Path Calculation (using main process 'path') ---
    const originalDir = path.dirname(originalFilePath);
    let counter = 0; // Start counter at 0 for the first attempt
    let newFileName = '';
    let fullNewPath = '';
    let exists = true; // Assume exists initially to enter the loop

    while (exists) {
        if (counter === 0) {
            newFileName = `${desiredNewBaseName}${fileExtension}`;
        } else {
            newFileName = `${desiredNewBaseName} (${counter})${fileExtension}`;
        }
        fullNewPath = path.join(originalDir, newFileName); // Use native path.join

        logToFile(`[resolve-and-rename] Checking path: "${fullNewPath}"`);
        try {
            await fs.promises.access(fullNewPath, fs.constants.F_OK);
            logToFile(`[resolve-and-rename] Path exists.`);
            exists = true; // Explicitly set exists if access succeeds
        } catch (error: any) {
            if (error.code === 'ENOENT') {
                logToFile(`[resolve-and-rename] Path does not exist. Final path determined.`);
                exists = false; // Exit loop, path is free
            } else {
                // Rethrow other errors (e.g., permissions)
                throw new Error(`Error checking existence for "${fullNewPath}": ${error.message}`);
            }
        }

        counter++;
        if (counter > 100) { // Safety break
            throw new Error('Too many conflicts detected while resolving rename path.');
        }
    } // End while loop

    // --- Perform Rename ---
    logToFile(`[resolve-and-rename] Final path determined: "${fullNewPath}"`);
    // *** ENSURE THIS LOG IS PRESENT ***
    logToFile(`[resolve-and-rename] CONFIRMING rename call: fs.rename("${originalFilePath}", "${fullNewPath}")`);
    await fs.promises.rename(originalFilePath, fullNewPath);
    logToFile(`[resolve-and-rename] Rename successful.`);
    return { success: true, newPath: fullNewPath };

  } catch (error: any) {
    console.error('[resolve-and-rename] Error:', error);
    logToFile(`[resolve-and-rename] Failed. Error: ${error.message}. Original: "${originalFilePath}", Target Attempt: "${fullNewPath}"`); // Log target attempt too
    return { success: false, error: error.message, originalPath: originalFilePath, attemptedPath: fullNewPath }; // Return attemptedPath
  }
});


// *** NEW: Resolve and Duplicate Handler ***
ipcMain.handle('resolve-and-duplicate', async (_, sourcePath: string, desiredTargetPath: string) => {
  logToFile(`[resolve-and-duplicate] Request: source="${sourcePath}", desiredTarget="${desiredTargetPath}"`);
   try {
    // --- Validation ---
    if (!sourcePath || typeof sourcePath !== 'string' || !path.isAbsolute(sourcePath)) {
      throw new Error(`Invalid sourcePath: Must be an absolute path. Received: "${sourcePath}"`);
    }
     if (!desiredTargetPath || typeof desiredTargetPath !== 'string' || !path.isAbsolute(desiredTargetPath)) {
      throw new Error(`Invalid desiredTargetPath: Must be an absolute path. Received: "${desiredTargetPath}"`);
    }

    // --- Check Source Existence ---
    try {
        await fs.promises.access(sourcePath, fs.constants.R_OK); // Check read access
        logToFile(`[resolve-and-duplicate] Source path exists and is readable.`);
    } catch(err: any) {
        if (err.code === 'ENOENT') {
            throw new Error(`Source file does not exist: "${sourcePath}"`);
        } else {
             throw new Error(`Cannot access source file "${sourcePath}": ${err.message}`);
        }
    }

    // --- Check Target Existence (Optional - copyFile can overwrite or error) ---
    // If you want to prevent overwriting explicitly:
    try {
        await fs.promises.access(desiredTargetPath, fs.constants.F_OK);
        // If access succeeds, the file exists - throw an error or handle conflict
        logToFile(`[resolve-and-duplicate] Target path "${desiredTargetPath}" already exists. Aborting duplicate.`);
        throw new Error(`Target file already exists: "${desiredTargetPath}"`);
        // Or implement conflict resolution like in rename if needed
    } catch (error: any) {
        if (error.code === 'ENOENT') {
            // File doesn't exist, which is good, proceed with copy
            logToFile(`[resolve-and-duplicate] Target path does not exist. Proceeding with copy.`);
        } else {
            // Other error checking target
            throw new Error(`Error checking target path "${desiredTargetPath}": ${error.message}`);
        }
    }

    // --- Perform Duplicate (Copy) ---
    logToFile(`[resolve-and-duplicate] Attempting copy: "${sourcePath}" -> "${desiredTargetPath}"`);
    // Use COPYFILE_EXCL to prevent overwriting existing files (will throw error if target exists)
    await fs.promises.copyFile(sourcePath, desiredTargetPath, fs.constants.COPYFILE_EXCL);
    logToFile(`[resolve-and-duplicate] Copy successful.`);
    return { success: true, newPath: desiredTargetPath }; // Return the target path

  } catch (error: any) {
    console.error('[resolve-and-duplicate] Error:', error);
    logToFile(`[resolve-and-duplicate] Failed. Error: ${error.message}. Source: "${sourcePath}", Target: "${desiredTargetPath}"`);
    return { success: false, error: error.message, sourcePath: sourcePath, targetPath: desiredTargetPath };
  }
});


// --- Update Handlers (Keep existing) ---
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

// Keep the message handler if needed for other things
ipcMain.on('message', async (event, arg) => {
  event.reply('message', `${arg} World!`)
})