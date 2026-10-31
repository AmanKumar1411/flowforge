// Builds load/.users.json (git-ignored) from the seed manifest: one entry per seeded student, batches
// interleaved so any number of virtual users gets a mix, plus the faculty who grade.
const fs = require("node:fs");
const path = require("node:path");
const { manifest } = require("../support/qa-config.cjs");

const m = manifest();
const byEmail = {};
const add = (cycle, open) => {
  for (const team of cycle.teams) for (const email of team.members) {
    byEmail[email] = { c: cycle.id, t: team.id, m1: cycle.milestones[0].id, mo: open, lead: team.leader === email };
  }
};
add(m.cycles.capstone, m.cycles.capstone.milestones[1].id);
add(m.cycles.systems, m.cycles.systems.milestones[1].id);
add(m.cycles.web, null);
const cap = (w) => w[0].toUpperCase() + w.slice(1);
const nameOf = (email) => { const [first, rest] = email.split("@")[0].split("."); return `${cap(first)} ${cap(rest.replace(/\d.*$/, ""))}`; };
const students = [];
for (let i = 0; i < 1000; i += 1) {
  for (const year of ["2023", "2024", "2025"]) {
    const email = m.students[year][i];
    if (email === m.deactivated) continue;
    students.push({ e: email, n: nameOf(email), ...(byEmail[email] ?? { c: year === "2025" ? m.cycles.web.id : null, t: null, m1: null, mo: null }) });
  }
}
const faculty = ["capstone", "systems", "web"].map((key) => ({ e: m.cycles[key].owner, n: `Prof ${cap(m.cycles[key].owner.split("@")[0].slice(4))}`, c: m.cycles[key].id, m1: m.cycles[key].milestones[0].id, mo: m.cycles[key].milestones[1]?.id ?? null }));
fs.writeFileSync(path.join(__dirname, ".users.json"), JSON.stringify({ students, faculty }));
console.log(`${students.length} students, ${faculty.length} faculty`);
