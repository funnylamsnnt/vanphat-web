#!/usr/bin/env python3
"""Kiểm tra quy tắc web trên cây đang có.

1. Mã thuộc nhóm «Không đưa lên web» (sổ trong scripts/sync_state.json và
   mọi sản phẩm có nhóm bị cấm trong data/products.json) không xuất hiện ở
   products.json, catalog-paths, sitemap, HTML.
2. Mọi thẻ sản phẩm khách (article.product-card trong HTML, cardHTML trong
   js/products.js, card_html trong generator) có data-product-zoom.
3. CNAME đúng vanphatcompany.vn và chữ «Đặt hàng online» không trở lại HTML/JS.
4. Hằng công ty trong generator: tên, địa chỉ Mỹ Gia (không Phước Hải),
   số 0335652832, tọa độ 12.237790 / 109.166378, Street View đã chốt.
5. Tìm chat (`scripts/test_chat_search.js`) lọc từ hỏi còn dấu, không
   gợi ý món giá 0, và không báo khách 0đ.
6. Trang HTML không chứa «0đ» hay schema price 0.

Sổ đơn nhân viên (js/staff-order.js) không dùng lightbox giỏ khách nên không
nằm trong hạng mục 2. Chạy: python3 scripts/check_rules.py
"""
from __future__ import annotations

import json
import re
import subprocess
import sys
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from sync_products_from_excel import (  # noqa: E402
    exclude_group_folds,
    is_excluded_nhom,
    load_ia,
)

SKIP_DIRS = {".git", "node_modules", "__pycache__"}
ARTICLE_RE = re.compile(r"<article\b([^>]*)>(.*?)</article>", re.I | re.S)
PRODUCT_CARD_RE = re.compile(r"\bproduct-card\b", re.I)
BANNED_CTA = "Đặt hàng online"


def fail(errors: list[str]) -> None:
    print(f"KHÔNG ĐẠT: {len(errors)} lỗi")
    for item in errors:
        print(f"- {item}")
    raise SystemExit(1)


def sku_pattern(skus: list[str]) -> re.Pattern[str]:
    alts = "|".join(re.escape(sku) for sku in sorted(skus, key=len, reverse=True))
    return re.compile(rf"(?i)(?<![A-Za-z0-9])(?:{alts})(?![A-Za-z0-9])")


def load_excluded_skus() -> list[str]:
    path = ROOT / "scripts" / "sync_state.json"
    if not path.is_file():
        fail([f"thiếu {path.relative_to(ROOT)}"])
    state = json.loads(path.read_text(encoding="utf-8"))
    result = state.get("lastSyncResult")
    if not isinstance(result, dict) or "excluded_nhom" not in result:
        fail(["scripts/sync_state.json thiếu lastSyncResult.excluded_nhom"])
    groups = result.get("excluded_nhom") or {}
    if not isinstance(groups, dict):
        fail(["excluded_nhom phải là object nhóm → danh sách mã"])
    skus: list[str] = []
    for name, codes in groups.items():
        if not isinstance(codes, list):
            fail([f"excluded_nhom[{name!r}] phải là danh sách mã"])
        for code in codes:
            text = str(code or "").strip().upper()
            if text:
                skus.append(text)
    return sorted(set(skus))


