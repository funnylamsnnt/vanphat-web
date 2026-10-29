#!/usr/bin/env python3
"""Build indexable lĩnh vực, category, and product HTML, plus sitemap and path map.

Reads data/products.json. Lĩnh vực and nhóm come from the linh_vuc[] / nhom[]
config embedded by scripts/sync_products_from_excel.py (source: data/ia.json).
The UI is rendered from that array — adding a domain does not require a new
hardcoded column.

Canonical nhóm URLs stay /san-pham/nhom-<slug>.html. L1 pages live at
/linh-vuc/<slug>.html. Placeholder nhóm (Bánh) still get a page.

Does not emit customer order-form or Apps Script order links.

    python3 scripts/generate_catalog_pages.py
"""
from __future__ import annotations

import argparse
import html
import json
import re
import unicodedata
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import quote

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://vanphatcompany.vn"
MARKER = "vp-generated-catalog"
CSS_V = "2026102103"
LOGO_NAV_V = "20260925"
JS_V = "2026101721"
# products.js passes thuongHieu / quyCach into the lightbox. Same cache key.
SEARCH_V = "2026101721"
# Widget chat và css/chat-widget.css trong sw.js là network-first theo pathname, bỏ qua query.
# Sửa js/chat-widget.js hoặc css/chat-widget.css không cần tăng CHAT_V hay ?v trên HTML.
CHAT_V = "2026101727"

COMPANY = "CÔNG TY TNHH TƯ VẤN ĐẦU TƯ THƯƠNG MẠI VẠN PHÁT"
ADDRESS = "LK 19-06 Đường số 20 KĐT Mỹ Gia, Phường Nam Nha Trang"
HOTLINE_DISPLAY = "033 5652 832"
HOTLINE_TEL = "0335652832"
HOTLINE_E164 = "+84335652832"
# Hai số chăm sóc khách hàng. Hotline phía trên vẫn là số chính.
CSKH_1_ROLE = "CSKH 1 · Trang"
CSKH_1_DISPLAY = "0393 268 399"
CSKH_1_TEL = "0393268399"
CSKH_1_E164 = "+84393268399"
CSKH_2_ROLE = "CSKH 2 · Hoàng Anh"
CSKH_2_DISPLAY = "0398 269 399"
CSKH_2_TEL = "0398269399"
CSKH_2_E164 = "+84398269399"
EMAIL = "congtytnhhvanphat999@gmail.com"
ZALO_URL = "https://zalo.me/0335652832"
BANK_LINE = "Agribank · STK 4703201014329"
OG_IMAGE = f"{SITE}/assets/og.jpg"
# Real storefront photo (portrait, long edge 1200). Logo stays assets/og.jpg.
STOREFRONT_STEM = "mat-tien-van-phat-van-phong-pham-my-gia-nha-trang"
STOREFRONT_W = 801
STOREFRONT_H = 1200
STOREFRONT_ALT = (
    "Mặt tiền cửa hàng Vạn Phát tại KĐT Mỹ Gia, Nam Nha Trang"
    " — văn phòng phẩm, nước uống, điện gia dụng và photocopy"
)
STOREFRONT_IMAGE = f"{SITE}/assets/{STOREFRONT_STEM}.jpg"
# Same file as schema image. Query only busts sitemap/HTML caches after the sign text edit.
STOREFRONT_CACHE = "2026101719"
# Pin measured for the published Mỹ Gia address. Do not swap in another street line.
GEO_LAT = "12.237790072249387"
GEO_LNG = "109.16637827055754"
ORG_ID = f"{SITE}/#organization"

# Search Console HTML-tag token. Set this one value and rerun the generator to
# insert the google-site-verification meta on the homepage and every other page.
# An empty string omits the tag.
GOOGLE_SITE_VERIFICATION = "lyjjIzdcmnmzSuzgiR2wFDZt0k5mxWQpp75Gn40XFFE"

# Ghi chú thuế in dưới giá khi SKU có giá. Chuỗi rỗng = không hiện.
# Chưa điền câu: chữ chờ anh Hà duyệt. Không tự viết thuế, vận chuyển hay đổi trả.
VAT_NOTE = ""

# Public profile URLs (Facebook page, Zalo OA, Google Maps place). Leave empty
# until the owner supplies them — do not invent profiles.
SAME_AS: list[str] = []
# Pin confirmed 15/10/2026 for the published address (KĐT Mỹ Gia). The site has
# no posted opening hours, so OPENING_HOURS stays unset and is omitted.
GEO = {"latitude": GEO_LAT, "longitude": GEO_LNG}
OPENING_HOURS = None

DESCRIPTIONS_PATH = ROOT / "data" / "descriptions.json"
LOCAL_PAGES_PATH = ROOT / "data" / "local-pages.json"
LOCAL_LINKS_START = "<!-- vp-local-links -->"
LOCAL_LINKS_END = "<!-- /vp-local-links -->"
_DESCRIPTION_BY_MA: dict[str, dict] = {}

# Product <title> aims at ~65 characters and may run to this hard cap so a full
# product name is not chopped for two extra characters.
TITLE_TARGET = 65
TITLE_MAX = 70

MAPS_QUERY = f"{GEO_LAT},{GEO_LNG}"
MAPS_URL = f"https://www.google.com/maps/search/?api=1&query={MAPS_QUERY}"
MAPS_DIR_URL = f"https://www.google.com/maps/dir/?api=1&destination={MAPS_QUERY}"
MAPS_EMBED_SRC = (
    "https://maps.google.com/maps?q="
    + quote(MAPS_QUERY)
    + "&hl=vi&z=17&output=embed"
)
# May 2025 capture on Đường số 20, the view anh Hà picked (not the July 2022 default).
# The address-bar id mixes l/U; metadata id is g-5g616SRGZtJMjpFNK1Jg, dated 2025-05,
# camera 12.237753056286802, 109.16614638042242. Heading 67.85, tilt 87.84 => pitch -2.16, fov 90.
# Embed zoom 1 is the Maps equivalent of a 90° field of view. Do not drop the pano id.
STREETVIEW_PANO = "g-5g616SRGZtJMjpFNK1Jg"
STREETVIEW_HEADING = "67.85"
STREETVIEW_PITCH = "-2.16"
STREETVIEW_PANO_LAT = "12.237753056286802"
STREETVIEW_PANO_LNG = "109.16614638042242"
STREETVIEW_URL = (
    "https://www.google.com/maps/@?api=1&map_action=pano"
    f"&pano={STREETVIEW_PANO}&heading={STREETVIEW_HEADING}"
    f"&pitch={STREETVIEW_PITCH}&fov=90"
)
STREETVIEW_EMBED_SRC = (
    "https://www.google.com/maps/embed?pb=!1m0!3m2!1svi!2svn!6m8!1m7!1s"
    f"{STREETVIEW_PANO}!2m2!1d{STREETVIEW_PANO_LAT}!2d{STREETVIEW_PANO_LNG}"
    f"!3f{STREETVIEW_HEADING}!4f{STREETVIEW_PITCH}!5f1&hl=vi"
)
FONT_MAIN = "assets/fonts/be-vietnam-pro-400.woff2"
LOGO_TAGLINE = "Văn phòng phẩm · Nước uống & Bánh · Điện gia dụng"
_DRIVE_IMAGE = re.compile(r"^(https://lh3\.googleusercontent\.com/d/[A-Za-z0-9_-]+)")
CARD_IMAGE_W = 480
HERO_IMAGE_W = 800

# Fallback blurbs when a nhóm has no moTa in config.
GROUP_BLURB = {
    "Giấy": "Giấy in, giấy photo và sổ dùng cho văn phòng — gồm giấy A4, A5 và các loại sổ tại cửa hàng Mỹ Gia.",
    "Bìa Hồ Sơ": "Bìa hồ sơ, bìa còng, bìa lỗ và file đựng tài liệu cho cơ quan, cửa hàng ở Nam Nha Trang.",
    "Bút & Mực": "Bút bi, bút gel, mực và dạ quang — bổ sung văn phòng phẩm định kỳ.",
    "Băng Keo": "Băng keo trong, đục, simili và băng dính dùng hàng ngày.",
    "Dụng cụ VP": "Kéo, bấm kim, kẹp giấy, máy tính và đồ dùng bàn làm việc.",
    "Điện": "Ổ cắm, pin và thiết bị điện nhỏ phục vụ bàn làm việc.",
    "Nước uống": "Nước suối, nước ngọt và đồ uống cho văn phòng tại Nam Nha Trang.",
    "Bánh": "Bánh cho văn phòng — sắp có hàng, liên hệ để đặt trước.",
}

BANNED_MARKERS = (
    "Đặt hàng online",
    "AKfycbzdcOxIbVAivc2fSCSk1v8go0Wxg",
)

PLACEHOLDER_SVG = (
    "data:image/svg+xml,"
    + quote(
        """<svg xmlns="http://www.w3.org/2000/svg" width="400" height="400" viewBox="0 0 400 400"><rect fill="#EFE9DE" width="400" height="400"/><text x="200" y="210" text-anchor="middle" fill="#5A6577" font-family="sans-serif" font-size="16">Vạn Phát</text></svg>""",
        safe="",
    )
)

STATIC_PAGES = [
    ("/", "weekly", "1.0"),
    ("/san-pham.html", "weekly", "0.9"),
    ("/photocopy.html", "monthly", "0.8"),
    ("/lien-he.html", "monthly", "0.8"),
    ("/thu-ngo.html", "yearly", "0.4"),
    ("/khu-vuc.html", "monthly", "0.7"),
    ("/app/", "monthly", "0.4"),
]

INSTALL_TITLE = "Cài app Vạn Phát trên điện thoại"
INSTALL_DESC = (
    "Cài Vạn Phát lên màn hình Android hoặc iPhone để xem hàng, giữ giỏ và gọi cửa hàng "
    "tại KĐT Mỹ Gia, Nam Nha Trang. In mã QR tại quầy."
)
OFFLINE_TITLE = "Đang mất mạng | Vạn Phát"
OFFLINE_DESC = (
    "Điện thoại đang mất mạng. Vạn Phát giữ khung app, trang đã xem và giỏ hàng trên máy. "
    "Khi có mạng, danh mục và giá được tải mới."
)
PWA_HEAD = """  <meta name="theme-color" content="#1F4E78" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="Vạn Phát" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <link rel="manifest" href="/manifest.webmanifest" />
  <link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png" sizes="180x180" />
"""


def slugify(text: str, max_len: int = 60) -> str:
    s = str(text or "").strip().lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", "-", s).strip("-")
    if max_len:
        s = s[:max_len].strip("-")
    return s


def assert_slug_samples() -> None:
    samples = {
        "Bìa Hồ Sơ": "bia-ho-so",
        "Bút & Mực": "but-muc",
        "Băng Keo": "bang-keo",
        "Dụng cụ VP": "dung-cu-vp",
        "Giấy": "giay",
        "Điện": "dien",
        "Nước uống": "nuoc-uong",
        "Bánh": "banh",
        "Bì hồ sơ A4 (Trắng)": "bi-ho-so-a4-trang",
        "Giấy A4 70 gsm Excel": "giay-a4-70-gsm-excel",
        "Nước suối Aquafina (355ml)": "nuoc-suoi-aquafina-355ml",
        "Phiếu Chi 2 liên khổ 13×19": "phieu-chi-2-lien-kho-13-19",
    }
    for src, expected in samples.items():
        got = slugify(src)
        if got != expected:
            raise SystemExit(f"slug mismatch: {src!r} -> {got!r}, expected {expected!r}")


def esc(value) -> str:
    return html.escape(str(value if value is not None else ""), quote=True)


def price_amount(value) -> int | None:
    """Positive list price, or None when the sheet has 0/empty (contact for price)."""
    try:
        n = int(value)
    except (TypeError, ValueError):
        return None
    if n <= 0:
        return None
    return n


CONTACT_PRICE = "Liên hệ báo giá"


def format_price(value) -> str:
    n = price_amount(value)
    if n is None:
        return CONTACT_PRICE
    return f"{n:,}".replace(",", ".") + " ₫"


def cart_control(product: dict) -> str:
    """Giá 0 hoặc trống không vào giỏ: nút dẫn Zalo. Món có giá giữ nút thêm giỏ."""
    if price_amount(product.get("gia")) is None:
        return (
            f'<a class="btn btn-add-cart" data-add-cart href="{ZALO_URL}" '
            f'target="_blank" rel="noopener">Chat Zalo</a>'
        )
    return '<button type="button" class="btn btn-add-cart" data-add-cart>Thêm vào giỏ</button>'


def display_unit(value) -> str:
    """Đơn vị tính khi in: hoa chữ đầu, phần còn lại giữ nguyên. Rỗng thì chuỗi rỗng."""
    unit = re.sub(r"\s+", " ", str(value or "")).strip()
    if not unit:
        return ""
    return unit[:1].upper() + unit[1:]


def format_price_line(product: dict) -> str:
    """Giá kèm đơn vị khi có giá. Không có giá thì chỉ câu liên hệ, không gắn đơn vị."""
    if price_amount(product.get("gia")) is None:
        return CONTACT_PRICE
    price = format_price(product.get("gia"))
    unit = display_unit(product.get("dvt"))
    if not unit:
        return price
    return f"{price} / {unit}"


def availability_iri(product: dict) -> str | None:
    """schema.org availability from catalog tồn (`ton`).

    The sheet stores on-hand quantity. Above zero is InStock. Zero or negative
    (nothing on hand, including oversold counts) is OutOfStock. A missing tồn
    omits availability instead of claiming stock we cannot see.
    """
    if "ton" not in product or product.get("ton") is None:
        return None
    try:
        n = int(product.get("ton"))
    except (TypeError, ValueError):
        return None
    if n > 0:
        return "https://schema.org/InStock"
    return "https://schema.org/OutOfStock"


def fold_brand(text: str) -> str:
    s = str(text or "").lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"[^a-z0-9]+", " ", s).strip()
    return f" {s} "


# Manufacturer phrases that actually show up in product names. The longest
# contained phrase wins, so "IK Plus" beats "Plus" and "Thiên Long" beats a
# trailing PLUS line. Vạn Phát is the seller, never a product brand.
BRAND_PHRASES: tuple[tuple[str, str], ...] = (
    ("koh i noor", "Koh-I-Noor"),
    ("flex office", "Flexoffice"),
    ("flexoffice", "Flexoffice"),
    ("coca cola", "Coca-Cola"),
    ("paper one", "Paper One"),
    ("thien long", "Thiên Long"),
    ("double a", "Double A"),
    ("king jim", "King Jim"),
    ("khong do", "Không Độ"),
    ("red bull", "Red Bull"),
    ("nutriboost", "Nutriboost"),
    ("aquafina", "Aquafina"),
    ("lipovitan", "Lipovitan"),
    ("energizer", "Energizer"),
    ("panasonic", "Panasonic"),
    ("paperline", "Paperline"),
    ("smartkids", "Smartkids"),
    ("wonderful", "Wonderful"),
    ("hai tien", "Hải Tiến"),
    ("tien phat", "Tiến Phát"),
    ("thanh phat", "Thành Phát"),
    ("viet duc", "Việt Đức"),
    ("my clear", "My Clear"),
    ("uni ball", "Uni-ball"),
    ("kw trio", "KW-Trio"),
    ("ik plus", "IK Plus"),
    ("g star", "G-Star"),
    ("7 up", "7 Up"),
    ("elephant", "Elephant"),
    ("unibal", "Uni-ball"),
    ("kwtrio", "KW-Trio"),
    ("gstar", "G-Star"),
    ("redbull", "Red Bull"),
    ("camellia", "Camellia"),
    ("pronoti", "Pronoti"),
    ("slecho", "Slecho"),
    ("stacom", "Stacom"),
    ("xukiva", "Xukiva"),
    ("pentel", "Pentel"),
    ("maxell", "Maxell"),
    ("supreme", "Supreme"),
    ("smartis", "Smartis"),
    ("natural", "Natural"),
    ("quality", "Quality"),
    ("mirinda", "Mirinda"),
    ("aquarius", "Aquarius"),
    ("vikoda", "Vikoda"),
    ("revive", "Revive"),
    # "plastic" is a material (ép plastic) or a Pilot model word (BP-1RT),
    # not a manufacturer. Guessing it branded VP111–VP113 and VP456–VP459
    # as Plastic. The sheet column Thương Hiệu is the brand when it is set.
    ("bitex", "Bitex"),
    ("kanex", "Kanex"),
    ("maped", "Maped"),
    ("shini", "Shini"),
    ("pulppy", "Pulppy"),
    ("depai", "Depai"),
    ("aimee", "Aimee"),
    ("batos", "Batos"),
    ("sanna", "Sanna"),
    ("lavie", "Lavie"),
    ("pepsi", "Pepsi"),
    ("sting", "Sting"),
    ("excel", "Excel"),
    ("horse", "Horse"),
    ("eagle", "Eagle"),
    ("queen", "Queen"),
    ("deli", "Deli"),
    ("plus", "Plus"),
    ("trio", "KW-Trio"),
    ("vivo", "Vivo"),
    ("lioa", "Lioa"),
    ("acco", "Acco"),
    ("sdi", "SDI"),
    ("mic", "Mic"),
    ("win", "Win"),
    ("kip", "KIP"),
    ("fo", "Flexoffice"),
    ("tl", "Thiên Long"),
    ("c2", "C2"),
)


def derive_brand(name: str) -> str | None:
    folded = fold_brand(name)
    best: tuple[int, int, str] | None = None
    for phrase, label in BRAND_PHRASES:
        idx = folded.find(f" {phrase} ")
        if idx < 0:
            continue
        cand = (len(phrase), -idx, label)
        if best is None or cand[:2] > best[:2]:
            best = cand
    if best is None or best[2] in {"Vạn Phát", "Van Phat"}:
        return None
    return best[2]


def stated_brand(product: dict) -> str | None:
    """Trimmed Thương Hiệu from the sheet. Blank means the column was empty."""
    value = re.sub(r"\s+", " ", str((product or {}).get("thuongHieu") or "")).strip()
    if not value or value in {"Vạn Phát", "Van Phat"}:
        return None
    return value


def product_brand(product: dict) -> str | None:
    """Use cột Thương Hiệu when it is present. Otherwise guess from the name."""
    stated = stated_brand(product)
    if stated:
        return stated
    return derive_brand(str((product or {}).get("ten") or ""))


def source_name_key(name: str) -> str:
    return re.sub(r"\s+", " ", str(name or "")).strip().casefold()


def duplicate_source_name_keys(products: list[dict]) -> set[str]:
    """Tên nguồn xuất hiện từ hai mã trở lên. Không đổi tên trong dữ liệu."""
    counts: dict[str, int] = {}
    for product in products:
        key = source_name_key(product.get("ten") or "")
        if not key:
            continue
        counts[key] = counts.get(key, 0) + 1
    return {key for key, count in counts.items() if count >= 2}


def product_seo_title(name: str, group: str, code: str | None = None) -> str:
    """Product name + nhóm + Nha Trang, kept near 65 characters.

    Khi hai mã trùng tên nguồn, `code` được gắn vào title để hết trùng.
    Tên trong data/products.json không đổi.
    """
    name = re.sub(r"\s+", " ", str(name or "Sản phẩm")).strip()
    group = re.sub(r"\s+", " ", str(group or "")).strip()
    code = re.sub(r"\s+", "", str(code or "")).strip().upper()
    local = "Nha Trang"
    suffix = f" | {group} {local}" if group else f" | {local}"
    tail = f" {code}" if code else ""
    full = f"{name}{tail}{suffix}"
    if len(full) <= TITLE_MAX:
        return full
    room = TITLE_MAX - len(suffix) - len(tail)
    if room < 12:
        suffix = f" | {local}"
        room = TITLE_MAX - len(suffix) - len(tail)
    return f"{clip(name, max(room, 8))}{tail}{suffix}"


def group_seo_title(nhom: str) -> str:
    """Nhóm page title with local signal, under TITLE_MAX."""
    nhom = re.sub(r"\s+", " ", str(nhom or "Nhóm")).strip()
    full = f"{nhom} Nha Trang | Vạn Phát"
    if len(full) <= TITLE_MAX:
        return full
    short = f"{nhom} | Vạn Phát"
    if len(short) <= TITLE_MAX:
        return short
    return clip(short, TITLE_MAX)


def linh_vuc_seo_title(ten: str) -> str:
    ten = re.sub(r"\s+", " ", str(ten or "Lĩnh vực")).strip()
    full = f"{ten} Nha Trang | Vạn Phát"
    if len(full) <= TITLE_MAX:
        return full
    short = f"{ten} | Vạn Phát"
    return short if len(short) <= TITLE_MAX else clip(short, TITLE_MAX)


# Câu ghép sẵn, không có web hãng hay cột Excel. Không được vào mô tả dài.
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


