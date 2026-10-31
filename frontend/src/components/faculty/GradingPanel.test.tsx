import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as evaluations from "../../api/evaluations";
import type { Cycle, Grading, Milestone } from "../../types";
import { GradingPanel } from "./GradingPanel";

vi.mock("../../api/evaluations", () => ({
  getGrading: vi.fn(),
  saveEvaluation: vi.fn(() => Promise.resolve({})),
  setMaxMarks: vi.fn(),
  releaseGrading: vi.fn(),
}));

const cycle = { id: "c1", status: "PUBLISHED" } as Cycle;
const milestone = { id: "m1", position: 1, name: "Design review", submissionDueAt: "2026-11-15T18:29:00.000Z" } as Milestone;
const grading = (marksEnabled: boolean): Grading => ({
  milestone: { id: "m1", position: 1, name: "Design review", submissionDueAt: "2026-11-15T18:29:00.000Z" },
  marksEnabled,
  ...(marksEnabled ? { maxMarks: 20 } : {}),
  releasedAt: null,
  open: true,
  rows: [{ team: { id: "t1", name: "Falcon", memberCount: 2 }, evaluation: null, latestWork: { version: 1, submittedAt: "2026-11-14T10:00:00.000Z" } }],
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("GradingPanel", () => {
  it("is feedback only without marks: no scale, no marks field, feedback needed to save, no marks sent", async () => {
    vi.mocked(evaluations.getGrading).mockResolvedValue(grading(false));
    render(<GradingPanel cycle={cycle} milestone={milestone} />);
    const feedback = await screen.findByLabelText("Feedback for Falcon");
    expect(screen.queryByLabelText("Marked out of")).toBeNull();
    expect(screen.queryByLabelText("Marks for Falcon")).toBeNull();
    expect(screen.getByRole("button", { name: "Release feedback to all teams" })).toBeTruthy();

    const save = screen.getByRole("button", { name: "Save" });
    fireEvent.change(feedback, { target: { value: "   " } });
    expect((save as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(feedback, { target: { value: "Clear plan" } });
    fireEvent.click(save);
    await waitFor(() => expect(evaluations.saveEvaluation).toHaveBeenCalled());
    expect(vi.mocked(evaluations.saveEvaluation).mock.calls[0][3]).toEqual({ feedback: "Clear plan" });
  });

  it("keeps the scale and marks when marks are on", async () => {
    vi.mocked(evaluations.getGrading).mockResolvedValue(grading(true));
    render(<GradingPanel cycle={cycle} milestone={milestone} />);
    expect(await screen.findByLabelText("Marked out of")).toBeTruthy();
    expect(screen.getByLabelText("Marks for Falcon")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Release results to all teams" })).toBeTruthy();
  });
});
