# Hướng dẫn sử dụng ZaloCRM

## Mục lục

1. [Đăng nhập](#1-đăng-nhập)
2. [Kết nối Zalo](#2-kết-nối-zalo)
3. [Chat với khách hàng](#3-chat-với-khách-hàng)
4. [Quản lý khách hàng](#4-quản-lý-khách-hàng)
5. [Lịch hẹn](#5-lịch-hẹn)
6. [Dashboard & Báo cáo](#6-dashboard--báo-cáo)
7. [Quản lý nhân viên](#7-quản-lý-nhân-viên)
8. [API & Webhook](#8-api--webhook)
9. [Câu hỏi thường gặp](#9-câu-hỏi-thường-gặp)
10. [Quy tắc quan trọng](#10-quy-tắc-quan-trọng)

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
3. Nhấn biểu tượng **QR** → mã QR hiện trên màn hình
4. Mở **Zalo trên điện thoại** → quét mã QR
5. Xác nhận trên điện thoại → trạng thái chuyển sang **Đã kết nối** (xanh)

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

## 4. Quản lý khách hàng

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

## 5. Lịch hẹn

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

## 6. Dashboard & Báo cáo

### Dashboard (trang chủ)

6 ô thống kê:
- Tin nhắn hôm nay | Chưa trả lời | Chưa đọc
- Lịch hẹn hôm nay | Khách mới tuần này | Tổng khách hàng

Biểu đồ:
- Tin nhắn gửi/nhận theo ngày (30 ngày)
- Pipeline khách hàng (biểu đồ tròn)
- Nguồn khách hàng (biểu đồ tròn)

### Báo cáo

1. Vào menu **Báo cáo**
2. Chọn **khoảng thời gian** (từ ngày – đến ngày)
3. Chọn tab: **Tin nhắn** / **Khách hàng** / **Lịch hẹn**
4. Nhấn **Xuất Excel** → tải file .xlsx về máy

---

## 7. Quản lý nhân viên

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

## 8. API & Webhook

Dành cho lập trình viên muốn tích hợp ZaloCRM với hệ thống khác.

### Tạo API Key

1. Vào menu **API & Webhook**
2. Nhấn **Tạo key mới** → copy API key
3. Sử dụng trong header: `X-API-Key: your-key`

### Cấu hình Webhook

1. Nhập **Webhook URL** (địa chỉ server nhận thông báo)
2. Nhập **Secret** (mã bí mật để xác thực)
3. Nhấn **Lưu** → nhấn **Test Webhook** để kiểm tra

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

## 9. Câu hỏi thường gặp

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

---

## 10. Quy tắc quan trọng

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
