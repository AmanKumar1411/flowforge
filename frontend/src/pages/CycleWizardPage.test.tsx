import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/cycles";
import { ApiError } from "../api/client";
import type { Cycle } from "../types";
import { CycleWizardPage } from "./CycleWizardPage";

vi.mock("../api/cycles", () => ({
  createCycle: vi.fn(),
  getCycle: vi.fn(),
  getPublishChecks: vi.fn(),
  listMyCycles: vi.fn(),
  publishCycle: vi.fn(),
  updateCycle: vi.fn(),
}));
// The idea list and the student lists have their own tests and API calls.
vi.mock("../components/CatalogPanel", () => ({ FacultyCatalogSection: () => <p>The idea list</p> }));
vi.mock("../components/BatchPanel", () => ({ BatchPanel: () => <p>The batch list</p> }));
vi.mock("../components/EnrollmentPanel", () => ({ EnrollmentPanel: () => <p>The enrollment list</p> }));

// Phase 8: the draft is saved after step 1 and updated on every step after it.
const draft: Cycle = {
  id: "c1",
  courseName: "Software Design",
  title: "Mid-semester project",
  description: null,
  batchYear: 2023,
  semester: 7,
  academicYear: "2026-27",
  minTeamSize: 2,
  maxTeamSize: 4,
  kind: "ELECTIVE",
  status: "DRAFT",
  teamDeadline: "2026-11-05T18:29:00.000Z",
  ideaDeadline: "2026-11-12T18:29:00.000Z",
  ideaSource: "BOTH",
  ideaLinkRequirement: { required: [], optional: ["GITHUB", "DRIVE"] },
  milestones: [
    {
      id: "m1",
      position: 1,
      name: "Final submission",
      description: null,
      submissionOpensAt: "2026-11-12T18:30:00.000Z",
      submissionDueAt: "2026-11-26T18:29:00.000Z",
      evaluationAt: "2026-11-28T18:29:00.000Z",
      linkRequirement: { required: ["GITHUB"], optional: ["DEMO", "REPORT"] },
    },
  ],
  currentStage: { kind: "DRAFT" },
  nextEvents: [],
  createdAt: "2026-10-29T05:00:00.000Z",
  publishedAt: null,
  closedAt: null,
  updatedAt: "2026-10-29T05:00:00.000Z",
};

function renderAt(path: string) {
  render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/faculty/cycles/new" element={<CycleWizardPage />} />
        <Route path="/faculty/cycles/:cycleId/edit" element={<CycleWizardPage />} />
        <Route path="/faculty/cycles/:cycleId" element={<p>The project page</p>} />
      </Routes>
    </MemoryRouter>,
  );
}

