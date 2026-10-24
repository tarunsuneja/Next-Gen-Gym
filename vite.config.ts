import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  build: {
    target: "es2020",
    cssCodeSplit: true,
    sourcemap: false,
    chunkSizeWarningLimit: 500,
    minify: "esbuild",
    manifest: true,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return;
          if (id.includes("@supabase/supabase-js")) return "vendor-supabase";
          if (/(node_modules\/react\/|node_modules\/react-dom\/|node_modules\/scheduler\/)/.test(id)) {
            return "vendor-react";
          }
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("@tanstack")) return "vendor-query";
          return "vendor-misc";
        },
        chunkFileNames: "assets/js/[name]-[hash].js",
        assetFileNames: "assets/[ext]/[name]-[hash][extname]",
        entryFileNames: "assets/js/[name]-[hash].js",
      },
    },
  },
  server: {
    host: true,
    allowedHosts: [".trycloudflare.com"],
    proxy: {
      "/supabase": {
        target: "http://127.0.0.1:61321",
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/supabase/, ""),
      },
    },
  },
  optimizeDeps: {
    include: ["react", "react-dom", "@supabase/supabase-js", "lucide-react"],
  },
});
