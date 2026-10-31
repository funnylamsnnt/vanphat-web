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
    should_write_home,
    iter_source_files,
    load_lines,
    outside_repo,
    parse_as_of,
    parse_row,
    percent_ranks,
    public_payload,
    rank_lines,
    window_for,
)
from sync_products_from_excel import exclude_group_folds  # noqa: E402

AS_OF = date(2026, 10, 31)


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
        self.assertEqual(
            [item["ma"] for item in disk["items"]],
            ["VP206", "VP098", "VP327", "VP211", "VP337", "VP336", "VP160", "VP138", "VP087", "VP132"],
        )
        self.assertTrue(all(set(item) == set(PUBLIC_ITEM_KEYS) and item["gia"] > 0 for item in disk["items"]))
        index = (ROOT / "index.html").read_text(encoding="utf-8")
        block = index.split("<!-- vp-ban-chay -->", 1)[1].split("<!-- /vp-ban-chay -->", 1)[0]
        self.assertIn("Bán chạy 4 tuần qua", block)
        self.assertIn("Hot · Bán chạy", block)
        self.assertGreaterEqual(block.count('loading="eager"'), 4)
        self.assertNotIn("Hóa đơn", block)
        self.assertNotIn("GTGT", block)
        self.assertNotIn("đã bán", block.lower())
        for item in disk["items"]:
            self.assertIn(item["href"], index)
            self.assertIn(f"https://vanphatcompany.vn/{item['href']}", index)
        self.assertIn('id="ban-chay-ld"', index)
        self.assertIn('"@type": "ItemList"', index)
        sample = ROOT / "data" / "hoa-don-gtgt" / "mau" / "hoa-don-gtgt-mau.csv"
        self.assertTrue(is_sample_file(sample))
        self.assertIn("DỮ LIỆU MẪU", sample.read_text(encoding="utf-8"))
        self.assertFalse((ROOT / ".github" / "workflows" / "ban-chay.yml").is_file())
        readme = (ROOT / "README.md").read_text(encoding="utf-8")
        self.assertIn("BAN_CHAY_CSV", readme)
        self.assertIn("ngoài repo", readme)
        self.assertIn("product-hot-short", block)
        self.assertNotIn("fetchpriority", block)

    def test_home_rewrite_only_when_codes_change(self):
        text = (
            "<!-- vp-ban-chay -->\n"
            '<article data-ma="VP1"></article><article data-ma="VP2"></article>\n'
            "<!-- /vp-ban-chay -->"
        )
        same = {"items": [{"ma": "VP1"}, {"ma": "vp2"}]}
        self.assertFalse(should_write_home(text, same))
        changed = {"items": [{"ma": "VP2"}, {"ma": "VP1"}]}
        self.assertTrue(should_write_home(text, changed))
        self.assertTrue(should_write_home("<html></html>", {"items": [{"ma": "VP1"}]}))

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
        self.assertNotIn("fetchpriority", html)

    def _page(self, root: Path, rel: str) -> None:
        path = root / rel
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text("<html></html>", encoding="utf-8")


SAMPLE_NOTE = "DỮ LIỆU MẪU"


if __name__ == "__main__":
    unittest.main()
