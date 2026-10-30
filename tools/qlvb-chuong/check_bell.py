#!/usr/bin/env python3
"""Kiểm tra chuông QLVB qua HTTP, chỉ đọc, không mở trình duyệt.

Phiên do người vận hành cấp trong file cookie (QLVB_COOKIE_FILE hoặc
--cookie-file). Script không đăng nhập, không chứa mật khẩu, không đọc
profile Chrome, không POST, không bấm chuông.

Mã thoát:
  0   không có việc mới — một dòng JSON {"status":"ok",...}
  10  có thông báo mới, số chuông tăng, hoặc một nhóm Văn bản đến > 0
  3   hết phiên — {"status":"session_expired"}
  4   HTTP 403 hoặc lỗi mạng — {"status":"forbidden"|"network",...}
  30  thiếu cấu hình, cookie sai quyền, trang không đọc được, baseline hỏng

Xem README.md cùng thư mục.
"""

from __future__ import annotations

import argparse
import html
import json
import os
import re
import socket
import stat
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from zoneinfo import ZoneInfo

EXIT_OK = 0
EXIT_NEW = 10
EXIT_SESSION = 3
EXIT_DENIED = 4
EXIT_ERROR = 30

USER_AGENT = "VanPhat-QLVB-BellCheck/1.0"
DEFAULT_BASELINE = "/workspace/qlvb-bell-baseline.json"
DEFAULT_TIMEOUT = 20
DEFAULT_BACKOFF = 1.0
BACKOFF_CAP = 5.0
MAX_BODY = 5_000_000
MAX_COOKIE_BYTES = 1_000_000
ALERTED_CAP = 400
BADGE_ID = "notification-count"
BANGKOK = ZoneInfo("Asia/Bangkok")

REDIRECT_CMD_RE = re.compile(r"""['"]redirect['"]""", re.IGNORECASE)
META_REFRESH_RE = re.compile(
    r"""http-equiv\s*=\s*['"]refresh['"][^>]*content\s*=\s*['"][^'"]*login\.zul"""
    r"""|content\s*=\s*['"][^'"]*login\.zul[^'"]*['"][^>]*http-equiv\s*=\s*['"]refresh['"]""",
    re.IGNORECASE,
)
LOCATION_JS_RE = re.compile(
    r"""(?:window\.)?location(?:\s*\.\s*(?:href|replace))?\s*(?:=|\()\s*['"][^'"]*login\.zul""",
    re.IGNORECASE,
)
HTML_COUNT_RE = re.compile(
    r"""class\s*=\s*['"][^'"]*notification-count[^'"]*['"]""",
    re.IGNORECASE,
)
ZK_COUNT_RE = re.compile(
    r"""value\s*:\s*(?:'([0-9]+)'|"([0-9]+)")""",
)
HTML_ITEM_RE = re.compile(
    r"""class\s*=\s*['"][^'"]*notification-item[^'"]*['"]""",
    re.IGNORECASE,
)
ZK_ITEM_RE = re.compile(
    r"""sclass\s*:\s*(?:'notification-item'|"notification-item")""",
)
TITLE_HTML_RE = re.compile(
    r"""class\s*=\s*['"][^'"]*notification-title[^'"]*['"][^>]*>\s*([^<]+?)\s*<""",
    re.IGNORECASE,
)
TIME_RE = re.compile(
    r"(\d{1,2}/\d{1,2}/\d{4}(?:[ T]\d{1,2}:\d{2}(?::\d{2})?)?)"
    r"|(\d{4}-\d{2}-\d{2}(?:[T ]\d{2}:\d{2}(?::\d{2})?)?(?:Z|[+-]\d{2}:\d{2})?)"
)
KHAN_RE = re.compile(r"(?<![a-z])khan(?![a-z])")
HREF_RE = re.compile(
    r"""href\s*[:=]\s*['"]([^'"]+)['"]""",
    re.IGNORECASE,
)
PASSWORD_RE = re.compile(
    r"""type\s*[:=]\s*['"]password['"]""",
    re.IGNORECASE,
)
BELL_MARKERS = (
    "notification-bell",
    "notification-count",
    "show-notification-popup",
)
GROUP_LABELS = (
    ("choXuLy", "cho xu ly"),
    ("sapDenHan", "sap den han"),
    ("quaHan", "qua han"),
    ("nhanDeBiet", "nhan de biet"),
)
SECRET_KEYS = {
    "password",
    "pass",
    "passwd",
    "matkhau",
    "mat_khau",
    "username",
    "user",
    "taikhoan",
    "tai_khoan",
}
CHROME_PATH_MARKERS = (
    "/google-chrome/",
    "/chromium/",
    "/chrome/user data/",
    "/microsoft edge/",
    "cookies.sqlite",
)
STATE_KEYS = {
    "version",
    "updatedAt",
    "tip",
    "alerted",
    "items",
    "consecutiveFailures",
    "counts",
    "lastFailure",
}
TITLE_KEYS = ("title", "trichYeu", "trich_yeu")


class CookieError(Exception):
    pass


class SessionExpiredError(Exception):
    pass


class BaselineError(Exception):
    pass


class NetworkError(Exception):
    def __init__(self, message: str = "lỗi mạng", reason: str = "network"):
        super().__init__(message)
        self.reason = reason if reason in {"timeout", "network"} else "network"


class _LoginHop(Exception):
    def __init__(self, url: str):
        super().__init__("login")
        self.url = url


@dataclass
class FetchResult:
    status: int
    final_url: str
    body: str


@dataclass
class BellView:
    count: int
    notices: list
    saw_list: bool
    saw_bell: bool = True


@dataclass
class State:
    tip: str | None = None
    alerted: list = field(default_factory=list)
    items: list = field(default_factory=list)
    consecutive_failures: int = 0
    counts: dict | None = None
    last_failure: dict | None = None


