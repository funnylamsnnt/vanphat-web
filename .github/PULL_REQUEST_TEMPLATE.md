## Việc này

<!-- Một câu: sync giá, xếp nhóm, rà seo, sửa code, hoặc việc khác. -->

## Catalog

Điền khi PR đụng giá hoặc danh mục. Lấy từ JSON in ra bởi `scripts/sync_products_from_excel.py`. Không đụng catalog thì ghi «không áp dụng».

- Mã thêm:
- Mã gỡ (kể cả nhóm Không đưa lên web):
- Giá đổi (mã, giá cũ, giá mới):
- Slug đổi (mã, tên cũ, tên mới):
- Giá trống hoặc bằng 0:
- Nhóm mới tự xếp: tên trong Excel, lĩnh vực, lý do
- Giữ ngoài web: ô Nhóm trống, nhãn Khác

## Đề xuất cải tiến

Ghi 1–3 đề xuất ngắn về UI, SEO hoặc hiệu năng thấy khi làm task. Mỗi đề xuất đủ ba ý. Chỉ ghi ở đây, không tự làm ngoài phạm vi task. Ô không dùng thì ghi «không có».

1. Đề xuất:
   Lợi ích:
   Cần anh duyệt:
2. Đề xuất:
   Lợi ích:
   Cần anh duyệt:
3. Đề xuất:
   Lợi ích:
   Cần anh duyệt:

## Kiểm tra

- [ ] `python3 scripts/check_rules.py`
- [ ] `python3 scripts/check_seo.py`
- [ ] Không push thẳng `main`. Anh merge thì Pages mới phát hành.
- [ ] Không ghi đè `CNAME`, không commit bí mật, không thêm lại «Đặt hàng online».

Cầu nối LIVE do trợ lý ngoài refresh sau khi anh merge, rồi báo một tin. Không ghi fileId cầu nối vào PR.

Semrush và Search Console làm sau khi site đã lên, theo `docs/SEO-SEMRUSH.md`, không gắn tài khoản vào repo.
