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
  function recentProjects(items) {
    return items.filter(item => item.kind === "note").sort((a, b) =>
      Date.parse(b.updated || b.created) - Date.parse(a.updated || a.created) || b.id.localeCompare(a.id));
  }
  function formatSelection(text, start, end, style, color = "#687d55") {
    let replacement;
    if (["list", "ordered", "check"].includes(style)) {
      start = start > 0 ? text.lastIndexOf("\n", start - 1) + 1 : 0;
      const stop = text.indexOf("\n", end > start && text[end - 1] === "\n" ? end - 1 : end);
      end = stop < 0 ? text.length : stop;
      replacement = text.slice(start, end).split("\n").map((line, i) =>
        (style === "list" ? "- " : style === "check" ? "- [ ] " : `${i + 1}. `) + line.replace(/^(?:- \[[ x]\] |[-*] |\d+\. )/, "")).join("\n");
    } else {
      const wrappers = { bold: ["**", "**"], underline: ["<u>", "</u>"], strike: ["~~", "~~"],
        color: [`<span style="color:${/^#[\da-f]{6}$/i.test(color) ? color : "#687d55"}">`, "</span>"] };
      const [left, right] = wrappers[style];
      const selected = text.slice(start, end) || "文字";
      if (selected.includes("\n")) {
        replacement = selected.split("\n").map(line => line ? left + line + right : "").join("\n");
        return { text: text.slice(0, start) + replacement + text.slice(end), start, end: start + replacement.length };
      }
      replacement = left + selected + right;
      return { text: text.slice(0, start) + replacement + text.slice(end), start: start + left.length, end: start + left.length + selected.length };
    }
    return { text: text.slice(0, start) + replacement + text.slice(end), start, end: start + replacement.length };
  }
  function activeTodos(items, now = Date.now()) {
    return newest(items.filter(item => item.kind === "todo" && (!item.done || !Number.isFinite(Date.parse(item.completedAt)) || now - Date.parse(item.completedAt) < 48 * 60 * 60 * 1000)));
  }
  // 流水账标签：按使用次数从多到少，次数相同按名称。
  function tagStats(items) {
    const counts = new Map();
    for (const item of items) if (item.kind === "log") for (const tag of item.tags || []) counts.set(tag, (counts.get(tag) || 0) + 1);
    return [...counts].map(([tag, count]) => ({ tag, count })).sort((a, b) => b.count - a.count || a.tag.localeCompare(b.tag, "zh-CN"));
  }
  const model = Object.freeze({ dayKey, entryDay, recentDiaries, archiveGroups, recentProjects, formatSelection, activeTodos, tagStats });
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.LITTLE_DAYS_MODEL = model;
})(typeof window === "undefined" ? globalThis : window);
