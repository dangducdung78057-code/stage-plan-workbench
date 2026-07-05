import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  // 加载 .env* 文件中的所有变量（含无 VITE_ 前缀的平台注入变量）
  const env = loadEnv(mode, process.cwd(), "");
  return {
  define: {
    // 兼容平台注入的 SUPABASE_* 环境变量（无 VITE_ 前缀时回退）
    "import.meta.env.VITE_SUPABASE_URL": JSON.stringify(
      env.VITE_SUPABASE_URL ?? env.SUPABASE_URL ?? process.env.SUPABASE_URL ?? "",
    ),
    "import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY": JSON.stringify(
      env.VITE_SUPABASE_PUBLISHABLE_KEY ?? env.SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? "",
    ),
  },
  server: {
    host: "::",
    port: 8080,
    hmr: {
      overlay: false,
    },
  },
  plugins: [react(), mode === "development" && componentTagger()].filter(Boolean),
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
    dedupe: ["react", "react-dom", "react/jsx-runtime", "react/jsx-dev-runtime", "@tanstack/react-query", "@tanstack/query-core"],
  },
  };
});
