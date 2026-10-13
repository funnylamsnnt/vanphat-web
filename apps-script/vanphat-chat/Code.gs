/**
 * Vạn Phát — chat tư vấn theo catalog, gọi Grok (xAI) + ghi bill.
 *
 * Mặc định (Script Property cùng tên sẽ đè, nếu đã set):
 *   PRIMARY_MODEL  grok-4.20-0309-non-reasoning → POST /v1/chat/completions
 *   FALLBACK_MODEL grok-4-1-fast-non-reasoning → POST /v1/chat/completions
 * Chỉ model suy luận (ví dụ grok-4.7) đi POST /v1/responses, reasoning.effort = low.
 * Dự phòng đúng một lần, chỉ khi HTTP 4xx/5xx hoặc lỗi mạng. Không gọi grok-4.
 * Non-reasoning: max_tokens khoảng 450.
 *
 * Script Properties:
 *   XAI_API_KEY      — bắt buộc. Khóa xAI, không ghi vào repo.
 *   SYSTEM_PROMPT    — tuỳ chọn (nên dán từ content/chat-system-prompt.md)
 *   PRIMARY_MODEL    — mặc định grok-4.20-0309-non-reasoning
 *   FALLBACK_MODEL   — mặc định grok-4-1-fast-non-reasoning
 *   DAILY_CAP        — tuỳ chọn, mặc định 2000 tin/ngày (giờ Bangkok) cho cả site
 *   LEAD_SHEET_ID    — tuỳ chọn: ID Google Sheet; nếu trống sẽ tạo sheet "Vạn Phát Chat Bills"
 *
 * Web App của Apps Script không nhận IP khách. Giới hạn phiên dùng sessionId do trình duyệt gửi.
 * doGet là ping rẻ. keepWarm() chỉ chạm CacheService; installKeepWarmTrigger_ gắn lịch 5 phút.
 */

var PRIMARY_MODEL_DEFAULT = 'grok-4.20-0309-non-reasoning';
var FALLBACK_MODEL_DEFAULT = 'grok-4-1-fast-non-reasoning';
var NON_REASONING_MAX_TOKENS = 450;
var REASONING_MAX_OUTPUT_TOKENS = 700;

var HOTLINE_TEXT = '033 5652 832';
var ZALO_URL = 'https://zalo.me/0335652832';
var HELP_TEXT =
  'Em chưa trả lời được lúc này. Anh/chị gọi hotline ' +
  HOTLINE_TEXT +
  ' hoặc Chat Zalo ' +
  ZALO_URL +
  ' để được tư vấn nhé.';
var LIMIT_TEXT =
  'Em nhận nhiều tin quá rồi. Anh/chị gọi hotline ' +
  HOTLINE_TEXT +
  ' hoặc Chat Zalo ' +
  ZALO_URL +
  ' để được tư vấn tiếp nhé.';

var DEFAULT_SYSTEM_PROMPT =
  'Bạn là trợ lý AI website Vạn Phát. Chỉ tư vấn theo CATALOG đính kèm và thông tin công ty. ' +
  'Không bịa giá, không nêu số tồn. Không tự chốt đơn, không hẹn giao. Photocopy không có giá trên web — chuyển NV. ' +
  'Khi cần NV tư vấn thêm / hàng ngoài catalog: nói lịch sự + dòng [[LEAD]] rồi JSON ' +
  '{"ten":"","sdt":"","nhu_cau":"","san_pham_goi_y":[],"ghi_chu":""}. ' +
  'Hotline 033 5652 832. Chat Zalo https://zalo.me/0335652832. Địa chỉ: LK 19-06 Đường số 20 KĐT Mỹ Gia, Phường Nam Nha Trang. ' +
  'Khi nêu sản phẩm có trong CATALOG, thêm một dòng [[SP: MA1, MA2]] sau phần chữ cho khách và trước [[LEAD]] nếu có — chỉ mã thật, cách nhau bằng dấu phẩy. ' +
  'Giá viết dạng 80.000đ. Dùng **in đậm** và danh sách bắt đầu bằng "- ".';

