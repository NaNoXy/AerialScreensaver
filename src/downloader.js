const https = require('https');
const http = require('http');
const fs = require('fs');
const path = require('path');

const httpsAgent = new https.Agent({ rejectUnauthorized: false });

let activeDownloads = new Map();
let cancelled = false;

function checkUrl(url) {
  return new Promise((resolve) => {
    const mod = url.startsWith('https') ? https : http;
    const opts = {
      method: 'GET',
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      rejectUnauthorized: false,
      timeout: 15000,
    };
    const req = mod.request(url, opts, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.destroy();
        resolve(checkUrl(res.headers.location)); return;
      }
      res.destroy();
      resolve({ alive: res.statusCode === 200, status: res.statusCode });
    });
    req.on('error', () => resolve({ alive: false, status: 0 }));
    req.on('timeout', () => { req.destroy(); resolve({ alive: false, status: 0 }); });
    req.end();
  });
}

function ensureDir(dir) {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
}

function downloadFile(url, dest, onProgress) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    const protocol = url.startsWith('https') ? https : http;
    const opts = {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    };
    if (url.startsWith('https')) opts.agent = httpsAgent;

    protocol.get(url, opts, (response) => {
      if (response.statusCode >= 300 && response.statusCode < 400 && response.headers.location) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { /* ignore */ }
        downloadFile(response.headers.location, dest, onProgress).then(resolve).catch(reject);
        return;
      }

      if (response.statusCode !== 200) {
        file.close();
        try { fs.unlinkSync(dest); } catch (e) { /* ignore */ }
        reject(new Error(`HTTP ${response.statusCode}`));
        return;
      }

      const totalSize = parseInt(response.headers['content-length'] || '0', 10);
      let downloadedSize = 0;

      response.on('data', (chunk) => {
        downloadedSize += chunk.length;
        if (totalSize > 0) {
          onProgress(downloadedSize / totalSize);
        }
      });

      response.pipe(file);

      file.on('finish', () => {
        file.close();
        resolve(dest);
      });
    }).on('error', (err) => {
      file.close();
      try { if (fs.existsSync(dest)) fs.unlinkSync(dest); } catch (e) { /* ignore */ }
      reject(err);
    });
  });
}

async function startBatch(jobs, win) {
  cancelled = false;
  const results = [];

  for (const job of jobs) {
    if (cancelled) break;

    const jobId = job.id;
    ensureDir(path.dirname(job.dest));

    if (fs.existsSync(job.dest)) {
      const stat = fs.statSync(job.dest);
      if (stat.size > 0) {
        results.push({ id: jobId, status: 'exists', path: job.dest });
        activeDownloads.delete(jobId);
        continue;
      }
    }

    activeDownloads.set(jobId, true);

    const urlCheck = await checkUrl(job.url);
    if (!urlCheck.alive) {
      activeDownloads.delete(jobId);
      const errMsg = urlCheck.status === 404 ? 'Link dead (404) - try a different quality' : `HTTP ${urlCheck.status}`;
      results.push({ id: jobId, status: 'error', error: errMsg, deadLink: true });
      if (win && !win.isDestroyed()) {
        win.webContents.send('download-error', { id: jobId, name: job.name, error: errMsg, deadLink: true });
      }
      continue;
    }

    try {
      await downloadFile(job.url, job.dest, (progress) => {
        if (win && !win.isDestroyed()) {
          win.webContents.send('download-progress', {
            id: jobId,
            name: job.name,
            progress,
          });
        }
      });

      activeDownloads.delete(jobId);
      results.push({ id: jobId, status: 'completed', path: job.dest });

      if (win && !win.isDestroyed()) {
        win.webContents.send('download-complete', {
          id: jobId,
          name: job.name,
          path: job.dest,
        });
      }
    } catch (err) {
      activeDownloads.delete(jobId);
      results.push({ id: jobId, status: 'error', error: err.message });

      if (win && !win.isDestroyed()) {
        win.webContents.send('download-error', {
          id: jobId,
          name: job.name,
          error: err.message,
        });
      }
    }
  }

  return results;
}

function cancelAll() {
  cancelled = true;
  activeDownloads.clear();
}

module.exports = { startBatch, cancelAll, checkUrl };
