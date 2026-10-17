import { deleteField, getDoc, getDocs, runTransaction, serverTimestamp, setDoc } from "firebase/firestore";
import { grantedCreditCount } from "./auth";
import { adDoc, entryDoc, freeAdDoc, newsletterDoc, userDoc, usersCollection } from "./collections";
import { db } from "./firebase";

export const ADS_PER_DAY = 4;

export function slotKey(email) {
  return String(email || "").toLowerCase().replaceAll(".", "_").replaceAll("@", "_");
}

export function latestUserDay(from = new Date()) {
  return dateKey(new Date(from.getFullYear(), from.getMonth() + 1, from.getDate()));
}

export function adSlotId(email, entryId) {
  const base = slotKey(email);
  const app = String(entryId || "").replaceAll(".", "_");
  return app ? `${base}__${app}` : base;
}

function bookingFields(email, app) {
  return {
    entryId: app.id,
    name: app.name,
    summary: app.summary || "",
    url: app.url || "",
    iconUrl: app.iconUrl || "",
    category: app.category || "",
    authorEmail: email,
    kind: "free",
    createdAt: new Date().toISOString(),
  };
}

function fieldsFromLegacy(data) {
  return {
    entryId: data.entryId || "",
    name: data.name || "",
    summary: data.summary || "",
    url: data.url || "",
    iconUrl: data.iconUrl || "",
    category: data.category || "",
    authorEmail: String(data.authorEmail || "").toLowerCase(),
    kind: data.kind || "free",
    createdAt: data.createdAt || serverTimestamp(),
  };
}

export function bookingsFromAd(doc) {
  const date = doc.date || String(doc.id || "").slice(0, 10);
  if (doc.slots && typeof doc.slots === "object") {
    return Object.entries(doc.slots).map(([key, slot]) => ({
      id: `${date}_${key}`,
      date,
      ...slot,
      name: slot?.name || "Untitled app",
      authorEmail: String(slot?.authorEmail || "").toLowerCase(),
    }));
  }
  if (!doc.name && !doc.entryId) return [];
  return [
    {
      id: doc.id || date,
      date,
      ...doc,
      name: doc.name || "Untitled app",
      authorEmail: String(doc.authorEmail || "").toLowerCase(),
    },
  ];
}

function slotsFromDay(data) {
  if (!data) return {};
  if (data.slots && typeof data.slots === "object") return { ...data.slots };
  if (data.authorEmail || data.entryId || data.name) {
    const owner = String(data.authorEmail || "").toLowerCase();
    return { [owner ? slotKey(owner) : "legacy"]: fieldsFromLegacy(data) };
  }
  return {};
}

export function dateKey(date = new Date()) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function dateFromKey(key) {
  const [year, month, day] = String(key || "").split("-").map(Number);
  return new Date(year, (month || 1) - 1, day || 1);
}

function takenApp(slots, email, entryId) {
  return Object.values(slots).some(
    (slot) => String(slot?.authorEmail || "").toLowerCase() === email && slot?.entryId === entryId,
  );
}

