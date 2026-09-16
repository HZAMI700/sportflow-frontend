/**
 * app.js — SportFlow Prime Vision Sports Streaming Platform
 * Connects to GoDaddy Airo backend (with authenticated airoShareToken)
 * Features:
 *   - Instant Stale-While-Revalidate caching (0ms cold load)
 *   - Non-intrusive background sync with radar pulse indicator
 *   - ArtPlayer pro streaming integration (with quality, PiP, theater, mini-player)
 *   - In-player quick server switching
 *   - Robust stream target parsing (HLS direct/proxy vs Web embeds)
 *   - Hero spotlight match flipper
 *   - Dark & Light mode switcher with persistence
 *   - Quick streams sidebar
 */

// ─── Constants & Configuration ───────────────────────────────────────────────
const GODADDY_AIRO_URL = 'https://ahudwgrmu9.preview.c35.airoapp.ai/?airoShareToken=At3udpbq8UOL&preview=1';
const STORAGE_CACHE_KEY = 'sportflow_cached_matches_v2';
const STORAGE_THEME_KEY = 'sportflow_theme';
const STORAGE_FAVORITES_KEY = 'sportflow_favorites';

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

  // When hosted on Vercel or any non-localhost host, use /api/backend rewrite proxy
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

// ─── App State ───────────────────────────────────────────────────────────────
let allMatches = [];
let featuredMatches = [];
let heroIndex = 0;
let activeTab = 'all'; // 'all', 'live', 'upcoming', 'networks', 'favorites'
let activeCategory = 'all';
let currentSearch = '';
let currentSort = 'time-asc';
let pageLimit = 24;
let displayedCount = 24;

let favorites = JSON.parse(localStorage.getItem(STORAGE_FAVORITES_KEY) || '[]');
let currentStreams = [];
let activeStreamIndex = 0;
let activeStreamInfo = null;
let artInstance = null;

// ─── DOM References ──────────────────────────────────────────────────────────
const searchInput = document.getElementById('search-input');
const clearSearchBtn = document.getElementById('clear-search-btn');
const themeToggleBtn = document.getElementById('theme-toggle-btn');
const themeIcon = document.getElementById('theme-icon');
const dockThemeBtn = document.getElementById('dock-theme');
const dockThemeIcon = document.getElementById('dock-theme-icon');
const liveSyncPill = document.getElementById('live-sync-pill');
const syncText = document.getElementById('sync-text');
const apiEndpointLabel = document.getElementById('api-endpoint-label');

const quickStreamsList = document.getElementById('quick-streams-list');
const quickCountPill = document.getElementById('quick-count-pill');

const heroSection = document.getElementById('hero-spotlight');
const heroBg = document.getElementById('hero-bg');
const heroStatusPill = document.getElementById('hero-status-pill');
const heroTitle = document.getElementById('hero-title');
const heroLeagueTag = document.getElementById('hero-league-tag');
const heroTimeTag = document.getElementById('hero-time-tag');
const heroQualityTag = document.getElementById('hero-quality-tag');
const heroDesc = document.getElementById('hero-desc');
const heroWatchBtn = document.getElementById('hero-watch-btn');
const heroServersBtn = document.getElementById('hero-servers-btn');
const heroFavoriteBtn = document.getElementById('hero-favorite-btn');
const heroPrevBtn = document.getElementById('hero-prev-btn');
const heroNextBtn = document.getElementById('hero-next-btn');

const playerSection = document.getElementById('player-section');
const playingTitle = document.getElementById('playing-title');
const playerStatusTag = document.getElementById('player-status-tag');
const playerLeagueTag = document.getElementById('player-league-tag');
const playerSourceCount = document.getElementById('player-source-count');
const theaterBtn = document.getElementById('theater-btn');
const closePlayerBtn = document.getElementById('close-player-btn');
const artplayerContainer = document.getElementById('artplayer-container');
const embedFrame = document.getElementById('embed-frame');
const playerOverlay = document.getElementById('player-overlay');
const overlayMessage = document.getElementById('overlay-message');
const serverPillButtons = document.getElementById('server-pill-buttons');
const proxyCheckbox = document.getElementById('proxy-checkbox');

