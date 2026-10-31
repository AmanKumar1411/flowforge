#!/usr/bin/env node
// Draws static SVG charts for the report from a load run's monitor CSV and k6 summary.
// Usage: node support/charts.cjs <profile> [...]   -> docs/testing/charts/<profile>-*.svg
// Small multiples on one time axis (one measure per panel, never two y-scales), and a bar chart of
// p95 per endpoint. Colors: reference palette slot 1; text in ink tokens; recessive grid.
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..");
const OUT = path.resolve(ROOT, "../docs/testing/charts");
const C = { surface: "#fcfcfb", ink: "#0b0b0b", ink2: "#52514e", grid: "#e4e3df", series: "#2a78d6", target: "#e34948" };
const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;");
const nice = (max) => {
  if (max <= 0) return 1;
  const step = 10 ** Math.floor(Math.log10(max));
  return [1, 2, 2.5, 5, 10].map((k) => k * step).find((v) => v >= max) ?? max;
};

function csv(file) {
  const [head, ...rows] = fs.readFileSync(file, "utf8").trim().split("\n");
  const keys = head.split(",");
  return rows.map((row) => Object.fromEntries(row.split(",").map((v, i) => [keys[i], v])));
}

function panels(profile, title, series) {
  const width = 760;
  const panelH = 120;
  const gap = 46;
  const left = 64;
  const right = 20;
  const top = 44;
  const height = top + series.length * (panelH + gap) + 10;
  const t0 = series[0].points[0]?.[0] ?? 0;
  const t1 = Math.max(...series.flatMap((s) => s.points.map((p) => p[0])));
  const x = (t) => left + ((t - t0) / Math.max(1, t1 - t0)) * (width - left - right);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="${esc(title)}">`;
  svg += `<rect width="100%" height="100%" fill="${C.surface}"/>`;
  svg += `<text x="${left}" y="24" font-size="15" font-weight="600" fill="${C.ink}">${esc(title)}</text>`;
  series.forEach((s, i) => {
    const y0 = top + i * (panelH + gap) + 18;
    const max = nice(Math.max(s.target ?? 0, ...s.points.map((p) => p[1])) * 1.05);
    const y = (v) => y0 + panelH - (v / max) * panelH;
    svg += `<text x="${left}" y="${y0 - 8}" font-size="12.5" font-weight="600" fill="${C.ink}">${esc(s.label)}</text>`;
    for (const k of [0, 0.5, 1]) {
      const v = max * k;
      svg += `<line x1="${left}" x2="${width - right}" y1="${y(v)}" y2="${y(v)}" stroke="${C.grid}" stroke-width="1"/>`;
      svg += `<text x="${left - 8}" y="${y(v) + 4}" font-size="11" text-anchor="end" fill="${C.ink2}">${Math.round(v * 10) / 10}</text>`;
    }
    if (s.target !== undefined) {
      svg += `<line x1="${left}" x2="${width - right}" y1="${y(s.target)}" y2="${y(s.target)}" stroke="${C.target}" stroke-width="1" stroke-dasharray="4 4"/>`;
      svg += `<text x="${left + 6}" y="${y(s.target) - 5}" font-size="11" fill="${C.ink2}">target ${s.target}</text>`;
    }
    const d = s.points.map((p, j) => `${j ? "L" : "M"}${x(p[0]).toFixed(1)},${y(p[1]).toFixed(1)}`).join("");
    svg += `<path d="${d}" fill="none" stroke="${C.series}" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>`;
    const peak = s.points.reduce((a, b) => (b[1] > a[1] ? b : a), s.points[0] ?? [0, 0]);
    svg += `<text x="${Math.min(x(peak[0]) + 6, width - right - 70)}" y="${Math.max(y(peak[1]) - 6, y0 + 10)}" font-size="11" fill="${C.ink}">max ${Math.round(peak[1] * 10) / 10}${s.unit}</text>`;
  });
  const yAxis = top + series.length * (panelH + gap) - gap + 18 + 16;
  for (let m = 0; m <= (t1 - t0) / 60000; m += Math.max(1, Math.round((t1 - t0) / 60000 / 8))) {
    svg += `<text x="${x(t0 + m * 60000)}" y="${yAxis}" font-size="11" text-anchor="middle" fill="${C.ink2}">${m} min</text>`;
  }
  svg += "</svg>";
  fs.writeFileSync(path.join(OUT, `${profile}-timeline.svg`), svg);
}

function bars(profile, title, rows, target) {
  const width = 760;
  const rowH = 24;
  const left = 300;
  const right = 70;
  const top = 44;
  const height = top + rows.length * rowH + 30;
  const max = nice(Math.max(target, ...rows.map((r) => r.value)) * 1.05);
  const x = (v) => left + (v / max) * (width - left - right);
  let svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" font-family="system-ui, -apple-system, Segoe UI, sans-serif" role="img" aria-label="${esc(title)}">`;
  svg += `<rect width="100%" height="100%" fill="${C.surface}"/>`;
  svg += `<text x="16" y="24" font-size="15" font-weight="600" fill="${C.ink}">${esc(title)}</text>`;
  svg += `<line x1="${x(target)}" x2="${x(target)}" y1="${top - 6}" y2="${top + rows.length * rowH}" stroke="${C.target}" stroke-dasharray="4 4"/>`;
  svg += `<text x="${x(target)}" y="${top + rows.length * rowH + 16}" font-size="11" text-anchor="middle" fill="${C.ink2}">target ${target} ms</text>`;
  rows.forEach((r, i) => {
    const yy = top + i * rowH;
    svg += `<text x="${left - 8}" y="${yy + 15}" font-size="11.5" text-anchor="end" fill="${C.ink}">${esc(r.label)}</text>`;
    const w = Math.max(2, x(r.value) - left);
    svg += `<path d="M${left},${yy + 4}h${w - 4}a4,4 0 0 1 4,4v8a4,4 0 0 1 -4,4h${-(w - 4)}z" fill="${C.series}"/>`;
    svg += `<text x="${left + w + 6}" y="${yy + 15}" font-size="11" fill="${C.ink2}">${Math.round(r.value)} ms</text>`;
  });
  svg += "</svg>";
  fs.writeFileSync(path.join(OUT, `${profile}-endpoints.svg`), svg);
}

