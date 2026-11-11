# Apps Script đồng bộ hai chiều Excel ↔ Sheet giá

Project độc lập, không gắn vào web `vanphatcompany.vn` và không phải web app. Script đối chiếu file Excel giá với Google Sheet giá mỗi 30 phút (trigger), trong khung lịch cho phép. Có sửa thì ghi Sheet trước, rồi xuất lại đúng file Excel đang có.

Không gọi KiotViet. Chiều đẩy sang KiotViet, khi có, vẫn chỉ đọc Sheet. Không đụng API Kiot.

Repo không chứa token, Client ID, mật khẩu, nội dung tab `Cấu Hình API Gemini`, hay URL web app.

## File

| File | Việc |
|---|---|
| `Config.gs` | Id file, 13 tab, khóa dòng, cột công thức, cột chỉ Excel |
| `Xlsx.gs` | Đọc xlsx, chép bù cột Q–T, giữ phần nhị phân |
| `Logic.gs` | Lịch, guard, gộp ba bên |
| `DongBo.gs` | Trigger, dry-run, khóa, sao lưu, ghi Sheet rồi Excel |
| `appsscript.json` | Múi giờ, quyền, Drive API v3 |
| `test/chay_thu.js` | Test Node, không cần Google |

Chạy test trên máy:

```bash
node --test apps-script/dong-bo-2-chieu/test/chay_thu.js
```

## File và tab

| Việc | Giá trị |
|---|---|
| Excel | `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`, tên `PHIEU BAO GIA VAN PHAT - 2026.xlsx` |
| Google Sheet giá | `1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM` |
| Bản sao lưu nền 12:40 ngày 24/10/2026 | `1FgWLfap4NZXWH-oyjRAIgLkgQNdDFVQP`, tên `PHIEU BAO GIA VAN PHAT - 2026_BACKUP_20261024_1240.xlsx` |
| Nhật ký | Sổ riêng `VanPhat SYNC Nhat Ky`, tạo lúc chạy thật. Không thêm tab vào Sheet giá |

Cả hai file giá có đúng 13 tab, đúng thứ tự trong `SHEET_NAMES`. Lệch tên, thiếu, thừa hoặc đảo thứ tự thì dừng, không ghi.

| Tab | Cách đồng bộ | Khóa |
|---|---|---|
| Đơn Đặt Hàng | Từng ô. Phiếu in, không có khóa dòng | — |
| Danh Mục Vật Tư | Theo dòng | `Mã SP` |
| Hóa Đơn Đầu Vào, Hóa Đơn Đầu Ra | Theo dòng | `Số Hóa Đơn` + `Mã SP`. Trùng khóa thì `#2`, `#3` theo thứ tự dòng |
| Quản Lý Nhóm | Theo dòng | `Tên Nhóm Hàng` |
| LIST KHACH HANG | Theo dòng | `Mã số thuế`. Trống thì dùng `Khách hàng`. Giữ số 0 đứng đầu |
| Chính Sách Đối Tác | Theo dòng. Header không nằm dòng 1 | `Mã Đối Tác` |
| Lịch Sử Xuất Kho | Theo dòng | `Số Phiếu / Mã Đơn` |
| Chi Tiết Đơn Hàng, Sổ Kho - Nhập Xuất Tồn, Báo Cáo Lợi Nhuận SP, Báo Cáo LN Khách Hàng | Công thức. Chỉ kiểm tra tab còn đó. Không ghi đè | — |
| Cấu Hình API Gemini | Cấm. Không đọc, không ghi, không đưa nội dung vào log | — |

Danh Mục Vật Tư, hàng 1 là tiêu đề. Cột A–P dùng chung. Cột G và I–N là công thức (`Số TT Mã`, `Tổng Nhập`, `Tổng Xuất`, `Tồn Kho`, `Định Mức Tối Thiểu`, `Trạng Thái Cảnh Báo`, `Nguồn tồn kho`). Cột H giá vốn không phải cột công thức; ô nào tự có công thức thì vẫn bỏ qua.

