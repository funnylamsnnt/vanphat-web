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
CSS_V = "20261005"
LOGO_NAV_V = "20260925"

COMPANY = "CÔNG TY TNHH TƯ VẤN ĐẦU TƯ THƯƠNG MẠI VẠN PHÁT"
ADDRESS = "LK 19-06 Đường số 20 KĐT Mỹ Gia, Vĩnh Thái, Phường Nam Nha Trang"
HOTLINE_DISPLAY = "033 5652 832"
HOTLINE_TEL = "0335652832"
HOTLINE_E164 = "+84335652832"
EMAIL = "congtytnhhvanphat999@gmail.com"
ZALO_URL = "https://zalo.me/0335652832"
BANK_LINE = "Agribank · STK 4703201014329"
OG_IMAGE = f"{SITE}/assets/logo.png"
ORG_ID = f"{SITE}/#organization"

# Search Console HTML-tag token. Set this one value and rerun the generator to
# insert the google-site-verification meta on the homepage and every other page.
# An empty string omits the tag.
GOOGLE_SITE_VERIFICATION = "lyjjIzdcmnmzSuzgiR2wFDZt0k5mxWQpp75Gn40XFFE"

# Product <title> aims at ~65 characters and may run to this hard cap so a full
# product name is not chopped for two extra characters.
TITLE_TARGET = 65
TITLE_MAX = 70

MAPS_QUERY = quote(ADDRESS)
MAPS_URL = f"https://www.google.com/maps/search/?api=1&query={MAPS_QUERY}"

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
]


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


def format_price(value) -> str:
    n = price_amount(value)
    if n is None:
        return "Liên hệ"
    return f"{n:,}".replace(",", ".") + " ₫"


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
    ("plastic", "Plastic"),
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


def product_seo_title(name: str, group: str) -> str:
    """Product name + nhóm + Nha Trang, kept near 65 characters."""
    name = re.sub(r"\s+", " ", str(name or "Sản phẩm")).strip()
    group = re.sub(r"\s+", " ", str(group or "")).strip()
    local = "Nha Trang"
    full = f"{name} | {group} {local}" if group else f"{name} | {local}"
    if len(full) <= TITLE_MAX:
        return full
    suffix = f" | {group} {local}" if group else f" | {local}"
    room = TITLE_TARGET - len(suffix)
    if room < 12:
        suffix = f" | {local}"
        room = TITLE_TARGET - len(suffix)
    return f"{clip(name, max(room, 12))}{suffix}"


def product_seo_description(product: dict, group: str) -> str:
    name = re.sub(r"\s+", " ", str(product.get("ten") or "Sản phẩm")).strip()
    group = re.sub(r"\s+", " ", str(group or "")).strip()
    amount = price_amount(product.get("gia"))
    if amount is None:
        price_bit = "Giá: Liên hệ."
    else:
        unit = product.get("dvt") or "đơn vị"
        price_bit = f"Giá {format_price(amount)}/{unit}."
    return clip(
        f"{name} — nhóm {group} tại Nha Trang, Khánh Hòa. "
        f"Mã {product.get('ma')}. {price_bit} "
        f"Mua tại Vạn Phát, KĐT Mỹ Gia, Nam Nha Trang. Hotline {HOTLINE_DISPLAY}."
    )


