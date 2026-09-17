/**
 * app.js — STREAM NARO Production Application Engine
 *
 * Core Subsystems:
 *   1. Intelligent Stream Selection & Auto-Recovery Engine (Anti-Lag, Pre-Caching)
 *   2. Stale-While-Revalidate Catalog Sync (0ms cold boot)
 *   3. ArtPlayer Pro Custom Integration (Cyan Theme, PiP, Theater Mode)
 *   4. Clean Category Page Routing (/ufc-streams, /football, /basketball, etc.)
 *   5. Modern Carousel Slider Controls (< and > smooth slide, zero native scrollbars)
 *   6. Zero-Leak API Proxy Communications (Internal routing only)
 *   7. Responsive Multi-Sport Navigation & Quick Streams Drawer
 *   8. Theme Controller (Ultra-Dark Fantasy-Black / Clean Light)
 */

(function () {
  'use strict';

  // ═══════════════════════════════════════════════════════════════════════════
  // AD-BLOCKING ENGINE — 5-Layer Defense System (Zero Pop-Unders Guarantee)
  // ═══════════════════════════════════════════════════════════════════════════

  // Layer 1: Block ALL window.open() pop-unders from any source
  const _originalWindowOpen = window.open;
  let _allowedOpenCount = 0;
  window.open = function (...args) {
    // Only allow if explicitly triggered by our own code (never by ads)
    if (_allowedOpenCount > 0) {
      _allowedOpenCount--;
      return _originalWindowOpen.apply(window, args);
    }
    console.warn('[AdShield] Blocked pop-under attempt:', args[0]);
    return null;
  };

  // Layer 2: Block beforeunload hijacking (ad redirects)
  window.addEventListener('beforeunload', function (e) {
    // Don't allow ad scripts to set custom messages
    delete e.returnValue;
  });

  // Layer 3: MutationObserver — detect and destroy injected ad elements
  function initAdBlockObserver() {
    const AD_PATTERNS = [
      /pop(under|up|over)/i, /ad[sx]?\d/i, /banner/i, /sponsor/i,
      /overlay-ad/i, /interstitial/i, /clickunder/i, /exoclick/i,
      /propellerads/i, /adsterra/i, /hilltopads/i, /trafficjunky/i,
      /juicyads/i, /pushground/i, /monetag/i, /clickadu/i
    ];

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== 1) continue; // Skip non-element nodes

          // Check for injected iframes that aren't ours
          if (node.tagName === 'IFRAME' && node.id !== 'embed-frame') {
            const src = (node.src || '').toLowerCase();
            const id = (node.id || '').toLowerCase();
            const cls = (node.className || '').toLowerCase();
            const isAd = AD_PATTERNS.some(p => p.test(src) || p.test(id) || p.test(cls));
            const isTiny = (node.offsetWidth <= 1 || node.offsetHeight <= 1 || 
                           node.style.width === '0px' || node.style.height === '0px' ||
                           node.style.display === 'none' || node.style.visibility === 'hidden');
            
            if (isAd || isTiny) {
              node.remove();
              console.warn('[AdShield] Removed injected ad iframe:', src || id);
              continue;
            }
          }

          // Check for injected scripts from ad networks
          if (node.tagName === 'SCRIPT') {
            const src = (node.src || '').toLowerCase();
            if (AD_PATTERNS.some(p => p.test(src))) {
              node.remove();
              console.warn('[AdShield] Removed ad script:', src);
              continue;
            }
          }

          // Check for overlay/popup divs injected by ad scripts
          if (node.tagName === 'DIV' || node.tagName === 'A') {
            const style = node.style;
            const isOverlay = (style.position === 'fixed' || style.position === 'absolute') &&
                             (style.zIndex > 999 || parseInt(style.zIndex) > 999);
            const id = (node.id || '').toLowerCase();
            const cls = (node.className || '').toLowerCase();
            if (isOverlay && AD_PATTERNS.some(p => p.test(id) || p.test(cls))) {
              node.remove();
              console.warn('[AdShield] Removed ad overlay:', id || cls);
            }
          }
        }
      }
    });

    observer.observe(document.documentElement, {
      childList: true,
      subtree: true
    });

    return observer;
  }

  // Layer 4: Block suspicious anchor clicks (ad redirect links)
  document.addEventListener('click', function (e) {
    const target = e.target.closest('a');
    if (!target) return;
    const href = (target.href || '').toLowerCase();
    const rel = (target.rel || '').toLowerCase();
    
    // Block links that open new tabs if they didn't come from our UI
    if (target.target === '_blank' && !target.closest('.app-viewport')) {
      e.preventDefault();
      e.stopPropagation();
      console.warn('[AdShield] Blocked suspicious external link:', href);
    }
  }, true);

  // Layer 5: Periodic cleanup sweep (catches delayed ad injections)
  function runAdCleanupSweep() {
    // Remove any iframes that aren't our embed-frame
    document.querySelectorAll('iframe:not(#embed-frame):not(#artplayer-container iframe)').forEach(iframe => {
      const src = (iframe.src || '').toLowerCase();
      const isArtPlayer = iframe.closest('#artplayer-container');
      if (!isArtPlayer && !iframe.closest('.cinema-viewport')) {
        iframe.remove();
        console.warn('[AdShield] Sweep removed rogue iframe:', src);
      }
    });

    // Remove fixed/absolute overlays with high z-index that aren't ours
    document.querySelectorAll('div[style*="z-index"]').forEach(div => {
      if (div.closest('.app-viewport') || div.closest('.toast-container')) return;
      const z = parseInt(div.style.zIndex);
      if (z > 9000 && div.style.position === 'fixed') {
        div.remove();
        console.warn('[AdShield] Sweep removed high-z overlay');
      }
    });
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // PERFORMANCE UTILITIES
  // ═══════════════════════════════════════════════════════════════════════════

  // Debounce utility for search input
  function debounce(fn, delay) {
    let timer;
    return function (...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  }

  // RAF-batched rendering to avoid layout thrashing (always executes latest frame)
  let _renderRafId = null;
  function queueRender(fn) {
    if (_renderRafId) {
      cancelAnimationFrame(_renderRafId);
    }
    _renderRafId = requestAnimationFrame(() => {
      _renderRafId = null;
      try {
        fn();
      } catch (err) {
        console.error('[RenderError]', err);
      }
    });
  }

  // ─── Instant 0ms Cold-Start Built-in Catalog Seed ────────────────────────
  const BUILTIN_SEEDED_MATCHES = [{"id":"nuvio_sport_spk_ppv-nfl-network","cleanId":"spk_ppv-nfl-network","title":"NFL Network","category":"american_football","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuAQ1sFKBWSYAU2DFLABM8E9g1gDCFJMd46Tp51jwywYAE50IMmQggAxqWwgqIGMBokQIUiETqpwkHphaRSmSClYQF9bMXKaU6SnIRQYQSKbZ6YQsCS5HIXJuThdhOScCYHhyN2AXSSA.webp&text=NFL%20Network&color=0369a1"},{"id":"nuvio_sport_sf_rb-salzburg-vs-levski-sofia","cleanId":"sf_rb-salzburg-vs-levski-sofia","title":"RB Salzburg @ Levski Sofia","category":"football","league":"Europa League","date":1789663500000,"isLive":false,"is247":false,"popular":true,"sourcesCount":3,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzrAThFlBWSUYAUwVmDW2nmAmD32FrWGHXbeAENgBjUgg5sSdTtw5kAJqWCEImeuFFs8VHC1mE%2BIbiB0h9IFCEQ6ShkDALAkFPsNn0UYFSi6vy9LLPdNaYK5iohBAA.webp&text=RB%20Salzburg%0Avs%0ALevski%20Sofia&color=10b981"},{"id":"nuvio_sport_sf_tsg-hoffenheim-vs-ofi-crete","cleanId":"sf_tsg-hoffenheim-vs-ofi-crete","title":"TSG Hoffenheim @ OFI Crete","category":"football","league":"Europa League","date":1789663500000,"isLive":false,"is247":false,"popular":true,"sourcesCount":3,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzrAThFlBWSUYAUwVmDW2nmAmD32FrWGHXbeAENgBjUgg5sSdTtw5kAJqWCEImeuFFs8VGJRApiMgAwhuIPiBPGUIRMZImjBYEgp9hs%2BijArtbd%2BXpZZ2plowdzFRCCA.webp&text=TSG%20Hoffenheim%0Avs%0AOFI%20Crete&color=10b981"},{"id":"nuvio_sport_spk_nflstreams_live","cleanId":"spk_nflstreams_live","title":"NFL Streams Schedule","category":"basketball","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img/placeholder?text=NFL%20Streams%20Schedule&color=f97316"},{"id":"nuvio_sport_sf_connecticut-sun-vs-atlanta-dream","cleanId":"sf_connecticut-sun-vs-atlanta-dream","title":"Atlanta Dream vs Connecticut Sun","category":"basketball","league":"WNBA","date":1789687800000,"isLive":false,"is247":false,"popular":true,"sourcesCount":3,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzrAThFlBWSUYAUwVmDW2nmAmD32FrWGHXbeAENgBjUgg5sSdTtw5kAJqWCEImeuFFs8rNCDKJeKSCG4gpm-SBSmQFiMYlMkFPsNn1dKlFzBaiWWW6a0wHmKiEEA.webp&text=Connecticut%20Sun%0Avs%0AAtlanta%20Dream&color=f97316"},{"id":"nuvio_sport_sf_washington-mystics-vs-chicago-sky","cleanId":"sf_washington-mystics-vs-chicago-sky","title":"Chicago Sky vs Washington Mystics","category":"basketball","league":"WNBA","date":1789689600000,"isLive":false,"is247":false,"popular":true,"sourcesCount":3,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzrAThFlBWSUYAUwVmDW2nmAmD32FrWGHXbeAENgBjUgg5sSdTtw5kAJqWCEImeuFFs8aEChACwdECS0huIKXsMbzIEBGMaCwJBT7DZ9FGBUou78vSyzPTLRg7mKiEEA.webp&text=Washington%20Mystics%0Avs%0AChicago%20Sky&color=f97316"},{"id":"nuvio_sport_spk_admin-tennis-channel","cleanId":"spk_admin-tennis-channel","title":"Tennis Channel","category":"tennis","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuBEBDXsQZgdgwwRgBOYAU0hDpqxQFZh5Tg0wmJgATMNTTAWkVqNri0LIinbQ61OvHS5CISiCggGIRPzWq0hNTTV5s2AMb6NNFif4h%2BVFxux5bFLXnk3aASx2PV0%2BLRRNR0hAtjYUBHZQYkk2JjBHEFsaOxytGFZYSWt5YFIVGOVgeTYOMl5AiCA.webp&text=Tennis%20Channel&color=a3e635"},{"id":"nuvio_sport_spk_admin-rally-tv","cleanId":"spk_admin-rally-tv","title":"Rally TV","category":"motorsport","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuMFBWLwBTYCbYAQxSzPzLCWDWB12Hga00quAGNCF0GdCBQhqjEM1Y4AJhixo5YXLCa8uwMAQSRgATkKk8bMFuKGIQA.webp&text=Rally%20TV&color=ef4444"},{"id":"nuvio_sport_spk_live-event_2026-truck-playoff-at-bristol-live-stream","cleanId":"spk_live-event_2026-truck-playoff-at-bristol-live-stream","title":"2026 Truck Playoff at Bristol","category":"motorsport","league":"","date":1789689600000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img/placeholder?text=2026%20Truck%20Playoff%20at%20Bristol&color=ef4444"},{"id":"nuvio_sport_spk_live-event_nascar-cup-series-2026-bass-pro-shops-night-race-live-stream","cleanId":"spk_live-event_nascar-cup-series-2026-bass-pro-shops-night-race-live-stream","title":"Nascar Cup Series 2026 - Bass Pro Shops Night Race","category":"motorsport","league":"","date":1789807500000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img/placeholder?text=Nascar%20Cup%20Series%202026%0A-%0ABass%20Pro%20Shops%20Night%20Race&color=ef4444"},{"id":"nuvio_sport_spk_ppv-tna-impact","cleanId":"spk_ppv-tna-impact","title":"TNA Impact","category":"mma","league":"","date":1789693200000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuAQ1sFKBWSYAU2DFLABM8E9g1gDCFJMd46Tp51jwywYAE50IAMYgQwKiBJSQWUqRCyschSmwTVM3cODxgEZcJAwQKOXqtlE60eRMChIptnphCwJLnFahMG5OEwMyLQJDciDjZQggA.webp&text=TNA%20Impact&color=dc2626"},{"id":"nuvio_sport_spk_ppv-wwe-friday-night-smackdown","cleanId":"spk_ppv-wwe-friday-night-smackdown","title":"WWE Friday Night Smackdown","category":"mma","league":"","date":1789776000000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuAQ1sFKBWSYAU2DFLABM8E9g1gDCFJMd46Tp51jwywYAE5MZRAGMQ0rCBgiQVacBqJEKELNnjSIRCU1yRweCpAal0idkV6U5CKDCDjBbPTCFgSXBPtDnVkdhUno3UzBnYEcyCCA.webp&text=WWE%20Friday%20Night%20Smackdown&color=dc2626"},{"id":"nuvio_sport_spk_live-event_john-hedges-vs-pat-brown-live-stream","cleanId":"spk_live-event_john-hedges-vs-pat-brown-live-stream","title":"John Hedges vs Pat Brown","category":"mma","league":"","date":1789840800000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img/placeholder?text=John%20Hedges%0Avs%0APat%20Brown&color=dc2626"},{"id":"nuvio_sport_spk_ppv-fox-cricket","cleanId":"spk_ppv-fox-cricket","title":"Fox Cricket","category":"cricket","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuAQ1sFKBWSYAU2DFLABM8E9g1gDCFJMd46Tp51jwywYAE50IMhGA0SIYVOCIQpcSBoQVKbMEnr1AYy01hIGFNXKUIS9JUlN-MIJFMt9wsCS49moY9aS5Mk0CBXJHbVJtIA.webp&text=Fox%20Cricket&color=0ea5e9"},{"id":"nuvio_sport_spk_admin-willow-cricket","cleanId":"spk_admin-willow-cricket","title":"Willow Cricket","category":"cricket","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuAQ2C4%2BcBjYAUwRQFYxi8xg61rLoATdMFSCiUME-YAE5gFbLnrlGUGtB5lBFRvPqVgSWMEJ58fBJCGlxo%2BBP5zgEIA.webp&text=Willow%20Cricket&color=0ea5e9"},{"id":"nuvio_sport_spk_england-cricket-vs-sri-lanka-cricket-2524747","cleanId":"spk_england-cricket-vs-sri-lanka-cricket-2524747","title":"England Cricket vs Sri Lanka Cricket","category":"cricket","league":"","date":1789666200000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzrAThFlBWSUYAUwVmDW2nmAmD32FrWGHXbeAENgBjUgg5sSdTtw5kAJqWCEImeuFFs8rMNhAhgABkggIIbiD5aQiUyVzWcCpkgp9hs%2BijAqUXd%2BXpZZnploNUXoQoA.webp&text=England%20Cricket%0Avs%0ASri%20Lanka%20Cricket&color=0ea5e9"},{"id":"nuvio_sport_spk_eisb-ren-berlin-vs-straubing-tigers-2518140","cleanId":"spk_eisb-ren-berlin-vs-straubing-tigers-2518140","title":"Eisbären Berlin vs Straubing Tigers","category":"hockey","league":"","date":1789666200000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzrAThFlBWSUYAUwVmDW2nmAmD32FrWGHXbeAENgBjUgg5sSdTtw5kAJqWCEImeuFFs8VLGDIhgMtCAghuIPiBLH9IGCCmWQiKQWBIKfYbPopNbFF03l6WLI%2BTLRgXvSiEEA.webp&text=Eisb%C3%A4ren%20Berlin%0Avs%0AStraubing%20Tigers&color=06b6d4"},{"id":"nuvio_sport_spk_schwenninger-vs-frankfurt-lowen-hockey-433611","cleanId":"spk_schwenninger-vs-frankfurt-lowen-hockey-433611","title":"Schwenninger vs Frankfurt Lowen","category":"hockey","league":"","date":1789752600000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuFgpsCwVgBDQhWYNMATkhQFZgrDh49g773hta1QKWwAAzcwKdJG7EsCdCCohsi%2BuQYBjZsDA94kqlMINWYbW1wQgA&text=Schwenninger%0Avs%0AFrankfurt%20Lowen&color=06b6d4"},{"id":"nuvio_sport_spk_krefeld-pinguine-vs-bremerhaven-hockey-433614","cleanId":"spk_krefeld-pinguine-vs-bremerhaven-hockey-433614","title":"Krefeld Pinguine vs Bremerhaven","category":"hockey","league":"","date":1789752600000,"isLive":false,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuFgpsCwVgBDQhWYNMATkhQFZgrDh49g773hta1QKWwAAzcwKdJG7EsCdCCohs8%2BuQYBjZsDA94kqlMINWYbW1wQgA&text=Krefeld%20Pinguine%0Avs%0ABremerhaven&color=06b6d4"},{"id":"nuvio_sport_spk_nflstreams_live","cleanId":"spk_nflstreams_live","title":"NFL Streams Schedule","category":"basketball","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img/placeholder?text=NFL%20Streams%20Schedule&color=f97316"},{"id":"nuvio_sport_spk_admin-tennis-channel","cleanId":"spk_admin-tennis-channel","title":"Tennis Channel","category":"tennis","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuBEBDXsQZgdgwwRgBOYAU0hDpqxQFZh5Tg0wmJgATMNTTAWkVqNri0LIinbQ61OvHS5CISiCggGIRPzWq0hNTTV5s2AMb6NNFif4h%2BVFxux5bFLXnk3aASx2PV0%2BLRRNR0hAtjYUBHZQYkk2JjBHEFsaOxytGFZYSWt5YFIVGOVgeTYOMl5AiCA.webp&text=Tennis%20Channel&color=a3e635"},{"id":"nuvio_sport_spk_admin-rally-tv","cleanId":"spk_admin-rally-tv","title":"Rally TV","category":"motorsport","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuMFBWLwBTYCbYAQxSzPzLCWDWB12Hga00quAGNCF0GdCBQhqjEM1Y4AJhixo5YXLCa8uwMAQSRgATkKk8bMFuKGIQA.webp&text=Rally%20TV&color=ef4444"},{"id":"nuvio_sport_spk_ppv-fox-league","cleanId":"spk_ppv-fox-league","title":"Fox League","category":"rugby","league":"","date":null,"isLive":true,"is247":true,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzuAQ1sFKBWSYAU2DFLABM8E9g1gDCFJMd46Tp51jwywYAE50IMmUQQQKEInjAqICNlIgliDWqziQWYCpolxwRAGMT%2B6cOVre5FQKEimqlOULAkuM%2B6FhuThVhUnoCU3IAg1CIIA.webp&text=Fox%20League&color=8b5cf6"},{"id":"nuvio_sport_wf_23_6Rktf6TF","cleanId":"wf_23_6Rktf6TF","title":"DP WORLD TOUR: BMW PGA Championship (United Kingdom)","category":"golf","league":"","date":1789624800000,"isLive":true,"is247":false,"popular":true,"sourcesCount":1,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fapi.watchfooty.st%2Fapi%2Fv1%2Fposter%2FPFZfk5TG26PM1L9mqMVZjaeMMtx9SYrBmuZMVRqRHDjwbw9vRtBQ66x7Yqptm4Cy7Tm87sYV9jsEXCEcV8SBey9Bd7ncM1Hoi1X1czAxEMKuxXQChtBgzBpBpTRKoPN74UBfo2nYsRYZWKP6BaxVqDZyzwwmuwKUw3rrpvfhTgfPVViCPw2EgyGp6ibh6Tnrgce7T2Laij4MoGFtnix9i33geRgwMyFQiAPejCCAWWj7Ux5vmoHmi19oRFRhqJnKG1p2LZCT4RuVkLufvspbD3cikTzyngMXQpaKwTQa3dZ1fhwQT&text=GOLF&color=22c55e"},{"id":"nuvio_sport_sf_milwaukee-brewers-vs-pittsburgh-pirates","cleanId":"sf_milwaukee-brewers-vs-pittsburgh-pirates","title":"Brewers @ Pirates","category":"baseball","league":"MLB","date":1789662900000,"isLive":false,"is247":false,"popular":true,"sourcesCount":4,"poster":"http://100.116.27.184:20010/img?url=https%3A%2F%2Fstreamed.pk%2Fapi%2Fimages%2Fproxy%2FGwZg7AZpYEZgHCAjAJgCzrAThFlBWSUYAUwVmDW2nmAmD32FrWGHXbeAENgBjUgg5sSdTtw5kAJqWCEImeuFFs8VLKRBQSIPiH3dd%2B4yi0hEMXLgLAkFPsNn0UYFSi6vy9DaPdNaYK5iohBAA.webp&text=Milwaukee%20Brewers%0Avs%0APittsburgh%20Pirates&color=f43f5e"}];

  // ─── Configuration & Storage Keys ──────────────────────────────────────────
  const INTERNAL_BACKEND_FALLBACK = 'https://ahudwgrmu9.preview.c35.airoapp.ai/?airoShareToken=At3udpbq8UOL&preview=1';
  const STORAGE_CACHE_KEY = 'streamnaro_cached_matches_v1';
  const STORAGE_THEME_KEY = 'streamnaro_theme';
  const STORAGE_FAVORITES_KEY = 'streamnaro_favorites';
  const MAX_RETRY_FALLBACKS = 4;

  // Resolve API Base without exposing controls or tokens in client UI
  function resolveApiBase() {
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

  // ─── Intelligent Stream Engine & Memory Cache ────────────────────────────────
  const streamSourcesCache = new Map(); // cleanId -> { streams, timestamp }
  const STREAM_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

  let activeMatch = null;
  let currentCandidates = [];
  let activeCandidateIndex = 0;
  let fallbackAttemptCount = 0;
  let artInstance = null;
  let stallWatchdogTimer = null;
  const providerHealthScores = new Map();

  // ─── Category Route Mapping ──────────────────────────────────────────────────
  const ROUTE_CATEGORY_MAP = {
    'ufc-streams': { category: 'mma', tab: 'all', title: 'Live UFC & MMA Streams — STREAM NARO' },
    'ufc': { category: 'mma', tab: 'all', title: 'Live UFC & MMA Streams — STREAM NARO' },
    'mma': { category: 'mma', tab: 'all', title: 'Live UFC & MMA Streams — STREAM NARO' },
    'football': { category: 'football', tab: 'all', title: 'Live Football Streams — STREAM NARO' },
    'soccer': { category: 'football', tab: 'all', title: 'Live Football Streams — STREAM NARO' },
    'basketball': { category: 'basketball', tab: 'all', title: 'Live Basketball & NBA Streams — STREAM NARO' },
    'nba': { category: 'basketball', tab: 'all', title: 'Live Basketball & NBA Streams — STREAM NARO' },
    'tennis': { category: 'tennis', tab: 'all', title: 'Live Tennis Streams — STREAM NARO' },
    'motorsport': { category: 'motorsport', tab: 'all', title: 'Live F1 & Motorsport Streams — STREAM NARO' },
    'f1': { category: 'motorsport', tab: 'all', title: 'Live F1 & Motorsport Streams — STREAM NARO' },
    'cricket': { category: 'cricket', tab: 'all', title: 'Live Cricket Streams — STREAM NARO' },
    'hockey': { category: 'hockey', tab: 'all', title: 'Live Hockey & NHL Streams — STREAM NARO' },
    'nhl': { category: 'hockey', tab: 'all', title: 'Live Hockey & NHL Streams — STREAM NARO' },
    '247-tv': { category: 'networks', tab: 'networks', title: '24/7 Sports TV Channels — STREAM NARO' },
    'tv': { category: 'networks', tab: 'networks', title: '24/7 Sports TV Channels — STREAM NARO' },
    'live': { category: 'all', tab: 'live', title: 'Live Now Sports Broadcasts — STREAM NARO' },
    'schedule': { category: 'all', tab: 'upcoming', title: 'Upcoming Sports Schedule — STREAM NARO' },
    'favorites': { category: 'all', tab: 'favorites', title: 'Your Favorite Streams — STREAM NARO' }
  };

  // ─── Smart Match Thumbnail Generator (Cinema-Grade SVG Fallback) ────────────
  function formatCardDate(m) {
    if (m.isLive) return '● LIVE';
    if (m.is247) return '24/7 TV';
    if (!m.date) return 'Live';
    const now = Date.now();
    const diff = Math.round((m.date - now) / 60000);
    if (diff <= 0 && diff >= -150) return '● LIVE';
    if (diff > 0 && diff <= 60) return `In ${diff}m`;

    const d = new Date(m.date);
    const month = d.toLocaleDateString('en-US', { month: 'short' });
    const day = d.getDate();
    return `${month} ${day}`;
  }

  function createSmartThumbnailSvg(m) {
    const title = m.title || 'Live Match';
    const cat = (m.category || 'sports').toLowerCase();

    const sportMeta = {
      basketball: {
        bg1: '#1e0e04', bg2: '#090a0d', accent: '#f59e0b', stroke: 'rgba(245,158,11,0.35)',
        glyph: '<circle cx="320" cy="180" r="44" fill="none" stroke="#f59e0b" stroke-width="2.5"/><path d="M276 180h88M320 136v88M288 149c22 20 22 42 0 62M352 149c-22 20-22 42 0 62" fill="none" stroke="#f59e0b" stroke-width="2"/>'
      },
      football: {
        bg1: '#021a12', bg2: '#090a0d', accent: '#10b981', stroke: 'rgba(16,185,129,0.35)',
        glyph: '<circle cx="320" cy="180" r="44" fill="none" stroke="#10b981" stroke-width="2.5"/><polygon points="320 155 339 169 332 191 308 191 301 169" fill="rgba(16,185,129,0.2)" stroke="#10b981" stroke-width="2"/>'
      },
      tennis: {
        bg1: '#121c04', bg2: '#090a0d', accent: '#84cc16', stroke: 'rgba(132,204,22,0.35)',
        glyph: '<circle cx="320" cy="180" r="42" fill="none" stroke="#84cc16" stroke-width="2.5"/><path d="M292 152c20 20 20 36 0 56M348 152c-20 20-20 36 0 56" fill="none" stroke="#84cc16" stroke-width="2"/>'
      },
      motorsport: {
        bg1: '#200707', bg2: '#090a0d', accent: '#ef4444', stroke: 'rgba(239,68,68,0.35)',
        glyph: '<rect x="290" y="152" width="60" height="56" rx="8" fill="none" stroke="#ef4444" stroke-width="2.5"/><path d="M290 171h60M290 190h60M310 152v56M330 152v56" stroke="#ef4444" stroke-width="1.5"/>'
      },
      mma: {
        bg1: '#1f1003', bg2: '#090a0d', accent: '#f97316', stroke: 'rgba(249,115,22,0.35)',
        glyph: '<polygon points="320 138 356 154 356 196 320 216 284 196 284 154" fill="none" stroke="#f97316" stroke-width="2.5"/>'
      },
      cricket: {
        bg1: '#091c16', bg2: '#090a0d', accent: '#14b8a6', stroke: 'rgba(20,184,166,0.35)',
        glyph: '<line x1="305" y1="145" x2="305" y2="215" stroke="#14b8a6" stroke-width="2.5"/><line x1="320" y1="145" x2="320" y2="215" stroke="#14b8a6" stroke-width="2.5"/><line x1="335" y1="145" x2="335" y2="215" stroke="#14b8a6" stroke-width="2.5"/><line x1="298" y1="145" x2="342" y2="145" stroke="#14b8a6" stroke-width="3"/>'
      },
      hockey: {
        bg1: '#041724', bg2: '#090a0d', accent: '#00f0ff', stroke: 'rgba(0,240,255,0.35)',
        glyph: '<line x1="295" y1="150" x2="345" y2="210" stroke="#00f0ff" stroke-width="3"/><line x1="345" y1="150" x2="295" y2="210" stroke="#00f0ff" stroke-width="3"/><circle cx="320" cy="180" r="10" fill="#00f0ff"/>'
      },
      networks: {
        bg1: '#091322', bg2: '#090a0d', accent: '#00f0ff', stroke: 'rgba(0,240,255,0.35)',
        glyph: '<rect x="286" y="154" width="68" height="50" rx="6" fill="none" stroke="#00f0ff" stroke-width="2.5"/><polyline points="304 142 320 154 336 142" stroke="#00f0ff" stroke-width="2" fill="none"/>'
      }
    };

    const s = sportMeta[cat] || {
      bg1: '#0d131f', bg2: '#090a0d', accent: '#00f0ff', stroke: 'rgba(0,240,255,0.25)',
      glyph: '<circle cx="320" cy="180" r="40" fill="none" stroke="#00f0ff" stroke-width="2.5"/>'
    };

    let team1 = '';
    let team2 = '';
    const vsMatch = title.match(/^(.*?)\s+(?:vs\.?|v|-|@)\s+(.*)$/i);
    if (vsMatch) {
      team1 = vsMatch[1].trim();
      team2 = vsMatch[2].trim();
    }

    const t1Initials = team1 ? team1.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() : '';
    const t2Initials = team2 ? team2.split(/\s+/).map(w => w[0]).join('').slice(0, 3).toUpperCase() : '';

    const svgContent = `
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 360" width="640" height="360">
  <defs>
    <radialGradient id="thumbBg" cx="50%" cy="35%" r="75%">
      <stop offset="0%" stop-color="${s.bg1}"/>
      <stop offset="100%" stop-color="${s.bg2}"/>
    </radialGradient>
    <linearGradient id="crestG" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="rgba(255,255,255,0.14)"/>
      <stop offset="100%" stop-color="rgba(0,0,0,0.5)"/>
    </linearGradient>
  </defs>
  <rect width="640" height="360" fill="url(#thumbBg)"/>
  <circle cx="320" cy="50" r="160" fill="${s.accent}" opacity="0.08"/>
  <rect x="1" y="1" width="638" height="358" rx="14" fill="none" stroke="${s.stroke}" stroke-width="1.5"/>

  ${team1 && team2 ? `
    <g transform="translate(135, 105)">
      <rect width="105" height="105" rx="18" fill="url(#crestG)" stroke="${s.stroke}" stroke-width="2"/>
      <text x="52" y="64" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="900" text-anchor="middle" letter-spacing="1">${escapeHtml(t1Initials)}</text>
    </g>

    <g transform="translate(292, 131)">
      <circle cx="28" cy="28" r="23" fill="#0c0d12" stroke="${s.accent}" stroke-width="2"/>
      <text x="28" y="34" fill="${s.accent}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="13" font-weight="900" text-anchor="middle">VS</text>
    </g>

    <g transform="translate(400, 105)">
      <rect width="105" height="105" rx="18" fill="url(#crestG)" stroke="${s.stroke}" stroke-width="2"/>
      <text x="52" y="64" fill="#ffffff" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="28" font-weight="900" text-anchor="middle" letter-spacing="1">${escapeHtml(t2Initials)}</text>
    </g>
  ` : `
    ${s.glyph}
  `}

  <rect x="235" y="285" width="170" height="32" rx="16" fill="rgba(0,0,0,0.65)" stroke="${s.stroke}" stroke-width="1"/>
  <text x="320" y="306" fill="${s.accent}" font-family="-apple-system, BlinkMacSystemFont, sans-serif" font-size="12" font-weight="800" text-anchor="middle" letter-spacing="1.5">${escapeHtml(cat.toUpperCase())}</text>
</svg>`.trim();

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgContent)}`;
  }


  function renderSkeletonCards(count = 6) {
    let html = '';
    for (let i = 0; i < count; i++) {
      html += '<div class="stream-card-skeleton">' +
        '<div class="skeleton-media"></div>' +
        '<div class="skeleton-body">' +
          '<div class="skeleton-line title"></div>' +
          '<div class="skeleton-line meta"></div>' +
        '</div>' +
      '</div>';
    }
    return html;
  }

  // ─── DOM Elements ───────────────────────────────────────────────────────────
  let searchInput, clearSearchBtn, themeToggleBtn, themeIconSun, themeIconMoon;
  let dockThemeBtn, dockThemeIconSun, dockThemeIconMoon, liveSyncPill, syncText;
  let quickStreamsList, quickCountPill;
  let heroSpotlight, heroBg, heroStatusPill, heroTitle, heroLeagueTag, heroTimeTag, heroQualityTag, heroDesc;
  let heroWatchBtn, heroFavoriteBtn, heroPrevBtn, heroNextBtn;
  let watchView, homeView, watchBackBtn, watchFavBtn, watchQuickGrid, watchQuickCounter;
  let categoryHeaderBanner, catBannerIcon, catBannerTitle, catBannerDesc, catLiveStat, catTotalStat;
  let topNavLogo, sidebarLogo;
  let playingTitle, playerStatusTag, playerLeagueTag, playerEngineTag;
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
    initCarouselControls();

    // Initialize ad-blocking defense system
    initAdBlockObserver();
    // Run periodic cleanup sweep every 8 seconds
    setInterval(runAdCleanupSweep, 8000);

    // Preconnect to backend API for faster stream starts
    try {
      const apiBase = new URL(API_BASE, window.location.origin);
      const link = document.createElement('link');
      link.rel = 'preconnect';
      link.href = apiBase.origin;
      link.crossOrigin = 'anonymous';
      document.head.appendChild(link);
    } catch (_) {}

    // 0ms Cold Start: render instantly from local cache or built-in seed
    loadCachedCatalog();

    // Fast CDN seed load (<25ms) if catalog is small or empty
    loadInitialSeedIfNeeded();

    // Route matching for category pages
    handleUrlRouting();

    // Silent background live synchronization with automatic retry
    syncCatalogInBackground();

    // Periodic live synchronization every 60 seconds (keeps scores/streams fresh)
    setInterval(() => syncCatalogInBackground(false), 60000);
  });

  function cacheDomElements() {
    searchInput = document.getElementById('search-input');
    clearSearchBtn = document.getElementById('clear-search-btn');
    themeToggleBtn = document.getElementById('theme-toggle-btn');
    themeIconSun = document.getElementById('theme-icon-sun');
    themeIconMoon = document.getElementById('theme-icon-moon');
    dockThemeBtn = document.getElementById('dock-theme');
    dockThemeIconSun = document.getElementById('dock-theme-icon-sun');
    dockThemeIconMoon = document.getElementById('dock-theme-icon-moon');
    liveSyncPill = document.getElementById('live-sync-pill');
    syncText = document.getElementById('sync-text');

    topNavLogo = document.getElementById('top-nav-logo');
    sidebarLogo = document.getElementById('sidebar-logo');

    quickStreamsList = document.getElementById('quick-streams-list');
    quickCountPill = document.getElementById('quick-count-pill');

    heroSpotlight = document.getElementById('hero-spotlight');
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

    watchView = document.getElementById('watch-view');
    homeView = document.getElementById('home-view');
    watchBackBtn = document.getElementById('watch-back-btn');
    watchFavBtn = document.getElementById('watch-fav-btn');
    watchQuickGrid = document.getElementById('watch-quick-grid');
    watchQuickCounter = document.getElementById('watch-quick-counter');

    categoryHeaderBanner = document.getElementById('category-header-banner');
    catBannerIcon = document.getElementById('cat-banner-icon');
    catBannerTitle = document.getElementById('cat-banner-title');
    catBannerDesc = document.getElementById('cat-banner-desc');
    catLiveStat = document.getElementById('cat-live-stat');
    catTotalStat = document.getElementById('cat-total-stat');

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
    if (dockThemeIconSun && dockThemeIconMoon) {
      dockThemeIconSun.classList.toggle('hidden', isLight);
      dockThemeIconMoon.classList.toggle('hidden', !isLight);
    }
    localStorage.setItem(STORAGE_THEME_KEY, theme);
  }

  function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    const next = current === 'dark' ? 'light' : 'dark';
    setTheme(next);
    showToast(`Switched to ${next.toUpperCase()} mode`, 'info');
  }

  // ─── URL Routing & SPA Navigation (Zero 404 Guarantee) ──────────────────────
  function handleUrlRouting() {
    const url = new URL(window.location.href);
    const path = window.location.pathname.replace(/^\/+|\/+$/g, '').toLowerCase();
    const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
    const idFromQuery = url.searchParams.get('id') || url.searchParams.get('watch');

    // 1. Check if direct /watch route
    let watchId = idFromQuery;
    if (!watchId && path.startsWith('watch')) {
      const parts = path.split('/');
      if (parts.length > 1) watchId = parts[1];
    }
    if (!watchId && hash.startsWith('watch=')) {
      watchId = hash.replace('watch=', '');
    }

    if (watchId) {
      const existing = allMatches.find(m => m.cleanId === watchId || m.id === watchId);
      if (existing) {
        handleWatchStream(existing.cleanId, existing.title, existing.league || existing.category);
      } else {
        handleWatchStream(watchId, 'Live Stream', 'SPORTS');
      }
      return;
    }

    // 2. If viewing watch page but URL has no watch parameter, close watch view
    if (watchView && !watchView.classList.contains('hidden')) {
      closeWatchView(false);
    }

    // 3. Check category route or home
    const targetSlug = path || hash;
    if (targetSlug && ROUTE_CATEGORY_MAP[targetSlug]) {
      const routeInfo = ROUTE_CATEGORY_MAP[targetSlug];
      activeCategory = routeInfo.category;
      activeTab = routeInfo.tab;
      document.title = routeInfo.title;

      syncCategoryPillActive(activeCategory);
      syncSidebarActive();
      syncDockActive();
      renderAllSections();
    } else {
      activeCategory = 'all';
      activeTab = 'all';
      document.title = 'STREAM NARO — Premium Live Sports Streaming';
      syncCategoryPillActive('all');
      syncSidebarActive();
      syncDockActive();
      renderAllSections();
    }
  }

  window.addEventListener('popstate', handleUrlRouting);

  function navigateToCategory(category, slug = '') {
    activeCategory = category;
    displayedCount = pageLimit;
    syncCategoryPillActive(category);

    if (watchView && !watchView.classList.contains('hidden')) {
      closeWatchView(false);
    }

    const routeInfo = ROUTE_CATEGORY_MAP[slug];
    if (routeInfo) {
      document.title = routeInfo.title;
      try {
        window.history.pushState(null, '', `/${slug}`);
      } catch (_) {}
    } else {
      document.title = 'STREAM NARO — Premium Live Sports Streaming';
      try {
        window.history.pushState(null, '', '/');
      } catch (_) {}
    }

    renderAllSections();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function goHome() {
    if (watchView && !watchView.classList.contains('hidden')) {
      closeWatchView(false);
    }
    activeCategory = 'all';
    activeTab = 'all';
    currentSearch = '';
    if (searchInput) searchInput.value = '';
    if (clearSearchBtn) clearSearchBtn.classList.add('hidden');
    syncCategoryPillActive('all');
    syncSidebarActive();
    syncDockActive();
    displayedCount = pageLimit;
    try {
      window.history.pushState(null, '', '/');
    } catch (_) {}
    document.title = 'STREAM NARO — Premium Live Sports Streaming';
    renderAllSections();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function syncCategoryPillActive(cat) {
    document.querySelectorAll('#top-category-pills .top-cat-pill').forEach(b => {
      b.classList.toggle('active', b.dataset.category === cat);
    });
  }

  // ─── Modern Carousel Slider Controls ─────────────────────────────────────────
  function initCarouselControls() {
    document.querySelectorAll('.carousel-nav-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const button = e.currentTarget;
        const targetId = button.dataset.target;
        const targetEl = document.getElementById(targetId);
        if (!targetEl) return;

        const isNext = button.classList.contains('next-btn');
        const scrollAmount = isNext ? 680 : -680;
        targetEl.scrollBy({ left: scrollAmount, behavior: 'smooth' });
      });
    });
  }

  // ─── Event Listeners ────────────────────────────────────────────────────────
  function initEventListeners() {
    if (themeToggleBtn) themeToggleBtn.addEventListener('click', toggleTheme);
    if (dockThemeBtn) dockThemeBtn.addEventListener('click', toggleTheme);

    // Search Input (debounced for performance)
    if (searchInput) {
      const debouncedSearch = debounce(() => {
        renderCatalogGrid();
      }, 150);

      searchInput.addEventListener('input', (e) => {
        currentSearch = e.target.value.trim().toLowerCase();
        if (clearSearchBtn) clearSearchBtn.classList.toggle('hidden', !currentSearch);
        debouncedSearch();
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

    // Category Pills Navigation
    document.querySelectorAll('#top-category-pills .top-cat-pill').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const cat = e.currentTarget.dataset.category || 'all';
        const slug = e.currentTarget.dataset.slug || '';
        navigateToCategory(cat, slug);
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

    // Logo Clicks (Top Navbar & Sidebar Brand) -> Go to Home
    if (topNavLogo) topNavLogo.addEventListener('click', goHome);
    if (sidebarLogo) sidebarLogo.addEventListener('click', goHome);
    const dockHome = document.getElementById('dock-home');
    if (dockHome) {
      dockHome.addEventListener('click', (e) => {
        e.preventDefault();
        goHome();
      });
    }

    // Dedicated Watch View Buttons
    if (watchBackBtn) {
      watchBackBtn.addEventListener('click', () => closeWatchView(true));
    }
    if (watchFavBtn) {
      watchFavBtn.addEventListener('click', () => {
        if (activeMatch && activeMatch.cleanId) {
          toggleFavorite(activeMatch.cleanId);
          syncWatchFavButton(activeMatch.cleanId);
        }
      });
    }

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
        const playerCard = document.getElementById('player-card');
        if (playerCard) playerCard.classList.toggle('theater-mode');
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
      if (e.key === 'Escape' && watchView && !watchView.classList.contains('hidden')) {
        closeWatchView(true);
      }
    });
  }

  // ─── 0ms Cold Start Local Cache & Seed ──────────────────────────────────────
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
          return true;
        }
      }
    } catch (_) {}

    // Fallback to built-in seed for 0ms instant display if cache is empty
    if (Array.isArray(BUILTIN_SEEDED_MATCHES) && BUILTIN_SEEDED_MATCHES.length > 0) {
      allMatches = BUILTIN_SEEDED_MATCHES.map(m => ({ ...m }));
      extractFeaturedMatches();
      renderAllSections();
      if (syncText) syncText.textContent = 'Syncing...';
    }
    return false;
  }

  async function loadInitialSeedIfNeeded() {
    if (allMatches.length >= 50) return;
    try {
      const res = await fetch('/seed-catalog.json', { cache: 'no-cache' });
      if (res.ok) {
        const rawItems = await res.json();
        if (Array.isArray(rawItems) && rawItems.length > allMatches.length) {
          processCatalogItems(rawItems, 'Seed');
        }
      }
    } catch (_) {}
  }

  function saveCatalogToCache(matches) {
    try {
      localStorage.setItem(STORAGE_CACHE_KEY, JSON.stringify(matches));
    } catch (_) {}
  }

  function processCatalogItems(rawItems, sourceLabel = 'Live') {
    if (!Array.isArray(rawItems) || rawItems.length === 0) return false;

    const now = Date.now();
    allMatches = rawItems.map(item => {
      const rawId = String(item.id || '');
      const cleanId = rawId.replace(/^nuvio_sport_/, '');
      const title = (item.name || item.title || 'Sports Event').replace(/^🔴 LIVE:\s*/i, '').replace(/^⏱️\s*/i, '').replace(/^📺\s*/i, '');
      const category = ((item.genres && item.genres[0]) || item.category || 'sports').toLowerCase().replace(/[^a-z0-9_]/g, '');
      const is247 = item.is247 || category === 'networks' || (!item.date && !item.released);

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
        title: title,
        category: category,
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
    return true;
  }

  // ─── Silent Background Catalog Sync (Multi-Source + Auto-Retry) ───────────────
  let _syncRetryTimer = null;
  let _syncRetryCount = 0;
  const MAX_SYNC_RETRIES = 6;

  async function fetchFromEndpoints(urls) {
    for (const url of urls) {
      try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 6000);
        const res = await fetch(url, { cache: 'no-store', signal: controller.signal });
        clearTimeout(timeoutId);
        if (res.ok) {
          const json = await res.json();
          const items = Array.isArray(json) ? json : (json.metas || []);
          if (Array.isArray(items) && items.length > 0) {
            return items;
          }
        }
      } catch (_) {}
    }
    return [];
  }

  async function syncCatalogInBackground(isUserTriggered = false) {
    if (liveSyncPill) liveSyncPill.classList.add('syncing');
    if (syncText) syncText.textContent = 'Syncing...';

    try {
      const primaryUrl = buildApiUrl('/catalog/sports/all.json');
      const directUrl = `${INTERNAL_BACKEND_FALLBACK.replace(/\/?\?/, '/catalog/sports/all.json?')}`;
      const matchesUrl = buildApiUrl('/api/matches');
      const directMatchesUrl = `${INTERNAL_BACKEND_FALLBACK.replace(/\/?\?/, '/api/matches?')}`;

      const rawItems = await fetchFromEndpoints([primaryUrl, matchesUrl, directUrl, directMatchesUrl]);

      if (rawItems.length > 0) {
        _syncRetryCount = 0;
        if (_syncRetryTimer) {
          clearTimeout(_syncRetryTimer);
          _syncRetryTimer = null;
        }
        processCatalogItems(rawItems, 'Live');
        if (isUserTriggered) {
          showToast(`Synchronized ${allMatches.length} live streams`, 'success');
        }
        return;
      }

      // If backend returned empty (e.g. cold container warming up):
      if (_syncRetryCount < MAX_SYNC_RETRIES) {
        _syncRetryCount++;
        const delay = Math.min(1000 + (_syncRetryCount * 800), 4000);
        console.log(`[StreamEngine] Backend warming up. Auto-retrying catalog sync in ${delay}ms (attempt ${_syncRetryCount}/${MAX_SYNC_RETRIES})...`);
        if (syncText) syncText.textContent = `Connecting (${_syncRetryCount})...`;
        
        if (_syncRetryTimer) clearTimeout(_syncRetryTimer);
        _syncRetryTimer = setTimeout(() => {
          syncCatalogInBackground(false);
        }, delay);
        return;
      }

      if (liveSyncPill) liveSyncPill.classList.remove('syncing');
      if (syncText) {
        syncText.textContent = allMatches.length > 0 ? `Live (${allMatches.length})` : 'Connected';
      }
    } catch (_) {
      if (_syncRetryCount < MAX_SYNC_RETRIES) {
        _syncRetryCount++;
        _syncRetryTimer = setTimeout(() => syncCatalogInBackground(false), 2000);
      } else {
        if (liveSyncPill) liveSyncPill.classList.remove('syncing');
        if (syncText) {
          syncText.textContent = allMatches.length > 0 ? `Live (${allMatches.length})` : 'Connected';
        }
      }
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
    queueRender(() => {
      updateCategoryBanner();
      renderHeroSpotlight();
      renderQuickStreams();
      renderLiveGrid();
      renderUpcomingGrid();
      renderNetworksGrid();
      renderCatalogGrid();
    });
  }

  function updateCategoryBanner() {
    if (!categoryHeaderBanner) return;

    if (activeCategory === 'all') {
      categoryHeaderBanner.classList.add('hidden');
      if (heroSpotlight) heroSpotlight.classList.remove('hidden');
      return;
    }

    categoryHeaderBanner.classList.remove('hidden');
    if (heroSpotlight) heroSpotlight.classList.add('hidden');

    const catIcons = {
      football: '⚽',
      basketball: '🏀',
      tennis: '🎾',
      cricket: '🏏',
      motorsport: '🏎️',
      mma: '🥊',
      hockey: '🏒',
      networks: '📺'
    };

    const catNames = {
      football: 'Football',
      basketball: 'Basketball',
      tennis: 'Tennis',
      cricket: 'Cricket',
      motorsport: 'Motorsport & F1',
      mma: 'Combat & MMA / UFC',
      hockey: 'Ice Hockey',
      networks: '24/7 Sports TV'
    };

    const catMatches = allMatches.filter(m => {
      if (activeCategory === 'networks') return m.is247 || m.category === 'networks';
      return m.category.includes(activeCategory);
    });

    const liveCount = catMatches.filter(m => m.isLive).length;

    if (catBannerIcon) catBannerIcon.textContent = catIcons[activeCategory] || '🏆';
    if (catBannerTitle) catBannerTitle.textContent = `${catNames[activeCategory] || activeCategory.toUpperCase()} Fixtures`;
    if (catBannerDesc) catBannerDesc.textContent = `All live streams and upcoming ${catNames[activeCategory] || activeCategory} match schedules`;
    if (catLiveStat) catLiveStat.textContent = `● ${liveCount} Live Now`;
    if (catTotalStat) catTotalStat.textContent = `${catMatches.length} Total Matches`;
  }

  function renderHeroSpotlight() {
    if (!featuredMatches.length || !heroTitle) return;
    const m = featuredMatches[heroIndex] || featuredMatches[0];

    if (heroBg) {
      const smartPoster = createSmartThumbnailSvg(m);
      const displayPoster = m.poster && !m.poster.includes('placeholder') ? m.poster : smartPoster;
      heroBg.style.backgroundImage = `url('${displayPoster}')`;
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
        ? 'Broadcasting live now. Multi-server instant failover active.'
        : `Scheduled fixture kick-off at ${formatKickoffTime(m.date)}. Stream sources will be online prior to kickoff.`;
    }

    if (heroFavoriteBtn) {
      const isFav = favorites.includes(m.cleanId);
      heroFavoriteBtn.style.color = isFav ? '#f59e0b' : '#ffffff';
    }
  }

  function renderQuickStreams() {
    if (!quickStreamsList) return;
    if (allMatches.length === 0) {
      if (quickCountPill) quickCountPill.textContent = 'Syncing...';
      quickStreamsList.innerHTML = '<p style="font-size:0.75rem; color:var(--text-dim); padding:0.5rem;">Connecting live streams...</p>';
      return;
    }
    const liveMatches = allMatches.filter(m => m.isLive).slice(0, 8);

    if (quickCountPill) {
      quickCountPill.textContent = `${liveMatches.length} Live`;
    }

    if (!liveMatches.length) {
      quickStreamsList.innerHTML = '<p style="font-size:0.75rem; color:var(--text-dim); padding:0.5rem;">No live matches right now.</p>';
      return;
    }

    quickStreamsList.innerHTML = liveMatches.map(m => {
      const smartPoster = createSmartThumbnailSvg(m);
      const displayPoster = m.poster && !m.poster.includes('placeholder') ? m.poster : smartPoster;
      return `
        <div class="quick-item-card" 
             onmouseenter="window.STREAM_NARO.prefetch('${escapeHtml(m.cleanId)}')" 
             ontouchstart="window.STREAM_NARO.prefetch('${escapeHtml(m.cleanId)}')"
             onclick="window.STREAM_NARO.watch('${escapeHtml(m.cleanId)}', '${escapeHtml(m.title.replace(/'/g, "\\'"))}', '${escapeHtml((m.league || m.category).replace(/'/g, "\\'"))}')">
          <img class="quick-item-poster" src="${escapeHtml(displayPoster)}" alt="" loading="lazy" onerror="this.onerror=null; this.src='${smartPoster}';">
          <div class="quick-item-info">
            <span class="quick-item-title">${escapeHtml(m.title)}</span>
            <span class="quick-item-meta">${escapeHtml(m.league || m.category.toUpperCase())}</span>
          </div>
        </div>
      `;
    }).join('');
  }

  function renderLiveGrid() {
    if (!liveStreamsGrid) return;
    if (allMatches.length === 0) {
      if (liveCountBadge) liveCountBadge.textContent = 'Syncing...';
      liveStreamsGrid.innerHTML = renderSkeletonCards(4);
      return;
    }
    let list = allMatches.filter(m => m.isLive && !m.is247);
    if (activeCategory !== 'all') {
      list = list.filter(m => m.category.includes(activeCategory));
    }
    const sliced = list.slice(0, 12);

    if (liveCountBadge) {
      liveCountBadge.textContent = `${list.length} On Air`;
    }

    if (!sliced.length) {
      liveStreamsGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-dim); padding:1rem; grid-column:1/-1;">No live events broadcast right now. See upcoming fixtures below.</p>';
      return;
    }

    liveStreamsGrid.innerHTML = sliced.map(m => renderStreamCardHtml(m)).join('');
  }

  function renderUpcomingGrid() {
    if (!upcomingStreamsGrid) return;
    if (allMatches.length === 0) {
      if (upcomingCountBadge) upcomingCountBadge.textContent = 'Syncing...';
      upcomingStreamsGrid.innerHTML = renderSkeletonCards(4);
      return;
    }
    let list = allMatches.filter(m => !m.isLive && !m.is247);
    if (activeCategory !== 'all') {
      list = list.filter(m => m.category.includes(activeCategory));
    }
    const sliced = list.slice(0, 12);

    if (upcomingCountBadge) {
      upcomingCountBadge.textContent = `${list.length} Matches`;
    }

    if (!sliced.length) {
      upcomingStreamsGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-dim); padding:1rem; grid-column:1/-1;">All fixtures are currently broadcasting live.</p>';
      return;
    }

    upcomingStreamsGrid.innerHTML = sliced.map(m => renderStreamCardHtml(m)).join('');
  }

  function renderNetworksGrid() {
    if (!networksStreamsGrid) return;
    const list = allMatches.filter(m => m.is247).slice(0, 12);

    if (!list.length) {
      networksStreamsGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-dim); padding:1rem; grid-column:1/-1;">No 24/7 channels configured.</p>';
      return;
    }

    networksStreamsGrid.innerHTML = list.map(m => renderStreamCardHtml(m)).join('');
  }

  // ─── Stream Card HTML (Matches User Screenshot Exactly) ─────────────────────
  function renderStreamCardHtml(m) {
    const isFav = favorites.includes(m.cleanId);
    const dateFormatted = formatCardDate(m);
    const smartPoster = createSmartThumbnailSvg(m);
    const displayPoster = m.poster && !m.poster.includes('placeholder') ? m.poster : smartPoster;

    return `
      <div class="stream-card" 
           data-clean-id="${escapeHtml(m.cleanId)}"
           onmouseenter="window.STREAM_NARO.prefetch('${escapeHtml(m.cleanId)}')" 
           ontouchstart="window.STREAM_NARO.prefetch('${escapeHtml(m.cleanId)}')"
           onclick="window.STREAM_NARO.watch('${escapeHtml(m.cleanId)}', '${escapeHtml(m.title.replace(/'/g, "\\'"))}', '${escapeHtml((m.league || m.category).replace(/'/g, "\\'"))}')">
        
        <div class="stream-card-media">
          <img class="stream-card-backdrop" 
               src="${escapeHtml(displayPoster)}" 
               alt="${escapeHtml(m.title)}" 
               loading="lazy" 
               decoding="async" 
               onerror="this.onerror=null; this.src='${smartPoster}';">
          
          <div class="stream-card-top-tags">
            <span class="card-date-tag ${m.isLive ? 'live' : ''}">${dateFormatted}</span>
            <button class="card-star-btn ${isFav ? 'active' : ''}" 
                    title="${isFav ? 'Remove Favorite' : 'Save Favorite'}" 
                    aria-label="Favorite"
                    onclick="event.stopPropagation(); window.STREAM_NARO.toggleFavorite('${escapeHtml(m.cleanId)}');">
              <svg width="15" height="15" viewBox="0 0 24 24" fill="${isFav ? 'currentColor' : 'none'}" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
            </button>
          </div>
        </div>

        <div class="stream-card-body">
          <h4 class="card-match-title" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</h4>
          <div class="card-match-meta">
            <span>${escapeHtml(m.league || m.category.toUpperCase())}</span>
            <span class="card-meta-dot">&bull;</span>
            <span>${m.sourcesCount} Server${m.sourcesCount === 1 ? '' : 's'}</span>
          </div>
        </div>

      </div>
    `;
  }

  function renderCatalogGrid() {
    if (!matchesGrid) return;
    if (allMatches.length === 0) {
      if (catalogCountPill) catalogCountPill.textContent = 'Syncing...';
      matchesGrid.innerHTML = renderSkeletonCards(8);
      if (loadMoreContainer) loadMoreContainer.classList.add('hidden');
      return;
    }
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
    const fragment = document.createDocumentFragment();
    slice.forEach(m => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderStreamCardHtml(m);
      while (wrapper.firstChild) {
        fragment.appendChild(wrapper.firstChild);
      }
    });
    matchesGrid.innerHTML = '';
    matchesGrid.appendChild(fragment);

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

  // ─── Stream Pre-Caching (Instant 0ms start on click) ────────────────────────
  async function prefetchStreamSources(cleanId) {
    if (!cleanId) return;
    const existing = streamSourcesCache.get(cleanId);
    if (existing && Date.now() - existing.timestamp < STREAM_CACHE_TTL) {
      return existing.streams;
    }

    try {
      const res = await fetch(buildApiUrl(`/stream/sports/${cleanId}.json`), { cache: 'no-store' });
      if (res.ok) {
        const json = await res.json();
        const streams = json.streams || [];
        streamSourcesCache.set(cleanId, { streams, timestamp: Date.now() });
        return streams;
      }
    } catch (_) {}
    return [];
  }

  // ─── Dedicated Watch Stream Page View (Zero Sliders, Pure Server 1, 2) ───────
  async function handleWatchStream(cleanId, title, league = 'Sports') {
    activeMatch = { cleanId, title, league };

    // 1. Switch views: hide home view, show dedicated watch page
    if (homeView) homeView.classList.add('hidden');
    if (watchView) watchView.classList.remove('hidden');

    // 2. Clean URL update without reload: /watch?id=cleanId
    try {
      window.history.pushState(null, '', `/watch?id=${encodeURIComponent(cleanId)}`);
    } catch (_) {}

    // 3. Update Match Title & Meta
    if (playingTitle) playingTitle.textContent = title;
    if (playerLeagueTag) playerLeagueTag.textContent = league;
    if (playerStatusTag) playerStatusTag.textContent = '● CONNECTING';
    if (playerEngineTag) playerEngineTag.textContent = 'Server 1';
    syncWatchFavButton(cleanId);

    // 4. Populate Watch Page Quick Streams (Live Now, No Slider!)
    renderWatchQuickStreams(cleanId);

    // 5. Scroll to top
    window.scrollTo({ top: 0, behavior: 'smooth' });

    showPlayerOverlay(true, 'Connecting to ultra-fast stream server...');
    if (overlayRetryBtn) overlayRetryBtn.classList.add('hidden');
    if (serverPillButtons) serverPillButtons.innerHTML = '<span style="font-size:0.75rem; color:var(--text-dim);">Connecting servers...</span>';

    try {
      let streams = [];

      // Check pre-cache first for instant start
      const cached = streamSourcesCache.get(cleanId);
      if (cached && Date.now() - cached.timestamp < STREAM_CACHE_TTL && cached.streams.length > 0) {
        streams = cached.streams;
      } else {
        streams = await prefetchStreamSources(cleanId);
      }

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

      // Parse candidates — PURE NUMBERED SERVERS: Server 1, Server 2, Server 3 (Zero provider names!)
      currentCandidates = rankCandidates(streams.map((s, idx) => parseStreamCandidate(s, idx)));
      activeCandidateIndex = 0;
      fallbackAttemptCount = 0;

      // Render server selection pills
      renderServerPills();

      // Start playback immediately with top candidate
      startCandidatePlayback(0);

    } catch (err) {
      console.error('[StreamEngine] Error initiating streams:', err);
      showPlayerOverlay(true, 'Unable to connect to stream sources. Please try again.');
      if (overlayRetryBtn) overlayRetryBtn.classList.remove('hidden');
    }
  }

  function closeWatchView(updateUrl = true) {
    teardownArtPlayer();
    if (embedFrame) {
      embedFrame.removeAttribute('src');
      embedFrame.classList.add('hidden');
    }
    if (watchView) watchView.classList.add('hidden');
    if (homeView) homeView.classList.remove('hidden');

    if (updateUrl) {
      const dest = activeCategory !== 'all' ? `/${activeCategory}` : '/';
      try {
        window.history.pushState(null, '', dest);
      } catch (_) {}
    }

    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function syncWatchFavButton(cleanId) {
    if (!watchFavBtn) return;
    const isFav = favorites.includes(cleanId);
    watchFavBtn.style.color = isFav ? '#f59e0b' : 'var(--text-main)';
    const span = watchFavBtn.querySelector('span');
    if (span) span.textContent = isFav ? 'Favorited' : 'Favorite';
  }

  function renderWatchQuickStreams(currentCleanId) {
    if (!watchQuickGrid) return;
    const liveMatches = allMatches.filter(m => m.isLive && m.cleanId !== currentCleanId);
    if (watchQuickCounter) {
      watchQuickCounter.textContent = `${liveMatches.length} Live`;
    }

    if (!liveMatches.length) {
      watchQuickGrid.innerHTML = '<p style="font-size:0.85rem; color:var(--text-dim); padding:1rem; grid-column:1/-1;">No other live broadcasts right now.</p>';
      return;
    }

    const fragment = document.createDocumentFragment();
    liveMatches.slice(0, 8).forEach(m => {
      const wrapper = document.createElement('div');
      wrapper.innerHTML = renderStreamCardHtml(m);
      while (wrapper.firstChild) {
        fragment.appendChild(wrapper.firstChild);
      }
    });
    watchQuickGrid.innerHTML = '';
    watchQuickGrid.appendChild(fragment);
  }

  // ─── Stream Candidate Parser (Strictly Server 1, Server 2, Server 3) ────────
  function parseStreamCandidate(s, index) {
    const serverNum = index + 1;
    const provider = (s._source || 'stream').slice(0, 16);

    // 1. Explicit External Web Embed
    if (s.externalUrl) {
      const resolved = resolveMediaUrl(s.externalUrl);
      return {
        id: index,
        name: `Server ${serverNum}`,
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
          name: `Server ${serverNum}`,
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
          name: `Server ${serverNum}`,
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
      name: `Server ${serverNum}`,
      provider: provider,
      type: 'hls',
      url: raw,
      proxyUrl: buildApiUrl('/api/manifest', { url: raw }),
      isExternal: false
    };
  }

  function rankCandidates(candidates) {
    return candidates.sort((a, b) => {
      const scoreA = providerHealthScores.get(a.provider) || 0;
      const scoreB = providerHealthScores.get(b.provider) || 0;

      if (scoreA !== scoreB) return scoreB - scoreA;
      if (a.type !== b.type) return a.type === 'hls' ? -1 : 1;
      return 0;
    });
  }

  function renderServerPills() {
    if (!serverPillButtons) return;
    serverPillButtons.innerHTML = currentCandidates.map((c, idx) => `
      <button class="server-pill ${idx === activeCandidateIndex ? 'active' : ''}" 
              onclick="window.STREAM_NARO.selectServer(${idx})" 
              title="Switch to Server ${idx + 1}">
        Server ${idx + 1}
      </button>
    `).join('');
  }

  function selectServer(index) {
    if (index >= 0 && index < currentCandidates.length) {
      fallbackAttemptCount = 0;
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
      playerEngineTag.textContent = `Server ${candidate.id + 1}`;
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

    // Click-Shield: Absorb first click to neutralize pop-under ads
    const viewport = document.getElementById('cinema-viewport');
    if (viewport) {
      // Remove any existing shield first
      viewport.querySelectorAll('.embed-click-shield').forEach(s => s.remove());
      
      const shield = document.createElement('div');
      shield.className = 'embed-click-shield';
      viewport.appendChild(shield);

      // First click/touch removes the shield (ad trigger absorbed)
      const removeShield = () => {
        shield.remove();
        console.log('[AdShield] Click-shield absorbed first interaction — stream is now clean');
      };
      shield.addEventListener('click', removeShield, { once: true });
      shield.addEventListener('touchstart', removeShield, { once: true, passive: true });

      // Auto-remove after 5 seconds if user hasn't interacted
      setTimeout(() => {
        if (shield.parentNode) shield.remove();
      }, 5000);
    }

    stallWatchdogTimer = setTimeout(() => {
      console.warn('[StreamEngine] Embed watchdog notice');
    }, 12000);
  }

  // ─── Anti-Lag Tuned HLS Playback ───────────────────────────────────────────
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

              // Anti-Lag & Low-Latency Buffer Configuration
              const hls = new Hls({
                loader: CustomHlsLoader,
                enableWorker: true,
                lowLatencyMode: true,
                backBufferLength: 60,
                maxBufferLength: 30,
                maxMaxBufferLength: 60,
                maxBufferSize: 60 * 1000 * 1000,
                liveSyncDurationCount: 3,
                liveMaxLatencyDurationCount: 8,
                liveDurationInfinity: true,
                highBufferWatchdogPeriod: 2,
                manifestLoadingTimeOut: 10000,
                manifestLoadingMaxRetry: 3,
                levelLoadingTimeOut: 10000
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

              hls.on(Hls.Events.LEVEL_LOADED, () => {
                showPlayerOverlay(false);
              });

              hls.on(Hls.Events.ERROR, (event, data) => {
                if (data.fatal) {
                  switch (data.type) {
                    case Hls.ErrorTypes.NETWORK_ERROR:
                      if (!forceProxy) {
                        console.log('[StreamEngine] Direct blocked on CORS. Auto-retrying via Proxy...');
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

      // Quick Stall Watchdog (6 seconds without forward progress)
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
    }, 6500);
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
    }, 300);
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
    closeWatchView(true);
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
    prefetch: prefetchStreamSources,
    selectServer: selectServer,
    toggleFavorite: toggleFavorite,
    navigateToCategory: navigateToCategory,
    goHome: goHome,
    closeWatch: closeWatchView
  };

  // Legacy fallback alias
  window.handleWatchClick = handleWatchStream;

})();