export async function bookFreeDay({ email, day, app, apps, asAdmin = false }) {
  if (!db) throw new Error("Firebase is not configured yet.");
  const clean = String(email || "").toLowerCase();
  const key = String(day || "");
  const list = (asAdmin && Array.isArray(apps) && apps.length ? apps : [app]).filter((item) => item?.id && item?.name);
  if (!clean) throw new Error("Enter the account email.");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) throw new Error("Pick a day.");
  if (key < dateKey()) throw new Error("That day has already passed.");
  const latest = asAdmin ? dateKey(new Date(Date.now() + 60 * 24 * 60 * 60 * 1000)) : latestUserDay();
  if (key > latest) throw new Error(asAdmin ? "Book a day within the next 60 days." : "Book a day within the next month.");
  if (!asAdmin && list.length !== 1) throw new Error("Pick one of your apps.");
  if (asAdmin && list.length === 0) throw new Error("Pick at least one of this account's apps.");
  if (list.length > ADS_PER_DAY) throw new Error("A day can hold 4 ads.");

  const slot = adDoc(key);
  const pass = freeAdDoc(clean);
  const letter = newsletterDoc(clean);
  await runTransaction(db, async (tx) => {
    const reads = [tx.get(userDoc(clean)), tx.get(slot), tx.get(pass), tx.get(letter)];
    if (asAdmin) list.forEach((item) => reads.push(tx.get(entryDoc(item.id))));
    const snaps = await Promise.all(reads);
    const [userSnap, slotSnap, passSnap, letterSnap, ...entrySnaps] = snaps;
    if (!userSnap.exists()) throw new Error("That account does not exist.");
    const profile = userSnap.data() || {};
    const letterData = letterSnap.data() || {};
    const granted = grantedCreditCount(profile, letterData);
    const alreadyBooked = passSnap.exists() || typeof profile.freeDayDate === "string";
    const creditUsed = profile.freeDayUsed === true || letterData.creditUsed === true || alreadyBooked;
    const freeAvailable = !creditUsed && (profile.emailOptIn === true || profile.credits >= 1 || letterData.credits >= 1);
    if (!asAdmin && !freeAvailable && granted < 1) {
      throw new Error(creditUsed ? "You do not have a credit left." : "Subscribe to the newsletter to get 1 free day.");
    }
    if (asAdmin) {
      list.forEach((item, index) => {
        const author = String(entrySnaps[index]?.data()?.authorEmail || "").toLowerCase();
        if (!entrySnaps[index]?.exists() || author !== clean) throw new Error(`${item.name} is not on this account.`);
      });
    }
    if (!asAdmin && creditUsed && granted < 1) throw new Error("Your free day is already used.");
    const spendGrant = !asAdmin && !freeAvailable;
    const slots = slotsFromDay(slotSnap.exists() ? slotSnap.data() : null);
    const room = ADS_PER_DAY - Object.keys(slots).length;
    if (room <= 0) throw new Error("That day already has 4 ads.");
    if (list.length > room) throw new Error(room === 1 ? "That day has room for 1 more ad." : `That day has room for ${room} more ads.`);
    list.forEach((item, index) => {
      const id = !asAdmin || (index === 0 && !alreadyBooked) ? slotKey(clean) : adSlotId(clean, item.id);
      if (slots[id] || takenApp(slots, clean, item.id)) throw new Error(`${item.name} is already booked that day.`);
      slots[id] = bookingFields(clean, item);
    });
    tx.set(slot, { date: key, slots });
    const first = list[0];
    const nextGranted = spendGrant ? granted - 1 : granted;
    const nextCredits = nextGranted;
    if (!alreadyBooked) {
      tx.set(pass, {
        email: clean,
        date: key,
        entryId: first.id,
        name: first.name,
        createdAt: serverTimestamp(),
      });
      const booking = {
        freeDayDate: key,
        frontPageEntryId: first.id,
        frontPageName: first.name,
        frontPageSummary: first.summary || "",
        frontPageUrl: first.url || "",
        frontPageIconUrl: first.iconUrl || "",
        frontPageCategory: first.category || "",
        freeDayUsed: true,
        credits: nextCredits,
        grantedCredits: nextGranted,
      };
      tx.set(userDoc(clean), asAdmin ? booking : { email: clean, ...booking }, { merge: true });
      tx.set(
        letter,
        {
          email: clean,
          subscribed: profile.emailOptIn === true || letterData.subscribed === true,
          creditUsed: true,
          credits: nextCredits,
          grantedCredits: nextGranted,
        },
        { merge: true },
      );
    } else if (spendGrant) {
      tx.set(userDoc(clean), { credits: nextCredits, grantedCredits: nextGranted }, { merge: true });
      tx.set(
        letter,
        {
          email: clean,
          subscribed: profile.emailOptIn === true || letterData.subscribed === true,
          creditUsed: true,
          credits: nextCredits,
          grantedCredits: nextGranted,
        },
        { merge: true },
      );
    }
  });
}

function slotFromProfile(email, data) {
  return bookingFields(email, {
    id: data.frontPageEntryId || "",
    name: data.frontPageName || "",
    summary: data.frontPageSummary || "",
    url: data.frontPageUrl || "",
    iconUrl: data.frontPageIconUrl || "",
    category: data.frontPageCategory || "",
  });
}

