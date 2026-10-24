#!/usr/bin/env python3
"""Kiểm tra chuông thông báo QLVB qua HTTP, không mở trình duyệt.

Phiên do người vận hành cấp trong file cookie (QLVB_COOKIE_FILE).
Script không đăng nhập, không chứa mật khẩu, không đọc profile Chrome.

Mã thoát:
  0   không có thông báo mới — không in gì
  10  có mới — in một dòng JSON {"moi":[...]}
  20  hết phiên (URL hoặc lệnh ZK redirect tới login.zul, hoặc HTTP 401)
  30  lỗi mạng, HTTP 403/5xx, thiếu cấu hình, hoặc trang không có dấu chuông.
      Baseline không đổi.

Baseline (khi chưa có file mẫu): version 1, khóa items.
Xem README.md cùng thư mục.
"""

from __future__ import annotations

import json
import os
import re
import socket
import sys
import urllib.error
import urllib.parse
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path
from zoneinfo import ZoneInfo

EXIT_OK = 0
EXIT_NEW = 10
EXIT_SESSION = 20
EXIT_ERROR = 30

USER_AGENT = "VanPhat-QLVB-BellCheck/1.0"
DEFAULT_BASELINE = "/workspace/qlvb-bell-baseline.json"
DEFAULT_TIMEOUT = 20
MAX_BODY = 5_000_000
BADGE_ID = "notification-count"

