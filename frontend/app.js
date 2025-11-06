// ======= Config =======
const DEFAULT_API_BASE = "https://u4s-turnover-karinausadba.amvera.io";
const DATE_FIELD_CREATED = "created";
const DATE_FIELD_CHECKIN = "checkin";
const SECTION_REVENUE = "revenue";
const SECTION_SERVICES = "services";
const SECTION_MONTHLY = "monthly";
const DEFAULT_ACTIVE_SECTION = SECTION_REVENUE;
const DATE_FIELD = DATE_FIELD_CREATED; // DATE_FIELD_CREATED | DATE_FIELD_CHECKIN

function normalizeBase(url) {
  return url.replace(/\/+$/, "");
}

function resolveApiBase() {
  const override = typeof window.U4S_API_BASE === "string" ? window.U4S_API_BASE.trim() : "";
  if (override) {
    return normalizeBase(override);
  }

  if (DEFAULT_API_BASE) {
    return normalizeBase(DEFAULT_API_BASE);
  }

  const origin = window.location && window.location.origin;
  if (origin && origin !== "null" && origin !== "file://") {
    return normalizeBase(origin);
  }

  return "";
}

const API_BASE = resolveApiBase();

const $ = (sel) => document.querySelector(sel);
const $$ = (sel) => Array.from(document.querySelectorAll(sel));

const dashboard = $(".dashboard");
const filterTitle = $("#filterTitle");
const fromDate = $("#fromDate");
const toDate = $("#toDate");
const filterError = $("#filterError");
const revenueValue = $("#revenue");
const avg = $("#avg");
const count = $("#count");
const share = $("#share");
const minv = $("#min");
const maxv = $("#max");
const stay = $("#stay");
const bonus = $("#bonus");
const servicesShareValue = $("#servicesShare");
const resetFiltersBtn = $("#resetFiltersBtn");
const btnCurMonth = $("#btnCurMonth");
const btnPrevMonth = $("#btnPrevMonth");
const sectionButtons = $$('[data-section-target]');
const revenueSection = $("#revenueSection");
const servicesSection = $("#servicesSection");
const servicesList = $("#servicesList");
const servicesTotal = $("#servicesTotal");
const gate = $("#gate");
const errBox = $("#err");
const pwdInput = $("#pwd");
const goBtn = $("#goBtn");
const summaryCards = $$(".info-summary .summary-card");
const monthlyCard = $("#monthlyDetails");
const monthlyTitle = $("#monthlyTitle");
const monthlyEmpty = $("#monthlyEmpty");
const monthlyTable = $("#monthlyTable");
const monthlyRows = $("#monthlyRows");
const monthlyRangeButtons = $$('[data-monthly-range]');

const presetButtons = [btnCurMonth, btnPrevMonth];

const STORAGE_KEY = "u4sRevenueAuthHash";
const FETCH_DEBOUNCE_DELAY = 600;

const MONTHLY_RANGE_THIS_YEAR = "this_year";
const MONTHLY_RANGE_LAST_12 = "last_12_months";
const MONTHLY_RANGE_DEFAULT = MONTHLY_RANGE_THIS_YEAR;
const MONTHLY_INITIAL_MESSAGE = "Выберите показатель, чтобы увидеть динамику";
const MONTHLY_DEFAULT_TITLE = "Помесячная динамика";
const MONTHLY_CONTEXT_METRIC = "metric";
const MONTHLY_CONTEXT_SERVICE = "service";

const requestCache = new Map();
const REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_CACHE_MAX_ENTRIES = 50;

const RUB_FORMATTER = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const percentFormatters = new Map();
const numberFormatters = new Map();

