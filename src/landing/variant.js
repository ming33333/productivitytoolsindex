export function landingVariant(pathname, search) {
  const params = new URLSearchParams(search.startsWith("?") ? search.slice(1) : search);
  const fromQuery = params.get("lp");
  if (fromQuery && fromQuery.trim()) return fromQuery.trim().toLowerCase();

  const cleaned = pathname.replace(/\/+$/, "") || "/";
  if (cleaned === "/") return "option1";
  const match = cleaned.match(/(?:^|\/)lp=([^/]+)$/i);
  if (!match) return null;
  try {
    const value = decodeURIComponent(match[1]).trim().toLowerCase();
    return value || null;
  } catch {
    return null;
  }
}
