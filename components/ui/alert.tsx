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
  const toneClasses = {
    info: "bg-blue-50 text-blue-800 border-blue-200",
    error: "bg-red-50 text-red-800 border-red-200",
    warning: "bg-yellow-50 text-yellow-800 border-yellow-200",
    success: "bg-green-50 text-green-800 border-green-200",
  }[tone];

  return (
    <div className={cn("rounded-md border px-4 py-3 text-sm", toneClasses, className)}>{children}</div>
  );
}
