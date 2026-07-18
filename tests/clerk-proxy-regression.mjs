import { spawn } from "node:child_process";

const host = "127.0.0.1";
const port = "3104";
const url = `http://${host}:${port}/offline`;
const environment = {
  ...process.env,
  NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY: [
    "pk",
    "test",
    Buffer.from("test.clerk.accounts.dev$").toString("base64url"),
  ].join("_"),
  CLERK_SECRET_KEY: ["sk", "test", "example"].join("_"),
  CLERK_ALLOWED_USER_IDS: "user_synthetic_test",
};

function run(command, args, options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, options);
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      if (code === 0) resolve();
      else reject(new Error(`${command} exited with ${code ?? signal}`));
    });
  });
}

async function waitForSuccessfulResponse() {
  const deadline = Date.now() + 15_000;
  let lastError;

  while (Date.now() < deadline) {
    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(2_000) });
      const body = await response.text();
      if (response.status === 200 && body.includes("Offline")) return;
      lastError = new Error(`received HTTP ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Clerk proxy regression failed: ${lastError}`);
}

await run("pnpm", ["build"], { env: environment, stdio: "inherit" });

const server = spawn(
  "pnpm",
  ["start", "--hostname", host, "--port", port],
  { env: environment, stdio: "inherit" },
);

try {
  await waitForSuccessfulResponse();
  console.log("Clerk proxy regression passed through the public HTTP seam");
} finally {
  server.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => server.once("exit", resolve)),
    new Promise((resolve) => setTimeout(resolve, 2_000)),
  ]);
}
