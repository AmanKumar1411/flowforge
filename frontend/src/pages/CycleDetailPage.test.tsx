import { cleanup, render, screen, within } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as cycles from "../api/cycles";
import * as ideas from "../api/ideas";
import * as submissions from "../api/submissions";
import * as teams from "../api/teams";
import type { Cycle, CycleIdea, CycleSubmission, Team } from "../types";
import { CycleDetailPage } from "./CycleDetailPage";

vi.mock("../api/cycles", () => ({
  getCycle: vi.fn(),
  listEnrollments: vi.fn(),
  listBatchStudents: vi.fn(),
  publishCycle: vi.fn(),
  closeCycle: vi.fn(),
}));
vi.mock("../api/ideas", () => ({ listCatalog: vi.fn(), listCycleIdeas: vi.fn() }));
vi.mock("../api/submissions", () => ({ listCycleSubmissions: vi.fn() }));
// Phase 9: the Milestones tab shows each milestone's grading; it stays loading here.
vi.mock("../api/evaluations", () => ({ getGrading: vi.fn(() => new Promise(() => undefined)) }));
vi.mock("../api/teams", () => ({ listCycleTeams: vi.fn(), getCompletionOverview: vi.fn() }));

// Today is Thu, 29 Oct 2026: the cycle is in its teams phase. Phase 8: milestones and a computed stage.
const cycle: Cycle = {
  id: "cycle",
  courseName: "Software Design",
  title: "Mid-semester project",
  description: null,
  batchYear: 2023,
  semester: 7,
  academicYear: "2026-27",
  minTeamSize: 2,
  maxTeamSize: 4,
  kind: "CORE",
  status: "PUBLISHED",
  createdAt: "2026-10-28T05:00:00.000Z",
  publishedAt: "2026-10-28T05:00:00.000Z",
  closedAt: null,
  updatedAt: "2026-10-28T05:00:00.000Z",
  teamDeadline: "2026-11-04T18:29:00.000Z",
  ideaDeadline: "2026-11-11T18:29:00.000Z",
  ideaSource: "BOTH",
  ideaLinkRequirement: { required: [], optional: ["GITHUB", "DRIVE"] },
  milestones: [
    {
      id: "m1",
      position: 1,
      name: "Design review",
      description: null,
      submissionOpensAt: "2026-11-11T18:30:00.000Z",
      submissionDueAt: "2026-11-25T18:29:00.000Z",
      evaluationAt: "2026-11-26T18:29:00.000Z",
      linkRequirement: { required: ["GITHUB"], optional: [] },
    },
    {
      id: "m2",
      position: 2,
      name: "Final",
      description: null,
      submissionOpensAt: "2026-11-25T18:29:00.000Z",
      submissionDueAt: "2026-12-12T18:29:00.000Z",
      evaluationAt: "2026-12-12T18:29:00.000Z",
      linkRequirement: { required: ["DRIVE"], optional: [] },
    },
  ],
  currentStage: { kind: "TEAMS" },
  nextEvents: [{ kind: "TEAM_DEADLINE", at: "2026-11-04T18:29:00.000Z" }],
};

const team = (id: string, name: string, leader: string): Team => ({
  id,
  cycleId: "cycle",
  name,
  leaderId: `${id}-leader`,
  origin: "STUDENT",
  members: [
    { userId: `${id}-leader`, name: leader, email: "l@nst.rishihood.edu.in", isLeader: true, addedAt: "" },
    { userId: `${id}-member`, name: "Member", email: "m@nst.rishihood.edu.in", isLeader: false, addedAt: "" },
  ],
  createdAt: "",
  updatedAt: "",
});

