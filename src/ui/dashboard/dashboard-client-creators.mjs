/**
 * src/ui/dashboard/dashboard-client-creators.mjs
 *
 * Modular Client Subsystem: Competitor/Fleet Management, Folder-Creator Linking,
 * Creator Dossier Navigation, Related Graph Harvester & Account Pin Ledger.
 * Extracted from dashboard-client-app.mjs (Wave 2 decomposition).
 */

export function getDashboardCreatorsFleetMethods() {
  return `        async fetchCompetitors(bypassCache = false, opts = {}) {
          if (bypassCache) {
            this._clientCache?.creators?.clear();
            this._clientCache?.boards?.clear();
          }
          if (this.scopedFolderId || this.folderFilter) {
            return this.loadFolderCreators(this.scopedFolderId || this.folderFilter);
          }
          const reqSeq = ++this._creatorsReqSeq;
          const requestedLimit = Number(opts && opts.limit) > 0 ? Number(opts.limit) : 5000;
          const signal = typeof this._nextAbortSignal === 'function' ? this._nextAbortSignal('competitors') : undefined;
          try {
            const baseEndpoint = '/api/creators?limit=' + requestedLimit + (bypassCache ? ('&_t=' + Date.now() + '&refresh=true') : '');
            const fetchOpts = bypassCache ? { cache: 'no-store' } : {};
            if (signal) fetchOpts.signal = signal;
            const res = await window.apiFetch(this.getApiUrl(baseEndpoint), fetchOpts);
            if (reqSeq !== this._creatorsReqSeq || (signal && signal.aborted)) return;
            if (res.ok) {
              const data = await res.json();
              if (reqSeq !== this._creatorsReqSeq || (signal && signal.aborted)) return;
              this.competitorsOverview = data.overview || { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
              this.competitors = data.competitors || [];
              if (requestedLimit >= 5000) this._competitorsFullyLoaded = true;
              this._competitorsCacheKey = '';
              if (this.activeCreator) {
                const matched = this.competitors.find(c => (c.username || '').toLowerCase() === (this.activeCreator.username || '').toLowerCase());
                if (matched) {
                  this.activeCreator = { ...matched, ...this.activeCreator };
                }
              }
            } else {
              if (reqSeq !== this._creatorsReqSeq) return;
              this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
              this.competitors = [];
              this._competitorsCacheKey = '';
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            if (reqSeq !== this._creatorsReqSeq) return;
            this.competitorsOverview = { tracked_profiles: 0, total_pins_stored: 0, high_velocity_pins: 0, top_competitors: [] };
            this.competitors = [];
            this._competitorsCacheKey = '';
          } finally {
            if (reqSeq === this._creatorsReqSeq) {
              this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async syncCompetitor(username) {
          try {
            const cleanName = (username || '').replace(/^@+/, '');
            this.showToast('Syncing profile for @' + cleanName + '...');
            const res = await window.apiFetch(this.getApiUrl('/api/creators/sync'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ username: cleanName })
            });
            if (res.ok) {
              this._clientCache?.boards?.clear();
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.username || '').replace(/^@+/, '') === cleanName) {
                const updated = (this.competitors || []).find(c => (c.username || '').replace(/^@+/, '') === cleanName);
                if (updated) {
                  this.activeCreator = updated;
                }
                await this.fetchCreatorBoards(this.activeCreator);
              }
              this.showToast('Profile @' + cleanName + ' synced successfully!');
            } else {
              const errData = await res.json().catch(() => ({}));
              this.showToast('Failed to sync: ' + (errData?.error || res.statusText || 'Error'));
            }
          } catch (e) {
            this.showToast('Failed to sync: ' + e.message);
          }
        },

        async syncAllCompetitors() {
          if (!this.competitors || this.competitors.length === 0) return;
          this.isLoading = true;
          this.showToast('Starting full sync for ' + this.competitors.length + ' profiles...');
          let syncedCount = 0;
          let failedCount = 0;
          let pausedByRateLimit = false;
          try {
            for (let i = 0; i < this.competitors.length; i++) {
              const c = this.competitors[i];
              this.showToast('Syncing (' + (i + 1) + '/' + this.competitors.length + '): @' + c.username + '...');
              try {
                const res = await window.apiFetch(this.getApiUrl('/api/creators/sync'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ username: c.username })
                });
                if (res.status === 429 || res.status === 503) {
                  pausedByRateLimit = true;
                  this.showToast('⚠️ Rate limit (429) or circuit breaker tripped. Pausing batch sync to protect account.');
                  break;
                }
                if (res.ok) {
                  syncedCount++;
                } else {
                  failedCount++;
                  console.warn('[syncAllCompetitors] Non-OK status ' + res.status + ' for @' + c.username);
                }
              } catch (fetchErr) {
                failedCount++;
                console.warn('[syncAllCompetitors] Sync failed for @' + c.username, fetchErr);
              }
              if (i < this.competitors.length - 1) {
                const delay = 2500 + Math.floor(Math.random() * 1500);
                await new Promise(r => setTimeout(r, delay));
              }
            }
            await this.fetchCompetitors();
            if (!pausedByRateLimit) {
              if (failedCount === 0 && syncedCount > 0) {
                this.showToast('All competitor profiles updated successfully!');
              } else if (syncedCount > 0) {
                this.showToast('Synced ' + syncedCount + ' profiles (' + failedCount + ' failed).');
              } else {
                this.showToast('Failed to sync competitor profiles (' + failedCount + ' errors).');
              }
            }
          } finally {
            this.isLoading = false;
          }
        },

        async deleteCompetitor(id) {
          const confirmed = await window.PAE.confirm('Are you sure you want to stop tracking this creator?', {
            title: 'Remove Tracked Creator',
            confirmLabel: 'Remove Creator',
            danger: true
          });
          if (!confirmed) return;
          const previousCompetitors = [...(this.competitors || [])];
          // Optimistically remove from UI
          this.competitors = this.competitors.filter(c => Number(c.id) !== Number(id));
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators?id=' + id), { method: 'DELETE' });
            if (res.ok) {
              if (this.activeCreator && Number(this.activeCreator.id) === Number(id)) {
                this.closeCreatorProfile();
              }
              await this.fetchCompetitors(true);
              this.showToast('Competitor removed.');
            } else {
              this.competitors = previousCompetitors;
              const err = await res.json().catch(() => ({}));
              const msg = err.error || err.message || (res.status === 503 ? 'Auth not configured (503)' : res.status === 401 ? 'Unauthorized (401)' : ('HTTP ' + res.status));
              this.showToast('Failed to delete competitor: ' + msg);
            }
          } catch (e) {
            this.competitors = previousCompetitors;
            this.showToast('Error deleting competitor: ' + (e.message || 'Network error'));
          } finally {
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async assignCreatorToFolder(competitorId, folderId) {
          if (!competitorId || !folderId) return;
          const fid = String(folderId);
          const rawId = String(competitorId).trim();
          const isNumeric = /^\\d+$/.test(rawId);
          const cid = isNumeric ? Number(rawId) : rawId;
          const cleanUsername = isNumeric ? null : rawId.replace(/^serp_/, '').replace(/^@+/, '').trim();
          const isAlreadyIn = this.isCreatorInFolder(cid, fid) || (cleanUsername && this.isCreatorInFolder(cleanUsername, fid));
          const method = isAlreadyIn ? 'DELETE' : 'POST';
          const url = isAlreadyIn 
            ? '/api/folders/' + encodeURIComponent(fid) + '/creators/' + encodeURIComponent(isNumeric ? cid : cleanUsername)
            : '/api/folders/' + encodeURIComponent(fid) + '/creators';
          const requestBody = isAlreadyIn
            ? undefined
            : JSON.stringify(isNumeric ? { competitor_id: cid } : { username: cleanUsername });
          try {
            const res = await (window.safeApiFetch || fetch)(url, {
              method,
              headers: { 'Content-Type': 'application/json' },
              body: requestBody
            });
            if (res.ok) {
              if (!this.folderCreatorMap[fid]) this.folderCreatorMap[fid] = new Set();
              if (isAlreadyIn) {
                this.folderCreatorMap[fid].delete(cid);
                if (cleanUsername) this.folderCreatorMap[fid].delete(cleanUsername);
                this.showToast('Creator unlinked from folder');
              } else {
                this.folderCreatorMap[fid].add(cid);
                if (cleanUsername) this.folderCreatorMap[fid].add(cleanUsername);
                this.showToast('Creator linked to folder');
              }
              const folderObj = this.foldersList.find(f => String(f.id) === fid);
              if (folderObj) {
                folderObj.creator_count = this.folderCreatorMap[fid].size;
              }
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast(err.message || 'Failed to update folder assignment');
            }
          } catch (e) {
            this.showToast('Network error: ' + e.message);
          }
        },

        isCreatorInFolder(competitorId, folderId) {
          const fid = String(folderId || this.folderFilter || this.scopedFolderId || '');
          if (!fid || !this.folderCreatorMap[fid]) return false;
          return this.folderCreatorMap[fid].has(Number(competitorId)) || this.folderCreatorMap[fid].has(String(competitorId));
        },

        async loadFolderCreators(folderId) {
          if (!folderId) return;
          const fid = String(folderId);
          const reqSeq = ++this._creatorsReqSeq;
          const inflightKey = fid + ':' + (this.vaultScope || 'high_signal');
          if (this._loadingFolderCreatorsKey === inflightKey && this._loadingFolderCreatorsPromise) {
            return this._loadingFolderCreatorsPromise;
          }
          this._loadingFolderCreatorsKey = inflightKey;
          const signal = typeof this._nextAbortSignal === 'function' ? this._nextAbortSignal('competitors') : undefined;
          this._loadingFolderCreatorsPromise = (async () => {
            try {
              const scopeParam = this.vaultScope ? ('&vault_scope=' + encodeURIComponent(this.vaultScope)) : '';
              const res = await (window.safeApiFetch || fetch)(
                '/api/folders/' + encodeURIComponent(fid) + '/creators?discovery=true' + scopeParam,
                signal ? { signal } : {}
              );
              if (reqSeq !== this._creatorsReqSeq || (signal && signal.aborted)) return;
              if (res.ok) {
                const data = await res.json();
                if (reqSeq !== this._creatorsReqSeq) return;
                const linkedList = Array.isArray(data.linked_creators) ? data.linked_creators : [];
                const discoveredList = Array.isArray(data.discovered_creators) ? data.discovered_creators : [];
                const allList = Array.isArray(data.creators) ? data.creators : [...linkedList, ...discoveredList];

                const linkedIds = new Set(
                  (linkedList.length > 0 ? linkedList : allList.filter(c => c.is_linked))
                    .map(c => Number(c.competitor_id || c.id))
                    .filter(Boolean)
                );
                this.folderCreatorMap[fid] = linkedIds;

                if ((this.scopedFolderId && String(this.scopedFolderId) === fid) || (this.folderFilter && String(this.folderFilter) === fid)) {
                  this.scopedFolderCreatorIds = linkedIds;
                  this.folderCompetitorTotalsData = data.totals || null;
                  this.competitors = allList;
                  this._competitorsCacheKey = '';
                  this._cachedFilteredCompetitors = null;
                  if (this.activeFolder) {
                    this.activeFolder.discovered_creator_count = allList.length;
                    this.activeFolder.creator_count = allList.length;
                  }
                  const folderInList = (this.foldersList || []).find(f => String(f.id) === fid);
                  if (folderInList) {
                    folderInList.discovered_creator_count = allList.length;
                    folderInList.creator_count = allList.length;
                  }
                }
              }
            } catch (_) {
            } finally {
              if (this._loadingFolderCreatorsKey === inflightKey) {
                this._loadingFolderCreatorsKey = null;
                this._loadingFolderCreatorsPromise = null;
              }
              if (reqSeq === this._creatorsReqSeq) {
                this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
              }
            }
          })();
          return this._loadingFolderCreatorsPromise;
        },

        async setVaultScope(scope) {
          if (this.vaultScope === scope) return;
          this.vaultScope = scope;
          const fid = this.scopedFolderId || this.folderFilter;
          if (fid) {
            await this.loadFolderCreators(fid);
          }
        },

        async bulkPulseTrackSerpCreators() {
          if (!this.scopedFolderId) return;
          this.isBulkPulseTracking = true;
          try {
            const body = {
              custom_label: (this.bulkPulseCustomLabel || '').trim() || undefined,
              tracking_mode: 'pulse_only',
              sync_now: true
            };
            const res = await (window.safeApiFetch || fetch)('/api/folders/' + encodeURIComponent(this.scopedFolderId) + '/creators/bulk-pulse-track', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(body)
            });
            if (res.ok) {
              const data = await res.json();
              this.showToast('⚡ Auto-tracked ' + (data.tracked_count || 0) + ' creators with 24h lightweight pulse!', 'success');
              await this.loadFolderCreators(this.scopedFolderId);
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to auto-track creators: ' + (err.error || res.statusText), 'error');
            }
          } catch (e) {
            this.showToast('Network error: ' + (e.message || 'Unknown error'), 'error');
          } finally {
            this.isBulkPulseTracking = false;
          }
        },

        async loadFolders() {
          try {
            const res = await (window.safeApiFetch || fetch)('/api/folders');
            if (res.ok) {
              const data = await res.json();
              this.foldersList = data.folders || [];
              if (this.scopedFolderId) {
                const matched = this.foldersList.find(f => String(f.id) === String(this.scopedFolderId)) || null;
                if (matched) {
                  this.activeFolder = this.activeFolder ? { ...matched, ...this.activeFolder } : { ...matched };
                  if (Array.isArray(this.competitors) && this.competitors.length > 0) {
                    this.activeFolder.discovered_creator_count = this.competitors.length;
                    this.activeFolder.creator_count = this.competitors.length;
                    matched.discovered_creator_count = this.competitors.length;
                  }
                }
                this.$nextTick(() => {
                  this.folderFilter = String(this.scopedFolderId);
                });
              }
            }
          } catch (_) {}
        },

        async onFolderFilterChange() {
          this.competitorPage = 1;
          this.selectedCompetitorIds = [];
          this._competitorsCacheKey = '';
          if (this.folderFilter) {
            await this.loadFolderCreators(this.folderFilter);
          } else {
            this.folderCompetitorTotalsData = null;
            await this.fetchCompetitors(true);
          }
        },

        exportCompetitorsCsv() {
          const headers = ['Profile', 'Total audience', 'Impressions', 'Total Pins', 'Boards', 'Activity'];
          const lines = [
            headers.map(h => this.sanitizeCsvCell(h)).join(',')
          ];
          for (const c of this.filteredCompetitors) {
            lines.push([
              this.sanitizeCsvCell('@' + (c.username || '')),
              this.sanitizeCsvCell(c.monthly_reach != null ? c.monthly_reach : 0),
              this.sanitizeCsvCell(c.profile_views != null ? c.profile_views : 0),
              this.sanitizeCsvCell(c.total_pins != null ? c.total_pins : 0),
              this.sanitizeCsvCell(c.total_boards != null ? c.total_boards : 0),
              this.sanitizeCsvCell(c.activity_status || '1d ago')
            ].join(','));
          }
          const blob = new Blob([lines.join(String.fromCharCode(10))], { type: 'text/csv;charset=utf-8;' });
          const url = URL.createObjectURL(blob);
          const link = document.createElement('a');
          link.setAttribute('href', url);
          link.setAttribute('download', 'pinterest_competitors_' + new Date().toISOString().slice(0, 10) + '.csv');
          document.body.appendChild(link);
          link.click();
          document.body.removeChild(link);
          URL.revokeObjectURL(url);
        },

        toggleSelectCompetitor(id) {
          if (id === undefined || id === null) return;
          const numId = Number(id);
          const idx = this.selectedCompetitorIds.indexOf(numId);
          if (idx >= 0) {
            this.selectedCompetitorIds.splice(idx, 1);
          } else {
            this.selectedCompetitorIds.push(numId);
          }
        },

        get isAllCompetitorsSelected() {
          if (!this.filteredCompetitors || this.filteredCompetitors.length === 0 || this.selectedCompetitorIds.length === 0) return false;
          const selectedSet = new Set(this.selectedCompetitorIds);
          return this.filteredCompetitors.every(c => selectedSet.has(Number(c.id)));
        },

        toggleSelectAllCompetitors() {
          if (!this.filteredCompetitors || this.filteredCompetitors.length === 0) return;
          const filteredIds = this.filteredCompetitors.map(c => Number(c.id));
          const allSelected = filteredIds.every(id => this.selectedCompetitorIds.includes(id));
          if (allSelected) {
            this.selectedCompetitorIds = this.selectedCompetitorIds.filter(id => !filteredIds.includes(id));
          } else {
            const set = new Set([...this.selectedCompetitorIds, ...filteredIds]);
            this.selectedCompetitorIds = Array.from(set);
          }
        },

        clearSelectedCompetitors() {
          this.selectedCompetitorIds = [];
        },

        async quickPulseCreatorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.pulsingCreatorId = compId;
          this.showToast('⚡ Quick Pulsing @' + username + ' (syncing impressions, total audience & boards)...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/quick-pulse'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('⚡ Quick Pulse complete for @' + username + '!');
              this._clientCache?.boards?.clear();
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                this._clientCache?.creators?.delete(username.toLowerCase());
                await this.openCreatorDossier(this.activeCreator);
              }
            } else {
              this.showToast('❌ Quick pulse failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Quick pulse network error: ' + e.message);
          } finally {
            this.pulsingCreatorId = null;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async deepHarvestCreatorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.harvestingCreatorId = compId;
          this.showToast('🌊 Deep Harvesting @' + username + ' (profile sync + pin refresh & qualification)...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/deep-harvest'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const promoted = data.qualified_promotions ?? data.promoted_count ?? data.qualified_count ?? 0;
              this.showToast('🌊 Deep Harvest complete for @' + username + ' (' + promoted + ' pins qualified into PinArchive)!');
              this._clientCache?.boards?.clear();
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                this._clientCache?.creators?.delete(username.toLowerCase());
                await this.openCreatorDossier(this.activeCreator);
              }
            } else {
              this.showToast('❌ Deep harvest failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Deep harvest network error: ' + e.message);
          } finally {
            this.harvestingCreatorId = null;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async fastRefreshCompetitorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.fastRefreshingCompetitorId = compId;
          this.showToast('⚡ Fast refreshing archived pins for @' + username + ' directly from Pinterest...');
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/fast-refresh'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const refreshed = data.refreshed_count ?? data.refreshed_pins_count ?? data.total_refreshed ?? 0;
              this.showToast('⚡ Fast refresh complete for @' + username + ': ' + refreshed + ' archived pins updated with live metrics!');
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                await this.fetchCreatorPins(this.activeCreator);
                await this.fetchCreatorAllPins();
              }
            } else {
              this.showToast('❌ Fast refresh failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Fast refresh network error: ' + e.message);
          } finally {
            this.fastRefreshingCompetitorId = null;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async discoverFullCatalogAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.discoveringCatalogCompetitorId = compId;
          this.showToast('📋 Starting Full Catalog Discovery for @' + username + ' (crawling all pages to end of feed)...');
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/sync-pins'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_id: compId,
                username,
                mode: 'all',
                max_pages: 100
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const fetched = data.total_fetched ?? data.crawled ?? data.pinsFetched ?? 0;
              const qualified = data.qualified ?? data.qualified_archived ?? data.qualifiedIngested ?? 0;
              const pages = data.pages_crawled ?? data.pagesCrawled ?? 0;
              this.showToast('📋 Full Catalog Discovered: ' + fetched + ' pins retrieved across ' + pages + ' pages (' + qualified + ' qualified into PinArchive)!');
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                await this.fetchCreatorAllPins();
                await this.fetchCreatorPins(this.activeCreator);
                await this.fetchCreatorBoards(this.activeCreator);
              }
            } else {
              this.showToast('❌ Discover catalog failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Discover catalog network error: ' + e.message);
          } finally {
            this.discoveringCatalogCompetitorId = null;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async auditSweepCompetitorAction(competitor) {
          if (!competitor) return;
          const compId = competitor.id;
          const username = (competitor.username || '').replace(/^@+/, '').trim();
          this.auditSweepingCompetitorId = compId;
          this.showToast('🏛️ Starting Comprehensive Audit Sweep for @' + username + '...');
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/audit-sweep'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, username })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              const s = data.stats || data;
              const pinsAudited = s.total_pins_inventory ?? s.total_pins_audited ?? 0;
              const boardsSynced = s.boards_synced ?? 0;
              const dipsHealed = s.monotonic_dips_healed ?? 0;
              this.showToast('🏛️ Audit Sweep Complete for @' + username + '! ' + pinsAudited + ' pins audited, ' + boardsSynced + ' boards synced, ' + dipsHealed + ' metric dips healed.');
              await this.fetchCompetitors();
              if (this.activeCreator && (this.activeCreator.id === compId || (this.activeCreator.username || '').replace(/^@+/, '') === username)) {
                await this.fetchCreatorProfile(this.activeCreator);
                await this.fetchCreatorPins(this.activeCreator);
                await this.fetchCreatorAllPins();
                await this.fetchCreatorBoards(this.activeCreator);
                await this.fetchCreatorTopUrls();
              }
            } else {
              this.showToast('❌ Audit sweep failed: ' + (data?.error || res.statusText || 'Server error'));
            }
          } catch (e) {
            this.showToast('❌ Audit sweep network error: ' + e.message);
          } finally {
            this.auditSweepingCompetitorId = null;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async bulkPulseSelected() {
          if (!this.selectedCompetitorIds.length) return;
          const count = this.selectedCompetitorIds.length;
          this.showToast('⚡ Bulk Pulsing ' + count + ' creators (syncing impressions & audience)...');
          let successCount = 0;
          let failedCount = 0;
          for (let i = 0; i < count; i++) {
            const cid = this.selectedCompetitorIds[i];
            const comp = (this.competitors || []).find(c => Number(c.id) === Number(cid));
            if (!comp) continue;
            try {
              const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/quick-pulse'), {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: cid })
              });
              if (res && res.ok) {
                successCount++;
              } else {
                failedCount++;
              }
            } catch (_) {
              failedCount++;
            }
          }
          if (failedCount === 0 && successCount > 0) {
            this.showToast('✓ Bulk Pulse complete (' + successCount + '/' + count + ' creators updated)!');
          } else if (successCount > 0) {
            this.showToast('⚠️ Bulk Pulse partially completed (' + successCount + '/' + count + ' updated, ' + failedCount + ' failed).');
          } else {
            this.showToast('❌ Bulk Pulse failed for all ' + count + ' selected creators.');
          }
          this._clientCache?.creators?.clear();
          this._clientCache?.boards?.clear();
          await this.fetchCompetitors();
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },

        async bulkRefreshWinnersSelected() {
          if (!this.selectedCompetitorIds.length) return;
          const usernames = this.selectedCompetitorIds.map(id => {
            const comp = (this.competitors || []).find(c => Number(c.id) === Number(id));
            return comp?.username ? comp.username.replace(/^@+/, '').trim() : null;
          }).filter(Boolean);
          if (!usernames.length) return;
          this.showToast('🏆 Dispatching winning pins refresh for ' + usernames.length + ' creators on GitHub Actions...');
          this._clientCache?.boards?.clear();
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                usernames,
                crawl_mode: 'refresh',
                max_pages: 10
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this.showToast('🚀 ' + (data?.message || 'Winning pins refresh dispatched on GitHub Actions!'));
            } else {
              this.showToast('❌ Bulk dispatch failed: ' + (data?.error || res.statusText));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        bulkOpenFleetCrawlModal() {
          if (!this.selectedCompetitorIds.length) return;
          const firstComp = (this.competitors || []).find(c => Number(c.id) === Number(this.selectedCompetitorIds[0]));
          this.openGhaCrawlerModal(firstComp || { username: this.selectedCompetitorIds.length + ' Selected Creators' });
        },

        async dispatchRefreshWinnersAction(creator) {
          const target = creator || this.activeCreator;
          if (!target) return;
          const handle = (target.username || '').replace(/^@+/, '').trim();
          if (!handle) return;
          this.showToast('🏆 Dispatching winning pins refresh for @' + handle + ' on GitHub Actions...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                crawl_mode: 'refresh',
                max_pages: 10
              })
            });
            const data = await res.json().catch(() => ({}));
            if (res.ok && data?.success) {
              this._clientCache?.boards?.clear();
              this.showToast('🚀 Winning pins refresh launched on GitHub Actions for @' + handle + '!');
            } else {
              this.showToast('❌ Dispatch failed: ' + (data?.error || res.statusText || 'Check GitHub token'));
            }
          } catch (err) {
            this.showToast('❌ Network error: ' + err.message);
          } finally {
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async bulkDeleteSelectedCompetitors() {
          if (!this.selectedCompetitorIds.length) return;
          const count = this.selectedCompetitorIds.length;
          const confirmed = await window.PAE.confirm('Are you sure you want to stop tracking ' + count + ' selected creators?', {
            title: 'Remove Selected Creators',
            confirmLabel: 'Remove ' + count + ' Creators',
            danger: true
          });
          if (!confirmed) return;
          const previousCompetitors = [...(this.competitors || [])];
          const toDelete = new Set(this.selectedCompetitorIds.map(Number));
          this.competitors = this.competitors.filter(c => !toDelete.has(Number(c.id)));
          const idsToDelete = [...this.selectedCompetitorIds];
          this.selectedCompetitorIds = [];

          let failedCount = 0;
          let lastErrorMessage = '';
          try {
            for (const cid of idsToDelete) {
              try {
                const res = await window.apiFetch(this.getApiUrl('/api/creators?id=' + cid), { method: 'DELETE' });
                if (!res.ok) {
                  failedCount++;
                  const err = await res.json().catch(() => ({}));
                  lastErrorMessage = err.error || err.message || (res.status === 503 ? 'Auth not configured (503)' : res.status === 401 ? 'Unauthorized (401)' : ('HTTP ' + res.status));
                }
              } catch (delErr) {
                failedCount++;
                lastErrorMessage = delErr.message;
              }
            }
            await this.fetchCompetitors(true);
            if (failedCount === 0) {
              this.showToast('Removed ' + count + ' selected competitors.');
            } else if (failedCount === count) {
              this.competitors = previousCompetitors;
              this.showToast('Failed to delete competitors: ' + lastErrorMessage);
            } else {
              this.showToast('Removed ' + (count - failedCount) + ' competitors (' + failedCount + ' failed: ' + lastErrorMessage + ')');
            }
          } catch (e) {
            this.competitors = previousCompetitors;
            this.showToast('Error deleting competitors: ' + (e.message || 'Network error'));
          } finally {
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async bulkToggleSelectedStatus(activeStatus) {
          if (!this.selectedCompetitorIds.length) return;
          const selectedSet = new Set(this.selectedCompetitorIds.map(Number));
          const count = this.selectedCompetitorIds.length;
          const previousCompetitors = [...(this.competitors || [])];
          const previousActiveCreator = this.activeCreator ? { ...this.activeCreator } : null;

          // 1. Instant optimistic reactive update across array
          this.competitors = (this.competitors || []).map(comp => {
            if (selectedSet.has(Number(comp.id))) {
              return { ...comp, is_active: activeStatus };
            }
            return comp;
          });
          if (this.activeCreator && selectedSet.has(Number(this.activeCreator.id))) {
            this.activeCreator = { ...this.activeCreator, is_active: activeStatus };
          }

          // 2. Persist to backend and verify res.ok before displaying success feedback
          let updatedCount = 0;
          let failedCount = 0;
          let lastError = '';
          try {
            for (const cid of this.selectedCompetitorIds) {
              try {
                const res = await window.apiFetch(this.getApiUrl('/api/creators/status'), {
                  method: 'POST',
                  headers: { 'Content-Type': 'application/json' },
                  body: JSON.stringify({ id: cid, is_active: activeStatus })
                });
                if (res && res.ok) {
                  updatedCount++;
                } else {
                  failedCount++;
                  const err = await res?.json?.().catch(() => ({})) || {};
                  lastError = err.error || err.message || ('HTTP ' + (res?.status || 500));
                }
              } catch (reqErr) {
                failedCount++;
                lastError = reqErr.message || 'Network error';
              }
            }
            if (failedCount === 0) {
              this.showToast(activeStatus ? ('▶ Resumed ingestion for ' + updatedCount + ' profiles.') : ('⏸ Paused ingestion for ' + updatedCount + ' profiles.'));
            } else if (updatedCount > 0) {
              this.showToast('Updated ' + updatedCount + '/' + count + ' profiles (' + failedCount + ' failed: ' + lastError + ')');
            } else {
              this.competitors = previousCompetitors;
              if (previousActiveCreator) this.activeCreator = previousActiveCreator;
              this.showToast('Failed to update status for selected profiles: ' + (lastError || 'Request rejected'));
            }
            await this.fetchCompetitors();
          } catch (e) {
            this.competitors = previousCompetitors;
            if (previousActiveCreator) this.activeCreator = previousActiveCreator;
            console.error('bulkToggleSelectedStatus error:', e);
            this.showToast('Error updating profile status: ' + (e.message || 'Network error'));
          }
        },

        openBoardsModal(competitor) {
          if (!competitor) return;
          this.openCreatorDossier(competitor, 'boards');
        },

        async syncCompetitorBoardsAction(competitor) {
          if (!competitor) return;
          this.isSyncingBoards = true;
          this.showToast('Syncing boards for @' + competitor.username + ' from Pinterest...');
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/sync-boards'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: competitor.id, username: competitor.username })
            });
            if (res.ok) {
              this._clientCache?.boards?.clear();
              const data = await res.json();
              this.showToast('✅ Synced ' + (data.synced_boards_count ?? data.synced ?? 0) + ' boards for @' + competitor.username);
              if (typeof this.fetchCreatorBoards === 'function') {
                await this.fetchCreatorBoards(competitor, true);
              }
              await this.fetchCompetitors();
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to sync boards: ' + (err.error || err.message || ('HTTP ' + res.status)));
            }
          } catch (e) {
            this.showToast('Sync boards error: ' + e.message);
          } finally {
            this.isSyncingBoards = false;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },`;
}

