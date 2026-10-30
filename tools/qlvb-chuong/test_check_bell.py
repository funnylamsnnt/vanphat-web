#!/usr/bin/env python3
"""Mock HTTP cho chuông QLVB: có mới, im, hết phiên, 403, mạng, cookie."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import time
import unittest
from pathlib import Path

HERE = Path(__file__).resolve().parent
SPEC = importlib.util.spec_from_file_location("check_bell", HERE / "check_bell.py")
bell = importlib.util.module_from_spec(SPEC)
assert SPEC.loader is not None
sys.modules["check_bell"] = bell
SPEC.loader.exec_module(bell)

PAGE = "https://qlvb.example.test/app-view/theme/admin-ex/pages/main.zul"
LOGIN = "https://qlvb.example.test/app-view/theme/admin-ex/pages/login.zul"
SECRET = "fake-session-value"


def zk_page(count: int, notices: list[tuple[str, str]] | None = None) -> str:
    notice_widgets = []
    for nid, title in notices or []:
        notice_widgets.append(
            "['zul.wgt.Div','%s',{id:'%s',sclass:'notification-item'},["
            "['zul.wgt.Label','t-%s',{sclass:'notification-title',value:'%s'},[]]"
            "]]" % (nid, nid, nid, title)
        )
    notices_blob = ",".join(notice_widgets)
    return """<!DOCTYPE html><html><body>
<style>.notification-count { min-width: 16px; height: 18px; }</style>
<script>zkmx(
[0,'pg',{id:'pageMain',dt:'z_test',ru:'/theme/admin-ex/pages/main.zul'},[
['zul.wgt.Div','bell',{sclass:'notification-bell'},[
 ['zul.wgt.Div','cnt',{sclass:'notification-count'},[
   ['zul.wgt.Label','lbl',{value:'%s'},[]]
 ]]
]],
['zul.wgt.Div','pop',{sclass:'show-notification-popup-form'},[%s]]
]]);</script>
<div class="notification-bell"></div>
</body></html>
""" % (count, notices_blob)


HTML_PAGE = """<div class="notification-bell"></div>
<div class="notification-count"><span class="z-label">6</span></div>
<div class="notification-item" id="notice-9"><span class="notification-title">Công văn 12</span></div>
"""

LOGIN_BODY = (
    "zkmx([0,'pg',{id:'pageMain',dt:'z_x'},[]],9,"
    "'redirect','[\"\\\\/app-view\\\\/theme\\\\/admin-ex\\\\/pages\\\\/login.zul\",\"\"]']);"
    "<div class=\"notification-count\"><span>9</span></div>"
)

NGINX_403 = """<html><head><title>403 Forbidden</title></head>
<body><center><h1>403 Forbidden</h1></center><hr><center>nginx</center></body></html>"""

RICH_PAGE = """<div class="notification-bell"></div>
<div class="notification-count"><span>2</span></div>
<div class="notification-item" id="n-khan">
  <span class="notification-title">Công văn Khánh Hòa</span>
  <span class="notification-time">30/10/2026 09:00</span>
</div>
<div class="notification-item" id="n-gap">
  <a href="/van-ban/9">xem</a>
  <span class="notification-title">Tờ trình hỏa tốc</span>
  <span class="notification-time">30/10/2026 15:40</span>
  <span class="khan">Hỏa tốc</span>
