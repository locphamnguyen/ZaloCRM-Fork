# Hướng dẫn sử dụng ZaloCRM v2.0

## Mục lục

1. [Đăng nhập](#1-đăng-nhập)
2. [Kết nối Zalo](#2-kết-nối-zalo)
3. [Chat với khách hàng](#3-chat-với-khách-hàng)
4. [AI Assistant](#4-ai-assistant)
5. [Workflow Automation](#5-workflow-automation)
6. [Integration Hub](#6-integration-hub)
7. [Quản lý khách hàng](#7-quản-lý-khách-hàng)
8. [Contact Intelligence](#8-contact-intelligence)
9. [Lịch hẹn](#9-lịch-hẹn)
10. [Dashboard & Analytics](#10-dashboard--analytics)
11. [Quản lý nhân viên](#11-quản-lý-nhân-viên)
12. [Proxy per-account](#12-proxy-per-account)
13. [Mobile PWA](#13-mobile-pwa)
14. [API & Webhook](#14-api--webhook)
15. [Câu hỏi thường gặp](#15-câu-hỏi-thường-gặp)
16. [Quy tắc quan trọng](#16-quy-tắc-quan-trọng)

---

## 1. Đăng nhập

1. Mở trình duyệt → vào địa chỉ hệ thống
2. Nhập **Email** và **Mật khẩu** → nhấn **Đăng nhập**
3. Chọn theme tối/sáng bằng biểu tượng ☀️/🌙 trên thanh trên cùng

---

## 2. Kết nối Zalo

### Thêm tài khoản Zalo

1. Vào menu **Tài khoản Zalo**
2. Nhấn **Thêm Zalo** → đặt tên (VD: "Sale Hương")
3. (Tùy chọn) Nhập **Proxy URL** nếu muốn dùng proxy riêng cho tài khoản này
4. Nhấn biểu tượng **QR** → mã QR hiện trên màn hình
5. Mở **Zalo trên điện thoại** → quét mã QR
6. Xác nhận trên điện thoại → trạng thái chuyển sang **Đã kết nối** (xanh)

### Đồng bộ danh bạ

- Nhấn biểu tượng **đồng bộ** (👥↻) bên cạnh tài khoản
- Tất cả bạn bè Zalo sẽ được nhập vào danh sách Khách hàng

### Phân quyền truy cập

- Nhấn biểu tượng **khiên** (🛡️) → chọn nhân viên + quyền
- **Xem:** chỉ xem tin nhắn
- **Chat:** được phép gửi tin nhắn
- **Quản lý:** toàn quyền trên tài khoản Zalo này

> ⚠️ **Lưu ý:** KHÔNG mở Zalo Web trên trình duyệt khi đang dùng hệ thống

---

## 3. Chat với khách hàng

### Giao diện

Giao diện chat chia 3 cột (kéo thả để thay đổi kích thước):

| Cột trái | Cột giữa | Cột phải |
|----------|----------|----------|
| Danh sách hội thoại | Nội dung tin nhắn | Thông tin khách hàng |
| Lọc theo Zalo | Gửi tin nhắn | Lưu thông tin CRM |
| Tìm kiếm | Xem ảnh/file | Lịch hẹn |

### Gửi tin nhắn

1. Chọn cuộc trò chuyện bên trái
2. Gõ tin nhắn vào ô dưới cùng
3. Nhấn **Enter** để gửi
4. **Shift + Enter** = xuống dòng

### Xem ảnh và file

- **Ảnh:** hiển thị trực tiếp → nhấn để phóng to
- **File/PDF:** hiện thẻ tên file + dung lượng → nhấn để tải
- **Nhắc hẹn Zalo:** hiện thẻ 📅 với thời gian → nhấn **Đồng bộ lịch**

### Lọc theo Zalo

- Ở đầu danh sách hội thoại → chọn **tên Zalo cụ thể**
- Chọn "Tất cả Zalo" để xem toàn bộ

### Cập nhật thông tin khách hàng

1. Nhấn biểu tượng **👤** (góc phải header chat) → panel thông tin mở ra
2. Điền: Họ tên, SĐT, Email, Nguồn, Trạng thái, Ngày tiếp nhận, Ghi chú, Tags
3. Nhấn **Lưu thông tin**
4. Dữ liệu tự động đồng bộ sang tab **Khách hàng**

### Tạo lịch hẹn từ chat

1. Trong panel thông tin → mục **Lịch hẹn**
2. Nhấn **+** → điền ngày, giờ, ghi chú → **Tạo lịch hẹn**

---

## 4. AI Assistant

> [PR #1](https://github.com/locphamnguyen/zalocrm/pull/1) · [PR #8](https://github.com/locphamnguyen/zalocrm/pull/8)

### Gợi ý trả lời

1. Trong cửa sổ chat → nhấn biểu tượng **🤖 AI** bên cạnh ô soạn tin
2. AI phân tích hội thoại và đề xuất 2-3 câu trả lời phù hợp
3. Nhấn chọn gợi ý → nội dung tự điền vào ô soạn → chỉnh sửa nếu cần → gửi

### Tóm tắt hội thoại

1. Trong cửa sổ chat → nhấn **Tóm tắt**
2. AI tóm tắt nội dung cuộc trò chuyện: chủ đề, yêu cầu, trạng thái

### Phân tích cảm xúc

- AI tự động đánh giá cảm xúc khách hàng (tích cực / trung lập / tiêu cực)
- Hiển thị indicator bên cạnh tên khách hàng trong danh sách chat

### Cấu hình AI Provider

Hỗ trợ nhiều nhà cung cấp AI ([PR #8](https://github.com/locphamnguyen/zalocrm/pull/8)):

| Provider | Model mẫu |
|----------|-----------|
| **Anthropic** | claude-sonnet-4-20250514 |
| **OpenAI** | gpt-4o |
| **Qwen** | qwen-plus |
| **Kimi** | moonshot-v1-8k |

Cấu hình trong file `.env`:
```
AI_PROVIDER=anthropic
AI_API_KEY=sk-xxx
AI_MODEL=claude-sonnet-4-20250514
```

---

## 5. Workflow Automation

> [PR #2](https://github.com/locphamnguyen/zalocrm/pull/2)

### Tạo workflow

1. Vào menu **Workflows**
2. Nhấn **Tạo Workflow mới**
3. Chọn **trigger** (sự kiện kích hoạt):
   - Tin nhắn mới đến
   - Khách hàng mới
   - Thay đổi trạng thái pipeline
   - Lịch hẹn sắp tới
4. Thêm **actions** (hành động):
   - Gửi tin nhắn tự động
   - Phân loại khách hàng
   - Gán nhân viên phụ trách
   - Gửi thông báo
5. Nhấn **Lưu & Kích hoạt**

### Ví dụ workflow

- **Chào mừng tự động:** Khi có tin nhắn mới từ người lạ → gửi tin chào mừng
- **Phân loại tự động:** Khi khách nhắn từ khoá "giá" → chuyển sang trạng thái "Quan tâm"
- **Nhắc follow-up:** Khi khách không trả lời 24h → thông báo cho nhân viên

---

## 6. Integration Hub

> [PR #3](https://github.com/locphamnguyen/zalocrm/pull/3)

### Kết nối Google Sheets

1. Vào **Tích hợp** → **Google Sheets**
2. Nhập Google Sheets ID và Service Account JSON
3. Chọn dữ liệu đồng bộ: Khách hàng / Tin nhắn / Lịch hẹn
4. Cấu hình lịch đồng bộ (realtime hoặc theo giờ)

### Kết nối Telegram

1. Vào **Tích hợp** → **Telegram**
2. Nhập Bot Token từ @BotFather
3. Nhập Chat ID nhóm/kênh nhận thông báo
4. Chọn sự kiện cần thông báo

### Kết nối Facebook

1. Vào **Tích hợp** → **Facebook**
2. Kết nối Facebook Page qua OAuth
3. Tin nhắn từ Facebook Messenger hiển thị chung trong giao diện chat

### Zapier

1. Vào **Tích hợp** → **Zapier**
2. Copy Webhook URL
3. Tạo Zap trên Zapier với trigger là webhook URL này

---

## 7. Quản lý khách hàng

Vào menu **Khách hàng**

### Xem danh sách

- Bảng hiển thị: Tên, SĐT, Email, Nguồn, Trạng thái, Ngày tiếp nhận
- **Tìm kiếm:** gõ tên hoặc SĐT
- **Lọc:** chọn Nguồn hoặc Trạng thái

### Pipeline khách hàng

| Trạng thái | Ý nghĩa | Màu |
|-----------|---------|-----|
| **Mới** | Khách hàng mới, chưa liên hệ | Xám |
| **Đã liên hệ** | Đã liên hệ lần đầu | Xanh dương |
| **Quan tâm** | Khách quan tâm sản phẩm/dịch vụ | Cam |
| **Chuyển đổi** | Đã mua/sử dụng dịch vụ | Xanh lá |
| **Mất** | Không còn quan tâm | Đỏ |

### Thêm khách hàng

1. Nhấn **Thêm KH** → điền thông tin → **Lưu**

### Sửa thông tin

1. Nhấn vào dòng khách hàng → dialog chi tiết mở ra
2. Sửa bất kỳ trường nào → **Lưu**

---

## 8. Contact Intelligence

> [PR #5](https://github.com/locphamnguyen/zalocrm/pull/5)

### Gộp trùng khách hàng (Dedup)

1. Vào **Khách hàng** → nhấn **Gộp trùng**
2. Hệ thống quét tự động dựa trên SĐT, email, tên Zalo
3. Xem danh sách cặp trùng → nhấn **Gộp** hoặc **Bỏ qua**

### Lead Scoring

- Hệ thống tự chấm điểm khách hàng dựa trên:
  - Tần suất nhắn tin
  - Thời gian phản hồi
  - Từ khoá trong hội thoại
  - Lịch sử tương tác
- Điểm hiển thị bên cạnh tên khách hàng (🔥 nóng / 🟡 ấm / 🔵 lạnh)

### Auto-tag

- AI tự gán tag cho khách hàng dựa trên nội dung hội thoại
- VD: "quan tâm giá", "cần tư vấn", "khách VIP", "hỏi bảo hành"

---

## 9. Lịch hẹn

Vào menu **Lịch hẹn**

### 3 tab xem

| Tab | Hiển thị |
|-----|---------|
| **Hôm nay** | Lịch hẹn trong ngày |
| **Sắp tới** | 7 ngày tiếp theo |
| **Tất cả** | Toàn bộ lịch hẹn |

### Tạo lịch hẹn

1. Nhấn **Tạo lịch hẹn**
2. Chọn khách hàng, ngày, giờ, loại
3. Ghi chú (nếu có) → **Tạo**

### Cập nhật nhanh

| Nút | Hành động |
|-----|----------|
| ✅ | Đánh dấu **Hoàn thành** |
| ❌ | **Huỷ** lịch hẹn |
| ✏️ | Sửa ngày/giờ/ghi chú |

### Nhắc nhở tự động

- Hệ thống tự kiểm tra lịch hẹn **ngày mai** lúc 8:00 sáng
- Thông báo hiện trong chuông 🔔 trên thanh trên cùng

---

## 10. Dashboard & Analytics

### Dashboard (trang chủ)

6 ô thống kê:
- Tin nhắn hôm nay | Chưa trả lời | Chưa đọc
- Lịch hẹn hôm nay | Khách mới tuần này | Tổng khách hàng

Biểu đồ:
- Tin nhắn gửi/nhận theo ngày (30 ngày)
- Pipeline khách hàng (biểu đồ tròn)
- Nguồn khách hàng (biểu đồ tròn)

### Advanced Analytics ([PR #6](https://github.com/locphamnguyen/zalocrm/pull/6))

Vào menu **Analytics** để xem:

| Báo cáo | Mô tả |
|---------|-------|
| **Funnel Analysis** | Phân tích chuyển đổi qua từng giai đoạn pipeline |
| **Team Performance** | Hiệu suất từng nhân viên: tin nhắn, thời gian phản hồi, tỷ lệ chuyển đổi |
| **Response Time** | Thời gian phản hồi trung bình theo giờ/ngày/tuần |
| **Report Builder** | Tự tạo báo cáo tuỳ chỉnh với bộ lọc linh hoạt |

### Xuất báo cáo

1. Vào menu **Báo cáo**
2. Chọn **khoảng thời gian** (từ ngày – đến ngày)
3. Chọn tab: **Tin nhắn** / **Khách hàng** / **Lịch hẹn**
4. Nhấn **Xuất Excel** → tải file .xlsx về máy

---

## 11. Quản lý nhân viên

Vào menu **Nhân viên** (chỉ Admin/Owner)

### Vai trò

| Vai trò | Quyền |
|---------|-------|
| **Owner** | Toàn quyền, quản lý admin |
| **Admin** | Quản lý nhân viên, Zalo, khách hàng |
| **Member** | Chỉ xem Zalo được phân quyền |

### Thêm nhân viên

1. Tab **Nhân viên** → nhấn **Thêm nhân viên**
2. Nhập: Email, Họ tên, Mật khẩu, Vai trò → **Tạo**

### Đội nhóm

1. Tab **Đội nhóm** → **Thêm đội nhóm** → đặt tên
2. Mở rộng đội nhóm → **Thêm thành viên**

---

## 12. Proxy per-account

> [PR #9](https://github.com/locphamnguyen/zalocrm/pull/9)

Cấu hình proxy HTTP riêng cho từng tài khoản Zalo để tránh bị Zalo block IP khi dùng nhiều tài khoản trên cùng server.

### Thêm proxy khi tạo tài khoản

1. Vào **Tài khoản Zalo** → **Thêm Zalo**
2. Nhập tên tài khoản
3. Nhập **Proxy URL** (VD: `http://user:pass@proxy.example.com:8080`)
4. Nhấn **Thêm**

### Sửa proxy cho tài khoản đã có

1. Vào **Tài khoản Zalo**
2. Nhấn biểu tượng **🌐** bên cạnh tài khoản
3. Nhập/sửa Proxy URL → nhấn **Lưu**
4. Hoặc nhấn **Xoá Proxy** để kết nối trực tiếp

### Trạng thái proxy

- Cột **Proxy** trong bảng hiển thị:
  - **Proxy** (chip xanh): tài khoản đang dùng proxy
  - **Trực tiếp**: kết nối trực tiếp, không qua proxy

### Lưu ý

- Chỉ hỗ trợ proxy HTTP/HTTPS
- Proxy áp dụng khi đăng nhập QR và kết nối lại
- Nếu proxy không hoạt động, đăng nhập sẽ thất bại — kiểm tra lại URL proxy
- Mật khẩu proxy được ẩn trong giao diện (hiển thị `***`)

---

## 13. Mobile PWA

> [PR #4](https://github.com/locphamnguyen/zalocrm/pull/4)

### Cài đặt trên điện thoại

**iPhone (Safari):**
1. Mở ZaloCRM trên Safari
2. Nhấn biểu tượng **Chia sẻ** (hình vuông + mũi tên lên)
3. Chọn **Thêm vào Màn hình chính**
4. Nhấn **Thêm**

**Android (Chrome):**
1. Mở ZaloCRM trên Chrome
2. Nhấn **⋮** (menu 3 chấm) → **Cài đặt ứng dụng** hoặc **Thêm vào màn hình chính**
3. Nhấn **Cài đặt**

### Tính năng mobile

- Giao diện responsive tự động co giãn theo màn hình
- Hỗ trợ offline — xem dữ liệu đã tải khi mất mạng
- Push notification (nếu trình duyệt hỗ trợ)
- Hoạt động như ứng dụng native — không cần mở trình duyệt

---

## 14. API & Webhook

Dành cho lập trình viên muốn tích hợp ZaloCRM với hệ thống khác.

### Tạo API Key

1. Vào menu **API & Webhook**
2. Nhấn **Tạo key mới** → copy API key
3. Sử dụng trong header: `X-API-Key: your-key`

### Cấu hình Webhook

1. Nhập **Webhook URL** (địa chỉ server nhận thông báo)
2. Nhập **Secret** (mã bí mật để xác thực)
3. Nhấn **Lưu** → nhấn **Test Webhook** để kiểm tra

### Sự kiện Webhook

| Sự kiện | Mô tả |
|---------|-------|
| `message.received` | Tin nhắn mới đến |
| `message.sent` | Tin nhắn gửi đi |
| `contact.created` | Khách hàng mới |
| `zalo.connected` | Zalo kết nối |
| `zalo.disconnected` | Zalo mất kết nối |

### Ví dụ sử dụng API

```bash
# Lấy danh sách khách hàng
curl -H "X-API-Key: your-key" https://your-domain/api/public/contacts

# Tạo khách hàng mới
curl -X POST -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"fullName":"Nguyễn Văn A","phone":"0901234567","source":"FB"}' \
  https://your-domain/api/public/contacts

# Gửi tin nhắn
curl -X POST -H "X-API-Key: your-key" -H "Content-Type: application/json" \
  -d '{"zaloAccountId":"abc","threadId":"xyz","content":"Xin chào!","threadType":0}' \
  https://your-domain/api/public/messages/send
```

---

## 15. Câu hỏi thường gặp

### "Zalo bị ngắt kết nối?"

Hệ thống tự kết nối lại trong 30 giây. Nếu không được → vào **Tài khoản Zalo** → quét QR lại.

### "Tin nhắn không gửi được?"

Kiểm tra trạng thái Zalo (phải xanh lá). Nếu hiện "Gửi quá nhanh" → đợi 30 giây.

### "Không thấy tin nhắn cũ?"

Hệ thống chỉ lưu tin nhắn từ lúc kết nối Zalo. Tin nhắn trước đó không có.

### "Lịch hẹn bị trùng?"

Hệ thống tự phát hiện — nếu cùng khách hàng + cùng ngày → báo lỗi.

### "Quên mật khẩu?"

Liên hệ Admin/Owner để reset mật khẩu trong **Cài đặt → Nhân viên**.

### "AI không trả lời?"

Kiểm tra cấu hình AI trong `.env` — đảm bảo `AI_API_KEY` đúng và provider có kết nối internet. Xem chi tiết tại [HUONG-DAN-CAI-DAT.md](HUONG-DAN-CAI-DAT.md#bước-5-cấu-hình-ai-tuỳ-chọn).

### "Proxy không hoạt động?"

Kiểm tra URL proxy đúng định dạng `http://host:port` hoặc `http://user:pass@host:port`. Đảm bảo proxy server đang chạy và cho phép kết nối từ server ZaloCRM.

---

## 16. Quy tắc quan trọng

### ❌ KHÔNG làm

1. **KHÔNG mở Zalo Web** trên trình duyệt khi dùng hệ thống
2. **KHÔNG gửi tin spam** (cùng nội dung cho nhiều người)
3. **KHÔNG gửi tin cho người lạ** (không phải bạn bè Zalo)
4. **KHÔNG gửi quá 200 tin/ngày** trên 1 tài khoản Zalo
5. **KHÔNG chia sẻ mật khẩu** cho người khác

### ✅ NÊN làm

1. **Cập nhật thông tin** khách hàng đầy đủ (SĐT, trạng thái)
2. **Trả lời tin nhắn** trong vòng 30 phút
3. **Ghi chú lịch hẹn** ngay khi hẹn khách
4. **Đồng bộ danh bạ** Zalo khi thêm bạn mới
5. **Kiểm tra Dashboard** mỗi sáng
6. **Dùng AI gợi ý** để trả lời nhanh và chuyên nghiệp hơn
7. **Cấu hình proxy** riêng cho từng Zalo nếu chạy nhiều tài khoản
8. **Cài PWA** trên điện thoại để nhận thông báo kịp thời
