# AGENTS.md — Vạn Phát (vanphatcompany.vn)

Đọc file này trước khi sửa repo. Các rule trong `.cursor/rules/` được áp dụng mọi lượt (`alwaysApply: true`). Skill trong `.cursor/skills/` chỉ mở khi đúng việc. Quy tắc dưới đây là quy tắc đứng của anh Hà: làm đúng dù không được nhắc lại.

## Dự án

Site tĩnh HTML/CSS/JS của Công ty TNHH Tư vấn Đầu tư Thương mại Vạn Phát, phát hành bằng GitHub Pages từ nhánh `main` của `funnylamsnnt/vanphat-web`, tên miền `vanphatcompany.vn` (file `CNAME`).

Khách chọn lĩnh vực, rồi nhóm, rồi sản phẩm. Ô tìm ở header tìm xuyên mọi lĩnh vực. Đặt hàng trên web bằng giỏ hàng, hotline và Zalo.

Trang chính:

- `index.html` — trang chủ
- `san-pham.html` — catalog và tìm kiếm (JS đọc `data/products.json`)
- `linh-vuc/*.html` — lĩnh vực (L1)
- `san-pham/nhom-*.html` — nhóm (L2)
- `san-pham/<mã>-<tên>.html` — trang SKU (L3)
- `dia-phuong/*.html` — trang địa phương
- `js/products.js`, `js/product-lightbox.js`, `js/cart.js`, `js/ia.js`
- `data/ia.json` — cây lĩnh vực
- `data/products.json` — catalog đang phát hành
- `scripts/sync_products_from_excel.py`, `scripts/generate_catalog_pages.py`, `scripts/source_title_guard.py`

Trang nhân viên (`nhan-vien.html`, `js/staff-order.js`) là sổ đơn nội bộ, `noindex`, không nằm trong sitemap. Không dùng lightbox giỏ hàng của khách cho sổ này trừ khi anh giao riêng.

## Nguồn dữ liệu duy nhất

Giá và danh mục sản phẩm chỉ lấy từ Google Drive:

- fileId `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`
- tên chuẩn `PHIEU BAO GIA VAN PHAT - 2026.xlsx`
- sheet `Danh Mục Vật Tư`
- link https://docs.google.com/spreadsheets/d/1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR/edit

Anh Hà khóa nguồn này ngày 27/09/2026. Mọi file catalog Drive khác, kể cả file tên `VanPhat_Web_Catalog_SOURCE.xlsx`, không được dùng làm nguồn. Không ghi fileId nguồn cũ vào repo.

State của lần sync gần nhất: `scripts/sync_state.json`.

## Phân vai

Trợ lý bên ngoài đọc Drive và lo vận hành: lịch đối chiếu nguồn (8:09 và 14:09, giờ Asia/Bangkok), tải Excel, refresh cầu nối LIVE Đơn Đặt Hàng. Cầu nối là Google Sheet native vì IMPORTRANGE không đọc được file master `.xlsx`. Script refresh và bản Excel mirror nằm trên máy trợ lý, không có trong repo này. Không commit fileId cầu nối, fileId sheet đơn, hay file Excel nguồn.

Cursor lo code, SEO kỹ thuật và script trong repo này. Mọi thay đổi đi bằng nhánh và pull request để anh Hà duyệt. Không push thẳng lên `main`, không tự merge. Trợ lý ngoài cũng chỉ được mở PR, không push `main`.

Khi anh giao cho Cursor chạy sync, dùng script trong repo này (`scripts/sync_products_from_excel.py`, có đọc `data/ia.json`). Bản script cũ nằm ngoài repo, nếu không đọc `ia.json`, thì bỏ. Vẫn không đưa fileId cầu nối vào commit. Refresh cầu nối vẫn là việc của trợ lý ngoài, trừ khi anh giao rõ từng lần.

## Đường ống catalog

Một chiều, một người được ghi `main`: anh, khi bấm merge. Trên GitHub, nhánh `main` nên bật bắt buộc pull request. Việc đó là cài đặt của repo, không nằm trong file.

1. 8:09 hoặc 14:09, trợ lý ngoài đọc Drive. Tên file sai thì dừng. File không đổi thì không nhắn.
2. Có đổi thì chạy `scripts/sync_products_from_excel.py` trong repo này và mở PR. Không push `main`. Script tự xếp nhóm có tên mới vào lĩnh vực khớp nhất, ghi vào `data/ia.json`, và phát hành. Ô Nhóm trống và nhãn `Khác` ở ngoài web.
3. PR điền mẫu `.github/PULL_REQUEST_TEMPLATE.md` từ JSON của script: mã thêm, mã gỡ, giá đổi, slug đổi, giá trống hoặc bằng 0, nhóm mới đã xếp, nhóm giữ ngoài web.
4. `check-rules` và `check-seo` phải xanh.
5. Anh merge. GitHub Pages phát hành.
6. Trợ lý ngoài refresh cầu nối, đối soát số dòng bằng số SKU nguồn, rồi gửi một tin.

## Codeword

Anh hoặc trợ lý ngoài nói một cụm là đúng việc, không cần nhắc lại quy trình.

