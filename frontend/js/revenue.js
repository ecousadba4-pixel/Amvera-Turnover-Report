import { SECTION_REVENUE } from "./config.js";
import { elements } from "./dom.js";
import { fmtNumber, fmtPct, fmtRub, toNumber } from "./formatters.js";
import { loadMetrics } from "./loaders.js";
import { scheduleHeightUpdate } from "./resizer.js";
import { getCurrentRangeValues, validateDateRange } from "./filters.js";

export function applyRevenueMetrics(data) {
  if (!data) {
    return;
  }
  elements.revenueValue.textContent = fmtRub(toNumber(data.revenue));
  elements.avg.textContent = fmtRub(toNumber(data.avg_check));
  elements.count.textContent = String(data.bookings_count || 0);
  elements.share.textContent = fmtPct(toNumber(data.level2plus_share), 0);
  elements.min.textContent = fmtRub(toNumber(data.min_booking));
  elements.max.textContent = fmtRub(toNumber(data.max_booking));
  if (elements.stay) {
    const stayValue = toNumber(data.avg_stay_days);
    elements.stay.textContent = `${fmtNumber(stayValue, 1)} дн.`;
  }
  if (elements.bonus) {
    elements.bonus.textContent = fmtPct(toNumber(data.bonus_payment_share), 1);
  }
  if (elements.servicesShareValue) {
    elements.servicesShareValue.textContent = fmtPct(toNumber(data.services_share), 0);
  }
  scheduleHeightUpdate();
}

export function fetchRevenueMetrics() {
  return loadMetrics({
    section: SECTION_REVENUE,
    endpoint: "metrics",
    range: getCurrentRangeValues(),
    validateRange: validateDateRange,
    onApply: applyRevenueMetrics,
    onError: (error) => {
      console.error("Ошибка загрузки метрик", error);
      if (elements.gate && elements.gate.style.display !== "none") {
        elements.errBox.textContent = `Ошибка загрузки: ${error.message}`;
      }
    },
  });
}
