// Where the isolated QA stack lives. Secrets come from tests/.qa/qa.env (git-ignored, never printed).
const fs = require("node:fs");
const path = require("node:path");

const QA_DIR = path.join(__dirname, "..", ".qa");
const ENV_FILE = process.env.QA_ENV_FILE ?? path.join(QA_DIR, "qa.env");
const WEB = process.env.QA_WEB ?? "http://localhost:5300";
const API = process.env.QA_API ?? "http://localhost:3200/api";

function readEnv() {
  const values = {};
  for (const line of fs.readFileSync(ENV_FILE, "utf8").split("\n")) {
    const match = /^([A-Z_]+)=(.*)$/.exec(line.trim());
    if (match) values[match[1]] = match[2];
  }
  return values;
}

const databaseUrl = () => `postgresql://qa:${readEnv().QA_DB_PASSWORD}@localhost:5433/flowforge_qa`;
const manifest = () => JSON.parse(fs.readFileSync(path.join(QA_DIR, "manifest.json"), "utf8"));

module.exports = { QA_DIR, WEB, API, readEnv, databaseUrl, manifest };
