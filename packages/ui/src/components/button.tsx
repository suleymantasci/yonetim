import { cva, type VariantProps } from "class-variance-authority";
import type { ButtonHTMLAttributes, ReactNode } from "react";

import { cn } from "../cn";

/**
 * SPEC Bölüm 11.3 — radius 8px (kart), 4px (input).
 * Tüm renkler semantik token; tema geçişi ayrıca ele alınmaz.
 */
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 rounded-lg text-sm font-semibold transition-colors " +
    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 " +
    "focus-visible:ring-offset-canvas disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-fg hover:bg-primary-hover",
        secondary: "bg-secondary text-secondary-fg hover:bg-secondary-hover",
        accent: "bg-accent text-accent-fg hover:bg-accent-hover",
        outline: "border border-border-strong bg-surface text-fg hover:bg-hover",
        ghost: "text-fg-muted hover:bg-hover hover:text-fg",
        danger: "bg-danger text-primary-fg hover:brightness-95",
      },
      size: {
        sm: "h-8 px-3 text-[13px]",
        md: "h-10 px-4",
        lg: "h-12 px-6 text-base",
      },
      block: { true: "w-full", false: "" },
    },
    defaultVariants: { variant: "primary", size: "md", block: false },
  },
);

export interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  icon?: ReactNode;
}

export function Button({ className, variant, size, block, icon, children, ...props }: ButtonProps) {
  return (
    <button className={cn(buttonVariants({ variant, size, block }), className)} {...props}>
      {icon}
      {children}
    </button>
  );
}

/** Bağlantı görünümlü buton (Next `Link` ile sarılarak kullanılır). */
export const linkButtonClass = buttonVariants;
