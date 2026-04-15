# ZaloCRM v2.0 — Quản lý nhiều tài khoản Zalo cá nhân

Hệ thống quản lý tập trung nhiều tài khoản Zalo cá nhân trên 1 giao diện web. Chat real-time, AI assistant, workflow tự động, tích hợp đa nền tảng, analytics nâng cao, PWA mobile.

**GitHub:** [https://github.com/locphamnguyen/ZaloCRM-Fork](https://github.com/locphamnguyen/ZaloCRM-Fork)

## Tính năng

### Cốt lõi (v1.0)
- **Quản lý nhiều Zalo** — Đăng nhập QR, tự kết nối lại, lưu phiên đăng nhập
- **Chat real-time** — Gửi/nhận tin nhắn, ảnh, file, sticker, nhóm chat
- **Quản lý khách hàng** — Pipeline (Mới → Đã liên hệ → Quan tâm → Chuyển đổi → Mất)
- **Lịch hẹn** — Tạo, theo dõi, nhắc nhở tự động hàng ngày
- **Dashboard** — Biểu đồ tin nhắn, KPI, nguồn khách hàng, trạng thái pipeline
- **Báo cáo** — Xuất Excel, lọc theo thời gian
- **Phân quyền** — Owner / Admin / Member, quản lý đội nhóm, phân quyền Zalo
- **API công khai** — REST API với xác thực API key cho tích hợp bên ngoài
- **Webhook** — Nhận thông báo khi có tin nhắn mới, khách hàng mới, Zalo kết nối/ngắt
- **Chống block Zalo** — Giới hạn 200 tin/ngày, phát hiện gửi quá nhanh
- **Thông báo** — Tin chưa trả lời >30 phút, lịch hẹn sắp tới, Zalo mất kết nối
- **Tìm kiếm toàn hệ thống** — Tìm khách hàng, tin nhắn, lịch hẹn
- **Giao diện** — Theme tối/sáng, thiết kế Liquid Silicon

### Mới trong v2.0

- **🤖 AI Assistant** — Gợi ý trả lời, tóm tắt hội thoại, phân tích cảm xúc khách hàng
- **⚡ Workflow Automation** — Tự động gửi tin nhắn, phân loại khách hàng, trigger theo sự kiện
- **🔗 Integration Hub** — Tích hợp Google Sheets, Telegram, Facebook, Zapier
- **📱 Mobile PWA** — Giao diện responsive, hoạt động offline, cài đặt trên điện thoại
- **🧠 Contact Intelligence** — Gộp trùng khách hàng, lead scoring, auto-tag
- **📊 Advanced Analytics** — Phân tích funnel, hiệu suất team, thời gian phản hồi, report builder
- **🔧 Multi-Provider AI** — Hỗ trợ Anthropic, OpenAI, Qwen, Kimi với cấu hình linh hoạt
- **🌐 Proxy per-account** — Cấu hình proxy HTTP riêng cho từng tài khoản Zalo, tránh block IP
- **🐛 Fix: Tin nhắn trùng lặp** — Loại bỏ tin nhắn hiển thị trùng khi gửi

## Yêu cầu hệ thống

| Thành phần | Tối thiểu | Khuyến nghị |
|-----------|----------|------------|
| CPU | 1 vCPU | 2-4 vCPU |
| RAM | 1 GB | 4 GB |
| Ổ cứng | 10 GB | 20 GB SSD |
| Hệ điều hành | Ubuntu 20.04+ | Ubuntu 22.04 LTS |
| Phần mềm | Docker + Docker Compose | Docker 24+ |

## Cài đặt nhanh

> Hướng dẫn chi tiết: [HUONG-DAN-CAI-DAT.md](HUONG-DAN-CAI-DAT.md)

```bash
git clone https://github.com/locphamnguyen/ZaloCRM-Fork.git
cd ZaloCRM-Fork
cp .env.example .env
# Sửa file .env — đặt mật khẩu và secret keys
docker compose up -d --build
```

Truy cập **http://IP-server:3080** → Tạo tài khoản admin lần đầu.

## Công nghệ sử dụng

| Thành phần | Công nghệ |
|-----------|----------|
| Backend | Node.js 20 / Fastify 5 / Prisma 7 |
| Frontend | Vue 3 / Vuetify 3 / Chart.js / Pinia |
| AI | Anthropic Claude / OpenAI / Qwen / Kimi |
| Cơ sở dữ liệu | PostgreSQL 16 |
| Real-time | Socket.IO |
| Zalo | zca-js 2.x |
| Mobile | PWA (Service Worker + Web App Manifest) |
| Triển khai | Docker Compose |

## API & Webhook

> Hướng dẫn chi tiết: [HUONG-DAN-SU-DUNG.md](HUONG-DAN-SU-DUNG.md)

### Xác thực API
```
Header: X-API-Key: your-api-key
```

### Endpoint chính

| Phương thức | Đường dẫn | Mô tả |
|------------|----------|-------|
| GET | `/api/public/contacts` | Danh sách khách hàng |
| POST | `/api/public/contacts` | Tạo khách hàng mới |
| POST | `/api/public/messages/send` | Gửi tin nhắn |
| GET | `/api/public/appointments` | Danh sách lịch hẹn |

### Sự kiện Webhook

| Sự kiện | Mô tả |
|---------|-------|
| `message.received` | Tin nhắn mới đến |
| `message.sent` | Tin nhắn gửi đi |
| `contact.created` | Khách hàng mới |
| `zalo.connected` | Zalo kết nối |
| `zalo.disconnected` | Zalo mất kết nối |

## Lịch sử phiên bản

### v2.0 (31/03/2026)
- AI Assistant: gợi ý trả lời, tóm tắt, phân tích cảm xúc
- Workflow Automation: tự động gửi tin, phân loại khách
- Integration Hub: Google Sheets, Telegram, Facebook, Zapier
- Mobile PWA: offline, responsive, installable
- Contact Intelligence: gộp trùng, lead scoring, auto-tag
- Advanced Analytics: funnel, team perf, report builder
- Multi-Provider AI: Anthropic, OpenAI, Qwen, Kimi
- Proxy per-account: cấu hình proxy riêng cho từng Zalo
- Fix: loại bỏ tin nhắn hiển thị trùng

### v1.0 (29/03/2026)
- MVP: Quản lý nhiều Zalo, chat, CRM, lịch hẹn, dashboard, báo cáo, API, webhook

## Giấy phép

MIT — Miễn phí sử dụng và chỉnh sửa.
