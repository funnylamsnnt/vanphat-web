#!/usr/bin/env python3
"""Pre-sync guard: refuse to sync when the Drive source title looks broken.

Before every Excel→web sync, the agent must read Drive metadata for the
official source fileId 1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR (Drive connector
get_file_metadata → "title") and pass it here (or to
sync_products_from_excel.py --drive-title). If the title ends with ".tmp"
(Excel/Drive-for-desktop save error, e.g. "FB1DA4E5.tmp" on 10/10/2026) or is
not "PHIEU BAO GIA VAN PHAT - 2026.xlsx" after normalisation, the sync aborts
WITHOUT touching the web or the LIVE bridge and anh Hà must be notified.

    python3 scripts/source_title_guard.py "PHIEU BAO GIA VAN PHAT - 2026.xlsx"
Exit 0 = OK, exit 3 = abort.
"""
import re, sys, unicodedata

SOURCE_FILE_ID = "1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR"
EXPECTED_TITLE = "PHIEU BAO GIA VAN PHAT - 2026.xlsx"
ABORT_EXIT = 3


def norm_title(title: str) -> str:
    s = unicodedata.normalize("NFKC", str(title or "")).replace("\u00a0", " ")
    s = s.lower().replace("đ", "d")
    s = unicodedata.normalize("NFD", s)
    s = "".join(ch for ch in s if unicodedata.category(ch) != "Mn")
    s = re.sub(r"\s+", " ", s).strip()
    if not s.endswith(".xlsx"):
        s += ".xlsx"  # Drive may show the name without extension
    return s


def check_title(title: str) -> tuple[bool, str]:
    raw = str(title or "").strip()
    if not raw:
        return False, "Drive title is empty (metadata not read?)"
    if raw.lower().endswith(".tmp") or re.search(r"\.tmp\b", raw, re.I) or raw.startswith("~$"):
        return False, f"Drive title is a temp file name: {raw!r} (Excel/Drive save error)"
    if norm_title(raw) != norm_title(EXPECTED_TITLE):
        return False, f"Drive title {raw!r} != expected {EXPECTED_TITLE!r}"
    return True, "ok"


def _self_test() -> None:
    good = ["PHIEU BAO GIA VAN PHAT - 2026.xlsx", "PHIEU BAO GIA VAN PHAT - 2026", " phieu bao gia van phat  - 2026.XLSX "]
    bad = ["FB1DA4E5.tmp", "FB1DA4E5", "", "~$PHIEU BAO GIA VAN PHAT - 2026.xlsx",
           "PHIEU BAO GIA VAN PHAT - 2026 (1).xlsx", "PHIEU BAO GIA VAN PHAT - 2026.xlsx.tmp"]
    for t in good:
        assert check_title(t)[0], t
    for t in bad:
        assert not check_title(t)[0], t


_self_test()

if __name__ == "__main__":
    if len(sys.argv) != 2:
        raise SystemExit(__doc__)
    ok, why = check_title(sys.argv[1])
    print(("OK: " if ok else "ABORT: ") + why)
    sys.exit(0 if ok else ABORT_EXIT)
