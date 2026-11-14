# Design System: Pin Arbitrage Engine (PAE)
**Skill:** stitch-design-taste
**Subsystem Authority:** Creator Hub & Quantitative Arbitrage Studio
**Aesthetic Baseline:** Light-Mode Bento SaaS (Default `:root`, Optional `.dark`)

---

## Configuration — Set Your Style

| Dial | Level | Description |
| :--- | :--- | :--- |
| **Creativity** | `8` | High-agency, precision utility, editorial hierarchy without frivolous ornaments. |
| **Density** | `8` | Cockpit-dense, data-heavy arbitrage telemetry. All numbers rendered in tabular monospace. |
| **Variance** | `7` | Offset asymmetric layouts, Bento intelligence grids, no repetitive symmetric card rows. |
| **Motion Intent** | `6` | Fluid spring-physics, perpetual micro-pulses on live crawl indicators, 60fps transform-only transitions. |

---

## 1. Visual Theme & Atmosphere
A high-density, quantitative intelligence workspace engineered for professional Pinterest arbitrage operators and growth engineers. The aesthetic merges the crisp clarity of a modern Light-Mode Bento SaaS workspace with the typographic restraint of an architectural studio and the data rigor of a financial trading terminal.

The default theme is **Light-Mode Bento SaaS** (`:root`), prioritizing maximum legibility, clean visual hierarchy, and structural elevation. Every pixel communicates functional state. Atmospheric density is tuned to **Cockpit Dense (Level 8)**, eliminating bloated whitespace and pastel fluff in favor of razor-thin 1px structural lines, high-contrast typography, and tabular alignment. The interface feels expensive, disciplined, and alive—replacing generic SaaS cards with integrated telemetry ribbons, rounded-2xl Bento modules, and asymmetric analytics layouts. Optional dark mode (`.dark`) is supported via the unified `pa_theme` storage key.

---

## 2. Color Palette & Functional Roles
The palette is built upon a dual-tier semantic system: a crisp Light-Mode Bento scale as default, with a dark mode option. Chromatic color is strictly functional, governed by a singular signature accent and precision signal markers.

### Default Theme (:root — Light-Mode Bento SaaS)
- **Canvas Base** (`#F8FAFC`) — Slate-50 clean canvas. Optical grounding for dense analytical data.
- **Surface Elevation 1 / Bento Cards** (`#FFFFFF`) — Pure crisp white rounded Bento cards (`rounded-2xl`, `1px solid #E2E8F0`, subtle elevation shadow `0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)`).
- **Surface Elevation 2 / Secondary Surfaces** (`#F1F5F9`) — Slate-100 secondary surfaces, wells, segmented pill tracks, table headers, and inputs.
- **Surface Highlight / Interactive** (`#E2E8F0`) — Slate-200 interactive hover states and subtle button backgrounds.
- **Whisper Border** (`#E2E8F0`) — 1px structural boundaries separating cards, panes, and headers.
- **Subtle Divider** (`#F1F5F9`) — Micro grid dividers between table cells and telemetry ribbons.
- **Primary Ink** (`#0F172A`) — Slate-900 high-contrast text, primary headers, and high-priority metrics.
- **Steel Secondary** (`#64748B`) — Slate-500 field descriptions, secondary telemetry, and inactive tab labels.
- **Muted Slate** (`#94A3B8`) — Slate-400 timestamps, unit denominators, and table column super-headers.

### Optional Dark Theme (.dark — Zinc Analytical Dark)
- **Canvas Base** (`#09090B`) — Deep Zinc-950 canvas.
- **Surface Elevation 1** (`#121215`) — Primary container and module background.
- **Surface Elevation 2** (`#18181B`) — Active rows, hover layers, popovers, and segmented pill wells.
- **Surface Highlight** (`#27272A`) — Interactive hover states and subtle button backgrounds.
- **Whisper Border** (`#27272A`) — 1px structural boundaries.
- **Subtle Divider** (`#1E1E22`) — Micro grid dividers between table cells and ribbons.
- **Primary Ink** (`#FAFAFA`) — High-contrast white text, primary headers, and metrics.
- **Steel Secondary** (`#A1A1AA`) — Field descriptions and secondary telemetry.
- **Muted Slate** (`#71717A`) — Timestamps, unit denominators, and super-headers.

