import { Card, CardContent } from "@/components/ui/card";

export default function ProductionQueuePage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-slate-900">Production Queue</h1>
      <Card>
        <CardContent className="py-10 text-center text-slate-400">
          The production queue is being built in a later phase.
        </CardContent>
      </Card>
    </div>
  );
}