async function writeSlotIfMissing(email, data) {
  const day = data?.freeDayDate;
  if (typeof day !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(day) || !data.frontPageName || !data.frontPageEntryId) return;
  const slotRef = adDoc(day);
  const existing = await getDoc(slotRef);
  const mine = slotKey(email);
  if (!existing.exists()) {
    await setDoc(slotRef, { date: day, slots: { [mine]: slotFromProfile(email, data) } });
  } else {
    const slots = slotsFromDay(existing.data());
    const already =
      Object.values(slots).some((item) => String(item?.authorEmail || "").toLowerCase() === email) ||
      String(existing.data()?.authorEmail || "").toLowerCase() === email;
    if (!already && Object.keys(slots).length < ADS_PER_DAY) {
      slots[mine] = slotFromProfile(email, data);
      await setDoc(slotRef, { date: day, slots });
    }
  }
  const passRef = freeAdDoc(email);
  const pass = await getDoc(passRef);
  if (!pass.exists()) {
    await setDoc(passRef, {
      email,
      date: day,
      entryId: data.frontPageEntryId,
      name: data.frontPageName,
      createdAt: serverTimestamp(),
    });
  }
}

export async function publishAccountSlot(email) {
  if (!db) return;
  const clean = String(email || "").toLowerCase();
  if (!clean) return;
  const userSnap = await getDoc(userDoc(clean));
  if (!userSnap.exists()) return;
  await writeSlotIfMissing(clean, userSnap.data());
}

export async function publishBookedAccounts() {
  if (!db) return;
  const snap = await getDocs(usersCollection());
  for (const item of snap.docs) {
    const data = item.data();
    if (typeof data.freeDayDate !== "string") continue;
    const email = String(data.email || item.id || "").toLowerCase();
    await writeSlotIfMissing(email, data);
  }
}

function matchingSlotKey(slots, email, entryId) {
  const base = slotKey(email);
  const compound = entryId ? adSlotId(email, entryId) : "";
  if (compound && slots[compound]) return compound;
  if (slots[base] && (!entryId || slots[base].entryId === entryId)) return base;
  const found = Object.keys(slots).filter((key) => {
    const slot = slots[key] || {};
    return String(slot.authorEmail || "").toLowerCase() === email && (!entryId || slot.entryId === entryId);
  });
  return found.length === 1 ? found[0] : "";
}

export async function cancelBooking({ email, day, entryId }) {
  if (!db) throw new Error("Firebase is not configured yet.");
  const clean = String(email || "").toLowerCase();
  if (!clean) throw new Error("Missing account email.");
  await runTransaction(db, async (tx) => {
    const userSnap = await tx.get(userDoc(clean));
    const passRef = freeAdDoc(clean);
    const passSnap = await tx.get(passRef);
    const letterRef = newsletterDoc(clean);
    const letterSnap = await tx.get(letterRef);
    const key = String(day || userSnap.data()?.freeDayDate || passSnap.data()?.date || "");
    if (!key) throw new Error("There is no booking to cancel.");
    const slotRef = adDoc(key);
    const slotSnap = await tx.get(slotRef);
    if (slotSnap.exists()) {
      const data = slotSnap.data() || {};
      if (data.slots && typeof data.slots === "object") {
        const mine = matchingSlotKey(data.slots, clean, entryId);
        if (!mine) throw new Error("That booking belongs to someone else.");
        const next = { ...data.slots };
        delete next[mine];
        if (Object.keys(next).length === 0) tx.delete(slotRef);
        else tx.set(slotRef, { date: key, slots: next });
      } else {
        const owner = String(data.authorEmail || passSnap.data()?.email || "").toLowerCase();
        if (owner && owner !== clean) throw new Error("That booking belongs to someone else.");
        tx.delete(slotRef);
      }
    }
    const profile = userSnap.data() || {};
    const granted = grantedCreditCount(profile, letterSnap.data() || {});
    const clearsFreeDay =
      profile.freeDayDate === key && (!entryId || !profile.frontPageEntryId || profile.frontPageEntryId === entryId);
    if (clearsFreeDay && passSnap.exists()) tx.delete(passRef);
    if (!clearsFreeDay || typeof profile.freeDayDate !== "string") return;
    tx.set(
      userDoc(clean),
      {
        freeDayDate: deleteField(),
        frontPageEntryId: deleteField(),
        frontPageName: deleteField(),
        frontPageSummary: deleteField(),
        frontPageUrl: deleteField(),
        frontPageIconUrl: deleteField(),
        frontPageCategory: deleteField(),
        freeDayUsed: true,
        credits: granted,
        grantedCredits: granted,
      },
      { merge: true },
    );
    tx.set(
      letterRef,
      {
        email: clean,
        subscribed: profile.emailOptIn === true || letterSnap.data()?.subscribed === true,
        creditUsed: true,
        credits: granted,
        grantedCredits: granted,
      },
      { merge: true },
    );
  });
}
