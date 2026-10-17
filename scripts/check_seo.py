#!/usr/bin/env python3
"""Rà SEO kỹ thuật trên cây đang có.

Chạy trên mọi pull request và một lượt sau khi merge vào main.
Không deploy Pages. Semrush và Search Console không nằm ở đây.

Link nội bộ và ảnh cùng origin (href, src, srcset, og:image, twitter:image)
phải có file trong repo. Ảnh local còn phải đọc được (không rỗng, đúng định dạng).
Script không gọi HTTP ra host khác, nên link bên thứ ba không làm CI đỏ vì timeout.

    python3 scripts/check_seo.py
"""
from __future__ import annotations

import html
import json
import re
import sys
import unicodedata
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://vanphatcompany.vn"
SKIP_DIRS = {".git", "node_modules", "__pycache__"}
TITLE_HARD_MAX = 90
DESC_HARD_MAX = 220
HTML_WEIGHT_MAX = 500_000
ATTR_RE = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.I)
SRCSET_RE = re.compile(r"""(?:srcset|imagesrcset)\s*=\s*["']([^"']+)["']""", re.I)
META_RE = re.compile(r"<meta\b[^>]*>", re.I | re.S)
IMG_RE = re.compile(r"<img\b[^>]*>", re.I | re.S)
LOC_RE = re.compile(r"<loc>\s*([^<]+?)\s*</loc>")
IMAGE_EXT = {".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg", ".ico", ".avif", ".bmp"}
META_IMAGE_NAMES = {"og:image", "twitter:image"}
SKU_PAGE_RE = re.compile(r"^san-pham/(vp\d+)-.+\.html$", re.I)


def fail(errors: list[str]) -> None:
    print(f"SEO KHÔNG ĐẠT: {len(errors)} lỗi")
    for item in errors[:80]:
        print(f"- {item}")
    if len(errors) > 80:
        print(f"- … và {len(errors) - 80} lỗi nữa")
    raise SystemExit(1)


def iter_html() -> list[Path]:
    found = []
    for path in ROOT.rglob("*.html"):
        if any(part in SKIP_DIRS for part in path.parts):
            continue
        found.append(path)
    return found


def is_staff(path: Path) -> bool:
    rel = path.relative_to(ROOT).as_posix()
    return rel == "nhan-vien.html" or rel.startswith("nhan-vien/")


def loc_to_path(loc: str) -> Path:
    parsed = urlparse(loc.strip())
    raw = unquote(parsed.path)
    if raw in ("", "/"):
        return ROOT / "index.html"
    rel = raw.lstrip("/")
    if rel.endswith("/"):
        rel += "index.html"
    return ROOT / rel


def split_srcset(value: str) -> list[str]:
    refs: list[str] = []
    for part in value.split(","):
        bits = part.strip().split()
        if bits:
            refs.append(bits[0])
    return refs


def meta_image_refs(text: str) -> list[str]:
    refs: list[str] = []
    for tag in META_RE.findall(text):
        name = re.search(r"""(?:property|name)\s*=\s*["']([^"']+)["']""", tag, re.I)
        content = re.search(r"""content\s*=\s*["']([^"']+)["']""", tag, re.I)
        if not name or not content:
            continue
        if name.group(1).strip().lower() in META_IMAGE_NAMES:
            refs.append(content.group(1))
    return refs


def page_refs(text: str) -> list[tuple[str, str]]:
    found: list[tuple[str, str]] = [("ref", ref) for ref in ATTR_RE.findall(text)]
    for raw in SRCSET_RE.findall(text):
        found.extend(("image", ref) for ref in split_srcset(raw))
    found.extend(("image", ref) for ref in meta_image_refs(text))
    return found


