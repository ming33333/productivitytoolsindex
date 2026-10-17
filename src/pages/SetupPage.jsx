import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { addDoc, getDocs, limit, query, serverTimestamp } from "firebase/firestore";
import { logAnalyticsEvent } from "../analytics";
import { ensureUserProfile, readableAuthError, signInWithGoogle } from "../auth";
import Command from "../components/Command";
import { userNotes } from "../collections";
import {
  functionsBaseUrl,
  isAnalyticsConfigured,
  isFirebaseConfigured,
  isLocalTesting,
  isStripeConfigured,
  measurementId,
  projectId,
} from "../env";
import { db, firebaseReady } from "../firebase";
import { kindLabel, site } from "../site";
import { pingFunctions, startCheckout } from "../subscription";

const CHECK_KEY = `site-setup:${site.slug || "template"}`;

function loadChecks() {
  try {
    return JSON.parse(localStorage.getItem(CHECK_KEY) || "{}");
  } catch {
    return {};
  }
}

function Step({ number, title, state, children }) {
  return (
    <li className={`step ${state}`}>
      <div className="step-index" aria-hidden="true">
        {state === "ready" ? "✓" : number}
      </div>
      <div className="step-main">
        <div className="step-head">
          <h2>{title}</h2>
          <span>{state === "ready" ? "Ready" : state === "skipped" ? "Skipped" : "To do"}</span>
        </div>
        {children}
      </div>
    </li>
  );
}

