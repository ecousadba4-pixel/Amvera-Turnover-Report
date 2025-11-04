// ======= Config =======
const DEFAULT_API_BASE = "https://u4s-turnover-karinausadba.amvera.io";
const DATE_FIELD = "created"; // 'created' | 'checkin'

function normalizeBase(url){
  return url.replace(/\/+$/, "");
}

function resolveApiBase(){
  const override = typeof window.U4S_API_BASE === "string" ? window.U4S_API_BASE.trim() : "";
  if(override){
    return normalizeBase(override);
  }

  if(DEFAULT_API_BASE){
    return normalizeBase(DEFAULT_API_BASE);
  }

  const origin = window.location && window.location.origin;
  if(origin && origin !== "null" && origin !== "file://"){
    return normalizeBase(origin);
  }

  return "";
}

const API_BASE = resolveApiBase();

const $ = (sel) => document.querySelector(sel);
const from = $("#from");
const to = $("#to");
const revenue = $("#revenue");
const avg = $("#avg");
const count = $("#count");
const share = $("#share");
const minv = $("#min");
const maxv = $("#max");
const stay = $("#stay");
const bonus = $("#bonus");
const presetLabel = $("#presetLabel");
const resetBtn = $("#resetBtn");
const btnCur = $("#btnCur");
const btnPrev = $("#btnPrev");
const btnWknd = $("#btnWknd");
const gate = $("#gate");
const errBox = $("#err");
const pwdInput = $("#pwd");
const goBtn = $("#goBtn");
const presetButtons = [btnCur, btnPrev, btnWknd];

const STORAGE_KEY = "u4sRevenueAuthHash";

function canUseSessionStorage(){
  try{
    return typeof window !== "undefined" && typeof window.sessionStorage !== "undefined";
  }catch(e){
    return false;
  }
}

const fmtRub = (v) => new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
}).format(v);

