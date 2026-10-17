/**
 * Stripe + Firestore functions for one site.
 *
 *   health
 *   createCheckoutSession
 *   createPortalSession
 *   getSubscriptionDetails
 *   confirmCheckoutSession
 *   stripeWebhook
 *   cancelSubscription
 *
 * Secrets live in functions/.env. Firebase loads that file on deploy.
 * Webhook URL:
 *   https://us-central1-PROJECT_ID.cloudfunctions.net/stripeWebhook
 */

const functions = require("firebase-functions");
const admin = require("firebase-admin");

const regional = functions.region("us-central1").runWith({ invoker: "public" });

const ensureAdmin = () => {
  if (!admin.apps.length) admin.initializeApp();
};

const getDb = () => {
  ensureAdmin();
  return admin.firestore();
};

const isLocalTesting = () =>
  String(process.env.LOCAL_TESTING || "").toLowerCase() === "true";

const stripeSecretKey = () => {
  const key = isLocalTesting()
    ? process.env.STRIPE_TEST_SECRET_KEY
    : process.env.STRIPE_LIVE_SECRET_KEY;
  if (!key || key.includes("...")) {
    throw new Error(
      isLocalTesting()
        ? "Missing STRIPE_TEST_SECRET_KEY in functions/.env (LOCAL_TESTING=true)."
        : "Missing STRIPE_LIVE_SECRET_KEY in functions/.env (LOCAL_TESTING=false).",
    );
  }
  return key;
};

const stripeWebhookSecret = () => {
  const secret = isLocalTesting()
    ? process.env.STRIPE_TEST_WEBHOOK_SECRET
    : process.env.STRIPE_LIVE_WEBHOOK_SECRET;
  if (!secret || secret.includes("...")) {
    throw new Error("Missing Stripe webhook secret in functions/.env.");
  }
  return secret;
};

let stripeClient = null;
let stripeClientMode = null;
const getStripe = () => {
  const mode = isLocalTesting() ? "test" : "live";
  if (!stripeClient || stripeClientMode !== mode) {
    stripeClient = require("stripe")(stripeSecretKey());
    stripeClientMode = mode;
  }
  return stripeClient;
};

const priceMap = () => ({
  ...(process.env.STRIPE_TEST_PRICE_ID
    ? { [process.env.STRIPE_TEST_PRICE_ID]: "subscribed" }
    : {}),
  ...(process.env.STRIPE_TEST_YEARLY_PRICE_ID
    ? { [process.env.STRIPE_TEST_YEARLY_PRICE_ID]: "subscribed" }
    : {}),
  ...(process.env.STRIPE_LIVE_PRICE_ID
    ? { [process.env.STRIPE_LIVE_PRICE_ID]: "subscribed" }
    : {}),
  ...(process.env.STRIPE_LIVE_YEARLY_PRICE_ID
    ? { [process.env.STRIPE_LIVE_YEARLY_PRICE_ID]: "subscribed" }
    : {}),
});

const ACCESS = new Set(["active", "trialing", "past_due"]);

const isAccessGrantingStatus = (status) =>
  ACCESS.has(String(status || "").toLowerCase());

const planFromSubscription = (subscription) => {
  if (!isAccessGrantingStatus(subscription?.status)) return "free";
  const priceId = subscription.items?.data?.[0]?.price?.id;
  return priceMap()[priceId] || "subscribed";
};

const isCheckoutPaid = (session) => session?.payment_status === "paid";

const looksSubscribed = (status) => {
  const value = String(status || "free").toLowerCase();
  return value === "subscribed" || value === "basic" || value === "pro";
};

const cors = (req, res) => {
  res.set("Access-Control-Allow-Origin", "*");
  res.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.set("Access-Control-Allow-Headers", "Content-Type, Authorization");
  if (req.method === "OPTIONS") {
    res.status(204).send("");
    return true;
  }
  return false;
};

const fail = (res, error) => {
  const status = error.status || 500;
  console.error(error);
  res.status(status).json({ error: error.message || "Request failed." });
};

async function requireUser(req, expectedEmail) {
  ensureAdmin();
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : "";
  if (!token) {
    const error = new Error("Missing auth token. Sign in and try again.");
    error.status = 401;
    throw error;
  }
  const decoded = await admin.auth().verifyIdToken(token);
  const authEmail = String(decoded.email || "").trim().toLowerCase();
  const target = String(expectedEmail || "").trim().toLowerCase();
  if (!authEmail || authEmail !== target) {
    const error = new Error("This sign-in does not match that account.");
    error.status = 403;
    throw error;
  }
  return authEmail;
}

