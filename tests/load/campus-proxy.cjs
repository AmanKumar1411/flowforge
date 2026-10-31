#!/usr/bin/env node
// The campus network for the `campus` load profile: every request reaches the API from one public IP,
// through a reverse proxy that sets X-Forwarded-For (like the university's NAT plus a load balancer).
// Test tooling only. Usage: node load/campus-proxy.cjs [listenPort=3210] [apiPort=3200] [campusIp=203.0.113.10]
// The API must trust it: TRUST_PROXY=loopback. Two processes, so the proxy is not the bottleneck.
const cluster = require("node:cluster");
const http = require("node:http");

const [listenPort = "3210", apiPort = "3200", campusIp = "203.0.113.10"] = process.argv.slice(2);

if (cluster.isPrimary) {
  for (let i = 0; i < 2; i += 1) cluster.fork();
  cluster.on("exit", () => cluster.fork());
  process.on("SIGTERM", () => {
    for (const worker of Object.values(cluster.workers)) worker.kill("SIGTERM");
    process.exit(0);
  });
} else {
  // Keep-alive to the API, idle well under its 65 s timeout, like a load balancer's upstream pool.
  const agent = new http.Agent({ keepAlive: true, maxSockets: 256, keepAliveMsecs: 30_000 });
  const server = http.createServer((req, res) => {
    const headers = { ...req.headers, "x-forwarded-for": campusIp, host: `127.0.0.1:${apiPort}` };
    const upstream = http.request({ host: "127.0.0.1", port: apiPort, method: req.method, path: req.url, headers, agent }, (answer) => {
      res.writeHead(answer.statusCode, answer.headers);
      answer.pipe(res);
    });
    upstream.on("error", () => {
      if (!res.headersSent) res.writeHead(502, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ code: "BAD_GATEWAY", message: "campus proxy: the API did not answer" }));
    });
    req.pipe(upstream);
  });
  server.keepAliveTimeout = 65_000;
  server.headersTimeout = 66_000;
  server.listen(Number(listenPort), "127.0.0.1");
}
