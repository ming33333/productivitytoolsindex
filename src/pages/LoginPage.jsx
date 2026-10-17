import { useState } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { logAnalyticsEvent } from "../analytics";
import { readableAuthError, sendPasswordReset, setEmailOptIn, signInWithEmail, signInWithGoogle, signUpWithEmail } from "../auth";
import { firebaseInitError, firebaseReady } from "../firebase";
import LpFrame from "../landing/LpFrame";
import "../landing/landing.css";

function GoogleMark() {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path fill="#4285F4" d="M23.49 12.27c0-.79-.07-1.54-.2-2.27H12v4.3h6.46a5.52 5.52 0 0 1-2.4 3.62v3h3.88c2.26-2.08 3.55-5.15 3.55-8.65Z" />
      <path fill="#34A853" d="M12 24c3.24 0 5.96-1.07 7.95-2.9l-3.88-3c-1.08.72-2.47 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.28v3.09A12 12 0 0 0 12 24Z" />
      <path fill="#FBBC05" d="M5.27 14.3A7.2 7.2 0 0 1 4.89 12c0-.8.14-1.57.38-2.3V6.61H1.28A12 12 0 0 0 0 12c0 1.94.46 3.77 1.28 5.39l3.99-3.09Z" />
      <path fill="#EA4335" d="M12 4.75c1.77 0 3.36.61 4.61 1.8l3.45-3.45C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.69 1.28 6.61l3.99 3.09C6.22 6.86 8.87 4.75 12 4.75Z" />
    </svg>
  );
}

export default function LoginPage({ user }) {
  const location = useLocation();
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [creating, setCreating] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [emailOptIn, setEmailList] = useState(false);
  const from = location.state?.from || "/account";

  if (user) return <Navigate to={from} replace />;

  return (
    <LpFrame user={user}>
      <div className="lp1-stage">
        <div className="lp1-search">
      <h1>{creating ? "Create account" : "Sign in"}</h1>
      <p>Sign in to open your profile and add an app to the directory.</p>
      {firebaseInitError ? <p className="error">{firebaseInitError}</p> : null}
      {!firebaseReady ? (
        <p className="error">Firebase keys are not in .env yet. Run npm run setup, then restart npm run dev.</p>
      ) : null}
      <form
        className="lp-auth"
        onSubmit={async (event) => {
          event.preventDefault();
          setBusy(true);
          setError("");
          setNotice("");
          try {
            if (creating) {
              await signUpWithEmail(email, password);
              await setEmailOptIn(email, emailOptIn);
              void logAnalyticsEvent("sign_up", { method: "password" });
            } else {
              await signInWithEmail(email, password);
              void logAnalyticsEvent("login", { method: "password" });
            }
          } catch (err) {
            setError(readableAuthError(err));
            setBusy(false);
          }
        }}
      >
        <label className="lp-field">
          <span>Email</span>
          <input
            type="email"
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            placeholder="you@example.com"
            required
          />
        </label>
        <label className="lp-field">
          <span>Password</span>
          <input
            type="password"
            autoComplete={creating ? "new-password" : "current-password"}
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="At least 6 characters"
            required
          />
        </label>
        {creating ? (
          <label className="lp-check">
            <input
              type="checkbox"
              checked={emailOptIn}
              onChange={(event) => setEmailList(event.target.checked)}
            />
            Email me, and get 1 free day on the front page
          </label>
        ) : null}
        <button type="submit" className="lp-add" disabled={!firebaseReady || busy}>
          {busy ? "Please wait…" : creating ? "Create account" : "Sign in"}
        </button>
      </form>
      <div className="lp-auth-links">
        <button
          type="button"
          className="lp1-nav"
          onClick={() => {
            setCreating((current) => !current);
            setError("");
            setNotice("");
          }}
        >
          {creating ? "Already have an account" : "Create an account"}
        </button>
        {creating ? null : (
          <button
            type="button"
            className="lp1-nav"
            disabled={!firebaseReady || busy}
            onClick={async () => {
              setBusy(true);
              setError("");
              setNotice("");
              try {
                await sendPasswordReset(email);
                setNotice("Check that inbox for a link to reset the password.");
              } catch (err) {
                setError(readableAuthError(err));
              } finally {
                setBusy(false);
              }
            }}
          >
            Forgot password
          </button>
        )}
      </div>
      <button
        type="button"
        className="google"
        disabled={!firebaseReady || busy}
        onClick={async () => {
          setBusy(true);
          setError("");
          setNotice("");
          try {
            await signInWithGoogle();
            void logAnalyticsEvent("login", { method: "google" });
          } catch (err) {
            setError(readableAuthError(err));
            setBusy(false);
          }
        }}
      >
        <GoogleMark />
        {busy ? "Waiting for Google…" : "Continue with Google"}
      </button>
      {notice ? <p className="lp-note">{notice}</p> : null}
      {error ? <p className="lp-form-error">{error}</p> : null}
        </div>
      </div>
    </LpFrame>
  );
}
