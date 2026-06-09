const { default: Store } = require('electron-store');

const store = new Store({
  name: 'aerial-screensaver-config',
  defaults: {
    timeoutMinutes: 5,
    lockOnActivate: false,
    quality: '4K HDR',
    selectedVideos: [],
    downloads: {},
    fillScreen: false,
    disableHdr: false,
    checkFullscreen: false,
    toneMapping: 'auto',
    windowBounds: { width: 1100, height: 750 },
    playCounts: {},
    screensaverShortcut: '',
  },
});

function get(key, defaultValue) {
  return store.get(key, defaultValue);
}

function set(key, value) {
  store.set(key, value);
}

module.exports = { store, get, set };
