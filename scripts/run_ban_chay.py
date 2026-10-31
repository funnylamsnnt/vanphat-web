#!/usr/bin/env python3
"""Lịch thứ Hai: xếp hạng bán chạy và, trên GitHub Actions, đẩy main.

Chỉ commit data/ban-chay.json và index.html. Không đụng Apps Script,
không ghi file Excel, không push khi chạy tay ngoài Actions.
"""
from __future__ import annotations

import os
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "scripts"))

from rank_ban_chay import parse_as_of, write_outputs  # noqa: E402

ALLOWED = ("data/ban-chay.json", "index.html")


def redact(text: str, secrets: list[str]) -> str:
    cleaned = text
    for secret in secrets:
        if secret:
            cleaned = cleaned.replace(secret, "***")
    return cleaned


def changed_paths(root: Path) -> list[str]:
    out = subprocess.check_output(["git", "status", "--porcelain", "-z"], cwd=root)
    paths = []
    for item in out.split(b"\0"):
        if not item:
            continue
        text = item.decode()
        path = text[3:] if len(text) > 3 else text
        if " -> " in path:
            path = path.split(" -> ", 1)[1]
        paths.append(path.strip())
    return paths


def publish(root: Path) -> None:
    token = (os.environ.get("GH_PUSH_TOKEN") or "").strip()
    repo = (os.environ.get("GITHUB_REPOSITORY") or "").strip()
    if not token or not repo:
        raise SystemExit("Thiếu GH_PUSH_TOKEN hoặc GITHUB_REPOSITORY, không đẩy main")
    for name in ("check_rules.py", "check_seo.py"):
        proc = subprocess.run([sys.executable, str(root / "scripts" / name)], cwd=root)
        if proc.returncode != 0:
            raise SystemExit(f"{name} không đạt, không commit")
    subprocess.run(["git", "add", "--", *ALLOWED], cwd=root, check=True)
    subprocess.run(
        [
            "git",
            "-c",
            "user.name=github-actions[bot]",
            "-c",
            "user.email=41898282+github-actions[bot]@users.noreply.github.com",
            "commit",
            "-m",
            "Cập nhật bán chạy 4 tuần từ hóa đơn GTGT",
        ],
        cwd=root,
        check=True,
    )
    url = f"https://x-access-token:{token}@github.com/{repo}.git"
    proc = subprocess.run(
        ["git", "push", url, "HEAD:main"],
        cwd=root,
        capture_output=True,
        text=True,
    )
    if proc.returncode != 0:
        err = redact((proc.stderr or "") + (proc.stdout or ""), [token])
        raise SystemExit("git push lỗi\n" + err[-2000:])


def main() -> int:
    as_of = parse_as_of(os.environ.get("BAN_CHAY_AS_OF"))
    write_outputs(ROOT, as_of)
    paths = changed_paths(ROOT)
    extra = [path for path in paths if path not in ALLOWED]
    if extra:
        raise SystemExit("Cây git có file ngoài bảng bán chạy, không commit: " + ", ".join(extra))
    if not paths:
        print("Bảng bán chạy không đổi.")
        return 0
    if os.environ.get("GITHUB_ACTIONS") != "true":
        print("Đã ghi data/ban-chay.json và index.html. Chạy tay nên không đẩy main.")
        return 0
    publish(ROOT)
    print("Đã đẩy bảng bán chạy lên main.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