| Anh nói | Việc chạy |
|---|---|
| `sync giá` | Đối chiếu Drive, mở PR catalog nếu có đổi |
| `xếp nhóm` | Nhóm mới vào lĩnh vực khớp nhất, ghi trong PR |
| `rà seo` | Rà robots, sitemap, canonical, title, Open Graph, schema, link, alt |
| `xuất danh mục` | PDF hoặc Excel cho khách, chỉ mã có ảnh, không commit file |
| `soạn thư` | Nháp. Gửi chỉ khi anh nói rõ người nhận |
| `soạn văn bản` | Nháp hành chính, tách khỏi web |
| `sắp drive` | Đúng miền, hành chính riêng, bán hàng riêng |
| `đối soát sổ` | Tồn, hóa đơn, lãi trên workbook, không đưa giá vốn lên web |

## Quy tắc cứng

Chi tiết nằm ở rule luôn áp dụng. Tóm tắt:

1. Nhóm `Không đưa lên web` (khớp không phân biệt hoa thường, dấu, khoảng trắng; cấu hình `excludeGroups` trong `data/ia.json`) không bao giờ lên web: `products.json`, trang SKU, trang nhóm, trang lĩnh vực, tìm kiếm, sitemap. Mã đang có trên web mà bị gán nhóm này thì gỡ trong chính lượt đó và liệt kê mã trong PR. Cầu nối LIVE Đơn Đặt Hàng vẫn giữ đủ mọi mã; việc đó do trợ lý ngoài làm, không ghi fileId vào repo.
2. Ba lĩnh vực (Văn phòng phẩm, Nước uống & Bánh, Điện gia dụng) do `data/ia.json` điều khiển, duyệt L1 rồi L2 rồi L3, tìm kiếm toàn cục. Nhóm mới chưa có trong `ia.json` thì tự xếp vào lĩnh vực khớp nhất, phát hành, và báo trong PR (anh Hà chốt 10/10/2026; thay quy tắc cũ phải hỏi trước).
3. Mọi ảnh sản phẩm phía khách mở lightbox: ảnh lớn, số lượng, Thêm vào giỏ, đóng bằng nút X, phím Esc, hoặc click lớp phủ.
4. Không ghi đè `CNAME`. Không commit bí mật, email cá nhân, tài khoản, fileId cầu nối hay đơn nội bộ, link hệ thống QLVB. Không thêm lại nút hoặc form «Đặt hàng online» / Apps Script đã gỡ. Giữ giỏ hàng, Zalo, hotline.
5. Sửa trên nhánh, mở PR, chờ anh duyệt. Không push thẳng `main`.

## Giao tiếp với anh Hà

Rule `.cursor/rules/giao-tiep.mdc`. Trả lời tiếng Việt, xưng em, gọi anh. Vào kết quả trước. Vạn Phát (web, catalog, bán hàng, kho) tách khỏi văn bản hành chính nhà nước.

Mọi câu trả lời chat, mô tả PR và báo cáo cuối gửi anh kết thúc bằng một dòng `---`, một câu in nghiêng giọng Gen-Z kèm đúng một emoji, rồi dòng giờ Asia/Bangkok kèm ngày âm lịch tính bằng Python `lunardate`. Không gắn khối này vào chữ trên website, email gửi đi, hay văn bản hành chính.

## Skill

| Thư mục | Khi nào |
|---|---|
| `.cursor/skills/sync-catalog/` | Đồng bộ catalog hoặc sửa script sync |
| `.cursor/skills/web-ia-linh-vuc/` | Thêm hoặc đổi lĩnh vực, nhóm, menu, tìm kiếm |
| `.cursor/skills/product-lightbox/` | Sửa thẻ sản phẩm, ảnh, giỏ hàng |
| `.cursor/skills/pdf-excel-catalog/` | Xuất danh mục PDF hoặc Excel cho khách |
| `.cursor/skills/seo-audit/` | Rà và sửa SEO kỹ thuật |
| `.cursor/skills/loc-soan-email/` | Đọc hộp thư, tóm tắt, soạn nháp |
| `.cursor/skills/soan-vb-hanh-chinh/` | Tờ trình, công văn, báo cáo, thông báo |
| `.cursor/skills/drive-theo-nghiep-vu/` | Tìm hoặc sắp file Drive theo từng miền việc |
| `.cursor/skills/ban-hang-kho-loi-nhuan/` | Sổ bán hàng, tồn, hóa đơn, lãi trong workbook |

## Kiểm tra trước khi xong PR đụng web

```bash
python3 scripts/check_rules.py
python3 scripts/check_seo.py
```

`check-rules` chạy trên mọi pull request. `check-seo` chạy trên mọi pull request và thêm một lượt khi có push lên `main` (sau khi anh merge catalog). Workflow nào cũng không deploy Pages. Lượt trên `main` đỏ thì mở PR sửa, không sửa thẳng `main`.

Semrush và Search Console làm sau khi site đã lên, theo `docs/SEO-SEMRUSH.md`. Không gắn tài khoản vào repo.
