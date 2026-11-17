/**
 * Pin Details UI Stylesheet
 * Bento SaaS Design System tokens and clean utility styles
 * Replaces legacy regex attribute hacks with standard CSS variables
 */

export function getPinDetailsStyles() {
  return `
  <style>

    /* ======================================================== */
    /* DESIGN SYSTEM TOKENS: BENTO SAAS (LIGHT DEFAULT)         */
    /* ======================================================== */
    :root {
      --canvas-bg: #F8FAFC;
      --surface-card: #FFFFFF;
      --surface-secondary: #F1F5F9;
      --surface-hover: #E2E8F0;
      --surface-highlight: #E2E8F0;
      --border-subtle: #E2E8F0;
      --border-divider: #F1F5F9;
      --text-primary: #0F172A;
      --text-secondary: #64748B;
      --text-muted: #94A3B8;
      --accent-rose: #E11D48;
      --signal-emerald: #10B981;
      --signal-amber: #F59E0B;
      --signal-sky: #0EA5E9;
      --card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.04), 0 1px 2px -1px rgba(0, 0, 0, 0.04);
      color-scheme: light;
    }

    .dark {
      --canvas-bg: #09090B;
      --surface-card: #121215;
      --surface-secondary: #18181B;
      --surface-hover: #27272A;
      --surface-highlight: #27272A;
      --border-subtle: #27272A;
      --border-divider: #1E1E22;
      --text-primary: #FAFAFA;
      --text-secondary: #A1A1AA;
      --text-muted: #71717A;
      --accent-rose: #E11D48;
      --signal-emerald: #10B981;
      --signal-amber: #F59E0B;
      --signal-sky: #0EA5E9;
      --card-shadow: 0 1px 3px 0 rgba(0, 0, 0, 0.4);
      color-scheme: dark;
    }


    /* Bento SaaS Container Styles */
    .bento-card {
      background-color: var(--surface-card);
      border: 1px solid var(--border-subtle);
      border-radius: 1rem;
      box-shadow: var(--card-shadow);
      transition: border-color 0.15s ease, box-shadow 0.15s ease;
    }

    .bento-surface {
      background-color: var(--surface-secondary);
      border: 1px solid var(--border-subtle);
    }

    .bento-canvas {
      background-color: var(--canvas-bg);
    }

    /* Crisp Semantic Pills */
    .bento-pill-emerald {
      background-color: #ecfdf5;
      color: #065f46;
      border: 1px solid #a7f3d0;
    }
    .dark .bento-pill-emerald {
      background-color: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.3);
    }

    .bento-pill-amber {
      background-color: #fffbeb;
      color: #92400e;
      border: 1px solid #fde68a;
    }
    .dark .bento-pill-amber {
      background-color: rgba(245, 158, 11, 0.15);
      color: #fbbf24;
      border-color: rgba(245, 158, 11, 0.3);
    }

    .bento-pill-rose {
      background-color: #fff1f2;
      color: #9f1239;
      border: 1px solid #fecdd3;
    }
    .dark .bento-pill-rose {
      background-color: rgba(225, 29, 72, 0.15);
      color: #fb7185;
      border-color: rgba(225, 29, 72, 0.3);
    }

    .bento-pill-sky {
      background-color: #f0f9ff;
      color: #075985;
      border: 1px solid #bae6fd;
    }
    .dark .bento-pill-sky {
      background-color: rgba(14, 165, 233, 0.15);
      color: #38bdf8;
      border-color: rgba(14, 165, 233, 0.3);
    }

    /* Form Elements & Inputs */
    select, input {
      color: var(--text-primary);
    }

    /* SVG Chart Grid Adaptations */
    svg line.grid-line {
      stroke: var(--border-subtle);
    }
    .dark svg line.grid-line {
      stroke: #27272A;
    }
  </style>
  `;
}
