import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";
import { FullPageLoader } from "@/components/FullPageLoader";


export default function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const loc = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <FullPageLoader />;
  if (user) {
    const from = (loc.state as any)?.from?.pathname ?? "/workspace";
    return <Navigate to={from} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error("请填写邮箱和密码"); return; }
    setBusy(true);
    const res = mode === "signin"
      ? await signIn(email, password)
      : await signUp(email, password);
    setBusy(false);
    if (res.error) { toast.error(res.error); return; }
    if (mode === "signup" && (res as { needsEmailConfirm?: boolean }).needsEmailConfirm) {
      toast.info("确认邮件已发送，请前往邮箱点击链接完成注册后再登录。");
      setMode("signin");
      return;
    }
    toast.success(mode === "signin" ? "已登录" : "注册成功，已自动登录");
  }

  return (
    <div className="min-h-dvh bg-background grid place-items-center p-4 relative overflow-hidden">
      {/* 玻璃折射用环境光斑 */}
      <div aria-hidden className="pointer-events-none absolute -top-32 right-[-10%] h-96 w-96 rounded-full bg-accent/10 blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-32 left-[-10%] h-96 w-96 rounded-full bg-white/5 blur-3xl" />
      <main className="w-full max-w-sm panel relative">
        <h1 className="sr-only">登录 StageOS 演出服装排产工作台</h1>
        <div className="panel-header">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-primary grid place-items-center text-primary-foreground">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">StageOS</div>
              <div className="text-[10px] font-mono text-muted-foreground">ops.costume.v2</div>
            </div>
          </div>
          <span className="kbd-route">auth</span>
        </div>
        <form onSubmit={submit} className="panel-body space-y-3">
          <div className="flex gap-1 p-0.5 bg-white/5 rounded-lg text-xs">
            <button type="button" onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded-md transition-colors ${mode === "signin" ? "bg-white/15 text-foreground shadow-sm" : "text-muted-foreground"}`}>
              登录
            </button>
            <button type="button" onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded-md transition-colors ${mode === "signup" ? "bg-white/15 text-foreground shadow-sm" : "text-muted-foreground"}`}>
              注册
            </button>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">邮箱</Label>
            <Input type="email" value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@school.edu" autoComplete="email" />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs text-muted-foreground">密码</Label>
            <Input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              placeholder="至少 6 位" autoComplete={mode === "signin" ? "current-password" : "new-password"} />
          </div>
          <Button type="submit" className="w-full" disabled={busy}>
            {mode === "signin" ? <><LogIn className="h-4 w-4 mr-1" />登录</> : <><UserPlus className="h-4 w-4 mr-1" />注册并登录</>}
          </Button>
          <p className="text-[11px] text-muted-foreground">
            v2 已启用邮箱注册与登录；所有项目、快照、导出记录按 <span className="font-mono">user_id</span> 隔离。
          </p>
        </form>
      </main>
    </div>
  );
}
