/**
 * src/ui/discovery/discovery-client-app.mjs
 *
 * Alpine.js discoveryApp() client script for Keyword Discovery & Autocomplete Hub
 * Extracted from src/discovery-ui.mjs
 */

export function getDiscoveryClientAppScript() {
  return `  <script>
    // [INVARIANT: SAFE-URL PROTOCOL SANITIZATION]
    function safeUrl(rawUrl, fallback = '#') {
      if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeUrl === 'function') {
        const res = window.PAEFormatters.safeUrl(rawUrl);
        return res === '#' ? fallback : res;
      }
      // @deprecated VM fallback when shared-head formatters are absent
      if (!rawUrl || typeof rawUrl !== 'string') return fallback;
      const trimmed = rawUrl.trim();
      if (/^https?:\\/\\//i.test(trimmed) || (trimmed.startsWith('/') && !trimmed.startsWith('//'))) return trimmed;
      return fallback;
    }

    function discoveryApp() {
      return {
        safeUrl,
        isSidebarCollapsed: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pae_sidebar_collapsed') === 'true' : false;
          } catch (_) { return false; }
        })(),
        isMobileMenuOpen: false,
        toggleSidebar() {
          this.isSidebarCollapsed = !this.isSidebarCollapsed;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pae_sidebar_collapsed', this.isSidebarCollapsed ? 'true' : 'false');
            }
          } catch (_) {}
          this.$nextTick(() => {
            if (window.lucide) window.lucide.createIcons();
          });
        },
        // [INVARIANT: SAFE-STORAGE-GUARD] Guard against non-browser/headless execution contexts
        darkMode: (() => {
          try {
            return typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') === 'dark' : false;
          } catch (_) { return false; }
        })(),
        toggleTheme() {
          this.darkMode = !this.darkMode;
          if (this.darkMode) {
            document.documentElement.classList.add('dark');
            localStorage.setItem('pa_theme', 'dark');
            localStorage.setItem('pin_theme', 'dark');
            this.showToast('Dark theme activated', 'info');
          } else {
            document.documentElement.classList.remove('dark');
            localStorage.setItem('pa_theme', 'light');
            localStorage.setItem('pin_theme', 'light');
            this.showToast('Light theme activated', 'info');
          }
        },
        searchQuery: '',
        loading: false,
        results: [],
        selectedKeywords: [],
        availableFolders: [],
        isCacheHit: false,
        submittingBulk: false,
        openBulkModal: false,
        bulkKeywordsText: '',
        bulkTargetFolderId: '',
        openAddToFolderModal: false,
        selectedFolderId: '',
        newFolderName: '',
        keywordsToAddToFolder: [],
        abortController: null,
        requestIdCounter: 0,
        activeRequestId: 0,
        searchCache: new Map(),
        // Related Interests Modal State
        openRelatedModal: false,
        relatedLoading: false,
        activeRelatedTerm: '',
        relatedTab: 'all', // 'all', 'related', 'additions'
        relatedData: null,
        selectedRelatedAnnotations: [],
        copyingAnnoId: null,
        relatedAbortController: null,
        relatedRequestIdCounter: 0,
        activeRelatedRequestId: 0,
        toast: {
          show: false,
          message: '',
          type: 'success'
        },
        toastTimeout: null,

        async init() {
          if (typeof window !== 'undefined') {
            window.addEventListener('keydown', (e) => {
              if ((e.ctrlKey || e.metaKey) && (e.key === 'b' || e.key === 'B')) {
                const activeTag = document.activeElement ? document.activeElement.tagName.toLowerCase() : '';
                if (activeTag !== 'input' && activeTag !== 'textarea') {
                  e.preventDefault();
                  this.toggleSidebar();
                }
              }
            });
          }

          if (this.darkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }

          this.$nextTick(() => {
            if (window.lucide) {
              window.lucide.createIcons();
            }
          });
          setTimeout(() => {
            if (window.lucide) window.lucide.createIcons();
          }, 300);

          await this.loadFolders();
        },

        showToast(message, type = 'success') {
          this.toast.message = message;
          this.toast.type = type;
          this.toast.show = true;
          if (this.toastTimeout) clearTimeout(this.toastTimeout);
          this.toastTimeout = setTimeout(() => {
            this.toast.show = false;
          }, 3500);
        },

        async loadFolders() {
          try {
            const res = await fetch('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.availableFolders = data.folders || [];
            }
          } catch (_) {}
        },

        parseBulkKeywords(text) {
          if (!text) return [];
          const raw = text.split(/[\\r\\n;,]+/);
          const seen = new Set();
          const clean = [];
          for (let i = 0; i < raw.length; i++) {
            const s = raw[i].replace(/[\\u200B-\\u200D\\uFEFF]/g, '').trim().toLowerCase();
            if (s.length >= 2 && s.length <= 100 && !seen.has(s)) {
              seen.add(s);
              clean.push(s);
            }
          }
          return clean;
        },

        get cleanBulkKeywordsCount() {
          return this.parseBulkKeywords(this.bulkKeywordsText).length;
        },

        onInputDebounced() {
          this.executeTypeahead(false);
        },

        searchImmediately() {
          this.executeTypeahead(true);
        },

        applySeed(seed) {
          this.searchQuery = seed;
          this.searchImmediately();
        },

        clearSearch() {
          this.searchQuery = '';
          this.results = [];
          this.selectedKeywords = []; // Prevent ghost selections
          this.loading = false;
          this.isCacheHit = false;
          if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
          }
        },

        async executeTypeahead(immediate = false) {
          const q = this.searchQuery.trim().toLowerCase();
          if (!q || q.length < 2) {
            this.results = [];
            this.selectedKeywords = [];
            this.loading = false;
            this.isCacheHit = false;
            return;
          }

          // Clear previous query selections to prevent ghost state
          this.selectedKeywords = [];

          const reqId = ++this.requestIdCounter;
          this.activeRequestId = reqId;

          // 1. In-Memory Client Cache Check (0ms Response)
          if (this.searchCache.has(q)) {
            if (this.abortController) {
              this.abortController.abort();
              this.abortController = null;
            }
            const cached = this.searchCache.get(q);
            // Refresh LRU order
            this.searchCache.delete(q);
            this.searchCache.set(q, cached);
            this.results = cached;
            this.loading = false;
            this.isCacheHit = true;
            return;
          }

          // 2. Abort previous in-flight request to prevent race conditions
          if (this.abortController) {
            this.abortController.abort();
          }
          this.abortController = new AbortController();
          this.loading = true;
          this.isCacheHit = false;

          try {
            const res = await fetch('/api/discovery/typeahead?q=' + encodeURIComponent(q), {
              signal: this.abortController.signal
            });
            if (reqId !== this.activeRequestId) return; // Stale request discarded
            if (!res.ok) {
              throw new Error('HTTP ' + res.status);
            }
            const data = await res.json();
            if (reqId !== this.activeRequestId) return; // Stale request discarded
            if (data.success === false && !Array.isArray(data.suggestions)) {
              throw new Error(data.error || 'Pinterest API error');
            }

            const rawSuggestions = data.enriched_suggestions || data.suggestions || data.terms || data.queries || data.data || [];

            // Calculate max volume for relative volume bar
            let maxVol = 10000;
            rawSuggestions.forEach(item => {
              if (item && typeof item === 'object' && typeof item.search_volume === 'number' && item.search_volume > maxVol) {
                maxVol = item.search_volume;
              }
            });

            const mapped = rawSuggestions.map((item, idx) => {
              const termStr = typeof item === 'string' ? item : (item.term || item.query || item.clean_query || '');
              const searchVol = (typeof item === 'object' && typeof item.search_volume === 'number') ? item.search_volume : null;
              const annoId = (typeof item === 'object' && item.annotation_id) ? item.annotation_id : null;
              const categoryTree = (typeof item === 'object' && Array.isArray(item.category_tree)) ? item.category_tree : [];
              const categoryPath = (typeof item === 'object' && item.category_path) ? item.category_path : (categoryTree.length > 0 ? categoryTree.join(' > ') : '');
              const pinterestUrl = (typeof item === 'object' && item.url) ? item.url : ('https://www.pinterest.com/search/pins/?q=' + encodeURIComponent(termStr));
              const weeklyChange = (typeof item === 'object' && typeof item.weekly_change === 'number') ? item.weekly_change : null;
              const monthlyChange = (typeof item === 'object' && typeof item.monthly_change === 'number') ? item.monthly_change : ((typeof item === 'object' && typeof item.velocity_30d === 'number') ? item.velocity_30d : null);
              const yearlyChange = (typeof item === 'object' && typeof item.yearly_change === 'number') ? item.yearly_change : null;
              const velocity30d = monthlyChange;
              const counts = (typeof item === 'object' && Array.isArray(item.counts)) ? item.counts : [];
              const hasPrediction = (typeof item === 'object' && Boolean(item.has_prediction));
              const volumeBarPct = searchVol !== null ? Math.max(8, Math.min(100, Math.round((searchVol / maxVol) * 100))) : null;

              const isSeed = (typeof item === 'object' && Boolean(item.is_seed)) || (termStr.toLowerCase() === q.toLowerCase());

              return {
                term: termStr,
                isSeed: isSeed,
                searchVolume: searchVol,
                volumeBarPct: volumeBarPct,
                annotationId: annoId,
                categoryTree: categoryTree,
                categoryPath: categoryPath,
                pinterestUrl: pinterestUrl,
                weeklyChange: weeklyChange,
                monthlyChange: monthlyChange,
                yearlyChange: yearlyChange,
                velocity30d: velocity30d,
                counts: counts,
                hasPrediction: hasPrediction,
                isTop: (idx === 0 && !isSeed) || (idx === 1 && isSeed)
              };
            }).filter(r => r.term.length > 0);

            // 3. Store in LRU Client Cache (Max 30 items) - Only on success
            if (this.searchCache.size >= 30) {
              const oldestKey = this.searchCache.keys().next().value;
              this.searchCache.delete(oldestKey);
            }
            this.searchCache.set(q, mapped);

            this.results = mapped;
          } catch (err) {
            if (err.name === 'AbortError') return; // Silently swallow aborts
            if (reqId !== this.activeRequestId) return;
            console.warn('Discovery typeahead fetch error:', err.message);
          } finally {
            if (reqId === this.activeRequestId) {
              this.loading = false;
            }
          }
        },

        // --- Pinterest Related Interests Explorer ---
        async openRelatedExplorer(term) {
          const clean = String(term || this.searchQuery || '').trim();
          if (!clean) return;

          if (this.relatedAbortController) {
            this.relatedAbortController.abort();
          }
          this.relatedAbortController = new AbortController();
          const reqId = ++this.relatedRequestIdCounter;
          this.activeRelatedRequestId = reqId;

          this.activeRelatedTerm = clean;
          this.openRelatedModal = true;
          this.relatedLoading = true;
          this.relatedTab = 'all';
          this.selectedRelatedAnnotations = [];
          this.relatedData = null;

          try {
            const res = await fetch('/api/keywords/related-interests?q=' + encodeURIComponent(clean) + '&mode=both', {
              signal: this.relatedAbortController.signal
            });
            if (reqId !== this.activeRelatedRequestId) return; // Stale request discarded
            if (!res.ok) throw new Error('HTTP ' + res.status);
            const data = await res.json();
            if (reqId !== this.activeRelatedRequestId) return; // Stale request discarded
            if (data.success) {
              this.relatedData = data;
            } else {
              this.showToast(data.error || 'Failed to fetch related interests', 'error');
            }
          } catch (err) {
            if (err.name === 'AbortError') return; // Silent discard
            if (reqId !== this.activeRelatedRequestId) return;
            this.showToast('Error querying Pinterest Interest graph: ' + err.message, 'error');
          } finally {
            if (reqId === this.activeRelatedRequestId) {
              this.relatedLoading = false;
            }
          }
        },

        get filteredRelatedList() {
          if (!this.relatedData) return [];
          if (this.relatedTab === 'related') {
            return this.relatedData.related_interests || [];
          }
          if (this.relatedTab === 'additions') {
            return this.relatedData.additions || [];
          }
          return this.relatedData.all || [];
        },

        toggleSelectAllRelated() {
          const list = this.filteredRelatedList;
          if (this.selectedRelatedAnnotations.length === list.length) {
            this.selectedRelatedAnnotations = [];
          } else {
            this.selectedRelatedAnnotations = list.map(item => item.annotation);
          }
        },

        async trackRelatedSingle(annotation) {
          await this.trackSingleKeyword(annotation);
        },

        async trackSelectedRelated() {
          if (!this.selectedRelatedAnnotations.length) return;
          try {
            // [INVARIANT: SAFE-API-FETCH-GUARD] Route mutation through safeApiFetch with res.ok validation
            const fetcher = (typeof window !== 'undefined' && window.safeApiFetch) || fetch;
            const res = await fetcher('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywords: this.selectedRelatedAnnotations })
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || errData.message || ('Failed to track annotations (HTTP ' + res.status + ')'));
            }
            const data = await res.json();
            if (data.success) {
              this.showToast('Successfully tracked ' + (data.added || this.selectedRelatedAnnotations.length) + ' annotations in Radar!');
              this.selectedRelatedAnnotations = [];
            } else {
              this.showToast(data.message || 'Failed to track annotations', 'error');
            }
          } catch (err) {
            this.showToast(err.message, 'error');
          }
        },

        openFolderModalForRelated() {
          if (!this.selectedRelatedAnnotations.length) return;
          this.keywordsToAddToFolder = [...this.selectedRelatedAnnotations];
          this.openAddToFolderModal = true;
        },

        openAddToFolderModalForSingle(term) {
          if (!term) return;
          this.keywordsToAddToFolder = [term];
          this.openAddToFolderModal = true;
        },

        sparklinePoints(counts) {
          if (!Array.isArray(counts) || counts.length < 2) return '';
          const min = Math.min(...counts);
          const max = Math.max(...counts);
          const range = max - min || 1;
          const width = 48;
          const height = 18;
          const step = width / (counts.length - 1);
          return counts.map((c, i) => {
            const x = Math.round(i * step);
            const y = Math.round(height - ((c - min) / range) * (height - 4) - 2);
            return x + ',' + y;
          }).join(' ');
        },

        copyAnnotationId(id) {
          if (!id) return;
          navigator.clipboard.writeText(String(id)).then(() => {
            this.copyingAnnoId = id;
            setTimeout(() => { this.copyingAnnoId = null; }, 1800);
            this.showToast('Copied Annotation ID: ' + id);
          }).catch(() => {});
        },

        highlightTerm(term) {
          if (!this.searchQuery || !term) return this.escapeHtml(term);
          const q = this.searchQuery.trim().toLowerCase();
          const cleanTerm = String(term);
          const lower = cleanTerm.toLowerCase();
          const idx = lower.indexOf(q);
          if (idx === -1) return this.escapeHtml(cleanTerm);
          const before = this.escapeHtml(cleanTerm.slice(0, idx));
          const match = this.escapeHtml(cleanTerm.slice(idx, idx + q.length));
          const after = this.escapeHtml(cleanTerm.slice(idx + q.length));
          return before + '<mark class="bg-emerald-500/20 text-emerald-300 font-semibold px-0.5 rounded not-italic">' + match + '</mark>' + after;
        },

        escapeHtml(str) {
          return String(str || '')
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
        },

        selectAllToggle() {
          if (this.selectedKeywords.length === this.results.length) {
            this.selectedKeywords = [];
          } else {
            this.selectedKeywords = this.results.map(r => r.term);
          }
        },

        async trackSingleKeyword(kw) {
          const clean = String(kw || '').trim();
          if (!clean) return;
          try {
            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywords: [clean] })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Keyword "' + clean + '" scheduled for Radar tracking!');
            } else {
              this.showToast(data.message || 'Failed to track keyword', 'error');
            }
          } catch (e) {
            this.showToast('Network error tracking keyword: ' + e.message, 'error');
          }
        },

        async trackSelectedDirectly() {
          if (!this.selectedKeywords.length || this.submittingBulk) return;
          this.submittingBulk = true;
          try {
            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keywords: this.selectedKeywords })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Successfully scheduled ' + (data.added || this.selectedKeywords.length) + ' keywords for tracking!');
              this.selectedKeywords = [];
            } else {
              this.showToast(data.message || 'Failed to track keywords', 'error');
            }
          } catch (e) {
            this.showToast('Failed to import: ' + e.message, 'error');
          } finally {
            this.submittingBulk = false;
          }
        },

        async submitAddToFolder() {
          const targetKws = (this.keywordsToAddToFolder && this.keywordsToAddToFolder.length) 
            ? this.keywordsToAddToFolder 
            : this.selectedKeywords;
          if (!targetKws.length || this.submittingBulk) return;
          this.submittingBulk = true;
          try {
            if (!this.selectedFolderId && !this.newFolderName.trim()) {
              this.showToast('Please select an existing folder or enter a new folder name', 'error');
              this.submittingBulk = false;
              return;
            }

            let targetFid = this.selectedFolderId;
            if (!targetFid && this.newFolderName.trim()) {
              const createRes = await fetch('/api/folders', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: this.newFolderName.trim() })
              });
              const cData = await createRes.json();
              if (cData.folder?.id) {
                targetFid = cData.folder.id;
              }
            }

            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ 
                keywords: targetKws,
                folder_id: targetFid ? Number(targetFid) : null
              })
            });

            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Assigned ' + (data.added || targetKws.length) + ' keywords to campaign folder!');
              this.openAddToFolderModal = false;
              if (this.keywordsToAddToFolder && this.keywordsToAddToFolder.length) {
                this.selectedRelatedAnnotations = [];
                this.keywordsToAddToFolder = [];
              } else {
                this.selectedKeywords = [];
              }
              this.newFolderName = '';
              await this.loadFolders();
            } else {
              this.showToast(data.message || 'Error assigning to folder', 'error');
            }
          } catch (e) {
            this.showToast('Error assigning to folder: ' + e.message, 'error');
          } finally {
            this.submittingBulk = false;
          }
        },

        async submitBulkImport() {
          const cleanKws = this.parseBulkKeywords(this.bulkKeywordsText);
          if (!cleanKws.length || this.submittingBulk) return;
          if (cleanKws.length > 1000) {
            this.showToast('Maximum 1,000 keywords allowed per batch (found ' + cleanKws.length + ')', 'error');
            return;
          }

          this.submittingBulk = true;
          try {
            const res = await fetch('/api/keywords/bulk-import', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                keywords: cleanKws,
                folder_id: this.bulkTargetFolderId ? Number(this.bulkTargetFolderId) : null
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('Successfully imported ' + (data.added || cleanKws.length) + ' keywords!');
              this.openBulkModal = false;
              this.bulkKeywordsText = '';
              await this.loadFolders();
            } else {
              this.showToast(data.message || 'Failed to import keywords', 'error');
            }
          } catch (e) {
            this.showToast('Failed to import: ' + e.message, 'error');
          } finally {
            this.submittingBulk = false;
          }
        }
      };
    }
    if (typeof document !== 'undefined') {
      const initLucide = () => {
        if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      };
      if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initLucide);
      } else {
        initLucide();
      }
      window.addEventListener('load', initLucide);
    }
  </script>`;
}
