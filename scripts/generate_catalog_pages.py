#!/usr/bin/env python3
"""Build indexable category + product HTML, sitemap.xml, robots.txt, and js/catalog-paths.js.

Reads data/products.json (the catalog sync output). Safe to re-run: pages are
deterministic, and HTML files in san-pham/ that this script previously generated
but that no longer match a SKU or group are removed.

After an Excel → web sync:

    python3 scripts/sync_products_from_excel.py path/to.xlsx
    # the sync script calls this generator when it finishes

Or, if products.json was updated on its own:

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
CSS_V = "20261002"
LOGO_NAV_V = "20260925"

# Official NAP. Visible footer/contact copy and JSON-LD use these strings.
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

MAPS_QUERY = quote(ADDRESS)
MAPS_URL = f"https://www.google.com/maps/search/?api=1&query={MAPS_QUERY}"

# Merchandising order used on the homepage category grid.
GROUP_ORDER = ["Giấy", "Bìa Hồ Sơ", "Bút & Mực", "Băng Keo", "Dụng cụ VP", "Điện"]

GROUP_BLURB = {
    "Giấy": "Giấy in, giấy photo và sổ dùng cho văn phòng — gồm giấy A4, A5 và các loại sổ tại cửa hàng Mỹ Gia.",
    "Bìa Hồ Sơ": "Bìa hồ sơ, bìa còng, bìa lỗ và file đựng tài liệu cho cơ quan, cửa hàng ở Nam Nha Trang.",
    "Bút & Mực": "Bút bi, bút gel, mực và dạ quang — bổ sung văn phòng phẩm định kỳ.",
    "Băng Keo": "Băng keo trong, đục, simili và băng dính dùng hàng ngày.",
    "Dụng cụ VP": "Kéo, bấm kim, kẹp giấy, máy tính và đồ dùng bàn làm việc.",
    "Điện": "Ổ cắm, pin và thiết bị điện nhỏ phục vụ bàn làm việc.",
}

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


def format_price(value) -> str:
    try:
        n = int(value)
    except (TypeError, ValueError):
        n = 0
    return f"{n:,}".replace(",", ".") + " ₫"


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


def head_tags(*, title: str, description: str, canonical: str, image: str, image_alt: str, og_type: str) -> str:
    return f"""  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
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
        <input type="search" name="q" placeholder="Tìm sản phẩm…" aria-label="Tìm sản phẩm" autocomplete="off" />
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


def chrome_footer(prefix: str, order_url: str) -> str:
    p = prefix
    return f"""  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div class="footer-brand">
          <a class="logo" href="{p}index.html" aria-label="Vạn Phát">
            <img class="logo-img logo-img-sm" src="{p}assets/logo-nav.png?v={LOGO_NAV_V}" width="40" height="40" alt="Vạn Phát" />
            <span class="logo-text">Vạn Phát<small>Tư vấn · Đầu tư · Thương mại</small></span>
          </a>
          <p>{esc(COMPANY)} — văn phòng phẩm và photocopy tại KĐT Mỹ Gia, Phường Nam Nha Trang.</p>
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
          <a href="{esc(order_url)}" target="_blank" rel="noopener">Đặt hàng online</a>
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
  <script src="{p}js/product-lightbox.js?v=20260927"></script>
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


def image_src(product: dict) -> str:
    src = str(product.get("anh") or "").strip()
    return src or PLACEHOLDER_SVG


def absolute_image(product: dict) -> str:
    src = str(product.get("anh") or "").strip()
    if src.startswith("http://") or src.startswith("https://"):
        return src
    return OG_IMAGE


def product_filename(product: dict) -> str:
    ma = slugify(product.get("ma"), 32) or "sp"
    name = slugify(product.get("ten"), 60)
    return f"{ma}-{name}.html" if name else f"{ma}.html"


def category_filename(nhom: str) -> str:
    return f"nhom-{slugify(nhom) or 'nhom'}.html"


def card_html(product: dict, product_href: str, category_href: str) -> str:
    src = image_src(product)
    return f"""<article class="product-card"
        data-ma="{esc(product.get('ma'))}"
        data-ten="{esc(product.get('ten'))}"
        data-gia="{esc(product.get('gia'))}"
        data-dvt="{esc(product.get('dvt'))}"
        data-anh="{esc(product.get('anh') or '')}"
        data-nhom="{esc(product.get('nhom'))}">
        <div class="product-img" data-product-zoom role="button" tabindex="0"
             aria-label="Xem ảnh lớn: {esc(product.get('ten'))}" title="Xem ảnh lớn">
          <img src="{esc(src)}" alt="{esc(product.get('ten'))}" width="400" height="400" loading="lazy" decoding="async"
               onerror="VanPhat.onImgError(this)" />
        </div>
        <div class="product-body">
          <div class="product-nhom"><a href="{esc(category_href)}">{esc(product.get('nhom'))}</a></div>
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


