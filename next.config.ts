import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  devIndicators: false,
  // 部署在 findfire.club/findjoy 子路径下（nginx 完整转发前缀，Next 自行处理）
  basePath: "/findjoy",
};

export default nextConfig;
