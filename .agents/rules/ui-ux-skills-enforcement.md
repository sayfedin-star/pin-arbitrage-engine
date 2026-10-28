---
trigger: always_on
---

# PAE Mandatory UI/UX Skills Enforcement & Design Directives

> **Purpose:** Single Source of Truth (SSOT) enforcing that all UI/UX modifications, template designs, styling, component implementations, and microcopy strictly follow the triad of agent skills: `ui-ux-pro-max`, `web-design-guidelines`, and `writing-guidelines` in tandem with `DESIGN.md`.
> **Enforcement Rule:** AI Agents and developers MUST read and adhere to these directives before creating, editing, refactoring, or auditing any frontend interface file in `pin-arbitrage-engine`.

---

## 1. Mandatory Pre-Execution Loading Protocol
- **Trigger Files:** Any file under `src/*-ui.mjs` (e.g., `src/dashboard-ui.mjs`, `src/keywords-ui.mjs`, `src/domains-ui.mjs`, `src/discovery-ui.mjs`, `src/campaign-folders-ui.mjs`, `src/pin-details-ui.mjs`), `src/ui/*.mjs` (e.g., `src/ui/app-sidebar.mjs`, `src/ui/campaign-workspace-header.mjs`, `src/ui/dashboard-modals.mjs`, `src/ui/keywords-drawers.mjs`), and `DESIGN.md`.
- **Pre-Execution Requirement:** Before touching or proposing modifications to any of the above files, the agent MUST read and apply:
  1. `.agents/skills/ui-ux-pro-max/SKILL.md` (Design intelligence, Swiss grid, hierarchy, palettes)
  2. `.agents/skills/web-design-guidelines/SKILL.md` (Web interface standards, accessibility, keyboard handling)
  3. `.agents/skills/writing-guidelines/SKILL.md` (Voice, tone, crisp microcopy, empty/error state copy)

---

## 2. Design System & Token Parity (`DESIGN.md` + `ui-ux-pro-max`)
- **Atmospheric Density & Typography:**
  - Enforce **Cockpit Dense (Level 8)** data-dense SaaS hierarchy with Swiss-grid alignment. Eliminate frivolous whitespace, bloated cards, and pastel circles.
  - Enforce `Geist` sans display/body typography (replacing banned `Inter`) and `JetBrains Mono` (`tabular-nums`) for all telemetry.
- **Strict Semantic Palette Preservation:**
  - **Canvas Base:** `#09090B` (Deep Zinc-950)
  - **Surface Elevation 1:** `#121215` (Primary containers and flush structural panes)
  - **Surface Elevation 2:** `#18181B` (Active rows, hover layers, popovers)
  - **Surface Highlight:** `#27272A` (Interactive hover states, subtle button backgrounds)
  - **Whisper Border:** `#27272A` (1px structural boundaries)
  - **Subtle Divider:** `#1E1E22` (Micro grid dividers between table cells & ribbons)
  - **Primary Ink:** `#FAFAFA` (High-contrast text, headers, primary metrics)
  - **Steel Secondary:** `#A1A1AA` (Field descriptions, secondary telemetry, inactive tabs)
  - **Muted Slate:** `#71717A` (Timestamps, denominators, table column super-headers)
  - **Deep Rose Accent:** `#E11D48` (Pinterest arbitrage brand accent, active selections, primary CTAs)
  - **Signal Emerald:** `#10B981` (Positive velocity, audience acceleration, qualified winners)
  - **Signal Amber:** `#F59E0B` (Ingestion warnings, rate throttles, fresh breakout windows)
  - **Signal Sky:** `#0EA5E9` (Neutral impressions, external platform links)
- **Banned Color Patterns:**
  - ❌ NEVER introduce purple/neon AI gradients or glows.
  - ❌ NEVER use pure `#000000` for surfaces or borders.
  - ❌ NEVER introduce oversaturated pastel chips (e.g. baby blue or light pink circles).

---

## 3. Web Interface & Accessibility Engineering (`web-design-guidelines`)
- **Tabular Figures for Numeric Stability:**
  - Enforce `font-mono tabular-nums` (or `font-family: 'JetBrains Mono', monospace; font-variant-numeric: tabular-nums`) on all numeric metrics, SERP ranks, save velocities (`daily_save_velocity`), percentage deltas, and timestamps to eliminate horizontal layout shift.
- **Contrast & Focus Standards:**
  - Ensure strict WCAG AA contrast ratios across both light and dark themes.
  - Ensure clear `focus-visible:ring-2 focus-visible:ring-rose-500` or equivalent interactive indicators on all keyboard-focusable elements.
- **Keyboard Navigation & Modal/Drawer Lifecycle:**
  - All drawers and modal dialogs (`src/ui/keywords-drawers.mjs`, `src/ui/dashboard-modals.mjs`) MUST implement `Escape` key handlers (`@keydown.escape.window="..."`), focus trapping/restoration, and correct `aria-modal="true"`, `role="dialog"`, and `aria-labelledby` attributes.
- **Reduced Motion Compliance:**
  - All transitions, micro-pulses, and live indicator animations MUST respect `@media (prefers-reduced-motion: reduce)` (e.g. `motion-reduce:animate-none` / `motion-reduce:transition-none`).

---

## 4. Microcopy & Official Terminology (`writing-guidelines` + Rule 13)
- **Crisp & Direct Microcopy:**
  - Button labels, tooltips, empty states, and error alerts must be concise and actionable (avoid filler words like *easy*, *simple*, *quick*).
- **Official Pinterest Business Analytics Parity:**
  - `Profile Views` ➡️ Strictly **`Impressions`** (mapped internally to `competitor_profiles.profile_views`).
  - `Monthly Reach` ➡️ Strictly **`Total audience`** (mapped internally to `competitor_profiles.monthly_reach`).
  - Subsystem Title: Strictly **`Creator Hub`** (never "Creator Intelligence & PinArchive").

---

## 5. PAE Frontend Safety Invariants (Zero-Regression Gate)
- **Rule 16 — Functional Replacer & Target Assertion:**
  - When writing migration or patching scripts that modify `.mjs` template strings, NEVER use raw strings with potential `$` characters in `.replace()`. Strictly use the arrow function replacer `content.replace(target, () => replacement)` and assert target existence first (`if (!content.includes(target)) throw new Error(...)`).
- **Rule 17 — Headless Node.js Environment Shield:**
  - All UI template files (`src/*-ui.mjs`, `src/ui/*.mjs`) are evaluated by Node.js test runners (`npm run check`). NEVER invoke browser globals directly at the top level without environment guards:
    `const theme = (typeof localStorage !== 'undefined') ? localStorage.getItem('pa_theme') : null;`
    `if (typeof window !== 'undefined') { ... }`
- **Mutation & Prefetch Invariants (Rules 5 & 7):**
  - All frontend API mutation requests MUST include `AbortSignal.timeout(15000)` and verify `res.ok`.
  - Mouseover prefetching (`searchParams.get('prefetch') === 'true'`) MUST be served strictly from Cloudflare D1 or KV edge cache (< 3ms) and MUST NEVER trigger background live Pinterest scraping.
