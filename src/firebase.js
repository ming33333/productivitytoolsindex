import { getApps, initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";
import { getStorage } from "firebase/storage";
import { envValue, isFirebaseConfigured } from "./env";

export const firebaseReady = isFirebaseConfigured();

export const firebaseConfig = {
  apiKey: envValue("REACT_APP_FIREBASE_API_KEY"),
  authDomain: envValue("REACT_APP_FIREBASE_AUTH_DOMAIN"),
  projectId: envValue("REACT_APP_FIREBASE_PROJECT_ID"),
  storageBucket: envValue("REACT_APP_FIREBASE_STORAGE_BUCKET"),
  messagingSenderId: envValue("REACT_APP_FIREBASE_MESSAGING_SENDER_ID"),
  appId: envValue("REACT_APP_FIREBASE_APP_ID"),
  measurementId: envValue("REACT_APP_FIREBASE_MEASUREMENT_ID"),
};

let firebaseApp = null;
let auth = null;
let db = null;
let storage = null;
let firebaseInitError = "";

if (firebaseReady) {
  try {
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
    auth = getAuth(firebaseApp);
    db = getFirestore(firebaseApp);
    storage = getStorage(firebaseApp);
  } catch (error) {
    firebaseInitError = error.message || "Firebase could not start.";
  }
}

export { auth, db, firebaseApp, firebaseInitError, storage };
