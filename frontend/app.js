// ======= Config =======
const DEFAULT_API_BASE = "https://u4s-turnover-karinausadba.amvera.io";
const DATE_FIELD_CREATED = "created";
const DATE_FIELD_CHECKIN = "checkin";
const SECTION_REVENUE = "revenue";
const SECTION_SERVICES = "services";
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

const presetButtons = [btnCurMonth, btnPrevMonth];

const STORAGE_KEY = "u4sRevenueAuthHash";
const FETCH_DEBOUNCE_DELAY = 600;

const requestCache = new Map();

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

const fmtRub = (v) =>
  new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "RUB",
    maximumFractionDigits: 0,
  }).format(v);

const fmtPct = (v, fractionDigits = 1) =>
  new Intl.NumberFormat("ru-RU", {
    style: "percent",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(v);

const fmtNumber = (v, fractionDigits = 0) =>
  new Intl.NumberFormat("ru-RU", {
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(v);

let authHash = null;
let revenueFetchTimer = null;
let servicesFetchTimer = null;
let revenueController = null;
let servicesController = null;
let loadingCounter = 0;
let servicesDirty = true;
let activeSection = DEFAULT_ACTIVE_SECTION;

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
    return;
  }

  items.forEach((item) => {
    const row = document.createElement("div");
    row.className = "services-row";

    const name = document.createElement("div");
    name.className = "services-name";
    name.textContent = item.service_type || "Без категории";

    const amount = document.createElement("div");
    amount.className = "services-amount";
    amount.textContent = fmtRub(toNumber(item.total_amount));

    const shareEl = document.createElement("div");
    shareEl.className = "services-share";
    const shareValue = Math.round(toNumber(item.share) * 100);
    shareEl.textContent = `${shareValue}%`;

    row.append(name, amount, shareEl);
    servicesList.append(row);
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

const pad2 = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function getCacheKey(section, from, to) {
  const fromSafe = from || "";
  const toSafe = to || "";
  return `${section}-${fromSafe}-${toSafe}-${DATE_FIELD}`;
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

async function fetchRevenueMetrics() {
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

  const cacheKey = getCacheKey(SECTION_REVENUE, fromValue, toValue);
  const cached = requestCache.get(cacheKey);
  if (cached) {
    applyRevenueMetrics(cached);
    return true;
  }

  if (revenueController) {
    revenueController.abort();
  }

  const controller = new AbortController();
  revenueController = controller;
  setLoadingState(true);

  const params = new URLSearchParams();
  if (fromValue) {
    params.set("date_from", fromValue);
  }
  if (toValue) {
    params.set("date_to", toValue);
  }
  params.set("date_field", DATE_FIELD);
  const url = `${API_BASE}/api/metrics?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: { "X-Auth-Hash": authHash },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      persistHash(null);
      authHash = null;
      requestCache.clear();
      showGate("Неверный пароль или сессия истекла.");
      return false;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const json = await resp.json();
    applyRevenueMetrics(json);
    requestCache.set(cacheKey, json);
    return true;
  } catch (e) {
    if (isAbortError(e)) {
      return false;
    }
    console.error("Ошибка загрузки метрик", e);
    if (gate.style.display !== "none") {
      errBox.textContent = `Ошибка загрузки: ${e.message}`;
    }
    return false;
  } finally {
    if (revenueController === controller) {
      revenueController = null;
      setLoadingState(false);
    }
  }
}

async function fetchServicesMetrics() {
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

  const cacheKey = getCacheKey(SECTION_SERVICES, fromValue, toValue);
  const cached = requestCache.get(cacheKey);
  if (cached) {
    applyServicesMetrics(cached);
    servicesDirty = false;
    return true;
  }

  if (servicesController) {
    servicesController.abort();
  }

  const controller = new AbortController();
  servicesController = controller;
  setLoadingState(true);

  const params = new URLSearchParams();
  if (fromValue) {
    params.set("date_from", fromValue);
  }
  if (toValue) {
    params.set("date_to", toValue);
  }
  params.set("date_field", DATE_FIELD);
  const url = `${API_BASE}/api/services?${params.toString()}`;

  try {
    const resp = await fetch(url, {
      headers: { "X-Auth-Hash": authHash },
      signal: controller.signal,
    });

    if (resp.status === 401 || resp.status === 403) {
      persistHash(null);
      authHash = null;
      servicesDirty = true;
      requestCache.clear();
      showGate("Неверный пароль или сессия истекла.");
      return false;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    applyServicesMetrics(data);
    requestCache.set(cacheKey, data);
    servicesDirty = false;
    return true;
  } catch (e) {
    if (isAbortError(e)) {
      return false;
    }
    console.error("Ошибка загрузки услуг", e);
    servicesList.innerHTML = "";
    const errorRow = document.createElement("div");
    errorRow.className = "services-empty services-empty--error";
    errorRow.textContent = `Ошибка загрузки данных: ${e.message}`;
    servicesList.append(errorRow);
    if (gate.style.display !== "none") {
      errBox.textContent = `Ошибка загрузки: ${e.message}`;
    }
    servicesDirty = true;
    return false;
  } finally {
    if (servicesController === controller) {
      servicesController = null;
      setLoadingState(false);
    }
  }
}

function bindFilterControls() {
  const handleManualChange = () => {
    setActivePreset(presetButtons, null);
    servicesDirty = true;
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
    servicesDirty = true;
    if (!validateDateRange(fromDate.value, toDate.value)) {
      cancelRevenueFetch();
      cancelServicesFetch();
      return;
    }
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

  if (
    !isRevenue &&
    authHash &&
    servicesDirty &&
    !servicesController &&
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
