import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiPort = Number(process.env.LT_API_PORT ?? 3001);

export default defineConfig({
  plugins: [react()],
  server: {
    port: Number(process.env.LT_WEB_PORT ?? 5173),
    // Fail instead of silently moving to another port when this one is taken.
    strictPort: true,
    proxy: {
      "/api": `http://localhost:${apiPort}`,
    },
  },
});
