const { createElement: h, useState, useEffect, useCallback } = React;

const deadLinkCache = {};

function checkUrl(url) {
  if (deadLinkCache[url] !== undefined)
    return Promise.resolve(deadLinkCache[url]);
  return window.api.checkUrl(url).then(r => {
    deadLinkCache[url] = r;
    return r;
  }).catch(() => {
    deadLinkCache[url] = { dead: true, status: 0 };
    return deadLinkCache[url];
  });
}

function App() {
  const [catalog, setCatalog] = useState(null);
  const [settings, setSettings] = useState(null);
  const [downloads, setDownloads] = useState({});
  const [activeTab, setActiveTab] = useState('catalog');
  const [selectedVideos, setSelectedVideos] = useState([]);
  const [quality, setQuality] = useState('4K HDR');
  const [previewQuality, setPreviewQuality] = useState('1080p H264');
  const [loadError, setLoadError] = useState(null);
  const [deadLinkVideos, setDeadLinkVideos] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const cat = await window.api.getCatalog();
        const s = await window.api.getSettings();
        setCatalog(cat);
        setSettings(s);
        setSelectedVideos(s.selectedVideos || []);
        setQuality(s.quality || '4K HDR');
        setPreviewQuality(s.previewQuality || '1080p H264');
        const dls = await window.api.getDownloads();
        setDownloads(dls || {});
        const scanned = await window.api.scanExistingVideos();
        setDownloads(scanned || {});
      } catch (e) {
        console.error('Failed to load:', e);
        setLoadError('Failed to load catalog: ' + e.message);
      }
    })();
  }, []);

  useEffect(() => { window.api.setSetting('selectedVideos', selectedVideos); }, [selectedVideos]);
  useEffect(() => { window.api.setSetting('quality', quality); }, [quality]);
  useEffect(() => { window.api.setSetting('previewQuality', previewQuality); }, [previewQuality]);

  useEffect(() => {
    const interval = setInterval(async () => {
      const dls = await window.api.getDownloads();
      setDownloads(dls || {});
    }, 3000);
    return () => clearInterval(interval);
  }, []);

  return h('div', { className: 'app' },
    h('header', { className: 'app-header' },
      h('h1', null, 'Apple TV Aerials Screensaver'),
      h('nav', { className: 'tabs' },
        h('button', { className: activeTab === 'catalog' ? 'active' : '', onClick: () => setActiveTab('catalog') }, 'Videos'),
        h('button', { className: activeTab === 'settings' ? 'active' : '', onClick: () => setActiveTab('settings') }, 'Settings'),
        h('button', { className: activeTab === 'downloads' ? 'active' : '', onClick: () => setActiveTab('downloads') }, 'Downloads'),
      )
    ),
    h('main', { className: 'app-main' },
      loadError && h('div', { className: 'error-banner' }, loadError),
      activeTab === 'catalog' && catalog && h(CatalogView, {
        catalog, downloadQuality: quality, previewQuality, setPreviewQuality,
        selectedVideos, setSelectedVideos,
        downloads, setDownloads, setActiveTab,
        deadLinkVideos, setDeadLinkVideos
      }),
      activeTab === 'settings' && settings && h(SettingsPanel, {
        settings, onUpdate: async (key, value) => {
          await window.api.setSetting(key, value);
          setSettings(await window.api.getSettings());
          if (key === 'quality') setQuality(value);
        }
      }),
      activeTab === 'downloads' && h(DownloadPanel, {
        downloads, onRefresh: async () => {
          const scanned = await window.api.scanExistingVideos();
          setDownloads(scanned || {});
        }
      }),
    )
  );
}

function getBestPreviewUrl(video, quality) {
  const prefQualities = ['1080p H264', '1080p HDR', '1080p', quality];
  for (const q of prefQualities) {
    const entry = video.urls.find(u => u.q === q);
    if (entry) return { url: entry.url, quality: q };
  }
  if (video.urls[0]) return { url: video.urls[0].url, quality: video.urls[0].q };
  return null;
}

