"use client";

import { useEffect, useRef, useState } from "react";

type ImageFile = { fileId: string; url: string; name: string; width: number; height: number };
type VideoFile = { fileId: string; url: string; duration: number; width: number; height: number };
type Layout = { width: number; height: number; bandHeight: number; top: number };
type Job = { jobId: string; status: "queued" | "processing" | "completed" | "failed"; progress: number; resultUrl: string | null; error: string | null };
const formatTime = (seconds: number) => `${Math.floor(seconds / 60).toString().padStart(2, "0")}:${Math.floor(seconds % 60).toString().padStart(2, "0")}`;
const connectionError = "Không kết nối được API. Hãy chạy cả backend và frontend bằng .\\dev.ps1 ở thư mục gốc.";
const uploadApi = process.env.NEXT_PUBLIC_UPLOAD_API_URL || "http://localhost:8000";

async function api<T>(url: string, options?: RequestInit): Promise<T> {
  let response: Response;
  try { response = await fetch(url, options); } catch { throw new Error(connectionError); }
  const data = await response.json().catch(() => null);
  if (!response.ok) throw new Error(typeof data?.detail === "string" ? data.detail : response.status >= 500 ? connectionError : `Yêu cầu thất bại (${response.status})`);
  return data as T;
}

function uploadFile<T>(url: string, file: File, field: string, onProgress: (percent: number) => void): Promise<T> {
  return new Promise((resolve, reject) => {
    const request = new XMLHttpRequest();
    request.open("POST", url);
    request.upload.onprogress = event => {
      if (event.lengthComputable) onProgress(Math.min(100, Math.round(event.loaded / event.total * 100)));
    };
    request.onerror = () => reject(new Error(connectionError));
    request.onload = () => {
      let data: { detail?: string } & T;
      try { data = JSON.parse(request.responseText); }
      catch { reject(new Error(request.status >= 500 ? connectionError : "Phản hồi upload không hợp lệ")); return; }
      if (request.status >= 200 && request.status < 300) resolve(data);
      else reject(new Error(typeof data.detail === "string" ? data.detail : `Upload thất bại (${request.status})`));
    };
    const form = new FormData(); form.append(field, file);
    request.send(form);
  });
}

