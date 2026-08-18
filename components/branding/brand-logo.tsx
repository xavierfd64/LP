"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Single shared logo/favicon-preview renderer for every branded surface
 * (Login/Sign Up layout, Customer Portal header + sidebar, Admin/Staff
 * header + sidebar, public Tracking, documents). Previously this same
 * `settings.logoPath ? <Image ... /> : <initial-letter div>` ternary was
 * duplicated across 7+ files with no fallback if the configured URL ever
 * broke — which is exactly what happens on a redeploy here, since uploaded
 * files live under public/uploads on a filesystem that isn't persisted
 * across deploys. A plain <img> (not next/image) is used deliberately:
 * next/image requires external hosts to be allow-listed in next.config,
 * which would defeat the point of letting Admin paste any logo URL.
 *
 * Renders the business's first initial in a solid tile whenever no logo is
 * configured OR the configured src fails to load — never a broken-image
 * icon (spec item 53).
 */
export function BrandLogo({
  src,
  alt,
  size = 40,
  className,
  imgClassName,
  rounded = "rounded-md",
}: {
  src?: string | null;
  alt: string;
  size?: number;
  className?: string;
  imgClassName?: string;
  rounded?: string;
}) {
  const [errored, setErrored] = useState(false);
  const showFallback = !src || errored;

  if (showFallback) {
    return (
      <div
        className={cn("flex shrink-0 items-center justify-center bg-brand-600 font-bold text-white", rounded, className)}
        style={{ width: size, height: size, fontSize: Math.max(12, size * 0.4) }}
      >
        {alt.charAt(0).toUpperCase() || "L"}
      </div>
    );
  }

  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      width={size}
      height={size}
      onError={() => setErrored(true)}
      className={cn("shrink-0 object-contain", rounded, imgClassName, className)}
      style={{ width: size, height: size }}
    />
  );
}
