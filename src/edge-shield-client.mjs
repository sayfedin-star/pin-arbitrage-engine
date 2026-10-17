/**
 * Edge Shield Universal Client Hooks
 * Injected across all UI studios (/keywords, /domains, /discovery, /folders, /)
 * Provides:
 * 1. User Activity Tracking (Inactivity Cutoff: 15 minutes)
 * 2. Operator Session Keep-Alive Heartbeat (4-min interval, 0 shards woken up)
 * 3. Smart Prefetch on Hover (120ms debounce, wakes up ONLY target shard O(1))
 */
export function getEdgeShieldClientScript() {
  return `<script>
  (function installEdgeShieldClientHooks() {
    if (typeof window === 'undefined' || window.__edgeShieldInstalled) return;
    window.__edgeShieldInstalled = true;

    // 1. User Activity Tracker (Inactivity cutoff: 15 minutes)
    var lastUserActivity = Date.now();
    var INACTIVITY_TIMEOUT_MS = 15 * 60 * 1000;
    var markActive = function() { lastUserActivity = Date.now(); };
    ['mousemove', 'mousedown', 'keydown', 'scroll', 'touchstart'].forEach(function(evt) {
      window.addEventListener(evt, markActive, { passive: true });
    });

    // 2. Operator Session Keep-Alive Heartbeat (4-min interval)
    // Only fires if tab is visible AND user was active within last 15 minutes
    // Sends body '{}' -> 0 shards awakened, keeps Cloudflare Worker & Hub warm
    setInterval(function() {
      if (document.hidden) return;
      if (Date.now() - lastUserActivity > INACTIVITY_TIMEOUT_MS) return;
      fetch('/api/fleet/keep-alive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: '{}'
      }).catch(function() {});
    }, 240000);

    // 3. Smart Prefetch on Hover (120ms debounce)
    // Wakes up ONLY the specific target shard (O(1)) for the hovered pin
    var hoverPrefetchTimer = null;
    var prefetchCache = new Set();

    document.addEventListener('mouseover', function(e) {
      var pinCard = e.target.closest('[data-pin-id], a[href*="/pin/"], a[href*="/pins/"]');
      if (!pinCard) {
        if (hoverPrefetchTimer) { clearTimeout(hoverPrefetchTimer); hoverPrefetchTimer = null; }
        return;
      }
      var pid = pinCard.getAttribute('data-pin-id');
      if (!pid && pinCard.href) {
        var match = pinCard.href.match(/\\/pins?\\/([0-9]{10,})/);
        if (match) pid = match[1];
      }
      if (pid && pid.length >= 10 && !isNaN(Number(pid)) && !prefetchCache.has(pid)) {
        if (hoverPrefetchTimer) clearTimeout(hoverPrefetchTimer);
        hoverPrefetchTimer = setTimeout(function() {
          prefetchCache.add(pid);
          fetch('/api/pins/' + pid + '?prefetch=true', { method: 'GET' }).catch(function() {});
        }, 120);
      }
    }, { passive: true });

    document.addEventListener('mouseout', function(e) {
      if (e.target.closest('[data-pin-id], a[href*="/pin/"], a[href*="/pins/"]')) {
        if (hoverPrefetchTimer) { clearTimeout(hoverPrefetchTimer); hoverPrefetchTimer = null; }
      }
    }, { passive: true });
  })();
</script>`;
}