const liveStreamsGrid = document.getElementById('live-streams-grid');
const upcomingStreamsGrid = document.getElementById('upcoming-streams-grid');
const networksStreamsGrid = document.getElementById('networks-streams-grid');
const matchesGrid = document.getElementById('matches-grid');
const catalogHeading = document.getElementById('catalog-heading');
const catalogCountPill = document.getElementById('catalog-count-pill');
const sortSelect = document.getElementById('sort-select');
const loadMoreContainer = document.getElementById('load-more-container');
const loadMoreBtn = document.getElementById('load-more-btn');
const toastContainer = document.getElementById('toast-container');

// ─── Initialization ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initTheme();
  initEventListeners();
  initKeyboardShortcuts();

  // Instant 0ms Load: Read from cache immediately so user never sees a blank screen
  loadCachedMatches();

  // Non-blocking background sync from GoDaddy API
  syncMatchesInBackground();
});

// ─── Theme Management (Dark / Light) ─────────────────────────────────────────
function initTheme() {
  const savedTheme = localStorage.getItem(STORAGE_THEME_KEY) || 'dark';
  setTheme(savedTheme);
}

function setTheme(theme) {
  const isLight = theme === 'light';
  document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
  document.body.className = isLight ? 'theme-light' : 'theme-dark';
  const icon = isLight ? '🌙' : '☀️';
  if (themeIcon) themeIcon.textContent = icon;
  if (dockThemeIcon) dockThemeIcon.textContent = icon;
  localStorage.setItem(STORAGE_THEME_KEY, theme);
}

function toggleTheme() {
  const current = document.documentElement.getAttribute('data-theme') || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  setTheme(next);
  showToast(`Switched to ${next.toUpperCase()} mode`, 'info');
}

// ─── Event Listeners ─────────────────────────────────────────────────────────
function initEventListeners() {
  if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
  if (dockThemeBtn) dockThemeBtn.addEventListener('click', toggleTheme);

  // Search input
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      currentSearch = e.target.value.toLowerCase().trim();
      clearSearchBtn.classList.toggle('hidden', !currentSearch);
      displayedCount = pageLimit;
      renderAllSections();
    });
  }

  if (clearSearchBtn) {
    clearSearchBtn.addEventListener('click', () => {
      searchInput.value = '';
      currentSearch = '';
      clearSearchBtn.classList.add('hidden');
      displayedCount = pageLimit;
      renderAllSections();
    });
  }

  // Top category pills
  document.querySelectorAll('.top-cat-pill').forEach(pill => {
    pill.addEventListener('click', (e) => {
      document.querySelectorAll('.top-cat-pill').forEach(p => p.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      activeCategory = target.dataset.category || 'all';
      displayedCount = pageLimit;
      renderAllSections();
      // Scroll to catalog
      document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Sidebar navigation
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => i.classList.remove('active'));
      const target = e.currentTarget;
      target.classList.add('active');
      activeTab = target.dataset.tab || 'all';
      syncDockActive();
      displayedCount = pageLimit;
      renderAllSections();
      document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
    });
  });

  // Floating dock navigation
  document.querySelectorAll('.floating-bottom-dock .dock-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      const tab = e.currentTarget.dataset.tab;
      if (tab) {
        activeTab = tab;
        syncSidebarActive();
        syncDockActive();
        displayedCount = pageLimit;
        renderAllSections();
        document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
      }
    });
  });

  // Floating dock refresh button
  document.getElementById('dock-refresh')?.addEventListener('click', () => {
    syncMatchesInBackground(true);
    showToast('Refreshing live stream catalog...', 'info');
  });

  // Hero carousel arrows
  if (heroPrevBtn) {
    heroPrevBtn.addEventListener('click', () => {
      if (featuredMatches.length > 0) {
        heroIndex = (heroIndex - 1 + featuredMatches.length) % featuredMatches.length;
        renderHeroSpotlight();
      }
    });
  }
  if (heroNextBtn) {
    heroNextBtn.addEventListener('click', () => {
      if (featuredMatches.length > 0) {
        heroIndex = (heroIndex + 1) % featuredMatches.length;
        renderHeroSpotlight();
      }
    });
  }

  // Hero watch button
  if (heroWatchBtn) {
    heroWatchBtn.addEventListener('click', () => {
      if (featuredMatches[heroIndex]) {
        const m = featuredMatches[heroIndex];
        handleWatchClick(m.cleanId, m.title, m.league);
      }
    });
  }

  // Hero servers button
  if (heroServersBtn) {
    heroServersBtn.addEventListener('click', () => {
      if (featuredMatches[heroIndex]) {
        const m = featuredMatches[heroIndex];
        handleWatchClick(m.cleanId, m.title, m.league);
      }
    });
  }

  // Hero favorite button
  if (heroFavoriteBtn) {
    heroFavoriteBtn.addEventListener('click', () => {
      if (featuredMatches[heroIndex]) {
        toggleFavorite(featuredMatches[heroIndex].cleanId);
      }
    });
  }

  // Theater mode button
  if (theaterBtn) {
    theaterBtn.addEventListener('click', () => {
      playerSection.classList.toggle('theater-mode');
    });
  }

  // Close player button
  if (closePlayerBtn) {
    closePlayerBtn.addEventListener('click', closePlayer);
  }

  // Proxy toggle
  if (proxyCheckbox) {
    proxyCheckbox.addEventListener('change', () => {
      if (activeStreamInfo) {
        playCurrentStream({ forceProxy: proxyCheckbox.checked, isRetry: true });
        showToast(proxyCheckbox.checked ? 'Reverse Proxy Enabled' : 'Direct Playback Enabled', 'info');
      }
    });
  }

  // Sort select
  if (sortSelect) {
    sortSelect.addEventListener('change', (e) => {
      currentSort = e.target.value;
      renderCatalogGrid();
    });
  }

  // Load more button
  if (loadMoreBtn) {
    loadMoreBtn.addEventListener('click', () => {
      displayedCount += pageLimit;
      renderCatalogGrid();
    });
  }
}