</div>
<div>Chờ xử lý <b>2</b></div>
<div>Sắp đến hạn <b>0</b></div>
<div>Quá hạn <b>1</b></div>
<div>Nhận để biết <b>0</b></div>
"""


def _write_cookie(path: Path, text: str, mode: int = 0o600) -> None:
    path.write_text(text, encoding="utf-8")
    os.chmod(path, mode)


class FetchStub:
    def __init__(self, result=None, error: Exception | None = None):
        self.result = result
        self.error = error
        self.calls: list[tuple] = []

    def __call__(self, url, cookie, timeout):
        self.calls.append((url, cookie, timeout))
        if self.error:
            raise self.error
        return self.result


class SequenceStub:
    def __init__(self, results):
        self.results = list(results)
        self.calls: list[tuple] = []

    def __call__(self, url, cookie, timeout):
        self.calls.append((url, cookie, timeout))
        if not self.results:
            raise AssertionError("fetch hết kịch bản")
        item = self.results.pop(0)
        if isinstance(item, Exception):
            raise item
        return item


class BellTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.baseline = self.root / "baseline.json"
        self.cookie = self.root / "session.cookie"
        _write_cookie(self.cookie, f"JSESSIONID={SECRET}\n")
        self.env = {
            "QLVB_COOKIE_FILE": str(self.cookie),
            "QLVB_PAGE_URL": PAGE,
            "QLVB_BASELINE_FILE": str(self.baseline),
            "QLVB_TIMEOUT": "5",
            "QLVB_RETRY_BACKOFF": "0",
        }

    def tearDown(self):
        self.tmp.cleanup()

    def _write_baseline(self, items, **extra):
        payload = {"version": 1, "updatedAt": "2026-10-01T00:00:00+07:00", "items": items}
        payload.update(extra)
        self.baseline.write_text(json.dumps(payload, ensure_ascii=False) + "\n", encoding="utf-8")

    def test_new_badge_prints_json_and_exit_10(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 1}])
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(4)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10)
        self.assertEqual(err, "")
        payload = json.loads(out)
        self.assertEqual(payload["status"], "new")
        self.assertEqual(payload["moi"], [])
        self.assertIsNone(payload["counts"])
        self.assertEqual(payload["badge"], {"count": 4, "truoc": 1, "them": 3})
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["items"][0]["count"], 4)
        self.assertEqual(self.baseline.stat().st_mode & 0o077, 0)
        self.assertEqual(fetch.calls[0][1], f"JSESSIONID={SECRET}")
        self.assertTrue(fetch.calls[0][0].startswith("https://"))
        self.assertNotIn(SECRET, out)
        self.assertNotIn(SECRET, err)

    def test_unchanged_prints_ok_and_keeps_baseline_bytes(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 4}])
        before = self.baseline.read_bytes()
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(4)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        payload = json.loads(out)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["moi"], [])
        self.assertIsNone(payload["counts"])
        self.assertNotIn("badge", payload)
        self.assertEqual(self.baseline.read_bytes(), before)
        self.assertEqual(len(fetch.calls), 1)

    def test_login_zul_body_exit_3_does_not_touch_baseline(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 1}])
        before = self.baseline.read_bytes()
        delays = []
        fetch = FetchStub(bell.FetchResult(200, PAGE, LOGIN_BODY))
        code, out, err = bell.execute(self.env, fetch, sleep=delays.append)
        self.assertEqual(code, bell.EXIT_SESSION)
        self.assertEqual(code, 3)
        self.assertEqual(json.loads(out), {"status": "session_expired"})
        self.assertIn("hết phiên", err)
        self.assertEqual(self.baseline.read_bytes(), before)
        self.assertEqual(len(fetch.calls), 1)
        self.assertEqual(delays, [])
        self.assertNotIn(SECRET, out + err)

    def test_login_final_url_exit_3(self):
        fetch = FetchStub(bell.FetchResult(200, LOGIN, "<html>login</html>"))
        code, out, _err = bell.execute(self.env, fetch)
        self.assertEqual(code, 3)
        self.assertEqual(json.loads(out)["status"], "session_expired")
        self.assertFalse(self.baseline.exists())
        self.assertEqual(len(fetch.calls), 1)

    def test_login_meta_location_and_password_form(self):
        cases = [
            '<meta http-equiv="refresh" content="0;url=/pages/login.zul">',
            "<script>window.location.replace('/pages/login.zul');</script>",
            '<form><input type="password"><button>Đăng nhập</button></form>',
        ]
        for body in cases:
            fetch = FetchStub(bell.FetchResult(200, PAGE, body))
            code, out, _err = bell.execute(self.env, fetch)
            self.assertEqual(code, 3, msg=body)
            self.assertEqual(json.loads(out)["status"], "session_expired")
            self.assertEqual(len(fetch.calls), 1)

    def test_logout_link_on_live_page_is_not_session_expiry(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 4}])
        body = zk_page(4) + "<script>location.href='/pages/login.zul';</script>"
        fetch = FetchStub(bell.FetchResult(200, PAGE, body))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 0, msg=err)
        self.assertEqual(json.loads(out)["status"], "ok")
        self.assertNotIn("session_expired", out)

    def test_http_401_is_session_expired(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 1}])
        before = self.baseline.read_bytes()
        fetch = FetchStub(bell.FetchResult(401, PAGE, "no"))
        code, out, _err = bell.execute(self.env, fetch)
        self.assertEqual(code, 3)
        self.assertEqual(json.loads(out), {"status": "session_expired"})
        self.assertEqual(self.baseline.read_bytes(), before)
        self.assertEqual(len(fetch.calls), 1)

    def test_http_403_exit_4_retries_once_and_keeps_items(self):
        self._write_baseline(
            [{"id": "notification-count", "kind": "badge", "count": 2}],
            tip="2026-10-01T00:00:00+07:00",
            alerted=["notice-cu"],
        )
        delays = []
        fetch = FetchStub(bell.FetchResult(403, PAGE, zk_page(9)))
        code, out, err = bell.execute(self.env, fetch, sleep=delays.append)
        self.assertEqual(code, 4)
        self.assertEqual(len(fetch.calls), 2)
        self.assertEqual(delays, [0.0])
        payload = json.loads(out)
        self.assertEqual(payload["status"], "forbidden")
        self.assertEqual(payload["consecutiveFailures"], 1)
        self.assertIn("403", err)
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["items"][0]["count"], 2)
        self.assertEqual(saved["tip"], "2026-10-01T00:00:00+07:00")
        self.assertEqual(saved["alerted"], ["notice-cu"])
        self.assertEqual(saved["consecutiveFailures"], 1)
        self.assertNotIn(SECRET, out + err)

        code, out, _err = bell.execute(self.env, fetch, sleep=delays.append)
        self.assertEqual(code, 4)
        self.assertEqual(json.loads(out)["consecutiveFailures"], 2)

    def test_403_then_success_does_not_increment_failures(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 4}])
        before = self.baseline.read_bytes()
        fetch = SequenceStub(
            [
                bell.FetchResult(403, PAGE, "no"),
                bell.FetchResult(200, PAGE, zk_page(4)),
            ]
        )
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 0, msg=err)
        self.assertEqual(json.loads(out)["status"], "ok")
        self.assertEqual(len(fetch.calls), 2)
        self.assertEqual(self.baseline.read_bytes(), before)

    def test_backoff_is_capped_and_403_is_not_retried_more_than_once(self):
        env = dict(self.env)
        env["QLVB_RETRY_BACKOFF"] = "99"
        delays = []
        fetch = SequenceStub(
            [
                bell.FetchResult(403, PAGE, "no"),
                bell.FetchResult(403, PAGE, "no"),
                bell.FetchResult(403, PAGE, "no"),
            ]
        )
        code, _out, _err = bell.execute(env, fetch, sleep=delays.append)
        self.assertEqual(code, 4)
        self.assertEqual(len(fetch.calls), 2)
        self.assertEqual(delays, [5.0])

    def test_nginx_200_body_is_forbidden(self):
        fetch = FetchStub(bell.FetchResult(200, PAGE, NGINX_403))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 4)
        self.assertEqual(json.loads(out)["status"], "forbidden")
        self.assertIn("403", err)
        self.assertEqual(len(fetch.calls), 2)

    def test_http_500_stays_config_error_without_retry(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 2}])
        before = self.baseline.read_bytes()
        fetch = FetchStub(bell.FetchResult(500, PAGE, "err"))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 30)
        self.assertEqual(out, "")
        self.assertIn("500", err)
        self.assertEqual(len(fetch.calls), 1)
        self.assertEqual(self.baseline.read_bytes(), before)

    def test_network_error_exit_4_records_counter_without_fake_notices(self):
        fetch = FetchStub(error=bell.NetworkError("lỗi mạng", reason="timeout"))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 4)
        self.assertIn("lỗi mạng", err)
        payload = json.loads(out)
        self.assertEqual(payload["status"], "network")
        self.assertEqual(payload["reason"], "timeout")
        self.assertEqual(payload["consecutiveFailures"], 1)
        self.assertEqual(len(fetch.calls), 2)
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["consecutiveFailures"], 1)
        self.assertEqual(saved["items"], [])
        self.assertIsNone(saved["tip"])
        self.assertEqual(saved["alerted"], [])
        self.assertEqual(saved["lastFailure"]["reason"], "timeout")

    def test_success_resets_consecutive_failures(self):
        self._write_baseline(
            [{"id": "notification-count", "kind": "badge", "count": 4}],
            consecutiveFailures=3,
            lastFailure={"status": "network", "at": "2026-10-01T00:00:00+07:00"},
        )
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(4)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(json.loads(out)["status"], "ok")
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["consecutiveFailures"], 0)
        self.assertNotIn("lastFailure", saved)

    def test_new_notice_is_moi_without_duplicate_badge(self):
        self._write_baseline(
            [
                {"id": "notification-count", "kind": "badge", "count": 1},
                {"id": "notice-1", "kind": "notice", "title": "Văn bản cũ"},
            ]
        )
        fetch = FetchStub(
            bell.FetchResult(
                200,
                PAGE,
                zk_page(3, [("notice-1", "Văn bản cũ"), ("notice-2", "Phiếu trình mới")]),
            )
        )
        code, out, _err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10)
        payload = json.loads(out)
        self.assertEqual(
            payload["moi"],
            [{"id": "notice-2", "time": None, "title": "Phiếu trình mới", "khan": False}],
        )
        self.assertNotIn("badge", payload)

    def test_html_badge_and_notice(self):
        fetch = FetchStub(bell.FetchResult(200, PAGE, HTML_PAGE))
        code, out, _err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10)
        payload = json.loads(out)
        self.assertEqual(payload["moi"][0]["id"], "notice-9")
        self.assertEqual(payload["moi"][0]["title"], "Công văn 12")
        self.assertFalse(payload["moi"][0]["khan"])

    def test_rich_notice_fields_and_group_counts_keep_waking(self):
        fetch = FetchStub(bell.FetchResult(200, PAGE, RICH_PAGE))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10, msg=err)
        payload = json.loads(out)
        self.assertEqual(
            payload["counts"],
            {"choXuLy": 2, "sapDenHan": 0, "quaHan": 1, "nhanDeBiet": 0},
        )
        by_id = {item["id"]: item for item in payload["moi"]}
        self.assertFalse(by_id["n-khan"]["khan"])
        self.assertEqual(by_id["n-khan"]["time"], "2026-10-30T09:00:00+07:00")
        self.assertTrue(by_id["n-gap"]["khan"])
        self.assertEqual(by_id["n-gap"]["time"], "2026-10-30T15:40:00+07:00")
        self.assertEqual(by_id["n-gap"]["link"], "https://qlvb.example.test/van-ban/9")
        self.assertEqual(by_id["n-gap"]["title"], "Tờ trình hỏa tốc")

        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10, msg=err)
        again = json.loads(out)
        self.assertEqual(again["moi"], [])
        self.assertEqual(again["counts"]["choXuLy"], 2)
        self.assertEqual(again["status"], "new")

    def test_zero_groups_and_known_notices_exit_0(self):
        quiet = RICH_PAGE.replace(">2<", ">0<").replace(">1<", ">0<")
        self._write_baseline(
            [
                {"id": "notification-count", "kind": "badge", "count": 2},
                {"id": "n-khan", "kind": "notice", "title": "Công văn Khánh Hòa"},
                {"id": "n-gap", "kind": "notice", "title": "Tờ trình hỏa tốc"},
            ],
            tip="2026-10-30T15:40:00+07:00",
            alerted=["n-khan", {"id": "n-gap", "title": "Tờ trình hỏa tốc"}],
            counts={"choXuLy": 0, "sapDenHan": 0, "quaHan": 0, "nhanDeBiet": 0},
        )
        fetch = FetchStub(bell.FetchResult(200, PAGE, quiet))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 0, msg=err + out)
        payload = json.loads(out)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["moi"], [])
        self.assertEqual(payload["counts"]["quaHan"], 0)

    def test_string_and_object_alerted_and_tip(self):
        self.baseline.write_text(
            json.dumps(
                [
                    "notice-cu",
                    {"id": "notice-2", "title": "Đã có", "time": "2026-10-01T00:00:00+07:00"},
                    {"id": "notification-count", "kind": "badge", "count": 1},
                ]
            ),
            encoding="utf-8",
        )
        page = zk_page(2, [("notice-cu", "Cũ"), ("notice-2", "Đã có"), ("notice-moi", "Mới")])
        fetch = FetchStub(bell.FetchResult(200, PAGE, page))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10, msg=err)
        ids = [item["id"] for item in json.loads(out)["moi"]]
        self.assertEqual(ids, ["notice-moi"])

        self._write_baseline(
            [{"id": "notification-count", "kind": "badge", "count": 1}],
            tip="2026-10-30T12:00:00+07:00",
            alerted=[],
        )
        old = """<div class="notification-bell"></div>