function showPreview(video, previewQuality) {
  const preview = getBestPreviewUrl(video, previewQuality);
  const emptyEl = document.getElementById('preview-empty');
  const infoEl = document.getElementById('preview-info');
  const errorEl = document.getElementById('preview-error');
  const nameEl = document.getElementById('preview-name');
  const metaEl = document.getElementById('preview-meta');
  const qualityNoteEl = document.getElementById('preview-quality-note');
  const linksEl = document.getElementById('preview-links');
  const downloadBtnEl = document.getElementById('preview-download-btn');

  if (errorEl) errorEl.textContent = '';
  if (emptyEl) emptyEl.style.display = 'none';
  if (infoEl) infoEl.style.display = 'block';

  if (nameEl) nameEl.textContent = video.name;
  if (metaEl) metaEl.textContent = `${video.region} \u00B7 #${video.number}${video.notes ? ` \u00B7 ${video.notes}` : ''}`;
  if (qualityNoteEl) qualityNoteEl.textContent = `Preview quality: ${preview ? preview.quality : 'none'} (selected: ${previewQuality})`;

  if (linksEl) {
    linksEl.innerHTML = '';
    video.urls.forEach(u => {
      const row = document.createElement('div');
      row.className = 'preview-link-row';
      const label = document.createElement('span');
      label.className = 'preview-link-label';
      label.textContent = u.q;
      const link = document.createElement('a');
      link.className = 'preview-link';
      link.href = '#';
      link.textContent = u.url.length > 80 ? u.url.slice(0, 80) + '...' : u.url;
      link.onclick = (e) => { e.preventDefault(); window.api.openExternal(u.url); };
      row.appendChild(label);
      row.appendChild(link);
      const statusSpan = document.createElement('span');
      statusSpan.className = 'preview-link-status';
      statusSpan.textContent = '\u2026';
      row.appendChild(statusSpan);
      linksEl.appendChild(row);
      checkUrl(u.url).then(r => {
        statusSpan.textContent = r.dead ? '\u2717 Dead' : '\u2713 OK';
        statusSpan.className = 'preview-link-status ' + (r.dead ? 'dead' : 'ok');
      });
    });
  }

  if (downloadBtnEl) {
    downloadBtnEl.style.display = 'inline-block';
    downloadBtnEl.disabled = false;
    downloadBtnEl.textContent = 'Download This Video';
    downloadBtnEl.onclick = async () => {
      if (errorEl) errorEl.textContent = 'Starting download...';
      await window.api.startDownloads([video.id], previewQuality);
      if (errorEl) errorEl.textContent = 'Download started! Go to Downloads tab to see progress.';
      downloadBtnEl.textContent = '\u2713 Download Started';
      downloadBtnEl.disabled = true;
    };
  }

  if (errorEl) {
    if (!preview) {
      errorEl.textContent = 'No playable URL available for this video';
    } else {
      errorEl.textContent = '';
    }
  }
}

