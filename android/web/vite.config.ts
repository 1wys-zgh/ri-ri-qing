import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  build: {
    outDir: resolve(__dirname, "../app/src/main/assets/www"),
    emptyOutDir: true,
  },
});
