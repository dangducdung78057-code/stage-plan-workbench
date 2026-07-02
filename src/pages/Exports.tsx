import { useEffect, useState, useCallback } from "react";
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
  validatePrintableHtml,
  downloadBlob,
  renderPdfBlob,
  renderPngBlob,
} from "@/lib/exportRender";
import {
  buildStoragePath,
  uploadExportFile,
  listMyExportFiles,
  getSignedUrl,
  deleteExportFile,
  type StorageFileEntry,
} from "@/lib/exportStorage";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { FileDown, Eye, Loader2, FileText, Cloud, Link2, Trash2, RefreshCcw, Image as ImageIcon, RotateCw } from "lucide-react";

type Row = {
  id: string; project_id: string; version: number; format: string;
  payload: string; created_at: string;
};

export default function Exports() {
  const { user } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [projectTitles, setProjectTitles] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<Row | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [files, setFiles] = useState<StorageFileEntry[]>([]);
  const [filesLoading, setFilesLoading] = useState(false);
  const flags = useFlags();
  const storageOn = flags.storageUpload;

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

  const refreshFiles = useCallback(async () => {
    if (!user?.id || !storageOn) { setFiles([]); return; }
    setFilesLoading(true);
    try {
      const f = await listMyExportFiles(user.id);
      setFiles(f);
    } catch (e: any) {
      console.error(e);
      toast.error(`Storage 列表失败：${e?.message ?? "unknown"}`);
    } finally {
      setFilesLoading(false);
    }
  }, [user?.id, storageOn]);

  useEffect(() => { refreshFiles(); }, [refreshFiles]);

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

  async function maybeUploadToStorage(row: Row, ext: "md" | "pdf" | "png", blob: Blob, contentType: string) {
    if (!storageOn || !user?.id) return;
    try {
      const path = buildStoragePath({
        userId: user.id, projectId: row.project_id, exportId: row.id, version: row.version, ext,
      });
      await uploadExportFile({ path, data: blob, contentType });
      toast.success(`已同步到 Storage · ${ext.toUpperCase()}`);
      refreshFiles();
    } catch (e: any) {
      console.error(e);
      toast.error(`Storage 同步失败：${e?.message ?? "unknown"}`);
    }
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
      const blob = new Blob([md], { type: "text/markdown;charset=utf-8" });
      downloadBlob(md, fn, "text/markdown;charset=utf-8");
      toast.success("Markdown 已开始下载");
      await maybeUploadToStorage(row, "md", blob, "text/markdown;charset=utf-8");
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
      const title = projectTitles[row.project_id];
      const createdAt = new Date(row.created_at).toLocaleString("zh-CN", { hour12: false });
      const fn = buildFilename("pdf", title, row.version, row.project_id);
      const html = renderPrintableHtml(row.payload, row.format, {
        projectTitle: title,
        version: row.version,
        createdAt,
        filenameTitle: fn.replace(/\.pdf$/, ""),
      });
      if (!validatePrintableHtml(html)) {
        toast.error("PDF 导出暂未完成，请先下载 Markdown 或 PNG。");
        return;
      }
      const blob = await renderPdfBlob(html);
      if (!blob || blob.size < 1024) throw new Error("PDF_EMPTY_CONTENT");
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fn;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PDF 已生成并下载（实验版）");
      await maybeUploadToStorage(row, "pdf", blob, "application/pdf");
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message ?? "");
      if (/PRINTABLE_HTML_INVALID|PDF_EMPTY_CONTENT|PDF_BLANK_PIXELS|PDF_RASTERIZE_FAILED|PNG_/.test(msg)) {
        toast.error("PDF 导出暂未完成，请先下载 Markdown 或 PNG。", { description: msg });
      } else {
        toast.error("PDF 导出暂未完成，请先下载 Markdown 或 PNG。", { description: msg || "未知错误" });
      }
    } finally {
      setBusy(null);
    }
  }

  async function handlePng(row: Row) {
    setBusy(row.id + ":png");
    try {
      if (!(await guard(row))) return;
      const title = projectTitles[row.project_id];
      const createdAt = new Date(row.created_at).toLocaleString("zh-CN", { hour12: false });
      const fn = buildFilename("png", title, row.version, row.project_id);
      const html = renderPrintableHtml(row.payload, row.format, {
        projectTitle: title,
        version: row.version,
        createdAt,
        filenameTitle: fn.replace(/\.png$/, ""),
      });
      if (!validatePrintableHtml(html)) {
        toast.error("PNG 渲染失败", { description: "printable HTML 校验未通过（内容为空或缺字段），请先下载 Markdown。" });
        return;
      }
      const blob = await renderPngBlob(html);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = fn;
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      toast.success("PNG 已生成并下载");
      await maybeUploadToStorage(row, "png", blob, "image/png");
    } catch (e: any) {
      console.error(e);
      const msg = String(e?.message ?? "");
      const [code, detail] = msg.split(":");
      const reasonMap: Record<string, string> = {
        PRINTABLE_HTML_INVALID: "printable HTML 校验未通过（内容为空或字段缺失）",
        PNG_FONTS_NOT_READY: "字体未就绪（document.fonts.ready 失败）",
        PNG_NODE_SIZE_INVALID: "节点尺寸异常（宽/高为 0，可能被样式隐藏）",
        PNG_EMPTY_CONTENT: "内容为空（渲染后文本长度不足）",
        PNG_RASTERIZE_FAILED: "html-to-image 光栅化失败",
        PNG_BLOB_TOO_SMALL: "生成的 PNG 体积过小（疑似空白图）",
        PNG_BLANK_PIXELS: "像素为纯白（未检测到可见内容）",
        PNG_LIB_UNAVAILABLE: "html-to-image 未加载",
        PNG_UNSUPPORTED: "当前环境不支持 PNG 导出",
      };
      const reason = reasonMap[code] || "未知错误";
      const description = detail ? `${reason}｜${detail.trim()}` : reason;
      toast.error("PNG 生成失败", { description });

    } finally {
      setBusy(null);
    }
  }

  async function copySignedUrl(path: string) {
    try {
      const url = await getSignedUrl(path, 3600);
      await navigator.clipboard.writeText(url);
      toast.success("签名链接已复制（1 小时内有效）");
    } catch (e: any) {
      toast.error(`获取链接失败：${e?.message ?? "unknown"}`);
    }
  }

  async function removeFile(path: string) {
    if (!confirm(`确认删除 Storage 文件？\n${path}`)) return;
    try {
      await deleteExportFile(path);
      toast.success("已删除");
      refreshFiles();
    } catch (e: any) {
      toast.error(`删除失败：${e?.message ?? "unknown"}`);
    }
  }

  const showMd = flags.markdownDownload;
  const showPdf = flags.pdfExport;
  const showPng = flags.pngExport;

  return (
    <div className="p-4 md:p-6 space-y-4">
      <div>
        <h1 className="text-xl font-semibold">导出记录</h1>
        <p className="text-sm text-muted-foreground">所有历史导出的 JSON / Markdown 载荷。</p>
        {!showMd && (
          <p className="text-xs text-muted-foreground mt-1">
            在 <span className="font-mono">设置 → 分支能力开关</span> 中开启 Markdown 下载。
          </p>
        )}
        {showPdf && (
          <p className="text-xs text-muted-foreground mt-1">PDF 采用 html2pdf 光栅化渲染，中文原样输出。</p>
        )}
        {showPng && (
          <p className="text-xs text-muted-foreground mt-1">PNG 长图采用 html-to-image 光栅化，适合分享。</p>
        )}
        {storageOn && (
          <p className="text-xs text-muted-foreground mt-1">
            Storage 同步已开启：下载的 MD / PDF / PNG 会同时写入私有 bucket <span className="font-mono">stageos-exports</span>，按 <span className="font-mono">user_id</span> 前缀隔离。
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
                        {busy === r.id + ":md"
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />生成中…</>
                          : <><FileDown className="h-3.5 w-3.5 mr-1" />MD</>}
                      </Button>
                    )}
                    {showPdf && (
                      <Button variant="outline" size="sm" disabled={busy === r.id + ":pdf"} onClick={() => handlePdf(r)}>
                        {busy === r.id + ":pdf"
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />生成中…</>
                          : <><FileText className="h-3.5 w-3.5 mr-1" />PDF 实验版</>}
                      </Button>
                    )}
                    {showPng && (
                      <Button variant="outline" size="sm" disabled={busy === r.id + ":png"} onClick={() => handlePng(r)}>
                        {busy === r.id + ":png"
                          ? <><Loader2 className="h-3.5 w-3.5 mr-1 animate-spin" />生成中…</>
                          : <><ImageIcon className="h-3.5 w-3.5 mr-1" />PNG</>}
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
                      {busy === r.id + ":md"
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />生成中…</>
                        : <><FileDown className="h-3.5 w-3.5 mr-1.5" />下载 Markdown</>}
                    </Button>
                  )}
                  {showPdf && (
                    <Button variant="outline" size="sm" className="w-full justify-center" disabled={busy === r.id + ":pdf"} onClick={() => handlePdf(r)}>
                      {busy === r.id + ":pdf"
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />生成中…</>
                        : <><FileText className="h-3.5 w-3.5 mr-1.5" />PDF 实验版</>}
                    </Button>
                  )}
                  {showPng && (
                    <Button variant="outline" size="sm" className="w-full justify-center" disabled={busy === r.id + ":png"} onClick={() => handlePng(r)}>
                      {busy === r.id + ":png"
                        ? <><Loader2 className="h-3.5 w-3.5 mr-1.5 animate-spin" />生成中…</>
                        : <><ImageIcon className="h-3.5 w-3.5 mr-1.5" />下载 PNG 长图</>}
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

      {storageOn && (
        <div className="panel">
          <div className="panel-header">
            <h2 className="text-sm font-semibold flex items-center gap-1.5">
              <Cloud className="h-3.5 w-3.5" />Storage 副本
            </h2>
            <div className="flex items-center gap-2">
              <span className="kbd-route">stageos-exports</span>
              <Button variant="ghost" size="sm" onClick={refreshFiles} disabled={filesLoading}>
                {filesLoading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCcw className="h-3.5 w-3.5" />}
              </Button>
            </div>
          </div>
          <div className="panel-body">
            {files.length === 0 ? (
              <div className="text-xs text-muted-foreground py-4 text-center">
                暂无 Storage 副本。下载 MD / PDF 时会自动同步。
              </div>
            ) : (
              <ul className="divide-y border rounded bg-surface text-sm">
                {files.map((f) => (
                  <li key={f.path} className="px-3 py-2 flex flex-col sm:flex-row sm:items-center gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="font-mono text-xs break-all">{f.name}</div>
                      <div className="text-[11px] text-muted-foreground font-mono break-all">
                        {f.path}
                        {typeof f.size === "number" && <> · {f.size} B</>}
                        {f.updatedAt && <> · {new Date(f.updatedAt).toLocaleString("zh-CN", { hour12: false })}</>}
                      </div>
                    </div>
                    <div className="flex gap-1 shrink-0">
                      <Button variant="outline" size="sm" onClick={() => copySignedUrl(f.path)}>
                        <Link2 className="h-3.5 w-3.5 mr-1" />复制链接
                      </Button>
                      <Button variant="ghost" size="sm" onClick={() => removeFile(f.path)}>
                        <Trash2 className="h-3.5 w-3.5 text-destructive" />
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}

      <Dialog open={!!open} onOpenChange={(o) => !o && setOpen(null)}>
        <DialogContent className="max-w-3xl max-h-[80vh] overflow-auto">
          <DialogHeader><DialogTitle>导出内容 · {open?.format.toUpperCase()} v{open?.version}</DialogTitle></DialogHeader>
          <pre className="text-xs bg-surface-muted p-3 rounded font-mono whitespace-pre-wrap break-all">{open?.payload}</pre>
        </DialogContent>
      </Dialog>
    </div>
  );
}
