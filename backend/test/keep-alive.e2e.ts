import { after, before, describe, it } from "node:test";
import { strict as assert } from "node:assert";
import { connect, Socket } from "node:net";
import { FRONTEND_ORIGIN, startTestApp, TestApp } from "./support/test-app";

/** Writes one HTTP/1.1 request on the socket and resolves with the status line of its answer. */
function exchange(socket: Socket, request: string): Promise<string> {
  return new Promise((resolve, reject) => {
    let answer = "";
    const onData = (chunk: Buffer) => {
      answer += chunk.toString();
      // Every answer here has a body sized by Content-Length; one chunk carries it all.
      if (answer.includes("\r\n\r\n")) {
        cleanup();
        resolve(answer.split("\r\n")[0]);
      }
    };
    const onEnd = () => {
      cleanup();
      reject(new Error("the API closed the connection"));
    };
    const cleanup = () => {
      socket.off("data", onData);
      socket.off("end", onEnd);
      socket.off("error", onEnd);
    };
    socket.on("data", onData);
    socket.on("end", onEnd);
    socket.on("error", onEnd);
    socket.write(request);
  });
}

// H5: Node's default 5 s keep-alive made the API close idle connections that a proxy or a browser
// was about to reuse, so a POST sent at that moment was lost (BUG-10).
describe("Idle keep-alive connections", () => {
  let app: TestApp;

  before(async () => {
    app = await startTestApp();
  });
  after(() => app.close());

  it("still serves a POST after the connection was idle for 10 seconds", async () => {
    const { hostname, port } = new URL(app.apiUrl);
    const socket = connect(Number(port), hostname);
    await new Promise((resolve) => socket.once("connect", resolve));
    const first = await exchange(
      socket,
      `GET /api/health HTTP/1.1\r\nHost: ${hostname}\r\nConnection: keep-alive\r\n\r\n`,
    );
    assert.match(first, /^HTTP\/1\.1 200/);

    await new Promise((resolve) => setTimeout(resolve, 10_000));
    const second = await exchange(
      socket,
      `POST /api/auth/refresh HTTP/1.1\r\nHost: ${hostname}\r\nOrigin: ${FRONTEND_ORIGIN}\r\nContent-Length: 0\r\nConnection: keep-alive\r\n\r\n`,
    );
    // No session cookie: the API answers 401, on the same connection.
    assert.match(second, /^HTTP\/1\.1 401/);
    socket.destroy();
  });
});
