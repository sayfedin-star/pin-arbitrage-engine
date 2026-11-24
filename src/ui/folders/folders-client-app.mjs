/**
 * Campaign Folders Client Application Script (Alpine.js foldersApp)
 */
export function getFoldersClientAppScript() {
  return `  <script>
    function foldersApp(activeFolderId, initialRoom = 'crossover') {
      return {
        activeFolderId,
        currentRoom: initialRoom || 'crossover',
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
            if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
          });
        },
        darkMode: typeof localStorage !== 'undefined' ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) === 'dark' : false,
        isDark: typeof localStorage !== 'undefined' ? (localStorage.getItem('pa_theme') || localStorage.getItem('pin_theme')) === 'dark' : false,
        foldersList: [],
        foldersLoading: false,
        activeFolder: null,
        crossoverData: null,
        crossoverLoading: false,
        _folderReqSeq: 0,
        _foldersListAbortController: null,
        _activeFolderAbortController: null,
        auditDispatching: false,
        settingsLoading: false,
        workspaceSettingsDefaults: {
          default_serp_top_n: 20,
          pin_graph_rules: {
            auto_trigger_enabled: false,
            linkless_only: false,
            min_repins: 500,
            max_pages: 20
          }
        },
        selectedTimeWindow: '24h',
        trackedPinsSummary: {
          items: [],
          total: 0,
          serp_top_n: 20,
          source_counts: { all: 0, search: 0, newborn: 0, creator: 0, related: 0 }
        },
        trackedPinsSourceFilter: 'all',
        trackedPinsExpanded: false,
        trackedPinsLoading: false,
        syncingTopN: false,
        selectedStudioPinIds: [],
        pinGraphSeeds: [],
        pinGraphExpanded: false,
        manualPinGraphSeedInput: '',
        queueingPinGraphSeeds: false,
        pruningLoading: false,
        prunePreviewResult: null,
        pruneForm: {
          scope: 'displaced',
          min_pin_age_days: 30,
          max_saves: 5,
          keyword_ids: []
        },

        isLinklessVacuumDomain(domainStr) {
          const d = String(domainStr || '').trim().toLowerCase();
          return !d || d === 'uploaded by user' || d === 'uploaded-by-user' || d === 'organic';
        },

        getSelectedWindowLabel() {
          const map = {
            '24h': '24h Velocity',
            '5d': '5d Gains',
            '7d': '7d Gains',
            '10d': '10d Gains',
            '15d': '15d Gains',
            'all': 'All-Time Saves'
          };
          return map[this.selectedTimeWindow] || 'Daily Velocity';
        },

        getPinWindowGain(sp) {
          if (!sp) return null;
          const win = this.selectedTimeWindow;
          if (win === '24h') {
            const d24 = Number(sp.effective_velocity ?? sp.delta_saves_24h ?? sp.daily_save_velocity ?? 0);
            return Math.max(0, Math.round(d24));
          }
          if (win === '5d') return sp.gains_5d != null && Number.isFinite(Number(sp.gains_5d)) ? Math.max(0, Math.round(Number(sp.gains_5d))) : null;
          if (win === '7d') return sp.gains_7d != null && Number.isFinite(Number(sp.gains_7d)) ? Math.max(0, Math.round(Number(sp.gains_7d))) : null;
          if (win === '10d') return sp.gains_10d != null && Number.isFinite(Number(sp.gains_10d)) ? Math.max(0, Math.round(Number(sp.gains_10d))) : null;
          if (win === '15d') return sp.gains_15d != null && Number.isFinite(Number(sp.gains_15d)) ? Math.max(0, Math.round(Number(sp.gains_15d))) : null;
          return Math.max(0, Math.round(Number(sp.save_count || 0)));
        },

        getPinWindowRepins(sp) {
          if (!sp) return null;
          const win = this.selectedTimeWindow;
          if (win === 'all') return Math.max(0, Math.round(Number(sp.repin_count || 0)));
          if (win === '24h') return Math.max(0, Math.round(Number(sp.delta_repins_24h ?? sp.daily_repin_velocity ?? 0)));
          if (win === '5d') return sp.repins_gains_5d != null && Number.isFinite(Number(sp.repins_gains_5d)) ? Math.max(0, Math.round(Number(sp.repins_gains_5d))) : null;
          if (win === '7d') return sp.repins_gains_7d != null && Number.isFinite(Number(sp.repins_gains_7d)) ? Math.max(0, Math.round(Number(sp.repins_gains_7d))) : null;
          if (win === '10d') return sp.repins_gains_10d != null && Number.isFinite(Number(sp.repins_gains_10d)) ? Math.max(0, Math.round(Number(sp.repins_gains_10d))) : null;
          if (win === '15d') return sp.repins_gains_15d != null && Number.isFinite(Number(sp.repins_gains_15d)) ? Math.max(0, Math.round(Number(sp.repins_gains_15d))) : null;
          return null;
        },

        formatPinWindowPrimary(sp) {
          const gain = this.getPinWindowGain(sp);
          if (gain === null) return '—';
          if (this.selectedTimeWindow === '24h') return '+' + this.formatNumber(gain) + '/d';
          if (this.selectedTimeWindow === 'all') return this.formatNumber(gain) + ' saves';
          return '+' + this.formatNumber(gain) + ' (' + this.selectedTimeWindow + ')';
        },

        get clusterWindowSavesGains() {
          const win = this.selectedTimeWindow;
          const summaryWin = this.crossoverData?.summary?.multi_window_gains?.[win];
          if (summaryWin && summaryWin.saves !== undefined && summaryWin.saves !== null && Number.isFinite(Number(summaryWin.saves))) {
            if (win !== '24h' && win !== 'all' && summaryWin.saves_coverage === 0) {
              return null;
            }
            return Math.max(0, Math.round(Number(summaryWin.saves)));
          }
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return (win !== '24h' && win !== 'all') ? null : 0;
          let sum = 0;
          let covered = 0;
          for (const p of pins) {
            const g = this.getPinWindowGain(p);
            if (g !== null) {
              sum += g;
              covered++;
            }
          }
          if (win !== '24h' && win !== 'all' && covered === 0) return null;
          return sum;
        },

        get clusterWindowRepinsGains() {
          const win = this.selectedTimeWindow;
          const summaryWin = this.crossoverData?.summary?.multi_window_gains?.[win];
          if (summaryWin && summaryWin.repins !== undefined && summaryWin.repins !== null && Number.isFinite(Number(summaryWin.repins))) {
            if (win !== '24h' && win !== 'all' && summaryWin.repins_coverage === 0) {
              return null;
            }
            return Math.max(0, Math.round(Number(summaryWin.repins)));
          }
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return (win !== '24h' && win !== 'all') ? null : 0;
          let sum = 0;
          let covered = 0;
          for (const p of pins) {
            const r = this.getPinWindowRepins(p);
            if (r !== null) {
              sum += r;
              covered++;
            }
          }
          if (win !== '24h' && win !== 'all' && covered === 0) return null;
          return sum;
        },

        get clusterAvgVelocity() {
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return '0.0';
          const totalVel = pins.reduce((sum, p) => sum + (Number(p.daily_save_velocity || 0)), 0);
          return (totalVel / pins.length).toFixed(1);
        },

        get clusterCompetitorAudienceGains() {
          const win = this.selectedTimeWindow;
          // Competitor reach snapshots are authentically tracked on 24h, 7d, and All-Time windows only (no fake linear interpolation)
          if (win === '5d' || win === '10d' || win === '15d') {
            return null;
          }
          const fullRollup = this.crossoverData?.summary?.competitor_audience_gains;
          if (fullRollup && fullRollup[win] !== undefined && fullRollup[win] !== null && Number.isFinite(Number(fullRollup[win]))) {
            return Math.max(0, Math.round(Number(fullRollup[win])));
          }
          const creators = this.crossoverData?.top_creators || [];
          if (!creators.length) return 0;
          return creators.reduce((sum, c) => {
            let val = 0;
            if (win === '24h') val = Number(c.delta_reach_24h ?? c.delta_monthly_reach ?? 0);
            else if (win === '7d') val = Number(c.reach_delta_7d ?? 0);
            else val = Number(c.monthly_reach ?? c.delta_audience_30d ?? 0);
            return sum + Math.max(0, Number.isFinite(val) ? val : 0);
          }, 0);
        },

        toggleSelectStudioPin(pinId) {
          const pid = String(pinId || '').trim();
          if (!pid) return;
          if (this.selectedStudioPinIds.includes(pid)) {
            this.selectedStudioPinIds = this.selectedStudioPinIds.filter(id => id !== pid);
          } else {
            this.selectedStudioPinIds = [...this.selectedStudioPinIds, pid];
          }
        },

        clearStudioPinSelection() {
          this.selectedStudioPinIds = [];
        },

        async loadTrackedPinsSummary(sourceType = null) {
          if (!this.activeFolderId) return;
          const activeSource = sourceType !== null ? sourceType : this.trackedPinsSourceFilter;
          this.trackedPinsSourceFilter = activeSource || 'all';
          this.trackedPinsLoading = true;
          try {
            const qs = this.trackedPinsSourceFilter && this.trackedPinsSourceFilter !== 'all'
              ? ('?source_type=' + encodeURIComponent(this.trackedPinsSourceFilter))
              : '';
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/tracked-pins' + qs);
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              this.trackedPinsSummary = {
                items: Array.isArray(data.items) ? data.items : (Array.isArray(data.tracked_pins) ? data.tracked_pins : []),
                total: Number(data.total || 0),
                serp_top_n: Number(data.serp_top_n || this.activeFolder?.serp_top_n || 20),
                source_counts: data.source_counts || { all: 0, search: 0, newborn: 0, creator: 0, related: 0 }
              };
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.error || 'Failed to load tracked campaign pins', 'error');
            }
          } catch (err) {
            if (!err || err.name !== 'AbortError') {
              this.showToast('Failed to load tracked campaign pins: ' + (err?.message || 'network error'), 'error');
            }
          } finally {
            this.trackedPinsLoading = false;
            if (typeof this.$nextTick === 'function') this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async syncTopNSerpPins() {
          if (!this.activeFolderId || this.syncingTopN) return;
          this.syncingTopN = true;
          try {
            const topN = Number(this.folderSettings?.serp_top_n || this.activeFolder?.serp_top_n || 20);
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/tracked-pins/sync-top-n', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ top_n: topN })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
              this.showToast('Synced ' + (data.synced || 0) + ' Top-' + (data.top_n || topN) + ' SERP pins into daily tracking', 'success');
              await this.loadTrackedPinsSummary(this.trackedPinsSourceFilter);
            } else {
              this.showToast(data.error || 'Failed to sync Top-N SERP pins', 'error');
            }
          } catch (err) {
            this.showToast('Sync failed: ' + err.message, 'error');
          } finally {
            this.syncingTopN = false;
          }
        },

        async removeTrackedPin(pinId, sourceType = null) {
          if (!this.activeFolderId || !pinId) return;
          try {
            const qs = sourceType ? ('?source_type=' + encodeURIComponent(sourceType)) : '';
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/tracked-pins/' + encodeURIComponent(pinId) + qs, {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Removed Pin #' + pinId + ' from campaign daily tracking', 'info');
              await this.loadTrackedPinsSummary(this.trackedPinsSourceFilter);
            }
          } catch (err) {
            this.showToast('Failed to remove tracked pin: ' + err.message, 'error');
          }
        },

        async loadPinGraphSeeds() {
          if (!this.activeFolderId) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/pin-graph-seeds');
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              this.pinGraphSeeds = Array.isArray(data.seeds) ? data.seeds : [];
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.error || 'Failed to load Pin Graph seeds', 'error');
            }
          } catch (err) {
            if (!err || err.name !== 'AbortError') {
              this.showToast('Failed to load Pin Graph seeds: ' + (err?.message || 'network error'), 'error');
            }
          }
        },

        async queueSelectedForRelatedPins(pinIdsOverride = null) {
          if (!this.activeFolderId || this.queueingPinGraphSeeds) return;
          const pinIds = Array.isArray(pinIdsOverride) && pinIdsOverride.length
            ? pinIdsOverride
            : this.selectedStudioPinIds;
          if (!pinIds.length) {
            this.showToast('Select at least one pin first', 'warning');
            return;
          }
          this.queueingPinGraphSeeds = true;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/pin-graph-seeds', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ pin_ids: pinIds, depth: 1 })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
              this.showToast('Queued ' + (data.added || pinIds.length) + ' seed pin(s) for Related Pins extraction', 'success');
              this.selectedStudioPinIds = [];
              await this.loadPinGraphSeeds();
            } else {
              this.showToast(data.error || 'Failed to queue Related Pins seeds', 'error');
            }
          } catch (err) {
            this.showToast('Network error: ' + err.message, 'error');
          } finally {
            this.queueingPinGraphSeeds = false;
          }
        },

        async queueManualPinGraphSeeds() {
          const raw = String(this.manualPinGraphSeedInput || '').trim();
          if (!raw) {
            this.showToast('Paste at least one Pin ID or Pinterest Pin URL', 'warning');
            return;
          }
          const ids = Array.from(new Set(
            raw.split(/[\s,]+/)
              .map((part) => {
                const m = String(part).match(/\d{10,30}/);
                return m ? m[0] : '';
              })
              .filter(Boolean)
          ));
          if (!ids.length) {
            this.showToast('No valid numeric Pin IDs found', 'warning');
            return;
          }
          await this.queueSelectedForRelatedPins(ids);
          this.manualPinGraphSeedInput = '';
        },

        async removePinGraphSeed(pinId) {
          if (!this.activeFolderId || !pinId) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/pin-graph-seeds/' + encodeURIComponent(pinId), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Removed seed Pin #' + pinId, 'info');
              await this.loadPinGraphSeeds();
            } else {
              const data = await res.json().catch(() => ({}));
              this.showToast(data.error || 'Failed to remove seed', 'error');
            }
          } catch (err) {
            this.showToast('Network error: ' + err.message, 'error');
          }
        },

        async sendCreatorToWatchlist(username, displayLabel = '') {
          const clean = String(username || '').replace(/^@+/, '').trim();
          if (!clean) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/watchlist', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                entity_type: 'creator',
                entity_key: clean,
                display_label: displayLabel || clean,
                creator_tracking_mode: 'metrics_only'
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
              this.showToast('Added @' + clean + ' to Workspace Watchlist', 'success');
            } else {
              this.showToast(data.error || 'Failed to add creator to Watchlist', 'error');
            }
          } catch (err) {
            this.showToast('Watchlist error: ' + err.message, 'error');
          }
        },

        formatUniversalAge(days) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.formatUniversalAge === 'function') {
            return window.PAEFormatters.formatUniversalAge(days);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (days == null || isNaN(days) || days === '') return '—';
          const numDays = Number(days);
          if (numDays >= 365) {
            return (numDays / 365).toFixed(1) + 'y';
          }
          return Math.floor(numDays) + 'd';
        },

        copyAnnotation(tag) {
          if (!tag) return;
          navigator.clipboard.writeText(String(tag)).then(() => {
            this.showToast('Copied annotation "' + tag + '" to clipboard!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        copyAnnotations() {
          const list = this.filteredTagBridges();
          if (!list || !list.length) {
            this.showToast('No annotations to copy', 'warning');
            return;
          }
          const tags = list.map(tb => tb.tag).join(', ');
          navigator.clipboard.writeText(tags).then(() => {
            this.showToast('Copied ' + list.length + ' shared annotations to clipboard!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        async runPrunePreview() {
          if (!this.activeFolderId) return;
          this.pruningLoading = true;
          try {
            const kwIds = this.pruneForm.keyword_ids?.length 
              ? this.pruneForm.keyword_ids 
              : (this.activeFolder?.items || []).map(i => i.keyword_id || i.id).filter(Boolean);

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/prune-pins', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dry_run: true,
                keyword_ids: kwIds,
                scope: this.pruneForm.scope || 'displaced',
                min_pin_age_days: Number(this.pruneForm.min_pin_age_days) || 30,
                max_saves: Number(this.pruneForm.max_saves) || 5
              })
            });
            const data = await res.json();
            if (res.ok) {
              const count = data.candidates_count ?? data.matched_count ?? 0;
              this.prunePreviewResult = { ...data, candidates_count: count, matched_count: count };
              this.showToast('Dry run preview: ' + count + ' candidate pins identified for pruning', 'info');
            } else {
              this.showToast(data.message || 'Prune preview failed', 'error');
            }
          } catch (e) {
            this.showToast('Network error during prune preview: ' + e.message, 'error');
          } finally {
            this.pruningLoading = false;
          }
        },

        async executePrune() {
          if (!this.activeFolderId) return;
          const confirmed = await window.PAE.confirm(
            'Are you sure you want to prune candidate pins? They will be tombstoned to keyword_ignored_pins.',
            {
              title: 'Prune Candidate Pins',
              confirmLabel: 'Prune Pins',
              danger: true
            }
          );
          if (!confirmed) return;
          this.pruningLoading = true;
          try {
            const kwIds = this.pruneForm.keyword_ids?.length 
              ? this.pruneForm.keyword_ids 
              : (this.activeFolder?.items || []).map(i => i.keyword_id || i.id).filter(Boolean);

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/prune-pins', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                dry_run: false,
                keyword_ids: kwIds,
                scope: this.pruneForm.scope || 'displaced',
                min_pin_age_days: Number(this.pruneForm.min_pin_age_days) || 30,
                max_saves: Number(this.pruneForm.max_saves) || 5
              })
            });
            const data = await res.json();
            if (res.ok) {
              this.showToast('Successfully pruned ' + (data.pruned_count || 0) + ' pins!', 'success');
              this.prunePreviewResult = null;
              await this.loadActiveFolder(true);
            } else {
              this.showToast(data.message || 'Pruning execution failed', 'error');
            }
          } catch (e) {
            this.showToast('Network error during prune execution: ' + e.message, 'error');
          } finally {
            this.pruningLoading = false;
          }
        },

        globalDefaultMaxPins: '50',
        folderSettings: {
          name: '',
          description: '',
          color: '#6366f1',
          serp_top_n: 20,
          enable_serp_harvest: true,
          max_pins: '50',
          max_serp_pins: '50',
          crawl_scope: 'all_pins',
          max_catalog_inspect: '0',
          pause_competitors: false,
          pause_crawlers: false,
          block_fleet: false,
          auto_discover_creators: true,
          pin_graph_rules: {
            auto_trigger_enabled: false,
            linkless_only: false,
            min_repins: 500,
            max_pages: 20
          }
        },

        get totalKeywordsCount() {
          if (this.activeFolderId) {
            return Number(this.activeFolder?.items?.length || this.activeFolder?.keyword_count || this.crossoverData?.summary?.total_keywords || 0);
          }
          return (this.foldersList || []).reduce((acc, f) => acc + (Number(f.keyword_count) || 0), 0);
        },
        get crawledKeywordsCount() {
          if (this.activeFolder?.items && this.activeFolder.items.length > 0) {
            return this.activeFolder.items.filter(i => (Number(i.pin_count || 0) > 0 || Boolean(i.last_crawled_at))).length;
          }
          const total = this.totalKeywordsCount;
          return total > 0 ? total : 0;
        },
        get pendingKeywordsCount() {
          if (this.activeFolder?.items && this.activeFolder.items.length > 0) {
            return this.activeFolder.items.filter(i => !(Number(i.pin_count || 0) > 0 || Boolean(i.last_crawled_at))).length;
          }
          return 0;
        },
        openNewFolderModal: false,
        isVisualFeedModalOpen: false,
        visualFeedUser: null,
        visualFeedUsername: '',
        visualFeedPins: [],
        isVisualFeedLoading: false,
        newFolderName: '',
        newFolderDesc: '',
        newFolderColor: '#6366f1',
        deleteModalFolderId: null,
        scopeFilter: 'all',
        sortBy: 'velocity_desc',
        currentPage: 1,
        pageSize: 10,
        searchQuery: '',
        folderHubSearch: '',
        get filteredFoldersList() {
          const all = this.foldersList || [];
          const q = String(this.folderHubSearch || '').trim().toLowerCase();
          if (!q) return all;
          return all.filter((f) => {
            const name = String(f?.name || '').toLowerCase();
            const desc = String(f?.description || '').toLowerCase();
            const kwText = Array.isArray(f?.keywords_preview)
              ? f.keywords_preview.map((k) => String(k?.keyword || '')).join(' ').toLowerCase()
              : '';
            return name.includes(q) || desc.includes(q) || kwText.includes(q);
          });
        },
        entityFilter: { type: null, value: null },
        activeMatrixFilter: null,
        expandedPinRanks: {},
        onlyBreakoutBabyDomains: false,
        onlyVacuumPins: false,
        onlyFreshRockets: false,
        onlySurging24h: false,
        visualHubTab: 'pairs',
        selectedMatrixIndex: 0,
        selectedMatrixItem: null,
        matrixSearch: '',
        matrixSort: 'velocity_desc',
        matrixListLimit: 30,
        _pinsCacheKey: '',
        _cachedFilteredPins: null,
        powerPairs: [],
        powerTriplets: [],

        getSortedPinRankings(sp) {
          const list = Array.isArray(sp?.rankings) ? sp.rankings.slice() : [];
          return list.sort((a, b) => {
            const aDisp = a.is_displaced ? 1 : 0;
            const bDisp = b.is_displaced ? 1 : 0;
            if (aDisp !== bDisp) return aDisp - bDisp;
            return (Number(a.rank_position) || 999) - (Number(b.rank_position) || 999);
          });
        },

        normalizeClientTagLemma(raw) {
          if (!raw) return '';
          const str = typeof raw === 'object' && raw !== null
            ? String(raw.name || raw.tag || raw.label || raw.term || raw.display_label || '')
            : String(raw || '');
          const clean = str.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim();
          if (!clean) return '';
          const words = clean.split(' ').filter(Boolean).map(w => {
            if (w.length <= 3) return w;
            if (w.endsWith('ies') && w.length > 4) return w.slice(0, -3) + 'y';
            if (w.endsWith('ches') || w.endsWith('shes') || w.endsWith('xes') || w.endsWith('zes')) return w.slice(0, -2);
            if (w.endsWith('ves') && w.length > 4) return w.slice(0, -3) + 'f';
            if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && !w.endsWith('is')) return w.slice(0, -1);
            return w;
          });
          return words.join(' ');
        },

        switchMatrixTab(tab) {
          this.visualHubTab = tab;
          this.selectedMatrixIndex = 0;
          this.selectedMatrixItem = null;
          this.matrixListLimit = 30;
        },

        getActiveMatrixTitle() {
          const tab = this.visualHubTab;
          if (tab === 'triplets') return '3-Tag Co-Occurrence Triplets';
          if (tab === 'anchors') return '1-Tag Power Leaders & Bridges';
          if (tab === 'guided') return 'Guided Search Capsules (SERP Modifiers)';
          if (tab === 'colors') return 'Dominant Color Swatches';
          return '2-Tag Visual Power Pairs';
        },

        getActiveMatrixItems() {
          const tab = this.visualHubTab;
          const q = (this.matrixSearch || '').toLowerCase().trim();
          const sort = this.matrixSort || 'velocity_desc';
          let items = [];

          if (tab === 'triplets') {
            items = (this.powerTriplets || []).map((tr, i) => ({
              ...tr,
              _type: 'triplet',
              _key: 'tr_' + (tr.tags || []).join('|') + '_' + i
            }));
            if (q) {
              items = items.filter(tr =>
                (tr.tags || []).some(t => t.toLowerCase().includes(q)) ||
                (tr.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else if (tab === 'anchors') {
            items = (this.coreAnchorsList || []).map((a, i) => ({
              ...a,
              _type: 'anchor',
              _key: 'anc_' + (a.raw_tag || a.tag || i)
            }));
            if (this.anchorsTier === 'universal') {
              items = items.filter(a => (a.overlap_percentage || 0) >= 50 || a.is_universal);
            } else if (this.anchorsTier === 'whales') {
              items = items.filter(a => (a.pin_count || a.count || 0) >= 25);
            } else if (this.anchorsTier === 'high') {
              items = items.filter(a => (a.pin_count || a.count || 0) >= 10);
            }
            if (q) {
              items = items.filter(a =>
                String(a.tag || '').toLowerCase().includes(q) ||
                (a.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else if (tab === 'guided') {
            items = (this.crossoverData?.guided_pivots || []).map((gp, i) => ({
              ...gp,
              _type: 'capsule',
              _key: 'gp_' + (gp.term || i)
            }));
            if (q) {
              items = items.filter(gp =>
                String(gp.display_label || gp.term || '').toLowerCase().includes(q) ||
                (gp.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else if (tab === 'colors') {
            items = (this.crossoverData?.dominant_colors || []).map((sw, i) => ({
              ...sw,
              _type: 'color',
              _key: 'sw_' + (sw.hex || i)
            }));
            if (q) {
              items = items.filter(sw =>
                String(sw.hex || '').toLowerCase().includes(q) ||
                (sw.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          } else {
            items = (this.powerPairs || []).map((p, i) => ({
              ...p,
              _type: 'pair',
              _key: 'pr_' + p.tag_a + '|' + p.tag_b + '_' + i
            }));
            if (q) {
              items = items.filter(p =>
                String(p.tag_a || '').toLowerCase().includes(q) ||
                String(p.tag_b || '').toLowerCase().includes(q) ||
                (p.keywords || []).some(k => k.toLowerCase().includes(q))
              );
            }
          }

          items = items.slice().sort((a, b) => {
            const aVel = Number(a.total_velocity ?? a.velocity_gain ?? 0);
            const bVel = Number(b.total_velocity ?? b.velocity_gain ?? 0);
            const aPins = Number(a.joint_count ?? a.pin_count ?? a.count ?? 0);
            const bPins = Number(b.joint_count ?? b.pin_count ?? b.count ?? 0);
            const aKws = Number(a.keywords_count ?? a.keyword_count ?? a.shared_count ?? a.keyword_overlap_count ?? 1);
            const bKws = Number(b.keywords_count ?? b.keyword_count ?? b.shared_count ?? b.keyword_overlap_count ?? 1);
            const aLift = Number(a.lift ?? a.composite_score ?? a.overlap_percentage ?? 0);
            const bLift = Number(b.lift ?? b.composite_score ?? b.overlap_percentage ?? 0);
            const aSaves = Number(a.total_saves ?? 0);
            const bSaves = Number(b.total_saves ?? 0);

            if (sort === 'freq_desc') return bPins - aPins || bVel - aVel || bKws - aKws;
            if (sort === 'keywords_desc') return bKws - aKws || bVel - aVel || bPins - aPins;
            if (sort === 'lift_desc') return bLift - aLift || bVel - aVel || bPins - aPins;
            if (sort === 'saves_desc') return bSaves - aSaves || bVel - aVel || bPins - aPins;
            return bVel - aVel || bPins - aPins || bKws - aKws;
          });

          return items;
        },

        selectMatrixItem(item, idx = 0) {
          this.selectedMatrixIndex = idx;
          this.selectedMatrixItem = item;
        },

        isMatrixItemSelected(item, idx) {
          const current = this.getSelectedMatrixItem();
          if (!current || !item) return idx === 0;
          if (current._key && item._key) return current._key === item._key;
          return this.selectedMatrixIndex === idx;
        },

        getSelectedMatrixItem() {
          const list = this.getActiveMatrixItems();
          if (!list.length) return null;
          if (this.selectedMatrixItem) {
            const found = list.find(x => x._key && x._key === this.selectedMatrixItem._key);
            if (found) return found;
          }
          const idx = Math.min(Math.max(0, this.selectedMatrixIndex || 0), list.length - 1);
          return list[idx] || list[0];
        },

        getMatrixItemLabel(item) {
          if (!item) return '';
          const tab = this.visualHubTab;
          if (tab === 'triplets' || item._type === 'triplet') {
            return (item.tags || []).map(t => '#' + t).join(' + ');
          }
          if (tab === 'anchors' || item._type === 'anchor') {
            return '#' + (item.tag || item.raw_tag || '');
          }
          if (tab === 'guided' || item._type === 'capsule') {
            return 'Capsule: ' + (item.display_label || item.term || '');
          }
          if (tab === 'colors' || item._type === 'color') {
            return 'Palette: ' + (item.hex || '');
          }
          return '#' + (item.tag_a || '') + ' + #' + (item.tag_b || '');
        },

        isTagHighlightedInSelectedPattern(rawTag) {
          const item = this.getSelectedMatrixItem();
          if (!item || !rawTag) return false;
          const lemma = this.normalizeClientTagLemma(rawTag);
          if (!lemma) return false;
          const tab = this.visualHubTab;
          if (tab === 'pairs' || tab === 'all' || item._type === 'pair') {
            return lemma === this.normalizeClientTagLemma(item.tag_a) || lemma === this.normalizeClientTagLemma(item.tag_b);
          }
          if (tab === 'triplets' || item._type === 'triplet') {
            return (item.tags || []).some(t => this.normalizeClientTagLemma(t) === lemma);
          }
          if (tab === 'anchors' || item._type === 'anchor') {
            return lemma === this.normalizeClientTagLemma(item.raw_tag || item.tag);
          }
          if (tab === 'guided' || item._type === 'capsule') {
            const term = this.normalizeClientTagLemma(item.term || item.display_label);
            return Boolean(term && (' ' + lemma + ' ').includes(' ' + term + ' '));
          }
          return false;
        },

        pinMatchesMatrixItem(pin, item, tabOverride = null) {
          if (!pin || !item) return false;
          const tab = tabOverride || item._type || this.visualHubTab;
          const pinLemmas = new Set();
          for (const va of (pin.visual_annotations || [])) {
            const l = this.normalizeClientTagLemma(va);
            if (l) pinLemmas.add(l);
          }

          if (tab === 'pairs' || tab === 'all' || tab === 'pair') {
            const lA = this.normalizeClientTagLemma(item.tag_a);
            const lB = this.normalizeClientTagLemma(item.tag_b);
            return Boolean(lA && lB && pinLemmas.has(lA) && pinLemmas.has(lB));
          }
          if (tab === 'triplets' || tab === 'triplet') {
            const required = (item.tags || []).map(t => this.normalizeClientTagLemma(t)).filter(Boolean);
            return required.length > 0 && required.every(req => pinLemmas.has(req));
          }
          if (tab === 'anchors' || tab === 'anchor') {
            const target = this.normalizeClientTagLemma(item.raw_tag || item.tag);
            return Boolean(target && pinLemmas.has(target));
          }
          if (tab === 'guided' || tab === 'capsule') {
            const term = this.normalizeClientTagLemma(item.term || item.display_label);
            const displayNorm = String(item.display_label || item.term || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim();
            if (!term) return false;
            const padded = ' ' + term + ' ';
            const paddedDisplay = displayNorm ? (' ' + displayNorm + ' ') : padded;
            if (pinLemmas.has(term) || (displayNorm && pinLemmas.has(displayNorm))) return true;
            for (const pl of pinLemmas) {
              const paddedLemma = ' ' + pl + ' ';
              if (paddedLemma.includes(padded) || paddedLemma.includes(paddedDisplay)) return true;
            }
            const normTitle = ' ' + String(pin.title || '').toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim() + ' ';
            if (normTitle.includes(padded) || normTitle.includes(paddedDisplay)) return true;
            const normDesc = ' ' + String((pin.description || '') + ' ' + (pin.alt_text || '') + ' ' + (pin.seo_title || '')).toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim() + ' ';
            return normDesc.includes(padded) || normDesc.includes(paddedDisplay);
          }
          if (tab === 'colors' || tab === 'color') {
            const targetHex = String(item.hex || '').trim().toUpperCase();
            return Boolean(targetHex && String(pin.dominant_color || '').trim().toUpperCase() === targetHex);
          }
          return false;
        },

        deduplicateCreativePins(pinsList) {
          if (!Array.isArray(pinsList) || pinsList.length <= 1) return pinsList || [];
          const sorted = pinsList.slice().sort((a, b) => {
            const aVel = Number(a.effective_velocity ?? a.daily_save_velocity ?? 0);
            const bVel = Number(b.effective_velocity ?? b.daily_save_velocity ?? 0);
            if (bVel !== aVel) return bVel - aVel;
            return Number(b.save_count || 0) - Number(a.save_count || 0);
          });

          const byImg = new Map();
          const byTitleDom = new Map();
          const byLongTitle = new Map();
          const uniqueList = [];

          for (let i = 0; i < sorted.length; i++) {
            const p = sorted[i];
            if (!p) continue;

            const rawImg = String(p.image_url || '').trim().toLowerCase().split('?')[0];
            const imgSeg = rawImg ? (rawImg.split('/').pop() || '').replace(/\.[a-z0-9]+$/i, '') : '';
            const imgSig = imgSeg.length >= 8 ? ('img:' + imgSeg) : '';

            const cleanDom = String(p.domain || '').toLowerCase().replace(/^www\./, '').trim();
            const normTitle = String(p.raw_title || p.title || '')
              .toLowerCase()
              .replace(/[^a-z0-9 ]/g, ' ')
              .replace(/  +/g, ' ')
              .trim();
            const hasRealTitle = normTitle.length >= 4 &&
              normTitle !== 'untitled' &&
              normTitle !== 'untitled pin' &&
              !normTitle.startsWith('pin ') &&
              !normTitle.startsWith('stress pin ') &&
              !normTitle.startsWith('massive tag pin ');
            const titleDomSig = (hasRealTitle && cleanDom) ? ('td:' + normTitle + '|' + cleanDom) : '';
            const titleWords = hasRealTitle ? normTitle.split(' ').length : 0;
            const longTitleSig = (hasRealTitle && titleWords >= 3 && normTitle.length >= 14) ? ('lt:' + normTitle) : '';

            if (!imgSig && !titleDomSig && !longTitleSig) {
              uniqueList.push(p);
              continue;
            }

            const existing = (imgSig && byImg.get(imgSig)) ||
                             (titleDomSig && byTitleDom.get(titleDomSig)) ||
                             (longTitleSig && byLongTitle.get(longTitleSig)) ||
                             null;

            if (existing) {
              existing.repin_clones_count = Number(existing.repin_clones_count || 0) + 1;
              if (imgSig && !byImg.has(imgSig)) byImg.set(imgSig, existing);
              if (titleDomSig && !byTitleDom.has(titleDomSig)) byTitleDom.set(titleDomSig, existing);
              if (longTitleSig && !byLongTitle.has(longTitleSig)) byLongTitle.set(longTitleSig, existing);
              continue;
            }

            if (p._base_clones === undefined) {
              p._base_clones = Number(p.repin_clones_count || 0);
            }
            p.repin_clones_count = p._base_clones;
            if (imgSig) byImg.set(imgSig, p);
            if (titleDomSig) byTitleDom.set(titleDomSig, p);
            if (longTitleSig) byLongTitle.set(longTitleSig, p);
            uniqueList.push(p);
          }

          return uniqueList;
        },

        getMatchingPinsForMatrixItem(item, tabOverride = null) {
          if (!item) return [];
          const allPins = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
            ? this.crossoverData.all_pins
            : (this.crossoverData?.super_pins || []);
          if (!allPins.length) {
            return this.deduplicateCreativePins(item.matching_pins || item.pins || []);
          }
          const matched = allPins.filter(p => this.pinMatchesMatrixItem(p, item, tabOverride));
          if (!matched.length && (item.matching_pins?.length || item.pins?.length)) {
            return this.deduplicateCreativePins(item.matching_pins || item.pins || []);
          }
          return this.deduplicateCreativePins(matched);
        },

        applyMatrixFilter(item, tabOverride = null) {
          if (!item) return;
          const tab = tabOverride || item._type || this.visualHubTab;
          let badge = 'Matrix Pattern';
          if (tab === 'pairs' || tab === 'all' || tab === 'pair') badge = '2-Tag Power Pair';
          else if (tab === 'triplets' || tab === 'triplet') badge = '3-Tag Triplet';
          else if (tab === 'anchors' || tab === 'anchor') badge = '1-Tag Visual Bridge';
          else if (tab === 'guided' || tab === 'capsule') badge = 'Guided Search Capsule';
          else if (tab === 'colors' || tab === 'color') badge = 'Color Swatch';

          const label = this.getMatrixItemLabel(item);
          this.activeMatrixFilter = {
            type: tab,
            badge,
            label,
            item
          };
          this.currentPage = 1;
          this._pinsCacheKey = '';
          this.showToast('Filtered cluster pins by ' + badge + ': ' + label, 'info');
          this.scrollToSection('pins-table-section');
        },

        clearMatrixFilter() {
          this.activeMatrixFilter = null;
          this.currentPage = 1;
          this._pinsCacheKey = '';
          this.showToast('Cleared matrix pattern filter', 'info');
        },

        copyMatrixItemBlueprint(item, tabOverride = null) {
          if (!item) return;
          const tab = tabOverride || item._type || this.visualHubTab;
          if (tab === 'pairs' || tab === 'all' || tab === 'pair') {
            this.copyVisualBlueprint(item);
            return;
          }
          const label = this.getMatrixItemLabel(item);
          const kws = (item.keywords || []).slice(0, 6).join(', ');
          const text = [
            'CLUSTER VISUAL PATTERN BLUEPRINT',
            '===================================',
            'Pattern: ' + label,
            'Joint Cluster Pins: ' + (item.joint_count || item.pin_count || item.count || 0),
            '24h Save Velocity: +' + (item.total_velocity ?? item.velocity_gain ?? 0) + '/d',
            'Target SERP Keywords: ' + (kws || 'Cluster Terms')
          ].join('\\n');
          navigator.clipboard.writeText(text).then(() => {
            this.showToast('Copied pattern blueprint: ' + label, 'success');
          }).catch(() => {});
        },

        toasts: [],
        colorOptions: ['#6366f1', '#ec4899', '#10b981', '#f59e0b', '#8b5cf6', '#06b6d4'],

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

            // [INVARIANT: FOLDER-SCOPED-POPSTATE-PRESERVATION] Synchronize currentRoom with URL on browser Back/Forward (LND-15)
            window.addEventListener('popstate', () => {
              try {
                const path = window.location.pathname || '';
                const segs = path.split('/').filter(Boolean);
                if (segs[0] === 'folders' && segs[1]) {
                  const subRoute = (segs[2] || '').toLowerCase();
                  if (subRoute === 'settings') {
                    this.currentRoom = 'settings';
                  } else if (subRoute === 'crossover' || !subRoute) {
                    this.currentRoom = 'crossover';
                  } else if (subRoute === 'keywords') {
                    this.currentRoom = 'keywords';
                  } else if (subRoute === 'creators') {
                    this.currentRoom = 'creators';
                  } else if (subRoute === 'domains') {
                    this.currentRoom = 'domains';
                  }
                  this.$nextTick(() => {
                    if (window.lucide && typeof window.lucide.createIcons === 'function') {
                      window.lucide.createIcons();
                    }
                  });
                }
              } catch (_) {}
            });
          }

          if (this.darkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }

          this.$nextTick(() => {
            if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons();
            }
          });

          if (!this.activeFolderId && typeof window !== 'undefined' && window.location?.search) {
            try {
              const urlParams = new URLSearchParams(window.location.search || '');
              const hubQ = (urlParams.get('search') || urlParams.get('q') || '').trim();
              if (hubQ) {
                this.folderHubSearch = hubQ;
              }
            } catch (_) {}
          }

          if (this.activeFolderId) {
            await Promise.all([
              this.fetchWorkspaceSettingsDefaults(),
              this.loadActiveFolder()
            ]);
            this.syncFolderSettingsFromActive();
            // Non-blocking background fetch for switcher dropdown when active folder is loaded
            this.loadFolders().catch(() => {});
          } else {
            await this.loadFolders();
          }

          this.$watch('searchQuery', async (val) => {
            this.currentPage = 1;
            if (val && String(val).includes('pin.it/') && /pin[.]it[/][a-zA-Z0-9_-]+/i.test(String(val).trim())) {
              await this.resolveShortlinkSearch(String(val).trim());
            }
          });

          this.$watch('currentRoom', () => {
            if (typeof this.$nextTick === 'function') this.$nextTick(() => { if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') window.PAE.refreshIcons(); else if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          });

          this.$watch('visualHubTab', () => {
            if (typeof this.$nextTick === 'function') this.$nextTick(() => { if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') window.PAE.refreshIcons(); else if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          });

          this.$nextTick(() => {
            if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') {
              window.PAE.refreshIcons();
            } else if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
              window.lucide.createIcons();
            }
          });
        },

        toggleTheme() {
          this.darkMode = !this.darkMode;
          this.isDark = this.darkMode;
          try {
            if (typeof localStorage !== 'undefined') {
              localStorage.setItem('pa_theme', this.darkMode ? 'dark' : 'light');
              localStorage.setItem('pin_theme', this.darkMode ? 'dark' : 'light');
            }
          } catch (_) {}
          if (this.darkMode) {
            document.documentElement.classList.add('dark');
            this.showToast('Dark theme activated', 'info');
          } else {
            document.documentElement.classList.remove('dark');
            this.showToast('Light theme activated', 'info');
          }
          this.$nextTick(() => {
            if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons();
          });
        },

        showToast(message, type = 'info') {
          const id = Date.now() + Math.random();
          this.toasts.push({ id, message, type });
          setTimeout(() => this.removeToast(id), 4000);
        },

        removeToast(id) {
          this.toasts = this.toasts.filter(t => t.id !== id);
        },

        async loadFolders() {
          if (this._foldersListAbortController) {
            try { this._foldersListAbortController.abort(); } catch (_) {}
          }
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          this._foldersListAbortController = controller;
          const signal = controller ? controller.signal : undefined;
          this.foldersLoading = true;
          try {
            let res;
            const fetchOpts = signal ? { signal } : {};
            if (this.activeFolderId) {
              res = await (window.safeApiFetch || fetch)('/api/folders?lite=true', fetchOpts);
            } else {
              res = await (window.safeApiFetch || fetch)('/api/folders', fetchOpts);
            }
            if (signal && signal.aborted) return;
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (signal && signal.aborted) return;
              this.foldersList = data.folders || [];
              if (this.activeFolderId) {
                const matched = this.foldersList.find(f => String(f.id) === String(this.activeFolderId));
                if (matched) {
                  this.activeFolder = this.activeFolder ? { ...matched, ...this.activeFolder } : matched;
                }
              }
            } else {
              if (!this.activeFolder) {
                this.showToast('Failed to load campaign folders', 'error');
              }
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            console.error('Error loading folders:', e);
            if (!this.activeFolder) {
              this.showToast('Network error loading folders', 'error');
            }
          } finally {
            if (!signal || !signal.aborted) {
              if (!this.foldersList.length && this.activeFolder) {
                this.foldersList = [this.activeFolder];
              }
              this.foldersLoading = false;
              if (typeof this.$nextTick === 'function') this.$nextTick(() => { if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') window.PAE.refreshIcons(); else if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async loadActiveFolder(forceRefresh = false) {
          if (this._activeFolderAbortController) {
            try { this._activeFolderAbortController.abort(); } catch (_) {}
          }
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          this._activeFolderAbortController = controller;
          const signal = controller ? controller.signal : undefined;
          const reqSeq = ++this._folderReqSeq;
          // Phase 1: Fast metadata hydration (< 50ms)
          try {
            const shouldRefresh = forceRefresh === true || this.currentRoom === 'settings';
            const folderUrl = '/api/folders/' + this.activeFolderId + (shouldRefresh ? '?refresh=true' : '');
            const folderRes = await (window.safeApiFetch || fetch)(folderUrl, signal ? { signal } : {});
            if (reqSeq !== this._folderReqSeq || (signal && signal.aborted)) return;
            if (folderRes.ok) {
              const data = await folderRes.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq || (signal && signal.aborted)) return;
              const fetched = data.folder || null;
              this.activeFolder = fetched ? (this.activeFolder ? { ...this.activeFolder, ...fetched } : fetched) : null;
              this.syncFolderSettingsFromActive();
            } else {
              this.showToast('Campaign folder not found', 'error');
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error fetching folder metadata:', e);
          }

          // Unnecessary 30s Crossover fetch bypassed when in settings room
          this.loadTrackedPinsSummary().catch(() => {});
          this.loadPinGraphSeeds().catch(() => {});
          if (this.currentRoom === 'settings') {
            this.crossoverLoading = false;
            if (forceRefresh === true) {
              this.showToast('Folder settings refreshed', 'success');
            }
            return;
          }

          // Phase 2: Crossover Matrix analysis (< 30s)
          this.crossoverLoading = true;
          try {
            const crossoverUrl = '/api/folders/' + this.activeFolderId + '/raw-visual-crossover' + (forceRefresh === true ? '?refresh=true' : '');
            const crossoverRes = await (window.safeApiFetch || fetch)(crossoverUrl, {
              timeout: 30000,
              retries: 1,
              ...(signal ? { signal } : {})
            });
            if (reqSeq !== this._folderReqSeq || (signal && signal.aborted)) return;
            if (crossoverRes.ok) {
              const cdata = await crossoverRes.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq || (signal && signal.aborted)) return;
              this.crossoverData = cdata.crossover || cdata;
              this.computePowerPairs();
              this.currentPage = 1;
              this._pinsCacheKey = '';
              if (forceRefresh === true) {
                if (cdata.cooldown_cached || this.crossoverData?.cooldown_cached) {
                  this.showToast('Using recent snapshot (15s refresh cooldown active)', 'info');
                } else {
                  this.showToast('Workspace & crossover refreshed successfully', 'success');
                }
              }
            } else {
              this.showToast('Failed to compute crossover matrix', 'error');
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error loading crossover matrix:', e);
            this.showToast('Crossover matrix analysis timed out or failed', 'error');
          } finally {
            if (reqSeq === this._folderReqSeq && (!signal || !signal.aborted)) {
              this.crossoverLoading = false;
              if (typeof this.$nextTick === 'function') this.$nextTick(() => { if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') window.PAE.refreshIcons(); else if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async runCrossoverAnalysis(isRefresh = false) {
          if (!this.activeFolderId) return;
          if (this._activeFolderAbortController) {
            try { this._activeFolderAbortController.abort(); } catch (_) {}
          }
          const controller = typeof AbortController !== 'undefined' ? new AbortController() : null;
          this._activeFolderAbortController = controller;
          const signal = controller ? controller.signal : undefined;
          const reqSeq = ++this._folderReqSeq;
          this.crossoverLoading = true;
          try {
            const url = '/api/folders/' + this.activeFolderId + '/raw-visual-crossover' + (isRefresh ? '?refresh=true' : '');
            const res = await (window.safeApiFetch || fetch)(url, signal ? { signal } : {});
            if (reqSeq !== this._folderReqSeq || (signal && signal.aborted)) return;
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq || (signal && signal.aborted)) return;
              this.crossoverData = data.crossover || data;
              this.computePowerPairs();
              this.currentPage = 1;
              this._pinsCacheKey = '';
              if (isRefresh) {
                if (data.cooldown_cached || this.crossoverData?.cooldown_cached) {
                  this.showToast('Using recent snapshot (15s refresh cooldown active)', 'info');
                } else {
                  this.showToast('Crossover analysis recalculated successfully', 'success');
                }
              }
            } else {
              this.showToast('Failed to compute crossover matrix', 'error');
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error running crossover analysis:', e);
            this.showToast('Network error analyzing crossover', 'error');
          } finally {
            if (reqSeq === this._folderReqSeq && (!signal || !signal.aborted)) {
              this.crossoverLoading = false;
              if (typeof this.$nextTick === 'function') this.$nextTick(() => { if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.refreshIcons === 'function') window.PAE.refreshIcons(); else if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async fetchWorkspaceSettingsDefaults() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/workspaces/settings');
            if (!res.ok) return;
            const data = await res.json().catch(() => ({}));
            const ws = data?.settings || {};
            const wsTopN = Math.min(100, Math.max(5, Number(ws.default_serp_top_n || 20)));
            const wsPgr = (ws.pin_graph_rules && typeof ws.pin_graph_rules === 'object') ? ws.pin_graph_rules : {};
            this.workspaceSettingsDefaults = {
              default_serp_top_n: wsTopN,
              pin_graph_rules: {
                auto_trigger_enabled: Boolean(wsPgr.auto_trigger_enabled),
                linkless_only: Boolean(wsPgr.linkless_only),
                min_repins: Number.isFinite(Number(wsPgr.min_repins)) ? Math.max(0, Number(wsPgr.min_repins)) : 500,
                max_pages: Number.isFinite(Number(wsPgr.max_pages)) ? Math.min(100, Math.max(1, Number(wsPgr.max_pages))) : 20
              }
            };
          } catch (_) {}
        },

        isSerpTopNInherited() {
          const wsTopN = Number(this.workspaceSettingsDefaults?.default_serp_top_n || 20);
          return Number(this.folderSettings?.serp_top_n || wsTopN) === wsTopN;
        },

        resetSerpTopNToWorkspace() {
          this.folderSettings.serp_top_n = Number(this.workspaceSettingsDefaults?.default_serp_top_n || 20);
        },

        isPinGraphInherited() {
          const cur = this.folderSettings?.pin_graph_rules || {};
          const ws = this.workspaceSettingsDefaults?.pin_graph_rules || {};
          return Boolean(cur.auto_trigger_enabled) === Boolean(ws.auto_trigger_enabled)
            && Boolean(cur.linkless_only) === Boolean(ws.linkless_only)
            && Number(cur.min_repins ?? 500) === Number(ws.min_repins ?? 500)
            && Number(cur.max_pages ?? 20) === Number(ws.max_pages ?? 20);
        },

        resetPinGraphToWorkspace() {
          const ws = this.workspaceSettingsDefaults?.pin_graph_rules || {};
          this.folderSettings.pin_graph_rules = {
            auto_trigger_enabled: Boolean(ws.auto_trigger_enabled),
            linkless_only: Boolean(ws.linkless_only),
            min_repins: Number(ws.min_repins ?? 500),
            max_pages: Number(ws.max_pages ?? 20)
          };
        },

        syncFolderSettingsFromActive() {
          if (!this.activeFolder) return;
          let meta = this.activeFolder.metadata;
          if (typeof meta === 'string') {
            try {
              meta = JSON.parse(meta);
              if (typeof meta === 'string') meta = JSON.parse(meta);
            } catch (_) { meta = {}; }
          }
          if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};

          const fallbackQuota = String(this.globalDefaultMaxPins || '50');
          const wsTopN = Number(this.workspaceSettingsDefaults?.default_serp_top_n || 20);
          const wsPgr = this.workspaceSettingsDefaults?.pin_graph_rules || {};
          const pgr = (this.activeFolder.pin_graph_rules && typeof this.activeFolder.pin_graph_rules === 'object')
            ? this.activeFolder.pin_graph_rules
            : {};
          this.folderSettings = {
            name: this.activeFolder.name || '',
            description: this.activeFolder.description || '',
            color: this.activeFolder.color || '#6366f1',
            serp_top_n: Math.min(100, Math.max(5, Number(this.activeFolder.serp_top_n ?? wsTopN))),
            enable_serp_harvest: meta.enable_serp_harvest !== undefined ? Boolean(meta.enable_serp_harvest) : true,
            max_pins: String(meta.max_pins || fallbackQuota),
            max_serp_pins: String(meta.max_serp_pins || meta.max_pins || fallbackQuota),
            crawl_scope: String(meta.crawl_scope || 'all_pins'),
            max_catalog_inspect: String(meta.max_catalog_inspect || '0'),
            pause_competitors: Boolean(meta.pause_competitors),
            pause_crawlers: Boolean(meta.pause_crawlers),
            block_fleet: Boolean(meta.block_fleet),
            auto_discover_creators: meta.auto_discover_creators !== undefined ? Boolean(meta.auto_discover_creators) : true,
            pin_graph_rules: {
              auto_trigger_enabled: pgr.auto_trigger_enabled !== undefined ? Boolean(pgr.auto_trigger_enabled) : Boolean(wsPgr.auto_trigger_enabled),
              linkless_only: pgr.linkless_only !== undefined ? Boolean(pgr.linkless_only) : Boolean(wsPgr.linkless_only),
              min_repins: (pgr.min_repins !== undefined && pgr.min_repins !== null && pgr.min_repins !== '' && Number.isFinite(Number(pgr.min_repins))) ? Math.max(0, Number(pgr.min_repins)) : Number(wsPgr.min_repins ?? 500),
              max_pages: (pgr.max_pages !== undefined && pgr.max_pages !== null && pgr.max_pages !== '' && Number.isFinite(Number(pgr.max_pages))) ? Math.min(100, Math.max(1, Number(pgr.max_pages))) : Number(wsPgr.max_pages ?? 20)
            }
          };
        },

        async fetchGlobalDefaultQuota() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/settings');
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              const q = data?.settings?.max_serp_pins || data?.settings?.default_max_pins;
              if (q && !isNaN(Number(q))) {
                this.globalDefaultMaxPins = String(q);
              }
            }
          } catch (_) {}
        },

        async saveFolderSettings(andLaunchAudit = false) {
          if (!this.activeFolderId) return;
          this.settingsLoading = true;
          try {
            let meta = this.activeFolder?.metadata;
            if (typeof meta === 'string') {
              try {
                meta = JSON.parse(meta);
                if (typeof meta === 'string') meta = JSON.parse(meta);
              } catch (_) { meta = {}; }
            }
            if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};

            const maxPinsVal = String(this.folderSettings.max_serp_pins || this.folderSettings.max_pins || this.globalDefaultMaxPins || '50');
            const pgrForm = this.folderSettings.pin_graph_rules || {};
            const payload = {
              name: (this.folderSettings.name || '').trim() || (this.activeFolder?.name || ''),
              description: (this.folderSettings.description || '').trim(),
              color: this.folderSettings.color || '#6366f1',
              serp_top_n: Math.min(100, Math.max(5, Number(this.folderSettings.serp_top_n || 20))),
              pin_graph_rules: {
                auto_trigger_enabled: Boolean(pgrForm.auto_trigger_enabled),
                linkless_only: Boolean(pgrForm.linkless_only),
                min_repins: Math.max(0, Math.round(Number(pgrForm.min_repins ?? 500) || 0)),
                max_pages: Math.min(100, Math.max(1, Math.round(Number(pgrForm.max_pages ?? 20) || 20)))
              },
              metadata: {
                ...meta,
                enable_serp_harvest: Boolean(this.folderSettings.enable_serp_harvest),
                max_pins: maxPinsVal,
                max_serp_pins: maxPinsVal,
                crawl_scope: String(this.folderSettings.crawl_scope || 'all_pins'),
                max_catalog_inspect: String(this.folderSettings.max_catalog_inspect || '0'),
                pause_competitors: Boolean(this.folderSettings.pause_competitors),
                pause_crawlers: Boolean(this.folderSettings.pause_crawlers),
                block_fleet: Boolean(this.folderSettings.block_fleet),
                auto_discover_creators: Boolean(this.folderSettings.auto_discover_creators)
              }
            };

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });

            if (res.ok) {
              const data = await res.json();
              if (data.folder) {
                this.activeFolder = { ...this.activeFolder, ...data.folder };
                const fIdx = this.foldersList.findIndex(f => f.id === this.activeFolderId);
                if (fIdx !== -1) {
                  this.foldersList[fIdx] = { ...this.foldersList[fIdx], ...data.folder };
                }
              }
              this.showToast('Folder settings saved successfully', 'success');
              if (andLaunchAudit) {
                await this.dispatchFolderDeepAudit();
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.message || errData.error || 'Failed to save folder settings', 'error');
            }
          } catch (err) {
            this.showToast('Error saving settings: ' + err.message, 'error');
          } finally {
            this.settingsLoading = false;
          }
        },

        async dispatchFolderDeepAudit() {
          if (!this.activeFolderId) return;
          this.auditDispatching = true;
          this.showToast('Dispatching 20-runner parallel cluster fleet on GitHub Actions...', 'info');
          try {
            let meta = this.activeFolder?.metadata;
            if (typeof meta === 'string') {
              try {
                meta = JSON.parse(meta);
                if (typeof meta === 'string') meta = JSON.parse(meta);
              } catch (_) { meta = {}; }
            }
            if (!meta || typeof meta !== 'object' || Array.isArray(meta)) meta = {};

            const harvest = this.folderSettings?.enable_serp_harvest !== undefined
              ? Boolean(this.folderSettings.enable_serp_harvest)
              : (meta.enable_serp_harvest !== undefined ? Boolean(meta.enable_serp_harvest) : true);
            const explicitFolderPins = this.currentRoom === 'settings'
              ? String(this.folderSettings?.max_pins || meta.max_pins || '')
              : String(meta.max_pins || meta.max_serp_pins || '');
            const maxPins = explicitFolderPins;
            const maxSerpPins = this.currentRoom === 'settings'
              ? String(this.folderSettings?.max_serp_pins || meta.max_serp_pins || maxPins)
              : String(meta.max_serp_pins || meta.max_pins || '');
            const crawlScope = String(this.folderSettings?.crawl_scope || meta.crawl_scope || 'all_pins');
            const maxCatalogInspect = String(this.folderSettings?.max_catalog_inspect || meta.max_catalog_inspect || '0');

            const res = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/dispatch-audit', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                crawl_scope: crawlScope,
                max_pins: maxPins,
                max_serp_pins: maxSerpPins,
                max_catalog_inspect: maxCatalogInspect,
                enable_serp_harvest: String(harvest)
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast(data.message || '20-Runner Parallel Fleet Audit dispatched successfully on GitHub Actions!', 'success');
            } else {
              this.showToast('Dispatch note: ' + (data.message || data.error || 'Check GitHub token in settings'), 'error');
            }
          } catch (err) {
            this.showToast('Error triggering cluster fleet: ' + err.message, 'error');
          } finally {
            this.auditDispatching = false;
          }
        },

        get coreAnchorsList() {
          // Single Source of Truth: Use backend canonical lemmatized tag_bridges when present
          if (Array.isArray(this.crossoverData?.tag_bridges) && this.crossoverData.tag_bridges.length > 0) {
            return this.crossoverData.tag_bridges.map(tb => ({
              ...tb,
              tag: tb.tag || tb.raw_tag,
              raw_tag: tb.raw_tag || tb.tag,
              count: tb.pin_count ?? tb.count ?? 0,
              pin_count: tb.pin_count ?? tb.count ?? 0,
              keywords_count: tb.keyword_overlap_count ?? tb.keywords_count ?? (tb.keywords ? tb.keywords.length : 1),
              total_velocity: tb.total_velocity ?? tb.velocity_gain ?? 0
            }));
          }

          const rawPins = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
            ? this.crossoverData.all_pins
            : (this.crossoverData?.super_pins || []);
          if (!rawPins || rawPins.length === 0) return [];
          const pins = this.deduplicateCreativePins(rawPins);

          const totalKws = Math.max(1, Number(this.crossoverData?.summary?.total_keywords || this.totalKeywordsCount || 1));
          const toTitleCase = (str) => str ? str.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ') : '';
          const freqMap = new Map();

          for (const pin of pins) {
            const tags = Array.isArray(pin.visual_annotations) ? pin.visual_annotations : [];
            const seen = new Set();
            for (const t of tags) {
              const lemma = this.normalizeClientTagLemma(t);
              if (lemma && lemma.length >= 3 && !seen.has(lemma)) {
                seen.add(lemma);
                let rec = freqMap.get(lemma);
                if (!rec) {
                  rec = {
                    tag: toTitleCase(lemma),
                    raw_tag: lemma,
                    count: 0,
                    pin_count: 0,
                    total_saves: 0,
                    total_velocity: 0,
                    total_repins_delta: 0,
                    keywords_set: new Set()
                  };
                  freqMap.set(lemma, rec);
                }
                rec.count += 1;
                rec.pin_count += 1;
                rec.total_saves += Number(pin.save_count || 0);
                rec.total_velocity += Number(pin.effective_velocity ?? pin.daily_save_velocity ?? 0);
                rec.total_repins_delta += Math.max(0, Number(pin.delta_repins_24h || 0));
                for (const r of (pin.rankings || [])) {
                  if (r.keyword) rec.keywords_set.add(r.keyword);
                }
              }
            }
          }

          const list = [];
          for (const rec of freqMap.values()) {
            if (rec.count >= 2) {
              const kwCount = rec.keywords_set.size || 1;
              const overlapPct = Math.round((kwCount / totalKws) * 100);
              list.push({
                tag: rec.tag,
                raw_tag: rec.raw_tag,
                count: rec.count,
                pin_count: rec.pin_count,
                keywords_count: kwCount,
                keyword_overlap_count: kwCount,
                overlap_percentage: overlapPct,
                is_universal: overlapPct >= 50,
                keywords: Array.from(rec.keywords_set),
                total_saves: rec.total_saves,
                total_velocity: Math.round(rec.total_velocity * 10) / 10,
                velocity_gain: Math.round(rec.total_velocity * 10) / 10,
                total_repins_delta: Math.round(rec.total_repins_delta)
              });
            }
          }
          return list.sort((a, b) => b.count - a.count || b.total_velocity - a.total_velocity);
        },

        computePowerPairs() {
          // Compute across deduplicated creative pins so syndicated repin clones cannot qualify a Pair or Triplet alone
          const source = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
            ? this.crossoverData.all_pins
            : (this.crossoverData?.super_pins || []);
          const pins = this.deduplicateCreativePins(source);
          if (!pins || pins.length < 2) {
            this.powerPairs = [];
            this.powerTriplets = [];
            return;
          }

          const N_total = pins.length;
          const tagFreq = new Map();
          const pairFreq = new Map();
          const tripletFreq = new Map();

          // Stopwords filter for pairs
          const skipWords = new Set([
            'pin', 'pins', 'recipe', 'recipes', 'idea', 'ideas', 'food', 'dinner', 
            'meal', 'meals', 'easy', 'quick', 'best', 'delicious', 'simple', 'diy', 'guide',
            'homemade', 'cook', 'cooking', 'dish', 'dishes'
          ]);

          const toTitleCase = (str) => {
            if (!str) return '';
            return str.split(' ').filter(Boolean).map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
          };

          // Pass 1: Extract normalized tags per pin once and count frequencies using primitive integers only
          const extractedPinMeta = new Array(N_total);
          for (let pIdx = 0; pIdx < N_total; pIdx++) {
            const pin = pins[pIdx];
            const rawSet = new Set();
            const lemmaSet = new Set();
            for (const rawVa of (pin.visual_annotations || [])) {
              const va = typeof rawVa === 'object' && rawVa !== null ? (rawVa.name || rawVa.tag || rawVa.label || rawVa.term || '') : (typeof rawVa === 'string' ? rawVa : '');
              if (va) {
                const clean = va.trim().toLowerCase().replace(/[^a-z0-9 ]/g, ' ').replace(/  +/g, ' ').trim();
                if (clean.length >= 3 && clean.length <= 35 && !skipWords.has(clean)) {
                  rawSet.add(clean);
                }
                const lemma = this.normalizeClientTagLemma(va);
                if (lemma && lemma.length >= 3 && lemma.length <= 35 && !skipWords.has(lemma)) {
                  lemmaSet.add(lemma);
                }
              }
            }

            const pinTags = Array.from(rawSet).slice(0, 10);
            const tArr = Array.from(lemmaSet).slice(0, 8).sort();
            extractedPinMeta[pIdx] = { pinTags, tArr };

            for (let i = 0; i < pinTags.length; i++) {
              const t1 = pinTags[i];
              tagFreq.set(t1, (tagFreq.get(t1) || 0) + 1);
              for (let j = i + 1; j < pinTags.length; j++) {
                const t2 = pinTags[j];
                if (t1.includes(t2) || t2.includes(t1)) continue;
                const key = t1 < t2 ? (t1 + '|||' + t2) : (t2 + '|||' + t1);
                pairFreq.set(key, (pairFreq.get(key) || 0) + 1);
              }
            }

            for (let i = 0; i < tArr.length; i++) {
              for (let j = i + 1; j < tArr.length; j++) {
                if (tArr[i].includes(tArr[j]) || tArr[j].includes(tArr[i])) continue;
                for (let k = j + 1; k < tArr.length; k++) {
                  if (tArr[k].includes(tArr[i]) || tArr[i].includes(tArr[k]) || tArr[k].includes(tArr[j]) || tArr[j].includes(tArr[k])) continue;
                  const tKey = tArr[i] + '|||' + tArr[j] + '|||' + tArr[k];
                  tripletFreq.set(tKey, (tripletFreq.get(tKey) || 0) + 1);
                }
              }
            }
          }

          // Dynamic min support threshold: 2 for small subsets, at least 5 for 1,000+ pins
          const minSupport = N_total > 500 ? 5 : (N_total > 100 ? 3 : 2);

          // Collect only qualifying pairs and triplets before allocating metadata structures
          const pairStats = new Map();
          for (const [key, jointCount] of pairFreq.entries()) {
            if (jointCount >= minSupport) {
              pairStats.set(key, { jointCount, vel: 0, repins: 0, saves: 0, kws: new Set(), pins: [] });
            }
          }

          const tripletStats = new Map();
          for (const [tKey, jointCount] of tripletFreq.entries()) {
            if (jointCount >= 2) {
              tripletStats.set(tKey, { jointCount, vel: 0, repins: 0, saves: 0, kws: new Set(), pinIds: [], pins: [] });
            }
          }

          // Pass 2: Hydrate metrics and pin references ONLY for surviving pairs & triplets
          for (let pIdx = 0; pIdx < N_total; pIdx++) {
            const pin = pins[pIdx];
            const { pinTags, tArr } = extractedPinMeta[pIdx];
            const pVel = Number(pin.effective_velocity ?? pin.daily_save_velocity ?? pin.delta_saves_24h ?? 0);
            const pRepins = Math.max(0, Number(pin.delta_repins_24h || 0));
            const pSaves = Number(pin.save_count || 0);
            const pinKws = (pin.rankings || []).map(r => r.keyword).filter(Boolean);

            for (let i = 0; i < pinTags.length; i++) {
              const t1 = pinTags[i];
              for (let j = i + 1; j < pinTags.length; j++) {
                const t2 = pinTags[j];
                if (t1.includes(t2) || t2.includes(t1)) continue;
                const key = t1 < t2 ? (t1 + '|||' + t2) : (t2 + '|||' + t1);
                const st = pairStats.get(key);
                if (st) {
                  st.vel += pVel;
                  st.repins += pRepins;
                  st.saves += pSaves;
                  for (const kw of pinKws) st.kws.add(kw);
                  if (st.pins.length < 16) st.pins.push(pin);
                }
              }
            }

            for (let i = 0; i < tArr.length; i++) {
              for (let j = i + 1; j < tArr.length; j++) {
                if (tArr[i].includes(tArr[j]) || tArr[j].includes(tArr[i])) continue;
                for (let k = j + 1; k < tArr.length; k++) {
                  if (tArr[k].includes(tArr[i]) || tArr[i].includes(tArr[k]) || tArr[k].includes(tArr[j]) || tArr[j].includes(tArr[k])) continue;
                  const tKey = tArr[i] + '|||' + tArr[j] + '|||' + tArr[k];
                  const tst = tripletStats.get(tKey);
                  if (tst) {
                    tst.vel += pVel;
                    tst.repins += pRepins;
                    tst.saves += pSaves;
                    tst.pinIds.push(String(pin.pin_id || pIdx));
                    for (const kw of pinKws) tst.kws.add(kw);
                    if (tst.pins.length < 16) tst.pins.push(pin);
                  }
                }
              }
            }
          }

          const pairs = [];
          for (const [key, st] of pairStats.entries()) {
            const jointCount = st.jointCount;
            const [t1, t2] = key.split('|||');
            const n1 = tagFreq.get(t1) || 1;
            const n2 = tagFreq.get(t2) || 1;
            const liftRaw = ((jointCount + 1) * (N_total + 4)) / ((n1 + 2) * (n2 + 2));
            const confRaw = (jointCount + 1) / (n1 + 2);

            const liftVal = Number.isFinite(liftRaw) ? Number(liftRaw.toFixed(2)) : 1.0;
            const confidence = Number.isFinite(confRaw) ? Number(confRaw.toFixed(2)) : 0.0;
            const supportPct = Number(((jointCount / N_total) * 100).toFixed(1));
            const synergyScore = liftVal * Math.log2(jointCount + 1);

            const topPins = st.pins.slice().sort((a, b) => (Number(b.effective_velocity ?? b.daily_save_velocity ?? 0) - Number(a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (Number(b.save_count || 0) - Number(a.save_count || 0))).slice(0, 12);

            pairs.push({
              tag_a: toTitleCase(t1),
              tag_b: toTitleCase(t2),
              joint_count: jointCount,
              keywords_count: st.kws.size || 1,
              keywords: Array.from(st.kws),
              lift: liftVal,
              confidence: confidence,
              support_pct: supportPct,
              synergy_score: synergyScore,
              total_velocity: Math.round(st.vel * 10) / 10,
              total_repins_delta: Math.round(st.repins),
              total_saves: st.saves,
              pins: topPins,
              matching_pins: topPins
            });
          }

          // Default sort by pins frequency (high to low), with daily save velocity as secondary ranking
          pairs.sort((a, b) => b.joint_count - a.joint_count || (b.total_velocity || 0) - (a.total_velocity || 0) || b.lift - a.lift);
          this.powerPairs = pairs;

          const rawTriplets = [];
          for (const [tKey, tst] of tripletStats.entries()) {
            const rawTags = tKey.split('|||');
            const topPins = tst.pins.slice().sort((a, b) => (Number(b.effective_velocity ?? b.daily_save_velocity ?? 0) - Number(a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (Number(b.save_count || 0) - Number(a.save_count || 0))).slice(0, 12);
            const pinSetSig = tst.pinIds.slice().sort().join(',');
            const tagSupportSum = rawTags.reduce((s, tg) => s + (tagFreq.get(tg) || 1), 0);
            rawTriplets.push({
              tags: rawTags.map(toTitleCase),
              raw_tags: rawTags,
              joint_count: tst.jointCount,
              keywords_count: tst.kws.size || 1,
              keywords: Array.from(tst.kws),
              total_velocity: Math.round(tst.vel * 10) / 10,
              total_repins_delta: Math.round(tst.repins),
              total_saves: tst.saves,
              pins: topPins,
              matching_pins: topPins,
              _pin_set_sig: pinSetSig,
              _tag_support_sum: tagSupportSum
            });
          }

          // Sort candidates so the strongest multi-keyword, highest-velocity, highest-support triplet comes first
          rawTriplets.sort((a, b) =>
            ((b.keywords_count >= 2 ? 1 : 0) - (a.keywords_count >= 2 ? 1 : 0)) ||
            (b.total_velocity - a.total_velocity) ||
            (b.joint_count - a.joint_count) ||
            (b._tag_support_sum - a._tag_support_sum)
          );

          // Deduplicate cloned pin-set combinations (prevents 11 identical syndicated pins with 6 tags from spawning C(6,3)=20 identical triplet rows)
          const seenPinSets = new Set();
          const dedupedTriplets = [];
          for (const tr of rawTriplets) {
            if (tr._pin_set_sig && seenPinSets.has(tr._pin_set_sig)) {
              continue;
            }
            if (tr._pin_set_sig) {
              seenPinSets.add(tr._pin_set_sig);
            }
            delete tr._pin_set_sig;
            delete tr._tag_support_sum;
            dedupedTriplets.push(tr);
          }

          this.powerTriplets = dedupedTriplets.slice(0, 60);
        },

        copyPinBlueprint(sp) {
          if (!sp) return;
          const title = String(sp.title || ('Pin #' + sp.pin_id)).trim();
          const tags = (sp.visual_annotations || []).map(v => typeof v === 'object' && v !== null ? (v.name || v.tag || '') : String(v || '')).filter(Boolean).slice(0, 8);
          const kws = (sp.rankings || []).map(r => r.keyword + ' (#' + r.rank_position + ')').slice(0, 5);
          const vel = Number(sp.effective_velocity ?? sp.daily_save_velocity ?? 0);
          const blueprint = [
            'SCIENTIFIC PIN ARBITRAGE BLUEPRINT',
            '====================================',
            'Reference Pin: ' + title + ' (#' + sp.pin_id + ')',
            'Total Saves: ' + this.formatNumber(sp.save_count || 0) + ' | 24h Save Velocity: +' + vel + '/d | 24h Repins: +' + (sp.delta_repins_24h || 0),
            'Ranked Keywords: ' + (kws.join(', ') || 'Cluster Discovery'),
            'Visual CV Hooks: ' + (tags.join(', ') || 'Clean Focal Composition'),
            'Dominant Color: ' + (sp.dominant_color || '#E11D48') + ' | Aspect Ratio: ' + (sp.aspect_ratio || '2:3')
          ].join('\\n');
          navigator.clipboard.writeText(blueprint).then(() => {
            this.showToast('Copied Scientific Blueprint for Pin #' + sp.pin_id + '!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        copyVisualBlueprint(pair) {
          const folderName = String(this.activeFolder?.name || 'Topic Cluster').replace(/<[^>]*>/g, '').trim();
          const pillar = String(folderName + ' Master Guide').replace(/<[^>]*>/g, '').trim();
          const launch = String(this.crossoverData?.seasonality?.recommended_launch_window || 'Evergreen').replace(/<[^>]*>/g, '').trim();
          const tagA = String(pair.tag_a || '').replace(/<[^>]*>/g, '').trim();
          const tagB = String(pair.tag_b || '').replace(/<[^>]*>/g, '').trim();

          const blueprint = [
            'PINTEREST HIGH-CONVERTING VISUAL BLUEPRINT',
            '============================================',
            'Cluster: ' + folderName,
            'Power Synergy Pair: ' + tagA + ' + ' + tagB,
            'Mathematical Lift: ' + pair.lift + 'x (Joint Pins: ' + pair.joint_count + ')',
            'Pillar Concept: ' + pillar,
            'Target Launch Window: ' + launch,
            '',
            'CREATIVE GUIDELINES FOR GRAPHIC DESIGNER:',
            '1. Primary Focal Object: ' + tagA + ' prominently showcased in foreground.',
            '2. Secondary Anchor: ' + tagB + ' clearly visible or labeled in background/overlay.',
            '3. Typography: High-contrast bold headline with clean sans-serif text.',
            '4. Aspect Ratio: 2:3 Standard Vertical (1000x1500) or 9:16 Story (1080x1920).'
          ].join('\\n');

          navigator.clipboard.writeText(blueprint).then(() => {
            this.showToast('Copied Visual Blueprint (' + tagA + ' + ' + tagB + ')!', 'success');
          }).catch(() => {
            this.showToast('Clipboard access denied', 'warning');
          });
        },

        scrollToSection(id) {
          this.$nextTick(() => {
            const el = document.getElementById(id);
            if (el) {
              el.scrollIntoView({ behavior: 'smooth' });
            }
          });
        },

        setEntityFilter(type, value) {
          if (!value) return;
          this.entityFilter = { type, value };
          this.currentPage = 1;
          this.showToast('Filtered pins by ' + type + ': ' + value, 'info');
          this.scrollToSection('pins-table-section');
        },

        clearEntityFilter() {
          this.entityFilter = { type: null, value: null };
          this.currentPage = 1;
          this.showToast('Cleared drill-down filter', 'info');
        },

        toggleSort(col) {
          if (col === 'saves') {
            this.sortBy = this.sortBy === 'saves_desc' ? 'saves_asc' : 'saves_desc';
          } else if (col === 'velocity') {
            this.sortBy = this.sortBy === 'velocity_desc' ? 'saves_desc' : 'velocity_desc';
          } else if (col === 'pin_age') {
            this.sortBy = this.sortBy === 'pin_age_asc' ? 'pin_age_desc' : 'pin_age_asc';
          } else if (col === 'folder_age') {
            this.sortBy = this.sortBy === 'folder_age_desc' ? 'folder_age_asc' : 'folder_age_desc';
          }
          this.currentPage = 1;
        },

        filteredPinsList() {
          const allCount = (this.crossoverData?.all_pins?.length || 0);
          const superCount = (this.crossoverData?.super_pins?.length || 0);
          const matrixKey = this.activeMatrixFilter ? (this.activeMatrixFilter.type + ':' + this.activeMatrixFilter.label) : '';
          const currentKey = this.scopeFilter + '|' + this.sortBy + '|' + this.selectedTimeWindow + '|' + this.searchQuery + '|' + matrixKey + '|' + (this.entityFilter.type || '') + ':' + (this.entityFilter.value || '') + '|' + (this.onlyBreakoutBabyDomains ? '1' : '0') + '|' + (this.onlyVacuumPins ? '1' : '0') + '|' + (this.onlyFreshRockets ? '1' : '0') + '|' + (this.onlySurging24h ? '1' : '0') + '|' + allCount + ':' + superCount;

          if (this._pinsCacheKey === currentKey && this._cachedFilteredPins) {
            return this._cachedFilteredPins;
          }

          // Source pins array: if scope is 'super_only', derive from all_pins when present; otherwise use super_pins fallback
          let list = [];
          if (this.scopeFilter === 'super_only') {
            list = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
              ? this.crossoverData.all_pins.filter(p => p.is_super_pin || (p.overlap_count || 0) >= 2)
              : (this.crossoverData?.super_pins || []).filter(p => p.is_super_pin || (p.overlap_count || 0) >= 2);
          } else if (this.scopeFilter === 'active_only') {
            const source = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
              ? this.crossoverData.all_pins
              : (this.crossoverData?.super_pins || []);
            list = source.filter(p => p.has_active_rank);
          } else if (this.scopeFilter === 'vault_only') {
            const source = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
              ? this.crossoverData.all_pins
              : (this.crossoverData?.super_pins || []);
            list = source.filter(p => !p.has_active_rank && p.has_vault_rank);
          } else {
            list = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0) 
              ? this.crossoverData.all_pins 
              : (this.crossoverData?.super_pins || []);
          }

          // 1. Scope filter by individual keyword
          if (this.scopeFilter !== 'all' && this.scopeFilter !== 'super_only' && this.scopeFilter !== 'active_only' && this.scopeFilter !== 'vault_only') {
            const kw = this.scopeFilter.toLowerCase().trim();
            list = list.filter(p => (p.rankings || []).some(r => (r.keyword || '').toLowerCase().trim() === kw));
          }

          // 2. Entity filter (drill-down by domain or creator)
          if (this.entityFilter.type === 'domain') {
            const d = (this.entityFilter.value || '').toLowerCase().trim();
            list = list.filter(p => (p.domain || '').toLowerCase().includes(d));
          } else if (this.entityFilter.type === 'creator') {
            const c = (this.entityFilter.value || '').toLowerCase().trim();
            list = list.filter(p => (p.creator_username || 'anonymous').toLowerCase() === c);
          }

          // 2B. Structural Visual Matrix Pattern Filter (AND-logic for pairs/triplets, canonical lemma for anchors, capsule/color matching)
          if (this.activeMatrixFilter && this.activeMatrixFilter.item) {
            const mf = this.activeMatrixFilter;
            list = list.filter(p => this.pinMatchesMatrixItem(p, mf.item, mf.type));
          }

          // 3. Search query (supports title, domain, creator, visual tags, and pin_id)
          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(p => 
              String(p.pin_id || '').toLowerCase().includes(q) ||
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.creator_username || '').toLowerCase().includes(q) ||
              (p.visual_annotations || []).some(va => {
                const s = typeof va === 'object' && va !== null ? (va.name || va.tag || '') : String(va || '');
                return s.toLowerCase().includes(q);
              })
            );
          }

          // 3B. Breakout Baby Domains Filter (<2y + Authentic 7d Gains >= 15)
          if (this.onlyBreakoutBabyDomains) {
            list = list.filter(p => {
              if (typeof p.is_breakout_baby_domain === 'boolean') return p.is_breakout_baby_domain;
              const ageDays = Number(p.domain_age_days != null ? p.domain_age_days : (p.domain_age_years != null ? p.domain_age_years * 365 : 0));
              return ageDays > 0 && ageDays <= 730 && p.gains_7d != null && Number(p.gains_7d) >= 15;
            });
          }

          // 3C. Linkless Vacuums Filter (High Saves >= 100, Case-Insensitive No Domain / User Upload, requires image_url parity)
          if (this.onlyVacuumPins) {
            list = list.filter(p => typeof p.is_vacuum_pin === 'boolean'
              ? p.is_vacuum_pin
              : Boolean(p.image_url && this.isLinklessVacuumDomain(p.domain) && Number(p.save_count || 0) >= 100));
          }

          // 3D. Fresh Rockets Filter (<= 14d age with positive 24h momentum)
          if (this.onlyFreshRockets) {
            list = list.filter(p => p.pin_age_days != null && Number(p.pin_age_days) <= 14 && (Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0));
          }

          // 3E. 24h Surges Filter (Pins actively gaining saves or repins in last 24h)
          if (this.onlySurging24h) {
            list = list.filter(p => Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0);
          }

          // 4. Sorting (null rolling gains sort below authentic numbers)
          const numOrNeg = (v) => (v === null || v === undefined ? -1 : v);
          if (this.sortBy === 'velocity_desc') {
            list = list.slice().sort((a, b) => (numOrNeg(this.getPinWindowGain(b)) - numOrNeg(this.getPinWindowGain(a))) || (b.overlap_count || 0) - (a.overlap_count || 0) || (b.save_count || 0) - (a.save_count || 0));
          } else if (this.sortBy === 'repins_24h_desc') {
            list = list.slice().sort((a, b) => (numOrNeg(this.getPinWindowRepins(b)) - numOrNeg(this.getPinWindowRepins(a))) || (numOrNeg(this.getPinWindowGain(b)) - numOrNeg(this.getPinWindowGain(a))));
          } else if (this.sortBy === 'saves_desc') {
            list = list.slice().sort((a, b) => (b.save_count || 0) - (a.save_count || 0) || (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0));
          } else if (this.sortBy === 'saves_asc') {
            list = list.slice().sort((a, b) => (a.save_count || 0) - (b.save_count || 0) || (a.daily_save_velocity || 0) - (b.daily_save_velocity || 0));
          } else if (this.sortBy === 'pin_age_asc') {
            list = list.slice().sort((a, b) => (a.pin_age_days != null && isFinite(a.pin_age_days) ? Number(a.pin_age_days) : Infinity) - (b.pin_age_days != null && isFinite(b.pin_age_days) ? Number(b.pin_age_days) : Infinity));
          } else if (this.sortBy === 'pin_age_desc') {
            list = list.slice().sort((a, b) => (b.pin_age_days != null && isFinite(b.pin_age_days) ? Number(b.pin_age_days) : -Infinity) - (a.pin_age_days != null && isFinite(a.pin_age_days) ? Number(a.pin_age_days) : -Infinity));
          } else if (this.sortBy === 'folder_age_desc') {
            list = list.slice().sort((a, b) => (a.folder_age_days == null ? -1 : Number(a.folder_age_days)) < (b.folder_age_days == null ? -1 : Number(b.folder_age_days)) ? 1 : ((a.folder_age_days == null ? -1 : Number(a.folder_age_days)) > (b.folder_age_days == null ? -1 : Number(b.folder_age_days)) ? -1 : 0));
          } else if (this.sortBy === 'folder_age_asc') {
            list = list.slice().sort((a, b) => (a.folder_age_days == null ? Infinity : Number(a.folder_age_days)) - (b.folder_age_days == null ? Infinity : Number(b.folder_age_days)));
          } else if (this.sortBy === 'rank_asc') {
            list = list.slice().sort((a, b) => (a.min_rank || 999) - (b.min_rank || 999));
          } else if (this.sortBy === 'overlap_desc') {
            list = list.slice().sort((a, b) => (b.overlap_count || 0) - (a.overlap_count || 0) || (b.save_count || 0) - (a.save_count || 0));
          } else if (this.sortBy === 'title_asc') {
            list = list.slice().sort((a, b) => (a.title || '').localeCompare(b.title || ''));
          }

          this._pinsCacheKey = currentKey;
          this._cachedFilteredPins = list;
          return list;
        },

        totalPages() {
          const total = this.filteredPinsList().length;
          const pageSize = Math.max(1, parseInt(this.pageSize, 10) || 10);
          return Math.max(1, Math.ceil(total / pageSize));
        },

        paginatedPins() {
          const list = this.filteredPinsList();
          const pageSize = Math.max(1, parseInt(this.pageSize, 10) || 10);
          const maxPage = Math.max(1, Math.ceil(list.length / pageSize));
          let page = parseInt(this.currentPage, 10);
          if (!page || isNaN(page) || page < 1) page = 1;
          if (page > maxPage) page = maxPage;
          const start = (page - 1) * pageSize;
          return list.slice(start, start + pageSize);
        },

        filteredTagBridges() {
          let list = this.crossoverData?.tag_bridges || [];

          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(tb => 
              (tb.tag || '').toLowerCase().includes(q) ||
              (tb.keywords || []).some(k => k.toLowerCase().includes(q))
            );
          }

          return list;
        },

        async createFolder() {
          if (!this.newFolderName.trim()) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                name: this.newFolderName.trim(),
                description: this.newFolderDesc.trim(),
                color: this.newFolderColor,
                icon: 'folder'
              })
            });
            if (res.ok) {
              const data = await res.json();
              this.openNewFolderModal = false;
              this.newFolderName = '';
              this.newFolderDesc = '';
              this.showToast('Campaign folder created!', 'success');
              if (data.folder?.id) {
                window.location.href = '/folders/' + data.folder.id;
              } else {
                await this.loadFolders();
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.message || errData.error || 'Failed to create folder', 'error');
            }
          } catch (e) {
            this.showToast('Network error creating folder: ' + e.message, 'error');
          }
        },

        confirmDeleteFolder(id) {
          this.deleteModalFolderId = id;
        },

        async executeDeleteFolder() {
          const id = this.deleteModalFolderId;
          if (!id) return;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + id, { method: 'DELETE' });
            if (res.ok) {
              this.foldersList = this.foldersList.filter(f => f.id !== id);
              this.deleteModalFolderId = null;
              this.showToast('Campaign folder deleted', 'success');
              if (String(this.activeFolderId) === String(id)) {
                window.location.href = '/folders';
              }
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast(errData.message || errData.error || 'Failed to delete folder', 'error');
            }
          } catch (e) {
            this.showToast('Network error deleting folder: ' + e.message, 'error');
          }
        },

        async resolveShortlinkSearch(url) {
          if (!url) return;
          try {
            const res = await window.apiFetch('/api/pins/resolve-shortlink?url=' + encodeURIComponent(url), {
              timeout: 8000
            });
            if (!res.ok) return;
            const data = await res.json();
            if (data?.ok && data.pin_id) {
              this.searchQuery = String(data.pin_id);
              this.showToast('Resolved pin.it shortlink to Pin #' + data.pin_id, 'success');
            }
          } catch (_) {}
        },

        async openCreatorVisualFeed(username) {
          const cleanUser = String(username || '').replace(/^@+/, '').trim();
          if (!cleanUser) return;
          this.visualFeedUsername = cleanUser;
          this.visualFeedUser = { username: cleanUser };
          this.visualFeedPins = [];
          this.isVisualFeedLoading = true;
          this.isVisualFeedModalOpen = true;
          this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });

          try {
            const res = await window.apiFetch('/api/creators/' + encodeURIComponent(cleanUser) + '/latest-pins');
            if (res.ok) {
              const data = await res.json();
              if (data.ok) {
                this.visualFeedPins = data.pins || [];
                if (data.user) {
                  this.visualFeedUser = data.user;
                }
              } else {
                this.showToast('Failed to fetch visual feed: ' + (data.error || 'Unknown error'), 'error');
              }
            } else {
              this.showToast('Could not load visual feed (<350ms)', 'error');
            }
          } catch (err) {
            this.showToast('Network error loading visual feed: ' + err.message, 'error');
          } finally {
            this.isVisualFeedLoading = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        formatNumber(n) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.formatNumber === 'function') {
            return window.PAEFormatters.formatNumber(n);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          return Number(n || 0).toLocaleString();
        },

        safeUrl(url) {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeUrl === 'function') {
            return window.PAEFormatters.safeUrl(url);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (!url) return '#';
          const s = String(url).trim();
          if (/^https?:\\/\\//i.test(s) || (s.startsWith('/') && !s.startsWith('//'))) return s;
          return '#';
        },

        safeColor(color, fallback = '#6366f1') {
          if (typeof window !== 'undefined' && window.PAEFormatters && typeof window.PAEFormatters.safeColor === 'function') {
            return window.PAEFormatters.safeColor(color, fallback);
          }
          // @deprecated VM fallback when shared-head formatters are absent
          if (!color) return fallback;
          const s = String(color).trim();
          return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/.test(s) ? s : fallback;
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
      if (typeof window !== 'undefined') {
        window.addEventListener('load', initLucide);
      }
    }
  </script>`;
}
