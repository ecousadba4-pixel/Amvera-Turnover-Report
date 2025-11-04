# U4S Revenue Dashboard (Amvera + Flexbe)

## Backend (FastAPI on Amvera)
- Auth: header `X-Auth-Hash` with SHA-256(password).
- Endpoint: `GET /api/metrics?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&date_field=checkout|created|checkin`

### Env vars (Amvera)
- `APP_ENV=prod`
- `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DBNAME`
- `ADMIN_PASSWORD_SHA256=<hex>`
- `CORS_ALLOW_ORIGINS=https://usadba4.ru,https://*.flexbe.com,https://*.flexbe.site`
- `PORT=8000` (optional)
- `READ_ONLY=false` (optional)

### Optional DB migration
```sql
ALTER TABLE guests ADD COLUMN IF NOT EXISTS checkout_date DATE;
CREATE INDEX IF NOT EXISTS idx_guests_checkout_date ON guests (checkout_date);
```

## Frontend (Flexbe HTML block)
- Single file: `frontend/revenue_dashboard.html`
- Shows presets: **Current month (default)**, **Last month**, **Last weekend**.
- Mobile-first (iPhone 17 Pro).

### Configure
In HTML set:
```js
const API_BASE = "https://<your-amvera-domain>";
```

### Compute SHA-256 of password (Python)
```python
import hashlib
print(hashlib.sha256("YourPassword".encode()).hexdigest())
```
