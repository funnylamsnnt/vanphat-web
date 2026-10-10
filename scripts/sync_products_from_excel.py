#!/usr/bin/env python3
"""Export Danh Mục Vật Tư from Vạn Phát Excel → data/products.json.

Maps each Excel nhóm onto lĩnh vực using data/ia.json (config array, not a
fixed count of domains). Placeholder nhóm such as Bánh stay in the catalog
even when Excel has zero SKUs.

Images already stored for a mã are kept when the Excel cell is empty.
Customer order-form / Apps Script links are not written.

After a successful export this script regenerates indexable category, lĩnh vực,
and product HTML plus sitemap.xml and js/catalog-paths.js.

    python3 scripts/sync_products_from_excel.py path/to.xlsx
"""
import argparse, json, re, hashlib, subprocess, sys, unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
IA_PATH = ROOT / "data" / "ia.json"

# Default (legacy) layout: A nhóm, B mã, C tên, D ĐVT, E giá, F link ảnh, K tồn.
DEFAULT_COLS = {"nhom": 0, "ma": 1, "ten": 2, "dvt": 3, "gia": 4, "anh": 5, "ton": 10}
HEADER_PATTERNS = {
    "nhom": [r"^nh[oó]m"],
    "ma": [r"^m[aã]\s*(sp|s[aả]n ph[aẩ]m|h[aà]ng|vt)?$"],
    "ten": [r"^t[eê]n\s*(s[aả]n ph[aẩ]m|sp|h[aà]ng|m[aặ]t h[aà]ng|v[aậ]t t[uư])"],
    "dvt": [r"^đvt$", r"^đ[oơ]n v[iị] t[ií]nh"],
    "gia": [r"^đ[oơ]n gi[aá]", r"^gi[aá] b[aá]n", r"^gi[aá]$"],
    "anh": [r"(link|url).*(h[iì]nh|[aả]nh)", r"^h[iì]nh [aả]nh", r"^[aả]nh$"],
    "ton": [r"^t[oồ]n kho", r"^t[oồ]n$"],
}


def detect_columns(header) -> dict:
    """Map fields to column indexes from the header row; fall back to the legacy layout."""
    cols = dict(DEFAULT_COLS)
    names = [re.sub(r"\s+", " ", str(h or "")).strip().lower() for h in header]
    found = {}
    for key, pats in HEADER_PATTERNS.items():
        for idx, name in enumerate(names):
            if name and any(re.search(p, name) for p in pats):
                found[key] = idx
                break
    if all(k in found for k in ("ma", "ten", "gia")):
        cols.update(found)
    return cols


def clean(v) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()


def fold_name(value: str) -> str:
    s = clean(value).lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"\s+", " ", s)
    return s.strip()


def slugify(text: str, max_len: int = 60) -> str:
    s = str(text or "").strip().lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if max_len:
        s = s[:max_len].strip("-")
    return s


def to_int(v):
    if v is None or v == "":
        return None
    if isinstance(v, (int, float)):
        return int(round(v))
    s = str(v).strip().replace("₫", "").replace("đ", "").replace(" ", "")
    if re.fullmatch(r"\d{1,3}([.,]\d{3})+", s):
        s = re.sub(r"[.,]", "", s)
    try:
        return int(round(float(s.replace(",", "."))))
    except Exception:
        return None


def load_ia() -> dict:
    if not IA_PATH.is_file():
        raise SystemExit(f"Missing lĩnh vực config: {IA_PATH}")
    data = json.loads(IA_PATH.read_text(encoding="utf-8"))
    linh = data.get("linh_vuc") or []
    nhom = data.get("nhom") or []
    if not linh or not nhom:
        raise SystemExit("data/ia.json needs linh_vuc[] and nhom[]")
    return data


DEFAULT_EXCLUDE_GROUPS = ["Không đưa lên web"]


def nhom_key(value: str) -> str:
    """Trim, drop case/diacritics, and treat hyphens as spaces. Blank stays blank."""
    s = clean(value).replace("\u00a0", " ").replace("\u200b", "").replace("\ufeff", "")
    s = fold_name(s).replace("-", " ").replace("_", " ").replace("/", " ")
    return re.sub(r"\s+", " ", s).strip(" .:-")


def exclude_group_folds(ia: dict) -> set:
    """Keys for Excel nhóm that must never be published.

    data/ia.json excludeGroups, plus "Không đưa lên web" even if that key is
    missing. Matching ignores case, accents (including đ/Đ), extra spaces and
    hyphens, and allows a suffix such as "(nội bộ)".
    """
    names = list(DEFAULT_EXCLUDE_GROUPS) + list(ia.get("excludeGroups") or [])
    return {nhom_key(n) for n in names if nhom_key(n)}


