#!/usr/bin/env python3
"""Export Danh Mục Vật Tư from Vạn Phát Excel → data/products.json"""
import argparse, json, re, hashlib
from pathlib import Path

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
    for i, row in enumerate(ws.iter_rows(values_only=True)):
        if i == 0 or not row or not row[1]:
            continue
        nh = str(row[0] or "").strip() or "Khác"
        if nh.lower() == "dụng cụ vp":
            nh = "Dụng cụ VP"
        ma = str(row[1]).strip()
        ten = str(row[2] or "").strip()
        dvt = str(row[3] or "").strip()
        gia = row[4]
        try:
            gia = int(float(gia)) if gia is not None and gia != "" else 0
        except Exception:
            gia = 0
        anh = str(row[5] or "").strip() if len(row) > 5 and row[5] else ""
        ton = None
        if len(row) > 10 and row[10] is not None and row[10] != "":
            try:
                ton = int(float(row[10]))
            except Exception:
                ton = None
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