def description_has_filler(text: str) -> bool:
    return any(phrase in str(text or "") for phrase in DESCRIPTION_FILLER)


def verified_long_text(ma: str) -> str:
    """Mô tả dài chỉ khi đã xác minh và có URL nguồn. Không thì chuỗi rỗng."""
    rec = _DESCRIPTION_BY_MA.get(str(ma or ""))
    if not isinstance(rec, dict) or rec.get("trang_thai") != "da_xac_minh":
        return ""
    url = str(rec.get("nguon_url") or "").strip()
    text = re.sub(r"\s+", " ", str(rec.get("mo_ta") or "")).strip()
    if not text or not url.startswith(("http://", "https://")) or description_has_filler(text):
        return ""
    return text


def product_seo_description(product: dict, group: str) -> str:
    """Meta chỉ từ dữ liệu catalog. Câu đệm không có nguồn không được vào thẻ."""
    name = re.sub(r"\s+", " ", str(product.get("ten") or "Sản phẩm")).strip()
    group = re.sub(r"\s+", " ", str(group or "")).strip()
    bits = [name + "."]
    if group:
        bits.append(f"Nhóm {group}.")
    brand = product_brand(product)
    if brand:
        bits.append(f"Thương hiệu {brand}.")
    quy_cach = quy_cach_text(product)
    if quy_cach:
        bits.append(f"Quy cách {quy_cach}.")
    unit = display_unit(product.get("dvt"))
    if unit:
        bits.append(f"Đơn vị tính {unit}.")
    if price_amount(product.get("gia")) is None:
        bits.append("Giá: Liên hệ báo giá.")
    else:
        bits.append(f"Giá {format_price_line(product)}.")
    bits.append(f"Hotline {HOTLINE_DISPLAY}.")
    long = verified_long_text(str(product.get("ma") or ""))
    body = f"{long} {' '.join(bits)}" if long else " ".join(bits)
    return clip(body)


# Nước uống các hãng này: title/meta nêu dung tích, giá niêm yết và giao tại Nha Trang.
# Chỉ nhóm Nước uống. Bấm kim KW-triO / Trio thuộc Dụng cụ VP, không đi vào đây.
LOCAL_DRINK_BRANDS = ("sting", "aquarius", "trio")
DRINK_TITLE_FLOOR = 58
DRINK_DESC_WITH_STORE = 162
DRINK_DESC_WITH_ADDRESS = 165


def _folded_has_word(folded: str, word: str) -> bool:
    return re.search(rf"(?<![a-z0-9]){re.escape(word)}(?![a-z0-9])", folded) is not None


def is_local_delivery_drink(product: dict) -> bool:
    """Sting, Aquarius, Trio trong nhóm Nước uống. Không đụng dụng cụ KW-triO."""
    if str((product or {}).get("nhom") or "") != "Nước uống":
        return False
    brand = fold_text(stated_brand(product) or "")
    name = fold_text((product or {}).get("ten") or "")
    blob = f"{brand} {name}".strip()
    return any(_folded_has_word(blob, key) for key in LOCAL_DRINK_BRANDS)


def volume_ml_label(product: dict) -> str:
    """Dung tích ml có trong tên hoặc cột quy cách. Không suy ra số khác."""
    blob = f"{(product or {}).get('quyCach') or ''} {(product or {}).get('ten') or ''}"
    match = re.search(r"(\d+(?:[.,]\d+)?)\s*ml\b", blob, re.I)
    if not match:
        return ""
    return match.group(1).replace(",", ".") + "ml"


def _clip_words(text: str, limit: int) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text) <= limit:
        return text
    cut = text[:limit].rsplit(" ", 1)[0].strip()
    return cut or text[:limit].strip()


def drink_short_heading(product: dict) -> str:
    """Tên ngắn cho title: giữ biến thể trong tên, không thêm từ ngoài dữ liệu."""
    raw = re.sub(r"\s+", " ", str(product.get("ten") or "Sản phẩm")).strip()
    folded = fold_text(raw)
    less_sugar = "it duong" in folded
    zero = "zero calorie" in folded
    mineral = _folded_has_word(folded, "khoang")
    sport = "van dong" in folded
    container = ""
    if _folded_has_word(folded, "lon"):
        container = "lon"
    elif _folded_has_word(folded, "chai"):
        container = "chai"
    core = re.sub(r"\([^)]*\)", " ", raw)
    core = re.sub(r"(?i)\d+(?:[.,]\d+)?\s*ml\b", " ", core)
    core = re.sub(
        r"(?i)^nước(?:\s+(?:ngọt|khoáng|uống vận động|tinh khiết|tăng lực))?\s+",
        "",
        core,
    )
    core = re.sub(r"(?i)\b(lon|chai)\b", " ", core)
    core = re.sub(r"[/|]+", " ", core)
    core = re.sub(r"\s+", " ", core).strip(" -/|")
    low = fold_text(core)
    bits = [core] if core else []
    if less_sugar and "it duong" not in low:
        bits.append("ít đường")
    if zero and "zero calorie" not in low:
        bits.append("Zero Calorie")
    if mineral and "khoang" not in low:
        bits.append("khoáng")
    if sport and "van dong" not in low:
        bits.append("vận động")
    joined = fold_text(" ".join(bits))
    if container and container not in joined:
        bits.append(container)
    vol = volume_ml_label(product)
    if vol:
        bits.append(vol)
    heading = re.sub(r"\s+", " ", " ".join(bit for bit in bits if bit)).strip()
    return heading or raw


def drink_delivery_title(product: dict) -> str:
    """Title ~60 ký tự: dung tích, giá nếu có, và «giao tận nơi Nha Trang»."""
    if not is_local_delivery_drink(product):
        return ""
    head = drink_short_heading(product)
    amount = price_amount(product.get("gia"))
    price = format_price(amount) if amount is not None else ""
    tail = "giao tận nơi Nha Trang"

    def build(heading: str) -> str:
        if price:
            return f"{heading}, {price}, {tail}"
        return f"{heading}, {tail}"

    title = build(head)
    if len(title) < DRINK_TITLE_FLOOR and not fold_text(head).startswith("nuoc "):
        candidate = build(f"Nước {head}")
        if len(candidate) <= 66:
            title = candidate
    if len(title) > TITLE_MAX:
        used = title.split(",", 1)[0]
        room = TITLE_MAX - (len(title) - len(used))
        title = build(_clip_words(used, max(room, 8)))
    return title


def drink_delivery_description(product: dict) -> str:
    """Meta ~155 ký tự. Thiếu giá thì bỏ phần giá. Không bịa dung tích."""
    if not is_local_delivery_drink(product):
        return ""
    name = re.sub(r"\s+", " ", str(product.get("ten") or "Sản phẩm")).strip()
    vol = volume_ml_label(product)
    amount = price_amount(product.get("gia"))
    bits = [name + "."]
    facts: list[str] = []
    if vol:
        facts.append(f"Dung tích {vol}")
    if amount is not None:
        facts.append(f"giá {format_price(amount)}")
    if facts:
        bits.append(", ".join(facts) + ".")
    bits.append("Vạn Phát giao tận nơi Nha Trang.")
    base = " ".join(bits)
    with_store = f"{base} Cửa hàng {ADDRESS}."
    if len(with_store) <= DRINK_DESC_WITH_STORE:
        return with_store
    with_address = f"{base} {ADDRESS}."
    if len(with_address) <= DRINK_DESC_WITH_ADDRESS:
        return with_address
    return base


def offer_node(product: dict, canonical: str) -> dict | None:
    amount = price_amount(product.get("gia"))
    if amount is None:
        return None
    offer = {
        "@type": "Offer",
        "url": canonical,
        "priceCurrency": "VND",
        "price": str(amount),
        "priceSpecification": {
            "@type": "UnitPriceSpecification",
            "price": str(amount),
            "priceCurrency": "VND",
        },
        "seller": {"@id": ORG_ID},
    }
    avail = availability_iri(product)
    if avail:
        offer["availability"] = avail
    return offer


def clip(text: str, limit: int = 158) -> str:
    text = re.sub(r"\s+", " ", str(text or "")).strip()
    if len(text) <= limit:
        return text
    cut = text[: limit - 1]
    if " " in cut:
        cut = cut.rsplit(" ", 1)[0]
    return cut.rstrip(".,;:—–-") + "…"


def ld_script(data) -> str:
    raw = json.dumps(data, ensure_ascii=False, separators=(",", ":")).replace("<", "\\u003c")
    return f'  <script type="application/ld+json">{raw}</script>'


def cskh_rows() -> tuple[dict[str, str], ...]:
    return (
        {
            "role": CSKH_1_ROLE,
            "display": CSKH_1_DISPLAY,
            "tel": CSKH_1_TEL,
            "e164": CSKH_1_E164,
            "name": "Trang",
        },
        {
            "role": CSKH_2_ROLE,
            "display": CSKH_2_DISPLAY,
            "tel": CSKH_2_TEL,
            "e164": CSKH_2_E164,
            "name": "Hoàng Anh",
        },
    )


def contact_points() -> list[dict]:
    """Hotline giữ telephone gốc. Hai CSKH là contactPoint cùng loại chăm sóc khách."""
    points = [
        {
            "@type": "ContactPoint",
            "telephone": HOTLINE_E164,
            "contactType": "customer service",
            "name": "Hotline",
            "areaServed": "VN",
            "availableLanguage": "Vietnamese",
        }
    ]
    for row in cskh_rows():
        points.append(
            {
                "@type": "ContactPoint",
                "telephone": row["e164"],
                "contactType": "customer service",
                "name": row["name"],
                "description": row["role"],
                "areaServed": "VN",
                "availableLanguage": "Vietnamese",
            }
        )
    return points


def cskh_links_html(kind: str) -> str:
    """Khối bấm gọi. kind: top, foot, card, band. Không phải ô nhập liệu."""
    links = []
    for row in cskh_rows():
        links.append(
            f'<a class="vp-cskh-link" href="tel:{row["tel"]}">'
            f'<span class="vp-cskh-role">{esc(row["role"])}</span>'
            f'<span class="vp-cskh-num">{esc(row["display"])}</span>'
            "</a>"
        )
    return (
        f"<!-- vp-cskh-{kind} -->"
        f'<div class="vp-cskh vp-cskh-{kind}" aria-label="Chăm sóc khách hàng">'
        + "".join(links)
        + "</div>"
        f"<!-- /vp-cskh-{kind} -->"
    )


def contact_cskh_row() -> str:
    return f"""            <div class="contact-row vp-cskh-row">
              <div class="c-icon" aria-hidden="true">☎</div>
              <div>
                <h4>Chăm sóc khách hàng</h4>
                {cskh_links_html("card")}
              </div>
            </div>"""


def organization_node() -> dict:
    node = {
        "@type": ["LocalBusiness", "Store", "Organization"],
        "@id": ORG_ID,
        "name": COMPANY,
        "alternateName": "Vạn Phát",
        "url": SITE + "/",
        "logo": OG_IMAGE,
        "image": STOREFRONT_IMAGE,
        "telephone": HOTLINE_E164,
        "contactPoint": contact_points(),
        "email": EMAIL,
        "address": {
            "@type": "PostalAddress",
            "streetAddress": ADDRESS,
            "addressLocality": "Nha Trang",
            "addressRegion": "Khánh Hòa",
            "addressCountry": "VN",
        },
        "areaServed": ["Nam Nha Trang", "KĐT Mỹ Gia", "Nha Trang"],
        "hasMap": MAPS_URL,
    }
    if SAME_AS:
        node["sameAs"] = list(SAME_AS)
    if GEO:
        node["geo"] = {"@type": "GeoCoordinates", **GEO}
    if OPENING_HOURS:
        node["openingHoursSpecification"] = OPENING_HOURS
    return node


def verification_tag() -> str:
    token = str(GOOGLE_SITE_VERIFICATION or "").strip()
    if not token:
        return ""
    return f'<meta name="google-site-verification" content="{esc(token)}" />'


def head_tags(
    *,
    title: str,
    description: str,
    canonical: str,
    image: str,
    image_alt: str,
    og_type: str,
    robots: str | None = None,
) -> str:
    extra = []
    verify = verification_tag()
    if verify:
        extra.append(f"  {verify}")
    if robots:
        extra.append(f'  <meta name="robots" content="{esc(robots)}" />')
    extra_html = ("\n" + "\n".join(extra)) if extra else ""
    return f"""  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />{extra_html}
  <title>{esc(title)}</title>
  <meta name="description" content="{esc(description)}" />
  <link rel="canonical" href="{esc(canonical)}" />
  <link rel="alternate" hreflang="vi" href="{esc(canonical)}" />
  <meta property="og:locale" content="vi_VN" />
  <meta property="og:type" content="{esc(og_type)}" />
  <meta property="og:site_name" content="Vạn Phát" />
  <meta property="og:title" content="{esc(title)}" />
  <meta property="og:description" content="{esc(description)}" />
  <meta property="og:url" content="{esc(canonical)}" />
  <meta property="og:image" content="{esc(image)}" />
  <meta property="og:image:alt" content="{esc(image_alt)}" />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content="{esc(title)}" />
  <meta name="twitter:description" content="{esc(description)}" />
  <meta name="twitter:image" content="{esc(image)}" />
{PWA_HEAD.rstrip()}"""


def chrome_header(prefix: str) -> str:
    p = prefix
    return f"""  <div class="topbar">
    <div class="container">
      <span>📍 {esc(ADDRESS)}</span>
      <div class="topbar-phones">
        <span class="topbar-hotline">☎ Hotline: <a href="tel:{HOTLINE_TEL}">{esc(HOTLINE_DISPLAY)}</a> · <a href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a></span>
        {cskh_links_html("top")}
      </div>
    </div>
  </div>

  <header class="site-header">
    <div class="container nav">
      <a class="logo" href="{p}index.html" aria-label="Vạn Phát — Trang chủ">
        <img class="logo-img" src="{p}assets/logo-nav.png?v={LOGO_NAV_V}" width="44" height="44" alt="Vạn Phát" />
        <span class="logo-text">Vạn Phát<small>{esc(LOGO_TAGLINE)}</small></span>
      </a>
      <button class="nav-toggle" type="button" aria-label="Mở menu" aria-expanded="false">
        <span></span><span></span><span></span>
      </button>
      <nav class="nav-links" aria-label="Chính">
        <a href="{p}index.html">Trang chủ</a>
        <a href="{p}san-pham.html" class="active">Sản phẩm</a>
        <a href="{p}photocopy.html">Photocopy</a>
        <a href="{p}thu-ngo.html">Thư ngỏ</a>
        <a href="{p}lien-he.html">Liên hệ</a>
      </nav>
      <form class="nav-search" action="{p}san-pham.html" method="get" role="search">
        <input type="search" name="q" placeholder="Tìm mã / tên…" aria-label="Tìm mã hoặc tên sản phẩm" autocomplete="off" />
        <button type="submit" aria-label="Tìm">⌕</button>
      </form>
      <div class="nav-cta">
        <button type="button" class="cart-toggle" data-cart-open aria-label="Mở giỏ hàng">
          🛒<span class="cart-badge" data-cart-badge hidden>0</span>
        </button>
        {nav_cskh_html()}
        <a class="btn btn-zalo btn-sm" href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a>
        <a class="btn btn-outline-navy btn-sm nav-hotline" href="tel:{HOTLINE_TEL}">Gọi hotline</a>
      </div>
    </div>
  </header>"""


def chrome_footer(prefix: str) -> str:
    p = prefix
    return f"""  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="logo" href="{p}index.html" aria-label="Vạn Phát">
            <img class="logo-img logo-img-sm" src="{p}assets/logo-nav.png?v={LOGO_NAV_V}" width="40" height="40" alt="Vạn Phát" />
            <span class="logo-text">Vạn Phát<small>Tư vấn · Đầu tư · Thương mại</small></span>
          </a>
          <p>{esc(COMPANY)} — văn phòng phẩm, nước uống và điện gia dụng tại KĐT Mỹ Gia, Phường Nam Nha Trang.</p>
        </div>
        <div class="footer-col">
          <h4>Liên kết</h4>
          <a href="{p}index.html">Trang chủ</a>
          <a href="{p}san-pham.html">Sản phẩm</a>
          <a href="{p}photocopy.html">Photocopy</a>
          <a href="{p}thu-ngo.html">Thư ngỏ</a>
          <a href="{p}khu-vuc.html">Khu vực phục vụ</a>
          <a href="{p}lien-he.html">Liên hệ</a>
{local_link_block(p)}        </div>
        <div class="footer-col">
          <h4>Liên hệ</h4>
          <p class="footer-nap-name">{esc(COMPANY)}</p>
          <p>{esc(ADDRESS)}</p>
          <a class="footer-hotline" href="tel:{HOTLINE_TEL}">☎ {esc(HOTLINE_DISPLAY)}</a>
          {cskh_links_html("foot")}
          <a href="{ZALO_URL}" target="_blank" rel="noopener">Chat Zalo</a>
          <a href="mailto:{EMAIL}">✉ {esc(EMAIL)}</a>
          <p>{esc(BANK_LINE)}</p>
        </div>
      </div>
      <div class="footer-bottom">
        <span>© 2026 {esc(COMPANY)}</span>
        <span>Hotline: <a href="tel:{HOTLINE_TEL}">{esc(HOTLINE_DISPLAY)}</a></span>
      </div>
    </div>
  </footer>"""


def font_links(prefix: str = "") -> str:
    """Preload the regular face. Other weights load from @font-face in CSS."""
    return f'  <link rel="preload" href="{prefix}{FONT_MAIN}" as="font" type="font/woff2" crossorigin />'


def nav_cskh_html() -> str:
    """Hai số CSKH trên thanh header, nhỏ hơn nút Gọi hotline."""
    links = []
    for row in cskh_rows():
        links.append(
            f'<a class="nav-cskh" href="tel:{row["tel"]}">'
            f'<span class="nav-cskh-role">{esc(row["role"])}</span>'
            f'<span class="nav-cskh-num">{esc(row["display"])}</span>'
            "</a>"
        )
    return (
        "<!-- vp-cskh-nav -->"
        '<span class="nav-cskh-group" aria-label="Chăm sóc khách hàng">'
        + "".join(links)
        + "</span><!-- /vp-cskh-nav -->"
    )


def reach_html() -> str:
    pills = []
    for row in cskh_rows():
        pills.append(
            f'<a class="vp-reach-cskh" href="tel:{row["tel"]}">'
            f'<span class="vp-reach-role">{esc(row["role"])}</span>'
            f'<span class="vp-reach-num">{esc(row["display"])}</span>'
            "</a>"
        )
    return f"""<!-- vp-reach -->
  <nav class="vp-reach" aria-label="Liên hệ nhanh">
    <a class="vp-reach-call" href="tel:{HOTLINE_TEL}">☎ Gọi {esc(HOTLINE_DISPLAY)}</a>
    {"".join(pills)}
    <a class="vp-reach-zalo" href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a>
  </nav>
<!-- /vp-reach -->"""


def scripts(prefix: str) -> str:
    p = prefix
    return f"""  <script defer src="{p}js/main.js?v={CSS_V}"></script>
  <script defer src="{p}js/cart.js"></script>
  <script defer src="{p}js/catalog-paths.js?v={CSS_V}"></script>
  <script defer src="{p}js/ia.js?v={SEARCH_V}"></script>
  <script defer src="{p}js/product-lightbox.js?v={JS_V}"></script>
  <script defer src="{p}js/chat-widget.js?v={CHAT_V}"></script>"""


def breadcrumb_html(items: list[tuple[str, str | None]]) -> str:
    parts = ['<nav class="breadcrumb breadcrumb-dark" aria-label="Breadcrumb">']
    for i, (label, href) in enumerate(items):
        if i:
            parts.append('<span aria-hidden="true">/</span>')
        if href:
            parts.append(f'<a href="{esc(href)}">{esc(label)}</a>')
        else:
            parts.append(f'<span aria-current="page">{esc(label)}</span>')
    parts.append("</nav>")
    return "".join(parts)


def breadcrumb_ld(items: list[tuple[str, str]]) -> dict:
    return {
        "@type": "BreadcrumbList",
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": i + 1,
                "name": name,
                "item": url,
            }
            for i, (name, url) in enumerate(items)
        ],
    }


def image_src(product: dict | None) -> str:
    src = str((product or {}).get("anh") or "").strip()
    return src or PLACEHOLDER_SVG


def sized_drive_image(url: str, width: int, webp: bool) -> str:
    """Resize Drive-hosted photos at request time. `-rw` asks for WebP; the
    unsuffixed `=wN` URL is the JPEG fallback. Other hosts are unchanged.
    """
    raw = str(url or "").strip()
    match = _DRIVE_IMAGE.match(raw)
    if not match:
        return raw
    suffix = f"=w{int(width)}" + ("-rw" if webp else "")
    return match.group(1) + suffix


