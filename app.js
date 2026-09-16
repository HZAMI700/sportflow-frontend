/**
 * app.js — SportFlow Live & Scheduled Sports Streaming Frontend
 * Connects to the local Live Sport Plugin API (http://localhost:7000)
 * Scrapes & displays all matches (live, scheduled, 24/7), supports multi-server switching,
 * HLS direct/proxy streaming, web player embeds, and smart fallback.
 */

// GoDaddy Airo Backend with authenticated share token
const GODADDY_AIRO_URL = 'https://ahudwgrmu9.preview.c35.airoapp.ai/?airoShareToken=At3udpbq8UOL&preview=1';

function getInitialApiBase() {
  const urlParams = new URLSearchParams(window.location.search);
  const paramApi = urlParams.get('api');
  if (paramApi && paramApi.trim()) {
    let clean = paramApi.trim().replace(/\/$/, '');
    if (clean.includes('ahudwgrmu9.preview.c35.airoapp.ai') && !clean.includes('airoShareToken')) {
      const sep = clean.includes('?') ? '&' : '?';
      clean = `${clean}${sep}airoShareToken=At3udpbq8UOL&preview=1`;
    }
    return clean;
  }

  const storedApi = localStorage.getItem('sportflow_api_base');
  if (storedApi && storedApi.trim()) {
    let clean = storedApi.trim().replace(/\/$/, '');
    if (clean.includes('ahudwgrmu9.preview.c35.airoapp.ai') && !clean.includes('airoShareToken')) {
      clean = GODADDY_AIRO_URL;
      localStorage.setItem('sportflow_api_base', clean);
    }
    return clean;
  }

  // When hosted on Vercel or any web server, use same-origin reverse proxy /api/backend
  // which attaches the airoShareToken server-side and eliminates all browser CORS blocks
  const isWebHosted = window.location.protocol.startsWith('http') && 
                      !window.location.hostname.includes('localhost') && 
                      !window.location.hostname.includes('127.0.0.1');

  return isWebHosted ? '/api/backend' : GODADDY_AIRO_URL;
}

let API_BASE = getInitialApiBase();

function parseApiBase(rawUrl) {
  try {
    if (rawUrl.startsWith('/')) {
      return { originAndPath: rawUrl.replace(/\/$/, ''), baseParams: new URLSearchParams(), isRelative: true };
    }
    const urlObj = new URL(rawUrl);
    const originAndPath = `${urlObj.origin}${urlObj.pathname.replace(/\/$/, '')}`;
    const baseParams = new URLSearchParams(urlObj.search);
    return { originAndPath, baseParams, isRelative: false };
  } catch (_) {
    return { originAndPath: rawUrl.replace(/\/$/, ''), baseParams: new URLSearchParams(), isRelative: false };
  }
}

function buildApiUrl(endpoint, extraParams = {}) {
  const { originAndPath, baseParams } = parseApiBase(API_BASE);
  let path = endpoint.startsWith('/') ? endpoint : `/${endpoint}`;
  let pathOnly = path;
  let endpointParams = new URLSearchParams();

  if (path.includes('?')) {
    const parts = path.split('?');
    pathOnly = parts[0];
    endpointParams = new URLSearchParams(parts[1]);
  }

  const mergedParams = new URLSearchParams();
  for (const [k, v] of baseParams.entries()) {
    mergedParams.set(k, v);
  }
  for (const [k, v] of endpointParams.entries()) {
    mergedParams.set(k, v);
  }
  for (const [k, v] of Object.entries(extraParams)) {
    if (v !== undefined && v !== null) {
      mergedParams.set(k, v);
    }
  }

  const queryString = mergedParams.toString();
  return `${originAndPath}${pathOnly}${queryString ? '?' + queryString : ''}`;
}

function resolveMediaUrl(url) {
  if (!url || typeof url !== 'string') return '';
  const { originAndPath, baseParams, isRelative } = parseApiBase(API_BASE);

  let fixedUrl = url;

  // If URL points to frontend origin's /api/manifest or /img, rewrite to API base
  const locOrigin = window.location.origin;
  if (locOrigin && fixedUrl.startsWith(locOrigin + '/api/manifest')) {
    fixedUrl = fixedUrl.replace(locOrigin, originAndPath);
  }
  if (locOrigin && fixedUrl.startsWith(locOrigin + '/img')) {
    fixedUrl = fixedUrl.replace(locOrigin, originAndPath);
  }

  // If it's a relative path starting with /, prefix with originAndPath
  if (fixedUrl.startsWith('/')) {
    if (isRelative) {
      if (!fixedUrl.startsWith(originAndPath)) {
        fixedUrl = `${originAndPath}${fixedUrl}`;
      }
    } else {
      fixedUrl = `${originAndPath}${fixedUrl}`;
    }
  } else {
    // Replace internal container IPs (100.117.x, 169.254.x, 127.0.0.1:7000)
    fixedUrl = fixedUrl.replace(/^http:\/\/(?:100\.\d+\.\d+\.\d+:\d+|169\.254\.\d+\.\d+:\d+|localhost:\d+|127\.0\.0\.1:\d+)/, originAndPath);
  }

  // If targeting GoDaddy Airo preview directly, ensure share tokens are attached
  if (fixedUrl.includes('ahudwgrmu9.preview.c35.airoapp.ai')) {
    try {
      const u = new URL(fixedUrl);
      for (const [k, v] of baseParams.entries()) {
        if (!u.searchParams.has(k)) {
          u.searchParams.set(k, v);
        }
      }
      return u.toString();
    } catch (_) {}
  }

  return fixedUrl;
}


