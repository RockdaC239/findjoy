"use client";

import { DeveloperDebugButton, useDeveloperMode } from "./DeveloperMode";
import styles from "./DeveloperMode.module.css";
import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type BrandLogoProps = {
  href?: string;
  className?: string;
  compact?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "children" | "className">;

export function BrandLogo({ href, className = "", compact = false, children, ...buttonProps }: BrandLogoProps) {
  const dev = useDeveloperMode();
  const classes = ["brand-logo", compact ? "brand-logo--compact" : "", className].filter(Boolean).join(" ");
  const content = children ?? <><span>findjoy</span><b aria-hidden="true">.</b></>;

  const logo = href
    ? <Link className={classes} href={href} aria-label="findjoy">{content}</Link>
    : <button className={classes} type="button" aria-label="Restart Findjoy" {...buttonProps}>{content}</button>;
  return dev.enabled ? <span className={styles.brandGroup}>{logo}<DeveloperDebugButton /></span> : logo;
}
