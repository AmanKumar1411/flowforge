#!/usr/bin/env node
// Prints the report's load tables (Markdown) from results/load/<profile>-{summary.json,monitor.csv,db.json,pg-statements.tsv}
// and the k6 log's "unexpected" lines. Usage: node load/tables.cjs normal peak spike soak
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const read = (file) => fs.readFileSync(path.join(ROOT, file), "utf8");
const ms = (v) => (v === undefined ? "–" : v >= 1000 ? `${(v / 1000).toFixed(2)} s` : `${Math.round(v)} ms`);
const pct = (v) => `${(v * 100).toFixed(v > 0 && v < 0.001 ? 4 : 2)}%`;
const max = (rows, key) => Math.max(...rows.map((r) => Number(r[key])).filter((n) => !Number.isNaN(n)));
const quantile = (values, q) => {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
};

const profiles = process.argv.slice(2);
const overview = [];
const endpoints = {};
const notes = [];
for (const p of profiles) {
  const m = JSON.parse(read(`results/load/${p}-summary.json`)).metrics;
  const db = JSON.parse(read(`results/load/${p}-db.json`));
  const [head, ...lines] = read(`results/load/${p}-monitor.csv`).trim().split("\n");
  const keys = head.split(",");
  const rows = lines.map((l) => Object.fromEntries(l.split(",").map((v, i) => [keys[i], v])));
  const all = m.http_req_duration;
  const reads = m["http_req_duration{kind:read}"];
  const writes = m["http_req_duration{kind:write}"];
  const created = m.submissions_created?.count ?? 0;
  const delta = db.submissions_after - db.submissions_before;
  overview.push(
    `| ${p} | ${m.vus_max.max} | ${m.http_reqs.count.toLocaleString("en")} | ${Math.round(m.http_reqs.rate)}/s | ${ms(all.med)} / ${ms(all["p(95)"])} / ${ms(all["p(99)"])} | ${ms(reads["p(95)"])} | ${writes.count ? ms(writes["p(95)"]) : "–"} | ${pct(m.http_req_failed.value)} | ${m.server_errors.count} | ${created} / ${delta}${created === delta ? " ✓" : " ✗"} | ${Math.round(max(rows, "api_cpu"))}% | ${Math.round(max(rows, "api_rss_mb"))} MB | ${max(rows, "db_total")} (${max(rows, "db_active")} active) | ${ms(quantile(rows.map((r) => Number(r.probe_ms)), 0.95))} | ${db.k6_exit === 0 ? "pass" : "fail"} |`,
  );
  for (const [k, v] of Object.entries(m)) {
    if (!k.startsWith("http_req_duration{name:") || !v.count) continue;
    const name = k.slice("http_req_duration{name:".length, -1);
    (endpoints[name] ??= {})[p] = v;
  }
  const log = read(`results/raw/${p}-k6.log`);
  const unexpected = {};
  for (const [, what] of log.matchAll(/msg="unexpected ([^"]+)"/g)) unexpected[what] = (unexpected[what] ?? 0) + 1;
  // k6 logs requests that never got a status: `error="Post \"http://…/api/teams/<id>/…\": … connection reset by peer"`.
  const failedByCause = {};
  for (const [, method, url, error] of log.matchAll(/Request Failed" error="(\w+) \\"http:\/\/[^/]+\/api([^\\]+)\\": ([^"]*)"/g)) {
    const key = `${method.toUpperCase()} ${url.replace(/[0-9a-f]{8}-[0-9a-f-]{27}/g, ":id")} ${error.split(": ").pop()}`;
    failedByCause[key] = (failedByCause[key] ?? 0) + 1;
  }
  notes.push(`- **${p}**: unexpected responses ${m.unexpected_responses?.count ?? 0} (first two per VU: ${Object.entries(unexpected).map(([k, v]) => `${k} ×${v}`).join(", ") || "none"}); connection failures ${Object.entries(failedByCause).map(([k, v]) => `${k} ×${v}`).join(", ") || "none"}; refresh failures ${pct(m.refresh_failures?.value ?? 0)}; evaluation conflicts (409) ${m.evaluation_conflicts?.count ?? 0}; submissions refused ${m.submissions_refused?.count ?? 0}`);
}

console.log("| Profile | VUs | Requests | Throughput | All p50 / p95 / p99 | Reads p95 | Writes p95 | Failed | 5xx + dropped | Submissions k6 / DB | API CPU max | API RSS max | DB connections max | Probe p95 | Thresholds |");
console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
console.log(overview.join("\n"));
console.log(`\n| Endpoint | ${profiles.map((p) => `${p} p50 / p95 / p99`).join(" | ")} |`);
console.log(`| --- | ${profiles.map(() => "---").join(" | ")} |`);
const worst = (e) => Math.max(...Object.values(e).map((v) => v["p(95)"]));
for (const [name, byProfile] of Object.entries(endpoints).sort((a, b) => worst(b[1]) - worst(a[1]))) {
  console.log(`| \`${name}\` | ${profiles.map((p) => (byProfile[p] ? `${ms(byProfile[p].med)} / ${ms(byProfile[p]["p(95)"])} / ${ms(byProfile[p]["p(99)"])}` : "–")).join(" | ")} |`);
}
console.log(`\n${notes.join("\n")}`);
// The k6 HTML export embeds 10 s snapshots (gzip + base64, one JSON event per line). Each "metric" event
// adds metrics; a snapshot holds one array per metric, in name order; trends are [avg, max, med, min, p90, p95, p99].
function timeline(p) {
  const html = read(`results/load/${p}-k6-report.html`);
  const blob = html.match(/<script[^>]*id="data"[^>]*>([^<]+)<\/script>/)[1].trim();
  const events = require("node:zlib").gunzipSync(Buffer.from(blob, "base64")).toString().trim().split("\n").map((l) => JSON.parse(l));
  let names = [];
  let start = null;
  const rows = [];
  for (const e of events) {
    if (e.event === "metric") names = [...new Set([...names, ...Object.keys(e.data)])].sort();
    if (e.event !== "snapshot") continue;
    const get = (name) => e.data[names.indexOf(name)];
    start ??= get("time")[0];
    rows.push({ minute: (get("time")[0] - start) / 60000, vus: get("vus")?.[0] ?? 0, rate: get("http_reqs")?.[1] ?? 0, p95: get("http_req_duration")?.[5] });
  }
  return rows;
}
for (const p of profiles) {
  const rows = timeline(p);
  console.log(`\n${p} per minute (10 s windows; max ${Math.round(Math.max(...rows.map((r) => r.rate)))} requests/s):\n| Minute | VUs | Requests/s | p95 |\n| --- | --- | --- | --- |`);
  for (let minute = 1; minute <= rows.at(-1).minute; minute += minute < 10 ? 1 : 4) {
    const r = rows.find((row) => row.minute >= minute);
    if (r) console.log(`| ${minute} | ${r.vus.toLocaleString("en")} | ${Math.round(r.rate)} | ${ms(r.p95)} |`);
  }
}
for (const p of profiles) {
  const [head, ...lines] = read(`results/load/${p}-pg-statements.tsv`).trim().split("\n").filter((l) => !/^\(\d+ rows?\)$/.test(l));
  console.log(`\n${p} pg_stat_statements (top 5 by total time):\n| Calls | Total | Mean | Max | Query |\n| --- | --- | --- | --- | --- |`);
  for (const line of lines.slice(0, 5)) {
    const [calls, total, mean, maxMs, , query] = line.split("\t");
    console.log(`| ${Number(calls).toLocaleString("en")} | ${ms(Number(total))} | ${mean} ms | ${maxMs} ms | \`${query.replace(/"public"\./g, "").replace(/"/g, "").slice(0, 120)}…\` |`);
  }
}
