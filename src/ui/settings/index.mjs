/**
 * src/ui/settings/index.mjs
 *
 * Centralized V4 Workspace Settings Page (/settings).
 * Single control center replacing scattered modals & cookie footers:
 * - Qualification Defaults (Max Pin Age, Min Re-pins, Min Saves)
 * - Extraction Paths & Deep-Scroll Targets (Search, Boards, Idea Page, Home Feed, Related Pins)
 * - Campaign & Execution Defaults (Default Top N Daily 5..100, Execution Mode Auto/Direct/Fleet)
 * - Pin Graph Auto-Trigger Rules
 * - Write-Only Session Cookie Zone A (#cookie)
 * - Rule Profiles CRUD (/api/newborn/rules)
 */

import { renderAppSidebar } from '../app-sidebar.mjs';
import { renderSharedDocumentHead } from '../shared-head.mjs';
import { renderPageBootstrapScript, renderClientJsScriptTag } from '../client-assets.mjs';

export function getSettingsPageHtml() {
  return `<!DOCTYPE html>
<html lang="en">
<head>
${renderSharedDocumentHead({
  title: 'Settings — Pin Arbitrage V4',
  referrerPolicy: 'no-referrer',
  tailwindScriptHtml: `  <script>
    tailwind.config = {
      darkMode: 'class',
      theme: {
        extend: {
          fontFamily: {
            sans: ['Geist', 'Inter', 'system-ui', 'sans-serif'],
            mono: ['JetBrains Mono', 'monospace']
          }
        }
      }
    };
  </script>`
})}
</head>
<body
  class="bg-[#F8FAFC] dark:bg-[#09090B] text-[#0F172A] dark:text-[#FAFAFA] font-sans antialiased min-h-screen transition-colors duration-200"
  x-data="settingsApp()"
  x-init="init()"
  x-cloak>

${renderAppSidebar({
  activeNav: 'settings',
  refreshHandler: 'loadAll()',
  refreshLoadingExpr: 'isLoading'
})}

  <main
    class="transition-all duration-300 ease-in-out md:ml-64 lg:ml-72 min-h-[calc(100vh-56px)]"
    :class="isSidebarCollapsed ? 'md:!ml-20' : 'md:ml-64 lg:ml-72'">

    <div class="max-w-[1280px] mx-auto px-4 sm:px-6 lg:px-8 py-6 space-y-6">

      <!-- Header -->
      <div class="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <h1 class="text-2xl font-bold tracking-tight text-slate-900 dark:text-[#FAFAFA]">Workspace Settings</h1>
          <p class="text-sm text-slate-500 dark:text-[#A1A1AA] mt-1">
            Centralized qualification rules, deep-scroll extraction targets, daily campaign defaults, write-only Zone-A cookie, and rule profiles.
          </p>
        </div>

        <button
          type="button"
          @click="saveSettings()"
          :disabled="isSaving"
          class="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold transition shadow-xs cursor-pointer disabled:opacity-50">
          <i data-lucide="save" class="w-4 h-4"></i>
          <span x-text="isSaving ? 'Saving...' : 'Save Workspace Settings'">Save Workspace Settings</span>
        </button>
      </div>

      <!-- Error Banner -->
      <template x-if="errorMessage">
        <div class="px-4 py-3 rounded-xl bg-rose-50 dark:bg-rose-950/30 border border-rose-200 dark:border-rose-500/30 text-xs text-rose-700 dark:text-rose-300" x-text="errorMessage"></div>
      </template>

      <!-- Bento Grid: Core Configuration Cards -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-5">

        <!-- Card 1: Qualification Defaults -->
        <section class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xs space-y-4">
          <div class="flex items-center gap-2.5 border-b border-slate-100 dark:border-[#27272A] pb-3">
            <div class="w-8 h-8 rounded-xl bg-rose-50 dark:bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <i data-lucide="sliders-horizontal" class="w-4 h-4"></i>
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Qualification Defaults</h2>
              <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Default thresholds applied to Newborn hunts and workspace filtering.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div>
              <label for="set-max-age" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Max Pin Age (days)</label>
              <input id="set-max-age" type="number" min="1" max="3650" x-model.number="form.max_pin_age_days" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div>
              <label for="set-min-repins" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Min Re-pins</label>
              <input id="set-min-repins" type="number" min="0" x-model.number="form.min_repin_count" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div>
              <label for="set-min-saves" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Min Saves (0 = ignored)</label>
              <input id="set-min-saves" type="number" min="0" x-model.number="form.min_save_count" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
          </div>
        </section>

        <!-- Card 2: Campaign & Execution Defaults -->
        <section class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xs space-y-4">
          <div class="flex items-center gap-2.5 border-b border-slate-100 dark:border-[#27272A] pb-3">
            <div class="w-8 h-8 rounded-xl bg-indigo-50 dark:bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
              <i data-lucide="cpu" class="w-4 h-4"></i>
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Campaign &amp; Execution Defaults</h2>
              <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Daily SERP Top N tracking cap and worker execution strategy.</p>
            </div>
          </div>

          <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label for="set-top-n" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Default Top N Daily (5–100)</label>
              <div class="flex items-center gap-1.5 mb-2">
                <template x-for="n in [10, 20, 30, 50]" :key="n">
                  <button
                    type="button"
                    @click="form.default_serp_top_n = n"
                    class="px-2 py-1 rounded-lg border text-[11px] font-mono font-semibold cursor-pointer transition"
                    :class="Number(form.default_serp_top_n) === n ? 'bg-rose-600 border-rose-600 text-white' : 'border-slate-200 dark:border-[#27272A] text-slate-600 dark:text-[#A1A1AA]'"
                    x-text="'Top ' + n"></button>
                </template>
              </div>
              <input id="set-top-n" type="number" min="5" max="100" x-model.number="form.default_serp_top_n" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>

            <div>
              <label for="set-exec-mode" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Execution Mode</label>
              <select id="set-exec-mode" x-model="form.execution_mode" class="w-full px-3 py-2 text-xs rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]">
                <option value="auto">Auto (Smart Direct / Fleet Routing)</option>
                <option value="direct">Direct (Instant API Runner)</option>
                <option value="fleet">Fleet (GitHub Actions Swarm)</option>
              </select>
            </div>
          </div>
        </section>

        <!-- Card 3: Extraction Paths & Deep-Scroll Targets -->
        <section class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xs space-y-4">
          <div class="flex items-center gap-2.5 border-b border-slate-100 dark:border-[#27272A] pb-3">
            <div class="w-8 h-8 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <i data-lucide="layers" class="w-4 h-4"></i>
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Extraction Paths &amp; Deep-Scroll Targets</h2>
              <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Pagination depth across Search, Boards, Idea Page, Home Feed, and Related Pins.</p>
            </div>
          </div>

          <div class="grid grid-cols-2 sm:grid-cols-3 gap-3">
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="ext-search" class="text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A]">Search Target Pins</label>
                <input type="checkbox" aria-label="Enable Search Extraction" x-model="form.extraction_targets.search.enabled" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
              </div>
              <input id="ext-search" type="number" min="10" max="5000" x-model.number="form.extraction_targets.search.target_pins" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="ext-boards" class="text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A]">Max Boards</label>
                <input type="checkbox" aria-label="Enable Boards Extraction" x-model="form.extraction_targets.boards.enabled" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
              </div>
              <input id="ext-boards" type="number" min="1" max="100" x-model.number="form.extraction_targets.boards.max_boards" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div>
              <label for="ext-board-pins" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Pins / Board</label>
              <input id="ext-board-pins" type="number" min="10" max="2000" x-model.number="form.extraction_targets.boards.target_pins_per_board" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="ext-ideas" class="text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A]">Idea Page Pins</label>
                <input type="checkbox" aria-label="Enable Idea Page Extraction" x-model="form.extraction_targets.idea_page.enabled" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
              </div>
              <input id="ext-ideas" type="number" min="10" max="5000" x-model.number="form.extraction_targets.idea_page.target_pins" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="ext-home" class="text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A]">Home Feed Pins</label>
                <input type="checkbox" aria-label="Enable Home Feed Extraction" x-model="form.extraction_targets.home_feed.enabled" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
              </div>
              <input id="ext-home" type="number" min="10" max="5000" x-model.number="form.extraction_targets.home_feed.target_pins" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
            <div>
              <div class="flex items-center justify-between mb-1">
                <label for="ext-related" class="text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A]">Related Pins Target</label>
                <input type="checkbox" aria-label="Enable Related Pins Extraction" x-model="form.extraction_targets.related_pins.enabled" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
              </div>
              <input id="ext-related" type="number" min="10" max="5000" x-model.number="form.extraction_targets.related_pins.target_pins" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
            </div>
          </div>
        </section>

        <!-- Card 4: Pin Graph Triggers -->
        <section class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xs space-y-4">
          <div class="flex items-center gap-2.5 border-b border-slate-100 dark:border-[#27272A] pb-3">
            <div class="w-8 h-8 rounded-xl bg-amber-50 dark:bg-amber-500/10 text-amber-600 dark:text-amber-400 flex items-center justify-center">
              <i data-lucide="git-branch" class="w-4 h-4"></i>
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Pin Graph Auto-Triggers</h2>
              <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Controls automatic Related Pins snowball seeding inside campaigns.</p>
            </div>
          </div>

          <div class="space-y-3">
            <div class="flex flex-wrap items-center gap-5">
              <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input type="checkbox" x-model="form.pin_graph_rules.auto_trigger_enabled" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                <span>Enable Pin Graph Auto-Trigger</span>
              </label>
              <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input type="checkbox" x-model="form.pin_graph_rules.linkless_only" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                <span>Linkless Pins Only</span>
              </label>
            </div>
            <div class="grid grid-cols-2 gap-3">
              <div>
                <label for="pg-min-repins" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Trigger Min Re-pins</label>
                <input id="pg-min-repins" type="number" min="0" x-model.number="form.pin_graph_rules.min_repins" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
              </div>
              <div>
                <label for="pg-max-pages" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Max Graph Pages</label>
                <input id="pg-max-pages" type="number" min="1" max="200" x-model.number="form.pin_graph_rules.max_pages" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A]" />
              </div>
            </div>
          </div>
        </section>

      </div>

      <!-- Card 5: Write-Only Session Cookie Zone A (#cookie) -->
      <section id="cookie" class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#27272A] pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-slate-100 dark:bg-[#18181B] text-slate-700 dark:text-slate-200 flex items-center justify-center">
              <i data-lucide="key-round" class="w-4 h-4"></i>
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Session Cookie — Zone A (Write-Only)</h2>
              <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Unlocks authenticated Pinterest endpoints (Related Pins, Board More Ideas, Home Feed). Stored write-only and never echoed back.</p>
            </div>
          </div>

          <span
            class="self-start sm:self-auto px-2.5 py-1 rounded-lg border text-[11px] font-mono font-semibold"
            :class="hasCookie
              ? 'bg-emerald-50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-700/50 text-emerald-700 dark:text-emerald-300'
              : 'bg-slate-50 dark:bg-[#18181B] border-slate-200 dark:border-[#27272A] text-slate-500 dark:text-[#A1A1AA]'"
            x-text="hasCookie ? 'Configured (Zone A Active)' : 'Not Configured (Guest Fallback)'"></span>
        </div>

        <div class="space-y-3">
          <label for="zone-a-cookie-input" class="block text-xs font-semibold text-slate-700 dark:text-slate-200">
            Paste Pinterest Session Cookie (_pinterest_sess / full Cookie header)
          </label>
          <textarea
            id="zone-a-cookie-input"
            rows="3"
            x-model="cookieInput"
            autocomplete="off"
            spellcheck="false"
            placeholder="Paste raw Pinterest session cookie here to store or rotate. Existing cookie values are never displayed..."
            class="w-full px-3 py-2 text-xs font-mono rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] focus:outline-none focus:ring-2 focus:ring-rose-500"></textarea>

          <div class="flex flex-wrap items-center gap-2">
            <button
              type="button"
              @click="saveZoneACookie()"
              :disabled="isSavingCookie"
              class="px-4 py-2 rounded-xl bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-slate-900 text-xs font-semibold hover:opacity-90 transition cursor-pointer disabled:opacity-50"
              x-text="isSavingCookie ? 'Saving...' : 'Save Cookie'"></button>
            <button
              type="button"
              @click="clearZoneACookie()"
              :disabled="isSavingCookie || !hasCookie"
              class="px-3.5 py-2 rounded-xl border border-rose-200 dark:border-rose-500/30 text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 text-xs font-semibold transition cursor-pointer disabled:opacity-40">
              Clear Cookie
            </button>
          </div>
        </div>
      </section>

      <!-- Card 6: Named Rule Profiles CRUD (/api/newborn/rules) -->
      <section class="bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A] rounded-2xl p-5 shadow-2xs space-y-4">
        <div class="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 dark:border-[#27272A] pb-3">
          <div class="flex items-center gap-2.5">
            <div class="w-8 h-8 rounded-xl bg-violet-50 dark:bg-violet-500/10 text-violet-600 dark:text-violet-400 flex items-center justify-center">
              <i data-lucide="file-sliders" class="w-4 h-4"></i>
            </div>
            <div>
              <h2 class="text-sm font-bold text-slate-900 dark:text-[#FAFAFA]">Rule Profiles</h2>
              <p class="text-[11px] text-slate-500 dark:text-[#A1A1AA]">Reusable Newborn qualification presets selectable during Discover hunts.</p>
            </div>
          </div>

          <button
            type="button"
            @click="openNewRuleForm()"
            class="self-start sm:self-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-[#27272A] hover:border-rose-400 text-xs font-semibold text-slate-700 dark:text-slate-200 transition cursor-pointer">
            <i data-lucide="plus" class="w-3.5 h-3.5"></i>
            <span>New Profile</span>
          </button>
        </div>

        <template x-if="showRuleForm">
          <form @submit.prevent="submitRuleProfile()" class="p-4 rounded-xl bg-slate-50 dark:bg-[#18181B] border border-slate-200 dark:border-[#27272A] space-y-3">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label for="rule-name" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Profile Name</label>
                <input id="rule-name" type="text" required x-model="ruleForm.name" placeholder="e.g. Fast 14d Breakout" class="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]" />
              </div>
              <div>
                <label for="rule-desc" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Description</label>
                <input id="rule-desc" type="text" x-model="ruleForm.description" placeholder="Short preset summary..." class="w-full px-3 py-2 text-xs rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]" />
              </div>
            </div>
            <div class="grid grid-cols-3 gap-3">
              <div>
                <label for="rule-age" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Max Age (days)</label>
                <input id="rule-age" type="number" min="1" x-model.number="ruleForm.max_age_days" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]" />
              </div>
              <div>
                <label for="rule-repins" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Min Re-pins</label>
                <input id="rule-repins" type="number" min="0" x-model.number="ruleForm.min_repins" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]" />
              </div>
              <div>
                <label for="rule-saves" class="block text-[11px] font-mono uppercase text-slate-500 dark:text-[#71717A] mb-1">Min Saves</label>
                <input id="rule-saves" type="number" min="0" x-model.number="ruleForm.min_saves" class="w-full px-3 py-2 text-xs font-mono tabular-nums rounded-xl bg-white dark:bg-[#121215] border border-slate-200 dark:border-[#27272A]" />
              </div>
            </div>
            <div class="flex items-center justify-between pt-1">
              <label class="inline-flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-200 cursor-pointer">
                <input type="checkbox" x-model="ruleForm.is_default" class="rounded border-slate-300 text-rose-600 focus:ring-rose-500" />
                <span>Set as default profile</span>
              </label>
              <div class="flex items-center gap-2">
                <button type="button" @click="showRuleForm = false" class="px-3 py-1.5 rounded-lg border border-slate-200 dark:border-[#27272A] text-xs font-semibold text-slate-600 dark:text-[#A1A1AA] cursor-pointer">Cancel</button>
                <button type="submit" :disabled="isSavingRule" class="px-3.5 py-1.5 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold cursor-pointer disabled:opacity-50" x-text="isSavingRule ? 'Saving...' : 'Save Profile'"></button>
              </div>
            </div>
          </form>
        </template>

        <div class="divide-y divide-slate-100 dark:divide-[#27272A]">
          <template x-for="prof in ruleProfiles" :key="prof.id">
            <div class="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div>
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-slate-900 dark:text-[#FAFAFA]" x-text="prof.name"></span>
                  <template x-if="prof.is_default">
                    <span class="px-2 py-0.5 rounded bg-rose-50 dark:bg-rose-500/15 text-rose-600 dark:text-rose-400 text-[10px] font-mono font-semibold uppercase">Default</span>
                  </template>
                </div>
                <div class="text-[11px] text-slate-500 dark:text-[#A1A1AA] mt-0.5" x-text="prof.description || 'Custom qualification rule profile'"></div>
              </div>
              <div class="flex items-center gap-1.5">
                <button type="button" @click="editRuleProfile(prof)" class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] text-[11px] font-semibold text-slate-700 dark:text-slate-200 hover:border-rose-400 cursor-pointer">Edit</button>
                <button
                  type="button"
                  @click="deleteRuleProfile(prof)"
                  :disabled="Boolean(prof.is_default)"
                  class="px-2.5 py-1 rounded-lg border border-slate-200 dark:border-[#27272A] text-[11px] font-semibold text-rose-600 dark:text-rose-400 hover:bg-rose-50 dark:hover:bg-rose-950/30 cursor-pointer disabled:opacity-40">
                  Delete
                </button>
              </div>
            </div>
          </template>
          <template x-if="!isLoading && ruleProfiles.length === 0">
            <div class="py-6 text-center text-xs text-slate-500 dark:text-[#A1A1AA]">No custom rule profiles saved yet.</div>
          </template>
        </div>
      </section>

    </div>

    <!-- Toast Notification -->
    <template x-if="toastMsg">
      <div class="fixed bottom-5 right-5 z-50 px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-[#FAFAFA] text-white dark:text-slate-900 text-xs font-semibold shadow-xl" x-text="toastMsg"></div>
    </template>
  </main>

${renderPageBootstrapScript({})}
${renderClientJsScriptTag('settings')}
</body>
</html>`;
}
