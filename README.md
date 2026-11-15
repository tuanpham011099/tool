# Video Composer

Web app ghép đoạn video tối đa 30 giây vào giữa ảnh nền. File upload, output và trạng thái job được lưu trong `server/uploads/`.

## Chạy local

Yêu cầu: Node.js, Python, FFmpeg và FFprobe trong PATH.

```powershell
cd server
python -m venv .venv
.venv\Scripts\Activate.ps1
pip install -r requirements.txt
uvicorn app.main:app --reload
```

Mở terminal thứ hai:

```powershell
cd web
npm install
npm run dev
```

Mở http://localhost:3000. API tại http://localhost:8000. Frontend dùng Next.js rewrite cho API nhỏ. Upload video đi thẳng tới FastAPI để truyền được file đến 500 MB. Nếu backend ở địa chỉ khác, đặt `BACKEND_URL` và `NEXT_PUBLIC_UPLOAD_API_URL` trước khi chạy frontend, đồng thời đặt `WEB_ORIGIN` cho địa chỉ web được phép upload.

### Chạy nhanh trên Windows

Sau khi cài dependencies như trên, tại thư mục gốc chạy `powershell -ExecutionPolicy Bypass -File .\dev.ps1` để khởi động cả web và API. Frontend chuyển tiếp `/api` và `/uploads` tới backend; có thể đổi địa chỉ backend bằng biến môi trường `BACKEND_URL`.

Ảnh nền đã upload được lưu trong `server/uploads/images` và xuất hiện lại trong thư viện khi mở app lần sau. Sau khi chọn ảnh, kéo chuột trên ảnh để vẽ khung video và kéo bên trong khung để đổi vị trí. Video được phóng theo tỉ lệ gốc rồi cắt phần dư để phủ kín khung đã chọn. Tọa độ khung được gửi dưới dạng tỉ lệ `x`, `y`, `width`, `height` (0–1) trong request `/api/generate`.

Video MP4, MOV hoặc WebM có thể tải lên đến 500 MB. Giao diện hiển thị tiến độ upload và gửi dữ liệu video thẳng tới `/api/upload/video/raw`, giúp server ghi file ngay khi nhận thay vì tạo thêm bản sao tạm từ multipart. Endpoint multipart `/api/upload/video` vẫn dùng được cho client cũ.