def product_picture(
    src: str,
    alt: str,
    width: int,
    height: int,
    *,
    loading: str,
    fetchpriority: str | None = None,
) -> str:
    """One request: WebP `=wN-rw` in src, JPEG `=wN` only if that fails."""
    request_w = HERO_IMAGE_W if loading == "eager" else CARD_IMAGE_W
    webp = sized_drive_image(src, request_w, True)
    fallback = sized_drive_image(src, request_w, False) or src
    priority = f' fetchpriority="{fetchpriority}"' if fetchpriority else ""
    shown = webp or fallback
    if webp and webp != fallback:
        handler = (
            "if(!this.dataset.fb){this.dataset.fb='1';this.src='"
            + esc(fallback)
            + "'}else{VanPhat.onImgError(this)}"
        )
    else:
        handler = "VanPhat.onImgError(this)"
    return (
        f'<img src="{esc(shown)}" alt="{esc(alt)}" width="{width}" height="{height}" '
        f'loading="{loading}" decoding="async"{priority} onerror="{handler}" />'
    )


def absolute_image(product: dict | None) -> str:
    src = str((product or {}).get("anh") or "").strip()
    if src.startswith("http://") or src.startswith("https://"):
        sized = sized_drive_image(src, 1200, False)
        return sized or src
    return OG_IMAGE


def ensure_og_image() -> None:
    """Compress the brand logo into assets/og.jpg so social tags are not the 900KB PNG."""
    logo = ROOT / "assets" / "logo.png"
    dest = ROOT / "assets" / "og.jpg"
    if not logo.is_file():
        return
    if dest.is_file() and dest.stat().st_mtime >= logo.stat().st_mtime and dest.stat().st_size < 200_000:
        return
    try:
        from PIL import Image
    except ImportError:
        print("warning: Pillow missing; assets/og.jpg was not regenerated")
        return
    image = Image.open(logo).convert("RGB")
    image.thumbnail((1200, 1200))
    dest.parent.mkdir(parents=True, exist_ok=True)
    image.save(dest, "JPEG", quality=82, optimize=True)


def first_with_image(products: list[dict]) -> dict | None:
    for product in products:
        if str(product.get("anh") or "").startswith("http"):
            return product
    return None


def product_filename(product: dict) -> str:
    ma = slugify(product.get("ma"), 32) or "sp"
    name = slugify(product.get("ten"), 60)
    return f"{ma}-{name}.html" if name else f"{ma}.html"


def category_filename(nhom: str) -> str:
    return f"nhom-{slugify(nhom) or 'nhom'}.html"


def build_ia(data: dict) -> dict:
    linh = [lv for lv in (data.get("linh_vuc") or []) if lv.get("visible", True) and lv.get("slug")]
    linh.sort(key=lambda lv: ((lv.get("sort") if lv.get("sort") is not None else 999), lv.get("ten") or ""))
    nhom = [n for n in (data.get("nhom") or []) if n.get("visible", True) and n.get("TenNhom")]
    nhom.sort(key=lambda n: ((n.get("STT") if n.get("STT") is not None else 999), n.get("TenNhom") or ""))
    by_id = {(n.get("id") or n.get("slug")): n for n in nhom}
    by_name = {n.get("TenNhom"): n for n in nhom}
    lv_by_id = {lv.get("id"): lv for lv in linh if lv.get("id")}

    def groups_of(lv: dict) -> list[dict]:
        ids = lv.get("nhomIds") or []
        found = [by_id[i] for i in ids if i in by_id]
        if found:
            return found
        return [n for n in nhom if n.get("linhVucId") == lv.get("id")]

    return {
        "linh_vuc": linh,
        "nhom": nhom,
        "by_id": by_id,
        "by_name": by_name,
        "lv_by_id": lv_by_id,
        "groups_of": groups_of,
    }


def annotate_product(product: dict, ia: dict) -> None:
    meta = ia["by_name"].get(product.get("nhom") or "")
    if meta:
        product.setdefault("nhomId", meta.get("id") or meta.get("slug") or "")
        if not product.get("linhVucId"):
            product["linhVucId"] = meta.get("linhVucId") or ""
    lv = ia["lv_by_id"].get(product.get("linhVucId") or "")
    if lv and not product.get("linhVucTen"):
        product["linhVucTen"] = lv.get("ten") or ""


def badge_text(product: dict, ia: dict) -> str:
    lv = ia["lv_by_id"].get(product.get("linhVucId") or "")
    short = ""
    if lv:
        short = lv.get("tenNgan") or lv.get("ten") or ""
    nhom = product.get("nhom") or ""
    if short and nhom:
        return f"{short} · {nhom}"
    return short or nhom


def group_names(ia: dict, present: list[str]) -> list[str]:
    names: list[str] = []
    seen: set[str] = set()
    for meta in ia["nhom"]:
        name = meta.get("TenNhom") or ""
        if name and name not in seen:
            names.append(name)
            seen.add(name)
    for name in sorted(present):
        if name not in seen:
            names.append(name)
            seen.add(name)
    return names


def lv_for_nhom(name: str, ia: dict) -> dict | None:
    meta = ia["by_name"].get(name) or {}
    return ia["lv_by_id"].get(meta.get("linhVucId") or "")


def sheet_fact(value) -> str:
    return re.sub(r"\s+", " ", str(value or "")).strip()


def fact_attr_lines(product: dict, indent: str = "        ") -> str:
    """Lightbox reads these. A blank sheet cell adds no attribute and no label."""
    lines = []
    brand = sheet_fact(product.get("thuongHieu"))
    spec = sheet_fact(product.get("quyCach"))
    if brand:
        lines.append(f'data-thuong-hieu="{esc(brand)}"')
    if spec:
        lines.append(f'data-quy-cach="{esc(spec)}"')
    if not lines:
        return ""
    return "\n" + "\n".join(indent + line for line in lines)


def detail_meta_html(product: dict) -> str:
    """ĐVT, then thương hiệu and quy cách only when the sheet cell has text."""
    bits = [f'<span class="product-dvt">ĐVT: {esc(product.get("dvt") or "—")}</span>']
    brand = sheet_fact(product.get("thuongHieu"))
    spec = sheet_fact(product.get("quyCach"))
    if brand:
        bits.append(f'<span class="product-fact">Thương hiệu: {esc(brand)}</span>')
    if spec:
        bits.append(f'<span class="product-fact">Quy cách: {esc(spec)}</span>')
    bits.append(f'<span class="product-ma">Mã {esc(product.get("ma") or "")}</span>')
    return "\n              ".join(bits)


def card_html(product: dict, product_href: str, category_href: str, badge: str) -> str:
    src = image_src(product)
    return f"""<article class="product-card"
        data-ma="{esc(product.get('ma'))}"
        data-ten="{esc(product.get('ten'))}"
        data-gia="{esc(product.get('gia'))}"
        data-dvt="{esc(product.get('dvt'))}"
        data-anh="{esc(product.get('anh') or '')}"
        data-nhom="{esc(product.get('nhom'))}"
        data-linh-vuc-id="{esc(product.get('linhVucId') or '')}"{fact_attr_lines(product)}>
        <div class="product-img" data-product-zoom role="button" tabindex="0"
             aria-label="Xem ảnh lớn: {esc(product.get('ten'))}" title="Xem ảnh lớn">
          {product_picture(src, str(product.get('ten') or ''), 400, 400, loading="lazy")}
        </div>
        <div class="product-body">
          <div class="product-badge"><a href="{esc(category_href)}">{esc(badge)}</a></div>
          <h3 class="product-name"><a href="{esc(product_href)}">{esc(product.get('ten'))}</a></h3>
          <div class="product-meta-row">
            <span class="product-dvt">ĐVT: {esc(product.get('dvt') or '—')}</span>
            <span class="product-ma">{esc(product.get('ma') or '')}</span>
          </div>
          <div class="product-price"><span class="price-label">Giá</span> {esc(format_price(product.get('gia')))}</div>
          <div class="product-actions">
            <div class="qty-control">
              <button type="button" class="qty-btn" data-qty-minus aria-label="Giảm số lượng">−</button>
              <input type="number" class="qty-input" value="1" min="1" max="999" data-qty-input aria-label="Số lượng" />
              <button type="button" class="qty-btn" data-qty-plus aria-label="Tăng số lượng">+</button>
            </div>
            {cart_control(product)}
          </div>
        </div>
      </article>"""


def layout(*, title, description, canonical, image, image_alt, og_type, json_ld, body, robots: str | None = None, preload_image: str | None = None, asset_prefix: str = "../") -> str:
    prefix = asset_prefix
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <!-- {MARKER} -->
{head_tags(title=title, description=description, canonical=canonical, image=image, image_alt=image_alt, og_type=og_type, robots=robots)}
{font_links(prefix)}
  {f'<link rel="preload" as="image" href="{esc(preload_image)}" fetchpriority="high" />' if preload_image else ""}
  <link rel="icon" type="image/png" href="{prefix}assets/favicon.png?v={LOGO_NAV_V}" />
  <link rel="stylesheet" href="{prefix}css/styles.css?v={CSS_V}" />
{ld_script(json_ld)}
</head>
<body>
{chrome_header(prefix)}

  <main>
{body}
  </main>

{chrome_footer(prefix)}

{reach_html()}
{scripts(prefix)}
</body>
</html>
"""


def group_links(groups: list[str], current: str | None, files: dict[str, str]) -> str:
    links = []
    for name in groups:
        href = files[name]
        if name == current:
            links.append(f'<span class="chip active" aria-current="page">{esc(name)}</span>')
        else:
            links.append(f'<a class="chip" href="{esc(href)}">{esc(name)}</a>')
    return '<div class="chip-row catalog-group-links" aria-label="Nhóm hàng">' + "".join(links) + "</div>"


def cta_row() -> str:
    return f"""<div class="text-center mt-2">
          <a class="btn btn-zalo" href="{ZALO_URL}" target="_blank" rel="noopener">Chat Zalo</a>
          <a class="btn btn-outline-navy" href="tel:{HOTLINE_TEL}">Gọi {esc(HOTLINE_DISPLAY)}</a>
        </div>"""


def placeholder_block(meta: dict, lv: dict) -> str:
    message = meta.get("moTa") or lv.get("emptyMessage") or "Sắp có hàng — liên hệ đặt trước."
    slug = meta.get("slug") or slugify(meta.get("TenNhom") or "nhom")
    return f"""<section class="lv-placeholder" id="nhom-{esc(slug)}">
          <p class="lv-kicker">{esc(lv.get("tenNgan") or lv.get("ten") or "")}</p>
          <h2>{esc(meta.get("TenNhom"))}</h2>
          <p>Sắp có hàng — liên hệ đặt trước. {esc(message)}</p>
          <div class="hero-actions lv-placeholder-actions">
            <a class="btn btn-zalo" href="{ZALO_URL}" target="_blank" rel="noopener">Chat Zalo</a>
            <a class="btn btn-outline-navy" href="tel:{HOTLINE_TEL}">Gọi {esc(HOTLINE_DISPLAY)}</a>
          </div>
        </section>"""


def sku_text_links(products: list[dict], href_for) -> str:
    """Danh sách chữ tới trang SKU. Anchor là tên hàng, không nhồi từ khóa địa phương."""
    rows = [p for p in products if p.get("_file") and (p.get("ten") or p.get("ma"))]
    if not rows:
        return ""
    rows.sort(key=lambda product: str(product.get("ma") or ""))
    items = []
    for product in rows:
        label = product.get("ten") or product.get("ma")
        items.append(f'            <li><a href="{esc(href_for(product))}">{esc(label)}</a></li>')
    joined = "\n".join(items)
    return f"""        <nav class="sku-anchor-nav" aria-label="Trang sản phẩm chi tiết">
          <h2>Xem trang từng sản phẩm</h2>
          <p>Chọn đúng tên để mở trang chi tiết, xem đơn vị tính và giá đang niêm yết.</p>
          <ul>
{joined}
          </ul>
        </nav>