function getPercentFormatter(digits) {
  if (!percentFormatters.has(digits)) {
    percentFormatters.set(
      digits,
      new Intl.NumberFormat("ru-RU", {
        style: "percent",
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    );
  }
  return percentFormatters.get(digits);
}

function getNumberFormatter(digits) {
  if (!numberFormatters.has(digits)) {
    numberFormatters.set(
      digits,
      new Intl.NumberFormat("ru-RU", {
        minimumFractionDigits: digits,
        maximumFractionDigits: digits,
      })
    );
  }
  return numberFormatters.get(digits);
}

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

const MONTHLY_METRIC_CONFIG = {
  revenue: { label: "Выручка всего", format: { type: "currency" } },
  bookings_count: { label: "Кол-во номеров", format: { type: "number", digits: 0 } },
  level2plus_share: { label: "Повт. клиенты", format: { type: "percent", digits: 0 } },
  avg_check: { label: "Средний чек", format: { type: "currency" } },
  min_booking: { label: "Мин. чек", format: { type: "currency" } },
  max_booking: { label: "Макс. чек", format: { type: "currency" } },
  avg_stay_days: {
    label: "Ср. срок прожив.",
    format: { type: "number", digits: 1, suffix: " дн." },
  },
  bonus_payment_share: {
    label: "Оплата бонусами",
    format: { type: "percent", digits: 1 },
  },
  services_share: { label: "Доля услуг", format: { type: "percent", digits: 0 } },
};

function getCachedResponse(key) {
  const entry = requestCache.get(key);
  if (!entry) {
    return null;
  }
  if (entry.expiresAt < Date.now()) {
    requestCache.delete(key);
    return null;
  }
  return entry.data;
}

function pruneCacheSize() {
  if (requestCache.size <= REQUEST_CACHE_MAX_ENTRIES) {
    return;
  }

  const sortedKeys = Array.from(requestCache.entries())
    .sort((a, b) => a[1].expiresAt - b[1].expiresAt)
    .map(([key]) => key);

  while (requestCache.size > REQUEST_CACHE_MAX_ENTRIES && sortedKeys.length) {
    const keyToDelete = sortedKeys.shift();
    requestCache.delete(keyToDelete);
  }
}

function setCachedResponse(key, data) {
  const expiresAt = Date.now() + REQUEST_CACHE_TTL_MS;
  requestCache.set(key, { data, expiresAt });
  pruneCacheSize();
}

function canUseSessionStorage() {
  try {
    return Boolean(globalThis.sessionStorage);
  } catch (e) {
    return false;
  }
}

function showError(message) {
  if (!filterError) {
    return;
  }
  filterError.textContent = message || "";
  filterError.hidden = !message;
}

function clearError() {
  showError("");
}

const fmtRub = (v) => RUB_FORMATTER.format(v);

const fmtPct = (v, fractionDigits = 1) =>
  getPercentFormatter(fractionDigits).format(v);

const fmtNumber = (v, fractionDigits = 0) =>
  getNumberFormatter(fractionDigits).format(v);

let authHash = null;
let revenueFetchTimer = null;
let servicesFetchTimer = null;
const controllers = {
  [SECTION_REVENUE]: null,
  [SECTION_SERVICES]: null,
  [SECTION_MONTHLY]: null,
};
let loadingCounter = 0;
let servicesDirty = true;
let activeSection = DEFAULT_ACTIVE_SECTION;
let activeSummaryCard = null;
let activeMonthlyMetric = null;
let activeMonthlyRange = MONTHLY_RANGE_DEFAULT;
let activeMonthlyContext = null;
let activeMonthlyService = null;
let activeServiceRow = null;

function toNumber(value) {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function cancelRevenueFetch() {
  if (revenueFetchTimer !== null) {
    clearTimeout(revenueFetchTimer);
    revenueFetchTimer = null;
  }
}

function cancelServicesFetch() {
  if (servicesFetchTimer !== null) {
    clearTimeout(servicesFetchTimer);
    servicesFetchTimer = null;
  }
}

function setActiveServiceRow(row) {
  if (activeServiceRow && activeServiceRow !== row) {
    activeServiceRow.classList.remove("is-active");
  }
  activeServiceRow = row || null;
  if (activeServiceRow) {
    activeServiceRow.classList.add("is-active");
  }
}

function applyRevenueMetrics(data) {
  if (!data) {
    return;
  }
  revenueValue.textContent = fmtRub(toNumber(data.revenue));
  avg.textContent = fmtRub(toNumber(data.avg_check));
  count.textContent = String(data.bookings_count || 0);
  share.textContent = fmtPct(toNumber(data.level2plus_share), 0);
  minv.textContent = fmtRub(toNumber(data.min_booking));
  maxv.textContent = fmtRub(toNumber(data.max_booking));
  if (stay) {
    const stayValue = toNumber(data.avg_stay_days);
    stay.textContent = `${fmtNumber(stayValue, 1)} дн.`;
  }
  if (bonus) {
    bonus.textContent = fmtPct(toNumber(data.bonus_payment_share), 1);
  }
  if (servicesShareValue) {
    servicesShareValue.textContent = fmtPct(toNumber(data.services_share), 0);
  }
}

function applyServicesMetrics(data) {
  const total = toNumber(data && data.total_amount);
  servicesTotal.textContent = total > 0 ? `Итого: ${fmtRub(total)}` : "Итого: —";

  servicesList.innerHTML = "";
  const items = Array.isArray(data && data.items) ? data.items : [];
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "services-empty";
    empty.textContent = "Данных за выбранный период нет";
    servicesList.append(empty);
    setActiveServiceRow(null);
    if (activeMonthlyContext === MONTHLY_CONTEXT_SERVICE) {
      resetMonthlyDetails();
    }
    return;
  }

  const fragment = document.createDocumentFragment();
  const activeServiceType =
    activeMonthlyContext === MONTHLY_CONTEXT_SERVICE ? activeMonthlyService : null;
  let nextActiveRow = null;

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "services-row";
    const serviceType = (item.service_type || "Без категории").trim();
    row.dataset.serviceType = serviceType;

    const name = document.createElement("div");
    name.className = "services-name services-name--link";
    name.textContent = serviceType;
    name.setAttribute("role", "button");
    name.setAttribute("tabindex", "0");
    name.dataset.serviceType = serviceType;

    const activate = () => {
      handleServiceNameClick(row, serviceType);
    };
    name.addEventListener("click", activate);
    name.addEventListener("keydown", (evt) => {
      if (evt.key === "Enter" || evt.key === " ") {
        evt.preventDefault();
        activate();
      }
    });

    const amount = document.createElement("div");
    amount.className = "services-amount";
    amount.textContent = fmtRub(toNumber(item.total_amount));

    const shareEl = document.createElement("div");
    shareEl.className = "services-share";
    const shareValue = Math.round(toNumber(item.share) * 100);
    shareEl.textContent = `${shareValue}%`;

    row.append(name, amount, shareEl);
    fragment.append(row);

    if (activeServiceType && serviceType === activeServiceType) {
      nextActiveRow = row;
    }
  });

  servicesList.append(fragment);

  if (activeServiceType) {
    if (nextActiveRow) {
      setActiveServiceRow(nextActiveRow);
    } else {
      resetMonthlyDetails();
    }
  }
}

