import { getAnalytics, initializeAnalytics, isSupported, logEvent } from "firebase/analytics";
import { measurementId } from "./env";
import { firebaseApp } from "./firebase";

let analytics = null;
let ready = null;

function start() {
  if (ready) return ready;
  if (!firebaseApp || !measurementId() || typeof window === "undefined") {
    ready = Promise.resolve(null);
    return ready;
  }
  ready = isSupported()
    .then((supported) => {
      if (!supported) return null;
      try {
        analytics = initializeAnalytics(firebaseApp, {
          config: { send_page_view: false },
        });
      } catch {
        analytics = getAnalytics(firebaseApp);
      }
      return analytics;
    })
    .catch(() => null);
  return ready;
}

/** Log a Google Analytics 4 event. Returns false when Analytics is not configured. */
export async function logAnalyticsEvent(name, params = {}) {
  const instance = analytics || (await start());
  if (!instance) return false;
  logEvent(instance, name, params);
  return true;
}

export function logPageView(path) {
  const page = path || (typeof window === "undefined" ? "/" : window.location.pathname);
  return logAnalyticsEvent("page_view", {
    page_path: String(page).slice(0, 100),
    page_title: typeof document === "undefined" ? undefined : document.title,
    page_location: typeof window === "undefined" ? undefined : window.location.href,
  });
}
