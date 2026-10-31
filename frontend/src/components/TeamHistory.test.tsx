import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import * as submissions from "../api/submissions";
import type { Submission } from "../types";
import { TeamHistory } from "./MilestonePanels";

vi.mock("../api/submissions", () => ({ listTeamSubmissions: vi.fn() }));

const version = (n: number): Submission => ({
  id: `s${n}`,
  teamId: "t1",
  cycleId: "c1",
  milestoneId: "m1",
  version: n,
  links: [],
  notes: null,
  submittedBy: { id: "u1", name: "Aman" },
  submittedAt: "2026-11-10T10:00:00.000Z",
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("TeamHistory (H4)", () => {
  it("reads nothing until opened, then ten versions at a time", async () => {
    const list = vi.mocked(submissions.listTeamSubmissions);
    list
      .mockResolvedValueOnce([12, 11, 10, 9, 8, 7, 6, 5, 4, 3].map(version))
      .mockResolvedValueOnce([2, 1].map(version));
    const { container } = render(<TeamHistory teamId="t1" milestoneId="m1" versionCount={12} latestLabel="Latest" />);
    expect(list).not.toHaveBeenCalled();

    const details = container.querySelector("details")!;
    details.open = true;
    fireEvent(details, new Event("toggle"));
    await screen.findByText("Version 12");
    expect(list).toHaveBeenCalledWith("t1", "m1", { limit: 10, before: undefined });

    fireEvent.click(screen.getByRole("button", { name: "Show older versions" }));
    await screen.findByText("Version 1");
    expect(list).toHaveBeenLastCalledWith("t1", "m1", { limit: 10, before: 3 });
    await waitFor(() => expect(screen.queryByRole("button", { name: "Show older versions" })).toBeNull());
  });
});