function doGet() {
  // Ping rẻ: không đọc Sheet, không gọi xAI, không giữ lock.
  return jsonOut_({ ok: true, ping: true, service: 'vanphat-chat', actions: ['chat', 'lead'] });
}

function keepWarm() {
  var cache = CacheService.getScriptCache();
  cache.put('vp-chat-warm', '1', 300);
}

function installKeepWarmTrigger_() {
  var triggers = ScriptApp.getProjectTriggers();
  for (var i = 0; i < triggers.length; i++) {
    if (triggers[i].getHandlerFunction() === 'keepWarm') {
      ScriptApp.deleteTrigger(triggers[i]);
    }
  }
  ScriptApp.newTrigger('keepWarm').timeBased().everyMinutes(5).create();
}

function doPost(e) {
  try {
    var body = {};
    if (e && e.postData && e.postData.contents) {
      body = JSON.parse(e.postData.contents);
    }
    var action = String(body.action || 'chat');

    if (action === 'lead') {
      return handleLead_(body.bill || {});
    }
    return handleChat_(body);
  } catch (err) {
    return jsonOut_({ ok: true, reply: HELP_TEXT, degraded: true });
  }
}

function handleChat_(body) {
  var message = String(body.message || '').trim();
  if (!message) return jsonOut_({ ok: false, error: 'Thiếu message' });
  if (message.length > 2000) return jsonOut_({ ok: false, error: 'Tin nhắn quá dài' });

  var history = Array.isArray(body.history) ? body.history.slice(-6) : [];
  var catalogContext = String(body.catalogContext || '').slice(0, 6000);
  var limited = reserveChatSlot_(body.sessionId);
  if (!limited.ok) {
    return jsonOut_({ ok: true, reply: LIMIT_TEXT, degraded: true, limited: true });
  }

  var result = callGrokWithFallback_(message, history, catalogContext);
  if (!result.text) {
    return jsonOut_({ ok: true, reply: HELP_TEXT, degraded: true });
  }
  var needLead = result.text.indexOf('[[LEAD]]') !== -1;
  return jsonOut_({
    ok: true,
    reply: result.text,
    model: result.model,
    needLead: needLead
  });
}

function handleLead_(bill) {
  var sdt = String(bill.sdt || '').replace(/\s+/g, '');
  if (!/^0\d{8,10}$/.test(sdt)) {
    return jsonOut_({ ok: false, error: 'SĐT không hợp lệ' });
  }

  var sheet = getLeadSheet_();
  var now = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd HH:mm:ss');
  var sp = Array.isArray(bill.san_pham_goi_y) ? bill.san_pham_goi_y.join(', ') : String(bill.san_pham_goi_y || '');
  var transcript = '';
  if (Array.isArray(bill.transcript)) {
    transcript = bill.transcript
      .map(function (t) {
        return (t.role || '') + ': ' + String(t.text || '').slice(0, 200);
      })
      .join('\n')
      .slice(0, 3000);
  }

  sheet.appendRow([
    now,
    String(bill.ten || ''),
    sdt,
    String(bill.nhu_cau || ''),
    sp,
    String(bill.ghi_chu || ''),
    transcript,
    'MỚI'
  ]);

  return jsonOut_({ ok: true, saved: true });
}

function getLeadSheet_() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('LEAD_SHEET_ID');
  var ss;
  if (id) {
    ss = SpreadsheetApp.openById(id);
  } else {
    ss = SpreadsheetApp.create('Vạn Phát Chat Bills');
    props.setProperty('LEAD_SHEET_ID', ss.getId());
    var sh0 = ss.getActiveSheet();
    sh0.setName('Bills');
    sh0.appendRow(['Thời gian', 'Tên', 'SĐT', 'Nhu cầu', 'SP gợi ý', 'Ghi chú', 'Transcript', 'Trạng thái']);
  }
  var sh = ss.getSheetByName('Bills') || ss.getSheets()[0];
  if (sh.getLastRow() === 0) {
    sh.appendRow(['Thời gian', 'Tên', 'SĐT', 'Nhu cầu', 'SP gợi ý', 'Ghi chú', 'Transcript', 'Trạng thái']);
  }
  return sh;
}

