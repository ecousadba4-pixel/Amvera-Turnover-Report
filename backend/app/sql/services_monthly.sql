WITH months AS (
  SELECT generate_series(%(series_start)s::date, %(series_end)s::date, interval '1 month')::date AS month_start
),
services_base AS (
  SELECT
    DATE_TRUNC('month', u.consumption_date)::date AS month_start,
    COALESCE(u.total_amount, 0)::numeric AS total_amount
  FROM uslugi_daily_mv AS u
  WHERE 1=1
    {filters}
    {service_filter}
),
services_agg AS (
  SELECT
    month_start,
    COALESCE(SUM(total_amount), 0)::numeric AS total_amount
  FROM services_base
  GROUP BY month_start
)
SELECT
  m.month_start,
  COALESCE(s.total_amount, 0)::numeric AS total_amount
FROM months AS m
LEFT JOIN services_agg AS s ON s.month_start = m.month_start
ORDER BY m.month_start
