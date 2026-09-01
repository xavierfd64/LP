"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";
import { X, Camera, KeyboardIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

/**
 * Mobile/tablet in-app QR scanner (LP System Update Part 5) — opens the
 * device camera, decodes frames with jsQR (works everywhere via canvas,
 * no reliance on the still-Safari-unsupported native BarcodeDetector
 * API), and hands the raw decoded text back to the caller, which already
 * knows how to tell an LP document URL apart from a bare reference number
 * (see lib/scan-utils.ts) — this component only scans, it doesn't
 * interpret. Camera-permission denial (or no camera / insecure context)
 * falls back to a manual text-entry field rather than a dead screen, per
 * the explicit "do not leave the user on a broken/blank screen"
 * requirement.
 */
export function QrScannerModal({ onClose, onScan }: { onClose: () => void; onScan: (value: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [manualValue, setManualValue] = useState("");
  const scannedRef = useRef(false);

  useEffect(() => {
    let cancelled = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setError("Camera scanning isn't supported in this browser.");
        return;
      }
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }
        streamRef.current = stream;
        const video = videoRef.current;
        if (!video) return;
        video.srcObject = stream;
        await video.play();
        tick();
      } catch {
        if (!cancelled) setError("Couldn't access the camera. Check camera permission for this site, or enter the code below instead.");
      }
    }

    function tick() {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || scannedRef.current) return;
      if (video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const ctx = canvas.getContext("2d");
        if (ctx) {
          ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
          const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
          const result = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: "dontInvert" });
          if (result?.data) {
            scannedRef.current = true;
            onScan(result.data);
            return;
          }
        }
      }
      rafRef.current = requestAnimationFrame(tick);
    }

    start();

    return () => {
      cancelled = true;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
      streamRef.current?.getTracks().forEach((t) => t.stop());
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4" role="dialog" aria-modal="true">
      <div className="w-full max-w-sm rounded-lg bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">Scan QR Code</h2>
          <button type="button" onClick={onClose} aria-label="Close" className="text-slate-400 hover:text-slate-700">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-4">
          {!error ? (
            <div className="relative overflow-hidden rounded-md bg-slate-900">
              <video ref={videoRef} className="aspect-square w-full object-cover" muted playsInline autoPlay />
              <canvas ref={canvasRef} className="hidden" />
              <div className="pointer-events-none absolute inset-6 rounded-lg border-2 border-white/70" />
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 rounded-md border border-slate-200 bg-slate-50 px-4 py-6 text-center">
              <Camera className="h-6 w-6 text-slate-400" />
              <p className="text-sm text-slate-600">{error}</p>
            </div>
          )}

          <div className="mt-4 space-y-2">
            <label className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
              <KeyboardIcon className="h-3.5 w-3.5" /> Or enter the code manually
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (manualValue.trim()) onScan(manualValue.trim());
              }}
              className="flex gap-2"
            >
              <Input
                value={manualValue}
                onChange={(e) => setManualValue(e.target.value)}
                placeholder="2026-0829-0010"
                autoFocus={!!error}
              />
              <Button type="submit" size="sm" disabled={!manualValue.trim()}>
                Go
              </Button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
