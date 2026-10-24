import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
export default defineConfig({
  plugins: [react()],
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
});
