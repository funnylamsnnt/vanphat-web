---
name: web-ia-linh-vuc
description: >-
  Dùng khi thêm hoặc sửa lĩnh vực, nhóm hàng, menu, ô tìm, hoặc tile trang chủ
  trên vanphatcompany.vn. Cây L1 đến L3 nằm ở data/ia.json. Nhóm mới thì tự xếp
  vào lĩnh vực khớp nhất, phát hành, và ghi trong PR.
---

# IA lĩnh vực

Khách chọn lĩnh vực (L1), rồi nhóm (L2), rồi sản phẩm (L3). Ô tìm header tìm xuyên mọi lĩnh vực, bỏ dấu, kết quả có badge lĩnh vực và nhóm. Tham chiếu cách xếp: tile ngành cộng ô tìm (kiểu sàn thương mại), và với đồ uống thì duyệt bằng ảnh từng chai.

Cấu hình: `data/ia.json`, mảng `linh_vuc` với `slug`, `ten`, `browseMode`, `nhomIds`, và mảng `nhom`.

- `group-images`: L1 hiện tile ảnh nhóm. Dùng cho Văn phòng phẩm và Điện gia dụng.
- `product-images`: L1 hiện lưới ảnh từng sản phẩm. Dùng cho Nước uống & Bánh.
- Nhóm 0 SKU: giữ placeholder «sắp có», không ẩn lĩnh vực. Bánh đang là placeholder.

Cây hiện tại:

| L1 | slug | browseMode | L2 |
|---|---|---|---|
| Văn phòng phẩm | `vpp` | group-images | Giấy, Bìa Hồ Sơ, Bút & Mực, Băng Keo, Dụng cụ VP |
| Nước uống & Bánh | `nuoc-banh` | product-images | Nước uống, Bánh |
| Điện gia dụng | `dien-gia-dung` | group-images | Điện |

Trang sinh ra: `linh-vuc/<slug>.html`, `san-pham/nhom-<slug>.html`, trang SKU, cộng sitemap và `js/catalog-paths.js`. Menu và tile trang chủ đọc cùng config qua `js/ia.js`.

## Nhóm hoặc lĩnh vực mới

Anh Hà cập nhật ngày 10/10/2026: không hỏi trước cho một nhóm Excel đã có tên.

1. Nhóm có tên nghiệp vụ chưa nằm trong `ia.json`: script sync (`autoPlaceNewGroups`) chọn một trong ba L1 khớp nhất, thêm mục `nhom` và id vào `nhomIds`, rồi phát hành. Sửa tay thì làm cùng việc đó. Không nhét mặc định vào Dụng cụ VP. Không tạo L1 thứ tư. Nước rửa và tên không phải đồ uống không bị kéo sang Nước uống chỉ vì có chữ «nước».
2. Ô trống và nhãn `Khác` vẫn ở ngoài web. Tắt `autoPlaceNewGroups` thì nhóm tên mới cũng bị giữ, và PR phải nói rõ.
3. Sinh lại trang nhóm, lĩnh vực, sitemap. Giữ slug cũ. Đổi slug chỉ khi anh bắt buộc, và phải có redirect.
4. PR ghi: tên nhóm trong Excel, L1 và L2 đã đặt, một câu vì sao. Ô Nhóm trống hoặc nhãn `Khác` thì không tự xếp; giữ ngoài web và nêu trong PR.
5. Nước uống không được rơi về `vpp`.

Sửa UI thuần (menu, tile) thì không ghi đè `data/products.json`, `data/ia.json`, hay `CNAME` nếu việc đó không cần. Giữ lightbox, giỏ, Zalo, hotline. Không thêm «Đặt hàng online».

## Kiểm tra

Trang chủ có đủ ba tile lĩnh vực. Trang `nuoc-banh` là lưới sản phẩm. Trang `vpp` và `dien-gia-dung` là tile nhóm. Tìm một từ không dấu (ví dụ tên một chai nước, hoặc `giay a4`) ra đúng mã, có badge. Ảnh vẫn mở lightbox. `python3 scripts/check_rules.py` xanh.
