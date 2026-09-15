# ⚡ SportFlow — Live & Scheduled Sports Streaming Frontend

A sleek, responsive dark-themed web interface for browsing and streaming all live and scheduled sports fixtures via the local [Live Sport Plugin](https://github.com/rajhodedara/live-sport-plugin). It connects directly to the local addon API running on `http://localhost:7000`, scrapes 600+ events across multiple providers (StreamFree, Streamed.pk, TimStreams, WatchFooty, and more), and provides instant HLS playback with automatic CORS proxy relay and web player embeds.

---

## 🚀 Quick Start Guide

### 1. Start the Live Sport Plugin (Backend)

Ensure you have **Node.js 22+** installed (`node --version`).

In your terminal:
```bash
# 1. Navigate to the plugin directory
cd live-sport-plugin

# 2. Install dependencies (first time only)
npm install

# 3. Build the project
npm run build

# 4. Start the plugin server
npm start
```

The plugin will start listening on **`http://localhost:7000`**.

Verify it is running by opening:
[http://localhost:7000/manifest.json](http://localhost:7000/manifest.json)

---

### 2. Serve and Open the Test Frontend

Open a new terminal window in the root directory:

```bash
# Option A: Using npx serve (recommended)
npx serve frontend -l 3000

# Option B: Using Python HTTP server
python -m http.server 3000 --directory frontend
```

Once running, navigate to:
👉 **`http://localhost:3000`**

---

## 📡 API Endpoints Used

| Endpoint | Method | Description |
| :--- | :---: | :--- |
| `http://localhost:7000/manifest.json` | `GET` | Health check & addon capabilities |
| `http://localhost:7000/catalog/sports/all.json` | `GET` | **All fixtures** (Live + Scheduled, 620+ matches) |
| `http://localhost:7000/catalog/sports/live.json` | `GET` | Currently live matches & 24/7 channels |
| `http://localhost:7000/catalog/sports/upcoming.json` | `GET` | All scheduled upcoming fixtures |
| `http://localhost:7000/catalog/sports/{category}.json` | `GET` | Filter by sport (football, basketball, etc.) |
| `http://localhost:7000/stream/sports/{MATCH_ID}.json` | `GET` | All stream sources for live or scheduled events |
| `http://localhost:7000/api/manifest?url={ENCODED_URL}` | `GET` | Local HLS reverse proxy to bypass CORS / IP locks |

---

## 🎯 Enhanced UI/UX Features

- **All Fixtures & Scheduled Matches Scraped**: Browse over 600+ live and scheduled sports matches.
- **Dynamic Hero Spotlight**: Highlights top live matches or anticipated upcoming showdowns with team logos and one-click streaming.
- **View Tabs**:
  - 🔥 **All Fixtures** (complete catalog)
  - 🔴 **Live Now** (pulsing red indicator)
  - ⏱️ **Scheduled** (with live countdowns e.g. `In 1h 45m`)
  - 📺 **24/7 Channels** (continuous sports networks)
- **Rich Match Cards**:
  - Team 1 vs Team 2 presentation with team logos.
  - Competition / League pills (*La Liga*, *Coppa Italia*, *Premier League*, *UFC*, etc.).
  - Kickoff times in user's local timezone.
  - Available streams counter (`⚡ 13 Sources`).
- **Hybrid Video Player (HLS + Web Embed)**:
  - Supports standard `.m3u8` streams using `hls.js`.
  - Supports embedded web players (`externalUrl`) via built-in iframe.
  - Server dropdown with provider names, resolutions (`1080p`, `720p`, `HD`), and view counts.
  - **Auto-Proxy Fallback**: Direct `.m3u8` streams automatically fail over to `http://localhost:7000/api/manifest` if CORS is detected.
  - Theater mode, Picture-in-Picture, and Reconnect button.
- **Keyboard Shortcuts**:
  - `/` : Focus quick search
  - `Space` : Play / Pause video
  - `Esc` : Close video player

---

## 🛠️ Troubleshooting

1. **Plugin Offline**: Check that `PORT=7000` is free and Node.js v22+ is running.
2. **CORS Video Errors**: The frontend automatically routes blocked streams through the local HLS proxy. Ensure the "Local HLS Proxy" toggle is checked.
3. **Scheduled Streams**: For upcoming matches, stream providers generally activate their live feeds 15–30 minutes prior to kickoff.
