#!/usr/bin/env python3
"""Kiểm tra chuông QLVB, chỉ đọc.

Cách khuyến nghị: nối Chrome đang đăng nhập qua DevTools (--cdp, mặc định
cổng 9222). Script reload tab main.zul rồi đọc DOM. Không bấm, không đăng nhập.

Cách cookie (QLVB_TRANSPORT=cookie) giữ lại để thử fixture. GET kèm cookie
không đủ với ZK vì server còn gắn phiên với bước JS trong trình duyệt.

Script không chứa mật khẩu, không đọc profile Chrome, không POST, không in cookie.

Mã thoát:
  0   không có việc mới — một dòng JSON {"status":"ok",...}
  10  có thông báo mới, số chuông tăng, hoặc một nhóm Văn bản đến > 0
  3   hết phiên — {"status":"session_expired"}
  4   HTTP 403 hoặc lỗi mạng — {"status":"forbidden"|"network",...}
      Ba lần 403 liên tiếp thì nhịp kiểm tra thành 30 phút (file nhịp ngoài repo).
  30  thiếu cấu hình, cookie sai quyền, trang không đọc được, baseline hỏng,
      file nhịp hỏng, hoặc không có Chrome ở cổng CDP — {"status":"no_browser"}

Xem README.md cùng thư mục.
"""

from __future__ import annotations

import argparse
import base64
import hashlib
import html
import json
import os
import re
import socket
import stat
import struct
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
DEFAULT_CDP_PORT = 9222
WS_GUID = "258EAFA5-E914-47DA-95CA-C5AB0DC85B11"
CDP_POLL_SECONDS = 0.25
DEFAULT_BACKOFF = 1.0
BACKOFF_CAP = 5.0
PACE_NAME = "qlvb-bell-pace.json"
INTERVAL_NORMAL = 10
INTERVAL_SLOW = 30
FORBIDDEN_LIMIT = 3
SEED_WARNING = (
    "qlvb-bell: chưa seed — sau khi merge hãy chạy một lần: "
    "python3 tools/qlvb-chuong/check_bell.py --cdp --seed"
)
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
    "seeded",
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
    seeded: bool = False


@dataclass
class Pace:
    consecutive_forbidden: int = 0
    interval_minutes: int = INTERVAL_NORMAL
    last_check_at: str | None = None
    next_check_at: str | None = None


def _bangkok_now() -> str:
    return datetime.now(BANGKOK).isoformat(timespec="seconds")


def _as_bangkok(moment: datetime) -> datetime:
    if moment.tzinfo is None:
        return moment.replace(tzinfo=BANGKOK)
    return moment.astimezone(BANGKOK)


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


def _strip_matrix(path: str) -> str:
    """Bỏ tham số ma trận `;jsessionid=...` trên từng đoạn path."""
    return "/".join(segment.split(";", 1)[0] for segment in path.split("/"))


def _url_is_login(url: str) -> bool:
    path = _strip_matrix(urllib.parse.urlparse(url).path.lower())
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
        seeded=data.get("seeded") is True,
    )