function syncSidebarActive() {
  document.querySelectorAll('.sidebar-nav .nav-item').forEach(i => {
    i.classList.toggle('active', i.dataset.tab === activeTab);
  });
}

function syncDockActive() {
  document.querySelectorAll('.floating-bottom-dock .dock-btn').forEach(b => {
    b.classList.toggle('active', b.dataset.tab === activeTab);
  });
}

function initKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    if (e.key === '/' && document.activeElement !== searchInput) {
      e.preventDefault();
      searchInput.focus();
    }
    if (e.key === 'Escape' && !playerSection.classList.contains('hidden')) {
      closePlayer();
    }
  });
}

// ─── Instant Local Caching (0ms Stale-While-Revalidate) ───────────────────────
function loadCachedMatches() {
  try {
    const raw = localStorage.getItem(STORAGE_CACHE_KEY);
    if (raw) {
      const cached = JSON.parse(raw);
      if (Array.isArray(cached) && cached.length > 0) {
        allMatches = cached;
        extractFeaturedMatches();
        renderAllSections();
        if (syncText) syncText.textContent = `Cached (${allMatches.length})`;
      }
    }
  } catch (err) {
    console.warn('[Cache] Could not parse cached matches:', err);
  }
}

function saveMatchesToCache(matches) {
  try {
    localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(matches));
  } catch (_) {}
}

// ─── Non-Blocking Background Sync ───────────────────────────────────────────
async function syncMatchesInBackground(showFeedback = false) {
  if (liveSyncPill) liveSyncPill.classList.add('syncing');
  if (syncText) syncText.textContent = 'Syncing...';
  if (apiEndpointLabel) apiEndpointLabel.textContent = API_BASE.includes('airoapp.ai') ? 'Cloud API' : API_BASE;

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

    // Attempt 3: Combine /catalog/sports/live.json + upcoming.json
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

    // Attempt 4: Standard Stremio addon catalogs /catalog/tv/nuvio_sports_live.json
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

    if (rawItems.length > 0) {
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

      saveMatchesToCache(allMatches);
      extractFeaturedMatches();
      renderAllSections();

      if (liveSyncPill) liveSyncPill.classList.remove('syncing');
      if (syncText) syncText.textContent = `Live (${allMatches.length} Synced)`;
      if (showFeedback) showToast(`Synchronized ${allMatches.length} live matches`, 'success');
    } else {
      // If network sync returned 0 items but we have cached matches, stay calm and keep displaying cache
      if (liveSyncPill) liveSyncPill.classList.remove('syncing');
      if (syncText) syncText.textContent = allMatches.length > 0 ? `Live (${allMatches.length})` : 'Ready';
    }
  } catch (err) {
    console.warn('[Sync] Background sync encountered notice:', err.message);
    if (liveSyncPill) liveSyncPill.classList.remove('syncing');
    if (syncText) syncText.textContent = allMatches.length > 0 ? `Live (${allMatches.length})` : 'Offline';
  }
}