def iter_html() -> list[Path]:
    found: list[Path] = []
    for path in ROOT.rglob("*.html"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        found.append(path)
    return found


def line_of(text: str, index: int) -> int:
    return text.count("\n", 0, index) + 1


def check_excluded(errors: list[str], skus: list[str]) -> int:
    ia = load_ia()
    folds = exclude_group_folds(ia)
    if not is_excluded_nhom("Không đưa lên web", folds):
        errors.append("data/ia.json không còn chốt nhóm Không đưa lên web")

    products_path = ROOT / "data" / "products.json"
    data = json.loads(products_path.read_text(encoding="utf-8"))
    leaked_nhom = []
    for product in data.get("sanpham") or []:
        ma = str(product.get("ma") or "").strip().upper()
        nhom = str(product.get("nhom") or "")
        if ma in skus or is_excluded_nhom(nhom, folds):
            leaked_nhom.append(f"{ma or '?'} (nhóm {nhom or 'trống'})")
    if leaked_nhom:
        errors.append("products.json còn mã bị cấm: " + ", ".join(leaked_nhom))

    if not skus:
        return len(data.get("sanpham") or [])

    pat = sku_pattern(skus)
    targets: list[Path] = [
        products_path,
        ROOT / "data" / "descriptions.json",
        ROOT / "js" / "catalog-paths.js",
        ROOT / "sitemap.xml",
        *iter_html(),
    ]
    for path in targets:
        if not path.is_file():
            continue
        rel = path.relative_to(ROOT).as_posix()
        name_hit = pat.search(path.name)
        if name_hit:
            errors.append(f"{rel}: tên file chứa mã {name_hit.group(0).upper()}")
        text = path.read_text(encoding="utf-8", errors="replace")
        hit = pat.search(text)
        if hit:
            errors.append(
                f"{rel}:{line_of(text, hit.start())}: mã loại trừ {hit.group(0).upper()}"
            )
    return len(data.get("sanpham") or [])


def py_function(text: str, name: str) -> str:
    match = re.search(rf"^def {re.escape(name)}\(", text, re.M)
    if not match:
        raise SystemExit(f"không thấy def {name}")
    rest = text[match.start() :]
    nxt = re.search(r"\ndef ", rest[1:])
    return rest if nxt is None else rest[: nxt.start() + 1]


def js_function(text: str, name: str) -> str:
    match = re.search(rf"function {re.escape(name)}\s*\(", text)
    if not match:
        raise SystemExit(f"không thấy function {name}")
    start = text.find("{", match.end())
    if start < 0:
        raise SystemExit(f"function {name} thiếu thân")
    depth = 0
    for index in range(start, len(text)):
        char = text[index]
        if char == "{":
            depth += 1
        elif char == "}":
            depth -= 1
            if depth == 0:
                return text[match.start() : index + 1]
    raise SystemExit(f"function {name} không đóng ngoặc")


def check_lightbox(errors: list[str]) -> int:
    cards = 0
    for path in iter_html():
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ROOT).as_posix()
        found = 0
        for attrs, body in ARTICLE_RE.findall(text):
            if not PRODUCT_CARD_RE.search(attrs):
                continue
            found += 1
            blob = attrs + body
            if "data-product-zoom" not in blob:
                errors.append(f"{rel}: thẻ product-card thiếu data-product-zoom")
            if "data-add-cart" not in blob:
                errors.append(f"{rel}: thẻ product-card thiếu data-add-cart")
        if found and "product-lightbox.js" not in text:
            errors.append(f"{rel}: có thẻ sản phẩm nhưng không nạp product-lightbox.js")
        cards += found

    products_js = (ROOT / "js" / "products.js").read_text(encoding="utf-8")
    card_js = js_function(products_js, "cardHTML")
    if "data-product-zoom" not in card_js or "data-add-cart" not in card_js:
        errors.append("js/products.js cardHTML thiếu móc lightbox hoặc thêm giỏ")

    generator = (ROOT / "scripts" / "generate_catalog_pages.py").read_text(encoding="utf-8")
    card_py = py_function(generator, "card_html")
    if "cart_control(" in card_py:
        card_py += py_function(generator, "cart_control")
    if "data-product-zoom" not in card_py or "data-add-cart" not in card_py:
        errors.append("scripts/generate_catalog_pages.py card_html thiếu móc lightbox hoặc thêm giỏ")

    lightbox = (ROOT / "js" / "product-lightbox.js").read_text(encoding="utf-8")
    required = {
        "nút đóng": "data-lb-close",
        "số lượng": "data-lb-qty",
        "thêm giỏ": "data-lb-add",
        "Escape": "Escape",
        "nhãn thêm giỏ": "Thêm vào giỏ",
    }
    for label, needle in required.items():
        if needle not in lightbox:
            errors.append(f"js/product-lightbox.js thiếu {label} ({needle})")
    if not re.search(r"overlay\.addEventListener\(\s*[\"']click[\"']\s*,\s*close\s*\)", lightbox):
        errors.append("js/product-lightbox.js thiếu đóng bằng click lớp phủ")

    if cards == 0:
        errors.append("không thấy article.product-card nào — catalog trống hoặc bộ quét hỏng")
    return cards


def fold_vn(text: str) -> str:
    text = text.replace("đ", "d").replace("Đ", "D")
    text = unicodedata.normalize("NFD", text)
    return "".join(ch for ch in text if unicodedata.category(ch) != "Mn").lower()


def assigned(text: str, name: str) -> str | None:
    match = re.search(rf'^{re.escape(name)}\s*=\s*"([^"]*)"', text, re.M)
    return match.group(1) if match else None


