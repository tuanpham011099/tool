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

Ảnh nền đã upload được lưu trong `server/uploads/images` và xuất hiện lại trong thư viện khi mở app lần sau. Video MP4, MOV hoặc WebM có thể tải lên đến 500 MB; giao diện hiển thị tiến độ upload. Khi render, video luôn được phóng theo tỉ lệ gốc rồi cắt phần dư để phủ kín vùng giữa ảnh nền; preview sử dụng cùng thông số kích thước với backend.
