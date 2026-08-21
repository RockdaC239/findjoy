"use client";

import { useRef } from "react";
import { useRouter } from "next/navigation";
import { BrandLogo } from "../../components/BrandLogo";

// 会场大屏场景：单击容易误触，logo 需双击才跳回人生模拟器。
// 400ms 内第二次点击视为双击；router.push 自动带 basePath 前缀。
export function ShowcaseLogo() {
  const router = useRouter();
  const lastClickAt = useRef(0);

  const handleClick = () => {
    const now = Date.now();
    if (now - lastClickAt.current < 400) {
      router.push("/");
      return;
    }
    lastClickAt.current = now;
  };

  return <BrandLogo onClick={handleClick} aria-label="返回人生模拟器" title="双击返回人生模拟器" />;
}