def is_excluded_nhom(raw_nhom: str, phrases: set) -> bool:
    folded = nhom_key(raw_nhom)
    if not folded:
        return False
    padded = f" {folded} "
    for phrase in phrases:
        if folded == phrase or folded.startswith(phrase + " ") or f" {phrase} " in padded:
            return True
    return False


def assert_exclusion_rules() -> None:
    phrases = {nhom_key("Không đưa lên web")}
    for sample in (
        "Không đưa lên web",
        "  không đưa lên web ",
        "KHÔNG ĐƯA LÊN WEB",
        "Không đưa lên web (nội bộ)",
        "Không-đưa-lên-web",
    ):
        if not is_excluded_nhom(sample, phrases):
            raise SystemExit(f"exclusion missed {sample!r}")
    for sample in ("Giấy", "Khác", "", "  "):
        if is_excluded_nhom(sample, phrases):
            raise SystemExit(f"exclusion false positive {sample!r}")
    if nhom_key("  ") or nhom_key("Khác") == "":
        raise SystemExit("blank nhóm must not be renamed before the exclusion check")


def load_previous(out_json: Path) -> dict:
    if not out_json.exists():
        return {}
    try:
        return json.loads(out_json.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {}


def export(xlsx_path: Path, out_json: Path) -> dict:
    from openpyxl import load_workbook

    ia = load_ia()
    prev = load_previous(out_json)
    prev_by_ma = {p.get("ma"): p for p in (prev.get("sanpham") or []) if p.get("ma")}

    nhom_cfg = [dict(n) for n in ia["nhom"]]
    by_fold = {fold_name(n.get("TenNhom")): n for n in nhom_cfg if n.get("TenNhom")}
    lv_by_id = {lv.get("id"): lv for lv in ia["linh_vuc"] if lv.get("id")}
    excl_folds = exclude_group_folds(ia)
    assert_exclusion_rules()
    hold_unmapped = ia.get("holdUnmappedGroups", True)
    excluded = {}  # raw nhóm -> [mã] never published
    held = {}  # unmapped nhóm -> [mã] kept off until mapped in ia.json

    wb = load_workbook(xlsx_path, read_only=True, data_only=True)

    company = {
        "Ten": "CÔNG TY TNHH TƯ VẤN ĐẦU TƯ THƯƠNG MẠI VẠN PHÁT",
        "DiaChi": "LK 19-06 Đường số 20 KĐT Mỹ Gia, Vĩnh Thái, Phường Nam Nha Trang",
        "Website": "http://vanphatcompany.vn",
        "Email": "congtytnhhvanphat999@gmail.com",
        "Hotline": "033 5652 832",
        "STK": "4703201014329",
        "NganHang": "Ngân hàng Nông nghiệp và PTNT (Agribank)",
    }
    if "Đơn Đặt Hàng" in wb.sheetnames:
        ws0 = wb["Đơn Đặt Hàng"]
        for row in ws0.iter_rows(min_row=1, max_row=1, values_only=True):
            header = row[1] if row else None
            break
        if isinstance(header, str):
            for line in header.split("\n"):
                line = line.strip()
                if line.startswith("Địa chỉ:"):
                    company["DiaChi"] = line.replace("Địa chỉ:", "").strip()
                if "Email:" in line:
                    m = re.search(r"Email:\s*(\S+)", line)
                    if m:
                        company["Email"] = m.group(1).strip()
                if "STK" in line and ":" in line:
                    m = re.search(r":\s*(\d+)", line)
                    if m:
                        company["STK"] = m.group(1)

    sheet = "Danh Mục Vật Tư"
    if sheet not in wb.sheetnames:
        raise SystemExit(f"Missing sheet: {sheet}. Have: {wb.sheetnames}")

    products = []
    unknown_groups = []
    ws = wb[sheet]
    rows = ws.iter_rows(values_only=True)
    header = next(rows, None) or ()
    col = detect_columns(header)
    for row in rows:
        if not row:
            continue
        cell = lambda k: row[col[k]] if col.get(k) is not None and col[k] < len(row) else None
        ma = clean(cell("ma"))
        if not ma:
            continue
        # Decide on the raw cell. Never rewrite a blank or an exclusion label to "Khác"
        # first — that alias is why VP415–VP449 were reported as nhóm Khác.
        raw_nhom = clean(cell("nhom"))
        if is_excluded_nhom(raw_nhom, excl_folds):
            excluded.setdefault(raw_nhom, []).append(ma)
            continue
        if not nhom_key(raw_nhom):
            held.setdefault("(trống)", []).append(ma)
            continue
        meta = by_fold.get(fold_name(raw_nhom))
        if hold_unmapped and (meta is None or not lv_by_id.get(meta.get("linhVucId") or "")):
            held.setdefault(raw_nhom, []).append(ma)
            continue
        if meta is None:
            meta = {
                "id": slugify(raw_nhom) or "khac",
                "STT": 1000 + len(unknown_groups),
                "TenNhom": raw_nhom,
                "slug": slugify(raw_nhom) or "khac",
                "linhVucId": "",
                "visible": True,
            }
            by_fold[fold_name(raw_nhom)] = meta
            nhom_cfg.append(meta)
            unknown_groups.append(raw_nhom)
        lv_id = meta.get("linhVucId") or ""
        lv = lv_by_id.get(lv_id) or {}
        ten = clean(cell("ten"))
        dvt = clean(cell("dvt"))
        gia = to_int(cell("gia"))
        gia = gia if gia is not None and gia >= 0 else 0
        anh = clean(cell("anh"))
        if not anh:
            old = prev_by_ma.get(ma) or {}
            anh = clean(old.get("anh"))
        ton = to_int(cell("ton"))
        products.append(
            {
                "nhom": meta["TenNhom"],
                "nhomId": meta.get("id") or meta.get("slug") or "",
                "linhVucId": lv_id,
                "linhVucTen": lv.get("ten") or "",
                "ma": ma,
                "ten": ten,
                "dvt": dvt,
                "gia": gia,
                "anh": anh,
                "ton": ton if ton is not None else 0,
            }
        )
    wb.close()

    by = {}
    for p in products:
        by[p["ma"]] = p
    products = list(by.values())
    leaked = [p["ma"] for p in products if is_excluded_nhom(p.get("nhom") or "", excl_folds)]
    if leaked:
        raise SystemExit(f"Excluded nhóm leaked into web catalog: {leaked}")

    stt_of = {n.get("TenNhom"): n.get("STT") or 999 for n in nhom_cfg}

    def key(p):
        m = re.search(r"(\d+)", p["ma"])
        return (stt_of.get(p["nhom"], 999), int(m.group(1)) if m else 0, p["ma"])

    products.sort(key=key)
    nhom_cfg.sort(key=lambda n: (n.get("STT") or 999, n.get("TenNhom") or ""))
    linh_vuc = sorted(ia["linh_vuc"], key=lambda lv: (lv.get("sort") or 0, lv.get("ten") or ""))

    # Never emit a customer order-form URL. Ordering stays cart + hotline/Zalo.
    out = {
        "company": company,
        "linh_vuc": linh_vuc,
        "nhom": nhom_cfg,
        "sanpham": products,
        "hotline": "033 5652 832",
        "syncedFrom": xlsx_path.name,
    }
    if "orderUrl" in out:
        raise SystemExit("orderUrl must not be written")

    out_json.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(out, ensure_ascii=False, indent=2)
    prev_text = out_json.read_text(encoding="utf-8") if out_json.exists() else ""
    changed = hashlib.sha256(text.encode()).hexdigest() != hashlib.sha256(prev_text.encode()).hexdigest()
    if changed:
        out_json.write_text(text, encoding="utf-8")

    with_img = sum(1 for p in products if p["anh"] and "placeholder" not in p["anh"].lower())
    counts = {}
    for p in products:
        counts[p["nhom"]] = counts.get(p["nhom"], 0) + 1
    lv_counts = {}
    for p in products:
        lv_counts[p.get("linhVucId") or ""] = lv_counts.get(p.get("linhVucId") or "", 0) + 1

    waters_in_tools = [
        p["ma"]
        for p in products
        if p["nhom"] == "Dụng cụ VP" and fold_name(p["ten"]).find("nuoc suoi") >= 0
    ]
    if waters_in_tools:
        raise SystemExit(f"Nước uống still classified as Dụng cụ VP: {waters_in_tools}")
    missing_new = [f"VP{n}" for n in range(391, 408) if f"VP{n}" not in by]
    if missing_new:
        print("warning: expected SKUs missing from Excel:", ", ".join(missing_new))

    return {
        "changed": changed,
        "count": len(products),
        "with_img": with_img,
        "groups": counts,
        "linhVuc": lv_counts,
        "unknownGroups": unknown_groups,
        "excludedGroups": excluded,
        "heldUnmappedGroups": held,
        "keptImages": sum(1 for p in products if p["anh"] and not (prev_by_ma.get(p["ma"]) or {}).get("anh") and p["ma"] not in prev_by_ma) ,
        "path": str(out_json),
    }


def regenerate_catalog_pages(products_json: Path) -> None:
    """Rebuild static SEO pages so new SKUs are crawlable after catalog sync."""
    gen = Path(__file__).resolve().parent / "generate_catalog_pages.py"
    if not gen.is_file():
        raise SystemExit(f"Missing generator: {gen}")
    subprocess.check_call([sys.executable, str(gen), "--products", str(products_json)])


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("-o", "--out", default=str(ROOT / "data" / "products.json"))
    args = ap.parse_args()
    out = Path(args.out)
    stats = export(Path(args.xlsx), out)
    print(json.dumps(stats, ensure_ascii=False))
    regenerate_catalog_pages(out)


if __name__ == "__main__":
    main()
