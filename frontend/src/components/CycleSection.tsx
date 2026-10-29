import type { ReactNode } from "react";

/**
 * A collapsible section of the cycle page: its name and a one-line summary
 * while closed, the full panel when open. Built on <details>, so it opens
 * with the keyboard and screen readers announce it as expandable.
 */
export function CycleSection({
  id,
  title,
  summary,
  open,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  summary: string;
  open: boolean;
  onToggle: (open: boolean) => void;
  children: ReactNode;
}) {
  return (
    <details
      id={id}
      className="cycle-section"
      open={open}
      onToggle={(event) => {
        // React re-renders with the same value after a user toggle; only report real changes.
        if (event.currentTarget.open !== open) onToggle(event.currentTarget.open);
      }}
    >
      <summary>
        <span className="cycle-section-title">{title}</span>
        <span className="cycle-section-summary">{summary}</span>
      </summary>
      {open && <div className="cycle-section-body">{children}</div>}
    </details>
  );
}
