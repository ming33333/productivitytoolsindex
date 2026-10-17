import { collection, doc } from "firebase/firestore";
import { db } from "./firebase";

export function usersCollection() {
  return collection(db, "users");
}

export function userDoc(email) {
  return doc(db, "users", String(email || "").toLowerCase());
}

export function userNotes(email) {
  return collection(db, "users", String(email || "").toLowerCase(), "notes");
}

export function entriesCollection() {
  return collection(db, "entries");
}

export function entryDoc(id) {
  return doc(db, "entries", String(id || ""));
}

export function postsCollection() {
  return collection(db, "posts");
}

export function postDoc(slug) {
  return doc(db, "posts", String(slug || ""));
}

export function adsCollection() {
  return collection(db, "ads");
}

export function adDoc(day) {
  return doc(db, "ads", String(day || ""));
}

export function freeAdDoc(email) {
  return doc(db, "freeAds", String(email || "").toLowerCase());
}

export function newsletterCollection() {
  return collection(db, "newsletter");
}

export function newsletterDoc(email) {
  return doc(db, "newsletter", String(email || "").toLowerCase());
}
