export function envValue(key) {
  return import.meta.env[key] || "";
}

export function looksReal(value) {
  if (!value) return false;
  const text = String(value);
  if (text.includes("...")) return false;
  if (text.startsWith("your_")) return false;
  if (text.includes("your_project")) return false;
  if (text === "your-project-id") return false;
  return true;
}

export function isLocalTesting() {
  return String(import.meta.env.LOCAL_TESTING || "true").toLowerCase() !== "false";
}

export function isFirebaseConfigured() {
  return (
    looksReal(envValue("REACT_APP_FIREBASE_API_KEY")) &&
    looksReal(envValue("REACT_APP_FIREBASE_PROJECT_ID"))
  );
}

export function projectId() {
  const value = envValue("REACT_APP_FIREBASE_PROJECT_ID");
  return looksReal(value) ? value : "";
}

export function measurementId() {
  const value = envValue("REACT_APP_FIREBASE_MEASUREMENT_ID");
  return looksReal(value) && value.startsWith("G-") ? value : "";
}

export function isAnalyticsConfigured() {
  return Boolean(measurementId());
}

export function publishableKey() {
  return isLocalTesting()
    ? envValue("REACT_APP_STRIPE_TEST_PUBLISHABLE_KEY")
    : envValue("REACT_APP_STRIPE_LIVE_PUBLISHABLE_KEY");
}

export function priceId(interval = "month") {
  const yearly = String(interval).toLowerCase() === "year";
  if (isLocalTesting()) {
    return yearly
      ? envValue("REACT_APP_STRIPE_TEST_YEARLY_PRICE_ID")
      : envValue("REACT_APP_STRIPE_TEST_PRICE_ID");
  }
  return yearly
    ? envValue("REACT_APP_STRIPE_LIVE_YEARLY_PRICE_ID")
    : envValue("REACT_APP_STRIPE_LIVE_PRICE_ID");
}

export function isStripeConfigured() {
  const key = publishableKey();
  const prefix = isLocalTesting() ? "pk_test_" : "pk_live_";
  return looksReal(key) && key.startsWith(prefix) && looksReal(priceId("month"));
}

export function functionsBaseUrl() {
  const override = envValue("REACT_APP_CLOUD_FUNCTIONS_URL");
  if (override) return override.replace(/\/$/, "");
  const id = projectId();
  if (!id) return "";
  return `https://us-central1-${id}.cloudfunctions.net`;
}
