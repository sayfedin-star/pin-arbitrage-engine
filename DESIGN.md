# Design System: Pin Arbitrage Engine (PAE)
**Skill:** stitch-design-taste
**Subsystem Authority:** Creator Hub & Quantitative Arbitrage Studio

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
A high-density, quantitative intelligence workspace engineered for professional Pinterest arbitrage operators and growth engineers. The aesthetic merges the ruthless efficiency of a financial trading terminal with the typographic restraint of an architecture studio. 

Every pixel communicates functional state. Atmospheric density is tuned to **Cockpit Dense (Level 8)**, eliminating bloated whitespace and pastel fluff in favor of razor-thin 1px structural lines, high-contrast typography, and tabular alignment. The interface feels expensive, disciplined, and alive—replacing generic SaaS cards with integrated telemetry ribbons and asymmetric Bento modules.

---

## 2. Color Palette & Functional Roles
The palette is built upon a clinical Zinc neutral scale. Chromatic color is strictly functional, governed by a singular signature accent and precision signal markers.

### Core Surface & Text Hierarchy
- **Canvas Base** (`#09090B`) — Deep Zinc-950 canvas. Provides optical grounding for dense analytical data.
- **Surface Elevation 1** (`#121215`) — Primary container and module background. Replaces floating cards with flush structural panes.
- **Surface Elevation 2** (`#18181B`) — Active rows, hover layers, popovers, and segmented pill wells.
- **Surface Highlight** (`#27272A`) — Interactive hover states and subtle button backgrounds.
- **Primary Ink** (`#FAFAFA`) — High-contrast text, primary headers, and high-priority metrics.
- **Steel Secondary** (`#A1A1AA`) — Field descriptions, secondary telemetry, and inactive tab labels.
- **Muted Slate** (`#71717A`) — Timestamps, unit denominators, and table column super-headers.
- **Whisper Border** (`#27272A`) — 1px structural boundaries.
- **Subtle Divider** (`#1E1E22`) — Micro grid dividers between table cells and telemetry ribbons.

### Signature Accent (Single Brand Focus)
- **Deep Rose** (`#E11D48`) — Functional accent representing Pinterest arbitrage authority, active filter selections, and primary interactive triggers. Saturation capped at 78%.

### Operational Signal Indicators (Strict Telemetry Only)
- **Signal Emerald** (`#10B981`) — Positive save velocity, audience acceleration, and qualified winner status.
- **Signal Amber** (`#F59E0B`) — Ingestion warnings, rate throttles, and fresh breakout verification windows.
- **Signal Sky** (`#0EA5E9`) — Neutral impressions telemetry and external Pinterest platform links.
- **Signal Slate** (`#3F3F46`) — Inactive, baseline-pending, or paused ingest states.

### Banned Color Patterns
- NO AI purple/blue neon glows or multi-colored gradients.
- NO pure black (`#000000`) for surfaces or borders.
- NO oversaturated accent pastels (e.g. soft pastel baby-blue or pink button chips).
- NO mixed warm-brown and cool-gray neutrals within the same view.

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

## 4. Component Stylings & Interaction Mechanics

### A. Dossier Identity Hero (Eliminating the Floating Box Clutter)
- **Structure:** Flush, integrated header ribbon (`bg-[#121215]`, border `#27272A`).
- **Creator Badge:** High-density 48x48px rounded-xl avatar with a 1px border.
- **Verified Indicators:** Micro-pills (`JetBrains Mono`, 10px) with single-dot indicators (`🟢 Live Ingest`, `⏸ Paused`).
- **Action Group:** Segmented tactile button cluster. Primary actions (`Pulse Profile`, `Refresh Winners`, `Fleet Crawl`) share a unified height (32px) with crisp `-1px` active push feedback.

### B. Telemetry Ribbon (Replacing the 8-Card Metric Explosion)
- **The Problem:** The legacy layout uses two rows of 4 bloated cards with baby-pink and baby-blue pastel icon circles.
- **The Solution:** A unified, single-row **Integrated Telemetry Ribbon** (`bg-[#121215]`, 1px border `#27272A`).
- **Columns (5 Unified Cells with 1px Vertical Dividers):**
  1. **Total audience** (Formerly Monthly Reach) — Current count + 30-day trend delta.
  2. **Impressions** (Formerly Profile Views) — Current count + snapshot delta.
  3. **Followers** — Total follower count + net change.
  4. **Pinning Velocity** — Rolling pins/day + monthly pacing estimate in high-contrast mono.
  5. **Engagement Virality** — Cumulative saves + 24H save delta (`+873/day`) with green breakout indicator.
