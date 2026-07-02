import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { ToneBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { MobileCard, MobileCardList, MobileField } from "@/components/MobileCard";
import { useFlags } from "@/lib/featureFlags";
import {
  buildFilename,
  renderMarkdown,
  renderPrintableHtml,
  downloadBlob,
  openPrintWindow,
  canPrint,
} from "@/lib/exportRender";
import { toast } from "sonner";
import { FileDown, Printer, Eye, Loader2 } from "lucide-react";

type Row = {
  id: string; project_id: string; version: number; format: string;
  payload: string; created_at: string;
};

export default function Exports() {
  const [rows, setRows] = useState<Row[]>([]);
  const [projectTitles, setProjectTitles] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const flags = useFlags();

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

  async function guard(row: Row): Promise<boolean> {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { toast.error("请先登录"); return false; }
    if (!row.payload || row.payload.length === 0) {
      toast.error("暂无可下载载荷，请先导出。");
      return false;
    }
    const { data: p } = await supabase
      .from("projects")
      .select("user_id")
      .eq("id", row.project_id)
      .maybeSingle();
    if (!p || (p as any).user_id !== u.user.id) {
      toast.error("无权下载此记录");
      return false;
    }
    return true;
  }

  async function handleMarkdown(row: Row) {
    setBusy(row.id + ":md");
    try {
      if (!(await guard(row))) return;
      const title = projectTitles[row.project_id];
      const md = renderMarkdown(row.payload, row.format, {
        projectTitle: title,
        version: row.version,
        createdAt: new Date(row.created_at).toLocaleString("zh-CN", { hour12: false }),
      });
      const fn = buildFilename("md", title, row.version, row.project_id);
      downloadBlob(md, fn, "text/markdown;charset=utf-8");
      toast.success("Markdown 已开始下载");
    } catch (e) {
      console.error(e);
      toast.error("下载失败，请稍后重试");
    } finally {
      setBusy(null);
    }
  }

  async function handlePdf(row: Row) {
    setBusy(row.id + ":pdf");
    try {
      if (!(await guard(row))) return;
      if (!canPrint()) {
        toast.error("当前浏览器不支持直接打印，请先下载 Markdown。");
        return;
      }
      const title = projectTitles[row.project_id];
      const fn = buildFilename("pdf", title, row.version, row.project_id);
      const html = renderPrintableHtml(row.payload, row.format, {
        projectTitle: title,
        version: row.version,
        createdAt: new Date(row.created_at).toLocaleString("zh-CN", { hour12: false }),
        filenameTitle: fn.replace(/\.pdf$/, ""),
      });
      toast.info("正在打开打印对话框，请选择“另存为 PDF”。");
      try {
        await openPrintWindow(html);
      } catch (err: any) {
        if (err?.message === "PRINT_UNSUPPORTED") {
          toast.error("当前浏览器不支持直接打印，请先下载 Markdown。");
        } else {
          throw err;
        }
      }
    } catch (e) {
      console.error(e);
      toast.error("PDF 生成失败，请先下载 Markdown。");
    } finally {
      setBusy(null);
    }
  }

  const showMd = flags.markdownDownload;
  const showPdf = flags.pdfExport;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">导出记录</h1>
        <p className="text-sm text-muted-foreground">所有历史导出的 JSON / Markdown 载荷。</p>
        {!showMd && !showPdf && (
          <p className="text-xs text-muted-foreground mt-1">
            在 <span className="font-mono">设置 → 分支能力开关</span> 中开启 Markdown / PDF 下载。
          </p>
        )}
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-semibold">全部记录</h2>
          <span className="kbd-route">GET /export</span>
        </div>
        <div className="hidden md:block overflow-x-auto"><table className="ops-table">
          <thead>
            <tr>
              <th>项目</th><th>版本</th><th>格式</th><th>时间</th><th>大小</th><th className="w-56">操作</th>
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
                <td className="font-mono text-xs">{r.payload?.length ?? 0} B</td>
                <td>
                  <div className="flex gap-1 flex-wrap">
                    <Button variant="ghost" size="sm" onClick={() => setOpen(r)}>
                      <Eye className="h-3.5 w-3.5 mr-1" />查看
                    </Button>
                    {showMd && (
                      <Button variant="outline" size="sm" disabled={busy === r.id + ":md"} onClick={() => handleMarkdown(r)}>
                        <FileDown className="h-3.5 w-3.5 mr-1" />MD
                      </Button>
                    )}
                    {showPdf && (
                      <Button variant="outline" size="sm" disabled={busy === r.id + ":pdf"} onClick={() => handlePdf(r)}>
                        <Printer className="h-3.5 w-3.5 mr-1" />打印/PDF
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table></div>
        <MobileCardList empty="暂无导出记录">
          {rows.map((r) => (
            <MobileCard
              key={r.id}
              title={projectTitles[r.project_id] ?? r.project_id.slice(0, 8)}
              right={<ToneBadge tone={r.format === "json" ? "info" : "primary"}>{r.format}</ToneBadge>}
              footer={
                <div className="flex flex-col gap-2 w-full">
                  <Button variant="outline" size="sm" className="w-full justify-center" onClick={() => setOpen(r)}>
                    <Eye className="h-3.5 w-3.5 mr-1.5" />查看载荷
                  </Button>
                  {showMd && (
                    <Button variant="outline" size="sm" className="w-full justify-center" disabled={busy === r.id + ":md"} onClick={() => handleMarkdown(r)}>
                      <FileDown className="h-3.5 w-3.5 mr-1.5" />下载 Markdown
                    </Button>
                  )}
                  {showPdf && (
                    <Button variant="outline" size="sm" className="w-full justify-center" disabled={busy === r.id + ":pdf"} onClick={() => handlePdf(r)}>
                      <Printer className="h-3.5 w-3.5 mr-1.5" />打印 / 保存为 PDF
                    </Button>
                  )}
                </div>
              }
            >
              <MobileField label="版本" value={`v${r.version}`} mono />
              <MobileField label="时间" value={new Date(r.created_at).toLocaleString("zh-CN", { hour12: false })} mono />
              <MobileField label="大小" value={`${r.payload?.length ?? 0} B`} mono />
            </MobileCard>
          ))}
        </MobileCardList>
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
