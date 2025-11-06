import {
  DEFAULT_ACTIVE_SECTION,
  MONTHLY_CONTEXT_METRIC,
  MONTHLY_CONTEXT_SERVICE,
  MONTHLY_RANGE_DEFAULT,
  SECTION_MONTHLY,
  SECTION_REVENUE,
  SECTION_SERVICES,
} from "./config.js";

export const state = {
  authSession: null,
  revenueFetchTimer: null,
  servicesFetchTimer: null,
  controllers: {
    [SECTION_REVENUE]: null,
    [SECTION_SERVICES]: null,
    [SECTION_MONTHLY]: null,
  },
  loadingCounter: 0,
  servicesDirty: true,
  activeSection: DEFAULT_ACTIVE_SECTION,
  activeSummaryCard: null,
  activeMonthlyMetric: null,
  activeMonthlyRange: MONTHLY_RANGE_DEFAULT,
  activeMonthlyContext: null,
  activeMonthlyService: null,
  activeServiceRow: null,
  lastTriggeredRange: { from: null, to: null },
};

export const monthlyStateKeys = {
  metricContext: MONTHLY_CONTEXT_METRIC,
  serviceContext: MONTHLY_CONTEXT_SERVICE,
};

export function setAuthSession(session) {
  state.authSession = session ? { ...session } : null;
}

export function clearAuthSession() {
  state.authSession = null;
}

export function cancelRevenueFetch() {
  if (state.revenueFetchTimer !== null) {
    clearTimeout(state.revenueFetchTimer);
    state.revenueFetchTimer = null;
  }
}

export function cancelServicesFetch() {
  if (state.servicesFetchTimer !== null) {
    clearTimeout(state.servicesFetchTimer);
    state.servicesFetchTimer = null;
  }
}

export function scheduleRevenueFetch(callback, delay) {
  cancelRevenueFetch();
  state.revenueFetchTimer = window.setTimeout(() => {
    state.revenueFetchTimer = null;
    callback();
  }, delay);
}

export function scheduleServicesFetch(callback, delay) {
  cancelServicesFetch();
  state.servicesFetchTimer = window.setTimeout(() => {
    state.servicesFetchTimer = null;
    callback();
  }, delay);
}

export function getSectionController(section) {
  return state.controllers[section] || null;
}

export function setSectionController(section, controller) {
  state.controllers[section] = controller;
}

export function abortSectionController(section) {
  const controller = getSectionController(section);
  if (controller) {
    setSectionController(section, null);
    setLoadingState(false);
    controller.abort();
  }
}

export function setLoadingState(isLoading) {
  if (isLoading) {
    state.loadingCounter += 1;
    document.body.classList.add("is-loading");
  } else {
    state.loadingCounter = Math.max(0, state.loadingCounter - 1);
    if (state.loadingCounter === 0) {
      document.body.classList.remove("is-loading");
    }
  }
}

export function setActiveServiceRow(row) {
  if (state.activeServiceRow && state.activeServiceRow !== row) {
    state.activeServiceRow.classList.remove("is-active");
  }
  state.activeServiceRow = row || null;
  if (state.activeServiceRow) {
    state.activeServiceRow.classList.add("is-active");
  }
}

export function resetMonthlyState() {
  state.activeSummaryCard = null;
  state.activeMonthlyMetric = null;
  state.activeMonthlyService = null;
  state.activeMonthlyContext = null;
  state.activeMonthlyRange = MONTHLY_RANGE_DEFAULT;
  setActiveServiceRow(null);
}