def check_company(errors: list[str]) -> None:
    gen = ROOT / "scripts" / "generate_catalog_pages.py"
    text = gen.read_text(encoding="utf-8")
    expect = {
        "COMPANY": "CÔNG TY TNHH TƯ VẤN ĐẦU TƯ THƯƠNG MẠI VẠN PHÁT",
        "HOTLINE_TEL": "0335652832",
        "STREETVIEW_PANO": "g-5g616SRGZtJMjpFNK1Jg",
        "STREETVIEW_HEADING": "67.85",
        "STREETVIEW_PITCH": "-2.16",
    }
    for name, wanted in expect.items():
        got = assigned(text, name)
        if got is None:
            errors.append(f"generate_catalog_pages.py thiếu hằng {name}")
        elif got != wanted:
            errors.append(f"{name} sai: {got}")
    address = assigned(text, "ADDRESS") or ""
    if not address:
        errors.append("generate_catalog_pages.py thiếu ADDRESS")
    else:
        for needle in ("LK 19-06", "Mỹ Gia", "Vĩnh Thái", "Nam Nha Trang"):
            if needle not in address:
                errors.append(f"ADDRESS thiếu {needle}")
        if "phuoc hai" in fold_vn(address):
            errors.append("ADDRESS đang dùng Phước Hải")
    display = assigned(text, "HOTLINE_DISPLAY") or ""
    if re.sub(r"\D", "", display) != "0335652832":
        errors.append(f"HOTLINE_DISPLAY không còn số 0335 652 832: {display or 'trống'}")
    lat = assigned(text, "GEO_LAT") or ""
    lng = assigned(text, "GEO_LNG") or ""
    if not lat.startswith("12.237790"):
        errors.append(f"GEO_LAT sai: {lat or 'trống'}")
    if not lng.startswith("109.166378"):
        errors.append(f"GEO_LNG sai: {lng or 'trống'}")
    if "LocalBusiness" not in text:
        errors.append("generator thiếu schema LocalBusiness")


def check_boundaries(errors: list[str]) -> None:
    cname = (ROOT / "CNAME").read_text(encoding="utf-8").strip()
    if cname != "vanphatcompany.vn":
        errors.append(f"CNAME đang là {cname!r}, phải là vanphatcompany.vn")
    old_address = re.compile(r"phuoc\s*hai")
    for path in [*iter_html(), *ROOT.joinpath("js").glob("*.js")]:
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ROOT).as_posix()
        if BANNED_CTA in text:
            errors.append(f"{rel}: có lại «{BANNED_CTA}»")
        if old_address.search(fold_vn(text)):
            errors.append(f"{rel}: còn địa chỉ Phước Hải")


def self_test() -> None:
    folds = exclude_group_folds({"excludeGroups": ["Không đưa lên web"]})
    for sample in (
        "Không đưa lên web",
        "  không đưa lên web ",
        "KHÔNG ĐƯA LÊN WEB",
        "Không đưa lên web (nội bộ)",
        "Không-đưa-lên-web",
    ):
        if not is_excluded_nhom(sample, folds):
            raise SystemExit(f"self-test: bỏ sót {sample!r}")
    for sample in ("Giấy", "Khác", "", "  "):
        if is_excluded_nhom(sample, folds):
            raise SystemExit(f"self-test: dương tính giả {sample!r}")
    pat = sku_pattern(["VP415"])
    if not pat.search("san-pham/vp415-bi-mat.html"):
        raise SystemExit("self-test: không bắt tên file vp415")
    if pat.search("VP4150") or pat.search("san-pham/vp4150-khac.html"):
        raise SystemExit("self-test: bắt nhầm mã dài hơn")
    html = '<article class="product-card product-detail" data-ma="VP1"><div class="product-img"></div></article>'
    attrs, body = ARTICLE_RE.findall(html)[0]
    if "data-product-zoom" in attrs + body:
        raise SystemExit("self-test: thẻ mẫu không được coi là đã có lightbox")


def check_zero_price_pages(errors: list[str]) -> None:
    needles = ("0đ", '"price": "0"', '"price":"0"')
    price_zero = re.compile(r"Giá</span>\s*0\s*₫")
    for path in iter_html():
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ROOT).as_posix()
        for needle in needles:
            if needle in text:
                errors.append(f"{rel}: còn {needle}")
        if price_zero.search(text):
            errors.append(f"{rel}: giá hiện 0 ₫")


def check_chat_search(errors: list[str]) -> None:
    script = ROOT / "scripts" / "test_chat_search.js"
    if not script.is_file():
        errors.append("thiếu scripts/test_chat_search.js")
        return
    try:
        proc = subprocess.run(
            ["node", str(script)],
            cwd=ROOT,
            capture_output=True,
            text=True,
            timeout=60,
            check=False,
        )
    except FileNotFoundError:
        errors.append("không có node để chạy scripts/test_chat_search.js")
        return
    except subprocess.TimeoutExpired:
        errors.append("scripts/test_chat_search.js quá thời gian")
        return
    if proc.returncode != 0:
        detail = ((proc.stdout or "") + (proc.stderr or "")).strip()
        errors.append("test tìm chat lỗi:\n" + (detail or f"exit {proc.returncode}"))


def main() -> None:
    self_test()
    errors: list[str] = []
    skus = load_excluded_skus()
    product_count = check_excluded(errors, skus)
    cards = check_lightbox(errors)
    check_boundaries(errors)
    check_company(errors)
    check_zero_price_pages(errors)
    check_chat_search(errors)
    if errors:
        fail(errors)
    print(
        f"OK: {product_count} sản phẩm trên web, {len(skus)} mã loại trừ không xuất hiện, "
        f"{cards} thẻ có lightbox."
    )


if __name__ == "__main__":
    main()
