import { Injectable } from "@nestjs/common";
import { Clock } from "../../common/clock";
import type {
  CycleView,
  StudentEvent,
} from "../../course-cycles/application/cycle-views";
import { pickMarks } from "../../evaluations/application/evaluation-views";
import { buildUpdates } from "../domain/dashboard-feed";
import { StudentTodoRules, TodoItem } from "../domain/student-todo-rules";
import {
  CycleSummary,
  ProjectCard,
  StudentDashboard,
  UpNextItem,
} from "./dashboard-views";
import {
  DashboardActor,
  DashboardIdea,
  DashboardTeam,
  StudentSources,
} from "./ports/student-sources";

export const UP_NEXT_LIMIT = 10;

const summary = (cycle: CycleView): CycleSummary => ({
  id: cycle.id,
  courseName: cycle.courseName,
  title: cycle.title,
  kind: cycle.kind,
  status: cycle.status,
});

const label = (m: { position: number; name: string }) =>
  `M${m.position} · ${m.name}`;

/** Words for a date coming up; the frontend adds the date. */
export function eventText(event: StudentEvent): string {
  switch (event.kind) {
    case "TEAM_DEADLINE":
      return "Team deadline";
    case "IDEA_DEADLINE":
      return "Idea deadline";
    case "SUBMISSION_OPENS":
      return `${label(event.milestone!)} opens`;
    case "SUBMISSION_DUE":
      return `${label(event.milestone!)} due`;
    case "EVALUATION":
      return `${label(event.milestone!)} evaluation`;
  }
}

/**
 * The student's dashboard (ADR 021): a read model composed from the other
 * modules, owning no tables. Every source is read once for all projects;
 * to-dos, updates and cards are computed here from that data.
 */
@Injectable()
export class DashboardService {
  private readonly todos = StudentTodoRules.withDefaults();

  constructor(
    private readonly sources: StudentSources,
    private readonly clock: Clock,
  ) {}

  async forStudent(actor: DashboardActor): Promise<StudentDashboard> {
    const [active, past, events, teams] = await Promise.all([
      this.sources.activeCycles(actor),
      this.sources.pastCycles(actor),
      this.sources.upcomingEvents(actor),
      this.sources.myTeams(actor),
    ]);
    const teamIds = teams.map((team) => team.id);
    const [ideas, submitted, results] = await Promise.all([
      this.sources.ideasOf(teamIds),
      this.sources.submittedMilestones(teamIds),
      this.sources.releasedResults(actor.id, teamIds),
    ]);
    const now = this.clock.now();
    const cycles = new Map(
      [...active, ...past].map((cycle) => [cycle.id, cycle]),
    );
    const teamOf = (cycleId: string) =>
      teams.find((team) => team.cycleId === cycleId) ?? null;
    const ideaOf = (team: DashboardTeam | null): DashboardIdea | null =>
      team ? (ideas.find((idea) => idea.teamId === team.id) ?? null) : null;

    const todosOf = (cycle: CycleView): TodoItem[] => {
      const team = teamOf(cycle.id);
      return this.todos.itemsFor({
        now,
        cycle,
        team: team && { id: team.id, isLeader: team.leaderId === actor.id },
        idea: ideaOf(team),
        submittedMilestoneIds: new Set(
          submitted
            .filter((pair) => pair.teamId === team?.id)
            .map((pair) => pair.milestoneId),
        ),
      });
    };
    const card = (cycle: CycleView): ProjectCard => {
      const team = teamOf(cycle.id);
      const milestones = new Map(cycle.milestones.map((m) => [m.id, m]));
      return {
        cycle: summary(cycle),
        currentStage: cycle.currentStage,
        nextEvent: cycle.nextEvents[0] ?? null,
        myTeam: team && {
          id: team.id,
          name: team.name,
          memberCount: team.members.length,
        },
        myRole: !team
          ? "NO_TEAM"
          : team.leaderId === actor.id
            ? "LEADER"
            : "MEMBER",
        todo: todosOf(cycle)[0]?.text ?? null,
        results: results
          .filter(
            (result) =>
              result.teamId === team?.id && milestones.has(result.milestoneId),
          )
          .map((result) => {
            const m = milestones.get(result.milestoneId)!;
            return {
              milestone: { id: m.id, position: m.position, name: m.name },
              ...pickMarks(result),
              feedback: result.feedback,
              releasedAt: result.releasedAt!,
              updatedAt: result.updatedAt,
              updatedAfterRelease: result.updatedAfterRelease,
            };
          })
          .sort((a, b) => a.milestone.position - b.milestone.position),
      };
    };

    // Actions first (soonest deadline first, open-ended last), then dates.
    const actions: UpNextItem[] = active
      .flatMap((cycle) => todosOf(cycle).map((item) => ({ item, cycle })))
      .sort(
        (a, b) =>
          (a.item.at?.getTime() ?? Infinity) -
          (b.item.at?.getTime() ?? Infinity),
      )
      .map(({ item, cycle }) => ({
        cycle: summary(cycle),
        kind: item.kind,
        at: item.at,
        text: item.text,
        action: { tab: item.tab, actionable: item.actionable },
      }));
    const dates: UpNextItem[] = events.flatMap((event) => {
      const cycle = cycles.get(event.cycle.id);
      return cycle
        ? [
            {
              cycle: summary(cycle),
              kind: event.kind,
              at: event.at,
              text: eventText(event),
            },
          ]
        : [];
    });

    const cardsByCycle = [...active, ...past].map((cycle) => ({
      cycle,
      card: card(cycle),
    }));
    const updates = buildUpdates({
      memberships: teams.flatMap((team) =>
        team.members
          .filter((member) => member.userId === actor.id)
          .map((member) => ({
            cycleId: team.cycleId,
            teamName: team.name,
            addedAt: member.addedAt,
          })),
      ),
      reviews: teams.flatMap((team) =>
        (ideaOf(team)?.reviews ?? []).map((review) => ({
          ...review,
          cycleId: team.cycleId,
        })),
      ),
      results: cardsByCycle.flatMap(({ cycle, card }) =>
        card.results.map((result) => ({ ...result, cycleId: cycle.id })),
      ),
    }).flatMap((update) => {
      const cycle = cycles.get(update.cycleId);
      return cycle ? [{ ...update, cycle: summary(cycle) }] : [];
    });

    return {
      upNext: [...actions, ...dates].slice(0, UP_NEXT_LIMIT),
      updates,
      projects: {
        active: cardsByCycle
          .filter(({ cycle }) => cycle.status !== "CLOSED")
          .map(({ card }) => card),
        past: cardsByCycle
          .filter(({ cycle }) => cycle.status === "CLOSED")
          .map(({ card }) => card),
      },
    };
  }
}
