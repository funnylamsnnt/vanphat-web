#!/usr/bin/env python3
"""Kiểm tra quy tắc web trên cây đang có.

1. Mã thuộc nhóm «Không đưa lên web» (sổ trong scripts/sync_state.json và
   mọi sản phẩm có nhóm bị cấm trong data/products.json) không xuất hiện ở
   products.json, catalog-paths, sitemap, HTML.
2. Mọi thẻ sản phẩm khách (article.product-card trong HTML, cardHTML trong
   js/products.js, card_html trong generator) có data-product-zoom.
3. CNAME đúng vanphatcompany.vn và chữ «Đặt hàng online» không trở lại HTML/JS.
4. Hằng công ty trong generator: tên, địa chỉ Mỹ Gia (không Phước Hải),
   hotline 0335652832, hai số CSKH 0393268399 và 0398269399 trên bề mặt
   liên hệ, tọa độ 12.237790 / 109.166378, Street View đã chốt.
5. Tìm chat (`scripts/test_chat_search.js`) lọc từ hỏi còn dấu, không
   gợi ý món giá 0 (kể cả món đầu nhóm), và không báo khách 0đ.
   Giỏ và sổ đơn (`scripts/test_cart_quote.js`) hiện «Liên hệ báo giá»
   thay cho giá 0, tổng ghi món chưa gồm.
   Xóa chat (`scripts/test_chat_reset.js`) xóa hội thoại và session,
   giữ giỏ và bill. Mọi trang khách dùng cùng `chat-widget.js?v` với `sw.js`.
   Service worker (`scripts/test_sw_strategy.js`) lấy chat-widget.js
   network-first theo pathname, bỏ qua query, timeout 3 giây.
6. Trang HTML không chứa «0đ» hay schema price 0.
7. Mô tả dài trong data/descriptions.json chỉ khi trang_thai là da_xac_minh
   và nguon_url là http(s). Câu đệm không nguồn không được vào file hay trang SKU.

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
DESCRIPTION_FILLER = (
    "Dùng để viết hoặc châm mực",
    "Phù hợp cho văn phòng, cơ quan",
    "Liên hệ để giao hàng tại Nha Trang.",
    "Đồ dùng trên bàn làm việc.",
    "Đồ uống cho văn phòng và khách.",
    "Dùng để in, photo và lưu hồ sơ",
    "Dùng để đựng và phân loại tài liệu.",
    "Dùng để dán thùng, tem và đồ văn phòng.",
    "Thiết bị điện nhỏ cho bàn làm việc.",
    "Đồ ăn nhẹ cho văn phòng.",
    "Mặt hàng khác đang bán tại cửa hàng.",
    "Đang bán tại cửa hàng Vạn Phát.",
    "Hãng ghi trên tên:",
    "Quy cách lấy từ tên:",
)


def description_problem(ma: str, rec) -> str | None:
    """Mô tả dài không có nguồn, hoặc còn câu đệm, thì trả về lỗi."""
    if not isinstance(rec, dict):
        return f"{ma}: mô tả phải là object mo_ta, nguon_url, trang_thai"
    status = str(rec.get("trang_thai") or "").strip()
    if status not in {"da_xac_minh", "cho_xac_minh"}:
        return f"{ma}: trang_thai phải là da_xac_minh hoặc cho_xac_minh"
    text = re.sub(r"\s+", " ", str(rec.get("mo_ta") or "")).strip()
    url = str(rec.get("nguon_url") or "").strip()
    for phrase in DESCRIPTION_FILLER:
        if phrase in text:
            return f"{ma}: mô tả còn câu đệm «{phrase}»"
    if text and (status != "da_xac_minh" or not url.startswith(("http://", "https://"))):
        return f"{ma}: mô tả dài không có nguồn"
    return None


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
    cskh = {
        "CSKH_1_ROLE": "CSKH 1 · Trang",
        "CSKH_1_DISPLAY": "0393 268 399",
        "CSKH_1_TEL": "0393268399",
        "CSKH_1_E164": "+84393268399",
        "CSKH_2_ROLE": "CSKH 2 · Hoàng Anh",
        "CSKH_2_DISPLAY": "0398 269 399",
        "CSKH_2_TEL": "0398269399",
        "CSKH_2_E164": "+84398269399",
    }
    for name, wanted in cskh.items():
        got = assigned(text, name)
        if got is None:
            errors.append(f"generate_catalog_pages.py thiếu hằng {name}")
        elif got != wanted:
            errors.append(f"{name} sai: {got}")
    if ' "telephone": HOTLINE_E164' not in text and '"telephone": HOTLINE_E164' not in text:
        errors.append("schema LocalBusiness phải giữ telephone hotline")
    if "contact_points()" not in text and "contactPoint" not in text:
        errors.append("generator thiếu contactPoint cho số chăm sóc khách hàng")


def check_cskh_surfaces(errors: list[str]) -> None:
    """Hotline cũ vẫn bắt buộc. Hai số CSKH phải có ở trang khách đang in hotline."""
    required = (
        ("CSKH 1 · Trang", "0393 268 399", "tel:0393268399"),
        ("CSKH 2 · Hoàng Anh", "0398 269 399", "tel:0398269399"),
    )
    hotline_bits = ("tel:0335652832", "033 5652 832")
    for path in iter_html():
        rel = path.relative_to(ROOT).as_posix()
        if rel in STAFF_HTML:
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        if "tel:0335652832" not in text:
            continue
        for bit in hotline_bits:
            if bit not in text:
                errors.append(f"{rel}: mất hotline ({bit})")
                break
        for role, display, tel in required:
            if role not in text or display not in text or tel not in text:
                errors.append(f"{rel}: thiếu {role} ({display}, {tel})")
                break
    for rel in ("index.html", "lien-he.html"):
        text = (ROOT / rel).read_text(encoding="utf-8")
        if '"telephone": "+84335652832"' not in text and '"telephone":"+84335652832"' not in text:
            errors.append(f"{rel}: schema mất telephone hotline")
        if "+84393268399" not in text or "+84398269399" not in text:
            errors.append(f"{rel}: schema thiếu contactPoint CSKH")
        if "phuoc hai" in fold_vn(text):
            errors.append(f"{rel}: còn địa chỉ Phước Hải")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    reach = re.search(r"<!-- vp-reach -->.*?<!-- /vp-reach -->", home, re.S)
    reach_text = reach.group(0) if reach else ""
    if (
        "tel:0335652832" not in reach_text
        or "tel:0393268399" not in reach_text
        or "tel:0398269399" not in reach_text
        or "CSKH 1 · Trang" not in reach_text
        or "CSKH 2 · Hoàng Anh" not in reach_text
    ):
        errors.append("index.html: cụm gọi nổi thiếu hotline hoặc hai số CSKH")
    nav = re.search(r"<!-- vp-cskh-nav -->.*?<!-- /vp-cskh-nav -->", home, re.S)
    nav_text = nav.group(0) if nav else ""
    if (
        "tel:0393268399" not in nav_text
        or "tel:0398269399" not in nav_text
        or "CSKH 1 · Trang" not in nav_text
        or "CSKH 2 · Hoàng Anh" not in nav_text
    ):
        errors.append("index.html: thanh header thiếu hai số CSKH")
    if "Gọi hotline" not in home or "btn-zalo" not in home:
        errors.append("index.html: mất nút Gọi hotline hoặc Zalo")


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
    if description_problem("VP0", "Dùng để viết hoặc châm mực") is None:
        raise SystemExit("self-test: chuỗi mô tả cũ phải bị chặn")
    if description_problem(
        "VP0",
        {"mo_ta": "Có chữ nhưng không nguồn.", "nguon_url": "", "trang_thai": "da_xac_minh"},
    ) is None:
        raise SystemExit("self-test: mô tả dài không nguồn phải bị chặn")
    if description_problem(
        "VP0",
        {
            "mo_ta": "Dùng để viết hoặc châm mực.",
            "nguon_url": "https://example.com/pen",
            "trang_thai": "da_xac_minh",
        },
    ) is None:
        raise SystemExit("self-test: câu đệm phải bị chặn dù có URL")
    if description_problem(
        "VP0",
        {"mo_ta": "", "nguon_url": "", "trang_thai": "cho_xac_minh"},
    ) is not None:
        raise SystemExit("self-test: bản ghi chờ xác minh bị chặn nhầm")
    if description_problem(
        "VP0",
        {"mo_ta": "Kim bấm 24/6.", "nguon_url": "https://example.com/kim", "trang_thai": "da_xac_minh"},
    ) is not None:
        raise SystemExit("self-test: mô tả đã có nguồn bị chặn nhầm")


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


def check_product_descriptions(errors: list[str]) -> None:
    path = ROOT / "data" / "descriptions.json"
    if not path.is_file():
        errors.append("thiếu data/descriptions.json")
        return
    try:
        records = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError as exc:
        errors.append(f"data/descriptions.json không đọc được: {exc}")
        return
    if not isinstance(records, dict):
        errors.append("data/descriptions.json phải là object mã → bản ghi")
        return
    products = json.loads((ROOT / "data" / "products.json").read_text(encoding="utf-8"))
    published = {
        str(item.get("ma") or "").strip()
        for item in products.get("sanpham") or []
        if str(item.get("ma") or "").strip()
    }
    for ma, rec in records.items():
        problem = description_problem(str(ma), rec)
        if problem:
            errors.append("data/descriptions.json: " + problem)
    missing = sorted(published - set(records))
    if missing:
        errors.append("data/descriptions.json thiếu mã: " + ", ".join(missing[:12]))
    extra = sorted(set(records) - published)
    if extra:
        errors.append("data/descriptions.json có mã không phát hành: " + ", ".join(extra[:12]))
    for page in (ROOT / "san-pham").glob("vp*.html"):
        text = page.read_text(encoding="utf-8", errors="replace")
        for phrase in DESCRIPTION_FILLER:
            if phrase in text:
                errors.append(f"{page.relative_to(ROOT).as_posix()}: còn câu đệm «{phrase}»")
                break


def check_node_script(errors: list[str], name: str, label: str) -> None:
    script = ROOT / "scripts" / name
    if not script.is_file():
        errors.append(f"thiếu scripts/{name}")
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
        errors.append(f"không có node để chạy scripts/{name}")
        return
    except subprocess.TimeoutExpired:
        errors.append(f"scripts/{name} quá thời gian")
        return
    if proc.returncode != 0:
        detail = ((proc.stdout or "") + (proc.stderr or "")).strip()
        errors.append(f"{label} lỗi:\n" + (detail or f"exit {proc.returncode}"))


def check_chat_search(errors: list[str]) -> None:
    check_node_script(errors, "test_chat_search.js", "test tìm chat")
    check_node_script(errors, "test_cart_quote.js", "test giỏ giá 0")
    check_node_script(errors, "test_chat_reset.js", "test xóa chat")
    check_node_script(errors, "test_sw_strategy.js", "test chiến lược service worker")


CHAT_WIDGET_RE = re.compile(r"chat-widget\.js\?v=(\d+)")
STAFF_HTML = {"nhan-vien.html", "nhan-vien/index.html"}


def check_chat_widget_cache(errors: list[str]) -> None:
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    version_m = re.search(r'const VERSION = "(\d+)"', sw)
    if not version_m:
        errors.append("sw.js thiếu const VERSION")
        return
    version = version_m.group(1)
    if 'const SHELL = "vp-shell-" + VERSION' not in sw:
        errors.append("sw.js SHELL không gắn VERSION")
    if 'const PAGES = "vp-pages-" + VERSION' not in sw or 'const IMAGES = "vp-img-" + VERSION' not in sw:
        errors.append("sw.js PAGES/IMAGES không gắn VERSION")
    if "keys.filter((key) => !keep.has(key)).map((key) => caches.delete(key))" not in sw:
        errors.append("sw.js activate không xóa cache ngoài bộ keep")
    keep = {f"vp-shell-{version}", f"vp-pages-{version}", f"vp-img-{version}"}
    previous = "2026101727" if version != "2026101727" else "2026101726"
    if version == "2026101727":
        errors.append("sw.js VERSION cần tăng sau khi chat-widget.js chuyển network-first")
    if "chooseFetchStrategy" not in sw or "chat-network-first" not in sw:
        errors.append("sw.js thiếu chiến lược network-first cho chat-widget.js")
    if "CHAT_NETWORK_TIMEOUT_MS = 3000" not in sw:
        errors.append("sw.js timeout chat phải khoảng 3 giây")
    if "ignoreSearch: true" not in sw:
        errors.append("sw.js chưa khớp chat-widget.js theo pathname, bỏ query")
    if 'CHAT_NETWORK_FIRST_PATHS = ["/js/chat-widget.js", "/css/chat-widget.css"]' not in sw:
        errors.append("sw.js phải network-first cho chat-widget.js và css/chat-widget.css")
    if '"/css/chat-widget.css"' not in sw:
        errors.append("sw.js chưa precache css/chat-widget.css")
    stale = [f"vp-shell-{previous}", f"vp-pages-{previous}", f"vp-img-{previous}"]
    if [name for name in stale if name not in keep] != stale:
        errors.append("SW mới không xóa cache VERSION cũ khi activate")
    chat_versions = CHAT_WIDGET_RE.findall(sw)
    if len(set(chat_versions)) != 1:
        errors.append("sw.js phải có đúng một chat-widget.js?v")
        return
    expected = chat_versions[0]
    missing: list[str] = []
    mismatched: list[str] = []
    for path in iter_html():
        rel = path.relative_to(ROOT).as_posix()
        found = set(CHAT_WIDGET_RE.findall(path.read_text(encoding="utf-8", errors="replace")))
        if not found:
            if rel not in STAFF_HTML:
                missing.append(rel)
            continue
        if found != {expected}:
            mismatched.append(f"{rel} ({', '.join(sorted(found))})")
    if missing:
        errors.append("trang thiếu chat-widget.js?v: " + ", ".join(missing[:8]))
    if mismatched:
        errors.append(f"chat-widget.js?v lệch sw.js ({expected}): " + ", ".join(mismatched[:8]))
    widget = (ROOT / "js" / "chat-widget.js").read_text(encoding="utf-8")
    if '"aria-label": "Xóa nội dung chat"' not in widget:
        errors.append("js/chat-widget.js thiếu aria-label Xóa nội dung chat")
    if "/css/chat-widget.css" not in widget or "ensureChatCss" not in widget:
        errors.append("js/chat-widget.js chưa tự nạp css/chat-widget.css")
    shared = (ROOT / "css" / "styles.css").read_text(encoding="utf-8")
    if ".vp-chat-panel {" in shared or ".vp-chat-header {" in shared:
        errors.append("style khung chat còn trong css/styles.css")
    css_path = ROOT / "css" / "chat-widget.css"
    if not css_path.is_file():
        errors.append("thiếu css/chat-widget.css")
        return
    css = css_path.read_text(encoding="utf-8")
    block = re.search(r"\.vp-chat-clear\s*\{([^}]+)\}", css)
    if not block or "min-height: 40px" not in block.group(1) or "min-width: 40px" not in block.group(1):
        errors.append("nút .vp-chat-clear chưa đủ vùng bấm 40px")
    if ".vp-chat-panel {" not in css or ".vp-chat-dock {" not in css:
        errors.append("css/chat-widget.css thiếu khung chat")


def main() -> None:
    self_test()
    errors: list[str] = []
    skus = load_excluded_skus()
    product_count = check_excluded(errors, skus)
    cards = check_lightbox(errors)
    check_boundaries(errors)
    check_company(errors)
    check_cskh_surfaces(errors)
    check_zero_price_pages(errors)
    check_product_descriptions(errors)
    check_chat_search(errors)
    check_chat_widget_cache(errors)
    if errors:
        fail(errors)
    print(
        f"OK: {product_count} sản phẩm trên web, {len(skus)} mã loại trừ không xuất hiện, "
        f"{cards} thẻ có lightbox."
    )


if __name__ == "__main__":
    main()
