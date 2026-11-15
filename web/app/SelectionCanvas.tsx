"use client";

import { useRef, type PointerEvent, type RefObject } from "react";

export type Region = { x: number; y: number; width: number; height: number };
type Drag = { mode: "draw" | "move"; startX: number; startY: number; original: Region | null };
type Props = {
  imageUrl: string;
  imageWidth: number;
  imageHeight: number;
  videoUrl?: string;
  videoRef: RefObject<HTMLVideoElement | null>;
  start: number;
  end: number;
  region: Region | null;
  onRegionChange: (region: Region | null) => void;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));

export default function SelectionCanvas({ imageUrl, imageWidth, imageHeight, videoUrl, videoRef, start, end, region, onRegionChange }: Props) {
  const drag = useRef<Drag | null>(null);
  function point(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return { x: clamp((event.clientX - bounds.left) / bounds.width), y: clamp((event.clientY - bounds.top) / bounds.height) };
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const p = point(event);
    const inside = region && p.x >= region.x && p.x <= region.x + region.width && p.y >= region.y && p.y <= region.y + region.height;
    drag.current = { mode: inside ? "move" : "draw", startX: p.x, startY: p.y, original: region };
    if (!inside) onRegionChange({ x: p.x, y: p.y, width: 0, height: 0 });
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const p = point(event);
    if (current.mode === "move" && current.original) {
      onRegionChange({ ...current.original, x: clamp(Math.min(1 - current.original.width, current.original.x + p.x - current.startX)), y: clamp(Math.min(1 - current.original.height, current.original.y + p.y - current.startY)) });
    } else {
      onRegionChange({ x: Math.min(p.x, current.startX), y: Math.min(p.y, current.startY), width: Math.abs(p.x - current.startX), height: Math.abs(p.y - current.startY) });
    }
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    onPointerMove(event);
    const p = point(event);
    if (current.mode === "draw" && (Math.abs(p.x - current.startX) < 0.03 || Math.abs(p.y - current.startY) < 0.03)) onRegionChange(current.original);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className="selection-canvas relative mx-auto mt-5 w-full max-w-[390px] overflow-hidden rounded-lg bg-slate-200 shadow-lg" style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerUp}>
    <img src={imageUrl} alt="Ảnh nền để chọn vùng video" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />
    {region && region.width > 0 && region.height > 0 && <div className="pointer-events-none absolute border-2 border-blue-400 bg-blue-500/20 shadow-[0_0_0_9999px_#0f172a55]" style={{ left: `${region.x * 100}%`, top: `${region.y * 100}%`, width: `${region.width * 100}%`, height: `${region.height * 100}%` }}>
      {videoUrl && <video ref={videoRef} key={videoUrl} src={videoUrl} playsInline className="pointer-events-none h-full w-full object-cover" onTimeUpdate={event => { if (event.currentTarget.currentTime >= end && end > start) event.currentTarget.pause(); }} />}
      <span className="absolute -left-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" /><span className="absolute -right-1 -top-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" /><span className="absolute -bottom-1 -left-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" /><span className="absolute -bottom-1 -right-1 h-3 w-3 rounded-full border-2 border-white bg-blue-600" />
    </div>}
  </div>;
}