fs.mkdirSync(OUT, { recursive: true });
for (const profile of process.argv.slice(2)) {
  const rows = csv(path.join(ROOT, "results/load", `${profile}-monitor.csv`));
  const t = (r) => Date.parse(r.t);
  const pts = (key) => rows.filter((r) => r[key] !== "" && !Number.isNaN(Number(r[key]))).map((r) => [t(r), Number(r[key])]);
  panels(profile, `${profile}: latency, API CPU, memory and database connections (5 s samples)`, [
    { label: "Dashboard request latency (ms): one probe request every 5 s, beside the load", points: pts("probe_ms"), unit: " ms", target: 500 },
    { label: "API process CPU (%; 100% = one core, which runs all the JavaScript)", points: pts("api_cpu"), unit: "%" },
    { label: "API memory (RSS, MB)", points: pts("api_rss_mb"), unit: " MB" },
    { label: "Database connections (all states)", points: pts("db_total"), unit: "" },
  ]);
  const summary = JSON.parse(fs.readFileSync(path.join(ROOT, "results/load", `${profile}-summary.json`), "utf8"));
  const endpoints = Object.entries(summary.metrics)
    .filter(([k, v]) => k.startsWith("http_req_duration{name:") && v["count"] > 0)
    .map(([k, v]) => ({ label: k.slice("http_req_duration{name:".length, -1), value: v["p(95)"] }))
    .sort((a, b) => b.value - a.value);
  bars(profile, `${profile}: p95 latency by endpoint`, endpoints, 500);
  console.log(`${profile}: charts written`);
}
