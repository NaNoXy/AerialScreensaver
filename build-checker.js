const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');
const csc = '"C:\\Windows\\Microsoft.NET\\Framework\\v4.0.30319\\csc.exe"';
const binDir = path.resolve(__dirname, 'bin');

const fcOut = path.join(binDir, 'FullscreenChecker.exe');
const fcSrc = path.join(binDir, 'FullscreenChecker.cs');
if (!fs.existsSync(fcOut) || process.argv.includes('--force')) {
  execSync(csc + ' /nologo /out:"' + fcOut + '" "' + fcSrc + '"');
}

const scrOut = path.join(binDir, 'Aerial Screensaver.scr');
const scrSrc = path.resolve(__dirname, 'src', 'ScrSaver.cs');
const scrRefs = '/reference:System.Web.Extensions.dll /reference:System.Windows.Forms.dll /reference:System.Drawing.dll';
const scrSrcStat = fs.statSync(scrSrc);
const scrOutStat = fs.existsSync(scrOut) ? fs.statSync(scrOut) : null;
if (!scrOutStat || scrSrcStat.mtime > scrOutStat.mtime || process.argv.includes('--force')) {
  execSync(csc + ' /nologo /target:winexe /out:"' + scrOut + '" ' + scrRefs + ' "' + scrSrc + '"');
}