const fmtPct = (v, fractionDigits = 1) => new Intl.NumberFormat("ru-RU", {
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

function getStoredHash(){
  if(!canUseSessionStorage()){
    return null;
  }
  try{
    return window.sessionStorage.getItem(STORAGE_KEY);
  }catch(e){
    console.warn("Не удалось прочитать сохранённый пароль из sessionStorage", e);
    return null;
  }
}

function persistHash(hash){
  if(!canUseSessionStorage()){
    return;
  }
  try{
    if(hash){
      window.sessionStorage.setItem(STORAGE_KEY, hash);
    }else{
      window.sessionStorage.removeItem(STORAGE_KEY);
    }
  }catch(e){
    console.warn("Не удалось сохранить пароль в sessionStorage", e);
  }
}

function showGate(message = ""){
  gate.style.display = "flex";
  errBox.textContent = message;
  setTimeout(() => pwdInput.focus(), 0);
}

function hideGate(){
  gate.style.display = "none";
  errBox.textContent = "";
}

function toNumber(value){
  if(typeof value === "number" && Number.isFinite(value)){
    return value;
  }
  if(typeof value === "string" && value.trim() !== ""){
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

// Date helpers
const pad2 = (n) => String(n).padStart(2, "0");
const fmtYMD = (d) => `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;

function setPresetLabel(txt){
  if(presetLabel){
    presetLabel.textContent = txt;
  }
}

function setActivePreset(btn){
  presetButtons.forEach((b) => {
    if(!b){
      return;
    }
    b.classList.toggle("is-active", b === btn);
  });
}

function setCurrentMonth(){
  const now = new Date();
  const f = new Date(now.getFullYear(), now.getMonth(), 1);
  const t = new Date(now.getFullYear(), now.getMonth() + 1, 0);
  from.value = fmtYMD(f);
  to.value = fmtYMD(t);
  setPresetLabel("Текущий месяц");
}

function setLastMonth(){
  const now = new Date();
  const f = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const t = new Date(now.getFullYear(), now.getMonth(), 0);
  from.value = fmtYMD(f);
  to.value = fmtYMD(t);
  setPresetLabel("Прошлый месяц");
}

function setLastWeekend(){
  const now = new Date();
  const day = now.getDay(); // 0 Sun .. 6 Sat
  const sat = new Date(now);
  sat.setDate(now.getDate() - (day === 6 ? 0 : day + 1));
  const sun = new Date(sat);
  sun.setDate(sat.getDate() + 1);
  from.value = fmtYMD(sat);
  to.value = fmtYMD(sun);
  setPresetLabel("Последние выходные");
}

async function sha256Hex(str){
  const enc = new TextEncoder();
  const buf = await crypto.subtle.digest("SHA-256", enc.encode(str));
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

async function fetchMetrics(){
  if(!authHash){
    return false;
  }
  document.body.classList.add("is-loading");
  const params = new URLSearchParams();
  if(from.value){
    params.set("date_from", from.value);
  }
  if(to.value){
    params.set("date_to", to.value);
  }
  params.set("date_field", DATE_FIELD);
  const url = `${API_BASE}/api/metrics?${params.toString()}`;

  try{
    const resp = await fetch(url, {
      headers: { "X-Auth-Hash": authHash },
    });

    if(resp.status === 401 || resp.status === 403){
      persistHash(null);
      authHash = null;
      showGate("Неверный пароль или сессия истекла.");
      return false;
    }

    if(!resp.ok){
      throw new Error(`HTTP ${resp.status}`);
    }

    const json = await resp.json();

    revenue.textContent = fmtRub(toNumber(json.revenue));
    avg.textContent = fmtRub(toNumber(json.avg_check));
    count.textContent = String(json.bookings_count || 0);
    share.textContent = fmtPct(toNumber(json.level2plus_share), 0);
    minv.textContent = fmtRub(toNumber(json.min_booking));
    maxv.textContent = fmtRub(toNumber(json.max_booking));
    if(stay){
      const stayValue = toNumber(json.avg_stay_days);
      stay.textContent = `${fmtNumber(stayValue, 1)} дн.`;
    }
    if(bonus){
      bonus.textContent = fmtPct(toNumber(json.bonus_payment_share), 1);
    }

    return true;
  }catch(e){
    console.error("Ошибка загрузки метрик", e);
    if(gate.style.display !== "none"){
      errBox.textContent = `Ошибка загрузки: ${e.message}`;
    }
    return false;
  }finally{
    document.body.classList.remove("is-loading");
  }
}

function bindDateListeners(){
  ["change", "input"].forEach((evt) => {
    from.addEventListener(evt, () => {
      setActivePreset(null);
      fetchMetrics();
    });
    to.addEventListener(evt, () => {
      setActivePreset(null);
      fetchMetrics();
    });
  });
}

function bindPresetButtons(){
  resetBtn.addEventListener("click", () => {
    setCurrentMonth();
    setActivePreset(btnCur);
    fetchMetrics();
  });

  btnCur.addEventListener("click", () => {
    setCurrentMonth();
    setActivePreset(btnCur);
    fetchMetrics();
  });

  btnPrev.addEventListener("click", () => {
    setLastMonth();
    setActivePreset(btnPrev);
    fetchMetrics();
  });

  btnWknd.addEventListener("click", () => {
    setLastWeekend();
    setActivePreset(btnWknd);
    fetchMetrics();
  });
}

function bindPasswordForm(){
  goBtn.addEventListener("click", async () => {
    const pwd = (pwdInput.value || "").trim();
    if(!pwd){
      errBox.textContent = "Введите пароль";
      pwdInput.focus();
      return;
    }

    goBtn.disabled = true;
    errBox.textContent = "";

    try{
      authHash = await sha256Hex(pwd);
      persistHash(authHash);
      if(!from.value || !to.value){
        setCurrentMonth();
      }
      const ok = await fetchMetrics();
      if(ok){
        pwdInput.value = "";
        hideGate();
      }
    }catch(e){
      errBox.textContent = `Ошибка загрузки: ${e.message}`;
    }finally{
      goBtn.disabled = false;
    }
  });

  pwdInput.addEventListener("keydown", (evt) => {
    if(evt.key === "Enter"){
      evt.preventDefault();
      goBtn.click();
    }
  });
}

function init(){
  setCurrentMonth();
  setActivePreset(btnCur);
  bindDateListeners();
  bindPresetButtons();
  bindPasswordForm();
  const stored = getStoredHash();
  if(stored){
    authHash = stored;
    hideGate();
    fetchMetrics();
  }else{
    showGate();
  }
}

if(document.readyState === "loading"){
  document.addEventListener("DOMContentLoaded", init);
}else{
  init();
}