function callGrokWithFallback_(message, history, catalogContext) {
  var props = PropertiesService.getScriptProperties();
  var apiKey = props.getProperty('XAI_API_KEY');
  if (!apiKey) return { text: HELP_TEXT, model: '' };

  var systemPrompt = props.getProperty('SYSTEM_PROMPT') || DEFAULT_SYSTEM_PROMPT;
  var primary = String(props.getProperty('PRIMARY_MODEL') || PRIMARY_MODEL_DEFAULT).trim();
  var fallback = fallbackModel_(props.getProperty('FALLBACK_MODEL'), primary);
  var userPayload =
    'CATALOG (chỉ dùng dữ liệu này cho mã, tên, đơn vị và giá. Không nêu số tồn):\n' +
    catalogContext +
    '\n\nCâu khách:\n' +
    message;

  try {
    return {
      text: generateContent_(apiKey, primary, systemPrompt, userPayload, history),
      model: primary
    };
  } catch (err1) {
    if (!fallback || !isClearGrokFailure_(err1)) {
      return { text: HELP_TEXT, model: '' };
    }
    try {
      return {
        text: generateContent_(apiKey, fallback, systemPrompt, userPayload, history),
        model: fallback
      };
    } catch (err2) {
      return { text: HELP_TEXT, model: '' };
    }
  }
}

function fallbackModel_(configured, primary) {
  var name = String(configured || '').trim() || FALLBACK_MODEL_DEFAULT;
  // Đúng id grok-4 (không hậu tố) là model chậm. Không đưa vào chuỗi dự phòng.
  if (name === 'grok-4') name = FALLBACK_MODEL_DEFAULT;
  if (!name || name === primary) return '';
  return name;
}

function isClearGrokFailure_(err) {
  var msg = String((err && err.message) || err || '');
  if (msg.indexOf('Grok network') === 0) return true;
  var http = msg.match(/^Grok HTTP (\d+)/);
  if (!http) return false;
  var code = parseInt(http[1], 10);
  return code >= 400 && code <= 599;
}

function usesResponsesApi_(model) {
  var name = String(model || '');
  if (/non-reasoning/i.test(name)) return false;
  // grok-4.7 (và grok-4.5 / grok-4.6) suy luận trên /v1/responses.
  // grok-4.20-...-non-reasoning đã loại ở trên, không đi cổng này.
  return /^grok-4\.(?:5|6|7)(?:$|[^0-9])/.test(name);
}

function chatMessages_(systemPrompt, message, history) {
  var messages = [{ role: 'system', content: systemPrompt }];
  for (var i = 0; i < history.length; i++) {
    var h = history[i];
    if (!h || !h.role || !h.text) continue;
    var role = h.role === 'model' || h.role === 'assistant' ? 'assistant' : 'user';
    messages.push({ role: role, content: String(h.text).slice(0, 1500) });
  }
  messages.push({ role: 'user', content: message });
  return messages;
}

function generateContent_(apiKey, model, systemPrompt, message, history) {
  if (usesResponsesApi_(model)) return generateResponses_(apiKey, model, systemPrompt, message, history);
  return generateChatCompletions_(apiKey, model, systemPrompt, message, history);
}

function generateResponses_(apiKey, model, systemPrompt, message, history) {
  var payload = {
    model: model,
    input: chatMessages_(systemPrompt, message, history),
    reasoning: { effort: 'low' },
    max_output_tokens: REASONING_MAX_OUTPUT_TOKENS,
    store: false,
    stream: false
  };
  var data = postXai_('https://api.x.ai/v1/responses', apiKey, payload);
  var text = textFromResponses_(data);
  if (!text) throw new Error('Empty Grok response');
  return text;
}