Cột Q–T chỉ lấy từ Excel: `Độ trùng tên (%)`, `Ghi chú trùng`, `Thương Hiệu`, `Quy Cách`. Không xóa. Không lấy giá trị Sheet đè lên. Sau mỗi lần xuất, script chép bốn cột này từ Excel vừa đọc, theo `Mã SP`, vào file xuất. Ô trống trên Excel không xóa ô đã có chữ. Ô công thức và `IMAGE` không bị ghi đè.

## Gộp khi hai bên cùng sửa

Script giữ một bản chụp của lần đồng bộ trước. Mỗi ô so với bản chụp:

- Chỉ Excel đổi: lấy Excel, ghi vào Sheet.
- Chỉ Sheet đổi: giữ Sheet, lần xuất sẽ đưa giá trị đó sang Excel.
- Hai bên đổi thành cùng một giá trị: giữ.
- Cùng một ô đổi thành hai giá trị khác nhau: Sheet thắng. Dòng đó vào `SYNC_XungDot` để anh xem lại. Script không ghi giá trị Sheet lên chính ô Sheet đó; lần xuất sẽ đưa giá trị Sheet sang Excel.

Giá cột E (`Đơn Giá (Gồm VAT 8%)`): chuỗi `45.000 đ`, `45.000`, `45,000`, `45000đ` được đọc thành số 45000. Dấu chấm là hàng nghìn khi đứng thành nhóm đúng 3 chữ số. Chỉ ô trống hoặc bằng 0 mới là giá trống. Giá trống hoặc 0 không được đè lên giá lớn hơn 0: script giữ giá thật, ghi ngược lại bên đang trống để hai file về cùng một số, ghi một dòng log, và vẫn đồng bộ mọi ô khác trong cùng lượt.

Mã `VP001` .. `VPn` phải liên tục. Mất mã so với Excel hiện tại thì dừng. Sheet xóa một mã mà Excel còn thì giữ mã, ghi `SYNC_XungDot`, và vẫn tính vào ngưỡng xóa. Excel xóa mã ở giữa thì dừng vì đứt dãy. Xóa đúng mã cuối, dưới ngưỡng, thì được.

Hóa Đơn Đầu Vào và Hóa Đơn Đầu Ra được đồng bộ theo khóa, không theo số dòng. Khóa là `Số Hóa Đơn` + `Mã SP`. Dòng tiếp của cùng một hóa đơn để trống Số Hóa Đơn: script lấy số ở dòng tiêu đề phía trên để khóa ổn định, không ghép cả chuỗi khóa vào từng cột. Cột khóa nào đang là công thức (ví dụ Mã SP) thì giữ công thức, không ghi đè bằng chữ khóa. Dòng có nhãn `TỔNG CỘNG` và mọi dòng dưới nó không được đọc hay ghi; dòng mới chèn phía trên dòng tổng. Khóa chỉ gồm dấu `|`, bắt đầu bằng `|`, có `||`, hoặc có `⚠` bị bỏ qua, không thêm sang bên kia và không xóa. Excel dừng ở dòng 369 trong khi Sheet còn dòng 370–376 nghĩa là Sheet đang có thêm khóa mà Excel chưa có. Khóa chỉ có trên Sheet và chưa có trong bản chụp được đưa sang Excel ở lần xuất. Khóa đã có trong bản chụp mà Excel không còn thì tính là xóa trên Sheet, vẫn chịu ngưỡng 10 dòng.

Ô ngày thuần (Ngày Lập HĐ) so theo ngày lịch: serial nguyên, Date và chuỗi `dd/mm/yyyy` cùng ngày thì không thành diff, kể cả giờ rác 14:00/15:00. Ô ngày-giờ (Ngày Lập Phiếu) so cả giờ tường. Serial Excel không có múi giờ, không được cộng 7 giờ rồi đẩy buổi tối sang ngày hôm sau, và không được làm tròn `46255.88` thành `46256`. Khi ghi, phần giờ được giữ trong số serial, định dạng `dd/mm/yyyy`.