export default function SetupPage({ user, profileError }) {
  const [checks, setChecks] = useState(loadChecks);
  const [authError, setAuthError] = useState("");
  const [authBusy, setAuthBusy] = useState(false);
  const [noteState, setNoteState] = useState(checks.firestore ? "Saved a note in Firestore." : "");
  const [noteError, setNoteError] = useState("");
  const [health, setHealth] = useState(null);
  const [healthError, setHealthError] = useState("");
  const [stripeError, setStripeError] = useState("");
  const [stripeBusy, setStripeBusy] = useState(false);
  const [analyticsNote, setAnalyticsNote] = useState("");
  const [analyticsError, setAnalyticsError] = useState("");

  const setCheck = (id, value) => {
    const next = { ...checks, [id]: value };
    setChecks(next);
    localStorage.setItem(CHECK_KEY, JSON.stringify(next));
  };

  useEffect(() => {
    let cancel = false;
    pingFunctions()
      .then((data) => {
        if (!cancel) setHealth(data);
      })
      .catch((error) => {
        if (!cancel) setHealthError(error.message);
      });
    return () => {
      cancel = true;
    };
  }, []);

  const id = projectId();
  const consoleBase = id
    ? `https://console.firebase.google.com/project/${id}`
    : "https://console.firebase.google.com/";
  const host = window.location.hostname;
  const onGithub = host.endsWith(".github.io");
  const onDomain = Boolean(site.domain) && host === site.domain;
  const repo = site.githubRepo || "you/site-name";
  const functionUrl = functionsBaseUrl();

  const states = {
    product: !site.template && site.name !== "Your Site" && Boolean(site.niche),
    firebase: firebaseReady && isFirebaseConfigured(),
    analytics: isAnalyticsConfigured() && Boolean(checks.analytics),
    google: Boolean(user),
    firestore: Boolean(checks.firestore),
    functions: Boolean(health?.ok),
    stripe: isStripeConfigured(),
    github: Boolean(checks.github) || onGithub || onDomain,
    domain: Boolean(checks.domain) || Boolean(checks.domainSkipped) || onDomain,
  };
  const doneCount = Object.values(states).filter(Boolean).length;

  const saveNote = async () => {
    setNoteError("");
    if (!user?.email || !db) {
      setNoteError("Sign in first.");
      return;
    }
    try {
      const profileProblem = await ensureUserProfile(user);
      if (profileProblem) throw profileProblem;
      await addDoc(userNotes(user.email), {
        text: "Setup check",
        createdAt: serverTimestamp(),
      });
      const snap = await getDocs(query(userNotes(user.email), limit(1)));
      if (snap.empty) throw new Error("The write returned, but the note was not readable.");
      setNoteState("Saved a private note and read it back.");
      setCheck("firestore", true);
    } catch (error) {
      setNoteError(error.message);
    }
  };

  return (
    <main className="setup">
      <p className="eyebrow">Setup · {doneCount} of 9</p>
      <h1>Stand this site up</h1>
      <p className="lede">
        Each check below has to succeed, not just get marked. Secrets are typed in the terminal
        with <code>npm run setup</code>. This page proves the services respond.
      </p>

      <ol className="steps">
        <Step number="1" title="Decide what this site is" state={states.product ? "ready" : "todo"}>
          <p>
            One niche per copy. A directory, a blog, or both. The site collects attention you can
            later point at a product you own. The other four copies get their own niche and their
            own Firebase project.
          </p>
          <dl className="facts">
            <div>
              <dt>Name</dt>
              <dd>{site.name}</dd>
            </div>
            <div>
              <dt>Kind</dt>
              <dd>{kindLabel[site.kind] || site.kind}</dd>
            </div>
            <div>
              <dt>Niche</dt>
              <dd>{site.niche || "Not set"}</dd>
            </div>
            <div>
              <dt>Domain</dt>
              <dd>{site.domain || "Not set"}</dd>
            </div>
          </dl>
          <Command>npm run setup</Command>
          <p className="note">Restart <code>npm run dev</code> after setup. Vite reads .env once, at startup.</p>
        </Step>

        <Step number="2" title="Connect Firebase" state={states.firebase ? "ready" : "todo"}>
          <p>Use a new Firebase project for this site so its users and data stay separate.</p>
          <ol className="substeps">
            <li>
              <a href="https://console.firebase.google.com/" target="_blank" rel="noreferrer">
                Create the project
              </a>
              , then add a web app and paste <code>firebaseConfig</code> into <code>npm run setup</code>.
            </li>
            <li>
              <a href={`${consoleBase}/authentication/providers`} target="_blank" rel="noreferrer">
                Enable Google sign-in
              </a>
              . Pick a support email when Firebase asks.
            </li>
            <li>
              <a href={`${consoleBase}/firestore`} target="_blank" rel="noreferrer">
                Create Firestore
              </a>{" "}
              in production mode, region <code>us-central1</code>.
            </li>
            <li>
              <a href={`${consoleBase}/authentication/settings`} target="_blank" rel="noreferrer">
                Authorized domains
              </a>
              : <code>localhost</code>
              {site.domain ? (
                <>
                  , <code>{site.domain}</code>
                </>
              ) : null}
              , and the <code>github.io</code> host after the first deploy.
            </li>
          </ol>
          <Command>{`npx firebase login
npm run deploy:rules`}</Command>
          {states.firebase ? (
            <p className="ok">Firebase keys are loaded{id ? ` for ${id}` : ""}.</p>
          ) : (
            <p className="note">Keys are still the placeholders. Setup has not been saved, or the dev server needs a restart.</p>
          )}
        </Step>

        <Step number="3" title="Turn on Google Analytics" state={states.analytics ? "ready" : "todo"}>
          <p>
            This is Google Analytics 4, through the Firebase measurement ID. Page views are recorded
            on their own. Sign-in, checkout, and a completed payment are recorded too.
          </p>
          <ol className="substeps">
            <li>
              <a href={`${consoleBase}/settings/integrations`} target="_blank" rel="noreferrer">
                Enable Google Analytics
              </a>{" "}
              on this Firebase project if it is not already on.
            </li>
            <li>
              Project settings → Your apps → the web app. Copy <code>measurementId</code> (
              <code>G-...</code>) into <code>npm run setup</code>, then restart <code>npm run dev</code>.
            </li>
          </ol>
          <p className="note">
            {measurementId()
              ? `Measurement ID ${measurementId()} is loaded.`
              : "No measurement ID yet."}{" "}
            From a page, call <code>logAnalyticsEvent("tool_click")</code> from{" "}
            <code>src/analytics.js</code>.
          </p>
          <button
            type="button"
            className="primary"
            disabled={!isAnalyticsConfigured()}
            onClick={async () => {
              setAnalyticsError("");
              setAnalyticsNote("");
              const sent = await logAnalyticsEvent("setup_check");
              if (!sent) {
                setAnalyticsError("Analytics did not start. Check the measurement ID and restart the dev server.");
                return;
              }
              setAnalyticsNote("Sent setup_check. In Analytics, open Realtime. It can take a minute to appear.");
              setCheck("analytics", true);
            }}
          >
            Send a test event
          </button>
          {analyticsNote ? <p className="ok">{analyticsNote}</p> : null}
          {analyticsError ? <p className="error">{analyticsError}</p> : null}
        </Step>

        <Step number="4" title="Sign in with Google" state={states.google ? "ready" : "todo"}>
          <p>
            If Google says the app is not verified, open the linked Cloud project, go to the OAuth
            consent screen, and add your own Google account as a test user.
          </p>
          {user ? (
            <p className="ok">Signed in as {user.email}.</p>
          ) : (
            <button
              type="button"
              className="google"
              disabled={!firebaseReady || authBusy}
              onClick={async () => {
                setAuthBusy(true);
                setAuthError("");
                try {
                  await signInWithGoogle();
                  void logAnalyticsEvent("login", { method: "google" });
                } catch (error) {
                  setAuthError(readableAuthError(error));
                  setAuthBusy(false);
                }
              }}
            >
              {authBusy ? "Waiting for Google…" : "Continue with Google"}
            </button>
          )}
          {authError ? <p className="error">{authError}</p> : null}
          {profileError ? (
            <p className="error">
              Signed in, but Firestore rejected the profile. Deploy the rules, then try again. {profileError}
            </p>
          ) : null}
        </Step>

        <Step number="5" title="Write to Firestore" state={states.firestore ? "ready" : "todo"}>
          <p>
            This writes a private note at <code>users/{"{email}"}/notes</code> and reads it back.
            Visitors cannot read it. Deploy the rules in step 2 first.
          </p>
          <button type="button" className="primary" disabled={!user} onClick={saveNote}>
            Save a test note
          </button>
          {noteState ? <p className="ok">{noteState}</p> : null}
          {noteError ? <p className="error">{noteError}</p> : null}
          {!user ? <p className="note">Sign in first. The button stays off until then.</p> : null}
        </Step>

        <Step number="6" title="Deploy Cloud Functions" state={states.functions ? "ready" : "todo"}>
          <p>
            Checkout, the billing portal, and the webhook run here. The deploy script copies the
            functions off Desktop first so iCloud does not stall the upload.
          </p>
          <Command>npm run deploy:functions</Command>
          {functionUrl ? (
            <p className="note">
              Health URL: <a href={`${functionUrl}/health`}>{functionUrl}/health</a>
            </p>
          ) : null}
          {health?.ok ? (
            <p className="ok">
              Functions responded. Stripe mode is {health.mode}
              {health.stripe ? ", and the secret key is present." : ". The Stripe secret key is still missing."}
            </p>
          ) : functionUrl ? (
            <p className="error">{healthError || "Waiting for a health response…"}</p>
          ) : (
            <p className="note">The health check starts after the Firebase project id is in .env.</p>
          )}
          <p className="note">
            A 403 means the function deployed but the browser may not call it. The deploy script
            tries to allow public invoke. If it could not, run the gcloud command it prints.
          </p>
        </Step>

        <Step number="7" title="Turn on Stripe" state={states.stripe ? "ready" : "todo"}>
          <p>
            Stay in test mode until a real domain is serving the site. Card{" "}
            <code>4242 4242 4242 4242</code>, any future date, any CVC.
          </p>
          <ol className="substeps">
            <li>
              <a href="https://dashboard.stripe.com/test/apikeys" target="_blank" rel="noreferrer">
                Copy the test keys
              </a>{" "}
              into <code>npm run setup</code>. The secret key belongs in <code>functions/.env</code> only.
            </li>
            <li>
              <a href="https://dashboard.stripe.com/test/products" target="_blank" rel="noreferrer">
                Create one product
              </a>{" "}
              with a ${site.monthlyPriceUsd}/month price and a ${site.yearlyPriceUsd}/year price.
              Copy the <code>price_</code> ids.
            </li>
            <li>
              <a href="https://dashboard.stripe.com/test/settings/billing/portal" target="_blank" rel="noreferrer">
                Activate the customer portal
              </a>
              , or “Manage billing” will fail.
            </li>
            <li>
              After functions deploy, add a webhook endpoint
              {functionUrl ? (
                <>
                  {" "}
                  at <code>{functionUrl}/stripeWebhook</code>
                </>
              ) : null}
              . Events: <code>checkout.session.completed</code>,{" "}
              <code>customer.subscription.created</code>, <code>customer.subscription.updated</code>,{" "}
              <code>customer.subscription.deleted</code>, <code>invoice.payment_succeeded</code>,{" "}
              <code>invoice.payment_failed</code>. Paste the <code>whsec_</code> secret and deploy
              functions again.
            </li>
          </ol>
          <p className="note">
            This app is in {isLocalTesting() ? "test" : "live"} mode
            {isStripeConfigured() ? ", and the publishable key is loaded." : "."}
          </p>
          {user && isStripeConfigured() ? (
            <button
              type="button"
              className="primary"
              disabled={stripeBusy || !states.functions}
              onClick={async () => {
                setStripeBusy(true);
                setStripeError("");
                try {
                  await startCheckout(user.email, "month");
                } catch (error) {
                  setStripeError(error.message);
                  setStripeBusy(false);
                }
              }}
            >
              {stripeBusy ? "Opening Stripe…" : "Start a test checkout"}
            </button>
          ) : (
            <p className="note">Sign in, deploy functions, and save the Stripe keys before the test charge.</p>
          )}
          {stripeError ? <p className="error">{stripeError}</p> : null}
        </Step>

        <Step number="8" title="Deploy to GitHub Pages" state={states.github ? "ready" : "todo"}>
          <p>
            <code>npm run deploy</code> builds the site and pushes the <code>gh-pages</code> branch.
            In the repo, Settings → Pages → Branch <code>gh-pages</code> → folder <code>/ (root)</code>.
          </p>
          <Command>{`git init
git add .
git commit -m "Initial site"
gh repo create ${repo} --public --source=. --remote=origin --push
npm run deploy`}</Command>
          <p className="note">
            Add the GitHub Pages host to Firebase authorized domains before you test login there.
            The build writes <code>404.html</code> so client-side routes survive a refresh.
          </p>
          <button type="button" onClick={() => setCheck("github", true)}>
            {states.github ? "Marked deployed" : "I deployed it"}
          </button>
          {site.githubRepo ? (
            <p className="note">
              <a href={`https://github.com/${site.githubRepo}/settings/pages`} target="_blank" rel="noreferrer">
                Open Pages settings
              </a>
            </p>
          ) : null}
        </Step>

        <Step
          number="9"
          title="Attach a domain"
          state={onDomain || checks.domain ? "ready" : checks.domainSkipped ? "skipped" : "todo"}
        >
          {site.domain ? (
            <>
              <p>
                <code>public/CNAME</code> is set to <code>{site.domain}</code>. In GitHub Pages,
                put that same host in Custom domain, then wait for DNS and turn on Enforce HTTPS.
              </p>
              <p>At the registrar, for the apex domain:</p>
              <Command>{`A  185.199.108.153
A  185.199.109.153
A  185.199.110.153
A  185.199.111.153`}</Command>
              <p>
                For <code>www</code>, a CNAME to <code>you.github.io</code>. Use the host that
                matches <code>{site.domain}</code>. Then add that host under Firebase authorized
                domains.
              </p>
            </>
          ) : (
            <p>
              A domain can wait until the niche is worth a name. Run <code>npm run setup</code>{" "}
              again when you have one. It writes <code>public/CNAME</code>.
            </p>
          )}
          <div className="row">
            <button type="button" onClick={() => setCheck("domain", true)}>
              DNS is pointed
            </button>
            <button type="button" className="text" onClick={() => setCheck("domainSkipped", true)}>
              Skip until this site has readers
            </button>
          </div>
        </Step>
      </ol>

      <div className="done-row">
        <Link to="/" className="button primary">
          Open the blank page
        </Link>
        <p className="note">
          When the banner on the home page is gone, edit <code>src/pages/HomePage.jsx</code>.
          The next site is <code>npm run clone -- ../next-site-name</code>.
        </p>
      </div>
    </main>
  );
}
