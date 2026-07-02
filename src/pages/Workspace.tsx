import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { PROJECT_STATUSES } from "@/lib/stageos";
import { Plus, ArrowRight, Package, AlertTriangle, CheckCircle2, FileDown, Presentation, Download } from "lucide-react";
import { MobileCard, MobileCardList, MobileField } from "@/components/MobileCard";

const SLIDE_OUTLINE: { title: string; desc: string }[] = [
  { title: "封面 · StageOS 项目总览", desc: "能力驱动而非版本驱动的治理理念" },
  { title: "能力分层 L0/L1/L2", desc: "生产 / 有限 / 实验 三档成熟度定义" },
  { title: "当前能力矩阵", desc: "AI · Markdown · PNG · PDF · 采购各自所处层级" },
  { title: "Release Gate G0–G3", desc: "从原型到生产的四道闸门与放行条件" },
  { title: "一键验收模型", desc: "PASS / WARN / FAIL / SKIP 的唯一状态语义" },
  { title: "近期流程强化", desc: "确认前强校验 · 解密预览 · 字段跳转闭环" },
  { title: "Webhook 契约", desc: "outbound-only · 失败不阻塞主流程" },
  { title: "AI Gateway 与采购回退", desc: "统一网关 · 本地/HTTP 采购 fallback" },
  { title: "强约束清单", desc: "禁止跨层升级 · 禁止隐藏 FAIL · 禁止版本驱动" },
  { title: "落地节奏", desc: "以能力层 + Gate 组织路线图" },
];


type Row = {
  id: string;
  title: string;
  status: string;
  performance_date: string | null;
  performer_count: number | null;
  updated_at: string;
};

