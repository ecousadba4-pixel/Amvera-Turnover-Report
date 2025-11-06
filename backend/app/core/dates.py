from __future__ import annotations

from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from typing import Optional

from psycopg import sql

from app.schemas.enums import DateField, MonthlyRange

MIDNIGHT = time(hour=0, minute=0)


@dataclass(frozen=True, slots=True)
class DateFieldResolution:
    column: str
    reason: str


_DATE_FIELD_RESOLUTIONS = {
    DateField.checkin: DateFieldResolution("checkin_date", "checkin_date"),
    DateField.created: DateFieldResolution("created_at", "created_at"),
}
CONSUMPTION_DATE_RESOLUTION = DateFieldResolution("consumption_date", "consumption_date")


def resolve_date_field(wanted: DateField) -> DateFieldResolution:
    return _DATE_FIELD_RESOLUTIONS.get(wanted, _DATE_FIELD_RESOLUTIONS[DateField.created])


def build_filters(
    resolution: DateFieldResolution,
    date_from: Optional[date],
    date_to: Optional[date],
    *,
    table_alias: Optional[str] = None,
) -> tuple[sql.Composable, dict[str, datetime]]:
    clauses: list[sql.Composable] = []
    params: dict[str, datetime] = {}

    if table_alias:
        column_sql = sql.SQL("{}.{}").format(
            sql.Identifier(table_alias), sql.Identifier(resolution.column)
        )
    else:
        column_sql = sql.Identifier(resolution.column)

    if date_from:
        clauses.append(sql.SQL("AND {} >= %(from)s").format(column_sql))
        params["from"] = datetime.combine(date_from, MIDNIGHT)

    if date_to:
        clauses.append(sql.SQL("AND {} < %(to)s").format(column_sql))
        params["to"] = datetime.combine(date_to + timedelta(days=1), MIDNIGHT)

    if clauses:
        filters = sql.SQL("\n          ").join(clauses)
    else:
        filters = sql.SQL("")

    return filters, params


def add_months(base: date, months: int) -> date:
    year = base.year + (base.month - 1 + months) // 12
    month = (base.month - 1 + months) % 12 + 1
    return date(year, month, 1)


def month_range(boundary: MonthlyRange) -> tuple[date, date]:
    today = date.today()
    current_month = date(today.year, today.month, 1)

    if boundary is MonthlyRange.this_year:
        start_month = date(today.year, 1, 1)
    else:
        start_month = add_months(current_month, -11)

    return start_month, current_month


def last_day_of_month(month_start: date) -> date:
    next_month = add_months(month_start, 1)
    return next_month - timedelta(days=1)


__all__ = [
    "CONSUMPTION_DATE_RESOLUTION",
    "DateFieldResolution",
    "MIDNIGHT",
    "add_months",
    "build_filters",
    "last_day_of_month",
    "month_range",
    "resolve_date_field",
]
