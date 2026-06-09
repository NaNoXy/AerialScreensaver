const xlsx = require('xlsx');
const path = require('path');

function parse(filePath) {
  try {
    if (typeof filePath !== 'string' || !require('fs').existsSync(filePath)) {
      console.error('Catalog file not found:', filePath);
      return { regions: [], totalVideos: 0, qualities: ['1080p', '1080p HDR', '1080p H264', '4K', '4K HDR', '4K 240fps'] };
    }
    const wb = xlsx.readFile(filePath, { cellFormula: true });

    const linksWs = wb.Sheets['Links'];
    const linksRef = linksWs['!ref'];
    const linksRange = xlsx.utils.decode_range(linksRef);
    const linksData = [];
    for (let r = linksRange.s.r; r <= linksRange.e.r; r++) {
      const row = [];
      for (let c = 0; c <= 11; c++) {
        const addr = xlsx.utils.encode_cell({ r, c });
        const cell = linksWs[addr];
        row.push(cell ? cell.v : null);
      }
      linksData.push(row);
    }

    function resolveFormulaUrl(formula) {
      if (!formula || typeof formula !== 'string') return null;
      const m = formula.match(/HYPERLINK\(([^,)]+)/i);
      if (!m) return null;
      const ref = m[1].trim();
      const parts = ref.split('!');
      if (parts.length < 2) return null;
      const cellRef = parts[parts.length - 1];
      const cm = cellRef.match(/^([A-Z]+)(\d+)$/);
      if (!cm) return null;
      const colStr = cm[1];
      const row1Based = parseInt(cm[2], 10);
      let colIdx = 0;
      for (let i = 0; i < colStr.length; i++)
        colIdx = colIdx * 26 + colStr.charCodeAt(i) - 64;
      colIdx -= 1;
      const rowIdx = row1Based - 1;
      if (rowIdx >= 0 && rowIdx < linksData.length && colIdx >= 0) {
        const val = linksData[rowIdx][colIdx];
        if (val && typeof val === 'string' && val.startsWith('http')) return val;
      }
      return null;
    }

    const ws = wb.Sheets['All Aerials'];
    const data = xlsx.utils.sheet_to_json(ws, { header: 1 });

    const colDefs = [
      { idx: 3, q: '1080p' },
      { idx: 4, q: '1080p HDR' },
      { idx: 5, q: '1080p H264' },
      { idx: 6, q: '4K' },
      { idx: 7, q: '4K HDR' },
      { idx: 8, q: '4K 240fps' },
    ];

    const regionMap = {};

    for (let r = 1; r < data.length; r++) {
      const row = data[r];
      const mainLoc = row[0] ? String(row[0]).trim() : '';
      const detail = row[1] ? String(row[1]).trim() : '';
      const number = row[2] !== undefined && row[2] !== null ? String(row[2]).trim() : '';

      if (!mainLoc && !detail && !number) continue;
      if (!detail && !number) continue;

      const regionName = mainLoc || 'Unknown';
      const name = detail || mainLoc || 'Unknown';

      const urls = [];
      for (const col of colDefs) {
        const cellAddr = xlsx.utils.encode_cell({ r, c: col.idx });
        const cell = ws[cellAddr];
        if (!cell) continue;
        let url = null;
        if (cell.f && cell.f.startsWith('HYPERLINK(')) {
          url = resolveFormulaUrl(cell.f);
        } else if (typeof cell.v === 'string' && (cell.v.startsWith('http://') || cell.v.startsWith('https://'))) {
          url = cell.v;
        }
        if (url) urls.push({ q: col.q, url });
      }

      if (urls.length === 0) continue;

      const videoId = `${regionName}::${name}`;
      const video = { name, number, region: regionName, urls, notes: '', id: videoId };

      if (!regionMap[regionName]) regionMap[regionName] = { name: regionName, videos: [] };
      regionMap[regionName].videos.push(video);
    }

    return {
      regions: Object.values(regionMap).filter(r => r.videos.length > 0),
      totalVideos: Object.values(regionMap).reduce((sum, r) => sum + r.videos.length, 0),
      qualities: ['1080p', '1080p HDR', '1080p H264', '4K', '4K HDR', '4K 240fps'],
    };
  } catch (e) {
    console.error('Catalog parse error:', e);
    return { regions: [], totalVideos: 0, qualities: ['1080p', '1080p HDR', '1080p H264', '4K', '4K HDR', '4K 240fps'] };
  }
}

module.exports = { parse };
