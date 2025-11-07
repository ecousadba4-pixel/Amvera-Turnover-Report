export const DEFAULT_API_BASE = "https://u4s-turnover-karinausadba.amvera.io";

export const DATE_FIELD_CREATED = "created";
export const DATE_FIELD_CHECKIN = "checkin";
export const DATE_FIELD_ALIASES = {
  [DATE_FIELD_CREATED]: [DATE_FIELD_CREATED, "created_at"],
  [DATE_FIELD_CHECKIN]: [DATE_FIELD_CHECKIN, "checkin_date"],
};

export const SECTION_REVENUE = "revenue";
export const SECTION_SERVICES = "services";
export const SECTION_MONTHLY = "monthly";
export const DEFAULT_ACTIVE_SECTION = SECTION_REVENUE;
export const DATE_FIELD = DATE_FIELD_CREATED; // DATE_FIELD_CREATED | DATE_FIELD_CHECKIN

export const STORAGE_KEY = "u4sRevenueAuthSession";
export const TOKEN_STORAGE_VERSION = 2;
export const TOKEN_TYPE_TOKEN = "token";
export const FETCH_DEBOUNCE_DELAY = 400;

export const MONTHLY_RANGE_THIS_YEAR = "this_year";
export const MONTHLY_RANGE_LAST_12 = "last_12_months";
export const MONTHLY_RANGE_DEFAULT = MONTHLY_RANGE_THIS_YEAR;
export const MONTHLY_INITIAL_MESSAGE = "Выберите показатель, чтобы увидеть динамику";
export const MONTHLY_DEFAULT_TITLE = "Помесячная динамика";
export const MONTHLY_CONTEXT_METRIC = "metric";
export const MONTHLY_CONTEXT_SERVICE = "service";

export const REQUEST_CACHE_TTL_MS = 5 * 60 * 1000;
export const REQUEST_CACHE_MAX_ENTRIES = 50;

export const HEIGHT_UPDATE_DEBOUNCE_MS = 120;

export const MONTHLY_METRIC_CONFIG = {
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
