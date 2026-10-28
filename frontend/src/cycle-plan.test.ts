import { afterEach, describe, expect, it, vi } from "vitest";
import {
  academicYearFor,
  buildSchedule,
  DEFAULT_DURATIONS,
  planSummary,
  semesterFor,
  summaryText,
  timelineFromCycle,
  timelineProblems,
} from "./cycle-plan";

const noWindow = { finalDeadline: "2026-12-12", placingWindow: false };

describe("buildSchedule", () => {
  it("turns the default plan into the five dates the API stores (IST)", () => {
    expect(buildSchedule("2026-10-28", DEFAULT_DURATIONS, noWindow)).toEqual({
      // Wed 4 Nov 23:59 IST is 18:29 UTC.
      teamFormationDeadline: "2026-11-04T18:29:00.000Z",
      teamCompletionDeadline: null,
      ideaDeadline: "2026-11-11T18:29:00.000Z",
      // Submissions open at the start of the next day: Thu 12 Nov 00:00 IST.
      submissionStartAt: "2026-11-11T18:30:00.000Z",
      submissionDeadline: "2026-12-12T18:29:00.000Z",
    });
  });

  it("follows custom durations, and adds the faculty's window between teams and ideas", () => {
    expect(
      buildSchedule(
        "2026-10-28",
        { teams: 3, placing: 2, ideas: 4 },
        { finalDeadline: "2026-11-30", placingWindow: true },
      ),
    ).toMatchObject({
      teamFormationDeadline: "2026-10-31T18:29:00.000Z",
      teamCompletionDeadline: "2026-11-02T18:29:00.000Z",
      ideaDeadline: "2026-11-06T18:29:00.000Z",
      submissionStartAt: "2026-11-06T18:30:00.000Z",
    });
  });

  it("ignores the placing days when there is no window", () => {
    const off = buildSchedule("2026-10-28", { teams: 3, placing: 9, ideas: 4 }, noWindow);
    expect(off.teamCompletionDeadline).toBeNull();
    expect(off.ideaDeadline).toBe("2026-11-04T18:29:00.000Z");
  });

  it("rolls over month and year ends", () => {
    expect(
      buildSchedule("2026-12-28", { teams: 7, placing: 0, ideas: 3 }, {
        finalDeadline: "2027-02-28",
        placingWindow: false,
      }),
    ).toMatchObject({
      teamFormationDeadline: "2027-01-04T18:29:00.000Z",
      ideaDeadline: "2027-01-07T18:29:00.000Z",
      submissionStartAt: "2027-01-07T18:30:00.000Z",
    });
  });

  describe("in a time zone with daylight saving", () => {
    afterEach(() => {
      vi.unstubAllEnvs();
    });

    it("keeps 11:59 PM local across the change (New York, 1 Nov 2026)", () => {
      vi.stubEnv("TZ", "America/New_York");
      const schedule = buildSchedule("2026-10-28", DEFAULT_DURATIONS, noWindow);
      // Before the change 23:59 EDT is 03:59 UTC; after it, 23:59 EST is 04:59 UTC.
      expect(schedule.teamFormationDeadline).toBe("2026-11-05T04:59:00.000Z");
      const local = new Date(schedule.teamFormationDeadline);
      expect([local.getDate(), local.getHours(), local.getMinutes()]).toEqual([4, 23, 59]);
    });
  });
});

