import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { SETTINGS_SAFE_COLUMNS } from "@/lib/settingsColumns";
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
import {
  getProviderMode, setProviderMode, getHttpUrl, setHttpUrl,
  type ProcurementProviderId,
} from "@/lib/procurementProvider";
import {
  readLocalProcurementSettings,
  normalizeProcurementSettings,
  saveLocalProcurementSettings,
  type ProcurementSettings,
} from "@/lib/procurementSettings";
import {
  WEBHOOK_EVENTS, WEBHOOK_EVENT_META, WEBHOOK_SETTINGS_DEFAULTS,
  normalizeWebhookSettings, readLocalWebhookSettings, saveLocalWebhookSettings,
  dispatchWebhook, generateWebhookSecret, type WebhookEvent, type WebhookSettings,
} from "@/lib/webhook";

export default function SettingsPage() {
  const { user, signOut } = useAuth();
  const flags = useFlags();
  const [apiMode, setApiMode] = useState("mock");
  const [apiBaseUrl, setApiBaseUrl] = useState("");
  const [counts, setCounts] = useState({ projects: 0, snapshots: 0, exports: 0, confirmations: 0 });
  const [procProvider, setProcProvider] = useState<ProcurementProviderId>(() => getProviderMode());
  const [procHttpUrl, setProcHttpUrl] = useState<string>(() => getHttpUrl());
  const [procSettings, setProcSettings] = useState<ProcurementSettings>(() => readLocalProcurementSettings());
  const [webhook, setWebhook] = useState<WebhookSettings>(() => readLocalWebhookSettings());
  const [webhookSaving, setWebhookSaving] = useState(false);
  const [webhookTesting, setWebhookTesting] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("settings").select(SETTINGS_SAFE_COLUMNS).eq("id", "global").maybeSingle();
      if (data) {
        const row = data as any;
        setApiMode(row.api_mode);
        setApiBaseUrl(row.api_base_url ?? "");
        const nextProc = normalizeProcurementSettings(row, readLocalProcurementSettings());
        setProcSettings(nextProc);
        setProcProvider(nextProc.procurementProvider);
        setProcHttpUrl(nextProc.procurementApiBaseUrl);
        saveLocalProcurementSettings(nextProc, false);
        // webhook_secret is admin-only — fetch via secure RPC (null for non-admins).
        const { data: secret } = await supabase.rpc("get_webhook_secret" as any);
        const nextWebhook = normalizeWebhookSettings({ ...row, webhook_secret: secret ?? "" }, readLocalWebhookSettings());
        setWebhook(nextWebhook);
        saveLocalWebhookSettings(nextWebhook);
      }
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
    const nextProc: ProcurementSettings = {
      ...procSettings,
      procurementProvider: procProvider,
      procurementApiBaseUrl: procHttpUrl,
    };
    saveLocalProcurementSettings(nextProc);
    setProviderMode(nextProc.procurementProvider);
    setHttpUrl(nextProc.procurementApiBaseUrl);
    setFlag("procurement", nextProc.procurementCandidatesEnabled);
    const { error } = await supabase.from("settings").upsert({
      id: "global",
      api_mode: apiMode,
      api_base_url: apiBaseUrl || null,
      procurement_candidates_enabled: nextProc.procurementCandidatesEnabled,
      procurement_provider_enabled: nextProc.procurementProviderEnabled,
      procurement_export_attachment_enabled: nextProc.procurementExportAttachmentEnabled,
      procurement_provider: nextProc.procurementProvider,
      procurement_api_base_url: nextProc.procurementApiBaseUrl || null,
    } as any);
    if (error) { toast.error(`设置保存失败：${error.message}`); return; }
    setProcSettings(nextProc);
    toast.success("设置已保存");
  }

  function patchProcSettings(patch: Partial<ProcurementSettings>) {
    setProcSettings((prev) => {
      const next = { ...prev, ...patch };
      if (patch.procurementProvider) setProcProvider(patch.procurementProvider);
      if (typeof patch.procurementApiBaseUrl === "string") setProcHttpUrl(patch.procurementApiBaseUrl);
      saveLocalProcurementSettings(next);
      return next;
    });
  }

  function patchWebhook(patch: Partial<WebhookSettings>) {
    setWebhook((prev) => {
      const next = { ...prev, ...patch };
      saveLocalWebhookSettings(next);
      return next;
    });
  }

  function toggleWebhookEvent(ev: WebhookEvent, on: boolean) {
    setWebhook((prev) => {
      const set = new Set(prev.webhookEvents);
      if (on) set.add(ev); else set.delete(ev);
      const next = { ...prev, webhookEvents: Array.from(set) as WebhookEvent[] };
      saveLocalWebhookSettings(next);
      return next;
    });
  }

  async function saveWebhook() {
    setWebhookSaving(true);
    try {
      saveLocalWebhookSettings(webhook);
      const { error } = await supabase.from("settings").upsert({
        id: "global",
        api_mode: apiMode,
        webhook_enabled: webhook.webhookEnabled,
        webhook_url: webhook.webhookUrl || null,
        webhook_events: webhook.webhookEvents,
      } as any);
      if (error) { toast.error(`Webhook 保存失败：${error.message}`); return; }
      // webhook_secret is admin-only — save via secure RPC. Non-admins get a permission error.
      const { error: secErr } = await supabase.rpc("set_webhook_secret" as any, { _secret: webhook.webhookSecret || "" });
      if (secErr) { toast.error(`签名密钥保存失败：${secErr.message}`); return; }
      toast.success("Webhook 设置已保存");
    } finally { setWebhookSaving(false); }
  }

  function rotateWebhookSecret() {
    const next = generateWebhookSecret();
    patchWebhook({ webhookSecret: next });
    toast.success("已生成新的签名密钥，记得点击「保存」后同步到接收端");
  }

  function clearWebhookSecret() {
    patchWebhook({ webhookSecret: "" });
    toast.message("已清空签名密钥（后续出站请求将不再签名）");
  }

  async function testWebhook() {
    if (!webhook.webhookEnabled) { toast.error("请先开启 webhookEnabled"); return; }
    if (!webhook.webhookUrl) { toast.error("请先填写 webhookUrl"); return; }
    setWebhookTesting(true);
    try {
      // 使用 audit.completed 作为测试事件（无需业务上下文）
      dispatchWebhook("audit.completed", {
        project_id: null,
        summary: { test: true, note: "manual webhook test from Settings", baseline: STAGEOS_VERSION },
      });
      toast.success("已异步发送测试 webhook（结果见 webhook_delivery_logs）");
    } finally { setWebhookTesting(false); }
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

      <HealthCheck />

      <PdfCapabilitySyncPanel pdfExportOn={flags.pdfExport} />





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
        <div className="panel-header">
          <h2 className="text-sm font-semibold">采购设置 (v3.3 正向验收)</h2>
          <span className="kbd-route">procurement</span>
        </div>
        <div className="panel-body space-y-3">
          <p className="text-xs text-muted-foreground">
            下列字段会同步写入全局设置并镜像到本机缓存，HealthCheck 直接读取全局设置；不会再被旧 <span className="font-mono">procurement</span> flag 默认值覆盖。
          </p>
          <div className="grid grid-cols-1 gap-2">
            <ProcSwitch
              label="procurementCandidatesEnabled"
              desc="开启服装方案行内候选商品清单。"
              checked={procSettings.procurementCandidatesEnabled}
              onCheckedChange={(v) => patchProcSettings({ procurementCandidatesEnabled: v })}
            />
            <ProcSwitch
              label="procurementProviderEnabled"
              desc="开启采购 provider 抽象层；http 失败仍 fallback-local + warn。"
              checked={procSettings.procurementProviderEnabled}
              onCheckedChange={(v) => patchProcSettings({ procurementProviderEnabled: v })}
            />
            <ProcSwitch
              label="procurementExportAttachmentEnabled"
              desc="开启 Markdown / PDF / PNG 导出候选商品清单章节。"
              checked={procSettings.procurementExportAttachmentEnabled}
              onCheckedChange={(v) => patchProcSettings({ procurementExportAttachmentEnabled: v })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">procurementProvider</Label>
            <select
              className="h-9 w-full rounded border bg-background px-2 text-sm"
              value={procProvider}
              onChange={(e) => {
                const v = e.target.value as ProcurementProviderId;
                setProcProvider(v); setProviderMode(v); patchProcSettings({ procurementProvider: v });
                toast.success(`provider 已切换：${v}`);
              }}
            >
              <option value="local">local (本地目录, 推荐)</option>
              <option value="http">http (通用壳, 支持 http-mock)</option>
            </select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">procurementApiBaseUrl / procurementHttpUrl</Label>
            <Input
              value={procHttpUrl}
              onChange={(e) => { setProcHttpUrl(e.target.value); patchProcSettings({ procurementApiBaseUrl: e.target.value }); }}
              onBlur={() => { setHttpUrl(procHttpUrl); patchProcSettings({ procurementApiBaseUrl: procHttpUrl }); }}
              placeholder="https://example.com/procurement/search"
              disabled={procProvider !== "http"}
            />
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="interactive h-7 px-2 text-xs rounded-md border bg-background hover:bg-white/10 disabled:opacity-50"
                disabled={procProvider !== "http"}
                onClick={() => {
                  const base = (import.meta as any).env?.VITE_SUPABASE_URL as string | undefined;
                  if (!base) { toast.error("未检测到 Cloud endpoint"); return; }
                  const u = `${base}/functions/v1/procurement-search-mock`;
                  setProcHttpUrl(u); setHttpUrl(u); patchProcSettings({ procurementApiBaseUrl: u });
                  toast.success("已填入内置 mock endpoint");
                }}
              >
                填入内置 mock endpoint
              </button>
              <button
                type="button"
                className="interactive h-7 px-2 text-xs rounded-md border bg-background hover:bg-white/10 disabled:opacity-50"
                disabled={procProvider !== "http"}
                onClick={() => { setProcHttpUrl(""); setHttpUrl(""); patchProcSettings({ procurementApiBaseUrl: "" }); toast.success("已清空 endpoint（下次将走 fallback-local）"); }}
              >
                清空
              </button>
            </div>
            <p className="text-xs text-muted-foreground">
              留空或不可达时自动回退 local。正向验收请使用 <span className="font-mono">http</span> + 内�� mock endpoint。
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <KV k="procurementCandidatesEnabled" v={String(procSettings.procurementCandidatesEnabled)} mono />
            <KV k="procurementProviderEnabled" v={String(procSettings.procurementProviderEnabled)} mono />
            <KV k="procurementExportAttachmentEnabled" v={String(procSettings.procurementExportAttachmentEnabled)} mono />
            <KV k="procurementProvider" v={procProvider} mono />
          </div>
          <Button size="sm" onClick={save}>保存采购设置</Button>
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
        <div className="panel-header">
          <h2 className="text-sm font-semibold">Outbound Webhook (v4.1 · HMAC 签名 + Replay 防护)</h2>
          <span className="kbd-route">webhook</span>
        </div>
        <div className="panel-body space-y-3">
          <p className="text-xs text-muted-foreground">
            关键事件发生时向外部 URL 异步 POST 一份标准 payload。失败不影响主流程，自动 retry 最多 2 次，静默记录到 <span className="font-mono">webhook_delivery_logs</span>。
          </p>
          <div className="flex items-center justify-between gap-3 border rounded px-2.5 py-2 bg-surface">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium font-mono">webhookEnabled</div>
              <div className="text-xs text-muted-foreground mt-0.5">总开关；关闭时所有事件均跳过并静默记录 skipped。</div>
            </div>
            <Switch checked={webhook.webhookEnabled} onCheckedChange={(v) => patchWebhook({ webhookEnabled: v })} />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">webhookUrl</Label>
            <Input
              value={webhook.webhookUrl}
              onChange={(e) => patchWebhook({ webhookUrl: e.target.value })}
              placeholder="https://example.com/hooks/stageos"
            />
            <p className="text-xs text-muted-foreground">留空视为未配置；出站请求带 <span className="font-mono">x-stageos-event</span> / <span className="font-mono">x-stageos-version</span> / <span className="font-mono">x-stageos-timestamp</span> / <span className="font-mono">x-stageos-nonce</span> 头，配置签名密钥后额外带 <span className="font-mono">x-stageos-signature</span>。</p>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">webhookEvents</Label>
            <div className="grid grid-cols-1 gap-1.5">
              {WEBHOOK_EVENTS.map((ev) => {
                const meta = WEBHOOK_EVENT_META[ev];
                const on = webhook.webhookEvents.includes(ev);
                return (
                  <label key={ev} className="flex items-center gap-2 border rounded px-2.5 py-1.5 bg-surface cursor-pointer">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5"
                      checked={on}
                      onChange={(e) => toggleWebhookEvent(ev, e.target.checked)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-mono">{meta.label}</div>
                      <div className="text-[11px] text-muted-foreground">{meta.desc}</div>
                    </div>
                  </label>
                );
              })}
            </div>
          </div>

          <div className="space-y-1.5 border-t pt-3">
            <Label className="text-xs text-muted-foreground">webhookSecret（HMAC-SHA256 签名密钥）</Label>
            <Input
              value={webhook.webhookSecret}
              onChange={(e) => patchWebhook({ webhookSecret: e.target.value })}
              placeholder="whsec_... 留空则不签名（向后兼容 v4.0 接收端）"
              className="font-mono text-xs"
              spellCheck={false}
              autoComplete="off"
            />
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={rotateWebhookSecret}>生成新密钥</Button>
              {webhook.webhookSecret ? (
                <Button size="sm" variant="ghost" onClick={clearWebhookSecret}>清空</Button>
              ) : null}
            </div>
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              签名方式：<span className="font-mono">HMAC-SHA256(secret, `${'{'}timestamp{'}'}.${'{'}nonce{'}'}.${'{'}body{'}'}`)</span>，Header 形如 <span className="font-mono">x-stageos-signature: t=…,n=…,v1=&lt;hex&gt;</span>。<br />
              接收端应校验：① 用同一密钥重算 v1 并常量时间比较；② 拒绝时间戳超出 ±5 分钟窗口的请求；③ 在窗口内记录 nonce，拒绝重复。
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <KV k="webhookEnabled" v={String(webhook.webhookEnabled)} mono />
            <KV k="webhookUrl" v={webhook.webhookUrl || "—"} mono />
            <KV k="webhookEvents" v={webhook.webhookEvents.join(",") || "—"} mono />
            <KV k="webhookSecret" v={webhook.webhookSecret ? `已配置 · ${webhook.webhookSecret.slice(0, 10)}… (${webhook.webhookSecret.length} chars)` : "未配置（不签名）"} mono />
            <KV k="signatureScheme" v={webhook.webhookSecret ? "HMAC-SHA256 (v1)" : "none"} mono />
            <KV k="baseline" v={STAGEOS_VERSION} mono />
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" onClick={saveWebhook} disabled={webhookSaving}>
              {webhookSaving ? "保存中…" : "保存 Webhook 设置"}
            </Button>
            <Button size="sm" variant="outline" onClick={testWebhook} disabled={webhookTesting}>
              发送测试事件 (audit.completed)
            </Button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            v4.1 范围仅限 outbound + 签名：不做 inbound API、不做 token 认证、不引入外部 provider 系统。
          </p>
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

      <footer className="mt-2 px-3 py-2 border rounded bg-surface text-[11px] text-muted-foreground flex flex-wrap items-center gap-x-3 gap-y-1" data-stageos-watermark>
        <span>StageOS 版本水印</span>
        <span className="font-mono text-foreground/80 break-all">{STAGEOS_VERSION}</span>
        <span className="ml-auto font-mono">build · {new Date().toISOString().slice(0, 10)}</span>
      </footer>
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

function ProcSwitch({ label, desc, checked, onCheckedChange }: { label: string; desc: string; checked: boolean; onCheckedChange: (v: boolean) => void }) {
  return (
    <div className="flex items-center justify-between gap-3 border rounded px-2.5 py-2 bg-surface">
      <div className="min-w-0 flex-1">
        <div className="text-sm font-medium font-mono">{label}</div>
        <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
      </div>
      <Switch checked={checked} onCheckedChange={onCheckedChange} />
    </div>
  );
}

function describePdfSyncError(err: any): string {
  const raw = (err?.message || err?.error_description || String(err ?? "")).trim();
  const code = err?.code || err?.status;
  if (/permission denied/i.test(raw)) {
    return "权限不足：当前账号无法调用 sync_pdf_capability。请确认已登录，或联系管理员重新授予 authenticated EXECUTE 权限。";
  }
  if (/jwt|not authenticated|auth session/i.test(raw)) {
    return "登录会话已失效，请退出后重新登录再试。";
  }
  if (/invalid status/i.test(raw)) {
    return `传入的 status 非法（仅支持 PASS/WARN/FAIL/SKIP）：${raw}`;
  }
  if (/network|failed to fetch|timeout/i.test(raw)) {
    return `网络异常：${raw}`;
  }
  return raw ? `${raw}${code ? ` [${code}]` : ""}` : "未知错误";
}

function pdfSyncStatusLabel(status: string): string {
  switch (status) {
    case "PASS": return "成功";
    case "WARN": return "成功（警告）";
    case "FAIL": return "失败";
    case "SKIP": return "跳过";
    default: return status || "—";
  }
}

function pdfSyncStatusTone(status: string): "success" | "warning" | "destructive" | "muted" {
  switch (status) {
    case "PASS": return "success";
    case "WARN": return "warning";
    case "FAIL": return "destructive";
    case "SKIP": return "muted";
    default: return "muted";
  }
}

function PdfCapabilitySyncPanel({ pdfExportOn }: { pdfExportOn: boolean }) {
  const [state, setState] = useState<"idle" | "running" | "ok" | "error">("idle");
  const [error, setError] = useState<string | null>(null);
  const [dbRow, setDbRow] = useState<{ status: string; enabled: boolean; updated_at: string; notes: string | null } | null>(null);

  async function fetchLatest() {
    const { data, error } = await supabase
      .from("system_capabilities")
      .select("status,enabled,updated_at,notes")
      .eq("module", "pdf_export")
      .single();
    if (!error && data) setDbRow(data as any);
  }

  useEffect(() => {
    fetchLatest();
  }, []);

  async function run() {
    setState("running");
    setError(null);
    // 手动同步：不做真实 PDF 渲染，仅按当前 flag 状态回写能力行，用于验证 RPC 权限与链路。
    const capStatus = pdfExportOn ? "WARN" : "SKIP";
    const capEnabled = pdfExportOn;
    const capNotes = pdfExportOn
      ? "manual sync (Settings) — pdfExport 已开启，请运行 HealthCheck 获取真实探测结果"
      : "manual sync (Settings) — pdfExport 未开启";
    try {
      const { error: rpcErr } = await supabase.rpc("sync_pdf_capability", {
        p_status: capStatus,
        p_enabled: capEnabled,
        p_notes: capNotes,
      });
      if (rpcErr) throw rpcErr;
      await fetchLatest();
      setState("ok");
      toast.success(`PDF capability 已同步（${capStatus}）`);
    } catch (e: any) {
      const msg = describePdfSyncError(e);
      setError(msg);
      setState("error");
      toast.error(`PDF capability 同步失败：${msg}`);
    }
  }

  const timeStr = dbRow?.updated_at
    ? new Date(dbRow.updated_at).toLocaleString("zh-CN")
    : "—";

  return (
    <div className="panel">
      <div className="panel-header">
        <h2 className="text-sm font-semibold">PDF capability 同步</h2>
        <span className="kbd-route">rpc</span>
      </div>
      <div className="panel-body space-y-2 text-sm">
        <p className="text-xs text-muted-foreground">
          手动调用 <span className="font-mono">sync_pdf_capability</span> RPC，按当前 <span className="font-mono">pdfExport</span> flag 状态回写 <span className="font-mono">system_capabilities.pdf_export</span> 行；用于验证权限授予与 Release Gate 链路，不触发真实 PDF 渲染。
        </p>
        <div className="border rounded px-2.5 py-1.5 bg-surface flex items-center justify-between gap-2">
          <span className="text-xs text-muted-foreground">最近一次同步</span>
          <span className="flex items-center gap-2 flex-wrap justify-end">
            {dbRow ? (
              <ToneBadge tone={pdfSyncStatusTone(dbRow.status)}>
                {pdfSyncStatusLabel(dbRow.status)}
              </ToneBadge>
            ) : (
              <span className="text-xs text-muted-foreground">加载中…</span>
            )}
            <span className="text-muted-foreground font-mono text-xs">{timeStr}</span>
          </span>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button size="sm" onClick={run} disabled={state === "running"}>
            {state === "running" ? "同步中…" : "同步 PDF capability"}
          </Button>
          {state === "error" && (
            <Button size="sm" variant="outline" onClick={run} disabled={false}>
              重试
            </Button>
          )}
          {state === "ok" && (
            <span className="inline-flex items-center gap-1 text-xs text-success">
              <CheckCircle2 className="h-3.5 w-3.5" />
              同步成功
            </span>
          )}
        </div>
        {state === "error" && error && (
          <div
            role="alert"
            className="mt-1 flex items-start gap-2 border border-destructive/40 bg-destructive/5 text-destructive rounded px-2.5 py-2 text-xs"
          >
            <XCircle className="h-3.5 w-3.5 mt-0.5 shrink-0" />
            <div className="min-w-0 break-words">
              <div className="font-medium">同步失败</div>
              <div className="mt-0.5 font-mono text-[11px] whitespace-pre-wrap">{error}</div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

