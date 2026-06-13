import * as React from "react";

import { cn } from "./lib/utils";

const Textarea = React.forwardRef<HTMLTextAreaElement, React.ComponentProps<"textarea">>(
  ({ className, ...props }, ref) => {
    return (
      <textarea
        className={cn(
          "hover:border-foreground/20 focus-visible:ring-ring/40 border-border bg-input text-foreground placeholder:text-muted-foreground focus-visible:border-ring flex min-h-[60px] w-full rounded-sm border px-3 py-2 text-sm shadow-sm transition focus-visible:outline-none focus-visible:ring-2 disabled:cursor-not-allowed disabled:opacity-50",
          className
        )}
        ref={ref}
        {...props}
      />
    );
  }
);
Textarea.displayName = "Textarea";

export { Textarea };
