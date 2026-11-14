import json
import math
import os
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Literal

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles
from PIL import Image, ImageOps, UnidentifiedImageError
from pydantic import BaseModel

ROOT = Path(__file__).resolve().parents[1]
UPLOADS = ROOT / "uploads"
for folder in ("images", "videos", "outputs"):
    (UPLOADS / folder).mkdir(parents=True, exist_ok=True)
INDEX_PATH = UPLOADS / "index.json"
JOBS_PATH = UPLOADS / "jobs.json"
lock = threading.RLock()
render_limit = threading.Semaphore(2)


def read_json(path: Path) -> dict:
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError):
        return {}


files = read_json(INDEX_PATH)
jobs = read_json(JOBS_PATH)
for job in jobs.values():
    if job["status"] in ("queued", "processing"):
        job.update(status="failed", error="Server restarted during rendering")


def save_json(path: Path, data: dict):
    temp = path.with_suffix(".tmp")
    temp.write_text(json.dumps(data), encoding="utf-8")
    temp.replace(path)


save_json(JOBS_PATH, jobs)
app = FastAPI(title="Video Composer")
web_origins = {"http://localhost:3000", "http://127.0.0.1:3000"}
web_origins.update(origin.strip() for origin in os.getenv("WEB_ORIGIN", "").split(",") if origin.strip())
app.add_middleware(CORSMiddleware, allow_origins=sorted(web_origins), allow_methods=["*"], allow_headers=["*"])
for folder in ("images", "videos", "outputs"):
    app.mount(f"/uploads/{folder}", StaticFiles(directory=UPLOADS / folder), name=folder)


def probe(path: Path) -> dict:
    try:
        result = subprocess.run(["ffprobe", "-v", "error", "-show_entries", "format=duration:stream=codec_type,width,height", "-of", "json", str(path)], capture_output=True, text=True, timeout=30, check=True)
        data = json.loads(result.stdout)
        stream = next(s for s in data["streams"] if s["codec_type"] == "video")
        duration = float(data["format"]["duration"])
        if not math.isfinite(duration) or duration <= 0:
            raise ValueError("Invalid duration")
        return {"duration": duration, "width": int(stream["width"]), "height": int(stream["height"]), "hasAudio": any(s["codec_type"] == "audio" for s in data["streams"])}
    except (subprocess.SubprocessError, KeyError, StopIteration, ValueError, json.JSONDecodeError) as exc:
        raise HTTPException(422, "Video không hợp lệ hoặc không đọc được metadata") from exc


async def store_upload(upload: UploadFile, kind: str, allowed: dict[str, str], limit: int) -> tuple[str, Path]:
    suffix = Path(upload.filename or "").suffix.lower()
    if suffix not in allowed:
        raise HTTPException(415, "Định dạng file không được hỗ trợ")
    file_id = f"{'img' if kind == 'images' else 'vid'}_{uuid.uuid4().hex}"
    path = UPLOADS / kind / f"{file_id}{suffix}"
    total = 0
    try:
        with path.open("wb") as target:
            while chunk := await upload.read(1024 * 1024):
                total += len(chunk)
                if total > limit:
                    raise HTTPException(413, "File vượt quá giới hạn dung lượng")
                target.write(chunk)
        if total == 0:
            raise HTTPException(422, "File rỗng")
        return file_id, path
    except Exception:
        path.unlink(missing_ok=True)
        raise
    finally:
        await upload.close()


@app.post("/api/upload/image")
async def upload_image(image: UploadFile = File(...)):
    original_name = Path(image.filename or "Ảnh nền").name[:120]
    file_id, path = await store_upload(image, "images", {".jpg": "", ".jpeg": "", ".png": "", ".webp": ""}, 20 * 1024 * 1024)
    try:
        with Image.open(path) as im:
            im.verify()
        with Image.open(path) as im:
            width, height = ImageOps.exif_transpose(im).size
            if im.format not in ("JPEG", "PNG", "WEBP"):
                raise ValueError("Invalid image format")
        if width < 2 or height < 2:
            raise ValueError("Image is too small")
    except (UnidentifiedImageError, OSError, ValueError):
        path.unlink(missing_ok=True)
        raise HTTPException(422, "Ảnh không hợp lệ")
    record = {"kind": "images", "filename": path.name, "originalName": original_name, "width": width, "height": height, "createdAt": time.time()}
    with lock:
        files[file_id] = record
        save_json(INDEX_PATH, files)
    return {"fileId": file_id, "url": f"/uploads/images/{path.name}", "name": original_name, "width": width, "height": height}


@app.get("/api/images")
def list_images():
    with lock:
        records = [(file_id, item.copy()) for file_id, item in files.items() if item.get("kind") == "images"]
    return [
        {"fileId": file_id, "url": f"/uploads/images/{item['filename']}", "name": item.get("originalName", "Ảnh nền"), "width": item["width"], "height": item["height"]}
        for file_id, item in sorted(records, key=lambda pair: pair[1].get("createdAt", 0), reverse=True)
        if (UPLOADS / "images" / item["filename"]).is_file()
    ]


