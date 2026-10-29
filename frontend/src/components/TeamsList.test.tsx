import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { TeamFilter, TeamRow } from "../team-rows";
import type { Cycle } from "../types";
import { TeamsList } from "./TeamsList";

const cycle = { id: "cycle", maxTeamSize: 4 } as Cycle;

const row = (index: number, overrides: Partial<TeamRow> = {}): TeamRow => ({
  id: `team-${index}`,
  name: `Team ${String(index).padStart(2, "0")}`,
  leader: `Leader ${index}`,
  memberNames: [`Leader ${index}`],
  members: 2,
  idea: null,
  submissions: 0,
  ...overrides,
});

function List({ rows }: { rows: TeamRow[] }) {
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<TeamFilter>("all");
  return (
    <MemoryRouter initialEntries={["/faculty/cycles/cycle"]}>
      <Routes>
        <Route
          path="/faculty/cycles/cycle"
          element={
            <TeamsList
              cycle={cycle}
              rows={rows}
              error=""
              query={query}
              filter={filter}
              onQuery={setQuery}
              onFilter={setFilter}
              empty={<p>No teams yet. Enroll students so they can form teams.</p>}
            />
          }
        />
        <Route path="/faculty/cycles/cycle/teams/:teamId" element={<p>Team page</p>} />
      </Routes>
    </MemoryRouter>
  );
}

describe("TeamsList", () => {
  afterEach(cleanup);

  it("shows one row per team with its leader, size, idea, status and submissions, and opens its page", async () => {
    const user = userEvent.setup();
    render(
      <List
        rows={[
          row(1, {
            name: "Byte Club",
            leader: "Aarav S",
            members: 3,
            idea: { title: "Campus lost-and-found board", status: "APPROVED", source: "CATALOG" },
            submissions: 2,
          }),
          row(2, { name: "Null Pointers", leader: "Divya R" }),
        ]}
      />,
    );
    expect(screen.getByRole("heading", { name: "Teams (2)" })).toBeVisible();
    const [byte, nulls] = screen.getAllByRole("listitem");
    expect(within(byte).getByText("Byte Club")).toBeVisible();
    expect(within(byte).getByText("Led by Aarav S")).toBeVisible();
    expect(within(byte).getByText("3/4 members")).toBeVisible();
    expect(within(byte).getByText("Campus lost-and-found board")).toBeVisible();
    expect(within(byte).getByText("Picked from the list")).toBeVisible();
    expect(within(byte).getByText("2 submissions")).toBeVisible();
    expect(within(nulls).getByText("No idea yet")).toBeVisible();
    expect(within(nulls).getByText("No submissions")).toBeVisible();
    // No search for a short list.
    expect(screen.queryByRole("search")).toBeNull();

    await user.click(screen.getByRole("link", { name: "View details of Byte Club" }));
    expect(screen.getByText("Team page")).toBeVisible();
  });

  it("says what comes next when there is no team", () => {
    render(<List rows={[]} />);
    expect(screen.getByRole("heading", { name: "Teams (0)" })).toBeVisible();
    expect(screen.getByText("No teams yet. Enroll students so they can form teams.")).toBeVisible();
  });

  it("adds a search and a status filter from 11 teams", async () => {
    const user = userEvent.setup();
    const rows = Array.from({ length: 12 }, (_, index) => row(index + 1));
    rows[4] = row(5, { idea: { title: "Hostel laundry queue", status: "SUBMITTED", source: "PROPOSAL" } });
    render(<List rows={rows} />);
    expect(screen.getAllByRole("listitem")).toHaveLength(12);

    await user.selectOptions(screen.getByLabelText("Idea status"), "waiting");
    expect(screen.getAllByRole("listitem")).toHaveLength(1);
    expect(screen.getByRole("status")).toHaveTextContent("Showing 1 of 12 teams.");

    await user.selectOptions(screen.getByLabelText("Idea status"), "all");
    await user.type(screen.getByLabelText("Search"), "Team 1");
    expect(screen.getAllByRole("listitem").map((item) => within(item).getByRole("strong").textContent)).toEqual([
      "Team 01",
      "Team 10",
      "Team 11",
      "Team 12",
    ]);

    await user.clear(screen.getByLabelText("Search"));
    await user.type(screen.getByLabelText("Search"), "nobody");
    await user.click(screen.getByRole("button", { name: "Show all teams" }));
    expect(screen.getAllByRole("listitem")).toHaveLength(12);
  });
});
