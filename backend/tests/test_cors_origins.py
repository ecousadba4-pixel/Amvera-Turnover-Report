import os
import re
import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

os.environ.setdefault("DATABASE_URL", "postgresql+psycopg://user:pass@localhost:5432/db")
os.environ.setdefault("ADMIN_PASSWORD_SHA256", "a" * 64)

from app.main import _parse_cors_origins


def test_parse_all_origins_with_star():
    allow_origins, regex = _parse_cors_origins("*")
    assert allow_origins == ["*"]
    assert regex is None


def test_parse_all_origins_when_empty():
    allow_origins, regex = _parse_cors_origins("")
    assert allow_origins == ["*"]
    assert regex is None


def test_parse_explicit_origins():
    allow_origins, regex = _parse_cors_origins("https://foo.com, http://bar.com/")
    assert allow_origins == ["https://foo.com", "http://bar.com"]
    assert regex is None


def test_parse_wildcard_origins_to_regex():
    allow_origins, regex = _parse_cors_origins("https://*.example.com")
    assert allow_origins == []
    assert regex == r"^https://(?:[^/.]+\.)*example\.com$"
    assert re.match(regex, "https://foo.example.com")
    assert re.match(regex, "https://bar.baz.example.com")
    assert not re.match(regex, "https://example.net")


def test_parse_mixed_origins():
    allow_origins, regex = _parse_cors_origins(
        "https://app.example.com, https://*.example.com, https://*.example.org"
    )
    assert allow_origins == ["https://app.example.com"]
    assert regex == (
        r"^https://(?:[^/.]+\.)*example\.com$|^https://(?:[^/.]+\.)*example\.org$"
    )