// App State
let allMatches = [];
let activeTab = 'all'; // 'all', 'live', 'upcoming', 'networks'
let activeCategory = 'all';
let currentSearch = '';
let currentSort = 'time-asc';
let pageLimit = 24;
let displayedCount = 24;

let currentStreams = [];
let activeStreamInfo = null;
let hlsInstance = null;
let userTimezone = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

// DOM Elements
const pluginStatusEl = document.getElementById('plugin-status');
const statusTextEl = document.getElementById('status-text');
const refreshBtn = document.getElementById('refresh-btn');
const timezoneBadge = document.getElementById('timezone-badge');
const eventsStat = document.getElementById('events-stat');
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const sortSelect = document.getElementById('sort-select');

const heroSection = document.getElementById('hero-spotlight');
const heroBg = document.getElementById('hero-bg');
const heroStatusPill = document.getElementById('hero-status-pill');
const heroLeague = document.getElementById('hero-league');
const heroHomeLogo = document.getElementById('hero-home-logo');
const heroHomeName = document.getElementById('hero-home-name');
const heroAwayLogo = document.getElementById('hero-away-logo');
const heroAwayName = document.getElementById('hero-away-name');
const heroWatchBtn = document.getElementById('hero-watch-btn');
const heroKickoffText = document.getElementById('hero-kickoff-info');

const tabCountAll = document.getElementById('tab-count-all');
const tabCountLive = document.getElementById('tab-count-live');
const tabCountUpcoming = document.getElementById('tab-count-upcoming');
const tabCountNetworks = document.getElementById('tab-count-networks');
const categoryFilters = document.getElementById('category-filters');

const gridTitle = document.getElementById('grid-title');
const gridCountBadge = document.getElementById('grid-count-badge');
const activeFilterLabel = document.getElementById('active-filter-label');
const matchesGrid = document.getElementById('matches-grid');
const catalogAlert = document.getElementById('catalog-alert');
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');

const playerSection = document.getElementById('player-section');
const closePlayerBtn = document.getElementById('close-player-btn');
const pipBtn = document.getElementById('pip-btn');
const theaterBtn = document.getElementById('theater-btn');
const playerStatusTag = document.getElementById('player-status-tag');
const playerLeagueTag = document.getElementById('player-league-tag');
const playerSourceCount = document.getElementById('player-source-count');
const playingTitle = document.getElementById('playing-title');
const videoPlayer = document.getElementById('video-player');
const embedFrame = document.getElementById('embed-frame');
const playerOverlay = document.getElementById('player-overlay');
const overlayMessage = document.getElementById('overlay-message');
const serverSelect = document.getElementById('server-select');
const proxyCheckbox = document.getElementById('proxy-checkbox');
const streamTypeTag = document.getElementById('stream-type-tag');
const streamUrlDisplay = document.getElementById('stream-url-display');
const reconnectStreamBtn = document.getElementById('reconnect-stream-btn');
const playerAlert = document.getElementById('player-alert');
const toastContainer = document.getElementById('toast-container');

// ─── Initialization ──────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  timezoneBadge.textContent = userTimezone;
  initEventListeners();
  initKeyboardShortcuts();
  checkPluginHealth();
  fetchAllMatches();
});

function initEventListeners() {
  refreshBtn.addEventListener('click', () => {
    refreshBtn.classList.add('rotating');
    checkPluginHealth();
    fetchAllMatches(() => {
      refreshBtn.classList.remove('rotating');
      showToast('Matches synchronized successfully', 'success');
    });
  });

  searchInput.addEventListener('input', (e) => {
    currentSearch = e.target.value.toLowerCase().trim();
    clearSearchBtn.classList.toggle('hidden', !currentSearch);
    displayedCount = pageLimit;
    renderMatches();
  });

  clearSearchBtn.addEventListener('click', () => {
    searchInput.value = '';
    currentSearch = '';
    clearSearchBtn.classList.add('hidden');
    displayedCount = pageLimit;
    renderMatches();
  });

  document.querySelectorAll('.tab-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      activeTab = target.dataset.tab;
      displayedCount = pageLimit;
      renderMatches();
    });
  });

  categoryFilters.addEventListener('click', (e) => {
    const pill = e.target.closest('.cat-pill');
    if (!pill) return;
    document.querySelectorAll('.cat-pill').forEach(p => p.classList.remove('active'));
    pill.classList.add('active');
    activeCategory = pill.dataset.category || 'all';
    displayedCount = pageLimit;
    renderMatches();
  });

  sortSelect.addEventListener('change', (e) => {
    currentSort = e.target.value;
    renderMatches();
  });

  loadMoreBtn.addEventListener('click', () => {
    displayedCount += pageLimit;
    renderMatches();
  });

  closePlayerBtn.addEventListener('click', closePlayer);
  
  pipBtn.addEventListener('click', async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoPlayer.readyState > 0 && !videoPlayer.classList.contains('hidden')) {
        await videoPlayer.requestPictureInPicture();
      }
    } catch (err) {
      showToast('Picture-in-Picture not supported or active', 'warning');
    }
  });

  theaterBtn.addEventListener('click', () => {
    playerSection.classList.toggle('theater-mode');
  });

  serverSelect.addEventListener('change', (e) => {
    const idx = parseInt(e.target.value, 10);
    if (!isNaN(idx) && currentStreams[idx]) {
      playStreamIndex(idx);
    }
  });

  proxyCheckbox.addEventListener('change', () => {
    if (activeStreamInfo) {
      playCurrentStream({ forceProxy: proxyCheckbox.checked, isRetry: true });
      showToast(proxyCheckbox.checked ? 'Local HLS Proxy Enabled' : 'Direct Playback Enabled', 'info');
    }
  });

  reconnectStreamBtn.addEventListener('click', () => {
    if (activeStreamInfo) {
      playCurrentStream({ isRetry: true });
      showToast('Reconnecting stream...', 'info');
    }
  });
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // '/' focuses search
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    // 'Escape' closes player
    if (e.key === 'Escape' && !playerSection.classList.contains('hidden')) {
      closePlayer();
    }
    // 'Space' plays/pauses video if player is active and not typing in search
    if (e.code === 'Space' && document.activeElement !== searchInput && !playerSection.classList.contains('hidden') && !videoPlayer.classList.contains('hidden')) {
      e.preventDefault();
      if (videoPlayer.paused) videoPlayer.play();
      else videoPlayer.pause();
    }
  });
}