### Signature Accent (Single Brand Focus)
- **Deep Rose** (`#E11D48`) — Functional accent representing Pinterest arbitrage authority, active filter selections, and primary interactive triggers. Saturation capped at 78%.

### Operational Signal Indicators (Strict Telemetry Only)
- **Signal Emerald** (`#10B981`) — Positive save velocity, audience acceleration, and qualified winner status.
  - *Light Mode Pill:* Background `#ECFDF5`, text `#065F46`, border `#A7F3D0`.
  - *Dark Mode Pill:* Background `rgba(16, 185, 129, 0.15)`, text `#34D399`, border `rgba(16, 185, 129, 0.3)`.
- **Signal Amber** (`#F59E0B`) — Ingestion warnings, rate throttles, and fresh breakout verification windows.
  - *Light Mode Pill:* Background `#FFFBEB`, text `#92400E`, border `#FDE68A`.
  - *Dark Mode Pill:* Background `rgba(245, 158, 11, 0.15)`, text `#FBBF24`, border `rgba(245, 158, 11, 0.3)`.
- **Signal Sky** (`#0EA5E9`) — Neutral impressions telemetry and external Pinterest platform links.
  - *Light Mode Pill:* Background `#F0F9FF`, text `#075985`, border `#BAE6FD`.
  - *Dark Mode Pill:* Background `rgba(14, 165, 233, 0.15)`, text `#38BDF8`, border `rgba(14, 165, 233, 0.3)`.
- **Signal Rose** (`#E11D48`) — Velocity drops, displacement alerts, and critical anomalies.
  - *Light Mode Pill:* Background `#FFF1F2`, text `#9F1239`, border `#FECDD3`.
  - *Dark Mode Pill:* Background `rgba(225, 29, 72, 0.15)`, text `#FB7185`, border `rgba(225, 29, 72, 0.3)`.
- **Signal Slate** (`#64748B` / `#94A3B8`) — Inactive, baseline-pending, or paused ingest states.

### Banned Color Patterns
- NO AI purple/blue neon glows or multi-colored gradients.
- NO pure black (`#000000`) for surfaces or borders.
- NO oversaturated accent pastels (e.g. soft pastel baby-blue or pink button chips).
- NO mixed warm-brown and cool-gray neutrals within the same view.
- NO regex CSS attribute hacks (`[class*="..."]`) to override colors.

---

## 3. Typographic Architecture
Typography prioritizes vertical compactness, strict scannability, and numeric alignment across thousands of data points.

### Font Hierarchy & Roles
- **Display & Headings:** `Geist` — Track-tight (`-0.025em`), weight-driven hierarchy (600–800). No excessive screaming font sizes; scale contrast is achieved through optical weight and color stepping.
- **Body & Controls:** `Geist` — Clean geometric sans at 400–500 weight. Line height relaxed to `1.5`, maximum line length constrained to 65 characters.
- **Telemetry & Numbers:** `JetBrains Mono` — Mandatory for all metrics, dates, ranks, velocities, and tabular columns (`font-variant-numeric: tabular-nums`). Guarantees zero horizontal jitter across live updates.

