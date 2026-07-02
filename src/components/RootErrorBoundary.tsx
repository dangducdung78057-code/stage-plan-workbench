import { Component, ReactNode } from "react";

type State = { error: Error | null };

export class RootErrorBoundary extends Component<{ children: ReactNode }, State> {
  state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  componentDidCatch(error: Error, info: unknown) {
    console.error("[RootErrorBoundary]", error, info);
  }

  private reload = () => window.location.reload();

  private hardReset = () => {
    try {
      Object.keys(localStorage)
        .filter((k) => k.startsWith("sb-") || k.startsWith("stageos"))
        .forEach((k) => localStorage.removeItem(k));
    } catch {}
    window.location.href = "/auth";
  };

  render() {
    if (!this.state.error) return this.props.children;
    return (
      <div className="min-h-screen bg-background text-foreground grid place-items-center p-6">
        <div className="w-full max-w-md border rounded-md bg-surface p-5 space-y-3">
          <div className="text-sm font-semibold">应用出错</div>
          <div className="text-xs text-muted-foreground font-mono break-all">
            {this.state.error.message || String(this.state.error)}
          </div>
          <div className="flex gap-2 pt-1">
            <button
              onClick={this.reload}
              className="flex-1 h-9 rounded border text-sm hover:bg-surface-muted"
            >
              刷新
            </button>
            <button
              onClick={this.hardReset}
              className="flex-1 h-9 rounded bg-primary text-primary-foreground text-sm"
            >
              清除本地会话并重试
            </button>
          </div>
          <p className="text-[11px] text-muted-foreground">
            若持续白屏，请在手机浏览器里先登录 lovable.dev 后再打开预览链接。
          </p>
        </div>
      </div>
    );
  }
}