async function getStatus(email) {
  const snap = await getDb().collection("users").doc(email).get();
  return snap.exists ? snap.data()?.subscriptionStatus || "free" : "free";
}

async function setStatus(email, status) {
  const normalized = String(email || "").trim().toLowerCase();
  if (!normalized) throw new Error("Missing email.");
  await getDb()
    .collection("users")
    .doc(normalized)
    .set(
      {
        email: normalized,
        subscriptionStatus: status,
        subscriptionUpdatedAt: admin.firestore.FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
}

async function emailFromSubscription(subscription) {
  let email = subscription.metadata?.email || subscription.customer_email;
  if (!email && subscription.customer) {
    const customer = await getStripe().customers.retrieve(subscription.customer);
    email = customer.email;
  }
  return String(email || "").trim().toLowerCase();
}

async function findPaidSubscription(email, extraCustomerId) {
  const customers = await getStripe().customers.list({
    email: String(email || "").trim().toLowerCase(),
    limit: 10,
  });
  const customerIds = customers.data.map((customer) => customer.id);
  if (extraCustomerId && !customerIds.includes(extraCustomerId)) {
    customerIds.push(extraCustomerId);
  }
  for (const customerId of customerIds) {
    const subscriptions = await getStripe().subscriptions.list({
      customer: customerId,
      status: "all",
      limit: 20,
    });
    const match = subscriptions.data.find((sub) =>
      isAccessGrantingStatus(sub.status),
    );
    if (match) return match;
  }
  return null;
}

async function syncPlan(email, extraCustomerId) {
  const withAccess = await findPaidSubscription(email, extraCustomerId);
  await setStatus(
    email,
    withAccess ? planFromSubscription(withAccess) : "free",
  );
}

exports.health = regional.https.onRequest((req, res) => {
  if (cors(req, res)) return;
  const hasTest = Boolean(
    process.env.STRIPE_TEST_SECRET_KEY &&
      !String(process.env.STRIPE_TEST_SECRET_KEY).includes("..."),
  );
  const hasLive = Boolean(
    process.env.STRIPE_LIVE_SECRET_KEY &&
      !String(process.env.STRIPE_LIVE_SECRET_KEY).includes("..."),
  );
  res.json({
    ok: true,
    service: "functions",
    mode: isLocalTesting() ? "test" : "live",
    stripe: isLocalTesting() ? hasTest : hasLive,
  });
});

exports.createCheckoutSession = regional.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const { priceId, successUrl, cancelUrl } = req.body || {};
    if (!email || !priceId) {
      return res.status(400).json({ error: "Missing email or priceId." });
    }
    await requireUser(req, email);
    if (String(priceId).startsWith("prod_")) {
      return res.status(400).json({
        error: "Use a Stripe Price ID (price_...), not a Product ID (prod_...).",
      });
    }

    await getDb().collection("users").doc(email).set(
      { email },
      { merge: true },
    );

    const customers = await getStripe().customers.list({ email, limit: 1 });
    const sessionParams = {
      mode: "subscription",
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: successUrl,
      cancel_url: cancelUrl,
      metadata: { email, priceId },
      subscription_data: { metadata: { email } },
    };
    if (customers.data[0]) sessionParams.customer = customers.data[0].id;
    else sessionParams.customer_email = email;

    const session = await getStripe().checkout.sessions.create(sessionParams);
    res.json({ sessionId: session.id, url: session.url });
  } catch (error) {
    const message =
      error.type === "StripeInvalidRequestError" &&
      error.param === "line_items[0][price]"
        ? `${error.message} The Price ID has to be a recurring price from the same Stripe mode as LOCAL_TESTING.`
        : error.message;
    fail(res, Object.assign(error, { message }));
  }
});

exports.createPortalSession = regional.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Missing email." });
    await requireUser(req, email);

    const customers = await getStripe().customers.list({ email, limit: 1 });
    if (!customers.data.length) {
      return res.status(404).json({ error: "No Stripe customer for this account yet." });
    }
    const session = await getStripe().billingPortal.sessions.create({
      customer: customers.data[0].id,
      return_url: req.body?.returnUrl,
    });
    res.json({ url: session.url });
  } catch (error) {
    fail(res, error);
  }
});

