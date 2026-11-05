# Kiểm tra chuông QLVB

Script Python chuẩn thư viện. Routine 10 phút gọi script này trước. Chỉ khi mã thoát là 10 thì bot mới chạy quy trình trình duyệt đầy đủ.

Cách chạy khuyến nghị là **CDP**: nối Chrome đang đăng nhập sẵn, reload tab `main.zul`, đợi ZK vẽ, rồi đọc chuông và bốn số Văn bản đến trên DOM. Không bấm nút, không gõ form, không đăng nhập, không đọc cookie.

GET chỉ với cookie không đủ. Server trả HTTP 200 kèm lệnh ZK `redirect` tới `login.zul` vì phiên còn gắn với bước JS trong trình duyệt (`initializeSecurityMode`). Cùng cookie đó trong Chrome thì vẫn đang đăng nhập. Vì vậy cookie chỉ còn là chế độ phụ để thử fixture.

Trang cần kiểm tra **không ghi trong repo** (ranh giới: không commit link hệ thống văn bản hành chính). Lúc chạy, routine tự đặt `QLVB_PAGE_URL` hoặc `--page-url` là URL https đầy đủ tới `pages/main.zul`.

## Chrome DevTools

Chrome phải được mở trước, đã đăng nhập, với cổng gỡ lỗi chỉ trên máy này:

```bash
google-chrome --remote-debugging-port=9222
```

Script nối `127.0.0.1` (không nhận host khác). `--cdp` hoặc `--cdp 9222`. Bỏ cờ thì vẫn dùng CDP cổng `QLVB_CDP_PORT`, mặc định 9222. Không thấy cổng: mã **30**, stdout:

```json
{"status":"no_browser"}
```

Việc script làm: tìm tab có path kết thúc bằng `main.zul`, chưa có thì mở tab đó, `Page.reload`, rồi `Runtime.evaluate` đọc DOM. Hết phiên khi URL tab là `login.zul` kể cả dạng `login.zul;jsessionid=...`, hoặc form đăng nhập đang hiện (ô mật khẩu hiện và có chữ đăng nhập). Trang nginx có title `403 Forbidden` và chữ `nginx` thì mã **4**, `{"status":"forbidden"}`, tăng `consecutiveFailures`, thử lại đúng một lần. Không lấy giá trị ô mật khẩu, không in cookie.

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
| 0 | `ok` | Không thông báo mới, số chuông không tăng, mọi nhóm đọc được đều 0 hoặc không đọc được nhóm. Cũng là mã khi script **tự bỏ qua** lần gọi vì đang giãn nhịp 30 phút (`backoff: true`) |
| 10 | `new` | Có thông báo mới so với mốc, hoặc số chuông tăng khi danh sách không có trong lần GET, hoặc một nhóm Văn bản đến > 0 |
| 3 | `session_expired` | Hết phiên hoặc cookie hết hạn. Baseline và file nhịp không đổi |
| 4 | `forbidden` hoặc `network` | nginx 403, hoặc lỗi mạng / timeout. `consecutiveFailures` tăng 1. Riêng 403 còn tăng `consecutiveForbidden` trong file nhịp |
| 30 | `no_browser` khi không có Chrome; các lỗi cấu hình khác không có JSON | Thiếu cấu hình, cookie lỏng quyền hoặc nằm trong repo, trang không có chuông lẫn nhóm, baseline hỏng, hoặc cổng CDP không mở |

Mã 0, 10, 3 và 4 in một dòng JSON. Mã 30 in JSON khi `status` là `no_browser`. Lỗi cấu hình khác chỉ có stderr.

403 và lỗi mạng được thử **đúng một lần** nữa, chờ `QLVB_RETRY_BACKOFF` giây (mặc định 1, trần 5). Hết phiên không thử lại. Không vòng lặp.

## JSON khi thành công

`title` là trích yếu. `link` chỉ có khi trang trả về liên kết. `time` là ISO 8601 giờ Bangkok, hoặc `null` nếu không đọc được.

```json
{"status":"new","moi":[{"id":"notice-2","time":"2026-10-30T14:05:00+07:00","title":"Trích yếu ví dụ","khan":true,"link":"https://example.test/van-ban/2"}],"counts":{"choXuLy":1,"sapDenHan":0,"quaHan":0,"nhanDeBiet":0},"mo":["choXuLy"],"intervalMinutes":10,"seeded":true}
```

Nhóm Văn bản đến, chỉ những nhãn đọc được mới có khóa:

| Khóa | Nhãn trên trang |
| --- | --- |
| `choXuLy` | Chờ xử lý |
| `sapDenHan` | Sắp đến hạn |
| `quaHan` | Quá hạn |
| `nhanDeBiet` | Nhận để biết |

Không thấy nhãn nào thì `counts` là `null` (không suy ra bằng 0) và `"mo"` là `[]`. Một khóa có giá trị `> 0` thì mã 10, kể cả khi `moi` rỗng, để bot xử lý hàng đợi. Lần sau số vẫn `> 0` thì vẫn mã 10.

`"mo"` chỉ liệt kê nhóm đang có việc (số đếm > 0), đúng thứ tự Chờ xử lý, Sắp đến hạn, Quá hạn, Nhận để biết. Nhóm rỗng không có trong `"mo"`. Routine khi mã 10 **chỉ mở các khóa trong `"mo"`**, không request trang của nhóm số 0 dù khóa đó vẫn nằm trong `counts` để đối soát. `"mo": []` thì không mở nhóm nào (việc mới nếu có là chuông, không phải hàng đợi). Script không bấm nhóm và không gọi thêm request theo nhóm: danh sách này là hợp đồng cho bước trình duyệt phía sau, để bước đó bỏ nhóm rỗng.

Chỉ khi danh sách thông báo không nằm trong lần GET mà số trên chuông tăng, JSON thêm:

```json
{"status":"new","moi":[],"counts":null,"badge":{"count":4,"truoc":1,"them":3}}
```

Im lặng (mã 0):

```json
{"status":"ok","moi":[],"counts":{"choXuLy":0,"sapDenHan":0,"quaHan":0,"nhanDeBiet":0},"mo":[],"intervalMinutes":10,"seeded":true}
```

Đang giãn nhịp, không đụng Chrome và không GET:

```json
{"status":"ok","backoff":true,"intervalMinutes":30,"consecutiveFailures":3,"mo":[]}
```

403 và mạng:

```json
{"status":"forbidden","consecutiveFailures":3,"intervalMinutes":30}
{"status":"network","reason":"timeout","consecutiveFailures":1,"intervalMinutes":10}
```

