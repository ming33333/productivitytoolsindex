import { useEffect, useRef, useState } from "react";
import { addDoc, onSnapshot, query, serverTimestamp, updateDoc, where } from "firebase/firestore";
import { bookingsFromAd, bookFreeDay, cancelBooking, dateFromKey, dateKey, latestUserDay } from "../ads";
import { restoreUnusedCredit, setEmailOptIn as writeEmailOptIn, visibleCredits } from "../auth";
import { adsCollection, entriesCollection, entryDoc, freeAdDoc, newsletterDoc, userDoc } from "../collections";
import { db } from "../firebase";
import { iconFileError, uploadAppIcon } from "../icons";
import { isStripeConfigured } from "../env";
import AppIcon from "../landing/AppIcon";
import LpFrame from "../landing/LpFrame";
import "../landing/landing.css";
import { site } from "../site";
import {
  cancelAtPeriodEnd,
  getSubscriptionDetails,
  isSubscribed,
  openBillingPortal,
  planLabel,
  startCheckout,
} from "../subscription";

const categories = [
  "Tasks",
  "Notes",
  "Calendar",
  "Focus",
  "Habits",
  "Writing",
  "Meetings",
  "Inbox",
  "Files",
  "Research",
  "Other",
];

const emptyApp = {
  name: "",
  url: "",
  category: "Tasks",
  summary: "",
  description: "",
  features: "",
};

