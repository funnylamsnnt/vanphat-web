#!/usr/bin/env python3
"""Xếp hạng bán chạy 4 tuần từ file dòng hóa đơn nằm ngoài repo.

Repo web là public. Không đọc và không ghi file hóa đơn trong cây git.
Điểm nội bộ = 50% hạng phần trăm số lượng + 50% hạng phần trăm doanh thu
(ĐVT khác nhau nên không cộng số lượng thô). File công khai chỉ có hạng,
mã, tên, link và giá bán lẻ trên web.

    BAN_CHAY_CSV=/duong/dan/ngoai/hoadon.csv \\
      python3 scripts/rank_ban_chay.py --as-of 2026-10-31

    python3 scripts/rank_ban_chay.py --csv /duong/dan/ngoai/hoadon.csv --as-of 2026-10-31

Chỉ ghi data/ban-chay.json. Không đụng Apps Script, không có GitHub Action.
"""
from __future__ import annotations

import argparse
import csv
import io
import json
import os
import sys
from collections import defaultdict
from datetime import date, datetime, timedelta
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from generate_catalog_pages import build_ia, price_amount  # noqa: E402
from sync_products_from_excel import exclude_group_folds, is_excluded_nhom  # noqa: E402

WINDOW_DAYS = 28
TOP_N = 10
COLUMNS = ("so_hd", "ngay", "ma_vp", "so_luong", "don_gia", "thanh_tien")
SAMPLE_MARK = "DỮ LIỆU MẪU"
PUBLIC_ITEM_KEYS = ("hang", "ma", "ten", "href", "gia")


def window_for(as_of: date) -> tuple[date, date]:
    if WINDOW_DAYS < 1:
        raise ValueError("cửa sổ phải có ít nhất 1 ngày")
    return as_of - timedelta(days=WINDOW_DAYS - 1), as_of


def percent_ranks(values: dict[str, Decimal]) -> dict[str, Decimal]:
    """Hạng phần trăm 0..1. Hòa lấy hạng trung bình. Một mã thì bằng 1."""
    if not values:
        return {}
    ordered = sorted(values.items(), key=lambda item: (item[1], item[0]))
    count = len(ordered)
    if count == 1:
        return {ordered[0][0]: Decimal(1)}
    ranks: dict[str, Decimal] = {}
    index = 0
    while index < count:
        end = index
        while end + 1 < count and ordered[end + 1][1] == ordered[index][1]:
            end += 1
        average = Decimal(index + 1 + end + 1) / 2
        pct = (average - 1) / Decimal(count - 1)
        for cursor in range(index, end + 1):
            ranks[ordered[cursor][0]] = pct
        index = end + 1
    return ranks


def parse_as_of(value: str | None) -> date:
    if not value or not str(value).strip():
        return datetime.now(ZoneInfo("Asia/Ho_Chi_Minh")).date()
    try:
        return datetime.strptime(str(value).strip(), "%Y-%m-%d").date()
    except ValueError as exc:
        raise SystemExit(f"Ngày chốt phải là YYYY-MM-DD, nhận {value!r}") from exc


def _where(path: Path, row_no: int) -> str:
    return f"{path.as_posix()}:{row_no}"


def _decimal(value, field: str, where: str) -> Decimal:
    text = str(value if value is not None else "").strip().replace(" ", "")
    if text == "":
        raise ValueError(f"{where}: thiếu {field}")
    try:
        number = Decimal(text)
    except InvalidOperation as exc:
        raise ValueError(f"{where}: {field} không phải số ({value!r})") from exc
    return number


def _money(value, field: str, where: str) -> int:
    number = _decimal(value, field, where)
    if number != number.to_integral_value():
        raise ValueError(f"{where}: {field} phải là số đồng nguyên ({value!r})")
    return int(number)


def parse_row(raw: dict, path: Path, row_no: int) -> dict:
    where = _where(path, row_no)
    missing = [name for name in COLUMNS if name not in raw]
    if missing:
        raise ValueError(f"{where}: thiếu cột {', '.join(missing)}")
    ngay_text = str(raw.get("ngay") or "").strip()
    try:
        ngay = datetime.strptime(ngay_text, "%Y-%m-%d").date()
    except ValueError as exc:
        raise ValueError(f"{where}: ngay phải là YYYY-MM-DD ({ngay_text!r})") from exc
    ma = str(raw.get("ma_vp") or "").strip().upper()
    if not ma:
        raise ValueError(f"{where}: thiếu ma_vp")
    so_hd = str(raw.get("so_hd") or "").strip()
    if not so_hd:
        raise ValueError(f"{where}: thiếu so_hd")
    return {
        "so_hd": so_hd,
        "ngay": ngay,
        "ma": ma,
        "so_luong": _decimal(raw.get("so_luong"), "so_luong", where),
        "don_gia": _money(raw.get("don_gia"), "don_gia", where),
        "thanh_tien": _money(raw.get("thanh_tien"), "thanh_tien", where),
        "source": path.as_posix(),
    }