// ─── Health Check & API Switcher ─────────────────────────────────────────────

async function checkPluginHealth() {
  setPluginStatus('checking', 'Connecting to API...');
  const label = document.getElementById('api-endpoint-label');
  if (label) label.textContent = API_BASE;

  try {
    let manifestUrl = buildApiUrl('/manifest.json');
    let res = await fetch(manifestUrl, { cache: 'no-store' });

    // Fallback: If /api/backend returned 404 (e.g. running locally without Vercel rewrites), switch to direct GoDaddy API
    if (!res.ok && API_BASE === '/api/backend') {
      console.log('Vercel rewrite /api/backend not available. Falling back to direct GoDaddy API...');
      API_BASE = GODADDY_AIRO_URL;
      if (label) label.textContent = API_BASE;
      manifestUrl = buildApiUrl('/manifest.json');
      res = await fetch(manifestUrl, { cache: 'no-store' });
    }

    if (res.ok) {
      const data = await res.json();
      setPluginStatus('online', `${data.name || 'Live Sports API'} (Connected)`);
      showCatalogAlert(null);
    } else if (res.status === 401) {
      setPluginStatus('offline', 'GoDaddy Auth Error (HTTP 401)');
      showCatalogAlert('warning', `
        <strong>⚠️ GoDaddy Preview URL returned Unauthorized (HTTP 401)</strong><br>
        Current API: <code>${escapeHtml(API_BASE)}</code><br>
        <div style="margin-top:10px; display:flex; gap:10px; flex-wrap:wrap;">
          <button onclick="switchToCloudApi()" class="btn btn-secondary" style="padding:5px 12px; font-size:12px;">☁️ Connect to GoDaddy Cloud API</button>
          <button onclick="switchToLocalApi()" class="btn btn-secondary" style="padding:5px 12px; font-size:12px;">💻 Switch to Local API (localhost:7000)</button>
          <button onclick="promptChangeApi()" class="btn btn-secondary" style="padding:5px 12px; font-size:12px;">🔗 Change URL</button>
        </div>
      `);
    } else {
      setPluginStatus('offline', `API HTTP ${res.status}`);
    }
  } catch (err) {
    // If /api/backend failed network request, try falling back to direct cloud
    if (API_BASE === '/api/backend') {
      API_BASE = GODADDY_AIRO_URL;
      if (label) label.textContent = API_BASE;
      try {
        const res2 = await fetch(buildApiUrl('/manifest.json'), { cache: 'no-store' });
        if (res2.ok) {
          const data = await res2.json();
          setPluginStatus('online', `${data.name || 'Live Sports API'} (Connected)`);
          showCatalogAlert(null);
          return;
        }
      } catch (_) {}
    }
    setPluginStatus('offline', 'API Offline (Click to configure)');
  }
}

function setPluginStatus(status, text) {
  pluginStatusEl.className = `status-badge status-${status}`;
  statusTextEl.textContent = text;
  pluginStatusEl.style.cursor = 'pointer';
  pluginStatusEl.title = 'Click to switch or configure API endpoint';
}

window.promptChangeApi = function() {
  const input = prompt('Enter your Backend API Base URL:\n(e.g., /api/backend, ' + GODADDY_AIRO_URL + ' or http://localhost:7000)', API_BASE);
  if (input && input.trim()) {
    let val = input.trim().replace(/\/$/, '');
    if (val.includes('ahudwgrmu9.preview.c35.airoapp.ai') && !val.includes('airoShareToken')) {
      val = GODADDY_AIRO_URL;
    }
    API_BASE = val;
    localStorage.setItem('sportflow_api_base', API_BASE);
    const label = document.getElementById('api-endpoint-label');
    if (label) label.textContent = API_BASE;
    checkPluginHealth();
    fetchAllMatches();
    showToast(`Switched API to: ${API_BASE}`, 'info');
  }
};

