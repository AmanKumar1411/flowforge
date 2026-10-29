import { describe, expect, it } from "vitest";
import { currentSemester, semesterTerm } from "./semester";

describe("semesterTerm", () => {
  it.each([
    [1, "Aug–Dec 2023", "2023-24", "2023-08-01", "2023-12-31"],
    [2, "Jan–May 2024", "2023-24", "2024-01-01", "2024-05-31"],
    [3, "Aug–Dec 2024", "2024-25", "2024-08-01", "2024-12-31"],
    [4, "Jan–May 2025", "2024-25", "2025-01-01", "2025-05-31"],
    [5, "Aug–Dec 2025", "2025-26", "2025-08-01", "2025-12-31"],
    [6, "Jan–May 2026", "2025-26", "2026-01-01", "2026-05-31"],
    [7, "Aug–Dec 2026", "2026-27", "2026-08-01", "2026-12-31"],
    [8, "Jan–May 2027", "2026-27", "2027-01-01", "2027-05-31"],
  ])("puts semester %i of batch 2023 in %s, academic year %s", (semester, label, academicYear, firstDay, lastDay) => {
    expect(semesterTerm(2023, semester)).toMatchObject({ semester, label, academicYear, firstDay, lastDay });
  });

  it("puts an even semester in the next calendar year but the same academic year", () => {
    const odd = semesterTerm(2025, 1);
    const even = semesterTerm(2025, 2);
    expect([odd.year, even.year]).toEqual([2025, 2026]);
    expect(even.academicYear).toBe(odd.academicYear);
    // The academic year's short second half wraps at a century.
    expect(semesterTerm(2098, 4).academicYear).toBe("2099-00");
  });
});

describe("currentSemester", () => {
  it("follows the term a day falls in, across the new year", () => {
    expect(currentSemester(2023, new Date(2026, 9, 29))).toBe(7);
    expect(currentSemester(2023, new Date(2026, 11, 31))).toBe(7);
    expect(currentSemester(2023, new Date(2027, 0, 1))).toBe(8);
    expect(currentSemester(2023, new Date(2026, 4, 31))).toBe(6);
  });

  it("gives the next odd semester in June and July, and stays from 1 to 8", () => {
    expect(currentSemester(2023, new Date(2026, 5, 15))).toBe(7);
    expect(currentSemester(2026, new Date(2026, 6, 20))).toBe(1);
    expect(currentSemester(2027, new Date(2026, 9, 29))).toBe(1);
    expect(currentSemester(2019, new Date(2026, 9, 29))).toBe(8);
  });
});
