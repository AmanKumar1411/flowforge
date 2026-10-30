import type {
  CycleEvent,
  CycleStage,
} from "../../course-cycles/domain/cycle-timeline";
import type { DashboardUpdate } from "../domain/dashboard-feed";

export interface CycleSummary {
  id: string;
  courseName: string;
  title: string;
  kind: "CORE" | "ELECTIVE";
  status: "DRAFT" | "PUBLISHED" | "CLOSED";
}

/** One line of "Up next": something to do (with its tab), or a date coming up. */
export interface UpNextItem {
  cycle: CycleSummary;
  kind: string;
  at: Date | null;
  text: string;
  /** For something to do: where, and whether this student can do it (or only their leader). */
  action?: { tab: "team" | "idea" | "milestones"; actionable: boolean };
}

export interface ProjectResult {
  milestone: { id: string; position: number; name: string };
  marks: number | null;
  maxMarks: number | null;
  feedback: string | null;
  releasedAt: Date;
  updatedAt: Date;
  updatedAfterRelease: boolean;
}

export interface ProjectCard {
  cycle: CycleSummary;
  currentStage: CycleStage;
  nextEvent: CycleEvent | null;
  myTeam: { id: string; name: string; memberCount: number } | null;
  myRole: "LEADER" | "MEMBER" | "NO_TEAM";
  /** The first thing to do in this project, if any. */
  todo: string | null;
  /** Released results (shown on past projects). */
  results: ProjectResult[];
}

export interface StudentDashboard {
  upNext: UpNextItem[];
  updates: (DashboardUpdate & { cycle: CycleSummary })[];
  projects: { active: ProjectCard[]; past: ProjectCard[] };
}
