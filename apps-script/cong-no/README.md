# Apps Script sổ công nợ v7

Script này gắn vào Google Sheet sổ công nợ v7 của Công ty Vạn Phát. Script không gọi LLM. Script chạy bằng quyền Google của chủ sổ. Repo không chứa token, mật khẩu hay file `.clasprc.json`.

Script chỉ ghi ba sheet: `CN_HangDoi`, `CN_SucKhoe`, `CONFIG`. Mọi lệnh ghi đi qua `Ghi.gs`. Sheet khác, gồm `PhieuGiao`, `HoaDon`, `ChiTiet_LN`, bị chặn. Vùng `DM_KhachHang!AD2:AD501` bị chặn riêng và chỉ được đọc khi kiểm tra sức khỏe.

## Việc script làm

1. Mỗi 15 phút từ 07:00 đến 18:00 (giờ `Asia/Ho_Chi_Minh`), và một lần trong giờ 23:00: quét chứng từ mới trên Drive. Gmail tắt mặc định.
2. Mỗi giờ: kiểm tra sức khỏe sổ theo logic `chk.py`, ghi `CN_SucKhoe`.
3. Hàm `docDanhMucVatTu()` đọc Google Sheet danh mục, chỉ đọc. Repo không có mã script «Cập nhật giá vốn» đang chạy trên v7.

Lần quét đầu chưa có mốc trong Script Properties: script ghi mốc bằng thời điểm hiện tại và không kéo file cũ vào hàng đợi.

## Cấu hình đã điền

Sheet `CONFIG` được tạo với các khóa sau. Sửa trên sheet thì lần chạy sau dùng giá trị mới. Không ghi đè ô anh đã sửa.

| Khóa | Giá trị |
|---|---|
| `DRIVE_FOLDER_ID` | `1KAyFZVJJCqu92Swk5JgX15YY0fZDpdrl` |
| `V7_SPREADSHEET_ID` | `1jkmfMIJsoZrDlOxmkqbj44GOsNb1eh3UNk3Tyn0MaJs` |
| `GMAIL_BAT` | `FALSE` |
| `GMAIL_FROM` | `congtytnhhvanphat999@gmail.com` |
| `GIA_VON_SHEET_ID` | `1Hwslun92TLrhXAMgiVDdd6wyvVXP6sqOQbuTKiLKRrM` |
| `GIA_VON_SHEET_NAME` | `Danh Mục Vật Tư` |
| `BO_QUA_THU_MUC` | `1. VAO` |
| `TEN_KHACH` | `2. DANH SACH KHACH HANG` (khớp thêm tên `STT2`) |
| `TEN_HOA_DON` | `9. HOA DON` (khớp thêm tên `STT9`) |
| `TEN_RA` | `2. RA` |
| `TEN_BG` | `8. PHIẾU BÁO GIÁ` |

Cây Drive thực tế trong thư mục gốc: `2. DANH SACH KHACH HANG` là danh sách khách (mỗi khách một thư mục, bên trong có BG/PG xlsx, PDF và thư mục tháng). `9. HOA DON / 2. RA` là HĐ GTGT đầu ra. `9. HOA DON / 1. VAO` bị bỏ qua cả cây con.

Script chỉ lấy file trong ba vùng đó:

- Danh sách khách: PDF, ảnh, Excel, Google Sheet/Doc.
- `2. RA`: cùng loại file, loại chứng từ mặc định là `HĐ`.
- `8. PHIẾU BÁO GIÁ`: chỉ file đoán được là BG.

Tên file hoặc thư mục có «phiếu báo giá», «phiếu giao», «hóa đơn» thì cột loại là `BG`, `PG` hoặc `HĐ`. Khách đoán từ thư mục ngay dưới danh sách khách hoặc dưới `2. RA`, bỏ số thứ tự đầu tên (`4. CTY ...` còn `CTY ...`). File sổ v7 và file danh mục giá không vào hàng đợi. Thư mục lương, nhà cung cấp, logo, web không được đi vào.

## Sheet CN_HangDoi

Hàng 1 là tiêu đề. Dữ liệu từ hàng 2. Cột:

`Thời gian`, `Nguồn`, `FileId`, `Tên`, `Khách hàng`, `Trạng thái`, `ModifiedTime`, `Loại chứng từ`, `Thư mục`, `URL`.

Trạng thái dòng mới luôn là `Chờ bot`. Không thêm dòng khi đã có cùng `FileId` và `ModifiedTime`. `CN_HangDoi!Z1` là công thức `=COUNTIF(F:F,"Chờ bot")`. Ô `Y1` là mốc Drive. Ô `X1` ghi Gmail đang tắt hoặc mốc Gmail.

## Sheet CN_SucKhoe

Mỗi giờ script xóa phần kết quả cũ và ghi bản mới. `Z1` đếm dòng có mức `LỖI`. Các việc kiểm:

- Ô hiển thị bắt đầu bằng `#REF`, `#N/A`, `#VAL`, `#DIV`, `#NAM`, `#ERR` (đúng nhóm trong `chk.py`).
- `PhieuGiao!A1` phải chứa «Mã PG» hoặc «Mã Phiếu».
- Khóa cột A của `HH_Data` còn thiếu trong `HH_Nhap`.
- `Log_CapNhat`: có sheet, header cột A bắt đầu bằng «Thời», ba dòng cuối, cảnh báo nếu lần cuối cũ hơn 26 giờ.
- Vùng lỗi của `chk.py`: `LoiNhuan_Data` cột P–U, `LoiNhuan` cột W–AH, `DM_KhachHang` cột W–AD.
- `DM_KhachHang!AD2:AD501`: ô chứa `#` là lỗi; ô chứa «Đạt» chỉ ghi mức thông tin. Không ghi vào vùng này.

## Trigger

`installTriggers` xóa trigger cũ của đúng ba hàm rồi tạo lại:

- `quetChungTuMoi`: mỗi 15 phút. Ngoài khung 07:00–18:10 hàm thoát ngay, không gọi Drive. Mốc 18:00 được cộng 10 phút vì trigger Google có thể trễ.
- `quetChungTu23h`: mỗi ngày, trong giờ 23, gần phút 0, theo múi `Asia/Ho_Chi_Minh`.
- `quetSucKhoe`: mỗi giờ.

`removeTriggers` chỉ xóa ba hàm đó. Trigger «Cập nhật giá vốn» đang có trên v7 không bị xóa.

## Gắn vào sổ

Chưa gắn script này vào sổ v7 thật. Bot Công Nợ duyệt PR trước.

Cách chạy trên bản sao:

1. Trong Drive, tạo bản sao sổ `QUẢN LÝ CÔNG NỢ KHÁCH HÀNG - VẠN PHÁT (v7)`.
2. Mở bản sao → Tiện ích → Apps Script.
3. Project Settings → Time zone: `(GMT+07:00) Ho Chi Minh`.
4. Bật `appsscript.json` (Project Settings → Show appsscript.json) và dán file `appsscript.json` của thư mục này. Services phải có Drive API v3.
5. Tạo các file `.gs` cùng tên với repo (`Logic.gs`, `Ghi.gs`, `Config.gs`, `HangDoi.gs`, `SucKhoe.gs`, `GiaVon.gs`, `Triggers.gs`) và dán nội dung. Xóa `Code.gs` trống nếu project mới tạo sẵn.
6. Chọn hàm `caiDatSheet` → Run → cấp quyền bằng tài khoản chủ sheet.
7. Trên bản sao, sửa `CONFIG!V7_SPREADSHEET_ID` thành id của bản sao. Id này nằm trên URL `/spreadsheets/d/<id>/edit`. Nếu chưa sửa, `quetSucKhoe` và `quetChungTu_` dừng, không ghi hàng đợi.
8. Chọn `chayThuLogicMau` → Run. Nhật ký phải có dòng `OK logic mẫu chạy hết, không lỗi`. Hàm này không ghi sheet.
9. Chọn `quetSucKhoe` → Run. Xem `CN_SucKhoe`.
10. Chọn `installTriggers` khi muốn lịch tự chạy trên bản sao.

Cách đẩy bằng clasp, vẫn trên project của bản sao:

```bash
cd apps-script/cong-no
npx @google/clasp login
printf '%s\n' '{"scriptId":"<SCRIPT_ID của bản sao>","rootDir":"."}' > .clasp.json
npx @google/clasp push
```

`.clasp.json` nằm trong `.gitignore`. Không commit file đó.

## Đổi nguồn đọc giá vốn

Script «Cập nhật giá vốn» đang chạy mỗi giờ trên v7 không có trong repo này. Script đó đang đọc Excel `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`.

Trong project Apps Script đang gắn trên v7, tìm chỗ mở file Excel đó và thay bằng lời gọi `docDanhMucVatTu()`. Hàm trả về `headers`, `rows`, `soDong` và `cot` (`cotMa`, `cotDonGia`, `cotGiaVon`). Hàm không ghi `DM_GiaVon` và không ghi file danh mục.

Header sheet `Danh Mục Vật Tư` đang có cột «Đơn Giá» (giá bán). Không thấy header «Giá vốn» (`cotGiaVon` = -1). Giữ đúng cột mà script cũ đang dùng khi map từ mảng trả về. Chưa xác nhận tên cột thì đừng ghi sang `DM_GiaVon`.

`kiemTraNguonGiaVon` chỉ để chạy tay: đọc danh mục rồi thêm một dòng tóm tắt trên `CN_SucKhoe`, không ghi giá.

## Gmail

`GMAIL_BAT` mặc định `FALSE`. Bật `TRUE` trên `CONFIG` thì lần sau chỉ lấy thư có đính kèm gửi từ `congtytnhhvanphat999@gmail.com`. Thư nhà cung cấp gửi đến hộp thư không được lấy. Lần đầu bật cũng chỉ đặt mốc, không kéo thư cũ.

## Chạy thử trong repo

Không cần Google:

```bash
node apps-script/cong-no/test/chay_thu.js
```

Kỳ vọng hai dòng: `OK logic mẫu chạy hết, không lỗi` và `OK cổng ghi: chỉ Ghi.gs được ghi sheet`.

Phiên làm việc này đọc được tên sổ v7 và cây thư mục Drive, nhưng không tạo bản sao và không ghi vào v7 thật. Vì vậy chưa có kết quả `quetSucKhoe` trên dữ liệu sống. Kết quả mẫu nằm ở lệnh `node` ở trên.
