from __future__ import annotations

from enum import Enum


class DateField(str, Enum):
    created = "created"
    checkin = "checkin"


class MonthlyRange(str, Enum):
    this_year = "this_year"
    last_12_months = "last_12_months"


class MonthlyMetric(str, Enum):
    revenue = "revenue"
    avg_check = "avg_check"
    bookings_count = "bookings_count"
    level2plus_share = "level2plus_share"
    min_booking = "min_booking"
    max_booking = "max_booking"
    avg_stay_days = "avg_stay_days"
    bonus_payment_share = "bonus_payment_share"
    services_share = "services_share"


__all__ = [
    "DateField",
    "MonthlyRange",
    "MonthlyMetric",
]
