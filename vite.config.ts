import { defineConfig, loadEnv, type Plugin } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";
import { createDashboardApi } from "./server/dashboardApi";

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, __dirname, "");
  const mongoUri = env.MONGODB_URI || process.env.MONGODB_URI;

  // Read-only Customer Dashboard data API (dev server only).
  // Serves GET /api/dashboard/* from the QA MongoDB using find/aggregate exclusively.
  const dashboardReadonlyApi: Plugin = {
    name: "dashboard-readonly-api",
    configureServer(server) {
      server.middlewares.use(createDashboardApi(mongoUri));
    },
  };

  return {
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === 'development' &&
      componentTagger(),
      dashboardReadonlyApi,
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    base: '/license-management/',
  };
});