<div class="notification-count"><span>1</span></div>
<div class="notification-item" id="old-1">
  <span class="notification-title">Văn bản đã qua mốc</span>
  <span class="notification-time">01/10/2026 08:00</span>
</div>
<div class="notification-item" id="new-1">
  <span class="notification-title">Văn bản sau mốc</span>
  <span class="notification-time">30/10/2026 18:00</span>
</div>
"""
        fetch = FetchStub(bell.FetchResult(200, PAGE, old))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10, msg=err)
        ids = [item["id"] for item in json.loads(out)["moi"]]
        self.assertEqual(ids, ["new-1"])
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["tip"], "2026-10-30T18:00:00+07:00")

    def test_unicode_escaped_group_label(self):
        label = "".join(ch if ord(ch) < 128 else "\\u%04x" % ord(ch) for ch in "Sắp đến hạn")
        body = "<div class='notification-bell'></div>value:'%s',value:'4'" % label
        found = bell.parse_group_counts(body)
        self.assertEqual(found, {"sapDenHan": 4})

    def test_seed_stays_quiet_even_when_counts_are_positive(self):
        env = dict(self.env)
        env["QLVB_SEED"] = "1"
        fetch = FetchStub(bell.FetchResult(200, PAGE, RICH_PAGE))
        code, out, err = bell.execute(env, fetch)
        self.assertEqual(code, 0, msg=err)
        payload = json.loads(out)
        self.assertEqual(payload["status"], "ok")
        self.assertEqual(payload["moi"], [])
        self.assertGreater(payload["counts"]["choXuLy"], 0)
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["version"], 1)
        self.assertEqual(saved["tip"], "2026-10-30T15:40:00+07:00")
        self.assertTrue(saved["alerted"])

    def test_count_drop_is_quiet_but_updates_baseline(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 5}])
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(2)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        self.assertEqual(json.loads(out)["status"], "ok")
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["items"][0]["count"], 2)

    def test_seed_writes_baseline_and_stays_silent(self):
        env = dict(self.env)
        env["QLVB_SEED"] = "1"
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(4)))
        code, out, err = bell.execute(env, fetch)
        self.assertEqual(code, 0)
        self.assertEqual(err, "")
        self.assertEqual(json.loads(out)["status"], "ok")
        self.assertEqual(json.loads(out)["moi"], [])
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["version"], 1)
        self.assertEqual(saved["items"][0]["count"], 4)

    def test_missing_bell_marker_exit_30(self):
        fetch = FetchStub(bell.FetchResult(200, PAGE, "<html><title>trang khác</title></html>"))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 30)
        self.assertEqual(out, "")
        self.assertIn("không thấy chuông", err)
        self.assertFalse(self.baseline.exists())
        self.assertEqual(len(fetch.calls), 1)

    def test_corrupt_baseline_is_not_overwritten(self):
        self.baseline.write_text("{bad", encoding="utf-8")
        before = self.baseline.read_bytes()
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(1)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 30)
        self.assertEqual(out, "")
        self.assertIn("baseline", err)
        self.assertEqual(self.baseline.read_bytes(), before)
        self.assertEqual(fetch.calls, [])

    def test_refuse_chrome_profile_and_sqlite(self):
        chrome = self.root / "google-chrome" / "Default" / "Cookies"
        chrome.parent.mkdir(parents=True)
        chrome.write_text(f"JSESSIONID={SECRET}\n", encoding="utf-8")
        env = dict(self.env)
        env["QLVB_COOKIE_FILE"] = str(chrome)
        code, _out, err = bell.execute(env, FetchStub())
        self.assertEqual(code, 30)
        self.assertIn("profile", err)

        sqlite_path = self.root / "jar.cookie"
        sqlite_path.write_bytes(b"SQLite format 3\x00rest")
        os.chmod(sqlite_path, 0o600)
        env["QLVB_COOKIE_FILE"] = str(sqlite_path)
        code, _out, err = bell.execute(env, FetchStub())
        self.assertEqual(code, 30)
        self.assertIn("SQLite", err)

    def test_loose_cookie_mode_refuses_without_leaking_secret(self):
        loose = self.root / "loose.cookie"
        leaked = "LOOSECOOKIEVALUE99"
        _write_cookie(loose, f"JSESSIONID={leaked}\n", mode=0o644)
        env = dict(self.env)
        env["QLVB_COOKIE_FILE"] = str(loose)
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(0)))
        code, out, err = bell.execute(env, fetch)
        self.assertEqual(code, 30)
        self.assertIn("0600", err)
        self.assertNotIn(leaked, out)
        self.assertNotIn(leaked, err)
        self.assertEqual(fetch.calls, [])

        owner_only = self.root / "owner.cookie"
        _write_cookie(owner_only, f"JSESSIONID={SECRET}\n", mode=0o400)
        env["QLVB_COOKIE_FILE"] = str(owner_only)
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 0}])
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(0)))
        code, _out, err = bell.execute(env, fetch)
        self.assertEqual(code, 0, msg=err)

    def test_cookie_inside_repo_is_refused(self):
        inside = HERE / "_tmp_test.cookie"
        leaked = "REPOCOOKIEVALUE99"
        try:
            _write_cookie(inside, f"JSESSIONID={leaked}\n")
            env = dict(self.env)
            env["QLVB_COOKIE_FILE"] = str(inside)
            fetch = FetchStub()
            code, out, err = bell.execute(env, fetch)
            self.assertEqual(code, 30)
            self.assertIn("ngoài repo", err)
            self.assertNotIn(leaked, out + err)
            self.assertEqual(fetch.calls, [])
        finally:
            inside.unlink(missing_ok=True)

    def test_expired_cookie_exits_3_without_fetch(self):
        past = str(int(time.time()) - 3600)
        future = str(int(time.time()) + 86400)
        jar = self.root / "expired.txt"
        leaked = "expired-secret-value"
        _write_cookie(
            jar,
            "# Netscape HTTP Cookie File\n"
            f".example.test\tTRUE\t/\tTRUE\t{past}\tJSESSIONID\t{leaked}\n",
        )
        env = dict(self.env)
        env["QLVB_COOKIE_FILE"] = str(jar)
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(1)))
        code, out, err = bell.execute(env, fetch)
        self.assertEqual(code, 3)
        self.assertEqual(json.loads(out), {"status": "session_expired"})
        self.assertEqual(fetch.calls, [])
        self.assertNotIn(leaked, out + err)
        self.assertFalse(self.baseline.exists())

        _write_cookie(
            jar,
            "# Netscape HTTP Cookie File\n"
            f".example.test\tTRUE\t/\tTRUE\t{future}\tJSESSIONID\tfuture-jar\n",
        )
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 0}])
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(0)))
        code, _out, err = bell.execute(env, fetch)
        self.assertEqual(code, 0, msg=err)
        self.assertEqual(fetch.calls[0][1], "JSESSIONID=future-jar")

        session = self.root / "session-jar.txt"
        _write_cookie(
            session,
            "# Netscape HTTP Cookie File\n"
            ".example.test\tTRUE\t/\tTRUE\t0\tJSESSIONID\tfake-jar\n",
        )
        self.assertEqual(bell.load_cookie_header(session), "JSESSIONID=fake-jar")

    def test_json_expires_and_password_rejection(self):
        secret = self.root / "bad.json"
        _write_cookie(secret, json.dumps({"cookie": "a=b", "password": "nope"}))
        env = dict(self.env)
        env["QLVB_COOKIE_FILE"] = str(secret)
        code, _out, err = bell.execute(env, FetchStub())
        self.assertEqual(code, 30)
        self.assertIn("mật khẩu", err)

        expired = self.root / "expired.json"
        leaked = "expired-json-value"
        _write_cookie(
            expired,
            json.dumps({"cookie": f"JSESSIONID={leaked}", "expires": "2000-01-01T00:00:00+07:00"}),
        )
        env["QLVB_COOKIE_FILE"] = str(expired)
        fetch = FetchStub()
        code, out, err = bell.execute(env, fetch)
        self.assertEqual(code, 3)
        self.assertNotIn(leaked, out + err)
        self.assertEqual(fetch.calls, [])

        ok = self.root / "ok.json"
        _write_cookie(ok, json.dumps({"cookie": "JSESSIONID=from-json"}))
        env["QLVB_COOKIE_FILE"] = str(ok)
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(0)))
        code, out, err = bell.execute(env, fetch)
        self.assertEqual((code, err), (0, ""))
        self.assertEqual(json.loads(out)["status"], "ok")
        self.assertEqual(fetch.calls[0][1], "JSESSIONID=from-json")

    def test_page_body_cannot_echo_cookie_value(self):
        body = zk_page(1, [("notice-x", SECRET)])
        fetch = FetchStub(bell.FetchResult(200, PAGE, body))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10)
        self.assertNotIn(SECRET, out)
        self.assertNotIn(SECRET, err)
        self.assertIn("[redacted]", out)

    def test_netscape_cookie_file(self):
        jar = self.root / "jar.txt"
        _write_cookie(
            jar,
            "# Netscape HTTP Cookie File\n"
            "#HttpOnly_.example.test\tTRUE\t/\tTRUE\t0\tJSESSIONID\tfake-jar\n",
        )
        self.assertEqual(bell.load_cookie_header(jar), "JSESSIONID=fake-jar")

    def test_http_url_rejected_and_headers_are_get_only(self):
        env = dict(self.env)
        env["QLVB_PAGE_URL"] = "http://qlvb.example.test/pages/main.zul"
        code, _out, err = bell.execute(env, FetchStub())
        self.assertEqual(code, 30)
        self.assertIn("https", err)
        headers = bell.build_headers("JSESSIONID=abc")
        self.assertEqual(headers["Cookie"], "JSESSIONID=abc")
        self.assertNotIn("Authorization", headers)

    def test_redirect_handler_stops_at_login_and_refuses_http(self):
        handler = bell._SafeRedirect()
        with self.assertRaises(bell._LoginHop):
            handler.redirect_request(None, None, 302, "Found", {}, "https://qlvb.example.test/a/login.zul")
        with self.assertRaises(bell.NetworkError):
            handler.redirect_request(None, None, 302, "Found", {}, "http://qlvb.example.test/a/main.zul")

    def test_source_has_no_login_post_or_government_host(self):
        source = (HERE / "check_bell.py").read_text(encoding="utf-8")
        self.assertNotIn("khanhhoa.gov.vn", source)
        self.assertNotIn('method="POST"', source)
        self.assertNotIn("method='POST'", source)
        self.assertNotIn("data=", source)
        self.assertIn('method="GET"', source)
        self.assertIn("session_expired", source)

    def test_readme_documents_contract(self):
        readme = (HERE / "README.md").read_text(encoding="utf-8")
        for token in (
            "session_expired",
            "forbidden",
            "0600",
            "choXuLy",
            "sapDenHan",
            "quaHan",
            "nhanDeBiet",
            "QLVB_COOKIE_FILE",
            "--cookie-file",
            "consecutiveFailures",
        ):
            self.assertIn(token, readme)
        self.assertNotIn("khanhhoa.gov.vn", readme)

    def test_example_baseline_accepts_string_and_object(self):
        state = bell.load_state(HERE / "baseline.example.json")
        self.assertEqual(state.consecutive_failures, 0)
        self.assertTrue(any(isinstance(item, str) for item in state.alerted))
        self.assertTrue(any(isinstance(item, dict) for item in state.alerted))
        self.assertEqual(state.items[0]["count"], 2)

    def test_subprocess_exit_codes_and_cookie_arg(self):
        cases = [
            ("new", {"status": 200, "finalUrl": PAGE, "body": zk_page(2)}, 10),
            ("same", {"status": 200, "finalUrl": PAGE, "body": zk_page(2)}, 0),
            ("login", {"status": 200, "finalUrl": PAGE, "body": LOGIN_BODY}, 3),
            ("denied", {"status": 403, "finalUrl": PAGE, "body": "no"}, 4),
            ("net", {"error": "timeout"}, 4),
        ]
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 2}])
        before = self.baseline.read_bytes()
        for name, payload, expect in cases:
            if name == "new":
                self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 0}])
            else:
                self.baseline.write_bytes(before)
            fixture = self.root / f"{name}.json"
            fixture.write_text(json.dumps(payload), encoding="utf-8")
            env = os.environ.copy()
            env.update(self.env)
            env["QLVB_ALLOW_FIXTURE"] = "1"
            env["QLVB_HTTP_FIXTURE"] = str(fixture)
            env.pop("QLVB_SEED", None)
            proc = subprocess.run(
                [sys.executable, str(HERE / "check_bell.py")],
                env=env,
                capture_output=True,
                text=True,
                check=False,
            )
            self.assertEqual(proc.returncode, expect, msg=f"{name}: {proc.stderr} {proc.stdout}")
            self.assertNotIn(SECRET, proc.stdout + proc.stderr)
            body = json.loads(proc.stdout)
            if expect == 10:
                self.assertEqual(body["status"], "new")
            elif expect == 0:
                self.assertEqual(body["status"], "ok")
            elif expect == 3:
                self.assertEqual(body, {"status": "session_expired"})
                self.assertEqual(self.baseline.read_bytes(), before)
            elif name == "denied":
                self.assertEqual(body["status"], "forbidden")
                saved = json.loads(self.baseline.read_text(encoding="utf-8"))
                self.assertEqual(saved["items"][0]["count"], 2)
            else:
                self.assertEqual(body["status"], "network")
                self.assertEqual(body["reason"], "timeout")

        fixture = self.root / "cli.json"
        fixture.write_text(
            json.dumps({"status": 200, "finalUrl": PAGE, "body": zk_page(2)}),
            encoding="utf-8",
        )
        self.baseline.write_bytes(before)
        env = os.environ.copy()
        env.update(self.env)
        env.pop("QLVB_COOKIE_FILE")
        env["QLVB_ALLOW_FIXTURE"] = "1"
        env["QLVB_HTTP_FIXTURE"] = str(fixture)
        proc = subprocess.run(
            [sys.executable, str(HERE / "check_bell.py"), "--cookie-file", str(self.cookie)],
            env=env,
            capture_output=True,
            text=True,
            check=False,
        )
        self.assertEqual(proc.returncode, 0, msg=proc.stderr)
        self.assertEqual(json.loads(proc.stdout)["status"], "ok")
        self.assertNotIn(SECRET, proc.stdout + proc.stderr)


if __name__ == "__main__":
    unittest.main()
