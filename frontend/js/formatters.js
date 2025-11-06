import { MONTHLY_METRIC_CONFIG } from "./config.js";

const RUB_FORMATTER = new Intl.NumberFormat("ru-RU", {
  style: "currency",
  currency: "RUB",
  maximumFractionDigits: 0,
});

const percentFormatters = new Map();
const numberFormatters = new Map();

const monthFormatter = new Intl.DateTimeFormat("ru-RU", {
  month: "long",
  year: "numeric",
});

export const toNumber = (value) => {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string" && value.trim() !== "") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
};

export const fmtRub = (value) => RUB_FORMATTER.format(value);

export const fmtPct = (value, fractionDigits = 1) =>
  getPercentFormatter(fractionDigits).format(value);

export const fmtNumber = (value, fractionDigits = 0) =>
  getNumberFormatter(fractionDigits).format(value);

export const formatMonthLabel = (isoDate) => {
  if (!isoDate) {
    return "—";
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return "—";
  }
  const raw = monthFormatter.format(parsed);
  return raw ? raw.charAt(0).toUpperCase() + raw.slice(1) : "—";
};

export const formatMonthlyValue = (metric, value) => {
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
};

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