describe("timelineProblems", () => {
  const now = new Date("2026-10-28T06:00:00.000Z");
  const plan = {
    start: "2026-10-28",
    durations: DEFAULT_DURATIONS,
    finalDeadline: "2026-12-12",
    placingWindow: false,
  };

  it("finds nothing wrong with the default plan", () => {
    expect(timelineProblems(plan, now)).toEqual({});
  });

  it("explains phases shorter than a day", () => {
    expect(
      timelineProblems(
        { ...plan, placingWindow: true, durations: { teams: 0, placing: 0, ideas: 1.5 } },
        now,
      ),
    ).toEqual({
      teams: "Give students at least 1 whole day to form teams.",
      placing: "Give yourself at least 1 whole day, or switch the extra time off.",
      ideas: "Give teams at least 1 whole day for their idea.",
    });
  });

  it("explains a final deadline before or right after submissions open", () => {
    expect(timelineProblems({ ...plan, finalDeadline: "2026-11-10" }, now).finalDeadline)
      .toMatch(/^The final deadline is before submissions open \(Thu, 12 Nov 2026 · 12:00 AM\)/);
    expect(timelineProblems({ ...plan, finalDeadline: "2026-11-11" }, now).finalDeadline)
      .toMatch(/^The final deadline is before submissions open/);
    expect(timelineProblems({ ...plan, finalDeadline: "2026-11-12" }, now).finalDeadline)
      .toMatch(/less than a day/);
  });

  it("explains a students' deadline that is already past", () => {
    expect(
      timelineProblems({ ...plan, start: "2026-10-01", durations: { ...DEFAULT_DURATIONS, teams: 2 } }, now)
        .teams,
    ).toMatch(/already past/);
  });

  it("asks for missing dates", () => {
    expect(timelineProblems({ ...plan, start: "", finalDeadline: "2026-13-40" }, now)).toEqual({
      start: "Choose a start date.",
      finalDeadline: "Choose the final deadline.",
    });
  });
});

describe("timelineFromCycle", () => {
  it("measures a previous cycle's phases and moves them to a new start", () => {
    const previous = {
      createdAt: "2026-01-05T05:00:00.000Z",
      publishedAt: "2026-01-06T05:00:00.000Z",
      teamFormationDeadline: "2026-01-13T18:29:00.000Z",
      teamCompletionDeadline: "2026-01-15T18:29:00.000Z",
      ideaDeadline: "2026-01-20T18:29:00.000Z",
      submissionDeadline: "2026-02-20T18:29:00.000Z",
    };
    expect(timelineFromCycle(previous, "2026-10-28")).toEqual({
      start: "2026-10-28",
      durations: { teams: 7, placing: 2, ideas: 5 },
      finalDeadline: "2026-12-12",
      placingWindow: true,
    });
  });
});

describe("academic year and semester", () => {
  it("starts the academic year and the odd semester in July", () => {
    expect(academicYearFor(new Date(2026, 9, 28))).toBe("2026-27");
    expect(academicYearFor(new Date(2027, 0, 10))).toBe("2026-27");
    expect(semesterFor(2023, new Date(2026, 9, 28))).toBe(7);
    expect(semesterFor(2023, new Date(2027, 0, 10))).toBe(8);
    expect(semesterFor(2026, new Date(2026, 9, 28))).toBe(1);
    expect(semesterFor(2030, new Date(2026, 9, 28))).toBe(1);
  });
});

describe("planSummary", () => {
  const schedule = buildSchedule("2026-10-28", DEFAULT_DURATIONS, noWindow);

  it("reads as plain sentences with the key dates", () => {
    expect(
      summaryText(
        planSummary({ batchYear: 2023, kind: "CORE", minTeamSize: 2, maxTeamSize: 4, schedule }),
      ),
    ).toBe(
      "Batch 2023 students form teams of 2–4 until Wed, 4 Nov. Teams pick or propose an idea by Wed, 11 Nov. They submit work between Thu, 12 Nov and Sat, 12 Dec.",
    );
  });

  it("mentions the faculty's window, electives and solo work", () => {
    const withWindow = buildSchedule("2026-10-28", DEFAULT_DURATIONS, {
      finalDeadline: "2026-12-12",
      placingWindow: true,
    });
    expect(
      summaryText(
        planSummary({ batchYear: 2023, kind: "ELECTIVE", minTeamSize: 1, maxTeamSize: 3, schedule: withWindow }),
      ),
    ).toMatch(
      /^Students you enroll work alone or form teams of up to 3 until Wed, 4 Nov\. You then have until Fri, 6 Nov to place anyone without a team\./,
    );
  });
});
