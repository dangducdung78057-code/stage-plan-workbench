import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ToneBadge } from "@/components/StatusBadge";
import { useAuth } from "@/hooks/useAuth";
import { STAGEOS_VERSION } from "@/lib/stageos";
import { toast } from "sonner";
import { CheckCircle2, XCircle } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { FLAG_META, useFlags, setFlag, type FeatureFlag } from "@/lib/featureFlags";
import { HealthCheck } from "@/components/HealthCheck";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const flags = useFlags();
  const [apiMode, setApiMode] = useState("mock");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [counts, setCounts] = useState({ projects: 0, snapshots: 0, exports: 0, confirmations: 0 });

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("settings").select("*").eq("id", "global").maybeSingle();
      if (data) { setApiMode(data.api_mode); setApiBaseUrl(data.api_base_url ?? ""); }
      const [{ count: p }, { count: s }, { count: e }, { count: c }] = await Promise.all([
        supabase.from("projects").select("id", { count: "exact", head: true }),
        supabase.from("plan_snapshots").select("id", { count: "exact", head: true }),
        supabase.from("export_records").select("id", { count: "exact", head: true }),
        supabase.from("confirmation_records").select("id", { count: "exact", head: true }),
      ]);
      setCounts({ projects: p ?? 0, snapshots: s ?? 0, exports: e ?? 0, confirmations: c ?? 0 });
    })();
  }, []);

  async function save() {
    await supabase.from("settings").upsert({ id: "global", api_mode: apiMode, api_base_url: apiBaseUrl || null });
    toast.success("设置已保存");
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground">全局操作参数与 v2 部署状态。</p>
      </div>

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">系统状态</h2><span className="kbd-route">v2</span></div>
        <div className="panel-body grid grid-cols-1 sm:grid-cols-2 gap-2 text-sm">
          <StatusRow ok label="auth" value="enabled" />
          <StatusRow ok label="database persistence" value="enabled" />
          <StatusRow ok label="provider" value="mock" note />
          <StatusRow ok={false} label="payment" value="not connected" />
          <StatusRow ok label="export" value="mock only" note />
          <StatusRow ok label="row-level isolation" value="by user_id" />
          <div className="sm:col-span-2 border rounded px-2.5 py-1.5 bg-surface flex items-center justify-between">
            <span className="text-xs text-muted-foreground font-mono">version tag</span>
            <span className="font-mono text-xs text-success">{STAGEOS_VERSION}</span>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-semibold">开发验收面板</h2>
          <span className="kbd-route">dev</span>
        </div>
        <div className="panel-body space-y-2 text-sm">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <KV k="当前 user_id" v={user?.id ?? "—"} mono />
            <KV k="邮箱" v={user?.email ?? "—"} mono />
            <KV k="项目数量" v={counts.projects} mono />
            <KV k="快照数量" v={counts.snapshots} mono />
            <KV k="确认记录数" v={counts.confirmations} mono />
            <KV k="导出记录数" v={counts.exports} mono />
          </div>
          <div className="pt-2">
            <Button variant="outline" size="sm" onClick={async () => { await signOut(); toast.success("已退出登录"); }}>
              退出登录
            </Button>
          </div>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2 className="text-sm font-semibold">分支能力开关 (v2.x)</h2>
          <span className="kbd-route">flags</span>
        </div>
        <div className="panel-body space-y-2">
          <p className="text-xs text-muted-foreground">
            分支功能默认关闭；仅本机 localStorage 生效，不影响 v2 主流程与其他账号。
          </p>
          {(Object.keys(FLAG_META) as FeatureFlag[]).map((k) => {
            const meta = FLAG_META[k];
            return (
              <div key={k} className="flex items-center justify-between gap-3 border rounded px-2.5 py-2 bg-surface">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium">{meta.label}</span>
                    {!meta.wired && <ToneBadge tone="warning">计划中</ToneBadge>}
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{meta.desc}</div>
                </div>
                <Switch
                  checked={flags[k]}
                  disabled={!meta.wired}
                  onCheckedChange={(v) => { setFlag(k, v); toast.success(`${meta.label} 已${v ? "开启" : "关闭"}`); }}
                />
              </div>
            );
          })}
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">StageOS 后端</h2></div>
        <div className="panel-body space-y-3">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">apiMode</Label>
            <select className="h-9 w-full rounded border bg-background px-2 text-sm" value={apiMode} onChange={(e) => setApiMode(e.target.value)}>
              <option value="mock">mock (默认,规则驱动)</option>
              <option value="api">api (预留)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">apiBaseUrl</Label>
            <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://api.stageos.example.com" />
            <p className="text-xs text-muted-foreground">留空表示不启用真实 API。v1/v2 中真实 API 仅为保留路径。</p>
          </div>
          <Button size="sm" onClick={save}>保存</Button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">数据与隐私</h2></div>
        <div className="panel-body text-sm space-y-2 text-muted-foreground">
          <p>· v2 已启用邮箱注册/登录，所有项目、阶段输入、快照、确认与导出记录都按 <span className="font-mono">user_id</span> 隔离。</p>
          <p>· 仅采集匿名 studentId、性别、身高、可选角色标签,不请求真实姓名。</p>
          <p>· 所有商品/价格/库存均为估算或搜索建议,需人工核验后才可作为采购依据。</p>
          <p>· v2 仍不含真实支付、真实采购或真实 PDF 生成。</p>
        </div>
      </div>
    </div>
  );
}

function StatusRow({ ok, label, value, note }: { ok: boolean; label: string; value: string; note?: boolean }) {
  return (
    <div className="flex items-center justify-between border rounded px-2.5 py-1.5 bg-surface">
      <span className="text-xs text-muted-foreground font-mono">{label}</span>
      <span className="flex items-center gap-1.5">
        {ok ? <CheckCircle2 className="h-3.5 w-3.5 text-success" /> : <XCircle className="h-3.5 w-3.5 text-destructive" />}
        <ToneBadge tone={ok ? (note ? "info" : "success") : "warning"}>{value}</ToneBadge>
      </span>
    </div>
  );
}

function KV({ k, v, mono }: { k: string; v: React.ReactNode; mono?: boolean }) {
  return (
    <div className="border rounded px-2.5 py-1.5 bg-surface">
      <div className="text-[11px] text-muted-foreground">{k}</div>
      <div className={"text-sm break-all " + (mono ? "font-mono" : "")}>{v}</div>
    </div>
  );
}
