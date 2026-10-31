import type { MouseEvent } from "react";

/**
 * Follows an in-page link by moving focus, not only the view: the next Tab
 * continues from the target (H16). The target needs tabIndex={-1}.
 */
export function focusTarget(event: MouseEvent<HTMLAnchorElement>, id: string) {
  const target = document.getElementById(id);
  if (!target) return;
  event.preventDefault();
  target.focus();
  target.scrollIntoView({ block: "start" });
}
