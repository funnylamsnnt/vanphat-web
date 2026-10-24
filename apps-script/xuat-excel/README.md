# Apps Script xuất Excel và khung hàng đợi KV

Project độc lập, không gắn vào web `vanphatcompany.vn` và không phải web app. Có hai phần trong cùng một project Apps Script:

- **A.** Tự xuất Google Sheet giá chính ra Excel bằng trigger thời gian, ghi revision mới vào đúng file đang có.
- **B.** Khung tab `KV_Queue` trên sổ v7. **Đang chờ API KiotViet** (chưa có Client ID). Chưa gọi mạng, chưa có trigger kéo bill.

Repo không chứa token, Client ID, mật khẩu hay URL web app.

## File

| File | Việc |
|---|---|
| `Logic.gs` | Guard, lịch, đọc catalog từ XML xlsx, fingerprint, upsert thuần |
| `XuatExcel.gs` | Trigger, dry-run, `Drive.Files.update` |
| `KVQueue.gs` | Tạo tab, upsert trên sổ, stub KiotViet |
| `appsscript.json` | Múi giờ, quyền, Drive API v3 |
| `test/chay_thu.js` | Test Node, không cần Google |

Chạy test trên máy:

```bash
node --test apps-script/xuat-excel/test/chay_thu.js
```

## Phần A — file và guard

| Việc | Giá trị |
|---|---|
| Nguồn | Google Sheet `1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM` (13 tab) |
| Đích | `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`, tên `PHIEU BAO GIA VAN PHAT - 2026.xlsx` |
| Cách ghi | `Drive.Files.update` (Advanced Drive v3). Giữ id và tên. Không `Files.create`, không `Files.copy` |
| Xuất | `UrlFetchApp` gọi Drive `files.export` mime xlsx, token OAuth của chính script |

Guard chạy trước khi ghi. Trượt một điều thì **không ghi**, và lý do nằm ở nhật ký thực thi cùng Script Property `LAST_GUARD_JSON`:

1. `modifiedTime` của Sheet trùng lần xuất trước (`LAST_SHEET_MODIFIED_TIME`) thì dừng, không tải file.
2. Đủ đúng 13 sheet, đúng thứ tự trong `SHEET_NAMES`.
3. Mã `VP001` .. `VPn` liên tục, không mất mã so với Excel hiện tại.
4. Giá số `> 0` trên Excel không bị giá `0`, trống, hoặc chữ đè lên.
5. Cột S tiêu đề `Thương Hiệu`, cột T tiêu đề `Quy Cách`.
6. File xuất và Excel hiện tại phải là xlsx (ký tự `PK`) và từ 1.000.000 byte.

Lệch số dòng không chặn ghi. Đổi giá mà giá mới vẫn là số `> 0` thì được ghi.

## Lịch

Giờ Việt Nam (Asia/Saigon, UTC+7). Project để timezone `Asia/Ho_Chi_Minh`.

- 15 trigger ngày, giờ 7 đến 21, `nearMinute(33)`.
- Google có thể chạy lệch quanh phút 33. Script chỉ làm việc khi phút nằm trong **:26–:45**.
- Dù trigger có lệch, script vẫn bỏ các khung **8:05–8:25** và **14:05–14:25** (tính cả hai đầu). Hai khung đó routine đồng bộ đang tự xuất. Lúc bỏ qua, script không gọi Drive.
- Ngoài 7h–21h thì bỏ qua.
- `xuatBaoGiaTheoGio` là hàm trigger. `chayDryRun` và `chayXuatBaoGia` chạy tay, không xét lịch.

`caiTriggerXuatBaoGia` gỡ rồi gắn lại đúng 15 trigger này. `goTriggerXuatBaoGia` chỉ xóa handler `xuatBaoGiaTheoGio`.

## Dry-run

Script Property `DRY_RUN` = `true` thì trigger và `chayXuatBaoGia` vẫn chạy guard nhưng không gọi `Drive.Files.update`.

`chayDryRun` luôn là dry-run, kể cả khi property không bật.

`chayXuatBatKeModified` bỏ qua mốc `modifiedTime` đã lưu. Guard vẫn chặn nếu trượt. Property `DRY_RUN=true` vẫn không cho ghi.

## Script Properties

Không bắt buộc secret.

| Khóa | Ai ghi | Ý nghĩa |
|---|---|---|
| `DRY_RUN` | Anh, lúc thử | `true` thì không ghi Excel. Xóa hoặc đặt `false` khi chạy thật |
| `LAST_SHEET_MODIFIED_TIME` | Script | Mốc Sheet lần ghi thành công gần nhất |
| `LAST_EXCEL_VERSION` | Script | `version` Drive sau khi ghi |
| `LAST_EXCEL_MD5` | Script | `md5Checksum` sau khi ghi |
| `LAST_RUN_JSON` | Script | Kết quả lần chạy gần nhất, kể cả bỏ qua lịch |
| `LAST_GUARD_JSON` | Script | Lần guard trượt gần nhất. Xóa trắng khi ghi thành công |

Chưa có khóa KiotViet. Khi có Client ID, anh nhập qua Script Properties (hoặc Secure Form). Không dán vào repo.

## Quyền OAuth

