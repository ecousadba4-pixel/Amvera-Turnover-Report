// ======= Config =======
const DEFAULT_API_BASE = "https://u4s-turnover-karinausadba.amvera.io";
const DATE_FIELD_CREATED = "created";
const DATE_FIELD_CHECKIN = "checkin";
const DATE_FIELD_ALIASES = {
  [DATE_FIELD_CREATED]: [DATE_FIELD_CREATED, "created_at"],
  [DATE_FIELD_CHECKIN]: [DATE_FIELD_CHECKIN, "checkin_date"],
};
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

const STORAGE_KEY = "u4sRevenueAuthSession";
const TOKEN_STORAGE_VERSION = 2;
const TOKEN_TYPE_TOKEN = "token";
const TOKEN_TYPE_HASH = "hash";
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
const resolvedDateFieldOverrides = new Map();

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

function getDateFieldCandidates(field) {
  const aliases = DATE_FIELD_ALIASES[field] || [];
  const values = [field, ...aliases];
  const unique = [];
  for (const value of values) {
    const normalized = typeof value === "string" ? value.trim() : "";
    if (!normalized) {
      continue;
    }
    if (!unique.includes(normalized)) {
      unique.push(normalized);
    }
  }
  return unique.length ? unique : [field].filter(Boolean);
}

function getOrderedDateFieldCandidates(field) {
  const override = resolvedDateFieldOverrides.get(field);
  const candidates = getDateFieldCandidates(field);
  if (!override || !candidates.includes(override)) {
    return candidates;
  }
  return [override, ...candidates.filter((candidate) => candidate !== override)];
}

function rememberDateFieldOverride(field, candidate) {
  if (!candidate || candidate === field) {
    resolvedDateFieldOverrides.delete(field);
    return;
  }
  resolvedDateFieldOverrides.set(field, candidate);
}

function cloneSearchParams(baseParams) {
  if (!baseParams) {
    return new URLSearchParams();
  }
  if (baseParams instanceof URLSearchParams) {
    return new URLSearchParams(baseParams);
  }
  const params = new URLSearchParams();
  Object.entries(baseParams).forEach(([key, value]) => {
    if (value === undefined || value === null) {
      return;
    }
    const strValue = String(value);
    if (!strValue) {
      return;
    }
    params.set(key, strValue);
  });
  return params;
}

async function readResponseError(resp) {
  let text = "";
  try {
    text = await resp.text();
  } catch (err) {
    return { detail: null, message: `HTTP ${resp.status}` };
  }

  if (!text) {
    return { detail: null, message: `HTTP ${resp.status}` };
  }

  try {
    const payload = JSON.parse(text);
    const detail = payload?.detail ?? null;
    if (typeof detail === "string" && detail.trim()) {
      return { detail, message: detail };
    }
    if (Array.isArray(detail)) {
      const messages = detail
        .map((item) => {
          if (item && typeof item === "object") {
            if (typeof item.msg === "string" && item.msg.trim()) {
              return item.msg.trim();
            }
            if (typeof item.detail === "string" && item.detail.trim()) {
              return item.detail.trim();
            }
          }
          return null;
        })
        .filter(Boolean);
      if (messages.length) {
        return { detail, message: messages.join("; ") };
      }
    }
    if (detail && typeof detail === "object") {
      const values = Object.values(detail)
        .map((value) => (typeof value === "string" ? value.trim() : null))
        .filter(Boolean);
      if (values.length) {
        return { detail, message: values.join("; ") };
      }
    }
    return { detail, message: `HTTP ${resp.status}` };
  } catch (err) {
    return { detail: text, message: text };
  }
}

async function buildHttpError(resp) {
  const { detail, message } = await readResponseError(resp);
  const statusMessage = `HTTP ${resp.status}`;
  const errorMessage = message && message !== statusMessage ? `${message} (${statusMessage})` : statusMessage;
  const error = new Error(errorMessage);
  error.status = resp.status;
  error.detail = detail;
  error.url = resp.url;
  return error;
}

function isDateFieldValidationError(error) {
  if (!error || error.status !== 422) {
    return false;
  }
  const detail = error.detail;
  if (typeof detail === "string") {
    return detail.toLowerCase().includes("date_field");
  }
  if (Array.isArray(detail)) {
    return detail.some((item) => {
      if (!item || typeof item !== "object") {
        return false;
      }
      if (Array.isArray(item.loc) && item.loc.includes("date_field")) {
        return true;
      }
      if (typeof item.msg === "string" && item.msg.toLowerCase().includes("date_field")) {
        return true;
      }
      return false;
    });
  }
  if (detail && typeof detail === "object") {
    if (Object.prototype.hasOwnProperty.call(detail, "date_field")) {
      return true;
    }
    return Object.values(detail).some((value) => {
      if (typeof value === "string") {
        return value.toLowerCase().includes("date_field");
      }
      return false;
    });
  }
  return false;
}

