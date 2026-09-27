process.env.NODE_ENV = "production";

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  mode: "production",
  resolve: {
    alias: { "@": path.resolve("frontend/src") },
  },
  plugins: [
    react({
      jsxRuntime: "automatic",
    }),
    tailwindcss(),
  ],
  define: {
    "process.env.NODE_ENV": JSON.stringify("production"),
  },
  build: {
    outDir: "frontend",
    emptyOutDir: false,
    minify: false,
    lib: {
      entry: path.resolve("frontend/src/main.jsx"),
      name: "App",
      formats: ["es"],
      fileName: () => "app.js",
    },
    rollupOptions: {
      output: {
        assetFileNames: (assetInfo) => {
          if (assetInfo.name && assetInfo.name.endsWith(".css")) {
            return "app.css";
          }
          return "[name].[ext]";
        },
      },
    },
  },
});
