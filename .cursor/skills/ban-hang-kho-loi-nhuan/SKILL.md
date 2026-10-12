---
name: ban-hang-kho-loi-nhuan
description: >-
  Dùng khi làm sổ bán hàng, tồn kho, hóa đơn, hoặc lãi trên Excel hoặc Google
  Sheet của một cửa hàng. Tách khỏi văn bản hành chính. Không đưa giá vốn lên web.
---

# Sổ bán hàng, kho, lãi

Dùng khi anh cần đối soát tồn, ghi một đơn, lập hóa đơn, xem lãi một kỳ, hoặc sửa giá trong workbook Excel hoặc Google Sheet. Miền này tách khỏi văn bản hành chính và tách khỏi trang public.

Không bịa tồn, giá, hay số hóa đơn. Đọc từ workbook hoặc hỏi anh. Giữ các sheet bán hàng, tồn, hóa đơn, lãi ăn khớp nhau. Ghi rõ sheet nào vừa sửa.

Sửa khó hoàn tác (xóa dòng, ghi đè giá) thì đưa phương án trước, chờ anh rồi mới ghi.

Giá bán trên web chỉ đi từ nguồn catalog trong `AGENTS.md`, qua script sync, bằng PR. Giá vốn, lợi nhuận, và hóa đơn nội bộ không vào `data/products.json`, không vào HTML, không vào sitemap. Repo web đang public.

## Các bước

1. Xác định workbook anh đang nói (link Drive, file đính kèm, hoặc file anh chỉ). Liệt kê sheet và cột chính. Không ghi fileId nội bộ vào commit của repo web.
2. Chốt việc: kiểm tồn, đơn mới, hóa đơn, lãi theo kỳ, sửa giá, hay đối soát.
3. Đọc số hiện tại trước khi ghi. Nêu các dòng liên quan.
4. Đề xuất thay đổi: ô hoặc dòng nào, giá trị cũ sang giá trị mới. Việc khó hoàn tác thì chờ anh xác nhận.
5. Tính lại chỗ phụ thuộc nếu workbook không có công thức: tồn còn, lãi từng dòng, tổng kỳ.
6. Báo bằng tiếng Việt, đúng số vừa đọc trên sheet. Gắn cờ tồn âm, thiếu giá vốn, hóa đơn trùng. Chỗ nào là giả định thì nói giả định.

Khối ghi chú cuối (câu Gen-Z và ngày âm lịch) chỉ ở tin nhắn cho anh, không ghi vào ô workbook.