def sniff_image(path: Path) -> str | None:
    """None khi file ảnh đọc được. Chỉ gọi khi hậu tố là ảnh và file tồn tại."""
    if path.stat().st_size == 0:
        return "file rỗng"
    blob = path.read_bytes()[:64]
    ext = path.suffix.lower()
    if ext == ".svg":
        head = path.read_bytes()[:512].decode("utf-8", errors="ignore").lower()
        if "<svg" not in head:
            return "không phải SVG"
        return None
    if ext in (".jpg", ".jpeg") and blob[:3] != b"\xff\xd8\xff":
        return "không phải JPEG"
    if ext == ".png" and blob[:8] != b"\x89PNG\r\n\x1a\n":
        return "không phải PNG"
    if ext == ".gif" and blob[:6] not in (b"GIF87a", b"GIF89a"):
        return "không phải GIF"
    if ext == ".webp" and (blob[:4] != b"RIFF" or blob[8:12] != b"WEBP"):
        return "không phải WebP"
    if ext == ".ico" and blob[:4] not in (b"\x00\x00\x01\x00", b"\x00\x00\x02\x00"):
        return "không phải ICO"
    if ext == ".avif" and blob[4:8] != b"ftyp":
        return "không phải AVIF"
    if ext == ".bmp" and blob[:2] != b"BM":
        return "không phải BMP"
    return None


def resolve_ref(page: Path, ref: str) -> Path | None:
    value = ref.strip()
    if not value or value.startswith(("#", "mailto:", "tel:", "javascript:", "data:")):
        return None
    if value.startswith("//"):
        return None
    parsed = urlparse(value)
    if parsed.scheme in ("http", "https"):
        host = (parsed.hostname or "").lower()
        if host not in ("vanphatcompany.vn", "www.vanphatcompany.vn"):
            return None
        path = unquote(parsed.path)
    else:
        path = unquote(parsed.path)
        if not path:
            return None
    path = path.split("#", 1)[0]
    if not path:
        return None
    if path.startswith("/"):
        target = ROOT / path.lstrip("/")
    else:
        target = (page.parent / path).resolve()
    if target.is_dir():
        target = target / "index.html"
    return target


def check_robots(errors: list[str]) -> None:
    text = (ROOT / "robots.txt").read_text(encoding="utf-8")
    if "User-agent:" not in text or "Allow:" not in text:
        errors.append("robots.txt thiếu User-agent hoặc Allow")
    if f"Sitemap: {SITE}/sitemap.xml" not in text:
        errors.append("robots.txt thiếu Sitemap trỏ về vanphatcompany.vn/sitemap.xml")
    if re.search(r"(?m)^Disallow:\s*/(san-pham|linh-vuc)", text):
        errors.append("robots.txt đang chặn catalog hoặc lĩnh vực")


def check_sitemap(errors: list[str]) -> int:
    text = (ROOT / "sitemap.xml").read_text(encoding="utf-8")
    locs = LOC_RE.findall(text)
    if not locs:
        errors.append("sitemap.xml không có loc")
        return 0
    for loc in locs:
        if not loc.startswith(f"{SITE}/") and loc.rstrip("/") != SITE:
            errors.append(f"sitemap loc không thuộc site: {loc}")
            continue
        if "nhan-vien" in loc:
            errors.append(f"sitemap đang có trang nhân viên: {loc}")
        target = loc_to_path(loc)
        if not target.is_file():
            errors.append(f"sitemap trỏ tới file không có: {loc}")
    return len(locs)


