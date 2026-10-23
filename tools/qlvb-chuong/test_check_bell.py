#!/usr/bin/env python3
"""Mock HTTP cho chuông QLVB: có mới, không mới, hết phiên, 403."""

from __future__ import annotations

import importlib.util
import json
import os
import subprocess
import sys
import tempfile
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


class BellTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.root = Path(self.tmp.name)
        self.baseline = self.root / "baseline.json"
        self.cookie = self.root / "session.cookie"
        self.cookie.write_text("JSESSIONID=fake-session-value\n", encoding="utf-8")
        self.env = {
            "QLVB_COOKIE_FILE": str(self.cookie),
            "QLVB_PAGE_URL": PAGE,
            "QLVB_BASELINE_FILE": str(self.baseline),
            "QLVB_TIMEOUT": "5",
        }

    def tearDown(self):
        self.tmp.cleanup()

    def _write_baseline(self, items):
        self.baseline.write_text(
            json.dumps({"version": 1, "updatedAt": "2026-10-01T00:00:00+07:00", "items": items}, ensure_ascii=False)
            + "\n",
            encoding="utf-8",
        )

    def test_new_badge_prints_json_and_exit_10(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 1}])
        before = self.baseline.read_bytes()
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(4)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10)
        self.assertEqual(err, "")
        payload = json.loads(out)
        self.assertEqual(
            payload,
            {"moi": [{"id": "notification-count", "kind": "badge", "count": 4, "truoc": 1, "them": 3}]},
        )
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["items"][0]["count"], 4)
        self.assertNotEqual(self.baseline.read_bytes(), before)
        self.assertEqual(fetch.calls[0][1], "JSESSIONID=fake-session-value")
        self.assertTrue(fetch.calls[0][0].startswith("https://"))

    def test_unchanged_is_silent_exit_0_and_keeps_baseline(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 4}])
        before = self.baseline.read_bytes()
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(4)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual((code, out, err), (0, "", ""))
        self.assertEqual(self.baseline.read_bytes(), before)

    def test_login_zul_body_exit_20_does_not_touch_baseline(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 1}])
        before = self.baseline.read_bytes()
        fetch = FetchStub(bell.FetchResult(200, PAGE, LOGIN_BODY))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 20)
        self.assertEqual(out, "")
        self.assertIn("hết phiên", err)
        self.assertEqual(self.baseline.read_bytes(), before)

    def test_login_final_url_exit_20(self):
        fetch = FetchStub(bell.FetchResult(200, LOGIN, "<html>login</html>"))
        code, out, _err = bell.execute(self.env, fetch)
        self.assertEqual(code, 20)
        self.assertEqual(out, "")
        self.assertFalse(self.baseline.exists())

    def test_http_403_exit_30_does_not_touch_baseline(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 2}])
        before = self.baseline.read_bytes()
        body = zk_page(9)
        fetch = FetchStub(bell.FetchResult(403, PAGE, body))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 30)
        self.assertEqual(out, "")
        self.assertIn("403", err)
        self.assertEqual(self.baseline.read_bytes(), before)

    def test_network_error_exit_30_does_not_create_baseline(self):
        fetch = FetchStub(error=bell.NetworkError("lỗi mạng"))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual(code, 30)
        self.assertEqual(out, "")
        self.assertIn("lỗi mạng", err)
        self.assertFalse(self.baseline.exists())

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
        self.assertEqual(payload["moi"], [{"id": "notice-2", "kind": "notice", "title": "Phiếu trình mới"}])

    def test_html_badge_and_notice(self):
        fetch = FetchStub(bell.FetchResult(200, PAGE, HTML_PAGE))
        code, out, _err = bell.execute(self.env, fetch)
        self.assertEqual(code, 10)
        payload = json.loads(out)
        self.assertEqual(payload["moi"][0]["id"], "notice-9")
        self.assertEqual(payload["moi"][0]["title"], "Công văn 12")

    def test_count_drop_is_silent_but_updates_baseline(self):
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 5}])
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(2)))
        code, out, err = bell.execute(self.env, fetch)
        self.assertEqual((code, out, err), (0, "", ""))
        saved = json.loads(self.baseline.read_text(encoding="utf-8"))
        self.assertEqual(saved["items"][0]["count"], 2)

    def test_seed_writes_baseline_and_stays_silent(self):
        env = dict(self.env)
        env["QLVB_SEED"] = "1"
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(4)))
        code, out, err = bell.execute(env, fetch)
        self.assertEqual((code, out, err), (0, "", ""))
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

    def test_refuse_chrome_profile_and_sqlite(self):
        chrome = self.root / "google-chrome" / "Default" / "Cookies"
        chrome.parent.mkdir(parents=True)
        chrome.write_text("JSESSIONID=nope\n", encoding="utf-8")
        env = dict(self.env)
        env["QLVB_COOKIE_FILE"] = str(chrome)
        code, _out, err = bell.execute(env, FetchStub())
        self.assertEqual(code, 30)
        self.assertIn("profile", err)

        sqlite_path = self.root / "jar.cookie"
        sqlite_path.write_bytes(b"SQLite format 3\x00rest")
        env["QLVB_COOKIE_FILE"] = str(sqlite_path)
        code, _out, err = bell.execute(env, FetchStub())
        self.assertEqual(code, 30)
        self.assertIn("SQLite", err)

    def test_json_cookie_rejects_password_and_accepts_cookie_key(self):
        secret = self.root / "bad.json"
        secret.write_text(json.dumps({"cookie": "a=b", "password": "nope"}), encoding="utf-8")
        env = dict(self.env)
        env["QLVB_COOKIE_FILE"] = str(secret)
        code, _out, err = bell.execute(env, FetchStub())
        self.assertEqual(code, 30)
        self.assertIn("mật khẩu", err)

        ok = self.root / "ok.json"
        ok.write_text(json.dumps({"cookie": "JSESSIONID=from-json"}), encoding="utf-8")
        env["QLVB_COOKIE_FILE"] = str(ok)
        fetch = FetchStub(bell.FetchResult(200, PAGE, zk_page(0)))
        code, out, err = bell.execute(env, fetch)
        self.assertEqual((code, out, err), (0, "", ""))
        self.assertEqual(fetch.calls[0][1], "JSESSIONID=from-json")

    def test_netscape_cookie_file(self):
        jar = self.root / "jar.txt"
        jar.write_text(
            "# Netscape HTTP Cookie File\n"
            "#HttpOnly_.example.test\tTRUE\t/\tTRUE\t0\tJSESSIONID\tfake-jar\n",
            encoding="utf-8",
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

    def test_source_has_no_login_post_or_government_host(self):
        source = (HERE / "check_bell.py").read_text(encoding="utf-8")
        self.assertNotIn("khanhhoa.gov.vn", source)
        self.assertNotIn("method=\"POST\"", source)
        self.assertNotIn("method='POST'", source)
        self.assertNotIn("data=", source)
        self.assertIn('method="GET"', source)

    def test_subprocess_exit_codes(self):
        cases = [
            ("new", {"status": 200, "finalUrl": PAGE, "body": zk_page(2)}, 10, True),
            ("same", {"status": 200, "finalUrl": PAGE, "body": zk_page(2)}, 0, False),
            ("login", {"status": 200, "finalUrl": PAGE, "body": LOGIN_BODY}, 20, False),
            ("denied", {"status": 403, "finalUrl": PAGE, "body": "no"}, 30, False),
            ("net", {"error": "network"}, 30, False),
        ]
        self._write_baseline([{"id": "notification-count", "kind": "badge", "count": 2}])
        before = self.baseline.read_bytes()
        for name, payload, expect, _prints in cases:
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
            self.assertEqual(proc.returncode, expect, msg=f"{name}: {proc.stderr}")
            if expect == 10:
                self.assertIn('"moi"', proc.stdout)
            else:
                self.assertEqual(proc.stdout, "")
            if expect in {20, 30}:
                self.assertEqual(self.baseline.read_bytes(), before)


if __name__ == "__main__":
    unittest.main()
