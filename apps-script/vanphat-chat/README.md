# Vạn Phát AI Chat (Gemini + catalog)

- Frontend: `js/chat-widget.js` — **không Zalo**; tra `data/products.json` rồi gửi `catalogContext` lên API.
- Backend: Web App này — Gemini dual-model; lead/bill ghi Google Sheet.
- Prompt kiểm soát: `content/chat-system-prompt.md` → Script Property `SYSTEM_PROMPT`.

## Quy tắc nghiệp vụ
- AI chỉ tư vấn theo dữ liệu web/catalog.
- Không tự chốt đơn với khách.
- Nhu cầu thêm/khác → form SĐT → `action: lead` → sheet **Bills** để NV gọi lại.

## Deploy
1. Dán `Code.gs`, set `GEMINI_API_KEY` (+ `SYSTEM_PROMPT`).
2. Deploy Web app: Execute as Me, Anyone.
3. Dán URL `/exec` vào `data/chat-config.json` → `apiUrl`.
