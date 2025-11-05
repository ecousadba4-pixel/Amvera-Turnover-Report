// ======= Config =======
const DEFAULT_API_BASE = "https://u4s-turnover-karinausadba.amvera.io";
const DATE_FIELD = "created"; // 'created' | 'checkin'

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
const revenuePresetBar = $("#revenuePresetBar");
const servicesPresetBar = $("#servicesPresetBar");
const revenueFilterGroup = $("#revenueDateInputs");
const servicesFilterGroup = $("#servicesDateInputs");
const fromRevenue = $("#fromRevenue");
const toRevenue = $("#toRevenue");
const fromServices = $("#fromServices");
const toServices = $("#toServices");
const revenueValue = $("#revenue");
const avg = $("#avg");
const count = $("#count");
const share = $("#share");
const minv = $("#min");
const maxv = $("#max");
const stay = $("#stay");
const bonus = $("#bonus");
const servicesShareValue = $("#servicesShare");
const resetRevenueBtn = $("#resetRevenueBtn");
const resetServicesBtn = $("#resetServicesBtn");
const btnRevenueCur = $("#btnRevenueCur");
const btnRevenuePrev = $("#btnRevenuePrev");
const btnServicesCur = $("#btnServicesCur");
const btnServicesPrev = $("#btnServicesPrev");
const sectionButtons = $$('[data-section-target]');
const revenueSection = $("#revenueSection");
const servicesSection = $("#servicesSection");
const servicesList = $("#servicesList");
const servicesTotal = $("#servicesTotal");
const gate = $("#gate");
const errBox = $("#err");
const pwdInput = $("#pwd");
const goBtn = $("#goBtn");

const revenuePresetButtons = [btnRevenueCur, btnRevenuePrev];
const servicesPresetButtons = [btnServicesCur, btnServicesPrev];

const STORAGE_KEY = "u4sRevenueAuthHash";
const FETCH_DEBOUNCE_DELAY = 600;

