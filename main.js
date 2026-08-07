const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage, shell, globalShortcut } = require('electron');
const path = require('path');
const fs = require('fs');
const { exec, spawn } = require('child_process');
const settings = require('./src/settings');
const catalog = require('./src/catalog');
const downloader = require('./src/downloader');

let mainWindow = null;
let tray = null;
let isQuitting = false;
let screensaverPaused = false;
let pauseResumeTimer = null;
let currentShortcut = null;

function startScreensaverNow() {
  const scr = getScrPath();
  if (!fs.existsSync(scr)) return false;
  spawn(`"${scr}"`, ['/s', '/lock'], { shell: true, stdio: 'ignore' });
  return true;
}

function registerScreensaverShortcut(shortcut) {
  if (currentShortcut) {
    globalShortcut.unregister(currentShortcut);
    currentShortcut = null;
  }
  if (!shortcut) return;
  try {
    const ok = globalShortcut.register(shortcut, startScreensaverNow);
    if (ok) currentShortcut = shortcut;
  } catch (e) { /* invalid shortcut */ }
}

function setScreenSaveActive(val) {
  const key = 'HKEY_CURRENT_USER\\Control Panel\\Desktop';
  exec(`reg add "${key}" /v ScreenSaveActive /t REG_SZ /d "${val}" /f`);
}

function updateTrayMenu() {
  const items = [
    { label: 'Show Aerial Screensaver', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { label: 'Start Screensaver Now', click: startScreensaverNow },
    { type: 'separator' },
  ];
  if (screensaverPaused) {
    items.push({
      label: 'Resume Screensaver',
      click: () => {
        if (pauseResumeTimer) { clearTimeout(pauseResumeTimer); pauseResumeTimer = null; }
        screensaverPaused = false;
        setScreenSaveActive('1');
        tray.setToolTip('Aerial Screensaver');
        updateTrayMenu();
      }
    });
  } else {
    items.push({
      label: 'Pause Screensaver for 1h',
      click: () => {
        screensaverPaused = true;
        setScreenSaveActive('0');
        tray.setToolTip('Aerial Screensaver (paused)');
        pauseResumeTimer = setTimeout(() => {
          screensaverPaused = false;
          pauseResumeTimer = null;
          setScreenSaveActive('1');
          tray.setToolTip('Aerial Screensaver');
          updateTrayMenu();
        }, 3600000);
        updateTrayMenu();
      }
    });
  }
  items.push({ type: 'separator' });
  items.push({ label: 'Quit', click: () => { app.quit(); } });
  tray.setContextMenu(Menu.buildFromTemplate(items));
}

function createTray() {
  try {
    const iconPath = app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, 'build', 'icon.ico');
    const icon = nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 });
    tray = new Tray(icon);
    tray.setToolTip('Aerial Screensaver');
    tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
    updateTrayMenu();
  } catch (e) { /* tray not critical */ }
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1100, height: 750, minWidth: 900, minHeight: 600,
    frame: true,
    icon: app.isPackaged ? path.join(process.resourcesPath, 'icon.ico') : path.join(__dirname, 'build', 'icon.ico'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true, nodeIntegration: false, webSecurity: false,
    },
  });
  mainWindow.loadFile(path.join(__dirname, 'index.html'));
  mainWindow.on('close', (e) => {
    if (!isQuitting) { e.preventDefault(); mainWindow.hide(); }
  });
  mainWindow.on('closed', () => { mainWindow = null; });
}

function getCatalogPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, 'Aerial Catalog.xlsx');
  return path.join(__dirname, '..', 'AppleTV Aerials Screen Saver Links - updated October 2025 (tvOS 26 + macOS 26).xlsx');
}

function getBinPath(name) {
  if (app.isPackaged) return path.join(process.resourcesPath, 'bin', name);
  return path.join(__dirname, 'bin', name);
}

function getMpvPath() { return getBinPath('mpv.exe'); }

function getScrPath() { return getBinPath('Aerial Screensaver.scr'); }

ipcMain.handle('get-catalog', async () => catalog.parse(getCatalogPath()));

ipcMain.handle('get-settings', () => settings.store.store);

ipcMain.handle('set-setting', (event, { key, value }) => {
  settings.set(key, value);
  return true;
});

ipcMain.handle('get-downloads', () => settings.get('downloads', {}));

