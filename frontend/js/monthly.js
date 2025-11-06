import {
  MONTHLY_CONTEXT_METRIC,
  MONTHLY_CONTEXT_SERVICE,
  MONTHLY_DEFAULT_TITLE,
  MONTHLY_INITIAL_MESSAGE,
  MONTHLY_METRIC_CONFIG,
  MONTHLY_RANGE_DEFAULT,
  SECTION_MONTHLY,
} from "./config.js";
import { elements, monthlyRangeButtons, summaryCards } from "./dom.js";
import {
  abortSectionController,
  resetMonthlyState,
  setSectionController,
  state,
} from "./state.js";
import { formatMonthLabel, formatMonthlyValue, fmtRub, toNumber } from "./formatters.js";
import { getMonthlyCacheKey, getMonthlyServiceCacheKey, getCachedResponse, setCachedResponse } from "./cache.js";
import { ensureAuthSession, getAuthorizationHeader, hasValidAuthSession } from "./auth/index.js";
import { requestWithDateFieldFallback } from "./api/dateField.js";
import { ensureApiBase } from "./api/base.js";
import { buildHttpError, isAuthError, isAbortError } from "./api/errors.js";
import { scheduleHeightUpdate } from "./resizer.js";
import {
  clearActiveServiceRow,
  getActiveServiceRow,
  setActiveServiceRowElement,
} from "./ui/serviceHighlight.js";

export function initializeMonthly() {
  bindSummaryCards();
  bindMonthlyRangeSwitch();
  resetMonthlyDetails();
}

export function resetMonthlyDetails() {
  resetMonthlyState();
  clearActiveServiceRow();
  setActiveMonthlyRangeButton(state.activeMonthlyRange);
  summaryCards.forEach((card) => card.classList.remove("is-active"));
  clearMonthlyRows();
  showMonthlyMessage(MONTHLY_INITIAL_MESSAGE);
  elements.monthlyCard?.classList.remove("hidden");
  if (elements.monthlyTitle) {
    elements.monthlyTitle.textContent = MONTHLY_DEFAULT_TITLE;
  }
  abortSectionController(SECTION_MONTHLY);
}

export function getActiveServiceType() {
  return state.activeMonthlyContext === MONTHLY_CONTEXT_SERVICE ? state.activeMonthlyService : null;
}

export function handleServiceNameClick(row, serviceType) {
  const normalizedService = (serviceType ?? "").trim();
  if (!normalizedService) {
    return;
  }

  const isMonthlyCardVisible = elements.monthlyCard?.classList.contains("hidden") === false;
  if (
    state.activeMonthlyContext === MONTHLY_CONTEXT_SERVICE &&
    getActiveServiceRow() === row &&
    isMonthlyCardVisible
  ) {
    resetMonthlyDetails();
    return;
  }

  if (!hasValidAuthSession()) {
    const event = new CustomEvent("monthly:auth-required", { bubbles: true });
    document.dispatchEvent(event);
    return;
  }

  state.activeMonthlyContext = MONTHLY_CONTEXT_SERVICE;
  state.activeMonthlyService = normalizedService;
  state.activeMonthlyMetric = null;
  state.activeSummaryCard = null;
  summaryCards.forEach((card) => card.classList.remove("is-active"));
  setActiveServiceRowElement(row);

  state.activeMonthlyRange = MONTHLY_RANGE_DEFAULT;
  setActiveMonthlyRangeButton(state.activeMonthlyRange);

  if (elements.monthlyTitle) {
    elements.monthlyTitle.textContent = normalizedService;
  }
  elements.monthlyCard?.classList.remove("hidden");

  showMonthlyMessage("Загрузка...");
  clearMonthlyRows();
  loadMonthlyService(normalizedService, state.activeMonthlyRange);
}

export function notifyServicesCleared() {
  if (state.activeMonthlyContext === MONTHLY_CONTEXT_SERVICE) {
    resetMonthlyDetails();
  }
}

function bindSummaryCards() {
  summaryCards.forEach((card) => {
    if (!card.dataset.metric) {
      return;
    }
    card.setAttribute("role", "button");
    if (!card.hasAttribute("tabindex")) {
      card.setAttribute("tabindex", "0");
    }
    card.addEventListener("click", () => {
      handleSummaryCardClick(card, card.dataset.metric);
    });
    card.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        handleSummaryCardClick(card, card.dataset.metric);
      }
    });
  });
}

