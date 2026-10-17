function haystack(tool) {
  if (tool.searchText) return String(tool.searchText).toLowerCase();
  return [
    tool.name,
    tool.category,
    tool.summary,
    tool.description,
    ...(tool.features || []),
    ...(tool.tags || []),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
}

function wordStrength(word, name, category, features, hay) {
  if (name.includes(word)) return 1;
  if (features.includes(word) || category.includes(word)) return 0.85;
  if (hay.includes(word)) return 0.7;
  return 0;
}

export function searchTools(tools, query, limit = 8) {
  const text = String(query || "").trim().toLowerCase();
  const words = text.split(/\s+/).filter((word) => word.length > 1);
  if (!words.length) return [];

  return tools
    .map((tool) => {
      const hay = haystack(tool);
      const name = String(tool.name || "").toLowerCase();
      const category = String(tool.category || "").toLowerCase();
      const features = (tool.features || []).join(" ").toLowerCase();
      const covered = words.reduce(
        (total, word) => total + wordStrength(word, name, category, features, hay),
        0,
      );
      let match = covered / words.length;
      if (name.includes(text)) match = Math.max(match, 0.98);
      else if (words.length > 1 && hay.includes(text)) match = Math.min(1, match + 0.08);
      return { tool, match: Math.round(match * 100) };
    })
    .filter((item) => item.match > 0)
    .sort((a, b) => b.match - a.match || String(a.tool.name).localeCompare(String(b.tool.name)))
    .slice(0, limit);
}
