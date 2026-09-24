#!/usr/bin/env python3
"""Export Danh Mục Vật Tư from Vạn Phát Excel → data/products.json"""
import argparse, json, re, hashlib
from pathlib import Path

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
    # Only trust header detection if the essential columns were all found.
    if all(k in found for k in ("ma", "ten", "gia")):
        cols.update(found)
    return cols

def clean(v) -> str:
    if v is None:
        return ""
    return re.sub(r"\s+", " ", str(v)).strip()

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

def export(xlsx_path: Path, out_json: Path) -> dict:
    from openpyxl import load_workbook
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
        nh = clean(cell("nhom")) or "Khác"
        if nh.lower() == "dụng cụ vp":
            nh = "Dụng cụ VP"
        ten = clean(cell("ten"))
        dvt = clean(cell("dvt"))
        gia = to_int(cell("gia"))
        gia = gia if gia is not None and gia >= 0 else 0
        anh = clean(cell("anh"))
        ton = to_int(cell("ton"))
        products.append({"nhom": nh, "ma": ma, "ten": ten, "dvt": dvt, "gia": gia, "anh": anh, "ton": ton})
    wb.close()

    by = {p["ma"]: p for p in products}
    products = list(by.values())

    def key(p):
        m = re.search(r"(\d+)", p["ma"])
        return (p["nhom"], int(m.group(1)) if m else 0, p["ma"])

    products.sort(key=key)
    groups = sorted({p["nhom"] for p in products})
    out = {
        "company": company,
        "nhom": [{"STT": i + 1, "TenNhom": g} for i, g in enumerate(groups)],
        "sanpham": products,
        "orderUrl": "https://script.google.com/macros/s/AKfycbzdcOxIbVAivc2fSCSk1v8go0Wxg_vULF7MDnsmpOcROoWDZ5luBF6uD7Wh-omRkjJB/exec",
        "hotline": "033 5652 832",
        "syncedFrom": xlsx_path.name,
    }
    out_json.parent.mkdir(parents=True, exist_ok=True)
    text = json.dumps(out, ensure_ascii=False, indent=2)
    prev = out_json.read_text(encoding="utf-8") if out_json.exists() else ""
    changed = hashlib.sha256(text.encode()).hexdigest() != hashlib.sha256(prev.encode()).hexdigest()
    if changed:
        out_json.write_text(text, encoding="utf-8")
    with_img = sum(1 for p in products if p["anh"] and "placeholder" not in p["anh"].lower())
    return {"changed": changed, "count": len(products), "with_img": with_img, "groups": groups, "path": str(out_json)}

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("xlsx")
    ap.add_argument("-o", "--out", default="/workspace/vanphat-website/data/products.json")
    args = ap.parse_args()
    stats = export(Path(args.xlsx), Path(args.out))
    print(json.dumps(stats, ensure_ascii=False))

if __name__ == "__main__":
    main()