function isAuthError(error) {
  return Boolean(error && (error.status === 401 || error.status === 403));
}

async function requestWithDateFieldFallback({
  path,
  baseParams,
  includeDateField = true,
  signal,
  headers,
}) {
  if (!includeDateField) {
    const params = cloneSearchParams(baseParams);
    const queryString = params.toString();
    const url = `${API_BASE}${path}${queryString ? `?${queryString}` : ""}`;
    const resp = await fetch(url, { headers, signal });
    if (!resp.ok) {
      throw await buildHttpError(resp);
    }
    return await resp.json();
  }

  const dateField = DATE_FIELD;
  const candidates = getOrderedDateFieldCandidates(dateField);
  let lastError = null;

  for (let index = 0; index < candidates.length; index += 1) {
    const candidate = candidates[index];
    const params = cloneSearchParams(baseParams);
    if (candidate) {
      params.set("date_field", candidate);
    }
    const queryString = params.toString();
    const url = `${API_BASE}${path}${queryString ? `?${queryString}` : ""}`;

    let resp;
    try {
      resp = await fetch(url, { headers, signal });
    } catch (error) {
      throw error;
    }

    if (resp.status === 401 || resp.status === 403) {
      throw await buildHttpError(resp);
    }

    if (!resp.ok) {
      const error = await buildHttpError(resp);
      const hasNextCandidate = index < candidates.length - 1;
      if (hasNextCandidate && isDateFieldValidationError(error)) {
        lastError = error;
        console.warn(
          `Сервер отклонил параметр date_field="${candidate}" (${error.message}). Пробуем альтернативное значение.`,
        );
        continue;
      }
      throw error;
    }

    const data = await resp.json();
    rememberDateFieldOverride(dateField, candidate);
    return data;
  }

  throw lastError || new Error("Не удалось выполнить запрос");
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

function isLikelyNetworkError(error) {
  if (!error) {
    return false;
  }
  if (error.name === "TypeError") {
    return true;
  }
  const message = String(error.message || "").toLowerCase();
  return message.includes("failed to fetch") || message.includes("networkerror");
}

async function sha256Hex(value) {
  if (!value) {
    return "";
  }
  if (!globalThis.crypto || !globalThis.crypto.subtle) {
    throw new Error("Хеширование недоступно в этом браузере");
  }
  const encoder = new TextEncoder();
  const data = encoder.encode(value);
  const hashBuffer = await globalThis.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

function readStoredSession() {
  if (!canUseSessionStorage()) {
    return null;
  }
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return null;
    }

    const version = Number(parsed.version || 0);

    const normalizeTokenSession = (token, expiresAt = 0) => {
      const trimmedToken = typeof token === "string" ? token.trim() : "";
      if (!trimmedToken) {
        return null;
      }
      const normalizedExpiresAt = Number(expiresAt || 0);
      if (normalizedExpiresAt && Date.now() >= normalizedExpiresAt) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return null;
      }
      return {
        type: TOKEN_TYPE_TOKEN,
        token: trimmedToken,
        expiresAt: normalizedExpiresAt,
      };
    };

    if (version === 1) {
      return normalizeTokenSession(parsed.token, parsed.expiresAt);
    }

    if (version === TOKEN_STORAGE_VERSION) {
      const type = parsed.type === TOKEN_TYPE_HASH ? TOKEN_TYPE_HASH : TOKEN_TYPE_TOKEN;
      if (type === TOKEN_TYPE_HASH) {
        const hash = typeof parsed.hash === "string" ? parsed.hash.trim().toLowerCase() : "";
        if (!hash) {
          window.sessionStorage.removeItem(STORAGE_KEY);
          return null;
        }
        return { type: TOKEN_TYPE_HASH, hash };
      }
      return normalizeTokenSession(parsed.token, parsed.expiresAt);
    }

    window.sessionStorage.removeItem(STORAGE_KEY);
    return null;
  } catch (e) {
    console.warn("Не удалось прочитать сохранённую сессию из sessionStorage", e);
    try {
      window.sessionStorage.removeItem(STORAGE_KEY);
    } catch (_) {
      /* ignore */
    }
    return null;
  }
}

