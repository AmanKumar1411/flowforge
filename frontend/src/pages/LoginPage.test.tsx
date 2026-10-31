import { cleanup, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthContext, type AuthContextValue } from "../auth/auth-context";
import { LoginPage } from "./LoginPage";

vi.mock("../api/auth", () => ({ googleSignInUrl: "/api/auth/google", devLogin: vi.fn(), listDemoAccounts: vi.fn(() => Promise.resolve([])) }));

const signedOut = { state: { status: "signed-out" } } as AuthContextValue;
const renderAt = (path: string) =>
  render(
    <AuthContext.Provider value={signedOut}>
      <MemoryRouter initialEntries={[path]}>
        <LoginPage />
      </MemoryRouter>
    </AuthContext.Provider>,
  );

afterEach(cleanup);

describe("LoginPage after signing out (H15)", () => {
  it("tells people on a shared computer to use Sign out everywhere", () => {
    renderAt("/login?signedOut=1");
    expect(screen.getByRole("status").textContent).toMatch(/Sign out everywhere on shared computers/);
    expect(screen.getByRole("status").textContent).toMatch(/up to 15 minutes/);
  });

  it("says nothing of it on a first visit", () => {
    renderAt("/login");
    expect(screen.queryByText(/shared computers/)).toBeNull();
  });
});
