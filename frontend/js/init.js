import { DEFAULT_ACTIVE_SECTION } from "./config.js";
import { initializeFilters, bindFilterControls } from "./filters.js";
import { bindSectionSwitch, applySection } from "./sections.js";
import { bindPasswordForm } from "./password.js";
import { fetchRevenueMetrics } from "./revenue.js";
import { fetchServicesMetrics } from "./services.js";
import { initializeMonthly } from "./monthly.js";
import { state } from "./state.js";
import { bindLoadingIndicator } from "./ui/loadingIndicator.js";
import { setupHeightAutoResize } from "./resizer.js";
import { handleAuthFailure, restoreSessionFromStorage } from "./appAuth.js";
import { showGate } from "./ui/gate.js";

function initializeEventHandlers() {
  bindFilterControls({
    onFetchRevenue: fetchRevenueMetrics,
    onFetchServices: fetchServicesMetrics,
  });
  bindSectionSwitch();
  bindPasswordForm({ fetchRevenue: fetchRevenueMetrics, fetchServices: fetchServicesMetrics });
}

function applyInitialSectionState() {
  state.activeSection = state.activeSection || DEFAULT_ACTIVE_SECTION;
  applySection(state.activeSection);
}

function initAuthEventHandlers() {
  document.addEventListener("monthly:auth-required", () => {
    showGate();
  });

  document.addEventListener("monthly:auth-error", (event) => {
    const message = event.detail?.message || "Неверный токен или сессия истекла.";
    handleAuthFailure(message);
  });
}

function init() {
  bindLoadingIndicator();
  initializeMonthly();
  initializeFilters();
  initializeEventHandlers();
  initAuthEventHandlers();
  applyInitialSectionState();
  restoreSessionFromStorage({
    fetchRevenue: fetchRevenueMetrics,
    fetchServices: fetchServicesMetrics,
  });
  setupHeightAutoResize();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