function formatMonthLabel(isoDate) {
  if (!isoDate) {
    return "—";
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  const raw = monthFormatter.format(parsed);
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
}

function formatMonthlyValue(metric, value) {
  const cfg = MONTHLY_METRIC_CONFIG[metric];
  const numericValue = toNumber(value);
  if (!cfg || !cfg.format) {
    return fmtNumber(numericValue);
  }
  const { type, digits = 0, suffix = "" } = cfg.format;
  let formatted;
  switch (type) {
    case "currency":
      formatted = fmtRub(numericValue);
      break;
    case "percent":
      formatted = fmtPct(numericValue, digits);
      break;
    case "number":
    default:
      formatted = fmtNumber(numericValue, digits);
      break;
  }
  return suffix ? `${formatted}${suffix}` : formatted;
}

function calculateMonthlyAggregate(metric, points) {
  if (!Array.isArray(points) || points.length === 0) {
    return null;
  }

  const cfg = MONTHLY_METRIC_CONFIG[metric];
  if (!cfg) {
    return null;
  }

  const values = points
    .map((point) => (point ? point.value : null))
    .filter((value) => value !== null && value !== undefined)
    .map((value) => toNumber(value))
    .filter((value) => Number.isFinite(value));

  if (values.length === 0) {
    return null;
  }

  if (metric === "min_booking") {
    return Math.min(...values);
  }

  if (metric === "max_booking") {
    return Math.max(...values);
  }

  const type = cfg.format && cfg.format.type;
  if (type === "percent") {
    const sum = values.reduce((acc, value) => acc + value, 0);
    return values.length ? sum / values.length : 0;
  }

  return values.reduce((acc, value) => acc + value, 0);
}

function showMonthlyMessage(message) {
  if (monthlyEmpty) {
    monthlyEmpty.textContent = message;
    monthlyEmpty.classList.remove("hidden");
  }
  if (monthlyTable) {
    monthlyTable.classList.add("hidden");
  }
}

function clearMonthlyRows() {
  if (monthlyRows) {
    monthlyRows.innerHTML = "";
  }
}

function renderMonthlySeries(points, aggregateValue, formatValue) {
  if (!monthlyTable || !monthlyEmpty || !monthlyRows) {
    return;
  }

  const safePoints = Array.isArray(points) ? points.slice() : [];
  if (safePoints.length === 0) {
    showMonthlyMessage("Данных за выбранный период нет");
    return;
  }

  monthlyEmpty.classList.add("hidden");
  monthlyTable.classList.remove("hidden");
  clearMonthlyRows();

  const fragment = document.createDocumentFragment();

  const sortedPoints = safePoints.sort(
    (a, b) => new Date(b.month) - new Date(a.month)
  );

  sortedPoints.forEach((point) => {
    const row = document.createElement("div");
    row.className = "monthly-row";

    const monthEl = document.createElement("div");
    monthEl.className = "monthly-row__month";
    monthEl.textContent = formatMonthLabel(point.month);

    const valueEl = document.createElement("div");
    valueEl.className = "monthly-row__value";
    const numericValue = toNumber(point && point.value);
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

  monthlyRows.append(fragment);
}

function renderMonthlyMetrics(metric, payload) {
  if (
    !payload ||
    metric !== activeMonthlyMetric ||
    activeMonthlyContext !== MONTHLY_CONTEXT_METRIC
  ) {
    return;
  }
  if (payload.range && payload.range !== activeMonthlyRange) {
    return;
  }

  const points = Array.isArray(payload.points) ? payload.points : [];
  const hasAggregate =
    payload && Object.prototype.hasOwnProperty.call(payload, "aggregate");
  const aggregateValue = hasAggregate
    ? payload.aggregate
    : calculateMonthlyAggregate(metric, points);

  renderMonthlySeries(points, aggregateValue, (value) =>
    formatMonthlyValue(metric, value)
  );
}

function renderMonthlyService(serviceType, payload) {
  if (
    !payload ||
    activeMonthlyContext !== MONTHLY_CONTEXT_SERVICE ||
    serviceType !== activeMonthlyService
  ) {
    return;
  }
  if (payload.range && payload.range !== activeMonthlyRange) {
    return;
  }

  const points = Array.isArray(payload.points) ? payload.points : [];
  const hasAggregate =
    payload && Object.prototype.hasOwnProperty.call(payload, "aggregate");
  const aggregateValue = hasAggregate
    ? payload.aggregate
    : points.reduce((acc, point) => acc + toNumber(point && point.value), 0);

  renderMonthlySeries(points, aggregateValue, (value) => fmtRub(value));
}

async function loadMonthlyMetric(metric, range) {
  if (!authHash) {
    return false;
  }
  if (!API_BASE) {
    console.error("Базовый URL API не сконфигурирован");
    return false;
  }

  const cacheKey = getMonthlyCacheKey(metric, range);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    renderMonthlyMetrics(metric, cached);
    return true;
  }

  abortSectionController(SECTION_MONTHLY);

  const controller = new AbortController();
  setSectionController(SECTION_MONTHLY, controller);
  setLoadingState(true);

  const params = new URLSearchParams({
    metric,
    range,
    date_field: DATE_FIELD,
  });

  const url = `${API_BASE}/api/metrics/monthly?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: { "X-Auth-Hash": authHash },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      handleAuthFailure("Неверный пароль или сессия истекла.");
      showMonthlyMessage("Для просмотра требуется авторизация");
      return false;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    setCachedResponse(cacheKey, data);
    renderMonthlyMetrics(metric, data);
    return true;
  } catch (e) {
    if (isAbortError(e)) {
      return false;
    }
    console.error("Ошибка загрузки помесячных данных", e);
    showMonthlyMessage(`Ошибка загрузки данных: ${e.message}`);
    return false;
  } finally {
    if (getSectionController(SECTION_MONTHLY) === controller) {
      setSectionController(SECTION_MONTHLY, null);
      setLoadingState(false);
    }
  }
}

async function loadMonthlyService(serviceType, range) {
  if (!authHash) {
    return false;
  }
  if (!API_BASE) {
    console.error("Базовый URL API не сконфигурирован");
    return false;
  }

  const normalizedService = (serviceType || "").trim();
  if (!normalizedService) {
    return false;
  }

  const cacheKey = getMonthlyServiceCacheKey(normalizedService, range);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    renderMonthlyService(normalizedService, cached);
    return true;
  }

  abortSectionController(SECTION_MONTHLY);

  const controller = new AbortController();
  setSectionController(SECTION_MONTHLY, controller);
  setLoadingState(true);

  const params = new URLSearchParams({
    service_type: normalizedService,
    range,
  });

  const url = `${API_BASE}/api/services/monthly?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: { "X-Auth-Hash": authHash },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      handleAuthFailure("Неверный пароль или сессия истекла.");
      showMonthlyMessage("Для просмотра требуется авторизация");
      return false;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    setCachedResponse(cacheKey, data);
    renderMonthlyService(normalizedService, data);
    return true;
  } catch (e) {
    if (isAbortError(e)) {
      return false;
    }
    console.error("Ошибка загрузки помесячных данных по услугам", e);
    showMonthlyMessage(`Ошибка загрузки данных: ${e.message}`);
    return false;
  } finally {
    if (getSectionController(SECTION_MONTHLY) === controller) {
      setSectionController(SECTION_MONTHLY, null);
      setLoadingState(false);
    }
  }
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

function resetMonthlyDetails() {
  activeSummaryCard = null;
  activeMonthlyMetric = null;
  activeMonthlyService = null;
  activeMonthlyContext = null;
  activeMonthlyRange = MONTHLY_RANGE_DEFAULT;
  setActiveMonthlyRangeButton(activeMonthlyRange);
  summaryCards.forEach((card) => card.classList.remove("is-active"));
  setActiveServiceRow(null);
  clearMonthlyRows();
  showMonthlyMessage(MONTHLY_INITIAL_MESSAGE);
  if (monthlyCard) {
    monthlyCard.classList.add("hidden");
  }
  if (monthlyTitle) {
    monthlyTitle.textContent = MONTHLY_DEFAULT_TITLE;
  }
  abortSectionController(SECTION_MONTHLY);
}

function handleSummaryCardClick(card, metric) {
  if (!metric || !MONTHLY_METRIC_CONFIG[metric]) {
    return;
  }

  if (activeSummaryCard === card && monthlyCard && !monthlyCard.classList.contains("hidden")) {
    resetMonthlyDetails();
    return;
  }

  if (!authHash) {
    showGate();
    return;
  }

  activeMonthlyContext = MONTHLY_CONTEXT_METRIC;
  activeMonthlyService = null;
  activeSummaryCard = card;
  summaryCards.forEach((item) => {
    item.classList.toggle("is-active", item === card);
  });
  setActiveServiceRow(null);

  activeMonthlyMetric = metric;
  activeMonthlyRange = MONTHLY_RANGE_DEFAULT;
  setActiveMonthlyRangeButton(activeMonthlyRange);

  if (monthlyTitle) {
    monthlyTitle.textContent = MONTHLY_METRIC_CONFIG[metric].label;
  }
  if (monthlyCard) {
    monthlyCard.classList.remove("hidden");
  }

  showMonthlyMessage("Загрузка...");
  clearMonthlyRows();
  loadMonthlyMetric(metric, activeMonthlyRange);
}

function handleServiceNameClick(row, serviceType) {
  const normalizedService = (serviceType || "").trim();
  if (!normalizedService) {
    return;
  }

  if (
    activeMonthlyContext === MONTHLY_CONTEXT_SERVICE &&
    activeServiceRow === row &&
    monthlyCard &&
    !monthlyCard.classList.contains("hidden")
  ) {
    resetMonthlyDetails();
    return;
  }

  if (!authHash) {
    showGate();
    return;
  }

  activeMonthlyContext = MONTHLY_CONTEXT_SERVICE;
  activeMonthlyService = normalizedService;
  activeMonthlyMetric = null;
  activeSummaryCard = null;
  summaryCards.forEach((card) => card.classList.remove("is-active"));
  setActiveServiceRow(row);

  activeMonthlyRange = MONTHLY_RANGE_DEFAULT;
  setActiveMonthlyRangeButton(activeMonthlyRange);

  if (monthlyTitle) {
    monthlyTitle.textContent = normalizedService;
  }
  if (monthlyCard) {
    monthlyCard.classList.remove("hidden");
  }

  showMonthlyMessage("Загрузка...");
  clearMonthlyRows();
  loadMonthlyService(normalizedService, activeMonthlyRange);
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
      if (!monthlyRange || monthlyRange === activeMonthlyRange) {
        return;
      }
      activeMonthlyRange = monthlyRange;
      setActiveMonthlyRangeButton(activeMonthlyRange);
      if (activeMonthlyContext === MONTHLY_CONTEXT_METRIC && activeMonthlyMetric) {
        showMonthlyMessage("Загрузка...");
        clearMonthlyRows();
        loadMonthlyMetric(activeMonthlyMetric, activeMonthlyRange);
      } else if (
        activeMonthlyContext === MONTHLY_CONTEXT_SERVICE &&
        activeMonthlyService
      ) {
        showMonthlyMessage("Загрузка...");
        clearMonthlyRows();
        loadMonthlyService(activeMonthlyService, activeMonthlyRange);
      }
    });
  });
}

