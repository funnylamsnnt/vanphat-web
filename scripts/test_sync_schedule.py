#!/usr/bin/env python3
"""Test lịch sync 14:35: modifiedTime, commit, Pages, cầu nối. Không gọi mạng."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import time as time_of_day
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from source_title_guard import SOURCE_FILE_ID  # noqa: E402
from sync_schedule import (  # noqa: E402
    CHINH_SACH_TITLE,
    CRON_UTC,
    DANH_MUC_TITLE,
    GOOGLE_SHEET_MIME,
    Job,
    apply_bridge_ok,
    apply_sync_result,
    bridge_block_leaks,
    bridge_sheet_plan,
    cell_for_sheet,
    col_letter,
    decide,
    ma_from_column,
    ma_list,
    parse_sa,
    path_allowed,
    redact,
    run_job,
    source_download_request,
    source_metadata_request,
    wait_for_pages,
)

SA = json.dumps(
    {
        "type": "service_account",
        "client_email": "sync@example.iam.gserviceaccount.com",
        "private_key": "-----BEGIN PRIVATE KEY-----\nMII-test\n-----END PRIVATE KEY-----\n",
    }
)
BRIDGE = "BridgeSheetIdExample0000000000000000001"
TOKEN = "ghp_" + ("b" * 24)
MODIFIED = "2026-10-29T07:35:00.000Z"
OLD = "2026-10-28T06:53:23.728Z"


def base_state(modified: str = OLD, status: str = "ok", source: str | None = None) -> dict:
    bridge = {"status": status}
    if source is not None:
        bridge["sourceModifiedTime"] = source
    return {
        "lastModifiedTime": modified,
        "lastSyncResult": {"excluded_nhom": {"Không đưa lên web": ["VP415"]}},
        "bridgeRefresh": bridge,
    }


def stats() -> dict:
    return {
        "changed": True,
        "count": 2,
        "with_img": 1,
        "added": ["VP001"],
        "removed": [],
        "priceChanges": [],
        "slugChanges": [],
        "zeroPrice": [],
        "autoPlacedGroups": [],
        "excludedGroups": {"Không đưa lên web": ["VP415", "VP531"]},
        "heldUnmappedGroups": {},
    }


class ScheduleTests(unittest.TestCase):
    def test_decide_skip_when_time_matches(self):
        action, why = decide(base_state(MODIFIED, "ok", MODIFIED), "PHIEU BAO GIA VAN PHAT - 2026.xlsx", MODIFIED)
        self.assertEqual(action, "skip")
        self.assertIn("không đổi", why)

    def test_old_state_without_bridge_stamp_does_not_refresh(self):
        action, _ = decide(base_state(MODIFIED, "done"), "PHIEU BAO GIA VAN PHAT - 2026.xlsx", MODIFIED)
        self.assertEqual(action, "skip")

    def test_decide_sync_when_time_changes(self):
        action, _ = decide(base_state(), "PHIEU BAO GIA VAN PHAT - 2026.xlsx", MODIFIED)
        self.assertEqual(action, "sync")

    def test_decide_bridge_when_pending(self):
        state = base_state(MODIFIED, "pending", MODIFIED)
        action, _ = decide(state, "PHIEU BAO GIA VAN PHAT - 2026.xlsx", MODIFIED)
        self.assertEqual(action, "bridge")

    def test_bad_title_aborts_even_if_time_matches(self):
        action, why = decide(base_state(MODIFIED, "ok", MODIFIED), "FB1DA4E5.tmp", MODIFIED)
        self.assertEqual(action, "abort")
        self.assertIn("temp", why)

    def test_missing_modified_time_aborts(self):
        action, _ = decide(base_state(), "PHIEU BAO GIA VAN PHAT - 2026.xlsx", "")
        self.assertEqual(action, "abort")

    def test_source_download_is_get_only(self):
        method, url, params = source_metadata_request(SOURCE_FILE_ID)
        self.assertEqual(method, "GET")
        self.assertNotIn("upload", url)
        method, url, params = source_download_request(SOURCE_FILE_ID, XLSX)
        self.assertEqual(method, "GET")
        self.assertEqual(params.get("alt"), "media")
        self.assertNotIn("uploadType", params)
        method, url, params = source_download_request(SOURCE_FILE_ID, GOOGLE_SHEET_MIME)
        self.assertEqual(method, "GET")
        self.assertIn("/export", url)
        with self.assertRaises(RuntimeError):
            source_download_request("sheet-khac", XLSX)

    def test_ma_list_keeps_excluded_rows(self):
        rows = [
            ["Nhóm", "Mã SP", "Tên", "ĐVT", "Đơn giá"],
            ["Không đưa lên web", "VP415", "Ẩn", "Cái", 1000],
            ["Giấy", "VP001", "A4", "Ram", 50000],
            ["Giấy", "", "trống", "Ram", 1],
        ]
        self.assertEqual(ma_list(rows), ["VP415", "VP001"])
        self.assertEqual(ma_from_column(["Mã SP", "VP415", "VP001", ""]), ["VP415", "VP001"])

    def test_cell_and_column(self):
        self.assertEqual(cell_for_sheet(None), "")
        self.assertEqual(cell_for_sheet(12000.0), 12000)
        self.assertEqual(cell_for_sheet(time_of_day(8, 5)), "08:05:00")
        self.assertEqual(col_letter(0), "A")
        self.assertEqual(col_letter(1), "B")
        self.assertEqual(col_letter(26), "AA")

    def test_bridge_plan_keeps_chinh_sach(self):
        sheets = [
            {"sheetId": 1, "title": DANH_MUC_TITLE},
            {"sheetId": 2, "title": CHINH_SACH_TITLE},
            {"sheetId": 9, "title": "VP_NAP"},
        ]
        plan = bridge_sheet_plan(sheets)
        self.assertEqual(plan["keep"], [2])
        self.assertEqual(plan["delete_after"], [1])
        self.assertEqual(plan["delete_before"], [9])
        self.assertNotIn(2, plan["delete_before"] + plan["delete_after"])
        reused = bridge_sheet_plan([{"sheetId": 9, "title": "VP_NAP"}, {"sheetId": 2, "title": CHINH_SACH_TITLE}])
        self.assertEqual(reused["reuse"], 9)
        self.assertEqual(reused["delete_after"], [])
        self.assertIn(2, reused["keep"])

    def test_state_update_drops_bridge_id(self):
        state = base_state()
        state["bridgeRefresh"]["sheetId"] = BRIDGE
        apply_sync_result(state, MODIFIED, "PHIEU BAO GIA VAN PHAT - 2026.xlsx", stats(), "2026-10-29T07:40:00Z")
        self.assertEqual(state["lastSyncResult"]["excluded_nhom"]["Không đưa lên web"], ["VP415", "VP531"])
        self.assertEqual(state["bridgeRefresh"]["status"], "pending")
        self.assertFalse(bridge_block_leaks(state, BRIDGE))
        apply_bridge_ok(state, MODIFIED, 2, "2026-10-29T07:45:00Z", "VP001")
        self.assertEqual(state["bridgeRefresh"]["delta"], 0)
        self.assertNotIn("sheetId", state["bridgeRefresh"])

    def test_path_allowlist(self):
        self.assertTrue(path_allowed("san-pham/vp001-giay.html"))
        self.assertTrue(path_allowed("scripts/sync_state.json"))
        self.assertTrue(path_allowed("data/products.json"))
        self.assertFalse(path_allowed("apps-script/dong-bo-2-chieu/DongBo.gs"))
        self.assertFalse(path_allowed("CNAME"))
        self.assertFalse(path_allowed("data/nguon.xlsx"))
        self.assertFalse(path_allowed(".github/workflows/sync-catalog.yml"))
        self.assertFalse(path_allowed("scripts/sync_products_from_excel.py"))

    def test_parse_sa_and_redact(self):
        info = parse_sa(SA)
        self.assertIn("example.iam", info["client_email"])
        with self.assertRaises(ValueError):
            parse_sa("{")
        self.assertNotIn(BRIDGE, redact("id " + BRIDGE, [BRIDGE]))

    def test_wait_pages_success_then_failure_and_timeout(self):
        seen = {"n": 0}

        def sleep(_seconds):
            seen["n"] += 1

        def now_success():
            return 0

        def runs_success():
            if seen["n"] == 0:
                return []
            return [{"headSha": "abc", "status": "completed", "conclusion": "success"}]

        wait_for_pages(runs_success, "abc", sleep, now_success, timeout=5)

        def runs_fail():
            return [{"headSha": "abc", "status": "completed", "conclusion": "failure"}]

        with self.assertRaises(SystemExit):
            wait_for_pages(runs_fail, "abc", lambda _s: None, lambda: 0, timeout=5)

        ticks = {"t": 0}

        def now_late():
            ticks["t"] += 1
            return 0 if ticks["t"] < 3 else 10**9

        with self.assertRaises(SystemExit) as caught:
            wait_for_pages(lambda: [], "abc", lambda _s: None, now_late, timeout=5)
        self.assertIn("GH_PUSH_TOKEN", str(caught.exception))


XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"


class JobTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.state_path = self.root / "sync_state.json"
        self.work = self.root / "work"
        self.logs: list[str] = []
        self.downloads = 0
        self.syncs = 0
        self.bridges = 0
        self.checks = 0
        self.commits: list[tuple[list[str], str]] = []
        self.pushes = 0
        self.waits: list[str] = []
        self.paths = [["data/products.json", "scripts/sync_state.json"], ["scripts/sync_state.json"]]

    def tearDown(self):
        self.tmp.cleanup()

    def write_state(self, state: dict) -> None:
        self.state_path.write_text(json.dumps(state, ensure_ascii=False), encoding="utf-8")

    def job(self, **overrides) -> Job:
        meta = {"id": SOURCE_FILE_ID, "name": "PHIEU BAO GIA VAN PHAT - 2026.xlsx", "modifiedTime": MODIFIED, "mimeType": XLSX}
        meta.update(overrides.pop("meta", {}))
        bridge_error = overrides.pop("bridge_error", False)
        custom_paths = overrides.pop("paths", None)
        custom_check = overrides.pop("check", None)

        def metadata():
            return dict(meta)

        def download(dest: Path):
            self.downloads += 1
            dest.parent.mkdir(parents=True, exist_ok=True)
            dest.write_bytes(b"PK")

        def sync(_path, _title):
            self.syncs += 1
            return stats()

        def check():
            self.checks += 1

        def bridge(_path):
            self.bridges += 1
            if bridge_error:
                raise SystemExit("lệch " + BRIDGE)
            return {"sku": 2, "delta": 0, "lastMa": "VP001"}

        def changed():
            if custom_paths is not None:
                return list(custom_paths)
            return list(self.paths.pop(0)) if self.paths else []

        def commit(paths, message):
            self.commits.append((list(paths), message))
            return "a" * 40

        def push():
            self.pushes += 1

        def wait(sha):
            self.waits.append(sha)

        fields = dict(
            root=self.root,
            state_path=self.state_path,
            workdir=self.work,
            sa_json=SA,
            bridge_id=BRIDGE,
            push_token=TOKEN,
            repo="funnylamsnnt/vanphat-web",
            now="2026-10-29T07:40:00Z",
            metadata=metadata,
            download=download,
            sync=sync,
            check=check,
            bridge=bridge,
            changed_paths=changed,
            commit=commit,
            push=push,
            wait_pages=wait,
            log=self.logs.append,
        )
        if custom_check is not None:
            fields["check"] = custom_check
        fields.update(overrides)
        return Job(**fields)

    def test_skip_does_not_download(self):
        self.write_state(base_state(MODIFIED, "ok", MODIFIED))
        code = run_job(self.job())
        self.assertEqual(code, 0)
        self.assertEqual(self.downloads, 0)
        self.assertEqual(self.syncs, 0)
        self.assertEqual(self.bridges, 0)
        self.assertEqual(self.pushes, 0)

    def test_bad_title_does_not_touch_bridge(self):
        self.write_state(base_state())
        code = run_job(self.job(meta={"name": "FB1DA4E5.tmp", "modifiedTime": MODIFIED}))
        self.assertEqual(code, 3)
        self.assertEqual(self.downloads, 0)
        self.assertEqual(self.bridges, 0)
        self.assertTrue(any("aborted" in line for line in self.logs))

    def test_sync_commits_deploys_then_bridge(self):
        self.write_state(base_state())
        code = run_job(self.job())
        self.assertEqual(code, 0)
        self.assertEqual(self.syncs, 1)
        self.assertEqual(self.checks, 1)
        self.assertEqual(self.bridges, 1)
        self.assertEqual(len(self.commits), 2)
        self.assertEqual(self.pushes, 2)
        self.assertEqual(len(self.waits), 2)
        self.assertIn("modifiedTime", self.commits[0][1])
        saved = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["lastModifiedTime"], MODIFIED)
        self.assertEqual(saved["bridgeRefresh"]["status"], "ok")
        self.assertEqual(saved["bridgeRefresh"]["delta"], 0)
        self.assertNotIn(BRIDGE, json.dumps(saved["bridgeRefresh"]))
        self.assertEqual(saved["lastSyncResult"]["excluded_nhom"]["Không đưa lên web"][0], "VP415")

    def test_bridge_failure_stays_pending(self):
        self.write_state(base_state())
        code = run_job(self.job(bridge_error=True))
        self.assertEqual(code, 1)
        saved = json.loads(self.state_path.read_text(encoding="utf-8"))
        self.assertEqual(saved["bridgeRefresh"]["status"], "pending")
        self.assertEqual(len(self.commits), 1)
        self.assertNotIn(BRIDGE, "\n".join(self.logs))

    def test_pending_retries_bridge_only(self):
        self.write_state(base_state(MODIFIED, "pending", MODIFIED))
        code = run_job(self.job())
        self.assertEqual(code, 0)
        self.assertEqual(self.syncs, 0)
        self.assertEqual(self.checks, 0)
        self.assertEqual(self.bridges, 1)
        self.assertEqual(len(self.commits), 1)

    def test_missing_secret_stops(self):
        self.write_state(base_state())
        code = run_job(self.job(push_token=""))
        self.assertEqual(code, 1)
        self.assertEqual(self.downloads, 0)
        self.assertTrue(any("GH_PUSH_TOKEN" in line for line in self.logs))

    def test_refuses_apps_script_commit(self):
        self.write_state(base_state())
        code = run_job(self.job(paths=["apps-script/dong-bo-2-chieu/DongBo.gs"]))
        self.assertEqual(code, 1)
        self.assertEqual(self.pushes, 0)
        self.assertEqual(self.bridges, 0)

    def test_check_failure_does_not_commit(self):
        self.write_state(base_state())

        def boom():
            raise SystemExit("check_rules không đạt")

        code = run_job(self.job(check=boom))
        self.assertEqual(code, 1)
        self.assertEqual(self.commits, [])
        self.assertEqual(self.bridges, 0)


class RepoContractTests(unittest.TestCase):
    def test_workflow_cron_and_secrets(self):
        text = (ROOT / ".github/workflows/sync-catalog.yml").read_text(encoding="utf-8")
        self.assertIn(f'cron: "{CRON_UTC}"', text)
        self.assertIn("secrets.GDRIVE_SA_JSON", text)
        self.assertIn("secrets.LIVE_BRIDGE_SHEET_ID", text)
        self.assertIn("secrets.GH_PUSH_TOKEN", text)
        self.assertIn("persist-credentials: false", text)
        self.assertNotIn("everyMinutes", text)
        self.assertNotIn("1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM", text)

    def test_readme_secret_guide_and_thirty_minute_trigger(self):
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("GDRIVE_SA_JSON", readme)
        self.assertIn("LIVE_BRIDGE_SHEET_ID", readme)
        self.assertIn("GH_PUSH_TOKEN", readme)
        self.assertIn(CRON_UTC, readme)
        self.assertIn(SOURCE_FILE_ID, readme)
        self.assertIn("Chính Sách Đối Tác", readme)
        guide = (ROOT / "apps-script/dong-bo-2-chieu/README.md").read_text(encoding="utf-8")
        self.assertIn("everyMinutes(30)", guide)
        self.assertNotIn("everyMinutes(15)", guide)

    def test_runner_has_no_bridge_file_id(self):
        text = (ROOT / "scripts/run_scheduled_sync.py").read_text(encoding="utf-8")
        self.assertNotIn("1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM", text)
        self.assertNotIn("BEGIN PRIVATE KEY", text)


if __name__ == "__main__":
    unittest.main()
