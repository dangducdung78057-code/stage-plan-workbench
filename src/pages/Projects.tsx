import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { StatusBadge } from "@/components/StatusBadge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Plus, Search } from "lucide-react";

type Row = {
  id: string; title: string; status: string;
  performance_date: string | null; performer_count: number | null; updated_at: string;
};

export default function Projects() {
  const [rows, setRows] = useState<Row[]>([]);
  const [q, setQ] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("projects").select("*").order("updated_at", { ascending: false });
      setRows((data as Row[]) ?? []);
      setLoading(false);
    })();
  }, []);

  const filtered = rows.filter((r) => !q || r.title.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">项目</h1>
          <p className="text-sm text-muted-foreground">全部演出服装排产项目。</p>
        </div>
        <Button asChild size="sm"><Link to="/projects/new"><Plus className="h-4 w-4 mr-1" />新建项目</Link></Button>
      </div>
      <div className="panel">
        <div className="panel-header">
          <div className="relative w-72">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
            <Input placeholder="搜索标题…" value={q} onChange={(e) => setQ(e.target.value)} className="h-8 pl-7 text-sm" />
          </div>
          <span className="kbd-route">GET /projects</span>
        </div>
        <div className="overflow-x-auto">
          <table className="ops-table">
            <thead>
              <tr>
                <th>标题</th><th>状态</th><th>演出日期</th><th>人数</th><th>更新时间</th><th className="w-24">操作</th>
              </tr>
            </thead>
            <tbody>
              {loading && <tr><td colSpan={6} className="text-center py-6 text-muted-foreground">加载中…</td></tr>}
              {!loading && filtered.length === 0 && (
                <tr><td colSpan={6} className="text-center py-8 text-muted-foreground">无匹配项目</td></tr>
              )}
              {filtered.map((r) => (
                <tr key={r.id}>
                  <td className="font-medium">{r.title}</td>
                  <td><StatusBadge status={r.status} /></td>
                  <td className="font-mono text-xs text-muted-foreground">{r.performance_date ?? "—"}</td>
                  <td className="font-mono text-xs">{r.performer_count ?? "—"}</td>
                  <td className="font-mono text-xs text-muted-foreground">
                    {new Date(r.updated_at).toLocaleString("zh-CN", { hour12: false })}
                  </td>
                  <td className="space-x-2">
                    <Link to={`/projects/${r.id}`} className="text-primary text-xs hover:underline">打开</Link>
                    <Link to={`/projects/${r.id}/edit`} className="text-xs text-muted-foreground hover:underline">编辑</Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
