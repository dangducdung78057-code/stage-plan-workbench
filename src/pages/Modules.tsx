import { STAGEOS_MODULES } from "@/lib/stageos";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { ToneBadge } from "@/components/StatusBadge";
import { toast } from "sonner";

export default function Modules() {
  const [apiMode, setApiMode] = useState("mock");
  const [apiBaseUrl, setApiBaseUrl] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("settings").select("*").eq("id", "global").maybeSingle();
      if (data) { setApiMode(data.api_mode); setApiBaseUrl(data.api_base_url ?? ""); }
    })();
  }, []);

  async function save() {
    await supabase.from("settings").upsert({ id: "global", api_mode: apiMode, api_base_url: apiBaseUrl || null });
    toast.success("模块设置已保存");
  }

  return (
    <div className="p-4 md:p-6 space-y-4 max-w-5xl">
      <div>
        <h1 className="text-xl font-semibold">模块注册表</h1>
        <p className="text-sm text-muted-foreground">StageOS 模块与路由清单。v1 默认 mock 模式,可预留 apiBaseUrl。</p>
      </div>

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">API 模式</h2></div>
        <div className="panel-body grid grid-cols-1 md:grid-cols-3 gap-4 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">apiMode</Label>
            <select className="h-9 w-full rounded border bg-background px-2 text-sm" value={apiMode} onChange={(e) => setApiMode(e.target.value)}>
              <option value="mock">mock (默认)</option>
              <option value="api">api (预留)</option>
            </select>
          </div>
          <div className="md:col-span-2 space-y-1.5">
            <Label className="text-xs text-muted-foreground">apiBaseUrl (可选,未来集成真实 StageOS 后端)</Label>
            <Input value={apiBaseUrl} onChange={(e) => setApiBaseUrl(e.target.value)} placeholder="https://api.stageos.example.com" />
          </div>
          <div className="md:col-span-3">
            <Button size="sm" onClick={save}>保存</Button>
            <span className="ml-3 text-xs text-muted-foreground">真实 API 模式在 v1 仅为保留配置,不依赖已部署的后端。</span>
          </div>
        </div>
      </div>

      <div className="space-y-3">
        {STAGEOS_MODULES.map((m) => (
          <div className="panel" key={m.group}>
            <div className="panel-header">
              <div>
                <h3 className="text-sm font-semibold">{m.group}</h3>
                <div className="text-xs text-muted-foreground">{m.desc}</div>
              </div>
              <ToneBadge tone="info">mock</ToneBadge>
            </div>
            <div className="panel-body flex flex-wrap gap-1.5">
              {m.routes.map((r) => <span key={r} className="kbd-route">{r}</span>)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
