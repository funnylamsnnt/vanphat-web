# Sơ đồ phối hợp

Quy tắc áp mỗi lượt nằm ở `.cursor/rules/phoi-hop-bot.mdc`. Tài liệu đầy đủ nằm trên máy chung của các bot, Cursor không truy cập được: `/workspace/sodo/so-do-va-mo-hinh-hoat-dong-van-phat.docx`.

## Luồng danh mục

Google Sheet trên Drive là nguồn chuẩn duy nhất về mã, tên và giá: fileId `1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM`, tên `PHIEU BAO GIA VAN PHAT - 2026`, sheet `Danh Mục Vật Tư`. Anh Hà đổi từ file xlsx `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR` ngày 19/10/2026.

QL Kiot đồng bộ Excel với KiotViet theo cả hai chiều. Từ Excel, dữ liệu đi tiếp hai nhánh:

- Excel → Google Sheet «PHIEU BAO GIA» → form Đơn Đặt Hàng (bridge LIVE).
- Excel → web (`data/products.json`), bỏ nhóm «Không đưa lên web», chia ba lĩnh vực. Từ 17/10/2026 nhánh này do QL Kiot đảm nhiệm.

Cursor không sửa tay giá hay tên sản phẩm, không ghi vào Excel gốc, sổ công nợ v7, hay KiotViet.

## Nguyên tắc nguồn

Mỗi loại dữ liệu có một nguồn chuẩn. Mỗi nguồn chỉ một bot được ghi. Bot khác thấy sai thì nhắn bot chủ, không tự sửa. Ktra Seo Catolog thấy web lệch Excel thì báo QL Kiot, kèm mã VP, giá web và giá Excel.

## Cursor và pull request

Cursor nhận việc code qua cloud agent. Bot giao việc mô tả việc, Cursor mở một PR. Bot vận hành chỉ chạy script, không tự sửa code.

PR không conflict và CI xanh thì bot giao việc tự squash-merge. Anh Hà cho phép thường trực từ 14/10/2026. CI đỏ thì Cursor sửa trước. Không merge PR đỏ.

## Việc luôn cần anh Hà duyệt

Xác nhận đã thu tiền. Hủy hoặc sửa bill. Xuất hóa đơn. Gửi email hoặc Zalo ra ngoài. Xóa dữ liệu. Đổi cơ chế mã sản phẩm.
