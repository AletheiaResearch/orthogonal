import * as React from "react";

import { cn } from "./lib/utils";

const Input = React.forwardRef<HTMLInputElement, React.ComponentProps<"input">>(
  ({ className, type, ...props }, ref) => {
    return (
      <input
        type={type}
        className={cn(
          "hover:border-foreground/20 focus-visible:ring-ring/40 border-border bg-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring flex h-9 w-full rounded-sm border px-3 py-1 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Input.displayName = "Input";

export { Input };
