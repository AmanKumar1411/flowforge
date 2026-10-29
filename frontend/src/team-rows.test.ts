import { describe, expect, it } from "vitest";
import { filterTeams, teamRows } from "./team-rows";
import type { CycleIdea, CycleSubmission, Team } from "./types";

const team = (id: string, name: string, people: string[]): Team => ({
  id,
  cycleId: "c",
  name,
  leaderId: `${id}-0`,
  origin: "STUDENT",
  members: people.map((person, index) => ({
    userId: `${id}-${index}`,
    name: person,
    email: `${person.toLowerCase()}@nst.rishihood.edu.in`,
    isLeader: index === 0,
    addedAt: "2026-10-29T05:00:00.000Z",
  })),
  createdAt: "2026-10-29T05:00:00.000Z",
  updatedAt: "2026-10-29T05:00:00.000Z",
});

const teams = [
  team("a", "Byte Club", ["Aarav", "Bhavna", "Chirag"]),
  team("b", "Stack Smashers", ["Farhan", "Gauri"]),
  team("c", "Null Pointers", ["Divya"]),
];
const idea = (teamId: string, title: string, status: "SUBMITTED" | "APPROVED" | "REJECTED", source: "PROPOSAL" | "CATALOG" = "PROPOSAL") =>
  ({ team: { id: teamId }, idea: { title, status, source } }) as unknown as CycleIdea;
const ideas = [
  idea("a", "Campus lost-and-found board", "APPROVED", "CATALOG"),
  idea("b", "Hostel laundry queue", "SUBMITTED"),
  { team: { id: "c" }, idea: null } as unknown as CycleIdea,
];
const submissions = [{ team: { id: "a" }, versionCount: 2 }] as unknown as CycleSubmission[];

describe("teamRows", () => {
  it("joins each team with its leader, size, idea and submissions, waiting ideas first", () => {
    const rows = teamRows(teams, ideas, submissions);
    expect(rows.map((row) => row.name)).toEqual(["Stack Smashers", "Byte Club", "Null Pointers"]);
    expect(rows[1]).toEqual({
      id: "a",
      name: "Byte Club",
      leader: "Aarav",
      memberNames: ["Aarav", "Bhavna", "Chirag"],
      members: 3,
      idea: { title: "Campus lost-and-found board", status: "APPROVED", source: "CATALOG" },
      submissions: 2,
    });
    expect(rows[2]).toMatchObject({ idea: null, submissions: 0 });
  });
});

describe("filterTeams", () => {
  const rows = teamRows(teams, ideas, submissions);
  it("finds a team by its name, a member or its idea", () => {
    expect(filterTeams(rows, "gauri", "all").map((row) => row.name)).toEqual(["Stack Smashers"]);
    expect(filterTeams(rows, "lost found", "all").map((row) => row.name)).toEqual(["Byte Club"]);
    expect(filterTeams(rows, "nobody", "all")).toEqual([]);
  });

  it("keeps the teams with the chosen idea status", () => {
    expect(filterTeams(rows, "", "waiting").map((row) => row.name)).toEqual(["Stack Smashers"]);
    expect(filterTeams(rows, "", "approved").map((row) => row.name)).toEqual(["Byte Club"]);
    expect(filterTeams(rows, "", "none").map((row) => row.name)).toEqual(["Null Pointers"]);
    expect(filterTeams(rows, "", "all")).toHaveLength(3);
  });
});