## Ngưỡng xóa

Mặc định dừng nếu một lượt định xóa quá 10 dòng (đếm trước khi lọc các mã được giữ). Đổi bằng Script Property `NGUONG_XOA_DONG`.

Script ghi thẳng vào đúng file Excel và đúng Google Sheet đang có. Không tạo bản sao trên Drive mỗi lượt. Excel được `Drive.Files.update` đúng id đang dùng, thành một phiên bản mới của cùng file. Google Sheet được sửa trên cùng id. Lịch sử phiên bản của Drive và của Sheet là chỗ hoàn tác.

File nền `1FgWLfap4NZXWH-oyjRAIgLkgQNdDFVQP` không bị ghi đè. Bản chụp `PHIEU BAO GIA VAN PHAT - SNAPSHOT.xlsx` là mốc để biết ô nào vừa sửa. Nếu `SNAPSHOT_FILE_ID` đang là id nền, lượt ghi thành công đầu tiên copy một lần ra file snapshot riêng, các lượt sau cập nhật đúng id đó.

Khóa `LockService` 20 giây. Lượt sau đến khi lượt trước chưa xong thì bỏ qua.

## Lượt chạy đầu và bản sao lưu 12:40

Có người sửa Excel lúc 12:22 ngày 24/10/2026 (ICT). Sheet giá lúc đó còn mốc 08:13. Bản sao lưu 12:40 được chụp sau lần sửa đó, cùng cỡ file với Excel.

Cách lấy bản đó làm bản chụp nền:

1. Đặt `DRY_RUN` = `true`.
2. Đặt `SNAPSHOT_FILE_ID` = `1FgWLfap4NZXWH-oyjRAIgLkgQNdDFVQP`.
3. Để trống `LAST_EXCEL_MD5` và `LAST_EXCEL_MODIFIED_TIME`.
4. Chạy `chayDryRun`. Không ghi file.

Đọc `LAST_RUN_JSON`:

- `dayExcel` là true khi md5 bản sao lưu trùng md5 Excel hiện tại. Lượt này đẩy phần Excel khác Sheet lên Sheet, kể cả sửa lúc 12:22. Không lấy Sheet 08:13 đè ngược lại Excel.
- `dayExcel` là false khi md5 khác nhau. Bản sao lưu là mốc cũ hơn. Gộp ba bên bình thường: phần Excel khác bản chụp đi lên Sheet.

Nhìn `soGhiSheet`, `soThem`, `soXoa`, `soXungDot` và `mau` trước khi tắt dry-run. `soXoa` lớn nghĩa là Sheet có dòng mà Excel không có (hóa đơn, khách, nhóm). Lượt đầu coi Excel là nguồn những dòng đó và sẽ xóa trên Sheet nếu dưới ngưỡng. Quá ngưỡng thì cả lượt dừng, không ghi. Nếu số xóa không đúng ý anh, dừng ở dry-run.

Khi bảng tóm tắt đúng: đặt `DRY_RUN` = `false`, chạy `chayDongBo` một lần. Script ghi thẳng vào Excel và Sheet đang có. Sau lượt thành công, nếu bản chụp đang là file nền 12:40, script copy Excel vừa ghi thành file mới `PHIEU BAO GIA VAN PHAT - SNAPSHOT.xlsx` và lưu id vào `SNAPSHOT_FILE_ID`. Các lượt sau cập nhật file snapshot đó. Không bao giờ `update` vào id nền.

## Lịch

Giờ Việt Nam (UTC+7). Project để timezone `Asia/Ho_Chi_Minh`.

- Một trigger `dongBoHaiChieu`, `everyMinutes(30)`, cả ngày.
- Vẫn bỏ **8:05–8:40** và **14:05–14:40** (tính cả hai đầu). Hai khung đó routine bên ngoài đang xuất. Lúc bỏ qua, script không gọi Drive và không lấy khóa.
- `chayDryRun` và `chayDongBo` chạy tay, không xét lịch. Trigger vẫn tôn trọng `DRY_RUN`.