ipcMain.handle('start-downloads', async (event, { videoIds, quality }) => {
  const cat = await catalog.parse(getCatalogPath());
  const jobs = [];
  for (const videoId of videoIds) {
    const [regionName, videoName] = videoId.split('::');
    const region = cat.regions.find(r => r.name === regionName);
    if (!region) continue;
    const video = region.videos.find(v => v.name === videoName);
    if (!video) continue;
    let useQuality = quality;
    let urlEntry = video.urls.find(u => u.q === useQuality);
    if (!urlEntry || !urlEntry.url) { useQuality = null; urlEntry = null; }
    const fallbackChain = [...new Set([quality, ...QUALITY_FALLBACK])];
    for (const q of fallbackChain) {
      const e = video.urls.find(u => u.q === q);
      if (!e) continue;
      const { alive } = await downloader.checkUrl(e.url);
      if (alive) { useQuality = q; urlEntry = e; break; }
    }
    if (!urlEntry || !useQuality) continue;
    jobs.push({
      id: videoId, name: `${regionName} - ${videoName}`,
      url: urlEntry.url, requestQuality: quality, actualQuality: useQuality,
      dest: path.join(app.getPath('userData'), 'videos', `${videoId.replace('::', '_')}_${useQuality.replace(/\s+/g, '_')}.mov`),
    });
  }
  const results = await downloader.startBatch(jobs, mainWindow);
  const downloads = settings.get('downloads', {});
  for (const r of results) {
    if (r.status === 'completed' || r.status === 'exists') {
      const job = jobs.find(j => j.id === r.id);
      const q = job ? job.actualQuality : quality;
      const reqQ = job ? job.requestQuality : quality;
      downloads[r.id] = { path: r.path, quality: q, requestQuality: reqQ, name: r.id, completedAt: Date.now() };
    }
  }
  settings.set('downloads', downloads);
  return results;
});

ipcMain.handle('cancel-downloads', () => { downloader.cancelAll(); return true; });

ipcMain.handle('delete-video', (event, videoId) => {
  const downloads = settings.get('downloads', {});
  const info = downloads[videoId];
  if (info && info.path) { try { if (fs.existsSync(info.path)) fs.unlinkSync(info.path); } catch (e) { } }
  delete downloads[videoId];
  settings.set('downloads', downloads);
  return true;
});

ipcMain.handle('get-video-info', (event, videoId) => settings.get('downloads', {})[videoId] || null);

const QUALITY_FALLBACK = ['4K HDR', '4K 240fps', '4K', '1080p HDR', '1080p H264', '1080p'];

ipcMain.handle('check-url', async (event, url) => {
  try {
    const mod = url.startsWith('https') ? require('https') : require('http');
    return await new Promise((resolve) => {
      const req = mod.request(url, {
        method: 'GET',
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        rejectUnauthorized: false,
        timeout: 15000
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.destroy();
          resolve({ dead: false, status: res.statusCode }); return;
        }
        res.destroy();
        resolve({ dead: res.statusCode !== 200, status: res.statusCode });
      });
      req.on('error', () => resolve({ dead: true, status: 0 }));
      req.on('timeout', () => { req.destroy(); resolve({ dead: true, status: 0 }); });
      req.end();
    });
  } catch (e) { return { dead: true, status: 0 }; }
});

ipcMain.handle('scan-existing-videos', async () => {
  const videoDir = path.join(app.getPath('userData'), 'videos');
  if (!fs.existsSync(videoDir)) return {};
  const cat = await catalog.parse(getCatalogPath());
  const downloads = settings.get('downloads', {});
  const qualities = ['4K HDR', '4K 240fps', '4K', '1080p HDR', '1080p H264', '1080p'];
  const existingFiles = new Set(fs.readdirSync(videoDir));
  let changed = false;
  for (const region of cat.regions) {
    for (const video of region.videos) {
      for (const q of qualities) {
        const filename = `${video.id.replace('::', '_')}_${q.replace(/\s+/g, '_')}.mov`;
        if (existingFiles.has(filename)) {
          if (!downloads[video.id]) {
            downloads[video.id] = { path: path.join(videoDir, filename), quality: q, requestQuality: q, name: video.id, completedAt: Date.now() };
            changed = true;
          }
          break;
        }
      }
    }
  }
  if (changed) settings.set('downloads', downloads);
  return downloads;
});