def layout(*, title, description, canonical, image, image_alt, og_type, json_ld, body, order_url) -> str:
    prefix = "../"
    return f"""<!DOCTYPE html>
<html lang="vi">
<head>
  <!-- {MARKER} -->
{head_tags(title=title, description=description, canonical=canonical, image=image, image_alt=image_alt, og_type=og_type)}
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

{chrome_footer(prefix, order_url)}

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


def ordered_groups(present: list[str]) -> list[str]:
    seen = set(present)
    ordered = [g for g in GROUP_ORDER if g in seen]
    ordered.extend(sorted(g for g in present if g not in ordered))
    return ordered


def build_category_page(nhom: str, products: list[dict], groups: list[str], files: dict, order_url: str) -> str:
    filename = files[nhom]
    canonical = f"{SITE}/san-pham/{filename}"
    blurb = GROUP_BLURB.get(
        nhom,
        f"Sản phẩm nhóm {nhom} tại cửa hàng văn phòng phẩm Vạn Phát, KĐT Mỹ Gia, Nam Nha Trang.",
    )
    description = clip(
        f"{nhom} — {blurb} {len(products)} mặt hàng, giá niêm yết. Hotline {HOTLINE_DISPLAY}."
    )
    title = f"{nhom} | Văn phòng phẩm Vạn Phát"
    cards = "\n".join(
        card_html(p, p["_file"], filename) for p in products
    )
    crumbs = [
        ("Trang chủ", "../index.html"),
        ("Sản phẩm", "../san-pham.html"),
        (nhom, None),
    ]
    crumbs_ld = [
        ("Trang chủ", SITE + "/"),
        ("Sản phẩm", SITE + "/san-pham.html"),
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
    catalog_filter = "../san-pham.html?nhom=" + quote(nhom)
    body = f"""    <section class="page-hero">
      <div class="container">
        {breadcrumb_html(crumbs).replace('breadcrumb-dark', 'breadcrumb-light')}
        <h1>{esc(nhom)}</h1>
        <p>{esc(blurb)} {len(products)} sản phẩm — thêm vào giỏ hoặc gọi {esc(HOTLINE_DISPLAY)}.</p>
      </div>
    </section>
    <div class="toolbar">
      <div class="container">
        {group_links(groups, nhom, files)}
      </div>
    </div>
    <section class="catalog-section">
      <div class="container">
        <div class="product-grid">
{cards}
        </div>
        <div class="text-center mt-2">
          <a class="btn btn-primary" href="{esc(order_url)}" target="_blank" rel="noopener">Đặt hàng online</a>
          <a class="btn btn-zalo" href="{ZALO_URL}" target="_blank" rel="noopener">Chat Zalo</a>
          <a class="btn btn-outline-navy" href="tel:{HOTLINE_TEL}">Gọi {esc(HOTLINE_DISPLAY)}</a>
          <a class="btn btn-outline-navy" href="{esc(catalog_filter)}">Lọc nhóm này trong catalog</a>
        </div>
      </div>
    </section>"""
    rep = next((p for p in products if str(p.get("anh") or "").startswith("http")), None)
    image = absolute_image(rep) if rep else OG_IMAGE
    return layout(
        title=title,
        description=description,
        canonical=canonical,
        image=image,
        image_alt=nhom,
        og_type="website",
        json_ld=graph,
        body=body,
        order_url=order_url,
    )


def build_product_page(product: dict, groups: list[str], files: dict, related: list[dict], order_url: str) -> str:
    filename = product["_file"]
    nhom = product.get("nhom") or ""
    canonical = f"{SITE}/san-pham/{filename}"
    cat_file = files.get(nhom, "")
    price = format_price(product.get("gia"))
    description = clip(
        f"{product.get('ten')} (mã {product.get('ma')}), nhóm {nhom}. "
        f"Giá {price} / {product.get('dvt') or 'đơn vị'}. "
        f"Văn phòng phẩm Vạn Phát tại Mỹ Gia, Nam Nha Trang. Hotline {HOTLINE_DISPLAY}."
    )
    title = f"{product.get('ten')} ({product.get('ma')}) | Vạn Phát"
    crumbs = [
        ("Trang chủ", "../index.html"),
        ("Sản phẩm", "../san-pham.html"),
        (nhom, cat_file or "../san-pham.html"),
        (str(product.get("ten") or product.get("ma")), None),
    ]
    crumbs_ld = [
        ("Trang chủ", SITE + "/"),
        ("Sản phẩm", SITE + "/san-pham.html"),
        (nhom, f"{SITE}/san-pham/{cat_file}" if cat_file else SITE + "/san-pham.html"),
        (str(product.get("ten") or product.get("ma")), canonical),
    ]
    image = absolute_image(product)
    offer = {
        "@type": "Offer",
        "url": canonical,
        "priceCurrency": "VND",
        "price": str(int(product.get("gia") or 0)),
        "seller": {"@id": ORG_ID},
    }
    product_ld = {
        "@type": "Product",
        "name": product.get("ten"),
        "sku": product.get("ma"),
        "category": nhom,
        "description": description,
        "image": image,
        "brand": {"@type": "Brand", "name": "Vạn Phát"},
        "offers": offer,
    }
    graph = {
        "@context": "https://schema.org",
        "@graph": [organization_node(), breadcrumb_ld(crumbs_ld), product_ld],
    }
    src = image_src(product)
    related_html = ""
    if related:
        cards = "\n".join(card_html(p, p["_file"], files.get(p.get("nhom"), cat_file)) for p in related)
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
          data-nhom="{esc(product.get('nhom'))}">
          <div class="product-img product-detail-media" data-product-zoom role="button" tabindex="0"
               aria-label="Xem ảnh lớn: {esc(product.get('ten'))}" title="Xem ảnh lớn">
            <img src="{esc(src)}" alt="{esc(product.get('ten'))}" width="800" height="800"
                 loading="eager" fetchpriority="high" decoding="async"
                 onerror="VanPhat.onImgError(this)" />
          </div>
          <div class="product-body product-detail-info">
            <div class="product-nhom"><a href="{esc(cat_file)}">{esc(nhom)}</a></div>
            <h1 class="product-detail-title">{esc(product.get('ten'))}</h1>
            <div class="product-meta-row">
              <span class="product-dvt">ĐVT: {esc(product.get('dvt') or '—')}</span>
              <span class="product-ma">Mã {esc(product.get('ma') or '')}</span>
            </div>
            <div class="product-price"><span class="price-label">Giá</span> {esc(price)}</div>
            <p class="product-detail-note">Giá niêm yết trên web. Thêm vào giỏ để chốt đơn, hoặc gọi hotline nếu cần báo giá số lượng.</p>
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
        order_url=order_url,
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


def render_paths_js(product_map: dict, category_map: dict) -> str:
    payload = {"product": product_map, "category": category_map}
    raw = json.dumps(payload, ensure_ascii=False, separators=(",", ":"))
    return (
        "/* Generated by scripts/generate_catalog_pages.py — do not edit. */\n"
        f"window.VanPhatPaths = {raw};\n"
    )


def write_text(path: Path, text: str) -> bool:
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


def main() -> None:
    assert_slug_samples()
    ap = argparse.ArgumentParser(description="Generate Vạn Phát category/product HTML, sitemap, and path map.")
    ap.add_argument("--products", default=str(ROOT / "data" / "products.json"))
    args = ap.parse_args()
    products_path = Path(args.products)
    data = load_products(products_path)
    products = data["sanpham"]
    order_url = data.get("orderUrl") or (
        "https://script.google.com/macros/s/AKfycbzdcOxIbVAivc2fSCSk1v8go0Wxg_vULF7MDnsmpOcROoWDZ5luBF6uD7Wh-omRkjJB/exec"
    )

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

    groups = ordered_groups(list(by_group))
    cat_files = {name: category_filename(name) for name in groups}
    cat_names = set(cat_files.values())
    overlap = used_files & cat_names
    if overlap:
        raise SystemExit(f"Filename collision between product and category pages: {overlap}")

    out_dir = ROOT / "san-pham"
    out_dir.mkdir(parents=True, exist_ok=True)
    written = 0
    expected: set[str] = set()

    for name in groups:
        expected.add(cat_files[name])
        page = build_category_page(name, by_group[name], groups, cat_files, order_url)
        if write_text(out_dir / cat_files[name], page):
            written += 1

    for product in products:
        expected.add(product["_file"])
        same = [p for p in by_group[product["nhom"]] if p["ma"] != product["ma"]]
        with_img = [p for p in same if p.get("anh")]
        pool = with_img or same
        related = pool[:4]
        page = build_product_page(product, groups, cat_files, related, order_url)
        if write_text(out_dir / product["_file"], page):
            written += 1

    removed = 0
    for html_path in out_dir.glob("*.html"):
        if html_path.name in expected:
            continue
        text = html_path.read_text(encoding="utf-8", errors="ignore")
        if MARKER in text[:400]:
            html_path.unlink()
            removed += 1

    product_map = {p["ma"]: f"san-pham/{p['_file']}" for p in products}
    category_map = {name: f"san-pham/{cat_files[name]}" for name in groups}
    paths_changed = write_text(ROOT / "js" / "catalog-paths.js", render_paths_js(product_map, category_map))

    mtime = datetime.fromtimestamp(products_path.stat().st_mtime, timezone.utc).date().isoformat()
    urls = list(STATIC_PAGES)
    for name in groups:
        urls.append((f"/san-pham/{cat_files[name]}", "weekly", "0.8"))
    for product in products:
        urls.append((f"/san-pham/{product['_file']}", "weekly", "0.6"))
    sitemap_changed = write_text(ROOT / "sitemap.xml", render_sitemap(urls, mtime))
    robots_changed = write_text(ROOT / "robots.txt", render_robots())

    index = ROOT / "index.html"
    if index.exists():
        index_text = index.read_text(encoding="utf-8")
        missing = [cat_files[name] for name in groups if cat_files[name] not in index_text]
        if missing:
            print("warning: index.html is missing category links:", ", ".join(missing))

    print(
        json.dumps(
            {
                "products": len(products),
                "groups": groups,
                "html_written": written,
                "html_removed": removed,
                "paths_js": paths_changed,
                "sitemap": sitemap_changed,
                "robots": robots_changed,
                "sitemap_urls": len(urls),
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    main()
