// k6 load test for FlowForge (P1). Profiles: smoke, normal, peak, spike, soak (env PROFILE).
//   k6 run -e PROFILE=normal tests/load/flowforge.js
// Every virtual user is a seeded student (or, for 1 in 100, a faculty member who grades). It signs in
// once through the test-only dev login + refresh (like the web app), then browses with think time and,
// depending on the profile, submits milestone work. Run only against the isolated QA stack.
import http from "k6/http";
import { check, sleep } from "k6";
import { Counter, Rate } from "k6/metrics";
import exec from "k6/execution";
import { SharedArray } from "k6/data";

const API = __ENV.API || "http://localhost:3200/api";
const ORIGIN = __ENV.ORIGIN || "http://localhost:5300";
const PROFILE = __ENV.PROFILE || "smoke";
// Access tokens live 15 minutes; the web app refreshes before they expire. Lower it to test refresh.
const REFRESH_AFTER_MS = Number(__ENV.REFRESH_AFTER_S || 12 * 60) * 1000;
// One copy for all virtual users (a plain open() + JSON.parse would cost every VU its own copy).
const students = new SharedArray("students", () => JSON.parse(open("./.users.json")).students);
const faculty = new SharedArray("faculty", () => JSON.parse(open("./.users.json")).faculty);

const serverErrors = new Counter("server_errors");
const submissionsCreated = new Counter("submissions_created");
const submissionsRefused = new Counter("submissions_refused");
const evaluationConflicts = new Counter("evaluation_conflicts");
const loginFailures = new Rate("login_failures");
const refreshFailures = new Rate("refresh_failures");
const unexpectedResponses = new Counter("unexpected_responses");

const PROFILES = {
  smoke: { stages: [{ duration: "30s", target: 20 }, { duration: "1m", target: 20 }], submitShare: 0.2 },
  normal: { stages: [{ duration: "5m", target: 500 }, { duration: "15m", target: 500 }, { duration: "1m", target: 0 }], submitShare: 0.05 },
  // 3,000 users; in the last 15 minutes 40% of the users who can submit hand in work.
  peak: { stages: [{ duration: "10m", target: 3000 }, { duration: "20m", target: 3000 }, { duration: "1m", target: 0 }], submitShare: 0.02, rushFromSeconds: 15 * 60, rushShare: 0.4 },
  // Results released: 0 to 1,500 in a minute, everyone opens their marks.
  spike: { stages: [{ duration: "1m", target: 1500 }, { duration: "3m", target: 1500 }, { duration: "30s", target: 0 }], submitShare: 0.02, results: true },
  soak: { stages: [{ duration: "1m", target: 300 }, { duration: "60m", target: 300 }, { duration: "30s", target: 0 }], submitShare: 0.05 },
};
const profile = PROFILES[PROFILE];

const READS = ["GET /me/dashboard", "GET /course-cycles/:id", "GET /teams/mine", "GET /teams/:id/idea", "GET /teams/:id/milestones/:m/submissions", "GET evaluations", "GET /me/upcoming", "GET /auth/me", "GET grading", "GET /course-cycles/:id/milestones/:m/submissions", "GET /course-cycles/my"];
const thresholds = {
  "http_req_duration{kind:read}": ["p(95)<500"],
  "http_req_duration{kind:write}": ["p(95)<1000"],
  http_req_failed: ["rate<0.01"],
  server_errors: ["count<1"],
  refresh_failures: ["rate<0.01"],
};
for (const name of [...READS, "POST submission", "PUT evaluation", "POST /auth/dev-login", "POST /auth/refresh"]) {
  thresholds[`http_req_duration{name:${name}}`] = ["p(95)<1000"];
}

export const options = {
  scenarios: { users: { executor: "ramping-vus", startVUs: 0, stages: profile.stages, gracefulRampDown: "30s", gracefulStop: "30s" } },
  thresholds,
  discardResponseBodies: true,
  summaryTrendStats: ["avg", "min", "med", "p(90)", "p(95)", "p(99)", "max", "count"],
  setupTimeout: "2m",
  // k6 empties each VU's cookie jar between iterations by default, which loses the refresh cookie.
  noCookiesReset: true,
};

// 409 (a lost optimistic save) is an expected answer, not a failed request.
http.setResponseCallback(http.expectedStatuses({ min: 200, max: 399 }, 409));

let session = null;
let warned = 0;

function request(method, url, body, name, kind, parse = false) {
  const params = {
    headers: { "Content-Type": "application/json", ...(session ? { Authorization: `Bearer ${session.token}` } : {}), ...(kind === "auth" ? { Origin: ORIGIN } : {}) },
    tags: { name, kind },
    responseType: parse ? "text" : "none",
    timeout: "60s",
  };
  const response = http.request(method, `${API}${url}`, body ? JSON.stringify(body) : null, params);
  if (response.status >= 500 || response.status === 0) serverErrors.add(1, { name });
  if (response.status >= 400 && response.status !== 409) {
    unexpectedResponses.add(1, { name, status: String(response.status) });
    // The first two per VU, by endpoint and status only (never a token or a body).
    if (warned < 2) {
      warned += 1;
      console.warn(`unexpected ${name} ${response.status}`);
    }
  }
  return response;
}