`reason` là `timeout` hoặc `network`. `intervalMinutes` là 10 hoặc 30.

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
  "seeded": true,
  "counts": {"choXuLy": 0, "sapDenHan": 0, "quaHan": 0, "nhanDeBiet": 0},
  "items": [
    {"id": "notification-count", "kind": "badge", "count": 2}
  ]
}
```

- `tip`: mốc thời gian mới nhất đã thấy. Thông báo có `time` không sau mốc, và đã nằm trong `alerted` hoặc `items`, thì không báo lại.
- `alerted`: giữ tối đa 400 mục. Chuỗi và object đều nhận.
- `items`: badge và notice như bản version 1, để file cũ vẫn đọc được.
- `consecutiveFailures`: chỉ tăng khi mã 4 (cả 403 và lỗi mạng). Lần đọc thành công thì về 0. Hết phiên không đụng file.
- `seeded`: `true` sau khi đã chạy `--seed`. Thiếu khóa hoặc `false` là chưa seed.
- Baseline hỏng thì mã 30, không ghi đè.

Số chuông giảm: mã 0, baseline cập nhật số mới. Lần GET không có `notification-item` thì giữ notice cũ, để lần sau danh sách hiện lại không bị báo trùng.

## Seed một lần sau khi merge

File state cũ chỉ có số chuông sẽ khiến lần danh sách hiện ra bị tính thành hàng loạt thông báo mới. Sau khi merge, trên máy bot chạy **một lần** (Chrome đang đăng nhập, cổng 9222):

```bash
install -d -m 700 /var/lib/vanphat
export QLVB_PAGE_URL='https://.../pages/main.zul'
export QLVB_BASELINE_FILE=/var/lib/vanphat/qlvb-bell-baseline.json
export QLVB_PACE_FILE=/var/lib/vanphat/qlvb-bell-pace.json
python3 tools/qlvb-chuong/check_bell.py --cdp --seed
```

Lệnh ghi mốc (`tip`, `alerted`, `items`, `counts`, `seeded: true`) rồi thoát 0 dù nhóm đang > 0. Không lặp trong routine 10 phút. `QLVB_SEED=1` cùng nghĩa với `--seed`. `--seed` vẫn chạy khi đang giãn nhịp 30 phút; lần đó thành công thì nhịp về 10 phút.

Chưa seed: file state **đã có** mà không phải `"seeded": true` thì script in cảnh báo ra stderr, mã thoát giữ nguyên (0 hoặc 10). File chưa tồn tại thì lần chạy thường không cảnh báo; hãy seed trước khi bật routine.

```
qlvb-bell: chưa seed — sau khi merge hãy chạy một lần: python3 tools/qlvb-chuong/check_bell.py --cdp --seed
```

## Nhịp sau 403

Ba lần **403 liên tiếp** (mã 4, `status` là `forbidden`; mỗi lần gọi tính một, kể cả đã thử lại trong lần đó) thì khoảng kiểm tra từ 10 phút lên **30 phút**. Lần đọc thành công (mã 0 hoặc 10, kể cả `--seed`) đưa về 10 phút. Lỗi mạng vẫn là mã 4 nhưng **không** tăng bộ đếm 403 và không xóa bộ đếm đó. Hết phiên không sửa file nhịp.

File nhịp nằm **ngoài repo**, cạnh file cookie, quyền `0600`:

```text
/var/lib/vanphat/qlvb.cookie
/var/lib/vanphat/qlvb-bell-pace.json
```

Có `QLVB_COOKIE_FILE` thì script tự ghi `qlvb-bell-pace.json` cùng thư mục. CDP không đọc cookie; muốn file nhịp cạnh cookie thì đặt `QLVB_PACE_FILE` (hoặc `--pace-file`) trỏ tới đường dẫn trên, hoặc vừa `--cdp` vừa có `QLVB_COOKIE_FILE` để lấy thư mục. Không đặt gì và baseline cũng nằm trong cây repo thì script ghi ở `~/.local/share/vanphat/qlvb-bell-pace.json` và cảnh báo trên stderr. Đường dẫn file nhịp nằm trong repo thì mã 30, không đọc. File hỏng hoặc lỏng quyền thì mã 30, không ghi đè.

Trong 30 phút sau mốc `nextCheckAt`, lần gọi sau không reload Chrome và không GET. Stdout mã 0, `"backoff": true`, `"intervalMinutes": 30`. Cron vẫn có thể gọi mỗi 10 phút; script tự bỏ qua cho đến hết cửa sổ.

## Giới hạn

Chế độ cookie chỉ thấy những gì server nhét vào lần GET đầu, và với ZK hiện tại lần đó là trang login. Chế độ CDP đọc DOM sau khi ZK vẽ. Cả hai đều không gọi `/zkau`, không gửi sự kiện `onRendered`, không đánh dấu đã đọc, không bấm. Việc duy nhất làm đổi trang ở CDP là reload tab. Trang không có dấu chuông và cũng không có bốn nhãn nhóm thì mã 30, baseline giữ nguyên.

## Chạy

```bash
export QLVB_PAGE_URL='https://.../pages/main.zul'
export QLVB_BASELINE_FILE=/var/lib/vanphat/qlvb-bell-baseline.json
export QLVB_PACE_FILE=/var/lib/vanphat/qlvb-bell-pace.json
python3 tools/qlvb-chuong/check_bell.py --cdp
```

Cờ: `--cdp` (cổng tuỳ chọn), `--cookie-file`, `--baseline-file`, `--pace-file`, `--page-url`, `--timeout`, `--seed`.

Chế độ cookie, chỉ khi cần thử fixture: `QLVB_TRANSPORT=cookie` và `QLVB_COOKIE_FILE`. Không đặt `QLVB_TRANSPORT` thì script dùng CDP.

`QLVB_TIMEOUT` mặc định 20 giây, vừa là hạn chờ ZK vẽ. `QLVB_ALLOW_FIXTURE=1` cùng `QLVB_HTTP_FIXTURE` hoặc `QLVB_CDP_FIXTURE` chỉ để thử mock. Routine thật không đặt các biến fixture.

## Routine

```bash
python3 tools/qlvb-chuong/check_bell.py --cdp
rc=$?
case "$rc" in
  0)  # im lặng, hoặc backoff true thì đang giãn 30 phút — không mở nhóm
      ;;
  10) # stdout là JSON status new.
      # Chỉ mở nhóm có trong "mo" (số đếm > 0). Bỏ qua nhóm rỗng, không request nhóm đó.
      ;;
  3)  # session_expired — người vận hành đăng nhập lại trên Chrome đang mở cổng 9222
      ;;
  4)  # forbidden hoặc network. Đọc intervalMinutes: 10 hoặc 30.
      # Script tự không gọi lại trước nextCheckAt khi đang 30 phút.
      ;;
  30) # no_browser nếu Chrome chưa mở cổng; hoặc cấu hình, quyền cookie, baseline, file nhịp — xem stderr
      ;;
esac
```

## Test

```bash
python3 tools/qlvb-chuong/test_check_bell.py
```
