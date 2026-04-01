# Hướng dẫn cài đặt ZaloCRM v2.0

**GitHub:** [https://github.com/locphamnguyen/zalocrm](https://github.com/locphamnguyen/zalocrm)

## Bước 1: Chuẩn bị VPS

Bạn cần 1 VPS (máy chủ ảo) chạy Linux. Có thể dùng:
- DigitalOcean, Vultr, Linode, AWS, Google Cloud, hoặc VPS Việt Nam

**Cấu hình tối thiểu:** 1 vCPU, 1 GB RAM, 10 GB ổ cứng

### Cài Docker (nếu chưa có)

Đăng nhập VPS qua SSH, chạy lệnh:

```bash
# Cài Docker
curl -fsSL https://get.docker.com | sudo sh

# Cho phép user hiện tại dùng Docker (không cần sudo)
sudo usermod -aG docker $USER

# Đăng xuất rồi đăng nhập lại để có hiệu lực
exit
# SSH lại vào VPS

# Kiểm tra Docker đã cài thành công
docker --version
docker compose version
```

## Bước 2: Tải mã nguồn

```bash
# Tải ZaloCRM từ GitHub
git clone https://github.com/locphamnguyen/zalocrm.git

# Vào thư mục dự án
cd zalocrm
```

## Bước 3: Cấu hình

```bash
# Tạo file cấu hình từ mẫu
cp .env.example .env
```

Mở file `.env` để sửa:

```bash
nano .env
```

### Cấu hình bắt buộc

```
# Mật khẩu database — đặt bất kỳ (nhớ giữ bí mật)
DB_PASSWORD=matkhau_cua_ban_o_day

# Secret keys — chạy lệnh bên dưới để tạo giá trị ngẫu nhiên
JWT_SECRET=     # Dán kết quả lệnh: openssl rand -hex 32
ENCRYPTION_KEY= # Dán kết quả lệnh: openssl rand -hex 16

# URL công khai (nếu có domain)
APP_URL=https://ten-domain-cua-ban.com
```

### Cấu hình AI Assistant (tuỳ chọn)

ZaloCRM hỗ trợ nhiều nhà cung cấp AI. Chọn 1 trong các tùy chọn:

```
# --- Anthropic (Claude) ---
AI_PROVIDER=anthropic
AI_API_KEY=sk-ant-...
AI_MODEL=claude-sonnet-4-20250514

# --- OpenAI ---
AI_PROVIDER=openai
AI_API_KEY=sk-...
AI_MODEL=gpt-4o
AI_BASE_URL=https://api.openai.com/v1    # Tuỳ chọn, mặc định OpenAI

# --- Qwen ---
AI_PROVIDER=qwen
AI_API_KEY=sk-...
AI_MODEL=qwen-max

# --- Kimi ---
AI_PROVIDER=kimi
AI_API_KEY=sk-...
AI_MODEL=moonshot-v1-128k
```

> Nếu dùng proxy cho AI API, thêm `AI_BASE_URL=https://proxy-url/v1`

**Tạo secret keys:**

```bash
# Chạy lệnh này, copy kết quả dán vào JWT_SECRET
openssl rand -hex 32

# Chạy lệnh này, copy kết quả dán vào ENCRYPTION_KEY
openssl rand -hex 16
```

Lưu file: nhấn `Ctrl + X`, chọn `Y`, nhấn `Enter`.

## Bước 4: Khởi chạy

```bash
# Build và khởi chạy (lần đầu mất 2-5 phút)
docker compose up -d --build
```

Chờ cho tới khi hiện:
```
Container zalo-crm-app Started
```

**Kiểm tra hoạt động:**

```bash
# Xem trạng thái các container
docker compose ps

# Kết quả mong đợi: 3 container đều "Up"
# - zalo-crm-app    Up
# - zalo-crm-db     Up (healthy)
# - zalo-crm-backup Up (healthy)
```

## Bước 5: Truy cập lần đầu

1. Mở trình duyệt → vào **http://IP-VPS:3080**
   - Ví dụ: `http://123.45.67.89:3080`

2. Lần đầu sẽ hiện trang **Thiết lập ban đầu**:
   - Tên tổ chức: tên công ty/phòng khám
   - Họ tên: tên admin
   - Email: email đăng nhập
   - Mật khẩu: mật khẩu đăng nhập

3. Nhấn **Tạo tài khoản** → tự động đăng nhập

## Bước 6: Kết nối Zalo đầu tiên

1. Vào menu **Tài khoản Zalo** (bên trái)
2. Nhấn **Thêm Zalo** → đặt tên (VD: "Zalo Sale Hương")
3. *(Tuỳ chọn)* Nhập **Proxy URL** nếu cần dùng proxy: `http://user:pass@host:port`
4. Nhấn biểu tượng **QR** → mã QR hiện ra
5. **Mở Zalo trên điện thoại** → Quét mã QR
6. Xác nhận trên điện thoại → Trạng thái chuyển thành **Đã kết nối** (xanh lá)

> 💡 **Proxy per-account:** Mỗi tài khoản Zalo có thể cấu hình proxy HTTP riêng để tránh block IP. Nhấn nút 🌐 bên cạnh tài khoản để thêm/sửa proxy. Chi tiết: [PR #9](https://github.com/locphamnguyen/zalocrm/pull/9)

## Bước 7: Cài PWA trên điện thoại (tuỳ chọn)

ZaloCRM v2.0 hỗ trợ PWA — cài như ứng dụng trên điện thoại:

1. Mở **Chrome/Safari** trên điện thoại → vào URL hệ thống
2. **Android:** nhấn menu ⋮ → "Thêm vào màn hình chính"
3. **iOS:** nhấn nút Share → "Thêm vào Màn hình chính"
4. Ứng dụng hoạt động offline, nhận thông báo push

---

## Cài đặt SSL (tuỳ chọn)

Nếu bạn có domain, có thể dùng Cloudflare Tunnel hoặc Nginx + Let's Encrypt:

### Dùng Cloudflare Tunnel (đơn giản nhất)

```bash
# Cài cloudflared
curl -L https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64 -o cloudflared
chmod +x cloudflared
sudo mv cloudflared /usr/local/bin/

# Đăng nhập Cloudflare
cloudflared tunnel login

# Tạo tunnel
cloudflared tunnel create zalocrm

# Cấu hình
cat > ~/.cloudflared/config.yml << EOF
tunnel: YOUR_TUNNEL_ID
credentials-file: ~/.cloudflared/YOUR_TUNNEL_ID.json
ingress:
  - hostname: crm.your-domain.com
    service: http://localhost:3080
  - service: http_status:404
EOF

# Thêm DNS
cloudflared tunnel route dns YOUR_TUNNEL_ID crm.your-domain.com

# Chạy tunnel
cloudflared tunnel run
```

---

## Cập nhật phiên bản mới

```bash
cd zalocrm

# Tải phiên bản mới
git pull

# Build và khởi chạy lại
docker compose up -d --build
```

Dữ liệu không bị mất — database lưu trong Docker volume.

---

## Sao lưu dữ liệu

Hệ thống **tự động sao lưu** hàng ngày vào thư mục `backups/`:
- Giữ 7 bản sao lưu hàng ngày
- Giữ 4 bản sao lưu hàng tuần
- Giữ 3 bản sao lưu hàng tháng

**Sao lưu thủ công:**

```bash
# Tạo bản sao lưu ngay
docker exec zalo-crm-db pg_dump -U crmuser zalocrm > backup-manual.sql
```

**Khôi phục từ bản sao lưu:**

```bash
# Khôi phục database
cat backup-manual.sql | docker exec -i zalo-crm-db psql -U crmuser zalocrm
```

---

## Xử lý sự cố

### Container không chạy được

```bash
# Xem log lỗi
docker compose logs app

# Khởi chạy lại
docker compose restart app
```

### Không truy cập được web

- Kiểm tra firewall: mở port 3080
- Kiểm tra container: `docker compose ps`
- Kiểm tra log: `docker compose logs app`

### Zalo bị mất kết nối

- Hệ thống tự kết nối lại trong 30 giây
- Nếu vẫn không được → vào **Tài khoản Zalo** → quét QR lại
- Thử cấu hình **Proxy** cho tài khoản nếu bị block IP
- **Lưu ý:** KHÔNG mở Zalo Web trên trình duyệt

### AI không hoạt động

- Kiểm tra `AI_PROVIDER` và `AI_API_KEY` trong `.env`
- Nếu dùng proxy: kiểm tra `AI_BASE_URL` có đúng không
- Xem log: `docker compose logs app | grep -i ai`

### Quên mật khẩu admin

```bash
# Truy cập database trực tiếp
docker exec -it zalo-crm-db psql -U crmuser zalocrm

# Xem email admin
SELECT email, role FROM users WHERE role = 'owner';

# Thoát psql
\q
```

Liên hệ developer để reset mật khẩu qua database.
