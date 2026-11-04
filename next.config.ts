import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  devIndicators: false,
  // 手机通过局域网 IP 访问本地 dev server 时，Next 默认拦掉 cross-origin 的 /_next 资源与 HMR，
  // 页面只有 SSR、不会 hydrate（菜单点不开、按钮没反应）。这里放行局域网调试来源。
  allowedDevOrigins: ["192.168.3.*", "127.0.0.1"],
  outputFileTracingIncludes: {
    "/api/life/**": ["./lib/engine/prompts/*.md"],
  },
  // 部署在 findfire.club/findjoy 子路径下（nginx 完整转发前缀，Next 自行处理）
  basePath: "/findjoy",
};

export default nextConfig;
