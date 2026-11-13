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

Mở http://localhost:3000. API tại http://localhost:8000. Frontend dùng đường dẫn cùng nguồn qua Next.js rewrite; nếu backend ở máy khác, đặt `BACKEND_URL` trước khi chạy frontend.

### Chạy nhanh trên Windows

Sau khi cài dependencies như trên, tại thư mục gốc chạy `powershell -ExecutionPolicy Bypass -File .\dev.ps1` để khởi động cả web và API. Frontend chuyển tiếp `/api` và `/uploads` tới backend; có thể đổi địa chỉ backend bằng biến môi trường `BACKEND_URL`.

Ảnh nền đã upload được lưu trong `server/uploads/images` và xuất hiện lại trong thư viện khi mở app lần sau. Video upload được co/cắt theo đúng vùng giữa của ảnh nền lúc render; preview sử dụng cùng thông số kích thước với backend.
