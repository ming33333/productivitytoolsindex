import { loadStripe } from "@stripe/stripe-js";
import { logAnalyticsEvent } from "./analytics";
import { auth } from "./firebase";
import {
  functionsBaseUrl,
  isLocalTesting,
  priceId,
  publishableKey,
} from "./env";

let stripePromise = null;

async function authHeaders() {
  const headers = { "Content-Type": "application/json" };
  if (auth?.currentUser) {
    headers.Authorization = `Bearer ${await auth.currentUser.getIdToken()}`;
  }
  return headers;
}

async function postFunction(name, body) {
  const base = functionsBaseUrl();
  if (!base) {
    throw new Error("Cloud Functions URL is not set. Finish Firebase setup first.");
  }
  const response = await fetch(`${base}/${name}`, {
    method: "POST",
    headers: await authHeaders(),
    body: JSON.stringify(body),
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(data.error || `The ${name} function returned ${response.status}.`);
  }
  return data;
}

function appUrl(path) {
  const route = path.startsWith("/") ? path : `/${path}`;
  const base = import.meta.env.BASE_URL.replace(/\/$/, "");
  return `${window.location.origin}${base}${route}`;
}

export function isSubscribed(status) {
  const value = String(status || "free").toLowerCase();
  return value === "subscribed" || value === "basic" || value === "pro";
}

export function planLabel(status) {
  return isSubscribed(status) ? "Subscribed" : "Free";
}

export async function startCheckout(email, interval = "month") {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) throw new Error("Sign in before subscribing.");
  const selectedPrice = priceId(interval);
  if (!selectedPrice || !selectedPrice.startsWith("price_")) {
    throw new Error(
      isLocalTesting()
        ? "Missing a test Price ID. Run npm run setup and paste the price_ id."
        : "Missing a live Price ID. Stripe is in live mode.",
    );
  }

  void logAnalyticsEvent("begin_checkout", {
    plan_interval: String(interval).toLowerCase() === "year" ? "year" : "month",
  });

  const data = await postFunction("createCheckoutSession", {
    email: normalized,
    priceId: selectedPrice,
    successUrl: appUrl("/billing/success?session_id={CHECKOUT_SESSION_ID}"),
    cancelUrl: appUrl("/billing/cancel"),
  });

  if (data.url) {
    window.location.assign(data.url);
    return;
  }

  const key = publishableKey();
  if (!key) throw new Error("Missing the Stripe publishable key.");
  if (!stripePromise) stripePromise = loadStripe(key);
  const stripe = await stripePromise;
  const result = await stripe.redirectToCheckout({ sessionId: data.sessionId });
  if (result?.error) throw result.error;
}

export function openBillingPortal(email) {
  return postFunction("createPortalSession", {
    email: String(email || "").toLowerCase(),
    returnUrl: appUrl("/account"),
  }).then((data) => {
    window.location.assign(data.url);
  });
}

export function getSubscriptionDetails(email) {
  return postFunction("getSubscriptionDetails", {
    email: String(email || "").toLowerCase(),
  });
}

export function confirmCheckout(email, sessionId) {
  return postFunction("confirmCheckoutSession", {
    email: String(email || "").toLowerCase(),
    sessionId,
  });
}

export function cancelAtPeriodEnd(email) {
  return postFunction("cancelSubscription", {
    email: String(email || "").toLowerCase(),
  });
}

export async function pingFunctions() {
  const base = functionsBaseUrl();
  if (!base) throw new Error("No functions URL yet.");
  const response = await fetch(`${base}/health`);
  const data = await response.json().catch(() => ({}));
  if (!response.ok || !data.ok) {
    throw new Error(data.error || `Health check returned ${response.status}.`);
  }
  return data;
}
