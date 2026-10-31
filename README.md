# Website Vạn Phát

Site tĩnh (HTML/CSS/JS) cho **Công ty TNHH Tư vấn Đầu tư Thương mại Vạn Phát**.

## Cấu trúc

```
vanphat-website/
├── index.html          # Trang chủ
├── san-pham.html       # Catalog mọi lĩnh vực (lọc / tìm kiếm, JS)
├── linh-vuc/           # Trang lĩnh vực L1 (sinh bởi script)
├── san-pham/           # Trang nhóm + trang SKU tĩnh (sinh bởi script)
├── photocopy.html      # Dịch vụ photocopy & in màu
├── lien-he.html        # Liên hệ
├── khu-vuc.html        # Khu vực phục vụ Nam Nha Trang / Mỹ Gia
├── nhan-vien.html      # Nội bộ — nhân viên lập đơn (không có trên nav khách)
├── robots.txt
├── sitemap.xml
├── css/styles.css
├── js/main.js          # Nav, format giá, fallback ảnh
├── js/products.js      # Load JSON, filter/search, featured
├── js/catalog-paths.js # Map mã → URL tĩnh (sinh bởi script)
├── js/cart.js          # Giỏ hàng khách
├── js/staff-order.js   # Đơn NV (localStorage riêng, formsubmit + GAS tuỳ chọn)
├── gas/StaffOrderInbox.gs  # Apps Script ghi Sheet đơn NV
├── scripts/generate_catalog_pages.py
├── data/ia.json        # Cấu hình lĩnh vực → nhóm (không hardcode số lượng)
├── data/products.json  # Catalog (giá bán) + linh_vuc[] nhúng khi sync Excel
├── docs/SEO-SEMRUSH.md
└── README.md
```

## SEO — trang sản phẩm tĩnh

Catalog trên `san-pham.html` vẫn lọc bằng JavaScript. Google đọc thêm trang HTML tĩnh:

- Lĩnh vực: `linh-vuc/<slug>.html` (ví dụ `linh-vuc/vpp.html`, `linh-vuc/nuoc-banh.html`)
- Nhóm (canonical): `san-pham/nhom-<slug>.html` (ví dụ `san-pham/nhom-giay.html`, `san-pham/nhom-nuoc-uong.html`)
- Sản phẩm: `san-pham/<mã>-<tên>.html` (ví dụ `san-pham/vp063-bi-ho-so-a4-trang.html`)

Slug lấy từ mã (`VP063` → `vp063`) và tên đã bỏ dấu. Thẻ trên trang chủ và catalog trỏ tới các URL này; lightbox và thêm vào giỏ giữ nguyên.

### Chốt an toàn tên file nguồn (từ 10/10/2026)

Trước mỗi lượt sync, đọc metadata Drive của file nguồn `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR` (connector Drive `get_file_metadata` → `title`) và truyền vào:

```bash
python3 scripts/sync_products_from_excel.py /workspace/vanphat-sync/PHIEU_BAO_GIA_VAN_PHAT_2026.xlsx \
  --drive-title "PHIEU BAO GIA VAN PHAT - 2026.xlsx"
```

Nếu tên kết thúc bằng `.tmp` (lỗi lưu Excel/Drive for desktop, như `FB1DA4E5.tmp` ngày 10/10/2026) hoặc khác `PHIEU BAO GIA VAN PHAT - 2026.xlsx` (đã chuẩn hóa hoa/thường, dấu, khoảng trắng, đuôi), script thoát mã **3** trước khi ghi gì: không deploy web, không refresh cầu nối LIVE, báo anh Hà. Logic nằm ở `scripts/source_title_guard.py`.

### Action đồng bộ catalog 14:35

Workflow [`.github/workflows/sync-catalog.yml`](.github/workflows/sync-catalog.yml) chạy lúc **14:35 giờ Việt Nam**, cron UTC `35 7 * * *`. Có thể bấm chạy tay bằng `workflow_dispatch`.

Việc làm, theo thứ tự:

1. Đọc metadata Drive của file `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR` bằng service account.
2. Tên file sai hoặc kết thúc bằng `.tmp` thì dừng (thoát 3). Không ghi web, không đụng cầu nối.
3. `modifiedTime` trùng `scripts/sync_state.json` và cầu nối của mốc đó đã `ok` thì dừng. Không commit.
4. `modifiedTime` đổi thì tải Excel (chỉ GET, không convert file gốc), chạy `scripts/sync_products_from_excel.py`, rồi `check_rules.py` và `check_seo.py`.
5. Commit các file catalog được phép, push `main` bằng `GH_PUSH_TOKEN`, đợi workflow `pages-build-deployment` xanh.
6. Sau Pages, thay tab `Danh Mục Vật Tư` trên spreadsheet cầu nối LIVE: ghi đủ dòng nguồn, kể cả nhóm «Không đưa lên web», xóa tab cũ, đổi tên tab mới. Tab `Chính Sách Đối Tác` giữ nguyên. Số mã trên cầu nối phải bằng số mã nguồn, lệch 0.
7. Nếu cầu nối lỗi sau khi catalog đã lên `main`, lần sau chỉ làm lại cầu nối (trạng thái `pending`), không sync lại từ đầu.

File Excel tải về nằm ở thư mục tạm của runner, không commit. Id cầu nối không ghi vào repo.

#### Tạo secret

Repo → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**. Ba secret:

| Secret | Nội dung |
|---|---|
| `GDRIVE_SA_JSON` | Nguyên file JSON của service account |
| `LIVE_BRIDGE_SHEET_ID` | Id spreadsheet cầu nối LIVE, đoạn giữa URL `/spreadsheets/d/<id>/edit` |
| `GH_PUSH_TOKEN` | PAT được push nhánh `main` |

Service account:

1. Vào Google Cloud Console, chọn hoặc tạo một project.
2. Bật **Google Drive API** và **Google Sheets API**.
3. **IAM & Admin** → **Service accounts** → **Create service account**. Không cần role trên project.
4. Mở account đó → **Keys** → **Add key** → **JSON**. Tải file về.
5. Share file Excel `PHIEU BAO GIA VAN PHAT - 2026.xlsx` (fileId `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`) cho `client_email` trong JSON, quyền **Viewer**.
6. Share spreadsheet cầu nối LIVE cho cùng email, quyền **Editor**. Không dán id này vào git, README, hay log commit.

`GH_PUSH_TOKEN`: fine-grained PAT của tài khoản được ghi `main`, quyền **Contents: Read and write** và **Actions: Read**. Classic PAT thì scope `repo`. Push bằng `GITHUB_TOKEN` mặc định không kích hoạt build GitHub Pages (nguồn đang là nhánh `main`). Nếu `main` chặn push thẳng, cho PAT này được bypass rule của lịch sync.

Dán JSON vào `GDRIVE_SA_JSON` cả khối, kể cả nhiều dòng. Không commit file key.

Khi lượt 14:35 đã xanh, dừng lịch 14:35 của bot ngoài để khỏi làm mới cầu nối hai lần. Lịch 8:09 vẫn là bot ngoài, mở PR nếu có đổi. Workflow này không sửa Apps Script.

Sau khi Excel cập nhật `data/products.json`, `scripts/sync_products_from_excel.py` tự gọi generator. Nếu chỉ sửa JSON:

```bash
python3 scripts/generate_catalog_pages.py
```

Script ghi `san-pham/*.html`, `sitemap.xml`, `robots.txt`, `js/catalog-paths.js`, và xóa trang SKU cũ do chính nó sinh ra. Commit các file đó rồi merge `main` để GitHub Pages phát hành. Sitemap: https://vanphatcompany.vn/sitemap.xml. Các bước Semrush và Search Console: [docs/SEO-SEMRUSH.md](docs/SEO-SEMRUSH.md).

## Bán chạy 4 tuần

Khối «Bán chạy 4 tuần qua» trên trang chủ và nhãn **Hot** trên thẻ sản phẩm lấy từ **hóa đơn GTGT**, không lấy từ bill KiotViet.

### File dòng hóa đơn

Đặt file thật trong `data/hoa-don-gtgt/`. Script đọc mọi `.csv` và `.json` trong thư mục đó, bỏ `mau/` và mọi file có chữ `DỮ LIỆU MẪU` hoặc `"mau": true`.

CSV, dòng đầu là tiêu đề, ngày theo `YYYY-MM-DD`:

```text
so_hd,ngay,ma_vp,so_luong,don_gia,thanh_tien
16,2026-10-13,VP049,5,14000,70000
```

JSON cùng các khóa, dạng mảng hoặc `{"dong":[...]}`. `thanh_tien` là thành tiền đã gồm VAT. Không ghi tên khách, nhân viên, số điện thoại.