"""


def build_category_page(nhom: str, products: list[dict], groups: list[str], files: dict, ia: dict) -> str:
    filename = files[nhom]
    canonical = f"{SITE}/san-pham/{filename}"
    meta = ia["by_name"].get(nhom) or {}
    lv = lv_for_nhom(nhom, ia)
    blurb = meta.get("moTa") or GROUP_BLURB.get(
        nhom,
        f"Sản phẩm nhóm {nhom} tại cửa hàng Vạn Phát, KĐT Mỹ Gia, Nam Nha Trang.",
    )
    description = clip(
        f"{nhom} tại Nha Trang, Khánh Hòa — {blurb} {len(products)} mặt hàng, giá niêm yết. Hotline {HOTLINE_DISPLAY}."
    )
    title = group_seo_title(nhom)
    lv_href = f"../linh-vuc/{lv['slug']}.html" if lv else "../san-pham.html"
    lv_name = lv.get("ten") if lv else "Sản phẩm"
    crumbs = [
        ("Trang chủ", "../index.html"),
        ("Sản phẩm", "../san-pham.html"),
        (lv_name, lv_href),
        (nhom, None),
    ]
    crumbs_ld = [
        ("Trang chủ", SITE + "/"),
        ("Sản phẩm", SITE + "/san-pham.html"),
        (lv_name, f"{SITE}/linh-vuc/{lv['slug']}.html" if lv else SITE + "/san-pham.html"),
        (nhom, canonical),
    ]
    item_list = {
        "@type": "ItemList",
        "numberOfItems": len(products),
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": i + 1,
                "url": f"{SITE}/san-pham/{p['_file']}",
                "name": p.get("ten") or p.get("ma"),
            }
            for i, p in enumerate(products)
        ],
    }
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            organization_node(),
            breadcrumb_ld(crumbs_ld),
            {
                "@type": "CollectionPage",
                "@id": canonical + "#collection",
                "name": title,
                "description": description,
                "url": canonical,
                "inLanguage": "vi",
                "isPartOf": SITE + "/san-pham.html",
                "about": nhom,
                "mainEntity": item_list,
            },
        ],
    }
    if products:
        cards = "\n".join(
            card_html(p, p["_file"], filename, badge_text(p, ia)) for p in products
        )
        grid = f"""        <div class="product-grid">
{cards}
        </div>"""
        lead = f"{esc(blurb)} {len(products)} sản phẩm — thêm vào giỏ hoặc gọi {esc(HOTLINE_DISPLAY)}."
    else:
        grid = placeholder_block(meta or {"TenNhom": nhom, "slug": slugify(nhom)}, lv or {"ten": lv_name})
        lead = "Sắp có hàng — liên hệ đặt trước qua Zalo hoặc hotline."
    sku_nav = sku_text_links(products, lambda product: product["_file"])
    catalog_filter = "../san-pham.html?nhom=" + quote(nhom)
    if lv:
        catalog_filter += "&lv=" + quote(lv.get("id") or "")
    body = f"""    <section class="page-hero">
      <div class="container">
        {breadcrumb_html(crumbs).replace('breadcrumb-dark', 'breadcrumb-light')}
        <h1>{esc(nhom)}</h1>
        <p>{lead}</p>
      </div>
    </section>
    <div class="toolbar">
      <div class="container">
        {group_links(groups, nhom, files)}
      </div>
    </div>
    <section class="catalog-section">
      <div class="container">
        {grid}
{sku_nav}        {cta_row()}
        <div class="text-center mt-2">
          <a class="btn btn-outline-navy" href="{esc(catalog_filter)}">Lọc nhóm này trong catalog</a>
        </div>
      </div>
    </section>"""
    rep = first_with_image(products)
    image = absolute_image(rep) if rep else OG_IMAGE
    # Empty nhóm stay browsable but stay out of the index until they have SKUs.
    robots = None if products else "noindex, follow"
    return layout(
        title=title,
        description=description,
        canonical=canonical,
        image=image,
        image_alt=nhom,
        og_type="website",
        json_ld=graph,
        body=body,
        robots=robots,
    )


def build_linh_vuc_page(lv: dict, ia: dict, by_group: dict, cat_files: dict) -> str:
    slug = lv["slug"]
    canonical = f"{SITE}/linh-vuc/{slug}.html"
    groups = ia["groups_of"](lv)
    names = [g["TenNhom"] for g in groups]
    products: list[dict] = []
    for name in names:
        products.extend(by_group.get(name) or [])
    description = clip(
        f"{lv.get('ten')} tại Nha Trang, Khánh Hòa — {lv.get('moTa') or ''} "
        f"{len(products)} sản phẩm tại Vạn Phát, Nam Nha Trang. Hotline {HOTLINE_DISPLAY}."
    )
    title = linh_vuc_seo_title(str(lv.get("ten") or slug))
    crumbs = [
        ("Trang chủ", "../index.html"),
        ("Sản phẩm", "../san-pham.html"),
        (lv.get("ten") or slug, None),
    ]
    crumbs_ld = [
        ("Trang chủ", SITE + "/"),
        ("Sản phẩm", SITE + "/san-pham.html"),
        (lv.get("ten") or slug, canonical),
    ]
    mode = lv.get("browseMode") or "group-images"
    if mode == "product-images":
        chips = []
        blocks = []
        for meta in groups:
            href = "../san-pham/" + cat_files[meta["TenNhom"]]
            label = meta["TenNhom"]
            count = len(by_group.get(meta["TenNhom"]) or [])
            if meta.get("placeholder") and count == 0:
                label = f"{label} (sắp có)"
            chips.append(f'<a class="chip" href="{esc(href)}">{esc(label)}</a>')
            if meta.get("placeholder") and count == 0:
                blocks.append(placeholder_block(meta, lv))
        cards = "\n".join(
            card_html(
                p,
                "../san-pham/" + p["_file"],
                "../san-pham/" + cat_files.get(p.get("nhom"), ""),
                badge_text(p, ia),
            )
            for p in products
        )
        grid = f'<div class="product-grid">\n{cards}\n        </div>' if cards else ""
        inner = f"""        <div class="chip-row" aria-label="Nhóm trong lĩnh vực">{''.join(chips)}</div>
        {''.join(blocks)}
        {grid}"""
    else:
        tiles = []
        for meta in groups:
            href = "../san-pham/" + cat_files[meta["TenNhom"]]
            group_products = by_group.get(meta["TenNhom"]) or []
            rep = first_with_image(group_products)
            src = image_src(rep)
            count = len(group_products)
            label = f"{count} sản phẩm" if count else "Sắp có hàng"
            tiles.append(
                f"""<a class="lv-group-card" href="{esc(href)}">
            <div class="lv-group-media"><img src="{esc(src)}" alt="{esc(meta['TenNhom'])}" width="480" height="320" loading="lazy" decoding="async" onerror="VanPhat.onImgError(this)" /></div>
            <div class="lv-group-body"><h2>{esc(meta['TenNhom'])}</h2><p>{esc(label)}</p></div>
          </a>"""
            )
        inner = f'<div class="lv-group-grid">{"".join(tiles)}</div>'
    group_list = {
        "@type": "ItemList",
        "numberOfItems": len(groups),
        "itemListElement": [
            {
                "@type": "ListItem",
                "position": i + 1,
                "url": f"{SITE}/san-pham/{cat_files[meta['TenNhom']]}",
                "name": meta.get("TenNhom"),
            }
            for i, meta in enumerate(groups)
            if meta.get("TenNhom") in cat_files
        ],
    }
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            organization_node(),
            breadcrumb_ld(crumbs_ld),
            {
                "@type": "CollectionPage",
                "@id": canonical + "#collection",
                "name": title,
                "description": description,
                "url": canonical,
                "inLanguage": "vi",
                "isPartOf": SITE + "/",
                "about": lv.get("ten"),
                "mainEntity": group_list,
            },
        ],
    }
    body = f"""    <section class="page-hero">
      <div class="container">
        {breadcrumb_html(crumbs).replace('breadcrumb-dark', 'breadcrumb-light')}
        <h1>{esc(lv.get('ten'))}</h1>
        <p>{esc(lv.get('moTa') or '')} {len(products)} sản phẩm.</p>
      </div>
    </section>
    <section class="catalog-section">
      <div class="container">
        {inner}
        {cta_row()}
      </div>
    </section>"""
    rep = first_with_image(products)
    return layout(
        title=title,
        description=description,
        canonical=canonical,
        image=absolute_image(rep) if rep else OG_IMAGE,
        image_alt=str(lv.get("ten") or "Lĩnh vực"),
        og_type="website",
        json_ld=graph,
        body=body,
    )


def product_specs_html(product: dict, ia: dict, cat_file: str, brand: str | None) -> str:
    """Khối thông tin dưới H1. Dòng nào không có dữ liệu thì bỏ cả dòng."""
    rows: list[str] = []
    ma = str(product.get("ma") or "").strip()
    if ma:
        rows.append(f"<div><dt>Mã SP</dt><dd>{esc(ma)}</dd></div>")
    nhom = str(product.get("nhom") or "").strip()
    lv = ia["lv_by_id"].get(product.get("linhVucId") or "") or lv_for_nhom(nhom, ia)
    cat_parts: list[str] = []
    if lv and str(lv.get("ten") or "").strip() and lv.get("slug"):
        cat_parts.append(
            f'<a href="../linh-vuc/{esc(lv["slug"])}.html">{esc(lv.get("ten"))}</a>'
        )
    if nhom:
        href = cat_file or "../san-pham.html"
        cat_parts.append(f'<a href="{esc(href)}">{esc(nhom)}</a>')
    if cat_parts:
        rows.append(f"<div><dt>Danh mục</dt><dd>{' › '.join(cat_parts)}</dd></div>")
    if brand:
        rows.append(f"<div><dt>Thương hiệu</dt><dd>{esc(brand)}</dd></div>")
    quy_cach = quy_cach_text(product)
    if quy_cach:
        rows.append(f"<div><dt>Quy cách</dt><dd>{esc(quy_cach)}</dd></div>")
    unit = display_unit(product.get("dvt"))
    if unit:
        rows.append(f"<div><dt>Đơn vị tính</dt><dd>{esc(unit)}</dd></div>")
    if not rows:
        return ""
    return '<dl class="product-specs">' + "".join(rows) + "</dl>"


def keyword_chips_html(product: dict, ia: dict, cat_file: str, brand: str | None) -> str:
    """Chip từ dữ liệu đã có: lĩnh vực, nhóm, thương hiệu, quy cách. Không bịa từ khóa."""
    chips: list[tuple[str, str]] = []
    seen: set[str] = set()

    def add(label: str, href: str) -> None:
        text = re.sub(r"\s+", " ", str(label or "")).strip()
        key = text.casefold()
        if not text or not href or key in seen:
            return
        seen.add(key)
        chips.append((text, href))

    nhom = str(product.get("nhom") or "").strip()
    lv = ia["lv_by_id"].get(product.get("linhVucId") or "") or lv_for_nhom(nhom, ia)
    if lv and str(lv.get("ten") or "").strip() and lv.get("slug"):
        add(str(lv.get("ten") or ""), f"../linh-vuc/{lv['slug']}.html")
    if nhom:
        add(nhom, cat_file or "../san-pham.html")
    if brand:
        add(brand, "../san-pham.html?q=" + quote(brand, safe=""))
    stated = re.sub(r"\s+", " ", str(product.get("quyCach") or "")).strip()
    if stated:
        add(stated, "../san-pham.html?q=" + quote(stated, safe=""))
    for token in quy_cach_tokens(str(product.get("ten") or "")):
        add(token, "../san-pham.html?q=" + quote(token, safe=""))
    if not chips:
        return ""
    links = "".join(
        f'<a class="chip" href="{esc(href)}">{esc(label)}</a>' for label, href in chips
    )
    return f'<nav class="product-keywords" aria-label="Từ khóa">{links}</nav>'


def product_copy_html(ma: str) -> str:
    text = verified_long_text(ma)
    if not text:
        return '<p class="product-tab-empty">Chưa có mô tả chi tiết đã xác minh.</p>'
    rec = _DESCRIPTION_BY_MA.get(str(ma or "")) or {}
    url = str(rec.get("nguon_url") or "").strip()
    return (
        f'<p class="product-detail-desc">{esc(text)}</p>'
        f'<p class="product-desc-source">Nguồn: '
        f'<a href="{esc(url)}" target="_blank" rel="noopener noreferrer">{esc(url)}</a></p>'
    )


def product_tabs_html(specs_html: str, ma: str) -> str:
    slug = re.sub(r"[^a-z0-9]+", "-", str(ma or "sp").lower()).strip("-") or "sp"
    info = specs_html or '<p class="product-tab-empty">Chưa có thông tin từ danh mục.</p>'
    return f"""<div class="product-tabs" data-product-tabs>
              <div class="product-tablist" role="tablist" aria-label="Nội dung sản phẩm">
                <button type="button" class="product-tab is-active" role="tab" id="tab-thong-tin-{slug}" data-tab="thong-tin" aria-selected="true" aria-controls="panel-thong-tin-{slug}">Thông tin</button>
                <button type="button" class="product-tab" role="tab" id="tab-mo-ta-{slug}" data-tab="mo-ta" aria-selected="false" aria-controls="panel-mo-ta-{slug}" tabindex="-1">Mô tả</button>
              </div>
              <div class="product-tab-panel" role="tabpanel" id="panel-thong-tin-{slug}" data-panel="thong-tin" aria-labelledby="tab-thong-tin-{slug}">
                <h2 class="product-tab-fallback">Thông tin</h2>
                {info}
              </div>
              <div class="product-tab-panel" role="tabpanel" id="panel-mo-ta-{slug}" data-panel="mo-ta" aria-labelledby="tab-mo-ta-{slug}">
                <h2 class="product-tab-fallback">Mô tả</h2>
                {product_copy_html(ma)}
              </div>
            </div>"""


def build_product_page(
    product: dict,
    groups: list[str],
    files: dict,
    related: list[dict],
    ia: dict,
    duplicate_names: set[str] | None = None,
) -> str:
    filename = product["_file"]
    nhom = product.get("nhom") or ""
    canonical = f"{SITE}/san-pham/{filename}"
    cat_file = files.get(nhom, "")
    lv = ia["lv_by_id"].get(product.get("linhVucId") or "") or lv_for_nhom(nhom, ia)
    priced = price_amount(product.get("gia")) is not None
    price = format_price_line(product)
    description = drink_delivery_description(product) or product_seo_description(product, nhom)
    ten = str(product.get("ten") or product.get("ma") or "Sản phẩm")
    code = None
    if source_name_key(product.get("ten") or "") in (duplicate_names or set()):
        code = str(product.get("ma") or "").strip().upper() or None
    title = drink_delivery_title(product) or product_seo_title(ten, nhom, code)
    crumbs = [
        ("Trang chủ", "../index.html"),
        ("Sản phẩm", "../san-pham.html"),
    ]
    crumbs_ld = [
        ("Trang chủ", SITE + "/"),
        ("Sản phẩm", SITE + "/san-pham.html"),
    ]
    if lv:
        crumbs.append((lv.get("ten") or "", f"../linh-vuc/{lv['slug']}.html"))
        crumbs_ld.append((lv.get("ten") or "", f"{SITE}/linh-vuc/{lv['slug']}.html"))
    crumbs.append((nhom, cat_file or "../san-pham.html"))
    crumbs_ld.append((nhom, f"{SITE}/san-pham/{cat_file}" if cat_file else SITE + "/san-pham.html"))
    crumbs.append((str(product.get("ten") or product.get("ma")), None))
    crumbs_ld.append((str(product.get("ten") or product.get("ma")), canonical))
    image = absolute_image(product)
    product_ld = {
        "@type": "Product",
        "@id": canonical + "#product",
        "name": product.get("ten"),
        "sku": product.get("ma"),
        "url": canonical,
        "category": nhom,
        "description": description,
        "image": image,
    }
    brand = product_brand(product)
    if brand:
        product_ld["brand"] = {"@type": "Brand", "name": brand}
    props = []
    quy_cach = quy_cach_text(product)
    if quy_cach:
        props.append({"@type": "PropertyValue", "name": "Quy cách", "value": quy_cach})
    unit_label = display_unit(product.get("dvt"))
    if unit_label:
        props.append({"@type": "PropertyValue", "name": "Đơn vị tính", "value": unit_label})
    if props:
        product_ld["additionalProperty"] = props
    offer = offer_node(product, canonical)
    if offer:
        product_ld["offers"] = offer
    graph = {
        "@context": "https://schema.org",
        "@graph": [organization_node(), breadcrumb_ld(crumbs_ld), product_ld],
    }
    src = image_src(product)
    badge = badge_text(product, ia)
    specs_html = product_specs_html(product, ia, cat_file, brand)
    chips_html = keyword_chips_html(product, ia, cat_file, brand)
    tabs_html = product_tabs_html(specs_html, str(product.get("ma") or ""))
    vat_html = ""
    if priced and str(VAT_NOTE).strip():
        vat_html = f'\n            <p class="product-vat-note">{esc(str(VAT_NOTE).strip())}</p>'
    related_html = ""
    if related:
        cards = "\n".join(
            card_html(p, p["_file"], files.get(p.get("nhom"), cat_file), badge_text(p, ia)) for p in related
        )
        related_html = f"""
        <div class="product-related">
          <div class="section-header">
            <span class="eyebrow">Cùng nhóm</span>
            <h2>Sản phẩm liên quan</h2>
          </div>
          <div class="product-grid">
{cards}
          </div>
        </div>"""
    body = f"""    <section class="section product-page">
      <div class="container">
        {breadcrumb_html(crumbs)}
        <article class="product-card product-detail"
          data-ma="{esc(product.get('ma'))}"
          data-ten="{esc(product.get('ten'))}"
          data-gia="{esc(product.get('gia'))}"
          data-dvt="{esc(product.get('dvt'))}"
          data-anh="{esc(product.get('anh') or '')}"
          data-nhom="{esc(product.get('nhom'))}"
          data-linh-vuc-id="{esc(product.get('linhVucId') or '')}"{fact_attr_lines(product, "          ")}>
          <div class="product-img product-detail-media" data-product-zoom role="button" tabindex="0"
               aria-label="Xem ảnh lớn: {esc(product.get('ten'))}" title="Xem ảnh lớn">
            {product_picture(src, str(product.get('ten') or ''), 800, 800, loading="eager", fetchpriority="high")}
          </div>
          <div class="product-body product-detail-info">
            <div class="product-badge"><a href="{esc(cat_file)}">{esc(badge)}</a></div>
            <h1 class="product-detail-title">{esc(product.get('ten'))}</h1>
            <div class="product-price"><span class="price-label">Giá</span> {esc(price)}</div>{vat_html}
            {chips_html}
            {tabs_html}
            <p class="product-detail-note">{esc("Giá niêm yết trên web. Thêm vào giỏ để chốt đơn, hoặc gọi hotline nếu cần báo giá số lượng." if priced else "Liên hệ báo giá qua hotline hoặc Zalo. Giá chưa niêm yết trên web.")}</p>
            <div class="product-actions">
              <div class="qty-control">
                <button type="button" class="qty-btn" data-qty-minus aria-label="Giảm số lượng">−</button>
                <input type="number" class="qty-input" value="1" min="1" max="999" data-qty-input aria-label="Số lượng" />
                <button type="button" class="qty-btn" data-qty-plus aria-label="Tăng số lượng">+</button>
              </div>
              {cart_control(product)}
            </div>
            <div class="product-detail-cta">
              <a class="btn btn-zalo" href="{ZALO_URL}" target="_blank" rel="noopener">Chat Zalo</a>
              <a class="btn btn-outline-navy" href="tel:{HOTLINE_TEL}">Gọi {esc(HOTLINE_DISPLAY)}</a>
            </div>
          </div>
        </article>
        {group_links(groups, nhom, files)}
        {related_html}
      </div>
    </section>"""
    hero_src = image_src(product)
    return layout(
        title=title,
        description=description,
        canonical=canonical,
        image=image,
        image_alt=str(product.get("ten") or "Sản phẩm Vạn Phát"),
        og_type="product",
        json_ld=graph,
        body=body,
        preload_image=sized_drive_image(hero_src, HERO_IMAGE_W, True) or hero_src,
    )


SITEMAP_IMAGES = {
    "/": [{"loc": f"{STOREFRONT_IMAGE}?v={STOREFRONT_CACHE}", "title": "Mặt tiền cửa hàng Vạn Phát tại KĐT Mỹ Gia, Nam Nha Trang"}],
    "/lien-he.html": [{"loc": f"{STOREFRONT_IMAGE}?v={STOREFRONT_CACHE}", "title": "Mặt tiền cửa hàng Vạn Phát tại KĐT Mỹ Gia, Nam Nha Trang"}],
}


def render_sitemap(urls: list[tuple[str, str, str]], lastmod: str) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"',
        '        xmlns:image="http://www.google.com/schemas/sitemap-image/1.1">',
    ]
    for path, freq, priority in urls:
        loc = SITE + path
        lines.append("  <url>")
        lines.append(f"    <loc>{esc(loc)}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append(f"    <changefreq>{freq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
        for image in SITEMAP_IMAGES.get(path, []):
            lines.append("    <image:image>")
            lines.append(f"      <image:loc>{esc(image['loc'])}</image:loc>")
            lines.append(f"      <image:title>{esc(image['title'])}</image:title>")
            lines.append("    </image:image>")
        lines.append("  </url>")
    lines.append("</urlset>")
    lines.append("")
    return "\n".join(lines)


def render_robots() -> str:
    return f"""User-agent: *
Allow: /

Sitemap: {SITE}/sitemap.xml
"""


def render_paths_js(product_map: dict, category_map: dict, category_by_id: dict, linh_map: dict) -> str:
    payload = {
        "product": product_map,
        "category": category_map,
        "categoryById": category_by_id,
        "linhVuc": linh_map,
    }
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return (
        "/* Generated by scripts/generate_catalog_pages.py — do not edit. */\n"
        f"window.VanPhatPaths = {raw};\n"
    )


def write_text(path: Path, text: str) -> bool:
    for marker in BANNED_MARKERS:
        if marker in text:
            raise SystemExit(f"{path} reintroduced order-form marker: {marker}")
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists() and path.read_text(encoding="utf-8") == text:
        return False
    path.write_text(text, encoding="utf-8")
    return True


def load_products(path: Path) -> dict:
    data = json.loads(path.read_text(encoding="utf-8"))
    products = data.get("sanpham") or []
    if not products:
        raise SystemExit(f"No products in {path}")
    if not data.get("linh_vuc"):
        raise SystemExit(f"{path} is missing linh_vuc[] — sync from Excel or add data/ia.json mapping")
    company = data.get("company") or {}
    expected = {
        "Ten": COMPANY,
        "DiaChi": ADDRESS,
        "Email": EMAIL,
        "Hotline": HOTLINE_DISPLAY,
    }
    for key, value in expected.items():
        got = company.get(key)
        if got and got != value:
            print(f"warning: products.json company.{key}={got!r} differs from site NAP {value!r}")
    return data


REDIRECT_MARKER = "vp-generated-redirect"


def load_redirects() -> list[dict]:
    path = ROOT / "data" / "redirects.json"
    if not path.is_file():
        return []
    data = json.loads(path.read_text(encoding="utf-8"))
    return list(data.get("redirects") or [])


def build_redirect_page(target: str, name: str) -> str:
    url = "/" + target.lstrip("/")
    safe = html.escape(name)
    return f"""<!DOCTYPE html>
<!-- {REDIRECT_MARKER} -->
<html lang="vi">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
  <title>{safe} | Vạn Phát</title>
  <meta name="robots" content="noindex, follow" />
  <meta http-equiv="refresh" content="0; url={url}" />
  <link rel="canonical" href="{SITE}{url}" />
  <script>location.replace("{url}" + location.search + location.hash);</script>
</head>
<body>
  <p>Trang đã chuyển tới <a href="{url}">{safe}</a>…</p>
