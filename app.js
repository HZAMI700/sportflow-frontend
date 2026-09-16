/**
 * app.js — STREAM NARO Production Application Engine
 *
 * Core Subsystems:
 *   1. Intelligent Stream Selection & Auto-Recovery Fallback Engine
 *   2. Stale-While-Revalidate Catalog Sync (0ms cold boot)
 *   3. ArtPlayer Pro Custom Integration (Cyan Theme, PiP, Theater Mode)
 *   4. Zero-Leak API Proxy Communications (Internal routing only)
 *   5. Hero Spotlight Match Switcher with Cross-fade
 *   6. Responsive Multi-Sport Navigation & Quick Streams Drawer
 *   7. Theme Controller (Ultra-Dark Fantasy-Black / Clean Light)
 */

(function () {
  'use strict';

  // ─── Configuration & Storage Keys ──────────────────────────────────────────
  const INTERNAL_BACKEND_FALLBACK = 'https://ahudwgrmu9.preview.c35.airoapp.ai/?airoShareToken=At3udpbq8UOL&preview=1';
  const STORAGE_CACHE_KEY = 'streamnaro_cached_matches_v1';
  const STORAGE_THEME_KEY = 'streamnaro_theme';
  const STORAGE_FAVORITES_KEY = 'streamnaro_favorites';
  const MAX_RETRY_FALLBACKS = 4;

  // Resolve API Base without exposing controls or tokens in client UI
  function resolveApiBase() {
    // If running in browser on production / Vercel, route through reverse-proxy
    const isWebHosted = typeof window !== 'undefined' &&
      window.location.protocol.startsWith('http') &&
      !window.location.hostname.includes('localhost') &&
      !window.location.hostname.includes('127.0.0.1');

    return isWebHosted ? '/api/backend' : INTERNAL_BACKEND_FALLBACK;
  }

  const API_BASE = resolveApiBase();

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

    const merged = new URLSearchParams();
    for (const [k, v] of baseParams.entries()) merged.set(k, v);
    for (const [k, v] of endpointParams.entries()) merged.set(k, v);
    for (const [k, v] of Object.entries(extraParams)) {
      if (v !== undefined && v !== null) merged.set(k, v);
    }

    const qs = merged.toString();
    return `${originAndPath}${pathOnly}${qs ? '?' + qs : ''}`;
  }

  function resolveMediaUrl(url) {
    if (!url || typeof url !== 'string') return '';
    const { originAndPath, baseParams, isRelative } = parseApiBase(API_BASE);
    let fixed = url;

    const locOrigin = window.location.origin;
    if (locOrigin && fixed.startsWith(locOrigin + '/api/manifest')) {
      fixed = fixed.replace(locOrigin, originAndPath);
    }
    if (locOrigin && fixed.startsWith(locOrigin + '/img')) {
      fixed = fixed.replace(locOrigin, originAndPath);
    }

    if (fixed.startsWith('/')) {
      if (!isRelative || !fixed.startsWith(originAndPath)) {
        fixed = `${originAndPath}${fixed}`;
      }
    } else {
      fixed = fixed.replace(/^http:\/\/(?:100\.\d+\.\d+\.\d+:\d+|169\.254\.\d+\.\d+:\d+|localhost:\d+|127\.0\.0\.1:\d+)/, originAndPath);
    }

    if (fixed.includes('ahudwgrmu9.preview.c35.airoapp.ai')) {
      try {
        const u = new URL(fixed);
        for (const [k, v] of baseParams.entries()) {
          if (!u.searchParams.has(k)) u.searchParams.set(k, v);
        }
        return u.toString();
      } catch (_) {}
    }

    return fixed;
  }

  // ─── Application State ───────────────────────────────────────────────────────
  let allMatches = [];
  let featuredMatches = [];
  let heroIndex = 0;
  let activeTab = 'all';
  let activeCategory = 'all';
  let currentSearch = '';
  let currentSort = 'time-asc';
  let displayedCount = 24;
  const pageLimit = 24;

  let favorites = [];
  try {
    favorites = JSON.parse(localStorage.getItem(STORAGE_FAVORITES_KEY) || '[]');
  } catch (_) {
    favorites = [];
  }

  // ─── Intelligent Stream Engine State ─────────────────────────────────────────
  let activeMatch = null;
  let currentCandidates = [];
  let activeCandidateIndex = 0;
  let fallbackAttemptCount = 0;
  let artInstance = null;
  let stallWatchdogTimer = null;
  const providerHealthScores = new Map(); // providerName -> score

  // ─── DOM Elements ───────────────────────────────────────────────────────────
  let searchInput, clearSearchBtn, themeToggleBtn, themeIconSun, themeIconMoon;
  let dockThemeBtn, dockThemeIcon, liveSyncPill, syncText;
  let quickStreamsList, quickCountPill;
  let heroBg, heroStatusPill, heroTitle, heroLeagueTag, heroTimeTag, heroQualityTag, heroDesc;
  let heroWatchBtn, heroFavoriteBtn, heroPrevBtn, heroNextBtn;
  let playerSection, playingTitle, playerStatusTag, playerLeagueTag, playerEngineTag;
  let theaterBtn, closePlayerBtn, artplayerContainer, embedFrame, playerOverlay, overlayMessage, overlayRetryBtn;
  let serverPillButtons;
  let liveStreamsGrid, liveCountBadge, upcomingStreamsGrid, upcomingCountBadge;
  let networksStreamsGrid, matchesGrid, catalogHeading, catalogCountPill, sortSelect;
  let loadMoreContainer, loadMoreBtn, toastContainer;

  // ─── Initialization ─────────────────────────────────────────────────────────
  document.addEventListener('DOMContentLoaded', () => {
    cacheDomElements();
    initTheme();
    initEventListeners();
    initKeyboardShortcuts();

    // 0ms Cold Start: render instantly from local cache
    loadCachedCatalog();

    // Non-blocking silent background synchronization
    syncCatalogInBackground();
  });

  function cacheDomElements() {
    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');
    themeToggleBtn = document.getElementById('theme-toggle-btn');
    themeIconSun = document.getElementById('theme-icon-sun');
    themeIconMoon = document.getElementById('theme-icon-moon');
    dockThemeBtn = document.getElementById('dock-theme');
    dockThemeIcon = document.getElementById('dock-theme-icon');
    liveSyncPill = document.getElementById('live-sync-pill');
    syncText = document.getElementById('sync-text');

    quickStreamsList = document.getElementById('quick-streams-list');
    quickCountPill = document.getElementById('quick-count-pill');

    heroBg = document.getElementById('hero-bg');
    heroStatusPill = document.getElementById('hero-status-pill');
    heroTitle = document.getElementById('hero-title');
    heroLeagueTag = document.getElementById('hero-league-tag');
    heroTimeTag = document.getElementById('hero-time-tag');
    heroQualityTag = document.getElementById('hero-quality-tag');
    heroDesc = document.getElementById('hero-desc');
    heroWatchBtn = document.getElementById('hero-watch-btn');
    heroFavoriteBtn = document.getElementById('hero-favorite-btn');
    heroPrevBtn = document.getElementById('hero-prev-btn');
    heroNextBtn = document.getElementById('hero-next-btn');

    playerSection = document.getElementById('player-section');
    playingTitle = document.getElementById('playing-title');
    playerStatusTag = document.getElementById('player-status-tag');
    playerLeagueTag = document.getElementById('player-league-tag');
    playerEngineTag = document.getElementById('player-engine-tag');
    theaterBtn = document.getElementById('theater-btn');
    closePlayerBtn = document.getElementById('close-player-btn');
    artplayerContainer = document.getElementById('artplayer-container');
    embedFrame = document.getElementById('embed-frame');
    playerOverlay = document.getElementById('player-overlay');
    overlayMessage = document.getElementById('overlay-message');
    overlayRetryBtn = document.getElementById('overlay-retry-btn');
    serverPillButtons = document.getElementById('server-pill-buttons');

    liveStreamsGrid = document.getElementById('live-streams-grid');
    liveCountBadge = document.getElementById('live-count-badge');
    upcomingStreamsGrid = document.getElementById('upcoming-streams-grid');
    upcomingCountBadge = document.getElementById('upcoming-count-badge');
    networksStreamsGrid = document.getElementById('networks-streams-grid');
    matchesGrid = document.getElementById('matches-grid');
    catalogHeading = document.getElementById('catalog-heading');
    catalogCountPill = document.getElementById('catalog-count-pill');
    sortSelect = document.getElementById('sort-select');
    loadMoreContainer = document.getElementById('load-more-container');
    loadMoreBtn = document.getElementById('load-more-btn');
    toastContainer = document.getElementById('toast-container');
  }

  // ─── Theme Management ────────────────────────────────────────────────────────
  function initTheme() {
    const saved = localStorage.getItem(STORAGE_THEME_KEY) || 'dark';
    setTheme(saved);
  }

  function setTheme(theme) {
    const isLight = theme === 'light';
    document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    document.body.className = isLight ? 'theme-light' : 'theme-dark';

    if (themeIconSun && themeIconMoon) {
      themeIconSun.classList.toggle('hidden', isLight);
      themeIconMoon.classList.toggle('hidden', !isLight);
    }
    if (dockThemeIcon) {
      dockThemeIcon.textContent = isLight ? '🌙' : '☀️';
    }
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    showToast(`Switched to ${next.toUpperCase()} theme`, 'info');
  }

  // ─── Event Listeners ────────────────────────────────────────────────────────
  function initEventListeners() {
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (dockThemeBtn) dockThemeBtn.addEventListener('click', toggleTheme);

    // Search Input
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim().toLowerCase();
        if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !currentSearch);
        renderCatalogGrid();
      });
    }

    if (clearSearchBtn) {
      clearSearchBtn.addEventListener('click', () => {
        if (searchInput) searchInput.value = '';
        currentSearch = '';
        clearSearchBtn.classList.add('hidden');
        renderCatalogGrid();
      });
    }

    // Category Pills Scroll
    document.querySelectorAll('#top-category-pills .top-cat-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        document.querySelectorAll('#top-category-pills .top-cat-pill').forEach(b => b.classList.remove('active'));
        e.currentTarget.classList.add('active');
        activeCategory = e.currentTarget.dataset.category || 'all';
        displayedCount = pageLimit;
        renderCatalogGrid();
        document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
      });
    });

    // Sidebar Navigation Links
    document.querySelectorAll('.sidebar-nav .nav-item').forEach(item => {
      item.addEventListener('click', (e) => {
        e.preventDefault();
        const tab = e.currentTarget.dataset.tab;
        if (tab) {
          activeTab = tab;
          syncSidebarActive();
          syncDockActive();
          displayedCount = pageLimit;
          renderCatalogGrid();
          document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Mobile Bottom Dock
    document.querySelectorAll('.floating-bottom-dock .dock-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const tab = e.currentTarget.dataset.tab;
        if (tab) {
          activeTab = tab;
          syncSidebarActive();
          syncDockActive();
          displayedCount = pageLimit;
          renderCatalogGrid();
          document.getElementById('catalog-section')?.scrollIntoView({ behavior: 'smooth' });
        }
      });
    });

    // Refresh Dock Button
    document.getElementById('dock-refresh')?.addEventListener('click', () => {
      syncCatalogInBackground(true);
      showToast('Checking for latest stream updates...', 'info');
    });

    // Hero Spotlight Carousel Switcher
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

    if (heroWatchBtn) {
      heroWatchBtn.addEventListener('click', () => {
        if (featuredMatches[heroIndex]) {
          const m = featuredMatches[heroIndex];
          handleWatchStream(m.cleanId, m.title, m.league || m.category);
        }
      });
    }

    if (heroFavoriteBtn) {
      heroFavoriteBtn.addEventListener('click', () => {
        if (featuredMatches[heroIndex]) {
          toggleFavorite(featuredMatches[heroIndex].cleanId);
        }
      });
    }

    // Player Actions
    if (theaterBtn) {
      theaterBtn.addEventListener('click', () => {
        playerSection.classList.toggle('theater-mode');
      });
    }

    if (closePlayerBtn) {
      closePlayerBtn.addEventListener('click', closePlayer);
    }

    if (overlayRetryBtn) {
      overlayRetryBtn.addEventListener('click', () => {
        fallbackAttemptCount = 0;
        startCandidatePlayback(activeCandidateIndex);
      });
    }

    // Sort Dropdown
    if (sortSelect) {
      sortSelect.addEventListener('change', (e) => {
        currentSort = e.target.value;
        renderCatalogGrid();
      });
    }

    // Load More Button
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
        searchInput?.focus();
      }
      if (e.key === 'Escape' && playerSection && !playerSection.classList.contains('hidden')) {
        closePlayer();
      }
    });
  }

  // ─── 0ms Cold Start Local Cache ─────────────────────────────────────────────
  function loadCachedCatalog() {
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
    } catch (_) {}
  }

  function saveCatalogToCache(matches) {
    try {
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(matches));
    } catch (_) {}
  }

  // ─── Silent Background Catalog Sync ─────────────────────────────────────────
  async function syncCatalogInBackground(isUserTriggered = false) {
    if (liveSyncPill) liveSyncPill.classList.add('syncing');
    if (syncText) syncText.textContent = 'Syncing...';

    try {
      let rawItems = [];

      // Strategy 1: Stremio sports catalog
      try {
        const res = await fetch(buildApiUrl('/catalog/sports/all.json'), { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          rawItems = json.metas || [];
        }
      } catch (_) {}

      // Strategy 2: Direct /api/matches
      if (!rawItems.length) {
        try {
          const res = await fetch(buildApiUrl('/api/matches'), { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            if (Array.isArray(json)) rawItems = json;
          }
        } catch (_) {}
      }

      // Strategy 3: Parallel live + upcoming split
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

      if (rawItems.length > 0) {
        const now = Date.now();

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

          const rawPoster = item.poster || item.background || item.thumbnail_url || buildApiUrl('/img/placeholder', { text: title, color: '0a0d14' });
          const poster = resolveMediaUrl(rawPoster);

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
            sourcesCount: item.sourcesCount || (item.sources && item.sources.length) || 1,
            poster: poster
          };
        });

        saveCatalogToCache(allMatches);
        extractFeaturedMatches();
        renderAllSections();

        if (liveSyncPill) liveSyncPill.classList.remove('syncing');
        if (syncText) syncText.textContent = `Live (${allMatches.length} Synced)`;
        if (isUserTriggered) showToast(`Synchronized ${allMatches.length} live streams`, 'success');
      } else {
        if (liveSyncPill) liveSyncPill.classList.remove('syncing');
        if (syncText) syncText.textContent = allMatches.length > 0 ? `Live (${allMatches.length})` : 'Connected';
      }
    } catch (_) {
      if (liveSyncPill) liveSyncPill.classList.remove('syncing');
      if (syncText) syncText.textContent = allMatches.length > 0 ? `Live (${allMatches.length})` : 'Live Stream';
    }
  }

  function extractFeaturedMatches() {
    const liveWithPosters = allMatches.filter(m => m.isLive && m.poster);
    const others = allMatches.filter(m => !m.isLive);
    featuredMatches = [...liveWithPosters, ...others].slice(0, 10);
    if (heroIndex >= featuredMatches.length) heroIndex = 0;
  }

  // ─── Master View Renderers ──────────────────────────────────────────────────
  function renderAllSections() {
    renderHeroSpotlight();
    renderQuickStreams();
    renderLiveCarousel();
    renderUpcomingCarousel();
    renderNetworksCarousel();
    renderCatalogGrid();
  }

  function renderHeroSpotlight() {
    if (!featuredMatches.length || !heroTitle) return;
    const m = featuredMatches[heroIndex] || featuredMatches[0];

    if (heroBg) {
      heroBg.style.backgroundImage = `url('${m.poster}')`;
    }
    if (heroStatusPill) {
      heroStatusPill.textContent = m.isLive ? '● LIVE BROADCAST' : 'UPCOMING FIXTURE';
      heroStatusPill.style.color = m.isLive ? '#ef4444' : 'var(--text-dim)';
    }
    if (heroTitle) heroTitle.textContent = m.title;
    if (heroLeagueTag) heroLeagueTag.textContent = m.league || m.category.toUpperCase();
    if (heroTimeTag) heroTimeTag.textContent = formatKickoffTime(m.date);
    if (heroQualityTag) heroQualityTag.textContent = `${m.sourcesCount} Server${m.sourcesCount === 1 ? '' : 's'}`;
    if (heroDesc) {
      heroDesc.textContent = m.isLive
        ? 'Broadcasting live now. Intelligent multi-server auto-failover active.'
        : `Scheduled fixture kick-off at ${formatKickoffTime(m.date)}. Stream sources will be online prior to kickoff.`;
    }

    if (heroFavoriteBtn) {
      const isFav = favorites.includes(m.cleanId);
      heroFavoriteBtn.style.color = isFav ? 'var(--accent-cyan)' : '#ffffff';
    }
  }

  function renderQuickStreams() {
    if (!quickStreamsList) return;
    const liveMatches = allMatches.filter(m => m.isLive).slice(0, 8);

    if (quickCountPill) {
      quickCountPill.textContent = `${liveMatches.length} Live`;
    }

    if (!liveMatches.length) {
      quickStreamsList.innerHTML = '<p style="font-size:0.75rem; color:var(--text-dim); padding:0.5rem;">No live matches right now.</p>';
      return;
    }

    quickStreamsList.innerHTML = liveMatches.map(m => `
      <div class="quick-item-card" onclick="window.STREAM_NARO.watch('${escapeHtml(m.cleanId)}', '${escapeHtml(m.title.replace(/'/g, "\\'"))}', '${escapeHtml((m.league || m.category).replace(/'/g, "\\'"))}')">
        <img class="quick-item-poster" src="${escapeHtml(m.poster)}" alt="" loading="lazy" onerror="this.src='${buildApiUrl('/img/placeholder', { text: m.category, color: '0a0d14' })}';">
        <div class="quick-item-info">
          <span class="quick-item-title">${escapeHtml(m.title)}</span>
          <span class="quick-item-meta">${escapeHtml(m.league || m.category.toUpperCase())}</span>
        </div>
      </div>
    `).join('');
  }

  function renderLiveCarousel() {
    if (!liveStreamsGrid) return;
    const list = allMatches.filter(m => m.isLive && !m.is247).slice(0, 16);

    if (liveCountBadge) {
      liveCountBadge.textContent = `${list.length} On Air`;
    }

    if (!list.length) {
      liveStreamsGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-dim); padding:1rem;">No sports broadcast live at this second. Check upcoming fixtures below.</p>';
      return;
    }

    liveStreamsGrid.innerHTML = list.map(m => renderStreamCardHtml(m)).join('');
  }

  function renderUpcomingCarousel() {
    if (!upcomingStreamsGrid) return;
    const list = allMatches.filter(m => !m.isLive && !m.is247).slice(0, 16);

    if (upcomingCountBadge) {
      upcomingCountBadge.textContent = `${list.length} Matches`;
    }

    if (!list.length) {
      upcomingStreamsGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-dim); padding:1rem;">All current fixtures are broadcast live.</p>';
      return;
    }

    upcomingStreamsGrid.innerHTML = list.map(m => renderStreamCardHtml(m)).join('');
  }

  function renderNetworksCarousel() {
    if (!networksStreamsGrid) return;
    const list = allMatches.filter(m => m.is247).slice(0, 16);

    if (!list.length) {
      networksStreamsGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-dim); padding:1rem;">No 24/7 networks configured.</p>';
      return;
    }

    networksStreamsGrid.innerHTML = list.map(m => renderStreamCardHtml(m)).join('');
  }

  function renderStreamCardHtml(m) {
    const tagHtml = m.isLive
      ? '<span class="card-live-dot-tag">● LIVE</span>'
      : (m.is247 ? '<span class="card-sched-tag">📺 24/7 TV</span>' : `<span class="card-sched-tag">${formatKickoffTime(m.date)}</span>`);

    return `
      <div class="stream-card" onclick="window.STREAM_NARO.watch('${escapeHtml(m.cleanId)}', '${escapeHtml(m.title.replace(/'/g, "\\'"))}', '${escapeHtml((m.league || m.category).replace(/'/g, "\\'"))}')">
        <img class="stream-card-backdrop" src="${escapeHtml(m.poster)}" alt="${escapeHtml(m.title)}" loading="lazy" onerror="this.src='${buildApiUrl('/img/placeholder', { text: m.category, color: '0a0d14' })}';">
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
      list = list.filter(m =>
        m.title.toLowerCase().includes(currentSearch) ||
        m.category.includes(currentSearch) ||
        (m.league && m.league.toLowerCase().includes(currentSearch))
      );
    }

    // Sorting
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
      catalogHeading.textContent = activeCategory !== 'all'
        ? `${activeCategory.toUpperCase()} Fixtures`
        : (activeTab === 'live' ? 'Live Matches' : 'All Fixtures');
    }

    if (!list.length) {
      matchesGrid.innerHTML = `
        <div style="grid-column: 1 / -1; text-align: center; padding: 3rem; color: var(--text-dim);">
          <p style="font-size: 1.05rem; font-weight: 700; color:var(--text-main);">No sports matches found</p>
          <p style="font-size: 0.85rem; margin-top: 0.35rem;">Try selecting another sport category or clearing search filters.</p>
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

  // ─── Time Formatting Helper ─────────────────────────────────────────────────
  function formatKickoffTime(timestamp) {
    if (!timestamp) return '24/7 Stream';
    const now = Date.now();
    const diff = Math.round((timestamp - now) / 60000);

    if (diff <= 0 && diff >= -150) return '🔴 LIVE NOW';
    if (diff > 0 && diff <= 60) return `In ${diff}m`;

    const d = new Date(timestamp);
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  // ─── Intelligent Stream Selection & Auto-Recovery Engine ─────────────────────
  async function handleWatchStream(cleanId, title, league = 'Sports') {
    if (!playerSection) return;

    activeMatch = { cleanId, title, league };
    playerSection.classList.remove('hidden');
    if (playingTitle) playingTitle.textContent = title;
    if (playerLeagueTag) playerLeagueTag.textContent = league;
    if (playerStatusTag) playerStatusTag.textContent = '● CONNECTING';
    if (playerEngineTag) playerEngineTag.textContent = 'Auto Selection';

    showPlayerOverlay(true, 'Intelligent stream engine discovering available servers...');
    if (overlayRetryBtn) overlayRetryBtn.classList.add('hidden');
    if (serverPillButtons) serverPillButtons.innerHTML = '<span style="font-size:0.75rem; color:var(--text-dim);">Analyzing sources...</span>';

    playerSection.scrollIntoView({ behavior: 'smooth', block: 'start' });

    try {
      let streams = [];

      // Step 1: Discover available servers from /stream/sports/{id}.json
      try {
        const res = await fetch(buildApiUrl(`/stream/sports/${cleanId}.json`), { cache: 'no-store' });
        if (res.ok) {
          const json = await res.json();
          streams = json.streams || [];
        }
      } catch (_) {}

      // Fallback: /stream/tv/{id}.json
      if (!streams.length) {
        try {
          const res = await fetch(buildApiUrl(`/stream/tv/${cleanId}.json`), { cache: 'no-store' });
          if (res.ok) {
            const json = await res.json();
            streams = json.streams || [];
          }
        } catch (_) {}
      }

      if (!streams.length) {
        showPlayerOverlay(true, 'No live stream sources available for this event yet.');
        if (overlayRetryBtn) overlayRetryBtn.classList.remove('hidden');
        return;
      }

      // Step 2: Parse and rank candidates
      currentCandidates = rankCandidates(streams.map((s, idx) => parseStreamCandidate(s, idx)));
      activeCandidateIndex = 0;
      fallbackAttemptCount = 0;

      // Render server selection pills for user reference / manual override
      renderServerPills();

      // Step 3: Automatically start playback with top candidate
      startCandidatePlayback(0);

    } catch (err) {
      console.error('[StreamEngine] Error initiating streams:', err);
      showPlayerOverlay(true, 'Unable to connect to stream sources. Please try again.');
      if (overlayRetryBtn) overlayRetryBtn.classList.remove('hidden');
    }
  }

  function parseStreamCandidate(s, index) {
    const rawName = s.name || s.title || `Server ${index + 1}`;
    const provider = (s._source || rawName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'stream').slice(0, 16);

    // 1. Explicit External Web Embed
    if (s.externalUrl) {
      const resolved = resolveMediaUrl(s.externalUrl);
      return {
        id: index,
        name: `Server ${index + 1} (${provider})`,
        provider: provider,
        type: 'embed',
        url: resolved,
        proxyUrl: resolved,
        isExternal: true
      };
    }

    let raw = s.url || '';
    raw = resolveMediaUrl(raw);

    // 2. Relative /watch or /embed
    try {
      const parsed = new URL(raw, window.location.origin);
      if (parsed.pathname === '/watch' || raw.includes('/embed/')) {
        return {
          id: index,
          name: `Server ${index + 1} (${provider})`,
          provider: provider,
          type: 'embed',
          url: raw,
          proxyUrl: raw,
          isExternal: true
        };
      }
      if (parsed.pathname === '/api/manifest' && parsed.searchParams.has('url')) {
        const direct = parsed.searchParams.get('url');
        return {
          id: index,
          name: `Server ${index + 1} (${provider})`,
          provider: provider,
          type: 'hls',
          url: direct,
          proxyUrl: raw,
          isExternal: false
        };
      }
    } catch (_) {}

    // 3. Direct HLS
    return {
      id: index,
      name: `Server ${index + 1} (${provider})`,
      provider: provider,
      type: 'hls',
      url: raw,
      proxyUrl: buildApiUrl('/api/manifest', { url: raw }),
      isExternal: false
    };
  }

  // Internal Server Ranking: Prioritize reliable providers & HLS direct
  function rankCandidates(candidates) {
    return candidates.sort((a, b) => {
      const scoreA = providerHealthScores.get(a.provider) || 0;
      const scoreB = providerHealthScores.get(b.provider) || 0;

      // Prefer servers with positive past success
      if (scoreA !== scoreB) return scoreB - scoreA;

      // HLS streams offer richer native control than embeds
      if (a.type !== b.type) return a.type === 'hls' ? -1 : 1;

      return 0;
    });
  }

  function renderServerPills() {
    if (!serverPillButtons) return;
    serverPillButtons.innerHTML = currentCandidates.map((c, idx) => `
      <button class="server-pill ${idx === activeCandidateIndex ? 'active' : ''}" 
              onclick="window.STREAM_NARO.selectServer(${idx})" 
              title="Switch to ${escapeHtml(c.name)}">
        ${escapeHtml(c.name)}
      </button>
    `).join('');
  }

  function selectServer(index) {
    if (index >= 0 && index < currentCandidates.length) {
      fallbackAttemptCount = 0; // reset retry counter on deliberate user choice
      startCandidatePlayback(index, { isManual: true });
    }
  }

  function startCandidatePlayback(index, options = {}) {
    if (index >= currentCandidates.length) {
      handleAllServersFailed();
      return;
    }

    activeCandidateIndex = index;
    const candidate = currentCandidates[index];
    renderServerPills();

    clearStallWatchdog();

    if (playerStatusTag) {
      playerStatusTag.textContent = candidate.type === 'embed' ? '● WEB STREAM' : '● HLS STREAM';
    }
    if (playerEngineTag) {
      playerEngineTag.textContent = options.isManual ? 'Manual Selection' : 'Auto Selection';
    }

    if (candidate.type === 'embed') {
      playEmbedStream(candidate);
    } else {
      playHlsStream(candidate, options.useProxy || false);
    }
  }

  function playEmbedStream(candidate) {
    teardownArtPlayer();
    if (artplayerContainer) artplayerContainer.classList.add('hidden');
    if (embedFrame) {
      embedFrame.classList.remove('hidden');
      embedFrame.src = candidate.url;
    }

    showPlayerOverlay(false);
    showToast(`Streaming via ${candidate.name}`, 'info');

    // Embed safety watchdog: if frame cannot load within 14s, consider fallback
    stallWatchdogTimer = setTimeout(() => {
      console.warn('[StreamEngine] Embed candidate watchdog timeout');
    }, 14000);
  }

  function playHlsStream(candidate, forceProxy = false) {
    if (embedFrame) {
      embedFrame.classList.add('hidden');
      embedFrame.removeAttribute('src');
    }
    if (artplayerContainer) artplayerContainer.classList.remove('hidden');

    const targetUrl = forceProxy ? candidate.proxyUrl : candidate.url;
    showPlayerOverlay(true, forceProxy ? 'Connecting via Relay Proxy...' : 'Connecting to direct live stream...');

    teardownArtPlayer();

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
                manifestLoadingTimeOut: 14000,
                manifestLoadingMaxRetry: 2,
                levelLoadingTimeOut: 14000
              });

              hls.loadSource(url);
              hls.attachMedia(video);
              art.hls = hls;

              hls.on(Hls.Events.MANIFEST_PARSED, () => {
                showPlayerOverlay(false);
                clearStallWatchdog();
                recordServerSuccess(candidate.provider);
                video.play().catch(() => {});
              });

              hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      if (!forceProxy) {
                        console.log('[StreamEngine] Direct failed on CORS. Auto-retrying candidate via Proxy...');
                        showToast('Direct stream blocked by CORS. Switching to Proxy...', 'warning');
                        playHlsStream(candidate, true);
                        return;
                      }
                      recordServerFailure(candidate.provider);
                      triggerAutoFallback('Stream server network failure');
                      break;

                    case Hls.ErrorTypes.MEDIA_ERROR:
                      try {
                        hls.recoverMediaError();
                      } catch (_) {
                        recordServerFailure(candidate.provider);
                        triggerAutoFallback('Media decoding error');
                      }
                      break;

                    default:
                      recordServerFailure(candidate.provider);
                      triggerAutoFallback('Playback stream fatal error');
                      break;
                  }
                }
              });

              art.on('destroy', () => hls.destroy());
            } else if (video.canPlayType('application/vnd.apple.mpegurl')) {
              // Native Safari HLS
              video.src = url;
              video.addEventListener('loadedmetadata', () => {
                showPlayerOverlay(false);
                clearStallWatchdog();
                recordServerSuccess(candidate.provider);
                video.play().catch(() => {});
              }, { once: true });

              video.addEventListener('error', () => {
                recordServerFailure(candidate.provider);
                triggerAutoFallback('Safari native stream error');
              }, { once: true });
            }
          }
        },
        theme: '#00f0ff',
        volume: 0.85,
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

      // Stall Watchdog: detect continuous freezing without forward progress
      armStallWatchdog();

    } catch (err) {
      console.error('[StreamEngine] ArtPlayer init failure:', err);
      triggerAutoFallback('Player init failure');
    }
  }

  function armStallWatchdog() {
    clearStallWatchdog();
    stallWatchdogTimer = setTimeout(() => {
      if (artInstance && artInstance.video) {
        if (artInstance.video.readyState < 2 || artInstance.video.paused) {
          console.log('[StreamEngine] Stall watchdog detected stream freeze');
          triggerAutoFallback('Stream stalled without data');
        }
      }
    }, 15000);
  }

  function clearStallWatchdog() {
    if (stallWatchdogTimer) {
      clearTimeout(stallWatchdogTimer);
      stallWatchdogTimer = null;
    }
  }

  // Transparent Auto-Fallback to Next Server Candidate
  function triggerAutoFallback(reason = 'Connection notice') {
    clearStallWatchdog();
    fallbackAttemptCount++;

    if (fallbackAttemptCount > MAX_RETRY_FALLBACKS || activeCandidateIndex + 1 >= currentCandidates.length) {
      handleAllServersFailed();
      return;
    }

    const nextIndex = activeCandidateIndex + 1;
    const nextCandidate = currentCandidates[nextIndex];
    console.log(`[StreamEngine] Auto-fallback triggered (${reason}). Moving to: ${nextCandidate.name}`);

    showPlayerOverlay(true, `Connecting to backup source: ${nextCandidate.name}...`);
    showToast(`Switching to backup source (${nextCandidate.name})...`, 'warning');

    setTimeout(() => {
      startCandidatePlayback(nextIndex);
    }, 400);
  }

  function handleAllServersFailed() {
    showPlayerOverlay(true, 'All available stream sources are currently unavailable for this fixture.');
    if (overlayRetryBtn) overlayRetryBtn.classList.remove('hidden');
    if (playerStatusTag) playerStatusTag.textContent = '● OFFLINE';
    showToast('All available stream sources failed. Click Retry to re-check.', 'warning');
  }

  function recordServerSuccess(provider) {
    const cur = providerHealthScores.get(provider) || 0;
    providerHealthScores.set(provider, cur + 2);
  }

  function recordServerFailure(provider) {
    const cur = providerHealthScores.get(provider) || 0;
    providerHealthScores.set(provider, cur - 3);
  }

  function teardownArtPlayer() {
    clearStallWatchdog();
    if (artInstance) {
      try { artInstance.destroy(); } catch (_) {}
      artInstance = null;
    }
  }

  function closePlayer() {
    teardownArtPlayer();
    if (embedFrame) {
      embedFrame.removeAttribute('src');
      embedFrame.classList.add('hidden');
    }
    if (playerSection) playerSection.classList.add('hidden');
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
      setTimeout(() => toast.remove(), 250);
    }, 3200);
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

  // ─── Public API for Inline DOM Handlers ─────────────────────────────────────
  window.STREAM_NARO = {
    watch: handleWatchStream,
    selectServer: selectServer,
    toggleFavorite: toggleFavorite
  };

  // Legacy fallback alias so any cached cards trigger cleanly
  window.handleWatchClick = handleWatchStream;

})();
