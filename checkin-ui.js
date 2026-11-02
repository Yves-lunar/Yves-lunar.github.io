/* 打卡抽签页面。数据经由 notebook-ui.js 传入的 run() 读写同一张云端表。 */
(function () {
  "use strict";
  const { React } = window.LITTLE_DAYS_RUNTIME;
  const { useState, useEffect, useRef } = React;
  const h = React.createElement;
  const M = window.LITTLE_DAYS_CHECKIN_MODEL;
  const PREFIX = "她今天";
  let cachedConfig = null;
  const getConfig = () => cachedConfig || (cachedConfig = M.normalizeConfig(window.LITTLE_DAYS_CHECKIN));

  const fmt = value => Number.isInteger(value) ? String(value) : value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
  const weekday = day => "日一二三四五六"[new Date(`${day}T12:00:00`).getDay()];
  const shortDate = day => `${Number(day.slice(5, 7))}月${Number(day.slice(8, 10))}日`;
  const longDate = day => `${shortDate(day)} 周${weekday(day)}`;
  const userError = message => ({ userMessage: message });
  const sentence = text => text.trim().replace(/^她今天\s*/, "").slice(0, M.TEXT_LIMIT);
  const reducedMotion = () => !!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  function formOf(checkin) {
    return checkin ? { done: checkin.done, text: checkin.text, score: checkin.score } : { done: null, text: "", score: null };
  }
  const sameForm = (a, b) => a.done === b.done && a.text === b.text && a.score === b.score;

  function Notice({ message }) {
    return message ? h("p", { className: "card-error", role: "alert" }, message) : null;
  }

  function TodayCard({ config, today, saved, drawn, ready, busy, run, compact = false, onDone, onCancel }) {
    const [form, setForm] = useState(() => formOf(saved));
    const [status, setStatus] = useState("");
    const [problem, setProblem] = useState("");
    const base = useRef({ day: today, value: formOf(saved) });
    useEffect(() => {
      const next = formOf(saved);
      const previous = base.current;
      // A new day starts empty; a remote update only replaces an untouched form.
      if (previous.day !== today) { setForm(next); setStatus(""); setProblem(""); }
      else setForm(current => sameForm(current, previous.value) ? next : current);
      base.current = { day: today, value: next };
    }, [today, saved && saved.id, saved && saved.done, saved && saved.text, saved && saved.score]);
    const changed = !sameForm({ ...form, text: sentence(form.text) }, formOf(saved));
    function update(patch) { setForm(current => ({ ...current, ...patch })); setStatus(""); setProblem(""); }
    async function submit(event) {
      event.preventDefault();
      if (busy || form.done === null || !changed) return;
      const snapshot = { ...form, text: sentence(form.text) };
      const result = await run(async ({ list, mutate }) => {
        const day = M.dayKey();
        if (day !== today) throw userError("已经过了零点，页面换到了新的一天，请重新填写。");
        const fresh = M.collect(await list());
        const current = fresh.checkins.get(day);
        if (fresh.draws.has(day) && !snapshot.done) throw userError("今天已经抽过签，不能改成“没做”。一句话和评分仍可修改。");
        const body = JSON.stringify({ ...(current ? current.raw : {}), v: 1, done: snapshot.done,
          text: snapshot.text, score: snapshot.score, updated: new Date().toISOString() });
        if (current) await mutate("PATCH", { id: current.id, body });
        else await mutate("POST", { kind: "checkin", day, body });
      });
      if (result.ok) {
        setForm(current => sameForm(current, form) ? snapshot : current);
        setStatus(saved ? "修改已保存" : snapshot.done ? "已打卡，可以去抽签了" : "已记下今天没做");
        if (onDone) onDone();
      } else setProblem(result.message);
    }
    const hint = status || (changed ? "有未保存的修改"
      : saved ? (saved.done ? "今天已打卡，当天都可以修改" : "已记下今天没做，当天都可以修改") : "今天还没打卡");
    return h("form", { className: `checkin-card today-card${compact ? " is-compact" : ""}`, onSubmit: submit,
        ...(compact ? { "aria-label": "今天的打卡" } : { "aria-labelledby": "today-card-title" }) },
      !compact && h("div", { className: "card-head" }, h("h3", { id: "today-card-title" }, "今天"), h("span", null, longDate(today))),
      h("fieldset", { className: "field" },
        h("legend", null, config.label),
        h("div", { className: "segmented two" }, [[true, "做了"], [false, "没做"]].map(([value, label]) =>
          h("button", { type: "button", key: label, "aria-pressed": form.done === value,
            disabled: busy || (!!drawn && value === false), title: drawn && value === false ? "今天已经抽过签" : undefined,
            onClick: () => update({ done: value }) }, label)))),
      h("label", { className: "field sentence-field" },
        h("span", { className: "field-label" }, "一句话"),
        h("span", { className: "sentence" }, h("span", { className: "sentence-prefix", "aria-hidden": true }, PREFIX),
          h("input", { value: form.text, maxLength: M.TEXT_LIMIT, placeholder: "……", disabled: busy, "aria-label": "她今天……一句话",
            onChange: event => update({ text: event.target.value }) }))),
      h("fieldset", { className: "field" },
        h("legend", null, "今天几分", h("span", { className: "legend-value" }, form.score === null ? "未评分" : `${form.score} / 10`)),
        h("div", { className: "score-row" }, Array.from({ length: 11 }, (_, score) =>
          h("button", { type: "button", key: score, "aria-pressed": form.score === score, "aria-label": `${score} 分`, disabled: busy,
            onClick: () => update({ score: form.score === score ? null : score }) }, score)))),
      drawn && h("p", { className: "card-note" }, "今天的签已抽，“做了”会保持不变。"),
      h(Notice, { message: problem }),
      h("div", { className: "card-foot" },
        h("span", { role: "status" }, compact && !saved && !changed ? "选好“做了”并保存，就能在旁边抽签" : hint),
        onCancel && h("button", { type: "button", className: "button-quiet", disabled: busy, onClick: () => { setForm(formOf(saved)); setProblem(""); onCancel(); } }, "取消"),
        h("button", { type: "submit", className: "button-primary", disabled: !ready || busy || form.done === null || !changed },
          busy ? "正在保存…" : saved ? "保存修改" : "保存打卡")));
  }

  function LotStage({ phase, result, unit }) {
    const sticks = [[58, 52, -7], [74, 34, -3], [86, 46, -1], [114, 40, 2], [128, 30, 4], [142, 54, 8]];
    return h("div", { className: `lot-stage is-${phase}`, "aria-hidden": true }, h("div", { className: "lot-scale" },
      h("div", { className: "lot-cup" },
        h("svg", { className: "lot-layer", viewBox: "0 0 200 240", width: 200, height: 240 },
          h("ellipse", { className: "cup-inner", cx: 100, cy: 118, rx: 60, ry: 9 }),
          sticks.map(([x, top, tilt]) => h("g", { key: x, transform: `rotate(${tilt} ${x} 200)` },
            h("rect", { className: "stick", x: x - 7, y: top, width: 14, height: 200 - top, rx: 3 }),
            h("rect", { className: "stick-tip", x: x - 7, y: top, width: 14, height: 13, rx: 3 })))),
        h("div", { className: "lot-stick" },
          h("div", { className: "lot-face lot-front" }, h("span", { className: "lot-tip" })),
          h("div", { className: "lot-face lot-back" }, result && h(React.Fragment, null,
            h("strong", null, fmt(result.amount)), h("span", null, unit),
            result.lucky && h("em", null, `×${fmt(result.multiplier)}`)))),
        h("svg", { className: "lot-layer lot-front-layer", viewBox: "0 0 200 240", width: 200, height: 240 },
          h("path", { className: "cup-body", d: "M40 118 A60 9 0 0 0 160 118 L152 226 Q151 234 143 234 L57 234 Q49 234 48 226 Z" }),
          h("path", { className: "cup-band", d: "M43.6 156 Q100 166 156.4 156 L155.2 172 Q100 182 44.8 172 Z" }),
          h("text", { className: "cup-mark", x: 100, y: 214, textAnchor: "middle" }, "签")))));
  }

  function DrawCard({ config, today, saved, drawn, ready, busy, run, compact = false, onStart }) {
    const [phase, setPhase] = useState(drawn ? "open" : "idle");
    const [result, setResult] = useState(drawn);
    const [problem, setProblem] = useState("");
    const [note, setNote] = useState("");
    const pendingPrize = useRef(null);
    const timers = useRef([]);
    const moving = phase === "shaking" || phase === "rising";
    useEffect(() => () => timers.current.forEach(clearTimeout), []);
    useEffect(() => {
      if (moving) return;
      // Show a draw made on another device; reset when a new day starts.
      if (drawn) { setResult(drawn); setPhase("open"); }
      else { setResult(null); setPhase("idle"); setNote(""); }
    }, [today, drawn && drawn.id]);
    const wait = ms => new Promise(resolve => timers.current.push(setTimeout(resolve, ms)));
    async function draw() {
      if (busy || phase !== "idle") return;
      const started = Date.now();
      let outcome = null, repeat = false;
      setProblem(""); setNote(""); setPhase("shaking");
      if (onStart) onStart();
      const response = await run(async ({ list, mutate }) => {
        const day = M.dayKey();
        if (day !== today) throw userError("已经过了零点，请先给新的一天打卡。");
        const fresh = M.collect(await list());
        const existing = fresh.draws.get(day);
        if (existing) { outcome = existing; repeat = true; return; }
        const checkin = fresh.checkins.get(day);
        if (!checkin || !checkin.done) throw userError("先把今天标成“做了”并保存，再来抽签。");
        // A failed save keeps the same prize, so retrying never re-rolls it.
        if (!pendingPrize.current || pendingPrize.current.day !== day) pendingPrize.current = { day, prize: M.drawPrize(config) };
        const item = await mutate("POST", { kind: "draw", day,
          body: JSON.stringify({ v: 1, ...pendingPrize.current.prize, at: new Date().toISOString() }) });
        pendingPrize.current = null;
        outcome = M.parseDraw(item);
      });
      if (!response.ok || !outcome) { setPhase("idle"); setProblem(response.message || "抽签没有保存成功，请重试。"); return; }
      setResult(outcome);
      if (!reducedMotion()) {
        await wait(Math.max(0, 900 - (Date.now() - started)));
        setPhase("rising");
        await wait(520);
      }
      setPhase("open");
      if (repeat) setNote("今天在别的设备上已经抽过了，这是那支签。");
    }
    const canDraw = ready && !busy && phase === "idle" && !!saved && saved.done && !drawn;
    const caption = phase === "shaking" || phase === "rising" ? "签筒在晃……"
      : phase === "open" && result ? null
      : !saved ? "今天打卡并标记“做了”后，可以抽一支签。"
      : !saved.done ? "今天没做，签筒明天再开。"
      : compact ? "今天做到了，抽一支吧。" : "今天做到了，抽一支吧。每天一次，抽完不能重抽。";
    return h("section", { className: `checkin-card draw-card${compact ? " is-compact" : ""}`, ...(compact ? { "aria-label": "抽签" } : { "aria-labelledby": "draw-card-title" }) },
      !compact && h("div", { className: "card-head" }, h("h3", { id: "draw-card-title" }, "抽签"), h("span", null, "每天一支")),
      h("div", { className: "draw-body" },
        h(LotStage, { phase, result, unit: config.unit }),
        h("div", { className: "draw-side" },
          h("div", { "aria-live": "polite", className: "draw-result" },
            phase === "open" && result ? h(React.Fragment, null,
              h("p", { className: "draw-amount" }, h("strong", null, fmt(result.amount)), ` ${config.unit}`),
              result.lucky && h("p", { className: "lucky-tag" }, `幸运暴击 ×${fmt(result.multiplier)}`, h("span", null, `原签 ${fmt(result.base)} ${config.unit}`)),
              h("p", { className: "draw-caption" }, compact ? "已记入待充。" : "已记入待充。明天再来。"))
              : h("p", { className: "draw-caption" }, caption)),
          note && h("p", { className: "card-note" }, note),
          h(Notice, { message: problem }),
          phase !== "open" && h("button", { type: "button", className: "button-primary draw-button", disabled: !canDraw, onClick: draw },
            moving ? "正在抽签…" : "抽一支签"))));
  }

  function Figure({ label, value, unit, accent }) {
    return h("div", { className: `figure${accent ? " is-accent" : ""}` },
      h("dt", null, label), h("dd", null, h("strong", null, value), unit && h("span", null, unit)));
  }

  function WalletCard({ config, summary, topups, ready, busy, run, save }) {
    const [open, setOpen] = useState(false);
    const [platform, setPlatform] = useState(config.platforms[0]);
    const [amount, setAmount] = useState("");
    const [status, setStatus] = useState("");
    const [problem, setProblem] = useState("");
    const [showAll, setShowAll] = useState(false);
    const value = M.money(Number(amount));
    const valid = Number.isFinite(value) && value > 0 && value <= summary.pending;
    function start() {
      setAmount(fmt(summary.pending)); setStatus(""); setProblem("");
      setPlatform(current => config.platforms.includes(current) ? current : config.platforms[0]);
      setOpen(true);
    }
    async function submit(event) {
      event.preventDefault();
      if (busy || !valid) return;
      const chosen = platform;
      const response = await run(async ({ list, mutate }) => {
        const fresh = M.summarize(M.collect(await list()), config);
        if (value > fresh.pending) throw userError(`待充只有 ${fmt(fresh.pending)} ${config.unit}，请改小金额。`);
        await mutate("POST", { kind: "topup", day: M.dayKey(),
          body: JSON.stringify({ v: 1, amount: value, platform: chosen, at: new Date().toISOString() }) });
      });
      if (response.ok) { setOpen(false); setStatus(`已记下：充到${chosen} ${fmt(value)} ${config.unit}`); }
      else setProblem(response.message);
    }
    const shown = showAll ? topups : topups.slice(0, 5);
    return h("section", { className: "checkin-card wallet-card", "aria-labelledby": "wallet-card-title" },
      h("div", { className: "card-head" }, h("h3", { id: "wallet-card-title" }, "抽到的钱"), h("span", null, "先记待充，再统一充值")),
      h("dl", { className: "figures three" },
        h(Figure, { label: "累计抽到", value: fmt(summary.drawn), unit: config.unit }),
        h(Figure, { label: "已充", value: fmt(summary.charged), unit: config.unit }),
        h(Figure, { label: "待充", value: fmt(summary.pending), unit: config.unit, accent: summary.pending > 0 })),
      open ? h("form", { className: "topup-form", onSubmit: submit, "aria-label": "记一笔充值" },
        h("fieldset", { className: "field" }, h("legend", null, "充到哪里"),
          h("div", { className: `segmented${config.platforms.length === 2 ? " two" : ""}` }, config.platforms.map(name =>
            h("button", { type: "button", key: name, "aria-pressed": platform === name, disabled: busy, onClick: () => setPlatform(name) }, name)))),
        h("label", { className: "field amount-field" }, h("span", { className: "field-label" }, "金额"),
          h("span", { className: "amount-input" },
            h("input", { type: "number", inputMode: "decimal", min: 0, step: "any", max: summary.pending, value: amount, disabled: busy,
              onChange: event => { setAmount(event.target.value); setProblem(""); } }),
            h("span", null, config.unit)),
          h("small", null, `最多 ${fmt(summary.pending)} ${config.unit}（当前待充）`)),
        h(Notice, { message: problem }),
        h("div", { className: "card-foot" },
          h("button", { type: "button", className: "button-quiet", disabled: busy, onClick: () => { setOpen(false); setProblem(""); } }, "取消"),
          h("button", { type: "submit", className: "button-primary", disabled: !ready || busy || !valid }, busy ? "正在保存…" : "确认已充")))
        : h("div", { className: "card-foot" },
          h("span", { role: "status" }, status || (summary.pending > 0 ? "充完后点一下，记一笔" : "暂时没有待充")),
          h("button", { type: "button", className: "button-soft", disabled: !ready || busy || summary.pending <= 0, onClick: start }, "本周已充")),
      h("div", { className: "topup-history" },
        h("h4", null, "充值记录", h("span", null, `${topups.length} 笔`)),
        topups.length ? h("ul", null, shown.map(row => h("li", { key: row.id },
          h("time", { dateTime: row.day }, shortDate(row.day)),
          h("span", { className: "platform" }, row.platform),
          h("strong", null, `${fmt(row.amount)} ${config.unit}`),
          h("button", { type: "button", className: "row-delete", disabled: busy, "aria-label": `删除 ${shortDate(row.day)} 充到${row.platform}的 ${fmt(row.amount)} ${config.unit}`,
            onClick: () => save("DELETE", { id: row.id }) }, "删除"))))
          : h("p", { className: "muted" }, "还没有充值记录。"),
        topups.length > 5 && h("button", { type: "button", className: "button-link", onClick: () => setShowAll(!showAll) },
          showAll ? "收起" : `查看全部 ${topups.length} 笔`)));
  }

  function StatsCard({ config, summary }) {
    const max = Math.max(1, ...summary.tiers.map(tier => tier.count));
    return h("section", { className: "checkin-card stats-card", "aria-labelledby": "stats-card-title" },
      h("div", { className: "card-head" }, h("h3", { id: "stats-card-title" }, "统计"), h("span", null, `共抽 ${summary.drawCount} 次`)),
      h("dl", { className: "figures three" },
        h(Figure, { label: "打卡天数", value: summary.doneDays, unit: "天" }),
        h(Figure, { label: "当前连续", value: summary.streak, unit: "天" }),
        h(Figure, { label: "幸运暴击", value: summary.luckyCount, unit: "次" })),
      h("h4", null, "各档抽中次数"),
      h("ul", { className: "tier-bars" }, summary.tiers.map(tier => h("li", { key: tier.amount },
        h("span", { className: "tier-label" }, `${fmt(tier.amount)} ${config.unit}`),
        h("span", { className: "tier-track", "aria-hidden": true }, h("span", { style: { width: `${tier.count / max * 100}%` } })),
        h("span", { className: "tier-count" }, `${tier.count} 次`),
        h("span", { className: "tier-share" }, tier.share === null ? "已停用" : `${Math.round(tier.share * 1000) / 10}%`)))),
      h("p", { className: "muted" }, `按现在的设置，每支签平均约 ${fmt(config.expected)} ${config.unit}（含${config.luckyChance}%的暴击 ×${fmt(config.luckyMultiplier)}）。`));
  }

  function MonthCard({ config, state, today }) {
    const [month, setMonth] = useState(() => ({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }));
    const [selected, setSelected] = useState(today);
    const cells = M.monthCells(month.y, month.m);
    const move = offset => setMonth(current => {
      const date = new Date(current.y, current.m + offset, 1, 12);
      return { y: date.getFullYear(), m: date.getMonth() };
    });
    const checkin = state.checkins.get(selected);
    const draw = state.draws.get(selected);
    const label = day => {
      const c = state.checkins.get(day), d = state.draws.get(day);
      return `${longDate(day)}，${c ? (c.done ? "做了" : "没做") : day > today ? "未到" : "没有打卡"}${d ? `，抽到 ${fmt(d.amount)} ${config.unit}` : ""}`;
    };
    return h("section", { className: "checkin-card month-card", "aria-labelledby": "month-card-title" },
      h("div", { className: "card-head" }, h("h3", { id: "month-card-title" }, "月历"),
        h("div", { className: "month-nav" },
          h("button", { type: "button", "aria-label": "上个月", onClick: () => move(-1) }, "‹"),
          h("strong", { "aria-live": "polite" }, `${month.y} 年 ${month.m + 1} 月`),
          h("button", { type: "button", "aria-label": "下个月", onClick: () => move(1) }, "›"))),
      h("div", { className: "month-body" },
        h("div", { className: "month-calendar" },
          h("div", { className: "month-grid", role: "group", "aria-label": "选择日期查看打卡" },
            [..."一二三四五六日"].map(day => h("span", { key: day, className: "weekday" }, day)),
            cells.map((day, index) => day === null ? h("span", { key: `blank-${index}`, "aria-hidden": true }) : (() => {
              const c = state.checkins.get(day);
              const classes = ["month-day", c && c.done ? "is-done" : "", c && !c.done ? "is-missed" : "",
                state.draws.has(day) ? "has-draw" : "", day === today ? "is-today" : ""].filter(Boolean).join(" ");
              return h("button", { type: "button", key: day, className: classes, "aria-label": label(day), "aria-pressed": selected === day,
                "aria-current": day === today ? "date" : undefined, disabled: day > today, onClick: () => setSelected(day) }, Number(day.slice(8)));
            })())),
          h("div", { className: "month-legend" },
            h("span", { className: "legend-done" }, "做了"), h("span", { className: "legend-missed" }, "没做"), h("span", { className: "legend-today" }, "今天"),
            h("button", { type: "button", className: "button-link", onClick: () => { setMonth({ y: Number(today.slice(0, 4)), m: Number(today.slice(5, 7)) - 1 }); setSelected(today); } }, "回到今天"))),
        h("div", { className: "day-detail", "aria-live": "polite" },
          h("h4", null, longDate(selected), selected === today && h("span", null, "今天")),
          checkin ? h("dl", null,
            h("div", null, h("dt", null, "状态"), h("dd", null, h("span", { className: `status-chip ${checkin.done ? "is-done" : "is-missed"}` }, checkin.done ? "做了" : "没做"))),
            h("div", null, h("dt", null, "一句话"), h("dd", { className: checkin.text ? "" : "muted" }, checkin.text ? `${PREFIX}${checkin.text}` : "这天没有写")),
            h("div", null, h("dt", null, "评分"), h("dd", null, checkin.score === null ? h("span", { className: "muted" }, "未评分") : `${checkin.score} / 10`)),
            h("div", null, h("dt", null, "抽签"), h("dd", null, draw
              ? h(React.Fragment, null, h("strong", { className: "detail-amount" }, `${fmt(draw.amount)} ${config.unit}`),
                draw.lucky && h("span", { className: "muted" }, ` 幸运暴击 ×${fmt(draw.multiplier)}，原签 ${fmt(draw.base)} ${config.unit}`))
              : h("span", { className: "muted" }, checkin.done ? "这天没有抽签" : "没做，不抽签"))))
            : h("p", { className: "muted" }, "这一天没有打卡记录。"))));
  }

  function CheckinPage({ items, ready, busy, run, save, today }) {
    const config = getConfig();
    const state = M.collect(items);
    const summary = M.summarize(state, config, today);
    const saved = state.checkins.get(today) || null;
    const drawn = state.draws.get(today) || null;
    const shared = { config, today, ready, busy, run };
    return h("section", { className: "checkin-page", "aria-labelledby": "checkin-title" },
      h("div", { className: "checkin-intro" },
        h("h2", { id: "checkin-title" }, "打卡抽签"),
        h("p", null, "每天记一笔。做到了，就从签筒里抽一支。")),
      !ready ? h("p", { className: "empty" }, "正在读取…") : h("div", { className: "checkin-grid" },
        h(TodayCard, { ...shared, saved, drawn }),
        h(DrawCard, { ...shared, saved, drawn }),
        h(WalletCard, { ...shared, summary, topups: state.topups, save }),
        h(StatsCard, { config, summary }),
        h(MonthCard, { config, state, today })));
  }

  // 主页顶部的每日签到条：一进来就能打卡、抽签；抽完后收成一行。
  function WeekStrip({ state, today, unit }) {
    const monday = M.shiftDay(today, -((new Date(`${today}T12:00:00`).getDay() + 6) % 7));
    const days = Array.from({ length: 7 }, (_, index) => M.shiftDay(monday, index));
    return h("ol", { className: "week-strip", "aria-label": "本周打卡" }, days.map(day => {
      const c = state.checkins.get(day), d = state.draws.get(day);
      const status = c ? (c.done ? "done" : "missed") : day > today ? "future" : day === today ? "open" : "empty";
      const text = { done: "做了", missed: "没做", future: "未到", open: "还没打卡", empty: "没有打卡" }[status];
      return h("li", { key: day, className: `week-day is-${status}${day === today ? " is-today" : ""}`,
        "aria-label": `周${weekday(day)} ${shortDate(day)}，${text}${d ? `，抽到 ${fmt(d.amount)} ${unit}` : ""}` },
        h("span", { className: "week-name", "aria-hidden": true }, weekday(day)),
        h("span", { className: "week-mark", "aria-hidden": true }, Number(day.slice(8))),
        h("span", { className: "week-prize", "aria-hidden": true }, d ? fmt(d.amount) : ""));
    }));
  }

  function CheckinBanner({ items, ready, busy, run, today, openPage }) {
    const config = getConfig();
    const [editing, setEditing] = useState(false);
    const [fresh, setFresh] = useState(false);
    useEffect(() => { setEditing(false); setFresh(false); }, [today]);
    const state = M.collect(items);
    const summary = M.summarize(state, config, today);
    const saved = state.checkins.get(today) || null;
    const drawn = state.draws.get(today) || null;
    const formOpen = !saved || editing;
    // Keep the cup on screen while a draw made in this visit animates and shows its stick.
    const drawOpen = !!saved && saved.done && (!drawn || fresh);
    const shared = { config, today, ready, busy, run, saved, drawn };
    return h("section", { className: `checkin-banner${formOpen || drawOpen ? "" : " is-folded"}`, "aria-labelledby": "banner-title" },
      h("div", { className: "banner-head" },
        h("div", { className: "banner-title" },
          h("h2", { id: "banner-title" }, "今日打卡"),
          h("span", null, longDate(today)),
          ready && h("span", { className: "banner-meta" }, `连续 ${summary.streak} 天`, h("i", { "aria-hidden": true }, "/"), `待充 ${fmt(summary.pending)} ${config.unit}`)),
        h("div", { className: "banner-tools" },
          ready && h(WeekStrip, { state, today, unit: config.unit }),
          h("button", { type: "button", className: "banner-link", onClick: openPage }, "统计与充值", h("span", { "aria-hidden": true }, " ›")))),
      !ready ? h("p", { className: "muted banner-loading" }, "正在读取…")
        : h("div", { className: `banner-body${drawOpen ? " has-draw" : ""}` },
          formOpen
            ? h(TodayCard, { ...shared, compact: true, onDone: () => setEditing(false), onCancel: saved ? () => setEditing(false) : undefined })
            : h("div", { className: "banner-summary" },
              h("span", { className: `status-chip ${saved.done ? "is-done" : "is-missed"}` }, saved.done ? "已打卡" : "今天没做"),
              h("p", null, saved.text ? `${PREFIX}${saved.text}` : h("span", { className: "muted" }, "今天还没写一句话")),
              saved.score !== null && h("span", { className: "banner-score" }, `${saved.score} 分`),
              drawn && !fresh && h("span", { className: "banner-amount" }, `抽到 ${fmt(drawn.amount)} ${config.unit}`,
                drawn.lucky && h("small", null, `暴击 ×${fmt(drawn.multiplier)}`)),
              h("button", { type: "button", className: "button-link", disabled: busy, onClick: () => setEditing(true) }, "修改")),
          drawOpen && h(DrawCard, { ...shared, compact: true, onStart: () => setFresh(true) })));
  }

  window.LITTLE_DAYS_CHECKIN_UI = CheckinPage;
  window.LITTLE_DAYS_CHECKIN_BANNER = CheckinBanner;
})();
