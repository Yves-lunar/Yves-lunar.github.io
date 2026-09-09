(function () {
  "use strict";
  const { React, createRoot } = window.LITTLE_DAYS_RUNTIME;
  const { useState, useEffect, useLayoutEffect, useRef } = React;
  const h = React.createElement;
  const { dayKey, entryDay, recentDiaries, archiveGroups } = window.LITTLE_DAYS_MODEL;
  const store = window.LITTLE_DAYS_STORE;
  const fullDate = day => new Date(`${day}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const time = item => new Date(item.created).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  function AutoText({ value, onChange, label, placeholder, className = "", autoFocus = false }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      const node = ref.current;
      if (!node) return;
      const resize = () => { node.style.height = "auto"; node.style.height = `${node.scrollHeight}px`; };
      resize();
      // A newly mounted dialog is opened by its parent's layout effect.
      const frame = requestAnimationFrame(resize);
      window.addEventListener("resize", resize);
      return () => { cancelAnimationFrame(frame); window.removeEventListener("resize", resize); };
    }, [value]);
    return h("textarea", { ref, value, onChange: event => onChange(event.target.value), "aria-label": label,
      placeholder, maxLength: 50000, rows: 1, className, autoFocus });
  }

  function Modal({ titleId, className, onClose, children }) {
    const ref = useRef(null);
    useLayoutEffect(() => {
      const previous = document.activeElement;
      const overflow = document.body.style.overflow;
      const dialog = ref.current;
      document.body.style.overflow = "hidden";
      dialog.showModal();
      (dialog.querySelector("textarea") || dialog.querySelector("button"))?.focus();
      return () => {
        dialog.close();
        document.body.style.overflow = overflow;
        if (previous && previous.isConnected) previous.focus();
      };
    }, []);
    return h("dialog", { ref, className, "aria-labelledby": titleId,
      onCancel: event => { event.preventDefault(); onClose(); } }, children);
  }

  function Calendar({ value, onChange, entries }) {
    const [open, setOpen] = useState(false);
    const [month, setMonth] = useState(() => new Date(`${value.slice(0, 7)}-01T12:00:00`));
    function select(day) { onChange(day); setOpen(false); }
    const count = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
    const offset = (month.getDay() + 6) % 7;
    return h("div", { className: "date-picker" },
      h("button", { type: "button", className: "date-toggle", "aria-label": "选择小纸条日期",
        "aria-expanded": open, "aria-controls": "journal-calendar", onClick: () => setOpen(!open) },
        h("span", null, fullDate(value)), h("span", { className: `date-chevron ${open ? "open" : ""}`, "aria-hidden": true }, "⌄")),
      open && h("div", { className: "calendar", id: "journal-calendar" },
        h("div", { className: "heading" }, h("strong", null, `${month.getFullYear()} 年 ${month.getMonth() + 1} 月`),
          h("div", null,
            h("button", { type: "button", "aria-label": "上个月", onClick: () => setMonth(new Date(month.getFullYear(), month.getMonth() - 1, 1)) }, "‹"),
            h("button", { type: "button", "aria-label": "下个月", onClick: () => setMonth(new Date(month.getFullYear(), month.getMonth() + 1, 1)) }, "›"))),
        h("div", { className: "grid" },
          [..."一二三四五六日"].map(day => h("span", { key: day }, day)),
          Array.from({ length: offset }, (_, index) => h("span", { key: `blank-${index}` })),
          Array.from({ length: count }, (_, index) => {
            const day = dayKey(new Date(month.getFullYear(), month.getMonth(), index + 1));
            const has = entries.some(item => entryDay(item) === day);
            return h("button", { type: "button", key: day, "aria-label": day + (has ? " 有小纸条" : ""), "aria-pressed": day === value,
              className: `${has ? "has " : ""}${day === value ? "selected " : ""}${day === dayKey() ? "current" : ""}`,
              onClick: () => select(day) }, index + 1);
          })),
        h("div", { className: "legend" }, h("span", null, "▪ 有小纸条"),
          h("button", { type: "button", onClick: () => { setMonth(new Date(new Date().getFullYear(), new Date().getMonth(), 1)); select(dayKey()); } }, "回到今天"))));
  }

  function Project({ item, index, busy, save }) {
    const [title, setTitle] = useState(item.title);
    const [body, setBody] = useState(item.body);
    const changed = title !== item.title || body !== item.body;
    return h("article", { className: `note color-${index % 3}` },
      h("div", { className: "heading" }, h("small", null, `PROJECT ${String(index + 1).padStart(2, "0")}`),
        h("button", { type: "button", className: "delete", "aria-label": `删除项目 ${item.title}`, disabled: busy,
          onClick: () => save("DELETE", { id: item.id }) }, "×")),
      h("input", { className: "note-title", "aria-label": "项目标题", value: title, maxLength: 300, onChange: e => setTitle(e.target.value) }),
      h(AutoText, { label: "项目进展", value: body, onChange: setBody, placeholder: "写下目前的进展、想法和下一步…" }),
      h("div", { className: "heading note-bottom" }, h("span", null, changed ? "有未保存的修改" : "随时编辑，慢慢推进"),
        h("button", { type: "button", disabled: busy || !changed || !title.trim(),
          onClick: () => save("PATCH", { id: item.id, title: title.trim(), body }) }, changed ? "保存修改 ✓" : "已保存 ✓")));
  }

  function Archive({ kind, items, busy, error, save, onClose }) {
    const groups = archiveGroups(items, kind);
    const [activeDay, setActiveDay] = useState(groups[0]?.day || "");
    const sections = useRef(new Map());
    const title = kind === "log" ? "日志箱" : "小纸条";
    const active = groups.some(group => group.day === activeDay) ? activeDay : groups[0]?.day;
    function jump(day) {
      setActiveDay(day);
      sections.current.get(day)?.scrollIntoView({ block: "start", behavior: "auto" });
    }
    return h(Modal, { titleId: "archive-title", className: `archive-dialog ${kind === "log" ? "log-archive" : "paper-archive"}`, onClose },
      h("div", { className: "archive-top" },
        h("div", { className: "archive-heading" },
          h("div", null, h("small", null, kind === "log" ? "THE DAYS, COLLECTED" : "LITTLE WORDS, KEPT"),
            h("h2", { id: "archive-title" }, title), h("p", null, `${items.filter(item => item.kind === kind).length} 条记录 · 按日期收好`)),
          h("button", { type: "button", className: "close-button", onClick: onClose, "aria-label": `关闭${title}`, autoFocus: true }, "关闭 ×")),
        groups.length > 0 && h("nav", { className: "archive-dates", "aria-label": `${title}日期选择` },
          groups.map(group => h("button", { type: "button", key: group.day, "aria-pressed": active === group.day, onClick: () => jump(group.day) },
            h("span", null, group.day.slice(0, 4)), h("strong", null, group.day.slice(5).replace("-", " / ")))))),
      error && h("p", { className: "error", role: "alert" }, error),
      h("div", { className: "archive-scroll" },
        !groups.length && h("div", { className: "archive-empty" }, h("span", { "aria-hidden": true }, "✧"), h("h3", null, "这里，等着你的第一段记录"),
          h("p", null, kind === "log" ? "流水账提交后，会按日期收进这里。" : "写下的小纸条，会按日期收进这里。")),
        groups.map(group => h("section", { key: group.day, className: "archive-day", ref: node => { if (node) sections.current.set(group.day, node); else sections.current.delete(group.day); } },
          h("div", { className: "archive-day-title" }, h("h3", null, fullDate(group.day)), h("span", null, `${group.entries.length} 条`)),
          group.entries.map(item => h("article", { className: "archive-entry", key: item.id },
            h("div", { className: "heading" }, h("time", { dateTime: item.created }, time(item)),
              h("button", { type: "button", disabled: busy, "aria-label": `删除 ${group.day} ${time(item)} 的记录`, onClick: () => save("DELETE", { id: item.id }) }, "删除")),
            h("p", null, item.body)))))));
  }

  function Notebook() {
    const [items, setItems] = useState([]);
    const [ready, setReady] = useState(false);
    const [busy, setBusy] = useState(false);
    const saving = useRef(false);
    const [error, setError] = useState("");
    const [tab, setTab] = useState("all");
    const [todo, setTodo] = useState("");
    const [diary, setDiary] = useState("");
    const [day, setDay] = useState(() => dayKey());
    const [log, setLog] = useState("");
    const [logStatus, setLogStatus] = useState("");
    const [fullscreen, setFullscreen] = useState(false);
    const [archive, setArchive] = useState(null);
    useEffect(() => {
      let active = true;
      store.list().then(data => { if (active) { setItems(data); setReady(true); } })
        .catch(err => { if (active) setError(store.errorMessage(err)); });
      return () => { active = false; };
    }, []);
    async function save(method, input) {
      if (!ready || saving.current) return false;
      saving.current = true;
      setBusy(true); setError("");
      try {
        const item = await store.mutate(method, input);
        setItems(previous => method === "DELETE" ? previous.filter(row => row.id !== input.id)
          : method === "POST" ? [...previous, item] : previous.map(row => row.id === item.id ? item : row));
        return true;
      } catch (err) { setError(store.errorMessage(err) + " 文字已保留，请重试。"); return false; }
      finally { saving.current = false; setBusy(false); }
    }
    async function submitLog(event) {
      event.preventDefault();
      const submitted = log;
      if (submitted.trim() && await save("POST", { kind: "log", day: dayKey(), body: submitted.trim() })) {
        setLog(current => current === submitted ? "" : current);
        setLogStatus("已收进日志箱");
      }
    }
    function changeLog(value) { setLog(value); setLogStatus(""); }
    function logForm(immersive) {
      return h("form", { className: immersive ? "immersive-form" : "log-form", onSubmit: submitLog },
        h(AutoText, { label: immersive ? "全屏流水账" : "流水账内容", value: log, onChange: changeLog,
          autoFocus: immersive, placeholder: immersive ? "慢慢写，今天发生的事都可以留在这里…" : "今天做了什么？随手记两笔…" }),
        h("div", { className: "log-form-bottom" },
          h("span", { className: "log-feedback", role: "status" }, logStatus || `${Array.from(log).length} 字 · 提交后收进日志箱`),
          h("button", { type: "submit", disabled: !ready || busy || !log.trim() }, busy ? "正在保存…" : "收进日志箱 ↗")));
    }
    const todos = items.filter(item => item.kind === "todo");
    const projects = items.filter(item => item.kind === "note");
    const diaries = items.filter(item => item.kind === "diary");
    const logs = items.filter(item => item.kind === "log");
    const recent = recentDiaries(items);
    const done = todos.filter(item => item.done).length;
    const show = kind => tab === "all" || tab === kind;
    return h(React.Fragment, null,
      h("header", null,
        h("a", { href: "./", className: "brand" }, h("b", null, "✳"), "日常 ", h("i", null, "little days")),
        h("nav", { className: "nav", "data-slot": "tabs-list", "aria-label": "记事本分类" },
          [["all", "总览"], ["todo", "待办"], ["note", "记事本"], ["diary", "日记"]].map(([value, label]) =>
            h("button", { key: value, type: "button", "data-slot": "tabs-trigger", "aria-pressed": tab === value, onClick: () => setTab(value) }, label))),
        h("span", { className: "private" }, "共享记事本 ", h("b", null, "我"))),
      h("main", null,
        h("div", { className: "intro" },
          h("div", null, h("small", null, "A LITTLE SPACE, JUST FOR YOU"), h("h1", null, "把日子，慢慢记下来", h("span", null, "。"))),
          h("div", { className: "today" }, new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }), h("p", null, "留一点时间，给自己"))),
        error && h("p", { className: "error", role: "alert" }, error),
        h("section", { className: "daily-log", "aria-labelledby": "log-title" },
          h("div", { className: "log-heading" },
            h("div", { className: "log-title-line" }, h("h2", { id: "log-title" }, "流水账"), h("span", null, dayKey().replaceAll("-", " / "))),
            h("button", { type: "button", className: "expand-writer", onClick: () => setFullscreen(true), "aria-label": "全屏书写流水账" }, "⛶ 全屏")),
          logForm(false)),
        h("div", { className: `workspace ${tab === "all" ? "" : "single"}` },
          show("todo") && h("section", { className: "panel tasks", "aria-labelledby": "tasks-title" },
            h("small", null, "01 / TO-DO"), h("h2", { id: "tasks-title" }, "今日待办 ", h("em", null, todos.length - done)),
            h("p", { className: "subtitle" }, "一件一件，慢慢完成。"),
            h("div", { className: "progress" }, h("span", { style: { width: `${todos.length ? done / todos.length * 100 : 0}%` } })),
            h("p", { className: "meta right" }, `已完成 ${done} / ${todos.length}`),
            h("div", { className: "task-list" }, todos.map(item => h("div", { className: `task ${item.done ? "done" : ""}`, key: item.id },
              h("input", { type: "checkbox", className: "task-check", "aria-label": `完成 ${item.title}`, checked: !!item.done, disabled: busy,
                onChange: event => save("PATCH", { id: item.id, done: +event.target.checked }) }),
              h("span", null, item.title), h("button", { type: "button", className: "delete", "aria-label": `删除待办 ${item.title}`, disabled: busy, onClick: () => save("DELETE", { id: item.id }) }, "×"))),
              !todos.length && h("p", { className: "empty" }, ready ? "还没有待办。写下想做的第一件小事吧。" : "正在读取…")),
            h("form", { className: "todo-input", onSubmit: async event => { event.preventDefault(); const text = todo; if (text.trim() && await save("POST", { kind: "todo", title: text.trim() })) setTodo(current => current === text ? "" : current); } },
              h("input", { "aria-label": "新待办事项", placeholder: "添加一件小事…", value: todo, maxLength: 300, onChange: e => setTodo(e.target.value) }),
              h("button", { type: "submit", disabled: !ready || busy || !todo.trim(), "aria-label": "添加待办" }, "＋")),
            h("p", { className: "footnote" }, "不必赶路，也在向前。")),
          show("note") && h("section", { className: "panel notes projects-panel", "aria-labelledby": "projects-title" },
            h("small", null, "02 / NOTEBOOK"),
            h("div", { className: "heading project-heading" }, h("h2", { id: "projects-title" }, "正在进行"),
              h("button", { type: "button", className: "soft", disabled: !ready || busy, onClick: () => save("POST", { kind: "note", title: "新的项目", body: "" }) }, "＋ 新项目")),
            h("p", { className: "subtitle" }, "想法有落点，进展有记录。"),
            projects.map((item, index) => h(Project, { key: item.id, item, index, busy, save })),
            !projects.length && h("div", { className: "note-empty" }, h("span", null, "↗"), h("h3", null, "让想法从这里开始"), h("p", null, "添加一个项目，随时写下新的进展。"),
              h("button", { type: "button", disabled: !ready || busy, onClick: () => save("POST", { kind: "note", title: "我的第一个项目", body: "" }) }, "创建项目 ＋")),
            h("p", { className: "footnote" }, "✧ 每一点进展，都算数。")),
          show("diary") && h("section", { className: "panel journal", "aria-labelledby": "journal-title" },
            h("small", null, "03 / JOURNAL"), h("h2", { id: "journal-title" }, "日子里的片段"),
            h("p", { className: "subtitle" }, "把此刻的心情，折成一张小纸条。"),
            h(Calendar, { value: day, onChange: setDay, entries: diaries }),
            h("form", { className: "diary-input", onSubmit: async event => { event.preventDefault(); const text = diary; if (text.trim() && await save("POST", { kind: "diary", body: text.trim(), day })) setDiary(current => current === text ? "" : current); } },
              h(AutoText, { label: "日记内容", value: diary, onChange: setDiary, placeholder: "今天，有什么想记住的？" }),
              h("div", { className: "heading" }, h("small", null, `${Array.from(diary).length} 字 · 记于 ${day.slice(5)}`),
                h("button", { type: "submit", disabled: !ready || busy || !diary.trim() }, "收好 ✓"))),
            h("div", { className: "heading diary-heading" }, h("h3", null, "最近的小纸条"),
              h("button", { type: "button", className: "view-all-papers", onClick: () => setArchive("diary") }, `全部 ${diaries.length} 条 ↗`)),
            recent.map(item => h("article", { className: "entry", key: item.id }, h("small", null, `${entryDay(item)} · ${time(item)}`), h("p", null, item.body),
              h("button", { type: "button", disabled: busy, onClick: () => save("DELETE", { id: item.id }) }, "删除"))),
            !recent.length && h("p", { className: "empty" }, "还没有小纸条，写下此刻的心情吧。"))),
        h("section", { className: "archive-launchers", "aria-label": "记录归档" },
          h("div", { className: "archive-caption" }, h("span", null, "写过的日子，都在这里。"), h("small", null, "A PLACE FOR EVERY LITTLE DAY")),
          h("div", { className: "archive-buttons" },
            h("button", { type: "button", className: "archive-launch log-launch", onClick: () => setArchive("log") },
              h("span", { className: "archive-icon", "aria-hidden": true }, "▤"), h("span", null, h("strong", null, "日志箱"), h("small", null, `${logs.length} 条流水账`)), h("span", { "aria-hidden": true }, "↗")),
            h("button", { type: "button", className: "archive-launch paper-launch", onClick: () => setArchive("diary") },
              h("span", { className: "archive-icon", "aria-hidden": true }, "▱"), h("span", null, h("strong", null, "小纸条"), h("small", null, `${diaries.length} 段心情`)), h("span", { "aria-hidden": true }, "↗")))),
        h("footer", null, h("i", null, "little days / 日常"), h("span", null, "平凡的一天，也值得被记录。"),
          h("span", { role: "status" }, busy ? "正在保存…" : error ? "同步失败" : ready ? "内容已同步" : "连接云端…"))),
      fullscreen && h(Modal, { titleId: "writer-title", className: "writer-dialog", onClose: () => setFullscreen(false) },
        h("div", { className: "writer-top" }, h("div", null, h("small", null, "A MOMENT, JUST FOR WRITING"), h("h2", { id: "writer-title" }, "流水账")),
          h("button", { type: "button", className: "close-button", onClick: () => setFullscreen(false) }, "退出全屏 ×")),
        h("div", { className: "writer-body" }, h("p", { className: "writer-date" }, fullDate(dayKey())),
          error && h("p", { className: "error", role: "alert" }, error), logForm(true))),
      archive && h(Archive, { kind: archive, items, busy, error, save, onClose: () => setArchive(null) }));
  }
  createRoot(document.getElementById("root")).render(h(Notebook));
})();
