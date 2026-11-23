/**
 * src/ui/settings/settings-client-app.mjs
 *
 * Leaf Alpine.js client controller for the Centralized Workspace Settings page (/settings).
 * 0 imports — guaranteed cycle-free.
 * Unifies:
 * - Workspace Qualification Defaults (Max Pin Age, Min Re-pins, Min Saves)
 * - Extraction Paths & Deep-Scroll Targets (Search, Boards, Idea Page, Home Feed, Related Pins)
 * - Campaign & Execution Defaults (Default Top N Daily 5..100, Execution Mode Auto/Direct/Fleet)
 * - Pin Graph Auto-Trigger Rules
 * - Write-Only Session Cookie Zone A (POST/DELETE /api/workspaces/cookie — never displays raw cookie)
 * - Named Rule Profiles CRUD (/api/newborn/rules)
 */

export function getSettingsClientAppJs() {
  return `
window.settingsApp = function settingsApp() {
  const reqFetch = (url, opts) => (
    typeof window !== 'undefined' && typeof window.apiFetch === 'function'
      ? window.apiFetch(url, opts)
      : fetch(url, opts)
  );

  return {
    isDark: false,
    isSidebarCollapsed: false,
    isMobileMenuOpen: false,

    isLoading: false,
    isSaving: false,
    errorMessage: '',
    toastMsg: '',
    _toastTimer: null,

    workspaceId: 1,

    // Centralized Workspace Settings model (strictly aligned with Migration 012 & DEFAULT_WORKSPACE_SETTINGS)
    form: {
      max_pin_age_days: 30,
      min_repin_count: 20,
      min_save_count: 0,
      default_serp_top_n: 20,
      execution_mode: 'auto',
      extraction_targets: {
        search: { enabled: true, target_pins: 500 },
        boards: { enabled: true, max_boards: 10, target_pins_per_board: 100 },
        idea_page: { enabled: true, target_pins: 250 },
        home_feed: { enabled: false, target_pins: 250 },
        related_pins: { enabled: false, target_pins: 300 }
      },
      pin_graph_rules: {
        auto_trigger_enabled: false,
        min_repins: 500,
        linkless_only: false,
        max_pages: 20
      }
    },

    // Write-only Zone-A Cookie state
    hasCookie: false,
    cookieZoneMode: 'guest_zero_cookie_fallback',
    cookieInput: '',
    isSavingCookie: false,

    // Named Rule Profiles (/api/newborn/rules)
    ruleProfiles: [],
    isLoadingRules: false,
    showRuleForm: false,
    editingRuleId: null,
    ruleForm: {
      name: '',
      description: '',
      max_age_days: 30,
      min_repins: 20,
      min_saves: 0,
      is_default: false
    },
    isSavingRule: false,

    async init() {
      this.isDark = document.documentElement.classList.contains('dark');
      try {
        this.isSidebarCollapsed = (
          localStorage.getItem('pae_sidebar_collapsed') === 'true' ||
          localStorage.getItem('pa_sidebar_collapsed') === 'true'
        );
      } catch (_) {}

      await this.loadAll();
      this.$nextTick(() => {
        if (window.lucide && typeof window.lucide.createIcons === 'function') {
          window.lucide.createIcons();
        }
      });
    },

    toggleTheme() {
      if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.toggleTheme === 'function') {
        this.isDark = window.PAE.toggleTheme();
      } else {
        this.isDark = !this.isDark;
        document.documentElement.classList.toggle('dark', this.isDark);
        try { localStorage.setItem('pa_theme', this.isDark ? 'dark' : 'light'); } catch (_) {}
      }
      this.$nextTick(() => {
        if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
      });
    },

    toggleSidebar() {
      if (typeof window !== 'undefined' && window.PAE && typeof window.PAE.toggleSidebar === 'function') {
        this.isSidebarCollapsed = window.PAE.toggleSidebar();
        return;
      }
      this.isSidebarCollapsed = !this.isSidebarCollapsed;
      try { localStorage.setItem('pae_sidebar_collapsed', String(this.isSidebarCollapsed)); } catch (_) {}
    },

    showToast(msg) {
      this.toastMsg = String(msg || '');
      if (this._toastTimer) clearTimeout(this._toastTimer);
      this._toastTimer = setTimeout(() => { this.toastMsg = ''; }, 3500);
    },

    async loadAll() {
      this.isLoading = true;
      this.errorMessage = '';
      try {
        const [settingsRes, cookieRes, rulesRes] = await Promise.all([
          reqFetch('/api/workspaces/settings', { headers: { Accept: 'application/json' } }),
          reqFetch('/api/workspaces/cookie', { headers: { Accept: 'application/json' } }),
          reqFetch('/api/newborn/rules', { headers: { Accept: 'application/json' } }).catch(() => null)
        ]);

        const sData = await settingsRes.json().catch(() => ({}));
        if (!settingsRes.ok || sData.success === false) {
          throw new Error(sData.error || 'Failed to load workspace settings');
        }
        this.workspaceId = Number(sData.workspace_id || 1);
        const s = sData.settings || {};
        this.form.max_pin_age_days = Number(s.max_pin_age_days ?? 30);
        this.form.min_repin_count = Number(s.min_repin_count ?? 20);
        this.form.min_save_count = Number(s.min_save_count ?? 0);
        this.form.default_serp_top_n = Number(s.default_serp_top_n ?? 20);
        this.form.execution_mode = ['auto', 'direct', 'fleet'].includes(String(s.execution_mode || '')) ? s.execution_mode : 'auto';

        const ext = s.extraction_targets || {};
        this.form.extraction_targets = {
          search: {
            enabled: ext.search?.enabled !== false,
            target_pins: Number(ext.search?.target_pins ?? 500)
          },
          boards: {
            enabled: ext.boards?.enabled !== false,
            max_boards: Number(ext.boards?.max_boards ?? 10),
            target_pins_per_board: Number(ext.boards?.target_pins_per_board ?? 100)
          },
          idea_page: {
            enabled: ext.idea_page?.enabled !== false,
            target_pins: Number(ext.idea_page?.target_pins ?? 250)
          },
          home_feed: {
            enabled: Boolean(ext.home_feed?.enabled),
            target_pins: Number(ext.home_feed?.target_pins ?? 250)
          },
          related_pins: {
            enabled: Boolean(ext.related_pins?.enabled),
            target_pins: Number(ext.related_pins?.target_pins ?? 300)
          }
        };

        const pg = s.pin_graph_rules || {};
        this.form.pin_graph_rules = {
          auto_trigger_enabled: Boolean(pg.auto_trigger_enabled),
          min_repins: Number(pg.min_repins ?? 500),
          linkless_only: Boolean(pg.linkless_only),
          max_pages: Number(pg.max_pages ?? 20)
        };

        const cData = await cookieRes.json().catch(() => ({}));
        this.hasCookie = Boolean(cData.has_cookie || s.has_cookie);
        this.cookieZoneMode = cData.zone_routing_mode || (this.hasCookie ? 'two_zone_auth_plus_zero_cookie' : 'guest_zero_cookie_fallback');

        if (rulesRes && rulesRes.ok) {
          const rData = await rulesRes.json().catch(() => ({}));
          this.ruleProfiles = Array.isArray(rData.profiles) ? rData.profiles : (Array.isArray(rData.rules) ? rData.rules : []);
        }
      } catch (err) {
        this.errorMessage = err.message || 'Failed to load settings.';
      } finally {
        this.isLoading = false;
        this.$nextTick(() => {
          if (window.lucide && typeof window.lucide.createIcons === 'function') window.lucide.createIcons();
        });
      }
    },

    async saveSettings() {
      if (this.isSaving) return;
      this.isSaving = true;
      this.errorMessage = '';
      try {
        const res = await reqFetch('/api/workspaces/settings', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify(this.form)
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to save workspace settings');
        }
        this.showToast('Workspace settings saved');
      } catch (err) {
        this.errorMessage = err.message || 'Could not save settings';
        this.showToast(this.errorMessage);
      } finally {
        this.isSaving = false;
      }
    },

    async saveZoneACookie() {
      const raw = String(this.cookieInput || '').trim();
      if (raw.length <= 10 || this.isSavingCookie) {
        this.showToast('Paste a valid Pinterest session cookie string (> 10 chars)');
        return;
      }
      this.isSavingCookie = true;
      try {
        const res = await reqFetch('/api/workspaces/cookie', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ cookie: raw })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to save session cookie');
        }
        // Immediately clear input so raw cookie never lingers in DOM
        this.cookieInput = '';
        this.hasCookie = Boolean(data.has_cookie);
        this.cookieZoneMode = data.zone_routing_mode || 'two_zone_auth_plus_zero_cookie';
        this.showToast('Zone-A Session Cookie saved (write-only)');
      } catch (err) {
        this.showToast(err.message || 'Cookie save failed');
      } finally {
        this.isSavingCookie = false;
      }
    },

    async clearZoneACookie() {
      if (this.isSavingCookie) return;
      this.isSavingCookie = true;
      try {
        const res = await reqFetch('/api/workspaces/cookie', {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to clear session cookie');
        }
        this.cookieInput = '';
        this.hasCookie = false;
        this.cookieZoneMode = 'guest_zero_cookie_fallback';
        this.showToast('Zone-A Session Cookie cleared');
      } catch (err) {
        this.showToast(err.message || 'Could not clear cookie');
      } finally {
        this.isSavingCookie = false;
      }
    },

    openNewRuleForm() {
      this.editingRuleId = null;
      this.ruleForm = {
        name: '',
        description: '',
        max_age_days: this.form.max_pin_age_days,
        min_repins: this.form.min_repin_count,
        min_saves: this.form.min_save_count,
        is_default: false
      };
      this.showRuleForm = true;
    },

    editRuleProfile(profile) {
      const q = profile.qualification_config || {};
      this.editingRuleId = profile.id;
      this.ruleForm = {
        name: profile.name || '',
        description: profile.description || '',
        max_age_days: Number(q.max_pin_age_days ?? q.max_age_days ?? 30),
        min_repins: Number(q.min_repin_count ?? q.min_repins ?? 20),
        min_saves: Number(q.min_save_count ?? q.min_saves ?? 0),
        is_default: Boolean(profile.is_default)
      };
      this.showRuleForm = true;
    },

    async submitRuleProfile() {
      const name = String(this.ruleForm.name || '').trim();
      if (!name || this.isSavingRule) return;
      this.isSavingRule = true;
      try {
        const url = this.editingRuleId
          ? ('/api/newborn/rules/' + encodeURIComponent(this.editingRuleId))
          : '/api/newborn/rules';
        const method = this.editingRuleId ? 'PUT' : 'POST';
        const res = await reqFetch(url, {
          method,
          headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({
            name,
            description: String(this.ruleForm.description || '').trim(),
            is_default: Boolean(this.ruleForm.is_default),
            qualification_config: {
              max_pin_age_days: Number(this.ruleForm.max_age_days) || 30,
              min_repin_count: Math.max(0, Number(this.ruleForm.min_repins) || 0),
              min_save_count: Math.max(0, Number(this.ruleForm.min_saves) || 0)
            }
          })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to save rule profile');
        }
        this.showRuleForm = false;
        this.editingRuleId = null;
        await this.loadAll();
        this.showToast('Rule profile saved');
      } catch (err) {
        this.showToast(err.message || 'Could not save rule profile');
      } finally {
        this.isSavingRule = false;
      }
    },

    async deleteRuleProfile(profile) {
      if (!profile || !profile.id || profile.is_default) return;
      try {
        const res = await reqFetch('/api/newborn/rules/' + encodeURIComponent(profile.id), {
          method: 'DELETE',
          headers: { Accept: 'application/json' }
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok || data.success === false) {
          throw new Error(data.error || 'Failed to delete rule profile');
        }
        await this.loadAll();
        this.showToast('Rule profile deleted');
      } catch (err) {
        this.showToast(err.message || 'Could not delete rule profile');
      }
    }
  };
};
`;
}
