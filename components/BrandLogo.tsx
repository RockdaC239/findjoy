import Link from "next/link";
import type { ComponentPropsWithoutRef, ReactNode } from "react";

export type BrandLogoProps = {
  href?: string;
  className?: string;
  compact?: boolean;
  children?: ReactNode;
} & Omit<ComponentPropsWithoutRef<"button">, "children" | "className">;

export function BrandLogo({ href, className = "", compact = false, children, ...buttonProps }: BrandLogoProps) {
  const classes = ["brand-logo", compact ? "brand-logo--compact" : "", className].filter(Boolean).join(" ");
  const content = children ?? <><span>findjoy</span><b aria-hidden="true">.</b></>;

  if (href) {
    return <Link className={classes} href={href} aria-label="findjoy">{content}</Link>;
  }

  return <button className={classes} type="button" aria-label="Restart Findjoy" {...buttonProps}>{content}</button>;
}
