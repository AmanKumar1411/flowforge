import { Injectable } from "@nestjs/common";

/** The ids of the cycles in which the user is (or was) in a team. */
export type MembershipLookup = (userId: string) => Promise<string[]>;

/**
 * Extension point (like EnrollmentRemovalChecks): teams provide who was in a
 * team of which cycle, so a closed cycle stays readable to its former members
 * (S4, ADR 022) without this module importing teams. Until teams provide it,
 * nobody counts as a former member.
 */
@Injectable()
export class CycleMembership {
  private lookup: MembershipLookup = () => Promise.resolve([]);

  provide(lookup: MembershipLookup): void {
    this.lookup = lookup;
  }

  cyclesOf(userId: string): Promise<string[]> {
    return this.lookup(userId);
  }
}
