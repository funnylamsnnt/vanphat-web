# Apps Script sổ công nợ v7

Script này gắn vào Google Sheet sổ công nợ v7 của Công ty Vạn Phát. Script không gọi LLM. Script chạy bằng quyền Google của chủ sổ. Repo không chứa token, mật khẩu hay file `.clasprc.json`.

Script chỉ ghi ba sheet: `CN_HangDoi`, `CN_SucKhoe`, `CONFIG`. Mọi lệnh ghi đi qua `Ghi.gs`. Sheet khác, gồm `PhieuGiao`, `HoaDon`, `ChiTiet_LN`, `HangCho_File`, bị chặn. Vùng `DM_KhachHang!AD2:AD501` bị chặn riêng. `DM_KhachHang` chỉ được đọc để đoán mã KH/KL và khi kiểm tra sức khỏe.

## Việc script làm

1. Mỗi 15 phút từ 07:00 đến 18:00 (giờ `Asia/Ho_Chi_Minh`), và một lần trong giờ 23:00: quét chứng từ mới trên Drive. Gmail tắt mặc định.
2. Mỗi giờ: kiểm tra sức khỏe sổ theo logic `chk.py`, ghi `CN_SucKhoe`.
3. Hàm `docDanhMucVatTu()` đọc Google Sheet danh mục, chỉ đọc. Hàm cấp Mã, Tên và Đơn giá cho `DM_GiaVon!C`. Không ghi cột D. Giá vốn nằm ở `DM_GiaVon!D` «Giá vốn BQ có VAT», do script «Cập nhật giá vốn» cập nhật mỗi giờ.

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
| `HEADER_PHIEU_GIAO` | `Mã PG (khóa)` và các cụm dự phòng `Mã PG`, `Mã Phiếu`, `Mã phiếu` |
| `LOAI_TRU_FILE_ID` | `1xgIKFgdd1iki3uoeIRh29FMrOzxRfreR`, `1W3h5ZMzZYReAyZT2Jp39tg-O4U8dZs81` |
| `LOAI_TRU_TEN` | `backup`, `bản sao`, `Copy of`, `(v6)`, `_old` (không phân biệt hoa thường, bỏ dấu) |
| `KY_HIEU_HD` | `1C26TNT` |

Cây Drive thực tế trong thư mục gốc: `2. DANH SACH KHACH HANG` là danh sách khách (mỗi khách một thư mục, bên trong có BG/PG xlsx, PDF và thư mục tháng). `9. HOA DON / 2. RA` là thư mục HĐ GTGT đầu ra. `9. HOA DON / 1. VAO` bị bỏ qua cả cây con.

Script chỉ lấy file trong ba vùng đó:

- Danh sách khách: PDF, ảnh, Excel, Google Sheet/Doc.
- `2. RA`: cùng loại file. Có ký hiệu `1C26TNT` thì loại là `HĐ`. Không có ký hiệu thì loại là `HĐ?`. Không coi mọi file trong `2. RA` là HĐ.
- `8. PHIẾU BÁO GIÁ`: chỉ file đoán được là BG.

Tên file «phiếu báo giá» hoặc «phiếu giao» thì loại là `BG` hoặc `PG`, kể cả khi nằm trong `2. RA`. Tên có «hóa đơn» mà không có ký hiệu `1C26TNT` thì loại là `HĐ?`. Khách đoán từ thư mục ngay dưới danh sách khách hoặc dưới `2. RA`, bỏ số thứ tự đầu tên (`4. CTY ...` còn `CTY ...`). `doanKhach_` đối chiếu `DM_KhachHang` cột A với tên cột B hoặc C, chỉ đọc, để ra mã KH hoặc KL. File sổ v7, file danh mục giá, hai id trong `LOAI_TRU_FILE_ID`, và tên chứa cụm loại trừ không vào hàng đợi. Thư mục lương, nhà cung cấp, logo, web không được đi vào.

Mốc quét Drive lấy file có `modifiedTime` sau mốc hoặc `createdTime` sau mốc. Một lượt xử lý tối đa 400 file cũ nhất. Còn dư thì `mocKeTiep_` dời mốc tới thời điểm file thứ 400 (cùng mốc thì giữ cả nhóm), ghi một dòng `LỖI` mã `QUET_CAT` lên `CN_SucKhoe`, không dừng bằng lỗi lặp. Lượt sau lấy phần còn lại.

## Sheet CN_HangDoi

Hàng 1 là tiêu đề. Dữ liệu từ hàng 2. Cột:

`Thời gian`, `Nguồn`, `FileId`, `Tên`, `Khách hàng`, `Trạng thái`, `ModifiedTime`, `Loại chứng từ`, `Thư mục`, `URL`, `Ghép/Mộc đỏ`, `Mã KH`.

File xlsx và PDF mộc đỏ cùng tên, cùng thư mục, thành một dòng. `FileId` giữ file xlsx khi đã có. Cột `URL` nối bằng ` | `. PDF lên ở lượt sau thì sửa dòng cũ, không thêm dòng mới. Chỉ có xlsx thì cột `Ghép/Mộc đỏ` ghi `chưa có PDF mộc đỏ`. Đã có cả PDF thì ghi `đã ghép PDF mộc đỏ`. Chỉ có PDF thì ghi `chỉ có PDF mộc đỏ`.

