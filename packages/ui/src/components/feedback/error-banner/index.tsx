import { cn } from "../../../lib/utils";

interface ErrorBannerProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode;
  className?: string;
}

export function ErrorBanner({ children, className, ...props }: ErrorBannerProps) {
  return (
    <div
      className={cn(
        "border-destructive-border bg-destructive-muted text-destructive rounded-md border px-4 py-3 text-sm",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export { ErrorBanner as default };