export default function Workspace() {
  const [rows, setRows] = useState<Row[]>([]);
  const [counts, setCounts] = useState({ total: 0, confirmed: 0, revision: 0, exported: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("projects")
        .select("id,title,status,performance_date,performer_count,updated_at")
        .order("updated_at", { ascending: false });
      const list = (data as Row[]) ?? [];
      setRows(list);
      setCounts({
        total: list.length,
        confirmed: list.filter((r) => r.status === "confirmed" || r.status === "exported").length,
        revision: list.filter((r) => r.status === "needs_revision").length,
        exported: list.filter((r) => r.status === "exported").length,
      });
      setLoading(false);
    })();
  }, []);

  return (
    <div className="p-4 md:p-6 space-y-5">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">运营工作台</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            学校演出服装排产循环:项目输入 → 服装总表 → 风险与倒排 → 用户确认 → 导出。
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button asChild variant="outline" size="sm">
            <Link to="/projects/new">经典表单</Link>
          </Button>
          <Button asChild size="sm">
            <Link to="/projects/new/wizard"><Plus className="h-4 w-4 mr-1" />新建项目 · 向导</Link>
          </Button>
        </div>
      </div>

      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="panel w-full text-left flex items-center justify-between gap-3 p-3 hover:border-primary/40 hover:bg-accent/40 transition-colors group"
            aria-label="打开 StageOS 项目总览幻灯片导读"
          >
            <div className="flex items-center gap-3 min-w-0">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                <Presentation className="h-4 w-4" />
              </span>
              <div className="min-w-0">
                <div className="text-sm font-medium truncate">StageOS 项目总览 · 幻灯片导读</div>
                <div className="text-xs text-muted-foreground truncate">
                  10 页 · 能力分层 L0/L1/L2、Gate G0–G3、一键验收治理模型
                </div>
              </div>
            </div>
            <span className="text-xs text-primary flex items-center gap-1 shrink-0 group-hover:underline">
              查看导读 <ArrowRight className="h-3.5 w-3.5" />
            </span>
          </button>
        </DialogTrigger>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Presentation className="h-4 w-4 text-primary" /> StageOS 项目总览 · 幻灯片导读
            </DialogTitle>
            <DialogDescription>
              先浏览 10 页要点脉络，再下载 .pptx 用于线下汇报。
            </DialogDescription>
          </DialogHeader>
          <ol className="max-h-[52vh] overflow-y-auto pr-1 space-y-2">
            {SLIDE_OUTLINE.map((s, i) => (
              <li key={i} className="flex gap-3 rounded-md border border-border/60 p-2.5">
                <span className="font-mono text-xs text-muted-foreground w-6 shrink-0 pt-0.5">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <div className="min-w-0">
                  <div className="text-sm font-medium">{s.title}</div>
                  <div className="text-xs text-muted-foreground mt-0.5">{s.desc}</div>
                </div>
              </li>
            ))}
          </ol>
          <DialogFooter>
            <Button asChild size="sm">
              <a href="/stageos-overview.pptx" download>
                <Download className="h-4 w-4 mr-1" /> 下载 .pptx
              </a>
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>



      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <StatCard icon={<Package className="h-4 w-4" />} label="项目总数" value={counts.total} route="/api/stageos/costume-master-plan" />
        <StatCard icon={<AlertTriangle className="h-4 w-4 text-warning" />} label="待修订" value={counts.revision} route="/self-check" />
        <StatCard icon={<CheckCircle2 className="h-4 w-4 text-success" />} label="已确认" value={counts.confirmed} route="/confirm" />
        <StatCard icon={<FileDown className="h-4 w-4 text-primary" />} label="已导出" value={counts.exported} route="/export" />
      </div>

      <div className="panel">
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <h2 className="text-sm font-semibold">项目列表</h2>
            <span className="kbd-route">GET /projects</span>
          </div>
          <Link to="/projects" className="text-xs text-primary hover:underline flex items-center gap-1">
            查看全部 <ArrowRight className="h-3 w-3" />
          </Link>
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="ops-table">
            <thead>
              <tr>
                <th>标题</th>
                <th>状态</th>
                <th>演出日期</th>
                <th>人数</th>
                <th>确认状态</th>
                <th>更新时间</th>
                <th className="w-20">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-6">加载中…</td></tr>
              )}
              {!loading && rows.length === 0 && (
                <tr><td colSpan={7} className="text-center text-muted-foreground py-8">
                  暂无项目。<Link to="/projects/new" className="text-primary hover:underline">立即新建</Link>
                </td></tr>
              )}
              {rows.slice(0, 10).map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.title}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="font-mono text-xs text-muted-foreground">{r.performance_date ?? "—"}</td>
                  <td className="font-mono text-xs">{r.performer_count ?? "—"}</td>
                  <td className="text-xs text-muted-foreground">
                    {PROJECT_STATUSES.find((s) => s.value === r.status)?.label ?? r.status}
                  </td>
                  <td className="font-mono text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleString("zh-CN", { hour12: false })}
                  </td>
                  <td>
                    <Link to={`/projects/${r.id}`} className="text-primary text-xs hover:underline">
                      打开 →
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <MobileCardList
          empty={
            loading ? "加载中…" : (
              <>暂无项目。<Link to="/projects/new" className="text-primary hover:underline">立即新建</Link></>
            )
          }
        >
          {!loading && rows.slice(0, 10).map((r) => (
            <MobileCard
              key={r.id}
              title={r.title}
              right={<StatusBadge status={r.status} />}
              footer={<Link to={`/projects/${r.id}`} className="text-primary text-xs hover:underline">打开 →</Link>}
            >
              <MobileField label="演出日期" value={r.performance_date ?? "—"} mono />
              <MobileField label="人数" value={r.performer_count ?? "—"} mono />
              <MobileField label="确认状态" value={PROJECT_STATUSES.find((s) => s.value === r.status)?.label ?? r.status} />
              <MobileField label="更新时间" value={new Date(r.updated_at).toLocaleString("zh-CN", { hour12: false })} mono />
            </MobileCard>
          ))}
        </MobileCardList>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value, route }: { icon: React.ReactNode; label: string; value: number; route: string }) {
  return (
    <div className="panel p-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-muted-foreground flex items-center gap-1.5">{icon} {label}</span>
      </div>
      <div className="mt-1 text-2xl font-semibold tabular-nums">{value}</div>
      <div className="kbd-route mt-1 inline-block">{route}</div>
    </div>
  );
}