function scheduleRevenueFetch() {
  cancelRevenueFetch();
  revenueFetchTimer = window.setTimeout(() => {
    revenueFetchTimer = null;
    fetchRevenueMetrics();
  }, FETCH_DEBOUNCE_DELAY);
}

function scheduleServicesFetch() {
  if (activeSection !== SECTION_SERVICES) {
    return;
  }
  cancelServicesFetch();
  servicesFetchTimer = window.setTimeout(() => {
    servicesFetchTimer = null;
    fetchServicesMetrics();
  }, FETCH_DEBOUNCE_DELAY);
}

function setLoadingState(isLoading) {
  if (isLoading) {
    loadingCounter += 1;
    document.body.classList.add("is-loading");
  } else {
    loadingCounter = Math.max(0, loadingCounter - 1);
    if (loadingCounter === 0) {
      document.body.classList.remove("is-loading");
    }
  }
}

function getSectionController(section) {
  return controllers[section] || null;
}

function setSectionController(section, controller) {
  controllers[section] = controller;
}

function abortSectionController(section) {
  const controller = getSectionController(section);
  if (controller) {
    setSectionController(section, null);
    setLoadingState(false);
    controller.abort();
  }
}

function isAbortError(error) {
  return Boolean(error && error.name === "AbortError");
}

