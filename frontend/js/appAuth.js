import { clearCache } from "./cache.js";
import { persistSession, readStoredSession, updateAuthSession } from "./auth/index.js";
import { elements } from "./dom.js";
import { state, cancelRevenueFetch, cancelServicesFetch } from "./state.js";
import { resetMonthlyDetails } from "./monthly.js";
import { showGate, hideGate } from "./ui/gate.js";
import { setRangeToCurrentMonth } from "./filters.js";

export function handleAuthFailure(message) {
  persistSession(null);
  updateAuthSession(null);
  clearCache();
  state.lastTriggeredRange.from = null;
  state.lastTriggeredRange.to = null;
  state.servicesDirty = true;
  resetMonthlyDetails();
  showGate(message);
}

export async function handleAuthSuccess(session, { fetchRevenue, fetchServices }) {
  updateAuthSession(session);
  persistSession(session);
  clearCache();
  resetMonthlyDetails();
  if (!elements.fromDate.value || !elements.toDate.value) {
    setRangeToCurrentMonth();
  }
  cancelRevenueFetch();
  cancelServicesFetch();
  const [okRevenue, okServices] = await Promise.all([
    fetchRevenue(),
    fetchServices(),
  ]);
  if (okRevenue) {
    if (elements.pwdInput) {
      elements.pwdInput.value = "";
    }
    hideGate();
  }
  if (!okServices) {
    state.servicesDirty = true;
  }
}

export function restoreSessionFromStorage({ fetchRevenue, fetchServices }) {
  const stored = readStoredSession();
  if (stored) {
    updateAuthSession(stored);
    clearCache();
    hideGate();
    fetchRevenue();
    fetchServices();
  } else {
    updateAuthSession(null);
    showGate();
  }
}
