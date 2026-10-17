import { createRequire } from "node:module";
import fs from "node:fs";

const require = createRequire(import.meta.url);
const { getAccessToken, getGlobalDefaultAccount, getProjectDefaultAccount } = require("firebase-tools/lib/auth");

const firebaserc = JSON.parse(fs.readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"));
const projectId = firebaserc.projects?.default;
const email = "mintharuck@gmail.com";
const scopes = [
  "email",
  "openid",
  "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
  "https://www.googleapis.com/auth/firebase",
  "https://www.googleapis.com/auth/cloud-platform",
];

function activeAccount() {
  return getProjectDefaultAccount(process.cwd()) || getGlobalDefaultAccount();
}

async function main() {
  const account = activeAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Firebase CLI is not logged in. Run firebase login, then try again.");
  }
  const token = await getAccessToken(account.tokens.refresh_token, scopes);
  if (!token?.access_token) throw new Error("Could not refresh the Firebase login token.");

  const name = `projects/${projectId}/databases/(default)/documents/admins/${email}`;
  const response = await fetch(`https://firestore.googleapis.com/v1/${name}`, {
    method: "PATCH",
    headers: {
      Authorization: `Bearer ${token.access_token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      fields: {
        email: { stringValue: email },
        addedAt: { stringValue: new Date().toISOString() },
      },
    }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(body?.error?.message || `Could not write admin (${response.status}).`);
  }
  console.log(`Admin ${email} is on ${projectId}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
