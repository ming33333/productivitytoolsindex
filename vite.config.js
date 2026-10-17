import fs from "fs";
import path from "path";
import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react";

const site = JSON.parse(
  fs.readFileSync(new URL("./site.config.json", import.meta.url), "utf8"),
);

function spaFallback() {
  return {
    name: "spa-fallback",
    apply: "build",
    closeBundle() {
      const buildDir = path.resolve("build");
      const indexPath = path.join(buildDir, "index.html");
      if (!fs.existsSync(indexPath)) return;
      fs.copyFileSync(indexPath, path.join(buildDir, "404.html"));
    },
  };
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "REACT_APP_");
  const localTesting = loadEnv(mode, process.cwd(), "").LOCAL_TESTING || "true";

  return {
    base: site.base || "/",
    plugins: [react(), spaFallback()],
    envPrefix: "REACT_APP_",
    build: {
      outDir: "build",
      emptyOutDir: true,
    },
    server: {
      port: 3000,
      strictPort: false,
    },
    define: {
      ...Object.fromEntries(
        Object.entries(env).map(([key, value]) => [
          `process.env.${key}`,
          JSON.stringify(value),
        ]),
      ),
      "process.env.LOCAL_TESTING": JSON.stringify(localTesting),
      "import.meta.env.LOCAL_TESTING": JSON.stringify(localTesting),
    },
  };
});