def check_pages(errors: list[str]) -> tuple[int, int]:
    pages = 0
    image_files: set[Path] = set()
    sniffed: dict[Path, str | None] = {}
    for path in iter_html():
        text = path.read_text(encoding="utf-8", errors="replace")
        rel = path.relative_to(ROOT).as_posix()
        pages += 1
        if path.stat().st_size > HTML_WEIGHT_MAX:
            errors.append(f"{rel}: HTML nặng hơn {HTML_WEIGHT_MAX} byte")
        for img in IMG_RE.findall(text):
            if not re.search(r"\balt\s*=", img, re.I):
                errors.append(f"{rel}: img thiếu alt")
                break
        seen: set[str] = set()
        for kind, ref in page_refs(text):
            if ref in seen:
                continue
            seen.add(ref)
            target = resolve_ref(path, ref)
            if target is None:
                continue
            try:
                target.relative_to(ROOT)
            except ValueError:
                errors.append(f"{rel}: link thoát khỏi repo {ref}")
                continue
            is_image = kind == "image" or target.suffix.lower() in IMAGE_EXT
            if not target.is_file():
                label = "ảnh gãy" if is_image else "link gãy"
                errors.append(f"{rel}: {label} {ref}")
                continue
            if target.suffix.lower() not in IMAGE_EXT:
                continue
            if target not in sniffed:
                sniffed[target] = sniff_image(target)
            reason = sniffed[target]
            if reason:
                errors.append(f"{rel}: ảnh hỏng {ref} ({reason})")
                continue
            image_files.add(target)
        if is_staff(path):
            if "noindex" not in text:
                errors.append(f"{rel}: trang nhân viên phải noindex")
            continue
        title = re.search(r"<title>(.*?)</title>", text, re.S)
        title_text = re.sub(r"\s+", " ", title.group(1)).strip() if title else ""
        if not title_text:
            errors.append(f"{rel}: thiếu title")
        elif len(title_text) > TITLE_HARD_MAX:
            errors.append(f"{rel}: title dài {len(title_text)} ký tự")
        if text.count('rel="canonical"') != 1:
            errors.append(f"{rel}: cần đúng một canonical")
        elif f'href="{SITE}' not in text and f"href='{SITE}" not in text:
            errors.append(f"{rel}: canonical chưa phải URL tuyệt đối của site")
        desc = re.search(r'name="description"\s+content="([^"]*)"', text)
        if not desc or not desc.group(1).strip():
            errors.append(f"{rel}: thiếu meta description")
        elif len(desc.group(1)) > DESC_HARD_MAX:
            errors.append(f"{rel}: description dài {len(desc.group(1))} ký tự")
        for prop in ("og:title", "og:description", "og:url", "og:image"):
            if f'property="{prop}"' not in text:
                errors.append(f"{rel}: thiếu {prop}")
                break
        if 'name="twitter:card"' not in text:
            errors.append(f"{rel}: thiếu twitter:card")
        if 'hreflang="vi"' not in text:
            errors.append(f"{rel}: thiếu hreflang vi")
        if rel == "index.html" and "Organization" not in text and "LocalBusiness" not in text:
            errors.append("index.html thiếu schema Organization hoặc LocalBusiness")
        if rel.startswith("san-pham/vp") and rel.endswith(".html"):
            if not re.search(r'"@type"\s*:\s*"Product"', text):
                errors.append(f"{rel}: trang SKU thiếu schema Product")
            elif not re.search(r'"url"\s*:\s*"https://vanphatcompany\.vn/san-pham/', text):
                errors.append(f"{rel}: schema Product thiếu url tuyệt đối")
        if rel.startswith("san-pham/nhom-") and rel.endswith(".html"):
            if "CollectionPage" not in text or "ItemList" not in text:
                errors.append(f"{rel}: trang nhóm thiếu CollectionPage/ItemList")
        if rel.startswith("linh-vuc/") and rel.endswith(".html"):
            if "CollectionPage" not in text or "ItemList" not in text:
                errors.append(f"{rel}: trang lĩnh vực thiếu CollectionPage/ItemList")
        if rel == "san-pham.html":
            if "vp-catalog-dir" not in text or "<noscript" not in text:
                errors.append("san-pham.html thiếu thư mục catalog tĩnh (noscript)")
            if "ItemList" not in text:
                errors.append("san-pham.html thiếu ItemList trong JSON-LD")
    if not image_files:
        errors.append("không thấy ảnh cùng origin nào — bộ quét ảnh hỏng")
    return pages, len(image_files)


def norm_title(value: str) -> str:
    text = html.unescape(value)
    text = unicodedata.normalize("NFC", text)
    return re.sub(r"\s+", " ", text).strip()


def load_sku_names() -> dict[str, str]:
    path = ROOT / "data" / "products.json"
    if not path.is_file():
        return {}
    data = json.loads(path.read_text(encoding="utf-8"))
    names: dict[str, str] = {}
    for item in data.get("sanpham") or []:
        ma = str(item.get("ma") or "").strip().lower()
        ten = norm_title(str(item.get("ten") or ""))
        if ma and ten:
            names[ma] = ten
    return names


def same_source_sku(pages: list[str], names: dict[str, str]) -> bool:
    """True khi mọi trang là SKU và tên trong Excel/nguồn giống hệt nhau."""
    found: list[str] = []
    for rel in pages:
        match = SKU_PAGE_RE.match(rel)
        if not match:
            return False
        ten = names.get(match.group(1).lower())
        if not ten:
            return False
        found.append(ten)
    return len(found) >= 2 and all(ten == found[0] for ten in found)