exports.getSubscriptionDetails = regional.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Missing email." });
    await requireUser(req, email);

    const withAccess = await findPaidSubscription(email);
    const current = await getStatus(email);
    if (!withAccess) {
      if (looksSubscribed(current)) await setStatus(email, "free");
      return res.json({
        status: "free",
        nextRenewalAt: null,
        cancelAtPeriodEnd: false,
        interval: null,
      });
    }

    const status = planFromSubscription(withAccess);
    if (status !== current) await setStatus(email, status);
    res.json({
      status,
      nextRenewalAt: withAccess.current_period_end
        ? new Date(withAccess.current_period_end * 1000).toISOString()
        : null,
      cancelAtPeriodEnd: Boolean(withAccess.cancel_at_period_end),
      interval: withAccess.items?.data?.[0]?.price?.recurring?.interval || null,
    });
  } catch (error) {
    fail(res, error);
  }
});

exports.confirmCheckoutSession = regional.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    const sessionId = req.body?.sessionId;
    if (!email || !sessionId) {
      return res.status(400).json({ error: "Missing email or sessionId." });
    }
    await requireUser(req, email);

    const session = await getStripe().checkout.sessions.retrieve(sessionId);
    const sessionEmail = String(
      session.customer_email ||
        session.customer_details?.email ||
        session.metadata?.email ||
        "",
    )
      .trim()
      .toLowerCase();
    if (!sessionEmail || sessionEmail !== email) {
      return res.status(403).json({ error: "Checkout session does not match this account." });
    }
    if (!isCheckoutPaid(session)) {
      return res.status(400).json({ error: "Checkout is not paid yet." });
    }
    if (session.subscription) {
      const subscription = await getStripe().subscriptions.retrieve(session.subscription);
      if (!isAccessGrantingStatus(subscription.status)) {
        return res.status(400).json({ error: "Payment did not start a subscription." });
      }
    }
    await setStatus(email, "subscribed");
    res.json({ status: "subscribed" });
  } catch (error) {
    fail(res, error);
  }
});

exports.stripeWebhook = regional.https.onRequest(async (req, res) => {
  const signature = req.headers["stripe-signature"];
  let event;
  try {
    event = getStripe().webhooks.constructEvent(
      req.rawBody || req.body,
      signature,
      stripeWebhookSecret(),
    );
  } catch (error) {
    console.error("Webhook signature failed:", error.message);
    return res.status(400).send(`Webhook Error: ${error.message}`);
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        const email =
          session.metadata?.email ||
          session.customer_email ||
          session.customer_details?.email;
        if (email && isCheckoutPaid(session)) {
          await setStatus(email, "subscribed");
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted": {
        const email = await emailFromSubscription(event.data.object);
        if (email) await syncPlan(email, event.data.object.customer);
        break;
      }
      case "invoice.payment_succeeded":
      case "invoice.payment_failed": {
        const subscriptionId = event.data.object.subscription;
        if (!subscriptionId) break;
        const subscription = await getStripe().subscriptions.retrieve(subscriptionId);
        const email = await emailFromSubscription(subscription);
        if (email) await syncPlan(email, subscription.customer);
        break;
      }
      default:
        break;
    }
    res.json({ received: true });
  } catch (error) {
    fail(res, error);
  }
});

exports.cancelSubscription = regional.https.onRequest(async (req, res) => {
  if (cors(req, res)) return;
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    if (!email) return res.status(400).json({ error: "Missing email." });
    await requireUser(req, email);

    const customers = await getStripe().customers.list({ email, limit: 10 });
    let updated = null;
    for (const customer of customers.data) {
      const subscriptions = await getStripe().subscriptions.list({
        customer: customer.id,
        status: "all",
        limit: 20,
      });
      for (const subscription of subscriptions.data) {
        if (subscription.status !== "active" && subscription.status !== "trialing") {
          continue;
        }
        updated = await getStripe().subscriptions.update(subscription.id, {
          cancel_at_period_end: true,
        });
        break;
      }
      if (updated) break;
    }
    if (!updated) {
      return res.status(404).json({ error: "No active subscription to cancel." });
    }
    res.json({
      status: "subscribed",
      cancelAtPeriodEnd: true,
      nextRenewalAt: updated.current_period_end
        ? new Date(updated.current_period_end * 1000).toISOString()
        : null,
    });
  } catch (error) {
    fail(res, error);
  }
});
