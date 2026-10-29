import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    include: ["src/**/*.test.{ts,tsx}"],
    setupFiles: ["src/test-setup.ts"],
    // One time zone, so dates in text are the same on every machine; tests that need another set it themselves.
    env: { TZ: "Asia/Kolkata" },
    restoreMocks: true,
  },
});