def offer_node(product: dict, canonical: str) -> dict | None:
    amount = price_amount(product.get("gia"))
    if amount is None:
        return None
    offer = {
        "@type": "Offer",
        "url": canonical,
        "priceCurrency": "VND",
        "price": str(amount),
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


def organization_node() -> dict:
    return {
        "@type": ["LocalBusiness", "Organization"],
        "@id": ORG_ID,
        "name": COMPANY,
        "alternateName": "Vạn Phát",
        "url": SITE + "/",
        "logo": OG_IMAGE,
        "image": OG_IMAGE,
        "telephone": HOTLINE_E164,
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
  <meta name="viewport" content="width=device-width, initial-scale=1" />{extra_html}
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
  <meta name="twitter:image" content="{esc(image)}" />"""


def chrome_header(prefix: str) -> str:
    p = prefix
    return f"""  <div class="topbar">
    <div class="container">
      <span>📍 {esc(ADDRESS)}</span>
      <span>☎ Hotline: <a href="tel:{HOTLINE_TEL}">{esc(HOTLINE_DISPLAY)}</a> · <a href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a></span>
    </div>
  </div>

  <header class="site-header">
    <div class="container nav">
      <a class="logo" href="{p}index.html" aria-label="Vạn Phát — Trang chủ">
        <img class="logo-img" src="{p}assets/logo-nav.png?v={LOGO_NAV_V}" width="44" height="44" alt="Vạn Phát" />
        <span class="logo-text">Vạn Phát<small>Văn phòng phẩm · Photocopy</small></span>
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
        <a class="btn btn-zalo btn-sm" href="{ZALO_URL}" target="_blank" rel="noopener">Zalo</a>
        <a class="btn btn-outline-navy btn-sm" href="tel:{HOTLINE_TEL}">Gọi hotline</a>
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
        </div>
        <div class="footer-col">
          <h4>Liên hệ</h4>
          <p class="footer-nap-name">{esc(COMPANY)}</p>
          <p>{esc(ADDRESS)}</p>
          <a href="tel:{HOTLINE_TEL}">☎ {esc(HOTLINE_DISPLAY)}</a>
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


def scripts(prefix: str) -> str:
    p = prefix
    return f"""  <script src="{p}js/main.js"></script>
  <script src="{p}js/cart.js"></script>
  <script src="{p}js/catalog-paths.js?v={CSS_V}"></script>
  <script src="{p}js/ia.js?v={CSS_V}"></script>
  <script src="{p}js/product-lightbox.js?v=20261010"></script>
  <script src="{p}js/chat-widget.js?v={CSS_V}"></script>"""


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


def absolute_image(product: dict | None) -> str:
    src = str((product or {}).get("anh") or "").strip()
    if src.startswith("http://") or src.startswith("https://"):
        return src
    return OG_IMAGE


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


def card_html(product: dict, product_href: str, category_href: str, badge: str) -> str:
    src = image_src(product)
    return f"""<article class="product-card"
        data-ma="{esc(product.get('ma'))}"
        data-ten="{esc(product.get('ten'))}"
        data-gia="{esc(product.get('gia'))}"
        data-dvt="{esc(product.get('dvt'))}"
        data-anh="{esc(product.get('anh') or '')}"
        data-nhom="{esc(product.get('nhom'))}"
        data-linh-vuc-id="{esc(product.get('linhVucId') or '')}">
        <div class="product-img" data-product-zoom role="button" tabindex="0"
             aria-label="Xem ảnh lớn: {esc(product.get('ten'))}" title="Xem ảnh lớn">
          <img src="{esc(src)}" alt="{esc(product.get('ten'))}" width="400" height="400" loading="lazy" decoding="async"
               onerror="VanPhat.onImgError(this)" />
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
            <button type="button" class="btn btn-add-cart" data-add-cart>Thêm vào giỏ</button>
          </div>
        </div>
      </article>"""


def layout(*, title, description, canonical, image, image_alt, og_type, json_ld, body, robots: str | None = None) -> str:
    prefix = "../"
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <!-- {MARKER} -->
{head_tags(title=title, description=description, canonical=canonical, image=image, image_alt=image_alt, og_type=og_type, robots=robots)}
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700;800&display=swap" rel="stylesheet" />
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
        f"{nhom} — {blurb} {len(products)} mặt hàng, giá niêm yết. Hotline {HOTLINE_DISPLAY}."
    )
    title = f"{nhom} | Vạn Phát"
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
                "name": title,
                "description": description,
                "url": canonical,
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
        {cta_row()}
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
        f"{lv.get('ten')} — {lv.get('moTa') or ''} {len(products)} sản phẩm tại Vạn Phát, Nam Nha Trang. Hotline {HOTLINE_DISPLAY}."
    )
    title = f"{lv.get('ten')} | Vạn Phát"
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
    graph = {
        "@context": "https://schema.org",
        "@graph": [
            organization_node(),
            breadcrumb_ld(crumbs_ld),
            {
                "@type": "CollectionPage",
                "name": title,
                "description": description,
                "url": canonical,
                "isPartOf": SITE + "/",
                "about": lv.get("ten"),
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


def build_product_page(product: dict, groups: list[str], files: dict, related: list[dict], ia: dict) -> str:
    filename = product["_file"]
    nhom = product.get("nhom") or ""
    canonical = f"{SITE}/san-pham/{filename}"
    cat_file = files.get(nhom, "")
    lv = ia["lv_by_id"].get(product.get("linhVucId") or "") or lv_for_nhom(nhom, ia)
    priced = price_amount(product.get("gia")) is not None
    price = format_price(product.get("gia"))
    description = product_seo_description(product, nhom)
    title = product_seo_title(str(product.get("ten") or product.get("ma") or "Sản phẩm"), nhom)
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
        "name": product.get("ten"),
        "sku": product.get("ma"),
        "category": nhom,
        "description": description,
        "image": image,
    }
    brand = derive_brand(str(product.get("ten") or ""))
    if brand:
        product_ld["brand"] = {"@type": "Brand", "name": brand}
    offer = offer_node(product, canonical)
    if offer:
        product_ld["offers"] = offer
    graph = {
        "@context": "https://schema.org",
        "@graph": [organization_node(), breadcrumb_ld(crumbs_ld), product_ld],
    }
    src = image_src(product)
    badge = badge_text(product, ia)
    related_html = ""
    if related:
        cards = "\n".join(
            card_html(p, p["_file"], files.get(p.get("nhom"), cat_file), badge_text(p, ia)) for p in related
        )
        related_html = f"""
        <div class="section-header" style="margin-top:2.5rem">
          <span class="eyebrow">Cùng nhóm</span>
          <h2>Sản phẩm {esc(nhom)} khác</h2>
        </div>
        <div class="product-grid">
{cards}
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
          data-linh-vuc-id="{esc(product.get('linhVucId') or '')}">
          <div class="product-img product-detail-media" data-product-zoom role="button" tabindex="0"
               aria-label="Xem ảnh lớn: {esc(product.get('ten'))}" title="Xem ảnh lớn">
            <img src="{esc(src)}" alt="{esc(product.get('ten'))}" width="800" height="800"
                 loading="eager" fetchpriority="high" decoding="async"
                 onerror="VanPhat.onImgError(this)" />
          </div>
          <div class="product-body product-detail-info">
            <div class="product-badge"><a href="{esc(cat_file)}">{esc(badge)}</a></div>
            <h1 class="product-detail-title">{esc(product.get('ten'))}</h1>
            <div class="product-meta-row">
              <span class="product-dvt">ĐVT: {esc(product.get('dvt') or '—')}</span>
              <span class="product-ma">Mã {esc(product.get('ma') or '')}</span>
            </div>
            <div class="product-price"><span class="price-label">Giá</span> {esc(price)}</div>
            <p class="product-detail-note">{esc("Giá niêm yết trên web. Thêm vào giỏ để chốt đơn, hoặc gọi hotline nếu cần báo giá số lượng." if priced else "Giá chưa niêm yết — liên hệ hotline hoặc Zalo để báo giá. Có thể thêm vào giỏ để ghi nhận số lượng.")}</p>
            <div class="product-actions">
              <div class="qty-control">
                <button type="button" class="qty-btn" data-qty-minus aria-label="Giảm số lượng">−</button>
                <input type="number" class="qty-input" value="1" min="1" max="999" data-qty-input aria-label="Số lượng" />
                <button type="button" class="qty-btn" data-qty-plus aria-label="Tăng số lượng">+</button>
              </div>
              <button type="button" class="btn btn-add-cart" data-add-cart>Thêm vào giỏ</button>
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
    return layout(
        title=title,
        description=description,
        canonical=canonical,
        image=image,
        image_alt=str(product.get("ten") or "Sản phẩm Vạn Phát"),
        og_type="product",
        json_ld=graph,
        body=body,
    )


def render_sitemap(urls: list[tuple[str, str, str]], lastmod: str) -> str:
    lines = [
        '<?xml version="1.0" encoding="UTF-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ]
    for path, freq, priority in urls:
        loc = SITE + path
        lines.append("  <url>")
        lines.append(f"    <loc>{esc(loc)}</loc>")
        lines.append(f"    <lastmod>{lastmod}</lastmod>")
        lines.append(f"    <changefreq>{freq}</changefreq>")
        lines.append(f"    <priority>{priority}</priority>")
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

VIEWPORT_META = '<meta name="viewport" content="width=device-width, initial-scale=1" />'
VERIFICATION_RE = re.compile(
    r'[ \t]*<meta name="google-site-verification" content="[^"]*"\s*/>\n?'
)
JSONLD_START = "<!-- vp-jsonld -->"
JSONLD_END = "<!-- /vp-jsonld -->"


def catalog_page_ld() -> dict:
    canonical = SITE + "/san-pham.html"
    description = (
        "Tìm văn phòng phẩm, nước uống và điện gia dụng tại Vạn Phát, Nha Trang, Khánh Hòa. "
        "Lọc theo lĩnh vực, nhóm, mã hoặc tên."
    )
    return {
        "@context": "https://schema.org",
        "@graph": [
            organization_node(),
            breadcrumb_ld([("Trang chủ", SITE + "/"), ("Sản phẩm", canonical)]),
            {
                "@type": "CollectionPage",
                "@id": canonical + "#catalog",
                "name": "Catalog sản phẩm | Vạn Phát Nha Trang",
                "description": description,
                "url": canonical,
                "inLanguage": "vi",
                "isPartOf": {"@id": SITE + "/#website"},
                "about": "Văn phòng phẩm, nước uống và điện gia dụng",
            },
        ],
    }


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


def refresh_static_heads() -> list[str]:
    touched = []
    jsonld = {
        "san-pham.html": catalog_page_ld(),
        "thu-ngo.html": letter_page_ld(),
    }
    for rel in STATIC_HTML:
        path = ROOT / rel
        if not path.is_file():
            continue
        text = path.read_text(encoding="utf-8")
        updated = upsert_verification(text)
        if rel in jsonld:
            updated = upsert_jsonld(updated, jsonld[rel])
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
    }
    for name, expected in samples.items():
        got = derive_brand(name)
        if got != expected:
            raise SystemExit(f"brand mismatch: {name!r} -> {got!r}, expected {expected!r}")
    if derive_brand("Vạn Phát văn phòng phẩm"):
        raise SystemExit("company name must not be used as product brand")
    title = product_seo_title("Gôm", "Dụng cụ VP")
    if title != "Gôm | Dụng cụ VP Nha Trang":
        raise SystemExit(f"title mismatch: {title!r}")
    long = product_seo_title("Bút gel Uni-ball Vision Elite UB-200 ngòi 0.8mm", "Bút & Mực")
    if "Nha Trang" not in long or "Bút & Mực" not in long:
        raise SystemExit(f"long title dropped local/group: {long!r}")
    if len(long) > TITLE_MAX:
        raise SystemExit(f"title too long ({len(long)}): {long!r}")
    if price_amount(0) is not None or price_amount("") is not None or price_amount(None) is not None:
        raise SystemExit("zero/empty price should be omitted")
    if price_amount(12000) != 12000:
        raise SystemExit("price parse failed")
    if format_price(0) != "Liên hệ" or format_price(15000) != "15.000 ₫":
        raise SystemExit(f"price label mismatch: {format_price(0)!r} {format_price(15000)!r}")
    if (
        availability_iri({"ton": 3}) != "https://schema.org/InStock"
        or availability_iri({"ton": 0}) != "https://schema.org/OutOfStock"
        or availability_iri({"ton": -2}) != "https://schema.org/OutOfStock"
        or availability_iri({}) is not None
    ):
        raise SystemExit("availability mismatch")
    empty = upsert_verification('<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1" />\n</head>\n')
    if GOOGLE_SITE_VERIFICATION and f'content="{GOOGLE_SITE_VERIFICATION}"' not in empty:
        raise SystemExit("verification tag was not inserted")
    if empty.count("google-site-verification") != 1:
        raise SystemExit("verification tag duplicated")


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
    if "offers" in zero_node or "Liên hệ" not in detail or "0 ₫" in detail:
        raise SystemExit("VP035 should omit offers and show Liên hệ")
    if "Khánh Hòa" not in zero_text:
        raise SystemExit("VP035 description missing Khánh Hòa")

    lavie = _product_node(_load_ld(ROOT / "san-pham" / by_ma["VP332"]["_file"]))
    if (lavie.get("brand") or {}).get("name") != "Lavie":
        raise SystemExit(f"Lavie brand missing: {lavie.get('brand')}")
    if (lavie.get("offers") or {}).get("seller", {}).get("@id") != ORG_ID:
        raise SystemExit("Lavie offer is missing the company seller")

    paper = by_ma["VP204"]
    paper_node = _product_node(_load_ld(ROOT / "san-pham" / paper["_file"]))
    if (paper_node.get("brand") or {}).get("name") != "Double A":
        raise SystemExit(f"Double A brand missing: {paper_node.get('brand')}")
    offer = paper_node.get("offers") or {}
    if int(paper.get("ton") or 0) > 0 and offer.get("availability") != "https://schema.org/InStock":
        raise SystemExit(f"in-stock availability missing on VP204: {offer.get('availability')}")
    if "price" not in offer or offer.get("price") in {"0", "0.0"}:
        raise SystemExit("priced SKU lost its offer price")

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
    robots = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if f"Sitemap: {SITE}/sitemap.xml" not in robots:
        raise SystemExit("robots.txt lost the sitemap line")
    banh = (ROOT / "san-pham" / "nhom-banh.html").read_text(encoding="utf-8")
    if 'name="robots" content="noindex, follow"' not in banh:
        raise SystemExit("empty nhóm page should be noindex")
    home = (ROOT / "index.html").read_text(encoding="utf-8")
    token = str(GOOGLE_SITE_VERIFICATION or "").strip()
    if token and f'content="{token}"' not in home:
        raise SystemExit("homepage is missing google-site-verification")
    for rel in ("san-pham.html", "thu-ngo.html"):
        doc = _load_ld(ROOT / rel)
        types = [node.get("@type") for node in doc.get("@graph") or []]
        if rel == "san-pham.html" and "CollectionPage" not in types:
            raise SystemExit("san-pham.html JSON-LD is missing CollectionPage")
        if rel == "thu-ngo.html" and "AboutPage" not in types:
            raise SystemExit("thu-ngo.html JSON-LD is missing AboutPage")
        json.loads(re.search(r'<script type="application/ld\+json">(.*?)</script>', (ROOT / rel).read_text(encoding="utf-8")).group(1))


def main() -> None:
    assert_slug_samples()
    assert_seo_helpers()
    ap = argparse.ArgumentParser(description="Generate Vạn Phát lĩnh vực/category/product HTML, sitemap, and path map.")
    ap.add_argument("--products", default=str(ROOT / "data" / "products.json"))
    args = ap.parse_args()
    products_path = Path(args.products)
    data = load_products(products_path)
    ia = build_ia(data)
    products = data["sanpham"]
    for product in products:
        annotate_product(product, ia)

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
        page = build_product_page(product, groups, cat_files, related, ia)
        if write_text(out_dir / product["_file"], page):
            written += 1

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
    sitemap_changed = write_text(ROOT / "sitemap.xml", render_sitemap(urls, mtime))
    robots_changed = write_text(ROOT / "robots.txt", render_robots())
    static_touched = refresh_static_heads()

    index = ROOT / "index.html"
    if index.exists():
        index_text = index.read_text(encoding="utf-8")
        if 'id="linh-vuc-grid"' not in index_text:
            print("warning: index.html is missing #linh-vuc-grid")

    assert_generated_seo(products)
    title_lens = [
        len(product_seo_title(str(p.get("ten") or ""), p.get("nhom") or "")) for p in products
    ]
    branded = sum(1 for p in products if derive_brand(str(p.get("ten") or "")))
    print(
        json.dumps(
            {
                "products": len(products),
                "groups": groups,
                "empty_groups_omitted": empty_groups,
                "linh_vuc": [lv.get("slug") for lv in ia["linh_vuc"]],
                "html_written": written,
                "html_removed": removed,
                "paths_js": paths_changed,
                "sitemap": sitemap_changed,
                "robots": robots_changed,
                "sitemap_urls": len(urls),
                "static_heads": static_touched,
                "zero_price": sum(1 for p in products if price_amount(p.get("gia")) is None),
                "branded": branded,
                "title_max": max(title_lens) if title_lens else 0,
                "titles_over_65": sum(1 for n in title_lens if n > TITLE_TARGET),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
