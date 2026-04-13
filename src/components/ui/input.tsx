"use client";

import { Input as InputPrimitive } from "@base-ui/react/input";
import type * as React from "react";

import { cn } from "@/lib/utils";

export type InputProps = Omit<
  InputPrimitive.Props & React.RefAttributes<HTMLInputElement>,
  "size"
> & {
  size?: "sm" | "default" | "lg" | number;
  unstyled?: boolean;
  nativeInput?: boolean;
};

export function Input({
  className,
  size = "default",
  unstyled = false,
  nativeInput = false,
  ...props
}: InputProps): React.ReactElement {
  const inputClassName = cn(
    "w-full min-w-0 bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-500 [transition:background-color_5000000s_ease-in-out_0s]",
    size === "default" && "min-h-12 px-3 py-2.5",
    size === "sm" && "min-h-10 px-3 py-2",
    size === "lg" && "min-h-12 px-4 py-3",
    props.type === "search" &&
      "[&::-webkit-search-cancel-button]:appearance-none [&::-webkit-search-decoration]:appearance-none [&::-webkit-search-results-button]:appearance-none [&::-webkit-search-results-decoration]:appearance-none",
    props.type === "file" &&
      "text-muted-foreground file:me-3 file:bg-transparent file:font-medium file:text-foreground file:text-sm",
  );

  return (
    <span
      className={
        cn(
          !unstyled &&
            "relative inline-flex w-full rounded-[var(--radius)] border border-[color:var(--border-strong)] bg-[color:var(--card)] text-[color:var(--foreground)] shadow-[0_1px_0_rgba(255,255,255,0.85)] transition focus-within:ring-2 focus-within:ring-[color:var(--ring)] has-[:disabled]:opacity-60",
          className,
        ) || undefined
      }
      data-size={size}
      data-slot="input-control"
    >
      {nativeInput ? (
        <input
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          {...props}
        />
      ) : (
        <InputPrimitive
          className={inputClassName}
          data-slot="input"
          size={typeof size === "number" ? size : undefined}
          {...props}
        />
      )}
    </span>
  );
}

export { InputPrimitive };
