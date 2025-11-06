WITH months AS (
  SELECT generate_series(%(series_start)s::date, %(series_end)s::date, interval '1 month')::date AS month_start
),
guests_base AS (
  SELECT
    DATE_TRUNC('month', g.{date_column})::date AS month_start,
    g.total_amount,
    g.loyalty_level,
    g.created_at,
    g.checkin_date,
    g.bonus_spent
  FROM guests AS g
  WHERE 1=1
    {filters}
),
guests_agg AS (
  SELECT
    month_start,
    COUNT(*)::int AS bookings_count,
    COALESCE(SUM(total_amount), 0)::numeric AS revenue,
    COALESCE(MIN(total_amount), 0)::numeric AS min_booking,
    COALESCE(MAX(total_amount), 0)::numeric AS max_booking,
    COALESCE(AVG(total_amount), 0)::numeric AS avg_check,
    COALESCE(SUM(CASE WHEN loyalty_level IN ('2 СЕЗОНА','3 СЕЗОНА','4 СЕЗОНА') THEN 1 ELSE 0 END), 0)::int AS lvl2p,
    COALESCE(AVG((created_at::date - checkin_date)::numeric), 0)::numeric AS avg_stay_days,
    COALESCE(SUM(bonus_spent), 0)::numeric AS bonus_spent_sum
  FROM guests_base
  GROUP BY month_start
),
services_agg AS (
  SELECT
    DATE_TRUNC('month', u.consumption_date)::date AS month_start,
    COALESCE(SUM(u.total_amount), 0)::numeric AS services_amount
  FROM uslugi_daily_mv AS u
  WHERE 1=1
    {services_filters}
  GROUP BY DATE_TRUNC('month', u.consumption_date)
)
SELECT
  m.month_start,
  COALESCE(g.bookings_count, 0)::int AS bookings_count,
  COALESCE(g.revenue, 0)::numeric AS revenue,
  COALESCE(g.min_booking, 0)::numeric AS min_booking,
  COALESCE(g.max_booking, 0)::numeric AS max_booking,
  COALESCE(g.avg_check, 0)::numeric AS avg_check,
  COALESCE(g.lvl2p, 0)::int AS lvl2p,
  COALESCE(g.avg_stay_days, 0)::numeric AS avg_stay_days,
  COALESCE(g.bonus_spent_sum, 0)::numeric AS bonus_spent_sum,
  COALESCE(s.services_amount, 0)::numeric AS services_amount
FROM months AS m
LEFT JOIN guests_agg AS g ON g.month_start = m.month_start
LEFT JOIN services_agg AS s ON s.month_start = m.month_start
ORDER BY m.month_start