function generateChatCompletions_(apiKey, model, systemPrompt, message, history) {
  var payload = {
    model: model,
    messages: chatMessages_(systemPrompt, message, history),
    temperature: 0.3,
    max_tokens: NON_REASONING_MAX_TOKENS,
    stream: false
  };
  var data = postXai_('https://api.x.ai/v1/chat/completions', apiKey, payload);
  var text =
    data &&
    data.choices &&
    data.choices[0] &&
    data.choices[0].message &&
    data.choices[0].message.content;
  if (!text) throw new Error('Empty Grok response');
  return String(text).trim();
}

function postXai_(url, apiKey, payload) {
  var res;
  try {
    res = UrlFetchApp.fetch(url, {
      method: 'post',
      contentType: 'application/json',
      headers: { Authorization: 'Bearer ' + apiKey },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true
    });
  } catch (err) {
    throw new Error('Grok network');
  }
  var code = res.getResponseCode();
  if (code < 200 || code >= 300) throw new Error('Grok HTTP ' + code);
  try {
    return JSON.parse(res.getContentText() || '{}');
  } catch (err) {
    throw new Error('Grok bad JSON');
  }
}

function textFromResponses_(data) {
  if (data && data.output_text) return String(data.output_text).trim();
  var output = data && data.output;
  if (!output || !output.length) return '';
  var parts = [];
  for (var i = 0; i < output.length; i++) {
    var item = output[i];
    if (!item || item.type !== 'message' || !item.content) continue;
    for (var j = 0; j < item.content.length; j++) {
      var block = item.content[j];
      if (block && (block.type === 'output_text' || block.type === 'text') && block.text) {
        parts.push(block.text);
      }
    }
  }
  return parts.join('\n').trim();
}

function reserveChatSlot_(sessionId) {
  var day = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd');
  var minute = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMddHHmm');
  var session = sessionKey_(sessionId);
  if (!bumpCache_('cm:' + session + ':' + minute, 10, 120)) return { ok: false };
  // CacheService giữ tối đa 6 giờ. Khóa có ngày để sang ngày mới thì đếm lại.
  if (!bumpCache_('cd:' + session + ':' + day, 60, 21600)) return { ok: false };
  if (!bumpGlobalDay_(day, dailyCap_())) return { ok: false };
  return { ok: true };
}

function dailyCap_() {
  var raw = PropertiesService.getScriptProperties().getProperty('DAILY_CAP');
  var cap = parseInt(raw || '2000', 10);
  if (!cap || cap < 1) return 2000;
  return cap;
}

function sessionKey_(raw) {
  var cleaned = String(raw || 'anon').replace(/[^A-Za-z0-9_-]/g, '').slice(0, 64);
  return cleaned || 'anon';
}

function bumpCache_(key, limit, ttl) {
  var cache = CacheService.getScriptCache();
  var count = parseInt(cache.get(key) || '0', 10);
  if (count >= limit) return false;
  cache.put(key, String(count + 1), ttl);
  return true;
}

function bumpGlobalDay_(day, cap) {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(3000);
  } catch (err) {
    return true;
  }
  try {
    var props = PropertiesService.getScriptProperties();
    var storedDay = props.getProperty('CHAT_USAGE_DAY') || '';
    var count = storedDay === day ? parseInt(props.getProperty('CHAT_USAGE_COUNT') || '0', 10) : 0;
    if (count >= cap) return false;
    props.setProperties(
      {
        CHAT_USAGE_DAY: day,
        CHAT_USAGE_COUNT: String(count + 1)
      },
      false
    );
    return true;
  } finally {
    lock.releaseLock();
  }
}

function jsonOut_(obj) {
  var out = ContentService.createTextOutput(JSON.stringify(obj));
  out.setMimeType(ContentService.MimeType.JSON);
  return out;
}

function setChatSecrets_(apiKey, systemPrompt) {
  var props = PropertiesService.getScriptProperties();
  var map = {
    XAI_API_KEY: apiKey,
    PRIMARY_MODEL: PRIMARY_MODEL_DEFAULT,
    FALLBACK_MODEL: FALLBACK_MODEL_DEFAULT
  };
  if (!props.getProperty('DAILY_CAP')) map.DAILY_CAP = '2000';
  if (systemPrompt) map.SYSTEM_PROMPT = systemPrompt;
  props.setProperties(map, false);
}
