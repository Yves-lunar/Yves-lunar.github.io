/* Synthetic data only; preview interactions never call the real database. */
(function () {
  const today = new Date();
  function date(offset) { const d = new Date(today); d.setDate(d.getDate() - offset); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`; }
  let entries = [
    { id: "task-1", kind: "todo", title: "整理今天的工作清单", done: 0 },
    { id: "task-2", kind: "todo", title: "傍晚出去散散步", done: 1 },
    { id: "project-1", kind: "note", title: "慢慢把生活整理好", body: "把零散的想法记录下来。\n这周想留一点时间，做喜欢的小事。" },
    ...Array.from({ length: 6 }, (_, index) => ({ id: `diary-${index}`, kind: "diary", day: date(index), created: `${date(index)}T09:00:00Z`, body: ["今天的风很温柔。回家路上，看到一朵很小的花。", "终于读完了那本放在床头的书。", "和朋友喝了一杯咖啡，聊了很多最近的小事。", "给自己做了一顿认真准备的晚饭。", "试着早点睡，晚安。", "雨天也有雨天的好。听了一下午喜欢的歌。"][index] })),
    ...Array.from({ length: 3 }, (_, index) => ({ id: `log-${index}`, kind: "log", day: date(index * 2), created: `${date(index * 2)}T10:00:00Z`, body: "上午整理了工作笔记，把待办逐一做完。\n下午出门走了走，买了水果。\n平常的一天，也想好好记下来。" }))
  ].map(item => ({ title: "", body: "", done: 0, day: date(0), created: `${date(0)}T08:00:00Z`, ...item }));
  window.LITTLE_DAYS_STORE = {
    async list() { return entries.map(item => ({ ...item })); },
    async mutate(method, input) {
      if (input.body?.includes("[模拟失败]")) throw Error("模拟保存失败");
      if (method === "DELETE") { entries = entries.filter(item => item.id !== input.id); return input; }
      if (method === "POST") {
        const row = { id: crypto.randomUUID(), created: new Date().toISOString(), title: "", body: "", done: 0, ...input };
        entries.push(row); return row;
      }
      entries = entries.map(item => item.id === input.id ? { ...item, ...input } : item);
      return entries.find(item => item.id === input.id);
    },
    errorMessage() { return "模拟保存失败。"; }
  };
})();
