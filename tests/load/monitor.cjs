// Samples the QA stack every 5 s during a load run: API CPU and memory, k6 CPU, database container
// CPU and memory, database connections by state, and the latency of one extra dashboard request.
// Usage: node load/monitor.cjs <out.csv>   (stop it with Ctrl-C or kill)
const { execSync } = require("node:child_process");
const fs = require("node:fs");
const { API, WEB, manifest } = require("../support/qa-config.cjs");

const out = process.argv[2];
fs.writeFileSync(out, "t,api_cpu,api_rss_mb,k6_cpu,k6_rss_mb,db_cpu,db_mem_mb,db_active,db_idle,db_total,probe_ms,probe_status\n");
const sh = (cmd) => { try { return execSync(cmd, { stdio: ["ignore", "pipe", "ignore"] }).toString().trim(); } catch { return ""; } };
const proc = (pid) => { const [cpu, rss] = sh(`ps -o %cpu=,rss= -p ${pid}`).split(/\s+/).filter(Boolean); return [Number(cpu || 0), Math.round(Number(rss || 0) / 1024)]; };
const probeUser = manifest().students["2023"][998];
let token = "";
let tokenAt = 0;

async function signIn() {
  const login = await fetch(`${API}/auth/dev-login`, { method: "POST", headers: { Origin: WEB, "Content-Type": "application/json" }, body: JSON.stringify({ email: probeUser, name: "Load Probe" }) });
  const cookie = (login.headers.get("set-cookie") || "").split(";")[0];
  const refreshed = await fetch(`${API}/auth/refresh`, { method: "POST", headers: { Origin: WEB, Cookie: cookie } });
  token = (await refreshed.json()).accessToken;
  tokenAt = Date.now();
}

async function sample() {
  const apiPid = sh("lsof -ti tcp:3200 -sTCP:LISTEN").split("\n")[0];
  const k6Pid = sh("pgrep -x k6").split("\n")[0];
  const [apiCpu, apiRss] = apiPid ? proc(apiPid) : [0, 0];
  const [k6Cpu, k6Rss] = k6Pid ? proc(k6Pid) : [0, 0];
  const [dbCpu, dbMem] = sh("docker stats --no-stream --format '{{.CPUPerc}},{{.MemUsage}}' flowforge-qa-db").split(",");
  const conns = sh(`docker exec flowforge-qa-db psql -U qa -d flowforge_qa -tA -F, -c "select count(*) filter (where state='active'), count(*) filter (where state='idle'), count(*) from pg_stat_activity where datname='flowforge_qa'"`);
  let probeMs = "";
  let probeStatus = "";
  try {
    if (!token || Date.now() - tokenAt > 10 * 60 * 1000) await signIn();
    const started = performance.now();
    const reply = await fetch(`${API}/me/dashboard`, { headers: { Authorization: `Bearer ${token}` }, signal: AbortSignal.timeout(30_000) });
    await reply.arrayBuffer();
    probeMs = Math.round(performance.now() - started);
    probeStatus = reply.status;
  } catch (error) {
    probeStatus = "error";
  }
  const memMb = (dbMem || "").split("/")[0].trim();
  const mb = memMb.endsWith("GiB") ? parseFloat(memMb) * 1024 : parseFloat(memMb);
  fs.appendFileSync(out, [new Date().toISOString(), apiCpu, apiRss, k6Cpu, k6Rss, parseFloat(dbCpu || "0"), Math.round(mb || 0), conns || ",,", probeMs, probeStatus].join(",") + "\n");
}

(async () => {
  for (;;) {
    const started = Date.now();
    await sample();
    await new Promise((r) => setTimeout(r, Math.max(0, 5000 - (Date.now() - started))));
  }
})();
