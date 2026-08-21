import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "node",
    include: ["lib/**/*.test.ts"],
    // 使用 forks 池，避免 CI runner 上 tinypool worker 偶发崩溃
    pool: "forks",
    poolOptions: { forks: { singleFork: true } },
  },
});