def _state_payload(state: State, *, failure: dict | None = None) -> dict:
    payload: dict = {
        "version": 1,
        "updatedAt": _bangkok_now(),
        "tip": state.tip,
        "alerted": state.alerted,
        "consecutiveFailures": state.consecutive_failures,
        "seeded": bool(state.seeded),
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


def groups_to_open(counts: dict | None) -> list[str]:
    """Nhóm Văn bản đến có số đếm > 0. Nhóm rỗng không nằm trong danh sách."""
    if not counts:
        return []
    opened: list[str] = []
    for key, _label in GROUP_LABELS:
        if _as_int(counts.get(key), 0) > 0:
            opened.append(key)
    return opened


def _resolve_pace_path(env: dict[str, str], baseline: Path) -> tuple[Path, str]:
    """File nhịp ngoài repo. Có cookie thì đặt cạnh cookie."""
    explicit = (env.get("QLVB_PACE_FILE") or "").strip()
    note = ""
    if explicit:
        path = Path(explicit).expanduser()
    else:
        cookie = (env.get("QLVB_COOKIE_FILE") or "").strip()
        if cookie:
            path = Path(cookie).expanduser().parent / PACE_NAME
        else:
            candidate = baseline.expanduser().parent / PACE_NAME
            if _path_inside_project(candidate):
                path = Path.home() / ".local" / "share" / "vanphat" / PACE_NAME
                note = (
                    "qlvb-bell: đặt QLVB_PACE_FILE cạnh file cookie, ngoài repo. "
                    f"Đang ghi nhịp tại {path}"
                )
            else:
                path = candidate
    if _path_inside_project(path):
        raise CookieError("file nhịp phải nằm ngoài repo, cạnh file cookie")
    return path, note


def _pace_payload(pace: Pace) -> dict:
    return {
        "version": 1,
        "consecutiveForbidden": pace.consecutive_forbidden,
        "intervalMinutes": pace.interval_minutes,
        "lastCheckAt": pace.last_check_at,
        "nextCheckAt": pace.next_check_at,
    }


def load_pace(path: Path) -> Pace:
    if not path.exists():
        return Pace()
    mode = stat.S_IMODE(path.stat().st_mode)
    if mode & 0o077:
        raise CookieError(f"file nhịp quyền {mode:04o}, cần 0600 hoặc chặt hơn")
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BaselineError("file nhịp hỏng, không ghi đè") from exc
    if not isinstance(data, dict) or _as_int(data.get("version"), -1) != 1:
        raise BaselineError("file nhịp hỏng, không ghi đè")
    interval = _as_int(data.get("intervalMinutes"), INTERVAL_NORMAL)
    if interval not in {INTERVAL_NORMAL, INTERVAL_SLOW}:
        interval = INTERVAL_SLOW if interval >= INTERVAL_SLOW else INTERVAL_NORMAL
    last_at = data.get("lastCheckAt")
    next_at = data.get("nextCheckAt")
    return Pace(
        consecutive_forbidden=max(0, _as_int(data.get("consecutiveForbidden"), 0)),
        interval_minutes=interval,
        last_check_at=last_at if isinstance(last_at, str) and last_at else None,
        next_check_at=next_at if isinstance(next_at, str) and next_at else None,
    )


def save_pace(path: Path, pace: Pace) -> bool:
    try:
        _atomic_write(path, _pace_payload(pace))
    except OSError:
        return False
    return True


def _pace_due(pace: Pace, now: datetime) -> bool:
    if pace.interval_minutes < INTERVAL_SLOW or not pace.next_check_at:
        return True
    try:
        nxt = datetime.fromisoformat(pace.next_check_at)
    except ValueError:
        return True
    return _as_bangkok(now) >= _as_bangkok(nxt)


def _mark_pace_failure(pace: Pace, status: str, now: datetime) -> None:
    moment = _as_bangkok(now)
    pace.last_check_at = moment.isoformat(timespec="seconds")
    if status == "forbidden":
        pace.consecutive_forbidden += 1
    if pace.consecutive_forbidden >= FORBIDDEN_LIMIT:
        pace.interval_minutes = INTERVAL_SLOW
        pace.next_check_at = (moment + timedelta(minutes=INTERVAL_SLOW)).isoformat(timespec="seconds")
    elif status == "forbidden":
        pace.interval_minutes = INTERVAL_NORMAL
        pace.next_check_at = None


def _mark_pace_success(pace: Pace, now: datetime) -> None:
    moment = _as_bangkok(now)
    pace.consecutive_forbidden = 0
    pace.interval_minutes = INTERVAL_NORMAL
    pace.next_check_at = None
    pace.last_check_at = moment.isoformat(timespec="seconds")


def _seed_note(state: State, baseline_existed: bool, seed: bool) -> str:
    if seed or not baseline_existed or state.seeded:
        return ""
    return SEED_WARNING


def _with_notes(result: tuple[int, str, str], *notes: str) -> tuple[int, str, str]:
    code, out, err = result
    extra = [note for note in notes if note]
    if not extra:
        return result
    addition = "\n".join(extra)
    err = f"{err}\n{addition}" if err else addition
    return code, out, err


def _sig(state: State) -> str:
    return json.dumps(
        {
            "tip": state.tip,
            "alerted": state.alerted,
            "items": state.items,
            "consecutiveFailures": state.consecutive_failures,
            "counts": state.counts,
            "lastFailure": state.last_failure,
            "seeded": state.seeded,
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


def _text_is_nginx_forbidden(sample: str) -> bool:
    sample = sample[:2500].lower()
    if "403 forbidden" not in sample or "nginx" not in sample:
        return False
    if any(marker in sample for marker in BELL_MARKERS):
        return False
    if parse_group_counts(sample):
        return False
    return True


def _is_nginx_forbidden(result: FetchResult) -> bool:
    if result.status == 403:
        return True
    if result.status != 200:
        return False
    return _text_is_nginx_forbidden(result.body)


def _snap_is_nginx_forbidden(snap: dict) -> bool:
    if snap.get("sawBell") or snap.get("notices"):
        return False
    sample = f"{snap.get('title') or ''}\n{snap.get('text') or ''}"
    return _text_is_nginx_forbidden(sample)


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
    pace_path: Path,
    pace: Pace,
    now: datetime,
) -> tuple[int, str, str]:
    state.consecutive_failures += 1
    failure = {"status": status, "at": _as_bangkok(now).isoformat(timespec="seconds")}
    if status == "network":
        failure["reason"] = reason if reason in {"timeout", "network"} else "network"
    err = "qlvb-bell: HTTP 403" if status == "forbidden" else "qlvb-bell: lỗi mạng"
    try:
        _atomic_write(baseline, _state_payload(state, failure=failure))
    except OSError:
        err = err + "; không ghi được baseline"
    _mark_pace_failure(pace, status, now)
    if not save_pace(pace_path, pace):
        err = err + "; không ghi được file nhịp"
    payload: dict = {
        "status": status,
        "consecutiveFailures": state.consecutive_failures,
        "intervalMinutes": pace.interval_minutes,
    }
    if status == "network":
        payload["reason"] = failure.get("reason", "network")
    return _finish(EXIT_DENIED, _json_line(payload), err, header)


def _backoff_skip_result(state: State, pace: Pace, header: str) -> tuple[int, str, str]:
    payload = {
        "status": "ok",
        "backoff": True,
        "intervalMinutes": pace.interval_minutes,
        "consecutiveFailures": state.consecutive_failures,
        "mo": [],
    }
    err = f"qlvb-bell: giãn nhịp {pace.interval_minutes} phút sau 403 liên tiếp"
    return _finish(EXIT_OK, _json_line(payload), err, header)


DOM_EXPR = r"""(function () {
  function vis(el) {
    if (!el || el.nodeType !== 1) return false;
    try {
      var s = window.getComputedStyle(el);
      if (!s || s.display === "none" || s.visibility === "hidden") return false;
    } catch (e) {
      return false;
    }
    if (el.getClientRects && el.getClientRects().length === 0) return false;
    return true;
  }
  function txt(el) {
    if (!el) return "";
    return String(el.innerText || el.textContent || "").replace(/\s+/g, " ").trim();
  }
  var href = String(location.href || "");
  var path = String(location.pathname || "").replace(/;[^/]*/g, "");
  var loginUrl = /login\.zul$/i.test(path);
  var body = document.body;
  var bodyText = body ? txt(body) : "";
  var loginWord = /đăng\s*nhập/i.test(bodyText);
  var pw = false;
  var inputs = document.querySelectorAll("input[type='password']");
  for (var i = 0; i < inputs.length; i++) {
    if (vis(inputs[i])) { pw = true; break; }
  }
  var sawBell = !!document.querySelector(".notification-bell, .notification-count, .notification-item");
  var badge = null;
  var badgeEl = document.querySelector(".notification-count");
  if (badgeEl) {
    var bm = txt(badgeEl).match(/\d+/);
    if (bm) badge = parseInt(bm[0], 10);
  }
  var notices = [];
  var nodes = document.querySelectorAll(".notification-item");
  for (var j = 0; j < nodes.length && notices.length < 100; j++) {
    var el = nodes[j];
    if (!vis(el)) continue;
    var titleEl = el.querySelector(".notification-title");
    var timeEl = el.querySelector(".notification-time");
    var linkEl = el.querySelector("a[href]");
    notices.push({
      id: String(el.id || ""),
      title: titleEl ? txt(titleEl) : "",
      time: timeEl ? txt(timeEl) : "",
      klass: String(el.className || ""),
      text: txt(el).slice(0, 500),
      link: linkEl ? String(linkEl.getAttribute("href") || "") : ""
    });
  }
  return JSON.stringify({
    href: href,
    title: String(document.title || ""),
    loginUrl: loginUrl,
    loginForm: !!(pw && loginWord),
    sawBell: sawBell,
    badge: badge,
    notices: notices,
    text: bodyText.slice(0, 30000)
  });
})()"""


class CdpUnreachable(Exception):
    pass


class CdpNotReady(Exception):
    pass


class CdpProtocolError(Exception):
    pass


def ws_accept_value(key: str) -> str:
    digest = hashlib.sha1((key + WS_GUID).encode("ascii")).digest()
    return base64.b64encode(digest).decode("ascii")


def ws_send(sock: socket.socket, text: str, *, mask: bool) -> None:
    payload = text.encode("utf-8")
    header = bytearray([0x81])
    length = len(payload)
    if length < 126:
        header.append((0x80 if mask else 0) | length)
    elif length < 65536:
        header.append((0x80 if mask else 0) | 126)
        header.extend(struct.pack("!H", length))
    else:
        header.append((0x80 if mask else 0) | 127)
        header.extend(struct.pack("!Q", length))
    if mask:
        key = os.urandom(4)
        header.extend(key)
        payload = bytes(byte ^ key[index % 4] for index, byte in enumerate(payload))
    sock.sendall(bytes(header) + payload)


def _read_until(sock: socket.socket, buf: bytearray, marker: bytes, deadline: float, limit: int) -> bytes:
    while marker not in buf:
        if len(buf) > limit:
            raise CdpProtocolError("không đọc được trang")
        remain = deadline - time.monotonic()
        if remain <= 0:
            raise NetworkError("lỗi mạng", reason="timeout")
        sock.settimeout(remain)
        try:
            chunk = sock.recv(4096)
        except socket.timeout as exc:
            raise NetworkError("lỗi mạng", reason="timeout") from exc
        if not chunk:
            raise NetworkError("lỗi mạng", reason="network")
        buf.extend(chunk)
    index = buf.find(marker)
    head = bytes(buf[:index])
    del buf[: index + len(marker)]
    return head


def _read_exact(sock: socket.socket, buf: bytearray, size: int, deadline: float) -> bytes:
    while len(buf) < size:
        remain = deadline - time.monotonic()
        if remain <= 0:
            raise NetworkError("lỗi mạng", reason="timeout")
        sock.settimeout(remain)
        try:
            chunk = sock.recv(min(65536, size - len(buf)))
        except socket.timeout as exc:
            raise NetworkError("lỗi mạng", reason="timeout") from exc
        if not chunk:
            raise NetworkError("lỗi mạng", reason="network")
        buf.extend(chunk)
    out = bytes(buf[:size])
    del buf[:size]
    return out


def _send_pong(sock: socket.socket, payload: bytes) -> None:
    mask = os.urandom(4)
    frame = bytearray([0x8A, 0x80 | len(payload)])
    frame.extend(mask)
    frame.extend(byte ^ mask[index % 4] for index, byte in enumerate(payload))
    sock.sendall(bytes(frame))


def ws_recv_text(sock: socket.socket, buf: bytearray, deadline: float) -> str:
    while True:
        header = _read_exact(sock, buf, 2, deadline)
        opcode = header[0] & 0x0F
        masked = header[1] & 0x80
        length = header[1] & 0x7F
        if length == 126:
            length = struct.unpack("!H", _read_exact(sock, buf, 2, deadline))[0]
        elif length == 127:
            length = struct.unpack("!Q", _read_exact(sock, buf, 8, deadline))[0]
        if length > 4_000_000:
            raise CdpProtocolError("không đọc được trang")
        mask_key = _read_exact(sock, buf, 4, deadline) if masked else b""
        payload = _read_exact(sock, buf, length, deadline)
        if mask_key:
            payload = bytes(byte ^ mask_key[index % 4] for index, byte in enumerate(payload))
        if opcode == 0x8:
            raise NetworkError("lỗi mạng", reason="network")
        if opcode == 0x9:
            _send_pong(sock, payload[:125])
            continue
        if opcode == 0xA:
            continue
        if opcode in {0x1, 0x0}:
            return payload.decode("utf-8", "replace")
        continue


class WsSession:
    def __init__(self, sock: socket.socket, buf: bytearray, timeout: float, *, mask_send: bool):
        self.sock = sock
        self.buf = buf
        self.timeout = timeout
        self.mask_send = mask_send

    def send(self, text: str) -> None:
        ws_send(self.sock, text, mask=self.mask_send)

    def recv(self) -> dict:
        raw = ws_recv_text(self.sock, self.buf, time.monotonic() + self.timeout)
        try:
            data = json.loads(raw)
        except json.JSONDecodeError as exc:
            raise CdpProtocolError("không đọc được trang") from exc
        if not isinstance(data, dict):
            raise CdpProtocolError("không đọc được trang")
        return data

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


def _header_value(head: bytes, name: str) -> str:
    wanted = name.lower()
    for line in head.split(b"\r\n")[1:]:
        if b":" not in line:
            continue
        key, value = line.split(b":", 1)
        if key.decode("latin1", "replace").strip().lower() == wanted:
            return value.decode("latin1", "replace").strip()
    return ""


def ws_connect(port: int, path: str, timeout: float) -> WsSession:
    if not path.startswith("/devtools/"):
        raise CdpProtocolError("không đọc được trang")
    deadline = time.monotonic() + timeout
    try:
        sock = socket.create_connection(("127.0.0.1", port), timeout=max(0.1, timeout))
    except (TimeoutError, socket.timeout) as exc:
        raise NetworkError("lỗi mạng", reason="timeout") from exc
    except OSError as exc:
        raise NetworkError("lỗi mạng", reason="network") from exc
    key = base64.b64encode(os.urandom(16)).decode("ascii")
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: 127.0.0.1:{port}\r\n"
        "Upgrade: websocket\r\n"
        "Connection: Upgrade\r\n"
        f"Sec-WebSocket-Key: {key}\r\n"
        "Sec-WebSocket-Version: 13\r\n"
        "\r\n"
    )
    try:
        sock.sendall(request.encode("ascii"))
        buf = bytearray()
        head = _read_until(sock, buf, b"\r\n\r\n", deadline, 65536)
    except Exception:
        sock.close()
        raise
    status = head.split(b"\r\n", 1)[0]
    if b" 101 " not in status:
        sock.close()
        raise CdpProtocolError("không đọc được trang")
    if _header_value(head, "sec-websocket-accept") != ws_accept_value(key):
        sock.close()
        raise CdpProtocolError("không đọc được trang")
    return WsSession(sock, buf, timeout, mask_send=True)


def _local_opener() -> urllib.request.OpenerDirector:
    class _StayLocal(urllib.request.HTTPRedirectHandler):
        def redirect_request(self, req, fp, code, msg, headers, newurl):
            host = urllib.parse.urlparse(newurl).hostname
            if host not in {"127.0.0.1", "localhost"}:
                raise CdpUnreachable("không thấy trình duyệt")
            return super().redirect_request(req, fp, code, msg, headers, newurl)

    return urllib.request.build_opener(urllib.request.ProxyHandler({}), _StayLocal())


def _http_json(port: int, path: str, timeout: float, method: str = "GET"):
    url = f"http://127.0.0.1:{int(port)}{path}"
    request = urllib.request.Request(url, method=method)
    if method == "PUT":
        request.add_header("Content-Length", "0")
    try:
        with _local_opener().open(request, timeout=timeout) as response:
            raw = response.read(2_000_000)
    except urllib.error.HTTPError as exc:
        if method == "PUT" and exc.code in {400, 404, 405}:
            return _http_json(port, path, timeout, method="GET")
        raise CdpUnreachable("không thấy trình duyệt") from exc
    except (TimeoutError, socket.timeout, urllib.error.URLError, OSError) as exc:
        raise CdpUnreachable("không thấy trình duyệt") from exc
    try:
        return json.loads(raw.decode("utf-8", "replace"))
    except json.JSONDecodeError as exc:
        raise CdpProtocolError("không đọc được trang") from exc


def _ws_path(tab: dict) -> str:
    parsed = urllib.parse.urlparse(str(tab.get("webSocketDebuggerUrl") or ""))
    path = parsed.path or ""
    if not path.startswith("/devtools/"):
        raise CdpProtocolError("không đọc được trang")
    return path


def _parse_evaluate(result: dict) -> dict:
    if not isinstance(result, dict):
        raise CdpProtocolError("không đọc được trang")
    if result.get("exceptionDetails"):
        text = json.dumps(result.get("exceptionDetails"), ensure_ascii=False).lower()
        if "context" in text or "destroyed" in text or "navigat" in text:
            raise CdpNotReady()
        raise CdpProtocolError("không đọc được trang")
    value = (result.get("result") or {}).get("value")
    if not isinstance(value, str):
        raise CdpNotReady()
    if len(value) > 2_000_000:
        raise CdpProtocolError("không đọc được trang")
    try:
        data = json.loads(value)
    except json.JSONDecodeError as exc:
        raise CdpProtocolError("không đọc được trang") from exc
    if not isinstance(data, dict):
        raise CdpProtocolError("không đọc được trang")
    return data


class CdpSocket:
    """Một tab Chrome. Lệnh đi trên websocket nối 127.0.0.1, bỏ host trong URL DevTools."""

    def __init__(self, port: int, timeout: float):
        self.port = port
        self.timeout = timeout
        self._session: WsSession | None = None
        self._next_id = 1

    def close(self) -> None:
        session = self._session
        self._session = None
        if session is not None:
            session.close()

    def call(self, method: str, params: dict | None = None) -> dict:
        if self._session is None:
            raise CdpProtocolError("không đọc được trang")
        message_id = self._next_id
        self._next_id += 1
        self._session.send(json.dumps({"id": message_id, "method": method, "params": params or {}}))
        deadline = time.monotonic() + self.timeout
        while time.monotonic() < deadline:
            message = self._session.recv()
            if message.get("id") != message_id:
                continue
            if message.get("error"):
                text = json.dumps(message.get("error"), ensure_ascii=False).lower()
                if "context" in text or "destroyed" in text or "navigat" in text:
                    raise CdpNotReady()
                raise CdpProtocolError("không đọc được trang")
            result = message.get("result")
            return result if isinstance(result, dict) else {}
        raise NetworkError("lỗi mạng", reason="timeout")

    def attach(self, tab: dict) -> None:
        self.close()
        self._session = ws_connect(self.port, _ws_path(tab), self.timeout)


class LiveCdp:
    def __init__(self, port: int, timeout: float):
        self.port = port
        self.timeout = timeout
        self._http_timeout = min(max(timeout, 0.2), 5.0)
        self._socket: CdpSocket | None = None

    def close(self) -> None:
        if self._socket is not None:
            self._socket.close()
            self._socket = None

    def list_pages(self) -> list:
        data = _http_json(self.port, "/json/list", self._http_timeout, method="GET")
        if not isinstance(data, list):
            raise CdpProtocolError("không đọc được trang")
        return data

    def open_page(self, url: str) -> dict:
        quoted = urllib.parse.quote(url, safe=":/?&=%")
        data = _http_json(self.port, "/json/new?" + quoted, self._http_timeout, method="PUT")
        if not isinstance(data, dict):
            raise CdpProtocolError("không đọc được trang")
        return data

    def reload(self, tab: dict) -> None:
        self.close()
        self._socket = CdpSocket(self.port, self.timeout)
        self._socket.attach(tab)
        self._socket.call("Page.enable", {})
        self._socket.call("Page.reload", {"ignoreCache": False})

    def evaluate(self, tab: dict) -> dict:
        if self._socket is None:
            self.reload(tab)
        assert self._socket is not None
        return _parse_evaluate(
            self._socket.call(
                "Runtime.evaluate",
                {
                    "expression": DOM_EXPR,
                    "returnByValue": True,
                    "awaitPromise": False,
                    "userGesture": False,
                },
            )
        )


class ScriptedCdp:
    """Fixture không mở socket. Dùng khi thử, hoặc truyền thẳng vào execute."""

    def __init__(self, tabs=None, snapshots=None, down: bool = False, fail_reload: int = 0):
        self.tabs = list(tabs or [])
        self.snapshots = list(snapshots or [])
        self.down = down
        self.fail_reload = fail_reload
        self.calls: list[str] = []
        self.opened: list[str] = []
        self._last: dict | None = None

    @classmethod
    def from_file(cls, path: str) -> "ScriptedCdp":
        data = json.loads(Path(path).read_text(encoding="utf-8"))
        snapshots = data.get("snapshots")
        if snapshots is None and data.get("snapshot") is not None:
            snapshots = [data.get("snapshot")]
        return cls(tabs=data.get("tabs") or [], snapshots=snapshots or [], down=bool(data.get("down")))

    def close(self) -> None:
        return None

    def list_pages(self) -> list:
        self.calls.append("list")
        if self.down:
            raise CdpUnreachable("không thấy trình duyệt")
        return list(self.tabs)

    def open_page(self, url: str) -> dict:
        self.calls.append("open")
        self.opened.append(url)
        tab = {
            "id": "opened",
            "type": "page",
            "url": url,
            "webSocketDebuggerUrl": "ws://198.51.100.9/devtools/page/opened",
        }
        self.tabs.append(tab)
        return tab

    def reload(self, tab: dict) -> None:
        if self.fail_reload:
            self.fail_reload -= 1
            raise NetworkError("lỗi mạng", reason="network")
        self.calls.append("Page.reload")

    def evaluate(self, tab: dict) -> dict:
        self.calls.append("Runtime.evaluate")
        if self.snapshots:
            snap = self.snapshots.pop(0)
            if snap.get("pending"):
                raise CdpNotReady()
            self._last = snap
            return snap
        if self._last is not None:
            return self._last
        raise CdpNotReady()


def _pick_tab(tabs: list, page_url: str) -> dict | None:
    if not isinstance(tabs, list):
        raise CdpProtocolError("không đọc được trang")
    host = urllib.parse.urlparse(page_url).netloc.lower()
    exact: list[dict] = []
    other: list[dict] = []
    for tab in tabs:
        if not isinstance(tab, dict):
            continue
        if str(tab.get("type") or "page") not in {"page", ""}:
            continue
        url = str(tab.get("url") or "")
        path = urllib.parse.urlparse(url).path.lower()
        if not path.endswith("main.zul") or not tab.get("webSocketDebuggerUrl"):
            continue
        bucket = exact if urllib.parse.urlparse(url).netloc.lower() == host else other
        bucket.append(tab)
    if exact:
        return exact[0]
    if other:
        return other[0]
    return None


def _snapshot_ready(snap: dict, polls: int) -> bool:
    """Đợi ZK vẽ nhóm hoặc danh sách. Chỉ có số chuông thì chờ thêm một nhịp."""
    if snap.get("loginUrl") or snap.get("loginForm"):
        return True
    if _snap_is_nginx_forbidden(snap):
        return True
    if snap.get("notices"):
        return True
    if parse_group_counts(str(snap.get("text") or "")):
        return True
    if _url_is_login(str(snap.get("href") or "")):
        return True
    if (snap.get("sawBell") or isinstance(snap.get("badge"), int)) and polls >= 2:
        return True
    return False


def _notices_from_snapshot(raw_notices: object) -> list[dict]:
    if not isinstance(raw_notices, list):
        return []
    notices: list[dict] = []
    for raw in raw_notices[:100]:
        if not isinstance(raw, dict):
            continue
        item = _notice(str(raw.get("id") or ""), str(raw.get("title") or ""))
        if not item:
            continue
        when = _to_iso(str(raw.get("time") or "")) or _extract_time(str(raw.get("text") or ""))
        if when:
            item["time"] = when
        blob = f"{raw.get('text') or ''} {raw.get('klass') or ''}"
        item["khan"] = _extract_khan(blob)
        link = str(raw.get("link") or "").strip()
        if link:
            item["link"] = link
        notices.append(item)
    return _dedupe_notices(notices)


def parse_cdp_snapshot(snap: dict, page_url: str) -> tuple[bool, BellView | None, dict | None]:
    href = str(snap.get("href") or "")
    login = bool(snap.get("loginUrl")) or bool(snap.get("loginForm")) or _url_is_login(href)
    notices = _notices_from_snapshot(snap.get("notices"))
    _apply_links(notices, page_url)
    counts = parse_group_counts(str(snap.get("text") or ""))
    badge = snap.get("badge")
    count = int(badge) if isinstance(badge, int) else 0
    saw_bell = bool(snap.get("sawBell")) or bool(notices) or isinstance(badge, int)
    if login:
        return True, None, counts
    if not saw_bell and counts is None:
        return False, None, None
    view = BellView(
        count=count,
        notices=notices,
        saw_list=bool(notices),
        saw_bell=saw_bell,
    )
    return False, view, counts


def read_dom(transport, page_url: str, timeout: float, sleep, now=None) -> dict:
    clock = now or time.monotonic
    tab = _pick_tab(transport.list_pages(), page_url)
    if tab is None:
        tab = transport.open_page(page_url)
    transport.reload(tab)
    deadline = clock() + max(0.0, float(timeout))
    last = None
    polls = 0
    while True:
        try:
            snap = transport.evaluate(tab)
        except CdpNotReady:
            snap = None
        else:
            if isinstance(snap, dict):
                polls += 1
                last = snap
                if _snapshot_ready(snap, polls):
                    return snap
        if clock() >= deadline:
            if last:
                return last
            raise NetworkError("lỗi mạng", reason="timeout")
        pause = min(CDP_POLL_SECONDS, max(0.0, deadline - clock()))
        sleep(pause)


def _mode(env: dict[str, str]) -> str:
    transport = (env.get("QLVB_TRANSPORT") or "").strip().lower()
    if transport in {"cookie", "cdp"}:
        return transport
    if (env.get("QLVB_CDP") or "").strip() == "1" or (env.get("QLVB_CDP_PORT") or "").strip():
        return "cdp"
    if (env.get("QLVB_COOKIE_FILE") or "").strip():
        return "cookie"
    return "cdp"


def _cdp_port(env: dict[str, str]) -> int:
    raw = (env.get("QLVB_CDP_PORT") or "").strip() or str(DEFAULT_CDP_PORT)
    try:
        port = int(raw)
    except ValueError as exc:
        raise CookieError("QLVB_CDP_PORT không hợp lệ") from exc
    if not 1 <= port <= 65535:
        raise CookieError("QLVB_CDP_PORT không hợp lệ")
    return port


def _make_cdp(env: dict[str, str], port: int, timeout: float):
    if env.get("QLVB_ALLOW_FIXTURE") == "1" and (env.get("QLVB_CDP_FIXTURE") or "").strip():
        return ScriptedCdp.from_file(env["QLVB_CDP_FIXTURE"])
    return LiveCdp(port, timeout)


def _no_browser(header: str = "") -> tuple[int, str, str]:
    return _finish(
        EXIT_ERROR,
        _json_line({"status": "no_browser"}),
        "qlvb-bell: không thấy trình duyệt",
        header,
    )


def _publish(
    state: State,
    view: BellView | None,
    counts: dict | None,
    seed: bool,
    baseline_path: Path,
    header: str,
    page_url: str,
    pace_path: Path,
    pace: Pace,
    now: datetime,
) -> tuple[int, str, str]:
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
            notice for notice in view.notices if _is_new_notice(notice, ids, strings, state.tip)
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
        seeded=True if seed else state.seeded,
    )
    if _sig(new_state) != _sig(state):
        try:
            _atomic_write(baseline_path, _state_payload(new_state))
        except OSError:
            return _finish(EXIT_ERROR, "", "qlvb-bell: không ghi được baseline", header)
    _mark_pace_success(pace, now)
    pace_err = "" if save_pace(pace_path, pace) else "qlvb-bell: không ghi được file nhịp"
    payload: dict = {
        "status": "new" if has_new else "ok",
        "moi": [] if seed else [_public_notice(notice) for notice in new_notices],
        "counts": counts,
        "mo": groups_to_open(counts),
        "intervalMinutes": INTERVAL_NORMAL,
        "seeded": bool(new_state.seeded),
    }
    if badge is not None:
        payload["badge"] = badge
    code = EXIT_NEW if has_new else EXIT_OK
    return _finish(code, _json_line(payload), pace_err, header)


