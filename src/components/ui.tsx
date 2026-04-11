import {
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { cn } from "@/lib/utils";

export { Button, type ButtonProps } from "./ui/button";
export { cn };

type BadgeVariant =
  | "default"
  | "secondary"
  | "outline"
  | "success"
  | "warning"
  | "destructive"
  | "info";

const badgeVariants = {
  default: "border-transparent bg-zinc-950 text-white",
  secondary:
    "border border-[color:var(--border-strong)] bg-[color:var(--secondary)] text-[color:var(--foreground)]",
  outline:
    "border border-[color:var(--border-strong)] bg-[color:var(--card)] text-[color:var(--muted-foreground)]",
  success: "border border-emerald-200 bg-emerald-50 text-emerald-700",
  warning: "border border-amber-200 bg-amber-50 text-amber-700",
  destructive: "border border-rose-200 bg-rose-50 text-rose-700",
  info: "border border-sky-200 bg-sky-50 text-sky-700",
} satisfies Record<BadgeVariant, string>;

export function Badge({
  children,
  className,
  variant = "default",
  ...props
}: HTMLAttributes<HTMLSpanElement> & {
  variant?: BadgeVariant;
}) {
  return (
    <span
      {...props}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.12em]",
        badgeVariants[variant],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Card({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "overflow-hidden rounded-[calc(var(--radius)+2px)] border border-[color:var(--border-strong)] bg-[color:var(--card)] text-[color:var(--card-foreground)] shadow-[0_1px_2px_rgba(15,23,42,0.05),0_18px_40px_rgba(15,23,42,0.06)]",
        className,
      )}
    />
  );
}

export function CardHeader({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("flex flex-col gap-2 px-5 pt-5", className)} />;
}

export function CardAction({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("flex shrink-0 items-center gap-2", className)} />;
}

export function CardTitle({ className, ...props }: HTMLAttributes<HTMLHeadingElement>) {
  return (
    <h2
      {...props}
      className={cn(
        "text-lg font-semibold tracking-[-0.03em] text-[color:var(--card-foreground)]",
        className,
      )}
    />
  );
}

export function CardDescription({ className, ...props }: HTMLAttributes<HTMLParagraphElement>) {
  return (
    <p
      {...props}
      className={cn("text-sm leading-6 text-[color:var(--muted-foreground)]", className)}
    />
  );
}

export function CardPanel({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return <div {...props} className={cn("px-5 py-5", className)} />;
}

export function CardFooter({ className, ...props }: HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      {...props}
      className={cn(
        "flex flex-wrap items-center gap-3 border-t border-[color:var(--border)] px-5 py-4",
        className,
      )}
    />
  );
}

type InputSize = "default" | "sm" | "lg";

const inputSizes = {
  default: "h-10 px-3 text-sm",
  sm: "h-9 px-3 text-sm",
  lg: "h-11 px-4 text-sm",
} satisfies Record<InputSize, string>;

export function Input({
  className,
  uiSize = "default",
  ...props
}: InputHTMLAttributes<HTMLInputElement> & {
  uiSize?: InputSize;
}) {
  return (
    <input
      {...props}
      className={cn(
        "w-full rounded-[calc(var(--radius)-6px)] border border-[color:var(--border-strong)] bg-[color:var(--input)] text-[color:var(--foreground)] shadow-[0_1px_0_rgba(255,255,255,0.85)] outline-none transition placeholder:text-[color:var(--muted-foreground)] focus-visible:ring-2 focus-visible:ring-[color:var(--ring)]",
        inputSizes[uiSize],
        className,
      )}
    />
  );
}

export function Kbd({
  children,
  className,
  ...props
}: HTMLAttributes<HTMLElement> & {
  children: ReactNode;
}) {
  return (
    <kbd
      {...props}
      className={cn(
        "inline-flex min-h-6 items-center rounded-md border border-[color:var(--border-strong)] bg-[color:var(--secondary)] px-1.5 text-[11px] font-medium text-[color:var(--muted-foreground)] shadow-[0_1px_0_rgba(255,255,255,0.9)]",
        className,
      )}
    >
      {children}
    </kbd>
  );
}

type ScrollFadeTone = "background" | "card";

const scrollFadeTones = {
  background: "from-[color:var(--background)]",
  card: "from-[color:var(--card)]",
} satisfies Record<ScrollFadeTone, string>;

export function ScrollFade({
  className,
  showBottom,
  showTop,
  tone = "background",
}: {
  className?: string;
  showBottom: boolean;
  showTop: boolean;
  tone?: ScrollFadeTone;
}) {
  return (
    <>
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 top-0 z-10 h-8 bg-gradient-to-b to-transparent transition-opacity duration-150",
          scrollFadeTones[tone],
          showTop ? "opacity-100" : "opacity-0",
          className,
        )}
      />
      <div
        aria-hidden="true"
        className={cn(
          "pointer-events-none absolute inset-x-0 bottom-0 z-10 h-8 bg-gradient-to-t to-transparent transition-opacity duration-150",
          scrollFadeTones[tone],
          showBottom ? "opacity-100" : "opacity-0",
          className,
        )}
      />
    </>
  );
}
