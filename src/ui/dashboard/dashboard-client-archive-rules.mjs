/**
 * src/ui/dashboard/dashboard-client-archive-rules.mjs
 *
 * Modular Client Subsystem: PinArchive Exploration,
 * Qualification Rules Management & Competitor Crawl Dispatch.
 * Extracted incrementally from dashboard-client-app.mjs (Phase 3 decomposition).
 */

export function getDashboardArchiveRulesMethods() {
  return `        async fetchPinArchiveOverview() {
          try {
            const res = await fetch(this.getApiUrl('/api/creators/archive-overview'));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveOverview = data.overview || data;
            } else {
              this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null };
            }
          } catch (e) {
            console.error('fetchPinArchiveOverview error:', e);
            this.pinarchiveOverview = { total_pins: 0, total_saves: 0, total_repins: 0, avg_velocity: 0, tracked_accounts: 0, top_cluster: null };
          }
        },

        async fetchPinArchiveTopics() {
          try {
            const search = encodeURIComponent(this.pinarchiveTopicSearch || '');
            const res = await fetch(this.getApiUrl('/api/creators/topics?search=' + search));
            if (res.ok) {
              const data = await res.json();
              this.pinarchiveTopics = data.topics || [];
            } else {
              this.pinarchiveTopics = [];
            }
          } catch (e) {
            console.error('fetchPinArchiveTopics error:', e);
            this.pinarchiveTopics = [];
          } finally {
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        async fetchPinArchivePins() {
          this.isLoadingPinArchive = true;
          try {
            const p = new URLSearchParams();
            if (this.pinarchiveSearch) p.set('search', this.pinarchiveSearch.trim());
            if (this.pinarchiveMinSaves) p.set('min_saves', this.pinarchiveMinSaves);
            if (this.pinarchiveSort) p.set('sort', this.pinarchiveSort);
            if (this.pinarchiveSelectedTopic) p.set('topic', this.pinarchiveSelectedTopic);
            if (this.pinarchiveSelectedAccount) p.set('account', this.pinarchiveSelectedAccount.trim());
            p.set('limit', '48');
            const res = await fetch(this.getApiUrl('/api/creators/pins?' + p.toString()));
            if (res.ok) {
              const data = await res.json();
              this.pinarchivePins = data.pins || [];
            } else {
              this.pinarchivePins = [];
            }
          } catch (e) {
            console.error('fetchPinArchivePins error:', e);
            this.pinarchivePins = [];
          } finally {
            this.isLoadingPinArchive = false;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },

        filterByTopic(topicName) {
          if (this.pinarchiveSelectedTopic === topicName) {
            this.pinarchiveSelectedTopic = '';
          } else {
            this.pinarchiveSelectedTopic = topicName;
          }
          this.fetchPinArchivePins();
        },

        async fetchQualificationRules() {
          try {
            const res = await fetch(this.getApiUrl('/api/creators/rules'));
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                const r = data.rules;
                const enabled = r.master_ingest_enabled !== undefined ? Boolean(r.master_ingest_enabled) : (r.cron_enabled !== undefined ? Boolean(r.cron_enabled) : true);
                this.qualificationRules = {
                  ...this.qualificationRules,
                  ...r,
                  master_ingest_enabled: enabled,
                  cron_enabled: enabled
                };
              }
            }
          } catch (e) {
            console.error('fetchQualificationRules error:', e);
          }
        },

        async saveQualificationRulesAction() {
          this.isSavingRules = true;
          try {
            const { id: _ignoredRuleId, ...globalRulesPayload } = this.qualificationRules || {};
            const payload = {
              ...globalRulesPayload,
              scope: 'global',
              master_ingest_enabled: Boolean(this.qualificationRules.cron_enabled)
            };
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/rules'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(payload)
            });
            if (res.ok) {
              const data = await res.json();
              if (data.rules) {
                const r = data.rules;
                const enabled = r.master_ingest_enabled !== undefined ? Boolean(r.master_ingest_enabled) : (r.cron_enabled !== undefined ? Boolean(r.cron_enabled) : true);
                this.qualificationRules = {
                  ...this.qualificationRules,
                  ...r,
                  master_ingest_enabled: enabled,
                  cron_enabled: enabled
                };
              }
              this.showToast('✅ Qualification rules updated successfully!');
            } else {
              const err = await res.json().catch(() => ({}));
              this.showToast('Failed to save rules: ' + (err.error || err.message || ('HTTP ' + res.status)));
            }
          } catch (e) {
            this.showToast('Error saving rules: ' + e.message);
          } finally {
            this.isSavingRules = false;
          }
        },

        async reEvaluateCandidatesAction() {
          if (!confirm('Re-evaluate all archived pins against current qualification rules? Non-qualifying pins may be pruned or deactivated.')) return;
          this.isReEvaluating = true;
          try {
            const { id: _ignoredRuleId, ...globalRulesPayload } = this.qualificationRules || {};
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/creators/re-evaluate'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ ...globalRulesPayload, scope: 'global' })
            });
            const data = await res.json();
            if (res.ok && data.total_evaluated !== undefined) {
              const evalTotal = data.total_evaluated ?? 0;
              const qualCount = data.qualified_count ?? 0;
              const disCount = data.disqualified_pruned ?? data.disqualified_count ?? 0;
              this.showToast('⚡ Evaluated ' + evalTotal + ' pins: ' + qualCount + ' qualified, ' + disCount + ' non-qualifying.');
              await this.fetchPinArchiveOverview();
              await this.fetchPinArchivePins();
            } else {
              this.showToast('Re-evaluation note: ' + (data.error || data.message || 'Check rules'));
            }
          } catch (e) {
            this.showToast('Re-evaluation request failed: ' + e.message);
          } finally {
            this.isReEvaluating = false;
          }
        },

        async harvestCompetitorPinsAction(competitor, mode = 'daily') {
          if (!competitor) return;
          const handle = (competitor.username || '').replace(/^@+/, '').trim();
          const compId = competitor.id || handle;
          const crawlMode = mode === 'deep' ? 'discovery' : 'refresh';
          const maxPages = mode === 'deep' ? 500 : 3;

          this.harvestingCompetitorId = compId;
          this.showToast('⚡ Dispatching 20-shard GHA Crawler for @' + handle + ' (' + crawlMode + ' mode, max ' + maxPages + 'p)...');
          try {
            const res = await (window.safeApiFetch || fetch)(this.getApiUrl('/api/competitors/dispatch-crawl'), {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                username: handle,
                crawl_mode: crawlMode,
                max_pages: maxPages
              })
            });
            const data = await res.json();
            if (res.ok && data.success) {
              this._clientCache?.boards?.clear();
              this.showToast('🚀 ' + (data.message || 'Crawler pipeline launched on GitHub Actions!'));
            } else {
              this.showToast('❌ Dispatch note: ' + (data.error || data.message || 'Check GitHub token configuration'));
            }
          } catch (e) {
            this.showToast('❌ Dispatch network error: ' + e.message);
          } finally {
            this.harvestingCompetitorId = null;
            this.$nextTick(() => { if (window.lucide) window.lucide.createIcons(); });
          }
        },`;
}
