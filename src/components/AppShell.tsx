import { useState } from "react";
import { NavLink } from "react-router-dom";
import { LayoutDashboard, FolderKanban, Package, Download, Settings as SettingsIcon, Layers, Menu, LogOut } from "lucide-react";
import { cn } from "@/lib/utils";
import { Sheet, SheetContent, SheetTrigger } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";


const nav = [
  { to: "/", label: "工作台", icon: LayoutDashboard, route: "/workspace" },
  { to: "/projects", label: "项目", icon: FolderKanban, route: "/projects" },
  { to: "/modules", label: "模块注册表", icon: Layers, route: "/modules" },
  { to: "/exports", label: "导出记录", icon: Download, route: "/exports" },
  { to: "/settings", label: "设置", icon: SettingsIcon, route: "/settings" },
];

function SidebarInner({ onNavigate }: { onNavigate?: () => void }) {
  return (
    <div className="h-full flex flex-col bg-sidebar text-sidebar-foreground">
      <div className="px-4 py-4 border-b border-sidebar-border">
        <div className="flex items-center gap-2">
          <div className="h-7 w-7 rounded bg-sidebar-primary/90 grid place-items-center text-sidebar-primary-foreground font-bold">
            <Package className="h-4 w-4" />
          </div>
          <div className="min-w-0">
            <div className="text-sm font-semibold text-white whitespace-nowrap">StageOS</div>
            <div className="text-[10px] font-mono text-sidebar-foreground/70 whitespace-nowrap">ops.costume.v2</div>
          </div>
        </div>
      </div>
      <nav className="flex-1 py-2 overflow-y-auto">
        {nav.map((n) => (
          <NavLink
            key={n.to}
            to={n.to}
            end={n.to === "/"}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-2.5 px-4 py-2 text-[13px] border-l-2 border-transparent hover:bg-sidebar-accent hover:text-sidebar-accent-foreground transition-colors whitespace-nowrap",
                isActive && "bg-sidebar-accent text-white border-sidebar-primary",
              )
            }
          >
            <n.icon className="h-4 w-4 shrink-0" />
            <span className="flex-1 truncate">{n.label}</span>
            <span className="font-mono text-[10px] text-sidebar-foreground/50 hidden lg:inline">{n.route}</span>
          </NavLink>
        ))}
      </nav>
      <div className="px-4 py-3 border-t border-sidebar-border text-[11px] text-sidebar-foreground/60">
        <div className="whitespace-nowrap">学校演出服装排产</div>
        <div className="font-mono">stageos-v2.2-export-suite-pass</div>
      </div>
    </div>
  );
}

export function AppShell({ children }: { children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const { user, signOut } = useAuth();
  async function doSignOut() {
    await signOut();
    toast.success("已退出登录");
  }
  return (
    <div className="min-h-screen flex bg-background text-foreground w-full">
      <aside className="hidden md:flex md:w-56 shrink-0 border-r border-sidebar-border flex-col">
        <SidebarInner />
      </aside>
      <main className="flex-1 min-w-0 flex flex-col">
        <header className="h-11 border-b bg-surface px-3 md:px-5 flex items-center gap-2 md:gap-3 text-[13px]">
          <Sheet open={open} onOpenChange={setOpen}>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon" className="md:hidden h-8 w-8 shrink-0">
                <Menu className="h-4 w-4" />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="p-0 w-64 bg-sidebar border-sidebar-border">
              <SidebarInner onNavigate={() => setOpen(false)} />
            </SheetContent>
          </Sheet>
          <span className="text-muted-foreground hidden sm:inline">StageOS</span>
          <span className="text-muted-foreground hidden sm:inline">/</span>
          <span className="font-medium truncate">运营工作台</span>
          <div className="ml-auto flex items-center gap-2 text-muted-foreground text-xs">
            <span className="kbd-route hidden md:inline">mode: mock</span>
            <span className="kbd-route hidden lg:inline">auth: enabled</span>
            <span className="hidden sm:inline font-mono truncate max-w-[160px]" title={user?.email ?? ""}>{user?.email}</span>
            <Button variant="ghost" size="sm" className="h-7 px-2" onClick={doSignOut} title="退出登录">
              <LogOut className="h-3.5 w-3.5 sm:mr-1" />
              <span className="hidden sm:inline">退出</span>
            </Button>
          </div>
        </header>
        <div className="flex-1 min-h-0 overflow-auto">{children}</div>
      </main>
    </div>
  );
}