function extractFeaturedMatches() {
  // Select top 8 live or popular matches with posters for the hero carousel
  const liveWithPosters = allMatches.filter(m => m.isLive && m.poster);
  const otherMatches = allMatches.filter(m => !m.isLive);
  featuredMatches = [...liveWithPosters, ...otherMatches].slice(0, 10);
  if (heroIndex >= featuredMatches.length) heroIndex = 0;
}

// ─── Master Section Renderers ────────────────────────────────────────────────
function renderAllSections() {
  renderHeroSpotlight();
  renderQuickStreams();
  renderLiveCarousel();
  renderUpcomingCarousel();
  renderNetworksCarousel();
  renderCatalogGrid();
}

// ─── Hero Spotlight Card (Matching Reference Screenshot) ─────────────────────
function renderHeroSpotlight() {
  if (!featuredMatches.length) return;
  const current = featuredMatches[heroIndex] || featuredMatches[0];
  if (!current) return;

  if (heroBg) {
    heroBg.style.backgroundImage = `url('${current.poster}')`;
  }
  if (heroTitle) {
    heroTitle.textContent = current.title;
  }
  if (heroLeagueTag) {
    heroLeagueTag.textContent = current.league || current.category.toUpperCase();
  }
  if (heroTimeTag) {
    heroTimeTag.textContent = current.isLive ? '🔴 Live Broadcast' : formatKickoffTime(current.date);
  }
  if (heroQualityTag) {
    heroQualityTag.textContent = `⚡ ${current.sourcesCount} Server${current.sourcesCount === 1 ? '' : 's'}`;
  }
  if (heroDesc) {
    heroDesc.textContent = current.releaseInfo || `Live sports coverage across multiple high-speed servers. Direct HLS and local reverse proxy relay available.`;
  }

  if (heroStatusPill) {
    heroStatusPill.textContent = current.isLive ? '● LIVE BROADCAST' : '⏱️ UPCOMING FIXTURE';
    heroStatusPill.style.background = current.isLive ? 'var(--accent-red)' : '#334155';
  }

  if (heroFavoriteBtn) {
    const isFav = favorites.includes(current.cleanId);
    heroFavoriteBtn.style.color = isFav ? '#ef4444' : '#ffffff';
  }
}

// ─── Quick Streams in Left Sidebar ("Continue watching" style) ───────────────
function renderQuickStreams() {
  if (!quickStreamsList) return;
  const liveList = allMatches.filter(m => m.isLive).slice(0, 4);

  if (!liveList.length) {
    quickStreamsList.innerHTML = `<p style="font-size: 0.76rem; color: var(--text-dim); padding: 0.25rem 0;">No active live matches right now.</p>`;
    if (quickCountPill) quickCountPill.textContent = '0 Live';
    return;
  }

  if (quickCountPill) quickCountPill.textContent = `${liveList.length} Live`;

  quickStreamsList.innerHTML = liveList.map(m => {
    return `
      <div class="mini-stream-card" onclick="handleWatchClick('${escapeHtml(m.cleanId)}', '${escapeHtml(m.title.replace(/'/g, "\\'"))}', '${escapeHtml((m.league || m.category).replace(/'/g, "\\'"))}')">
        <img class="mini-thumb" src="${escapeHtml(m.poster)}" alt="" loading="lazy" onerror="this.src='${resolveMediaUrl('/img/placeholder?text=Sport&color=111827')}';">
        <div class="mini-info">
          <span class="mini-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</span>
          <span class="mini-sub">${m.is247 ? '📺 24/7 Channel' : '🔴 Live Now'}</span>
        </div>
        <span class="mini-play-icon">▶</span>
      </div>
    `;
  }).join('');
}

