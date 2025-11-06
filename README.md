# U4S Revenue Dashboard (Amvera + Flexbe)

## Backend (FastAPI on Amvera)
- Auth: `POST /api/auth/login` выдаёт bearer-токен. Используйте заголовок `Authorization: Bearer <token>` для доступа к API.
- Endpoint: `GET /api/metrics?date_from=YYYY-MM-DD&date_to=YYYY-MM-DD&date_field=created|checkin`

### Env vars (Amvera)
- `APP_ENV=prod`
- `DATABASE_URL=postgresql+psycopg://USER:PASSWORD@HOST:PORT/DBNAME`
- `ADMIN_PASSWORD_SHA256=<hex>`
- `CORS_ALLOW_ORIGINS=https://usadba4.ru,https://*.flexbe.com,https://*.flexbe.site`
- `PORT=8000` (optional)

## Frontend (Flexbe HTML block)
- Single file: `frontend/revenue_dashboard.html`
- Shows presets: **Current month (default)**, **Last month**, **Last weekend**.
- Mobile-first (iPhone 17 Pro).

### Configure
По умолчанию фронтенд обращается к `https://u4s-turnover-karinausadba.amvera.io`.
Если используется другой домен, перед подключением `app.js` задайте глобальную
переменную:
```html
<script>
  window.U4S_API_BASE = "https://<your-amvera-domain>";
</script>
```

### Compute SHA-256 of password (Python)
```python
import hashlib
print(hashlib.sha256("YourPassword".encode()).hexdigest())
```