`caiTriggerDongBo` gỡ rồi gắn lại đúng một trigger `dongBoHaiChieu`. `goTriggerDongBo` chỉ xóa handler đó, không đụng handler khác.

## Thay trigger của project VanPhat Xuat Excel

Project xuất theo giờ (PR #76) vẫn nằm ở `apps-script/xuat-excel/`. Hai lịch không được chạy cùng lúc.

1. Mở project Apps Script **VanPhat Xuat Excel**.
2. Chạy `goTriggerXuatBaoGia`. Vào Trigger, không còn `xuatBaoGiaTheoGio`.
3. Mở project đồng bộ hai chiều này. Chạy `caiTriggerDongBo` chỉ sau khi dry-run và một lượt `chayDongBo` đã đúng.

Muốn quay lại xuất một chiều: `goTriggerDongBo` ở project này, rồi `caiTriggerXuatBaoGia` ở project cũ. Phần KV_Queue nằm ở project cũ, chưa gọi KiotViet. Project này không có tab `KV_Queue`.

## Dry-run

`chayDryRun` luôn là dry-run. `DRY_RUN` = `true` thì cả trigger và `chayDongBo` chỉ đọc và gộp. Không ghi Sheet, không ghi Excel, không tạo sổ nhật ký, không tạo file trên Drive.

Dry-run vẫn tải và gộp. `LAST_RUN_JSON` có `muc` = `DRY_RUN` và số dòng dự kiến.

## Khi guard trượt

Không ghi Excel. Nếu Sheet đã được ghi trong lượt đó rồi mà file xuất trượt guard, script dừng trước `Drive.Files.update` và không đẩy mốc md5. Lượt sau chạy lại. Nhật ký ghi lý do khi không phải dry-run. `LAST_GUARD_JSON` giữ lần dừng gần nhất.

Guard trước khi ghi Excel, cùng câu chặn với phần xuất cũ:

1. Đủ 13 sheet, đúng thứ tự.
2. Mã `VP001` .. `VPn` liên tục, không mất mã so với Excel hiện tại.
3. Giá lớn hơn 0 trên Excel không bị file xuất ghi thành 0 hoặc trống. Chuỗi giá đọc được (ví dụ `45.000 đ`) tính là số. Ô trống hoặc 0 được xử lý trước, theo từng ô. Nếu file xuất sau khi ghi Sheet vẫn làm mất giá thật thì dừng trước `Drive.Files.update`.
4. Cột S tiêu đề `Thương Hiệu`, cột T tiêu đề `Quy Cách`.
5. File là xlsx (ký tự `PK`) và từ 1.000.000 byte.
6. Id và tên Excel sau khi ghi không đổi. Cách ghi là `Drive.Files.update`. Không `Files.create` cho file giá.

## Script Properties

Không có secret.

| Khóa | Ai ghi | Ý nghĩa |
|---|---|---|
| `DRY_RUN` | Anh, lúc thử | `true` thì không ghi. Xóa hoặc `false` khi chạy thật |
| `SNAPSHOT_FILE_ID` | Anh lần đầu, rồi script | Lần đầu đặt id bản sao lưu 12:40. Sau lượt ghi thành công, script trỏ sang file snapshot riêng |
| `LAST_EXCEL_MD5` | Script | md5 sau lần xuất thành công. Để trống ở lượt đầu |
| `LAST_EXCEL_MODIFIED_TIME` | Script | `modifiedTime` Excel sau lần ghi |
| `LAST_EXCEL_VERSION` | Script | `version` Drive sau lần ghi |
| `LAST_SHEET_MODIFIED_TIME` | Script | `modifiedTime` Sheet sau khi script ghi, để lượt sau không tưởng đó là người sửa |
| `LAST_RUN_JSON` | Script | Tóm tắt lần chạy gần nhất |
| `LAST_GUARD_JSON` | Script | Lần dừng gần nhất. Xóa khi ghi thành công |
| `LAST_BACKUP_JSON` | — | Không còn dùng. Khóa cũ nếu còn thì bỏ qua. Script không xóa file Drive |
| `SYNC_LOG_ID` | Script | Id sổ `VanPhat SYNC Nhat Ky` |
| `NGUONG_XOA_DONG` | Anh, nếu muốn | Số dòng xóa tối đa. Trống thì 10 |

Tab `SYNC_Log`: `luc | tab | khoa | cot | o | nguon | gia_tri_cu | gia_tri_moi | ghi_chu`.

Tab `SYNC_XungDot`: `luc | tab | khoa | cot | o | gia_tri_nen | gia_tri_excel | gia_tri_sheet | ket_luan | modified_excel | modified_sheet`.

Giá trị bị cắt ngắn. Dòng của tab Gemini không được ghi.

## Quyền OAuth

Lần đầu chạy một hàm trong editor, Google hỏi quyền:

- `https://www.googleapis.com/auth/drive` — đọc, sao lưu, `files.update` đúng id Excel. `drive.file` không đủ.
- `https://www.googleapis.com/auth/spreadsheets` — đọc Sheet giá và tạo sổ nhật ký.
- `https://www.googleapis.com/auth/script.scriptapp` — tạo và gỡ trigger.
- `https://www.googleapis.com/auth/script.external_request` — `UrlFetchApp` xuất xlsx.

Tài khoản cấp quyền phải sửa được Excel giá, Sheet giá, và thư mục chứa hai file (để tạo bản sao lưu).

Advanced service: **Drive API**, phiên bản **v3**, mã định danh `Drive`.

## Các bước triển khai

1. Vào https://script.google.com → **Dự án mới**. Đăng nhập tài khoản sở hữu hai file giá. Đặt tên `VanPhat Dong Bo 2 Chieu`.
2. **Cài đặt dự án** → tick **Hiện tệp kê khai "appsscript.json"**. Xóa `Code.gs` mẫu.
3. Tạo bốn file `Config.gs`, `Xlsx.gs`, `Logic.gs`, `DongBo.gs`. Dán đúng nội dung trong thư mục này. Dán đè `appsscript.json`.
4. **Dịch vụ (+)** → **Drive API** → phiên bản **v3** → mã định danh `Drive` → Thêm.
5. **Cài đặt dự án → Thuộc tính tập lệnh**: `DRY_RUN` = `true`, `SNAPSHOT_FILE_ID` = `1FgWLfap4NZXWH-oyjRAIgLkgQNdDFVQP`. Không thêm token. Không điền `LAST_EXCEL_MD5`.
6. Chọn hàm `chayDryRun` → **Chạy** → xem lại quyền → cho phép. Đọc `LAST_RUN_JSON` như mục lượt chạy đầu. Không có revision Excel mới, không có sổ nhật ký mới.
7. Khi tóm tắt đúng và anh muốn ghi thật: `DRY_RUN` = `false`, chạy `chayDongBo` một lần. Kiểm tra Excel vẫn đúng id và tên. Sổ `VanPhat SYNC Nhat Ky` có dòng log.
8. Mở project **VanPhat Xuat Excel**, chạy `goTriggerXuatBaoGia`.
9. Quay lại project này, chạy `caiTriggerDongBo`. Trigger: một dòng `dongBoHaiChieu`, mỗi 30 phút.

Sửa code sau này: dán bản mới rồi lưu. Trigger giữ nguyên. Project này không triển khai dạng ứng dụng web.

Giới hạn Apps Script: một lần chạy khoảng 6 phút. File xuất phải là xlsx và từ 1 MB. File giá hiện khoảng vài MB đến dưới 10 MB. Script chỉ đọc công thức tới dòng dữ liệu cuối, ghi ô theo cụm trên từng dòng, và chép cột Q–T một lượt trên xml.