// ─── Live Streams Carousel ("You Might Like" style from screenshot) ───────────
function renderLiveCarousel() {
  if (!liveStreamsGrid) return;
  let liveMatches = allMatches.filter(m => m.isLive && !m.is247);

  // Apply search filter if active
  if (currentSearch) {
    liveMatches = liveMatches.filter(m => m.title.toLowerCase().includes(currentSearch) || m.category.includes(currentSearch));
  }

  if (!liveMatches.length) {
    liveStreamsGrid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--text-dim); font-size: 0.88rem; padding: 1rem 0;">No live fixtures matching current criteria.</p>`;
    return;
  }

  liveStreamsGrid.innerHTML = liveMatches.slice(0, 6).map(m => renderStreamCardHtml(m)).join('');
}

// ─── Upcoming Streams Carousel ───────────────────────────────────────────────
function renderUpcomingCarousel() {
  if (!upcomingStreamsGrid) return;
  let upcoming = allMatches.filter(m => !m.isLive && !m.is247);

  if (currentSearch) {
    upcoming = upcoming.filter(m => m.title.toLowerCase().includes(currentSearch) || m.category.includes(currentSearch));
  }

  const badge = document.getElementById('upcoming-count-badge');
  if (badge) badge.textContent = `${upcoming.length} Fixtures`;

  if (!upcoming.length) {
    upcomingStreamsGrid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--text-dim); font-size: 0.88rem; padding: 1rem 0;">No upcoming matches found.</p>`;
    return;
  }

  upcomingStreamsGrid.innerHTML = upcoming.slice(0, 6).map(m => renderStreamCardHtml(m)).join('');
}

// ─── 24/7 TV Networks Carousel ───────────────────────────────────────────────
function renderNetworksCarousel() {
  if (!networksStreamsGrid) return;
  let networks = allMatches.filter(m => m.is247);

  if (currentSearch) {
    networks = networks.filter(m => m.title.toLowerCase().includes(currentSearch) || m.category.includes(currentSearch));
  }

  if (!networks.length) {
    networksStreamsGrid.innerHTML = `<p style="grid-column: 1 / -1; color: var(--text-dim); font-size: 0.88rem; padding: 1rem 0;">No 24/7 channels found.</p>`;
    return;
  }

  networksStreamsGrid.innerHTML = networks.slice(0, 6).map(m => renderStreamCardHtml(m)).join('');
}

// ─── Stream Card HTML Generator (16:9 Curved Card with Red Play Button) ───────
function renderStreamCardHtml(m) {
  const isFav = favorites.includes(m.cleanId);
  const favIcon = isFav ? '❤️' : '🤍';
  const tagHtml = m.isLive
    ? '<span class="card-live-dot-tag">● LIVE</span>'
    : (m.is247 ? '<span class="card-sched-tag">📺 24/7</span>' : `<span class="card-sched-tag">${formatKickoffTime(m.date)}</span>`);

  return `
    <div class="stream-card" onclick="handleWatchClick('${escapeHtml(m.cleanId)}', '${escapeHtml(m.title.replace(/'/g, "\\'"))}', '${escapeHtml((m.league || m.category).replace(/'/g, "\\'"))}')">
      <img class="stream-card-backdrop" src="${escapeHtml(m.poster)}" alt="${escapeHtml(m.title)}" loading="lazy" onerror="this.src='${resolveMediaUrl('/img/placeholder?text=' + encodeURIComponent(m.category) + '&color=111827')}';">
      <div class="stream-card-top-tags">
        <span class="card-cat-tag">${escapeHtml(m.category.toUpperCase())}</span>
        ${tagHtml}
      </div>
      <div class="stream-card-overlay">
        <div class="card-info">
          <h4 class="card-match-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</h4>
          <span class="card-match-meta">${escapeHtml(m.league || m.category.toUpperCase())} &bull; ${m.sourcesCount} Server${m.sourcesCount === 1 ? '' : 's'}</span>
        </div>
        <button class="card-play-btn" title="Watch Match" aria-label="Play">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
            <polygon points="5 3 19 12 5 21 5 3"></polygon>
          </svg>
        </button>
      </div>
    </div>
  `;
}

