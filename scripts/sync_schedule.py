#!/usr/bin/env python3
"""Quyết định lịch sync 14:35 và các phép thuần để test, không gọi mạng.

Workflow `.github/workflows/sync-catalog.yml` gọi `run_scheduled_sync.py`.
File này giữ so sánh modifiedTime, chốt tên nguồn, kế hoạch đổi tab cầu nối,
và danh sách file được commit. Không ghi fileId cầu nối.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass
from datetime import date, datetime, time as time_of_day
from pathlib import Path
from typing import Callable

from source_title_guard import SOURCE_FILE_ID, check_title

CRON_UTC = "35 7 * * *"
DANH_MUC_TITLE = "Danh Mục Vật Tư"
CHINH_SACH_TITLE = "Chính Sách Đối Tác"
TEMP_TITLE = "VP_NAP"
GOOGLE_SHEET_MIME = "application/vnd.google-apps.spreadsheet"
XLSX_MIME = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
SHEET_ID_RE = re.compile(r"^[A-Za-z0-9_-]{20,80}$")
BRIDGE_SECRET_KEYS = ("sheetId", "fileId", "bridgeId", "spreadsheetId")
PAGES_WAIT_SECONDS = 15 * 60

ALLOW_EXACT = {
    "js/catalog-paths.js",
    "sitemap.xml",
    "robots.txt",
    "scripts/sync_state.json",
    "index.html",
    "san-pham.html",
    "thu-ngo.html",
    "photocopy.html",
    "lien-he.html",
    "khu-vuc.html",
    "offline.html",
    "nhan-vien.html",
}
ALLOW_PREFIX = (
    "data/",
    "linh-vuc/",
    "san-pham/",
    "dia-phuong/",
    "app/",
    "nhan-vien/",
)


def parse_sa(raw: str) -> dict:
    text = str(raw or "").strip()
    if not text:
        raise ValueError("Thiếu secret GDRIVE_SA_JSON")
    try:
        info = json.loads(text)
    except json.JSONDecodeError as exc:
        raise ValueError("GDRIVE_SA_JSON không phải JSON") from exc
    if not isinstance(info, dict) or info.get("type") != "service_account":
        raise ValueError("GDRIVE_SA_JSON phải là service account")
    email = str(info.get("client_email") or "")
    key = str(info.get("private_key") or "")
    if "@" not in email or "BEGIN PRIVATE KEY" not in key:
        raise ValueError("GDRIVE_SA_JSON thiếu client_email hoặc private_key")
    return info


def secret_values(sa_json: str, bridge_id: str, token: str) -> list[str]:
    values = [bridge_id.strip(), token.strip(), sa_json.strip()]
    try:
        key = str(parse_sa(sa_json).get("private_key") or "")
    except ValueError:
        key = ""
    if key:
        values.append(key)
    return [item for item in values if len(item) > 8]


def redact(text: str, secrets: list[str]) -> str:
    out = str(text or "")
    for secret in secrets:
        if secret:
            out = out.replace(secret, "[ẩn]")
    return out


def decide(state: dict, title: str, modified_time: str) -> tuple[str, str]:
    """abort | sync | bridge | skip, kèm lý do ngắn."""
    ok, why = check_title(title)
    if not ok:
        return "abort", why
    modified = str(modified_time or "").strip()
    if not modified:
        return "abort", "Drive không trả modifiedTime"
    if str(state.get("lastModifiedTime") or "") != modified:
        return "sync", "modifiedTime đổi"
    bridge = state.get("bridgeRefresh") if isinstance(state.get("bridgeRefresh"), dict) else {}
    if bridge.get("sourceModifiedTime") == modified and bridge.get("status") != "ok":
        return "bridge", "cầu nối còn pending"
    return "skip", "modifiedTime không đổi"


def source_metadata_request(file_id: str) -> tuple[str, str, dict]:
    if file_id != SOURCE_FILE_ID:
        raise RuntimeError("chỉ đọc metadata file nguồn đã khóa")
    return (
        "GET",
        f"https://www.googleapis.com/drive/v3/files/{file_id}",
        {"fields": "id,name,mimeType,modifiedTime", "supportsAllDrives": "true"},
    )


def source_download_request(file_id: str, mime: str) -> tuple[str, str, dict]:
    """GET nội dung. Không đổi file gốc trên Drive."""
    if file_id != SOURCE_FILE_ID:
        raise RuntimeError("chỉ tải file nguồn đã khóa")
    if mime == GOOGLE_SHEET_MIME:
        return (
            "GET",
            f"https://www.googleapis.com/drive/v3/files/{file_id}/export",
            {"mimeType": XLSX_MIME, "supportsAllDrives": "true"},
        )
    return (
        "GET",
        f"https://www.googleapis.com/drive/v3/files/{file_id}",
        {"alt": "media", "supportsAllDrives": "true"},
    )


def cell_for_sheet(value):
    if value is None:
        return ""
    if isinstance(value, bool):
        return value
    if isinstance(value, float) and value.is_integer():
        return int(value)
    if isinstance(value, datetime):
        return value.strftime("%Y-%m-%d %H:%M:%S")
    if isinstance(value, time_of_day):
        return value.isoformat()
    if isinstance(value, date):
        return value.isoformat()
    return value


def col_letter(index: int) -> str:
    if index < 0:
        raise ValueError("cột âm")
    n = index + 1
    letters = ""
    while n:
        n, rem = divmod(n - 1, 26)
        letters = chr(65 + rem) + letters
    return letters


def ma_list(rows: list[list]) -> list[str]:
    from sync_products_from_excel import clean, detect_columns

    if not rows:
        return []
    idx = detect_columns(rows[0]).get("ma")
    if idx is None:
        raise ValueError("không thấy cột mã")
    found = []
    for row in rows[1:]:
        value = row[idx] if idx < len(row) else ""
        text = clean(value)
        if text:
            found.append(text)
    return found


def ma_from_column(cells: list) -> list[str]:
    from sync_products_from_excel import clean

    return [clean(value) for value in cells[1:] if clean(value)]


def bridge_sheet_plan(sheets: list[dict]) -> dict:
    """Id tab sẽ xóa. Không bao giờ đưa tab Chính Sách Đối Tác vào danh sách xóa."""
    chinh = [row for row in sheets if row.get("title") == CHINH_SACH_TITLE]
    old = [row for row in sheets if row.get("title") == DANH_MUC_TITLE]
    temps = [row for row in sheets if row.get("title") == TEMP_TITLE]
    chinh_ids = [row["sheetId"] for row in chinh]
    old_ids = [row["sheetId"] for row in old]
    if set(old_ids) & set(chinh_ids):
        raise RuntimeError("không xóa Chính Sách Đối Tác")
    if old_ids:
        delete_temps = [row["sheetId"] for row in temps if row["sheetId"] not in chinh_ids]
        reuse = None
    elif temps:
        reuse = temps[0]["sheetId"]
        if reuse in chinh_ids:
            raise RuntimeError("không xóa Chính Sách Đối Tác")
        delete_temps = [row["sheetId"] for row in temps[1:] if row["sheetId"] not in chinh_ids]
    else:
        delete_temps = []
        reuse = None
    delete_ids = list(delete_temps) + list(old_ids)
    if set(delete_ids) & set(chinh_ids):
        raise RuntimeError("không xóa Chính Sách Đối Tác")
    return {
        "delete_before": delete_temps,
        "delete_after": old_ids,
        "keep": chinh_ids,
        "reuse": reuse,
    }


def scrub_bridge(bridge: dict) -> dict:
    return {key: value for key, value in bridge.items() if key not in BRIDGE_SECRET_KEYS}


def bridge_block_leaks(state: dict, secret: str) -> bool:
    blob = json.dumps(state.get("bridgeRefresh") or {}, ensure_ascii=False)
    return bool(secret) and secret in blob


def apply_sync_result(state: dict, modified_time: str, title: str, stats: dict, now_iso: str) -> dict:
    if "excludedGroups" not in stats:
        raise ValueError("sync không trả excludedGroups")
    previous = state.get("lastModifiedTime")
    if previous and previous != modified_time:
        state["previousModifiedTime"] = previous
    state["lastModifiedTime"] = modified_time
    state["driveTitleAtSync"] = title
    state["lastSyncAt"] = now_iso
    result = dict(state.get("lastSyncResult") or {})
    result["changed"] = bool(stats.get("changed"))
    result["count"] = stats.get("count")
    result["with_img"] = stats.get("with_img")
    result["added"] = stats.get("added") or []
    result["removed"] = stats.get("removed") or []
    result["priceChanges"] = stats.get("priceChanges") or []
    result["slugChanges"] = stats.get("slugChanges") or []
    result["zeroPrice"] = stats.get("zeroPrice") or []
    result["autoPlacedGroups"] = stats.get("autoPlacedGroups") or []
    result["excluded_nhom"] = stats.get("excludedGroups") or {}
    result["heldUnmappedGroups"] = stats.get("heldUnmappedGroups") or {}
    state["lastSyncResult"] = result
    bridge = scrub_bridge(dict(state.get("bridgeRefresh") or {}))
    bridge["status"] = "pending"
    bridge["sourceModifiedTime"] = modified_time
    state["bridgeRefresh"] = bridge
    return state


def apply_bridge_ok(state: dict, modified_time: str, sku_count: int, now_iso: str, last_ma: str = "") -> dict:
    bridge = scrub_bridge(dict(state.get("bridgeRefresh") or {}))
    bridge["status"] = "ok"
    bridge["sourceModifiedTime"] = modified_time
    bridge["at"] = now_iso
    bridge["sku"] = sku_count
    bridge["delta"] = 0
    if last_ma:
        bridge["lastMa"] = last_ma
    state["bridgeRefresh"] = bridge
    return state


def load_state(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


def save_state(path: Path, state: dict) -> None:
    path.write_text(json.dumps(state, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def path_allowed(path: str) -> bool:
    norm = str(path or "").replace("\\", "/").lstrip("./")
    if not norm or norm.endswith(".xlsx") or norm.endswith(".xls"):
        return False
    if norm == "CNAME" or norm.startswith("apps-script/") or norm.startswith(".github/"):
        return False
    if norm in ALLOW_EXACT:
        return True
    return any(norm.startswith(prefix) for prefix in ALLOW_PREFIX)


def commit_message(modified_time: str) -> str:
    return f"sync: catalog theo Excel modifiedTime {modified_time}"


def wait_for_pages(list_runs: Callable[[], list[dict]], sha: str, sleep: Callable[[float], None], now: Callable[[], float], timeout: int = PAGES_WAIT_SECONDS) -> None:
    deadline = now() + timeout
    saw = False
    while True:
        match = [row for row in list_runs() if row.get("headSha") == sha]
        if match:
            saw = True
            status = match[0].get("status")
            conclusion = match[0].get("conclusion")
            if status == "completed" and conclusion == "success":
                return
            if status == "completed":
                raise SystemExit(f"GitHub Pages thất bại: {conclusion}")
        if now() >= deadline:
            if not saw:
                raise SystemExit(
                    "Không thấy lượt build Pages cho commit này. "
                    "Push bằng GITHUB_TOKEN không kích hoạt pages-build-deployment. Cần secret GH_PUSH_TOKEN."
                )
            raise SystemExit("Hết giờ chờ GitHub Pages")
        sleep(1)


@dataclass
class Job:
    root: Path
    state_path: Path
    workdir: Path
    sa_json: str
    bridge_id: str
    push_token: str
    repo: str
    now: str
    metadata: Callable[[], dict]
    download: Callable[[Path], None]
    sync: Callable[[Path, str], dict]
    check: Callable[[], None]
    bridge: Callable[[Path], dict]
    changed_paths: Callable[[], list[str]]
    commit: Callable[[list[str], str], str]
    push: Callable[[], None]
    wait_pages: Callable[[str], None]
    log: Callable[[str], None]


def _refuse(job: Job, paths: list[str]) -> str | None:
    refused = [path for path in paths if not path_allowed(path)]
    if refused:
        return "Từ chối commit: " + ", ".join(refused)
    return None


def _commit_allowed(job: Job, paths: list[str], message: str) -> str | None:
    problem = _refuse(job, paths)
    if problem:
        job.log(problem)
        return problem
    if not paths:
        return None
    secrets = secret_values(job.sa_json, job.bridge_id, job.push_token)
    try:
        sha = job.commit(paths, message)
        job.push()
        job.wait_pages(sha)
    except (Exception, SystemExit) as exc:
        text = redact(str(exc), secrets) or "commit lỗi"
        job.log(text)
        return text
    return None


def run_job(job: Job) -> int:
    secrets = secret_values(job.sa_json, job.bridge_id, job.push_token)
    missing = []
    if not str(job.sa_json or "").strip():
        missing.append("GDRIVE_SA_JSON")
    if not str(job.bridge_id or "").strip():
        missing.append("LIVE_BRIDGE_SHEET_ID")
    if not str(job.push_token or "").strip():
        missing.append("GH_PUSH_TOKEN")
    if missing:
        job.log("Thiếu secret: " + ", ".join(missing) + ". Xem README, mục Action đồng bộ catalog 14:35.")
        return 1
    if not SHEET_ID_RE.match(job.bridge_id.strip()):
        job.log("LIVE_BRIDGE_SHEET_ID không đúng dạng id Google Sheet")
        return 1
    try:
        info = parse_sa(job.sa_json)
    except ValueError as exc:
        job.log(redact(str(exc), secrets))
        return 1
    job.log("Service account " + str(info.get("client_email") or ""))

    try:
        meta = job.metadata()
    except (Exception, SystemExit) as exc:
        job.log(redact(str(exc), secrets))
        return 1
    title = str(meta.get("name") or "")
    modified = str(meta.get("modifiedTime") or "")
    file_id = str(meta.get("id") or "")
    if file_id and file_id != SOURCE_FILE_ID:
        job.log("Metadata không phải file nguồn đã khóa")
        return 3
    state = load_state(job.state_path)
    action, why = decide(state, title, modified)
    job.log(f"{action}: {why}")
    if action == "abort":
        job.log(json.dumps({"aborted": True, "reason": why, "notify": "anh Hà"}, ensure_ascii=False))
        return 3
    if action == "skip":
        return 0

    job.workdir.mkdir(parents=True, exist_ok=True)
    xlsx = job.workdir / "source.xlsx"
    try:
        job.download(xlsx)
    except (Exception, SystemExit) as exc:
        job.log(redact(str(exc), secrets))
        return 1

    if action == "sync":
        try:
            stats = job.sync(xlsx, title)
            apply_sync_result(state, modified, title, stats, job.now)
        except (Exception, SystemExit) as exc:
            job.log(redact(str(exc), secrets))
            return 1
        save_state(job.state_path, state)
        if bridge_block_leaks(state, job.bridge_id.strip()):
            job.log("sync_state sắp ghi id cầu nối, dừng")
            return 1
        try:
            job.check()
        except (Exception, SystemExit) as exc:
            job.log(redact(str(exc), secrets))
            return 1
        try:
            paths = job.changed_paths()
        except (Exception, SystemExit) as exc:
            job.log(redact(str(exc), secrets))
            return 1
        if not paths:
            job.log("Excel đổi nhưng không có file catalog để commit")
            return 1
        if _commit_allowed(job, paths, commit_message(modified)):
            return 1

    try:
        result = job.bridge(xlsx)
    except (Exception, SystemExit) as exc:
        job.log(redact(str(exc), secrets))
        return 1
    try:
        delta = int(result.get("delta", -1))
        sku = int(result.get("sku", 0))
    except (TypeError, ValueError):
        job.log("Cầu nối không trả số SKU")
        return 1
    if delta != 0 or sku < 1:
        job.log(f"Cầu nối lệch số SKU: sku={sku} delta={delta}")
        return 1
    state = load_state(job.state_path)
    apply_bridge_ok(state, modified, sku, job.now, str(result.get("lastMa") or ""))
    if bridge_block_leaks(state, job.bridge_id.strip()):
        job.log("sync_state sắp ghi id cầu nối, dừng")
        return 1
    save_state(job.state_path, state)
    try:
        paths = job.changed_paths()
    except (Exception, SystemExit) as exc:
        job.log(redact(str(exc), secrets))
        return 1
    if paths and _commit_allowed(job, paths, "sync: ghi nhận cầu nối LIVE đã khớp số SKU"):
        return 1
    job.log(f"Cầu nối LIVE khớp {sku} SKU, lệch 0")
    return 0