function canUseSessionStorage() {
  try {
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  } catch (e) {
    return false;
  }
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
let activeSection = "revenue";

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

function scheduleRevenueFetch() {
  cancelRevenueFetch();
  revenueFetchTimer = window.setTimeout(() => {
    revenueFetchTimer = null;
    fetchRevenueMetrics();
  }, FETCH_DEBOUNCE_DELAY);
}

function scheduleServicesFetch() {
  servicesDirty = true;
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

const revenueRangeInputs = { from: fromRevenue, to: toRevenue };
const servicesRangeInputs = { from: fromServices, to: toServices };

const pad2 = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function setDateRange(inputs, fromDate, toDate) {
  inputs.from.value = fmtYMD(fromDate);
  inputs.to.value = fmtYMD(toDate);
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

function setRevenueCurrentMonth() {
  setCurrentMonthRange(revenueRangeInputs);
}

function setRevenueLastMonth() {
  setLastMonthRange(revenueRangeInputs);
}

function setServicesCurrentMonth() {
  setCurrentMonthRange(servicesRangeInputs);
}

function setServicesLastMonth() {
  setLastMonthRange(servicesRangeInputs);
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

  if (revenueController) {
    revenueController.abort();
  }

  const controller = new AbortController();
  revenueController = controller;
  setLoadingState(true);

  const params = new URLSearchParams();
  if (fromRevenue.value) {
    params.set("date_from", fromRevenue.value);
  }
  if (toRevenue.value) {
    params.set("date_to", toRevenue.value);
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
      showGate("Неверный пароль или сессия истекла.");
      return false;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const json = await resp.json();

    revenueValue.textContent = fmtRub(toNumber(json.revenue));
    avg.textContent = fmtRub(toNumber(json.avg_check));
    count.textContent = String(json.bookings_count || 0);
    share.textContent = fmtPct(toNumber(json.level2plus_share), 0);
    minv.textContent = fmtRub(toNumber(json.min_booking));
    maxv.textContent = fmtRub(toNumber(json.max_booking));
    if (stay) {
      const stayValue = toNumber(json.avg_stay_days);
      stay.textContent = `${fmtNumber(stayValue, 1)} дн.`;
    }
    if (bonus) {
      bonus.textContent = fmtPct(toNumber(json.bonus_payment_share), 1);
    }
    if (servicesShareValue) {
      servicesShareValue.textContent = fmtPct(toNumber(json.services_share), 0);
    }

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

  if (servicesController) {
    servicesController.abort();
  }

  const controller = new AbortController();
  servicesController = controller;
  setLoadingState(true);

  const params = new URLSearchParams();
  if (fromServices.value) {
    params.set("date_from", fromServices.value);
  }
  if (toServices.value) {
    params.set("date_to", toServices.value);
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
      showGate("Неверный пароль или сессия истекла.");
      return false;
    }

    if (!resp.ok) {
      throw new Error(`HTTP ${resp.status}`);
    }

    const data = await resp.json();
    const total = toNumber(data.total_amount);
    servicesTotal.textContent = total > 0 ? `Итого: ${fmtRub(total)}` : "Итого: —";

    servicesList.innerHTML = "";
    if (!Array.isArray(data.items) || data.items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "services-empty";
      empty.textContent = "Данных за выбранный период нет";
      servicesList.append(empty);
    } else {
      data.items.forEach((item) => {
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

function bindDateInputs(inputs, presetButtons, markDirty, scheduleFn) {
  ["change", "input"].forEach((evt) => {
    inputs.from.addEventListener(evt, () => {
      setActivePreset(presetButtons, null);
      markDirty();
      scheduleFn();
    });
    inputs.to.addEventListener(evt, () => {
      setActivePreset(presetButtons, null);
      markDirty();
      scheduleFn();
    });
  });
}

function bindRevenueControls() {
  bindDateInputs(revenueRangeInputs, revenuePresetButtons, () => {}, scheduleRevenueFetch);

  if (resetRevenueBtn) {
    resetRevenueBtn.addEventListener("click", () => {
      setRevenueCurrentMonth();
      setActivePreset(revenuePresetButtons, btnRevenueCur);
      cancelRevenueFetch();
      fetchRevenueMetrics();
    });
  }

  if (btnRevenueCur) {
    btnRevenueCur.addEventListener("click", () => {
      setRevenueCurrentMonth();
      setActivePreset(revenuePresetButtons, btnRevenueCur);
      cancelRevenueFetch();
      fetchRevenueMetrics();
    });
  }

  if (btnRevenuePrev) {
    btnRevenuePrev.addEventListener("click", () => {
      setRevenueLastMonth();
      setActivePreset(revenuePresetButtons, btnRevenuePrev);
      cancelRevenueFetch();
      fetchRevenueMetrics();
    });
  }
}

function bindServicesControls() {
  const markDirty = () => {
    servicesDirty = true;
  };

  bindDateInputs(servicesRangeInputs, servicesPresetButtons, markDirty, scheduleServicesFetch);

  if (resetServicesBtn) {
    resetServicesBtn.addEventListener("click", () => {
      setServicesCurrentMonth();
      setActivePreset(servicesPresetButtons, btnServicesCur);
      servicesDirty = true;
      cancelServicesFetch();
      fetchServicesMetrics();
    });
  }

  if (btnServicesCur) {
    btnServicesCur.addEventListener("click", () => {
      setServicesCurrentMonth();
      setActivePreset(servicesPresetButtons, btnServicesCur);
      servicesDirty = true;
      cancelServicesFetch();
      fetchServicesMetrics();
    });
  }

  if (btnServicesPrev) {
    btnServicesPrev.addEventListener("click", () => {
      setServicesLastMonth();
      setActivePreset(servicesPresetButtons, btnServicesPrev);
      servicesDirty = true;
      cancelServicesFetch();
      fetchServicesMetrics();
    });
  }
}

function applySection(section) {
  const isRevenue = section === "revenue";
  filterTitle.textContent = isRevenue ? "Фильтр по дате выезда" : "Фильтр по периоду услуг";
  revenuePresetBar.classList.toggle("hidden", !isRevenue);
  servicesPresetBar.classList.toggle("hidden", isRevenue);
  revenueFilterGroup.classList.toggle("hidden", !isRevenue);
  servicesFilterGroup.classList.toggle("hidden", isRevenue);
  if (resetRevenueBtn) {
    resetRevenueBtn.classList.toggle("hidden", !isRevenue);
  }
  if (resetServicesBtn) {
    resetServicesBtn.classList.toggle("hidden", isRevenue);
  }
  revenueSection.classList.toggle("hidden", !isRevenue);
  servicesSection.classList.toggle("hidden", isRevenue);

  if (!isRevenue && authHash && servicesDirty && !servicesController && servicesFetchTimer === null) {
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
      sectionButtons.forEach((b) => {
        b.classList.toggle("is-active", b.dataset.sectionTarget === section);
      });
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
      persistHash(authHash);
      if (!fromRevenue.value || !toRevenue.value) {
        setRevenueCurrentMonth();
      }
      if (!fromServices.value || !toServices.value) {
        setServicesCurrentMonth();
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

function init() {
  setRevenueCurrentMonth();
  setServicesCurrentMonth();
  setActivePreset(revenuePresetButtons, btnRevenueCur);
  setActivePreset(servicesPresetButtons, btnServicesCur);

  bindRevenueControls();
  bindServicesControls();
  bindSectionSwitch();
  bindPasswordForm();

  applySection(activeSection);
  sectionButtons.forEach((btn) => {
    btn.classList.toggle("is-active", btn.dataset.sectionTarget === activeSection);
  });

  const stored = getStoredHash();
  if (stored) {
    authHash = stored;
    hideGate();
    fetchRevenueMetrics();
    fetchServicesMetrics();
  } else {
    showGate();
  }
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", init);
} else {
  init();
}
