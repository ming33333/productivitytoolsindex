# Site template

One repo you can copy for each blog or app directory. Google login, Firestore, Cloud Functions, Google Analytics, and Stripe are already wired. The home page stays blank until you build it.

This is a distribution asset, not the product you plan to sell. Each copy earns attention in one niche — a directory of tools, a blog, or both — so you can learn SEO, meet the people who buy in that niche, and later point them at software you own.

## Start this copy

```bash
npm install
npm run setup
npm run dev
```

Open http://localhost:3000/setup and finish the nine checks. `npm run setup` writes the env files. The setup page then proves sign-in, Firestore, functions, Analytics, and a Stripe test checkout actually work.

Restart `npm run dev` after setup. Vite reads `.env` only when it starts.

## Make the next one

Use a new Firebase project for each site. One Stripe account can hold all of the products.

```bash
npm run clone -- ../the-next-site
cd ../the-next-site
npm install
npm run setup
npm run dev
```

The copy has no secrets and no Firebase project. Run setup before you deploy it.

## What’s included

| Piece | Where |
| --- | --- |
| Google sign-in | `src/auth.js` |
| Google Analytics | `src/analytics.js` |
| Firestore paths | `src/collections.js`, `firestore.rules` |
| Stripe checkout, portal, cancel, webhook | `functions/index.js`, `src/subscription.js` |
| Blank page | `src/pages/HomePage.jsx` |
| Walkthrough | `/setup` and `SETUP.md` |
| Identity for this copy | `site.config.json` |

`users/{email}` stores the profile. Cloud Functions are the only writer of `subscriptionStatus`. `entries` are public. `posts` are public when `published` is true.

## Scripts

| Command | What it does |
| --- | --- |
| `npm run setup` | Asks for the niche, Firebase config, and Stripe keys |
| `npm run dev` | Local site at port 3000 |
| `npm run deploy:rules` | Publishes `firestore.rules` |
| `npm run deploy:functions` | Deploys Cloud Functions from a local cache |
| `npm run deploy` | Builds and pushes the `gh-pages` branch |
| `npm run clone -- ../name` | Copies a fresh site outside this folder |

Do not commit `.env` or `functions/.env`. Those files hold the Stripe secret key.

The long version of deploy, DNS, and webhook setup is in [SETUP.md](SETUP.md).
# productivitytoolsindex
