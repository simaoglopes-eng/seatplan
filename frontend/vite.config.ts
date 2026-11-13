import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

// One config for the dev server, the production build and the unit tests,
// so there is a single place to look when something behaves differently.
export default defineConfig({
  plugins: [react()],
  server: {
    // During development the FastAPI backend runs on port 8000. Proxying /api
    // keeps the browser on one origin, exactly like production on Vercel,
    // so no CORS setup is needed locally.
    proxy: {
      "/api": {
        target: "http://127.0.0.1:8000",
        changeOrigin: true,
      },
    },
  },
  build: {
    outDir: "dist",
    sourcemap: true,
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test/setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
    css: false,
    // The default 5 s is enough on an idle machine, but long interaction tests time out when the machine is busy
    // with other programs; a real hang still fails, only later.
    testTimeout: 20000,
  },
});
