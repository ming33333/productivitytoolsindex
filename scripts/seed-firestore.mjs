import { createRequire } from "node:module";
import fs from "node:fs";
import { accounts, tools } from "./seed-catalog.mjs";

const require = createRequire(import.meta.url);
const { getAccessToken, getGlobalDefaultAccount, getProjectDefaultAccount } = require("firebase-tools/lib/auth");

const firebaserc = JSON.parse(fs.readFileSync(new URL("../.firebaserc", import.meta.url), "utf8"));
const projectId = firebaserc.projects?.default;
const seedBatch = "models-v1";
const scopes = [
  "email",
  "openid",
  "https://www.googleapis.com/auth/cloudplatformprojects.readonly",
  "https://www.googleapis.com/auth/firebase",
  "https://www.googleapis.com/auth/cloud-platform",
];

function slug(name) {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function field(value) {
  if (typeof value === "string") return { stringValue: value };
  if (typeof value === "boolean") return { booleanValue: value };
  if (Array.isArray(value)) {
    return { arrayValue: { values: value.map((item) => field(item)) } };
  }
  throw new Error(`Unsupported value: ${typeof value}`);
}

function fieldsOf(record) {
  return Object.fromEntries(Object.entries(record).map(([key, value]) => [key, field(value)]));
}

function docName(collection, id) {
  return `projects/${projectId}/databases/(default)/documents/${collection}/${id}`;
}

function buildRecords() {
  if (accounts.length !== 10) {
    throw new Error(`Expected 10 accounts, found ${accounts.length}.`);
  }
  if (tools.length !== 100) {
    throw new Error(`Expected 100 tools, found ${tools.length}.`);
  }

  const emails = new Set();
  for (const account of accounts) {
    const email = account.email.toLowerCase();
    if (emails.has(email)) throw new Error(`Duplicate account ${email}.`);
    emails.add(email);
  }

  const slugs = new Set();
  const entries = tools.map((tool, index) => {
    const id = slug(tool.name);
    if (!id || slugs.has(id)) throw new Error(`Bad or duplicate tool name: ${tool.name}`);
    slugs.add(id);
    const author = accounts[index % accounts.length];
    const features = tool.features;
    const tags = tool.tags;
    const searchText = [tool.name, tool.category, tool.summary, tool.description, ...features, ...tags]
      .join(" ")
      .toLowerCase();
    return {
      id,
      data: {
        name: tool.name,
        slug: id,
        url: `https://${id}.example`,
        category: tool.category,
        summary: tool.summary,
        description: tool.description,
        features,
        tags,
        searchText,
        authorEmail: author.email.toLowerCase(),
        authorName: author.displayName,
        seed: true,
        seedBatch,
      },
    };
  });

  const users = accounts.map((account) => ({
    id: account.email.toLowerCase(),
    data: {
      email: account.email.toLowerCase(),
      displayName: account.displayName,
      photoURL: "",
      bio: account.bio,
      model: true,
      seed: true,
      seedBatch,
    },
  }));

  return { users, entries };
}

function activeAccount() {
  return getProjectDefaultAccount(process.cwd()) || getGlobalDefaultAccount();
}

async function accessToken() {
  const account = activeAccount();
  if (!account?.tokens?.refresh_token) {
    throw new Error("Firebase CLI is not logged in. Run firebase login, then try again.");
  }
  const token = await getAccessToken(account.tokens.refresh_token, scopes);
  if (!token?.access_token) throw new Error("Could not refresh the Firebase login token.");
  return token.access_token;
}

async function commit(token, writes) {
  const url = `https://firestore.googleapis.com/v1/projects/${projectId}/databases/(default)/documents:commit`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ writes }),
  });
  const body = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = body?.error?.message || response.statusText;
    if (response.status === 403) {
      const account = activeAccount();
      const who = account?.user?.email || "the logged-in Firebase user";
      throw new Error(
        `${who} cannot write to Firebase project ${projectId}. Log in with the Google account that owns it (firebase login), then run npm run seed again. (${message})`,
      );
    }
    throw new Error(`Firestore commit failed (${response.status}): ${message}`);
  }
  return body;
}

async function main() {
  const { users, entries } = buildRecords();
  const token = await accessToken();
  const userMask = ["email", "displayName", "photoURL", "bio", "model", "seed", "seedBatch"];
  const writes = [
    ...users.map((user) => ({
      update: { name: docName("users", user.id), fields: fieldsOf(user.data) },
      updateMask: { fieldPaths: userMask },
    })),
    ...entries.map((entry) => ({
      update: { name: docName("entries", entry.id), fields: fieldsOf(entry.data) },
    })),
  ];

  await commit(token, writes);
  console.log(`Wrote ${users.length} model accounts and ${entries.length} tools to ${projectId}.`);
  console.log(`Accounts include ${users[0].id}.`);
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
