"use client";

import { Button } from "@/components/ui/button";
import { togglePromotionActiveAction } from "@/app/actions/pricing";

export function TogglePromotionButton({ promotionId, active }: { promotionId: string; active: boolean }) {
  return (
    <form action={togglePromotionActiveAction.bind(null, promotionId)}>
      <Button type="submit" size="sm" variant={active ? "destructive" : "outline"}>
        {active ? "Deactivate" : "Activate"}
      </Button>
    </form>
  );
}