function signIn(user) {
  const signedIn = request("POST", "/auth/dev-login", { email: user.e, name: user.n }, "POST /auth/dev-login", "auth");
  const refreshed = request("POST", "/auth/refresh", null, "POST /auth/refresh", "auth", true);
  const ok = signedIn.status === 204 && refreshed.status === 200;
  loginFailures.add(!ok);
  if (!ok) return null;
  return { token: refreshed.json("accessToken"), at: Date.now() };
}

function refreshIfNeeded(user) {
  if (Date.now() - session.at < REFRESH_AFTER_MS) return;
  const refreshed = request("POST", "/auth/refresh", null, "POST /auth/refresh", "auth", true);
  refreshFailures.add(refreshed.status !== 200);
  const submitted = session.submitted;
  // A failed refresh sends the web app back to the login page; the VU signs in again.
  session = refreshed.status === 200 ? { token: refreshed.json("accessToken"), at: Date.now() } : signIn(user) || session;
  session.submitted = submitted;
}

function think(min, max) {
  sleep(min + Math.random() * (max - min));
}

function studentVisit(user) {
  // Dashboard (what the app loads after sign-in).
  request("GET", "/me/dashboard", null, "GET /me/dashboard", "read");
  think(2, 6);
  if (!user.c) return;
  // The project page: the project, the team, the idea, the work and the marks.
  request("GET", `/course-cycles/${user.c}`, null, "GET /course-cycles/:id", "read");
  request("GET", "/teams/mine", null, "GET /teams/mine", "read");
  if (user.t) {
    request("GET", `/teams/${user.t}/idea`, null, "GET /teams/:id/idea", "read");
    if (user.m1) {
      request("GET", `/teams/${user.t}/milestones/${user.m1}/submissions`, null, "GET /teams/:id/milestones/:m/submissions", "read");
      request("GET", `/course-cycles/${user.c}/milestones/${user.m1}/teams/${user.t}/evaluations`, null, "GET evaluations", "read");
    }
    if (user.mo) request("GET", `/teams/${user.t}/milestones/${user.mo}/submissions`, null, "GET /teams/:id/milestones/:m/submissions", "read");
  }
  think(3, 10);
  if (Math.random() < 0.3) {
    request("GET", "/me/upcoming", null, "GET /me/upcoming", "read");
    think(2, 5);
  }
}

function submit(user) {
  if (!user.t || !user.mo) return;
  const response = request("POST", `/teams/${user.t}/milestones/${user.mo}/submissions`, { links: [{ type: "GITHUB", url: `https://github.com/load-${exec.vu.idInTest}/work` }], notes: "Load test" }, "POST submission", "write");
  if (response.status === 201) submissionsCreated.add(1);
  else submissionsRefused.add(1, { status: String(response.status) });
  check(response, { "submission saved": (r) => r.status === 201 });
}

function facultyVisit(user) {
  request("GET", "/course-cycles/my", null, "GET /course-cycles/my", "read");
  request("GET", `/course-cycles/${user.c}`, null, "GET /course-cycles/:id", "read");
  if (user.mo) request("GET", `/course-cycles/${user.c}/milestones/${user.mo}/submissions`, null, "GET /course-cycles/:id/milestones/:m/submissions", "read");
  think(3, 8);
  const grading = request("GET", `/course-cycles/${user.c}/milestones/${user.m1}/grading`, null, "GET grading", "read", true);
  if (grading.status !== 200 || !grading.body) return;
  const rows = grading.json("rows") || [];
  if (rows.length === 0 || !grading.json("open")) return;
  const row = rows[Math.floor(Math.random() * rows.length)];
  const body = { marks: 5 + Math.floor(Math.random() * 15), feedback: "Load test feedback" };
  if (row.evaluation) body.expectedVersion = row.evaluation.version;
  const saved = request("PUT", `/course-cycles/${user.c}/milestones/${user.m1}/teams/${row.team.id}/evaluation`, body, "PUT evaluation", "write");
  if (saved.status === 409) evaluationConflicts.add(1);
  think(5, 15);
}

export default function () {
  const vu = exec.vu.idInTest;
  const isFaculty = vu % 100 === 0;
  const user = isFaculty ? faculty[(vu / 100) % faculty.length] : students[(vu - 1) % students.length];
  if (!session) {
    session = signIn(user);
    if (!session) {
      sleep(5);
      return;
    }
  }
  refreshIfNeeded(user);
  if (isFaculty) return facultyVisit(user);

  if (profile.results) {
    // Results are out: straight to the marks.
    request("GET", "/me/dashboard", null, "GET /me/dashboard", "read");
    if (user.t && user.m1) request("GET", `/course-cycles/${user.c}/milestones/${user.m1}/teams/${user.t}/evaluations`, null, "GET evaluations", "read");
    think(5, 20);
    return;
  }
  studentVisit(user);
  const elapsed = (Date.now() - exec.scenario.startTime) / 1000;
  const total = profile.stages.reduce((sum, stage) => sum + parseInt(stage.duration, 10) * (stage.duration.endsWith("m") ? 60 : 1), 0);
  const inRush = profile.rushFromSeconds && elapsed > total - 60 - profile.rushFromSeconds;
  const rusher = (vu % 10) < profile.rushShare * 10;
  if (inRush && rusher && !session.submitted && Math.random() < 0.04) { // ~45 iterations in 15 min: spread over the window
    submit(user);
    session.submitted = true;
  } else if (Math.random() < profile.submitShare) {
    submit(user);
  }
}
