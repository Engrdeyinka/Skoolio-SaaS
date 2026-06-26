export const DEFAULT_SS_PAIRINGS = [
  ["Chemistry", "Government"],
  ["Biology", "CRS"],
  ["Physics", "Literature"],
  ["Geography", "Yoruba"],
];

export function normalizeSSPairings(rawPairings) {
  const source = Array.isArray(rawPairings) && rawPairings.length > 0
    ? rawPairings
    : DEFAULT_SS_PAIRINGS;

  const seen = new Set();
  const normalized = [];

  source.forEach((pair) => {
    if (!Array.isArray(pair) || pair.length < 2) return;
    const left = String(pair[0] || "").trim();
    const right = String(pair[1] || "").trim();
    if (!left || !right) return;
    if (left.toLowerCase() === right.toLowerCase()) return;
    const dedupeKey = [left.toLowerCase(), right.toLowerCase()].sort().join("|");
    if (seen.has(dedupeKey)) return;
    seen.add(dedupeKey);
    normalized.push([left, right]);
  });

  return normalized.length > 0 ? normalized : DEFAULT_SS_PAIRINGS;
}

export function buildSSPairMap(rawPairings) {
  const map = {};
  normalizeSSPairings(rawPairings).forEach(([a, b]) => {
    map[a] = b;
    map[b] = a;
  });
  return map;
}
