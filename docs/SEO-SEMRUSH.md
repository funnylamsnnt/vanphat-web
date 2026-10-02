# Semrush và Search Console — Vạn Phát

Máy ảo này không tạo được project Semrush. Các bước dưới đây làm trên tài khoản Semrush và Google Search Console sau khi trang đã lên `main` (GitHub Pages).

Site: https://vanphatcompany.vn  
Sitemap: https://vanphatcompany.vn/sitemap.xml  
`robots.txt`: https://vanphatcompany.vn/robots.txt

## Semrush

1. Tạo **Project** cho domain `vanphatcompany.vn` (cả `https://` và `http://` cùng trỏ về site; theo dõi bản https).
2. Bật **Site Audit**. Đặt crawl nguồn là sitemap ở trên. Audit sẽ thấy trang danh mục tĩnh trong `san-pham/` (nhóm hàng và từng SKU), không chỉ `san-pham.html`.
3. Bật **Position Tracking**, quốc gia / database **Vietnam**, thiết bị desktop + mobile nếu gói cho phép. Từ khóa gợi ý (địa phương, không nhồi thêm biến thể vô hạn):
   - văn phòng phẩm Nha Trang
   - photocopy Nha Trang
   - giấy A4 Nha Trang
   - bìa hồ sơ
   - photocopy Mỹ Gia
   - photocopy Nam Nha Trang
   - văn phòng phẩm Mỹ Gia
   - bút văn phòng Nha Trang
   - in màu Nha Trang
   - dụng cụ văn phòng Nha Trang

## Google Search Console

1. Thêm property **URL prefix** `https://vanphatcompany.vn/` (hoặc domain property nếu đã xác minh DNS).
2. Xác minh quyền sở hữu (DNS, file HTML, hoặc thẻ meta — chọn cách đang dùng cho GitHub Pages).
3. Vào **Sitemaps**, gửi `sitemap.xml` (URL đầy đủ phía trên).
4. Sau khi Google đọc sitemap, dùng **URL Inspection** với một trang nhóm (ví dụ `/san-pham/nhom-giay.html`) và một trang sản phẩm để xác nhận đã index được HTML tĩnh.

## Sau mỗi lần đồng bộ catalog

`scripts/sync_products_from_excel.py` gọi `scripts/generate_catalog_pages.py` khi xuất `data/products.json`. Nếu chỉ sửa JSON bằng tay:

```bash
python3 scripts/generate_catalog_pages.py
```

Lệnh này ghi lại `san-pham/*.html`, `sitemap.xml`, `robots.txt` và `js/catalog-paths.js`. Commit các file đó rồi merge vào `main` để GitHub Pages phát hành. Không cần gửi lại sitemap trên Search Console trừ khi đường dẫn sitemap đổi.