function getStoredHash() {
  if (!canUseSessionStorage()) {
    return null;
  }
  try {
    return window.sessionStorage.getItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Не удалось прочитать сохранённый пароль из sessionStorage", e);
    return null;
  }
}

function persistHash(hash) {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    if (hash) {
      window.sessionStorage.setItem(STORAGE_KEY, hash);
    } else {
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  } catch (e) {
    console.warn("Не удалось сохранить пароль в sessionStorage", e);
  }
}

function showGate(message = "") {
  gate.style.display = "flex";
  errBox.textContent = message;
  setTimeout(() => pwdInput.focus(), 0);
  clearError();
}

function hideGate() {
  gate.style.display = "none";
  errBox.textContent = "";
}

function setActivePreset(buttons, btn) {
  buttons.forEach((b) => {
    if (!b) {
      return;
    }
    b.classList.toggle("is-active", b === btn);
  });
}

const rangeInputs = { from: fromDate, to: toDate };
const lastTriggeredRange = { from: null, to: null };

const pad2 = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function getCacheKey(section, from, to) {
  const fromSafe = from || "";
  const toSafe = to || "";
  return `${section}-${fromSafe}-${toSafe}-${DATE_FIELD}`;
}

function getMonthlyCacheKey(metric, range) {
  return `monthly-${metric}-${range}-${DATE_FIELD}`;
}

