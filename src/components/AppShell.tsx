import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, Package, Download, Settings as SettingsIcon, Layers } from "lucide-react";
import { cn } from "@/lib/utils";

const nav = [
  { to: "/", label: "工作台", icon: LayoutDashboard, route: "/workspace" },
  { to: "/projects", label: "项目", icon: FolderKanban, route: "/projects" },
  { to: "/modules", label: "模块注册表", icon: Layers, route: "/modules" },
  { to: "/exports", label: "导出记录", icon: Download, route: "/exports" },
  { to: "/settings", label: "设置", icon: SettingsIcon, route: "/settings" },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-56 shrink-0 bg-sidebar text-sidebar-foreground border-r border-sidebar-border flex flex-col">
        <div className="px-4 py-4 border-b border-sidebar-border">
          <div className="flex items-center gap-2">
            <div className="h-7 w-7 rounded bg-sidebar-primary/90 grid place-items-center text-sidebar-primary-foreground font-bold">
              <Package className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold text-white">StageOS</div>
              <div className="text-[10px] font-mono text-sidebar-foreground/70">ops.costume.v1</div>
            </div>
          </div>
        </div>
        <nav className="flex-1 py-2">
          {nav.map((n) => (
            <NavLink
              key={n.to}
              to={n.to}
              end={n.to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2.5 px-4 py-2 text-[13px] border-l-2 border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors",
                  isActive && "bg-sidebar-accent text-white border-sidebar-primary",
                )
              }
            >
              <n.icon className="h-4 w-4" />
              <span className="flex-1">{n.label}</span>
              <span className="font-mono text-[10px] text-sidebar-foreground/50">{n.route}</span>
            </NavLink>
          ))}
        </nav>
        <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
          <div>学校演出服装排产</div>
          <div className="font-mono">v1 · mock mode</div>
        </div>
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-11 border-b bg-surface px-5 flex items-center gap-3 text-[13px]">
          <span className="text-muted-foreground">StageOS</span>
          <span className="text-muted-foreground">/</span>
          <span className="font-medium">运营工作台</span>
          <div className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
            <span className="kbd-route">mode: mock</span>
            <span className="kbd-route">tenant: single</span>
            <span className="kbd-route">auth: none</span>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
