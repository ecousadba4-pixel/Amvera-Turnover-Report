# Amvera Turnover Report

Отчёт по выручке для Karina Usadba состоит из backend-сервиса на FastAPI (Amvera) и
фронтенда для Flexbe HTML-блока. Этот README описывает текущую структуру
репозитория и даёт инструкции по запуску и настройке. 

## Структура проекта

```
backend/
  app/                # FastAPI-приложение, настройки, слои сервисов и SQL-запросы
  requirements.txt    # Минимальные зависимости для продакшн-сборки
  tests/              # pytest-спеки для зависимостей API и CORS
frontend/
  loader.html         # Файл-загрузчик для Flexbe, подтягивает актуальную версию дашборда
  revenue_dashboard.html
  styles.css
  app.js              # Точка входа, подключающая модульную JS-логику
  js/                 # Модули: API-клиенты, сервисы, форматирование, UI
```

## Backend (FastAPI)

### Зависимости и запуск локально

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\\Scripts\\activate
pip install --upgrade pip
pip install -r requirements.txt
pip install pytest          # для локального прогона тестов

# Запуск API (по умолчанию порт 8101)
uvicorn app.main:app --host 0.0.0.0 --port 8101
```

Приложение использует асинхронные пуллы подключений к PostgreSQL (psycopg) и
разделение на слои `repositories/` и `services/`. SQL-хранимые запросы лежат в
`app/sql/` и подгружаются через `QueryLoader`.

### Переменные окружения

| Имя | Назначение |
| --- | --- |
| `APP_ENV` | Читается в /health, влияет на вывод окружения. По умолчанию `prod`. |
| `DATABASE_URL` | Строка подключения PostgreSQL в формате `postgresql+psycopg://user:pass@host:port/db`. |
| `ADMIN_PASSWORD_SHA256` | SHA-256 хеш пароля администратора (можно передать plain-text — будет захеширован). |
| `CORS_ALLOW_ORIGINS` | Список origins через запятую. Поддерживаются wildcard-ы (`https://*.flexbe.com`). |
| `AUTH_TOKEN_SECRET` | Необязательный секрет для токенов. Если не задан, вычисляется из хеша пароля. |
| `AUTH_TOKEN_TTL_SECONDS` | Время жизни bearer-токена (по умолчанию 3600 секунд). |
| `PORT` | Порт uvicorn (опционально, 8000 по умолчанию). |

### API

| Метод | Путь | Описание |
| ----- | ---- | -------- |
| `GET /health` | Проверка статуса приложения и базы (`database.ok`). |
| `POST /api/auth/login` | Принимает `{"password": "..."}` и возвращает bearer-токен. |
| `GET /api/metrics` | Возвращает агрегированные метрики по бронированиям. Параметры: `date_from`, `date_to`, `date_field` (`created` \| `checkin`). Требует заголовок `Authorization: Bearer <token>`. |
| `GET /api/metrics/monthly` | Помесячная динамика. Параметры: `metric` (см. `MonthlyMetric`), `range` (`this_year` \| `last_12_months`), `date_field`. Также требует bearer-токен. |

Автотесты (`backend/tests/`) покрывают обязательность авторизации и
конфигурацию CORS.

## Frontend (Flexbe HTML блок)

Основной интерфейс находится в `frontend/revenue_dashboard.html` и стилях
`frontend/styles.css`. Логика разбита на модули в `frontend/js/`, точка входа —
`frontend/app.js`, который подключает и инициализирует дашборд (`init.js`).

### Особенности

* **Авторизация** — форма ввода пароля, результат хранится в localStorage
  (`TOKEN_STORAGE_VERSION = 2`).
* **Фильтры по датам** — предустановленные диапазоны и ручной выбор, все значения
  синхронизируются с запросами к API.
* **Разделы** — «Выручка» и «Услуги», плюс блок помесячной динамики с метриками из
  `config.js` (`MONTHLY_METRIC_CONFIG`).
* **Кеширование** — модуль `js/cache.js` хранит ответы API на 5 минут.
* **Адаптивность** — вёрстка «mobile-first» с пересчётом высоты через
  `js/resizer.js` для корректной интеграции в iframe Flexbe.

### Встраивание и настройка

1. Загрузите `loader.html`, `revenue_dashboard.html`, `styles.css`, `app.js` и папку `js/`
   в Flexbe (HTML-блок).
2. По умолчанию клиент обращается к `https://u4s-turnover-karinausadba.amvera.io`.
   Чтобы использовать другой домен, объявите перед подключением `app.js`:

   ```html
   <script>
     window.U4S_API_BASE = "https://your-domain.amvera.io";
   </script>
   ```

3. При необходимости можно переопределять другие настройки, присваивая значения
   в `window.U4S_CONFIG` до загрузки скрипта (см. `frontend/js/config.js`).

`frontend/loader.html` служит прокладкой с обновлением кэша: он считывает
`version.json` и редиректит iframe на `revenue_dashboard.html?v=...`.

## Полезные сниппеты

Посчитать SHA-256 для `ADMIN_PASSWORD_SHA256`:

```python
import hashlib
print(hashlib.sha256("YourPassword".encode()).hexdigest())
```

## Лицензия

Проект распространяется внутри команды Karina Usadba / U4S. Уточните условия
использования перед внешним распространением.
test
