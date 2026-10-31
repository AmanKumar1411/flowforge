// Prints failures and observations from a Playwright JSON report: node support/summarize.cjs <report.json>
const report = require(require("node:path").resolve(process.argv[2]));
const strip = (s) => (s || "").replace(/\x1b\[[0-9;]*m/g, "");
const walk = (suite, trail = []) => {
  for (const child of suite.suites || []) walk(child, [...trail, child.title]);
  for (const spec of suite.specs || []) for (const t of spec.tests) for (const r of t.results) {
    const notes = t.annotations.map((a) => `    · ${a.description}`).join("\n");
    if (r.status !== "passed" || notes) {
      console.log(`${r.status.toUpperCase()} [${t.projectName}] ${spec.title}`);
      if (notes) console.log(notes);
      for (const e of r.errors || []) console.log("    ! " + strip(e.message).split("\n").filter(Boolean).slice(0, 5).join(" | ").slice(0, 600));
    }
  }
};
walk(report);
const s = report.stats;
console.log(`\nexpected ${s.expected} · unexpected ${s.unexpected} · flaky ${s.flaky} · skipped ${s.skipped} · ${Math.round(s.duration / 1000)} s`);
