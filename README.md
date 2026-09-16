# ⚡ STREAM NARO — Premium Live Sports Streaming Platform

**STREAM NARO** is a production-grade sports streaming web application designed with an ultra-dark fantasy-black aesthetic, precision cyan/teal accents, responsive multi-sport filtering, and an intelligent auto-recovery stream playback engine.

---

## 🌟 Key Architecture & Features

### 1. Intelligent Stream Auto-Recovery Engine
- **Automated Server Candidate Discovery**: Analyzes available server endpoints (`/stream/sports/{id}.json`) without forcing users to manually guess server numbers.
- **Provider Health & Playback Validation**: Distinguishes between HTTP reachability and actual video stream decodeability. Evaluates Hls.js fatal errors, stalled states, and iframe embed watchdogs.
- **Seamless Auto-Failover**: If a stream server encounters a network block or decode error, the engine automatically displays a subtle status indicator (*"Switching to backup source..."*) and recovers to the next eligible candidate.
- **CORS Relay Fallback**: Automatically falls back from direct HLS to reverse-proxied manifest relay if cross-origin playback restrictions occur.

### 2. STREAM NARO Design System
- **Fantasy-Black Palette**: Near-black canvas (`#050608`), layered black surfaces (`#090b10`, `#0f121a`), and crisp borders (`rgba(255, 255, 255, 0.07)`).
- **Cyan/Teal Signature Accent**: Precision accents (`#00f0ff` / `#06b6d4`) for live beacons, focus states, and primary actions.
- **Micro-Interactions**: Hardware-accelerated CSS `transform` and `opacity` transitions with full support for `prefers-reduced-motion`.
- **Zero-Distraction UI**: Removed excessive glassmorphism, heavy glows, and oversized rounded cards.

### 3. API Privacy & Production Security
- **No Client-Side Endpoint Exposure**: All public API switchers, debug menus, tokens, and developer prompts have been purged from the client interface.
- **Secure Reverse Proxy**: Production deployments route through `/api/backend` via `vercel.json` rewrites, keeping origin endpoints and tokens private.

### 4. 0ms Cold Start Caching
- **Stale-While-Revalidate (SWR)**: Instantly loads recent match catalogs from `localStorage` (`streamnaro_cached_matches_v1`), completely eliminating cold-boot loading delays.
- **Silent Background Sync**: Silently queries the backend for updated fixtures and server availability, maintaining a non-intrusive live sync indicator (`● Live (Synced)`).

---

## 🚀 Local Development & Deployment

### Run Locally:
```bash
# Serve the frontend directory
npx serve . -l 3000
```

### Deploy to Vercel:
The project is configured for Vercel with clean URLs and API rewrites in `vercel.json`. Push to the repository's `main` branch to trigger automated CI/CD deployment.
