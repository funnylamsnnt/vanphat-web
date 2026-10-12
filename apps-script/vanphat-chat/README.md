# Vạn Phát AI Chat (Gemini + catalog)

- Frontend: `js/chat-widget.js` tra `data/products.json` rồi gửi `catalogContext` lên API. Không gửi số tồn.
- Backend: Web App này gọi Grok của xAI. Mặc định `grok-4.7`, dự phòng `grok-4`. Lead/bill ghi Google Sheet.
- Prompt kiểm soát: `content/chat-system-prompt.md` → Script Property `SYSTEM_PROMPT`.
- API Cursor dùng cho phiên sửa repo. Không gắn API đó vào chat khách, vì phiên Cursor sửa được web và dữ liệu công ty.

## Quy tắc nghiệp vụ
- AI chỉ tư vấn theo dữ liệu web/catalog.
- Không tự chốt đơn với khách.
- Nhu cầu thêm/khác → form SĐT → `action: lead` → sheet **Bills** để NV gọi lại.

## Deploy
1. Dán `Code.gs`. Trong Script Properties đặt `XAI_API_KEY` (khóa lấy ở console xAI) và `SYSTEM_PROMPT`. Xóa `GEMINI_API_KEY` nếu còn. Không dán khóa vào repo hay vào chat.
2. Deploy Web app: Execute as Me, Anyone. Bản deploy mới thì khung chat mới gọi Grok.
3. URL `/exec` giữ trong `data/chat-config.json` → `apiUrl` nếu đường dẫn không đổi. Đổi deployment thì cập nhật URL đó.
