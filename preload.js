const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('api', {
  getCatalog: () => ipcRenderer.invoke('get-catalog'),
  getSettings: () => ipcRenderer.invoke('get-settings'),
  setSetting: (key, value) => ipcRenderer.invoke('set-setting', { key, value }),
  getDownloads: () => ipcRenderer.invoke('get-downloads'),
  startDownloads: (videoIds, quality) => ipcRenderer.invoke('start-downloads', { videoIds, quality }),
  cancelDownloads: () => ipcRenderer.invoke('cancel-downloads'),
  deleteVideo: (videoId) => ipcRenderer.invoke('delete-video', videoId),
  getVideoInfo: (videoId) => ipcRenderer.invoke('get-video-info', videoId),
  getStorageInfo: () => ipcRenderer.invoke('get-storage-info'),
  deleteAllVideos: () => ipcRenderer.invoke('delete-all-videos'),
  getAppPath: () => ipcRenderer.invoke('get-app-path'),
  onDownloadProgress: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-progress', handler);
    return () => ipcRenderer.removeListener('download-progress', handler);
  },
  onDownloadComplete: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-complete', handler);
    return () => ipcRenderer.removeListener('download-complete', handler);
  },
  onDownloadError: (callback) => {
    const handler = (event, data) => callback(data);
    ipcRenderer.on('download-error', handler);
    return () => ipcRenderer.removeListener('download-error', handler);
  },
  checkUrl: (url) => ipcRenderer.invoke('check-url', url),
  openDownloadsFolder: () => ipcRenderer.invoke('open-downloads-folder'),
  openExternal: (url) => ipcRenderer.invoke('open-external', url),
  installScreensaver: () => ipcRenderer.invoke('install-screensaver'),
  uninstallScreensaver: () => ipcRenderer.invoke('uninstall-screensaver'),
  openScreensaverSettings: () => ipcRenderer.invoke('open-screensaver-settings'),
  getScrPath: () => ipcRenderer.invoke('get-scr-path'),
  getPlayCounts: () => ipcRenderer.invoke('get-play-counts'),
  resetPlayCounts: () => ipcRenderer.invoke('reset-play-counts'),
  playMpvTest: () => ipcRenderer.invoke('play-mpv-test'),
});
