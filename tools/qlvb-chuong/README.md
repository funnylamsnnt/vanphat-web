# Kiểm tra chuông QLVB

Script Python chuẩn thư viện, chỉ gửi `GET`, không mở trình duyệt, không đăng nhập, không POST, không bấm chuông. Routine 10 phút gọi script này trước. Chỉ khi mã thoát là 10 thì bot mới chạy quy trình trình duyệt đầy đủ.

Trang cần kiểm tra **không ghi trong repo** (ranh giới: không commit link hệ thống văn bản hành chính). Lúc chạy, routine tự đặt `QLVB_PAGE_URL` hoặc `--page-url` là URL https đầy đủ tới `pages/main.zul`.

## File cookie

Đọc từ file **nằm ngoài repo**. Đường dẫn lấy từ `QLVB_COOKIE_FILE` hoặc `--cookie-file`. Không truyền giá trị cookie trên dòng lệnh (lệnh sẽ lộ trong `ps` và lịch sử shell).

File phải có quyền `0600` hoặc chặt hơn (ví dụ `0400`). Bit group hoặc other bật thì script từ chối, mã 30, không đọc nội dung. Không in và không ghi giá trị cookie ra stdout, stderr, hay file state.

```bash
install -m 600 /dev/null /var/lib/vanphat/qlvb.cookie
# rồi ghi cookie đã có sẵn vào file đó
```

Một trong ba dạng, chỉ chứa cookie phiên đã có sẵn:

1. Một dòng header: `JSESSIONID=...; tenkhac=...`
2. JSON: `{"cookie":"JSESSIONID=..."}` — có khóa mật khẩu hoặc tên đăng nhập thì script từ chối. Khóa `expires` / `expiresAt` / `expiry` trong quá khứ thì coi là hết phiên.
3. Netscape cookie jar (kể cả dòng `#HttpOnly_`). Cột hết hạn `0` là cookie phiên, không coi là hết hạn. Thời điểm đã qua thì hết phiên.

Không trỏ biến vào thư mục profile Chrome/Chromium/Edge hoặc file SQLite `Cookies`.

Hết hạn cookie, HTTP 401, URL cuối là `login.zul`, lệnh ZK `redirect` tới `login.zul`, hoặc trang login không có chuông: mã **3**, stdout đúng một dòng:

```json
{"status":"session_expired"}
```

Script không đăng nhập lại và không lưu mật khẩu. Bot gọi trình duyệt để đăng nhập, cấp lại file cookie (`chmod 600`), rồi chạy tiếp.

## Mã thoát

| Mã | `status` | Khi nào |
| --- | --- | --- |
| 0 | `ok` | Không thông báo mới, số chuông không tăng, mọi nhóm đọc được đều 0 hoặc không đọc được nhóm |
| 10 | `new` | Có thông báo mới so với mốc, hoặc số chuông tăng khi danh sách không có trong lần GET, hoặc một nhóm Văn bản đến > 0 |
| 3 | `session_expired` | Hết phiên hoặc cookie hết hạn. Baseline không đổi |
| 4 | `forbidden` hoặc `network` | nginx 403, hoặc lỗi mạng / timeout. `consecutiveFailures` tăng 1 |
| 30 | (không có JSON) | Thiếu cấu hình, cookie lỏng quyền hoặc nằm trong repo, trang không có chuông lẫn nhóm, baseline hỏng |

Mã 0 và 10 vẫn in một dòng JSON để bot đọc. Mã 3 và 4 cũng vậy. Mã 30 chỉ có một dòng stderr, không có stdout.

403 và lỗi mạng được thử **đúng một lần** nữa, chờ `QLVB_RETRY_BACKOFF` giây (mặc định 1, trần 5). Hết phiên không thử lại. Không vòng lặp.

## JSON khi thành công

`title` là trích yếu. `link` chỉ có khi trang trả về liên kết. `time` là ISO 8601 giờ Bangkok, hoặc `null` nếu không đọc được.

```json
{"status":"new","moi":[{"id":"notice-2","time":"2026-10-30T14:05:00+07:00","title":"Trích yếu ví dụ","khan":true,"link":"https://example.test/van-ban/2"}],"counts":{"choXuLy":1,"sapDenHan":0,"quaHan":0,"nhanDeBiet":0}}
```

Nhóm Văn bản đến, chỉ những nhãn đọc được mới có khóa:

| Khóa | Nhãn trên trang |
| --- | --- |
| `choXuLy` | Chờ xử lý |
| `sapDenHan` | Sắp đến hạn |
| `quaHan` | Quá hạn |
| `nhanDeBiet` | Nhận để biết |

