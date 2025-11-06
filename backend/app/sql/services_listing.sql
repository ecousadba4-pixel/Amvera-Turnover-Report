WITH aggregated AS (
  SELECT
    COALESCE(u.uslugi_type, 'Без категории') AS service_type,
    COALESCE(SUM(u.total_amount), 0)::numeric AS total_amount
  FROM uslugi_daily_mv AS u
  WHERE 1=1
    {filters}
  GROUP BY COALESCE(u.uslugi_type, 'Без категории')
),
ranked AS (
  SELECT
    service_type,
    total_amount,
    ROW_NUMBER() OVER (ORDER BY total_amount DESC, service_type) AS row_number,
    COUNT(*) OVER () AS total_items,
    COALESCE(SUM(total_amount) OVER (), 0)::numeric AS overall_amount
  FROM aggregated
),
limited AS (
  SELECT
    service_type,
    total_amount,
    total_items,
    overall_amount,
    FALSE AS is_summary,
    row_number AS sort_order
  FROM ranked
  WHERE row_number > %(offset)s
    AND row_number <= %(offset)s + %(limit)s
),
summary AS (
  SELECT
    NULL::text AS service_type,
    NULL::numeric AS total_amount,
    COALESCE(MAX(total_items), 0)::int AS total_items,
    COALESCE(MAX(overall_amount), 0)::numeric AS overall_amount,
    TRUE AS is_summary,
    (%(offset)s + %(limit)s + 1) AS sort_order
  FROM ranked
),
combined AS (
  SELECT * FROM limited
  UNION ALL
  SELECT * FROM summary
)
SELECT
  service_type,
  total_amount,
  total_items,
  overall_amount,
  is_summary
FROM combined
ORDER BY sort_order
