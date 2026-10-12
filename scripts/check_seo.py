#!/usr/bin/env python3
"""Rà SEO kỹ thuật trên cây đang có.

Chạy trên mọi pull request và một lượt sau khi merge vào main.
Không deploy Pages. Semrush và Search Console không nằm ở đây.

    python3 scripts/check_seo.py
"""
from __future__ import annotations

import re
import sys
from pathlib import Path
from urllib.parse import unquote, urlparse

ROOT = Path(__file__).resolve().parent.parent
SITE = "https://vanphatcompany.vn"
SKIP_DIRS = {".git", "node_modules", "__pycache__"}
TITLE_HARD_MAX = 90
DESC_HARD_MAX = 220
HTML_WEIGHT_MAX = 500_000
ATTR_RE = re.compile(r"""(?:href|src)\s*=\s*["']([^"']+)["']""", re.I)
IMG_RE = re.compile(r"<img\b[^>]*>", re.I | re.S)
LOC_RE = re.compile(r"<loc>\s*([^<]+?)\s*</loc>")


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


def check_pages(errors: list[str]) -> int:
    pages = 0
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
        if rel.startswith("san-pham/vp") and rel.endswith(".html") and not re.search(r'"@type"\s*:\s*"Product"', text):
            errors.append(f"{rel}: trang SKU thiếu schema Product")
        for ref in ATTR_RE.findall(text):
            target = resolve_ref(path, ref)
            if target is None:
                continue
            try:
                target.relative_to(ROOT)
            except ValueError:
                errors.append(f"{rel}: link thoát khỏi repo {ref}")
                continue
            if not target.is_file():
                errors.append(f"{rel}: link gãy {ref}")
    return pages


def main() -> None:
    errors: list[str] = []
    check_robots(errors)
    locs = check_sitemap(errors)
    pages = check_pages(errors)
    if errors:
        fail(errors)
    print(f"OK: SEO kỹ thuật, {pages} trang HTML, {locs} URL trong sitemap.")


if __name__ == "__main__":
    main()