Trạng thái:

- File chưa có trong `BaoGia` (cột D số phiếu, cột I URL), `PhieuGiao` (cột D số phiếu, cột K URL) hoặc `HoaDon` (cột A số HĐ, cột K link): `Chờ bot`.
- File đã có trong sổ (khớp id trên URL, hoặc số phiếu dài từ 4 ký tự nằm trong tên file): ghi `Đã có trong sổ`.
- Dòng đã ghi, file bị sửa (`modifiedTime` mới hơn mốc đang lưu trên hàng đợi) và vẫn khớp sổ: sửa dòng đó thành `Sửa file đã ghi`.

`CN_HangDoi!Z1` đếm `Chờ bot` và `Sửa file đã ghi`. `Đã có trong sổ` không cộng vào Z1. Ô `Y1` là mốc Drive. Ô `X1` ghi Gmail đang tắt, mốc Gmail, hoặc lỗi Gmail.

Script không ghi sheet `HangCho_File`. Tab đó trên v7 đang là vùng A1:K100, trùng việc với `CN_HangDoi` (thời gian, file, tên, loại, mã KH, thư mục, URL, trạng thái). Cách gộp nằm trong mô tả PR, chờ bot Công Nợ chọn.

## Sheet CN_SucKhoe

Mỗi giờ script xóa phần kết quả cũ và ghi bản mới. `Z1` đếm dòng có mức `LỖI`. Các việc kiểm:

- Ô hiển thị bắt đầu bằng `#REF`, `#N/A`, `#VAL`, `#DIV`, `#NAM`, `#ERR` (đúng nhóm trong `chk.py`).
- `PhieuGiao!A1` phải chứa «Mã PG (khóa)», «Mã PG» hoặc «Mã Phiếu». Header đang dùng trên v7 là «Mã PG (khóa)».
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

## Giá vốn

«Đơn Giá» trên sheet `Danh Mục Vật Tư` là giá bán, không phải giá vốn. `docDanhMucVatTu()` chỉ đọc và cấp Mã, Tên, Đơn giá cho `DM_GiaVon!C`. Không ghi `DM_GiaVon`, không ghi cột D.

Giá vốn là `DM_GiaVon!D` «Giá vốn BQ có VAT». Script «Cập nhật giá vốn» đang chạy mỗi giờ trên v7 là chỗ ghi cột đó. Script này không thay script đó.

`ChiTiet_LN!J` tra theo thứ tự: cột N nhập tay, rồi cột M tên ghép, rồi mã SP cột C. Script này không ghi `ChiTiet_LN`.

`kiemTraNguonGiaVon` chỉ để chạy tay: đọc danh mục rồi thêm một dòng tóm tắt trên `CN_SucKhoe`, không ghi giá.

## Quy tắc giai đoạn sau

Ba quy tắc này chưa thực thi khi xếp hàng đợi. Giai đoạn sau mới dùng:

- HĐ khác sản phẩm nhưng cùng tổng giá trị là hợp lệ, chỉ lệch giá trị mới báo.
- Nhóm Khách lẻ quen (mã KL) có theo dõi nợ.
- KH007 là khách vãng lai, không vào công nợ.

`doanKhach_` đã đối chiếu `DM_KhachHang` để ra mã KH/KL và đánh dấu khách lẻ quen hoặc KH007. Hàng đợi giai đoạn này vẫn nhận cả KH007. Chưa loại khách vãng lai khỏi công nợ.

## Gmail

`appsscript.json` chưa xin `https://www.googleapis.com/auth/gmail.readonly`. `GMAIL_BAT` mặc định `FALSE`, lượt quét không gọi Gmail.

Khi anh bật Gmail: thêm scope đó vào `oauthScopes`, đẩy lại script, cấp quyền, rồi đặt `GMAIL_BAT` = `TRUE`. Lần sau chỉ lấy thư có đính kèm gửi từ `congtytnhhvanphat999@gmail.com`. Thư nhà cung cấp gửi đến hộp thư không được lấy. Lần đầu bật cũng chỉ đặt mốc, không kéo thư cũ. File đính kèm không có ký hiệu `1C26TNT` thì loại là `HĐ?`. Có ký hiệu thì `HĐ`. Tên phiếu giao hoặc báo giá giữ `PG` hoặc `BG`.

Nếu `GMAIL_BAT` bật mà chưa có quyền, script ghi `LỖI` lên `CN_SucKhoe` và vẫn lưu mốc Drive. Quá 100 thư một lượt thì dời mốc Gmail từng phần, không chặn mốc Drive.

## Chạy thử trong repo

Không cần Google:

```bash
node apps-script/cong-no/test/chay_thu.js
```

Kỳ vọng hai dòng: `OK logic mẫu chạy hết, không lỗi` và `OK cổng ghi: chỉ Ghi.gs được ghi sheet`.

Phiên làm việc này đọc được tên sổ v7 và cây thư mục Drive, nhưng không tạo bản sao và không ghi vào v7 thật. Vì vậy chưa có kết quả `quetSucKhoe` trên dữ liệu sống. Kết quả mẫu nằm ở lệnh `node` ở trên.
