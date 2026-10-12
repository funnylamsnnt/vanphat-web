# Vạn Phát AI Chat (Grok + catalog)

- Frontend: `js/chat-widget.js` tra `data/products.json` rồi gửi `catalogContext` lên API. Không gửi số tồn. Bốn gợi ý nhanh giữ nguyên: Giấy A4, Bìa hồ sơ, Địa chỉ, Photocopy.
- Backend: Web App này gọi Grok của xAI.
  - `grok-4.7` đi `POST https://api.x.ai/v1/responses` với `reasoning.effort` = `low` (tài liệu xAI: model này suy luận, mặc định `high`; `low` cho chat khách, nhanh và ít token hơn). `store` để `false` để không lưu hội thoại khách trên xAI.
  - `grok-4` đi `POST https://api.x.ai/v1/chat/completions`. Bảng `reasoning.effort` không có model này.
- Prompt kiểm soát: `content/chat-system-prompt.md` → Script Property `SYSTEM_PROMPT`.
- API Cursor dùng cho phiên sửa repo. Không gắn API đó vào chat khách.

## Quy tắc nghiệp vụ

- AI chỉ tư vấn theo dữ liệu web/catalog.
- Không tự chốt đơn với khách.
- Nhu cầu thêm/khác → form SĐT → `action: lead` → sheet **Bills** để nhân viên gọi lại.
- Thiếu `XAI_API_KEY`, lỗi API, hoặc quá giới hạn lượt: trả lời có hotline `033 5652 832` và Chat Zalo `https://zalo.me/0335652832`.

## Giới hạn

- Mỗi phiên trình duyệt: khoảng 10 tin/phút và 60 tin/ngày. Phiên là `sessionId` widget lưu trong `sessionStorage`. Apps Script không nhận IP khách.
- Bộ nhớ CacheService giữ bộ đếm phiên tối đa 6 giờ. Khóa có ngày Bangkok, nên sang ngày mới thì đếm lại. Nếu khách im hơn 6 giờ, bộ đếm phiên trong ngày có thể đếm lại từ đầu.
- Cả site: Script Property `DAILY_CAP`, mặc định `2000` tin/ngày theo giờ Bangkok. Bộ đếm này nằm trong Script Properties, không phụ thuộc cache 6 giờ.

## Deploy

1. Dán `Code.gs` vào project Apps Script của khung chat.
2. Script Properties:
   - `XAI_API_KEY`: khóa lấy ở console xAI. Không dán khóa vào repo hay vào chat.
   - `SYSTEM_PROMPT`: dán nội dung `content/chat-system-prompt.md`.
   - `DAILY_CAP`: không bắt buộc. Bỏ trống thì mặc định 2000 tin/ngày.
   - Xóa `GEMINI_API_KEY` nếu còn.
3. Deploy Web app: Execute as Me, Anyone. Bản deploy mới thì khung chat mới gọi Grok.
4. URL `/exec` giữ trong `data/chat-config.json` → `apiUrl` nếu đường dẫn không đổi. Đổi deployment thì cập nhật URL đó.
