(function (root) {
  "use strict";
  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function entryDay(item) {
    return item.day || dayKey(new Date(item.created));
  }
  function newest(items) {
    return [...items].sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id.localeCompare(a.id));
  }
  function recentDiaries(items) {
    return newest(items.filter(item => item.kind === "diary")).slice(0, 4);
  }
  function archiveGroups(items, kind) {
    const groups = new Map();
    for (const item of newest(items.filter(item => item.kind === kind))) {
      const day = entryDay(item);
      if (!groups.has(day)) groups.set(day, []);
      groups.get(day).push(item);
    }
    return [...groups].sort(([a], [b]) => b.localeCompare(a)).map(([day, entries]) => ({ day, entries }));
  }
  const model = Object.freeze({ dayKey, entryDay, recentDiaries, archiveGroups });
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.LITTLE_DAYS_MODEL = model;
})(typeof window === "undefined" ? globalThis : window);
