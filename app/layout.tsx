import { cookies } from "next/headers";
import { DeveloperModeProvider } from "../components/DeveloperMode";
import { isDeveloper } from "../lib/developer";
import { readDeveloperMode } from "../lib/developer-mode";
import type { Metadata } from "next";
import type { ReactNode } from "react";
import { AccountUserProvider } from "../components/AccountNav";
import { currentUser } from "../lib/auth";
import "./globals.css";

export const metadata: Metadata = {
  title: "findjoy | 人生模拟器",
  description: "一个由选择写成的人生模拟器。",
};

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const user = await currentUser();
  const allowed = await isDeveloper(user);
  const initial = readDeveloperMode((await cookies()).toString());
  return (
    <html lang="zh-CN">
      <body><AccountUserProvider user={user ? { displayName: user.displayName } : null}><DeveloperModeProvider key={user?.id ?? "guest"} allowed={allowed} initial={initial}>{children}</DeveloperModeProvider></AccountUserProvider></body>
    </html>
  );
}
