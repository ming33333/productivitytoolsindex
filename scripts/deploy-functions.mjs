#!/usr/bin/env node
/**
 * Install and deploy Cloud Functions from a local cache.
 * Desktop / iCloud copies can hang if firebase deploy reads node_modules in place.
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const sourceDir = path.join(root, "functions");
const cacheRoot = path.join(os.homedir(), ".cache", "site-template-functions");
const destDir = path.join(cacheRoot, "functions");

const FUNCTION_NAMES = [
  "health",
  "createCheckoutSession",
  "createPortalSession",
  "getSubscriptionDetails",
  "confirmCheckoutSession",
  "stripeWebhook",
  "cancelSubscription",
];

function run(command, args, cwd) {
  const result = spawnSync(command, args, {
    cwd,
    stdio: "inherit",
    env: {
      ...process.env,
      FUNCTIONS_DISCOVERY_TIMEOUT: process.env.FUNCTIONS_DISCOVERY_TIMEOUT || "60",
    },
  });
  if (result.error) {
    console.error(result.error.message);
    process.exit(1);
  }
  if (result.status !== 0) process.exit(result.status || 1);
}

function readProjectId() {
  const rc = JSON.parse(fs.readFileSync(path.join(root, ".firebaserc"), "utf8"));
  const projectId = rc.projects?.default || "";
  if (!projectId || projectId === "your-project-id") {
    console.error("Set a Firebase project first: npm run setup");
    process.exit(1);
  }
  return projectId;
}

function syncLocalTesting() {
  const rootEnv = path.join(root, ".env");
  const destEnv = path.join(destDir, ".env");
  if (!fs.existsSync(rootEnv) || !fs.existsSync(destEnv)) return;
  const match = fs.readFileSync(rootEnv, "utf8").match(/^LOCAL_TESTING=(.*)$/m);
  if (!match) return;
  const value = match[1].trim();
  let text = fs.readFileSync(destEnv, "utf8");
  text = /^LOCAL_TESTING=/m.test(text)
    ? text.replace(/^LOCAL_TESTING=.*$/m, `LOCAL_TESTING=${value}`)
    : `${text}\nLOCAL_TESTING=${value}\n`;
  fs.writeFileSync(destEnv, text);
  console.log(`[deploy-functions] LOCAL_TESTING=${value}`);
}

const projectId = readProjectId();
fs.rmSync(cacheRoot, { recursive: true, force: true });
fs.mkdirSync(destDir, { recursive: true });

for (const name of fs.readdirSync(sourceDir)) {
  if (name === "node_modules") continue;
  fs.cpSync(path.join(sourceDir, name), path.join(destDir, name), { recursive: true });
}
fs.cpSync(path.join(root, "firebase.json"), path.join(cacheRoot, "firebase.json"));
fs.cpSync(path.join(root, ".firebaserc"), path.join(cacheRoot, ".firebaserc"));
syncLocalTesting();

if (!fs.existsSync(path.join(destDir, ".env"))) {
  console.error("Missing functions/.env. Run npm run setup and add the Stripe secret key.");
  process.exit(1);
}

const firebaseBin = path.join(root, "node_modules", ".bin", "firebase");
const firebaseCmd = fs.existsSync(firebaseBin) ? firebaseBin : "firebase";

console.log("[deploy-functions] Installing dependencies on local disk…");
run("npm", ["install", "--no-fund", "--no-audit"], destDir);

console.log("[deploy-functions] Deploying…");
run(firebaseCmd, ["deploy", "--only", "functions", "--project", projectId], cacheRoot);

console.log("[deploy-functions] Allowing public HTTP invoke…");
for (const name of FUNCTION_NAMES) {
  const gen1 = spawnSync(
    "gcloud",
    [
      "functions",
      "add-iam-policy-binding",
      name,
      "--region=us-central1",
      "--member=allUsers",
      "--role=roles/cloudfunctions.invoker",
      `--project=${projectId}`,
    ],
    { stdio: "inherit" },
  );
  if (gen1.status === 0) continue;
  const gen2 = spawnSync(
    "gcloud",
    [
      "run",
      "services",
      "add-iam-policy-binding",
      name.toLowerCase(),
      "--region=us-central1",
      "--member=allUsers",
      "--role=roles/run.invoker",
      `--project=${projectId}`,
    ],
    { stdio: "inherit" },
  );
  if (gen2.status !== 0) {
    console.warn(
      `[deploy-functions] Could not open ${name}. If the browser gets a 403, run:\n` +
        `gcloud functions add-iam-policy-binding ${name} --region=us-central1 --member=allUsers --role=roles/cloudfunctions.invoker --project=${projectId}`,
    );
  }
}

console.log(`
[deploy-functions] Health check:
  https://us-central1-${projectId}.cloudfunctions.net/health

[deploy-functions] Stripe webhook:
  https://us-central1-${projectId}.cloudfunctions.net/stripeWebhook
`);
