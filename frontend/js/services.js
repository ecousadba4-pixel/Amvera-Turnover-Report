import { MONTHLY_CONTEXT_SERVICE, SECTION_SERVICES } from "./config.js";
import { elements } from "./dom.js";
import { fmtRub, toNumber } from "./formatters.js";
import { loadMetrics } from "./loaders.js";
import { scheduleHeightUpdate } from "./resizer.js";
import { getCurrentRangeValues, validateDateRange } from "./filters.js";
import { state, setActiveServiceRow } from "./state.js";
import {
  getActiveServiceType,
  handleServiceNameClick,
  notifyServicesCleared,
  resetMonthlyDetails,
} from "./monthly.js";

export function applyServicesMetrics(data) {
  const total = toNumber(data && data.total_amount);
  elements.servicesTotal.textContent = total > 0 ? `Итого: ${fmtRub(total)}` : "Итого: —";

  elements.servicesList.innerHTML = "";
  const items = Array.isArray(data && data.items) ? data.items : [];
  if (items.length === 0) {
    const empty = document.createElement("div");
    empty.className = "services-empty";
    empty.textContent = "Данных за выбранный период нет";
    elements.servicesList.append(empty);
    scheduleHeightUpdate();
    setActiveServiceRow(null);
    notifyServicesCleared();
    return;
  }

  const fragment = document.createDocumentFragment();
  const activeServiceType = getActiveServiceType();
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

  elements.servicesList.append(fragment);
  scheduleHeightUpdate();

  if (activeServiceType) {
    if (nextActiveRow) {
      setActiveServiceRow(nextActiveRow);
    } else if (state.activeMonthlyContext === MONTHLY_CONTEXT_SERVICE) {
      resetMonthlyDetails();
    }
  }
}

export function fetchServicesMetrics() {
  return loadMetrics({
    section: SECTION_SERVICES,
    endpoint: "services",
    range: getCurrentRangeValues(),
    validateRange: validateDateRange,
    includeDateField: false,
    onApply: applyServicesMetrics,
    onCacheHit: () => {
      state.servicesDirty = false;
    },
    onSuccess: () => {
      state.servicesDirty = false;
    },
    onAuthError: () => {
      state.servicesDirty = true;
    },
    onError: (error) => {
      console.error("Ошибка загрузки услуг", error);
      elements.servicesList.innerHTML = "";
      const errorRow = document.createElement("div");
      errorRow.className = "services-empty services-empty--error";
      errorRow.textContent = `Ошибка загрузки данных: ${error.message}`;
      elements.servicesList.append(errorRow);
      setActiveServiceRow(null);
      notifyServicesCleared();
      if (elements.gate && elements.gate.style.display !== "none") {
        elements.errBox.textContent = `Ошибка загрузки: ${error.message}`;
      }
      state.servicesDirty = true;
    },
  });
}
