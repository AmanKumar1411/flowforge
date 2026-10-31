import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AuthProvider } from "./AuthProvider";
import { useAuth } from "./useAuth";

const json = (status: number, body: object) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }));

function Status() {
  const { state } = useAuth();
  return <p data-testid="status">{state.status}</p>;
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

describe("AuthProvider during an outage (H6)", () => {
  it("shows a retry banner instead of signing out, and signs in once FlowForge answers", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((url: string) => {
        if (url.endsWith("/auth/refresh")) {
          const calls = vi.mocked(fetch).mock.calls.filter(([u]) => String(u).endsWith("/auth/refresh")).length;
          return calls === 1 ? json(503, { code: "SERVICE_UNAVAILABLE" }) : json(200, { accessToken: "token" });
        }
        return json(200, { id: "u1", email: "aman.k23csai@nst.rishihood.edu.in", name: "Aman", role: "STUDENT" });
      }),
    );
    render(
      <AuthProvider>
        <Status />
      </AuthProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(10);
    });
    expect(screen.getByRole("status").textContent).toBe("Can't reach FlowForge. Retrying…");
    expect(screen.getByTestId("status").textContent).toBe("loading");

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1_500);
    });
    expect(screen.getByTestId("status").textContent).toBe("signed-in");
    expect(screen.queryByText("Can't reach FlowForge. Retrying…")).toBeNull();
  });
});
