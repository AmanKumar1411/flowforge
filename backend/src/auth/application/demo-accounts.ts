import type { Role } from "../domain/role";

export type DemoRole = Extract<Role, "ADMIN" | "FACULTY" | "STUDENT">;

export interface DemoAccount {
  email: string;
  name: string;
  role: DemoRole;
}

/**
 * Accounts for trying FlowForge locally through dev login. The local parts are
 * fixed; the domain is ALLOWED_HOSTED_DOMAIN. Coordinators are admins: the app
 * has no separate coordinator role. The students cover the four batches in
 * college in 2026-27, two each.
 */
const LOCAL_ACCOUNTS: readonly [string, string, DemoRole][] = [
  ["admin.demo", "Demo Admin", "ADMIN"],
  ["coordinator.x", "Coordinator X", "ADMIN"],
  ["coordinator.y", "Coordinator Y", "ADMIN"],
  ["anita.sharma", "Anita Sharma", "FACULTY"],
  ["rohit.verma", "Rohit Verma", "FACULTY"],
  ["aarav.s23csai", "Aarav Shah", "STUDENT"],
  ["diya.k23csai", "Diya Kapoor", "STUDENT"],
  ["ishaan.m24csai", "Ishaan Mehta", "STUDENT"],
  ["kavya.r24csai", "Kavya Reddy", "STUDENT"],
  ["arjun.p25csai", "Arjun Patel", "STUDENT"],
  ["sana.q25csai", "Sana Qureshi", "STUDENT"],
  ["vivaan.g26csai", "Vivaan Gupta", "STUDENT"],
  ["zoya.a26csai", "Zoya Ahmed", "STUDENT"],
];

export const demoAccounts = (domain: string): DemoAccount[] =>
  LOCAL_ACCOUNTS.map(([localPart, name, role]) => ({
    email: `${localPart}@${domain}`,
    name,
    role,
  }));
