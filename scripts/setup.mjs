#!/usr/bin/env node
/**
 * Walk through one site: niche, Firebase, Stripe, domain.
 * Writes site.config.json, .env, functions/.env, and .firebaserc.
 * Run again any time. Press Enter to keep the value in brackets.
 */
import fs from "fs";
import path from "path";
import readline from "node:readline/promises";
import { fileURLToPath } from "node:url";
import { stdin as input, stdout as output } from "node:process";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const writeJson = (file, value) =>
  fs.writeFileSync(path.join(root, file), `${JSON.stringify(value, null, 2)}\n`);

function readEnv(file) {
  const full = path.join(root, file);
  if (!fs.existsSync(full)) return {};
  const out = {};
  for (const line of fs.readFileSync(full, "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match) continue;
    let value = match[2];
    if (value.startsWith('"')) {
      try {
        value = JSON.parse(value);
      } catch {
        /* keep the raw value */
      }
    }
    out[match[1]] = value;
  }
  return out;
}

function envLine(key, value) {
  const text = value == null ? "" : String(value);
  const safe = /[\s#"'`]/.test(text) ? JSON.stringify(text) : text;
  return `${key}=${safe}`;
}

function writeEnv(file, pairs) {
  const body = pairs.map(([key, value]) => envLine(key, value)).join("\n");
  fs.writeFileSync(path.join(root, file), `${body}\n`);
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function cleanDomain(value) {
  return String(value || "")
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, "")
    .replace(/\/.*$/, "");
}

function parseFirebaseConfig(text) {
  const keys = [
    "apiKey",
    "authDomain",
    "projectId",
    "storageBucket",
    "messagingSenderId",
    "appId",
    "measurementId",
  ];
  const out = {};
  for (const key of keys) {
    const match = text.match(new RegExp(`${key}\\s*[:=]\\s*['"]([^'"]+)['"]`));
    if (match) out[key] = match[1];
  }
  return out;
}

function looksLike(value, prefix) {
  return Boolean(value) && String(value).startsWith(prefix) && !String(value).includes("...");
}

async function main() {
  if (!input.isTTY) {
    console.error("Run npm run setup in a terminal so it can ask questions.");
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });
  const ask = async (label, fallback = "") => {
    const hint = fallback ? ` [${fallback}]` : "";
    const answer = (await rl.question(`${label}${hint}: `)).trim();
    return answer || fallback;
  };
  const askRequired = async (label, fallback = "") => {
    while (true) {
      const value = await ask(label, fallback);
      if (value && value !== "your-project-id" && value !== "Your Site") return value;
      console.log("  This one is required.");
    }
  };
  const choose = async (label, options, fallbackIndex) => {
    console.log(`\n${label}`);
    options.forEach((option, index) => {
      console.log(`  ${index + 1}) ${option}`);
    });
    while (true) {
      const answer = await ask("Choose", String(fallbackIndex));
      const index = Number(answer);
      if (index >= 1 && index <= options.length) return index;
      console.log("  Enter one of the numbers.");
    }
  };

  const site = readJson("site.config.json");
  const rootEnv = readEnv(".env");
  const fnEnv = readEnv("functions/.env");
  const rc = readJson(".firebaserc");

  console.log(`
This sets up one site. Run it again any time. Enter keeps the value in brackets.

You are not starting with the software you want to sell.
You are starting with a site that can earn attention in one niche:
a directory of tools, a blog, or both.
Later, that audience is where your own product gets distributed.

Answer for this copy only. Each of the other sites gets its own setup.
`);

  const kindIndex = await choose(
    "What are you building?",
    [
      "App directory — a list of tools in one niche",
      "Niche blog — articles that can rank and point at tools",
      "Both — a directory and a blog on the same domain",
    ],
    site.kind === "blog" ? 2 : site.kind === "both" ? 3 : 1,
  );
  const kind = ["directory", "blog", "both"][kindIndex - 1];

  const name = await askRequired("Site name", site.name === "Your Site" ? "" : site.name);
  const slugDefault = slugify(name);
  const slug = slugify(await ask("Short slug", site.slug === "your-site" ? slugDefault : site.slug || slugDefault)) || slugDefault;

  console.log(`
Name the niche in plain language.
Examples: "invoicing tools for freelancers", "AI note apps for therapists".
`);
  const niche = await askRequired(
    "Niche",
    site.niche || "",
  );
  const defaultTagline =
    kind === "blog"
      ? `Notes on ${niche}.`
      : kind === "both"
        ? `A directory and a blog about ${niche}.`
        : `A directory of tools for ${niche}.`;
  const tagline = await ask("One-line description", site.tagline && !site.template ? site.tagline : defaultTagline);
  const supportEmail = await ask("Support email (shown on the account page)", site.supportEmail || "");
  const domain = cleanDomain(await ask("Domain (blank to skip for now)", site.domain || ""));
  const githubRepo = await ask("GitHub repo, like you/site-name (blank to skip)", site.githubRepo || "");

  const monthly = Number(await ask("Monthly price in USD", String(site.monthlyPriceUsd || 9)));
  const yearly = Number(await ask("Yearly price in USD", String(site.yearlyPriceUsd || 79)));

  const visit = await choose(
    "How will people visit it?",
    [
      "Custom domain, or https://you.github.io  (site root)",
      "Project page, like https://you.github.io/repo",
    ],
    site.base && site.base !== "/" ? 2 : 1,
  );
  let base = "/";
  if (visit === 2) {
    const repoName = slugify(await askRequired("GitHub repository name", slug));
    base = `/${repoName}/`;
  }

  console.log(`
Firebase
  1. Open https://console.firebase.google.com/
  2. Create a project for this site only. One project per site.
  3. Build → Authentication → Get started → Google → Enable.
  4. Build → Firestore Database → Create database → Production mode.
     Pick the same region you will use for functions (us-central1).
  5. Enable Google Analytics when Firebase offers it, or later under
     Project settings → Integrations → Google Analytics.
  6. Project settings → Your apps → Add web app.
     Paste the firebaseConfig block below, then press Enter on an empty line.
     Or type: skip
`);

  const lines = [];
  while (true) {
    const line = await rl.question("config> ");
    if (!line.trim()) break;
    if (!lines.length && line.trim().toLowerCase() === "skip") break;
    lines.push(line);
  }
  let firebase = parseFirebaseConfig(lines.join("\n"));
  if (!firebase.apiKey || !firebase.projectId) {
    console.log("Paste missed a key. Enter the fields one by one.");
    firebase = {
      apiKey: await askRequired("apiKey", rootEnv.REACT_APP_FIREBASE_API_KEY || ""),
      authDomain: await askRequired("authDomain", rootEnv.REACT_APP_FIREBASE_AUTH_DOMAIN || ""),
      projectId: await askRequired("projectId", rootEnv.REACT_APP_FIREBASE_PROJECT_ID || ""),
      storageBucket: await ask("storageBucket", rootEnv.REACT_APP_FIREBASE_STORAGE_BUCKET || ""),
      messagingSenderId: await ask("messagingSenderId", rootEnv.REACT_APP_FIREBASE_MESSAGING_SENDER_ID || ""),
      appId: await askRequired("appId", rootEnv.REACT_APP_FIREBASE_APP_ID || ""),
      measurementId: await ask("measurementId G-", rootEnv.REACT_APP_FIREBASE_MEASUREMENT_ID || ""),
    };
  }

  if (!String(firebase.measurementId || "").startsWith("G-")) {
    console.log(`
Google Analytics
  Firebase → Project settings → Integrations → Google Analytics → Enable.
  Then open the web app config and copy measurementId (G-...).
  Leave this blank if you want to add it later.
`);
    firebase.measurementId = await ask(
      "Measurement ID",
      firebase.measurementId || rootEnv.REACT_APP_FIREBASE_MEASUREMENT_ID || "",
    );
  }

  console.log(`
Stripe  (test mode first — no real charges)
  Keys:    https://dashboard.stripe.com/test/apikeys
  Prices:  https://dashboard.stripe.com/test/products
           Create one product. Add a monthly price and a yearly price.
           Copy each Price ID (price_...), not the Product ID (prod_...).
  Leave a line blank to fill it in later.
`);

  const testingAnswer = (await ask("Use Stripe test mode? (Y/n)", "Y")).toLowerCase();
  const localTesting = testingAnswer !== "n" && testingAnswer !== "no";

  const pkTest = await ask("Test publishable key pk_test_", rootEnv.REACT_APP_STRIPE_TEST_PUBLISHABLE_KEY || "");
  const skTest = await ask("Test secret key sk_test_", fnEnv.STRIPE_TEST_SECRET_KEY || "");
  const priceMonth = await ask("Monthly Price ID price_", rootEnv.REACT_APP_STRIPE_TEST_PRICE_ID || "");
  const priceYear = await ask("Yearly Price ID price_", rootEnv.REACT_APP_STRIPE_TEST_YEARLY_PRICE_ID || "");
  const whsecTest = await ask("Test webhook secret whsec_ (after functions deploy)", fnEnv.STRIPE_TEST_WEBHOOK_SECRET || "");

  console.log("\nLive keys can wait until a domain is serving the site.");
  const pkLive = await ask("Live publishable key", rootEnv.REACT_APP_STRIPE_LIVE_PUBLISHABLE_KEY || "");
  const skLive = await ask("Live secret key", fnEnv.STRIPE_LIVE_SECRET_KEY || "");
  const liveMonth = await ask("Live monthly Price ID", rootEnv.REACT_APP_STRIPE_LIVE_PRICE_ID || "");
  const liveYear = await ask("Live yearly Price ID", rootEnv.REACT_APP_STRIPE_LIVE_YEARLY_PRICE_ID || "");
  const whsecLive = await ask("Live webhook secret", fnEnv.STRIPE_LIVE_WEBHOOK_SECRET || "");

  const warn = (label, ok) => {
    if (!ok) console.log(`  Still missing: ${label}`);
  };
  console.log("\nChecking what can go live later:");
  warn("Firebase apiKey", looksLike(firebase.apiKey, "") && firebase.apiKey.length > 10);
  warn("Google Analytics measurement ID", looksLike(firebase.measurementId, "G-"));
  warn("Stripe test publishable key", !pkTest || looksLike(pkTest, "pk_test"));
  warn("Stripe test secret key", !skTest || looksLike(skTest, "sk_test"));
  warn("Monthly price", !priceMonth || looksLike(priceMonth, "price_"));
  warn("Yearly price", !priceYear || looksLike(priceYear, "price_"));

  const nextSite = {
    template: false,
    name,
    slug,
    kind,
    niche,
    tagline,
    domain,
    githubRepo,
    supportEmail,
    monthlyPriceUsd: Number.isFinite(monthly) ? monthly : 9,
    yearlyPriceUsd: Number.isFinite(yearly) ? yearly : 79,
    base,
  };
  writeJson("site.config.json", nextSite);

  writeEnv(".env", [
    ["REACT_APP_FIREBASE_API_KEY", firebase.apiKey || ""],
    ["REACT_APP_FIREBASE_AUTH_DOMAIN", firebase.authDomain || ""],
    ["REACT_APP_FIREBASE_PROJECT_ID", firebase.projectId || ""],
    ["REACT_APP_FIREBASE_STORAGE_BUCKET", firebase.storageBucket || ""],
    ["REACT_APP_FIREBASE_MESSAGING_SENDER_ID", firebase.messagingSenderId || ""],
    ["REACT_APP_FIREBASE_APP_ID", firebase.appId || ""],
    ["REACT_APP_FIREBASE_MEASUREMENT_ID", firebase.measurementId || ""],
    ["LOCAL_TESTING", localTesting ? "true" : "false"],
    ["REACT_APP_STRIPE_TEST_PUBLISHABLE_KEY", pkTest || ""],
    ["REACT_APP_STRIPE_TEST_PRICE_ID", priceMonth || ""],
    ["REACT_APP_STRIPE_TEST_YEARLY_PRICE_ID", priceYear || ""],
    ["REACT_APP_STRIPE_LIVE_PUBLISHABLE_KEY", pkLive || ""],
    ["REACT_APP_STRIPE_LIVE_PRICE_ID", liveMonth || ""],
    ["REACT_APP_STRIPE_LIVE_YEARLY_PRICE_ID", liveYear || ""],
    ["REACT_APP_CLOUD_FUNCTIONS_URL", rootEnv.REACT_APP_CLOUD_FUNCTIONS_URL || ""],
  ]);

  writeEnv("functions/.env", [
    ["LOCAL_TESTING", localTesting ? "true" : "false"],
    ["STRIPE_TEST_SECRET_KEY", skTest || ""],
    ["STRIPE_TEST_WEBHOOK_SECRET", whsecTest || ""],
    ["STRIPE_TEST_PRICE_ID", priceMonth || ""],
    ["STRIPE_TEST_YEARLY_PRICE_ID", priceYear || ""],
    ["STRIPE_LIVE_SECRET_KEY", skLive || ""],
    ["STRIPE_LIVE_WEBHOOK_SECRET", whsecLive || ""],
    ["STRIPE_LIVE_PRICE_ID", liveMonth || ""],
    ["STRIPE_LIVE_YEARLY_PRICE_ID", liveYear || ""],
  ]);

  rc.projects.default = firebase.projectId;
  writeJson(".firebaserc", rc);

  const pkgPath = path.join(root, "package.json");
  const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
  if (domain && !domain.endsWith("github.io")) {
    pkg.homepage = `https://${domain}`;
  } else if (visit === 2 && githubRepo) {
    const repo = githubRepo.split("/").pop();
    const owner = githubRepo.split("/")[0];
    pkg.homepage = owner ? `https://${owner}.github.io/${repo}` : pkg.homepage;
  }
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

  const cnamePath = path.join(root, "public", "CNAME");
  if (domain && !domain.endsWith("github.io")) {
    fs.writeFileSync(cnamePath, `${domain}\n`);
  } else if (fs.existsSync(cnamePath)) {
    fs.rmSync(cnamePath);
  }

  const projectId = firebase.projectId;
  console.log(`
Saved.
  site.config.json
  .env
  functions/.env
  .firebaserc  →  ${projectId}

Restart the dev server after this. Vite only reads .env at startup.

Next, in this folder:
  npm install
  npm run dev
  open http://localhost:3000/setup

The setup page checks each service for real:
  Google sign-in, a Firestore write, Cloud Functions, and a Stripe test checkout.

Before those checks pass, in a browser:
  Authentication → Settings → Authorized domains
    add localhost (usually already there), your github.io host, and ${domain || "your domain"}
  https://console.firebase.google.com/project/${projectId}/authentication/providers

  Then deploy rules and functions:
    npx firebase login
    npm run deploy:rules
    npm run deploy:functions

  Webhook, after functions deploy:
    https://us-central1-${projectId}.cloudfunctions.net/stripeWebhook
    Events: checkout.session.completed, customer.subscription.created,
            customer.subscription.updated, customer.subscription.deleted,
            invoice.payment_succeeded, invoice.payment_failed
    Put the whsec_ value back into functions/.env and deploy functions again.

When this site is standing, make the next copy:
  npm run clone -- ../next-site-name
`);

  rl.close();
}

main().catch((error) => {
  console.error(error.message || error);
  process.exit(1);
});
