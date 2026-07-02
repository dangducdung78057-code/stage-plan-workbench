import { cn } from "@/lib/utils";
import { PROJECT_STATUSES, type ProjectStatus } from "@/lib/stageos";

const toneMap: Record<string, string> = {
  muted: "bg-muted text-muted-foreground border-border",
  info: "bg-info/10 text-info border-info/30",
  warning: "bg-warning/10 text-warning border-warning/30",
  success: "bg-success/10 text-success border-success/30",
  primary: "bg-primary/10 text-primary border-primary/30",
  destructive: "bg-destructive/10 text-destructive border-destructive/30",
};

export function StatusBadge({ status, className }: { status: ProjectStatus | string; className?: string }) {
  const meta = PROJECT_STATUSES.find((s) => s.value === status);
  const label = meta?.label ?? status;
  const tone = meta?.tone ?? "muted";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium",
        toneMap[tone],
        className,
      )}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current opacity-70" />
      {label}
    </span>
  );
}

export function ToneBadge({
  tone,
  children,
  className,
}: {
  tone: keyof typeof toneMap;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 px-1.5 py-0.5 rounded border text-[11px] font-medium",
        toneMap[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}