// ─── Filter & Render Catalog Grid ────────────────────────────────────────────
function renderCatalogGrid() {
  if (!matchesGrid) return;
  let list = allMatches;

  // Tab Filter
  if (activeTab === 'live') {
    list = list.filter(m => m.isLive && !m.is247);
  } else if (activeTab === 'upcoming') {
    list = list.filter(m => !m.isLive && !m.is247);
  } else if (activeTab === 'networks') {
    list = list.filter(m => m.is247);
  } else if (activeTab === 'favorites') {
    list = list.filter(m => favorites.includes(m.cleanId));
  }

  // Category Filter
  if (activeCategory !== 'all') {
    list = list.filter(m => {
      if (activeCategory === 'networks') return m.is247 || m.category === 'networks';
      return m.category.includes(activeCategory);
    });
  }

  // Search Filter
  if (currentSearch) {
    list = list.filter(m => m.title.toLowerCase().includes(currentSearch) || m.category.includes(currentSearch) || (m.league && m.league.toLowerCase().includes(currentSearch)));
  }

  // Sort
  if (currentSort === 'time-asc') {
    list.sort((a, b) => (a.date || Infinity) - (b.date || Infinity));
  } else if (currentSort === 'popular') {
    list.sort((a, b) => (b.popular ? 1 : 0) - (a.popular ? 1 : 0));
  } else if (currentSort === 'title') {
    list.sort((a, b) => a.title.localeCompare(b.title));
  } else if (currentSort === 'sources') {
    list.sort((a, b) => (b.sourcesCount || 1) - (a.sourcesCount || 1));
  }

  if (catalogCountPill) {
    catalogCountPill.textContent = `${list.length} Matches`;
  }
  if (catalogHeading) {
    catalogHeading.textContent = activeCategory !== 'all' ? `${activeCategory.toUpperCase()} Fixtures` : (activeTab === 'live' ? 'Live Matches' : 'All Fixtures');
  }

  if (!list.length) {
    matchesGrid.innerHTML = `
      <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-dim);">
        <p style="font-size: 1.1rem; font-weight: 700;">No matches found matching criteria</p>
        <p style="font-size: 0.85rem; margin-top: 0.25rem;">Try selecting another sport category or clearing your search.</p>
      </div>
    `;
    if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
    return;
  }

  const slice = list.slice(0, displayedCount);
  matchesGrid.innerHTML = slice.map(m => renderStreamCardHtml(m)).join('');

  if (loadMoreContainer) {
    loadMoreContainer.classList.toggle('hidden', displayedCount >= list.length);
  }
}

// ─── Time Formatting Helpers ─────────────────────────────────────────────────
function formatKickoffTime(timestamp) {
  if (!timestamp) return '24/7 TV';
  const now = Date.now();
  const diffMinutes = Math.round((timestamp - now) / 60000);

  if (diffMinutes <= 0 && diffMinutes >= -150) {
    return '🔴 LIVE NOW';
  }
  if (diffMinutes > 0 && diffMinutes <= 60) {
    return `In ${diffMinutes}m`;
  }

  const d = new Date(timestamp);
  return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// ─── Pro Video Player Engine (ArtPlayer + Web Embed Relay) ───────────────────
window.handleWatchClick = async function(cleanId, title, league = 'Sports') {
  playerSection.classList.remove('hidden');
  playingTitle.textContent = title;
  playerLeagueTag.textContent = league;
  showPlayerOverlay(true, 'Resolving pro stream servers across providers...');
  if (serverPillButtons) serverPillButtons.innerHTML = '<span style="font-size:0.75rem; color:var(--text-dim);">Searching servers...</span>';

  // Smooth scroll to cinema player
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
      showToast('No active servers available yet for this match. Streams typically go live 15-30m before kickoff.', 'warning');
      playerSourceCount.textContent = '0 Servers';
      return;
    }

    currentStreams = streams;
    playerSourceCount.textContent = `${streams.length} Server${streams.length === 1 ? '' : 's'}`;

    // Populate server pill buttons on the cinema toolbar
    if (serverPillButtons) {
      serverPillButtons.innerHTML = streams.map((s, idx) => {
        const prov = s._source ? `[${s._source.toUpperCase()}] ` : '';
        const res = s.resolution || s.quality ? ` • ${s.resolution || s.quality}` : '';
        const isWeb = !!s.externalUrl ? ' (Web)' : '';
        return `<button class="server-pill-btn ${idx === 0 ? 'active' : ''}" onclick="playStreamIndex(${idx})">${prov}Server ${idx + 1}${res}${isWeb}</button>`;
      }).join('');
    }

    playStreamIndex(0);

  } catch (err) {
    console.error('Error fetching stream:', err);
    showPlayerOverlay(false);
    showToast('Failed to resolve streams from backend', 'danger');
  }
};

