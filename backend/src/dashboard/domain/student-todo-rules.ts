/** What the to-do rules know about one of the student's projects. Plain data, no I/O. */
export interface TodoContext {
  now: Date;
  cycle: {
    id: string;
    status: "DRAFT" | "PUBLISHED" | "CLOSED";
    teamDeadline: Date;
    ideaDeadline: Date;
    milestones: {
      id: string;
      position: number;
      name: string;
      submissionOpensAt: Date;
      submissionDueAt: Date;
    }[];
  };
  team: { id: string; isLeader: boolean } | null;
  idea: { status: "SUBMITTED" | "APPROVED" | "REJECTED" } | null;
  /** Milestones the team has handed in at least one version for. */
  submittedMilestoneIds: ReadonlySet<string>;
}

export type TodoKind =
  "JOIN_TEAM" | "SUBMIT_IDEA" | "REVISE_IDEA" | "SUBMIT_WORK";

/** One thing the student should do, or know their leader must do. */
export interface TodoItem {
  /** Unique per project and thing to do, so a rule never adds the same item twice. */
  key: string;
  cycleId: string;
  kind: TodoKind;
  text: string;
  /** The deadline, if there is one. */
  at: Date | null;
  /** The project tab where it is done. */
  tab: "team" | "idea" | "milestones";
  /** False when only the leader can act: shown to members as information, not a button. */
  actionable: boolean;
  milestoneId?: string;
}

/** One kind of to-do (Strategy): a new one is a class and a `register` call. */
export interface TodoRule {
  readonly name: string;
  items(context: TodoContext): TodoItem[];
}

const published = (context: TodoContext) =>
  context.cycle.status === "PUBLISHED";

export class NoTeamWhileForming implements TodoRule {
  readonly name = "no team while teams form";
  items(context: TodoContext): TodoItem[] {
    if (
      !published(context) ||
      context.team ||
      context.now >= context.cycle.teamDeadline
    )
      return [];
    return [
      {
        key: `${context.cycle.id}:team`,
        cycleId: context.cycle.id,
        kind: "JOIN_TEAM",
        text: "Create or join a team",
        at: context.cycle.teamDeadline,
        tab: "team",
        actionable: true,
      },
    ];
  }
}

export class IdeaDue implements TodoRule {
  readonly name = "first idea due";
  items(context: TodoContext): TodoItem[] {
    const { team, idea, cycle, now } = context;
    if (!published(context) || !team || idea || now >= cycle.ideaDeadline)
      return [];
    return [
      {
        key: `${cycle.id}:idea`,
        cycleId: cycle.id,
        kind: "SUBMIT_IDEA",
        text: team.isLeader
          ? "Submit or pick your team's idea"
          : "Your leader submits or picks your team's idea",
        at: cycle.ideaDeadline,
        tab: "idea",
        actionable: team.isLeader,
      },
    ];
  }
}

export class RejectedIdea implements TodoRule {
  readonly name = "rejected idea";
  items(context: TodoContext): TodoItem[] {
    const { team, idea, cycle } = context;
    if (!published(context) || !team || idea?.status !== "REJECTED") return [];
    return [
      {
        key: `${cycle.id}:revise`,
        cycleId: cycle.id,
        kind: "REVISE_IDEA",
        text: team.isLeader
          ? "Revise your idea"
          : "Your idea was rejected; your leader revises it",
        at: null,
        tab: "idea",
        actionable: team.isLeader,
      },
    ];
  }
}

export class OpenMilestoneWithoutWork implements TodoRule {
  readonly name = "open milestone without a submission";
  items(context: TodoContext): TodoItem[] {
    const { team, idea, cycle, now } = context;
    if (!published(context) || !team || idea?.status !== "APPROVED") return [];
    return cycle.milestones
      .filter(
        (m) =>
          m.submissionOpensAt <= now &&
          now < m.submissionDueAt &&
          !context.submittedMilestoneIds.has(m.id),
      )
      .map((m) => ({
        key: `${cycle.id}:submit:${m.id}`,
        cycleId: cycle.id,
        kind: "SUBMIT_WORK" as const,
        text: `Submit M${m.position} · ${m.name}`,
        at: m.submissionDueAt,
        tab: "milestones" as const,
        // Any member can submit.
        actionable: true,
        milestoneId: m.id,
      }));
  }
}

/**
 * What a student should do next in a project, computed from its data (ADR
 * 021), never stored. Each rule is a strategy; the registry runs them all and
 * drops duplicates by key.
 */
export class StudentTodoRules {
  private readonly rules: TodoRule[] = [];

  register(rule: TodoRule): this {
    this.rules.push(rule);
    return this;
  }

  itemsFor(context: TodoContext): TodoItem[] {
    const seen = new Set<string>();
    return this.rules
      .flatMap((rule) => rule.items(context))
      .filter((item) => !seen.has(item.key) && Boolean(seen.add(item.key)));
  }

  static withDefaults(): StudentTodoRules {
    return new StudentTodoRules()
      .register(new NoTeamWhileForming())
      .register(new IdeaDue())
      .register(new RejectedIdea())
      .register(new OpenMilestoneWithoutWork());
  }
}
