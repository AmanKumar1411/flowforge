import {
  CycleActor,
  CycleAuthorizationPolicy,
} from "./cycle-authorization-policy";
import { Cycle, CycleStatus } from "./cycle.types";

const policy = new CycleAuthorizationPolicy();
const cycle = (status: CycleStatus, kind: Cycle["kind"] = "CORE") =>
  ({
    id: "c",
    status,
    kind,
    batchYear: 2026,
    createdByFacultyId: "owner",
  }) as Cycle;
const student: CycleActor = {
  id: "s",
  role: "STUDENT",
  batchYear: 2026,
  email: "s@x",
};
const admin: CycleActor = {
  id: "a",
  role: "ADMIN",
  batchYear: null,
  email: "a@x",
};

// S4 (Phase 9, ADR 022): closed projects for former team members only.
describe("CycleAuthorizationPolicy.canRead for students", () => {
  it.each([
    [
      "a published core cycle of their batch",
      cycle("PUBLISHED"),
      false,
      false,
      true,
    ],
    [
      "a published elective they are enrolled in",
      cycle("PUBLISHED", "ELECTIVE"),
      true,
      false,
      true,
    ],
    [
      "a published elective they are not enrolled in",
      cycle("PUBLISHED", "ELECTIVE"),
      false,
      false,
      false,
    ],
    ["a draft", cycle("DRAFT"), true, true, false],
    [
      "a closed cycle they were in a team of",
      cycle("CLOSED"),
      false,
      true,
      true,
    ],
    [
      "a closed cycle of their batch without a team",
      cycle("CLOSED"),
      false,
      false,
      false,
    ],
  ])("%s", (_, target, enrolled, formerMember, readable) => {
    expect(policy.canRead(student, target, enrolled, formerMember)).toBe(
      readable,
    );
  });

  it("leaves admins and faculty as they were", () => {
    expect(policy.canRead(admin, cycle("CLOSED"), false)).toBe(true);
    expect(
      policy.canRead(
        { ...admin, id: "owner", role: "FACULTY" },
        cycle("DRAFT"),
        false,
      ),
    ).toBe(true);
  });
});