window.playStreamIndex = function(index) {
  if (!currentStreams || !currentStreams[index]) return;
  activeStreamIndex = index;

  // Update active pill
  document.querySelectorAll('.server-pill-btn').forEach((btn, idx) => {
    btn.classList.toggle('active', idx === index);
  });

  activeStreamInfo = parseStreamTarget(currentStreams[index]);
  playCurrentStream();
};

function parseStreamTarget(streamObj) {
  if (!streamObj) return { directUrl: '', proxyUrl: '', isExternal: false, provider: '' };
  const provider = streamObj._source || 'stream';

  // 1. Explicit external web embed URL from backend
  if (streamObj.externalUrl) {
    const resolved = resolveMediaUrl(streamObj.externalUrl);
    return {
      directUrl: resolved,
      proxyUrl: resolved,
      isExternal: true,
      provider
    };
  }

  let raw = streamObj.url || '';
  if (!raw) return { directUrl: '', proxyUrl: '', isExternal: false, provider };

  raw = resolveMediaUrl(raw);

  // 2. Parse URL with base to handle relative URLs (/watch or /api/manifest)
  try {
    const parsed = new URL(raw, window.location.origin);
    if (parsed.pathname === '/watch' || raw.includes('/embed/')) {
      return {
        directUrl: raw,
        proxyUrl: raw,
        isExternal: true,
        provider
      };
    }
    if (parsed.pathname === '/api/manifest' && parsed.searchParams.has('url')) {
      const direct = parsed.searchParams.get('url');
      return {
        directUrl: direct,
        proxyUrl: raw,
        isExternal: false,
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

function playCurrentStream(options = {}) {
  if (!activeStreamInfo) return;
  const { forceProxy = false, isRetry = false } = options;

  // ─── Mode 1: Web Embed Stream (iframe) ───────────────────────────────────
  if (activeStreamInfo.isExternal) {
    teardownArtPlayer();
    artplayerContainer.classList.add('hidden');
    embedFrame.classList.remove('hidden');
    embedFrame.src = activeStreamInfo.directUrl;
    playerStatusTag.textContent = '● WEB STREAM';
    showPlayerOverlay(false);
    showToast(`Playing via ${activeStreamInfo.provider.toUpperCase()} (Web)`, 'info');
    return;
  }

  // ─── Mode 2: HLS Video Stream (ArtPlayer + Hls.js) ─────────────────────────
  embedFrame.classList.add('hidden');
  embedFrame.removeAttribute('src');
  artplayerContainer.classList.remove('hidden');

  const useProxy = forceProxy || (proxyCheckbox && proxyCheckbox.checked);
  const targetUrl = useProxy ? activeStreamInfo.proxyUrl : activeStreamInfo.directUrl;
  if (proxyCheckbox) proxyCheckbox.checked = useProxy;

  playerStatusTag.textContent = useProxy ? '● HLS PROXY' : '● HLS DIRECT';
  showPlayerOverlay(true, useProxy ? 'Streaming via Reverse Proxy...' : 'Connecting to direct HLS stream...');

  teardownArtPlayer();

  // Custom Hls Loader that rewrites child manifests & TS video segments
  class CustomHlsLoader extends Hls.DefaultConfig.loader {
    load(context, config, callbacks) {
      if (context && context.url) {
        context.url = resolveMediaUrl(context.url);
      }
      super.load(context, config, callbacks);
    }
  }

  try {
    artInstance = new Artplayer({
      container: '#artplayer-container',
      url: targetUrl,
      type: 'm3u8',
      customType: {
        m3u8: function (video, url, art) {
          if (Hls.isSupported()) {
            if (art.hls) art.hls.destroy();
            const hls = new Hls({
              loader: CustomHlsLoader,
              enableWorker: true,
              lowLatencyMode: true,
              manifestLoadingTimeOut: 16000,
              manifestLoadingMaxRetry: 3,
              levelLoadingTimeOut: 16000
            });
            hls.loadSource(url);
            hls.attachMedia(video);
            art.hls = hls;

            hls.on(Hls.Events.MANIFEST_PARSED, () => {
              showPlayerOverlay(false);
              video.play().catch(() => console.log('Autoplay deferred'));
            });

            hls.on(Hls.Events.ERROR, (event, data) => {
              if (data.fatal) {
                switch (data.type) {
                  case Hls.ErrorTypes.NETWORK_ERROR:
                    if (!useProxy && !isRetry) {
                      console.log('[ArtPlayer] Direct blocked. Auto-retrying via Proxy...');
                      showToast('Direct stream blocked by CORS. Switching to Proxy...', 'warning');
                      playCurrentStream({ forceProxy: true, isRetry: true });
                      return;
                    }
                    showPlayerOverlay(false);
                    showToast('Stream server failed. Please switch to another server above.', 'warning');
                    break;
                  case Hls.ErrorTypes.MEDIA_ERROR:
                    hls.recoverMediaError();
                    break;
                  default:
                    showPlayerOverlay(false);
                    break;
                }
              }
            });

            art.on('destroy', () => hls.destroy());
          } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
            video.src = url;
            video.addEventListener('loadedmetadata', () => {
              showPlayerOverlay(false);
              video.play();
            }, { once: true });
          }
        }
      },
      theme: '#ef4444',
      volume: 0.8,
      autoplay: true,
      pip: true,
      fullscreen: true,
      fullscreenWeb: true,
      setting: true,
      playbackRate: true,
      aspectRatio: true,
      miniProgressBar: true,
      autoSize: true,
      autoMini: true
    });

    artInstance.on('ready', () => {
      showPlayerOverlay(false);
    });

  } catch (err) {
    console.error('ArtPlayer init error:', err);
    showPlayerOverlay(false);
  }
}

function teardownArtPlayer() {
  if (artInstance) {
    try { artInstance.destroy(); } catch (_) {}
    artInstance = null;
  }
}

function closePlayer() {
  teardownArtPlayer();
  embedFrame.removeAttribute('src');
  playerSection.classList.add('hidden');
}

function showPlayerOverlay(show, message = 'Loading stream...') {
  if (!playerOverlay) return;
  if (show) {
    playerOverlay.classList.remove('hidden');
    if (overlayMessage) overlayMessage.textContent = message;
  } else {
    playerOverlay.classList.add('hidden');
  }
}

// ─── Favorites Feature ───────────────────────────────────────────────────────
function toggleFavorite(cleanId) {
  const idx = favorites.indexOf(cleanId);
  if (idx > -1) {
    favorites.splice(idx, 1);
    showToast('Removed from favorites', 'info');
  } else {
    favorites.push(cleanId);
    showToast('Saved to favorites', 'success');
  }
  localStorage.setItem(STORAGE_FAVORITES_KEY, JSON.stringify(favorites));
  renderHeroSpotlight();
  if (activeTab === 'favorites') renderCatalogGrid();
}

// ─── In-UI API Switcher ───────────────────────────────────────────────────────
window.promptChangeApi = function() {
  const input = prompt(
    'Configure Backend API Endpoint:\n(e.g., /api/backend or ' + GODADDY_AIRO_URL + ' or http://localhost:7000)',
    API_BASE
  );
  if (input && input.trim()) {
    let val = input.trim().replace(/\/$/, '');
    if (val.includes('ahudwgrmu9.preview.c35.airoapp.ai') && !val.includes('airoShareToken')) {
      val = GODADDY_AIRO_URL;
    }
    API_BASE = val;
    localStorage.setItem('sportflow_api_base', API_BASE);
    if (apiEndpointLabel) apiEndpointLabel.textContent = API_BASE.includes('airoapp.ai') ? 'Cloud API' : API_BASE;
    syncMatchesInBackground(true);
    showToast(`Switched API to: ${API_BASE}`, 'info');
  }
};

// ─── Toast Notifications ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
  if (!toastContainer) return;
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
