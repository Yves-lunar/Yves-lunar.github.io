(function () {
  "use strict";
  const { React, createRoot } = window.LITTLE_DAYS_RUNTIME;
  const { useState, useEffect, useLayoutEffect, useRef } = React;
  const h = React.createElement;
  const { dayKey, entryDay, recentDiaries, archiveGroups, recentProjects, activeTodos } = window.LITTLE_DAYS_MODEL;
  const store = window.LITTLE_DAYS_STORE;
  const fullDate = day => new Date(`${day}T12:00:00`).toLocaleDateString("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" });
  const time = item => new Date(item.created).toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit" });

  function NavIcon({ kind }) {
    const paths = {
      all: "M3 10 12 3l9 7M5 9v12h5v-7h4v7h5V9",
      todo: "M9 4H5a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2h13a2 2 0 0 0 2-2v-8M8 11l4 4L21 4",
      note: "M12 6c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V5c-3-1-6-1-9 1v15",
      diary: "M14 3H5v18h14V8l-5-5v5h5M8 12h8M8 16h5",
      log: "M6 3h14v18H6V3M3 7h5M3 12h5M3 17h5M11 8h5M11 12h5M11 16h3",
      tool: "M14 6a5 5 0 0 0-6 6l-5 5a2 2 0 0 0 3 3l5-5a5 5 0 0 0 6-6l-3 3-3-3 3-3Z"
    };
    return h("svg", { className: "nav-icon", viewBox: "0 0 24 24", width: 19, height: 19, fill: "none", stroke: "currentColor", strokeWidth: 1.7,
      strokeLinecap: "round", strokeLinejoin: "round", "aria-hidden": true, focusable: false }, h("path", { d: paths[kind] }));
  }

  function AutoText({ value, onChange, label, placeholder, className = "", autoFocus = false, disabled = false, editorRef }) {
    const localRef = useRef(null);
    const ref = editorRef || localRef;
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
      placeholder, maxLength: 50000, rows: 1, className, autoFocus, disabled });
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

  const ProjectEditor = window.LITTLE_DAYS_PROJECT_EDITOR;

  function Project({ item, index, busy, save, expanded, setExpanded, onSaved }) {
    const [title, setTitle] = useState(item.title);
    const [body, setBody] = useState(item.body);
    const titleRef = useRef(null);
    const defaultTitle = ["新的项目", "新建项目", "我的第一个项目"].includes(title);
    useLayoutEffect(() => {
      if (expanded && defaultTitle) { titleRef.current?.focus(); titleRef.current?.select(); }
    }, [expanded]);
    const changed = title !== item.title || body !== item.body;
    const detailsId = `project-details-${item.id}`;
    return h("article", { "data-project-id": item.id, onInputCapture: () => setExpanded(true), className: `note project-card color-${index % 3} ${expanded ? "is-expanded" : ""}` },
      h("button", { type: "button", className: "project-toggle", "aria-expanded": expanded, "aria-controls": detailsId,
        onClick: () => setExpanded(!expanded) },
        h("span", { className: "project-summary-title" }, title || item.title),
        changed && h("span", { className: "project-unsaved", "aria-label": "有未保存的修改" }, "·"),
        h("span", { className: `date-chevron ${expanded ? "open" : ""}`, "aria-hidden": true }, "⌄")),
      h("div", { id: detailsId, className: "project-collapse", inert: expanded ? undefined : "", "aria-hidden": !expanded },
      h("div", { className: "project-collapse-inner" }, h("div", { className: "project-details" },
      h("div", { className: "heading" }, h("small", null, `PROJECT ${String(index + 1).padStart(2, "0")}`),
        h("button", { type: "button", className: "delete", "aria-label": `删除项目 ${item.title}`, disabled: busy,
          onClick: () => save("DELETE", { id: item.id }) }, "×")),
      h("input", { ref: titleRef, className: "note-title", "aria-label": "项目标题", value: title, maxLength: 300, disabled: busy,
        onFocus: e => { if (defaultTitle) e.target.select(); }, onChange: e => setTitle(e.target.value) }),
      h(ProjectEditor, { value: body, onChange: setBody, disabled: busy }),
      h("div", { className: "heading note-bottom" }, h("span", null, changed ? "有未保存的修改" : "随时编辑，慢慢推进"),
        h("button", { type: "button", disabled: busy || !changed || !title.trim(),
          onClick: async () => {
            if (await save("PATCH", { id: item.id, kind: "note", title: title.trim(), body })) {
              setTitle(current => current === title ? title.trim() : current);
              onSaved();
            }
          } }, changed ? "保存修改 ✓" : "已保存 ✓"))))));
  }

  function ArchiveEntry({ item, day, editable, busy, save }) {
    const [editing, setEditing] = useState(false);
    const [body, setBody] = useState(item.body);
    const [title, setTitle] = useState(item.title);
    async function submit(event) {
      event.preventDefault();
      if (busy || !body.trim() || (item.kind === "tool" && !title.trim()) || (body === item.body && title === item.title)) return;
      if (await save("PATCH", { id: item.id, body, ...(item.kind === "tool" ? { kind: "tool", title: title.trim() } : {}) })) setEditing(false);
    }
    return h("article", { className: "archive-entry" },
      h("div", { className: "heading" }, h("time", { dateTime: item.created }, time(item)),
        !editing && h("div", { className: "archive-entry-actions" },
          editable && h("button", { type: "button", disabled: busy,
            onClick: () => { setBody(item.body); setTitle(item.title); setEditing(true); } }, "编辑"),
          h("button", { type: "button", disabled: busy, "aria-label": `删除 ${day} ${time(item)} 的记录`,
            onClick: () => save("DELETE", { id: item.id }) }, "删除"))),
      editing ? h("form", { className: "archive-edit-form", onSubmit: submit },
        item.kind === "tool" && h("input", { className: "tool-title-input", "aria-label": "编辑小工具标题", value: title, maxLength: 200, disabled: busy, onChange: e => setTitle(e.target.value) }),
        h(AutoText, { label: `编辑 ${day} ${time(item)} 的${item.kind === "tool" ? "小工具" : "日志"}`, value: body, onChange: setBody, autoFocus: true, disabled: busy }),
        h("div", { className: "archive-edit-actions" },
          h("button", { type: "button", disabled: busy, onClick: () => { setBody(item.body); setEditing(false); } }, "取消"),
          h("button", { type: "submit", className: "archive-save", disabled: busy || !body.trim() || (item.kind === "tool" && !title.trim()) || (body === item.body && title === item.title) }, busy ? "正在保存…" : "保存修改")))
        : h("p", null, item.body));
  }

  function Archive({ kind, items, busy, error, save, onClose, undoNotice }) {
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
      undoNotice,
      error && h("p", { className: "error", role: "alert" }, error),
      h("div", { className: "archive-scroll" },
        !groups.length && h("div", { className: "archive-empty" }, h("span", { "aria-hidden": true }, "✧"), h("h3", null, "这里，等着你的第一段记录"),
          h("p", null, kind === "log" ? "流水账提交后，会按日期收进这里。" : "写下的小纸条，会按日期收进这里。")),
        groups.map(group => h("section", { key: group.day, className: "archive-day", ref: node => { if (node) sections.current.set(group.day, node); else sections.current.delete(group.day); } },
          h("div", { className: "archive-day-title" }, h("h3", null, fullDate(group.day)), h("span", null, `${group.entries.length} 条`)),
          group.entries.map(item => h(ArchiveEntry, { key: item.id, item, day: group.day, editable: kind === "log", busy, save }))))));
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
    const [toolText, setToolText] = useState("");
    const [toolName, setToolName] = useState("");
    const [toolStatus, setToolStatus] = useState("");
    const [fullscreen, setFullscreen] = useState(false);
    const [archive, setArchive] = useState(null);
    const [selectedTool, setSelectedTool] = useState(null);
    const [showAllProjects, setShowAllProjects] = useState(false);
    const [showAllTodos, setShowAllTodos] = useState(false);
    const [todoClock, setTodoClock] = useState(Date.now());
    const datedTodos = useRef(new Set());
    useEffect(() => {
      const timer = setInterval(() => setTodoClock(Date.now()), 60000);
      return () => clearInterval(timer);
    }, []);
    useEffect(() => {
      if (!ready || busy) return;
      // Older completed records have no completion date: give them a fresh grace period.
      const legacy = items.find(item => item.kind === "todo" && item.done && !item.completedAt && !datedTodos.current.has(item.id));
      if (legacy) { datedTodos.current.add(legacy.id); commit("PATCH", {id: legacy.id, kind: "todo", done: 1}); }
    }, [ready, busy, items]);
    const [openProject, setOpenProject] = useState(null);
    const [projectLimit, setProjectLimit] = useState({ height: 320, overflow: false });
    useEffect(() => {
      if (!ready || !["all", "note"].includes(tab)) return;
      const panel = document.querySelector('.projects-panel');
      if (!panel) return;
      let frame;
      function measure() {
        cancelAnimationFrame(frame);
        frame = requestAnimationFrame(() => {
          const list = panel.querySelector('.project-list');
          const content = panel.querySelector('.project-list-content');
          const neighbours = [...document.querySelectorAll('.workspace > .tasks, .workspace > .journal')];
          const target = neighbours.length ? Math.max(...neighbours.map(node => node.getBoundingClientRect().height)) : 520;
          const button = panel.querySelector('.projects-overflow');
          // Measure panel chrome independently of the current list viewport and disclosure.
          const fixed = panel.getBoundingClientRect().height - list.getBoundingClientRect().height
            - (button?.getBoundingClientRect().height || 0);
          const available = Math.max(160, target - fixed);
          // Only title rows count toward overflow, never an opened project's body.
          const collapsedHeight = [...content.querySelectorAll('.project-list-item:not([hidden])')]
            .reduce((sum, row) => sum + row.getBoundingClientRect().height
              - row.querySelector('.project-collapse').getBoundingClientRect().height
              + (parseFloat(getComputedStyle(row).marginBottom) || 0), 0);
          const overflow = collapsedHeight > available + 1;
          const height = Math.floor(available - (overflow ? 40 : 0));
          setProjectLimit(previous => previous.height === height && previous.overflow === overflow
            ? previous : { height, overflow });
        });
      }
      const observer = new ResizeObserver(measure);
      panel.querySelectorAll('.project-list-content, .project-toggle').forEach(node => observer.observe(node));
      document.querySelectorAll('.workspace > .tasks, .workspace > .journal').forEach(node => observer.observe(node));
      window.addEventListener('resize', measure); measure();
      return () => { observer.disconnect(); cancelAnimationFrame(frame); window.removeEventListener('resize', measure); };
    }, [ready, tab, items]);
    const pendingDeletes = useRef([]);
    const [deletions, setDeletions] = useState([]);
    function showDeletions() { setDeletions([...pendingDeletes.current]); }
    function undoDelete(id) {
      pendingDeletes.current = pendingDeletes.current.filter(entry => entry.id !== id || entry.deleting);
      showDeletions();
    }
    useEffect(() => {
      if (!ready) return;
      const timer = setInterval(async () => {
        if (saving.current) return;
        const entry = pendingDeletes.current.find(row => !row.deleting && row.until <= Date.now());
        if (!entry) return;
        entry.deleting = true; showDeletions();
        await commit("DELETE", { id: entry.id });
        // Failed deletes become visible again, with the existing error message.
        pendingDeletes.current = pendingDeletes.current.filter(row => row.id !== entry.id);
        showDeletions();
      }, 250);
      return () => clearInterval(timer);
    }, [ready]);
    useEffect(() => {
      function outside(event) {
        if (!event.target.closest('.project-card, .project-overflow, button, input, textarea, select, a, dialog, [contenteditable="true"]')) { setOpenProject(null); setShowAllProjects(false); }
      }
      document.addEventListener("pointerdown", outside);
      return () => document.removeEventListener("pointerdown", outside);
    }, []);
    useEffect(() => {
      let active = true;
      store.list().then(data => { if (active) { setItems(data); setReady(true); } })
        .catch(err => { if (active) setError(store.errorMessage(err)); });
      return () => { active = false; };
    }, []);
    async function save(method, input) {
      const item = items.find(row => row.id === input.id);
      if (method === "DELETE" && item && item.kind !== "todo") {
        if (!pendingDeletes.current.some(row => row.id === item.id)) {
          pendingDeletes.current.push({ id: item.id, until: Date.now() + 10000, deleting: false,
            label: item.kind === "note" ? `项目「${item.title}」` : item.kind === "log" ? "流水账" : item.kind === "tool" ? "小工具条目" : "小纸条" });
          showDeletions();
        }
        return true;
      }
      return commit(method, input);
    }
    async function commit(method, input) {
      if (!ready || saving.current) return false;
      saving.current = true;
      setBusy(true); setError("");
      try {
        const item = await store.mutate(method, input);
        setItems(previous => method === "DELETE" ? previous.filter(row => row.id !== input.id)
          : method === "POST" ? [...previous, item] : previous.map(row => row.id === item.id ? item : row));
        return true;
      } catch (err) { setError(store.errorMessage(err) + (method === "DELETE" ? " 记录已恢复，请重试。" : " 文字已保留，请重试。")); return false; }
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
    function toolForm(immersive) {
      return h("form", { className: immersive ? "immersive-form" : "log-form", onSubmit: async event => {
        event.preventDefault(); const text = toolText, title = toolName;
        if (title.trim() && text.trim() && await save("POST", { kind: "tool", title: title.trim(), body: text.trim(), day: dayKey() })) {
          setToolName(current => current === title ? "" : current);
          setToolText(current => current === text ? "" : current); setToolStatus("已加入下方列表");
        }
      } },
        h("input", { className: "tool-title-input", "aria-label": "小工具标题", placeholder: "给这一条起个标题", value: toolName, maxLength: 200, onChange: e => { setToolName(e.target.value); setToolStatus(""); } }),
        h(AutoText, { label: immersive ? "全屏小工具" : "小工具内容", value: toolText, onChange: text => { setToolText(text); setToolStatus(""); }, autoFocus: immersive, placeholder: "写下想保存的内容…" }),
        h("div", { className: "log-form-bottom" },
          h("span", { className: "log-feedback", role: "status" }, toolStatus || `${Array.from(toolText).length} 字 · 提交后加入下方列表`),
          h("button", { type: "submit", disabled: !ready || busy || !toolText.trim() || !toolName.trim() }, busy ? "正在保存…" : "添加条目 ↗")));
    }
    function diaryForm(immersive) {
      return h("form", { className: immersive ? "immersive-form" : "diary-input", onSubmit: async event => {
        event.preventDefault(); const text = diary;
        if (text.trim() && await save("POST", { kind: "diary", body: text.trim(), day })) setDiary(current => current === text ? "" : current);
      } },
        h(AutoText, { label: immersive ? "全屏小纸条" : "日记内容", value: diary, onChange: setDiary, autoFocus: immersive, placeholder: "今天，有什么想记住的？" }),
        h("div", { className: immersive ? "log-form-bottom" : "heading" },
          h("small", null, `${Array.from(diary).length} 字 · 记于 ${day}`),
          h("button", { type: "submit", disabled: !ready || busy || !diary.trim() }, busy ? "正在保存…" : "收好 ✓")));
    }
    const todos = activeTodos(items, todoClock);
    const visibleItems = items.filter(item => !deletions.some(row => row.id === item.id));
    const projects = recentProjects(items);
    const visibleProjects = recentProjects(visibleItems);
    const diaries = visibleItems.filter(item => item.kind === "diary");
    const logs = visibleItems.filter(item => item.kind === "log");
    const recent = recentDiaries(visibleItems);
    const toolEntries = visibleItems.filter(item => item.kind === "tool").sort((a, b) => Date.parse(b.created) - Date.parse(a.created) || b.id.localeCompare(a.id));
    const openedTool = toolEntries.find(item => item.id === selectedTool);
    const undoNotice = deletions.length > 0 && h("div", { className: "delete-undo-notices", "aria-label": "删除撤回", "aria-live": "polite" },
      deletions.map(entry => h("div", { key: entry.id, className: "delete-undo-notice" },
        h("span", null, entry.deleting ? "正在删除…" : `已移除${entry.label}，10 秒内可撤回`),
        h("button", { type: "button", disabled: entry.deleting, onClick: () => undoDelete(entry.id) }, "撤回"))));
    const done = todos.filter(item => item.done).length;
    const show = kind => tab === "all" || tab === kind;
    return h(React.Fragment, null,
      h("header", null,
        h("a", { href: "./", className: "brand" }, h("b", null, "✳"), "日常 ", h("i", null, "little days")),
        h("nav", { className: "nav", "data-slot": "tabs-list", "aria-label": "记事本分类" },
          [["all", "总览"], ["todo", "待办"], ["note", "记事本"], ["diary", "日记"], ["log", "流水账"], ["tool", "小工具"]].map(([value, label]) =>
            h("button", { key: value, type: "button", "data-slot": "tabs-trigger", "aria-label": label, title: label,
              "aria-pressed": tab === value, onClick: () => { setTab(value); setOpenProject(null); setShowAllProjects(false); } }, h(NavIcon, { kind: value }), h("span", { className: "nav-label" }, label)))),
        h("span", { className: "private" }, "共享记事本 ", h("b", null, "我"))),
      h("main", null,
        h("div", { className: "intro" },
          h("div", null, h("small", null, "A LITTLE SPACE, JUST FOR YOU"), h("h1", null, "把日子，慢慢记下来", h("span", null, "。"))),
          h("div", { className: "today" }, new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" }), h("p", null, "留一点时间，给自己"))),
        error && h("p", { className: "error", role: "alert" }, error),
        show("log") && h("section", { className: "daily-log", "aria-labelledby": "log-title" },
          h("div", { className: "log-heading" },
            h("div", { className: "log-title-line" }, h("h2", { id: "log-title" }, "流水账"), h("span", null, dayKey().replaceAll("-", " / "))),
            h("button", { type: "button", className: "expand-writer", onClick: () => setFullscreen("log"), "aria-label": "全屏书写流水账" }, "⛶ 全屏")),
          logForm(false)),
        tab === "tool" && h("section", { className: "tools-page", "aria-labelledby": "tools-title" },
          h("div", { className: "daily-log" },
            h("div", { className: "log-heading" }, h("h2", { id: "tools-title" }, "小工具"),
              h("button", { type: "button", className: "expand-writer", onClick: () => setFullscreen("tool"), "aria-label": "全屏书写小工具" }, "⛶ 全屏")),
            toolForm(false)),
          h("div", { className: "heading" }, h("h3", null, "过去的条目"), h("small", null, `${toolEntries.length} 条`)),
          h("ul", { className: "tools-list", "aria-label": "小工具条目列表" }, toolEntries.map(item =>
            h("li", { key: item.id }, h("button", { type: "button", className: "tool-list-row", onClick: () => setSelectedTool(item.id) },
              h("strong", null, item.title || item.body.trim().split("\n")[0].slice(0, 40) || "未命名条目"),
              h("time", { dateTime: entryDay(item) }, entryDay(item)))))),
          !toolEntries.length && h("p", { className: "empty" }, ready ? "还没有条目，在上面写下第一条吧。" : "正在读取…")),
        !["log", "tool"].includes(tab) && h("div", { className: `workspace ${tab === "all" ? "" : "single"}` },
          show("todo") && h("section", { className: `panel tasks ${showAllTodos ? "todos-expanded" : ""}`, "aria-labelledby": "tasks-title" },
            h("small", null, "01 / TO-DO"), h("h2", { id: "tasks-title" }, "今日待办 ", h("em", null, todos.length - done)),
            h("p", { className: "subtitle" }, "一件一件，慢慢完成。"),
            h("div", { className: "progress" }, h("span", { style: { width: `${todos.length ? done / todos.length * 100 : 0}%` } })),
            h("p", { className: "meta right" }, `已完成 ${done} / ${todos.length}`),
            h("div", { className: "task-list", id: "todo-list" }, (showAllTodos ? todos : todos.slice(0, 4)).map(item => h("div", { className: `task ${item.done ? "done" : ""}`, key: item.id },
              h("input", { type: "checkbox", className: "task-check", "aria-label": `完成 ${item.title}`, checked: !!item.done, disabled: busy,
                onChange: event => save("PATCH", { id: item.id, kind: "todo", done: +event.target.checked }) }),
              h("span", { title: item.title }, item.title), h("button", { type: "button", className: "delete", "aria-label": `删除待办 ${item.title}`, disabled: busy, onClick: () => save("DELETE", { id: item.id }) }, "×"))),
              !todos.length && h("p", { className: "empty" }, ready ? "还没有待办。写下想做的第一件小事吧。" : "正在读取…")),
            todos.length > 4 && h("button", { type: "button", className: `project-overflow todo-overflow ${showAllTodos ? "showing-all" : ""}`, "aria-expanded": showAllTodos, "aria-controls": "todo-list", onClick: () => setShowAllTodos(!showAllTodos) },
              h("span", null, showAllTodos ? "收起其余待办" : `还有 ${todos.length - 4} 条待办，点击展开`), h("span", { className: `date-chevron ${showAllTodos ? "open" : ""}`, "aria-hidden": true }, "⌄")),
            h("form", { className: "todo-input", onSubmit: async event => { event.preventDefault(); const text = todo; if (text.trim() && await save("POST", { kind: "todo", title: text.trim() })) setTodo(current => current === text ? "" : current); } },
              h("input", { "aria-label": "新待办事项", placeholder: "添加一件小事…", value: todo, maxLength: 300, onChange: e => setTodo(e.target.value) }),
              h("button", { type: "submit", disabled: !ready || busy || !todo.trim(), "aria-label": "添加待办" }, "＋")),
            h("p", { className: "footnote" }, "不必赶路，也在向前。")),
          show("note") && h("section", { className: "panel notes projects-panel", "aria-labelledby": "projects-title" },
            h("small", null, "02 / NOTEBOOK"),
            h("div", { className: "heading project-heading" }, h("h2", { id: "projects-title" }, "正在进行"),
              h("button", { type: "button", className: "soft", disabled: !ready || busy, onClick: () => save("POST", { kind: "note", title: "新的项目", body: "" }) }, "＋ 新项目")),
            h("p", { className: "subtitle" }, "想法有落点，进展有记录。"),
            h("div", { id: "project-list", className: `project-list ${!openProject && !showAllProjects && projectLimit.overflow ? "is-clipped" : ""}`,
                style: !openProject && !showAllProjects ? { maxHeight: projectLimit.height } : undefined,
                onFocusCapture: event => {
                  if (event.target.getBoundingClientRect().bottom > event.currentTarget.getBoundingClientRect().bottom)
                    setShowAllProjects(true);
                } },
                h("div", { className: "project-list-content" },
              projects.map((item, index) => h("div", { key: item.id, className: "project-list-item", hidden: !visibleProjects.some(row => row.id === item.id) },
                h(Project, { item, index, busy, save, expanded: openProject === item.id,
                  onSaved: () => { setOpenProject(null); setShowAllProjects(false); },
                  setExpanded: open => { setOpenProject(current => open ? item.id : current === item.id ? null : current); } }))))),
            !openProject && projectLimit.overflow && h("button", { type: "button", className: `project-overflow projects-overflow ${showAllProjects ? "showing-all" : ""}`,
              "aria-expanded": showAllProjects, "aria-controls": "project-list", onClick: () => setShowAllProjects(!showAllProjects) },
              h("span", null, showAllProjects ? "收起超出部分" : "展开剩余项目"),
              h("span", { className: `date-chevron ${showAllProjects ? "open" : ""}`, "aria-hidden": true }, "⌄")),
            !visibleProjects.length && h("div", { className: "note-empty" }, h("span", null, "↗"), h("h3", null, "让想法从这里开始"), h("p", null, "添加一个项目，随时写下新的进展。"),
              h("button", { type: "button", disabled: !ready || busy, onClick: () => save("POST", { kind: "note", title: "我的第一个项目", body: "" }) }, "创建项目 ＋")),
            h("p", { className: "footnote" }, "✧ 每一点进展，都算数。")),
          show("diary") && h("section", { className: "panel journal", "aria-labelledby": "journal-title" },
            h("small", null, "03 / JOURNAL"),
            h("div", { className: "heading paper-heading" }, h("h2", { id: "journal-title" }, "日子里的片段"),
              h("button", { type: "button", className: "expand-writer", onClick: () => setFullscreen("diary"), "aria-label": "全屏书写小纸条" }, "⛶ 全屏")),
            h("p", { className: "subtitle" }, "把此刻的心情，折成一张小纸条。"),
            h(Calendar, { value: day, onChange: setDay, entries: diaries }),
            diaryForm(false),
            h("div", { className: "heading diary-heading" }, h("h3", null, "最近的小纸条"),
              h("button", { type: "button", className: "view-all-papers", onClick: () => setArchive("diary") }, `全部 ${diaries.length} 条 ↗`)),
            recent.slice(0, 2).map(item => h("article", { className: "entry", key: item.id }, h("small", null, `${entryDay(item)} · ${time(item)}`), h("p", null, item.body),
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
      !archive && !fullscreen && !selectedTool && undoNotice,
      selectedTool && h(Modal, { titleId: "tool-reader-title", className: "archive-dialog tool-reader", onClose: () => setSelectedTool(null) },
        h("div", { className: "archive-top" }, h("div", { className: "archive-heading" },
          h("div", null, h("small", null, "小工具"), h("h2", { id: "tool-reader-title" }, openedTool?.title || "小工具条目"),
            openedTool && h("p", null, fullDate(entryDay(openedTool)))),
          h("button", { type: "button", className: "close-button", "aria-label": "关闭小工具全文", onClick: () => setSelectedTool(null) }, "关闭 ×"))),
        undoNotice,
        error && h("p", { className: "error", role: "alert" }, error),
        h("div", { className: "archive-scroll" }, openedTool
          ? h(ArchiveEntry, { key: openedTool.id, item: openedTool, day: entryDay(openedTool), editable: true, busy, save })
          : h("p", { className: "empty" }, "条目已移除"))),
      fullscreen && h(Modal, { titleId: "writer-title", className: `writer-dialog ${fullscreen === "diary" ? "paper-writer" : ""}`, onClose: () => setFullscreen(false) },
        undoNotice,
        h("div", { className: "writer-top" }, h("div", null, h("small", null, "A MOMENT, JUST FOR WRITING"), h("h2", { id: "writer-title" }, fullscreen === "diary" ? "小纸条" : fullscreen === "tool" ? "小工具" : "流水账")),
          h("button", { type: "button", className: "close-button", onClick: () => setFullscreen(false) }, "退出全屏 ×")),
        h("div", { className: "writer-body" }, h("p", { className: "writer-date" }, fullDate(fullscreen === "diary" ? day : dayKey())),
          error && h("p", { className: "error", role: "alert" }, error), fullscreen === "diary" ? diaryForm(true) : fullscreen === "tool" ? toolForm(true) : logForm(true))),
      archive && h(Archive, { kind: archive, items: visibleItems, busy, error, save, undoNotice, onClose: () => setArchive(null) }));
  }
  createRoot(document.getElementById("root")).render(h(Notebook));
})();