function CatalogView({ catalog, downloadQuality, previewQuality, setPreviewQuality, selectedVideos, setSelectedVideos, downloads, setDownloads, setActiveTab, deadLinkVideos, setDeadLinkVideos }) {
  const [expanded, setExpanded] = useState({});

  const toggleRegion = (name) => setExpanded(p => ({ ...p, [name]: !p[name] }));
  const toggleVideo = (id) => {
    setSelectedVideos(prev =>
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const checkVideoDeadLinks = useCallback(async (video, quality) => {
    const urlEntry = video.urls.find(u => u.q === quality);
    if (!urlEntry) return;
    const cached = deadLinkCache[urlEntry.url];
    if (cached !== undefined && !cached.dead) return;
    if (cached !== undefined && cached.dead) {
      setDeadLinkVideos(p => ({ ...p, [video.id]: true }));
      return;
    }
    const r = await checkUrl(urlEntry.url);
    if (r.dead) setDeadLinkVideos(p => ({ ...p, [video.id]: true }));
  }, []);

  useEffect(() => {
    if (!catalog) return;
    for (const region of catalog.regions) {
      if (expanded[region.name] === false) continue;
      for (const video of region.videos) {
        checkVideoDeadLinks(video, downloadQuality);
      }
    }
  }, [expanded, downloadQuality, catalog, checkVideoDeadLinks]);

  return h('div', { className: 'catalog-layout' },
    h('div', { className: 'catalog-sidebar' },
      h('div', { className: 'catalog-controls' },
        h('label', null, 'Preview quality:'),
        h('select', { value: previewQuality, onChange: e => setPreviewQuality(e.target.value) },
          (catalog.qualities || []).map(q => h('option', { key: q, value: q }, q))
        ),
        h('button', {
          className: 'btn btn-primary',
          disabled: selectedVideos.length === 0,
          onClick: async () => {
            if (selectedVideos.length === 0) return;
            setActiveTab('downloads');
            await window.api.startDownloads(selectedVideos, downloadQuality);
            setDownloads(await window.api.getDownloads() || {});
          }
        }, `Download Selected (${selectedVideos.length})`),
        h('button', {
          className: 'btn btn-success',
          onClick: async () => {
            await window.api.playMpvTest();
          }
        }, '\u25B6 Test Playback'),
      ),
      h('div', { className: 'catalog-tree' },
        catalog.regions.map(region => {
          const regionIds = region.videos.map(v => v.id);
          const selCount = region.videos.filter(v => selectedVideos.includes(v.id)).length;
          const allSel = selCount === region.videos.length;
          const isExpanded = expanded[region.name] !== false;

          return h('div', { key: region.name, className: 'region-group' },
            h('div', { className: 'region-header', onClick: () => toggleRegion(region.name) },
              h('span', { className: 'expand-icon' }, isExpanded ? '\u25BC' : '\u25B6'),
              h('span', { className: 'region-name' }, region.name),
              h('span', { className: 'region-count' }, `${region.videos.length} videos`),
              h('span', { className: 'region-select-count' }, `${selCount}/${region.videos.length}`),
              h('button', {
                className: 'btn btn-sm',
                onClick: e => { e.stopPropagation();
                  setSelectedVideos(prev =>
                    allSel ? prev.filter(id => !regionIds.includes(id)) : [...new Set([...prev, ...regionIds])]
                  );
                }
              }, allSel ? 'Deselect All' : 'Select All'),
            ),
            isExpanded && h('div', { className: 'region-videos' },
              region.videos.map(video => {
                const isSelected = selectedVideos.includes(video.id);
                const hasDownload = downloads[video.id];
                const hasQuality = video.urls.some(u => u.q === previewQuality);
                const isDead = deadLinkVideos[video.id];

                return h('div', {
                  key: video.id,
                  className: `video-item ${isSelected ? 'active' : ''}`,
                  onClick: () => showPreview(video, previewQuality)
                },
                  h('input', {
                    type: 'checkbox', checked: isSelected,
                    onChange: () => toggleVideo(video.id),
                    onClick: e => e.stopPropagation()
                  }),
                  h('span', { className: 'video-name' }, video.name),
                  h('span', { className: 'video-number' }, video.number),
                  !hasQuality && h('span', { className: 'badge badge-warn' }, `N/A ${previewQuality}`),
                  isDead && h('span', { className: 'badge badge-dead' }, 'Dead'),
                  hasDownload && h('span', { className: 'badge badge-ok' }, 'Downloaded'),
                  video.notes && h('span', { className: 'video-notes', title: video.notes }, '\u2139'),
                );
              })
            ),
          );
        })
      ),
    ),
    h('div', { className: 'catalog-preview' },
      h('div', { className: 'preview-empty', id: 'preview-empty' },
        h('p', null, 'Select a video to preview')
      ),
      h('div', { id: 'preview-info', style: { display: 'none' } },
        h('h3', { id: 'preview-name' }),
        h('p', { className: 'preview-meta', id: 'preview-meta' }),
        h('div', { className: 'preview-player' },
          h('button', {
            id: 'preview-download-btn',
            className: 'btn btn-primary',
            style: { display: 'none' }
          }, 'Download This Video'),
          h('p', { className: 'preview-hint' }, 'Click a URL to open in your browser. Download to save and play locally.'),
        ),
        h('p', { id: 'preview-error', className: 'preview-error' }),
        h('p', { className: 'preview-quality-note', id: 'preview-quality-note' }),
        h('div', { className: 'preview-urls', id: 'preview-links' },
          h('p', null, 'Select a video to see available URLs'),
        ),
      ),
    ),
  );
}

function SettingsPanel({ settings, onUpdate }) {
  const [qual, setQual] = useState(settings.quality || '4K HDR');
  const [fill, setFill] = useState(settings.fillScreen || false);
  const [noHdr, setNoHdr] = useState(settings.disableHdr || false);
  const [toneMap, setToneMap] = useState(settings.toneMapping || 'auto');
  const [installMsg, setInstallMsg] = useState('');
  const [shortcut, setShortcut] = useState(settings.screensaverShortcut || '');
  const [shortcutMsg, setShortcutMsg] = useState('');

  return h('div', { className: 'settings-panel' },
    h('h2', null, 'Windows Screensaver Settings'),

    h('div', { className: 'setting-group' },
      h('label', null, 'Installation'),
      h('p', { className: 'setting-desc' }, 'Register or unregister as your Windows screensaver. Windows handles fullscreen app detection, video playback detection, and idle timeout natively.'),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center', flexWrap: 'wrap' } },
        h('button', {
          className: 'btn btn-primary',
          onClick: async () => {
            const r = await window.api.installScreensaver();
            if (r.ok) setInstallMsg('Installed! Open Screen Saver Settings to verify.');
            else setInstallMsg('Error: ' + (r.error || 'unknown'));
          }
        }, 'Install as Windows Screensaver'),
        h('button', {
          className: 'btn btn-danger',
          onClick: async () => {
            const r = await window.api.uninstallScreensaver();
            if (r.ok) setInstallMsg('Uninstalled. Screensaver removed from Windows.');
            else setInstallMsg('Error: ' + (r.error || 'unknown'));
          }
        }, 'Uninstall Screensaver'),
        h('button', {
          className: 'btn',
          onClick: async () => { await window.api.openScreensaverSettings(); }
        }, 'Open Screen Saver Settings'),
      ),
      installMsg && h('p', { style: { marginTop: '8px', fontSize: '12px', color: installMsg.startsWith('Error') ? '#ef9a9a' : '#a5d6a7' } }, installMsg),
    ),

    h('div', { className: 'setting-group' },
      h('label', null, 'Start Now'),
      h('p', { className: 'setting-desc' }, 'Launch the screensaver immediately without waiting for the idle timeout.'),
      h('button', {
        className: 'btn btn-primary',
        onClick: async () => { await window.api.startScreensaverNow(); }
      }, '\u25B6 Start Screensaver Now'),
    ),

    h('div', { className: 'setting-group' },
      h('label', null, 'Global Keyboard Shortcut'),
      h('p', { className: 'setting-desc' }, 'Register a system-wide hotkey to start the screensaver from anywhere. Example: Ctrl+Shift+F12'),
      h('div', { style: { display: 'flex', gap: '8px', alignItems: 'center' } },
        h('input', {
          type: 'text', value: shortcut,
          placeholder: 'Ctrl+Shift+F12',
          onChange: e => setShortcut(e.target.value),
          style: { flex: 1, padding: '6px 8px', background: '#1a1a2e', border: '1px solid #0f3460', color: '#e0e0e0', borderRadius: '4px', fontFamily: 'monospace' },
        }),
        h('button', {
          className: 'btn btn-primary',
          onClick: async () => {
            await window.api.registerShortcut(shortcut);
            setShortcutMsg('Shortcut registered.');
            setTimeout(() => setShortcutMsg(''), 3000);
          }
        }, 'Apply'),
        h('button', {
          className: 'btn',
          onClick: async () => {
            setShortcut('');
            await window.api.registerShortcut('');
            setShortcutMsg('Shortcut cleared.');
            setTimeout(() => setShortcutMsg(''), 3000);
          }
        }, 'Clear'),
      ),
      shortcutMsg && h('p', { style: { marginTop: '8px', fontSize: '12px', color: '#a5d6a7' } }, shortcutMsg),
    ),

    h('div', { className: 'setting-group' },
      h('label', null, 'Download Quality'),
      h('p', { className: 'setting-desc' }, 'Default quality used when downloading videos'),
      h('select', {
        value: qual,
        onChange: e => { setQual(e.target.value); onUpdate('quality', e.target.value); }
      },
        ['1080p', '1080p HDR', '1080p H264', '4K', '4K HDR', '4K 240fps'].map(q =>
          h('option', { key: q, value: q }, q)
        )
      ),
    ),

    h('div', { className: 'setting-group' },
      h('label', null, 'Tone Mapping'),
      h('p', { className: 'setting-desc' }, 'Adjusts HDR brightness mapping for non-HDR displays. Try \u201Chable\u201D if highlights look too bright, or \u201Cbt.2390\u201D for standard accuracy.'),
      h('select', {
        value: toneMap,
        onChange: e => { setToneMap(e.target.value); onUpdate('toneMapping', e.target.value); }
      },
        ['auto', 'hable', 'bt.2390', 'mobius', 'reinhard', 'gamma', 'linear'].map(t =>
          h('option', { key: t, value: t }, t)
        )
      ),
    ),

    h('div', { className: 'setting-group' },
      h('label', { className: 'checkbox-label' },
        h('input', { type: 'checkbox', checked: fill, onChange: e => { setFill(e.target.checked); onUpdate('fillScreen', e.target.checked); } }),
        h('span', null, 'Fill screen (zoom to remove black bars)')
      ),
      h('p', { className: 'setting-desc' }, 'When enabled, video is zoomed to fill the entire screen. The video may be cropped slightly at top/bottom or left/right edges.'),
    ),

    h('div', { className: 'setting-group' },
      h('label', { className: 'checkbox-label' },
        h('input', { type: 'checkbox', checked: noHdr, onChange: e => { setNoHdr(e.target.checked); onUpdate('disableHdr', e.target.checked); } }),
        h('span', null, 'Disable HDR (SDR mode for battery saving)')
      ),
      h('p', { className: 'setting-desc' }, 'When enabled, HDR output is disabled and content is tone-mapped to SDR. Reduces GPU load on laptops.'),
    ),

    h('div', { className: 'setting-group info-box' },
      h('h3', null, 'How it works'),
      h('ol', null,
        ['Select videos from the Videos tab', 'Choose your preferred download quality', 'Click Download Selected to save videos locally', 'Click "Install as Windows Screensaver" above', 'Open Screen Saver Settings to choose "Aerial Screensaver" and adjust timeout', 'Windows automatically plays the screensaver when idle'].map((text, i) =>
          h('li', { key: i }, text)
        )
      ),
    ),
  );
}

function DownloadPanel({ downloads, onRefresh }) {
  const [storageInfo, setStorageInfo] = useState({ totalSize: 0, count: 0 });
  const [playCounts, setPlayCounts] = useState({});
  const [progressMap, setProgressMap] = useState({});

  useEffect(() => { window.api.getStorageInfo().then(setStorageInfo); }, [downloads]);
  useEffect(() => { window.api.getPlayCounts().then(setPlayCounts); }, [downloads]);

  useEffect(() => {
    const cleanups = [
      window.api.onDownloadProgress(data => setProgressMap(p => ({ ...p, [data.id]: data.progress }))),
      window.api.onDownloadComplete(data => {
        setProgressMap(p => ({ ...p, [data.id]: 1 }));
        setTimeout(async () => { await onRefresh(); setStorageInfo(await window.api.getStorageInfo()); }, 500);
      }),
      window.api.onDownloadError(data => setProgressMap(p => ({ ...p, [data.id]: data.deadLink ? -2 : -1 }))),
    ];
    return () => cleanups.forEach(fn => fn());
  }, []);

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
  };

  const ids = Object.keys(downloads || {});

  return h('div', { className: 'download-panel' },
    h('div', { className: 'download-header' },
      h('h2', null, 'Downloads'),
      h('div', { className: 'storage-info' },
        h('span', null, `Stored: ${formatBytes(storageInfo.totalSize)} (${storageInfo.count} videos)`),
        storageInfo.count > 0 && h('button', {
          className: 'btn btn-sm',
          onClick: async () => { await window.api.openDownloadsFolder(); }
        }, '\uD83D\uDCC2 Open Folder'),
        storageInfo.count > 0 && h('button', {
          className: 'btn btn-sm',
          onClick: async () => {
            await window.api.resetPlayCounts();
            setPlayCounts(await window.api.getPlayCounts());
          }
        }, 'Reset Play Counts'),
        storageInfo.count > 0 && h('button', {
          className: 'btn btn-danger btn-sm',
          onClick: async () => {
            if (confirm('Delete all downloaded videos?')) {
              await window.api.deleteAllVideos();
              await onRefresh();
              setStorageInfo(await window.api.getStorageInfo());
            }
          }
        }, 'Delete All'),
      ),
    ),
    ids.length === 0
      ? h('div', { className: 'empty-state' },
          h('p', null, 'No videos downloaded yet'),
          h('p', null, 'Go to the Videos tab to select and download videos'),
        )
      : h('div', { className: 'download-list' },
          ids.map(id => {
            const info = downloads[id];
            const progress = progressMap[id];
            const hasFallback = info && info.requestQuality && info.quality && info.requestQuality !== info.quality;
            return h('div', { key: id, className: 'download-item' },
              h('div', { className: 'download-item-info' },
                h('span', { className: 'download-name' }, info ? info.name || id : id),
                !hasFallback && info && info.quality && h('span', { className: 'download-quality' }, info.quality),
                hasFallback && h('span', { className: 'download-quality fallback' },
                  `${info.requestQuality} (dead) \u2014 downloaded ${info.quality} instead`
                ),
                info && info.path && h('span', { className: 'download-path', title: info.path }, '\u2713'),
                playCounts[id] > 0 && h('span', { className: 'badge badge-played' }, `${playCounts[id]} plays`),
              ),
              progress !== undefined && progress >= 0 && progress < 1 && h('div', { className: 'progress-bar' },
                h('div', { className: 'progress-fill', style: { width: `${progress * 100}%` } }),
                h('span', { className: 'progress-text' }, `${Math.round(progress * 100)}%`),
              ),
              progress === -1 && h('span', { className: 'badge badge-error' }, 'Error'),
              progress === -2 && h('span', { className: 'badge badge-dead' }, 'Link Dead'),
              info && info.path && progress === undefined && h('button', {
                className: 'btn btn-sm btn-danger',
                onClick: async () => {
                  await window.api.deleteVideo(id);
                  await onRefresh();
                  setStorageInfo(await window.api.getStorageInfo());
                }
              }, 'Delete'),
            );
          })
        ),
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(
  h(React.StrictMode, null, h(App))
);
