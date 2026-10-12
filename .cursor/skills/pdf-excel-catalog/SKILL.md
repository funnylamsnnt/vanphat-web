---
name: pdf-excel-catalog
description: >-
  Dùng khi anh cần xuất danh mục sản phẩm Vạn Phát ra PDF hoặc Excel cho khách
  hoặc đối tác. Chỉ sản phẩm có ảnh thật. File Excel theo bố cục phiếu in cột A đến H.
---

# Danh mục PDF và Excel cho khách

Chỉ giữ sản phẩm có ảnh thật. Bỏ mã thiếu trường `anh`, URL không tải được, hoặc ảnh lỗi. Không dùng ảnh placeholder. Không bịa giá.

Nguồn dữ liệu là `data/products.json`, mảng `sanpham`, sau một lần sync nếu anh muốn giá mới nhất. Chỉ lấy mã đang được phép lên web. Mã nhóm `Không đưa lên web` không vào file khách.

File xuất và cache ảnh là đồ để anh gửi khách, không commit vào repo public này. Cache để tạm cạnh thư mục làm việc của lượt xuất, không để trong cây web.

## Excel

Bố cục in của phiếu đặt hàng, chỉ cột A đến H:

1. Cột: STT, Mã SP, Tên Sản Phẩm, Hình Ảnh, ĐVT, Số Lượng (để trống cho khách điền), Đơn Giá, Thành Tiền. Công thức thành tiền: `=IF(OR(F{r}="",G{r}=""),"",F{r}*G{r})`.
2. Không đưa cột nội bộ (tồn kho, giá vốn, lợi nhuận) vào file khách. Nếu workbook nguồn có các cột đó thì ẩn hoặc không copy.
3. Phần đầu giống phiếu: khối công ty lấy từ `data/products.json` → `company` (tên, địa chỉ, hotline, email, web, số tài khoản). Không hardcode số tài khoản hay email vào script nếu JSON đã có. Tiêu đề `DANH MỤC SẢN PHẨM`, dòng ngày, kính gửi, chỗ trống địa chỉ và số điện thoại người nhận, câu dẫn gửi danh mục.
4. Chèn một dòng banner theo `nhom` giữa các cụm sản phẩm.
5. Tên file gợi ý khi gửi anh: `VanPhat_Danh_Muc_San_Pham_KhachHang.xlsx`.
6. In A4, fitToWidth 1, tắt gridlines, đóng băng bên dưới hàng tiêu đề bảng.
7. Logo header lấy từ `assets/logo-nav.png` hoặc `assets/logo-excel-slip.png` nếu cần đúng phiếu in.

Ảnh phải gần đầy ô, không thu một góc:

1. Nhúng bằng openpyxl `Image` và `OneCellAnchor` vào cột D từng dòng. Không phụ thuộc hàm `IMAGE()` của Excel 365.
2. Cột D rộng khoảng 20 ký tự (khoảng 145 px). Hàng sản phẩm cao khoảng 88 pt (khoảng 117 px).
3. Ảnh hiển thị khoảng 137×109 px, chừa khoảng 4 px, cover-crop từ cache để gần đầy ô.
4. Thumbnail 58–90 px là sai. Phải phóng cho khớp ô, hoặc chỉnh lại nếu đổi chiều rộng và chiều cao ô.

## PDF

Lọc `anh` là URL http và tải được. Lưới thẻ A4, nhóm theo `nhom`. Tên file gợi ý: `VanPhat_Danh_Muc_San_Pham_Co_Hinh.pdf`.

Không xuất mã không ảnh. Không để ảnh nhỏ lệch. Không commit bí mật. Gửi anh file để duyệt, không tự gửi cho khách.
