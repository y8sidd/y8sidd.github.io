import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    watch: {
      ignored: [
        "**/backend/**",
        "**/test-results/**",
        "**/playwright-report/**",
        "**/.pages-test/**",
        "**/.version-backups/**",
      ],
    },
  },
  optimizeDeps: {
    include: [
      "@codemirror/state",
      "@codemirror/view",
      "@codemirror/language",
      "@codemirror/lang-javascript",
      "@lezer/highlight",
      "three",
      "@react-three/fiber",
      "@react-three/drei",
    ],
  },
  test: {
    environment: "jsdom",
    setupFiles: ["./src/test-setup.ts"],
    include: ["src/**/*.test.{ts,tsx}"],
  },
  build: { chunkSizeWarningLimit: 1100 },
});
