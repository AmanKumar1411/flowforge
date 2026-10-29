import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as api from "../api/cycles";
import { addDays, buildSchedule, DEFAULT_DURATIONS, localDay } from "../cycle-plan";
import type { Cycle } from "../types";
import { CycleWizardPage } from "./CycleWizardPage";

vi.mock("../api/cycles", () => ({
  listMyCycles: vi.fn(),
  getCycle: vi.fn(),
  createCycle: vi.fn(),
  updateCycle: vi.fn(),
  publishCycle: vi.fn(),
}));

const previous: Cycle = {
  id: "previous",
  courseName: "Software Design",
  title: "Spring project",
  description: "Build something useful.",
  batchYear: 2023,
  semester: 6,
  academicYear: "2025-26",
  minTeamSize: 3,
  maxTeamSize: 5,
  kind: "CORE",
  status: "CLOSED",
  createdAt: "2026-01-04T05:00:00.000Z",
  publishedAt: "2026-01-05T05:00:00.000Z",
  closedAt: "2026-03-01T05:00:00.000Z",
  updatedAt: "2026-03-01T05:00:00.000Z",
  teamFormationDeadline: "2026-01-15T18:29:00.000Z",
  teamCompletionDeadline: "2026-01-15T18:29:00.000Z",
  ideaDeadline: "2026-01-20T18:29:00.000Z",
  submissionStartAt: "2026-01-20T18:30:00.000Z",
  submissionDeadline: "2026-02-19T18:29:00.000Z",
};

function renderWizard() {
  const user = userEvent.setup();
  render(
    <MemoryRouter initialEntries={["/faculty/cycles/new"]}>
      <Routes>
        <Route path="/faculty/cycles/new" element={<CycleWizardPage />} />
        <Route path="/faculty/cycles/:cycleId" element={<p>Cycle page</p>} />
      </Routes>
    </MemoryRouter>,
  );
  return user;
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(await screen.findByLabelText("Course name"), "Software Design");
  await user.type(screen.getByLabelText("Cycle title"), "Mid-semester project");
}

describe("CycleWizardPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.listMyCycles).mockResolvedValue([]);
    vi.mocked(api.createCycle).mockImplementation(async (input) => ({
      ...previous,
      ...input,
      id: "new-cycle",
      status: "DRAFT",
      description: input.description ?? null,
      teamCompletionDeadline: input.teamCompletionDeadline ?? input.teamFormationDeadline,
    }));
    vi.mocked(api.publishCycle).mockResolvedValue({ ...previous, status: "PUBLISHED" });
  });
  afterEach(cleanup);

  it("checks a step before moving on, explains what to fix, and moves focus to the next step", async () => {
    const user = renderWizard();
    await screen.findByRole("heading", { name: /What is this cycle\?/ });
    await user.click(screen.getByRole("button", { name: "Next: Teams" }));
    expect(screen.getByRole("status")).toHaveTextContent("2 things need fixing on this step.");
    expect(screen.getByText(/Enter the course name/)).toBeVisible();
    expect(screen.getByLabelText("Course name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByRole("heading", { name: /What is this cycle\?/ })).toBeVisible();

    await fillBasics(user);
    await user.click(screen.getByRole("button", { name: "Next: Teams" }));
    const heading = screen.getByRole("heading", { name: /How do students team up\?/ });
    expect(heading).toHaveFocus();
  });

  it("keeps the draft when going back, and checks team sizes in words", async () => {
    const user = renderWizard();
    await fillBasics(user);
    await user.click(screen.getByRole("button", { name: "Next: Teams" }));
    const largest = screen.getByLabelText("Maximum team size");
    await user.clear(largest);
    await user.type(largest, "1");
    await user.click(screen.getByRole("button", { name: "Next: Timeline" }));
    expect(screen.getByText("The smallest team can't be bigger than the largest.")).toBeVisible();

    await user.click(screen.getByRole("button", { name: "← Back" }));
    expect(screen.getByLabelText("Course name")).toHaveValue("Software Design");
    expect(screen.getByLabelText("Cycle title")).toHaveValue("Mid-semester project");
  });

  it("starts from a previous cycle: its settings, with its phases moved to start today", async () => {
    vi.mocked(api.listMyCycles).mockResolvedValue([previous]);
    const user = renderWizard();
    await user.selectOptions(await screen.findByLabelText("Start from"), "previous");
    expect(screen.getByLabelText("Course name")).toHaveValue("Software Design");
    expect(screen.getByLabelText("Batch year")).toHaveValue(2023);
    await user.click(screen.getByRole("button", { name: "Next: Teams" }));
    expect(screen.getByLabelText("Minimum team size")).toHaveValue(3);
    await user.click(screen.getByRole("button", { name: "Next: Timeline" }));
    // The previous cycle gave 10 days to form teams (5 → 15 Jan, local) and 5 for ideas.
    expect(screen.getByLabelText("Start date")).toHaveValue(localDay());
    expect(screen.getByLabelText("Days to form teams")).toHaveValue(10);
    expect(screen.getByLabelText("Days for ideas")).toHaveValue(5);
  });

  it("asks before publishing, lists what will be locked, then creates and publishes once", async () => {
    const user = renderWizard();
    await fillBasics(user);
    for (const next of ["Next: Teams", "Next: Timeline", "Next: Review"]) {
      await user.click(screen.getByRole("button", { name: next }));
    }
    await user.click(screen.getByRole("button", { name: "Publish to students" }));
    const dialog = screen.getByRole("dialog", { name: "Publish to students?" });
    expect(within(dialog).getByText(/can no longer change/)).toBeVisible();
    expect(within(dialog).getByText(/the team sizes/)).toBeVisible();
    expect(within(dialog).getByText(/the date submissions open/)).toBeVisible();

    await user.click(within(dialog).getByRole("button", { name: "Keep editing" }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(api.createCycle).not.toHaveBeenCalled();

    await user.click(screen.getByRole("button", { name: "Publish to students" }));
    await user.click(
      within(screen.getByRole("dialog")).getByRole("button", { name: "Publish to students" }),
    );
    expect(await screen.findByText("Cycle page")).toBeVisible();
    const today = localDay();
    expect(api.createCycle).toHaveBeenCalledTimes(1);
    expect(api.createCycle).toHaveBeenCalledWith({
      courseName: "Software Design",
      title: "Mid-semester project",
      description: "",
      kind: "CORE",
      batchYear: new Date().getFullYear(),
      semester: expect.any(Number),
      academicYear: expect.stringMatching(/^\d{4}-\d{2}$/),
      minTeamSize: 2,
      maxTeamSize: 4,
      ...buildSchedule(today, DEFAULT_DURATIONS, {
        finalDeadline: addDays(today, 45),
        placingWindow: false,
      }),
    });
    expect(api.publishCycle).toHaveBeenCalledWith("new-cycle");
  });

  it("saves a draft without publishing it", async () => {
    const user = renderWizard();
    await fillBasics(user);
    for (const next of ["Next: Teams", "Next: Timeline", "Next: Review"]) {
      await user.click(screen.getByRole("button", { name: next }));
    }
    expect(screen.getByText("Students can't see it yet.")).toBeVisible();
    await user.click(screen.getByRole("button", { name: "Save as draft" }));
    expect(await screen.findByText("Cycle page")).toBeVisible();
    expect(api.createCycle).toHaveBeenCalledTimes(1);
    expect(api.publishCycle).not.toHaveBeenCalled();
  });
});