@app.post("/api/upload/video")
async def upload_video(video: UploadFile = File(...)):
    file_id, path = await store_upload(video, "videos", {".mp4": "", ".mov": "", ".webm": ""}, 500 * 1024 * 1024)
    try:
        info = probe(path)
    except HTTPException:
        path.unlink(missing_ok=True)
        raise
    record = {"kind": "videos", "filename": path.name, "createdAt": time.time(), **info}
    with lock:
        files[file_id] = record
        save_json(INDEX_PATH, files)
    return {"fileId": file_id, "url": f"/uploads/videos/{path.name}", "duration": info["duration"], "width": info["width"], "height": info["height"]}


class GenerateRequest(BaseModel):
    imageId: str
    videoId: str
    start: float
    end: float
    fit: Literal["cover"] = "cover"


def layout(image: dict, video: dict) -> dict[str, int]:
    width = max(2, min(1920, image["width"]) // 2 * 2)
    height = max(2, round(image["height"] * width / image["width"]) // 2 * 2)
    natural_band = round(width * video["height"] / video["width"])
    band = max(2, (min(natural_band, height // 3)) // 2 * 2)
    return {"width": width, "height": height, "bandHeight": band, "top": (height - band) // 2}


@app.get("/api/layout")
def get_layout(imageId: str, videoId: str):
    with lock:
        image = files.get(imageId)
        video = files.get(videoId)
    if not image or image.get("kind") != "images" or not video or video.get("kind") != "videos":
        raise HTTPException(404, "Không tìm thấy ảnh hoặc video")
    return layout(image, video)


def set_job(job_id: str, **updates):
    with lock:
        jobs[job_id].update(updates)
        save_json(JOBS_PATH, jobs)


def render(job_id: str, request: GenerateRequest, image: dict, video: dict):
    with render_limit:
        set_job(job_id, status="processing")
        image_path = UPLOADS / "images" / image["filename"]
        video_path = UPLOADS / "videos" / video["filename"]
        output = UPLOADS / "outputs" / f"{job_id}.mp4"
        size = layout(image, video)
        width, height, band, top = size["width"], size["height"], size["bandHeight"], size["top"]
        placement = f"[1:v]scale={width}:{band}:force_original_aspect_ratio=increase,crop={width}:{band},setsar=1[v]"
        filters = f"[0:v]scale={width}:{height},setsar=1[bg];{placement};[bg][v]overlay=(W-w)/2:{top}:shortest=1[out]"
        command = ["ffmpeg", "-y", "-loglevel", "error", "-loop", "1", "-i", str(image_path), "-ss", str(request.start), "-t", str(request.end - request.start), "-i", str(video_path), "-filter_complex", filters, "-map", "[out]"]
        if video["hasAudio"]:
            command += ["-map", "1:a:0", "-c:a", "aac", "-b:a", "128k"]
        command += ["-c:v", "libx264", "-preset", "veryfast", "-crf", "20", "-pix_fmt", "yuv420p", "-t", str(request.end - request.start), "-movflags", "+faststart", "-progress", "pipe:1", "-nostats", str(output)]
        try:
            with subprocess.Popen(command, stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True) as process:
                assert process.stdout is not None
                for line in process.stdout:
                    if line.startswith("out_time_ms="):
                        try:
                            progress = min(99, int(int(line.split("=", 1)[1]) / 1_000_000 / (request.end - request.start) * 100))
                            if progress > jobs[job_id]["progress"]:
                                set_job(job_id, progress=progress)
                        except ValueError:
                            pass
                error = process.stderr.read()[-2000:] if process.stderr else ""
                code = process.wait()
            if code != 0 or not output.exists():
                raise RuntimeError(error or "FFmpeg render failed")
            set_job(job_id, status="completed", progress=100, resultUrl=f"/uploads/outputs/{output.name}")
        except Exception as exc:
            output.unlink(missing_ok=True)
            set_job(job_id, status="failed", error=str(exc)[-500:])


@app.post("/api/generate")
def generate(request: GenerateRequest):
    with lock:
        image = files.get(request.imageId)
        video = files.get(request.videoId)
    if not image or image["kind"] != "images" or not video or video["kind"] != "videos":
        raise HTTPException(404, "Không tìm thấy ảnh hoặc video")
    if not all(math.isfinite(x) for x in (request.start, request.end)) or request.start < 0 or request.end <= request.start or request.end - request.start > 30.001 or request.end > video["duration"] + 0.05:
        raise HTTPException(422, "Đoạn video phải nằm trong thời lượng gốc và dài tối đa 30 giây")
    job_id = f"job_{uuid.uuid4().hex}"
    with lock:
        jobs[job_id] = {"jobId": job_id, "status": "queued", "progress": 0, "resultUrl": None, "error": None, "createdAt": time.time()}
        save_json(JOBS_PATH, jobs)
    threading.Thread(target=render, args=(job_id, request, image, video), daemon=True).start()
    return {"jobId": job_id, "status": "queued"}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str):
    with lock:
        job = jobs.get(job_id)
    if not job:
        raise HTTPException(404, "Không tìm thấy job")
    return job


@app.get("/api/jobs/{job_id}/download")
def download_job(job_id: str):
    with lock:
        job = jobs.get(job_id)
    if not job or job["status"] != "completed":
        raise HTTPException(404, "Không tìm thấy video kết quả")
    path = UPLOADS / "outputs" / f"{job_id}.mp4"
    if not path.is_file():
        raise HTTPException(404, "File kết quả đã bị xóa")
    return FileResponse(path, media_type="video/mp4", filename=f"{job_id}.mp4")