Không thấy nhãn nào thì `counts` là `null` (không suy ra bằng 0). Một khóa có giá trị `> 0` thì mã 10, kể cả khi `moi` rỗng, để bot xử lý hàng đợi. Lần sau số vẫn `> 0` thì vẫn mã 10.

Chỉ khi danh sách thông báo không nằm trong lần GET mà số trên chuông tăng, JSON thêm:

```json
{"status":"new","moi":[],"counts":null,"badge":{"count":4,"truoc":1,"them":3}}
```

Im lặng (mã 0):

```json
{"status":"ok","moi":[],"counts":{"choXuLy":0,"sapDenHan":0,"quaHan":0,"nhanDeBiet":0}}
```

403 và mạng:

```json
{"status":"forbidden","consecutiveFailures":2}
{"status":"network","reason":"timeout","consecutiveFailures":1}
```

`reason` là `timeout` hoặc `network`.

## File state

Cùng đường dẫn baseline cũ (`QLVB_BASELINE_FILE` hoặc `--baseline-file`). Mặc định `/workspace/qlvb-bell-baseline.json`, quyền `0600`, đã nằm trong `.gitignore`. Không commit file thật.

Đọc được cả file cũ (`version` 1, `items` là badge/notice) và `alerted` lẫn lộn chuỗi với object. Một chuỗi coi như mã hoặc `thời điểm|trích yếu`.

```json
{
  "version": 1,
  "updatedAt": "2026-10-30T14:05:00+07:00",
  "tip": "2026-10-30T14:05:00+07:00",
  "alerted": [
    "notice-cu",
    {"id": "notice-2", "time": "2026-10-30T14:05:00+07:00", "title": "Trích yếu ví dụ", "khan": true}
  ],
  "consecutiveFailures": 0,
  "counts": {"choXuLy": 0, "sapDenHan": 0, "quaHan": 0, "nhanDeBiet": 0},
  "items": [
    {"id": "notification-count", "kind": "badge", "count": 2}
  ]
}
```

- `tip`: mốc thời gian mới nhất đã thấy. Thông báo có `time` không sau mốc, và đã nằm trong `alerted` hoặc `items`, thì không báo lại.
- `alerted`: giữ tối đa 400 mục. Chuỗi và object đều nhận.
- `items`: badge và notice như bản version 1, để file cũ vẫn đọc được.
- `consecutiveFailures`: chỉ tăng khi mã 4. Lần GET thành công thì về 0. Hết phiên không đụng file.
- Baseline hỏng thì mã 30, không ghi đè.

`QLVB_SEED=1` hoặc `--seed`: ghi mốc (tip, alerted, items, counts) rồi thoát 0 dù nhóm đang > 0. Dùng một lần khi lập mốc.

Số chuông giảm: mã 0, baseline cập nhật số mới. Lần GET không có `notification-item` thì giữ notice cũ, để lần sau danh sách hiện lại không bị báo trùng.

## Giới hạn

GET một lần chỉ thấy những gì server nhét vào lần tải đầu. Không gọi `/zkau`, không gửi sự kiện `onRendered`, không đánh dấu đã đọc. Trang không có dấu chuông và cũng không có bốn nhãn nhóm thì mã 30, baseline giữ nguyên.

## Chạy

```bash
export QLVB_COOKIE_FILE=/var/lib/vanphat/qlvb.cookie
export QLVB_PAGE_URL='https://.../pages/main.zul'
export QLVB_BASELINE_FILE=/workspace/qlvb-bell-baseline.json
python3 tools/qlvb-chuong/check_bell.py
```

Cờ tương đương: `--cookie-file`, `--baseline-file`, `--page-url`, `--timeout`, `--seed`.

`QLVB_TIMEOUT` mặc định 20 giây. `QLVB_ALLOW_FIXTURE=1` và `QLVB_HTTP_FIXTURE` chỉ để thử mock; routine thật không đặt hai biến này.

## Routine

```bash
chmod 600 "$QLVB_COOKIE_FILE"
python3 tools/qlvb-chuong/check_bell.py
rc=$?
case "$rc" in
  0)  ;;
  10) # stdout là JSON status new — chạy quy trình trình duyệt
      ;;
  3)  # session_expired — bot đăng nhập lại bằng trình duyệt, cấp cookie, không đoán mật khẩu
      ;;
  4)  # forbidden hoặc network — đọc consecutiveFailures, không thử lại dày hơn một lần
      ;;
  30) # cấu hình, quyền cookie, hoặc baseline — xem stderr
      ;;
esac
```

## Test

```bash
python3 tools/qlvb-chuong/test_check_bell.py
```
