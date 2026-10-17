# Setup

Do these in order. The same steps are on http://localhost:3000/setup, and that page can press the buttons for you. This file is the version you can follow when the app is not running.

One Firebase project per site. One Stripe account can hold every site’s products.

## 1. Decide what this site is

```bash
npm install
npm run setup
```

The prompt asks for:

- directory, blog, or both
- site name and niche
- domain and GitHub repo, if you already have them
- monthly and yearly prices
- the Firebase web config
- Stripe test keys and Price IDs

It writes `site.config.json`, `.env`, `functions/.env`, `.firebaserc`, and `public/CNAME` when you gave a real domain.

Restart the dev server after it finishes:

```bash
npm run dev
```

## 2. Connect Firebase

1. Create a project at https://console.firebase.google.com/
2. Authentication → Get started → Google → Enable. Choose a support email.
3. Authentication → Settings → Authorized domains. Add `localhost` if it is missing. Add the GitHub Pages host and the custom domain later.
4. Firestore Database → Create database → Production mode → `us-central1`.
5. Project settings → Your apps → Web app. Paste `firebaseConfig` into `npm run setup` if you have not already.

Then, from this folder:

```bash
npx firebase login
npm run deploy:rules
```

If Google later says the app isn’t verified, open the OAuth consent screen for the linked Cloud project and add your Google account as a test user.

## 3. Turn on Google Analytics

Firebase hosts Google Analytics 4 for this site. When you create the project, accept the Analytics prompt. If you skipped it, open Project settings → Integrations → Google Analytics and link a property.

Copy `measurementId` (`G-...`) from the web app config into `npm run setup`. Restart `npm run dev`.

The app then records:

- a page view on every route
- `login` after Google sign-in
- `begin_checkout` when Stripe opens
- `purchase` when checkout is confirmed

Send the test event on the setup page, then look at Analytics → Realtime. Custom events go through `logAnalyticsEvent` in `src/analytics.js`.

## 4. Sign in

Open http://localhost:3000/setup and use Continue with Google. The first sign-in writes `users/{email}` in Firestore. A permission error means the rules from step 2 are not deployed yet.

## 5. Prove Firestore

On the setup page, Save a test note. That writes `users/{email}/notes/{id}` and reads it back. Only that signed-in user can see it.

Public content uses two other collections:

- `entries` — anyone can read. `authorEmail` has to be the signed-in email.
- `posts` — visitors can read a post only when `published` is true.

## 6. Deploy Cloud Functions

```bash
npm run deploy:functions
```

The script installs and deploys from `~/.cache` so an iCloud Desktop folder does not stall the upload. Then it allows the browser to call the HTTP functions.

Health check:

```text
https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/health
```

A 403 after a successful deploy means public invoke was not granted. Run the `gcloud` command the script prints. Install the [Google Cloud SDK](https://cloud.google.com/sdk) if `gcloud` is missing.

## 7. Turn on Stripe

Stay in test mode until the domain is live.

1. https://dashboard.stripe.com/test/apikeys — publishable key in the root `.env`, secret key in `functions/.env`.
2. https://dashboard.stripe.com/test/products — one product, one monthly price, one yearly price. Copy the `price_` ids, not the `prod_` id.
3. https://dashboard.stripe.com/test/settings/billing/portal — turn the customer portal on.
4. Deploy functions, then add a webhook:
   - URL: `https://us-central1-YOUR_PROJECT_ID.cloudfunctions.net/stripeWebhook`
   - Events: `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated`, `customer.subscription.deleted`, `invoice.payment_succeeded`, `invoice.payment_failed`
5. Put the `whsec_` signing secret in `functions/.env` and run `npm run deploy:functions` again.

`LOCAL_TESTING=true` in both env files uses test keys. Set both files to `false` only when you are ready to charge real cards, then deploy functions again.

Test card: `4242 4242 4242 4242`, any future date, any CVC.

The setup page has Start a test checkout. Account → Subscribe uses the same function. Stripe redirects back to `/billing/success`, which marks `subscriptionStatus` on the user document.

## 8. Deploy to GitHub Pages

```bash
git init
git add .
git commit -m "Initial site"
gh repo create you/site-name --public --source=. --remote=origin --push
npm run deploy
```

In the repo: Settings → Pages → Branch `gh-pages` → `/ (root)`.

`npm run deploy` builds into `build/` and publishes that folder. The build also writes `404.html` so refreshing `/account` still loads the app.

Add the `github.io` host to Firebase authorized domains before testing Google login on the deployed site.

For a project site (`https://you.github.io/repo`) rather than a user site or a custom domain, run setup again and choose the project-page option so the asset base path is `/repo/`.

## 9. Attach a domain

Run `npm run setup` and enter the domain. That writes `public/CNAME` and sets `package.json` `"homepage"`.

In GitHub Pages, set Custom domain to the same host, wait for the DNS check, then enable Enforce HTTPS.

At the registrar, apex records:

```text
A  185.199.108.153
A  185.199.109.153
A  185.199.110.153
A  185.199.111.153
```

For `www`, add a CNAME to `you.github.io`. The host in `public/CNAME` is the one people should type.

Add that exact host under Firebase Authentication → Settings → Authorized domains.

## After the pipes work

The home page is blank on purpose. Build the directory or the blog in `src/pages/HomePage.jsx`. A commented example at the top of that file shows an `entries` write and a `posts` write.

Then make the next site:

```bash
npm run clone -- ../the-next-site
```
