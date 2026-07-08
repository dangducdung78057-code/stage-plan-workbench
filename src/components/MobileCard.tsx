import { cn } from "@/lib/utils";

export function MobileCardList({
  children,
  className,
  empty,
}: {
  children?: React.ReactNode;
  className?: string;
  empty?: React.ReactNode;
}) {
  const hasChildren = Array.isArray(children) ? children.length > 0 : !!children;
  return (
    <ul className={cn("md:hidden space-y-2 p-3", className)}>
      {hasChildren ? children : (
        <li className="text-center text-xs text-muted-foreground py-6">{empty ?? "暂无数据"}</li>
      )}
    </ul>
  );
}

export function MobileCard({
  title,
  right,
  children,
  className,
  footer,
}: {
  title?: React.ReactNode;
  right?: React.ReactNode;
  children?: React.ReactNode;
  className?: string;
  footer?: React.ReactNode;
}) {
  return (
    <li className={cn("panel p-3 min-w-0", className)}>
      {(title || right) && (
        <div className="flex items-start justify-between gap-3 mb-2 min-w-0">
          {title && <div className="text-sm font-medium break-words min-w-0 flex-1">{title}</div>}
          {right && <div className="shrink-0">{right}</div>}
        </div>
      )}
      {children && <div className="space-y-1">{children}</div>}
      {footer && <div className="mt-2 pt-2 border-t flex items-center gap-3 flex-wrap">{footer}</div>}
    </li>
  );
}

export function MobileField({
  label,
  value,
  mono,
  stack,
}: {
  label: React.ReactNode;
  value: React.ReactNode;
  mono?: boolean;
  stack?: boolean;
}) {
  if (stack) {
    return (
      <div className="min-w-0">
        <div className="text-[11px] text-muted-foreground">{label}</div>
        <div className={cn("text-xs break-words", mono && "font-mono")}>{value}</div>
      </div>
    );
  }
  return (
    <div className="flex items-baseline justify-between gap-3 min-w-0">
      <span className="text-[11px] text-muted-foreground whitespace-nowrap shrink-0">{label}</span>
      <span className={cn("text-xs text-right break-words min-w-0", mono && "font-mono")}>{value}</span>
    </div>
  );
}
