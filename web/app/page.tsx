"use client";

import { useEffect, useRef, useState } from "react";

const API = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";
type ImageFile = { fileId: string; url: string; width: number; height: number };
type VideoFile = ImageFile & { duration: number };
type Job = { jobId: string; status: "queued" | "processing" | "completed" | "failed"; progress: number; resultUrl: string | null; error: string | null };
const fmt = (n: number) => `${Math.floor(n / 60).toString().padStart(2, "0")}:${Math.floor(n % 60).toString().padStart(2, "0")}`;

export default function Home() {
  const [image, setImage] = useState<ImageFile | null>(null);
  const [video, setVideo] = useState<VideoFile | null>(null);
  const [start, setStart] = useState(0);
  const [end, setEnd] = useState(0);
  const [fit, setFit] = useState<"cover" | "contain">("cover");
  const [busy, setBusy] = useState<"image" | "video" | null>(null);
  const [job, setJob] = useState<Job | null>(null);
  const [error, setError] = useState("");
  const videoRef = useRef<HTMLVideoElement>(null);

  async function upload(file: File, kind: "image" | "video") {
    setBusy(kind); setError(""); setJob(null);
    try {
      const body = new FormData(); body.append(kind, file);
      const response = await fetch(`${API}/api/upload/${kind}`, { method: "POST", body });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Upload thất bại");
      if (kind === "image") setImage(data);
      else { setVideo(data); setStart(0); setEnd(Math.min(30, data.duration)); }
    } catch (e) { setError(e instanceof Error ? e.message : "Upload thất bại"); }
    finally { setBusy(null); }
  }

  useEffect(() => {
    if (!job || !["queued", "processing"].includes(job.status)) return;
    const timer = window.setInterval(async () => {
      try {
        const response = await fetch(`${API}/api/jobs/${job.jobId}`);
        const data = await response.json();
        if (!response.ok) throw new Error(data.detail || "Không đọc được trạng thái");
        setJob(data);
      } catch (e) { setError(e instanceof Error ? e.message : "Lỗi kết nối"); window.clearInterval(timer); }
    }, 1000);
    return () => window.clearInterval(timer);
  }, [job?.jobId, job?.status]);

  function updateStart(value: number) {
    const next = Math.max(0, Math.min(value, video?.duration || 0));
    setStart(next); if (next >= end) setEnd(Math.min(video?.duration || 0, next + 0.1));
    if (end - next > 30) setEnd(next + 30);
    if (videoRef.current) videoRef.current.currentTime = next;
  }
  function updateEnd(value: number) {
    const next = Math.max(0, Math.min(value, video?.duration || 0));
    setEnd(next); if (next <= start) setStart(Math.max(0, next - 0.1));
    if (next - start > 30) setStart(next - 30);
    if (videoRef.current) videoRef.current.currentTime = next;
  }
  async function generate() {
    if (!image || !video) return;
    setError(""); setJob(null);
    try {
      const response = await fetch(`${API}/api/generate`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ imageId: image.fileId, videoId: video.fileId, start, end, fit }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.detail || "Không thể tạo video");
      setJob({ ...data, progress: 0, resultUrl: null, error: null });
    } catch (e) { setError(e instanceof Error ? e.message : "Không thể tạo video"); }
  }
  const valid = !!image && !!video && start >= 0 && end > start && end - start <= 30.001 && end <= video.duration + 0.05;
  return <main className="mx-auto max-w-5xl px-4 py-10">
    <div className="mb-8"><p className="text-sm font-bold uppercase tracking-widest text-blue-600">Video Composer</p><h1 className="mt-2 text-3xl font-bold">Ghép video vào giữa ảnh</h1><p className="mt-2 text-slate-600">Tải ảnh và video lên, chọn đoạn tối đa 30 giây rồi tạo MP4.</p></div>
    <div className="grid gap-5 md:grid-cols-2">
      <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">1. Ảnh nền</h2><input aria-label="Chọn ảnh nền" type="file" accept=".jpg,.jpeg,.png,.webp,image/jpeg,image/png,image/webp" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, "image"); }} className="w-full text-sm" />{busy === "image" && <p className="mt-3">Đang tải ảnh...</p>}{image && <img src={`${API}${image.url}`} alt="Ảnh nền đã chọn" className="mt-4 max-h-80 w-full rounded-lg bg-slate-100 object-contain" />}</section>
      <section className="rounded-2xl bg-white p-5 shadow-sm"><h2 className="mb-3 text-lg font-semibold">2. Video</h2><input aria-label="Chọn video" type="file" accept=".mp4,.mov,.webm,video/mp4,video/quicktime,video/webm" onChange={e => { const f = e.target.files?.[0]; if (f) upload(f, "video"); }} className="w-full text-sm" />{busy === "video" && <p className="mt-3">Đang tải video...</p>}{video && <video ref={videoRef} src={`${API}${video.url}`} controls className="mt-4 max-h-80 w-full rounded-lg bg-black" onTimeUpdate={e => { if (e.currentTarget.currentTime >= end && end > start) e.currentTarget.pause(); }} />}</section>
    </div>
    {video && <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><div className="flex flex-wrap items-baseline justify-between gap-2"><h2 className="text-lg font-semibold">3. Chọn đoạn video</h2><span className="text-sm text-slate-500">Thời lượng gốc: {fmt(video.duration)}</span></div><p className="mt-1 text-sm text-slate-500">Kéo hai điểm để chọn tối đa 30 giây.</p>
      <div className="trim-track mt-5"><div className="absolute top-3 h-2 w-full rounded-full bg-slate-200"/><div className="absolute top-3 h-2 rounded-full bg-blue-500" style={{ left: `${start / video.duration * 100}%`, width: `${(end - start) / video.duration * 100}%` }}/><input aria-label="Start" type="range" min="0" max={video.duration} step="0.1" value={start} onChange={e => updateStart(Number(e.target.value))} style={{ zIndex: start > video.duration - 2 ? 3 : 2 }}/><input aria-label="End" type="range" min="0" max={video.duration} step="0.1" value={end} onChange={e => updateEnd(Number(e.target.value))} style={{ zIndex: 2 }}/></div>
      <div className="mt-4 flex flex-wrap items-center gap-5 text-sm"><span>Start: <b>{fmt(start)}</b></span><span>End: <b>{fmt(end)}</b></span><span>Đoạn chọn: <b>{(end - start).toFixed(1)} giây</b></span></div><div className="mt-3 flex gap-2"><button onClick={() => updateStart(videoRef.current?.currentTime || 0)} className="rounded-lg border px-3 py-2 text-sm">Set Start</button><button onClick={() => updateEnd(videoRef.current?.currentTime || 0)} className="rounded-lg border px-3 py-2 text-sm">Set End</button></div>
    </section>}
    <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">4. Tạo video</h2><div className="mt-3 flex gap-5 text-sm"><label><input type="radio" name="fit" checked={fit === "cover"} onChange={() => setFit("cover")} /> Cover</label><label><input type="radio" name="fit" checked={fit === "contain"} onChange={() => setFit("contain")} /> Contain</label></div><button disabled={!valid || !!busy || job?.status === "queued" || job?.status === "processing"} onClick={generate} className="mt-5 rounded-lg bg-blue-600 px-6 py-3 font-semibold text-white disabled:bg-slate-300">Generate</button>{error && <p role="alert" className="mt-3 text-red-600">{error}</p>}</section>
    {job && <section className="mt-5 rounded-2xl bg-white p-5 shadow-sm"><h2 className="text-lg font-semibold">Kết quả</h2><p className="mt-2 text-sm">{job.status === "queued" ? "Đang chờ xử lý" : job.status === "processing" ? `Đang xử lý: ${job.progress}%` : job.status === "completed" ? "Hoàn tất" : `Thất bại: ${job.error}`}</p>{["queued", "processing"].includes(job.status) && <div className="mt-3 h-2 rounded-full bg-slate-200"><div className="h-full rounded-full bg-blue-500" style={{ width: `${job.progress}%` }} /></div>}{job.status === "completed" && job.resultUrl && <><video controls src={`${API}${job.resultUrl}`} className="mt-4 max-h-[600px] w-full rounded-lg bg-black"/><a href={`${API}/api/jobs/${job.jobId}/download`} className="mt-4 inline-block rounded-lg bg-blue-600 px-4 py-2 text-white">Tải MP4</a></>}{job.status === "failed" && <button onClick={generate} className="mt-3 rounded-lg border px-4 py-2">Thử lại</button>}</section>}
  </main>;
}