</body>
</html>
"""


def write_redirects(products: list[dict], out_dir: Path, expected: set[str]) -> list[str]:
    """Old product slugs (data/redirects.json) → current page of the same mã."""
    by_code = {str(p.get("ma") or "").upper(): p for p in products}
    done = []
    for item in load_redirects():
        old = str(item.get("old") or "")
        code = str(item.get("ma") or "").upper()
        product = by_code.get(code)
        if not old.startswith("san-pham/") or "/" in old[len("san-pham/"):] or not product:
            raise SystemExit(f"redirects.json: bad entry {item!r}")
        name = old[len("san-pham/"):]
        if name == product["_file"]:
            continue
        if name in expected:
            raise SystemExit(f"redirects.json: {old} is a live page")
        write_text(out_dir / name, build_redirect_page(f"san-pham/{product['_file']}", str(product.get("ten") or code)))
        expected.add(name)
        done.append(old)
    for html_path in out_dir.glob("*.html"):
        if html_path.name not in expected and REDIRECT_MARKER in html_path.read_text(encoding="utf-8", errors="ignore")[:200]:
            html_path.unlink()
    return done


def purge_generated(directory: Path, expected: set[str]) -> int:
    removed = 0
    if not directory.exists():
        return 0
    for html_path in directory.glob("*.html"):
        if html_path.name in expected:
            continue
        text = html_path.read_text(encoding="utf-8", errors="ignore")
        if MARKER in text[:400]:
            html_path.unlink()
            removed += 1
    return removed


STATIC_HTML = (
    "index.html",
    "san-pham.html",
    "thu-ngo.html",
    "photocopy.html",
    "lien-he.html",
    "khu-vuc.html",
    "nhan-vien.html",
    "nhan-vien/index.html",
)

VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />'
VIEWPORT_META_OLD = '<meta name="viewport" content="width=device-width, initial-scale=1" />'
VERIFICATION_RE = re.compile(
    r'[ \t]*<meta name="google-site-verification" content="[^"]*"\s*/>\n?'
)
JSONLD_START = "<!-- vp-jsonld -->"
JSONLD_END = "<!-- /vp-jsonld -->"
CATALOG_DIR_START = "<!-- vp-catalog-dir -->"
CATALOG_DIR_END = "<!-- /vp-catalog-dir -->"


def catalog_page_ld(ia: dict | None = None, cat_files: dict | None = None) -> dict:
    canonical = SITE + "/san-pham.html"
    description = (
        "Tìm văn phòng phẩm, nước uống và điện gia dụng tại Vạn Phát, Nha Trang, Khánh Hòa. "
        "Lọc theo lĩnh vực, nhóm, mã hoặc tên."
    )
    collection: dict = {
        "@type": "CollectionPage",
        "@id": canonical + "#catalog",
        "name": "Catalog sản phẩm | Vạn Phát Nha Trang",
        "description": description,
        "url": canonical,
        "inLanguage": "vi",
        "isPartOf": {"@id": SITE + "/#website"},
        "about": "Văn phòng phẩm, nước uống và điện gia dụng",
    }
    if ia and cat_files:
        items = []
        position = 1
        for lv in ia.get("linh_vuc") or []:
            slug = lv.get("slug")
            if not slug:
                continue
            items.append(
                {
                    "@type": "ListItem",
                    "position": position,
                    "url": f"{SITE}/linh-vuc/{slug}.html",
                    "name": lv.get("ten") or slug,
                }
            )
            position += 1
        for meta in ia.get("nhom") or []:
            name = meta.get("TenNhom")
            if not name or name not in cat_files:
                continue
            items.append(
                {
                    "@type": "ListItem",
                    "position": position,
                    "url": f"{SITE}/san-pham/{cat_files[name]}",
                    "name": name,
                }
            )
            position += 1
        if items:
            collection["mainEntity"] = {
                "@type": "ItemList",
                "numberOfItems": len(items),
                "itemListElement": items,
            }
    return {
        "@context": "https://schema.org",
        "@graph": [
            organization_node(),
            breadcrumb_ld([("Trang chủ", SITE + "/"), ("Sản phẩm", canonical)]),
            collection,
        ],
    }


def catalog_dir_html(ia: dict, cat_files: dict, by_group: dict) -> str:
    """Static crawl directory for san-pham.html when JS is off or ignored."""
    lv_links = []
    for lv in ia.get("linh_vuc") or []:
        slug = lv.get("slug")
        if not slug:
            continue
        lv_links.append(
            f'<li><a href="linh-vuc/{esc(slug)}.html">{esc(lv.get("ten") or slug)}</a></li>'
        )
    group_links_html = []
    for meta in ia.get("nhom") or []:
        name = meta.get("TenNhom")
        if not name or name not in cat_files:
            continue
        count = len(by_group.get(name) or [])
        label = f"{name} ({count} sản phẩm)" if count else f"{name} (sắp có)"
        group_links_html.append(
            f'<li><a href="san-pham/{esc(cat_files[name])}">{esc(label)}</a></li>'
        )
    body = f"""  {CATALOG_DIR_START}
        <noscript class="catalog-crawl-dir">
          <h2>Duyệt catalog không cần JavaScript</h2>
          <p>Mỗi nhóm và từng sản phẩm có trang HTML tĩnh riêng. Chọn lĩnh vực hoặc nhóm bên dưới.</p>
          <h3>Lĩnh vực</h3>
          <ul>{''.join(lv_links)}</ul>
          <h3>Nhóm hàng</h3>
          <ul>{''.join(group_links_html)}</ul>
        </noscript>
  {CATALOG_DIR_END}"""
    return body


def upsert_catalog_dir(text: str, block: str) -> str:
    pattern = re.compile(
        r"[ \t]*" + re.escape(CATALOG_DIR_START) + r".*?" + re.escape(CATALOG_DIR_END) + r"\n?",
        re.S,
    )
    if pattern.search(text):
        return pattern.sub(block.rstrip() + "\n", text, count=1)
    # Prefer the CTA row that follows #product-grid on san-pham.html so nested
    # loading markup inside the grid does not steal the insert point.
    anchor = '        <div class="text-center mt-2">\n          <a class="btn btn-zalo"'
    if anchor in text:
        return text.replace(anchor, block.rstrip() + "\n" + anchor, 1)
    marker = 'id="product-grid"'
    idx = text.find(marker)
    if idx < 0:
        return text
    open_div = text.rfind("<div", 0, idx)
    if open_div < 0:
        return text
    depth = 0
    i = open_div
    while i < len(text):
        next_open = text.find("<div", i)
        next_close = text.find("</div>", i)
        if next_close < 0:
            return text
        if next_open != -1 and next_open < next_close:
            depth += 1
            i = next_open + 4
            continue
        depth -= 1
        i = next_close + len("</div>")
        if depth == 0:
            return text[:i] + "\n" + block.rstrip() + "\n" + text[i:]
    return text


def letter_page_ld() -> dict:
    canonical = SITE + "/thu-ngo.html"
    description = (
        "Thư ngỏ giới thiệu năng lực cung cấp văn phòng phẩm của Vạn Phát tại Nha Trang, Khánh Hòa."
    )
    return {
        "@context": "https://schema.org",
        "@graph": [
            organization_node(),
            breadcrumb_ld([("Trang chủ", SITE + "/"), ("Thư ngỏ", canonical)]),
            {
                "@type": "AboutPage",
                "@id": canonical + "#letter",
                "name": "Thư ngỏ | Vạn Phát",
                "description": description,
                "url": canonical,
                "inLanguage": "vi",
                "mainEntity": {"@id": ORG_ID},
                "isPartOf": {"@id": SITE + "/#website"},
            },
        ],
    }


def normalize_viewport(text: str) -> str:
    if VIEWPORT_META in text:
        return text
    return text.replace(VIEWPORT_META_OLD, VIEWPORT_META)


def upsert_pwa_head(text: str) -> str:
    if 'rel="manifest"' in text:
        return text
    block = PWA_HEAD if PWA_HEAD.endswith("\n") else PWA_HEAD + "\n"
    for needle in (
        '  <link rel="icon"',
        '  <link rel="preconnect"',
        '  <link rel="stylesheet" href="',
        "</head>",
    ):
        if needle in text:
            return text.replace(needle, block + needle, 1)
    return text


def upsert_verification(text: str) -> str:
    text = VERIFICATION_RE.sub("", text)
    tag = verification_tag()
    if not tag:
        return text
    if VIEWPORT_META in text:
        return text.replace(VIEWPORT_META, VIEWPORT_META + "\n  " + tag, 1)
    return text.replace("<head>", "<head>\n  " + tag, 1)


def upsert_jsonld(text: str, data: dict) -> str:
    block = f"  {JSONLD_START}\n{ld_script(data)}\n  {JSONLD_END}\n"
    pattern = re.compile(
        r"[ \t]*" + re.escape(JSONLD_START) + r".*?" + re.escape(JSONLD_END) + r"\n?",
        re.S,
    )
    if pattern.search(text):
        return pattern.sub(block, text, count=1)
    return text.replace("</head>", block + "</head>", 1)


REACH_RE = re.compile(r"[ \t]*<!-- vp-reach -->.*?<!-- /vp-reach -->\n?", re.S)
FOOTER_BLURB_OLD = "văn phòng phẩm và photocopy tại KĐT Mỹ Gia, Phường Nam Nha Trang."
FOOTER_BLURB_NEW = "văn phòng phẩm, nước uống và điện gia dụng tại KĐT Mỹ Gia, Phường Nam Nha Trang."
# Visible homepage hero under the H1. Meta description stays separate.
HERO_LEAD = (
    "Văn phòng phẩm Nha Trang do CÔNG TY TNHH TƯ VẤN ĐẦU TƯ THƯƠNG MẠI VẠN PHÁT cung cấp, "
    "cùng nước uống, điện gia dụng, photocopy và in màu khổ A5\u2013A3."
)
HERO_LEAD_RE = re.compile(r'(<p class="hero-lead">)\s*.*?\s*(</p>)', re.DOTALL)


def defer_external_scripts(text: str) -> str:
    def repl(match: re.Match) -> str:
        tag = match.group(0)
        if re.search(r"\b(?:defer|async)\b", tag):
            return tag
        return tag.replace("<script ", "<script defer ", 1)

    return re.sub(r"<script\s+src=\"[^\"]+\"></script>", repl, text)


def upsert_reach(text: str) -> str:
    block = reach_html() + "\n"
    if REACH_RE.search(text):
        return REACH_RE.sub(block, text, count=1)
    if "</body>" not in text:
        return text
    return text.replace("</body>", block + "</body>", 1)


CSKH_KIND_RE = {
    kind: re.compile(rf"<!-- vp-cskh-{kind} -->.*?<!-- /vp-cskh-{kind} -->", re.S)
    for kind in ("top", "foot", "card", "band")
}
TOPBAR_HOTLINE_OLD = (
    f'<span>☎ Hotline: <a href="tel:{HOTLINE_TEL}">{HOTLINE_DISPLAY}</a>'
    f' · <a href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a></span>'
)
TOPBAR_HOTLINE_NEW = (
    f'<span class="topbar-hotline">☎ Hotline: <a href="tel:{HOTLINE_TEL}">{HOTLINE_DISPLAY}</a>'
    f' · <a href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a></span>'
)
FOOTER_HOTLINE_OLD = f'<a href="tel:{HOTLINE_TEL}">☎ {HOTLINE_DISPLAY}</a>'
FOOTER_HOTLINE_NEW = f'<a class="footer-hotline" href="tel:{HOTLINE_TEL}">☎ {HOTLINE_DISPLAY}</a>'
CONTACT_HOTLINE_OLD = (
    "<h4>Hotline</h4>\n"
    f'                <a href="tel:{HOTLINE_TEL}">{HOTLINE_DISPLAY}</a>'
)
CONTACT_HOTLINE_NEW = (
    "<h4>Hotline</h4>\n"
    f'                <a class="hotline-num" href="tel:{HOTLINE_TEL}">{HOTLINE_DISPLAY}</a>'
)
INDEX_BAND_ANCHOR = (
    '<a class="btn btn-ghost btn-lg" href="lien-he.html#bao-gia">Gửi yêu cầu báo giá</a>\n'
    "        </div>"
)


def upsert_marked_block(text: str, kind: str, block: str) -> str:
    pattern = CSKH_KIND_RE[kind]
    if pattern.search(text):
        return pattern.sub(block, text, count=1)
    return text


def topbar_phones_html() -> str:
    return (
        '<div class="topbar-phones">\n        '
        + TOPBAR_HOTLINE_NEW
        + "\n        "
        + cskh_links_html("top")
        + "\n      </div>"
    )


def upsert_cskh_chrome(text: str) -> str:
    """Gắn khối CSKH vào topbar và cột liên hệ footer. Thanh gọi nhanh vẫn chỉ hotline."""
    top = cskh_links_html("top")
    foot = cskh_links_html("foot")
    if CSKH_KIND_RE["top"].search(text):
        text = upsert_marked_block(text, "top", top)
    elif TOPBAR_HOTLINE_OLD in text:
        text = text.replace(TOPBAR_HOTLINE_OLD, topbar_phones_html(), 1)
    elif TOPBAR_HOTLINE_NEW in text and "vp-cskh-top" not in text:
        text = text.replace(TOPBAR_HOTLINE_NEW, topbar_phones_html(), 1)

    if CSKH_KIND_RE["foot"].search(text):
        text = upsert_marked_block(text, "foot", foot)
    elif FOOTER_HOTLINE_OLD in text:
        text = text.replace(FOOTER_HOTLINE_OLD, FOOTER_HOTLINE_NEW + "\n          " + foot, 1)

    if 'class="cta-band"' in text:
        band = cskh_links_html("band")
        if CSKH_KIND_RE["band"].search(text):
            text = upsert_marked_block(text, "band", band)
        elif INDEX_BAND_ANCHOR in text:
            text = text.replace(INDEX_BAND_ANCHOR, INDEX_BAND_ANCHOR + "\n        " + band, 1)

    if "<h4>Hotline</h4>" in text:
        if CONTACT_HOTLINE_OLD in text:
            text = text.replace(CONTACT_HOTLINE_OLD, CONTACT_HOTLINE_NEW, 1)
        row = contact_cskh_row()
        if CSKH_KIND_RE["card"].search(text):
            text = upsert_marked_block(text, "card", cskh_links_html("card"))
        elif "vp-cskh-card" not in text:
            email_row = '            <div class="contact-row">\n              <div class="c-icon">✉</div>'
            if email_row in text:
                text = text.replace(email_row, row + "\n\n" + email_row, 1)
    return text


NAV_CSKH_RE = re.compile(r"<!-- vp-cskh-nav -->.*?<!-- /vp-cskh-nav -->", re.S)
NAV_ZALO_BTN = (
    f'<a class="btn btn-zalo btn-sm" href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a>'
)
NAV_HOTLINE_OLD = (
    f'<a class="btn btn-outline-navy btn-sm" href="tel:{HOTLINE_TEL}">Gọi hotline</a>'
)
NAV_HOTLINE_NEW = (
    f'<a class="btn btn-outline-navy btn-sm nav-hotline" href="tel:{HOTLINE_TEL}">Gọi hotline</a>'
)


def upsert_nav_cskh(text: str) -> str:
    """Thanh header: hai số CSKH cạnh Zalo và nút Gọi hotline."""
    block = nav_cskh_html()
    if NAV_CSKH_RE.search(text):
        text = NAV_CSKH_RE.sub(block, text, count=1)
    elif NAV_ZALO_BTN in text:
        text = text.replace(NAV_ZALO_BTN, block + "\n        " + NAV_ZALO_BTN, 1)
    if NAV_HOTLINE_OLD in text:
        text = text.replace(NAV_HOTLINE_OLD, NAV_HOTLINE_NEW, 1)
    return text


def upsert_schema_cskh(text: str) -> str:
    """Giữ telephone hotline. Thêm contactPoint nếu trang tĩnh chưa có."""
    if "contactPoint" in text and CSKH_1_E164 in text and CSKH_2_E164 in text:
        return text
    payload = json.dumps(contact_points(), ensure_ascii=False, separators=(",", ":"))
    for needle in (f'"telephone": "{HOTLINE_E164}"', f'"telephone":"{HOTLINE_E164}"'):
        if needle in text:
            return text.replace(needle, needle + ',"contactPoint":' + payload, 1)
    return text


def strip_google_fonts(text: str) -> str:
    patterns = (
        r"[ \t]*<link rel=\"preconnect\" href=\"https://fonts\.(?:googleapis|gstatic)\.com\"[^>]*>\n",
        r"[ \t]*<link rel=\"preload\" as=\"style\" href=\"https://fonts\.googleapis\.com[^\"]*\"[^>]*>\n",
        r"[ \t]*<link rel=\"stylesheet\" href=\"https://fonts\.googleapis\.com[^\"]*\"[^>]*>\n",
        r"[ \t]*<link href=\"https://fonts\.googleapis\.com[^\"]*\" rel=\"stylesheet\"[^>]*>\n",
        r"[ \t]*<noscript><link rel=\"stylesheet\" href=\"https://fonts\.googleapis\.com[^<]*</noscript>\n",
    )
    for pattern in patterns:
        text = re.sub(pattern, "", text)
    return text


def pin_hero_lead(text: str) -> str:
    """Keep the homepage hero sentence. A catalog rebuild must not restore the old line."""
    if 'class="hero-lead"' not in text:
        return text

    def repl(match: re.Match[str]) -> str:
        return f"{match.group(1)}\n            {HERO_LEAD}\n          {match.group(2)}"

    return HERO_LEAD_RE.sub(repl, text, count=1)


def pin_storefront_picture(text: str) -> str:
    """Giữ jpg cho og:image. Trang thì ưu tiên AVIF, rồi WebP, rồi jpg."""
    text = re.sub(
        rf"({re.escape(STOREFRONT_STEM)}\.(?:avif|webp|jpg))\?v=\d+",
        rf"\1?v={STOREFRONT_CACHE}",
        text,
    )
    if f"{STOREFRONT_STEM}.avif" in text:
        return text
    pattern = re.compile(
        rf'([ \t]*)<source srcset="([^"]*{re.escape(STOREFRONT_STEM)}\.webp\?v={STOREFRONT_CACHE})" type="image/webp" />'
    )

    def repl(match: re.Match[str]) -> str:
        indent, src = match.group(1), match.group(2)
        avif = src.replace(".webp", ".avif")
        return (
            f'{indent}<source srcset="{avif}" type="image/avif" />\n'
            f'{indent}<source srcset="{src}" type="image/webp" />'
        )

    return pattern.sub(repl, text)


def refresh_static_chrome(text: str, prefix: str = "") -> str:
    updated = strip_google_fonts(text)
    if 'as="font"' not in updated and 'rel="stylesheet" href="' in updated:
        updated = updated.replace(
            '  <link rel="stylesheet" href="',
            font_links(prefix) + '\n  <link rel="stylesheet" href="',
            1,
        )
    updated = updated.replace(
        "<small>Văn phòng phẩm · Photocopy</small>",
        f"<small>{esc(LOGO_TAGLINE)}</small>",
    )
    updated = pin_storefront_picture(updated)
    updated = re.sub(r"styles\.css\?v=\d+", f"styles.css?v={CSS_V}", updated)
    updated = re.sub(r"main\.js(?:\?v=\d+)?(?=\")", f"main.js?v={CSS_V}", updated)
    updated = re.sub(r"catalog-paths\.js(?:\?v=\d+)?(?=\")", f"catalog-paths.js?v={CSS_V}", updated)
    updated = re.sub(r"ia\.js\?v=\d+", f"ia.js?v={SEARCH_V}", updated)
    updated = re.sub(r"products\.js\?v=\d+", f"products.js?v={SEARCH_V}", updated)
    updated = re.sub(r"product-lightbox\.js\?v=\d+", f"product-lightbox.js?v={JS_V}", updated)
    updated = re.sub(r"chat-widget\.js\?v=\d+", f"chat-widget.js?v={CHAT_V}", updated)
    updated = updated.replace(f"{SITE}/assets/logo.png", OG_IMAGE)
    updated = updated.replace(FOOTER_BLURB_OLD, FOOTER_BLURB_NEW)
    updated = pin_hero_lead(updated)
    updated = defer_external_scripts(updated)
    updated = upsert_reach(updated)
    updated = upsert_cskh_chrome(updated)
    updated = upsert_nav_cskh(updated)
    updated = upsert_schema_cskh(updated)
    updated = upsert_pwa_head(updated)
    return updated


def refresh_static_heads(
    ia: dict | None = None,
    cat_files: dict | None = None,
    by_group: dict | None = None,
) -> list[str]:
    touched = []
    jsonld = {
        "san-pham.html": catalog_page_ld(ia, cat_files),
        "thu-ngo.html": letter_page_ld(),
    }
    dir_block = ""
    if ia and cat_files is not None and by_group is not None:
        dir_block = catalog_dir_html(ia, cat_files, by_group)
    for rel in STATIC_HTML:
        path = ROOT / rel
        if not path.is_file():
            continue
        text = normalize_viewport(path.read_text(encoding="utf-8"))
        updated = upsert_verification(text)
        if rel in jsonld:
            updated = upsert_jsonld(updated, jsonld[rel])
        if rel == "san-pham.html" and dir_block:
            updated = upsert_catalog_dir(updated, dir_block)
        prefix = "../" if "/" in rel else ""
        updated = upsert_local_links(updated, prefix)
        updated = refresh_static_chrome(updated, prefix)
        if 'http-equiv="refresh"' in updated:
            updated = REACH_RE.sub("", updated)
        if write_text(path, updated):
            touched.append(rel)
    return touched


def assert_seo_helpers() -> None:
    samples = {
        "Giấy A4 70 gsm Double A": "Double A",
        "Nước suối Lavie (500ml)": "Lavie",
        "Nước suối Aquafina (355ml)": "Aquafina",
        "Bút bi Thiên Long Gel-072/PLUS": "Thiên Long",
        "Bút bi TL-027 (Đen)": "Thiên Long",
        "Kẹp giấy tròn 28mm (Double A)": "Double A",
        "Băng keo trong 12mm": None,
        "Gôm": None,
        "Bìa còng 7 cm - Elephant": "Elephant",
        "Ổ điện Lioa 3DNW 3.2.10 (3m)": "Lioa",
        "Nẹp Acco nhựa UNI": "Acco",
        "Kệ hồ sơ 2 tầng Mica": None,
        "Giấy ép plastic A4 80mic": None,
        "Giấy ép plastic A5 80mic (100 tờ/xấp)": None,
        "Giấy ép plastic A3 80mic (100 tờ/xấp)": None,
        "Ép plastic 150mic - Bằng Lái": None,
        "Bút bi Plastic BP-1RT-F": None,
    }
    if product_brand({"ten": "Bút bi Plastic BP-1RT-F", "thuongHieu": " Pilot "}) != "Pilot":
        raise SystemExit("thuongHieu must replace the name guess")
    if product_brand({"ten": "Giấy A4 70 gsm Double A", "thuongHieu": "  "}) != "Double A":
        raise SystemExit("blank thuongHieu must fall back to the name")
    if product_brand({"ten": "Giấy ép plastic A5", "thuongHieu": ""}) is not None:
        raise SystemExit("blank thuongHieu must not invent a brand from plastic")
    for name, expected in samples.items():
        got = derive_brand(name)
        if got != expected:
            raise SystemExit(f"brand mismatch: {name!r} -> {got!r}, expected {expected!r}")
    if derive_brand("Vạn Phát văn phòng phẩm"):
        raise SystemExit("company name must not be used as product brand")
    kept = normalize_description_record(
        {
            "mo_ta": "Kim bấm 24/6, hộp 1000 kim.",
            "nguon_url": "https://example.com/stapler",
            "trang_thai": "da_xac_minh",
        }
    )
    if kept.get("trang_thai") != "da_xac_minh" or "1000 kim" not in kept.get("mo_ta", ""):
        raise SystemExit("a sourced description must be kept")
    dropped = normalize_description_record("Dùng để viết hoặc châm mực cho đồ dùng văn phòng.")
    if dropped.get("mo_ta") or dropped.get("trang_thai") != "cho_xac_minh" or dropped.get("nguon_url"):
        raise SystemExit("old filler strings must become an empty waiting record")
    filler = normalize_description_record(
        {
            "mo_ta": "Dùng để viết hoặc châm mực cho đồ dùng văn phòng.",
            "nguon_url": "https://example.com/pen",
            "trang_thai": "da_xac_minh",
        }
    )
    if filler.get("mo_ta") or filler.get("trang_thai") != "cho_xac_minh":
        raise SystemExit("filler must not stay verified even with a URL")
    unsourced = normalize_description_record(
        {"mo_ta": "Câu không có nguồn.", "nguon_url": "", "trang_thai": "da_xac_minh"}
    )
    if unsourced.get("mo_ta"):
        raise SystemExit("long text without a source must be dropped")
    global _DESCRIPTION_BY_MA
    previous_descriptions = _DESCRIPTION_BY_MA
    _DESCRIPTION_BY_MA = {"VPTEST": kept}
    try:
        if verified_long_text("VPTEST") != kept["mo_ta"] or verified_long_text("VP007"):
            raise SystemExit("verified long text leaked or dropped")
        seo = product_seo_description(
            {"ma": "VPNONE", "ten": "Bấm kim đại", "gia": 0, "dvt": "Cái"},
            "Dụng cụ VP",
        )
        if "Phù hợp cho văn phòng" in seo or "Dùng để viết" in seo:
            raise SystemExit(f"meta description still has filler: {seo}")
        if "Bấm kim đại" not in seo or "Liên hệ báo giá" not in seo:
            raise SystemExit(f"meta description dropped catalog facts: {seo}")
    finally:
        _DESCRIPTION_BY_MA = previous_descriptions
    title = product_seo_title("Gôm", "Dụng cụ VP")
    if title != "Gôm | Dụng cụ VP Nha Trang":
        raise SystemExit(f"title mismatch: {title!r}")
    long = product_seo_title("Bút gel Uni-ball Vision Elite UB-200 ngòi 0.8mm", "Bút & Mực")
    if "Nha Trang" not in long or "Bút & Mực" not in long:
        raise SystemExit(f"long title dropped local/group: {long!r}")
    if len(long) > TITLE_MAX:
        raise SystemExit(f"title too long ({len(long)}): {long!r}")
    shared = "Bút Chì Gỗ 2B Maped (Hộp 12 cây)"
    left = product_seo_title(shared, "Bút & Mực", "VP125")
    right = product_seo_title(shared, "Bút & Mực", "VP126")
    plain = product_seo_title(shared, "Bút & Mực")
    if left == right or "VP125" not in left or "VP126" not in right:
        raise SystemExit(f"duplicate source titles must include the code: {left!r} {right!r}")
    if "VP" in plain:
        raise SystemExit(f"unique source title must not gain a code: {plain!r}")
    if len(left) > TITLE_MAX or len(right) > TITLE_MAX:
        raise SystemExit(f"coded title too long: {left!r} {right!r}")
    if group_seo_title("Giấy") != "Giấy Nha Trang | Vạn Phát":
        raise SystemExit(f"group title mismatch: {group_seo_title('Giấy')!r}")
    if "Nha Trang" not in linh_vuc_seo_title("Văn phòng phẩm"):
        raise SystemExit("linh vực title missing Nha Trang")
    if price_amount(0) is not None or price_amount("") is not None or price_amount(None) is not None:
        raise SystemExit("zero/empty price should be omitted")
    if price_amount(12000) != 12000:
        raise SystemExit("price parse failed")
    if format_price(0) != "Liên hệ báo giá" or format_price("") != "Liên hệ báo giá" or format_price(15000) != "15.000 ₫":
        raise SystemExit(f"price label mismatch: {format_price(0)!r} {format_price('')!r} {format_price(15000)!r}")
    if "Chat Zalo" not in cart_control({"gia": 0}) or "data-add-cart" not in cart_control({"gia": 0}):
        raise SystemExit("zero price must keep a cart hook that opens Zalo")
    if "Thêm vào giỏ" not in cart_control({"gia": 15000}):
        raise SystemExit("priced SKU lost add-to-cart")
    if (
        availability_iri({"ton": 3}) != "https://schema.org/InStock"
        or availability_iri({"ton": 0}) != "https://schema.org/OutOfStock"
        or availability_iri({"ton": -2}) != "https://schema.org/OutOfStock"
        or availability_iri({}) is not None
    ):
        raise SystemExit("availability mismatch")
    empty = upsert_verification("<head>\n  " + VIEWPORT_META + "\n</head>\n")
    if GOOGLE_SITE_VERIFICATION and f'content="{GOOGLE_SITE_VERIFICATION}"' not in empty:
        raise SystemExit("verification tag was not inserted")
    if empty.count("google-site-verification") != 1:
        raise SystemExit("verification tag duplicated")
    webp = sized_drive_image("https://lh3.googleusercontent.com/d/abcFILE=w200", 480, True)
    jpeg = sized_drive_image("https://lh3.googleusercontent.com/d/abcFILE=w200", 480, False)
    if webp != "https://lh3.googleusercontent.com/d/abcFILE=w480-rw" or jpeg != "https://lh3.googleusercontent.com/d/abcFILE=w480":
        raise SystemExit(f"drive image sizing mismatch: {webp} {jpeg}")
    if sized_drive_image("https://example.com/a.jpg", 480, True) != "https://example.com/a.jpg":
        raise SystemExit("non-drive images must stay unchanged")
    sample = product_picture("https://lh3.googleusercontent.com/d/abcFILE", "Tên", 400, 400, loading="lazy")
    if "<picture" in sample or "=w480-rw" not in sample or "dataset.fb" not in sample or "=w480" not in sample:
        raise SystemExit(f"image markup mismatch: {sample}")
    if 'loading="lazy"' not in sample or 'width="400"' not in sample:
        raise SystemExit("picture missing lazy/size")
    old_lead = (
        '<p class="hero-lead">\n'
        "            CÔNG TY TNHH TƯ VẤN ĐẦU TƯ THƯƠNG MẠI VẠN PHÁT cung cấp văn phòng phẩm, "
        "nước uống và điện gia dụng tại Nha Trang — cùng photocopy Mỹ Gia, "
        "in màu khổ A5\u2013A3 tại Phường Nam Nha Trang.\n"
        "          </p>"
    )
    pinned = pin_hero_lead(old_lead)
    if HERO_LEAD not in pinned or "Phước" in pinned or "tại Nha Trang —" in pinned:
        raise SystemExit(f"hero lead pin failed: {pinned!r}")
    if pin_hero_lead(pinned) != pinned:
        raise SystemExit("hero lead pin is not idempotent")
    if pinned.count(", ") != 3:
        raise SystemExit("hero lead must keep one space after each comma")
    if "Văn phòng phẩm Nha Trang" not in HERO_LEAD:
        raise SystemExit("hero lead must lead with văn phòng phẩm Nha Trang")
    stapler = {
        "nhom": "Dụng cụ VP",
        "ten": "Bấm kim Trio (30 tờ)",
        "thuongHieu": "KW-triO",
        "gia": 145000,
        "dvt": "Cái",
    }
    if is_local_delivery_drink(stapler) or drink_delivery_title(stapler) or drink_delivery_description(stapler):
        raise SystemExit("KW-triO stationery must not use the drink delivery title")
    sting = {
        "nhom": "Nước uống",
        "ten": "Nước Sting Gold (Lon 320ml)",
        "thuongHieu": "Sting",
        "gia": 12000,
        "dvt": "Lon",
    }
    sting_title = drink_delivery_title(sting)
    sting_desc = drink_delivery_description(sting)
    if "320ml" not in sting_title or "12.000 ₫" not in sting_title or "giao tận nơi Nha Trang" not in sting_title:
        raise SystemExit(f"Sting title missing volume, price, or delivery phrase: {sting_title!r}")
    if not (50 <= len(sting_title) <= TITLE_MAX):
        raise SystemExit(f"Sting title length {len(sting_title)}: {sting_title!r}")
    if "320ml" not in sting_desc or "12.000 ₫" not in sting_desc or "giao tận nơi Nha Trang" not in sting_desc:
        raise SystemExit(f"Sting description missing facts: {sting_desc!r}")
    if len(sting_desc) > DRINK_DESC_WITH_ADDRESS:
        raise SystemExit(f"Sting description too long ({len(sting_desc)}): {sting_desc!r}")
    unpriced = {
        "nhom": "Nước uống",
        "ten": "Lon Sting Thái tăng lực Warrior 325ml",
        "gia": 0,
        "dvt": "",
    }
    unpriced_title = drink_delivery_title(unpriced)
    unpriced_desc = drink_delivery_description(unpriced)
    if "325ml" not in unpriced_title or "giao tận nơi Nha Trang" not in unpriced_title or "₫" in unpriced_title:
        raise SystemExit(f"unpriced Sting title should keep volume and drop price: {unpriced_title!r}")
    if "giá" in unpriced_desc or "325ml" not in unpriced_desc or "giao tận nơi Nha Trang" not in unpriced_desc:
        raise SystemExit(f"unpriced Sting description should omit price: {unpriced_desc!r}")
    links = sku_text_links(
        [{"ma": "VP204", "ten": "Giấy A4", "_file": "vp204-giay-a4.html"}],
        lambda product: product["_file"],
    )
    if 'href="vp204-giay-a4.html"' not in links or ">Giấy A4</a>" not in links:
        raise SystemExit("sku text link lost the product name anchor")
    if "văn phòng phẩm nha trang" in links.casefold():
        raise SystemExit("sku text links must not stuff the local keyword into every anchor")
    quy_cach_cases = {
        "Bấm 1 lổ Kwtrio 97A0 (8 tờ)": ["8 tờ"],
        "Phiếu thu 2 liên 13x19cm": ["13x19cm"],
        "Phiếu thu 3 liên 13x19cm": ["13x19cm"],
        "Giấy ghi chú màu vàng có keo dán (76x127mm)": ["76x127mm"],
        "Bảng Trắng Mica 80x120cm": ["80x120cm"],
        "Giấy A4 70 gsm IK plus": ["A4", "70 gsm"],
    }
    for name, expected in quy_cach_cases.items():
        got = quy_cach_tokens(name)
        if got != expected:
            raise SystemExit(f"quy cách mismatch: {name!r} -> {got!r}, expected {expected!r}")
    if any(token.upper() == "A0" for token in quy_cach_tokens("Bấm 1 lổ Kwtrio 97A0 (8 tờ)")):
        raise SystemExit("97A0 must not yield quy cách A0")
    if quy_cach_text({"ten": "Giấy ép plastic A5 80mic (100 tờ/xấp)", "quyCach": "100 tờ/xấp"}) != "100 tờ/xấp":
        raise SystemExit("filled quyCach must be copied as written, without name tokens")
    if quy_cach_text({"ten": "Giấy A4 70 gsm IK plus", "quyCach": ""}) != "A4, 70 gsm":
        raise SystemExit("blank quyCach must fall back to name tokens")
    if format_price_line({"gia": 69000, "dvt": "Ram"}) != "69.000 ₫ / Ram":
        raise SystemExit("price line mismatch")
    if format_price_line({"gia": 0, "dvt": "Cuộn"}) != CONTACT_PRICE:
        raise SystemExit("unpriced line must stay the contact label, without a unit")
    if display_unit("cái") != "Cái" or display_unit("Ram") != "Ram" or display_unit("  ") != "":
        raise SystemExit("display unit mismatch")
    assert_local_titles_do_not_collide()


def assert_local_titles_do_not_collide() -> None:
    """Title địa phương không trùng lĩnh vực hoặc nhóm, kể cả khác hoa thường.

    Sync sau đọc data/local-pages.json rồi sinh lại HTML. Title trùng làm hai
    canonical cạnh tranh trên Google.
    """
    keys: set[str] = set()
    for path in (ROOT / "data" / "ia.json", ROOT / "data" / "products.json"):
        data = json.loads(path.read_text(encoding="utf-8"))
        for lv in data.get("linh_vuc") or []:
            ten = re.sub(r"\s+", " ", str(lv.get("ten") or "")).strip()
            if ten:
                keys.add(linh_vuc_seo_title(ten).casefold())
        for nhom in data.get("nhom") or []:
            name = re.sub(r"\s+", " ", str(nhom.get("TenNhom") or "")).strip()
            if name:
                keys.add(group_seo_title(name).casefold())
    seen: set[str] = set()
    for spec in load_local_pages():
        title = re.sub(r"\s+", " ", str(spec.get("title") or "")).strip()
        slug = spec.get("slug") or "?"
        if not title:
            raise SystemExit(f"local page {slug} missing title")
        if len(title) > TITLE_MAX:
            raise SystemExit(f"local title too long ({len(title)} > {TITLE_MAX}): {title}")
        key = title.casefold()
        if key in keys or key in seen:
            raise SystemExit(f"local title collides with another catalog title: {title}")
        seen.add(key)


def _product_node(doc: dict) -> dict:
    for node in doc.get("@graph") or []:
        if node.get("@type") == "Product":
            return node
    raise SystemExit("JSON-LD graph has no Product node")


def _load_ld(path: Path) -> dict:
    text = path.read_text(encoding="utf-8")
    match = re.search(r'<script type="application/ld\+json">(.*?)</script>', text)
    if not match:
        raise SystemExit(f"missing JSON-LD: {path}")
    return json.loads(match.group(1))


def assert_generated_seo(products: list[dict]) -> None:
    by_ma = {p["ma"]: p for p in products}
    false_brand = '"brand":{"@type":"Brand","name":"Vạn Phát"}'
    zero_price = '"price":"0"'
    for html_path in (ROOT / "san-pham").glob("vp*.html"):
        text = html_path.read_text(encoding="utf-8")
        if REDIRECT_MARKER in text[:200]:
            continue
        if false_brand in text or zero_price in text:
            raise SystemExit(f"{html_path.name} still emits a false brand or zero price")
        if "Nha Trang" not in text.split("</title>", 1)[0]:
            raise SystemExit(f"{html_path.name} title is missing Nha Trang")
    required_bits = ("data-product-zoom", "data-qty-minus", "data-qty-plus", "data-add-cart", "data-qty-input")
    for ma in ("VP035", "VP332", "VP204"):
        page = ROOT / "san-pham" / by_ma[ma]["_file"]
        text = page.read_text(encoding="utf-8")
        for bit in required_bits:
            if bit not in text:
                raise SystemExit(f"{ma} page lost lightbox/cart markup: {bit}")

    zero = by_ma["VP035"]
    zero_text = (ROOT / "san-pham" / zero["_file"]).read_text(encoding="utf-8")
    zero_node = _product_node(_load_ld(ROOT / "san-pham" / zero["_file"]))
    detail = zero_text.split('class="product-card product-detail"', 1)[1].split("</article>", 1)[0]
    if "offers" in zero_node or "Liên hệ báo giá" not in detail or "0 ₫" in detail or '"price":"0"' in zero_text:
        raise SystemExit("VP035 should omit offers and show Liên hệ báo giá")
    if "Khánh Hòa" not in zero_text:
        raise SystemExit("VP035 description missing Khánh Hòa")
    zero_price_html = zero_text.split('class="product-price"', 1)[1].split("</div>", 1)[0]
    if CONTACT_PRICE not in zero_price_html or " / " in zero_price_html or "Cuộn" in zero_price_html:
        raise SystemExit(f"VP035 price must be the contact label without a unit: {zero_price_html!r}")
    if "priceSpecification" in zero_node or "valueAddedTaxIncluded" in zero_text or "product-vat-note" in zero_text:
        raise SystemExit("VP035 must not emit an offer, a tax flag, or a tax note")
    zero_actions = zero_text.split('class="product-actions"', 1)[1].split('class="product-detail-cta"', 1)[0]
    if "Thêm vào giỏ" in zero_actions or "Chat Zalo" not in zero_actions:
        raise SystemExit("VP035 must open Zalo instead of add-to-cart")

    lavie = _product_node(_load_ld(ROOT / "san-pham" / by_ma["VP332"]["_file"]))
    if (lavie.get("brand") or {}).get("name") != "La Vie":
        raise SystemExit(f"Lavie brand should follow cột Thương Hiệu: {lavie.get('brand')}")
    if (lavie.get("offers") or {}).get("seller", {}).get("@id") != ORG_ID:
        raise SystemExit("Lavie offer is missing the company seller")
    lavie_url = f"{SITE}/san-pham/{by_ma['VP332']['_file']}"
    if lavie.get("url") != lavie_url or lavie.get("@id") != lavie_url + "#product":
        raise SystemExit(f"Lavie Product.url/@id missing: {lavie.get('url')} {lavie.get('@id')}")
    lavie_props = {item.get("name"): item.get("value") for item in lavie.get("additionalProperty") or []}
    if lavie_props.get("Đơn vị tính") != "Chai" or "350ml" not in str(lavie_props.get("Quy cách") or ""):
        raise SystemExit(f"Lavie additionalProperty mismatch: {lavie_props!r}")
    lavie_spec = (lavie.get("offers") or {}).get("priceSpecification") or {}
    if (
        lavie_spec.get("@type") != "UnitPriceSpecification"
        or lavie_spec.get("price") != "5000"
        or lavie_spec.get("priceCurrency") != "VND"
        or "valueAddedTaxIncluded" in lavie_spec
    ):
        raise SystemExit(f"Lavie priceSpecification mismatch: {lavie_spec!r}")
    if "aggregateRating" in lavie or "review" in lavie:
        raise SystemExit("product schema must not add rating or review")
    lavie_html = (ROOT / "san-pham" / by_ma["VP332"]["_file"]).read_text(encoding="utf-8")
    if "5.000 ₫ / Chai" not in lavie_html or 'class="product-specs"' not in lavie_html:
        raise SystemExit("VP332 page is missing the spec list or the unit price")

    def _specs(ma: str) -> str:
        page = (ROOT / "san-pham" / by_ma[ma]["_file"]).read_text(encoding="utf-8")
        return page.split('class="product-specs"', 1)[1].split("</dl>", 1)[0]

    vp206_html = (ROOT / "san-pham" / by_ma["VP206"]["_file"]).read_text(encoding="utf-8")
    paper_specs = _specs("VP206")
    if "69.000 ₫ / Ram" not in vp206_html or "Thêm vào giỏ" not in vp206_html:
        raise SystemExit("VP206 price must include the unit and keep add-to-cart")
    if "IK Plus" not in paper_specs or "A4" not in paper_specs or "70 gsm" not in paper_specs:
        raise SystemExit(f"VP206 specs mismatch: {paper_specs!r}")
    if 'href="../linh-vuc/vpp.html"' not in paper_specs or "nhom-giay.html" not in paper_specs:
        raise SystemExit("VP206 category links missing")
    if not VAT_NOTE.strip() and "product-vat-note" in vp206_html:
        raise SystemExit("empty VAT_NOTE must not render under a priced SKU")
    if 'data-product-tabs' not in vp206_html or 'data-tab="thong-tin"' not in vp206_html or 'data-tab="mo-ta"' not in vp206_html:
        raise SystemExit("VP206 is missing the Thông tin / Mô tả tabs")
    if 'class="product-related"' not in vp206_html or "Sản phẩm liên quan" not in vp206_html:
        raise SystemExit("VP206 is missing the related-products block")
    if 'class="product-keywords"' not in vp206_html:
        raise SystemExit("VP206 is missing keyword chips")
    vp206_kw = vp206_html.split('class="product-keywords"', 1)[1].split("</nav>", 1)[0]
    if "linh-vuc/vpp.html" not in vp206_kw or "nhom-giay.html" not in vp206_kw:
        raise SystemExit("VP206 keyword chips lost lĩnh vực or nhóm")
    if "q=IK%20Plus" not in vp206_kw or "q=A4" not in vp206_kw or "q=70%20gsm" not in vp206_kw:
        raise SystemExit(f"VP206 keyword chips mismatch: {vp206_kw!r}")
    if "Chưa có mô tả chi tiết đã xác minh." not in vp206_html:
        raise SystemExit("VP206 should show the empty verified-description state")
    if "Phù hợp cho văn phòng" in vp206_html or "Dùng để in, photo" in vp206_html:
        raise SystemExit("VP206 still prints filler copy")
    punch = _specs("VP001")
    if ">A0<" in punch or "A0," in punch or ", A0" in punch or "8 tờ" not in punch or "KW-triO" not in punch:
        raise SystemExit(f"VP001 specs must keep the sheet brand and 8 tờ, without A0: {punch!r}")
    vp001_html = (ROOT / "san-pham" / by_ma["VP001"]["_file"]).read_text(encoding="utf-8")
    vp001_kw = vp001_html.split('class="product-keywords"', 1)[1].split("</nav>", 1)[0]
    if "q=A0" in vp001_kw or ">A0<" in vp001_kw:
        raise SystemExit(f"VP001 chips must not invent khổ A0: {vp001_kw!r}")
    staple = (ROOT / "san-pham" / by_ma["VP007"]["_file"]).read_text(encoding="utf-8")
    if "Dùng để viết hoặc châm mực" in staple or "Phù hợp cho văn phòng" in staple:
        raise SystemExit("VP007 still describes a stapler with pen filler")
    if 'data-product-tabs' not in staple or "Chưa có mô tả chi tiết đã xác minh." not in staple:
        raise SystemExit("VP007 is missing the description tab")
    staple_rec = _DESCRIPTION_BY_MA.get("VP007") or {}
    if staple_rec.get("mo_ta") or staple_rec.get("trang_thai") != "cho_xac_minh":
        raise SystemExit(f"VP007 description must wait for a source: {staple_rec!r}")

    paper = by_ma["VP204"]
    paper_node = _product_node(_load_ld(ROOT / "san-pham" / paper["_file"]))
    if (paper_node.get("brand") or {}).get("name") != "Double A":
        raise SystemExit(f"Double A brand missing: {paper_node.get('brand')}")
    pilot = _product_node(_load_ld(ROOT / "san-pham" / by_ma["VP111"]["_file"]))
    if (pilot.get("brand") or {}).get("name") != "Pilot":
        raise SystemExit(f"VP111 should use sheet brand Pilot: {pilot.get('brand')}")
    pilot_text = (ROOT / "san-pham" / by_ma["VP111"]["_file"]).read_text(encoding="utf-8")
    if "Hãng ghi trên tên: Plastic" in pilot_text or '"name":"Plastic"' in pilot_text:
        raise SystemExit("VP111 still brands the pen as Plastic")
    film = _product_node(_load_ld(ROOT / "san-pham" / by_ma["VP456"]["_file"]))
    if (film.get("brand") or {}).get("name"):
        raise SystemExit(f"VP456 has a blank Thương Hiệu and must not guess a brand: {film.get('brand')}")
    film_text = (ROOT / "san-pham" / by_ma["VP456"]["_file"]).read_text(encoding="utf-8")
    if "Hãng ghi trên tên: Plastic" in film_text or '"name":"Plastic"' in film_text:
        raise SystemExit("VP456 still brands the film as Plastic")

    pilot_specs = _specs("VP111")
    if "Pilot" not in pilot_specs or "12 cây/hộp" not in pilot_specs or "Plastic" in pilot_specs:
        raise SystemExit(f"VP111 specs must follow the sheet, not the Plastic name: {pilot_specs!r}")
    film_props = {item.get("name"): item.get("value") for item in film.get("additionalProperty") or []}
    if film_props.get("Quy cách") != "100 tờ/xấp":
        raise SystemExit(f"VP456 additionalProperty must copy cột Quy Cách: {film_props!r}")
    film_specs = _specs("VP456")
    if "100 tờ/xấp" not in film_specs or "A5" in film_specs or "Thương hiệu" in film_specs:
        raise SystemExit(f"VP456 specs must show the sheet quy cách only: {film_specs!r}")
    bare_specs = _specs("VP459")
    if "Thương hiệu" in bare_specs or "Quy cách" in bare_specs:
        raise SystemExit(f"VP459 blank sheet cells must omit both rows: {bare_specs!r}")
    offer = paper_node.get("offers") or {}
    if int(paper.get("ton") or 0) > 0 and offer.get("availability") != "https://schema.org/InStock":
        raise SystemExit(f"in-stock availability missing on VP204: {offer.get('availability')}")
    if "price" not in offer or offer.get("price") in {"0", "0.0"}:
        raise SystemExit("priced SKU lost its offer price")
    if paper_node.get("url") != f"{SITE}/san-pham/{paper['_file']}":
        raise SystemExit("VP204 Product.url missing")

    out_product = next(
        p for p in products if price_amount(p.get("gia")) and int(p.get("ton") or 0) <= 0
    )
    out_node = _product_node(_load_ld(ROOT / "san-pham" / out_product["_file"]))
    if (out_node.get("offers") or {}).get("availability") != "https://schema.org/OutOfStock":
        raise SystemExit(f"{out_product['ma']} should be OutOfStock")

    sitemap = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    if "/san-pham/nhom-banh.html" in sitemap:
        raise SystemExit("empty nhóm Bánh is still in the sitemap")
    if "/san-pham/nhom-giay.html" not in sitemap or "<loc>https://vanphatcompany.vn/</loc>" not in sitemap:
        raise SystemExit("sitemap dropped a page that should stay")
    if f"<image:loc>{STOREFRONT_IMAGE}?v={STOREFRONT_CACHE}</image:loc>" not in sitemap:
        raise SystemExit("sitemap is missing the storefront image")
    if GEO_LAT not in (ROOT / "san-pham" / by_ma["VP204"]["_file"]).read_text(encoding="utf-8"):
        raise SystemExit("LocalBusiness is missing the Mỹ Gia pin")
    sku_chrome = (ROOT / "san-pham" / by_ma["VP204"]["_file"]).read_text(encoding="utf-8")
    if f"tel:{HOTLINE_TEL}" not in sku_chrome or HOTLINE_DISPLAY not in sku_chrome:
        raise SystemExit("SKU chrome lost the hotline")
    if CSKH_1_TEL not in sku_chrome or CSKH_2_TEL not in sku_chrome:
        raise SystemExit("SKU chrome missing CSKH numbers")
    if CSKH_1_E164 not in sku_chrome or CSKH_2_E164 not in sku_chrome:
        raise SystemExit("SKU schema missing CSKH contactPoint")
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if f"Sitemap: {SITE}/sitemap.xml" not in robots:
        raise SystemExit("robots.txt lost the sitemap line")
    banh = (ROOT / "san-pham" / "nhom-banh.html").read_text(encoding="utf-8")
    if 'name="robots" content="noindex, follow"' not in banh:
        raise SystemExit("empty nhóm page should be noindex")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    if HERO_LEAD not in home:
        raise SystemExit("homepage hero lead drifted from the pinned sentence")
    home_title = home.split("</title>", 1)[0]
    if "Văn phòng phẩm Nha Trang" not in home_title:
        raise SystemExit("homepage title is missing văn phòng phẩm Nha Trang")
    if 'class="hero-address"' not in home or ADDRESS not in home:
        raise SystemExit("homepage is missing the visible Mỹ Gia address")
    if f"Văn phòng phẩm Nha Trang. Cửa hàng tại {ADDRESS}." not in home:
        raise SystemExit("homepage LocalBusiness description drifted")
    wholesale = (ROOT / "dia-phuong" / "van-phong-pham-gia-si-nha-trang.html").read_text(encoding="utf-8")
    if "Văn phòng phẩm Nha Trang giá niêm yết | Vạn Phát" not in wholesale:
        raise SystemExit("wholesale page title drifted")
    if "<h1>Văn phòng phẩm Nha Trang cho cơ quan và cửa hàng</h1>" not in wholesale:
        raise SystemExit("wholesale page H1 drifted")
    if "<h2>Địa chỉ cửa hàng văn phòng phẩm Nha Trang</h2>" not in wholesale:
        raise SystemExit("wholesale page H2 drifted")
    if ADDRESS not in wholesale or f"Văn phòng phẩm Nha Trang. Cửa hàng tại {ADDRESS}." not in wholesale:
        raise SystemExit("wholesale page lost the address or LocalBusiness description")
    drink_titles: set[str] = set()
    for product in products:
        if not is_local_delivery_drink(product):
            continue
        page = (ROOT / "san-pham" / product["_file"]).read_text(encoding="utf-8")
        title = page.split("<title>", 1)[1].split("</title>", 1)[0]
        desc_match = re.search(r'name="description" content="([^"]*)"', page)
        desc = html.unescape(desc_match.group(1)) if desc_match else ""
        vol = volume_ml_label(product)
        amount = price_amount(product.get("gia"))
        if "giao tận nơi Nha Trang" not in title or "giao tận nơi Nha Trang" not in desc:
            raise SystemExit(f"{product.get('ma')} lost giao tận nơi Nha Trang")
        if vol and (vol not in title or vol not in desc):
            raise SystemExit(f"{product.get('ma')} lost volume {vol}: {title!r}")
        if amount is None:
            if "₫" in title or "giá" in desc:
                raise SystemExit(f"{product.get('ma')} invented a price: {title!r} / {desc!r}")
        elif format_price(amount) not in title or format_price(amount) not in desc:
            raise SystemExit(f"{product.get('ma')} lost its list price")
        if len(title) > TITLE_MAX or len(desc) > 170:
            raise SystemExit(f"{product.get('ma')} title/description too long ({len(title)}/{len(desc)})")
        key = title.casefold()
        if key in drink_titles:
            raise SystemExit(f"drink title collision: {title}")
        drink_titles.add(key)
    if len(drink_titles) < 8:
        raise SystemExit(f"expected Sting and Aquarius drink titles, got {len(drink_titles)}")
    stapler_page = (ROOT / "san-pham" / by_ma["VP014"]["_file"]).read_text(encoding="utf-8")
    if "giao tận nơi Nha Trang" in stapler_page.split("</title>", 1)[0]:
        raise SystemExit("stapler Trio page picked up the drink title")
    grouped: dict[str, list[dict]] = {}
    for product in products:
        grouped.setdefault(product.get("nhom") or "", []).append(product)
    for nhom, items in grouped.items():
        if not nhom or not items:
            continue
        page = (ROOT / "san-pham" / category_filename(nhom)).read_text(encoding="utf-8")
        if 'class="sku-anchor-nav"' not in page:
            raise SystemExit(f"group {nhom} is missing the product text links")
        nav = page.split('class="sku-anchor-nav"', 1)[1].split("</nav>", 1)[0]
        for item in items:
            if f'href="{item["_file"]}"' not in nav:
                raise SystemExit(f"{nhom} text links missing {item.get('ma')}")
            anchor = f">{html.escape(str(item.get('ten') or item.get('ma')))}</a>"
            if anchor not in nav:
                raise SystemExit(f"{nhom} anchor is not the product name for {item.get('ma')}")
    if 'class="sku-anchor-nav"' in banh:
        raise SystemExit("empty nhóm Bánh should not list product links")
    heavy = ROOT / "san-pham" / "nhom-dung-cu-vp.html"
    if heavy.stat().st_size > 500_000:
        raise SystemExit(f"nhom-dung-cu-vp.html is {heavy.stat().st_size} bytes")
    for spec in load_local_pages():
        matched = select_local_products(products, {**spec, "limit": 10000})
        local_page = (ROOT / "dia-phuong" / f"{spec['slug']}.html").read_text(encoding="utf-8")
        if 'class="sku-anchor-nav"' not in local_page:
            raise SystemExit(f"{spec['slug']} is missing product text links")
        local_nav = local_page.split('class="sku-anchor-nav"', 1)[1].split("</nav>", 1)[0]
        for item in matched:
            if f'href="../san-pham/{item["_file"]}"' not in local_nav:
                raise SystemExit(f"{spec['slug']} missing link to {item.get('ma')}")
    contact = (ROOT / "lien-he.html").read_text(encoding="utf-8")
    if (
        STREETVIEW_EMBED_SRC.replace("&", "&amp;") not in contact
        or STREETVIEW_URL.replace("&", "&amp;") not in contact
    ):
        raise SystemExit("contact page lost the May 2025 Street View panorama")
    for rel in ("index.html", "lien-he.html", "app/index.html"):
        page = (ROOT / rel).read_text(encoding="utf-8")
        if f"tel:{HOTLINE_TEL}" not in page or HOTLINE_DISPLAY not in page:
            raise SystemExit(f"{rel} lost the hotline")
        for row in cskh_rows():
            if row["role"] not in page or row["display"] not in page or f'tel:{row["tel"]}' not in page:
                raise SystemExit(f"{rel} missing {row['role']}")
    if CSKH_1_E164 not in contact or CSKH_2_E164 not in contact:
        raise SystemExit("contact schema missing CSKH contactPoint")
    if f'"telephone": "{HOTLINE_E164}"' not in contact and f'"telephone":"{HOTLINE_E164}"' not in contact:
        raise SystemExit("contact schema lost the hotline telephone")
    if "output=embed" not in contact or MAPS_DIR_URL.replace("&", "&amp;") not in contact:
        raise SystemExit("contact page lost the map or the directions link")
    token = str(GOOGLE_SITE_VERIFICATION or "").strip()
    if token and f'content="{token}"' not in home:
        raise SystemExit("homepage is missing google-site-verification")
    if 'rel="manifest"' not in home or "viewport-fit=cover" not in home or 'name="theme-color"' not in home:
        raise SystemExit("homepage missing PWA head")
    if "/app/" not in sitemap:
        raise SystemExit("sitemap missing /app/")
    if "/offline.html" in sitemap:
        raise SystemExit("offline page must stay out of the sitemap")
    app_page = (ROOT / "app" / "index.html").read_text(encoding="utf-8")
    if 'rel="manifest"' not in app_page or "qr-vanphat.png" not in app_page:
        raise SystemExit("install page missing manifest or QR")
    if f'href="{SITE}/app/"' not in app_page:
        raise SystemExit("install page canonical must be /app/")
    offline_page = (ROOT / "offline.html").read_text(encoding="utf-8")
    if "noindex" not in offline_page:
        raise SystemExit("offline page must be noindex")
    manifest = json.loads((ROOT / "manifest.webmanifest").read_text(encoding="utf-8"))
    if manifest.get("name") != "Vạn Phát" or manifest.get("short_name") != "Vạn Phát":
        raise SystemExit("manifest name must be Vạn Phát")
    if manifest.get("display") != "standalone" or manifest.get("start_url") != "/" or manifest.get("scope") != "/":
        raise SystemExit("manifest display/start/scope mismatch")
    if manifest.get("lang") != "vi" or manifest.get("theme_color") != "#1F4E78" or manifest.get("background_color") != "#F7F4EE":
        raise SystemExit("manifest lang or brand colors drifted")
    shortcuts = {item.get("name"): item.get("url") for item in manifest.get("shortcuts") or []}
    expected_shortcuts = {
        "Tìm sản phẩm": "/san-pham.html",
        "Giỏ hàng": "/?gio=1",
        "Văn phòng phẩm": "/linh-vuc/vpp.html",
        "Nước uống & Bánh": "/linh-vuc/nuoc-banh.html",
        "Điện gia dụng": "/linh-vuc/dien-gia-dung.html",
    }
    if shortcuts != expected_shortcuts:
        raise SystemExit(f"manifest shortcuts mismatch: {shortcuts}")
    icon_keys = {(icon.get("sizes"), icon.get("purpose")) for icon in manifest.get("icons") or []}
    for key in (("192x192", "any"), ("512x512", "any"), ("192x192", "maskable"), ("512x512", "maskable")):
        if key not in icon_keys:
            raise SystemExit(f"manifest missing icon {key}")
    sw = (ROOT / "sw.js").read_text(encoding="utf-8")
    if f'const VERSION = "{CSS_V}"' not in sw:
        raise SystemExit("sw.js VERSION phải trùng CSS_V")
    if f"/js/chat-widget.js?v={CHAT_V}" not in sw:
        raise SystemExit("sw.js SHELL_URLS phải trùng CHAT_V")
    if "chat-network-first" not in sw or "CHAT_NETWORK_TIMEOUT_MS = 3000" not in sw:
        raise SystemExit("sw.js phải lấy chat-widget.js network-first, timeout 3 giây")
    if "networkFirst" not in sw or "/offline.html" not in sw or "/data/products.json" not in sw:
        raise SystemExit("sw.js thiếu network-first, trang offline hoặc catalog phát hành")
    sample_sku = (ROOT / "san-pham" / by_ma["VP204"]["_file"]).read_text(encoding="utf-8")
    if 'rel="manifest"' not in sample_sku or "viewport-fit=cover" not in sample_sku:
        raise SystemExit("SKU head missing PWA tags")
    local_dir = ROOT / "dia-phuong"
    local_pages = list(local_dir.glob("*.html")) if local_dir.is_dir() else []
    if len(local_pages) < 8:
        raise SystemExit(f"expected at least 8 local landing pages, got {len(local_pages)}")
    for page in local_pages:
        text = page.read_text(encoding="utf-8")
        if "FAQPage" not in text or "<h1>" not in text:
            raise SystemExit(f"{page.name} is missing H1 or FAQPage")
        if COMPANY not in text or ADDRESS not in text or HOTLINE_DISPLAY not in text:
            raise SystemExit(f"{page.name} is missing the store NAP")
        if "Cam Ranh" in text or "Diên Khánh" in text or "Ninh Hòa" in text:
            raise SystemExit(f"{page.name} invented a delivery area")
        if f"/dia-phuong/{page.name}" not in sitemap:
            raise SystemExit(f"{page.name} missing from sitemap")
    # Data-driven: the sitemap's SKU pages must be exactly the published SKUs.
    # (Excluded "Không đưa lên web" / held nhóm never reach products.json.)
    published = {str(p.get("ma") or "").lower() for p in products}
    in_sitemap = set(re.findall(r"/san-pham/(vp\d+)-", sitemap))
    leaked = sorted(in_sitemap - published)
    if leaked:
        raise SystemExit(f"unpublished SKUs leaked into the sitemap: {leaked}")
    missing = sorted(published - in_sitemap)
    if missing:
        raise SystemExit(f"published SKUs missing from the sitemap: {missing[:10]}")
    paper_rec = _DESCRIPTION_BY_MA.get("VP204") or {}
    if (
        not isinstance(paper_rec, dict)
        or str(paper_rec.get("mo_ta") or "").strip()
        or paper_rec.get("trang_thai") != "cho_xac_minh"
        or str(paper_rec.get("nguon_url") or "").strip()
    ):
        raise SystemExit(f"VP204 long description must stay empty until a source exists: {paper_rec!r}")
    paper_specs_204 = _specs("VP204")
    if "Double A" not in paper_specs_204 or "A4" not in paper_specs_204 or "70 gsm" not in paper_specs_204:
        raise SystemExit(f"VP204 specs dropped name facts: {paper_specs_204!r}")
    if "80 gsm" in paper_specs_204:
        raise SystemExit("VP204 specs invented 80 gsm")
    paper_page = (ROOT / "san-pham" / by_ma["VP204"]["_file"]).read_text(encoding="utf-8")
    paper_copy = paper_page.split('data-panel="mo-ta"', 1)[1].split("</article>", 1)[0]
    if "80 gsm" in paper_copy or "Phù hợp cho văn phòng" in paper_copy:
        raise SystemExit("VP204 description panel invented a spec or filler")
    for product in products:
        page = (ROOT / "san-pham" / product["_file"]).read_text(encoding="utf-8")
        for phrase in DESCRIPTION_FILLER:
            if phrase in page:
                raise SystemExit(f"{product.get('ma')} still prints filler: {phrase}")
        rec = _DESCRIPTION_BY_MA.get(str(product.get("ma") or ""))
        if not isinstance(rec, dict) or rec.get("trang_thai") not in {"da_xac_minh", "cho_xac_minh"}:
            raise SystemExit(f"{product.get('ma')} description record is invalid: {rec!r}")
        if str(rec.get("mo_ta") or "").strip() and not verified_long_text(str(product.get("ma") or "")):
            raise SystemExit(f"{product.get('ma')} has long text without a usable source")
    for rel in ("san-pham.html", "thu-ngo.html"):
        doc = _load_ld(ROOT / rel)
        types = [node.get("@type") for node in doc.get("@graph") or []]
        if rel == "san-pham.html" and "CollectionPage" not in types:
            raise SystemExit("san-pham.html JSON-LD is missing CollectionPage")
        if rel == "thu-ngo.html" and "AboutPage" not in types:
            raise SystemExit("thu-ngo.html JSON-LD is missing AboutPage")
        json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', (ROOT / rel).read_text(encoding="utf-8")).group(1))
    catalog_html = (ROOT / "san-pham.html").read_text(encoding="utf-8")
    if CATALOG_DIR_START not in catalog_html or "nhom-giay.html" not in catalog_html:
        raise SystemExit("san-pham.html is missing the crawlable catalog directory")
    if "<noscript" not in catalog_html or "linh-vuc/vpp.html" not in catalog_html:
        raise SystemExit("san-pham.html noscript directory lost lĩnh vực links")
    catalog_doc = _load_ld(ROOT / "san-pham.html")
    catalog_collection = next(
        (n for n in catalog_doc.get("@graph") or [] if n.get("@type") == "CollectionPage"),
        None,
    )
    if not catalog_collection or (catalog_collection.get("mainEntity") or {}).get("@type") != "ItemList":
        raise SystemExit("san-pham.html CollectionPage is missing ItemList mainEntity")
    giay = (ROOT / "san-pham" / "nhom-giay.html").read_text(encoding="utf-8")
    if "Giấy Nha Trang" not in giay.split("</title>", 1)[0]:
        raise SystemExit("nhóm Giấy title is missing local Nha Trang signal")
    giay_doc = _load_ld(ROOT / "san-pham" / "nhom-giay.html")
    if not any(
        n.get("@type") == "CollectionPage" and (n.get("mainEntity") or {}).get("@type") == "ItemList"
        for n in giay_doc.get("@graph") or []
    ):
        raise SystemExit("nhóm Giấy page lost CollectionPage ItemList")
    vpp_doc = _load_ld(ROOT / "linh-vuc" / "vpp.html")
    if not any(
        n.get("@type") == "CollectionPage" and (n.get("mainEntity") or {}).get("@type") == "ItemList"
        for n in vpp_doc.get("@graph") or []
    ):
        raise SystemExit("linh-vuc/vpp.html lost group ItemList")


QUY_CACH_RE = re.compile(
    r"(?i)\d+(?:[.,]\d+)?\s*[x×]\s*\d+(?:[.,]\d+)?\s*(?:mm|cm|m)\b"
    r"|(?:khổ\s*)?\b(?:A[0-6]|F4)\b"
    r"|\d+(?:[.,]\d+)?\s*(?:ml|mm|cm|gsm|kg)\b"
    r"|\d+(?:[.,]\d+)?\s*m\b"
    r"|\d+\s*(?:cái|cây|cuộn|ram|tờ|lá|hộp|viên|lỗ)(?:\s*/\s*(?:hộp|cây|ram|bộ))?"
)


def quy_cach_tokens(name: str) -> list[str]:
    """Token quy cách có trong tên. Không suy ra thông số ngoài tên."""
    bits: list[str] = []
    for match in QUY_CACH_RE.finditer(str(name or "")):
        token = re.sub(r"\s+", " ", match.group(0)).strip()
        if token and token not in bits:
            bits.append(token)
    return bits


def quy_cach_text(product: dict) -> str:
    """Cột Quy Cách khi có chữ. Chỉ đọc tên khi cột đó trống."""
    stated = re.sub(r"\s+", " ", str((product or {}).get("quyCach") or "")).strip()
    if stated:
        return stated
    return ", ".join(quy_cach_tokens(str((product or {}).get("ten") or "")))


def fold_text(value: str) -> str:
    s = str(value or "").strip().lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", s)


def normalize_description_record(raw) -> dict:
    """Chuỗi cũ hoặc bản ghi không đủ nguồn thì về chờ xác minh, mô tả để trống."""
    empty = {"mo_ta": "", "nguon_url": "", "trang_thai": "cho_xac_minh"}
    if not isinstance(raw, dict):
        return dict(empty)
    status = str(raw.get("trang_thai") or "").strip()
    url = str(raw.get("nguon_url") or "").strip()
    text = re.sub(r"\s+", " ", str(raw.get("mo_ta") or "")).strip()
    if (
        status == "da_xac_minh"
        and text
        and url.startswith(("http://", "https://"))
        and not description_has_filler(text)
    ):
        return {"mo_ta": text, "nguon_url": url, "trang_thai": "da_xac_minh"}
    return dict(empty)


def sync_descriptions(products: list[dict]) -> None:
    global _DESCRIPTION_BY_MA
    loaded: dict = {}
    if DESCRIPTIONS_PATH.is_file():
        raw = json.loads(DESCRIPTIONS_PATH.read_text(encoding="utf-8"))
        if isinstance(raw, dict):
            loaded = raw
    ordered: dict[str, dict] = {}
    for product in products:
        ma = str(product.get("ma") or "").strip()
        if not ma:
            continue
        ordered[ma] = normalize_description_record(loaded.get(ma))
    ordered = {ma: ordered[ma] for ma in sorted(ordered)}
    payload = json.dumps(ordered, ensure_ascii=False, indent=2) + "\n"
    current = DESCRIPTIONS_PATH.read_text(encoding="utf-8") if DESCRIPTIONS_PATH.is_file() else ""
    if current != payload:
        DESCRIPTIONS_PATH.write_text(payload, encoding="utf-8")
    _DESCRIPTION_BY_MA = ordered


def load_local_pages() -> list[dict]:
    if not LOCAL_PAGES_PATH.is_file():
        return []
    data = json.loads(LOCAL_PAGES_PATH.read_text(encoding="utf-8"))
    return [page for page in data if isinstance(page, dict) and page.get("slug")]


def local_link_block(prefix: str) -> str:
    lines = [f"          {LOCAL_LINKS_START}"]
    for page in load_local_pages():
        label = str(page.get("nav") or page.get("h1") or page["slug"])
        href = f"{prefix}dia-phuong/{page['slug']}.html"
        lines.append(f'          <a href="{esc(href)}">{esc(label)}</a>')
    lines.append(f"          {LOCAL_LINKS_END}")
    return "\n".join(lines) + "\n"


def upsert_local_links(text: str, prefix: str) -> str:
    block = local_link_block(prefix).rstrip("\n")
    pattern = re.compile(
        r"[ \t]*" + re.escape(LOCAL_LINKS_START) + r".*?" + re.escape(LOCAL_LINKS_END),
        re.S,
    )
    text = pattern.sub(block, text)
    heading = text.find("<h4>Liên kết</h4>")
    if heading < 0:
        return text
    nxt = text.find("<h4>", heading + 4)
    window = text[heading: nxt if nxt > 0 else heading + 1200]
    if LOCAL_LINKS_START in window:
        return text
    needle = f'href="{prefix}lien-he.html">Liên hệ</a>'
    pos = text.find(needle, heading)
    if pos < 0 or (nxt > 0 and pos > nxt):
        return text
    end = pos + len(needle)
    return text[:end] + "\n" + block + text[end:]


def select_local_products(products: list[dict], spec: dict) -> list[dict]:
    nhom_any = set(spec.get("nhomAny") or [])
    tokens = [fold_text(token) for token in (spec.get("nameIncludes") or []) if str(token).strip()]
    matched = []
    for product in products:
        if spec.get("linhVucId") and product.get("linhVucId") != spec.get("linhVucId"):
            continue
        if spec.get("nhom") and product.get("nhom") != spec.get("nhom"):
            continue
        if nhom_any and product.get("nhom") not in nhom_any:
            continue
        folded = fold_text(product.get("ten") or "")
        if any(token not in folded for token in tokens):
            continue
        if spec.get("brand") and product_brand(product) != spec.get("brand"):
            continue
        matched.append(product)
    matched.sort(key=lambda product: (0 if product.get("anh") else 1, str(product.get("ma") or "")))
    limit = int(spec.get("limit") or 8)
    return matched[:limit]


def build_local_page(spec: dict, picked: list[dict], matched_all: list[dict], ia: dict) -> str:
    slug = spec["slug"]
    total = len(matched_all)
    canonical = f"{SITE}/dia-phuong/{slug}.html"
    title = str(spec.get("title") or spec.get("h1") or slug)
    description = str(spec.get("description") or "")
    crumbs = [("Trang chủ", "../index.html"), (str(spec.get("h1") or title), None)]
    crumbs_ld = [("Trang chủ", SITE + "/"), (str(spec.get("h1") or title), canonical)]
    cards = "\n".join(
        card_html(
            product,
            "../san-pham/" + product["_file"],
            "../san-pham/" + category_filename(product.get("nhom") or ""),
            badge_text(product, ia),
        )
        for product in picked
    )
    grid = f'<div class="product-grid">\n{cards}\n        </div>' if cards else ""
    intro = "\n".join(f"        <p>{esc(para)}</p>" for para in (spec.get("intro") or []))
    section_heading = str(spec.get("h2") or "").strip()
    h2_html = f"        <h2>{esc(section_heading)}</h2>\n" if section_heading else ""
    sku_nav = sku_text_links(matched_all, lambda product: "../san-pham/" + product["_file"])
    link_bits = []
    for link in spec.get("links") or []:
        href = str(link.get("href") or "").lstrip("/")
        if not href:
            continue
        link_bits.append(f'<a href="../{esc(href)}">{esc(link.get("label") or href)}</a>')
    faqs = spec.get("faq") or []
    faq_html = "\n".join(
        f"""        <details class="faq-item">
          <summary>{esc(item.get("q") or "")}</summary>
          <p>{esc(item.get("a") or "")}</p>
        </details>"""
        for item in faqs
        if item.get("q") and item.get("a")
    )
    faq_ld = {
        "@type": "FAQPage",
        "mainEntity": [
            {
                "@type": "Question",
                "name": item.get("q"),
                "acceptedAnswer": {"@type": "Answer", "text": item.get("a")},
            }
            for item in faqs
            if item.get("q") and item.get("a")
        ],
    }
    org = organization_node()
    if slug == "van-phong-pham-gia-si-nha-trang":
        org["description"] = f"Văn phòng phẩm Nha Trang. Cửa hàng tại {ADDRESS}."
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            org,
            breadcrumb_ld(crumbs_ld),
            {
                "@type": "CollectionPage",
                "name": spec.get("h1") or title,
                "description": description,
                "url": canonical,
                "isPartOf": SITE + "/",
            },
            faq_ld,
        ],
    }
    served = (
        f"{COMPANY}. Địa chỉ: {ADDRESS}. Hotline {HOTLINE_DISPLAY}. "
        "Khu vực đã ghi trên website: Nam Nha Trang, KĐT Mỹ Gia, Vĩnh Thái."
    )
    body = f"""    <section class="page-hero">
      <div class="container">
        {breadcrumb_html(crumbs).replace('breadcrumb-dark', 'breadcrumb-light')}
        <h1>{esc(spec.get("h1") or title)}</h1>
        <p>{esc(description)}</p>
      </div>
    </section>
    <section class="section">
      <div class="container">
{intro}
{h2_html}        <p>{esc(served)}</p>
        <p>Đang hiển thị {len(picked)} / {total} sản phẩm khớp trang này. Giá lấy từ danh mục hiện tại.</p>
        {grid}
{sku_nav}        <div class="local-links">{''.join(link_bits)}</div>
        <h2>Câu hỏi thường gặp</h2>
{faq_html}
        {cta_row()}
      </div>
    </section>"""
    rep = first_with_image(picked)
    return layout(
        title=title,
        description=description,
        canonical=canonical,
        image=absolute_image(rep) if rep else OG_IMAGE,
        image_alt=str(spec.get("h1") or "Vạn Phát"),
        og_type="website",
        json_ld=graph,
        body=body,
    )


def write_local_pages(products: list[dict], ia: dict) -> list[str]:
    directory = ROOT / "dia-phuong"
    directory.mkdir(parents=True, exist_ok=True)
    expected: set[str] = set()
    urls: list[str] = []
    for spec in load_local_pages():
        matched_all = select_local_products(products, {**spec, "limit": 10000})
        if not matched_all:
            continue
        limit = int(spec.get("limit") or 8)
        picked = matched_all[:limit]
        filename = f"{spec['slug']}.html"
        expected.add(filename)
        page = build_local_page(spec, picked, matched_all, ia)
        write_text(directory / filename, page)
        urls.append(f"/dia-phuong/{filename}")
    purge_generated(directory, expected)
    return urls


def _nhom_key(value: str) -> str:
    s = re.sub(r"\s+", " ", str(value or "")).strip().lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = s.replace("-", " ").replace("_", " ").replace("/", " ")
    return re.sub(r"\s+", " ", s).strip(" .:-")


def excluded_nhom_keys() -> set[str]:
    names = ["Không đưa lên web"]
    ia_path = ROOT / "data" / "ia.json"
    if ia_path.is_file():
        names += json.loads(ia_path.read_text(encoding="utf-8")).get("excludeGroups") or []
    return {_nhom_key(n) for n in names if _nhom_key(n)}


def nhom_is_excluded(value: str, phrases: set[str]) -> bool:
    folded = _nhom_key(value)
    if not folded:
        return False
    padded = f" {folded} "
    return any(folded == phrase or folded.startswith(phrase + " ") or f" {phrase} " in padded for phrase in phrases)


def install_page_ld() -> dict:
    canonical = SITE + "/app/"
    return {
        "@context": "https://schema.org",
        "@graph": [
            organization_node(),
            breadcrumb_ld([("Trang chủ", SITE + "/"), ("Cài app", canonical)]),
            {
                "@type": "WebPage",
                "@id": canonical + "#install",
                "name": INSTALL_TITLE,
                "description": INSTALL_DESC,
                "url": canonical,
                "inLanguage": "vi",
                "isPartOf": {"@id": SITE + "/#website"},
            },
        ],
    }


def build_install_page() -> str:
    if len(INSTALL_DESC) > 220 or len(INSTALL_TITLE) > 90:
        raise SystemExit("install page title or description is too long")
    body = f"""    <section class="page-hero">
      <div class="container">
        <nav class="breadcrumb breadcrumb-light" aria-label="Breadcrumb">
          <a href="/index.html">Trang chủ</a>
          <span aria-hidden="true">/</span>
          <span aria-current="page">Cài app</span>
        </nav>
        <h1>Cài app Vạn Phát</h1>
        <p>Thêm website lên màn hình điện thoại để xem hàng, giữ giỏ và gọi cửa hàng. Không cần chợ ứng dụng.</p>
      </div>
    </section>
    <section class="section">
      <div class="container pwa-guide">
        <div class="pwa-steps">
          <article class="pwa-step">
            <h2>Android</h2>
            <ol>
              <li>Mở vanphatcompany.vn bằng Chrome.</li>
              <li>Bấm «Cài app Vạn Phát» trên trang, hoặc mở menu của Chrome rồi chọn «Cài ứng dụng» hoặc «Thêm vào màn hình chính».</li>
              <li>Xác nhận. Icon Vạn Phát nằm trên màn hình và mở trang chủ.</li>
            </ol>
          </article>
          <article class="pwa-step">
            <h2>iPhone</h2>
            <ol>
              <li>Mở vanphatcompany.vn bằng Safari.</li>
              <li>Bấm nút Chia sẻ (ô vuông có mũi tên).</li>
              <li>Chọn «Thêm vào Màn hình chính», rồi bấm «Thêm».</li>
            </ol>
          </article>
          <p>Giỏ hàng nằm trên máy. Mất mạng vẫn mở lại trang đã xem. Khi có mạng, giá và danh mục được tải mới. Gọi <a href="tel:{HOTLINE_TEL}">{esc(HOTLINE_DISPLAY)}</a> hoặc nhắn <a href="{ZALO_URL}">Zalo</a>.</p>
          {cskh_links_html("card")}
          <p><button type="button" class="btn btn-outline-navy" onclick="window.print()">In mã QR</button></p>
        </div>
        <figure class="pwa-qr">
          <img src="/assets/qr-vanphat.png" width="280" height="280" alt="Mã QR mở https://vanphatcompany.vn/" />
          <figcaption>Quét để mở vanphatcompany.vn. In tờ này để ở quầy KĐT Mỹ Gia.</figcaption>
        </figure>
      </div>
    </section>"""
    return layout(
        title=INSTALL_TITLE,
        description=INSTALL_DESC,
        canonical=SITE + "/app/",
        image=f"{STOREFRONT_IMAGE}?v={STOREFRONT_CACHE}",
        image_alt=STOREFRONT_ALT,
        og_type="website",
        json_ld=install_page_ld(),
        body=body,
        asset_prefix="/",
    )


def build_offline_page() -> str:
    if len(OFFLINE_DESC) > 220 or len(OFFLINE_TITLE) > 90:
        raise SystemExit("offline page title or description is too long")
    canonical = SITE + "/offline.html"
    body = f"""    <section class="page-hero">
      <div class="container">
        <h1>Đang mất mạng</h1>
        <p>Khung app vẫn mở được. Trang và ảnh đã xem nằm trên máy. Giỏ hàng cũng vẫn còn.</p>
      </div>
    </section>
    <section class="section">
      <div class="container pwa-offline">
        <p>Khi có mạng trở lại, danh mục và giá được tải mới từ cửa hàng. Lúc đang online, app không hiện giá cũ.</p>
        <p>{esc(COMPANY)} — {esc(ADDRESS)}. Hotline <a href="tel:{HOTLINE_TEL}">{esc(HOTLINE_DISPLAY)}</a> · <a href="{ZALO_URL}">Zalo</a>.</p>
        {cskh_links_html("card")}
        <p class="pwa-offline-actions">
          <a class="btn btn-gold" href="/index.html">Thử mở lại trang chủ</a>
          <a class="btn btn-outline-navy" href="/san-pham.html">Xem danh mục đã lưu</a>
          <a class="btn btn-outline-navy" href="/lien-he.html">Liên hệ</a>
        </p>
      </div>
    </section>"""
    return layout(
        title=OFFLINE_TITLE,
        description=OFFLINE_DESC,
        canonical=canonical,
        image=f"{STOREFRONT_IMAGE}?v={STOREFRONT_CACHE}",
        image_alt=STOREFRONT_ALT,
        og_type="website",
        json_ld={
            "@context": "https://schema.org",
            "@graph": [
                organization_node(),
                breadcrumb_ld([("Trang chủ", SITE + "/"), ("Mất mạng", canonical)]),
            ],
        },
        body=body,
        robots="noindex, nofollow",
        asset_prefix="/",
    )


def main() -> None:
    assert_slug_samples()
    assert_seo_helpers()
    ensure_og_image()
    ap = argparse.ArgumentParser(description="Generate Vạn Phát lĩnh vực/category/product HTML, sitemap, and path map.")
    ap.add_argument("--products", default=str(ROOT / "data" / "products.json"))
    args = ap.parse_args()
    products_path = Path(args.products)
    data = load_products(products_path)
    ia = build_ia(data)
    excl = excluded_nhom_keys()
    dropped = [p.get("ma") for p in data["sanpham"] if nhom_is_excluded(str(p.get("nhom") or ""), excl)]
    if dropped:
        print("excludeGroups: not publishing", ", ".join(map(str, dropped)))
    products = [p for p in data["sanpham"] if not nhom_is_excluded(str(p.get("nhom") or ""), excl)]
    data["sanpham"] = products
    for product in products:
        annotate_product(product, ia)
    sync_descriptions(products)

    by_group: dict[str, list[dict]] = {}
    used_files: set[str] = set()
    for product in products:
        nhom = product.get("nhom") or "Khác"
        product["nhom"] = nhom
        filename = product_filename(product)
        base, ext = filename.rsplit(".", 1)
        n = 2
        while filename in used_files:
            filename = f"{base}-{n}.{ext}"
            n += 1
        used_files.add(filename)
        product["_file"] = filename
        by_group.setdefault(nhom, []).append(product)

    dup_names = duplicate_source_name_keys(products)
    groups = group_names(ia, list(by_group))
    for name in groups:
        by_group.setdefault(name, [])
    cat_files = {name: category_filename(name) for name in groups}
    cat_names = set(cat_files.values())
    overlap = used_files & cat_names
    if overlap:
        raise SystemExit(f"Filename collision between product and category pages: {overlap}")

    out_dir = ROOT / "san-pham"
    out_dir.mkdir(parents=True, exist_ok=True)
    lv_dir = ROOT / "linh-vuc"
    lv_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    expected: set[str] = set()

    for name in groups:
        expected.add(cat_files[name])
        page = build_category_page(name, by_group[name], groups, cat_files, ia)
        if write_text(out_dir / cat_files[name], page):
            written += 1

    for product in products:
        expected.add(product["_file"])
        same = [p for p in by_group[product["nhom"]] if p["ma"] != product["ma"]]
        with_img = [p for p in same if p.get("anh")]
        pool = with_img or same
        related = pool[:4]
        page = build_product_page(product, groups, cat_files, related, ia, dup_names)
        if write_text(out_dir / product["_file"], page):
            written += 1

    redirects_written = write_redirects(products, out_dir, expected)
    removed = purge_generated(out_dir, expected)

    lv_expected: set[str] = set()
    for lv in ia["linh_vuc"]:
        filename = f"{lv['slug']}.html"
        lv_expected.add(filename)
        page = build_linh_vuc_page(lv, ia, by_group, cat_files)
        if write_text(lv_dir / filename, page):
            written += 1
    removed += purge_generated(lv_dir, lv_expected)

    product_map = {p["ma"]: f"san-pham/{p['_file']}" for p in products}
    category_map = {name: f"san-pham/{cat_files[name]}" for name in groups}
    category_by_id = {}
    for meta in ia["nhom"]:
        name = meta.get("TenNhom")
        gid = meta.get("id") or meta.get("slug")
        if gid and name in cat_files:
            category_by_id[gid] = f"san-pham/{cat_files[name]}"
    linh_map = {lv["id"]: f"linh-vuc/{lv['slug']}.html" for lv in ia["linh_vuc"] if lv.get("id")}
    paths_changed = write_text(
        ROOT / "js" / "catalog-paths.js",
        render_paths_js(product_map, category_map, category_by_id, linh_map),
    )

    (ROOT / "app").mkdir(parents=True, exist_ok=True)
    write_text(ROOT / "offline.html", build_offline_page())
    write_text(ROOT / "app" / "index.html", build_install_page())

    mtime = datetime.fromtimestamp(products_path.stat().st_mtime, timezone.utc).date().isoformat()
    urls = list(STATIC_PAGES)
    for lv in ia["linh_vuc"]:
        urls.append((f"/linh-vuc/{lv['slug']}.html", "weekly", "0.85"))
    empty_groups = []
    for name in groups:
        if by_group.get(name):
            urls.append((f"/san-pham/{cat_files[name]}", "weekly", "0.8"))
        else:
            empty_groups.append(name)
    for product in products:
        urls.append((f"/san-pham/{product['_file']}", "weekly", "0.6"))
    for path in write_local_pages(products, ia):
        urls.append((path, "weekly", "0.75"))
    sitemap_changed = write_text(ROOT / "sitemap.xml", render_sitemap(urls, mtime))
    robots_changed = write_text(ROOT / "robots.txt", render_robots())
    static_touched = refresh_static_heads(ia, cat_files, by_group)

    index = ROOT / "index.html"
    if index.exists():
        index_text = index.read_text(encoding="utf-8")
        if 'id="linh-vuc-grid"' not in index_text:
            print("warning: index.html is missing #linh-vuc-grid")

    assert_generated_seo(products)
    title_lens = []
    for product in products:
        code = None
        if source_name_key(product.get("ten") or "") in dup_names:
            code = str(product.get("ma") or "").strip().upper() or None
        title_lens.append(len(product_seo_title(str(product.get("ten") or ""), product.get("nhom") or "", code)))
    branded = sum(1 for p in products if product_brand(p))
    print(
        json.dumps(
            {
                "products": len(products),
                "groups": groups,
                "empty_groups_omitted": empty_groups,
                "linh_vuc": [lv.get("slug") for lv in ia["linh_vuc"]],
                "html_written": written,
                "html_removed": removed,
                "redirects": redirects_written,
                "paths_js": paths_changed,
                "sitemap": sitemap_changed,
                "robots": robots_changed,
                "sitemap_urls": len(urls),
                "static_heads": static_touched,
                "zero_price": sum(1 for p in products if price_amount(p.get("gia")) is None),
                "branded": branded,
                "title_max": max(title_lens) if title_lens else 0,
                "titles_over_65": sum(1 for n in title_lens if n > TITLE_TARGET),
                "mo_ta_da_xac_minh": [
                    ma
                    for ma, rec in _DESCRIPTION_BY_MA.items()
                    if verified_long_text(ma)
                    and isinstance(rec, dict)
                ],
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
