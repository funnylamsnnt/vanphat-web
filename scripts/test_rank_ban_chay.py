#!/usr/bin/env python3
"""Xếp hạng bán chạy: cửa sổ 28 ngày, hạng phần trăm, bỏ mẫu và giá 0."""
from __future__ import annotations

import json
import sys
import tempfile
import unittest
from datetime import date
from decimal import Decimal
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from generate_catalog_pages import card_html  # noqa: E402
from rank_ban_chay import (  # noqa: E402
    PUBLIC_ITEM_KEYS,
    is_sample_file,
    itemlist_markup,
    should_write_home,
    iter_source_files,
    load_lines,
    outside_repo,
    parse_as_of,
    parse_row,
    percent_ranks,
    public_payload,
    rank_lines,
    refuse_kiot_bill,
    window_for,
)
from sync_products_from_excel import (  # noqa: E402
    drop_internal_products,
    exclude_group_folds,
    excluded_codes_from_state,
)

AS_OF = date(2026, 10, 31)


def public_top_errors(payload: dict, index: str, root: Path) -> list[str]:
    """Schema, quyền riêng tư, và trang chủ khớp JSON. Không khóa mã của một tuần."""
    errors = []
    if set(payload) != {"items"}:
        errors.append("chỉ được có khóa items")
    items = payload.get("items")
    if not isinstance(items, list) or not 1 <= len(items) <= 10:
        errors.append("cần từ 1 đến 10 mã")
        return errors
    seen = set()
    for index_no, item in enumerate(items, start=1):
        if not isinstance(item, dict) or set(item) != set(PUBLIC_ITEM_KEYS):
            errors.append(f"hạng {index_no} sai khóa")
            continue
        if item.get("hang") != index_no:
            errors.append(f"hạng {index_no} không liên tục")
        ma = str(item.get("ma") or "")
        if not ma.startswith("VP") or not ma[2:].isdigit() or ma in seen:
            errors.append(f"mã không hợp lệ: {ma}")
        seen.add(ma)
        if not str(item.get("ten") or "").strip():
            errors.append(f"{ma} thiếu tên")
        gia = item.get("gia")
        if not isinstance(gia, int) or gia <= 0:
            errors.append(f"{ma} giá không dương")
        href = str(item.get("href") or "")
        if not href.startswith("san-pham/") or not href.endswith(".html"):
            errors.append(f"{ma} link không phải trang sản phẩm")
        elif not (root / href).is_file():
            errors.append(f"{ma} thiếu file {href}")
        if href and f"https://vanphatcompany.vn/{href}" not in index:
            errors.append(f"{ma} thiếu URL schema")
    blob = json.dumps(payload, ensure_ascii=False)
    for banned in ("soLuong", "doanhThu", "diem", "so_hd", "so_luong", "doanh_thu", "thanh_tien"):
        if banned in blob:
            errors.append(f"lộ {banned}")
    if should_write_home(index, payload):
        errors.append("trang chủ lệch mã, tên, link hoặc giá")
    return errors


def line(ma, qty, price, ngay="2026-10-20", so_hd="1", thanh=None):
    amount = price * qty if thanh is None else thanh
    return {
        "so_hd": so_hd,
        "ngay": date.fromisoformat(ngay),
        "ma": ma,
        "so_luong": Decimal(qty),
        "don_gia": price,
        "thanh_tien": amount,
        "source": "test",
    }