def _execute_cdp(env: dict[str, str], sleep, cdp, wall_clock) -> tuple[int, str, str]:
    page_url = (env.get("QLVB_PAGE_URL") or "").strip()
    baseline_path = Path((env.get("QLVB_BASELINE_FILE") or DEFAULT_BASELINE).strip())
    seed = (env.get("QLVB_SEED") or "").strip() == "1"
    if not page_url:
        return EXIT_ERROR, "", "qlvb-bell: thiếu QLVB_PAGE_URL"
    try:
        timeout = float(env.get("QLVB_TIMEOUT") or DEFAULT_TIMEOUT)
        backoff = _backoff_seconds(env)
        _require_https(page_url)
        port = _cdp_port(env)
        baseline_existed = baseline_path.exists()
        state = load_state(baseline_path)
        pace_path, pace_note = _resolve_pace_path(env, baseline_path)
        pace = load_pace(pace_path)
        now = wall_clock()
    except CookieError as exc:
        return _finish(EXIT_ERROR, "", f"qlvb-bell: {exc}", "")
    except BaselineError as exc:
        return _finish(EXIT_ERROR, "", f"qlvb-bell: {exc}", "")
    except ValueError:
        return EXIT_ERROR, "", "qlvb-bell: QLVB_TIMEOUT không hợp lệ"
    notes = (pace_note, _seed_note(state, baseline_existed, seed))
    if not seed and not _pace_due(pace, now):
        return _with_notes(_backoff_skip_result(state, pace, ""), *notes)
    try:
        transport = cdp if cdp is not None else _make_cdp(env, port, timeout)
    except (OSError, json.JSONDecodeError):
        return _with_notes(_finish(EXIT_ERROR, "", "qlvb-bell: không đọc được trang", ""), *notes)
    try:
        last_network: NetworkError | None = None
        snap = None
        for attempt in (1, 2):
            try:
                snap = read_dom(transport, page_url, timeout, sleep)
            except CdpUnreachable:
                return _with_notes(_no_browser(), *notes)
            except NetworkError as exc:
                last_network = exc
                transport.close()
                if attempt == 1:
                    sleep(backoff)
                    continue
                return _with_notes(
                    _failure_result(
                        baseline_path,
                        state,
                        "network",
                        getattr(exc, "reason", "network"),
                        "",
                        pace_path,
                        pace,
                        now,
                    ),
                    *notes,
                )
            if _snap_is_nginx_forbidden(snap):
                if attempt == 1:
                    sleep(backoff)
                    continue
                return _with_notes(
                    _failure_result(baseline_path, state, "forbidden", "forbidden", "", pace_path, pace, now),
                    *notes,
                )
            break
        if snap is None:
            reason = getattr(last_network, "reason", "network")
            return _with_notes(
                _failure_result(baseline_path, state, "network", reason, "", pace_path, pace, now),
                *notes,
            )
        login, view, counts = parse_cdp_snapshot(snap, page_url)
        if login:
            return _with_notes(_session_result(""), *notes)
        return _with_notes(
            _publish(state, view, counts, seed, baseline_path, "", page_url, pace_path, pace, now),
            *notes,
        )
    except CdpUnreachable:
        return _with_notes(_no_browser(), *notes)
    except BaselineError as exc:
        return _with_notes(_finish(EXIT_ERROR, "", f"qlvb-bell: {exc}", ""), *notes)
    except CdpProtocolError:
        return _with_notes(_finish(EXIT_ERROR, "", "qlvb-bell: không đọc được trang", ""), *notes)
    except NetworkError as exc:
        return _with_notes(
            _failure_result(
                baseline_path,
                state,
                "network",
                getattr(exc, "reason", "network"),
                "",
                pace_path,
                pace,
                now,
            ),
            *notes,
        )
    finally:
        closer = getattr(transport, "close", None)
        if closer:
            closer()


