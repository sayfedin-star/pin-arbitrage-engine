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
            if (window.lucide) window.lucide.createIcons();
          });
        },
        darkMode: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        isDark: typeof localStorage !== 'undefined' ? localStorage.getItem('pa_theme') !== 'light' : true,
        foldersList: [],
        foldersLoading: false,
        activeFolder: null,
        crossoverData: null,
        crossoverLoading: false,
        _folderReqSeq: 0,
        auditDispatching: false,
        isSettingsModalOpen: false,
        settingsLoading: false,
        selectedTimeWindow: '24h',
        pruningLoading: false,
        prunePreviewResult: null,
        pinterestCookieInput: '',
        pinterestCookieStatus: { has_cookie: true, preview: '' },
        isSavingCookie: false,
        pruneForm: {
          scope: 'displaced',
          min_pin_age_days: 30,
          max_saves: 5,
          keyword_ids: []
        },

        get clusterWindowSavesGains() {
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return 0;
          const win = this.selectedTimeWindow;
          return pins.reduce((sum, p) => {
            let delta = 0;
            if (win === '24h') delta = Number(p.delta_saves_24h || p.daily_save_velocity || 0);
            else if (win === '5d') delta = Number(p.gains_5d || (p.daily_save_velocity ? p.daily_save_velocity * 5 : 0));
            else if (win === '7d') delta = Number(p.gains_7d || (p.daily_save_velocity ? p.daily_save_velocity * 7 : 0));
            else if (win === '10d') delta = Number(p.gains_10d || (p.daily_save_velocity ? p.daily_save_velocity * 10 : 0));
            else if (win === '15d') delta = Number(p.gains_15d || (p.daily_save_velocity ? p.daily_save_velocity * 15 : 0));
            else delta = Number(p.save_count || 0);
            return sum + Math.max(0, delta);
          }, 0);
        },

        get clusterWindowRepinsGains() {
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return 0;
          const win = this.selectedTimeWindow;
          const mult = win === '24h' ? 1 : win === '5d' ? 5 : win === '7d' ? 7 : win === '10d' ? 10 : win === '15d' ? 15 : 30;
          return Math.round(pins.reduce((sum, p) => sum + (Number(p.delta_repins_24h || p.daily_repin_velocity || 0) * mult), 0));
        },

        get clusterAvgVelocity() {
          const pins = this.crossoverData?.all_pins || this.crossoverData?.super_pins || [];
          if (!pins.length) return '0.0';
          const totalVel = pins.reduce((sum, p) => sum + (Number(p.daily_save_velocity || 0)), 0);
          return (totalVel / pins.length).toFixed(1);
        },

        get clusterCompetitorAudienceGains() {
          const creators = this.crossoverData?.top_creators || [];
          if (!creators.length) return 0;
          const win = this.selectedTimeWindow;
          return creators.reduce((sum, c) => {
            const d24 = Number(c.delta_reach_24h ?? c.delta_monthly_reach ?? 0);
            const d7 = Number(c.reach_delta_7d ?? (d24 > 0 ? d24 * 7 : 0));
            const d30 = Number(c.delta_audience_30d ?? c.delta_monthly_reach ?? (d7 > 0 ? Math.round((d7 / 7) * 30) : 0));
            let val = 0;
            if (win === '24h') val = d24;
            else if (win === '5d') val = Math.round((d7 / 7) * 5);
            else if (win === '7d') val = d7;
            else if (win === '10d') val = Math.round((d7 / 7) * 10);
            else if (win === '15d') val = Math.round((d7 / 7) * 15);
            else val = d30 || Number(c.monthly_reach || 0);
            return sum + Math.max(0, val);
          }, 0);
        },

        formatUniversalAge(days) {
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
          if (!confirm('Are you sure you want to prune candidate pins? They will be tombstoned to keyword_ignored_pins.')) return;
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

        folderSettings: {
          name: '',
          description: '',
          color: '#6366f1',
          enable_serp_harvest: true,
          max_pins: '50',
          max_serp_pins: '50',
          crawl_scope: 'all_pins',
          max_catalog_inspect: '0',
          pause_competitors: false,
          pause_crawlers: false,
          block_fleet: false,
          auto_discover_creators: true
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
        powerPairsView: 'cards',
        powerPairsLimit: 12,
        powerPairsSearch: '',
        powerPairsSort: 'freq_desc',
        powerPairsPage: 1,
        powerPairsPageSize: 15,

        // Core Visual Anchors State
        anchorsView: 'cards',
        anchorsLimit: 24,
        anchorsSearch: '',
        anchorsTier: 'all',
        anchorsPage: 1,
        anchorsPageSize: 25,

        // Domain Monopoly State
        domainSearch: '',
        domainSort: 'default',
        domainPage: 1,
        domainPageSize: 10,
        _domainCacheKey: '',
        _cachedFilteredDomains: null,

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
            return '🎯 Capsule: ' + (item.display_label || item.term || '');
          }
          if (tab === 'colors' || item._type === 'color') {
            return '🎨 Palette: ' + (item.hex || '');
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
            '📌 CLUSTER VISUAL PATTERN BLUEPRINT',
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

        togglePowerPairsSort(col) {
          if (col === 'freq') {
            this.powerPairsSort = this.powerPairsSort === 'freq_desc' ? 'freq_asc' : 'freq_desc';
          } else if (col === 'velocity') {
            this.powerPairsSort = this.powerPairsSort === 'velocity_desc' ? 'velocity_asc' : 'velocity_desc';
          } else if (col === 'lift') {
            this.powerPairsSort = this.powerPairsSort === 'lift_desc' ? 'lift_asc' : 'lift_desc';
          } else if (col === 'tag') {
            this.powerPairsSort = this.powerPairsSort === 'tag_asc' ? 'tag_desc' : 'tag_asc';
          } else {
            this.powerPairsSort = this.powerPairsSort === 'synergy_desc' ? 'freq_desc' : 'synergy_desc';
          }
          this.powerPairsPage = 1;
        },

        filteredPowerPairs() {
          if (!this.powerPairs || this.powerPairs.length === 0) return [];
          let list = this.powerPairs;
          if (this.powerPairsSearch.trim()) {
            const q = this.powerPairsSearch.toLowerCase().trim();
            list = list.filter(p => 
              p.tag_a.toLowerCase().includes(q) || 
              p.tag_b.toLowerCase().includes(q)
            );
          }

          if (this.powerPairsSort === 'freq_desc') {
            list = list.slice().sort((a, b) => b.joint_count - a.joint_count || (b.total_velocity || 0) - (a.total_velocity || 0) || b.lift - a.lift);
          } else if (this.powerPairsSort === 'freq_asc') {
            list = list.slice().sort((a, b) => a.joint_count - b.joint_count || (a.total_velocity || 0) - (b.total_velocity || 0) || a.lift - b.lift);
          } else if (this.powerPairsSort === 'velocity_desc') {
            list = list.slice().sort((a, b) => (b.total_velocity || 0) - (a.total_velocity || 0) || b.joint_count - a.joint_count);
          } else if (this.powerPairsSort === 'velocity_asc') {
            list = list.slice().sort((a, b) => (a.total_velocity || 0) - (b.total_velocity || 0) || a.joint_count - b.joint_count);
          } else if (this.powerPairsSort === 'lift_desc') {
            list = list.slice().sort((a, b) => b.lift - a.lift || b.joint_count - a.joint_count);
          } else if (this.powerPairsSort === 'lift_asc') {
            list = list.slice().sort((a, b) => a.lift - b.lift || b.joint_count - a.joint_count);
          } else if (this.powerPairsSort === 'tag_asc') {
            list = list.slice().sort((a, b) => a.tag_a.localeCompare(b.tag_a));
          } else if (this.powerPairsSort === 'tag_desc') {
            list = list.slice().sort((a, b) => b.tag_a.localeCompare(a.tag_a));
          } else {
            list = list.slice().sort((a, b) => b.synergy_score - a.synergy_score || b.joint_count - a.joint_count);
          }
          return list;
        },

        paginatedPowerPairsTable() {
          const list = this.filteredPowerPairs();
          const start = (this.powerPairsPage - 1) * this.powerPairsPageSize;
          return list.slice(start, start + this.powerPairsPageSize);
        },

        totalPowerPairsPages() {
          return Math.ceil(this.filteredPowerPairs().length / this.powerPairsPageSize) || 1;
        },

        filteredAnchorsList() {
          let list = this.coreAnchorsList || [];
          if (this.anchorsTier === 'whales') {
            list = list.filter(a => a.count >= 25);
          } else if (this.anchorsTier === 'high') {
            list = list.filter(a => a.count >= 10);
          } else if (this.anchorsTier === 'core') {
            list = list.filter(a => a.count >= 5);
          }

          if (this.anchorsSearch.trim()) {
            const q = this.anchorsSearch.toLowerCase().trim();
            list = list.filter(a => a.tag.toLowerCase().includes(q));
          }
          return list;
        },

        paginatedAnchorsTable() {
          const list = this.filteredAnchorsList();
          const start = (this.anchorsPage - 1) * this.anchorsPageSize;
          return list.slice(start, start + this.anchorsPageSize);
        },

        totalAnchorsPages() {
          return Math.ceil(this.filteredAnchorsList().length / this.anchorsPageSize) || 1;
        },

        toggleDomainSort(col) {
          if (col === 'domain') {
            this.domainSort = this.domainSort === 'domain_asc' ? 'domain_desc' : 'domain_asc';
          } else if (col === 'keywords') {
            this.domainSort = this.domainSort === 'kw_desc' ? 'kw_asc' : 'kw_desc';
          } else if (col === 'pins') {
            this.domainSort = this.domainSort === 'pins_desc' ? 'pins_asc' : 'pins_desc';
          } else if (col === 'saves') {
            this.domainSort = this.domainSort === 'saves_desc' ? 'saves_asc' : 'saves_desc';
          } else {
            this.domainSort = 'default';
          }
          this.domainPage = 1;
          this._domainCacheKey = '';
        },

        filteredDomainList() {
          const monopoly = this.crossoverData?.domain_monopoly || [];
          const search = (this.domainSearch || '').toLowerCase().trim();
          const currentKey = (this.activeFolderId || '') + '|' + search + '|' + this.domainSort + '|' + monopoly.length;
          if (this._domainCacheKey === currentKey && this._cachedFilteredDomains) {
            return this._cachedFilteredDomains;
          }

          let list = monopoly;
          if (search) {
            list = monopoly.filter(d => d.domain && d.domain.toLowerCase().includes(search));
          }

          if (this.domainSort === 'domain_asc') {
            list = list.slice().sort((a, b) => String(a.domain || '').localeCompare(String(b.domain || '')));
          } else if (this.domainSort === 'domain_desc') {
            list = list.slice().sort((a, b) => String(b.domain || '').localeCompare(String(a.domain || '')));
          } else if (this.domainSort === 'kw_desc') {
            list = list.slice().sort((a, b) => ((b.keywords_count || 0) - (a.keywords_count || 0)) || ((b.pin_count || 0) - (a.pin_count || 0)) || ((b.total_saves || 0) - (a.total_saves || 0)));
          } else if (this.domainSort === 'kw_asc') {
            list = list.slice().sort((a, b) => ((a.keywords_count || 0) - (b.keywords_count || 0)) || ((a.pin_count || 0) - (b.pin_count || 0)) || ((a.total_saves || 0) - (b.total_saves || 0)));
          } else if (this.domainSort === 'pins_desc') {
            list = list.slice().sort((a, b) => ((b.pin_count || 0) - (a.pin_count || 0)) || ((b.total_saves || 0) - (a.total_saves || 0)));
          } else if (this.domainSort === 'pins_asc') {
            list = list.slice().sort((a, b) => ((a.pin_count || 0) - (b.pin_count || 0)) || ((a.total_saves || 0) - (b.total_saves || 0)));
          } else if (this.domainSort === 'saves_desc') {
            list = list.slice().sort((a, b) => ((b.total_saves || 0) - (a.total_saves || 0)) || ((b.pin_count || 0) - (a.pin_count || 0)));
          } else if (this.domainSort === 'saves_asc') {
            list = list.slice().sort((a, b) => ((a.total_saves || 0) - (b.total_saves || 0)) || ((a.pin_count || 0) - (b.pin_count || 0)));
          }

          this._domainCacheKey = currentKey;
          this._cachedFilteredDomains = list;
          return list;
        },

        paginatedDomains() {
          const list = this.filteredDomainList();
          const pageSize = Math.max(1, parseInt(this.domainPageSize, 10) || 10);
          const totalPages = Math.ceil(list.length / pageSize) || 1;
          let page = parseInt(this.domainPage, 10);
          if (!page || isNaN(page) || page < 1) page = 1;
          if (page > totalPages) page = totalPages;
          const start = (page - 1) * pageSize;
          return list.slice(start, start + pageSize);
        },

        totalDomainPages() {
          const pageSize = Math.max(1, parseInt(this.domainPageSize, 10) || 10);
          return Math.ceil(this.filteredDomainList().length / pageSize) || 1;
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

          if (this.activeFolderId) {
            await this.loadActiveFolder();
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

          this.$nextTick(() => {
            if (typeof window !== 'undefined' && window.lucide && typeof window.lucide.createIcons === 'function') {
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
            if (window.lucide) window.lucide.createIcons();
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
          this.foldersLoading = true;
          try {
            let res;
            if (this.activeFolderId) {
              res = await (window.safeApiFetch || fetch)('/api/folders?lite=true');
            } else {
              res = await (window.safeApiFetch || fetch)('/api/folders');
            }
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
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
            console.error('Error loading folders:', e);
            if (!this.activeFolder) {
              this.showToast('Network error loading folders', 'error');
            }
          } finally {
            if (!this.foldersList.length && this.activeFolder) {
              this.foldersList = [this.activeFolder];
            }
            this.foldersLoading = false;
          }
        },

        async loadActiveFolder(forceRefresh = false) {
          const reqSeq = ++this._folderReqSeq;
          // Phase 1: Fast metadata hydration (< 50ms)
          try {
            const shouldRefresh = forceRefresh === true || this.currentRoom === 'settings';
            const folderUrl = '/api/folders/' + this.activeFolderId + (shouldRefresh ? '?refresh=true' : '');
            const folderRes = await (window.safeApiFetch || fetch)(folderUrl);
            if (reqSeq !== this._folderReqSeq) return;
            if (folderRes.ok) {
              const data = await folderRes.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq) return;
              const fetched = data.folder || null;
              this.activeFolder = fetched ? (this.activeFolder ? { ...this.activeFolder, ...fetched } : fetched) : null;
              this.syncFolderSettingsFromActive();
            } else {
              this.showToast('Campaign folder not found', 'error');
            }
          } catch (e) {
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error fetching folder metadata:', e);
          }

          // Unnecessary 30s Crossover fetch bypassed when in settings room
          this.fetchPinterestCookieStatus().catch(() => {});
          if (this.currentRoom === 'settings') {
            this.crossoverLoading = false;
            return;
          }

          // Phase 2: Crossover Matrix analysis (< 30s)
          this.crossoverLoading = true;
          try {
            const crossoverRes = await (window.safeApiFetch || fetch)('/api/folders/' + this.activeFolderId + '/raw-visual-crossover', {
              timeout: 30000,
              retries: 1
            });
            if (reqSeq !== this._folderReqSeq) return;
            if (crossoverRes.ok) {
              const cdata = await crossoverRes.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq) return;
              this.crossoverData = cdata.crossover || cdata;
              this.computePowerPairs();
              this.currentPage = 1;
              this.domainPage = 1;
              this.domainSearch = '';
              this.domainSort = 'default';
              this._domainCacheKey = '';
              this._cachedFilteredDomains = null;
              this._pinsCacheKey = '';
            } else {
              this.showToast('Failed to compute crossover matrix', 'error');
            }
          } catch (e) {
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error loading crossover matrix:', e);
            this.showToast('Crossover matrix analysis timed out or failed', 'error');
          } finally {
            if (reqSeq === this._folderReqSeq) {
              this.crossoverLoading = false;
            }
          }
        },

        async runCrossoverAnalysis(isRefresh = false) {
          if (!this.activeFolderId) return;
          const reqSeq = ++this._folderReqSeq;
          this.crossoverLoading = true;
          try {
            const url = '/api/folders/' + this.activeFolderId + '/raw-visual-crossover' + (isRefresh ? '?refresh=true' : '');
            const res = await (window.safeApiFetch || fetch)(url);
            if (reqSeq !== this._folderReqSeq) return;
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              if (reqSeq !== this._folderReqSeq) return;
              this.crossoverData = data.crossover || data;
              this.computePowerPairs();
              this.currentPage = 1;
              this.domainPage = 1;
              this.domainSearch = '';
              this.domainSort = 'default';
              this._domainCacheKey = '';
              this._cachedFilteredDomains = null;
              this._pinsCacheKey = '';
              if (isRefresh) {
                this.showToast('Crossover analysis recalculated successfully', 'success');
              }
            } else {
              this.showToast('Failed to compute crossover matrix', 'error');
            }
          } catch (e) {
            if (reqSeq !== this._folderReqSeq) return;
            console.error('Error running crossover analysis:', e);
            this.showToast('Network error analyzing crossover', 'error');
          } finally {
            if (reqSeq === this._folderReqSeq) {
              this.crossoverLoading = false;
            }
          }
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

          this.folderSettings = {
            name: this.activeFolder.name || '',
            description: this.activeFolder.description || '',
            color: this.activeFolder.color || '#6366f1',
            enable_serp_harvest: meta.enable_serp_harvest !== undefined ? Boolean(meta.enable_serp_harvest) : true,
            max_pins: String(meta.max_pins || '50'),
            max_serp_pins: String(meta.max_serp_pins || meta.max_pins || '50'),
            crawl_scope: String(meta.crawl_scope || 'all_pins'),
            max_catalog_inspect: String(meta.max_catalog_inspect || '0'),
            pause_competitors: Boolean(meta.pause_competitors),
            pause_crawlers: Boolean(meta.pause_crawlers),
            block_fleet: Boolean(meta.block_fleet),
            auto_discover_creators: meta.auto_discover_creators !== undefined ? Boolean(meta.auto_discover_creators) : true
          };
        },

        openFolderSettingsModal() {
          if (!this.activeFolder) return;
          this.syncFolderSettingsFromActive();
          this.fetchPinterestCookieStatus().catch(() => {});
          this.isSettingsModalOpen = true;
        },

        async fetchPinterestCookieStatus() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/settings/cookie');
            if (res.ok) {
              const data = await res.json();
              this.pinterestCookieStatus = data;
              if (data.cookie && !this.pinterestCookieInput) {
                this.pinterestCookieInput = data.cookie;
              }
            }
          } catch (_) {}
        },

        async savePinterestCookie() {
          if (!this.pinterestCookieInput || !this.pinterestCookieInput.trim()) {
            this.showToast('Please paste a Pinterest session cookie first', 'warning');
            return;
          }
          this.isSavingCookie = true;
          try {
            const res = await (window.safeApiFetch || fetch)('/api/settings/cookie', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ cookie: this.pinterestCookieInput.trim() })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data.success) {
              this.pinterestCookieStatus = {
                has_cookie: data.has_cookie,
                preview: data.preview || (this.pinterestCookieInput.trim().slice(0, 32) + '...')
              };
              this.showToast('Pinterest session cookie saved & activated across all crawlers!', 'success');
            } else {
              this.showToast(data.error || data.message || 'Failed to save cookie', 'error');
            }
          } catch (err) {
            this.showToast('Error saving cookie: ' + err.message, 'error');
          } finally {
            this.isSavingCookie = false;
          }
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

            const maxPinsVal = String(this.folderSettings.max_serp_pins || this.folderSettings.max_pins || '50');
            const payload = {
              name: (this.folderSettings.name || '').trim() || (this.activeFolder?.name || ''),
              description: (this.folderSettings.description || '').trim(),
              color: this.folderSettings.color || '#6366f1',
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
              } else {
                this.isSettingsModalOpen = false;
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
          this.showToast('🚀 Dispatching 20-runner parallel cluster fleet on GitHub Actions...', 'info');
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
            const maxPins = String(this.folderSettings?.max_pins || meta.max_pins || '50');
            const maxSerpPins = String(this.folderSettings?.max_serp_pins || meta.max_serp_pins || maxPins);
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
              if (this.isSettingsModalOpen) this.isSettingsModalOpen = false;
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
            '⚡ SCIENTIFIC PIN ARBITRAGE BLUEPRINT',
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
            '📌 PINTEREST HIGH-CONVERTING VISUAL BLUEPRINT',
            '============================================',
            'Cluster: ' + folderName,
            'Power Synergy Pair: ' + tagA + ' + ' + tagB,
            'Mathematical Lift: ' + pair.lift + 'x (Joint Pins: ' + pair.joint_count + ')',
            'Pillar Concept: ' + pillar,
            'Target Launch Window: ' + launch,
            '',
            '🎨 CREATIVE GUIDELINES FOR GRAPHIC DESIGNER:',
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

        sanitizeCsvCell(val) {
          let str = String(val == null ? '' : val);
          const code = str.charCodeAt(0);
          if (code === 61 || code === 43 || code === 45 || code === 64 || code === 9 || code === 10 || code === 13) {
            str = "'" + str;
          }
          return '"' + str.replace(/"/g, '""') + '"';
        },

        downloadClusterCsv() {
          const bp = this.crossoverData?.topic_cluster_blueprint;
          if (!bp || !bp.csv_rows?.length) {
            this.showToast('No cluster blueprint rows available to export', 'warning');
            return;
          }

          const headers = Object.keys(bp.csv_rows[0]);
          const csvContent = [
            headers.map(h => this.sanitizeCsvCell(h)).join(','),
            ...bp.csv_rows.map(row => 
              headers.map(h => this.sanitizeCsvCell(row[h])).join(',')
            )
          ].join('\\r\\n');

          const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.href = url;
          a.download = (this.activeFolder?.name || 'campaign').toLowerCase().replace(/[^a-z0-9]/g, '_') + '_content_plan.csv';
          document.body.appendChild(a);
          a.click();
          document.body.removeChild(a);
          URL.revokeObjectURL(url);
          this.showToast('Downloaded CSV Content Plan!', 'success');
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
          const currentKey = this.scopeFilter + '|' + this.sortBy + '|' + this.searchQuery + '|' + matrixKey + '|' + (this.entityFilter.type || '') + ':' + (this.entityFilter.value || '') + '|' + (this.onlyBreakoutBabyDomains ? '1' : '0') + '|' + (this.onlyVacuumPins ? '1' : '0') + '|' + (this.onlyFreshRockets ? '1' : '0') + '|' + (this.onlySurging24h ? '1' : '0') + '|' + allCount + ':' + superCount;

          if (this._pinsCacheKey === currentKey && this._cachedFilteredPins) {
            return this._cachedFilteredPins;
          }

          // Source pins array: if scope is 'super_only', derive from all_pins when present; otherwise use super_pins fallback
          let list = [];
          if (this.scopeFilter === 'super_only') {
            list = (this.crossoverData?.all_pins && this.crossoverData.all_pins.length > 0)
              ? this.crossoverData.all_pins.filter(p => p.is_super_pin || (p.overlap_count || 0) >= 2)
              : (this.crossoverData?.super_pins || []);
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

          // 3. Search query
          if (this.searchQuery.trim()) {
            const q = this.searchQuery.toLowerCase().trim();
            list = list.filter(p => 
              (p.title || '').toLowerCase().includes(q) ||
              (p.domain || '').toLowerCase().includes(q) ||
              (p.creator_username || '').toLowerCase().includes(q) ||
              (p.visual_annotations || []).some(va => {
                const s = typeof va === 'object' && va !== null ? (va.name || va.tag || '') : String(va || '');
                return s.toLowerCase().includes(q);
              })
            );
          }

          // 3B. Breakout Baby Domains Filter (<2y + 7d Gains >= 15)
          if (this.onlyBreakoutBabyDomains) {
            list = list.filter(p => {
              const ageDays = Number(p.domain_age_days || (p.domain_age_years ? p.domain_age_years * 365 : 0));
              const g7 = Number(p.gains_7d || (p.daily_save_velocity ? p.daily_save_velocity * 7 : 0));
              return ageDays > 0 && ageDays <= 730 && g7 >= 15;
            });
          }

          // 3C. Linkless Vacuums Filter (High Saves >= 100, No Domain / User Upload)
          if (this.onlyVacuumPins) {
            list = list.filter(p => Boolean(p.is_vacuum_pin || ((!p.domain || p.domain === 'Uploaded by user') && Number(p.save_count || 0) >= 100)));
          }

          // 3D. Fresh Rockets Filter (<= 14d age with positive 24h momentum)
          if (this.onlyFreshRockets) {
            list = list.filter(p => p.pin_age_days != null && Number(p.pin_age_days) <= 14 && (Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0));
          }

          // 3E. 24h Surges Filter (Pins actively gaining saves or repins in last 24h)
          if (this.onlySurging24h) {
            list = list.filter(p => Number(p.effective_velocity ?? p.daily_save_velocity ?? 0) > 0 || Number(p.delta_repins_24h || 0) > 0);
          }

          // 4. Sorting
          if (this.sortBy === 'velocity_desc') {
            list = list.slice().sort((a, b) => ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)) || (b.overlap_count || 0) - (a.overlap_count || 0) || (b.save_count || 0) - (a.save_count || 0));
          } else if (this.sortBy === 'repins_24h_desc') {
            list = list.slice().sort((a, b) => (Number(b.delta_repins_24h || 0) - Number(a.delta_repins_24h || 0)) || ((b.effective_velocity ?? b.daily_save_velocity ?? 0) - (a.effective_velocity ?? a.daily_save_velocity ?? 0)));
          } else if (this.sortBy === 'saves_desc') {
            list = list.slice().sort((a, b) => (b.save_count || 0) - (a.save_count || 0) || (b.daily_save_velocity || 0) - (a.daily_save_velocity || 0));
          } else if (this.sortBy === 'saves_asc') {
            list = list.slice().sort((a, b) => (a.save_count || 0) - (b.save_count || 0) || (a.daily_save_velocity || 0) - (b.daily_save_velocity || 0));
          } else if (this.sortBy === 'pin_age_asc') {
            list = list.slice().sort((a, b) => (a.pin_age_days != null && isFinite(a.pin_age_days) ? Number(a.pin_age_days) : Infinity) - (b.pin_age_days != null && isFinite(b.pin_age_days) ? Number(b.pin_age_days) : Infinity));
          } else if (this.sortBy === 'pin_age_desc') {
            list = list.slice().sort((a, b) => (b.pin_age_days != null && isFinite(b.pin_age_days) ? Number(b.pin_age_days) : -Infinity) - (a.pin_age_days != null && isFinite(a.pin_age_days) ? Number(a.pin_age_days) : -Infinity));
          } else if (this.sortBy === 'folder_age_desc') {
            list = list.slice().sort((a, b) => (Number(b.folder_age_days) || 0) - (Number(a.folder_age_days) || 0));
          } else if (this.sortBy === 'folder_age_asc') {
            list = list.slice().sort((a, b) => (Number(a.folder_age_days) || 0) - (Number(b.folder_age_days) || 0));
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

        // Alias for backward compatibility with template checks
        filteredSuperPins() {
          return this.filteredPinsList();
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

        goToPage(page) {
          const total = this.totalPages();
          const p = parseInt(page, 10);
          if (!p || isNaN(p) || p < 1) {
            this.currentPage = 1;
          } else if (p > total) {
            this.currentPage = total;
          } else {
            this.currentPage = p;
          }
        },

        visiblePages() {
          const total = this.totalPages();
          const current = this.currentPage;
          const pages = [];

          if (total <= 7) {
            for (let i = 1; i <= total; i++) pages.push(i);
          } else {
            pages.push(1);
            if (current > 3) pages.push('...');
            const start = Math.max(2, current - 1);
            const end = Math.min(total - 1, current + 1);
            for (let i = start; i <= end; i++) pages.push(i);
            if (current < total - 2) pages.push('...');
            pages.push(total);
          }
          return pages;
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

        calcSov(pinCount) {
          const total = this.crossoverData?.summary?.total_unique_pins || (this.crossoverData?.all_pins?.length || 0);
          if (!total || total <= 0) return 0;
          const count = Number(pinCount) || 0;
          if (count <= 0) return 0;
          const pct = Math.round((count / total) * 100);
          return Math.min(100, Math.max(0, pct));
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
                icon: '📁'
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
            const res = await fetch('/api/pins/resolve-shortlink?url=' + encodeURIComponent(url), {
              signal: AbortSignal.timeout(8000)
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
            const res = await (window.safeApiFetch || fetch)('/api/competitors/' + encodeURIComponent(cleanUser) + '/latest-pins');
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
          return Number(n || 0).toLocaleString();
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
