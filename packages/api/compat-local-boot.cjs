// Fast npm-free local API boot for the harness (no prisma regenerate/seed at
// boot - dev.db in this workspace stays ready). Called from scripts/.
const { spawn } = require("child_process");
const path = require("path");
const http = require("http");

const apiDir = process.cwd();

function waitForHealth(attemptsLeft = 30) {
  return new Promise((resolve, reject) => {
    const attempt = (n) => {
      http
        .get("http://127.0.0.1:3197/api/health", (res) => {
          if (res.statusCode === 200 && n <= 0) return reject(new Error("never healthy"));
          if (res.statusCode === 200) return resolve();
          if (n <= 0) return reject(new Error("never healthy"));
          setTimeout(() => attempt(n - 1), 1000);
        })
        .on("error", () => {
          if (n <= 0) return reject(new Error("never healthy"));
          setTimeout(() => attempt(n - 1), 1000);
        });
    };
    attempt(attemptsLeft);
  });
}

const server = spawn("cmd.exe", [
  "/c",
  "npm.cmd",
  "run",
  "dev",
], {
  cwd: apiDir,
  stdio: ["ignore", "pipe", "pipe"],
  env: { ...process.env, PORT: "3197", MOCK_REDIS: "1" },
});
server.stdout.on("data", (d) => process.stdout.write(String(d)));
server.stderr.on("data", (d) => process.stderr.write(String(d)));

(async () => {
  await waitForHealth(30);
  console.log("[compare-boot] API up at :3197");
  const harnessCode = await new Promise((r) => {
    const h = spawn(process.execPath, [
      path.join(apiDir, "..", "..", "scripts", "contract-compare.mjs"),
      "--report",
      path.join(apiDir, "..", "..", "tmp", "contract-compare.json"),
    ], { stdio: "inherit" });
    h.on("exit", r);
  });
  process.exit(harnessCode ?? 0);
})()
  .catch((err) => { console.error("[compare-boot] failed:", err.message); process.exit(1); })
  .finally(() => server.kill());
