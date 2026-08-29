import { Card, CardHeader, CardContent } from "@/components/ui/card";
import { SectionHeader } from "@/components/dashboard/section-header";
import { cn } from "@/lib/utils";

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

/** Real current-month calendar (today's actual date, not a static mockup)
 * with today highlighted and a small dot on any date this Graphic Artist
 * has a design job due — the closest real-data equivalent of the
 * reference illustration's "Today's Schedule" panel. */
export function MiniMonthCalendar({ dueDates }: { dueDates: Date[] }) {
  const today = new Date();
  const year = today.getFullYear();
  const month = today.getMonth();
  const monthLabel = today.toLocaleDateString("en-US", { month: "long", year: "numeric" });

  const dueDays = new Set(dueDates.filter((d) => d.getFullYear() === year && d.getMonth() === month).map((d) => d.getDate()));

  const firstOfMonth = new Date(year, month, 1);
  const startWeekday = firstOfMonth.getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const daysInPrevMonth = new Date(year, month, 0).getDate();

  const cells: { day: number; inMonth: boolean }[] = [];
  for (let i = startWeekday - 1; i >= 0; i--) cells.push({ day: daysInPrevMonth - i, inMonth: false });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ day: d, inMonth: true });
  while (cells.length % 7 !== 0 || cells.length < 42) cells.push({ day: cells.length - startWeekday - daysInMonth + 1, inMonth: false });

  return (
    <Card>
      <CardHeader>
        <SectionHeader title={`Today's Schedule — ${monthLabel}`} />
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-7 gap-1 text-center text-xs">
          {WEEKDAYS.map((w) => (
            <div key={w} className="py-1 font-medium text-slate-400">
              {w}
            </div>
          ))}
          {cells.map((c, i) => {
            const isToday = c.inMonth && c.day === today.getDate();
            const hasDue = c.inMonth && dueDays.has(c.day);
            return (
              <div
                key={i}
                className={cn(
                  "relative flex h-7 items-center justify-center rounded-full",
                  !c.inMonth && "text-slate-300",
                  c.inMonth && !isToday && "text-slate-700",
                  isToday && "bg-brand-600 font-semibold text-white"
                )}
              >
                {c.day}
                {hasDue && !isToday && <span className="absolute bottom-0.5 h-1 w-1 rounded-full bg-brand-500" />}
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
