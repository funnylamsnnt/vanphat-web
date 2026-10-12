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

## Kiểm tra

- [ ] `python3 scripts/check_rules.py`
- [ ] `python3 scripts/check_seo.py`
- [ ] Không push thẳng `main`. Anh merge thì Pages mới phát hành.
- [ ] Không ghi đè `CNAME`, không commit bí mật, không thêm lại «Đặt hàng online».

Cầu nối LIVE do trợ lý ngoài refresh sau khi anh merge, rồi báo một tin. Không ghi fileId cầu nối vào PR.

Semrush và Search Console làm sau khi site đã lên, theo `docs/SEO-SEMRUSH.md`, không gắn tài khoản vào repo.
