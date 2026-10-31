#!/usr/bin/env node
// Summarises a V8 .cpuprofile of the API: busy time by package, then who calls the hottest Node crypto frames.
// Usage: node load/cpu-profile.cjs <file.cpuprofile>
const fs = require("node:fs");

const profile = JSON.parse(fs.readFileSync(process.argv[2], "utf8"));
const byId = new Map(profile.nodes.map((n) => [n.id, n]));
const parent = new Map();
for (const n of profile.nodes) for (const child of n.children || []) parent.set(child, n.id);
const self = new Map();
profile.samples.forEach((id, i) => self.set(id, (self.get(id) || 0) + (profile.timeDeltas[i] || 0)));

const packageOf = ({ url, functionName }) => {
  if (!url) return functionName.startsWith("(") ? functionName : "(native builtins)";
  if (url.startsWith("node:")) return `node core: ${url.slice(5).split("/").slice(0, 2).join("/")}`;
  const dep = url.match(/node_modules\/((?:@[^/]+\/)?[^/]+)/);
  if (dep) return dep[1];
  const app = url.match(/dist\/src\/([^/]+)/);
  return app ? `app: ${app[1]}` : url.slice(-50);
};
const frame = ({ functionName, url, lineNumber }) =>
  `${functionName || "(anonymous)"} ${url.replace(/^.*node_modules\//, "").replace(/^file:\/\/.*\/dist\//, "dist/")}:${lineNumber + 1}`;

const byPackage = {};
let total = 0;
for (const [id, time] of self) {
  const key = packageOf(byId.get(id).callFrame);
  byPackage[key] = (byPackage[key] || 0) + time;
  total += time;
}
const busy = total - (byPackage["(idle)"] || 0);
console.log(`profile ${(total / 1e6).toFixed(1)} s, busy ${(busy / 1e6).toFixed(1)} s`);
for (const [key, time] of Object.entries(byPackage).filter(([k]) => k !== "(idle)").sort((a, b) => b[1] - a[1]).slice(0, 15)) {
  console.log(`${((time / busy) * 100).toFixed(1).padStart(5)}%  ${key}`);
}

// Node's crypto frames, charged to the first caller outside Node core (e.g. jsonwebtoken).
const callers = {};
for (const [id, time] of self) {
  let node = byId.get(id);
  if (!node.callFrame.url.startsWith("node:internal/crypto")) continue;
  const chain = [frame(node.callFrame)];
  while (parent.has(node.id) && chain.length < 3) {
    node = byId.get(parent.get(node.id));
    if (node.callFrame.url && !node.callFrame.url.startsWith("node:")) chain.push(frame(node.callFrame));
  }
  const key = chain.join("  <-  ");
  callers[key] = (callers[key] || 0) + time;
}
console.log("\nNode crypto, by caller:");
for (const [key, time] of Object.entries(callers).sort((a, b) => b[1] - a[1]).slice(0, 5)) {
  console.log(`${((time / busy) * 100).toFixed(1).padStart(5)}%  ${key}`);
}