function persistSession(session) {
  if (!canUseSessionStorage()) {
    return;
  }
  try {
    if (!session) {
      window.sessionStorage.removeItem(STORAGE_KEY);
      return;
    }

    if (session.type === TOKEN_TYPE_HASH) {
      const hash = typeof session.hash === "string" ? session.hash.trim().toLowerCase() : "";
      if (!hash) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload = {
        version: TOKEN_STORAGE_VERSION,
        type: TOKEN_TYPE_HASH,
        hash,
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return;
    }

    if (session.type === TOKEN_TYPE_TOKEN) {
      const token = typeof session.token === "string" ? session.token.trim() : "";
      if (!token) {
        window.sessionStorage.removeItem(STORAGE_KEY);
        return;
      }
      const payload = {
        version: TOKEN_STORAGE_VERSION,
        type: TOKEN_TYPE_TOKEN,
        token,
        expiresAt: Number(session.expiresAt || 0),
      };
      window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      return;
    }

    window.sessionStorage.removeItem(STORAGE_KEY);
  } catch (e) {
    console.warn("Не удалось сохранить сессию в sessionStorage", e);
  }
}

function setAuthSession(session) {
  if (!session) {
    authSession = null;
    return;
  }

  if (session.type === TOKEN_TYPE_HASH) {
    const hash = typeof session.hash === "string" ? session.hash.trim().toLowerCase() : "";
    authSession = hash ? { type: TOKEN_TYPE_HASH, hash } : null;
    return;
  }

  if (session.type === TOKEN_TYPE_TOKEN) {
    const token = typeof session.token === "string" ? session.token.trim() : "";
    if (!token) {
      authSession = null;
      return;
    }
    authSession = {
      type: TOKEN_TYPE_TOKEN,
      token,
      expiresAt: Number(session.expiresAt || 0),
    };
    return;
  }

  authSession = null;
}

function clearAuthSession() {
  authSession = null;
}

function hasValidAuthSession() {
  if (!authSession) {
    return false;
  }
  if (authSession.type === TOKEN_TYPE_HASH) {
    return Boolean(authSession.hash);
  }
  if (authSession.type === TOKEN_TYPE_TOKEN) {
    if (!authSession.token) {
      return false;
    }
    if (authSession.expiresAt && Date.now() >= authSession.expiresAt) {
      return false;
    }
    return true;
  }
  return false;
}

function ensureAuthSession() {
  if (!authSession) {
    return false;
  }
  if (authSession.type === TOKEN_TYPE_HASH) {
    return Boolean(authSession.hash);
  }
  if (authSession.expiresAt && Date.now() >= authSession.expiresAt) {
    handleAuthFailure("Сессия истекла. Авторизуйтесь повторно.");
    return false;
  }
  return Boolean(authSession.token);
}

function getAuthorizationHeader() {
  if (!hasValidAuthSession()) {
    return {};
  }
  if (authSession.type === TOKEN_TYPE_HASH) {
    return { "X-Auth-Hash": authSession.hash };
  }
  return { Authorization: `Bearer ${authSession.token}` };
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

let authSession = null;
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
  scheduleHeightUpdate();
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
    scheduleHeightUpdate();
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
  scheduleHeightUpdate();

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
  scheduleHeightUpdate();
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
  const aggregateValue =
    payload && Object.prototype.hasOwnProperty.call(payload, "aggregate")
      ? payload.aggregate
      : null;

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
  const aggregateValue =
    payload && Object.prototype.hasOwnProperty.call(payload, "aggregate")
      ? payload.aggregate
      : null;

  renderMonthlySeries(points, aggregateValue, (value) => fmtRub(value));
}

async function loadMonthlyMetric(metric, range) {
  if (!ensureAuthSession()) {
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

  try {
    const data = await requestWithDateFieldFallback({
      path: "/api/metrics/monthly",
      baseParams: { metric, range },
      includeDateField: true,
      signal: controller.signal,
      headers: getAuthorizationHeader(),
    });
    setCachedResponse(cacheKey, data);
    renderMonthlyMetrics(metric, data);
    return true;
  } catch (e) {
    if (isAbortError(e)) {
      return false;
    }
    if (isAuthError(e)) {
      handleAuthFailure("Неверный токен или сессия истекла.");
      showMonthlyMessage("Для просмотра требуется авторизация");
      return false;
    }
    console.error("Ошибка загрузки помесячных данных", e);
    showMonthlyMessage(`Ошибка загрузки данных: ${e.message}`);
    return false;
  } finally {
    if (getSectionController(SECTION_MONTHLY) === controller) {
      setSectionController(SECTION_MONTHLY, null);
    }
  }
}

async function loadMonthlyService(serviceType, range) {
  if (!ensureAuthSession()) {
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

  const params = new URLSearchParams({
    service_type: normalizedService,
    range,
  });

  const url = `${API_BASE}/api/services/monthly?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: getAuthorizationHeader(),
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      handleAuthFailure("Неверный токен или сессия истекла.");
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
    monthlyCard.classList.remove("hidden");
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

  if (!hasValidAuthSession()) {
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

  if (!hasValidAuthSession()) {
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

function handleAuthFailure(message) {
  persistSession(null);
  clearAuthSession();
  requestCache.clear();
  lastTriggeredRange.from = null;
  lastTriggeredRange.to = null;
  servicesDirty = true;
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
  includeDateField = true,
}) {
  if (!ensureAuthSession()) {
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

  try {
    const baseParams = new URLSearchParams();
    if (fromValue) {
      baseParams.set("date_from", fromValue);
    }
    if (toValue) {
      baseParams.set("date_to", toValue);
    }

    const data = await requestWithDateFieldFallback({
      path: `/api/${endpoint}`,
      baseParams,
      includeDateField,
      signal: controller.signal,
      headers: getAuthorizationHeader(),
    });
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
    if (isAuthError(e)) {
      handleAuthFailure("Неверный пароль или сессия истекла.");
      if (typeof onAuthError === "function") {
        onAuthError();
      }
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
    includeDateField: false,
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
    hasValidAuthSession() &&
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

async function authenticate(password) {
  if (!API_BASE) {
    throw new Error("Базовый URL API не сконфигурирован");
  }

  try {
    const resp = await fetch(`${API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ password }),
    });

    if (resp.status === 401 || resp.status === 403) {
      throw new Error("Неверный пароль");
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const token = typeof data.access_token === "string" ? data.access_token.trim() : "";
    if (!token) {
      throw new Error("Токен авторизации не получен");
    }
    const expiresInSeconds = Number(data.expires_in || 0);
    const expiresAt = expiresInSeconds > 0 ? Date.now() + expiresInSeconds * 1000 : 0;
    return { type: TOKEN_TYPE_TOKEN, token, expiresAt };
  } catch (error) {
    if (isLikelyNetworkError(error)) {
      try {
        const hash = await sha256Hex(password);
        if (!hash) {
          throw new Error("empty hash");
        }
        return { type: TOKEN_TYPE_HASH, hash };
      } catch (hashError) {
        console.error("Не удалось вычислить SHA-256 пароля", hashError);
      }
    }
    throw error;
  }
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
      const session = await authenticate(pwd);
      setAuthSession(session);
      persistSession(session);
      requestCache.clear();
      resetMonthlyDetails();
      if (!fromDate.value || !toDate.value) {
        setRangeToCurrentMonth();
      }
      cancelRevenueFetch();
      cancelServicesFetch();
      const [okRevenue, okServices] = await Promise.all([
        fetchRevenueMetrics(),
        fetchServicesMetrics(),
      ]);
      if (okRevenue) {
        pwdInput.value = "";
        hideGate();
      }
      if (!okServices) {
        servicesDirty = true;
      }
    } catch (e) {
      errBox.textContent = `Ошибка авторизации: ${e.message}`;
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
  const stored = readStoredSession();
  if (stored) {
    setAuthSession(stored);
    requestCache.clear();
    hideGate();
    fetchRevenueMetrics();
    fetchServicesMetrics();
  } else {
    clearAuthSession();
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
const HEIGHT_UPDATE_DEBOUNCE_MS = 120;
let heightUpdateTimerId = null;

function sendHeight() {
  try {
    const height = document.documentElement.scrollHeight;
    // Отправляем высоту родителю (Flexbe)
    window.parent.postMessage({ type: 'resize', height }, '*');
  } catch (err) {
    console.warn('Resize postMessage failed:', err);
  }
}

function scheduleHeightUpdate() {
  if (heightUpdateTimerId !== null) {
    clearTimeout(heightUpdateTimerId);
  }
  heightUpdateTimerId = setTimeout(() => {
    heightUpdateTimerId = null;
    sendHeight();
  }, HEIGHT_UPDATE_DEBOUNCE_MS);
}

// Отправляем высоту после загрузки и при изменениях DOM
window.addEventListener('load', scheduleHeightUpdate);
window.addEventListener('resize', scheduleHeightUpdate);

const heightObserverTarget = dashboard || document.body;

if (typeof ResizeObserver === "function") {
  const resizeObserver = new ResizeObserver(() => {
    scheduleHeightUpdate();
  });
  if (heightObserverTarget) {
    resizeObserver.observe(heightObserverTarget);
  }
} else if (heightObserverTarget) {
  new MutationObserver(scheduleHeightUpdate).observe(heightObserverTarget, {
    childList: true,
    subtree: true,
  });
}

// На всякий случай — повторно через 1 секунду (для динамических графиков/загрузок)
setTimeout(sendHeight, 1000);
