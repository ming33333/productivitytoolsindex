import { useEffect, useMemo, useState } from "react";
import { deleteDoc, getDoc, getDocs, onSnapshot, query, serverTimestamp, setDoc, where } from "firebase/firestore";
import { Link } from "react-router-dom";
import { ADS_PER_DAY, bookFreeDay, bookingsFromAd, cancelBooking, dateFromKey, dateKey } from "../ads";
import { addAdmin, listAdmins, removeAdmin } from "../admins";
import { grantCredits, grantedCreditCount, visibleCredits } from "../auth";
import { adsCollection, entriesCollection, newsletterCollection, newsletterDoc, postDoc, postsCollection, userDoc, usersCollection } from "../collections";
import LpFrame from "../landing/LpFrame";
import "../landing/landing.css";

const emptyStory = { title: "", body: "", published: true, slug: "" };

function bookingWhen(date, today) {
  if (date === today) return "Today";
  if (date < today) return "Past";
  return "Upcoming";
}

function bookingTitle(date) {
  const value = dateFromKey(date);
  if (Number.isNaN(value.getTime())) return date;
  return value.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 48);
}

export default function AdminPage({ user }) {
  const email = user.email?.toLowerCase() || "";
  const [admins, setAdmins] = useState([]);
  const [stories, setStories] = useState([]);
  const [slots, setSlots] = useState(null);
  const [subscribers, setSubscribers] = useState(null);
  const [optedIn, setOptedIn] = useState([]);
  const [listError, setListError] = useState("");
  const [savedDays, setSavedDays] = useState(null);
  const [bookEmail, setBookEmail] = useState("");
  const [bookApps, setBookApps] = useState([]);
  const [bookUser, setBookUser] = useState(undefined);
  const [bookAppIds, setBookAppIds] = useState([]);
  const [bookDay, setBookDay] = useState(dateKey());
  const [creditEmail, setCreditEmail] = useState("");
  const [creditUser, setCreditUser] = useState(undefined);
  const [creditLetter, setCreditLetter] = useState(null);
  const [creditAmount, setCreditAmount] = useState("1");
  const [creditReview, setCreditReview] = useState(null);
  const [loadingAdmins, setLoadingAdmins] = useState(true);
  const [newEmail, setNewEmail] = useState("");
  const [draft, setDraft] = useState(emptyStory);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadAdmins = async () => {
    setLoadingAdmins(true);
    try {
      setAdmins(await listAdmins());
    } catch (err) {
      setError(err.message || "Could not load admins.");
    } finally {
      setLoadingAdmins(false);
    }
  };

  useEffect(() => {
    loadAdmins();
  }, [email]);

  useEffect(() => {
    return onSnapshot(
      adsCollection(),
      (snap) => {
        setSlots(snap.docs.map((item) => ({ id: item.id, ...item.data() })));
      },
      (err) => setError(err.message || "Could not load bookings."),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      usersCollection(),
      (snap) => {
        setSavedDays(
          snap.docs
            .map((item) => ({ id: item.id, ...item.data() }))
            .filter((item) => typeof item.freeDayDate === "string"),
        );
      },
      (err) => setError(err.message || "Could not load bookings."),
    );
  }, []);

  const schedule = useMemo(() => {
    if (slots === null && savedDays === null) return null;
    const rows = [];
    const seen = new Set();
    for (const slot of slots || []) {
      for (const booking of bookingsFromAd(slot)) {
        if (!booking.date) continue;
        seen.add(`${booking.date}|${booking.authorEmail}`);
        rows.push(booking);
      }
    }
    for (const saved of savedDays || []) {
      const date = saved.freeDayDate;
      const authorEmail = String(saved.email || saved.id || "").toLowerCase();
      if (!date || seen.has(`${date}|${authorEmail}`)) continue;
      rows.push({
        id: `${date}_${authorEmail}`,
        date,
        name: saved.frontPageName || "Untitled app",
        authorEmail,
      });
    }
    return rows.sort((a, b) => String(a.date).localeCompare(String(b.date)) || String(a.name).localeCompare(String(b.name)));
  }, [slots, savedDays]);

  const newsletterList = useMemo(() => {
    const byEmail = new Map();
    for (const person of subscribers || []) {
      const email = String(person.email || person.id || "").toLowerCase();
      if (email) byEmail.set(email, person);
    }
    for (const person of optedIn) {
      const email = String(person.email || person.id || "").toLowerCase();
      if (!email || byEmail.has(email)) continue;
      byEmail.set(email, person);
    }
    return [...byEmail.values()].sort((a, b) => String(a.email || a.id).localeCompare(String(b.email || b.id)));
  }, [subscribers, optedIn]);

  const today = dateKey();
  const dayBookings = useMemo(
    () => (slots || []).flatMap((slot) => bookingsFromAd(slot)).filter((booking) => booking.date === bookDay),
    [slots, bookDay],
  );
  const bookedEntryIds = new Set(dayBookings.map((booking) => booking.entryId).filter(Boolean));
  const dayRoom = Math.max(0, ADS_PER_DAY - dayBookings.length);
  const upcoming = (schedule || []).filter((booking) => booking.date >= today);
  const earlier = (schedule || []).filter((booking) => booking.date < today);

  useEffect(() => {
    const clean = bookEmail.trim().toLowerCase();
    if (!clean.includes("@")) {
      setBookApps([]);
      setBookUser(undefined);
      setBookAppIds([]);
      return undefined;
    }
    setBookUser(undefined);
    setBookApps([]);
    setBookAppIds([]);
    let cancel = false;
    const timer = setTimeout(async () => {
      try {
        const [userSnap, appsSnap] = await Promise.all([
          getDoc(userDoc(clean)),
          getDocs(query(entriesCollection(), where("authorEmail", "==", clean))),
        ]);
        if (cancel) return;
        const nextApps = appsSnap.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .sort((a, b) => String(a.name).localeCompare(String(b.name)));
        setBookUser(userSnap.exists() ? userSnap.data() : null);
        setBookApps(nextApps);
        setBookAppIds([]);
      } catch (err) {
        if (!cancel) setError(err.message || "Could not load that account.");
      }
    }, 350);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [bookEmail]);

  useEffect(() => {
    const clean = creditEmail.trim().toLowerCase();
    setCreditReview(null);
    if (!clean.includes("@")) {
      setCreditUser(undefined);
      setCreditLetter(null);
      return undefined;
    }
    setCreditUser(undefined);
    setCreditLetter(null);
    let cancel = false;
    const timer = setTimeout(async () => {
      try {
        const [userSnap, letterSnap] = await Promise.all([getDoc(userDoc(clean)), getDoc(newsletterDoc(clean))]);
        if (cancel) return;
        setCreditUser(userSnap.exists() ? { email: clean, ...userSnap.data() } : null);
        setCreditLetter(letterSnap.exists() ? letterSnap.data() : null);
      } catch (err) {
        if (!cancel) setError(err.message || "Could not load that account.");
      }
    }, 350);
    return () => {
      cancel = true;
      clearTimeout(timer);
    };
  }, [creditEmail]);

  useEffect(() => {
    return onSnapshot(
      newsletterCollection(),
      (snap) => {
        const next = snap.docs
          .map((item) => ({ id: item.id, ...item.data() }))
          .filter((item) => item.subscribed === true)
          .sort((a, b) => String(a.email || a.id).localeCompare(String(b.email || b.id)));
        setSubscribers(next);
        setListError("");
      },
      (err) => {
        setSubscribers([]);
        setListError(err.message || "Could not load the newsletter list.");
      },
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      query(usersCollection(), where("emailOptIn", "==", true)),
      (snap) => {
        setOptedIn(snap.docs.map((item) => ({ id: item.id, email: item.data().email || item.id, ...item.data() })));
      },
      (err) => setListError(err.message || "Could not load subscribed accounts."),
    );
  }, []);

  useEffect(() => {
    return onSnapshot(
      postsCollection(),
      (snap) => {
        const next = snap.docs.map((item) => ({ id: item.id, ...item.data() }));
        next.sort((a, b) => (b.createdAt?.toMillis?.() || 0) - (a.createdAt?.toMillis?.() || 0));
        setStories(next);
      },
      (err) => setError(err.message || "Could not load stories."),
    );
  }, []);

  async function saveStory(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    const title = draft.title.trim();
    const body = draft.body.trim();
    if (!title || !body) {
      setError("A story needs a title and a body.");
      return;
    }
    setBusy("story");
    try {
      let slug = draft.slug || slugify(title) || "story";
      const existing = await getDoc(postDoc(slug));
      if (!draft.slug && existing.exists()) slug = `${slug}-${Date.now().toString(36)}`;
      const prior = existing.exists() && existing.id === slug ? existing.data() : null;
      await setDoc(postDoc(slug), {
        title,
        slug,
        body,
        published: Boolean(draft.published),
        authorEmail: email,
        authorName: "The index",
        createdAt: prior?.createdAt || serverTimestamp(),
      });
      setDraft(emptyStory);
      setMessage(draft.published ? "Story published." : "Draft saved.");
    } catch (err) {
      setError(err.message || "Could not save the story.");
    } finally {
      setBusy("");
    }
  }

  async function removeStory(story) {
    if (!window.confirm(`Delete “${story.title}”?`)) return;
    setBusy("delete");
    setError("");
    setMessage("");
    try {
      await deleteDoc(postDoc(story.slug || story.id));
      if ((story.slug || story.id) === draft.slug) setDraft(emptyStory);
      setMessage("Story deleted.");
    } catch (err) {
      setError(err.message || "Could not delete the story.");
    } finally {
      setBusy("");
    }
  }

  async function handleAdd(event) {
    event.preventDefault();
    setBusy("admin");
    setError("");
    setMessage("");
    try {
      const added = await addAdmin(newEmail);
      setNewEmail("");
      setMessage(`${added} is now an admin.`);
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Could not add admin.");
    } finally {
      setBusy("");
    }
  }

  async function handleRemove(adminEmail) {
    if (!window.confirm(`Remove ${adminEmail} as an admin?`)) return;
    setBusy("admin");
    setError("");
    setMessage("");
    try {
      await removeAdmin(adminEmail);
      setMessage(`${adminEmail} was removed.`);
      await loadAdmins();
    } catch (err) {
      setError(err.message || "Could not remove admin.");
    } finally {
      setBusy("");
    }
  }

  return (
    <LpFrame user={user} className="lp-profile">
      <div className="lp-profile-body">
        <div className="lp-profile-inner">
          <p className="lp-kicker">Admin</p>
          <h1>Admin</h1>
          <p className="lp-note">Signed in as {email}. Write the stories people read, and choose who else can.</p>
          {error ? <p className="lp-form-error">{error}</p> : null}
          {message ? <p className="lp-note">{message}</p> : null}

          <section className="lp-block">
            <h2>Schedule</h2>
            <p className="lp-note">Days booked on the front page. A day can hold 4 ads, from different accounts.</p>
            {schedule === null ? <p className="lp-note">Loading the schedule…</p> : null}
            {schedule && upcoming.length === 0 ? <p className="lp-note">No days are scheduled.</p> : null}
            <ul className="lp-app-list">
              {upcoming.map((booking) => (
                <li key={booking.id || `${booking.date}-${booking.authorEmail}`}>
                  <div>
                    <p className="lp1-cat">
                      {bookingWhen(booking.date, today)} · {bookingTitle(booking.date)}
                    </p>
                    <h3>{booking.name}</h3>
                    <p>{booking.authorEmail}</p>
                    <button
                      type="button"
                      className="lp-ghost"
                      disabled={busy === "booking"}
                      onClick={async () => {
                        if (!window.confirm(`Remove ${booking.name} on ${bookingTitle(booking.date)}?`)) return;
                        setBusy("booking");
                        setError("");
                        setMessage("");
                        try {
                          await cancelBooking({ email: booking.authorEmail, day: booking.date, entryId: booking.entryId });
                          setMessage(`Removed ${booking.name} on ${bookingTitle(booking.date)}.`);
                        } catch (err) {
                          setError(err.message || "Could not remove the booking.");
                        } finally {
                          setBusy("");
                        }
                      }}
                    >
                      Remove
                    </button>
                  </div>
                </li>
              ))}
            </ul>
            {earlier.length > 0 ? (
              <>
                <h2>Earlier</h2>
                <ul className="lp-app-list">
                  {earlier.map((booking) => (
                    <li key={booking.id || `${booking.date}-${booking.authorEmail}`}>
                      <div>
                        <p className="lp1-cat">{bookingTitle(booking.date)}</p>
                        <h3>{booking.name}</h3>
                        <p>{booking.authorEmail}</p>
                      </div>
                    </li>
                  ))}
                </ul>
              </>
            ) : null}
          </section>

          <section className="lp-block">
            <h2>{draft.slug ? "Edit story" : "Write a story"}</h2>
            <p className="lp-note">Stories are written by the site. Publish one when it is ready to read.</p>
            <form onSubmit={saveStory}>
              <label className="lp-field">
                <span>Title</span>
                <input
                  value={draft.title}
                  onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
                  placeholder="Why a quiet blocker beat another tab"
                />
              </label>
              <label className="lp-field">
                <span>Story</span>
                <textarea
                  rows={8}
                  value={draft.body}
                  onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
                  placeholder="Write the story."
                />
              </label>
              <label className="lp-check">
                <input
                  type="checkbox"
                  checked={draft.published}
                  onChange={(event) => setDraft((current) => ({ ...current, published: event.target.checked }))}
                />
                Publish on Stories
              </label>
              <div className="lp-actions">
                <button type="submit" className="lp-add" disabled={busy === "story"}>
                  {busy === "story" ? "Saving…" : draft.slug ? "Update story" : "Save story"}
                </button>
                {draft.slug ? (
                  <button type="button" className="lp-ghost" onClick={() => setDraft(emptyStory)}>
                    New story
                  </button>
                ) : null}
              </div>
            </form>
          </section>

          <section className="lp-block">
            <h2>Stories</h2>
            {stories.length === 0 ? (
              <p className="lp-note">No stories yet.</p>
            ) : (
              <ul className="lp-app-list">
                {stories.map((story) => (
                  <li key={story.id}>
                    <div>
                      <p className="lp1-cat">{story.published ? "Published" : "Draft"}</p>
                      <h3>
                        <Link to={`/blog/${story.slug || story.id}`}>{story.title}</Link>
                      </h3>
                      <div className="lp-actions">
                        <button
                          type="button"
                          className="lp-ghost"
                          onClick={() =>
                            setDraft({
                              title: story.title || "",
                              body: story.body || "",
                              published: Boolean(story.published),
                              slug: story.slug || story.id,
                            })
                          }
                        >
                          Edit
                        </button>
                        <button type="button" className="lp-ghost" disabled={busy === "delete"} onClick={() => removeStory(story)}>
                          Delete
                        </button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="lp-block">
            <h2>Book a day</h2>
            <p className="lp-note">Book one or more apps from an account. A day holds 4 ads.</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const clean = bookEmail.trim().toLowerCase();
                const chosen = bookApps.filter((item) => bookAppIds.includes(item.id));
                setBusy("book");
                setError("");
                setMessage("");
                try {
                  await bookFreeDay({ email: clean, day: bookDay, apps: chosen, asAdmin: true });
                  const names = chosen.map((item) => item.name).join(", ");
                  setMessage(`Booked ${names || "the apps"} for ${clean} on ${bookDay}.`);
                  setBookAppIds([]);
                } catch (err) {
                  setError(err.message || "That day could not be booked.");
                } finally {
                  setBusy("");
                }
              }}
            >
              <label className="lp-field">
                <span>Account email</span>
                <input
                  type="email"
                  autoComplete="off"
                  value={bookEmail}
                  onChange={(event) => setBookEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label className="lp-field">
                <span>Day</span>
                <input type="date" min={dateKey()} value={bookDay} onChange={(event) => setBookDay(event.target.value)} />
              </label>
              {bookEmail.includes("@") && bookUser === undefined ? <p className="lp-note">Looking up that account…</p> : null}
              {bookUser === null ? <p className="lp-note">No account with that email.</p> : null}
              {bookUser?.freeDayDate ? (
                <p className="lp-note">
                  Free day already used{bookUser.frontPageName ? `: ${bookUser.frontPageName}` : ""} on {bookUser.freeDayDate}. Other apps can still be booked.
                </p>
              ) : null}
              {bookUser && bookApps.length === 0 ? <p className="lp-note">This account has no apps yet.</p> : null}
              {bookUser && bookApps.length > 0 ? (
                <>
                  <p className="lp-note">
                    {dayRoom === 0 ? "That day already has 4 ads." : `${dayRoom} spot${dayRoom === 1 ? "" : "s"} left on ${bookDay}.`}
                  </p>
                  {bookApps.map((app) => {
                    const onDay = bookedEntryIds.has(app.id);
                    const checked = bookAppIds.includes(app.id);
                    return (
                      <label className="lp-check" key={app.id}>
                        <input
                          type="checkbox"
                          checked={checked || onDay}
                          disabled={onDay || (!checked && bookAppIds.length >= dayRoom)}
                          onChange={() => {
                            setBookAppIds((current) =>
                              current.includes(app.id) ? current.filter((id) => id !== app.id) : [...current, app.id],
                            );
                          }}
                        />
                        {app.name}
                        {onDay ? " · already on this day" : ""}
                      </label>
                    );
                  })}
                </>
              ) : null}
              <button type="submit" className="lp-add" disabled={busy === "book" || !bookUser || bookAppIds.length === 0 || bookAppIds.length > dayRoom}>
                {busy === "book" ? "Booking…" : bookAppIds.length > 1 ? `Book ${bookAppIds.length} apps` : "Book this day"}
              </button>
            </form>
          </section>

          <section className="lp-block">
            <h2>Give credit</h2>
            <p className="lp-note">Add credits to an account. Review the current balance and the increase, then confirm the account again.</p>
            <form
              onSubmit={async (event) => {
                event.preventDefault();
                const clean = creditEmail.trim().toLowerCase();
                const add = Number(creditAmount);
                const current = creditUser ? visibleCredits(creditUser, creditLetter || {}) : null;
                setError("");
                setMessage("");
                if (!creditUser || current === null) {
                  setError("Look up an account before giving credit.");
                  setCreditReview(null);
                  return;
                }
                if (!Number.isInteger(add) || add < 1 || add > 100) {
                  setError("Enter a whole number of credits from 1 to 100.");
                  setCreditReview(null);
                  return;
                }
                if (
                  !creditReview ||
                  creditReview.email !== clean ||
                  creditReview.amount !== add ||
                  creditReview.previous !== current
                ) {
                  setCreditReview({ email: clean, amount: add, previous: current, next: current + add });
                  return;
                }
                if (!window.confirm(`Give ${add} credit${add === 1 ? "" : "s"} to ${clean}? Balance goes from ${current} to ${current + add}.`)) {
                  return;
                }
                setBusy("credit");
                try {
                  const result = await grantCredits(clean, add);
                  const grantedCredits = grantedCreditCount(creditUser, creditLetter || {}) + result.added;
                  setCreditUser((person) => (person ? { ...person, credits: result.credits, grantedCredits } : person));
                  setCreditLetter((letter) => ({ ...(letter || {}), credits: result.credits, grantedCredits }));
                  setCreditReview(null);
                  setCreditAmount("1");
                  setMessage(`${clean} had ${result.previous} credit${result.previous === 1 ? "" : "s"}. Added ${result.added}. They now have ${result.credits}.`);
                } catch (err) {
                  setError(err.message || "Could not give credit.");
                } finally {
                  setBusy("");
                }
              }}
            >
              <label className="lp-field">
                <span>Account email</span>
                <input
                  type="email"
                  autoComplete="off"
                  value={creditEmail}
                  onChange={(event) => setCreditEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <label className="lp-field">
                <span>Credits to add</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={creditAmount}
                  onChange={(event) => {
                    setCreditAmount(event.target.value);
                    setCreditReview(null);
                  }}
                />
              </label>
              {creditEmail.includes("@") && creditUser === undefined ? <p className="lp-note">Looking up that account…</p> : null}
              {creditUser === null ? <p className="lp-note">No account with that email.</p> : null}
              {creditUser ? (
                <p className="lp-note">
                  {creditUser.email} has {visibleCredits(creditUser, creditLetter || {})} credit
                  {visibleCredits(creditUser, creditLetter || {}) === 1 ? "" : "s"}.
                  {Number.isInteger(Number(creditAmount)) && Number(creditAmount) >= 1
                    ? ` Adding ${Number(creditAmount)} makes it ${visibleCredits(creditUser, creditLetter || {}) + Number(creditAmount)}.`
                    : ""}
                </p>
              ) : null}
              {creditReview ? (
                <p className="lp-note">
                  Confirm {creditReview.email}: {creditReview.previous} now, plus {creditReview.amount}, for {creditReview.next}. Submit again to give the credit.
                </p>
              ) : null}
              <button type="submit" className="lp-add" disabled={busy === "credit" || !creditUser}>
                {busy === "credit" ? "Saving…" : creditReview ? "Confirm and give credit" : "Review credit"}
              </button>
            </form>
          </section>

          <section className="lp-block">
            <h2>Newsletter</h2>
            <p className="lp-note">Emails that are subscribed. A used free day stays used if they unsubscribe and join again.</p>
            {listError ? <p className="lp-form-error">{listError}</p> : null}
            {subscribers === null ? <p className="lp-note">Loading the list…</p> : null}
            {subscribers && newsletterList.length === 0 ? <p className="lp-note">No one is subscribed.</p> : null}
            {newsletterList.length > 0 ? (
              <ul className="lp-app-list">
                {newsletterList.map((person) => (
                  <li key={person.email || person.id}>
                    <div>
                      <h3>{person.email || person.id}</h3>
                      <p>{person.creditUsed || person.freeDayUsed ? "Free day used" : "Free day still available"}</p>
                    </div>
                  </li>
                ))}
              </ul>
            ) : null}
          </section>

          <section className="lp-block">
            <h2>Add admin</h2>
            <form onSubmit={handleAdd}>
              <label className="lp-field">
                <span>Email</span>
                <input
                  type="email"
                  autoComplete="email"
                  value={newEmail}
                  onChange={(event) => setNewEmail(event.target.value)}
                  placeholder="name@example.com"
                />
              </label>
              <button type="submit" className="lp-add" disabled={busy === "admin" || !newEmail.trim()}>
                {busy === "admin" ? "Saving…" : "Add admin"}
              </button>
            </form>
          </section>

          <section className="lp-block">
            <h2>Current admins</h2>
            {loadingAdmins ? <p className="lp-note">Loading admins…</p> : null}
            {!loadingAdmins && admins.length === 0 ? <p className="lp-note">No admins yet.</p> : null}
            <ul className="lp-app-list">
              {admins.map((admin) => {
                const isYou = admin.email.toLowerCase() === email;
                return (
                  <li key={admin.email}>
                    <div>
                      <h3>
                        {admin.email}
                        {isYou ? " · you" : ""}
                      </h3>
                      <button
                        type="button"
                        className="lp-ghost"
                        disabled={busy === "admin" || admins.length <= 1}
                        onClick={() => handleRemove(admin.email)}
                      >
                        Remove
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        </div>
      </div>
    </LpFrame>
  );
}