Lần đầu chạy một hàm trong editor, Google hỏi quyền. Cần đủ vì script sửa file có sẵn, không phải file do script tạo:

- `https://www.googleapis.com/auth/drive` — đọc Sheet, đọc Excel, `files.update` đúng id. `drive.file` không đủ.
- `https://www.googleapis.com/auth/spreadsheets` — mở sổ v7 khi gọi phần B.
- `https://www.googleapis.com/auth/script.scriptapp` — tạo và gỡ trigger.
- `https://www.googleapis.com/auth/script.external_request` — `UrlFetchApp` xuất xlsx.

Tài khoản cấp quyền phải sửa được cả Google Sheet giá chính và file Excel đích.

Advanced service: **Drive API**, phiên bản **v3**, mã định danh `Drive`.

## Các bước triển khai

1. Vào https://script.google.com → **Dự án mới**, đăng nhập tài khoản sở hữu hai file giá. Đặt tên `VanPhat Xuat Excel`.
2. **Cài đặt dự án** → tick **Hiện tệp kê khai "appsscript.json"**. Xóa `Code.gs` mẫu.
3. Tạo ba file `Logic.gs`, `XuatExcel.gs`, `KVQueue.gs`. Dán đúng nội dung trong thư mục này. Dán đè `appsscript.json`.
4. **Dịch vụ (+)** → **Drive API** → phiên bản **v3** → mã định danh `Drive` → Thêm.
5. **Cài đặt dự án → Thuộc tính tập lệnh**: thêm `DRY_RUN` = `true`. Không thêm token.
6. Chọn hàm `chayDryRun` → **Chạy** → xem lại quyền → cho phép. Nhật ký phải là `DRY_RUN` hoặc `KHONG_GHI` kèm lý do. Không có revision Excel mới.
7. Khi dry-run đạt và anh muốn ghi thật: đặt `DRY_RUN` = `false` (hoặc xóa khóa), chạy `chayXuatBaoGia` một lần, kiểm tra file Excel vẫn đúng id và tên, version tăng.
8. Chạy `caiTriggerXuatBaoGia`. Vào **Trigger**: 15 dòng `xuatBaoGiaTheoGio`, giờ 7–21, quanh phút 33.
9. Gỡ lịch: chạy `goTriggerXuatBaoGia`.

Sửa code sau này: dán bản mới rồi lưu. Trigger giữ nguyên, không cần triển khai web app. Project này **không** triển khai dạng ứng dụng web.

Giới hạn Apps Script: một lần chạy khoảng 6 phút, file xuất phải dưới hạn UrlFetch (script từ chối blob không phải xlsx hoặc nhỏ hơn 1 MB). File giá hiện khoảng vài MB đến dưới 10 MB.

## Phần B — KV_Queue, đang chờ API

Sổ: `1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs`. Tab mới `KV_Queue`, không ghi đè `Bill_KiotViet`.

Cột A đến N:

`ma_hd | thoi_gian | ma_kh | ten_kh | trang_thai | tong_tien | khach_da_tra | no | phuong_thuc_tt | so_dong | json_chi_tiet | fingerprint | lay_luc | bot_da_xu_ly`

- `tong_tien` lấy `customer_must_pay`, `khach_da_tra` lấy `customer_paid`, `no` lấy `debt`.
- `so_dong` là số phần tử `lines`.
- `json_chi_tiet` giữ cả bill đã chuẩn hóa (kênh, người tạo, dòng hàng, chiết khấu, ghi chú thu).
- `fingerprint` là SHA-256 của `tổng|đã trả|trạng thái|số dòng` sau khi chuẩn hóa số. `1000` và `"1000.00"` ra cùng hash.
- `lay_luc` là lúc ghi, dạng `yyyy-MM-dd HH:mm:ss`, giờ Việt Nam.
- `bot_da_xu_ly`: dòng mới để trống. Fingerprint đổi thì sửa tại chỗ và xóa cờ này. Fingerprint không đổi thì không đụng dòng, kể cả cờ `TRUE`.

`taoTabKVQueue` tạo tab và tiêu đề. Gọi lại không xóa dữ liệu.

`upsertBillKV(bills)` nhận mảng bill đã chuẩn hóa. Khóa là `code`. Mã mới thêm một dòng cuối. Cùng mã mà fingerprint đổi thì sửa dòng đầu tiên của mã đó, không thêm dòng. Cùng mã trong một lượt thì vẫn một dòng.

`fetchKiotViet` và `dongBoTuKiotViet` luôn ném `đang chờ API KiotViet`. Không có trigger cho phần này.

Bill đưa vào upsert cần các field: `code`, `time`, `customer`, `kh_code_v7`, `creator`, `seller`, `channel`, `price_list`, `branch`, `status`, `lines` (`ma`, `ten`, `sl`, `don_gia`, `giam`, `thanh_tien`), `total_goods`, `discount`, `customer_must_pay`, `customer_paid`, `debt`, `payment_method`, `payment_note`.

Đổi nội dung dòng hàng mà tổng, đã trả, trạng thái và số dòng không đổi thì fingerprint không đổi, nên hàng đợi không cập nhật `json_chi_tiet`. Đó là luật trong spec. Đề xuất đổi luật nằm ở mô tả PR, chưa làm.
