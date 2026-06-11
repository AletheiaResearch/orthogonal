export function IntegrationSettingsSkeleton() {
  return (
    <div className="animate-pulse">
      {/* Title + description */}
      <div className="mb-2 h-6 w-36 rounded bg-muted" />
      <div className="mb-6 h-4 w-72 rounded bg-muted" />

      {/* Section: Connection */}
      <div className="mb-5 rounded-md border border-border-muted p-5">
        <div className="mb-2 h-3 w-24 rounded bg-muted" />
        <div className="mb-4 h-4 w-56 rounded bg-muted" />
        <div className="h-4 w-full rounded bg-muted" />
      </div>

      {/* Section: Defaults & Scope */}
      <div className="mb-5 rounded-md border border-border-muted p-5">
        <div className="mb-2 h-3 w-28 rounded bg-muted" />
        <div className="mb-4 h-4 w-64 rounded bg-muted" />
        <div className="mb-3 h-10 w-full rounded bg-muted" />
        <div className="mb-3 grid grid-cols-2 gap-2">
          <div className="h-10 rounded bg-muted" />
          <div className="h-10 rounded bg-muted" />
        </div>
        <div className="h-9 w-20 rounded bg-muted" />
      </div>

      {/* Section: Repository Overrides */}
      <div className="rounded-md border border-border-muted p-5">
        <div className="mb-2 h-3 w-40 rounded bg-muted" />
        <div className="mb-4 h-4 w-72 rounded bg-muted" />
        <div className="mb-3 h-4 w-full rounded bg-muted" />
        <div className="flex gap-2">
          <div className="h-10 flex-1 rounded bg-muted" />
          <div className="h-10 w-28 rounded bg-muted" />
        </div>
      </div>
    </div>
  );
}
