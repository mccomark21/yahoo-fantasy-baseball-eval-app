interface EmptyStateProps {
  /** One-line, view-specific guidance on which filter to relax. */
  hint: string;
}

/**
 * Shared zero-results state for the data tables. Renders the "No results."
 * headline plus a contextual hint telling the manager which filter to relax.
 * Used in both the mobile card layout and the desktop table-cell layout so the
 * empty state reads identically across every view.
 */
export function EmptyState({ hint }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-1">
      <span className="text-sm font-medium text-foreground">No results.</span>
      <span className="text-sm text-muted-foreground">{hint}</span>
    </div>
  );
}
