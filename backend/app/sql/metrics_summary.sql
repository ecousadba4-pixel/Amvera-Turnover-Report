WITH base AS (
  SELECT
    g.total_amount,
    g.loyalty_level,
    g.created_at,
    g.checkin_date,
    g.bonus_spent
  FROM guests AS g
  WHERE 1=1
    {filters}
),
services AS (
  SELECT COALESCE(SUM(u.total_amount), 0)::numeric AS services_amount
  FROM uslugi_daily_mv AS u
  WHERE 1=1
    {services_filters}
)
SELECT
  COUNT(*)::int AS bookings_count,
  COALESCE(SUM(total_amount), 0)::numeric AS revenue,
  COALESCE(MIN(total_amount), 0)::numeric AS min_booking,
  COALESCE(MAX(total_amount), 0)::numeric AS max_booking,
  COALESCE(AVG(total_amount), 0)::numeric AS avg_check,
  COALESCE(SUM(CASE WHEN loyalty_level IN ('2 СЕЗОНА','3 СЕЗОНА','4 СЕЗОНА') THEN 1 ELSE 0 END), 0)::int AS lvl2p,
  COALESCE(AVG((created_at::date - checkin_date)::numeric), 0)::numeric AS avg_stay_days,
  COALESCE(SUM(bonus_spent), 0)::numeric AS bonus_spent_sum,
  MAX(services.services_amount) AS services_amount
FROM base
CROSS JOIN services
