import { useEffect, useState } from "react";
import { ChevronDown, ChevronRight, ExternalLink, ShoppingBag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/StatusBadge";
import { type PlanItem, type MatchContext } from "@/lib/procurementMatch";
import { PLATFORM_LABELS, type Candidate } from "@/lib/procurementCatalog";
import { searchWithFallback, type ProviderDisplayId, type ProviderWarningCode } from "@/lib/procurementProvider";

const PROVIDER_BADGE: Record<ProviderDisplayId, { label: string; tone: "success" | "info" | "warning" }> = {
  local: { label: "本地目录", tone: "success" },
  http: { label: "HTTP", tone: "info" },
  "http-mock": { label: "http-mock", tone: "info" },
  "fallback-local": { label: "fallback-local", tone: "warning" },
};

export function ProcurementCandidatesToggle({
  item, ctx,
}: { item: PlanItem; ctx: MatchContext }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [providerId, setProviderId] = useState<ProviderDisplayId>("local");
  const [fallbackUsed, setFallbackUsed] = useState(false);
  const [warning, setWarning] = useState<string | undefined>();
  const [warningCode, setWarningCode] = useState<ProviderWarningCode | undefined>();

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    searchWithFallback(item, ctx).then((r) => {
      if (cancelled) return;
      setCandidates(r.candidates);
      setProviderId(r.providerId);
      setFallbackUsed(r.fallbackUsed);
      setWarning(r.warning);
      setWarningCode(r.warningCode);
      setLoading(false);
    });
    return () => { cancelled = true; };
  }, [open]);

  const badge = PROVIDER_BADGE[providerId];

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
          <div className="flex items-center gap-2 text-[11px] text-muted-foreground flex-wrap">
            <span>来源</span>
            <ToneBadge tone={badge.tone}>{badge.label}</ToneBadge>
            {fallbackUsed && warningCode && (
              <ToneBadge tone="warning">{warningCode}</ToneBadge>
            )}
            {loading && <span>加载中…</span>}
          </div>
          {fallbackUsed && (
            <div className="rounded border border-amber-500/40 bg-amber-500/5 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
              {warning ?? "远程采购 provider 不可用，已回退到本地候选目录。"}
            </div>
          )}
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
          <strong className="text-foreground">采购候选 v3.2 · 只读</strong>：候选商品为模拟/检索建议，非实时库存价格，需人工核验。不自动下单、不承诺库存或价格。远程 provider 失败时会自动回退到本地目录；http-mock endpoint 仅供联调。
        </div>
      </div>
    </div>
  );
}