def is_sample_file(path: Path) -> bool:
    if "mau" in path.parts:
        return True
    head = path.read_text(encoding="utf-8-sig")[:800]
    if SAMPLE_MARK in head:
        return True
    if path.suffix.lower() == ".json":
        try:
            data = json.loads(path.read_text(encoding="utf-8-sig"))
        except json.JSONDecodeError:
            return False
        if isinstance(data, dict) and data.get("mau") is True:
            return True
    return False


def iter_source_files(directory: Path) -> list[Path]:
    if not directory.is_dir():
        return []
    found = []
    for path in sorted(directory.rglob("*")):
        if not path.is_file():
            continue
        if path.suffix.lower() not in {".csv", ".json"}:
            continue
        if path.name.startswith("."):
            continue
        if is_sample_file(path):
            continue
        found.append(path)
    return found


def _csv_rows(path: Path) -> list[dict]:
    kept = []
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        stripped = line.strip()
        if not stripped or stripped.startswith("#"):
            continue
        kept.append(line)
    if not kept:
        return []
    reader = csv.DictReader(io.StringIO("\n".join(kept)))
    if reader.fieldnames is None:
        raise ValueError(f"{path.as_posix()}: thiếu dòng tiêu đề")
    fields = [name.strip() for name in reader.fieldnames]
    missing = [name for name in COLUMNS if name not in fields]
    if missing:
        raise ValueError(f"{path.as_posix()}: thiếu cột {', '.join(missing)}")
    rows = []
    for offset, row in enumerate(reader, start=2):
        cleaned = {(key or "").strip(): value for key, value in row.items()}
        rows.append(parse_row(cleaned, path, offset))
    return rows


def _json_rows(path: Path) -> list[dict]:
    data = json.loads(path.read_text(encoding="utf-8-sig"))
    if isinstance(data, dict):
        if data.get("mau") is True:
            return []
        rows = data.get("dong")
    else:
        rows = data
    if not isinstance(rows, list):
        raise ValueError(f"{path.as_posix()}: JSON phải là mảng dòng hoặc object có khóa dong")
    parsed = []
    for offset, row in enumerate(rows, start=1):
        if not isinstance(row, dict):
            raise ValueError(f"{path.as_posix()}:{offset}: dòng không phải object")
        parsed.append(parse_row(row, path, offset))
    return parsed


def load_lines(files: list[Path]) -> tuple[list[dict], int]:
    """Giữ mọi dòng trong một file. Số HĐ đã gặp ở file trước thì bỏ cả hóa đơn."""
    seen_file: dict[str, str] = {}
    kept: list[dict] = []
    skipped_dup = 0
    for path in files:
        reader = _csv_rows if path.suffix.lower() == ".csv" else _json_rows
        rows = reader(path)
        source = path.as_posix()
        blocked: set[str] = set()
        for row in rows:
            so_hd = row["so_hd"]
            previous = seen_file.get(so_hd)
            if previous is None:
                seen_file[so_hd] = source
                kept.append(row)
            elif previous == source and so_hd not in blocked:
                kept.append(row)
            else:
                blocked.add(so_hd)
                skipped_dup += 1
    return kept, skipped_dup


def load_catalog(root: Path) -> tuple[dict, dict, dict]:
    products = json.loads((root / "data" / "products.json").read_text(encoding="utf-8"))
    ia_file = json.loads((root / "data" / "ia.json").read_text(encoding="utf-8"))
    paths_text = (root / "js" / "catalog-paths.js").read_text(encoding="utf-8")
    paths = json.loads(paths_text.split("=", 1)[1].strip().rstrip(";"))
    by_ma = {}
    for product in products.get("sanpham") or []:
        ma = str(product.get("ma") or "").strip().upper()
        if ma:
            by_ma[ma] = product
    return by_ma, build_ia(products), {"phrases": exclude_group_folds(ia_file), "paths": paths}


def page_exists(root: Path, href: str) -> bool:
    rel = str(href or "").split("?", 1)[0].strip()
    if not rel or rel.startswith(("/", "http://", "https://")):
        return False
    target = (root / rel).resolve()
    try:
        target.relative_to(root.resolve())
    except ValueError:
        return False
    return target.is_file()


def _as_int(number: Decimal) -> int:
    if number != number.to_integral_value():
        raise ValueError(f"số lượng không nguyên: {number}")
    return int(number)


def _round1(number: Decimal) -> float:
    return float(number.quantize(Decimal("0.1"), rounding=ROUND_HALF_UP))


