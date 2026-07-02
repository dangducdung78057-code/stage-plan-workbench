import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ToneBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobileCard, MobileCardList, MobileField } from "@/components/MobileCard";

type Row = {
  id: string; project_id: string; version: number; format: string;
  payload: string; created_at: string;
};

export default function Exports() {
  const [rows, setRows] = useState<Row[]>([]);
  const [projectTitles, setProjectTitles] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Row | null>(null);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("export_records").select("*").order("created_at", { ascending: false });
      setRows((data as Row[]) ?? []);
      const ids = Array.from(new Set((data ?? []).map((r: any) => r.project_id)));
      if (ids.length) {
        const { data: ps } = await supabase.from("projects").select("id,title").in("id", ids);
        setProjectTitles(Object.fromEntries((ps ?? []).map((p: any) => [p.id, p.title])));
      }
    })();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">导出记录</h1>
        <p className="text-sm text-muted-foreground">所有历史导出的 JSON / Markdown 载荷。</p>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-semibold">全部记录</h2>
          <span className="kbd-route">GET /export</span>
        </div>
        <div className="overflow-x-auto"><table className="ops-table">
          <thead>
            <tr>
              <th>项目</th><th>版本</th><th>格式</th><th>时间</th><th>大小</th><th className="w-24">操作</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 && <tr><td colSpan={6} className="text-center text-muted-foreground py-8">暂无导出记录</td></tr>}
            {rows.map((r) => (
              <tr key={r.id}>
                <td>{projectTitles[r.project_id] ?? r.project_id.slice(0, 8)}</td>
                <td className="font-mono">v{r.version}</td>
                <td><ToneBadge tone={r.format === "json" ? "info" : "primary"}>{r.format}</ToneBadge></td>
                <td className="font-mono text-xs text-muted-foreground">{new Date(r.created_at).toLocaleString("zh-CN", { hour12: false })}</td>
                <td className="font-mono text-xs">{r.payload.length} B</td>
                <td><Button variant="ghost" size="sm" onClick={() => setOpen(r)}>查看</Button></td>
              </tr>
            ))}
          </tbody>
        </table></div>
      </div>
      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>导出内容 · {open?.format.toUpperCase()} v{open?.version}</DialogTitle></DialogHeader>
          <pre className="text-xs bg-surface-muted p-3 rounded font-mono whitespace-pre-wrap break-all">{open?.payload}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