### Scale System
| Role | Typeface | Size | Weight | Tracking / Leading |
| :--- | :--- | :--- | :--- | :--- |
| **Dossier Title** | `Geist` | `1.5rem` (24px) | 800 Bold | `-0.03em` / `1.1` |
| **Section Header** | `Geist` | `0.875rem` (14px) | 700 Bold | `-0.015em` / `1.2` (Uppercase) |
| **Body Standard** | `Geist` | `0.8125rem` (13px) | 400 Regular | `0em` / `1.5` |
| **Micro Annotation**| `Geist` | `0.6875rem` (11px) | 500 Medium | `+0.02em` / `1.2` |
| **Primary Metric** | `JetBrains Mono`| `1.75rem` (28px) | 700 Bold | `-0.02em` / `1.0` (Tabular) |
| **Secondary Metric**| `JetBrains Mono`| `1.125rem` (18px) | 600 SemiBold | `-0.01em` / `1.0` (Tabular) |
| **Table Data Cell** | `JetBrains Mono`| `0.75rem` (12px) | 450 Medium | `0em` / `1.0` (Tabular) |

### Banned Typography
- `Inter` is strictly BANNED across all headers and display text.
- Generic serif fonts (`Times New Roman`, `Georgia`, `Garamond`) are permanently BANNED.
- Serifs of any kind are BANNED in software dashboards.

---

## 4. Component Stylings & Bento SaaS Mechanics

### A. Bento Intelligence Cards (`rounded-2xl`)
- **Structure:** Clean Bento module container (`bg-white dark:bg-[#121215]`, border `border-[#E2E8F0] dark:border-[#27272A]`, radius `rounded-2xl`).
- **Shadow:** Subtle elevation shadow `shadow-xs` / `box-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04)`.
- **Card Header:** Flush header row with crisp uppercase section label (`Geist` 11px font-bold tracking-wider text-slate-500 dark:text-zinc-400) and contextual action pills.

### B. Integrated Telemetry Ribbon (5-Cell Tabular Strip)
- **Structure:** A unified single-row **Integrated Telemetry Ribbon** (`bg-white dark:bg-[#121215]`, border `border-[#E2E8F0] dark:border-[#27272A]`, `rounded-2xl`).
- **Columns (5 Unified Cells with 1px Vertical Dividers):**
  1. **Total audience** (mapped internally to `competitor_profiles.monthly_reach`) — Monospace count + trend delta.
  2. **Impressions** (mapped internally to `competitor_profiles.profile_views`) — Monospace count + snapshot delta.
  3. **Followers** — Total follower count + net change.
  4. **Pinning Velocity** — Rolling pins/day + monthly pacing estimate in high-contrast mono.
  5. **Engagement Virality** — Cumulative saves + 24H save delta (`+873/day`) with green breakout indicator.
- **Clean Semantic Pills:** Emerald/Amber/Sky semantic pill tags, never oversaturated circles.

### C. Segmented Navigation Bar
- **Structure:** Unified, Apple-Pro / Linear style segmented track (`bg-[#F1F5F9] dark:bg-[#18181B]`, `p-1`, `rounded-xl`).
- **Active State:** Pure white card surface (`bg-white dark:bg-[#27272A]`, `text-[#0F172A] dark:text-[#FAFAFA]`, `shadow-xs`).
- **Inactive State:** Crisp secondary text (`text-[#64748B] dark:text-[#A1A1AA]`, hover: `text-[#0F172A] dark:text-[#FAFAFA]`).
- **Zero Emojis:** Replaced with clean 14px Lucide micro-icons or crisp typographic labels.

### D. Analytics & Trend Studio (Asymmetric Bento Architecture)
- **Layout (70/30 Asymmetric Split):**
  - **Left Studio (70%):** Performance Trend Spline Canvas. Minimalist SVG paths (`#E11D48` for Audience, `#0EA5E9` for Impressions) with diffused area fills. Clean crosshair hover inspection.
  - **Right Studio (30%):** Virality & Velocity Breakdown. Dense, tabular stack showing 24H saves, repin ratio, account age, and strategy horizon.
- **Controls:** Micro-segmented pill toggle (`24h`, `5d`, `7d`, `15d`, `30d`, `ALL`) directly embedded in the canvas header.

