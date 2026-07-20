import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { resolve } from "node:path";

export default defineConfig({
  root: __dirname,
  base: "./",
  plugins: [react()],
  build: {
    // Keep the bundled interface compatible with older Android System WebView
    // versions. Some Android 10 devices still parse ES2015 but not optional
    // chaining/nullish coalescing, which otherwise leaves the WebView blank.
    target: "es2015",
    outDir: resolve(__dirname, "../app/src/main/assets/www"),
    emptyOutDir: true,
  },
});
