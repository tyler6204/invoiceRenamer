import {
  screen,
  BrowserWindow,
  BrowserWindowConstructorOptions,
  Rectangle,
} from 'electron'
import Store from 'electron-store'

export const createWindow = (
  windowName: string,
  options: BrowserWindowConstructorOptions
): BrowserWindow => {
  const key = 'window-state'
  const name = `window-state-${windowName}`
  const store = new Store<Rectangle>({ name })

  const defaultSize = {
    width: options.width ?? 800,
    height: options.height ?? 600,
  }

  const restore = () => store.get(key, defaultSize)

  const resetToDefaults = () => {
    const bounds = screen.getPrimaryDisplay().bounds
    return {
      ...defaultSize,
      x: (bounds.width - defaultSize.width) / 2,
      y: (bounds.height - defaultSize.height) / 2,
    }
  }

  const windowWithinBounds = (winState, bounds) => {
    return (
      winState.x >= bounds.x &&
      winState.y >= bounds.y &&
      winState.x + winState.width <= bounds.x + bounds.width &&
      winState.y + winState.height <= bounds.y + bounds.height
    )
  }

  const ensureVisibleOnSomeDisplay = (winState) => {
    const visible = screen.getAllDisplays().some((display) =>
      windowWithinBounds(winState, display.bounds)
    )
    return visible ? winState : resetToDefaults()
  }

  let state = ensureVisibleOnSomeDisplay(restore())

  const win = new BrowserWindow({
    ...state,
    ...options,
    minWidth: options.minWidth ?? 600,
    minHeight: options.minHeight ?? 600,  
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      ...options.webPreferences,
    },
  })

  const getCurrentPosition = () => {
    const position = win.getPosition()
    const size = win.getSize()
    return {
      x: position[0],
      y: position[1],
      width: size[0],
      height: size[1],
    }
  }

  const saveState = () => {
    if (!win.isMinimized() && !win.isMaximized()) {
      store.set(key, getCurrentPosition())
    }
  }

  win.on('close', saveState)

  return win
}

