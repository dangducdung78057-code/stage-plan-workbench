import { Package, Loader2 } from "lucide-react";

export function FullPageLoader({ label = "正在恢复会话…" }: { label?: string }) {
  return (
    <div className="min-h-dvh bg-background text-foreground grid place-items-center p-6">
      <div className="flex flex-col items-center gap-3">
        <div className="h-10 w-10 rounded bg-primary grid place-items-center text-primary-foreground">
          <Package className="h-5 w-5" />
        </div>
        <div className="text-sm font-semibold">StageOS</div>
        <div className="text-[11px] font-mono text-muted-foreground">ops.costume.v2</div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground pt-1">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          <span>{label}</span>
        </div>
      </div>
    </div>
  );
}
