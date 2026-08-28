"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { BrandLogo } from "@/components/branding/brand-logo";
import { cn } from "@/lib/utils";

const ICON_BASE = "/branding/loading";

type StageDef = { label: string; sub: string; icon: string; threshold: number };

// The exact supplied step icons (Aug 29 asset-fidelity corrective update) —
// never substituted for generic ones. Rendered inside a filled circle, so
// each is forced to solid white via a CSS filter (brightness(0) invert(1))
// rather than by editing the SVG file itself — the provided assets are red-
// stroke-on-transparent line art, unmodified on disk; only how they're
// *displayed* against a colored badge changes.
const STAGES: StageDef[] = [
  { label: "Preparing", sub: "Getting things ready", icon: `${ICON_BASE}/icon-document.svg`, threshold: 0 },
  { label: "Processing", sub: "Processing data", icon: `${ICON_BASE}/icon-processing.svg`, threshold: 28 },
  { label: "Printing", sub: "Printing documents", icon: `${ICON_BASE}/icon-printer.svg`, threshold: 58 },
  { label: "Finalizing", sub: "Almost done", icon: `${ICON_BASE}/icon-finalizing.svg`, threshold: 88 },
];

/**
 * Login loading screen (Aug 28/29 corrective updates) — visual reference is
 * the supplied reference_loading_desktop.png/reference_loading_mobile.png,
 * built with the supplied printer/icon assets verbatim; branding is never
 * hard-coded. Mounted by login-form.tsx only while useActionState's own
 * `pending` is true, so its lifetime is tied to the real signIn() -> "/" ->
 * role-dashboard redirect chain already in place (see app/actions/auth.ts,
 * app/page.tsx) — no separate timer decides when this disappears, only the
 * real transition finishing (this component unmounting). The internal
 * progress percentage is an honest "still working" indicator (creeps toward
 * ~92%, easing off the same way a real network-bound progress bar would,
 * e.g. NProgress) — it never claims 100%/completion on its own, and never
 * delays the actual redirect by even one tick.
 *
 * Fit-to-viewport (Aug 29 corrective update #2): the composition's natural
 * height can exceed common laptop viewports (1366x768 etc. once browser
 * chrome is subtracted), which previously forced scrolling and pushed the
 * stages/tip/footer below the fold. Rather than shrinking individual
 * elements by guesswork, the whole block is measured and, only if it
 * doesn't fit, uniformly scaled down as one unit — every proportion,
 * spacing ratio, and the approved hierarchy stay exactly as designed, just
 * smaller. On any viewport tall enough for the natural size, scale is 1 and
 * nothing changes.
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
  const contentRef = useRef<HTMLDivElement>(null);
  const [fit, setFit] = useState<{ scale: number; height: number | undefined }>({ scale: 1, height: undefined });

  useEffect(() => setMounted(true), []);

  // Lock body scroll while this full-viewport overlay is up — the login
  // form underneath stays mounted (just visually covered), and at narrow
  // viewports its own natural height can exceed the screen, which would
  // otherwise let the (invisible) page behind the overlay scroll.
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

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

  useLayoutEffect(() => {
    if (!mounted) return;
    function recompute() {
      const el = contentRef.current;
      if (!el) return;
      // scrollHeight always reflects the element's untransformed layout
      // box — CSS transform is purely visual/compositing and never
      // affects layout, so no reset-before-measure is needed (an earlier
      // version imperatively reset el.style.transform here, which could
      // race with React's own declarative write of the same property and
      // leave it stuck once two recomputes landed on the same scale).
      const natural = el.scrollHeight;
      const available = window.innerHeight - 16;
      const scale = Math.min(1, available / natural);
      setFit({ scale, height: natural * scale });
    }
    recompute();
    const ro = new ResizeObserver(recompute);
    if (contentRef.current) ro.observe(contentRef.current);
    window.addEventListener("resize", recompute);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", recompute);
    };
  }, [mounted]);

  if (!mounted || typeof document === "undefined") return null;

  const shown = Math.round(Math.min(progress, 100));
  const currentStageIndex = STAGES.reduce((idx, s, i) => (progress >= s.threshold ? i : idx), 0);
  const year = new Date().getFullYear();

  return createPortal(
    <div className="fixed inset-x-0 top-0 z-[100] flex h-[100dvh] items-center justify-center overflow-y-auto bg-slate-50 px-4 py-2 sm:px-6">
      <div className="mx-auto w-full" style={{ maxWidth: "42rem", height: fit.height }}>
        <div
          ref={contentRef}
          className="w-full space-y-4 text-center"
          style={{ transform: `scale(${fit.scale})`, transformOrigin: "top center" }}
        >
          <div className="flex flex-col items-center gap-1.5">
            <div className="flex items-center gap-2.5">
              <BrandLogo src={logoPath} alt={businessName} size={36} rounded="rounded-xl" />
              <h1 className="text-lg font-bold text-slate-900 sm:text-2xl">{businessName}</h1>
            </div>
            <p className="text-sm text-slate-500">{tagline || "Business Management System"}</p>
          </div>

          <div className="flex items-center justify-center gap-2.5 text-xs font-medium text-slate-500 sm:gap-3 sm:text-sm">
            <span className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ICON_BASE}/icon-document.svg`} alt="" className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Print.
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ICON_BASE}/icon-track.svg`} alt="" className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Track.
            </span>
            <span className="text-slate-300">|</span>
            <span className="flex items-center gap-1.5">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ICON_BASE}/icon-delivery.svg`} alt="" className="h-3.5 w-3.5 sm:h-4 sm:w-4" /> Deliver.
            </span>
          </div>
          <div className="mx-auto h-px w-full max-w-xs bg-slate-200" />

          <PrinterGraphic businessName={businessName} logoPath={logoPath} />

          <div>
            <p className="text-base font-bold text-slate-900 sm:text-lg">Printing in progress…</p>
            <p className="mt-1 text-sm text-slate-500">Please wait while we prepare your workspace.</p>
          </div>

          <div className="mx-auto flex max-w-lg items-center gap-3">
            <div className="h-2.5 flex-1 overflow-hidden rounded-full bg-slate-200">
              <div
                className="h-full rounded-full bg-brand-600 transition-[width] duration-150 ease-out"
                style={{ width: `${shown}%` }}
              />
            </div>
            <span className="w-10 shrink-0 text-right text-sm font-medium text-slate-600 tabular-nums">{shown}%</span>
          </div>

          <StageRow stages={STAGES} currentStageIndex={currentStageIndex} />

          <div className="mx-auto flex max-w-lg items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left sm:p-4">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={`${ICON_BASE}/icon-tip.svg`} alt="" className="h-4 w-4" />
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
      </div>
    </div>,
    document.body
  );
}

function StageIcon({ src, active }: { src: string; active: boolean }) {
  return (
    <span
      className={cn(
        "flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition-colors sm:h-9 sm:w-9",
        active ? "bg-brand-600" : "bg-slate-300"
      )}
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={src} alt="" className="h-4 w-4" style={{ filter: "brightness(0) invert(1)" }} />
    </span>
  );
}

function StageRow({ stages, currentStageIndex }: { stages: StageDef[]; currentStageIndex: number }) {
  return (
    <div className="mx-auto max-w-lg rounded-xl border border-slate-200 bg-white p-3 text-left sm:p-4">
      {/* Tablet/desktop: one horizontal row with dotted connectors, matching
          the desktop reference. */}
      <div className="hidden sm:flex sm:items-start">
        {stages.map((s, i) => {
          const isActive = i <= currentStageIndex;
          return (
            <div key={s.label} className="flex flex-1 items-start">
              <div className="flex min-w-0 flex-col items-center gap-1.5 text-center">
                <StageIcon src={s.icon} active={isActive} />
                <span className={cn("block truncate text-xs font-semibold", isActive ? "text-slate-900" : "text-slate-400")}>
                  {s.label}
                </span>
                <span className="block truncate text-[11px] text-slate-400">{s.sub}</span>
              </div>
              {i < stages.length - 1 && <div className="mt-4 min-w-4 flex-1 border-t-2 border-dotted border-slate-300" />}
            </div>
          );
        })}
      </div>

      {/* Mobile: vertical list with a dotted connector — an intentionally
          different layout from the desktop row, not just a shrink, matching
          the compact mobile reference. */}
      <div className="flex flex-col sm:hidden">
        {stages.map((s, i) => {
          const isActive = i <= currentStageIndex;
          return (
            <div key={s.label} className="flex gap-3">
              <div className="flex flex-col items-center">
                <StageIcon src={s.icon} active={isActive} />
                {i < stages.length - 1 && <div className="my-1 w-0 flex-1 border-l-2 border-dotted border-slate-300" />}
              </div>
              <div className="min-w-0 pb-3">
                <span className={cn("block text-sm font-semibold", isActive ? "text-slate-900" : "text-slate-400")}>{s.label}</span>
                <span className="block text-xs text-slate-400">{s.sub}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * The supplied printer-transparent.png used verbatim (never redrawn/
 * substituted) for the machine body, ink cartridges, and decorative
 * triangle/dot-pattern flourish. Only the sample "Let's Print / High
 * Quality Print Solutions" mockup label baked into that image's paper area
 * is patched over with a plain white panel carrying the real, dynamic
 * logo + business name in the same position — the one part of this asset
 * that is business identity, not decoration, and the spec is explicit that
 * it must never stay hard-coded. Position/size are percentages of the
 * image's own 861x348 box, measured directly against the source file, so
 * the patch tracks the image exactly as it scales across breakpoints.
 */
function PrinterGraphic({ businessName, logoPath }: { businessName: string; logoPath: string | null }) {
  return (
    <div className="relative mx-auto w-full max-w-sm sm:max-w-xl">
      <div className="relative w-full" style={{ aspectRatio: "861 / 348" }}>
        {/* Decorative dot-pattern flourish flanking the printer, matching
            the approved reference composition — this is a background layer
            behind the printer image, not part of the supplied PNG itself
            (confirmed against the raw asset), so it's added here in pure
            CSS rather than by editing/redrawing printer-transparent.png. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-[22%] opacity-70"
          style={{
            backgroundImage: "radial-gradient(circle, #E52323 1px, transparent 1.5px)",
            backgroundSize: "9px 9px",
            maskImage: "radial-gradient(ellipse 100% 75% at 100% 50%, black 0%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 100% 75% at 100% 50%, black 0%, transparent 75%)",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-[22%] opacity-70"
          style={{
            backgroundImage: "radial-gradient(circle, #E52323 1px, transparent 1.5px)",
            backgroundSize: "9px 9px",
            maskImage: "radial-gradient(ellipse 100% 75% at 0% 50%, black 0%, transparent 75%)",
            WebkitMaskImage: "radial-gradient(ellipse 100% 75% at 0% 50%, black 0%, transparent 75%)",
          }}
        />
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={`${ICON_BASE}/printer-transparent.png`}
          alt="Printer"
          className="relative h-full w-full select-none object-contain"
          draggable={false}
        />
        <div
          className="absolute flex flex-col justify-center overflow-hidden bg-white"
          style={{ left: "23%", top: "31%", width: "29%", height: "45%" }}
        >
          <div className="flex items-center gap-1 sm:gap-1.5">
            {/* Two literal sizes rendered per breakpoint (BrandLogo's `size` is a
                pixel number, not fluid) — same dual-render pattern already used
                elsewhere in this app for a size that must track a breakpoint. */}
            <span className="sm:hidden">
              <BrandLogo src={logoPath} alt={businessName} size={9} rounded="rounded-sm" />
            </span>
            <span className="hidden sm:inline-block">
              <BrandLogo src={logoPath} alt={businessName} size={14} rounded="rounded-sm" />
            </span>
            <span className="truncate text-[8px] font-bold text-slate-900 sm:text-[11px]">{businessName}</span>
          </div>
          <p className="mt-0.5 text-[7px] font-bold leading-tight text-slate-900 sm:mt-1 sm:text-[12px]">
            High Quality
            <br />
            Print Solutions
          </p>
          <p className="mt-0.5 truncate text-[6px] text-slate-500 sm:text-[9px]">Great designs. Sharp results.</p>
        </div>
      </div>
    </div>
  );
}
