import { app, BrowserWindow, desktopCapturer, ipcMain } from 'electron'
import { fileURLToPath } from 'node:url'
import path from 'node:path'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

process.env.APP_ROOT = path.join(__dirname, '..')

export const VITE_DEV_SERVER_URL = process.env['VITE_DEV_SERVER_URL']
export const MAIN_DIST = path.join(process.env.APP_ROOT, 'dist-electron')
export const RENDERER_DIST = path.join(process.env.APP_ROOT, 'dist')

process.env.VITE_PUBLIC = VITE_DEV_SERVER_URL ? path.join(process.env.APP_ROOT, 'public') : RENDERER_DIST

let win: BrowserWindow | null = null
let studio: BrowserWindow | null = null
let pendingMediaSources: { screen: string; id: string; audio: string; preset: 'HD' | 'SD'; plan: 'PRO' | 'FREE' } | null = null

function createWindow() {
  win = new BrowserWindow({
    width: 400,
    height: 300,
    minHeight: 70,
    maxHeight: 400,
    minWidth: 300,
    maxWidth: 400,
    transparent: true,
    frame: false,
    alwaysOnTop: true,
    focusable: false,
    icon: path.join(process.env.VITE_PUBLIC, "clipsphere-mark.svg"),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      preload: path.join(__dirname, "preload.mjs"),
    },
  });

  studio = new BrowserWindow({
    width: 400,
    height: 300,
    minHeight: 70,
    maxHeight: 400,
    minWidth: 300,
    maxWidth: 400,
    frame: false,
    transparent: true,
    alwaysOnTop: true,
    focusable: false,
    icon: path.join(process.env.VITE_PUBLIC, 'clipsphere-mark.svg'),
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      devTools: true,
      preload: path.join(__dirname, 'preload.mjs'),
    },
  });

  win.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  win.setAlwaysOnTop(true, 'screen-saver', 1);
  studio.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  studio.setAlwaysOnTop(true, 'screen-saver', 1);
  // The recording tray becomes visible once the signed-in app supplies settings.
  studio.hide()

  win.webContents.on('did-finish-load', () => {
    console.log("✅ Main window loaded");
    win?.webContents.send('main-process-message', new Date().toLocaleString());
  });

  studio.webContents.on("did-finish-load", () => {
    console.log("✅ studio.html loaded successfully!");
    studio?.webContents.send("main-process-message", new Date().toLocaleString());
    if (pendingMediaSources) {
      studio?.webContents.send('profile-recieved', pendingMediaSources)
      studio?.showInactive()
    }
  });

  // Add error event listeners for debugging
  studio.webContents.on('did-fail-load', (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
    console.error("❌ Studio window failed to load:");
    console.error(`Error Code: ${errorCode}`);
    console.error(`Error Description: ${errorDescription}`);
    console.error(`URL: ${validatedURL}`);
    console.error(`Is Main Frame: ${isMainFrame}`);
  });

  if (VITE_DEV_SERVER_URL) {
    console.log("✅ VITE_DEV_SERVER_URL detected:", VITE_DEV_SERVER_URL);
  
    win.loadURL(VITE_DEV_SERVER_URL);
    
    // Use full URL with protocol
    const studioUrl = new URL('studio.html', VITE_DEV_SERVER_URL).toString();
    console.log("🔍 Attempting to load studio URL:", studioUrl);
    studio.loadURL(studioUrl);
  
  } else {
    console.log("⚠️ VITE_DEV_SERVER_URL NOT detected, loading from dist.");
  
    win.loadFile(path.join(RENDERER_DIST, 'index.html'));
    studio.loadFile(path.join(RENDERER_DIST, 'studio.html'));
  }
}

// Quit when all windows are closed, except on macOS.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
    studio = null;
  }
});

ipcMain.on('closeApp', () => {
  if (process.platform !== 'darwin') {
    app.quit();
    win = null;
    studio = null;
  }
});

// Handle media sources
ipcMain.handle('getSources', async () => {
  const data = await desktopCapturer.getSources({
    thumbnailSize: { height: 100, width: 150 },
    fetchWindowIcons: true,
    types: ['window', 'screen'],
  });
  console.log("Available sources:", data);
  return data;
});

// ✅ Fix: Ensure `studio` is assigned and used correctly
ipcMain.on('media-sources', (_event, payload) => {
  if (!payload?.screen || !payload?.id || !payload?.preset || !payload?.plan || typeof payload.audio !== 'string') return
  pendingMediaSources = payload
  if (studio && !studio.isDestroyed()) {
    if (studio.webContents.isLoading()) return
    studio.webContents.send('profile-recieved', payload)
    studio.showInactive()
  }
});

// Resize Studio Window
ipcMain.on('resize-studio', (_event, payload) => {
  console.log("Resize event received:", payload);
  if (studio) {
    studio.setSize(400, payload.shrink ? 100 : 250);
  }
});

// Hide Plugin
ipcMain.on('hide-plugin', (_event, payload) => {
  console.log("Hide plugin event received", payload);
  win?.webContents.send('hide-plugin', payload);
});

// Re-create window when the app is activated (for macOS)
app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow();
  }
});

app.whenReady().then(createWindow);
