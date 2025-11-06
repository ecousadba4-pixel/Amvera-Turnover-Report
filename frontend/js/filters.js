import {
  FETCH_DEBOUNCE_DELAY,
  SECTION_SERVICES,
} from "./config.js";
import { elements, presetButtons, rangeInputs } from "./dom.js";
import {
  cancelRevenueFetch,
  cancelServicesFetch,
  scheduleRevenueFetch,
  scheduleServicesFetch,
  state,
} from "./state.js";
import { clearError, showError } from "./ui/errors.js";
import {
  fmtYMD,
  getCurrentMonthEndDate,
  getCurrentMonthStartDate,
  getLastMonthEndDate,
  getLastMonthStartDate,
  normalizeDate,
} from "./utils/date.js";

export function initializeFilters() {
  applyCurrentMonthDateLimits();
  setRangeToCurrentMonth();
  setActivePreset(elements.btnCurMonth);
}

export function bindFilterControls({ onFetchRevenue, onFetchServices }) {
  const handleManualChange = () => {
    setActivePreset(null);
    state.servicesDirty = true;
    state.lastTriggeredRange.from = null;
    state.lastTriggeredRange.to = null;
    if (!validateCurrentRange()) {
      cancelRevenueFetch();
      cancelServicesFetch();
      return;
    }
    scheduleRevenueFetch(() => onFetchRevenue(), FETCH_DEBOUNCE_DELAY);
    if (state.activeSection === SECTION_SERVICES) {
      scheduleServicesFetch(() => onFetchServices(), FETCH_DEBOUNCE_DELAY);
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
    const currentFrom = elements.fromDate.value;
    const currentTo = elements.toDate.value;
    if (
      state.lastTriggeredRange.from === currentFrom &&
      state.lastTriggeredRange.to === currentTo
    ) {
      return;
    }

    if (!validateDateRange(currentFrom, currentTo)) {
      cancelRevenueFetch();
      cancelServicesFetch();
      return;
    }

    state.lastTriggeredRange.from = currentFrom;
    state.lastTriggeredRange.to = currentTo;

    state.servicesDirty = true;
    cancelRevenueFetch();
    onFetchRevenue();
    if (state.activeSection === SECTION_SERVICES) {
      cancelServicesFetch();
      onFetchServices();
    }
  };

  if (elements.resetFiltersBtn) {
    elements.resetFiltersBtn.addEventListener("click", () => {
      setRangeToCurrentMonth();
      setActivePreset(elements.btnCurMonth);
      triggerImmediateFetch();
    });
  }

  if (elements.btnCurMonth) {
    elements.btnCurMonth.addEventListener("click", () => {
      setRangeToCurrentMonth();
      setActivePreset(elements.btnCurMonth);
      triggerImmediateFetch();
    });
  }

  if (elements.btnPrevMonth) {
    elements.btnPrevMonth.addEventListener("click", () => {
      setRangeToLastMonth();
      setActivePreset(elements.btnPrevMonth);
      triggerImmediateFetch();
    });
  }
}

export function validateCurrentRange() {
  return validateDateRange(elements.fromDate.value, elements.toDate.value);
}

export function getCurrentRangeValues() {
  return {
    from: elements.fromDate.value,
    to: elements.toDate.value,
  };
}

export function setRangeToCurrentMonth() {
  const start = getCurrentMonthStartDate();
  const end = getCurrentMonthEndDate();
  setDateRange(start, end);
}

export function setRangeToLastMonth() {
  const start = getLastMonthStartDate();
  const end = getLastMonthEndDate();
  setDateRange(start, end);
}

function setActivePreset(targetButton) {
  presetButtons.forEach((btn) => {
    if (!btn) {
      return;
    }
    const isActive = btn === targetButton;
    btn.classList.toggle("is-active", isActive);
  });
}

function applyCurrentMonthDateLimits() {
  const monthEnd = getCurrentMonthEndDate();
  const maxValue = fmtYMD(monthEnd);
  Object.values(rangeInputs).forEach((input) => {
    if (input) {
      input.setAttribute("max", maxValue);
    }
  });
}

function setDateRange(fromDate, toDate) {
  if (elements.fromDate) {
    elements.fromDate.value = fmtYMD(fromDate);
  }
  if (elements.toDate) {
    elements.toDate.value = fmtYMD(toDate);
  }
  clearError();
}

export function validateDateRange(from, to) {
  const monthEnd = getCurrentMonthEndDate();

  const fromDate = normalizeDate(from);
  const toDate = normalizeDate(to);

  if (from && !fromDate) {
    showError("Дата 'От' указана в неверном формате");
    return false;
  }

  if (to && !toDate) {
    showError("Дата 'До' указана в неверном формате");
    return false;
  }

  if (fromDate && fromDate > monthEnd) {
    showError("Дата 'От' не может быть позже конца текущего месяца");
    return false;
  }

  if (toDate && toDate > monthEnd) {
    showError("Дата 'До' не может быть позже конца текущего месяца");
    return false;
  }

  if (fromDate && toDate && fromDate > toDate) {
    showError("Дата 'От' не может быть позже даты 'До'");
    return false;
  }

  clearError();
  return true;
}