def rank_lines(
    lines: list[dict],
    by_ma: dict,
    phrases: set,
    paths: dict,
    root: Path,
    as_of: date,
) -> dict:
    start, end = window_for(as_of)
    qty: dict[str, Decimal] = defaultdict(lambda: Decimal(0))
    revenue: dict[str, int] = defaultdict(int)
    zero_only: set[str] = set()
    positive: set[str] = set()
    outside = 0
    dropped_price = 0
    mismatch = 0
    invoices = set()
    for line in lines:
        if line["ngay"] < start or line["ngay"] > end:
            outside += 1
            continue
        invoices.add(line["so_hd"])
        ma = line["ma"]
        if line["don_gia"] <= 0 or line["thanh_tien"] <= 0 or line["so_luong"] <= 0:
            dropped_price += 1
            zero_only.add(ma)
            continue
        expected = line["so_luong"] * Decimal(line["don_gia"])
        if expected != Decimal(line["thanh_tien"]):
            mismatch += 1
        positive.add(ma)
        qty[ma] += line["so_luong"]
        revenue[ma] += line["thanh_tien"]
    zero_only -= positive

    skipped_web = []
    skipped_group = []
    skipped_price = []
    eligible = []
    product_hrefs = paths.get("product") or {}
    for ma, total_qty in qty.items():
        product = by_ma.get(ma)
        href = str(product_hrefs.get(ma) or "")
        if product is None or not page_exists(root, href):
            skipped_web.append(ma)
            continue
        if is_excluded_nhom(str(product.get("nhom") or ""), phrases):
            skipped_group.append(ma)
            continue
        if price_amount(product.get("gia")) is None:
            skipped_price.append(ma)
            continue
        eligible.append(ma)

    qty_ranks = percent_ranks({ma: qty[ma] for ma in eligible})
    rev_ranks = percent_ranks({ma: Decimal(revenue[ma]) for ma in eligible})
    rows = []
    for ma in eligible:
        score = (qty_ranks[ma] + rev_ranks[ma]) * Decimal(50)
        rows.append(
            {
                "ma": ma,
                "soLuong": _as_int(qty[ma]),
                "doanhThu": int(revenue[ma]),
                "pctSoLuong": qty_ranks[ma],
                "pctDoanhThu": rev_ranks[ma],
                "score": score,
            }
        )
    rows.sort(key=lambda row: (-row["score"], -row["doanhThu"], -row["soLuong"], row["ma"]))
    top = rows[:TOP_N]
    items = []
    for index, row in enumerate(top, start=1):
        product = by_ma[row["ma"]]
        items.append(
            {
                "hang": index,
                "ma": row["ma"],
                "ten": product.get("ten") or "",
                "href": product_hrefs.get(row["ma"]) or "",
                "gia": price_amount(product.get("gia")),
                "diem": _round1(row["score"]),
            }
        )
    return {
        "items": items,
        "start": start,
        "end": end,
        "invoices": invoices,
        "outside": outside,
        "dropped_price": dropped_price,
        "mismatch": mismatch,
        "zero_only": sorted(zero_only),
        "skipped_web": sorted(set(skipped_web)),
        "skipped_group": sorted(set(skipped_group)),
        "skipped_price": sorted(set(skipped_price)),
        "eligible": len(eligible),
    }


def public_payload(ranked: dict) -> dict:
    """Chỉ hạng, mã, tên, link, giá bán lẻ. Không số lượng, doanh thu, điểm."""
    items = []
    for item in ranked["items"]:
        items.append({key: item[key] for key in PUBLIC_ITEM_KEYS})
    return {"items": items}


def outside_repo(path: Path, root: Path) -> Path:
    resolved = path.expanduser().resolve()
    if not resolved.is_file():
        raise SystemExit(f"Không thấy file hóa đơn: {resolved}")
    try:
        resolved.relative_to(root.resolve())
    except ValueError:
        return resolved
    raise SystemExit(f"File hóa đơn phải nằm ngoài repo public, không đọc {resolved}")


def csv_paths_from(args_csv: list[str], env_value: str, root: Path) -> list[Path]:
    raw = list(args_csv)
    if env_value.strip():
        raw.extend(part for part in env_value.split(os.pathsep) if part.strip())
    if not raw:
        raise SystemExit("Thiếu --csv hoặc biến BAN_CHAY_CSV (đường dẫn ngoài repo).")
    return [outside_repo(Path(item), root) for item in raw]


def write_outputs(root: Path, as_of: date, files: list[Path]) -> dict:
    lines, _dup = load_lines(files)
    by_ma, _ia, extra = load_catalog(root)
    ranked = rank_lines(lines, by_ma, extra["phrases"], extra["paths"], root, as_of)
    payload = public_payload(ranked)
    text = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    out = root / "data" / "ban-chay.json"
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(text, encoding="utf-8")
    return payload


def print_public(payload: dict) -> None:
    items = payload.get("items") or []
    if not items:
        print("Không có mã đủ điều kiện. data/ban-chay.json để items rỗng.")
        return
    for item in items:
        print(f"{item['hang']}. {item['ma']} — {item['ten']}")


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="Xếp hạng bán chạy, ghi JSON công khai")
    parser.add_argument("--csv", action="append", default=[], help="File dòng hóa đơn ngoài repo. Lặp lại được.")
    parser.add_argument("--as-of", default="", help="Ngày chốt YYYY-MM-DD. Trống = hôm nay giờ Việt Nam.")
    parser.add_argument("--root", default=str(ROOT))
    args = parser.parse_args(argv)
    root = Path(args.root)
    files = csv_paths_from(args.csv, os.environ.get("BAN_CHAY_CSV") or "", root)
    payload = write_outputs(root, parse_as_of(args.as_of), files)
    print_public(payload)
    return 0


if __name__ == "__main__":
    sys.exit(main())