function getMonthlyServiceCacheKey(serviceType, range) {
  const normalized = encodeURIComponent((serviceType || "").toLowerCase());
  return `monthly-service-${normalized}-${range}-${DATE_FIELD}`;
}

function validateDateRange(from, to) {
  if (from && to) {
    if (new Date(from) > new Date(to)) {
      showError("Дата 'От' не может быть позже даты 'До'");
      return false;
    }
    clearError();
    return true;
  }
  clearError();
  return true;
}

function setDateRange(inputs, fromDate, toDate) {
  inputs.from.value = fmtYMD(fromDate);
  inputs.to.value = fmtYMD(toDate);
  clearError();
}

function setCurrentMonthRange(inputs) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  setDateRange(inputs, start, end);
}

function setLastMonthRange(inputs) {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0);
  setDateRange(inputs, start, end);
}

function setRangeToCurrentMonth() {
  setCurrentMonthRange(rangeInputs);
}

function setRangeToLastMonth() {
  setLastMonthRange(rangeInputs);
}

async function sha256Hex(str) {
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function handleAuthFailure(message) {
  persistHash(null);
  authHash = null;
  requestCache.clear();
  lastTriggeredRange.from = null;
  lastTriggeredRange.to = null;
  resetMonthlyDetails();
  showGate(message);
}

async function loadMetrics({
  section,
  endpoint,
  onApply,
  onCacheHit,
  onSuccess,
  onAuthError,
  onError,
}) {
  if (!authHash) {
    return false;
  }
  if (!API_BASE) {
    console.error("Базовый URL API не сконфигурирован");
    return false;
  }

  const fromValue = fromDate.value;
  const toValue = toDate.value;
  if (!validateDateRange(fromValue, toValue)) {
    return false;
  }

  const cacheKey = getCacheKey(section, fromValue, toValue);
  const cached = getCachedResponse(cacheKey);
  if (cached) {
    onApply(cached);
    if (typeof onCacheHit === "function") {
      onCacheHit(cached);
    }
    return true;
  }

  abortSectionController(section);

  const controller = new AbortController();
  setSectionController(section, controller);
  setLoadingState(true);

  const params = new URLSearchParams();
  if (fromValue) {
    params.set("date_from", fromValue);
  }
  if (toValue) {
    params.set("date_to", toValue);
  }
  params.set("date_field", DATE_FIELD);

  const url = `${API_BASE}/api/${endpoint}?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: { "X-Auth-Hash": authHash },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      handleAuthFailure("Неверный пароль или сессия истекла.");
      if (typeof onAuthError === "function") {
        onAuthError();
      }
      return false;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    onApply(data);
    setCachedResponse(cacheKey, data);
    if (typeof onSuccess === "function") {
      onSuccess(data);
    }
    return true;
  } catch (e) {
    if (isAbortError(e)) {
      return false;
    }
    if (typeof onError === "function") {
      onError(e);
    } else {
      console.error(`Ошибка загрузки данных для ${section}`, e);
    }
    return false;
  } finally {
    if (getSectionController(section) === controller) {
      setSectionController(section, null);
      setLoadingState(false);
    }
  }
}

async function fetchRevenueMetrics() {
  return loadMetrics({
    section: SECTION_REVENUE,
    endpoint: "metrics",
    onApply: applyRevenueMetrics,
    onError: (e) => {
      console.error("Ошибка загрузки метрик", e);
      if (gate.style.display !== "none") {
        errBox.textContent = `Ошибка загрузки: ${e.message}`;
      }
    },
  });
}

async function fetchServicesMetrics() {
  return loadMetrics({
    section: SECTION_SERVICES,
    endpoint: "services",
    onApply: applyServicesMetrics,
    onCacheHit: () => {
      servicesDirty = false;
    },
    onSuccess: () => {
      servicesDirty = false;
    },
    onAuthError: () => {
      servicesDirty = true;
    },
    onError: (e) => {
      console.error("Ошибка загрузки услуг", e);
      servicesList.innerHTML = "";
      const errorRow = document.createElement("div");
      errorRow.className = "services-empty services-empty--error";
      errorRow.textContent = `Ошибка загрузки данных: ${e.message}`;
      servicesList.append(errorRow);
      setActiveServiceRow(null);
      if (activeMonthlyContext === MONTHLY_CONTEXT_SERVICE) {
        resetMonthlyDetails();
      }
      if (gate.style.display !== "none") {
        errBox.textContent = `Ошибка загрузки: ${e.message}`;
      }
      servicesDirty = true;
    },
  });
}

function bindFilterControls() {
  const handleManualChange = () => {
    setActivePreset(presetButtons, null);
    servicesDirty = true;
    lastTriggeredRange.from = null;
    lastTriggeredRange.to = null;
    if (!validateDateRange(fromDate.value, toDate.value)) {
      cancelRevenueFetch();
      cancelServicesFetch();
      return;
    }
    scheduleRevenueFetch();
    if (activeSection === SECTION_SERVICES) {
      scheduleServicesFetch();
    }
  };

  ["change", "input"].forEach((evt) => {
    Object.values(rangeInputs).forEach((input) => {
      if (input) {
        input.addEventListener(evt, handleManualChange);
      }
    });
  });

  const triggerImmediateFetch = () => {
    const currentFrom = fromDate.value;
    const currentTo = toDate.value;
    if (
      lastTriggeredRange.from === currentFrom &&
      lastTriggeredRange.to === currentTo
    ) {
      return;
    }

    if (!validateDateRange(currentFrom, currentTo)) {
      cancelRevenueFetch();
      cancelServicesFetch();
      return;
    }

    lastTriggeredRange.from = currentFrom;
    lastTriggeredRange.to = currentTo;

    servicesDirty = true;
    cancelRevenueFetch();
    fetchRevenueMetrics();
    if (activeSection === SECTION_SERVICES) {
      cancelServicesFetch();
      fetchServicesMetrics();
    }
  };

  if (resetFiltersBtn) {
    resetFiltersBtn.addEventListener("click", () => {
      setRangeToCurrentMonth();
      setActivePreset(presetButtons, btnCurMonth);
      triggerImmediateFetch();
    });
  }

  if (btnCurMonth) {
    btnCurMonth.addEventListener("click", () => {
      setRangeToCurrentMonth();
      setActivePreset(presetButtons, btnCurMonth);
      triggerImmediateFetch();
    });
  }

  if (btnPrevMonth) {
    btnPrevMonth.addEventListener("click", () => {
      setRangeToLastMonth();
      setActivePreset(presetButtons, btnPrevMonth);
      triggerImmediateFetch();
    });
  }
}

function setActiveSectionButton(section) {
  sectionButtons.forEach((btn) => {
    const isActive = btn.dataset.sectionTarget === section;
    btn.classList.toggle("is-active", isActive);
    btn.setAttribute("aria-selected", isActive ? "true" : "false");
    btn.setAttribute("tabindex", isActive ? "0" : "-1");
  });
}

function applySection(section) {
  const isRevenue = section === SECTION_REVENUE;
  if (filterTitle) {
    filterTitle.textContent = "Дата выезда";
  }
  setActiveSectionButton(section);
  revenueSection.classList.toggle("hidden", !isRevenue);
  servicesSection.classList.toggle("hidden", isRevenue);
  revenueSection.setAttribute("aria-hidden", (!isRevenue).toString());
  servicesSection.setAttribute("aria-hidden", isRevenue.toString());
  if (dashboard) {
    dashboard.classList.toggle("dashboard--single", isRevenue);
  }

  if (!isRevenue) {
    resetMonthlyDetails();
  }

  if (
    !isRevenue &&
    authHash &&
    servicesDirty &&
    !getSectionController(SECTION_SERVICES) &&
    servicesFetchTimer === null
  ) {
    fetchServicesMetrics();
  }
}

function bindSectionSwitch() {
  sectionButtons.forEach((btn) => {
    btn.addEventListener("click", () => {
      const section = btn.dataset.sectionTarget;
      if (!section || section === activeSection) {
        return;
      }
      activeSection = section;
      applySection(section);
    });
  });
}

function bindPasswordForm() {
  goBtn.addEventListener("click", async () => {
    const pwd = (pwdInput.value || "").trim();
    if (!pwd) {
      errBox.textContent = "Введите пароль";
      pwdInput.focus();
      return;
    }

    goBtn.disabled = true;
    errBox.textContent = "";

    try {
      authHash = await sha256Hex(pwd);
      requestCache.clear();
      resetMonthlyDetails();
      persistHash(authHash);
      if (!fromDate.value || !toDate.value) {
        setRangeToCurrentMonth();
      }
      cancelRevenueFetch();
      cancelServicesFetch();
      const okRevenue = await fetchRevenueMetrics();
      const okServices = await fetchServicesMetrics();
      if (okRevenue) {
        pwdInput.value = "";
        hideGate();
      }
      if (!okServices) {
        servicesDirty = true;
      }
    } catch (e) {
      errBox.textContent = `Ошибка загрузки: ${e.message}`;
    } finally {
      goBtn.disabled = false;
    }
  });

  pwdInput.addEventListener("keydown", (evt) => {
    if (evt.key === "Enter") {
      evt.preventDefault();
      goBtn.click();
    }
  });
}

function initializeFilters() {
  setRangeToCurrentMonth();
  setActivePreset(presetButtons, btnCurMonth);
}

function initializeEventHandlers() {
  bindFilterControls();
  bindSectionSwitch();
  bindPasswordForm();
  bindSummaryCards();
  bindMonthlyRangeSwitch();
}

function applyInitialSectionState() {
  applySection(activeSection);
}

function restoreSessionFromStorage() {
  const stored = getStoredHash();
  if (stored) {
    authHash = stored;
    requestCache.clear();
    hideGate();
    fetchRevenueMetrics();
    fetchServicesMetrics();
  } else {
    showGate();
  }
}

function init() {
  resetMonthlyDetails();
  initializeFilters();
  initializeEventHandlers();
  applyInitialSectionState();
  restoreSessionFromStorage();
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}

// === Автоматическая подстройка высоты iframe при изменении содержимого ===
function sendHeight() {
  try {
    const height = document.documentElement.scrollHeight;
    // Отправляем высоту родителю (Flexbe)
    window.parent.postMessage({ type: 'resize', height }, '*');
  } catch (err) {
    console.warn('Resize postMessage failed:', err);
  }
}

// Отправляем высоту после загрузки и при изменениях DOM
window.addEventListener('load', sendHeight);
window.addEventListener('resize', sendHeight);
new MutationObserver(sendHeight).observe(document.body, { childList: true, subtree: true });

// На всякий случай — повторно через 1 секунду (для динамических графиков/загрузок)
setTimeout(sendHeight, 1000);
