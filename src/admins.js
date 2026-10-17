import { useEffect, useState } from "react";
import { collection, deleteDoc, doc, getDoc, getDocs, setDoc } from "firebase/firestore";
import { db } from "./firebase";

export function normalizeEmail(email) {
  return String(email || "").trim().toLowerCase();
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

export function adminDoc(email) {
  return doc(db, "admins", normalizeEmail(email));
}

export async function isAdmin(email) {
  const normalized = normalizeEmail(email);
  if (!normalized || !db) return false;
  const snapshot = await getDoc(adminDoc(normalized));
  return snapshot.exists();
}

export function useAdmin(user) {
  const email = normalizeEmail(user?.email);
  const [state, setState] = useState({ admin: false, ready: user !== undefined && !email });

  useEffect(() => {
    if (user === undefined) return undefined;
    if (!email || !db) {
      setState({ admin: false, ready: true });
      return undefined;
    }
    let cancelled = false;
    setState({ admin: false, ready: false });
    isAdmin(email)
      .then((ok) => {
        if (!cancelled) setState({ admin: ok, ready: true });
      })
      .catch(() => {
        if (!cancelled) setState({ admin: false, ready: true });
      });
    return () => {
      cancelled = true;
    };
  }, [user, email]);

  return state;
}

export async function listAdmins() {
  const snapshot = await getDocs(collection(db, "admins"));
  return snapshot.docs
    .map((item) => ({
      id: item.id,
      email: item.id,
      ...item.data(),
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function addAdmin(email) {
  const normalized = normalizeEmail(email);
  if (!isValidEmail(normalized)) throw new Error("Enter a valid email address.");
  const ref = adminDoc(normalized);
  const existing = await getDoc(ref);
  if (existing.exists()) throw new Error("That email is already an admin.");
  await setDoc(ref, {
    email: normalized,
    addedAt: new Date().toISOString(),
  });
  return normalized;
}

export async function removeAdmin(email) {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error("Missing admin email.");
  const admins = await listAdmins();
  if (admins.length <= 1) throw new Error("At least one admin must remain.");
  await deleteDoc(adminDoc(normalized));
  return normalized;
}