function bindMonthlyRangeSwitch() {
  monthlyRangeButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const { monthlyRange } = btn.dataset;
      if (!monthlyRange || monthlyRange === state.activeMonthlyRange) {
        return;
      }
      state.activeMonthlyRange = monthlyRange;
      setActiveMonthlyRangeButton(state.activeMonthlyRange);
      if (state.activeMonthlyContext === MONTHLY_CONTEXT_METRIC && state.activeMonthlyMetric) {
        showMonthlyMessage("Загрузка...");
        clearMonthlyRows();
        loadMonthlyMetric(state.activeMonthlyMetric, state.activeMonthlyRange);
      } else if (
        state.activeMonthlyContext === MONTHLY_CONTEXT_SERVICE &&
        state.activeMonthlyService
      ) {
        showMonthlyMessage("Загрузка...");
        clearMonthlyRows();
        loadMonthlyService(state.activeMonthlyService, state.activeMonthlyRange);
      }
    });
  });
}

function handleSummaryCardClick(card, metric) {
  if (!metric || !MONTHLY_METRIC_CONFIG[metric]) {
    return;
  }

  const isMonthlyCardVisible = elements.monthlyCard?.classList.contains("hidden") === false;
  if (state.activeSummaryCard === card && isMonthlyCardVisible) {
    resetMonthlyDetails();
    return;
  }

  if (!hasValidAuthSession()) {
    const event = new CustomEvent("monthly:auth-required", { bubbles: true });
    document.dispatchEvent(event);
    return;
  }

  state.activeMonthlyContext = MONTHLY_CONTEXT_METRIC;
  state.activeMonthlyService = null;
  state.activeSummaryCard = card;
  summaryCards.forEach((item) => {
    item.classList.toggle("is-active", item === card);
  });
  clearActiveServiceRow();

  state.activeMonthlyMetric = metric;
  state.activeMonthlyRange = MONTHLY_RANGE_DEFAULT;
  setActiveMonthlyRangeButton(state.activeMonthlyRange);

  if (elements.monthlyTitle) {
    elements.monthlyTitle.textContent = MONTHLY_METRIC_CONFIG[metric].label;
  }
  elements.monthlyCard?.classList.remove("hidden");

  showMonthlyMessage("Загрузка...");
  clearMonthlyRows();
  loadMonthlyMetric(metric, state.activeMonthlyRange);
}

function setActiveMonthlyRangeButton(range) {
  monthlyRangeButtons.forEach((btn) => {
    if (!btn) {
      return;
    }
    const isActive = btn.dataset.monthlyRange === range;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-pressed", isActive ? "true" : "false");
  });
}

function showMonthlyMessage(message) {
  if (elements.monthlyEmpty) {
    elements.monthlyEmpty.textContent = message;
    elements.monthlyEmpty.classList.remove("hidden");
  }
  elements.monthlyTable?.classList.add("hidden");
}

function clearMonthlyRows() {
  if (elements.monthlyRows) {
    elements.monthlyRows.innerHTML = "";
  }
}

function renderMonthlySeries(points, aggregateValue, formatValue) {
  if (!elements.monthlyTable || !elements.monthlyEmpty || !elements.monthlyRows) {
    return;
  }

  const safePoints = Array.isArray(points) ? points.slice() : [];
  if (safePoints.length === 0) {
    showMonthlyMessage("Данных за выбранный период нет");
    return;
  }

  elements.monthlyEmpty.classList.add("hidden");
  elements.monthlyTable.classList.remove("hidden");
  clearMonthlyRows();

  const fragment = document.createDocumentFragment();

  const sortedPoints = safePoints.sort((a, b) => new Date(b.month) - new Date(a.month));

  sortedPoints.forEach((point) => {
    const row = document.createElement("div");
    row.className = "monthly-row";

    const monthEl = document.createElement("div");
    monthEl.className = "monthly-row__month";
    monthEl.textContent = formatMonthLabel(point.month);

    const valueEl = document.createElement("div");
    valueEl.className = "monthly-row__value";
    const numericValue = toNumber(point?.value);
    valueEl.textContent = formatValue(numericValue);

    row.append(monthEl, valueEl);
    fragment.append(row);
  });

  if (aggregateValue !== null && aggregateValue !== undefined) {
    const totalRow = document.createElement("div");
    totalRow.className = "monthly-row monthly-row--total";

    const totalLabel = document.createElement("div");
    totalLabel.className = "monthly-row__month monthly-row__month--total";
    totalLabel.textContent = "Итого";

    const totalValue = document.createElement("div");
    totalValue.className = "monthly-row__value monthly-row__value--total";
    totalValue.textContent = formatValue(toNumber(aggregateValue));

    totalRow.append(totalLabel, totalValue);
    fragment.append(totalRow);
  }

  elements.monthlyRows.append(fragment);
  scheduleHeightUpdate();
}

