"use client";

import Link from "next/link";
import { cn } from "@/lib/cn";

/**
 * Square, quiet icon affordance used in panel headers (close, open-detail…).
 * Ghost by default; fills to a raised surface on hover. Renders as a button or
 * an internal Link.
 */
export function IconButton({
  children,
  onClick,
  href,
  label,
  title,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  href?: string;
  label: string;
  title?: string;
  className?: string;
}) {
  const cls = cn(
    "flex h-9 w-9 items-center justify-center rounded-lg text-fg-subtle transition-colors duration-150 hover:bg-surface-3 hover:text-fg",
    className,
  );
  if (href) {
    return (
      <Link href={href} aria-label={label} title={title ?? label} className={cls}>
        {children}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} aria-label={label} title={title ?? label} className={cls}>
      {children}
    </button>
  );
}
