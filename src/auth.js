import {
  createUserWithEmailAndPassword,
  GoogleAuthProvider,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut as firebaseSignOut,
} from "firebase/auth";
import { doc, getDoc, serverTimestamp, setDoc } from "firebase/firestore";
import { newsletterDoc } from "./collections";
import { auth, db } from "./firebase";

export function readableAuthError(error) {
  const code = error?.code || "";
  if (code.includes("popup-closed")) {
    return "The Google window was closed before it finished.";
  }
  if (code.includes("unauthorized-domain")) {
    return "This domain is not on the Firebase authorized list. Add it under Authentication → Settings → Authorized domains.";
  }
  if (code.includes("popup-blocked")) {
    return "The browser blocked the sign-in popup. Allow popups for this site and try again.";
  }
  if (code.includes("operation-not-allowed")) {
    return "That sign-in method is turned off in Firebase Authentication.";
  }
  if (code.includes("invalid-email")) return "That email address is not valid.";
  if (code.includes("email-already-in-use")) return "An account already uses that email. Sign in instead.";
  if (code.includes("weak-password")) return "Use at least 6 characters.";
  if (code.includes("too-many-requests")) return "Too many tries. Wait a moment and try again.";
  if (code.includes("invalid-credential") || code.includes("wrong-password") || code.includes("user-not-found")) {
    return "That email and password do not match.";
  }
  return error?.message || "Could not sign in.";
}

export async function signInWithGoogle() {
  if (!auth) throw new Error("Firebase is not configured yet. Run npm run setup.");
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  return signInWithPopup(auth, provider);
}

export async function signInWithEmail(email, password) {
  if (!auth) throw new Error("Firebase is not configured yet. Run npm run setup.");
  return signInWithEmailAndPassword(auth, String(email || "").trim(), password);
}

export async function signUpWithEmail(email, password) {
  if (!auth) throw new Error("Firebase is not configured yet. Run npm run setup.");
  const clean = String(email || "").trim();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(clean)) throw new Error("Enter a valid email address.");
  if (String(password || "").length < 6) throw new Error("Use at least 6 characters.");
  return createUserWithEmailAndPassword(auth, clean, password);
}

export async function sendPasswordReset(email) {
  if (!auth) throw new Error("Firebase is not configured yet. Run npm run setup.");
  const clean = String(email || "").trim();
  if (!clean) throw new Error("Enter the email on the account.");
  return sendPasswordResetEmail(auth, clean);
}

export function signOut() {
  if (!auth) return Promise.resolve();
  return firebaseSignOut(auth);
}

function dayWasUsed(profile, letterData) {
  return profile.freeDayUsed === true || letterData.creditUsed === true || typeof profile.freeDayDate === "string";
}

function earnedFreeDay(profile, letterData, subscribed) {
  return (
    subscribed ||
    profile.emailOptIn === true ||
    letterData.subscribed === true ||
    profile.credits === 1 ||
    letterData.credits === 1 ||
    Boolean(profile.emailOptInAt) ||
    Boolean(letterData.subscribedAt)
  );
}

function creditCount(profile, letterData, subscribed) {
  if (dayWasUsed(profile, letterData)) return 0;
  return earnedFreeDay(profile, letterData, subscribed) ? 1 : 0;
}

export function grantedCreditCount(profile, letterData) {
  const fromProfile = typeof profile?.grantedCredits === "number" ? profile.grantedCredits : 0;
  const fromLetter = typeof letterData?.grantedCredits === "number" ? letterData.grantedCredits : 0;
  return Math.max(0, fromProfile, fromLetter);
}

function balance(profile, letterData, subscribed) {
  return creditCount(profile, letterData, subscribed) + grantedCreditCount(profile, letterData);
}

export function visibleCredits(profile = {}, letterData = {}) {
  const subscribed = profile.emailOptIn === true || letterData.subscribed === true;
  return balance(profile, letterData, subscribed);
}

async function readNewsletter(letterRef) {
  try {
    const snap = await getDoc(letterRef);
    return { exists: snap.exists(), data: snap.data() || {} };
  } catch {
    return { exists: false, data: {} };
  }
}

let newsletterTicket = 0;

async function writeNewsletter(letterRef, letter) {
  try {
    await setDoc(letterRef, letter, { merge: true });
  } catch (error) {
    if (letter.creditUsed !== false) throw error;
    const { creditUsed, ...rest } = letter;
    await setDoc(letterRef, rest, { merge: true });
  }
}