REDIRECT_CMD_RE = re.compile(r"""['"]redirect['"]""", re.IGNORECASE)
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
BELL_MARKERS = (
    "notification-bell",
    "notification-count",
    "show-notification-popup",
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


class CookieError(Exception):
    pass


class BaselineError(Exception):
    pass


class NetworkError(Exception):
    pass


@dataclass
class FetchResult:
    status: int
    final_url: str
    body: str


@dataclass
class BellView:
    count: int
    notices: list[dict]
    saw_list: bool


def _bangkok_now() -> str:
    return datetime.now(ZoneInfo("Asia/Bangkok")).isoformat(timespec="seconds")


def _path_is_browser_profile(path: Path) -> bool:
    lowered = str(path).replace("\\", "/").lower()
    if any(marker in lowered for marker in CHROME_PATH_MARKERS):
        return True
    if path.name == "Cookies" and "chrome" in lowered:
        return True
    return False


def load_cookie_header(path: Path) -> str:
    """Đọc file cookie do người vận hành cấp. Không đụng profile trình duyệt."""
    if _path_is_browser_profile(path):
        raise CookieError("không đọc cookie từ profile trình duyệt")
    if not path.is_file():
        raise CookieError("không thấy file cookie")
    raw = path.read_bytes()
    if raw.startswith(b"SQLite format 3"):
        raise CookieError("không đọc file cookie SQLite của trình duyệt")
    if raw.startswith(b"\x00"):
        raise CookieError("file cookie không phải dạng văn bản")
    text = raw.decode("utf-8-sig", errors="replace").strip()
    if not text:
        raise CookieError("file cookie trống")
    pairs = _pairs_from_text(text)
    if not pairs:
        raise CookieError("file cookie không có cặp tên=giá trị")
    header = "; ".join(f"{name}={value}" for name, value in pairs)
    if "\n" in header or "\r" in header:
        raise CookieError("cookie có ký tự xuống dòng")
    return header


def _pairs_from_text(text: str) -> list[tuple[str, str]]:
    stripped = text.lstrip()
    if stripped.startswith("{"):
        return _pairs_from_json(stripped)
    netscape = _pairs_from_netscape(text)
    if netscape:
        return netscape
    pairs: list[tuple[str, str]] = []
    for line in text.splitlines():
        line = line.strip()
        if not line or line.startswith("#"):
            continue
        if line.lower().startswith("cookie:"):
            line = line.split(":", 1)[1].strip()
        pairs.extend(_pairs_from_cookie_line(line))
    return pairs


def _pairs_from_json(text: str) -> list[tuple[str, str]]:
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
    return _pairs_from_cookie_line(raw.strip())


def _pairs_from_netscape(text: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
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
        name, value = parts[-2].strip(), parts[-1].strip()
        if name:
            pairs.append((name, value))
    return pairs if saw_tab else []


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


def is_login_redirect(final_url: str, body: str) -> bool:
    """Hết phiên khi URL đã là login.zul, hoặc lệnh ZK redirect trỏ tới login.zul.

    ZK 6.5 thường trả HTTP 200 kèm lệnh dạng
    'redirect','[".../login.zul",""] thay vì HTTP 302.
    """
    path = urllib.parse.urlparse(final_url).path
    if path.endswith("login.zul") or "/login.zul" in path:
        return True
    for match in REDIRECT_CMD_RE.finditer(body):
        window = body[match.start() : match.start() + 400]
        if "login.zul" in window:
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


def _notice(nid: str, title: str) -> dict | None:
    nid = re.sub(r"\s+", " ", nid).strip()
    title = re.sub(r"\s+", " ", title).strip()
    if not nid:
        if not title:
            return None
        nid = "notice:" + title[:160]
    return {"id": nid[:200], "kind": "notice", "title": title[:500]}


def _html_notices(body: str) -> list[dict]:
    notices: list[dict] = []
    for match in HTML_ITEM_RE.finditer(body):
        tag = body[max(0, match.start() - 240) : match.end() + 80]
        id_match = re.search(r"""\bid\s*=\s*['"]([^'"]+)['"]""", tag, re.IGNORECASE)
        chunk = body[match.end() : match.end() + 600]
        title_match = TITLE_HTML_RE.search(chunk)
        title = title_match.group(1) if title_match else ""
        item = _notice(id_match.group(1) if id_match else "", title)
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
        ahead = body[match.end() : match.end() + 700]
        title_match = re.search(
            r"""sclass\s*:\s*'notification-title'[\s\S]{0,220}?value\s*:\s*'([^']*)'"""
            r"""|value\s*:\s*'([^']*)'[\s\S]{0,220}?sclass\s*:\s*'notification-title'"""
            r"""|sclass\s*:\s*"notification-title"[\s\S]{0,220}?value\s*:\s*"([^"]*)""""",
            ahead,
        )
        title = ""
        if title_match:
            title = next(group for group in title_match.groups() if group is not None)
        title = title.replace("\\/", "/")
        nid = ""
        if id_match:
            nid = next(group for group in id_match.groups() if group is not None)
        item = _notice(nid, title)
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
        # Bỏ khối CSS `.notification-count { ... }` — không có value:'số'.
        zk_count = _closest_zk_count(body, match.start())
        if zk_count is not None:
            counts.append(zk_count)
    count = counts[-1] if counts else 0
    notices = _dedupe_notices(_html_notices(body) + _zk_notices(body))
    return BellView(count=count, notices=notices, saw_list=bool(notices))


def _norm_stored(item: object) -> dict:
    if not isinstance(item, dict):
        raise BaselineError("mục baseline không phải object")
    kind = str(item.get("kind") or "").strip()
    nid = str(item.get("id") or "").strip()
    if not nid or kind not in {"badge", "notice"}:
        raise BaselineError("mục baseline thiếu id hoặc kind")
    if kind == "badge":
        try:
            count = int(item.get("count"))
        except (TypeError, ValueError) as exc:
            raise BaselineError("badge baseline thiếu count") from exc
        return {"id": nid, "kind": "badge", "count": count}
    return {"id": nid, "kind": "notice", "title": str(item.get("title") or "").strip()}


def load_baseline(path: Path) -> list[dict]:
    if not path.exists():
        return []
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        raise BaselineError("baseline hỏng, không ghi đè") from exc
    if isinstance(data, list):
        items = data
        version = 1
    elif isinstance(data, dict):
        version = data.get("version", 1)
        items = data.get("items")
    else:
        raise BaselineError("baseline hỏng, không ghi đè")
    if version != 1:
        raise BaselineError("version baseline không hỗ trợ")
    if not isinstance(items, list):
        raise BaselineError("baseline thiếu items")
    return [_norm_stored(item) for item in items]


def save_baseline(path: Path, items: list[dict]) -> None:
    payload = {"version": 1, "updatedAt": _bangkok_now(), "items": items}
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


def _badge_count(items: list[dict]) -> int:
    for item in items:
        if item.get("kind") == "badge" and item.get("id") == BADGE_ID:
            return int(item["count"])
    return 0


def _notices_of(items: list[dict]) -> dict[str, dict]:
    return {item["id"]: item for item in items if item.get("kind") == "notice"}


def project_items(previous: list[dict], view: BellView) -> list[dict]:
    items = [{"id": BADGE_ID, "kind": "badge", "count": view.count}]
    if view.saw_list:
        notices = view.notices
    else:
        notices = [item for item in previous if item.get("kind") == "notice"]
    items.extend(sorted(notices, key=lambda item: item["id"]))
    return items


def diff_moi(previous: list[dict], view: BellView) -> list[dict]:
    moi: list[dict] = []
    old_notices = _notices_of(previous)
    if view.saw_list:
        for notice in view.notices:
            old = old_notices.get(notice["id"])
            if old is None or old.get("title") != notice.get("title"):
                moi.append(dict(notice))
    if not moi:
        previous_count = _badge_count(previous)
        if view.count > previous_count:
            moi.append(
                {
                    "id": BADGE_ID,
                    "kind": "badge",
                    "count": view.count,
                    "truoc": previous_count,
                    "them": view.count - previous_count,
                }
            )
    return moi


def _items_signature(items: list[dict]) -> str:
    return json.dumps(items, ensure_ascii=False, sort_keys=True)


def build_headers(cookie: str) -> dict[str, str]:
    if "\n" in cookie or "\r" in cookie:
        raise CookieError("cookie có ký tự xuống dòng")
    return {
        "Cookie": cookie,
        "User-Agent": USER_AGENT,
        "Accept": "text/html,application/xhtml+xml",
    }


def live_fetch(url: str, cookie: str, timeout: float) -> FetchResult:
    # Fixture chỉ khi thử cục bộ. Routine thật không đặt hai biến này.
    if os.environ.get("QLVB_ALLOW_FIXTURE") == "1" and os.environ.get("QLVB_HTTP_FIXTURE"):
        return _fetch_fixture(os.environ["QLVB_HTTP_FIXTURE"])
    request = urllib.request.Request(url, headers=build_headers(cookie), method="GET")
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            raw = response.read(MAX_BODY)
            charset = response.headers.get_content_charset() or "utf-8"
            return FetchResult(
                status=getattr(response, "status", 200),
                final_url=response.geturl(),
                body=raw.decode(charset, errors="replace"),
            )
    except urllib.error.HTTPError as exc:
        raw = exc.read(200_000)
        return FetchResult(
            status=exc.code,
            final_url=exc.geturl() or url,
            body=raw.decode("utf-8", errors="replace"),
        )
    except (urllib.error.URLError, TimeoutError, socket.timeout, OSError) as exc:
        raise NetworkError("lỗi mạng") from exc


def _fetch_fixture(path: str) -> FetchResult:
    """Chỉ dùng khi thử. Routine thật không đặt QLVB_HTTP_FIXTURE."""
    data = json.loads(Path(path).read_text(encoding="utf-8"))
    if data.get("error"):
        raise NetworkError("lỗi mạng")
    return FetchResult(
        status=int(data.get("status", 200)),
        final_url=str(data.get("finalUrl") or data.get("final_url") or ""),
        body=str(data.get("body") or ""),
    )


def _require_https(url: str) -> None:
    parsed = urllib.parse.urlparse(url)
    if parsed.scheme != "https" or not parsed.netloc:
        raise CookieError("QLVB_PAGE_URL phải là URL https")


def execute(env: dict[str, str], fetch) -> tuple[int, str, str]:
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
    try:
        _require_https(page_url)
        cookie = load_cookie_header(Path(cookie_path))
        previous = load_baseline(baseline_path)
        result = fetch(page_url, cookie, timeout)
    except CookieError as exc:
        return EXIT_ERROR, "", f"qlvb-bell: {exc}"
    except BaselineError as exc:
        return EXIT_ERROR, "", f"qlvb-bell: {exc}"
    except NetworkError:
        return EXIT_ERROR, "", "qlvb-bell: lỗi mạng"
    except Exception:
        return EXIT_ERROR, "", "qlvb-bell: lỗi không đọc được trang"

    if result.status == 401 or is_login_redirect(result.final_url, result.body):
        return EXIT_SESSION, "", "qlvb-bell: hết phiên"
    if result.status == 403:
        return EXIT_ERROR, "", "qlvb-bell: HTTP 403"
    if result.status != 200:
        return EXIT_ERROR, "", f"qlvb-bell: HTTP {result.status}"

    view = parse_bell(result.body)
    if view is None:
        return EXIT_ERROR, "", "qlvb-bell: không thấy chuông trong trang"
    projected = project_items(previous, view)
    moi = [] if seed else diff_moi(previous, view)
    if _items_signature(projected) != _items_signature(previous):
        try:
            save_baseline(baseline_path, projected)
        except OSError:
            return EXIT_ERROR, "", "qlvb-bell: không ghi được baseline"
    if seed or not moi:
        return EXIT_OK, "", ""
    line = json.dumps({"moi": moi}, ensure_ascii=False, separators=(",", ":")) + "\n"
    return EXIT_NEW, line, ""


def main() -> int:
    code, out, err = execute(dict(os.environ), live_fetch)
    if err:
        print(err, file=sys.stderr)
    if out:
        sys.stdout.write(out)
    return code


if __name__ == "__main__":
    sys.exit(main())