function wordCount(value) {
  const text = String(value || "").trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

function Overlay({ title, onClose, children, compact = false }) {
  useEffect(() => {
    const onKey = (event) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="lp-overlay" role="dialog" aria-modal="true" aria-label={title}>
      <button type="button" className="lp-overlay-backdrop" aria-label="Close" onClick={onClose} />
      <div className={compact ? "lp-overlay-card lp-overlay-compact" : "lp-overlay-card"}>
        <div className="lp-overlay-top">
          <h2>{title}</h2>
          <button type="button" className="lp-ghost" onClick={onClose}>
            Close
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function cleanUrl(value) {
  const text = value.trim();
  const withProtocol = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  const url = new URL(withProtocol);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Use an http or https link.");
  }
  return url.toString();
}

export default function AccountPage({ user }) {
  const email = user.email?.toLowerCase() || "";
  const [status, setStatus] = useState("free");
  const [details, setDetails] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState("");
  const [apps, setApps] = useState([]);
  const [draft, setDraft] = useState(emptyApp);
  const [formError, setFormError] = useState("");
  const [notice, setNotice] = useState(null);
  const [editingId, setEditingId] = useState("");
  const [keptIcon, setKeptIcon] = useState("");
  const [emailOptIn, setEmailOptIn] = useState(null);
  const [mailBusy, setMailBusy] = useState(false);
  const mailBusyRef = useRef(false);
  const [mailError, setMailError] = useState("");
  const [freeDay, setFreeDay] = useState(undefined);
  const [savedBooking, setSavedBooking] = useState(undefined);
  const [adAppId, setAdAppId] = useState("");
  const [adDay, setAdDay] = useState(dateKey());
  const [adError, setAdError] = useState("");
  const [adSaved, setAdSaved] = useState(false);
  const [freeDayUsed, setFreeDayUsed] = useState(undefined);
  const [profileCredits, setProfileCredits] = useState(null);
  const [letter, setLetter] = useState(undefined);
  const [dayAds, setDayAds] = useState([]);
  const [overlay, setOverlay] = useState("");
  const [iconFile, setIconFile] = useState(null);
  const [iconPreview, setIconPreview] = useState("");
  const [descHint, setDescHint] = useState(false);
  const [psstClosed, setPsstClosed] = useState(false);
  const creditRepair = useRef(false);

  useEffect(() => {
    if (!email || !db) return undefined;
    return onSnapshot(
      userDoc(email),
      (snap) => {
        const data = snap.data() || {};
        setStatus(data.subscriptionStatus || "free");
        if (!mailBusyRef.current) setEmailOptIn(data.emailOptIn === true);
        setFreeDayUsed(data.freeDayUsed === true);
        setProfileCredits(data);
        if (!creditRepair.current && (data.emailOptIn === true || data.emailOptInAt || data.credits === 1 || (data.credits === 0 && kept))) {
          creditRepair.current = true;
          restoreUnusedCredit(email).catch(() => {
            creditRepair.current = false;
          });
        }
        setSavedBooking(
          data.freeDayDate
            ? {
                date: data.freeDayDate,
                name: data.frontPageName || "",
                entryId: data.frontPageEntryId || "",
              }
            : null,
        );
      },
      (err) => setError(err.message),
    );
  }, [email]);

  useEffect(() => {
    if (!email || !db) return undefined;
    return onSnapshot(
      newsletterDoc(email),
      (snap) => setLetter(snap.exists() ? snap.data() : null),
      (err) => {
        setLetter(null);
        setMailError(err.message || "Could not load the newsletter list.");
      },
    );
  }, [email]);

  useEffect(() => {
    if (!adAppId && apps[0]?.id) setAdAppId(apps[0].id);
  }, [apps, adAppId]);

  useEffect(() => {
    if (!db) return undefined;
    return onSnapshot(
      adsCollection(),
      (snap) => {
        setDayAds(snap.docs.flatMap((item) => bookingsFromAd({ id: item.id, ...item.data() })));
      },
      () => setDayAds([]),
    );
  }, []);

  useEffect(() => {
    if (!email || !db) return undefined;
    return onSnapshot(
      freeAdDoc(email),
      (snap) => setFreeDay(snap.exists() ? snap.data() : null),
      () => setFreeDay(null),
    );
  }, [email]);

  useEffect(() => {
    if (!email || !isStripeConfigured()) return undefined;
    let cancel = false;
    getSubscriptionDetails(email)
      .then((next) => {
        if (!cancel) {
          setDetails(next);
          if (next?.status) setStatus(next.status);
        }
      })
      .catch((err) => {
        if (!cancel) setError(err.message);
      });
    return () => {
      cancel = true;
    };
  }, [email]);

  useEffect(() => {
    if (!email || !db) return undefined;
    const appsQuery = query(entriesCollection(), where("authorEmail", "==", email));
    return onSnapshot(
      appsQuery,
      (snap) => {
        const next = snap.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
        next.sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setApps(next);
      },
      (err) => setFormError(err.message),
    );
  }, [email]);

  const run = async (label, action) => {
    setBusy(label);
    setError("");
    try {
      await action();
    } catch (err) {
      setError(err.message);
    } finally {
      setBusy("");
    }
  };

  const setField = (key) => (event) => {
    setDraft((current) => ({ ...current, [key]: event.target.value }));
  };

  const clearIconPreview = () => {
    setIconFile(null);
    setIconPreview((current) => {
      if (current) URL.revokeObjectURL(current);
      return "";
    });
  };

  const closeAppForm = () => {
    setOverlay("");
    setEditingId("");
    clearIconPreview();
  };

  const openAdd = () => {
    setEditingId("");
    setKeptIcon("");
    setDraft(emptyApp);
    setFormError("");
    setDescHint(false);
    setPsstClosed(false);
    clearIconPreview();
    setOverlay("app");
  };

  const openEdit = (app) => {
    setEditingId(app.id);
    setKeptIcon(app.iconUrl || "");
    setDraft({
      name: app.name || "",
      url: app.url || "",
      category: categories.includes(app.category) ? app.category : "Other",
      summary: app.summary || "",
      description: app.description || "",
      features: Array.isArray(app.features) ? app.features.join("\n") : String(app.features || ""),
    });
    setFormError("");
    setDescHint(false);
    setPsstClosed(false);
    clearIconPreview();
    setOverlay("app");
  };

  const addApp = async (event) => {
    event.preventDefault();
    setFormError("");
    const name = draft.name.trim();
    const summary = draft.summary.trim();
    const description = draft.description.trim();
    const words = wordCount(description);
    if (!name || !summary || !draft.url.trim()) {
      setFormError("Add a name, website, and short tagline.");
      return;
    }
    if (words < 100) {
      setFormError(`The description needs 100 words. You have ${words}.`);
      return;
    }
    const iconProblem = iconFileError(iconFile);
    if (iconProblem) {
      setFormError(iconProblem);
      return;
    }
    let url = "";
    try {
      url = cleanUrl(draft.url);
    } catch {
      setFormError("The website needs to be an http or https link.");
      return;
    }
    const features = draft.features
      .split(/\n|,/)
      .map((item) => item.trim())
      .filter(Boolean);
    const tags = [draft.category.toLowerCase()];
    const searchText = [name, draft.category, summary, description, ...features, ...tags]
      .join(" ")
      .toLowerCase();

    setBusy("app");
    try {
      const iconUrl = iconFile ? await uploadAppIcon(email, iconFile) : keptIcon;
      const fields = {
        name,
        slug: slugify(name),
        url,
        category: draft.category,
        summary,
        description,
        features,
        tags,
        searchText,
        iconUrl,
        updatedAt: serverTimestamp(),
      };
      if (editingId) {
        await updateDoc(entryDoc(editingId), fields);
      } else {
        await addDoc(entriesCollection(), {
          ...fields,
          authorEmail: email,
          authorName: user.displayName || "",
          seed: false,
          createdAt: serverTimestamp(),
        });
      }
      setDraft(emptyApp);
      setKeptIcon("");
      clearIconPreview();
      setOverlay("");
      setEditingId("");
      setDescHint(false);
      setPsstClosed(false);
      setNotice({
        title: editingId ? "Saved" : "Added",
        text: editingId ? `${name} is updated.` : `${name} can show up in search.`,
      });
    } catch (err) {
      setFormError(err.message);
    } finally {
      setBusy("");
    }
  };

  async function saveEmailOptIn(next) {
    setMailError("");
    mailBusyRef.current = true;
    setMailBusy(true);
    try {
      await writeEmailOptIn(email, next);
      setEmailOptIn(next);
      return true;
    } catch (err) {
      setMailError(err.message || "Could not update the newsletter.");
      return false;
    } finally {
      mailBusyRef.current = false;
      setMailBusy(false);
    }
  }

  const horizon = latestUserDay();
  const horizonLabel = dateFromKey(horizon).toLocaleDateString(undefined, { month: "long", day: "numeric" });
  const chosenApp = apps.find((item) => item.id === adAppId);
  const appOnDay = dayAds.some((ad) => ad.date === adDay && ad.entryId === adAppId);
  const dayFull = dayAds.filter((ad) => ad.date === adDay).length >= 4;
  const onList = emailOptIn === true || letter?.subscribed === true;
  const credits = emailOptIn === null || profileCredits === null ? null : visibleCredits(profileCredits, letter || {});
  const teaseFree = !onList && credits !== null && credits < 1;
  const freeWord = (word) => (teaseFree ? <span className="lp-rainbow">{word}</span> : word);
  const renewal = details?.nextRenewalAt
    ? new Date(details.nextRenewalAt).toLocaleDateString()
    : "";
  const showBilling = isStripeConfigured() && (isSubscribed(status) || site.monthlyPriceUsd > 0 || site.yearlyPriceUsd > 0);

  return (
    <LpFrame user={user} className="lp-profile">
      <div className="lp-profile-body">
        <div className="lp-profile-inner">
          <p className="lp-kicker">Profile</p>
          <h1>{user.displayName || "Your profile"}</h1>
          <p className="lp-email">{email}</p>

          <section className="lp-block">
            <h2>Your apps</h2>
            {apps.length === 0 ? (
              <p className="lp-note">No apps yet. Add one below and it will show up in search.</p>
            ) : (
              <ul className="lp-app-list">
                {apps.map((app) => (
                  <li key={app.id}>
                    <AppIcon src={app.iconUrl} name={app.name} />
                    <div className="lp-app-copy">
                      <p className="lp1-cat">{app.category}</p>
                      <h3>{app.name}</h3>
                      <p>{app.summary}</p>
                    </div>
                    <button type="button" className="lp-ghost" onClick={() => openEdit(app)}>
                      Edit
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lp-block">
            <h2>Add an app</h2>
            <p className="lp-note">Add a tool and it can show up in search.</p>
            <button type="button" className="lp-add" onClick={openAdd}>
              Add an app
            </button>
          </section>

          {overlay === "app" ? (
            <Overlay title={editingId ? "Edit app" : "Add an app"} onClose={closeAppForm}>
            <p className="lp-note">
              Be specific. The more you describe what the app does, and the more you name its core features, the easier it is to rank in search.
            </p>
            <form onSubmit={addApp}>
              <label className="lp-field">
                <span>Name</span>
                <input value={draft.name} onChange={setField("name")} placeholder="Sitedim" />
              </label>
              <label className="lp-field">
                <span>Website</span>
                <input value={draft.url} onChange={setField("url")} placeholder="https://example.com" inputMode="url" />
              </label>
              <label className="lp-field">
                <span>Icon</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0] || null;
                    const problem = iconFileError(file);
                    if (problem) {
                      setFormError(problem);
                      setIconFile(null);
                      setIconPreview((current) => {
                        if (current) URL.revokeObjectURL(current);
                        return "";
                      });
                      return;
                    }
                    setFormError("");
                    setIconFile(file);
                    setIconPreview((current) => {
                      if (current) URL.revokeObjectURL(current);
                      return file ? URL.createObjectURL(file) : "";
                    });
                  }}
                />
                <small>Upload a square image under 1 MB. Skip it and the icon is the app’s first letter.</small>
              </label>
              {iconPreview || keptIcon ? <AppIcon src={iconPreview || keptIcon} name={draft.name || "App"} /> : null}
              <label className="lp-field">
                <span>Category</span>
                <select value={draft.category} onChange={setField("category")}>
                  {categories.map((category) => (
                    <option key={category}>{category}</option>
                  ))}
                </select>
              </label>
              <label className="lp-field">
                <span>Tagline</span>
                <input
                  value={draft.summary}
                  onChange={setField("summary")}
                  placeholder="Blocks distracting websites during a focus session"
                />
              </label>
              <label className="lp-field">
                <span>Description</span>
                <textarea
                  rows={8}
                  value={draft.description}
                  onFocus={() => setDescHint(true)}
                  onChange={setField("description")}
                  placeholder="Who it is for, what job it does, and how someone would use it."
                />
                <small>
                  {wordCount(draft.description)} / 100 words. Write the words people would search for.
                </small>
              </label>
              {wordCount(draft.description) < 100 && !psstClosed && (descHint || wordCount(draft.description) > 0) ? (
                <div className="lp-psst">
                  <button type="button" className="lp-psst-close" aria-label="Close hint" onClick={() => setPsstClosed(true)}>
                    ×
                  </button>
                  <span className="lp-psst-label">Psst</span>
                  Writing 100 words is easier if you let{" "}
                  <a href="https://chatgpt.com" target="_blank" rel="noopener noreferrer">ChatGPT</a>
                  {" "}or{" "}
                  <a href="https://gemini.google.com" target="_blank" rel="noopener noreferrer">Gemini</a>
                  {" "}draft it. Paste the result here.
                </div>
              ) : null}
              <label className="lp-field">
                <span>Core features</span>
                <textarea
                  rows={4}
                  value={draft.features}
                  onChange={setField("features")}
                  placeholder={"Website blocker\nFocus timer\nPause that asks for a reason"}
                />
                <small>One feature per line. These are matched directly in search.</small>
              </label>
              {formError ? <p className="lp-form-error">{formError}</p> : null}
              <button type="submit" className="lp-add" disabled={busy === "app"}>
                {busy === "app" ? "Saving…" : editingId ? "Save" : "Add app"}
              </button>
            </form>
            </Overlay>
          ) : null}

          {notice ? (
            <Overlay title={notice.title} compact onClose={() => setNotice(null)}>
              <p className="lp-note">{notice.text}</p>
              <button type="button" className="lp-add" onClick={() => setNotice(null)}>
                OK
              </button>
            </Overlay>
          ) : null}

          <section className="lp-block">
            <h2>Ask for a story</h2>
            <p className="lp-note">Stories are written by the site. Request one by email.</p>
            <button type="button" className="lp-add" onClick={() => setOverlay("story")}>
              Request a story
            </button>
          </section>

          {showBilling ? (
            <section className="lp-block">
              <h2>Billing</h2>
              <p className="lp-note">
                {planLabel(status)}
                {renewal ? ` · ${details?.cancelAtPeriodEnd ? "Ends" : "Renews"} ${renewal}` : ""}
              </p>
              <div className="lp-actions">
                {!isSubscribed(status) ? (
                  <>
                    <button type="button" className="lp-add" disabled={Boolean(busy)} onClick={() => run("month", () => startCheckout(email, "month"))}>
                      {busy === "month" ? "Opening Stripe…" : `Subscribe · $${site.monthlyPriceUsd}/month`}
                    </button>
                    {site.yearlyPriceUsd > 0 ? (
                      <button type="button" className="lp-ghost" disabled={Boolean(busy)} onClick={() => run("year", () => startCheckout(email, "year"))}>
                        {busy === "year" ? "Opening Stripe…" : `Yearly · $${site.yearlyPriceUsd}`}
                      </button>
                    ) : null}
                  </>
                ) : (
                  <>
                    <button type="button" className="lp-add" disabled={Boolean(busy)} onClick={() => run("portal", () => openBillingPortal(email))}>
                      {busy === "portal" ? "Opening…" : "Manage billing"}
                    </button>
                    {!details?.cancelAtPeriodEnd ? (
                      <button
                        type="button"
                        className="lp-ghost"
                        disabled={Boolean(busy)}
                        onClick={() =>
                          run("cancel", async () => {
                            const next = await cancelAtPeriodEnd(email);
                            setDetails((current) => ({ ...current, ...next }));
                          })
                        }
                      >
                        {busy === "cancel" ? "Updating…" : "Cancel at period end"}
                      </button>
                    ) : null}
                  </>
                )}
              </div>
              {error ? <p className="lp-form-error">{error}</p> : null}
            </section>
          ) : null}

          {emailOptIn === null ? null : (
            <section className="lp-block">
              <h2>Subscribe to newsletter</h2>
              <p className="lp-note">Subscribing includes 1 {freeWord("free")} day of ad space on the front page. Unsubscribing does not remove that day if you have not booked it.</p>
              {letter?.subscribed === true ? <p className="lp-note">Saved. {email} is on the newsletter list.</p> : null}
              {onList ? (
                <button type="button" className="lp-ghost" disabled={mailBusy} onClick={() => setOverlay("unsubscribe")}>
                  {mailBusy ? "Saving…" : "Unsubscribe"}
                </button>
              ) : (
                <>
                  <button type="button" className="lp-add" disabled={mailBusy} onClick={() => saveEmailOptIn(true)}>
                    {mailBusy ? "Subscribing…" : "Subscribe"}
                  </button>
                  <p className="lp-note">One email gets one {freeWord("free")} day. Unsubscribing and subscribing again does not add another.</p>
                </>
              )}
              {mailError ? <p className="lp-form-error">{mailError}</p> : null}
            </section>
          )}

          <section className="lp-block">
            <h2>Front page</h2>
            {credits !== null ? <p className="lp-note">credit: {credits}</p> : null}
            {credits === 0 && (savedBooking || freeDay || freeDayUsed) ? (
              <p className="lp-note">A booked front-page day uses this credit. Subscribing again does not add another.</p>
            ) : null}
            <p className="lp-note">
              Up to 4 apps can share a day. A newsletter subscription includes 1 {freeWord("free")} day, and you can book it through {horizonLabel}.
            </p>
            {savedBooking === undefined || freeDay === undefined || freeDayUsed === undefined ? (
              <p className="lp-note">Loading…</p>
            ) : savedBooking || freeDay ? (
              <>
                <p className="lp-note">
                  Saved. {(savedBooking || freeDay).name || "Your app"} is booked for {(savedBooking || freeDay).date}. It shows on the front page that day.
                </p>
                {adError ? <p className="lp-form-error">{adError}</p> : null}
                <button
                  type="button"
                  className="lp-ghost"
                  disabled={busy === "ad"}
                  onClick={async () => {
                    const booking = savedBooking || freeDay;
                    if (!window.confirm(`Cancel the front page day for ${booking.name || "this app"}?`)) return;
                    setAdError("");
                    setBusy("ad");
                    try {
                      await cancelBooking({ email, day: booking.date, entryId: booking.entryId });
                      setAdSaved(false);
                    } catch (err) {
                      setAdError(err.message || "The booking could not be canceled.");
                    } finally {
                      setBusy("");
                    }
                  }}
                >
                  {busy === "ad" ? "Canceling…" : "Cancel booking"}
                </button>
              </>
            ) : freeDayUsed && credits < 1 ? (
              <p className="lp-note">Your free day has already been used. Subscribing again does not add another one.</p>
            ) : onList || credits >= 1 ? (
              <form
                onSubmit={async (event) => {
                  event.preventDefault();
                  setAdError("");
                  setAdSaved(false);
                  const app = apps.find((item) => item.id === adAppId);
                  setBusy("ad");
                  try {
                    await bookFreeDay({ email, day: adDay, app });
                    setAdSaved(true);
                  } catch (err) {
                    setAdError(err.message || "That day could not be booked.");
                  } finally {
                    setBusy("");
                  }
                }}
              >
                {apps.length === 0 ? (
                  <p className="lp-note">No app is saved on your account yet. Add one above, then come back to book the day.</p>
                ) : (
                  <>
                    <p className="lp-note">Your apps: {apps.map((app) => app.name).join(", ")}</p>
                    <label className="lp-field">
                      <span>App</span>
                      <select value={adAppId} onChange={(event) => setAdAppId(event.target.value)}>
                        <option value="">Choose an app</option>
                        {apps.map((app) => (
                          <option key={app.id} value={app.id}>
                            {app.name}
                          </option>
                        ))}
                      </select>
                    </label>
                    <label className="lp-field">
                      <span>Day</span>
                      <input
                        type="date"
                        min={dateKey()}
                        max={horizon}
                        value={adDay > horizon ? horizon : adDay}
                        onChange={(event) => setAdDay(event.target.value)}
                      />
                    </label>
                    <p className="lp-note">Book a day from today through {horizonLabel}.</p>
                    {appOnDay ? <p className="lp-form-error">{chosenApp?.name || "That app"} is already on the front page that day.</p> : null}
                    {dayFull && !appOnDay ? <p className="lp-form-error">That day already has 4 ads.</p> : null}
                    {adError ? <p className="lp-form-error">{adError}</p> : null}
                    {adSaved ? <p className="lp-note">Booked. It will show on the front page that day.</p> : null}
                    <button type="submit" className="lp-add" disabled={busy === "ad" || !adAppId || appOnDay || dayFull || adDay > horizon}>
                      {busy === "ad" ? "Booking…" : "Book this day"}
                    </button>
                  </>
                )}
              </form>
            ) : (
              <p className="lp-note">Subscribe above to claim your {freeWord("free")} day.</p>
            )}
          </section>
        </div>
      </div>
      {overlay === "story" ? (
        <Overlay title="Request a story" onClose={() => setOverlay("")}>
          <p className="lp-note">
            Stories are written by the site. Send an email to {site.supportEmail || "the site"} and include the tool, what it does, and why it belongs on the index.
          </p>
          {site.supportEmail ? (
            <a className="lp-add" href={`mailto:${site.supportEmail}?subject=${encodeURIComponent("Story request")}`}>
              Email {site.supportEmail}
            </a>
          ) : (
            <p className="lp-form-error">This site does not have an email address yet.</p>
          )}
        </Overlay>
      ) : null}
      {overlay === "unsubscribe" ? (
        <Overlay title="Unsubscribe" onClose={() => setOverlay("")}>
          <p className="lp-note">
            You will stop getting notes about the index. If you already used your free front-page day, subscribing again does not give you another one.
          </p>
          {mailError ? <p className="lp-form-error">{mailError}</p> : null}
          <button
            type="button"
            className="lp-add"
            onClick={async () => {
              const savedOptOut = await saveEmailOptIn(false);
              if (savedOptOut) setOverlay("");
            }}
          >
            Unsubscribe
          </button>
        </Overlay>
      ) : null}
    </LpFrame>
  );
}
