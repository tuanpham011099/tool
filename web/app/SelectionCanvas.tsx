"use client";

import { useRef, type PointerEvent, type RefObject } from "react";

export type Region = { x: number; y: number; width: number; height: number };
type Mode = "draw" | "move" | "resize-top" | "resize-bottom";
type Drag = { mode: Mode; startY: number; original: Region | null };
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
  onRegionCommit: (region: Region) => void;
};

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const band = (y: number, height: number): Region => ({ x: 0, y, width: 1, height });

export default function SelectionCanvas({ imageUrl, imageWidth, imageHeight, videoUrl, videoRef, start, end, region, onRegionChange, onRegionCommit }: Props) {
  const drag = useRef<Drag | null>(null);
  function pointerY(event: PointerEvent<HTMLDivElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return clamp((event.clientY - bounds.top) / bounds.height);
  }
  function calculate(current: Drag, y: number): Region {
    const original = current.original;
    if (current.mode === "move" && original) return band(clamp(Math.min(1 - original.height, original.y + y - current.startY)), original.height);
    if (current.mode === "resize-top" && original) {
      const bottom = original.y + original.height;
      const top = Math.min(bottom - 0.03, y);
      return band(Math.max(0, top), bottom - Math.max(0, top));
    }
    if (current.mode === "resize-bottom" && original) return band(original.y, Math.max(0.03, Math.min(1 - original.y, y - original.y)));
    return band(Math.min(y, current.startY), Math.abs(y - current.startY));
  }
  function onPointerDown(event: PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const y = pointerY(event);
    let mode: Mode = "draw";
    if (region && region.height > 0) {
      const edge = Math.min(0.025, region.height / 4);
      if (Math.abs(y - region.y) < edge) mode = "resize-top";
      else if (Math.abs(y - region.y - region.height) < edge) mode = "resize-bottom";
      else if (y > region.y && y < region.y + region.height) mode = "move";
    }
    drag.current = { mode, startY: y, original: region };
    if (mode === "draw") onRegionChange(band(y, 0));
    event.currentTarget.setPointerCapture(event.pointerId);
  }
  function onPointerMove(event: PointerEvent<HTMLDivElement>) {
    if (drag.current) onRegionChange(calculate(drag.current, pointerY(event)));
  }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const current = drag.current;
    if (!current) return;
    const result = calculate(current, pointerY(event));
    const finalRegion = result.height < 0.03 ? current.original : result;
    onRegionChange(finalRegion);
    if (finalRegion && finalRegion.height >= 0.03) onRegionCommit(finalRegion);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  function onPointerCancel(event: PointerEvent<HTMLDivElement>) {
    onRegionChange(drag.current?.original || null);
    drag.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
  }
  return <div className="selection-canvas relative mx-auto mt-5 w-full max-w-[390px] overflow-hidden rounded-lg bg-slate-200 shadow-lg" style={{ aspectRatio: `${imageWidth} / ${imageHeight}` }} onPointerDown={onPointerDown} onPointerMove={onPointerMove} onPointerUp={onPointerUp} onPointerCancel={onPointerCancel}>
    <img src={imageUrl} alt="Ảnh nền để chọn chiều cao video" draggable={false} className="pointer-events-none absolute inset-0 h-full w-full select-none object-fill" />
    {region && region.height > 0 && <div className="pointer-events-none absolute left-0 w-full border-y-2 border-blue-400 bg-blue-500/20 shadow-[0_0_0_9999px_#0f172a55]" style={{ top: `${region.y * 100}%`, height: `${region.height * 100}%` }}>
      {videoUrl && <video ref={videoRef} key={videoUrl} src={videoUrl} playsInline className="pointer-events-none h-full w-full object-cover" onTimeUpdate={event => { if (event.currentTarget.currentTime >= end && end > start) event.currentTarget.pause(); }} />}
      <span className="absolute left-1/2 top-0 h-1.5 w-14 -translate-x-1/2 -translate-y-1/2 rounded-full bg-white shadow" />
      <span className="absolute bottom-0 left-1/2 h-1.5 w-14 -translate-x-1/2 translate-y-1/2 rounded-full bg-white shadow" />
    </div>}
  </div>;
}
