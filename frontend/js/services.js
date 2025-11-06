import { MONTHLY_CONTEXT_SERVICE, SECTION_SERVICES } from "./config.js";
import { elements } from "./dom.js";
import { fmtPctCompact, fmtRub, toNumber } from "./formatters.js";
import { loadMetrics } from "./loaders.js";
import { scheduleHeightUpdate } from "./resizer.js";
import { getCurrentRangeValues, validateDateRange } from "./filters.js";
import { state } from "./state.js";
import {
  getActiveServiceType,
  handleServiceNameClick,
  notifyServicesCleared,
  resetMonthlyDetails,
} from "./monthly.js";
import {
  clearActiveServiceRow,
  setActiveServiceRowElement,
} from "./ui/serviceHighlight.js";
import { formatApiErrorMessage, logApiError } from "./utils/apiError.js";

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
    clearActiveServiceRow();
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
    shareEl.textContent = fmtPctCompact(toNumber(item.share), 0);

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
      setActiveServiceRowElement(nextActiveRow);
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
      logApiError("Ошибка загрузки услуг", error);
      elements.servicesList.innerHTML = "";
      const errorRow = document.createElement("div");
      errorRow.className = "services-empty services-empty--error";
      errorRow.textContent = formatApiErrorMessage(error);
      elements.servicesList.append(errorRow);
      clearActiveServiceRow();
      notifyServicesCleared();
      if (elements.gate && elements.gate.style.display !== "none") {
        elements.errBox.textContent = formatApiErrorMessage(error, "Ошибка загрузки");
      }
      state.servicesDirty = true;
    },
  });
}
