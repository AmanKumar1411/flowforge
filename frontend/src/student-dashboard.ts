import { formatDate } from "./dates";
import type { DashboardUpdate, ProjectCard, ProjectTab, UpNextItem } from "./types";

/** The student's dashboard and project page in words and links, free of React (Phase 9). */

export function projectPath(cycleId: string, tab: ProjectTab = "overview") {
  return `/student/projects/${cycleId}${tab === "overview" ? "" : `?tab=${tab}`}`;
}

/** "Create or join a team by Tue, 4 Nov 2026 · 11:59 PM", "Team deadline: …". */
export function upNextText(item: UpNextItem): string {
  if (!item.at) return item.text;
  return item.action ? `${item.text} by ${formatDate(item.at)}` : `${item.text}: ${formatDate(item.at)}`;
}

/** Where an up-next line leads: its tab for a thing to do, the overview for a date. */
export function upNextLink(item: UpNextItem) {
  return projectPath(item.cycle.id, item.action?.tab ?? "overview");
}

export function updateLink(update: DashboardUpdate) {
  return projectPath(update.cycle.id, update.tab);
}

export const ROLE_TEXT: Record<ProjectCard["myRole"], string> = {
  LEADER: "You lead",
  MEMBER: "Member",
  NO_TEAM: "No team yet",
};

/** The project page's "What you need to do now", for this project only, things to do before dates. */
export function todosFor(cycleId: string, upNext: UpNextItem[]): UpNextItem[] {
  return upNext.filter((item) => item.cycle.id === cycleId && item.action);
}

export const PROJECT_TABS: { key: ProjectTab; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "team", label: "Team" },
  { key: "idea", label: "Idea" },
  { key: "milestones", label: "Milestones" },
];

export function tabOf(raw: string | null): ProjectTab {
  return raw === "all" || PROJECT_TABS.some((tab) => tab.key === raw) ? (raw as ProjectTab) : "overview";
}