class RankTests(unittest.TestCase):
    def test_window_is_28_days_inclusive(self):
        start, end = window_for(AS_OF)
        self.assertEqual(start, date(2026, 10, 4))
        self.assertEqual(end, AS_OF)
        self.assertEqual((end - start).days + 1, 28)

    def test_percent_ranks_average_ties(self):
        ranks = percent_ranks(
            {
                "a": Decimal(10),
                "b": Decimal(20),
                "c": Decimal(20),
                "d": Decimal(40),
            }
        )
        self.assertEqual(ranks["a"], Decimal(0))
        self.assertEqual(ranks["b"], Decimal("0.5"))
        self.assertEqual(ranks["c"], Decimal("0.5"))
        self.assertEqual(ranks["d"], Decimal(1))

    def test_single_code_is_full_rank(self):
        self.assertEqual(percent_ranks({"a": Decimal(3)}), {"a": Decimal(1)})

    def test_tied_revenue_uses_quantity_rank_not_raw_gap(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._page(root, "san-pham/a.html")
            self._page(root, "san-pham/b.html")
            ranked = rank_lines(
                [
                    line("VP1", 1000, 10, thanh=10000),
                    line("VP2", 2, 5000, thanh=10000),
                ],
                {
                    "VP1": {"ma": "VP1", "ten": "Nhiều cái", "dvt": "Cái", "gia": 10, "nhom": "Giấy"},
                    "VP2": {"ma": "VP2", "ten": "Ít ram", "dvt": "Ram", "gia": 5000, "nhom": "Giấy"},
                },
                exclude_group_folds({"excludeGroups": ["Không đưa lên web"]}),
                {"product": {"VP1": "san-pham/a.html", "VP2": "san-pham/b.html"}, "category": {}},
                root,
                AS_OF,
            )
        # Cùng doanh thu: lệch 1000 cái với 2 ram chỉ còn 75 và 25, không phải 500 lần.
        self.assertEqual([item["ma"] for item in ranked["items"]], ["VP1", "VP2"])
        self.assertEqual(ranked["items"][0]["diem"], 75.0)
        self.assertEqual(ranked["items"][1]["diem"], 25.0)

    def test_revenue_tie_break_when_scores_match(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._page(root, "san-pham/a.html")
            self._page(root, "san-pham/b.html")
            ranked = rank_lines(
                [
                    line("VP1", 100, 10, thanh=1000),
                    line("VP2", 1, 5000, thanh=5000),
                ],
                {
                    "VP1": {"ma": "VP1", "ten": "A", "dvt": "Cái", "gia": 10, "nhom": "Giấy"},
                    "VP2": {"ma": "VP2", "ten": "B", "dvt": "Ram", "gia": 5000, "nhom": "Giấy"},
                },
                exclude_group_folds({}),
                {"product": {"VP1": "san-pham/a.html", "VP2": "san-pham/b.html"}, "category": {}},
                root,
                AS_OF,
            )
        self.assertEqual(ranked["items"][0]["ma"], "VP2")
        self.assertEqual(ranked["items"][0]["diem"], 50.0)

    def test_drops_zero_price_offweb_and_excluded_group(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._page(root, "san-pham/a.html")
            ranked = rank_lines(
                [
                    line("VP1", 2, 1000),
                    line("VP1", 1, 0, thanh=0),
                    line("VP0", 9, 0, thanh=0),
                    line("VPX", 50, 1000),
                    line("VPZ", 4, 1000),
                    line("OLD", 8, 1000, ngay="2026-10-03"),
                    line("EDGE", 3, 1000, ngay="2026-10-04"),
                ],
                {
                    "VP1": {"ma": "VP1", "ten": "Có web", "dvt": "Cái", "gia": 1000, "nhom": "Giấy"},
                    "VP0": {"ma": "VP0", "ten": "Giá 0", "dvt": "Cái", "gia": 0, "nhom": "Giấy"},
                    "VPZ": {
                        "ma": "VPZ",
                        "ten": "Nội bộ",
                        "dvt": "Hộp",
                        "gia": 1000,
                        "nhom": "Không đưa lên web (nội bộ)",
                    },
                    "EDGE": {"ma": "EDGE", "ten": "Mép", "dvt": "Ram", "gia": 1000, "nhom": "Giấy"},
                },
                exclude_group_folds({"excludeGroups": ["Không đưa lên web"]}),
                {
                    "product": {
                        "VP1": "san-pham/a.html",
                        "VP0": "san-pham/a.html",
                        "VPZ": "san-pham/a.html",
                        "EDGE": "san-pham/missing.html",
                    },
                    "category": {},
                },
                root,
                AS_OF,
            )
        codes = [item["ma"] for item in ranked["items"]]
        self.assertEqual(codes, ["VP1"])
        self.assertEqual(ranked["dropped_price"], 2)
        self.assertNotIn("soLuong", ranked["items"][0])
        self.assertIn("VPX", ranked["skipped_web"])
        self.assertIn("EDGE", ranked["skipped_web"])
        self.assertIn("VPZ", ranked["skipped_group"])
        self.assertEqual(ranked["outside"], 1)
        self.assertIn("VP0", ranked["zero_only"])

    def test_internal_code_dropped_before_public_write(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            self._page(root, "san-pham/a.html")
            self._page(root, "san-pham/b.html")
            ranked = rank_lines(
                [line("VP1", 2, 1000), line("VP415", 9, 5000)],
                {
                    "VP1": {"ma": "VP1", "ten": "Có web", "dvt": "Cái", "gia": 1000, "nhom": "Giấy"},
                    "VP415": {
                        "ma": "VP415",
                        "ten": "Nội bộ",
                        "dvt": "Cái",
                        "gia": 5000,
                        "nhom": "Giấy",
                        "anh": "https://example.test/vp415.jpg",
                    },
                },
                exclude_group_folds({}),
                {"product": {"VP1": "san-pham/a.html", "VP415": "san-pham/b.html"}, "category": {}},
                root,
                AS_OF,
                blocked_codes={"vp415"},
            )
            self.assertEqual([item["ma"] for item in ranked["items"]], ["VP1"])
            self.assertIn("VP415", ranked["skipped_group"])
            payload = public_payload(ranked, {"VP415"})
            blob = json.dumps(payload)
            self.assertNotIn("VP415", blob)
            self.assertNotIn("5000", blob)
            kept = drop_internal_products(
                [
                    {"ma": "VP415", "nhom": "Giấy", "gia": 5000, "anh": "vp415.jpg"},
                    {"ma": "VP1", "nhom": "Giấy", "gia": 1000, "anh": "a.jpg"},
                ],
                {"VP415"},
                exclude_group_folds({}),
            )
            self.assertEqual([item["ma"] for item in kept], ["VP1"])
            state = root / "scripts" / "sync_state.json"
            state.parent.mkdir(parents=True)
            state.write_text(
                json.dumps({"lastSyncResult": {"excluded_nhom": {"Không đưa lên web": ["VP571"]}}}),
                encoding="utf-8",
            )
            self.assertEqual(excluded_codes_from_state(state), {"VP571"})

    def test_sample_files_are_ignored(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            (base / "mau").mkdir()
            (base / "mau" / "hoa-don-gtgt-mau.csv").write_text(
                "# DỮ LIỆU MẪU — không dùng để xếp hạng\n"
                "so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien\n"
                "MAU-1,2026-10-20,VP1,9999,10,99990\n",
                encoding="utf-8",
            )
            (base / "ghi-chu.csv").write_text(
                "# DỮ LIỆU MẪU — không dùng để xếp hạng\n"
                "so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien\n"
                "9,2026-10-20,VP9,5,10,50\n",
                encoding="utf-8",
            )
            (base / "mau-true.json").write_text(
                json.dumps({"mau": True, "dong": []}),
                encoding="utf-8",
            )
            real = base / "hoadon_lines_x.csv"
            real.write_text(
                "so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien\n"
                "1,2026-10-31,VP1,2,10,20\n"
                "1,2026-10-31,VP1,1,10,10\n",
                encoding="utf-8",
            )
            self.assertEqual(iter_source_files(base), [real])
            lines, dups = load_lines([real])
            self.assertEqual(dups, 0)
            self.assertEqual(len(lines), 2)
            self.assertEqual(sum(item["so_luong"] for item in lines), Decimal(3))

    def test_duplicate_invoice_across_files_counts_once(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            first = base / "a.csv"
            second = base / "b.csv"
            body = "so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien\n1,2026-10-20,VP1,4,10,40\n"
            first.write_text(body, encoding="utf-8")
            second.write_text(
                "so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien\n"
                "1,2026-10-20,VP1,9,10,90\n"
                "2,2026-10-20,VP2,1,10,10\n",
                encoding="utf-8",
            )
            lines, dups = load_lines(iter_source_files(base))
            self.assertEqual(dups, 1)
            self.assertEqual(sorted(item["ma"] for item in lines), ["VP1", "VP2"])
            self.assertEqual(next(item["so_luong"] for item in lines if item["ma"] == "VP1"), Decimal(4))

    def test_bad_date_raises(self):
        with self.assertRaises(ValueError):
            parse_row(
                {
                    "so_hd": "1",
                    "ngay": "31/10/2026",
                    "ma_vp": "VP1",
                    "so_luong": "1",
                    "don_gia": "10",
                    "thanh_tien": "10",
                },
                Path("x.csv"),
                2,
            )

    def test_as_of_rejects_bad_input(self):
        with self.assertRaises(SystemExit):
            parse_as_of("31/10/2026")

    def test_public_payload_drops_sales_figures(self):
        ranked = {
            "items": [
                {
                    "hang": 1,
                    "ma": "VP1",
                    "ten": "A",
                    "href": "san-pham/a.html",
                    "gia": 1000,
                    "diem": 50.0,
                    "soLuong": 9,
                    "doanhThu": 9000,
                }
            ]
        }
        payload = public_payload(ranked)
        self.assertEqual(set(payload), {"items"})
        self.assertEqual(set(payload["items"][0]), set(PUBLIC_ITEM_KEYS))
        blob = json.dumps(payload)
        for banned in ("soLuong", "doanhThu", "diem", "so_hd", "so_luong", "doanh_thu"):
            self.assertNotIn(banned, blob)

    def test_refuses_csv_inside_repo(self):
        sample = ROOT / "data" / "hoa-don-gtgt" / "mau" / "hoa-don-gtgt-mau.csv"
        with self.assertRaises(SystemExit):
            outside_repo(sample, ROOT)

    def test_published_json_is_public_top_10(self):
        disk = json.loads((ROOT / "data" / "ban-chay.json").read_text(encoding="utf-8"))
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        self.assertEqual(public_top_errors(disk, index, ROOT), [])
        block = index.split("<!-- vp-ban-chay -->", 1)[1].split("<!-- /vp-ban-chay -->", 1)[0]
        self.assertIn("Bán chạy 4 tuần qua", block)
        self.assertIn("Hot · Bán chạy", block)
        self.assertGreaterEqual(block.count('loading="eager"'), 4)
        self.assertNotIn("Hóa đơn", block)
        self.assertNotIn("GTGT", block)
        self.assertNotIn("đã bán", block.lower())
        self.assertIn('id="ban-chay-ld"', index)
        self.assertIn('"@type": "ItemList"', index)
        sample = ROOT / "data" / "hoa-don-gtgt" / "mau" / "hoa-don-gtgt-mau.csv"
        self.assertTrue(is_sample_file(sample))
        self.assertIn("DỮ LIỆU MẪU", sample.read_text(encoding="utf-8"))
        self.assertFalse((ROOT / ".github" / "workflows" / "ban-chay.yml").is_file())
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("BAN_CHAY_CSV", readme)
        self.assertIn("ngoài repo", readme)
        self.assertIn("máy ngoài", readme)
        self.assertIn("thứ Hai", readme)
        self.assertNotIn("cron:", readme.split("## Bán chạy", 1)[-1].split("## ", 1)[0])
        self.assertIn("product-hot-short", block)
        self.assertIn('class="product-hot-short" title="Hot · Bán chạy"', block)
        self.assertNotIn('class="product-hot" aria-label="Hot · Bán chạy" title=', block)
        self.assertNotIn("fetchpriority", block)

    def test_shape_accepts_a_different_top_10(self):
        with tempfile.TemporaryDirectory() as tmp:
            root = Path(tmp)
            href = "san-pham/vp999-hang-moi.html"
            self._page(root, href)
            product = {"ma": "VP999", "ten": "Hàng mới", "gia": 15000, "dvt": "Cái", "anh": "", "nhom": "Giấy"}
            card = card_html(product, href, "san-pham/nhom-giay.html", "VPP", hot=True, image_loading="eager")
            page = (
                "<!-- vp-ban-chay -->\n"
                + card
                + "\n<!-- /vp-ban-chay -->\n"
                + itemlist_markup([{"hang": 1, "ma": "VP999", "ten": "Hàng mới", "href": href}])
            )
            payload = {
                "items": [{"hang": 1, "ma": "VP999", "ten": "Hàng mới", "href": href, "gia": 15000}]
            }
            self.assertEqual(public_top_errors(payload, page, root), [])
            self.assertNotEqual(payload["items"][0]["ma"], "VP206")
            drifted = {"items": [dict(payload["items"][0], gia=16000)]}
            self.assertTrue(public_top_errors(drifted, page, root))

    def test_kiot_bill_is_refused(self):
        with tempfile.TemporaryDirectory() as tmp:
            base = Path(tmp)
            kiot = base / "bills_thang10.json"
            kiot.write_text(
                json.dumps([{"code": "VP1", "quantity": 10, "price": 1000}]),
                encoding="utf-8",
            )
            with self.assertRaises(ValueError) as caught:
                load_lines([kiot])
            self.assertIn("KiotViet", str(caught.exception))
            nested = base / "kiotviet" / "lines.csv"
            nested.parent.mkdir()
            nested.write_text(
                "so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien\n1,2026-10-20,VP1,1,10,10\n",
                encoding="utf-8",
            )
            with self.assertRaises(ValueError):
                refuse_kiot_bill(nested)
            gtgt = base / "hoadon_lines_202611.csv"
            gtgt.write_text(
                "so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien\n1,2026-10-20,VP1,2,10,20\n",
                encoding="utf-8",
            )
            lines, dups = load_lines([gtgt])
            self.assertEqual(dups, 0)
            self.assertEqual(lines[0]["ma"], "VP1")
            bare = base / "bill-khac.csv"
            bare.write_text("code,quantity,price\nVP1,1,10\n", encoding="utf-8")
            with self.assertRaises(ValueError) as missing:
                load_lines([bare])
            self.assertIn("thiếu cột", str(missing.exception))

    def test_home_rewrite_when_price_name_or_link_differs(self):
        def card(ma, ten, gia, href, shown=None):
            text = shown if shown is not None else f"{gia:,}".replace(",", ".") + " ₫"
            return (
                f'<article class="product-card" data-ma="{ma}" data-ten="{ten}" data-gia="{gia}">'
                f'<h3 class="product-name"><a href="{href}">{ten}</a></h3>'
                f'<div class="product-price"><span class="price-label">Giá</span> {text}</div>'
                f"</article>"
            )

        text = (
            "<!-- vp-ban-chay -->\n"
            + card("VP1", "Bút", 1000, "san-pham/a.html")
            + card("VP2", "Giấy", 2000, "san-pham/b.html")
            + "\n<!-- /vp-ban-chay -->"
        )
        same = {
            "items": [
                {"ma": "vp1", "ten": "Bút", "gia": 1000, "href": "san-pham/a.html"},
                {"ma": "VP2", "ten": "Giấy", "gia": 2000, "href": "san-pham/b.html"},
            ]
        }
        self.assertFalse(should_write_home(text, same))
        pricey = {"items": [dict(same["items"][0], gia=1500), same["items"][1]]}
        renamed = {"items": [dict(same["items"][0], ten="Bút mới"), same["items"][1]]}
        relinked = {"items": [dict(same["items"][0], href="san-pham/c.html"), same["items"][1]]}
        reordered = {"items": [same["items"][1], same["items"][0]]}
        self.assertTrue(should_write_home(text, pricey))
        self.assertTrue(should_write_home(text, renamed))
        self.assertTrue(should_write_home(text, relinked))
        self.assertTrue(should_write_home(text, reordered))
        shown_wrong = (
            "<!-- vp-ban-chay -->\n"
            + card("VP1", "Bút", 1000, "san-pham/a.html", shown="9.999 ₫")
            + card("VP2", "Giấy", 2000, "san-pham/b.html")
            + "\n<!-- /vp-ban-chay -->"
        )
        self.assertTrue(should_write_home(shown_wrong, same))
        self.assertTrue(should_write_home("<html></html>", same))

    def test_hot_card_has_no_fetchpriority(self):
        html = card_html(
            {"ma": "VP1", "ten": "A", "gia": 1000, "dvt": "Cái", "anh": "", "nhom": "Giấy"},
            "san-pham/a.html",
            "san-pham/nhom-giay.html",
            "VPP",
            hot=True,
            image_loading="eager",
        )
        self.assertIn('loading="eager"', html)
        self.assertIn("product-hot-short", html)
        self.assertIn("Hot · Bán chạy", html)
        self.assertIn('class="product-hot-short" title="Hot · Bán chạy"', html)
        self.assertNotIn('class="product-hot" aria-label="Hot · Bán chạy" title=', html)
        self.assertNotIn("fetchpriority", html)

    def _page(self, root: Path, rel: str) -> None:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("<html></html>", encoding="utf-8")


SAMPLE_NOTE = "DỮ LIỆU MẪU"


if __name__ == "__main__":
    unittest.main()
