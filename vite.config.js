import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Só o editor passa pelo Vite. O resto do site é copiado como está (scripts/copy-static.mjs).
export default defineConfig({
  root: "editor",
  base: "./",
  plugins: [react()],
  build: { outDir: "../dist/editor", emptyOutDir: true, chunkSizeWarningLimit: 1200 }
});