ipcMain.handle('get-storage-info', () => {
  const videoDir = path.join(app.getPath('userData'), 'videos');
  let totalSize = 0; let count = 0;
  if (fs.existsSync(videoDir)) {
    for (const file of fs.readdirSync(videoDir)) {
      try {
        const stat = fs.statSync(path.join(videoDir, file));
        if (stat.isFile()) { totalSize += stat.size; count++; }
      } catch (e) { }
    }
  }
  return { totalSize, count };
});

ipcMain.handle('delete-all-videos', () => {
  const videoDir = path.join(app.getPath('userData'), 'videos');
  if (fs.existsSync(videoDir)) {
    for (const file of fs.readdirSync(videoDir))
      try { fs.unlinkSync(path.join(videoDir, file)); } catch (e) { }
  }
  settings.set('downloads', {});
  return true;
});

ipcMain.handle('get-play-counts', () => settings.get('playCounts', {}));

ipcMain.handle('reset-play-counts', () => {
  settings.set('playCounts', {});
  return true;
});

ipcMain.handle('get-app-path', () => app.getPath('userData'));

ipcMain.handle('open-downloads-folder', () => {
  const d = path.join(app.getPath('userData'), 'videos');
  if (!fs.existsSync(d)) fs.mkdirSync(d, { recursive: true });
  exec(`explorer "${d}"`);
  return true;
});

ipcMain.handle('open-external', (event, url) => { shell.openExternal(url); return true; });

ipcMain.handle('uninstall-screensaver', () => {
  try {
    const key = 'HKEY_CURRENT_USER\\Control Panel\\Desktop';
    exec(`reg delete "${key}" /v SCRNSAVE.EXE /f`);
    exec(`reg add "${key}" /v ScreenSaveActive /t REG_SZ /d "0" /f`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('install-screensaver', () => {
  try {
    const scr = getScrPath();
    if (!fs.existsSync(scr)) return { ok: false, error: 'Screensaver file not found' };
    const key = 'HKEY_CURRENT_USER\\Control Panel\\Desktop';
    exec(`reg add "${key}" /v SCRNSAVE.EXE /t REG_SZ /d "${scr}" /f`);
    exec(`reg add "${key}" /v ScreenSaveActive /t REG_SZ /d "1" /f`);
    exec(`reg add "${key}" /v ScreenSaveTimeout /t REG_SZ /d "${settings.get('timeoutMinutes', 5) * 60}" /f`);
    return { ok: true };
  } catch (e) { return { ok: false, error: e.message }; }
});

ipcMain.handle('open-screensaver-settings', () => {
  exec('control desk.cpl,,@screensaver');
  return true;
});

ipcMain.handle('get-scr-path', () => getScrPath());

ipcMain.handle('start-screensaver-now', () => startScreensaverNow());

ipcMain.handle('register-shortcut', (event, shortcut) => {
  registerScreensaverShortcut(shortcut);
  settings.set('screensaverShortcut', shortcut);
  return true;
});

ipcMain.handle('play-mpv-test', () => {
  const downloads = settings.get('downloads', {});
  const paths = Object.values(downloads).map(d => d.path).filter(p => p && fs.existsSync(p));
  if (paths.length === 0) return false;
  const mpvExe = getMpvPath();
  if (!fs.existsSync(mpvExe)) return false;
  const fillScreen = settings.get('fillScreen', false);
  const disableHdr = settings.get('disableHdr', false);
  const args = [
    '--fullscreen', '--loop-playlist=inf', '--no-osc', '--no-osd-bar', '--really-quiet', '--hwdec=auto',
    disableHdr ? '--vo=gpu' : '--vo=gpu-next',
    ...(disableHdr ? [] : ['--target-colorspace-hint=yes', '--hdr-compute-peak=yes', '--target-peak=auto']),
    '--tone-mapping=' + settings.get('toneMapping', 'auto'),
    fillScreen ? '--panscan=1.0' : '--keepaspect=yes',
    ...paths,
  ];
  spawn(mpvExe, args, { stdio: 'ignore' });
  return true;
});

app.whenReady().then(() => {
  const cfgVer = settings.get('configVersion', 0);
  if (cfgVer < 1) {
    settings.set('checkFullscreen', false);
    settings.set('lockOnActivate', false);
    settings.set('configVersion', 1);
  }
  createMainWindow();
  createTray();
  registerScreensaverShortcut(settings.get('screensaverShortcut', ''));
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
    else { mainWindow.show(); mainWindow.focus(); }
  });
});

app.on('window-all-closed', () => { });

app.on('will-quit', () => { globalShortcut.unregisterAll(); });

app.on('before-quit', () => { isQuitting = true; });