export function getDashboardCreatorsDossierMethods() {
  return `        openAddCompetitorModal() {
          this.newCompetitorHandle = '';
          this.newCompetitorAlsoTrack = true;
          this.newCompetitorDiscoverPins = true;
          this.newCompetitorDiscoverMode = 'deep';
          this.newCompetitorMaxPages = 500;
          this.newCompetitorAutoArchiveWinning = true;
          this.newCompetitorInterval = 'daily';
          this.isAddCompetitorModalOpen = true;
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },

        formatSnapshotDate(dateStr) {
          if (!dateStr) return '—';
          const d = new Date(dateStr);
          if (isNaN(d.getTime())) return '—';
          const datePart = d.toLocaleDateString('en-US', {
            month: 'short',
            day: 'numeric',
            year: 'numeric'
          });
          const hours = String(d.getHours()).padStart(2, '0');
          const mins = String(d.getMinutes()).padStart(2, '0');
          return datePart + ', ' + hours + ':' + mins;
        },

        async deleteSnapshotAction(snapshotId) {
          const confirmed = await window.PAE.confirm('Are you sure you want to delete this snapshot?', {
            title: 'Delete Snapshot',
            confirmLabel: 'Delete Snapshot',
            danger: true
          });
          if (!confirmed) return;
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/snapshot?id=' + snapshotId), { method: 'DELETE' });
            if (!res.ok) {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to delete snapshot: ' + (err.error || err.message || ('HTTP ' + res.status)));
              return;
            }
            this.activeCreatorSnapshots = this.activeCreatorSnapshots.filter(s => String(s.id) !== String(snapshotId));
            this.showToast('Snapshot deleted successfully.');
          } catch (e) {
            console.error('Delete snapshot error:', e);
            this.showToast('Failed to delete snapshot: ' + (e.message || 'Network error'));
          }
        },

        async openCreatorPage(creator, tab = 'overview', updateHistory = true) {
          if (!creator) return;
          this.activeCreator = creator;
          this.activeCreatorTab = tab || 'overview';
          this.currentTab = 'creators_archive';
          this.creatorAllPinsLimit = 100;
          this.activePinId = null;
          this.activePinDossier = null;
          this.isCreatorDossierOpen = false;
          this.isBoardsModalOpen = false;
          this.creatorTimeRange = '7D';
          this.creatorSelectedMonth = 'all';
          this.creatorMoMMode = false;
          this.creatorChartMode = 'reach';
          this.creatorPinSearch = '';
          this.creatorPinBoard = '';
          this.creatorPinStage = '';
          this.creatorPinSavesFilter = '';
          this.creatorPinSort = 'delta_saves';
          this.creatorPinChangedOnly = false;
          this.creatorPinPage = 1;
          this.creatorSnapPage = 1;
          this.creatorBoardPage = 1;
          this.activeCreatorSelectedTopic = '';
          this.creatorTopicSearch = '';
          // Reset active Master Pin Ledger & Top URL filters to prevent cross-account filter leak
          this.creatorAllPinSearch = '';
          this.creatorAllPinBoard = '';
          this.creatorAllPinMinSaves = 0;
          this.creatorAllPinSort = 'saves_desc';
          this.creatorAllPinQualifiedOnly = (tab === 'pins' || tab === 'winning-pins');
          this.creatorAllPinArticlesOnly = false;
          this.creatorAllPinRankedOnly = false;
          this.creatorAllPinStage = '';
          this.creatorAllPinHighVelocity = false;
          this.creatorAllPinChangedOnly = false;
          this.creatorAllPinScope = 'official';
          this.activeCreatorAllPinsPage = 1;
          this.creatorTopUrlSearch = '';
          this.creatorTopUrlFilterType = 'all';
          this.creatorTopUrlScope = 'ecosystem';
          this.creatorTopUrlsPage = 1;

          const handle = (creator.username || '').replace(/^@+/, '').trim().toLowerCase();
          const compId = creator.id || handle;

          // Check SWR In-Memory Cache for Instant Render (0ms)
          const cachedCreator = this._clientCache?.creators?.get(handle);
          if (cachedCreator) {
            this.activeCreator = { ...creator, ...(cachedCreator.detail?.profile || {}) };
            this.activeCreatorDetail = cachedCreator.detail;
            this.activeCreatorSnapshots = cachedCreator.detail?.snapshots || [];
            this.activeCreatorBoards = cachedCreator.detail?.boards || [];
            this.activeCreatorPins = cachedCreator.pins || [];
            this.activeCreatorWinningPinsTotal = cachedCreator.winningPinsTotal || (cachedCreator.pins ? cachedCreator.pins.length : 0);
            this.activeCreatorTopics = cachedCreator.topics || [];
            this.isCreatorLoading = false;
          } else {
            this.activeCreator = { ...creator };
            this.activeCreatorPins = [];
            this.activeCreatorAllPins = [];
            this.activeCreatorAllPinsTotal = 0;
            this.activeCreatorCatalogTotal = 0;
            this.activeCreatorCuratorPinsTotal = 0;
            this.activeCreatorEcosystemTotal = 0;
            this.activeCreatorWinningPinsTotal = 0;
            this.activeCreatorRankedTotal = 0;
            this.activeCreatorHighVelocityTotal = 0;
            this.activeCreatorAllPinsBoards = [];
            this.activeCreatorTopics = [];
            this.activeCreatorBoards = [];
            this.activeCreatorSnapshots = [];
            this.activeCreatorDetail = null;
            this.isCreatorLoading = true;
          }

          if (typeof window !== 'undefined') {
            window.scrollTo({ top: 0, behavior: 'smooth' });
          }
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });

          if (updateHistory && typeof window !== 'undefined' && handle) {
            let targetPath = '/' + handle;
            if (this.activeCreatorTab === 'top_urls' || this.activeCreatorTab === 'links') targetPath = '/' + handle + '/links';
            else if (this.activeCreatorTab === 'related_pins') targetPath = '/' + handle + '/related-pins';
            else if (this.activeCreatorTab === 'all_pins') targetPath = '/' + handle + '/all-pins';
            else if (this.activeCreatorTab === 'pins') targetPath = '/' + handle + '/winning-pins';
            else if (this.activeCreatorTab === 'boards') targetPath = '/' + handle + '/boards';
            if (window.location.pathname !== targetPath) {
              window.history.pushState({ creator: handle, tab: this.activeCreatorTab }, '', targetPath);
            }
          }

          if (typeof this._abortSlots === 'function') {
            this._abortSlots('creator_detail', 'creator_pins', 'creator_urls', 'creator_related', 'creator_boards');
          }
          const detailSignal = typeof this._nextAbortSignal === 'function' ? this._nextAbortSignal('creator_detail') : undefined;
          try {
            const detailRes = await window.apiFetch(
              this.getApiUrl('/api/creators/detail?username=' + encodeURIComponent(handle) + '&id=' + encodeURIComponent(compId)),
              detailSignal ? { signal: detailSignal } : {}
            );
            if (detailSignal && detailSignal.aborted) return;

            let freshDetail = null;

            if (detailRes.ok) {
              freshDetail = await detailRes.json();
              if (detailSignal && detailSignal.aborted) return;
              this.activeCreatorDetail = freshDetail;
              this.activeCreatorSnapshots = freshDetail.snapshots || [];
              this.activeCreatorBoards = freshDetail.boards || [];
              if (Array.isArray(freshDetail.boards) && this._clientCache?.boards) {
                const boardCacheKey = String(freshDetail.profile?.id || compId) + ':' + handle;
                this._clientCache.boards.set(boardCacheKey, freshDetail.boards);
              }
              if (freshDetail.profile) {
                this.activeCreator = { ...this.activeCreator, ...freshDetail.profile };
              }
            } else {
              // Untracked creator / 404
              this.closeCreatorProfile(true);
              this.currentTab = 'creators_archive';
              if (typeof window !== 'undefined') {
                window.history.replaceState({}, '', '/accounts');
              }
              this.showToast('⚠️ Creator profile @' + handle + ' is not tracked.');
              return;
            }

            // Save to SWR In-Memory Cache
            if (this._clientCache?.creators) {
              this._clientCache.creators.set(handle, {
                detail: freshDetail || cachedCreator?.detail,
                cachedAt: Date.now()
              });
            }

            const initialFetches = [
              this.fetchCreatorAllPins(),
              this.fetchCreatorRules()
            ];
            if (this.activeCreatorTab === 'top_urls' || this.activeCreatorTab === 'links') {
              initialFetches.push(this.fetchCreatorTopUrls());
            } else if (this.activeCreatorTab === 'related_pins') {
              initialFetches.push(this.fetchCreatorRelatedGraph());
            } else if (this.activeCreatorTab === 'boards' && !Array.isArray(freshDetail?.boards)) {
              initialFetches.push(this.fetchCreatorBoards());
            }
            await Promise.all(initialFetches);
          } catch (e) {
            if ((detailSignal && detailSignal.aborted) || (e && e.name === 'AbortError')) return;
            console.error('openCreatorPage error:', e);
          } finally {
            if (!detailSignal || !detailSignal.aborted) {
              this.isCreatorLoading = false;
              this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        switchCreatorTab(tab) {
          if (typeof this._abortSlots === 'function') {
            this._abortSlots('creator_pins', 'creator_urls', 'creator_related', 'creator_boards');
          }
          if (tab === 'pins') {
            this.activeCreatorTab = 'all_pins';
            this.creatorAllPinQualifiedOnly = true;
            tab = 'all_pins';
          } else if (tab === 'topics') {
            this.activeCreatorTab = 'all_pins';
            tab = 'all_pins';
          } else {
            this.activeCreatorTab = tab;
          }

          if (this.activeCreator) {
            const cleanU = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
            let targetPath = '/' + cleanU;
            if (tab === 'top_urls' || tab === 'links') targetPath = '/' + cleanU + '/links';
            else if (tab === 'related_pins') targetPath = '/' + cleanU + '/related-pins';
            else if (tab === 'all_pins') targetPath = '/' + cleanU + (this.creatorAllPinQualifiedOnly ? '/winning-pins' : '/all-pins');
            else if (tab === 'boards') targetPath = '/' + cleanU + '/boards';

            if (typeof window !== 'undefined' && window.location.pathname !== targetPath) {
              window.history.pushState({ creator: cleanU, tab: tab }, '', targetPath);
            }

            if (tab === 'related_pins') this.fetchCreatorRelatedGraph();
            else if (tab === 'top_urls') this.fetchCreatorTopUrls();
            else if (tab === 'all_pins') this.fetchCreatorAllPins();
            else if (tab === 'boards') this.fetchCreatorBoards(this.activeCreator, false);
          }
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
        },

        async fetchCreatorRelatedGraph() {
          if (!this.activeCreator) return;
          const signal = typeof this._nextAbortSignal === 'function' ? this._nextAbortSignal('creator_related') : undefined;
          this.isLoadingRelatedGraph = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            p.set('min_overlap', this.creatorRelatedMinOverlap || 2);
            p.set('page', this.creatorRelatedPage || 1);
            p.set('limit', this.creatorRelatedLimit || 25);
            p.set('filter', this.creatorRelatedFilter || 'all');
            if (this.creatorRelatedSearch) p.set('search', this.creatorRelatedSearch.trim());

            const fetchOpts = signal ? { signal } : {};
            const [interRes, seedsRes] = await Promise.all([
              window.apiFetch(this.getApiUrl('/api/creators/related-pins/intersections?' + p.toString()), fetchOpts),
              window.apiFetch(this.getApiUrl('/api/creators/related-pins/seeds?id=' + encodeURIComponent(compId)), fetchOpts)
            ]);
            if (signal && signal.aborted) return;

            if (interRes.ok) {
              const data = await interRes.json();
              if (signal && signal.aborted) return;
              this.creatorRelatedIntersections = data.intersections || [];
              this.creatorRelatedStats = data.stats || this.creatorRelatedStats;
              this.creatorRelatedPage = data.page || 1;
              this.creatorRelatedTotalPages = data.total_pages || 1;
            }

            if (seedsRes.ok) {
              const sData = await seedsRes.json();
              if (signal && signal.aborted) return;
              this.creatorRelatedSeeds = sData.seeds || [];
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            console.error('fetchCreatorRelatedGraph error:', e);
            this.showToast('Error loading related pins graph');
          } finally {
            if (!signal || !signal.aborted) {
              this.isLoadingRelatedGraph = false;
              this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async addBulkSeedsAction() {
          if (!this.activeCreator || !this.bulkAddSeedsInput.trim()) return;
          this.isAddingSeeds = true;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const matches = this.bulkAddSeedsInput.match(/\\d{14,22}/g) || [];
            if (matches.length === 0) {
              this.showToast('No valid numeric Pin IDs found in input.');
              return;
            }
            const res = await window.apiFetch(this.getApiUrl('/api/creators/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: matches })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('✅ Registered ' + data.added_count + ' seeds for @' + (this.activeCreator.username || '').replace(/^@+/, '') + '!');
              this.bulkAddSeedsInput = '';
              this.isBulkAddSeedsModalOpen = false;
              await this.fetchCreatorRelatedGraph();
            } else {
              this.showToast('Failed to register seeds: ' + (data.error || data.message || 'Error'));
            }
          } catch (e) {
            console.error('addBulkSeedsAction error:', e);
            this.showToast('Error registering seeds: ' + e.message);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async autoAddTop10WinningSeedsAction() {
          if (!this.activeCreator) return;
          this.isAddingSeeds = true;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            let pins = this.activeCreatorPins || [];
            if (pins.length === 0) {
              const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
              const pinsRes = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/pins?account=@' + encodeURIComponent(handle) + '&limit=10'));
              if (pinsRes.ok) {
                const pData = await pinsRes.json();
                pins = pData.pins || [];
              }
            }
            const top10Ids = pins.slice(0, 10).map(p => p.pin_id || p.id).filter(Boolean);
            if (top10Ids.length === 0) {
              this.showToast('No winning pins found for this account yet.');
              return;
            }
            const res = await window.apiFetch(this.getApiUrl('/api/creators/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: top10Ids })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('🎯 Auto-added ' + data.added_count + ' top winning seeds!');
              await this.fetchCreatorRelatedGraph();
            }
          } catch (e) {
            console.error('autoAddTop10WinningSeedsAction error:', e);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async analyzeSelectedPinsAsRelated() {
          if (!this.activeCreator || this.selectedCreatorPinIds.length === 0) return;
          const compId = this.activeCreator.id || this.activeCreator.username;
          this.isAddingSeeds = true;
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/related-pins/seeds'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_ids: this.selectedCreatorPinIds })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('🕸️ Queued ' + data.added_count + ' selected pins for Related Graph analysis!');
              this.selectedCreatorPinIds = [];
              await this.openCreatorPage(this.activeCreator, 'related_pins');
            }
          } catch (e) {
            console.error('analyzeSelectedPinsAsRelated error:', e);
          } finally {
            this.isAddingSeeds = false;
          }
        },

        async deleteSeedAction(pinId) {
          const confirmed = await window.PAE.confirm('Delete Seed #' + pinId + ' and its discovered related nodes?', {
            title: 'Delete Seed',
            confirmLabel: 'Delete Seed',
            danger: true
          });
          if (!confirmed) return;
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const res = await window.apiFetch(this.getApiUrl('/api/creators/related-pins/seeds?id=' + encodeURIComponent(compId) + '&pin_id=' + encodeURIComponent(pinId)), {
              method: 'DELETE'
            });
            if (res.ok) {
              this.showToast('Seed #' + pinId + ' removed');
              await this.fetchCreatorRelatedGraph();
            }
          } catch (e) {
            console.error('deleteSeedAction error:', e);
          }
        },

        async harvestLiveSingleSeedAction(pinId) {
          if (!this.activeCreator) return;
          this.isHarvestingRelated = true;
          this.showToast('🔍 Scraping Pinterest Related Feed live for Seed #' + pinId + '...');
          try {
            const compId = this.activeCreator.id || this.activeCreator.username;
            const res = await window.apiFetch(this.getApiUrl('/api/creators/related-pins/harvest-live'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: compId, pin_id: pinId })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              this.showToast('✅ Discovered ' + data.discovered_count + ' related pins into unified graph!');
              await this.fetchCreatorRelatedGraph();
            } else {
              this.showToast('Live scrape failed: ' + (data.error || data.message || 'Unknown error'));
            }
          } catch (e) {
            console.error('harvestLiveSingleSeedAction error:', e);
            this.showToast('Error during live harvest: ' + e.message);
          } finally {
            this.isHarvestingRelated = false;
          }
        },

        async dispatchRelatedWorkflowAction() {
          if (!this.activeCreator) return;
          const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
          const confirmed = await window.PAE.confirm(
            'Dispatch Related Pins Crawler (account_quick) on GitHub Actions for @' + handle + '? This will crawl all registered account seeds into the unified related-pins graph.',
            {
              title: 'Dispatch Related Pins Crawler',
              confirmLabel: 'Dispatch Crawler',
              danger: false
            }
          );
          if (!confirmed) return;
          this.isHarvestingRelated = true;
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/related-pins/dispatch-workflow'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                max_pages: '2'
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this.showToast('🚀 Dispatched Related Pins Crawler (account_quick) for @' + handle + '!');
            } else {
              this.showToast('Dispatch failed: ' + (data.error || data.message || 'Check GITHUB_TOKEN'));
            }
          } catch (e) {
            console.error('dispatchRelatedWorkflowAction error:', e);
            this.showToast('Error dispatching workflow: ' + e.message);
          } finally {
            this.isHarvestingRelated = false;
          }
        },

        async openCreatorDossier(creator, tab = 'overview') {
          return this.openCreatorPage(creator, tab);
        },

        async fetchCreatorAllPins() {
          if (!this.activeCreator) return;
          if (this._creatorAllPinsAbortController) {
            try { this._creatorAllPinsAbortController.abort(); } catch (_) {}
          }
          this._creatorAllPinsAbortController = new AbortController();
          this._creatorAllPinsReqSeq = (this._creatorAllPinsReqSeq || 0) + 1;
          const reqSeq = this._creatorAllPinsReqSeq;
          this.isLoadingAllPins = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            p.set('username', handle);
            if (this.creatorAllPinSearch) p.set('search', this.creatorAllPinSearch.trim());
            if (this.creatorAllPinBoard) p.set('board', this.creatorAllPinBoard.trim());
            if (this.creatorAllPinMinSaves > 0) p.set('min_saves', this.creatorAllPinMinSaves);
            if (this.creatorAllPinSort) p.set('sort', this.creatorAllPinSort);
            if (this.creatorAllPinQualifiedOnly) p.set('qualified_only', 'true');
            if (this.creatorAllPinArticlesOnly) p.set('articles_only', 'true');
            if (this.creatorAllPinRankedOnly) p.set('ranked_only', 'true');
            if (this.creatorAllPinStage) p.set('stage', this.creatorAllPinStage);
            if (this.creatorAllPinHighVelocity) p.set('high_velocity', 'true');
            if (this.creatorAllPinChangedOnly) p.set('changed_only', 'true');
            if (this.creatorAllPinScope) p.set('scope', this.creatorAllPinScope);
            p.set('page', this.activeCreatorAllPinsPage || 1);
            p.set('limit', 25);

            const res = await window.apiFetch(this.getApiUrl('/api/creators/all-pins?' + p.toString()), {
              signal: this._creatorAllPinsAbortController.signal
            });
            if (reqSeq !== this._creatorAllPinsReqSeq) return;
            if (res.ok) {
              const data = await res.json();
              if (reqSeq !== this._creatorAllPinsReqSeq) return;
              this.activeCreatorAllPins = data.pins || [];
              this.creatorAllPinsLimit = 100;
              this.activeCreatorAllPinsTotal = data.total || 0;
              this.activeCreatorCatalogTotal = data.catalog_total ?? data.total ?? 0;
              this.activeCreatorExternalPinsTotal = data.external_pins_total ?? 0;
              this.activeCreatorCuratorPinsTotal = data.curator_pins_total ?? 0;
              this.activeCreatorEcosystemTotal = data.ecosystem_catalog_total ?? ((data.catalog_total || 0) + (data.curator_pins_total || 0));
              this.activeCreatorWinningPinsTotal = data.qualified_total ?? 0;
              this.activeCreatorRankedTotal = data.ranked_total ?? 0;
              this.activeCreatorHighVelocityTotal = data.high_velocity_total ?? 0;
              this.activeCreatorAllPinsPage = data.page || 1;
              this.activeCreatorAllPinsTotalPages = data.total_pages || 1;
              if (data.boards) this.activeCreatorAllPinsBoards = data.boards;
            }
          } catch (e) {
            if (e.name === 'AbortError') return;
            console.error('fetchCreatorAllPins error:', e);
          } finally {
            if (reqSeq === this._creatorAllPinsReqSeq) {
              this.isLoadingAllPins = false;
              this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async openCreatorVisualFeed(username) {
          const cleanUser = String(username || '').replace(/^@+/, '').trim();
          if (!cleanUser) return;
          this.visualFeedUsername = cleanUser;
          this.visualFeedUser = { username: cleanUser };
          this.visualFeedPins = [];
          this.isVisualFeedLoading = true;
          this.isVisualFeedModalOpen = true;
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });

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
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async openBoardSectionsModal(boardId, boardTitle) {
          const cleanId = String(boardId || '').trim();
          if (!cleanId) return;
          this.boardSectionsBoardId = cleanId;
          this.boardSectionsTitle = boardTitle || 'Board Sections';
          this.boardSectionsList = [];
          this.isLoadingBoardSections = true;
          this.isBoardSectionsModalOpen = true;
          this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });

          try {
            const res = await (window.safeApiFetch || fetch)('/api/boards/' + encodeURIComponent(cleanId) + '/sections');
            if (res.ok) {
              const data = await res.json();
              if (data.ok) {
                this.boardSectionsList = data.sections || [];
              } else {
                this.showToast('Failed to fetch board sections: ' + (data.error || 'Unknown error'), 'error');
              }
            } else {
              this.showToast('Could not load board sections', 'error');
            }
          } catch (err) {
            this.showToast('Network error loading board sections: ' + err.message, 'error');
          } finally {
            this.isLoadingBoardSections = false;
            this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchCreatorRules() {
          if (!this.activeCreator?.id) return;
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/rules?id=' + this.activeCreator.id));
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                this.creatorRules = { ...this.creatorRules, ...data.rules };
              }
            }
          } catch (e) {
            console.error('fetchCreatorRules error:', e);
          }
        },

        async saveCreatorRulesAction() {
          if (!this.activeCreator?.id) return;
          this.isSavingCreatorRules = true;
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/rules'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                competitor_id: this.activeCreator.id,
                rules: this.creatorRules
              })
            });
            if (res.ok) {
              const cleanHandle = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
              this._clientCache?.creators?.delete(cleanHandle);
              this.showToast('✅ Qualification rules saved for @' + (this.activeCreator.username || '').replace(/^@+/, ''));
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to save rules: ' + (err.error || err.message || 'Error'));
            }
          } catch (e) {
            console.error('saveCreatorRules error:', e);
            this.showToast('Error saving rules: ' + e.message);
          } finally {
            this.isSavingCreatorRules = false;
          }
        },

        async reEvaluateCreatorPinsAction() {
          if (!this.activeCreator?.id) return;
          this.isReEvaluatingCreatorPins = true;
          this.reEvaluateMessage = '';
          try {
            const res = await window.apiFetch(this.getApiUrl('/api/creators/re-evaluate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ competitor_id: this.activeCreator.id })
            });
            const data = await res.json();
            if (res.ok && data.ok) {
              const prunedText = data.pruned_count ? (' (' + data.pruned_count + ' demoted)') : '';
              this.reEvaluateMessage = 'Qualified ' + data.qualified_count + ' pins into archive' + prunedText + ' based on active rules!';
              this.showToast('🎯 Re-evaluation complete: ' + data.qualified_count + ' qualified' + prunedText);
              const cleanHandle = (this.activeCreator.username || '').replace(/^@+/, '').trim().toLowerCase();
              this._clientCache?.creators?.delete(cleanHandle);
              await Promise.all([
                this.fetchCreatorAllPins(),
                typeof this.fetchCreatorWinningPins === 'function' ? this.fetchCreatorWinningPins(this.activeCreator) : Promise.resolve()
              ]);
            } else {
              this.showToast('Re-evaluation error: ' + (data.error || data.message || 'Failed'));
            }
          } catch (e) {
            console.error('reEvaluate error:', e);
            this.showToast('Failed to re-evaluate: ' + e.message);
          } finally {
            this.isReEvaluatingCreatorPins = false;
          }
        },

        async fetchCreatorTopUrls() {
          if (!this.activeCreator) return;
          const signal = typeof this._nextAbortSignal === 'function' ? this._nextAbortSignal('creator_urls') : undefined;
          this.isLoadingTopUrls = true;
          try {
            const handle = (this.activeCreator.username || '').replace(/^@+/, '').trim();
            const compId = this.activeCreator.id || handle;
            const p = new URLSearchParams();
            p.set('id', compId);
            if (this.creatorTopUrlSearch) p.set('search', this.creatorTopUrlSearch.trim());
            if (this.creatorTopUrlSort) p.set('sort', this.creatorTopUrlSort);
            if (this.creatorTopUrlFilterType) p.set('filter_type', this.creatorTopUrlFilterType);
            if (this.creatorTopUrlScope) p.set('scope', this.creatorTopUrlScope);
            p.set('page', this.creatorTopUrlsPage || 1);
            p.set('limit', 50);

            const res = await window.apiFetch(this.getApiUrl('/api/creators/top-urls?' + p.toString()), signal ? { signal } : {});
            if (signal && signal.aborted) return;
            if (res.ok) {
              const data = await res.json();
              if (signal && signal.aborted) return;
              this.activeCreatorTopUrls = data.urls || [];
              this.creatorTopUrlsTotal = data.total || 0;
              this.creatorTopUrlsPage = data.page || 1;
              this.creatorTopUrlsTotalPages = data.total_pages || 1;
            }
          } catch (e) {
            if ((signal && signal.aborted) || (e && e.name === 'AbortError')) return;
            console.error('fetchCreatorTopUrls error:', e);
          } finally {
            if (!signal || !signal.aborted) {
              this.isLoadingTopUrls = false;
              this.$nextTick(() => { if (typeof window !== 'undefined' && window.lucide) window.lucide.createIcons(); });
            }
          }
        },

        async harvestAllAccountPinsAction(creator) {
          return this.openGhaCrawlerModal(creator);
        },`;
}