Ví dụ không dùng để xếp hạng: `data/hoa-don-gtgt/mau/hoa-don-gtgt-mau.csv` và `hoa-don-gtgt-mau.json`.

Một số hóa đơn chỉ tính một lần: nếu cùng `so_hd` nằm ở hai file, file đứng trước theo tên được giữ.

### Cách chấm điểm

Cửa sổ là **28 ngày tính cả ngày chốt** (từ ngày chốt lùi 27 ngày đến ngày chốt). Lần đầu chốt `2026-10-31`, tức `2026-10-04` đến `2026-10-31`.

1. Bỏ dòng có `don_gia`, `thanh_tien` hoặc `so_luong` không dương.
2. Cộng số lượng và cộng `thanh_tien` theo `ma_vp`. Doanh thu lấy thành tiền trên hóa đơn, không nhân lại đơn giá.
3. Bỏ mã không có trang trên web, mã giá web bằng 0 hoặc trống, mã thuộc nhóm «Không đưa lên web».
4. Vì cái, xấp, ram, hộp không cùng đơn vị, không xếp theo số lượng thô. Mỗi mã nhận hạng phần trăm số lượng và hạng phần trăm doanh thu (0 = thấp nhất, 1 = cao nhất; hòa thì lấy hạng trung bình).
5. Điểm = `50 × hạng phần trăm số lượng + 50 × hạng phần trăm doanh thu`. Hòa điểm thì ưu tiên doanh thu, rồi số lượng, rồi mã. Lấy tối đa 10 mã.

Khi không có file thật hoặc không còn mã đủ điều kiện, `data/ban-chay.json` có `coDuLieu: false`, trang chủ không in khối, và không gắn nhãn Hot.

```bash
python3 scripts/rank_ban_chay.py --as-of 2026-10-31
```

### Lịch thứ Hai

Workflow [`.github/workflows/ban-chay.yml`](.github/workflows/ban-chay.yml) chạy **08:00 sáng thứ Hai giờ Việt Nam**, cron UTC `0 1 * * 1`, và có `workflow_dispatch` (ô `as_of` để chốt một ngày, để trống thì lấy hôm nay). Job gọi `scripts/run_ban_chay.py`. Nếu `data/ban-chay.json` hoặc khối trên `index.html` đổi, job chạy `check_rules.py` và `check_seo.py` rồi commit đúng hai file đó lên `main` bằng `GH_PUSH_TOKEN` (cùng secret với lịch sync 14:35). Không sửa Apps Script.

## Preview local

**Cách 1 — Python (khuyến nghị, vì `fetch` JSON cần HTTP):**

```bash
cd /workspace
python3 -m http.server 8080
```

Mở trình duyệt: http://localhost:8080  
Trang nhân viên: http://localhost:8080/nhan-vien.html

**Cách 2 — mở file trực tiếp** (`file://`): HTML/CSS chạy được; catalog/featured cần server vì `fetch('data/products.json')`.

## Trang nhân viên

- URL: [`/nhan-vien.html`](https://vanphatcompany.vn/nhan-vien.html) (staff-only — không gắn vào menu khách trên các trang khác)
- Chỉ hiện **giá bán**; không có giá vốn / LN trên file công khai
- Gửi đơn: formsubmit.co → `congtytnhhvanphat999@gmail.com` (tiêu đề `[NV]…`)
- Tuỳ chọn Sheet: deploy `gas/StaffOrderInbox.gs`, dán URL vào `STAFF_INBOX_GAS_URL` trong `js/staff-order.js`
- Sheet đơn NV: [1Nq_Ts5j579y_lJud3JtYO0m2b9hvtRuqDle8DMm7Zyg](https://docs.google.com/spreadsheets/d/1Nq_Ts5j579y_lJud3JtYO0m2b9hvtRuqDle8DMm7Zyg)

## Thông tin công ty

- **Tên:** Công ty TNHH Tư vấn Đầu tư Thương mại Vạn Phát
- **Địa chỉ:** LK 19-06 Đường số 20 KĐT Mỹ Gia, Phường Nam Nha Trang
- **Hotline:** 033 5652 832
- **Đặt hàng:** thêm vào giỏ trên web, rồi chốt đơn bằng email. Hotline và Zalo vẫn dùng để báo giá.

## Thiết kế

- Màu: navy `#1F4E78`, kem, nhấn vàng `#C9A227`
- Font: Be Vietnam Pro (Google Fonts)
- Mobile-first, vanilla JS — không framework
