# Website Vạn Phát

Site tĩnh (HTML/CSS/JS) cho **Công ty TNHH Tư vấn Đầu tư Thương mại Vạn Phát**.

## Cấu trúc

```
vanphat-website/
├── index.html          # Trang chủ
├── san-pham.html       # Catalog sản phẩm (lọc / tìm kiếm)
├── photocopy.html      # Dịch vụ photocopy & in màu
├── lien-he.html        # Liên hệ
├── nhan-vien.html      # Nội bộ — nhân viên lập đơn (không có trên nav khách)
├── css/styles.css
├── js/main.js          # Nav, format giá, fallback ảnh
├── js/products.js      # Load JSON, filter/search, featured
├── js/cart.js          # Giỏ hàng khách
├── js/staff-order.js   # Đơn NV (localStorage riêng, formsubmit + GAS tuỳ chọn)
├── gas/StaffOrderInbox.gs  # Apps Script ghi Sheet đơn NV
├── data/products.json  # ~381 sản phẩm (chỉ giá bán trên web)
└── README.md
```

## Preview local

**Cách 1 — Python (khuyến nghị, vì `fetch` JSON cần HTTP):**

```bash
cd /workspace/vanphat-website
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
- **Địa chỉ:** LK 19-06 Đường số 20 KĐT Mỹ Gia, Vĩnh Thái, Phường Nam Nha Trang
- **Hotline:** 033 5652 832
- **Đặt hàng online:** [Google Apps Script form](https://script.google.com/macros/s/AKfycbzdcOxIbVAivc2fSCSk1v8go0Wxg_vULF7MDnsmpOcROoWDZ5luBF6uD7Wh-omRkjJB/exec)

## Thiết kế

- Màu: navy `#1F4E78`, kem, nhấn vàng `#C9A227`
- Font: Be Vietnam Pro (Google Fonts)
- Mobile-first, vanilla JS — không framework
