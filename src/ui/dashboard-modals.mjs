/**
 * src/ui/dashboard-modals.mjs
 *
 * Modular Dashboard Modals, Drawers & Lightbox Composer.
 */
import { renderDashboardDossierDrawers } from './modals/dashboard-dossier-drawers.mjs';
import { renderDashboardClusterModals } from './modals/dashboard-cluster-modals.mjs';
import { renderDashboardCreatorModals } from './modals/dashboard-creator-modals.mjs';
import { renderCreatorVisualFeedModal } from './shared/creator-visual-feed-modal.mjs';

export function getDashboardModalsHtml() {
  return [
    renderDashboardDossierDrawers(),
    renderDashboardClusterModals(),
    renderDashboardCreatorModals(),
    renderCreatorVisualFeedModal({ variant: 'dashboard' })
  ].join('\n\n');
}
