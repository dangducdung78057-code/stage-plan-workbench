import { useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/StatusBadge";
import { matchCandidates, type PlanItem, type MatchContext } from "@/lib/procurementMatch";
import { PLATFORM_LABELS } from "@/lib/procurementCatalog";

export function ProcurementCandidatesToggle({
  item, ctx,
}: { item: PlanItem; ctx: MatchContext }) {
  const [open, setOpen] = useState(false);
  const candidates = open ? matchCandidates(item, ctx) : [];
  return (
    <>
      <Button
        type="button"
        size="sm"
        variant="ghost"
        className="h-6 px-2 text-[11px] gap-1"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3 w-3" /> : <ChevronRight className="h-3 w-3" />}
        候选
      </Button>
      {open && (
        <div className="mt-2 space-y-2 rounded-md border border-dashed border-border bg-muted/30 p-2">
          {candidates.map((c, i) => (
            <div key={i} className="rounded border border-border bg-background p-2 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <ToneBadge tone="info">{PLATFORM_LABELS[c.platform]}</ToneBadge>
                  <span className="font-medium truncate">{c.title}</span>
                </div>
                <span className="font-mono tabular-nums text-muted-foreground shrink-0">¥{c.estimatedPrice}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">
                <span className="font-mono">{c.keyword}</span>
              </div>
              <div className="mt-1 text-[11px] text-muted-foreground">匹配：{c.matchReason}</div>
              <div className="text-[11px] text-amber-600 dark:text-amber-400">风险：{c.riskNote}</div>
              {c.url && (
                <a
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                >
                  打开搜索页 <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

export function ProcurementDisclaimer() {
  return (
    <div className="panel border-dashed">
      <div className="panel-body flex items-start gap-2 text-xs">
        <ShoppingBag className="h-4 w-4 text-muted-foreground shrink-0 mt-0.5" />
        <div className="text-muted-foreground">
          <strong className="text-foreground">采购候选 v1 · 只读</strong>：候选商品为模拟/检索建议，非实时库存价格，需人工核验。不自动下单、不承诺库存或价格。
        </div>
      </div>
    </div>
  );
}
