from __future__ import annotations

import logging
import sys
from typing import Any

from loguru import logger

from app.settings import Settings


class InterceptHandler(logging.Handler):
    """Перенаправляет стандартные логи в Loguru."""

    def emit(self, record: logging.LogRecord) -> None:  # pragma: no cover - инфраструктурный код
        try:
            level = logger.level(record.levelname).name
        except ValueError:
            level = record.levelno

        frame, depth = logging.currentframe(), 2
        while frame and frame.f_code.co_filename == logging.__file__:
            frame = frame.f_back
            depth += 1

        logger.opt(depth=depth, exception=record.exc_info).log(level, record.getMessage())


def _build_format(settings: Settings) -> str:
    if settings.log_json:
        # Формат не используется при JSON, но возвращаем строку по умолчанию.
        return "{message}"

    return "{time:YYYY-MM-DD HH:mm:ss.SSS} | {level: <8} | {name}:{function}:{line} | {message}"


def configure_logging(settings: Settings) -> None:
    """Настраивает логирование приложения через Loguru."""

    intercept_handler = InterceptHandler()
    logging.basicConfig(handlers=[intercept_handler], level=0, force=True)

    for logger_name in ("uvicorn", "uvicorn.error", "uvicorn.access"):
        logging_logger = logging.getLogger(logger_name)
        logging_logger.handlers = [intercept_handler]
        logging_logger.propagate = False

    logger.remove()
    logger.add(
        sys.stdout,
        level=settings.log_level,
        format=_build_format(settings),
        enqueue=True,
        backtrace=settings.app_env != "prod",
        diagnose=settings.app_env != "prod",
        serialize=settings.log_json,
    )


def bind_logger(**extra: Any):
    """Упрощает добавление контекста в логи."""

    return logger.bind(**extra)


__all__ = ["configure_logging", "bind_logger", "logger"]