function renderPage(kind: Cycle["kind"], tab = "") {
  vi.mocked(cycles.getCycle).mockResolvedValue({ ...cycle, kind });
  render(
    <MemoryRouter initialEntries={[`/faculty/cycles/cycle${tab ? `?tab=${tab}` : ""}`]}>
      <Routes>
        <Route path="/faculty/cycles/:cycleId" element={<CycleDetailPage faculty />} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CycleDetailPage by course type", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 29, 10, 0), toFake: ["Date"] });
    vi.clearAllMocks();
    const roster = [
      { userId: "a", email: "a@x", name: "A", signedIn: true, enrolledAt: "" },
      { userId: "b", email: "b@x", name: "B", signedIn: true, enrolledAt: "" },
      { userId: "c", email: "c@x", name: "C", signedIn: false, enrolledAt: "" },
      { userId: "d", email: "d@x", name: "D", signedIn: true, enrolledAt: "" },
      { userId: "e", email: "e@x", name: "E", signedIn: true, enrolledAt: "" },
    ];
    vi.mocked(cycles.listEnrollments).mockResolvedValue(roster);
    vi.mocked(cycles.listBatchStudents).mockResolvedValue(roster);
    vi.mocked(ideas.listCatalog).mockResolvedValue([]);
    vi.mocked(teams.listCycleTeams).mockResolvedValue([team("t1", "Byte Club", "Aarav S"), team("t2", "Null Pointers", "Divya R")]);
    vi.mocked(ideas.listCycleIdeas).mockResolvedValue([
      { team: { id: "t1" }, idea: { title: "Lost and found", status: "SUBMITTED", source: "PROPOSAL" } },
      { team: { id: "t2" }, idea: null },
    ] as unknown as CycleIdea[]);
    vi.mocked(submissions.listCycleSubmissions).mockResolvedValue([
      { team: { id: "t1", name: "Byte Club" }, latest: null, versionCount: 0 },
      { team: { id: "t2", name: "Null Pointers" }, latest: null, versionCount: 0 },
    ] as unknown as CycleSubmission[]);
    vi.mocked(teams.getCompletionOverview).mockResolvedValue({
      open: false,
      unassigned: [{ id: "e", name: "E", email: "e@x", lookingForTeam: false, note: null, signedIn: true }],
      notSignedIn: [],
    });
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("opens on an overview: the stage, what comes next, what needs the faculty, at a glance", async () => {
    renderPage("ELECTIVE");
    const glance = await screen.findByRole("complementary", { name: "The project at a glance" });
    expect(await within(glance).findByText(/Enrolled students \(5\)/)).toBeVisible();
    expect(screen.getByText("Teams forming")).toBeVisible();
    expect(screen.getByRole("heading", { name: "Coming up" })).toBeVisible();
    expect(screen.getByText("Team deadline")).toBeVisible();
    expect(
      screen.getByText("Elective · open to enrolled students · Teams of 2–4 · Semester 7 (Aug–Dec 2026)"),
    ).toBeVisible();
    // One proposal waits: the header's one primary action, and the attention card, say so.
    expect(await screen.findByRole("button", { name: "Review 1 proposal" })).toBeVisible();
    expect(screen.getByText("1 proposal is waiting for your review")).toBeVisible();
    expect(screen.getByRole("button", { name: "Edit project" })).toBeVisible();
    for (const name of ["Overview", "Students", "Teams", "Ideas", "Milestones"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
  });

  it("lists an elective's teams on the Teams tab, without the faculty's placement panel", async () => {
    renderPage("ELECTIVE", "teams");
    expect(await screen.findByRole("heading", { name: "Teams (2)" })).toBeVisible();
    expect(screen.getByRole("link", { name: "View details of Byte Club" })).toHaveAttribute(
      "href",
      "/faculty/cycles/cycle/teams/t1",
    );
    expect(screen.queryByRole("heading", { name: /Students without a team/ })).toBeNull();
  });

  it("shows a core course the students without a team, and every milestone's work on its own tab", async () => {
    renderPage("CORE", "teams");
    expect(await screen.findByRole("heading", { name: "Teams (2)" })).toBeVisible();
    expect(await screen.findByRole("heading", { name: "Students without a team (1)" })).toBeVisible();
    cleanup();

    renderPage("CORE", "milestones");
    expect(await screen.findByRole("heading", { name: "Design review" })).toBeVisible();
    expect(screen.getByRole("heading", { name: "Final" })).toBeVisible();
    expect(await screen.findAllByRole("link", { name: "Byte Club" })).toHaveLength(2);
    expect(screen.getByText(/Links: Google Drive or Docs required/)).toBeVisible();
    expect(submissions.listCycleSubmissions).toHaveBeenCalledWith("cycle", "m2");
  });

  it("says nothing about team completion while no student takes part, and offers to add them", async () => {
    vi.mocked(cycles.listBatchStudents).mockResolvedValue([]);
    vi.mocked(cycles.listEnrollments).mockResolvedValue([]);
    vi.mocked(teams.listCycleTeams).mockResolvedValue([]);
    vi.mocked(ideas.listCycleIdeas).mockResolvedValue([]);
    vi.mocked(submissions.listCycleSubmissions).mockResolvedValue([]);
    vi.mocked(teams.getCompletionOverview).mockResolvedValue({ open: false, unassigned: [], notSignedIn: [] });
    renderPage("ELECTIVE");
    // The header's primary action and the attention card.
    expect(await screen.findAllByRole("button", { name: "Enroll students" })).toHaveLength(2);
    expect(screen.getByText("No students are enrolled yet")).toBeVisible();
    cleanup();

    renderPage("CORE", "teams");
    expect(await screen.findByText(/No teams yet\. Add the students of batch 2023/)).toBeVisible();
    expect(screen.queryByRole("heading", { name: /Students without a team/ })).toBeNull();
    expect(screen.queryByText("Every student is in a team.")).toBeNull();
  });
});