def _bangkok_now() -> str:
    return datetime.now(BANGKOK).isoformat(timespec="seconds")


def _fold(text: str) -> str:
    text = text.replace("\u00a0", " ").replace("đ", "d").replace("Đ", "D")
    norm = unicodedata.normalize("NFD", text)
    stripped = "".join(ch for ch in norm if not unicodedata.combining(ch))
    return stripped.lower()


def _unescape_zk(body: str) -> str:
    def repl(match: re.Match) -> str:
        try:
            return chr(int(match.group(1), 16))
        except ValueError:
            return match.group(0)

    return re.sub(r"\\u([0-9a-fA-F]{4})", repl, body)


def _plain_text(body: str) -> str:
    text = _unescape_zk(body)
    text = re.sub(r"<[^>]+>", " ", text)
    text = _fold(text)
    return re.sub(r"\s+", " ", text)


def _to_iso(raw: str) -> str | None:
    text = raw.strip()
    if not text:
        return None
    iso_match = re.match(
        r"^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2})(?::(\d{2}))?)?(Z|[+-]\d{2}:\d{2})?$",
        text,
    )
    if iso_match:
        year, month, day = (int(iso_match.group(i)) for i in range(1, 4))
        hour = int(iso_match.group(4) or 0)
        minute = int(iso_match.group(5) or 0)
        second = int(iso_match.group(6) or 0)
        tz_raw = iso_match.group(7)
    else:
        local = re.match(
            r"^(\d{1,2})/(\d{1,2})/(\d{4})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?$",
            text,
        )
        if not local:
            return None
        day, month, year = (int(local.group(i)) for i in range(1, 4))
        hour = int(local.group(4) or 0)
        minute = int(local.group(5) or 0)
        second = int(local.group(6) or 0)
        tz_raw = None
    try:
        naive = datetime(year, month, day, hour, minute, second)
    except ValueError:
        return None
    if not tz_raw:
        aware = naive.replace(tzinfo=BANGKOK)
    elif tz_raw == "Z":
        aware = naive.replace(tzinfo=timezone.utc).astimezone(BANGKOK)
    else:
        sign = 1 if tz_raw[0] == "+" else -1
        offset = sign * (int(tz_raw[1:3]) * 60 + int(tz_raw[4:6]))
        aware = naive.replace(tzinfo=timezone(timedelta(minutes=offset))).astimezone(BANGKOK)
    return aware.isoformat(timespec="seconds")


def _title_of(entry: dict) -> str:
    for key in TITLE_KEYS:
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return re.sub(r"\s+", " ", html.unescape(value)).strip()
    return ""


def _as_bool(value: object) -> bool:
    if isinstance(value, bool):
        return value
    if isinstance(value, (int, float)) and not isinstance(value, bool):
        return value != 0
    if isinstance(value, str):
        folded = _fold(value).strip()
        return folded in {"1", "true", "yes", "khan", "hoa toc"}
    return False


def _as_int(value: object, default: int = 0) -> int:
    try:
        return int(value)
    except (TypeError, ValueError):
        return default


def _json_line(payload: dict) -> str:
    return json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n"


def _scrub(text: str, header: str) -> str:
    if not text or not header:
        return text
    secrets: list[str] = []
    if len(header) >= 6:
        secrets.append(header)
    for part in header.split(";"):
        if "=" not in part:
            continue
        value = part.split("=", 1)[1].strip()
        if len(value) >= 6:
            secrets.append(value)
    for secret in secrets:
        text = text.replace(secret, "[redacted]")
    return text


def _path_is_browser_profile(path: Path) -> bool:
    lowered = str(path).replace("\\", "/").lower()
    if any(marker in lowered for marker in CHROME_PATH_MARKERS):
        return True
    return path.name == "Cookies" and "chrome" in lowered


def _project_roots() -> list[Path]:
    script = Path(__file__).resolve()
    roots: list[Path] = []
    if len(script.parents) >= 3:
        roots.append(script.parents[2])
    for parent in [script, *script.parents]:
        if (parent / ".git").exists():
            roots.append(parent)
            break
    unique: list[Path] = []
    for root in roots:
        if root not in unique:
            unique.append(root)
    return unique


def _path_inside_project(path: Path) -> bool:
    candidates = [path]
    try:
        candidates.append(path.resolve())
    except OSError:
        pass
    for candidate in candidates:
        for root in _project_roots():
            try:
                candidate.resolve().relative_to(root)
                return True
            except (OSError, ValueError):
                continue
    return False


def _line_is_expired(line: str, now: float) -> bool:
    if re.search(r"(?i)\bmax-age\s*=\s*(?:0|-\d+)\b", line):
        return True
    match = re.search(r"(?i)\bexpires\s*=\s*([^;]+)", line)
    if not match:
        return False
    raw = match.group(1).strip().strip('"')
    try:
        parsed = parsedate_to_datetime(raw)
    except (TypeError, ValueError, IndexError, OverflowError):
        return False
    if parsed.tzinfo is None:
        parsed = parsed.replace(tzinfo=timezone.utc)
    return parsed.timestamp() < now


