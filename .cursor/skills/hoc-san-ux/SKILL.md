---
name: hoc-san-ux
description: So sánh UX của sàn thương mại uy tín với vanphatcompany.vn rồi chỉnh catalog cho chuyên hơn. Dùng khi anh nói học sàn, hoặc khi sửa tìm kiếm, sắp xếp, lọc, đã xem gần đây.
---

# Học sàn, chỉnh web Vạn Phát

Web là https://vanphatcompany.vn. Sàn để học cách khách tìm và chốt, không phải để copy giao diện hay bịa số liệu.

## Việc làm

1. Mở ít nhất một sàn trong nước (Shopee, Tiki hoặc Lazada) và một mẫu quốc tế (Amazon hoặc một catalog B2B gọn). Chỉ xem tìm kiếm, sắp xếp, bộ lọc đang bật, trạng thái rỗng, và hàng đã xem.
2. Đối chiếu với `san-pham.html`, `js/products.js`, `js/ia.js`, `js/main.js`.
3. Sửa phần còn thiếu nếu nó trung thực với catalog tĩnh: sắp xếp trên URL, chip lọc gỡ được, gợi ý có ảnh và giá, tìm gần đây, đã xem gần đây, nút lên đầu trang.
4. Mở PR. Không push `main`.

## Không đưa lên web

- Sao chép giao diện, logo, màu, chữ của sàn.
- Đánh giá, số đã bán, flash sale, tồn kho chính xác, phí ship toàn quốc, nút «Đặt hàng online».
- Giá hoặc tên không có trong `data/products.json`. Giá 0 hoặc trống vẫn hiện «Liên hệ» và xếp cuối khi sắp theo giá.

Giữ lightbox, giỏ, Zalo, hotline. Sau khi sửa, chạy `python3 scripts/check_rules.py` và `python3 scripts/check_seo.py`. Đổi CSS hoặc JS thì tăng `CSS_V` / `JS_V` trong `scripts/generate_catalog_pages.py` (toàn chữ số) và cùng số đó trên HTML.