def execute(env: dict[str, str], fetch, sleep=time.sleep, cdp=None, wall_clock=None) -> tuple[int, str, str]:
    """Trả (mã thoát, stdout, stderr). Không in cookie."""
    clock = wall_clock or (lambda: datetime.now(BANGKOK))
    if _mode(env) == "cdp":
        return _execute_cdp(env, sleep, cdp, clock)
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
    pace_note = ""
    seed_note = ""
    try:
        _require_https(page_url)
        backoff = _backoff_seconds(env)
        baseline_existed = baseline_path.exists()
        state = load_state(baseline_path)
        pace_path, pace_note = _resolve_pace_path(env, baseline_path)
        pace = load_pace(pace_path)
        now = clock()
        seed_note = _seed_note(state, baseline_existed, seed)
        header = load_cookie_header(Path(cookie_path))
        if not seed and not _pace_due(pace, now):
            return _with_notes(_backoff_skip_result(state, pace, header), pace_note, seed_note)
        result, problem, reason = _attempt_fetch(fetch, page_url, header, timeout, sleep, backoff)
    except SessionExpiredError:
        return _with_notes(_session_result(header), pace_note, seed_note)
    except CookieError as exc:
        return _finish(EXIT_ERROR, "", f"qlvb-bell: {exc}", header)
    except BaselineError as exc:
        return _finish(EXIT_ERROR, "", f"qlvb-bell: {exc}", header)
    except Exception:
        return _finish(EXIT_ERROR, "", "qlvb-bell: lỗi không đọc được trang", header)

    if problem == "session":
        return _with_notes(_session_result(header), pace_note, seed_note)
    if problem in {"forbidden", "network"}:
        return _with_notes(
            _failure_result(baseline_path, state, problem, reason, header, pace_path, pace, now),
            pace_note,
            seed_note,
        )
    if result is None or result.status != 200:
        code = getattr(result, "status", 0)
        return _with_notes(_finish(EXIT_ERROR, "", f"qlvb-bell: HTTP {code}", header), pace_note, seed_note)

    view = parse_bell(result.body)
    counts = parse_group_counts(result.body)
    return _with_notes(
        _publish(state, view, counts, seed, baseline_path, header, page_url, pace_path, pace, now),
        pace_note,
        seed_note,
    )


