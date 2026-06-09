# Apple TV Aerials Screensaver for Windows

Play Apple TV Aerial videos as your Windows screensaver with full HDR support.

## Features

- **153 videos** across 24 world regions — deserts, glaciers, oceans, cities, and more
- **Up to 4K HDR** — HEVC/H.265 playback via mpv with HDR10, HLG, and tone mapping for non-HDR displays
- **Quality fallback** — automatically falls back to 1080p if the 4K HDR URL is dead
- **Fair rotation** — least-played videos are prioritized so every downloaded video gets screen time
- **Windows-native** — registered as a proper `.scr` screensaver; Windows handles idle detection, fullscreen app suppression, and input-triggered exit
- **System tray** — pause/resume screensaver for 1 hour, open settings, or quit
- **No dependencies** — the installer bundles mpv and everything needed; no store accounts or subscriptions

## Screenshots

![Video Catalog](https://i.imgur.com/placeholder-catalog.png)
*Select videos by region, preview URLs, check quality availability*

## Requirements

- Windows 11 (or Windows 10)
- .NET Framework 4.x (pre-installed on Windows 11)
- A monitor that supports the video resolution you want to download

## Installation

### Quick Install (recommended)

1. Download the latest `Aerial Screensaver Setup 1.0.0.exe` from [Releases](https://github.com/NaNoXy/AerialScreensaver/releases)
2. Run the installer — it extracts mpv and registers all files
3. Launch **Aerial Screensaver** from the Start Menu or desktop shortcut
4. Go to the **Settings** tab and click **Install as Windows Screensaver**
5. Open *Screen Saver Settings* (`control desk.cpl,,@screensaver`), select **Aerial Screensaver**, set your timeout, and click **OK**

### Build from Source

```bash
git clone https://github.com/NaNoXy/AerialScreensaver.git
cd AerialScreensaver
npm install

# Place mpv.exe, mpv.com, d3dcompiler_43.dll in bin/
# (get them from https://mpv.io or a previous installation)

# Compile the .scr screensaver
npm run build:checker

# Build the NSIS installer
npm run dist:nsis
```

## Usage

1. **Browse videos** — the **Videos** tab loads the catalog from Apple's CDN URLs embedded in the official XLSX spreadsheet
2. **Select & download** — check the videos you want, choose quality (4K HDR, 4K, 1080p H264, etc.), and click *Download Selected*
3. **Preview** — click any video to see its available URL qualities; each URL is checked live (`✓ OK` / `✗ Dead`)
4. **Install screensaver** — in **Settings**, click *Install as Windows Screensaver*, then set it in Windows Screen Saver Settings
5. **Let it play** — Windows launches the screensaver after idle timeout; it picks the least-played downloaded video each time

### Quality Fallback

If a video's chosen quality URL is dead, the downloader automatically tries lower qualities in this order: `4K HDR → 4K 240fps → 4K → 1080p HDR → 1080p H264 → 1080p`. The UI shows which quality was actually downloaded in orange italics.

## Configuration

| Setting | Description |
|---------|-------------|
| Fill Screen | Zooms video to remove black bars (may crop edges) |
| Disable HDR | Tone-maps HDR to SDR — saves GPU on laptops |
| Tone Mapping | Adjusts HDR brightness: `auto`, `hable`, `bt.2390`, `mobius`, etc. |
| Download Quality | Default quality used when downloading videos |

## How It Works

- The `.scr` screensaver is a 10KB C# executable that reads the config JSON (from electron-store), picks the least-played downloaded video, and launches mpv inside a Windows Job Object with `KILL_ON_JOB_CLOSE`
- mpv plays fullscreen with hardware decoding, HDR pass-through, and no on-screen controls
- `GetLastInputInfo()` is polled every 500ms — the moment user input is detected, mpv is killed and the screensaver exits
- The Electron tray app is only for configuration, downloads, and install/uninstall — it does not manage the screensaver lifecycle

## Acknowledgments

- [mpv](https://mpv.io/) — the best video player, handles HEVC/HDR effortlessly
- Apple — for producing the stunning Aerial screen saver footage
- [aerials.xlsx](https://github.com/ThatsAMonkey-07/Apple-TV-Aerials-Updated) — community-maintained spreadsheet of video URLs
