"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Radar, Truck, Droplets, Printer as PrinterIcon, CheckCircle2, Lightbulb } from "lucide-react";
import { BrandLogo } from "@/components/branding/brand-logo";
import { cn } from "@/lib/utils";

type StageDef = { label: string; sub: string; icon: typeof FileText; threshold: number };

const STAGES: StageDef[] = [
  { label: "Preparing", sub: "Getting things ready", icon: FileText, threshold: 0 },
  { label: "Processing", sub: "Processing data", icon: Droplets, threshold: 28 },
  { label: "Printing", sub: "Printing documents", icon: PrinterIcon, threshold: 58 },
  { label: "Finalizing", sub: "Almost done", icon: CheckCircle2, threshold: 88 },
];

/**
 * Login loading screen (Aug 28 corrective update) — visual reference is the
 * attached illustration; branding is never hard-coded. Mounted by
 * login-form.tsx only while useActionState's own `pending` is true, so its
 * lifetime is tied to the real signIn() -> "/" -> role-dashboard redirect
 * chain already in place (see app/actions/auth.ts, app/page.tsx) — no
 * separate timer decides when this disappears, only the real transition
 * finishing (this component unmounting). The internal progress percentage
 * is an honest "still working" indicator (creeps toward ~92%, easing off
 * the same way a real network-bound progress bar would, e.g. NProgress) —
 * it never claims 100%/completion on its own, and never delays the actual
 * redirect by even one tick.
 */
export function LoginLoadingScreen({
  businessName,
  tagline,
  logoPath,
}: {
  businessName: string;
  tagline: string | null;
  logoPath: string | null;
}) {
  const [progress, setProgress] = useState(6);
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const id = setInterval(() => {
      setProgress((p) => {
        if (p >= 92) return p;
        const remaining = 92 - p;
        return Math.min(92, p + Math.max(0.6, remaining * 0.08));
      });
    }, 120);
    return () => clearInterval(id);
  }, []);

  if (!mounted || typeof document === "undefined") return null;

  const currentStageIndex = STAGES.reduce((idx, s, i) => (progress >= s.threshold ? i : idx), 0);
  const year = new Date().getFullYear();

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[100] flex h-[100dvh] items-center justify-center overflow-y-auto bg-slate-50 px-4 py-8 sm:px-6">
      <div className="w-full max-w-lg space-y-5 text-center">
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-2.5">
            <BrandLogo src={logoPath} alt={businessName} size={40} rounded="rounded-xl" />
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">{businessName}</h1>
          </div>
          <p className="text-sm text-slate-500">{tagline || "Business Management System"}</p>
        </div>

        <div className="flex items-center justify-center gap-2.5 text-xs font-medium text-slate-500 sm:gap-3 sm:text-sm">
          <span className="flex items-center gap-1.5">
            <FileText className="h-3.5 w-3.5 text-brand-600 sm:h-4 sm:w-4" /> Print.
          </span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1.5">
            <Radar className="h-3.5 w-3.5 text-brand-600 sm:h-4 sm:w-4" /> Track.
          </span>
          <span className="text-slate-300">|</span>
          <span className="flex items-center gap-1.5">
            <Truck className="h-3.5 w-3.5 text-brand-600 sm:h-4 sm:w-4" /> Deliver.
          </span>
        </div>
        <div className="mx-auto h-px w-full max-w-xs bg-slate-200" />

        <PrinterGraphic businessName={businessName} logoPath={logoPath} progress={progress} />

        <div>
          <p className="text-base font-bold text-slate-900 sm:text-lg">Printing in progress…</p>
          <p className="mt-1 text-sm text-slate-500">Please wait while we prepare your workspace.</p>
        </div>

        <div className="flex items-center gap-3">
          <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
            <div
              className="h-full rounded-full bg-brand-600 transition-[width] duration-150 ease-out"
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <span className="w-10 shrink-0 text-right text-sm font-medium text-slate-600 tabular-nums">
            {Math.round(Math.min(progress, 100))}%
          </span>
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-3 rounded-xl border border-slate-200 bg-white p-3 text-left sm:grid-cols-4 sm:p-4">
          {STAGES.map((s, i) => {
            const isActive = i === currentStageIndex;
            const isDone = i < currentStageIndex;
            const Icon = s.icon;
            return (
              <div key={s.label} className="flex items-center gap-2 sm:flex-col sm:items-center sm:gap-1.5 sm:text-center">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors",
                    isDone || isActive ? "bg-brand-600 text-white" : "bg-slate-200 text-slate-400"
                  )}
                >
                  <Icon className="h-4 w-4" />
                </span>
                <span className="min-w-0">
                  <span className={cn("block truncate text-xs font-semibold", isActive || isDone ? "text-slate-900" : "text-slate-400")}>
                    {s.label}
                  </span>
                  <span className="block truncate text-[11px] text-slate-400">{s.sub}</span>
                </span>
              </div>
            );
          })}
        </div>

        <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-3.5 text-left sm:p-4">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-600">
            <Lightbulb className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-slate-900">Did you know?</p>
            <p className="text-sm text-slate-500">You can track your orders in real-time from the Production Board.</p>
          </div>
        </div>

        <p className="text-xs text-slate-400">
          © {year} {businessName}. All rights reserved.
        </p>
      </div>
    </div>,
    document.body
  );
}

function PrinterGraphic({ businessName, logoPath, progress }: { businessName: string; logoPath: string | null; progress: number }) {
  return (
    // A fixed-height box that fully contains both layers itself (nothing
    // escapes above/below it into the sections before/after) — the mini
    // flyer sits in the top slice, the printer body in the bottom slice,
    // with just enough overlap between them to read as "paper feeding out
    // of the printer" rather than two unrelated shapes.
    <div className="relative mx-auto h-44 w-full max-w-xs sm:h-52 sm:max-w-sm">
      <div className="absolute top-0 left-1/2 z-0 w-36 -translate-x-1/2 rotate-[6deg] rounded-sm bg-white p-2 text-left shadow-md sm:w-44">
        <div className="flex items-center gap-1.5">
          <BrandLogo src={logoPath} alt={businessName} size={14} rounded="rounded-sm" />
          <span className="truncate text-[10px] font-bold text-slate-900">{businessName}</span>
        </div>
        <p className="mt-1 text-[9px] font-semibold leading-tight text-slate-700">
          High Quality
          <br />
          Print Solutions
        </p>
        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-slate-100">
          <div className="h-full bg-brand-500 transition-[width] duration-150" style={{ width: `${Math.min(progress, 100)}%` }} />
        </div>
      </div>

      <div className="absolute bottom-0 left-1/2 z-10 flex h-20 w-full -translate-x-1/2 items-center justify-between rounded-2xl bg-slate-800 px-3.5 shadow-lg sm:h-24 sm:px-5">
        <div className="h-7 w-9 rounded bg-slate-700 ring-1 ring-inset ring-slate-600 sm:h-9 sm:w-11" />
        <div className="flex gap-1.5 sm:gap-2">
          {["bg-white", "bg-pink-500", "bg-cyan-400", "bg-yellow-400"].map((c, i) => (
            <span key={i} className={cn("h-8 w-2 rounded-sm sm:h-10 sm:w-2.5", c)} />
          ))}
        </div>
      </div>
    </div>
  );
}