def _apply_args(env: dict[str, str], argv: list[str] | None) -> dict[str, str]:
    parser = argparse.ArgumentParser(
        prog="check_bell.py",
        description="Đọc chuông QLVB từ Chrome đang đăng nhập. Không đăng nhập, không POST.",
    )
    parser.add_argument(
        "--cdp",
        nargs="?",
        const=str(DEFAULT_CDP_PORT),
        default=None,
        help="Cổng DevTools của Chrome đang đăng nhập. Bỏ số thì dùng 9222.",
    )
    parser.add_argument("--cookie-file", help="Chế độ cookie: file ngoài repo, quyền 0600")
    parser.add_argument("--baseline-file", help="File state (baseline) quyền 0600")
    parser.add_argument("--pace-file", help="File nhịp 403, ngoài repo, cạnh cookie, quyền 0600")
    parser.add_argument("--page-url", help="URL https đầy đủ tới trang main.zul")
    parser.add_argument("--timeout", help="Timeout giây")
    parser.add_argument("--seed", action="store_true", help="Ghi mốc rồi thoát 0")
    args = parser.parse_args(argv)
    merged = dict(env)
    if args.cookie_file:
        merged["QLVB_COOKIE_FILE"] = args.cookie_file
    if args.baseline_file:
        merged["QLVB_BASELINE_FILE"] = args.baseline_file
    if args.pace_file:
        merged["QLVB_PACE_FILE"] = args.pace_file
    if args.page_url:
        merged["QLVB_PAGE_URL"] = args.page_url
    if args.timeout:
        merged["QLVB_TIMEOUT"] = args.timeout
    if args.seed:
        merged["QLVB_SEED"] = "1"
    if args.cdp is not None:
        merged["QLVB_CDP"] = "1"
        merged["QLVB_CDP_PORT"] = str(args.cdp)
        merged["QLVB_TRANSPORT"] = "cdp"
    elif args.cookie_file:
        merged["QLVB_TRANSPORT"] = "cookie"
    elif (merged.get("QLVB_TRANSPORT") or "").strip().lower() != "cookie":
        merged["QLVB_CDP"] = "1"
        merged["QLVB_CDP_PORT"] = (merged.get("QLVB_CDP_PORT") or "").strip() or str(DEFAULT_CDP_PORT)
        merged["QLVB_TRANSPORT"] = "cdp"
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