describe("CycleWizardPage", () => {
  beforeEach(() => {
    vi.useFakeTimers({ now: new Date(2026, 9, 29, 10, 0), toFake: ["Date"] });
    vi.clearAllMocks();
    vi.mocked(api.listMyCycles).mockResolvedValue([]);
    vi.mocked(api.getCycle).mockResolvedValue(draft);
    vi.mocked(api.createCycle).mockResolvedValue(draft);
    vi.mocked(api.updateCycle).mockImplementation(async () => draft);
  });
  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("checks the details, then saves the draft with a default plan and moves on to teams and ideas", async () => {
    const user = userEvent.setup();
    renderAt("/faculty/cycles/new");
    await user.click(await screen.findByRole("button", { name: "Save draft and continue" }));
    expect(screen.getByText("Fix the highlighted fields first.")).toBeVisible();
    expect(screen.getByLabelText("Course name")).toHaveAccessibleDescription(/Enter the course name/);
    expect(api.createCycle).not.toHaveBeenCalled();

    await user.type(screen.getByLabelText("Course name"), "Software Design");
    await user.type(screen.getByLabelText("Project title"), "Mid-semester project");
    await user.click(screen.getByRole("radio", { name: /Elective/ }));
    await user.click(screen.getByRole("button", { name: "Save draft and continue" }));
    expect(api.createCycle).toHaveBeenCalledTimes(1);
    const payload = vi.mocked(api.createCycle).mock.calls[0][0];
    expect(payload).toMatchObject({ courseName: "Software Design", kind: "ELECTIVE", ideaSource: "BOTH" });
    expect(Date.parse(payload.ideaDeadline)).toBeGreaterThan(Date.parse(payload.teamDeadline));
    expect(payload.milestones).toHaveLength(1);
    expect(await screen.findByRole("heading", { name: /When do teams and ideas settle\?/ })).toBeVisible();
    expect(screen.getByText("Draft · saved as you go")).toBeVisible();
  });

  it("flags overlapping milestones as they are typed, and saves the list with the draft", async () => {
    const user = userEvent.setup();
    renderAt("/faculty/cycles/c1/edit?step=milestones");
    expect(await screen.findByText("The milestones follow each other without overlapping.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "+ Add milestone M2" }));
    const opens = screen.getAllByLabelText("Submissions open");
    // jsdom types into datetime-local fields poorly; set the value as the picker would.
    fireEvent.change(opens[1], { target: { value: "2026-11-20T10:00" } });
    expect(screen.getByText(/M2: Overlaps M1/)).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(api.updateCycle).not.toHaveBeenCalled();

    fireEvent.change(opens[1], { target: { value: "2026-11-27T10:00" } });
    expect(screen.queryByText(/Overlaps M1/)).toBeNull();
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    const [, changes] = vi.mocked(api.updateCycle).mock.calls[0];
    expect(changes.milestones?.map((m) => m.id ?? "new")).toEqual(["m1", "new"]);
    // The next step for a project with an idea list is the list itself.
    expect(await screen.findByText("The idea list")).toBeVisible();
  });

  it("shows what blocks publishing, links each problem to its step, then publishes once nothing does", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPublishChecks).mockResolvedValueOnce({
      blocking: [{ code: "ROSTER_EMPTY", message: "Enroll the elective's students first: only they can see it" }],
      warnings: [],
    });
    renderAt("/faculty/cycles/c1/edit?step=review");
    const blocked = await screen.findByRole("heading", { name: "Before you can publish" });
    const list = blocked.parentElement!;
    expect(within(list).getByText(/Enroll the elective's students first/)).toBeVisible();
    expect(screen.getByRole("button", { name: "Publish to students" })).toBeDisabled();
    await user.click(within(list).getByRole("button", { name: "Go to Students" }));
    expect(await screen.findByText("The enrollment list")).toBeVisible();

    vi.mocked(api.getPublishChecks).mockResolvedValue({ blocking: [], warnings: [] });
    vi.mocked(api.publishCycle).mockResolvedValue({ ...draft, status: "PUBLISHED", warnings: [] });
    await user.click(screen.getByRole("button", { name: "Save and continue" }));
    expect(await screen.findByText("Everything students need is in place.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Publish to students" }));
    const dialog = screen.getByRole("dialog", { name: "Publish to students?" });
    await user.click(within(dialog).getByRole("button", { name: "Publish to students" }));
    expect(api.publishCycle).toHaveBeenCalledTimes(1);
    expect(await screen.findByText("The project page")).toBeVisible();
  });

  it("lists every problem when publishing is refused anyway", async () => {
    const user = userEvent.setup();
    vi.mocked(api.getPublishChecks).mockResolvedValue({ blocking: [], warnings: [] });
    vi.mocked(api.publishCycle).mockRejectedValue(
      new ApiError("The project cannot be published yet: 2 things need fixing", "PUBLISH_BLOCKED", 409, [
        { code: "NO_MILESTONES", message: "Add at least one milestone before publishing" },
        { code: "IDEA_LIST_EMPTY", message: "Your idea list is empty" },
      ]),
    );
    renderAt("/faculty/cycles/c1/edit?step=review");
    await user.click(await screen.findByRole("button", { name: "Publish to students" }));
    await user.click(within(screen.getByRole("dialog")).getByRole("button", { name: "Publish to students" }));
    expect(await screen.findByText("Add at least one milestone before publishing")).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to Milestones" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Go to Idea list" })).toBeVisible();
  });
});