export async function setEmailOptIn(email, optedIn) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean || !db) throw new Error("Firebase is not configured yet.");
  const ticket = ++newsletterTicket;
  const subscribed = Boolean(optedIn);
  const userRef = doc(db, "users", clean);
  const letterRef = newsletterDoc(clean);
  const userSnap = await getDoc(userRef);
  const profile = userSnap.data() || {};
  const letterSnap = await readNewsletter(letterRef);
  const letterData = letterSnap.data;
  const used = dayWasUsed(profile, letterData);
  const grantedCredits = grantedCreditCount(profile, letterData);
  const credits = creditCount(profile, letterData, subscribed) + grantedCredits;
  await setDoc(
    userRef,
    {
      email: clean,
      emailOptIn: subscribed,
      emailOptInAt: serverTimestamp(),
      credits,
      grantedCredits,
    },
    { merge: true },
  );
  const letter = {
    email: clean,
    subscribed,
    credits,
    grantedCredits,
    creditUsed: used,
    updatedAt: serverTimestamp(),
  };
  if (subscribed && !letterData.subscribedAt) letter.subscribedAt = serverTimestamp();
  if (!subscribed) letter.unsubscribedAt = serverTimestamp();
  if (ticket !== newsletterTicket) return;
  await writeNewsletter(letterRef, letter);
}

export async function restoreUnusedCredit(email) {
  const clean = String(email || "").trim().toLowerCase();
  if (!clean || !db) throw new Error("Firebase is not configured yet.");
  const userRef = doc(db, "users", clean);
  const letterRef = newsletterDoc(clean);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) return;
  const profile = userSnap.data() || {};
  const letterSnap = await readNewsletter(letterRef);
  const letterData = letterSnap.data;
  const subscribed = profile.emailOptIn === true || letterData.subscribed === true;
  const used = dayWasUsed(profile, letterData);
  const grantedCredits = grantedCreditCount(profile, letterData);
  const credits = creditCount(profile, letterData, subscribed) + grantedCredits;
  const letterMissing = !letterSnap.exists;
  const letterStale =
    letterMissing ||
    letterData.subscribed !== subscribed ||
    letterData.credits !== credits ||
    letterData.grantedCredits !== grantedCredits ||
    letterData.email !== clean;
  if (profile.credits === credits && profile.grantedCredits === grantedCredits && !letterStale) return;
  if (newsletterTicket !== 0) return;
  if (profile.credits !== credits || profile.grantedCredits !== grantedCredits) {
    await setDoc(userRef, { credits, grantedCredits }, { merge: true });
  }
  if (newsletterTicket !== 0) return;
  if (letterStale && (subscribed || letterSnap.exists || profile.emailOptInAt || credits > 0)) {
    const letter = {
      email: clean,
      subscribed,
      credits,
      grantedCredits,
      creditUsed: used,
      updatedAt: serverTimestamp(),
    };
    if (subscribed && !letterData.subscribedAt) letter.subscribedAt = serverTimestamp();
    await writeNewsletter(letterRef, letter);
  }
}

export async function grantCredits(email, amount) {
  const clean = String(email || "").trim().toLowerCase();
  const add = Number(amount);
  if (!clean || !db) throw new Error("Firebase is not configured yet.");
  if (!Number.isInteger(add) || add < 1 || add > 100) throw new Error("Enter a whole number of credits from 1 to 100.");
  const userRef = doc(db, "users", clean);
  const letterRef = newsletterDoc(clean);
  const userSnap = await getDoc(userRef);
  if (!userSnap.exists()) throw new Error("No account with that email.");
  const profile = userSnap.data() || {};
  const letterSnap = await readNewsletter(letterRef);
  const letterData = letterSnap.data;
  const subscribed = profile.emailOptIn === true || letterData.subscribed === true;
  const used = dayWasUsed(profile, letterData);
  const previous = balance(profile, letterData, subscribed);
  const grantedCredits = grantedCreditCount(profile, letterData) + add;
  const credits = creditCount(profile, letterData, subscribed) + grantedCredits;
  await setDoc(userRef, { credits, grantedCredits }, { merge: true });
  await writeNewsletter(letterRef, {
    email: clean,
    subscribed,
    credits,
    grantedCredits,
    creditUsed: used,
    updatedAt: serverTimestamp(),
    ...(subscribed && !letterData.subscribedAt ? { subscribedAt: serverTimestamp() } : {}),
  });
  return { email: clean, previous, added: add, credits };
}

export async function ensureUserProfile(user) {
  const email = user?.email?.toLowerCase();
  if (!email || !db) return null;
  try {
    await setDoc(
      doc(db, "users", email),
      {
        email,
        displayName: user.displayName || "",
        photoURL: user.photoURL || "",
        updatedAt: serverTimestamp(),
      },
      { merge: true },
    );
    return null;
  } catch (error) {
    return error;
  }
}