window.switchToCloudApi = function() {
  API_BASE = GODADDY_AIRO_URL;
  localStorage.setItem('sportflow_api_base', API_BASE);
  const label = document.getElementById('api-endpoint-label');
  if (label) label.textContent = API_BASE;
  checkPluginHealth();
  fetchAllMatches();
  showToast('Switched to GoDaddy Cloud API', 'info');
};

window.switchToLocalApi = function() {
  API_BASE = 'http://localhost:7000';
  localStorage.setItem('sportflow_api_base', API_BASE);
  const label = document.getElementById('api-endpoint-label');
  if (label) label.textContent = API_BASE;
  checkPluginHealth();
  fetchAllMatches();
  showToast('Switched to local backend: http://localhost:7000', 'info');
};

// ─── Fetch All Matches (Live & Scheduled) ────────────────────────────────────

async function fetchAllMatches(callback) {
  showCatalogAlert(null);
  matchesGrid.innerHTML = `
    <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: #94a3b8;">
      <div class="spinner" style="margin: 0 auto 1rem;"></div>
      <p style="font-size: 1.1rem; font-weight: 600;">Scraping all live & scheduled matches across providers...</p>
      <p style="font-size: 0.85rem; color: #64748b; margin-top: 0.25rem;">Checking StreamFree, Streamed.pk, TimStreams, WatchFooty, and more.</p>
    </div>
  `;

  try {
    let rawItems = [];

    // Attempt 1: /catalog/sports/all.json
    try {
      const res = await fetch(buildApiUrl('/catalog/sports/all.json'), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        rawItems = json.metas || [];
      }
    } catch (_) {}

    // Attempt 2: Direct /api/matches
    if (!rawItems.length) {
      try {
        const res = await fetch(buildApiUrl('/api/matches'), { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          if (Array.isArray(json)) rawItems = json;
        }
      } catch (_) {}
    }

    // Attempt 3: Combine /catalog/sports/live.json + /catalog/sports/upcoming.json
    if (!rawItems.length) {
      try {
        const [liveRes, upRes] = await Promise.all([
          fetch(buildApiUrl('/catalog/sports/live.json')),
          fetch(buildApiUrl('/catalog/sports/upcoming.json'))
        ]);
        const liveJson = await liveRes.json();
        const upJson = await upRes.json();
        rawItems = [...(liveJson.metas || []), ...(upJson.metas || [])];
      } catch (_) {}
    }

    // Attempt 4: Standard Stremio addon catalogs /catalog/tv/nuvio_sports_live.json & nuvio_sports_upcoming.json
    if (!rawItems.length) {
      try {
        const [liveRes, upRes] = await Promise.all([
          fetch(buildApiUrl('/catalog/tv/nuvio_sports_live.json')),
          fetch(buildApiUrl('/catalog/tv/nuvio_sports_upcoming.json'))
        ]);
        const liveJson = await liveRes.json();
        const upJson = await upRes.json();
        rawItems = [...(liveJson.metas || []), ...(upJson.metas || [])];
      } catch (_) {}
    }

    if (!rawItems.length) {
      showCatalogAlert('warning', `
        <strong>Could not load matches from backend API</strong><br>
        Current Endpoint: <code>${escapeHtml(API_BASE)}</code><br>
        <div style="margin-top: 10px; display: flex; gap: 8px; flex-wrap: wrap;">
          <button onclick="switchToCloudApi()" class="btn btn-secondary" style="padding: 5px 12px; font-size: 12px;">☁️ Connect to GoDaddy Cloud API</button>
          <button onclick="switchToLocalApi()" class="btn btn-secondary" style="padding: 5px 12px; font-size: 12px;">💻 Connect to Localhost:7000</button>
          <button onclick="promptChangeApi()" class="btn btn-secondary" style="padding: 5px 12px; font-size: 12px;">🔗 Enter Custom URL</button>
        </div>
      `);
      matchesGrid.innerHTML = '';
      return;
    }

    const now = Date.now();

    // Standardize matches
    allMatches = rawItems.map(item => {
      const rawId = String(item.id || '');
      const cleanId = rawId.replace(/^nuvio_sport_/, '');
      const title = item.name || item.title || 'Sports Event';
      const category = (item.genres && item.genres[0]) || item.category || 'sports';
      const categoryClean = category.toLowerCase().replace(/[^a-z0-9_]/g, '');
      
      const is247 = item.is247 || categoryClean === 'networks' || (!item.date && !item.released);
      
      let dateTimestamp = null;
      if (item.date) {
        const d = Number(item.date);
        dateTimestamp = !isNaN(d) && d > 0 ? d : null;
      } else if (item.released) {
        dateTimestamp = new Date(item.released).getTime();
      }

      const isLive = item.isLive !== undefined 
        ? item.isLive 
        : (is247 || (dateTimestamp && dateTimestamp <= now + 15 * 60 * 1000 && dateTimestamp >= now - 3 * 60 * 60 * 1000));

      const rawPoster = item.poster || item.background || item.thumbnail_url || buildApiUrl('/img/placeholder', { text: title, color: '182234' });
      const poster = resolveMediaUrl(rawPoster);

      const team1 = item.team1 || (item.cast && item.cast[0] ? { name: item.cast[0], logo: null } : null);
      const team2 = item.team2 || (item.cast && item.cast[1] ? { name: item.cast[1], logo: null } : null);

      const sourcesCount = item.sourcesCount || (item.sources && item.sources.length) || 1;

      return {
        id: rawId,
        cleanId: cleanId,
        title: title.replace(/^🔴 LIVE:\s*/i, '').replace(/^⏱️\s*/i, '').replace(/^📺\s*/i, ''),
        category: categoryClean,
        league: item.league || '',
        date: dateTimestamp,
        isLive: isLive,
        is247: is247,
        popular: item.popular === true || item.popular === '1',
        sourcesCount: sourcesCount,
        poster: poster,
        team1: team1,
        team2: team2,
        releaseInfo: item.releaseInfo || ''
      };
    });

    eventsStat.textContent = `${allMatches.length} Matches Scraped`;
    updateTabCounts();
    renderHeroSpotlight();
    renderMatches();

    if (callback) callback();

  } catch (err) {
    console.error('Failed to load matches:', err);
    showCatalogAlert('danger', 'Could not load matches. Check backend connection.');
    matchesGrid.innerHTML = '';
  }
}

// ─── Update Tab Counters ─────────────────────────────────────────────────────

function updateTabCounts() {
  const liveCount = allMatches.filter(m => m.isLive && !m.is247).length;
  const upcomingCount = allMatches.filter(m => !m.isLive && !m.is247).length;
  const networksCount = allMatches.filter(m => m.is247).length;

  tabCountAll.textContent = allMatches.length;
  tabCountLive.textContent = liveCount;
  tabCountUpcoming.textContent = upcomingCount;
  tabCountNetworks.textContent = networksCount;
}

// ─── Render Hero Spotlight ───────────────────────────────────────────────────

function renderHeroSpotlight() {
  // Find featured live match or nearest upcoming match with teams
  const featured = allMatches.find(m => m.isLive && !m.is247 && m.team1 && m.team2) ||
                   allMatches.find(m => m.popular && m.team1 && m.team2) ||
                   allMatches.find(m => m.team1 && m.team2 && m.team1.logo) ||
                   allMatches[0];

  if (!featured) {
    heroSection.classList.add('hidden');
    return;
  }

  heroSection.classList.remove('hidden');
  heroBg.style.backgroundImage = `url('${featured.poster}')`;
  heroLeague.textContent = featured.league || featured.category.toUpperCase();

  if (featured.isLive) {
    heroStatusPill.className = 'badge badge-live';
    heroStatusPill.textContent = '● LIVE NOW';
    heroKickoffText.textContent = 'Broadcast is live right now';
    heroWatchBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      Watch Live Stream
    `;
  } else {
    heroStatusPill.className = 'badge badge-sources';
    heroStatusPill.textContent = '⏱️ UPCOMING';
    heroKickoffText.textContent = formatKickoffTime(featured.date);
    heroWatchBtn.innerHTML = `
      <svg width="18" height="18" viewBox="0 0 24 24" fill="currentColor">
        <polygon points="5 3 19 12 5 21 5 3"></polygon>
      </svg>
      View Available Streams (${featured.sourcesCount})
    `;
  }

  if (featured.team1) {
    heroHomeName.textContent = featured.team1.name;
    if (featured.team1.logo) {
      heroHomeLogo.src = featured.team1.logo;
      heroHomeLogo.style.display = 'block';
    } else {
      heroHomeLogo.style.display = 'none';
    }
  } else {
    heroHomeName.textContent = featured.title.split(' vs ')[0] || featured.title;
    heroHomeLogo.style.display = 'none';
  }

  if (featured.team2) {
    heroAwayName.textContent = featured.team2.name;
    if (featured.team2.logo) {
      heroAwayLogo.src = featured.team2.logo;
      heroAwayLogo.style.display = 'block';
    } else {
      heroAwayLogo.style.display = 'none';
    }
  } else {
    heroAwayName.textContent = featured.title.split(' vs ')[1] || '';
    heroAwayLogo.style.display = 'none';
  }

  heroWatchBtn.onclick = () => {
    handleWatchClick(featured.cleanId, featured.title, featured.league);
  };
}

// ─── Filter & Render Matches ─────────────────────────────────────────────────

function renderMatches() {
  let list = allMatches;

  // 1. Tab Filter
  if (activeTab === 'live') {
    list = list.filter(m => m.isLive && !m.is247);
  } else if (activeTab === 'upcoming') {
    list = list.filter(m => !m.isLive && !m.is247);
  } else if (activeTab === 'networks') {
    list = list.filter(m => m.is247);
  }

  // 2. Category Filter
  if (activeCategory !== 'all') {
    list = list.filter(m => {
      if (activeCategory === 'networks') return m.is247 || m.category === 'networks';
      return m.category.includes(activeCategory);
    });
  }

  // 3. Search Filter
  if (currentSearch) {
    list = list.filter(m =>
      m.title.toLowerCase().includes(currentSearch) ||
      m.league.toLowerCase().includes(currentSearch) ||
      m.category.toLowerCase().includes(currentSearch) ||
      (m.team1 && m.team1.name.toLowerCase().includes(currentSearch)) ||
      (m.team2 && m.team2.name.toLowerCase().includes(currentSearch))
    );
  }

  // 4. Sort
  list = [...list].sort((a, b) => {
    if (currentSort === 'time-asc') {
      // Live matches first
      const aLive = a.isLive ? 1 : 0;
      const bLive = b.isLive ? 1 : 0;
      if (aLive !== bLive) return bLive - aLive;

      // Then soonest kickoff
      const aDate = a.date || Number.MAX_SAFE_INTEGER;
      const bDate = b.date || Number.MAX_SAFE_INTEGER;
      return aDate - bDate;
    } else if (currentSort === 'popular') {
      const aPop = a.popular ? 1 : 0;
      const bPop = b.popular ? 1 : 0;
      return bPop - aPop;
    } else if (currentSort === 'sources') {
      return (b.sourcesCount || 0) - (a.sourcesCount || 0);
    } else if (currentSort === 'title') {
      return a.title.localeCompare(b.title);
    }
    return 0;
  });

  // Update headers
  gridCountBadge.textContent = `${list.length} matches`;
  activeFilterLabel.textContent = `Showing ${activeTab.toUpperCase()} &bull; ${activeCategory.toUpperCase()}`;

  if (list.length === 0) {
    matchesGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 4rem; color: #64748b;">
        <p style="font-size: 1.25rem; font-weight: 700; color: #94a3b8; margin-bottom: 0.5rem;">No sports events found</p>
        <p style="font-size: 0.875rem;">Try changing your search term, sport category, or active tab.</p>
      </div>
    `;
    loadMoreContainer.classList.add('hidden');
    return;
  }

  // Pagination slice
  const visibleItems = list.slice(0, displayedCount);

  matchesGrid.innerHTML = visibleItems.map(m => renderMatchCard(m)).join('');

  if (displayedCount < list.length) {
    loadMoreContainer.classList.remove('hidden');
    loadMoreBtn.textContent = `Load More Matches (${list.length - displayedCount} remaining)`;
  } else {
    loadMoreContainer.classList.add('hidden');
  }
}

function renderMatchCard(m) {
  const hasTeams = m.team1 && m.team2 && (m.team1.name || m.team2.name);
  const leagueText = m.league || m.category.toUpperCase();
  
  let statusBadgeHtml = '';
  if (m.is247) {
    statusBadgeHtml = `<span class="card-status-pill status-network">📺 24/7 TV</span>`;
  } else if (m.isLive) {
    statusBadgeHtml = `<span class="card-status-pill status-live">● LIVE</span>`;
  } else {
    statusBadgeHtml = `<span class="card-status-pill status-upcoming">${formatKickoffTime(m.date, true)}</span>`;
  }

  let visualHtml = '';
  if (hasTeams) {
    visualHtml = `
      <div class="card-clash-visual">
        <div class="clash-team">
          ${m.team1.logo ? `<img src="${escapeHtml(m.team1.logo)}" alt="${escapeHtml(m.team1.name)}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span>${escapeHtml(m.team1.name)}</span>
        </div>
        <span class="clash-vs-badge">VS</span>
        <div class="clash-team">
          ${m.team2.logo ? `<img src="${escapeHtml(m.team2.logo)}" alt="${escapeHtml(m.team2.name)}" loading="lazy" onerror="this.style.display='none'">` : ''}
          <span>${escapeHtml(m.team2.name)}</span>
        </div>
      </div>
    `;
  }

  const actionClass = m.isLive ? 'action-live' : 'action-scheduled';
  const actionText = m.isLive ? 'Watch Live' : 'View Streams';

  return `
    <div class="match-card">
      <div class="match-card-header">
        <img class="match-backdrop-img" src="${escapeHtml(m.poster)}" alt="${escapeHtml(m.title)}" loading="lazy" onerror="this.onerror=null;this.src='${escapeHtml(resolveMediaUrl('/img/placeholder?text=' + encodeURIComponent(m.category) + '&color=111827'))}';">
        <div class="card-overlay-gradient"></div>
        <div class="card-top-tags">
          <span class="card-league-pill" title="${escapeHtml(leagueText)}">${escapeHtml(leagueText)}</span>
          ${statusBadgeHtml}
        </div>
        ${visualHtml}
      </div>
      <div class="match-card-body">
        <h3 class="card-match-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</h3>
        <div class="card-kickoff-meta">
          <span>📅 ${formatKickoffFull(m.date, m.isLive, m.is247)}</span>
        </div>
        <div class="card-footer-actions">
          <span class="sources-indicator">⚡ ${m.sourcesCount} Source${m.sourcesCount === 1 ? '' : 's'}</span>
          <button class="btn-card-action ${actionClass}" onclick="handleWatchClick('${escapeHtml(m.cleanId)}', '${escapeHtml(m.title.replace(/'/g, "\\'"))}', '${escapeHtml(leagueText.replace(/'/g, "\\'"))}')">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
              <polygon points="5 3 19 12 5 21 5 3"></polygon>
            </svg>
            ${actionText}
          </button>
        </div>
      </div>
    </div>
  `;
}

// ─── Kickoff Time Formatters ─────────────────────────────────────────────────

function formatKickoffTime(timestamp, compact = false) {
  if (!timestamp) return compact ? 'Scheduled' : 'Kickoff Scheduled';
  const date = new Date(timestamp);
  const now = Date.now();
  const diffMs = timestamp - now;

  if (diffMs > 0) {
    const hours = Math.floor(diffMs / (1000 * 60 * 60));
    const mins = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    if (hours >= 24) {
      const days = Math.floor(hours / 24);
      return compact ? `In ${days}d` : `Starts in ${days} days`;
    } else if (hours > 0) {
      return compact ? `In ${hours}h ${mins}m` : `Starts in ${hours}h ${mins}m`;
    } else {
      return compact ? `In ${mins}m` : `Starts in ${mins} mins`;
    }
  }

  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return compact ? timeStr : `Started at ${timeStr}`;
}

function formatKickoffFull(timestamp, isLive, is247) {
  if (is247) return '24/7 Continuous Stream';
  if (isLive) return 'Broadcast Live Now';
  if (!timestamp) return 'Scheduled Event';
  
  const date = new Date(timestamp);
  const dateStr = date.toLocaleDateString([], { month: 'short', day: 'numeric' });
  const timeStr = date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `${dateStr} &bull; ${timeStr} (${userTimezone})`;
}

// ─── Stream Resolution & Watch Click ─────────────────────────────────────────

window.handleWatchClick = async function(cleanId, title, league = 'Sports') {
  playerSection.classList.remove('hidden');
  playingTitle.textContent = title;
  playerLeagueTag.textContent = league;
  showPlayerAlert(null);
  showPlayerOverlay(true, 'Resolving live stream sources across providers...');
  serverSelect.innerHTML = '<option value="">Searching stream servers...</option>';
  streamUrlDisplay.textContent = 'Resolving...';

  // Smooth scroll to video player
  playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

  try {
    let streams = [];

    // Primary: /stream/sports/{id}.json
    try {
      const res = await fetch(buildApiUrl(`/stream/sports/${cleanId}.json`), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        streams = json.streams || [];
      }
    } catch (_) {}

    // Fallback: /stream/tv/nuvio_sport_{id}.json
    if (!streams.length) {
      try {
        const res = await fetch(buildApiUrl(`/stream/tv/nuvio_sport_${cleanId}.json`), { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          streams = json.streams || [];
        }
      } catch (_) {}
    }

    if (!streams || streams.length === 0) {
      showPlayerOverlay(false);
      showPlayerAlert('warning', 'No active streams available yet for this match. For upcoming matches, streams typically go live 15-30 minutes prior to kickoff.');
      serverSelect.innerHTML = '<option value="">No streams found</option>';
      playerSourceCount.textContent = '0 Streams';
      return;
    }

    currentStreams = streams;
    playerSourceCount.textContent = `${streams.length} Stream${streams.length === 1 ? '' : 's'}`;

    // Populate server selector dropdown with clean, informative labels
    serverSelect.innerHTML = streams.map((s, idx) => {
      const provider = s._source ? `[${s._source.toUpperCase()}] ` : '';
      const label = (s.title || s.name || `Server ${idx + 1}`).split('\n')[0];
      const res = s.resolution || s.quality ? ` • ${s.resolution || s.quality}` : '';
      const isWeb = !!s.externalUrl ? ' (Web Player)' : '';
      return `<option value="${idx}">Server ${idx + 1}: ${provider}${escapeHtml(label)}${res}${isWeb}</option>`;
    }).join('');

    playStreamIndex(0);

  } catch (err) {
    console.error('Error fetching stream:', err);
    showPlayerOverlay(false);
    showPlayerAlert('danger', 'Failed to fetch streams. Make sure the backend API is online.');
  }
};

// ─── Stream Target Parsing ───────────────────────────────────────────────────

function parseStreamTarget(streamObj) {
  if (!streamObj) return { directUrl: '', proxyUrl: '', isExternal: false, provider: '' };
  
  const provider = streamObj._source || 'stream';
  let raw = streamObj.url || streamObj.externalUrl || '';
  if (!raw) return { directUrl: '', proxyUrl: '', isExternal: false, provider };

  // Resolve media URL (handles relative paths, internal container IPs, and appends tokens)
  raw = resolveMediaUrl(raw);

  try {
    const parsed = new URL(raw);
    if (parsed.pathname === '/api/manifest' && parsed.searchParams.has('url')) {
      const direct = parsed.searchParams.get('url');
      return {
        directUrl: direct,
        proxyUrl: raw,
        isExternal: false,
        provider
      };
    }
    if (parsed.pathname === '/watch' || raw.includes('/embed/')) {
      return {
        directUrl: raw,
        proxyUrl: raw,
        isExternal: true,
        provider
      };
    }
  } catch (_) {}

  return {
    directUrl: raw,
    proxyUrl: buildApiUrl('/api/manifest', { url: raw }),
    isExternal: false,
    provider
  };
}

function playStreamIndex(index, options = {}) {
  const streamObj = currentStreams[index];
  if (!streamObj) return;
  activeStreamInfo = parseStreamTarget(streamObj);
  playCurrentStream(options);
}

// ─── Playback Controller (HLS + Web Embed) ───────────────────────────────────

function playCurrentStream(options = {}) {
  if (!activeStreamInfo) return;
  const { forceProxy = false, isRetry = false } = options;

  showPlayerAlert(null);

  // 1. Web Embed Mode (iframe)
  if (activeStreamInfo.isExternal) {
    teardownHls();
    videoPlayer.classList.add('hidden');
    embedFrame.classList.remove('hidden');
    embedFrame.src = activeStreamInfo.directUrl;
    streamTypeTag.textContent = 'Web Player';
    streamUrlDisplay.textContent = activeStreamInfo.directUrl.slice(0, 45) + '...';
    showPlayerOverlay(false);
    showToast('Loaded embed stream player', 'info');
    return;
  }

  // 2. HLS Video Mode
  embedFrame.classList.add('hidden');
  embedFrame.removeAttribute('src');
  videoPlayer.classList.remove('hidden');

  const useProxy = forceProxy || proxyCheckbox.checked;
  const targetUrl = useProxy ? activeStreamInfo.proxyUrl : activeStreamInfo.directUrl;

  proxyCheckbox.checked = useProxy;
  streamTypeTag.textContent = useProxy ? 'HLS (Proxy)' : 'HLS Direct';
  streamUrlDisplay.textContent = targetUrl.slice(0, 45) + '...';

  showPlayerOverlay(true, useProxy ? 'Streaming via Local Reverse Proxy...' : 'Connecting to direct stream...');

  teardownHls();

  if (Hls.isSupported()) {
    // Custom Loader to rewrite child playlist and segment URLs via resolveMediaUrl
    class CustomHlsLoader extends Hls.DefaultConfig.loader {
      load(context, config, callbacks) {
        if (context && context.url) {
          context.url = resolveMediaUrl(context.url);
        }
        super.load(context, config, callbacks);
      }
    }

    hlsInstance = new Hls({
      loader: CustomHlsLoader,
      enableWorker: true,
      lowLatencyMode: true,
      manifestLoadingTimeOut: 15000,
      manifestLoadingMaxRetry: 3,
      levelLoadingTimeOut: 15000
    });

    hlsInstance.loadSource(targetUrl);
    hlsInstance.attachMedia(videoPlayer);

    hlsInstance.on(Hls.Events.MANIFEST_PARSED, () => {
      showPlayerOverlay(false);
      videoPlayer.play().catch(e => console.warn('Autoplay prevented:', e));
      showToast(`Stream playing via ${activeStreamInfo.provider.toUpperCase()}`, 'success');
    });

    hlsInstance.on(Hls.Events.ERROR, (event, data) => {
      console.warn('[HLS.js] Error event:', data);
      if (data.fatal) {
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Auto fallback from direct to proxy on CORS/Network error
            if (!useProxy && !isRetry) {
              console.log('[Player] Direct playback blocked. Auto-retrying via local proxy...');
              showToast('Direct stream blocked by CORS. Switching to Local Proxy...', 'warning');
              playCurrentStream({ forceProxy: true, isRetry: true });
              return;
            }
            teardownHls();
            showPlayerOverlay(false);
            showPlayerAlert('danger', 'Video stream failed to load. Please switch to another server from the dropdown above.');
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hlsInstance.recoverMediaError();
            break;
          default:
            teardownHls();
            showPlayerOverlay(false);
            showPlayerAlert('danger', 'Playback error encountered. Suggest selecting another server.');
            break;
        }
      }
    });

  } else if (videoPlayer.canPlayType('application/vnd.apple.mpegurl')) {
    // Native Safari / iOS HLS
    videoPlayer.src = targetUrl;
    videoPlayer.addEventListener('loadedmetadata', () => {
      showPlayerOverlay(false);
      videoPlayer.play();
    }, { once: true });

    videoPlayer.addEventListener('error', () => {
      if (!useProxy && !isRetry) {
        playCurrentStream({ forceProxy: true, isRetry: true });
        return;
      }
      showPlayerOverlay(false);
      showPlayerAlert('danger', 'Playback error. Please try another server.');
    }, { once: true });
  } else {
    showPlayerOverlay(false);
    showPlayerAlert('danger', 'HLS video playback is not supported on this device.');
  }
}

function teardownHls() {
  if (hlsInstance) {
    hlsInstance.destroy();
    hlsInstance = null;
  }
}

function closePlayer() {
  teardownHls();
  videoPlayer.pause();
  videoPlayer.removeAttribute('src');
  videoPlayer.load();
  embedFrame.removeAttribute('src');
  playerSection.classList.add('hidden');
}

// ─── UI Helper Functions ─────────────────────────────────────────────────────

function showPlayerOverlay(show, message = 'Loading stream...') {
  if (show) {
    playerOverlay.classList.remove('hidden');
    overlayMessage.textContent = message;
  } else {
    playerOverlay.classList.add('hidden');
  }
}

function showPlayerAlert(type, message) {
  if (!type || !message) {
    playerAlert.className = 'alert hidden';
    playerAlert.textContent = '';
    return;
  }
  playerAlert.className = `alert alert-${type}`;
  playerAlert.innerHTML = message;
}

function showCatalogAlert(type, message) {
  if (!type || !message) {
    catalogAlert.className = 'alert hidden';
    catalogAlert.textContent = '';
    return;
  }
  catalogAlert.className = `alert alert-${type}`;
  catalogAlert.innerHTML = message;
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span>${escapeHtml(message)}</span>`;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateY(10px)';
    setTimeout(() => toast.remove(), 300);
  }, 3500);
}

function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