def check_duplicate_titles(errors: list[str], warnings: list[str]) -> None:
    """Title index được phải khác nhau. SKU trùng tên nguồn chỉ cảnh báo.

    So khớp không phân biệt hoa thường, sau khi bỏ thực thể HTML. VP125 và VP126
    cùng tên trong Excel thì không làm fail — đó là dữ liệu nguồn, không bịa tên.
    """
    names = load_sku_names()
    buckets: dict[str, list[tuple[str, str]]] = {}
    for path in iter_html():
        if is_staff(path):
            continue
        text = path.read_text(encoding="utf-8", errors="replace")
        match = re.search(r"<title>(.*?)</title>", text, re.S)
        if not match:
            continue
        title = norm_title(match.group(1))
        if not title:
            continue
        rel = path.relative_to(ROOT).as_posix()
        buckets.setdefault(title.casefold(), []).append((rel, title))
    for items in buckets.values():
        if len(items) < 2:
            continue
        pages = [rel for rel, _title in items]
        shown = items[0][1]
        listed = ", ".join(pages)
        if same_source_sku(pages, names):
            warnings.append(
                f"title trùng ở SKU cùng tên nguồn «{names[SKU_PAGE_RE.match(pages[0]).group(1).lower()]}»: {listed}"
            )
            continue
        errors.append(f"title trùng «{shown}»: {listed}")


def self_test() -> None:
    if resolve_ref(ROOT / "index.html", "https://example.com/anh.jpg") is not None:
        raise SystemExit("self-test: không được gọi file bên thứ ba")
    if resolve_ref(ROOT / "index.html", "mailto:a@b.c") is not None:
        raise SystemExit("self-test: mailto phải bỏ qua")
    same = resolve_ref(ROOT / "index.html", f"{SITE}/assets/og.jpg?v=1")
    if same != ROOT / "assets" / "og.jpg":
        raise SystemExit(f"self-test: cùng origin phải về file local, ra {same}")
    parts = split_srcset("a.webp?v=1, b.webp 2x")
    if parts != ["a.webp?v=1", "b.webp"]:
        raise SystemExit(f"self-test: srcset tách sai {parts}")
    sample = meta_image_refs(
        '<meta property="og:image" content="https://cdn.example/a.jpg" />'
    )
    if sample != ["https://cdn.example/a.jpg"]:
        raise SystemExit("self-test: không đọc og:image")
    if resolve_ref(ROOT / "index.html", sample[0]) is not None:
        raise SystemExit("self-test: og:image host lạ phải bỏ qua, không timeout")
    sku_names = {"vp125": "Bút Chì Gỗ 2B Maped (Hộp 12 cây)", "vp126": "Bút Chì Gỗ 2B Maped (Hộp 12 cây)", "vp127": "Bút khác"}
    same = [
        "san-pham/vp125-but-chi-go-2b-maped-hop-12-cay.html",
        "san-pham/vp126-but-chi-go-2b-maped-hop-12-cay.html",
    ]
    if not same_source_sku(same, sku_names):
        raise SystemExit("self-test: SKU cùng tên nguồn phải chỉ cảnh báo")
    mixed = same + ["linh-vuc/vpp.html"]
    if same_source_sku(mixed, sku_names):
        raise SystemExit("self-test: title trùng ngoài SKU phải là lỗi")
    different = [
        "san-pham/vp125-but-chi-go-2b-maped-hop-12-cay.html",
        "san-pham/vp127-but-khac.html",
    ]
    if same_source_sku(different, sku_names):
        raise SystemExit("self-test: SKU khác tên không được bỏ qua")
    if norm_title("Băng Keo Nha Trang | Vạn Phát").casefold() != norm_title("Băng keo Nha Trang | Vạn Ph&#225;t").casefold():
        raise SystemExit("self-test: title phải so sau khi bỏ thực thể và hoa thường")


def main() -> None:
    self_test()
    errors: list[str] = []
    warnings: list[str] = []
    check_robots(errors)
    locs = check_sitemap(errors)
    pages, images = check_pages(errors)
    check_duplicate_titles(errors, warnings)
    for item in warnings:
        print(f"CẢNH BÁO: {item}")
    if errors:
        fail(errors)
    note = f", {len(warnings)} cảnh báo title SKU cùng tên nguồn" if warnings else ""
    print(
        f"OK: SEO kỹ thuật, {pages} trang HTML, {locs} URL trong sitemap, "
        f"{images} ảnh cùng origin đọc được{note}."
    )


if __name__ == "__main__":
    main()