export default function Home() {
  const [images, setImages] = useState<ImageFile[]>([]);
  const [image, setImage] = useState<ImageFile | null>(null);
  const [video, setVideo] = useState<VideoFile | null>(null);
  const [layout, setLayout] = useState<Layout | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => { api<ImageFile[]>("/api/images").then(setImages).catch(e => setError(e.message)); }, []);
  useEffect(() => {
    if (!image || !video) { setLayout(null); return; }
    setLayout(null);
    let active = true;
    api<Layout>(`/api/layout?imageId=${encodeURIComponent(image.fileId)}&videoId=${encodeURIComponent(video.fileId)}`)
      .then(data => { if (active) setLayout(data); }).catch(e => { if (active) setError(e.message); });
    return () => { active = false; };
  }, [image?.fileId, video?.fileId]);
  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const timer = window.setInterval(() => api<Job>(`/api/jobs/${job.jobId}`).then(setJob).catch(e => { setError(e.message); window.clearInterval(timer); }), 1000);
    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status]);

  async function upload(file: File, kind: "image" | "video") {
    const maxMB = kind === "image" ? 20 : 500;
    if (file.size > maxMB * 1024 * 1024) { setError(`File vượt quá ${maxMB} MB.`); return; }
    setBusy(kind); setUploadProgress(0); setError(""); setJob(null);
    try {
      const endpoint = kind === "video" ? `${uploadApi}/api/upload/video` : "/api/upload/image";
      const data = await uploadFile<ImageFile & VideoFile>(endpoint, file, kind, setUploadProgress);
      if (kind === "image") { setImages(previous => [data, ...previous]); setImage(data); }
      else { setVideo(data); setStart(0); setEnd(Math.min(30, data.duration)); }
    } catch (e) { setError(e instanceof Error ? e.message : "Upload thất bại"); }
    finally { setBusy(null); setUploadProgress(0); }
  }
  function updateStart(value: number) {
    if (!video) return;
    const next = Math.max(0, Math.min(value, video.duration - 0.1));
    setStart(next);
    if (end <= next) setEnd(Math.min(video.duration, next + 0.1));
    else if (end - next > 30) setEnd(next + 30);
    if (videoRef.current) videoRef.current.currentTime = next;
  }
  function updateEnd(value: number) {
    if (!video) return;
    const next = Math.max(0.1, Math.min(value, video.duration));
    setEnd(next);
    if (start >= next) setStart(Math.max(0, next - 0.1));
    else if (next - start > 30) setStart(next - 30);
    if (videoRef.current) videoRef.current.currentTime = next;
  }
  async function generate() {
    if (!image || !video) return;
    setError(""); setJob(null);
    try {
      const data = await api<{ jobId: string; status: Job["status"] }>("/api/generate", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: image.fileId, videoId: video.fileId, start, end, fit: "cover" }) });
      setJob({ ...data, progress: 0, resultUrl: null, error: null });
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể tạo video"); }
  }
  const valid = !!image && !!video && !!layout && start >= 0 && end > start && end - start <= 30.001 && end <= video.duration + 0.05;

  return <main className="mx-auto max-w-6xl px-4 pb-20 pt-8 md:px-8">
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4 border-b border-slate-200 pb-6"><div><p className="text-xs font-bold uppercase tracking-[.22em] text-blue-600">Video Composer</p><h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Tạo video từ ảnh nền</h1><p className="mt-2 text-slate-500">Chọn ảnh, ghép đoạn video vào giữa và xuất MP4 trong vài bước.</p></div><div className="rounded-full border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-medium text-blue-700">Tối đa 30 giây / video</div></header>
    {error && <div role="alert" className="mb-5 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>}
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(340px,.85fr)]"><div className="space-y-6">
      <section className="panel"><div className="section-head"><span className="step">01</span><div><h2 className="section-title">Ảnh nền</h2><p className="section-subtitle">JPG, PNG, WebP · tối đa 20 MB</p></div></div><label className="upload-button"><input className="sr-only" type="file" accept=".jpg,.jpeg,.png,.webp" onChange={e => { const file = e.target.files?.[0]; if (file) upload(file, "image"); e.target.value = ""; }} />{busy === "image" ? "Đang tải ảnh..." : "+ Tải ảnh nền mới"}</label>
        {images.length > 0 ? <><div className="mt-6 flex items-center justify-between"><h3 className="font-semibold">Thư viện ảnh đã lưu</h3><span className="text-xs text-slate-500">{images.length} ảnh</span></div><div className="mt-3 grid grid-cols-3 gap-3 sm:grid-cols-4">{images.map(item => <button key={item.fileId} type="button" onClick={() => { setImage(item); setJob(null); }} aria-label={`Chọn ${item.name}`} className={`image-choice ${image?.fileId === item.fileId ? "selected" : ""}`}><img src={item.url} alt={item.name} /><span className="truncate px-2 py-1 text-xs">{item.name}</span></button>)}</div></> : <p className="mt-5 text-sm text-slate-400">Ảnh tải lên sẽ được lưu ở đây để chọn lại lần sau.</p>}
      </section>
      <section className="panel"><div className="section-head"><span className="step">02</span><div><h2 className="section-title">Video của bạn</h2><p className="section-subtitle">MP4, MOV, WebM · tối đa 500 MB</p></div></div><label className="upload-button"><input className="sr-only" type="file" accept=".mp4,.mov,.webm" disabled={!!busy} onChange={e => { const file = e.target.files?.[0]; if (file) upload(file, "video"); e.target.value = ""; }} />{busy === "video" ? uploadProgress < 100 ? `Đang tải video: ${uploadProgress}%` : "Đang kiểm tra video..." : "+ Chọn video"}</label>{busy === "video" && <div role="progressbar" aria-valuenow={uploadProgress} aria-valuemin={0} aria-valuemax={100} className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200"><div className="h-full bg-blue-500 transition-all" style={{ width: `${uploadProgress}%` }} /></div>}{video && <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-4"><p className="font-medium">Video đã tải lên</p><p className="mt-1 text-sm text-slate-500">{video.width} × {video.height} px · {formatTime(video.duration)}</p><p className="mt-2 text-xs text-slate-500">Video tự phóng và cắt phần dư để phủ kín vùng giữa của ảnh nền.</p></div>}</section>
      {video && <section className="panel"><div className="section-head"><span className="step">03</span><div><h2 className="section-title">Cắt đoạn video</h2><p className="section-subtitle">Kéo hai điểm hoặc dùng thời điểm đang xem</p></div></div><div className="trim-track mt-5"><div className="absolute top-3 h-2 w-full rounded-full bg-slate-200"/><div className="absolute top-3 h-2 rounded-full bg-blue-500" style={{ left: `${start / video.duration * 100}%`, width: `${(end - start) / video.duration * 100}%` }}/><input aria-label="Start" type="range" min="0" max={video.duration} step="0.1" value={start} onChange={e => updateStart(Number(e.target.value))} style={{ zIndex: start > video.duration - 2 ? 3 : 2 }}/><input aria-label="End" type="range" min="0" max={video.duration} step="0.1" value={end} onChange={e => updateEnd(Number(e.target.value))} style={{ zIndex: 2 }}/></div><div className="mt-4 grid grid-cols-3 gap-2 text-center"><div className="metric"><small>START</small><strong>{formatTime(start)}</strong></div><div className="metric"><small>END</small><strong>{formatTime(end)}</strong></div><div className="metric"><small>THỜI LƯỢNG</small><strong>{(end - start).toFixed(1)}s</strong></div></div><div className="mt-4 flex gap-2"><button className="secondary-button" onClick={() => updateStart(videoRef.current?.currentTime || 0)}>Set Start</button><button className="secondary-button" onClick={() => updateEnd(videoRef.current?.currentTime || 0)}>Set End</button></div></section>}
      <section className="panel"><div className="section-head"><span className="step">04</span><div><h2 className="section-title">Xuất video</h2><p className="section-subtitle">Video luôn lấp đầy vùng giữa ảnh nền</p></div></div><p className="mt-5 rounded-xl bg-blue-50 p-3 text-sm text-blue-800">App tự phóng video theo tỉ lệ gốc và cắt phần dư nếu cần. Ảnh nền vẫn hiện phía trên và dưới.</p><button className="primary-button mt-5 w-full" disabled={!valid || !!busy || job?.status === "queued" || job?.status === "processing"} onClick={generate}>Generate MP4</button></section>
    </div><aside><section className="panel lg:sticky lg:top-5"><div className="flex items-center justify-between gap-2"><h2 className="section-title">Xem trước bố cục</h2>{layout && <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700">Khớp kích thước xuất</span>}</div>{image ? <div className="relative mx-auto mt-5 w-full max-w-[390px] overflow-hidden rounded-lg bg-slate-200 shadow-lg" style={{ aspectRatio: `${layout?.width || image.width} / ${layout?.height || image.height}` }}><img src={image.url} alt="Bố cục ảnh nền" className="absolute inset-0 h-full w-full object-fill" />{video && layout && <video ref={videoRef} key={video.fileId} src={video.url} controls playsInline className="absolute left-0 w-full bg-black" style={{ top: `${layout.top / layout.height * 100}%`, height: `${layout.bandHeight / layout.height * 100}%`, objectFit: "cover" }} onTimeUpdate={e => { if (e.currentTarget.currentTime >= end && end > start) e.currentTarget.pause(); }} />}</div> : <div className="mt-5 flex aspect-[9/12] items-center justify-center rounded-xl border-2 border-dashed border-slate-200 bg-slate-50 text-center text-sm text-slate-400">Chọn ảnh nền để xem trước</div>}{layout && <p className="mt-4 text-center text-sm text-slate-500">Vùng video {layout.width} × {layout.bandHeight} px trên ảnh {layout.width} × {layout.height} px.</p>}{job && <div className="mt-6 border-t border-slate-200 pt-5"><h3 className="font-semibold">Kết quả</h3><p className="mt-1 text-sm text-slate-500">{job.status === "queued" ? "Đang chờ xử lý" : job.status === "processing" ? `Đang xử lý ${job.progress}%` : job.status === "completed" ? "Đã hoàn thành" : `Thất bại: ${job.error}`}</p>{["queued", "processing"].includes(job.status) && <div className="mt-3 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-500" style={{ width: `${job.progress}%` }}/></div>}{job.status === "completed" && job.resultUrl && <><video controls src={job.resultUrl} className="mt-4 w-full rounded-lg bg-black"/><a className="primary-button mt-3 block text-center" href={`/api/jobs/${job.jobId}/download`}>Tải MP4</a></>}{job.status === "failed" && <button className="secondary-button mt-3" onClick={generate}>Thử lại</button>}</div>}</section></aside></div>
  </main>;
}
