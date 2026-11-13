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

Mở http://localhost:3000. API tại http://localhost:8000. Có thể đổi bằng `NEXT_PUBLIC_API_URL` và `WEB_ORIGIN`.
