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
  return (
    <html lang="zh-CN">
      <body><AccountUserProvider user={user ? { displayName: user.displayName } : null}>{children}</AccountUserProvider></body>
    </html>
  );
}
