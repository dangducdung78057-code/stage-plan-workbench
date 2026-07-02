import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Package, LogIn, UserPlus } from "lucide-react";
import { toast } from "sonner";

export default function AuthPage() {
  const { user, loading, signIn, signUp } = useAuth();
  const loc = useLocation();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  if (loading) return <div className="p-6 text-sm text-muted-foreground">加载中…</div>;
  if (user) {
    const from = (loc.state as any)?.from?.pathname ?? "/";
    return <Navigate to={from} replace />;
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!email || !password) { toast.error("请填写邮箱和密码"); return; }
    setBusy(true);
    const { error } = mode === "signin"
      ? await signIn(email, password)
      : await signUp(email, password);
    setBusy(false);
    if (error) { toast.error(error); return; }
    toast.success(mode === "signin" ? "已登录" : "注册成功，已自动登录");
  }

  return (
    <div className="min-h-screen bg-background grid place-items-center p-4">
      <div className="w-full max-w-sm panel">
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
          <div className="flex gap-1 p-0.5 bg-surface-muted rounded text-xs">
            <button type="button" onClick={() => setMode("signin")}
              className={`flex-1 py-1.5 rounded ${mode === "signin" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
              登录
            </button>
            <button type="button" onClick={() => setMode("signup")}
              className={`flex-1 py-1.5 rounded ${mode === "signup" ? "bg-background shadow-sm" : "text-muted-foreground"}`}>
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
      </div>
    </div>
  );
}
