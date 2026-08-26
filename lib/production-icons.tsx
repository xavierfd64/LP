import { Pencil, Printer, Wrench, Shirt, CheckCircle2, Layers, PackageCheck, Scissors, CreditCard, Image as ImageIcon, Tag, Package, type LucideIcon } from "lucide-react";
import { READY_COLUMN } from "@/lib/production-board-types";

/**
 * Keyword-matched icon for a workflow stage or service name (Production UI
 * corrective pass, spec item 5's icon audit: "each production stage must
 * have the correct identity and icon"). Stage/service names are
 * admin-configured free text (Workflow Templates, Service Master) — there
 * is no fixed enum to switch on — so this matches on substrings of the
 * REAL configured name rather than hardcoding "the" universal workflow.
 * Falls back to a neutral generic icon for anything unrecognized, so a
 * newly-named stage/service never renders with no icon at all.
 */
const KEYWORD_ICONS: [RegExp, LucideIcon][] = [
  [/design/i, Pencil],
  [/print/i, Printer],
  [/press|fabricat|install/i, Wrench],
  [/sew|jersey|shirt|uniform/i, Shirt],
  [/quality|\bqc\b/i, CheckCircle2],
  [/sort/i, Layers],
  [/cut|finish/i, Scissors],
  [/pack/i, PackageCheck],
  [/card/i, CreditCard],
  [/sign|tarpaulin|banner/i, ImageIcon],
  [/sticker|label/i, Tag],
];

function iconForName(name: string): LucideIcon {
  if (name === READY_COLUMN) return PackageCheck;
  for (const [re, Icon] of KEYWORD_ICONS) {
    if (re.test(name)) return Icon;
  }
  return Package;
}

/**
 * Renders the matched icon directly, rather than handing callers a
 * component reference to render themselves — a capitalized variable
 * picked dynamically inside a component's render body and then used as a
 * JSX tag trips `react-hooks/static-components` (React can't tell it's
 * "the same" component across renders). Resolving and rendering it here,
 * inside a plain (non-component) helper, sidesteps that entirely: callers
 * just get back a ReactNode.
 */
export function renderStageIcon(name: string, className?: string) {
  const Icon = iconForName(name);
  return <Icon className={className} />;
}
