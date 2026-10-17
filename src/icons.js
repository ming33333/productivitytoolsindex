import { getDownloadURL, ref, uploadBytes } from "firebase/storage";
import { storage } from "./firebase";

const MAX_ICON_BYTES = 1024 * 1024;

export function iconOwnerId(email) {
  return String(email || "")
    .trim()
    .toLowerCase()
    .replaceAll(".", "_")
    .replaceAll("@", "_");
}

export function iconFileError(file) {
  if (!file) return "";
  if (!String(file.type || "").startsWith("image/")) return "Use an image file.";
  if (file.size > MAX_ICON_BYTES) return "Use an image under 1 MB.";
  return "";
}

export async function uploadAppIcon(email, file) {
  const problem = iconFileError(file);
  if (problem) throw new Error(problem);
  if (!storage) throw new Error("Firebase is not configured yet.");
  const owner = iconOwnerId(email);
  if (!owner) throw new Error("Sign in before uploading an icon.");
  const ext = String(file.name || "")
    .split(".")
    .pop()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
  const path = `icons/${owner}/${Date.now()}${ext ? `.${ext}` : ""}`;
  const fileRef = ref(storage, path);
  await uploadBytes(fileRef, file, { contentType: file.type });
  return getDownloadURL(fileRef);
}