- **Zero Pastel Circles:** Replaced with clean micro-labels (`label-caps`, 10px `#71717A`) and bold monospace figures.

### C. Segmented Navigation Bar (Eradicating Rainbow Tabs & Emojis)
- **The Problem:** 5 tabs with 5 conflicting bright background colors (Pink, Indigo, Green, Amber, Slate) and emojis (`📋`, `🔗`, `🕸️`).
- **The Solution:** A unified, Apple-Pro/Linear style segmented track in `#121215`.
- **Active State:** Deep Rose (`#E11D48`) or crisp Zinc-100 highlight with high-contrast text.
- **Inactive State:** Clean `#71717A` with hover brightening to `#FAFAFA`.
- **Zero Emojis:** Replaced with clean 14px Lucide micro-icons or clean typography.

### D. Analytics & Trend Studio (Asymmetric Bento Architecture)
- **Layout (70/30 Asymmetric Split):**
  - **Left Studio (70%):** Performance Trend Spline Canvas. Minimalist SVG paths (`#E11D48` for Audience, `#0EA5E9` for Impressions) with diffused zero-blur area gradients. Clean crosshair hover inspection.
  - **Right Studio (30%):** Virality & Velocity Breakdown. Dense, tabular stack showing 24H saves, repin ratio, account age, and strategy horizon.
- **Controls:** Micro-segmented pill toggle (`7D`, `30D`, `90D`, `YTD`, `ALL`) directly embedded in the canvas header.

### E. Historical Snapshot Ledger (Import History)
- **Density:** 28px row height. Tabular numbers throughout.
- **Table Controls:** Integrated inline header with density toggle (`Compact` vs `Comfortable`), date timeframe selector, and column visibility dropdown.
- **Net Change Ribbon:** Sticky top summary row styled with distinct background (`#18181B`) and emerald/rose delta tags.
- **Row Hover:** Crisp background shift to `#18181B` with flush trash/audit triggers appearing on hover only.

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

## 6. Motion Philosophy & Micro-Interactions

### Spring Physics Specifications
- All interactive controls, accordion transitions, and modal overlays utilize spring-based physics:
  - `stiffness: 100`
  - `damping: 20`
  - `mass: 1.0`
- Linear easing (`linear`) is banned.

### Perpetual Micro-Loops
- **Live Ingest Status:** Perpetual breathing micro-pulse on status dot (`opacity: 0.4` to `1.0` over 3000ms).
- **Crawl Progress:** Micro-shimmer sweep across progress rails. No circular spinners.
- **Hardware Acceleration:** All animations strictly operate on `transform` and `opacity`. Never animate `top`, `left`, `width`, or `height`.

---

## 7. Anti-Patterns & Banned AI Tells (Zero-Tolerance Checklist)

1. ❌ **NO Emojis Anywhere:** Replace `📋`, `🔗`, `🕸️`, `⚡`, `🏆`, `🟢` with precision SVG glyphs or text badges.
2. ❌ **NO Rainbow Tab Syndrome:** Never assign different solid colors to adjacent navigation tabs.
3. ❌ **NO Pastel Icon Bubbles:** Eradicate oversized pink, blue, green, and purple circular icon backgrounds behind metric numbers.
4. ❌ **NO Outdated Pinterest Terminology:** Never use `Profile Views` (strictly **`Impressions`**) or `Monthly Reach` (strictly **`Total audience`**). Eradicate all traces of `Smart Topic Clusters`.
5. ❌ **NO Inter Font on Display:** Use `Geist` for headers and `JetBrains Mono` for tabular figures.
6. ❌ **NO Pure Black (`#000000`):** Use Zinc-950 (`#09090B`).
7. ❌ **NO Floating Metric Explosion:** Never render 8 separate floating cards for single numbers. Group related indicators into cohesive, segmented ribbons.
8. ❌ **NO AI Copywriting Clichés:** Ban terms like "Elevate your pins", "Unleash virality", "Seamless intelligence". Use quantitative labels ("Audience Velocity", "Net Delta", "Crawl Status").
