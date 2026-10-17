#!/usr/bin/env node
/**
 * Copy this template to a new folder without secrets, git history, or installs.
 * Usage: npm run clone -- ../the-next-site
 */
import fs from "fs";
import path from "path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const destArg = process.argv[2];

if (!destArg) {
  console.error("Usage: npm run clone -- ../the-next-site");
  process.exit(1);
}

const dest = path.resolve(root, destArg);
const relative = path.relative(root, dest);
if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
  console.error("Clone to a folder outside this repo, for example ../the-next-site");
  process.exit(1);
}
if (fs.existsSync(dest)) {
  console.error(`Already exists: ${dest}`);
  process.exit(1);
}

const skip = new Set([
  "node_modules",
  "build",
  ".git",
  ".firebase",
  ".env",
  ".DS_Store",
]);

fs.cpSync(root, dest, {
  recursive: true,
  filter(source) {
    const base = path.basename(source);
    if (skip.has(base)) return false;
    if (base.endsWith(".log")) return false;
    return true;
  },
});

const configPath = path.join(dest, "site.config.json");
const config = JSON.parse(fs.readFileSync(configPath, "utf8"));
Object.assign(config, {
  template: true,
  name: "Your Site",
  slug: "your-site",
  niche: "",
  tagline: "A blank page with login, Firestore, and Stripe ready.",
  domain: "",
  githubRepo: "",
  supportEmail: "",
  base: "/",
});
fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);

const rcPath = path.join(dest, ".firebaserc");
fs.writeFileSync(
  rcPath,
  `${JSON.stringify({ projects: { default: "your-project-id" } }, null, 2)}\n`,
);

const cname = path.join(dest, "public", "CNAME");
if (fs.existsSync(cname)) fs.rmSync(cname);

const pkgPath = path.join(dest, "package.json");
const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf8"));
pkg.homepage = "https://example.com";
fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`);

console.log(`Copied a fresh site to ${dest}

That copy has no .env and no Firebase project yet.
Use a new Firebase project for each site so users and billing stay separate.
One Stripe account can hold all five products.

  cd ${dest}
  npm install
  npm run setup
  npm run dev
`);