### E. Historical Snapshot Ledger & Data Tables
- **Density:** 28px–32px row height. Tabular monospace numbers throughout.
- **Header:** Sticky header with `bg-[#F1F5F9] dark:bg-[#18181B]`, uppercase micro-headers (`text-[11px] font-semibold text-[#64748B] dark:text-[#71717A]`).
- **Row Hover:** Background shift to `#F8FAFC dark:bg-[#18181B]` with clear focus outlines.

---

## 5. Layout Principles & Spatial Discipline

### Grid-First Architecture
- Full layout constrained to `max-width: 1440px` with responsive horizontal padding (`clamp(1rem, 3vw, 2.5rem)`).
- Asymmetric 12-column CSS Grid. Flexbox is reserved exclusively for micro-alignments inside components.
- BANNED: The generic "3 equal cards horizontally" pattern. All primary sections follow an asymmetric Bento rhythm (Row 1: 5-cell ribbon | Row 2: 8-col chart + 4-col analytics).

### Spatial Separation (Zero Overlap Invariant)
- Every UI element occupies its own explicit grid cell or block container.
- Absolute-positioned text overlays, floating badge overlaps, and negative margin clipping are strictly forbidden.

---

## 6. Theme Architecture & SSR Safety (Rule 17)

### Unified Theme Storage
- **Canonical Key:** `pa_theme` (stored in `localStorage`).
- **Default State:** `'light'` (Light-Mode Bento SaaS).
- **Theme Activation:**
  - Light mode: `document.documentElement.classList.remove('dark')`.
  - Dark mode: `document.documentElement.classList.add('dark')`.
- **Zero Body Locks:** The `dark` class is never hardcoded on `<html class="dark">` or locked onto `<body>`. Tailwind's `darkMode: 'class'` reads directly from `document.documentElement`.
- **Node.js SSR Safety (Rule 17):**
  - All access to browser globals (`localStorage`, `window`, `document`) must be guarded:
    ```javascript
    const theme = (typeof localStorage !== 'undefined') ? localStorage.getItem('pa_theme') : 'light';
    if (typeof document !== 'undefined' && document.documentElement) { ... }
    ```
- **Zero Regex CSS Hacks:** Eradicate all `[class*="..."]` CSS attribute selector overrides. Color and surface styles are driven natively by Tailwind utilities and standard `:root` / `.dark` tokens.

---

## 7. Anti-Patterns & Banned AI Tells (Zero-Tolerance Checklist)

1. ❌ **NO Emojis Anywhere:** Replace `📋`, `🔗`, `🕸️`, `⚡`, `🏆`, `🟢` with precision SVG glyphs or text badges.
2. ❌ **NO Rainbow Tab Syndrome:** Never assign different solid colors to adjacent navigation tabs.
3. ❌ **NO Pastel Icon Bubbles:** Eradicate oversized pink, blue, green, and purple circular icon backgrounds behind metric numbers.
4. ❌ **NO Outdated Pinterest Terminology:** Never use `Profile Views` (strictly **`Impressions`**) or `Monthly Reach` (strictly **`Total audience`**). Eradicate all traces of `Smart Topic Clusters`.
5. ❌ **NO Inter Font on Display:** Use `Geist` for headers and `JetBrains Mono` for tabular figures.
6. ❌ **NO Pure Black (`#000000`):** Use Zinc-950 (`#09090B`) in dark mode and Slate-50 (`#F8FAFC`) in light mode.
7. ❌ **NO Regex CSS Attribute Hacks:** Ban all `[class*="bg-[#..."]` selectors in CSS stylesheets.
8. ❌ **NO Body Dark Locks:** Ban hardcoding `<html class="dark">` and `:class="... ? 'dark' : ''"` on `<body>`.
9. ❌ **NO AI Copywriting Clichés:** Ban terms like "Elevate your pins", "Unleash virality", "Seamless intelligence". Use quantitative labels ("Audience Velocity", "Net Delta", "Crawl Status").
