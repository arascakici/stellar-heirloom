import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  // `@/*` comes straight from tsconfig; Vite resolves it natively now, so no
  // plugin is needed to keep the two in step.
  resolve: { tsconfigPaths: true },
  test: {
    // Node by default: most of what is worth testing here is chain logic, and
    // jsdom's Uint8Array comes from a different realm than the one the ed25519
    // library checks against, so key handling fails inside it for no good
    // reason. Component tests opt back in with `// @vitest-environment jsdom`.
    environment: "node",
    // The contract workspace has its own runner; letting Vitest wander into
    // contracts/ would only find Rust it cannot read.
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
