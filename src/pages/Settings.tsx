import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";

export default function SettingsPage() {
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
    toast.success("设置已保存");
  }

  return (
    <div className="p-4 md:p-6 max-w-3xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold">设置</h1>
        <p className="text-sm text-muted-foreground">全局操作参数。v1 无用户/租户/权限。</p>
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
            <p className="text-xs text-muted-foreground">留空表示不启用真实 API。v1 中真实 API 仅为保留路径。</p>
          </div>
          <Button size="sm" onClick={save}>保存</Button>
        </div>
      </div>

      <div className="panel">
        <div className="panel-header"><h2 className="text-sm font-semibold">数据与隐私</h2></div>
        <div className="panel-body text-sm space-y-2 text-muted-foreground">
          <p>· 系统仅采集匿名 studentId、性别、身高、可选角色标签,不请求真实姓名。</p>
          <p>· 所有商品/价格/库存均为估算或搜索建议,需人工核验后才可作为采购依据。</p>
          <p>· v1 不含认证、租户、支付或真实商务 API。</p>
        </div>
      </div>
    </div>
  );
}
