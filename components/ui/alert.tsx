import { cn } from "@/lib/utils";

export function Alert({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "error" | "warning" | "success";
  children: React.ReactNode;
  className?: string;
}) {
  // Reads the same customizable Success/Warning/Error/Info design tokens
  // as Badge/StatusBadge (components/ui/badge.tsx) instead of hardcoded
  // Tailwind color literals — previously these were out of sync, so an
  // Admin's color customization (or a theme switch) recolored every status
  // badge but not alerts. border-*-600/30 (an opacity modifier on the
  // solid token) since no dedicated "-200" border shade exists for these
  // semantic tokens.
  const toneClasses = {
    info: "bg-info-100 text-info-800 border-info-600/30",
    error: "bg-error-100 text-error-800 border-error-600/30",
    warning: "bg-warning-100 text-warning-800 border-warning-600/30",
    success: "bg-success-100 text-success-800 border-success-600/30",
  }[tone];

  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", toneClasses, className)}>{children}</div>
  );
}
