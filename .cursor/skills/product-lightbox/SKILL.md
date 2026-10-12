---
name: product-lightbox
description: >-
  Dùng khi sửa thẻ sản phẩm, catalog, zoom ảnh, hoặc nút thêm giỏ trên
  vanphatcompany.vn. Mọi ảnh sản phẩm phía khách phải mở lightbox.
---

# Lightbox ảnh sản phẩm

Áp cho mọi chỗ khách thấy thẻ: trang chủ (khối sản phẩm nổi bật), `san-pham.html`, `linh-vuc/*.html`, `san-pham/nhom-*.html`, trang SKU, `dia-phuong/*.html`. Ảnh placeholder cũng mở lightbox. Lĩnh vực `browseMode: product-images` dùng cùng lightbox.

Lightbox gồm ảnh lớn, tên, mã, đơn vị tính, giá, ô số lượng, nút Thêm vào giỏ (cùng `VanPhatCart.add` với nút trên thẻ), nút X góc trên phải. Đóng bằng X, Escape, hoặc click lớp phủ. Không gỡ cụm số lượng và Thêm vào giỏ trên thẻ.

Chỗ sửa:

- `js/products.js` hàm `cardHTML`: `div.product-img` có `data-product-zoom`, thẻ có `data-ma`, `data-ten`, `data-gia`, `data-dvt`, `data-anh`, `data-add-cart`
- `scripts/generate_catalog_pages.py` hàm `card_html`: cùng móc, vì trang tĩnh không đi qua `cardHTML`
- `js/product-lightbox.js`: dựng `#product-lightbox` và `#product-lightbox-overlay`, `data-lb-close`, `data-lb-qty`, `data-lb-add`, listener Escape, `overlay` click gọi `close`
- `css/styles.css`: `.product-card`, `.product-img`, `.qty-control`, con trỏ zoom trên ảnh
- Trang có thẻ phải nạp `js/product-lightbox.js` (generator đã nhét trong `scripts()`)

Click ảnh phải `stopPropagation` để không kích hoạt link bên dưới. Sổ nhân viên `js/staff-order.js` là «Thêm vào đơn», không nằm trong quy tắc này.

Sửa mỗi UI thì không ghi đè `data/products.json`, `data/ia.json`, `CNAME`.

Xong thì chạy `python3 scripts/check_rules.py`. Trên trình duyệt: mở vài ảnh ở catalog, một trang lĩnh vực, một trang SKU; thêm giỏ từ lightbox; đóng bằng X, Escape, và click nền; nút trên thẻ vẫn thêm được giỏ.
