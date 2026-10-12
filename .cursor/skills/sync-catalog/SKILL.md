---
name: sync-catalog
description: >-
  Dùng khi đồng bộ giá và danh mục Vạn Phát từ Drive fileId
  1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR (sheet Danh Mục Vật Tư) lên
  vanphatcompany.vn, hoặc khi sửa script sync. Chốt tên file nguồn trước,
  không đăng nhóm Không đưa lên web, giữ ba lĩnh vực trong data/ia.json.
---

# Đồng bộ catalog Excel → web

Nguồn duy nhất (anh Hà khóa 27/09/2026):

- https://docs.google.com/spreadsheets/d/1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR/edit
- fileId `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`
- tên chuẩn `PHIEU BAO GIA VAN PHAT - 2026.xlsx`
- sheet `Danh Mục Vật Tư`

Không dùng catalog Drive khác, kể cả file tên `VanPhat_Web_Catalog_SOURCE.xlsx`. Không ghi fileId nguồn cũ vào repo.

Lịch 8:09 và 14:09 (Asia/Bangkok), bản Excel trên máy trợ lý, và refresh cầu nối LIVE thuộc trợ lý ngoài. Cursor không tự chạy lịch đó. Cả trợ lý ngoài và Cursor, khi có đổi, chỉ mở PR. Không push `main`. Khi anh nói `sync giá`, hoặc giao sync, làm trong repo này.

Trong repo này:

- Script đúng: `scripts/sync_products_from_excel.py` (đọc `data/ia.json`, bắt buộc `--drive-title`)
- Chốt tên file: `scripts/source_title_guard.py`
- Sinh trang: `scripts/generate_catalog_pages.py`
- State: `scripts/sync_state.json`

Bản script nằm ngoài repo mà không đọc `ia.json` là bản cũ, không dùng. File Excel mirror và script refresh cầu nối không có trong repo. Ý định của bước cầu nối: trợ lý ngoài thay toàn bộ sheet native bằng dữ liệu nguồn rồi đối soát số dòng bằng đúng số SKU, lệch bằng 0. Không convert file master. Không commit fileId cầu nối hay sheet đơn.

## Không đưa lên web

Nhóm khớp `Không đưa lên web` (bỏ dấu, hoa thường, khoảng trắng) thì loại khỏi `data/products.json`, trang SKU, trang nhóm, trang lĩnh vực, tìm kiếm, sitemap. Danh sách cụm loại trừ là `excludeGroups` trong `data/ia.json`; script còn chốt cứng cụm gốc. Mã đã lên web mà bị gán nhóm này thì gỡ trong cùng lượt và ghi mã trong PR. Cầu nối LIVE vẫn giữ đủ mã.

## Lĩnh vực

Giữ cây `data/ia.json`. `autoPlaceNewGroups` đang bật: script tự xếp nhóm có tên mới vào một trong ba lĩnh vực, ghi vào `ia.json`, và phát hành. Không nhét vào Dụng cụ VP. Ô trống và nhãn `Khác` ở ngoài web, có tên trong PR. Nước uống phải ở `nuoc-banh`. Chi tiết cách chấm ở `classify_new_nhom` trong script, và ở skill `web-ia-linh-vuc`.

## Các bước khi anh giao sync

0. Đọc metadata Drive của fileId nguồn (title). Nếu title kết thúc bằng `.tmp`, là file tạm `~$...`, hoặc sau khi chuẩn hóa không phải `PHIEU BAO GIA VAN PHAT - 2026.xlsx`, thì dừng. Không ghi web, không nhờ refresh cầu nối, báo anh. Cách gỡ phía Drive: Manage versions, tải bản đúng lên thành version mới, đổi lại tên, giữ nguyên fileId. Chạy thử chốt tên:

```bash
python3 scripts/source_title_guard.py "PHIEU BAO GIA VAN PHAT - 2026.xlsx"
```

Thoát 0 là được, thoát 3 là dừng. Sync thật:

```bash
python3 scripts/sync_products_from_excel.py <file.xlsx> --drive-title "<title vừa đọc>"
```

Thiếu `--drive-title` hoặc title sai thì script thoát 3, chưa ghi gì.

1. So `modifiedTime` của nguồn với `scripts/sync_state.json`. Không đổi thì dừng, không báo rỗng.
2. Đọc sheet `Danh Mục Vật Tư`. Đối chiếu thêm, xóa, đổi tên, giá, ảnh, tồn.
3. Loại nhóm cấm. Nhóm tên mới do script xếp và ghi vào `ia.json`. Script tự gọi generator: `products.json`, trang lĩnh vực, nhóm, SKU, sitemap, `js/catalog-paths.js`.
4. Mở PR, không push `main`. Điền mẫu `.github/PULL_REQUEST_TEMPLATE.md` từ JSON script in ra (`added`, `removed`, `priceChanges`, `slugChanges`, `zeroPrice`, `autoPlacedGroups`, `heldUnmappedGroups`, `excludedGroups`). Không tự sửa file nguồn trên Drive.
5. Nhờ trợ lý ngoài refresh cầu nối sau khi web đúng, hoặc chỉ làm nếu anh giao riêng từng lần. Vẫn không ghi fileId vào commit.
6. Cập nhật `scripts/sync_state.json` trong cùng PR khi lượt này do Cursor chạy. Chạy `python3 scripts/check_rules.py`.

## Giữ nguyên

Lightbox mọi ảnh sản phẩm phía khách. Không thêm lại «Đặt hàng online» hay form Apps Script. Giữ giỏ, Zalo, hotline. Không ghi đè `CNAME`. Không commit khóa API. Không tải ngược file nguồn lên Drive đè bản của anh.

## Chất lượng dữ liệu, chỉ báo không tự sửa nguồn

- Giá trống hoặc giá 0.
- Đổi tên làm đổi slug: trang cũ sẽ 404. Hỏi anh nếu cần redirect.
- Mã cũ bị dùng cho sản phẩm khác (ví dụ một mã từng là bút rồi thành thước): ghi rõ trong PR.