def _pairs_from_cookie_line(line: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for part in line.split(";"):
        part = part.strip()
        if not part or "=" not in part:
            continue
        name, value = part.split("=", 1)
        name = name.strip()
        value = value.strip()
        if not name or name.lower() in {"path", "domain", "expires", "max-age", "samesite"}:
            continue
        pairs.append((name, value))
    return pairs


def _pairs_from_netscape(text: str) -> list[tuple[str, str, float | None]]:
    rows: list[tuple[str, str, float | None]] = []
    saw_tab = False
    for line in text.splitlines():
        raw = line.strip()
        if not raw:
            continue
        if raw.startswith("#HttpOnly_"):
            raw = raw[len("#HttpOnly_") :]
        elif raw.startswith("#"):
            continue
        parts = raw.split("\t")
        if len(parts) < 7:
            continue
        saw_tab = True
        try:
            expiry = float(parts[4])
        except ValueError:
            expiry = 0.0
        name, value = parts[-2].strip(), parts[-1].strip()
        if name:
            rows.append((name, value, expiry if expiry > 0 else None))
    return rows if saw_tab else []


def _json_expiry_epoch(value: object) -> float | None:
    if isinstance(value, bool):
        return None
    if isinstance(value, (int, float)):
        number = float(value)
        if number > 10_000_000_000:
            number /= 1000.0
        return number
    if isinstance(value, str):
        iso = _to_iso(value.strip())
        if not iso:
            return None
        return datetime.fromisoformat(iso).timestamp()
    return None


def _pairs_from_json(text: str, now: float) -> list[tuple[str, str, float | None]]:
    try:
        data = json.loads(text)
    except json.JSONDecodeError as exc:
        raise CookieError("file cookie JSON không đọc được") from exc
    if not isinstance(data, dict):
        raise CookieError("file cookie JSON phải là object")
    for key in data:
        if str(key).replace(" ", "").lower() in SECRET_KEYS:
            raise CookieError("file cookie không được chứa mật khẩu hoặc tên đăng nhập")
    raw = data.get("cookie", data.get("Cookie"))
    if not isinstance(raw, str) or not raw.strip():
        raise CookieError("file cookie JSON cần khóa cookie")
    if _line_is_expired(raw, now):
        raise SessionExpiredError("cookie hết hạn")
    for key in ("expires", "expiresAt", "expiry"):
        if key not in data:
            continue
        epoch = _json_expiry_epoch(data.get(key))
        if epoch is not None and epoch < now:
            raise SessionExpiredError("cookie hết hạn")
        break
    return [(name, value, None) for name, value in _pairs_from_cookie_line(raw.strip())]


def _read_pairs(text: str, now: float) -> list[tuple[str, str, float | None]]:
    stripped = text.lstrip()
    if stripped.startswith("{"):
        return _pairs_from_json(stripped, now)
    netscape = _pairs_from_netscape(text)
    if netscape:
        return netscape
    rows: list[tuple[str, str, float | None]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        expired = _line_is_expired(line, now)
        if line.lower().startswith("cookie:"):
            line = line.split(":", 1)[1].strip()
        for name, value in _pairs_from_cookie_line(line):
            rows.append((name, value, now - 1 if expired else None))
    return rows


def load_cookie_header(path: Path) -> str:
    """Đọc file cookie do người vận hành cấp. Không đụng profile trình duyệt."""
    if _path_is_browser_profile(path):
        raise CookieError("không đọc cookie từ profile trình duyệt")
    if _path_inside_project(path):
        raise CookieError("file cookie phải nằm ngoài repo")
    if not path.is_file():
        raise CookieError("không thấy file cookie")
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise CookieError(f"file cookie quyền {mode:04o}, cần 0600 hoặc chặt hơn")
    raw = path.read_bytes()[: MAX_COOKIE_BYTES + 1]
    if len(raw) > MAX_COOKIE_BYTES:
        raise CookieError("file cookie quá lớn")
    if raw.startswith(b"SQLite format 3"):
        raise CookieError("không đọc file cookie SQLite của trình duyệt")
    if raw.startswith(b"\x00"):
        raise CookieError("file cookie không phải dạng văn bản")
    text = raw.decode("utf-8-sig", errors="replace").strip()
    if not text:
        raise CookieError("file cookie trống")
    now = time.time()
    rows = _read_pairs(text, now)
    if not rows:
        raise CookieError("file cookie không có cặp tên=giá trị")
    alive: list[tuple[str, str]] = []
    saw_expired = False
    session_expired = False
    for name, value, expiry in rows:
        dead = expiry is not None and expiry < now
        if dead:
            saw_expired = True
            if name.upper() == "JSESSIONID":
                session_expired = True
            continue
        alive.append((name, value))
    if session_expired or (saw_expired and not alive):
        raise SessionExpiredError("cookie hết hạn")
    if not alive:
        raise CookieError("file cookie không có cặp tên=giá trị")
    header = "; ".join(f"{name}={value}" for name, value in alive)
    if "\n" in header or "\r" in header:
        raise CookieError("cookie có ký tự xuống dòng")
    return header


def _url_is_login(url: str) -> bool:
    path = urllib.parse.urlparse(url).path.lower()
    return path.endswith("login.zul") or "/login.zul" in path


def is_login_redirect(final_url: str, body: str) -> bool:
    """Hết phiên khi URL hoặc lệnh ZK redirect trỏ tới login.zul.

    ZK 6.5 thường trả HTTP 200 kèm 'redirect' tới login.zul.
    Trang đã có chuông thì không coi location.href logout là hết phiên.
    """
    if _url_is_login(final_url):
        return True
    for match in REDIRECT_CMD_RE.finditer(body):
        window = body[match.start() : match.start() + 400]
        if "login.zul" in window.lower():
            return True
    if any(marker in body for marker in BELL_MARKERS):
        return False
    if parse_group_counts(body):
        return False
    if META_REFRESH_RE.search(body) or LOCATION_JS_RE.search(body):
        return True
    if PASSWORD_RE.search(body) and "dang nhap" in _fold(body):
        return True
    return False


def _closest_zk_count(body: str, index: int) -> int | None:
    """Số badge nằm trong object ZK quanh `notification-count`, không lấy số CSS."""
    start = body.rfind("{", max(0, index - 350), index + 1)
    end = body.find("}", index)
    blob = body[start : end + 1] if start != -1 and end != -1 and end > start else ""
    match = ZK_COUNT_RE.search(blob)
    if match:
        return int(next(group for group in match.groups() if group is not None))
    ahead = body[index : index + 450]
    match = ZK_COUNT_RE.search(ahead)
    if match:
        return int(next(group for group in match.groups() if group is not None))
    return None


def _html_count(body: str) -> int | None:
    found: list[int] = []
    for match in HTML_COUNT_RE.finditer(body):
        snippet = body[match.end() : match.end() + 250]
        text = re.sub(r"<[^>]*>", " ", snippet)
        number = re.search(r"\d+", text)
        if number:
            found.append(int(number.group(0)))
    return found[-1] if found else None


def _bounded(body: str, start: int, span: int = 700) -> str:
    chunk = body[start : start + span]
    nxt = re.search(r"notification-item", chunk[1:])
    if nxt:
        chunk = chunk[: nxt.start() + 1]
    return chunk


def _extract_time(blob: str) -> str | None:
    match = TIME_RE.search(blob)
    if not match:
        return None
    raw = next(group for group in match.groups() if group)
    return _to_iso(raw)


def _extract_khan(blob: str) -> bool:
    # Mã widget kiểu n-khan không phải cờ Khẩn. Chỉ xét chữ và class.
    cleaned = re.sub(
        r"""\bid\s*[:=]\s*['"][^'"]*['"]""",
        " ",
        blob,
        flags=re.IGNORECASE,
    )
    folded = _fold(cleaned)
    return bool(KHAN_RE.search(folded) or "hoa toc" in folded)


def _extract_link(blob: str) -> str | None:
    for match in HREF_RE.finditer(blob):
        link = match.group(1).replace("\\/", "/").strip()
        if not link or link.startswith("#") or link.lower().startswith("javascript:"):
            continue
        if "login.zul" in link.lower():
            continue
        return link[:500]
    return None


def _decorate(item: dict | None, blob: str) -> dict | None:
    if not item:
        return None
    when = _extract_time(blob)
    if when:
        item["time"] = when
    item["khan"] = _extract_khan(blob)
    link = _extract_link(blob)
    if link:
        item["link"] = link
    return item


def _notice(nid: str, title: str) -> dict | None:
    nid = re.sub(r"\s+", " ", html.unescape(nid)).strip()
    title = re.sub(r"\s+", " ", html.unescape(title)).strip()
    if not nid:
        if not title:
            return None
        nid = "notice:" + title[:160]
    return {"id": nid[:200], "kind": "notice", "title": title[:500], "khan": False}


def _html_item_id(body: str, match: re.Match) -> str:
    """Chỉ lấy id trên đúng thẻ đang mở, không lấy id của dòng phía trước."""
    start = body.rfind("<", 0, match.start())
    end = body.find(">", match.end())
    if start == -1 or end == -1:
        return ""
    tag = body[start : end + 1]
    found = re.search(r"""\bid\s*=\s*['"]([^'"]+)['"]""", tag, re.IGNORECASE)
    return found.group(1) if found else ""


def _html_notices(body: str) -> list[dict]:
    notices: list[dict] = []
    for match in HTML_ITEM_RE.finditer(body):
        chunk = _bounded(body, match.end())
        title_match = TITLE_HTML_RE.search(chunk)
        title = title_match.group(1) if title_match else ""
        item = _decorate(_notice(_html_item_id(body, match), title), chunk)
        if item:
            notices.append(item)
    return notices


def _zk_notices(body: str) -> list[dict]:
    notices: list[dict] = []
    for match in ZK_ITEM_RE.finditer(body):
        start = body.rfind("{", max(0, match.start() - 400), match.start() + 1)
        end = body.find("}", match.end())
        blob = body[start : end + 1] if start != -1 and end != -1 else ""
        id_match = re.search(r"""\bid\s*:\s*(?:'([^']*)'|"([^"]*)")""", blob)
        ahead = _bounded(body, match.end())
        title_match = re.search(
            r"""sclass\s*:\s*'notification-title'[\s\S]{0,220}?value\s*:\s*'([^']*)'"""
            r"""|value\s*:\s*'([^']*)'[\s\S]{0,220}?sclass\s*:\s*'notification-title'"""
            r"""|sclass\s*:\s*"notification-title"[\s\S]{0,220}?value\s*:\s*"([^"]*)""""",
            ahead,
        )
        title = ""
        if title_match:
            title = next(group for group in title_match.groups() if group is not None)
        title = title.replace("\\/", "/").replace("\\n", " ").replace("\\'", "'")
        nid = ""
        if id_match:
            nid = next(group for group in id_match.groups() if group is not None)
        item = _decorate(_notice(nid, title), blob + ahead)
        if item:
            notices.append(item)
    return notices


def _dedupe_notices(items: list[dict]) -> list[dict]:
    seen: dict[str, dict] = {}
    for item in items:
        seen.setdefault(item["id"], item)
    return [seen[key] for key in sorted(seen)]


def parse_bell(body: str) -> BellView | None:
    """None khi trang đã đăng nhập mà không có dấu chuông."""
    if not any(marker in body for marker in BELL_MARKERS):
        return None
    counts: list[int] = []
    html_count = _html_count(body)
    if html_count is not None:
        counts.append(html_count)
    for match in re.finditer(r"notification-count", body):
        zk_count = _closest_zk_count(body, match.start())
        if zk_count is not None:
            counts.append(zk_count)
    count = counts[-1] if counts else 0
    notices = _dedupe_notices(_html_notices(body) + _zk_notices(body))
    return BellView(count=count, notices=notices, saw_list=bool(notices), saw_bell=True)


def _count_near(raw: str, plain: str, label: str) -> int | None:
    index = raw.find(label)
    if index != -1:
        window = raw[index + len(label) : index + len(label) + 400]
        valued = re.search(r"""value\s*:\s*['"](\d{1,4})['"]""", window)
        if valued:
            return int(valued.group(1))
    index = plain.find(label)
    if index == -1:
        return None
    window = plain[index + len(label) : index + len(label) + 64]
    loose = re.search(r"(?<![0-9/])(\d{1,4})(?![0-9/])", window)
    if loose:
        return int(loose.group(1))
    return None


def parse_group_counts(body: str) -> dict[str, int] | None:
    """Đếm Chờ xử lý, Sắp đến hạn, Quá hạn, Nhận để biết nếu đọc được."""
    raw = _fold(_unescape_zk(body))
    plain = _plain_text(body)
    found: dict[str, int] = {}
    for key, label in GROUP_LABELS:
        number = _count_near(raw, plain, label)
        if number is not None:
            found[key] = number
    return found or None


def _norm_tip(value: object) -> str | None:
    if not isinstance(value, str):
        return None
    text = value.strip()
    if not text:
        return None
    return _to_iso(text) or text


def _norm_badge(item: dict) -> dict:
    nid = str(item.get("id") or BADGE_ID).strip() or BADGE_ID
    if "count" not in item:
        raise BaselineError("badge baseline thiếu count")
    try:
        count = int(item.get("count"))
    except (TypeError, ValueError) as exc:
        raise BaselineError("badge baseline thiếu count") from exc
    return {"id": nid, "kind": "badge", "count": count}


def _norm_notice(item: dict) -> dict:
    title = _title_of(item)
    nid = str(item.get("id") or "").strip()
    if not nid and title:
        nid = "notice:" + title[:160]
    if not nid:
        raise BaselineError("mục baseline thiếu id hoặc kind")
    out: dict = {"id": nid[:200], "kind": "notice", "title": title[:500]}
    when = _norm_tip(item.get("time"))
    if when:
        out["time"] = when
    if "khan" in item:
        out["khan"] = _as_bool(item.get("khan"))
    link = item.get("link")
    if isinstance(link, str) and link.strip():
        out["link"] = link.strip()[:500]
    return out


def _notice_from_string(text: str) -> dict | None:
    raw = text.strip()
    if not raw:
        return None
    if "|" in raw:
        when_raw, _, title = raw.partition("|")
        when = _norm_tip(when_raw)
        item: dict = {"id": raw[:200], "kind": "notice", "title": title.strip()[:500]}
        if when:
            item["time"] = when
        return item
    return {"id": raw[:200], "kind": "notice", "title": raw[:500]}


def _absorb_entry(entry: object, items: list, alerted: list) -> None:
    if isinstance(entry, str):
        text = entry.strip()
        if not text:
            return
        alerted.append(text)
        notice = _notice_from_string(text)
        if notice:
            items.append(notice)
        return
    if not isinstance(entry, dict):
        raise BaselineError("mục baseline không phải object")
    kind = str(entry.get("kind") or "").strip()
    if kind == "badge" or (kind != "notice" and "count" in entry and "title" not in entry and "time" not in entry):
        items.append(_norm_badge(entry))
        return
    if kind == "notice":
        items.append(_norm_notice(entry))
        alerted.append(entry)
        return
    alerted.append(entry)


def _norm_counts(value: object) -> dict | None:
    if not isinstance(value, dict):
        return None
    found: dict[str, int] = {}
    for key, _label in GROUP_LABELS:
        if key in value:
            found[key] = _as_int(value.get(key), 0)
    return found or None


def load_state(path: Path) -> State:
    if not path.exists():
        return State()
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BaselineError("baseline hỏng, không ghi đè") from exc
    items: list = []
    alerted: list = []
    tip = None
    consecutive = 0
    counts = None
    last_failure = None
    if isinstance(data, list):
        for entry in data:
            _absorb_entry(entry, items, alerted)
        return State(tip=None, alerted=alerted, items=items)
    if not isinstance(data, dict):
        raise BaselineError("baseline hỏng, không ghi đè")
    if not any(key in data for key in STATE_KEYS):
        raise BaselineError("baseline hỏng, không ghi đè")
    if "version" in data and _as_int(data.get("version"), -1) != 1:
        raise BaselineError("version baseline không hỗ trợ")
    raw_items = data.get("items", [])
    if raw_items is None:
        raw_items = []
    if not isinstance(raw_items, list):
        raise BaselineError("baseline hỏng, không ghi đè")
    for entry in raw_items:
        if isinstance(entry, str):
            notice = _notice_from_string(entry)
            if notice:
                items.append(notice)
            continue
        _absorb_entry(entry, items, [])
    raw_alerted = data.get("alerted", [])
    if raw_alerted is None:
        raw_alerted = []
    if not isinstance(raw_alerted, list):
        raise BaselineError("baseline hỏng, không ghi đè")
    for entry in raw_alerted:
        if isinstance(entry, str):
            text = entry.strip()
            if text:
                alerted.append(text)
            continue
        if isinstance(entry, dict):
            alerted.append(entry)
            continue
        raise BaselineError("mục baseline không phải object")
    tip = _norm_tip(data.get("tip"))
    consecutive = max(0, _as_int(data.get("consecutiveFailures"), 0))
    counts = _norm_counts(data.get("counts"))
    failure = data.get("lastFailure")
    if isinstance(failure, dict):
        last_failure = failure
    return State(
        tip=tip,
        alerted=alerted,
        items=items,
        consecutive_failures=consecutive,
        counts=counts,
        last_failure=last_failure,
    )


def _state_payload(state: State, *, failure: dict | None = None) -> dict:
    payload: dict = {
        "version": 1,
        "updatedAt": _bangkok_now(),
        "tip": state.tip,
        "alerted": state.alerted,
        "consecutiveFailures": state.consecutive_failures,
        "items": state.items,
    }
    if state.counts is not None:
        payload["counts"] = state.counts
    if failure is not None:
        payload["lastFailure"] = failure
    return payload


def _atomic_write(path: Path, payload: dict) -> None:
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    path.parent.mkdir(parents=True, exist_ok=True)
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600)
    try:
        with os.fdopen(fd, "w", encoding="utf-8") as handle:
            handle.write(text)
            handle.flush()
            os.fsync(handle.fileno())
    except Exception:
        tmp.unlink(missing_ok=True)
        raise
    os.replace(tmp, path)
    os.chmod(path, 0o600)


def _sig(state: State) -> str:
    return json.dumps(
        {
            "tip": state.tip,
            "alerted": state.alerted,
            "items": state.items,
            "consecutiveFailures": state.consecutive_failures,
            "counts": state.counts,
            "lastFailure": state.last_failure,
        },
        ensure_ascii=False,
        sort_keys=True,
        default=str,
    )


def _entry_keys(entry: object) -> set[str]:
    if isinstance(entry, str):
        text = entry.strip()
        return {text} if text else set()
    if not isinstance(entry, dict):
        return set()
    keys: set[str] = set()
    nid = str(entry.get("id") or "").strip()
    title = _title_of(entry)
    when = _norm_tip(entry.get("time")) or ""
    if nid:
        keys.add(nid)
    if title:
        keys.add(title)
    if when and title:
        keys.add(f"{when}|{title}")
    if when and nid:
        keys.add(f"{when}|{nid}")
    return keys


def _notice_keys(notice: dict) -> set[str]:
    return _entry_keys(notice)


def _known_index(state: State) -> tuple[dict[str, str], set[str]]:
    ids: dict[str, str] = {}
    strings: set[str] = set()

    def absorb(entry: object) -> None:
        strings.update(_entry_keys(entry))
        if isinstance(entry, dict):
            nid = str(entry.get("id") or "").strip()
            if nid:
                ids.setdefault(nid, _title_of(entry))

    for entry in state.alerted:
        absorb(entry)
    for item in state.items:
        if isinstance(item, str) or (isinstance(item, dict) and item.get("kind") == "notice"):
            absorb(item)
    return ids, strings


def _is_new_notice(notice: dict, ids: dict[str, str], strings: set[str], tip: str | None) -> bool:
    nid = str(notice.get("id") or "").strip()
    title = str(notice.get("title") or "").strip()
    if nid and nid in ids:
        previous = ids[nid]
        # Chuỗi cũ lưu đúng bằng mã thì chưa có trích yếu thật, không coi là đổi tiêu đề.
        if previous and title and previous != title and previous != nid:
            return True
        return False
    if _notice_keys(notice) & strings:
        return False
    when = notice.get("time")
    if when and tip:
        left = _to_iso(str(when))
        right = _to_iso(str(tip))
        if left and right and left <= right:
            return False
    return True


def _primary_key(entry: object) -> str:
    if isinstance(entry, str):
        text = entry.strip()
        return f"s:{text}" if text else ""
    if isinstance(entry, dict):
        nid = str(entry.get("id") or "").strip()
        if nid:
            return f"i:{nid}"
        title = _title_of(entry)
        when = _norm_tip(entry.get("time")) or ""
        if when or title:
            return f"t:{when}|{title}"
    return ""


def _alert_obj(notice: dict) -> dict:
    item: dict = {
        "id": notice.get("id") or "",
        "time": notice.get("time"),
        "title": notice.get("title") or "",
        "khan": bool(notice.get("khan")),
    }
    if notice.get("link"):
        item["link"] = notice["link"]
    return item


def _merge_alerted(alerted: list, notices: list[dict]) -> list:
    out: list = []
    index: dict[str, int] = {}
    for entry in alerted:
        key = _primary_key(entry)
        if not key or key in index:
            continue
        index[key] = len(out)
        out.append(entry)
    for notice in notices:
        entry = _alert_obj(notice)
        key = _primary_key(entry)
        if not key or key in index:
            continue
        index[key] = len(out)
        out.append(entry)
    if len(out) > ALERTED_CAP:
        out = out[-ALERTED_CAP:]
    return out


def _merge_tip(old: str | None, notices: list[dict]) -> str | None:
    best = _to_iso(old) if old else None
    raw_best = best or old
    for notice in notices:
        when = notice.get("time")
        if not when:
            continue
        iso = _to_iso(str(when))
        if iso and (best is None or iso > best):
            best = iso
            raw_best = iso
    return raw_best


def project_items(previous: list, view: BellView) -> list:
    items = [{"id": BADGE_ID, "kind": "badge", "count": view.count}]
    if view.saw_list:
        notices = []
        for notice in view.notices:
            item = {
                "id": notice["id"],
                "kind": "notice",
                "title": notice.get("title") or "",
            }
            if notice.get("time"):
                item["time"] = notice["time"]
            if notice.get("khan"):
                item["khan"] = True
            if notice.get("link"):
                item["link"] = notice["link"]
            notices.append(item)
    else:
        notices = [item for item in previous if isinstance(item, dict) and item.get("kind") == "notice"]
    notices.sort(key=lambda item: item.get("id") or "")
    items.extend(notices)
    return items


def _badge_delta(previous: list, view: BellView) -> dict | None:
    if not view.saw_bell:
        return None
    old = 0
    for item in previous:
        if isinstance(item, dict) and item.get("kind") == "badge" and item.get("id") == BADGE_ID:
            old = _as_int(item.get("count"), 0)
            break
    if view.count > old:
        return {"count": view.count, "truoc": old, "them": view.count - old}
    return None


def _public_notice(notice: dict) -> dict:
    item = {
        "id": notice.get("id") or "",
        "time": notice.get("time"),
        "title": notice.get("title") or "",
        "khan": bool(notice.get("khan")),
    }
    if notice.get("link"):
        item["link"] = notice["link"]
    return item


def _absolute_link(link: str, page_url: str) -> str:
    if link.startswith("http://") or link.startswith("//"):
        return ""
    if link.startswith("https://"):
        return link
    return urllib.parse.urljoin(page_url, link)


def _apply_links(notices: list[dict], page_url: str) -> None:
    for notice in notices:
        link = notice.get("link")
        if not link:
            notice.pop("link", None)
            continue
        absolute = _absolute_link(str(link), page_url)
        if absolute:
            notice["link"] = absolute
        else:
            notice.pop("link", None)


def build_headers(cookie: str) -> dict[str, str]:
    if "\n" in cookie or "\r" in cookie:
        raise CookieError("cookie có ký tự xuống dòng")
    return {
        "Cookie": cookie,
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
    }


class _SafeRedirect(urllib.request.HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urllib.parse.urlparse(newurl)
        if parsed.scheme != "https":
            raise NetworkError("lỗi mạng", reason="network")
        if _url_is_login(newurl):
            raise _LoginHop(newurl)
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def live_fetch(url: str, cookie: str, timeout: float) -> FetchResult:
    # Fixture chỉ khi thử cục bộ. Routine thật không đặt hai biến này.
    if os.environ.get("QLVB_ALLOW_FIXTURE") == "1" and os.environ.get("QLVB_HTTP_FIXTURE"):
        return _fetch_fixture(os.environ["QLVB_HTTP_FIXTURE"])
    request = urllib.request.Request(url, headers=build_headers(cookie), method="GET")
    opener = urllib.request.build_opener(_SafeRedirect())
    try:
        with opener.open(request, timeout=timeout) as response:
            raw = response.read(MAX_BODY)
            charset = response.headers.get_content_charset() or "utf-8"
            return FetchResult(
                status=getattr(response, "status", 200),
                final_url=response.geturl(),
                body=raw.decode(charset, errors="replace"),
            )
    except _LoginHop as exc:
        return FetchResult(status=302, final_url=exc.url, body="")
    except urllib.error.HTTPError as exc:
        raw = exc.read(200_000)
        return FetchResult(
            status=exc.code,
            final_url=exc.geturl() or url,
            body=raw.decode("utf-8", errors="replace"),
        )
    except (TimeoutError, socket.timeout) as exc:
        raise NetworkError("lỗi mạng", reason="timeout") from exc
    except urllib.error.URLError as exc:
        reason = exc.reason
        if isinstance(reason, NetworkError):
            raise reason
        if isinstance(reason, (TimeoutError, socket.timeout)) or "timed out" in str(reason).lower():
            raise NetworkError("lỗi mạng", reason="timeout") from exc
        raise NetworkError("lỗi mạng", reason="network") from exc
    except OSError as exc:
        raise NetworkError("lỗi mạng", reason="network") from exc


def _fetch_fixture(path: str) -> FetchResult:
    """Chỉ dùng khi thử. Routine thật không đặt QLVB_HTTP_FIXTURE."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("error"):
        reason = "timeout" if str(data.get("error")) == "timeout" else "network"
        raise NetworkError("lỗi mạng", reason=reason)
    return FetchResult(
        status=int(data.get("status", 200)),
        final_url=str(data.get("finalUrl") or data.get("final_url") or ""),
        body=str(data.get("body") or ""),
    )


def _require_https(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise CookieError("QLVB_PAGE_URL phải là URL https")


def _is_nginx_forbidden(result: FetchResult) -> bool:
    if result.status == 403:
        return True
    if result.status != 200:
        return False
    sample = result.body[:2500].lower()
    if "403 forbidden" not in sample or "nginx" not in sample:
        return False
    if any(marker in result.body for marker in BELL_MARKERS):
        return False
    if parse_group_counts(result.body):
        return False
    return True


def _backoff_seconds(env: dict[str, str]) -> float:
    raw = (env.get("QLVB_RETRY_BACKOFF") or "").strip()
    if not raw:
        return DEFAULT_BACKOFF
    try:
        value = float(raw)
    except ValueError as exc:
        raise CookieError("QLVB_RETRY_BACKOFF không hợp lệ") from exc
    if value < 0:
        value = 0.0
    return min(value, BACKOFF_CAP)


def _attempt_fetch(fetch, url: str, cookie: str, timeout: float, sleep, backoff: float):
    """Một lần thử lại, chỉ cho 403 và lỗi mạng. Hết phiên thì không thử lại."""
    for attempt in (1, 2):
        try:
            result = fetch(url, cookie, timeout)
        except NetworkError as exc:
            if attempt == 1:
                sleep(backoff)
                continue
            reason = getattr(exc, "reason", "network") or "network"
            return None, "network", reason
        if result.status == 401 or is_login_redirect(result.final_url, result.body):
            return result, "session", None
        if _is_nginx_forbidden(result):
            if attempt == 1:
                sleep(backoff)
                continue
            return None, "forbidden", "forbidden"
        return result, None, None
    return None, "network", "network"


def _finish(code: int, out: str, err: str, header: str) -> tuple[int, str, str]:
    return code, _scrub(out, header), _scrub(err, header)


def _session_result(header: str) -> tuple[int, str, str]:
    return _finish(EXIT_SESSION, _json_line({"status": "session_expired"}), "qlvb-bell: hết phiên", header)


def _failure_result(
    baseline: Path,
    state: State,
    status: str,
    reason: str | None,
    header: str,
) -> tuple[int, str, str]:
    state.consecutive_failures += 1
    failure = {"status": status, "at": _bangkok_now()}
    if status == "network":
        failure["reason"] = reason if reason in {"timeout", "network"} else "network"
    err = "qlvb-bell: HTTP 403" if status == "forbidden" else "qlvb-bell: lỗi mạng"
    try:
        _atomic_write(baseline, _state_payload(state, failure=failure))
    except OSError:
        err = err + "; không ghi được baseline"
    payload: dict = {"status": status, "consecutiveFailures": state.consecutive_failures}
    if status == "network":
        payload["reason"] = failure.get("reason", "network")
    return _finish(EXIT_DENIED, _json_line(payload), err, header)


def execute(env: dict[str, str], fetch, sleep=time.sleep) -> tuple[int, str, str]:
    """Trả (mã thoát, stdout, stderr). Không in cookie."""
    cookie_path = (env.get("QLVB_COOKIE_FILE") or "").strip()
    page_url = (env.get("QLVB_PAGE_URL") or "").strip()
    baseline_path = Path((env.get("QLVB_BASELINE_FILE") or DEFAULT_BASELINE).strip())
    seed = (env.get("QLVB_SEED") or "").strip() == "1"
    if not cookie_path:
        return EXIT_ERROR, "", "qlvb-bell: thiếu QLVB_COOKIE_FILE"
    if not page_url:
        return EXIT_ERROR, "", "qlvb-bell: thiếu QLVB_PAGE_URL"
    try:
        timeout = float(env.get("QLVB_TIMEOUT") or DEFAULT_TIMEOUT)
    except ValueError:
        return EXIT_ERROR, "", "qlvb-bell: QLVB_TIMEOUT không hợp lệ"
    header = ""
    try:
        _require_https(page_url)
        backoff = _backoff_seconds(env)
        header = load_cookie_header(Path(cookie_path))
        state = load_state(baseline_path)
        result, problem, reason = _attempt_fetch(fetch, page_url, header, timeout, sleep, backoff)
    except SessionExpiredError:
        return _session_result(header)
    except CookieError as exc:
        return _finish(EXIT_ERROR, "", f"qlvb-bell: {exc}", header)
    except BaselineError as exc:
        return _finish(EXIT_ERROR, "", f"qlvb-bell: {exc}", header)
    except Exception:
        return _finish(EXIT_ERROR, "", "qlvb-bell: lỗi không đọc được trang", header)

    if problem == "session":
        return _session_result(header)
    if problem in {"forbidden", "network"}:
        return _failure_result(baseline_path, state, problem, reason, header)
    if result is None or result.status != 200:
        code = getattr(result, "status", 0)
        return _finish(EXIT_ERROR, "", f"qlvb-bell: HTTP {code}", header)

    view = parse_bell(result.body)
    counts = parse_group_counts(result.body)
    if view is None and counts is None:
        return _finish(EXIT_ERROR, "", "qlvb-bell: không thấy chuông trong trang", header)
    if view is None:
        view = BellView(count=0, notices=[], saw_list=False, saw_bell=False)
    _apply_links(view.notices, page_url)

    ids, strings = _known_index(state)
    if seed or not view.saw_list:
        new_notices: list[dict] = []
    else:
        new_notices = [
            notice
            for notice in view.notices
            if _is_new_notice(notice, ids, strings, state.tip)
        ]
    new_notices.sort(key=lambda notice: (notice.get("time") or "9999", notice.get("id") or ""))
    badge = None if seed or new_notices else _badge_delta(state.items, view)
    hot_counts = bool(counts) and any(value > 0 for value in counts.values())
    has_new = bool(new_notices) or badge is not None or (hot_counts and not seed)

    if view.saw_bell:
        items = project_items(state.items, view)
    else:
        items = state.items
    alerted = _merge_alerted(state.alerted, view.notices) if view.saw_list else state.alerted
    tip = _merge_tip(state.tip, view.notices) if view.saw_list else state.tip
    stored_counts = counts if counts is not None else state.counts
    new_state = State(
        tip=tip,
        alerted=alerted,
        items=items,
        consecutive_failures=0,
        counts=stored_counts,
        last_failure=None,
    )
    if _sig(new_state) != _sig(state):
        try:
            _atomic_write(baseline_path, _state_payload(new_state))
        except OSError:
            return _finish(EXIT_ERROR, "", "qlvb-bell: không ghi được baseline", header)

    payload: dict = {
        "status": "new" if has_new else "ok",
        "moi": [] if seed else [_public_notice(notice) for notice in new_notices],
        "counts": counts,
    }
    if badge is not None:
        payload["badge"] = badge
    code = EXIT_NEW if has_new else EXIT_OK
    return _finish(code, _json_line(payload), "", header)


def _apply_args(env: dict[str, str], argv: list[str] | None) -> dict[str, str]:
    parser = argparse.ArgumentParser(
        prog="check_bell.py",
        description="Kiểm tra chuông QLVB bằng GET. Không đăng nhập, không POST.",
    )
    parser.add_argument("--cookie-file", help="File cookie nằm ngoài repo, quyền 0600")
    parser.add_argument("--baseline-file", help="File state (baseline) quyền 0600")
    parser.add_argument("--page-url", help="URL https đầy đủ tới trang main.zul")
    parser.add_argument("--timeout", help="Timeout giây")
    parser.add_argument("--seed", action="store_true", help="Ghi mốc rồi thoát 0")
    args = parser.parse_args(argv)
    merged = dict(env)
    if args.cookie_file:
        merged["QLVB_COOKIE_FILE"] = args.cookie_file
    if args.baseline_file:
        merged["QLVB_BASELINE_FILE"] = args.baseline_file
    if args.page_url:
        merged["QLVB_PAGE_URL"] = args.page_url
    if args.timeout:
        merged["QLVB_TIMEOUT"] = args.timeout
    if args.seed:
        merged["QLVB_SEED"] = "1"
    return merged


def main(argv: list[str] | None = None) -> int:
    code, out, err = execute(_apply_args(dict(os.environ), argv), live_fetch)
    if err:
        print(err, file=sys.stderr)
    if out:
        sys.stdout.write(out)
    return code


if __name__ == "__main__":
    sys.exit(main())