function renderMonthlyMetrics(metric, payload) {
  if (
    !payload ||
    metric !== state.activeMonthlyMetric ||
    state.activeMonthlyContext !== MONTHLY_CONTEXT_METRIC
  ) {
    return;
  }
  if (payload?.range && payload.range !== state.activeMonthlyRange) {
    return;
  }

  const points = Array.isArray(payload?.points) ? payload.points : [];
  const aggregateValue = Object.prototype.hasOwnProperty.call(payload ?? {}, "aggregate")
    ? payload.aggregate
    : null;

  renderMonthlySeries(points, aggregateValue, (value) => formatMonthlyValue(metric, value));
}

function renderMonthlyService(serviceType, payload) {
  if (
    !payload ||
    state.activeMonthlyContext !== MONTHLY_CONTEXT_SERVICE ||
    serviceType !== state.activeMonthlyService
  ) {
    return;
  }
  if (payload?.range && payload.range !== state.activeMonthlyRange) {
    return;
  }

  const points = Array.isArray(payload?.points) ? payload.points : [];
  const aggregateValue = Object.prototype.hasOwnProperty.call(payload ?? {}, "aggregate")
    ? payload.aggregate
    : null;

  renderMonthlySeries(points, aggregateValue, (value) => fmtRub(value));
}

async function executeMonthlyRequest({ cacheKey, fetchData, onSuccess, onAuthError, onError }) {
  if (!ensureAuthSession()) {
    return false;
  }

  const cached = getCachedResponse(cacheKey);
  if (cached) {
    onSuccess(cached);
    return true;
  }

  abortSectionController(SECTION_MONTHLY);

  const controller = new AbortController();
  setSectionController(SECTION_MONTHLY, controller);

  try {
    const data = await fetchData({ signal: controller.signal });
    setCachedResponse(cacheKey, data);
    onSuccess(data);
    return true;
  } catch (error) {
    if (isAbortError(error)) {
      return false;
    }
    if (isAuthError(error)) {
      if (typeof onAuthError === "function") {
        onAuthError(error);
      }
      return false;
    }
    if (typeof onError === "function") {
      onError(error);
    }
    return false;
  } finally {
    if (state.controllers?.[SECTION_MONTHLY] === controller) {
      setSectionController(SECTION_MONTHLY, null);
    }
  }
}

async function fetchMonthlyServiceData({ baseUrl, serviceType, range, signal }) {
  const params = new URLSearchParams({
    service_type: serviceType,
    range,
  });

  const url = `${baseUrl}/api/services/monthly?${params.toString()}`;
  const resp = await fetch(url, {
    headers: getAuthorizationHeader(),
    signal,
  });

  if (!resp.ok) {
    throw await buildHttpError(resp);
  }

  return await resp.json();
}

function handleMonthlyAuthError(error) {
  const event = new CustomEvent("monthly:auth-error", { detail: error, bubbles: true });
  document.dispatchEvent(event);
  showMonthlyMessage("Для просмотра требуется авторизация");
}

async function loadMonthlyMetric(metric, range) {
  const cacheKey = getMonthlyCacheKey(metric, range);
  return executeMonthlyRequest({
    cacheKey,
    fetchData: ({ signal }) =>
      requestWithDateFieldFallback({
        path: "/api/metrics/monthly",
        baseParams: { metric, range },
        includeDateField: true,
        signal,
        headers: getAuthorizationHeader(),
      }),
    onSuccess: (data) => renderMonthlyMetrics(metric, data),
    onAuthError: handleMonthlyAuthError,
    onError: (error) => {
      console.error("Ошибка загрузки помесячных данных", error);
      showMonthlyMessage(`Ошибка загрузки данных: ${error.message}`);
    },
  });
}

async function loadMonthlyService(serviceType, range) {
  const baseUrl = ensureApiBase();
  if (!baseUrl) {
    return false;
  }

  const normalizedService = (serviceType || "").trim();
  if (!normalizedService) {
    return false;
  }

  const cacheKey = getMonthlyServiceCacheKey(normalizedService, range);
  return executeMonthlyRequest({
    cacheKey,
    fetchData: ({ signal }) =>
      fetchMonthlyServiceData({
        baseUrl,
        serviceType: normalizedService,
        range,
        signal,
      }),
    onSuccess: (data) => renderMonthlyService(normalizedService, data),
    onAuthError: handleMonthlyAuthError,
    onError: (error) => {
      console.error("Ошибка загрузки помесячных данных по услугам", error);
      showMonthlyMessage(`Ошибка загрузки данных: ${error.message}`);
    },
  });
}
