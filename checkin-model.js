/* 打卡抽签：纯数据逻辑（无界面、无网络），浏览器和 node 测试共用。 */
(function (root) {
  "use strict";

  const DEFAULTS = Object.freeze({
    label: "今天做了吗",
    prizes: [
      { amount: 10, chance: 40 }, { amount: 20, chance: 28 }, { amount: 30, chance: 14 },
      { amount: 50, chance: 10 }, { amount: 80, chance: 5 }, { amount: 100, chance: 3 }
    ],
    luckyChance: 40,
    luckyMultiplier: 2,
    platforms: ["网易", "苹果"],
    unit: "元",
    dayStartsAt: 0
  });
  const TEXT_LIMIT = 200;

  function dayKey(date = new Date()) {
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  }
  function shiftDay(day, offset) {
    const date = new Date(`${day}T12:00:00`);
    date.setDate(date.getDate() + offset);
    return dayKey(date);
  }
  const money = value => Math.round(value * 100) / 100;

  // 概率按权重归一化：加起来不是 100 也能用，只是在控制台提醒一次。
  function normalizeConfig(raw) {
    const input = raw && typeof raw === "object" ? raw : {};
    let prizes = (Array.isArray(input.prizes) ? input.prizes : [])
      .map(prize => ({ amount: Number(prize && prize.amount), chance: Number(prize && prize.chance) }))
      .filter(prize => Number.isFinite(prize.amount) && prize.amount > 0 && Number.isFinite(prize.chance) && prize.chance > 0);
    if (!prizes.length) prizes = DEFAULTS.prizes.map(prize => ({ ...prize }));
    const total = prizes.reduce((sum, prize) => sum + prize.chance, 0);
    const luckyChance = Number.isFinite(Number(input.luckyChance)) ? Math.min(100, Math.max(0, Number(input.luckyChance))) : DEFAULTS.luckyChance;
    const luckyMultiplier = Number(input.luckyMultiplier) > 0 ? Number(input.luckyMultiplier) : DEFAULTS.luckyMultiplier;
    const platforms = (Array.isArray(input.platforms) ? input.platforms : [])
      .filter(name => typeof name === "string" && name.trim()).map(name => name.trim());
    const withShare = prizes.map(prize => ({ ...prize, share: prize.chance / total }));
    const base = withShare.reduce((sum, prize) => sum + prize.amount * prize.share, 0);
    return Object.freeze({
      label: typeof input.label === "string" && input.label.trim() ? input.label.trim() : DEFAULTS.label,
      prizes: withShare,
      total,
      luckyChance,
      luckyMultiplier,
      platforms: platforms.length ? platforms : [...DEFAULTS.platforms],
      unit: typeof input.unit === "string" && input.unit.trim() ? input.unit.trim() : DEFAULTS.unit,
      dayStartsAt: Number.isInteger(input.dayStartsAt) && input.dayStartsAt >= 0 && input.dayStartsAt <= 12 ? input.dayStartsAt : DEFAULTS.dayStartsAt,
      expected: money(base * (1 + luckyChance / 100 * (luckyMultiplier - 1)))
    });
  }

  // 打卡的“今天”：凌晨 dayStartsAt 点之前仍算前一天（像游戏的每日重置）。
  function checkinDay(config, now = new Date()) {
    return dayKey(new Date(now.getTime() - (config.dayStartsAt || 0) * 3600000));
  }

  function secureRandom() {
    const cryptoApi = root.crypto;
    if (cryptoApi && cryptoApi.getRandomValues) {
      const value = new Uint32Array(1);
      cryptoApi.getRandomValues(value);
      return value[0] / 4294967296;
    }
    return Math.random();
  }

  // 放回抽取：每次独立，只看配置，不看历史。
  function drawPrize(config, random = secureRandom) {
    let roll = random() * config.total;
    let picked = config.prizes[config.prizes.length - 1];
    for (const prize of config.prizes) {
      if (roll < prize.chance) { picked = prize; break; }
      roll -= prize.chance;
    }
    const lucky = random() * 100 < config.luckyChance;
    const multiplier = lucky ? config.luckyMultiplier : 1;
    return { base: picked.amount, lucky, multiplier, amount: money(picked.amount * multiplier) };
  }

  function readJSON(text) {
    try {
      const value = JSON.parse(text);
      return value && typeof value === "object" && !Array.isArray(value) ? value : null;
    } catch { return null; }
  }

  function parseCheckin(item) {
    const data = readJSON(item.body) || {};
    const score = typeof data.score === "number" && Number.isInteger(data.score * 2) && data.score >= 0 && data.score <= 10 ? data.score : null;
    return { id: item.id, day: item.day, created: item.created, raw: data,
      done: data.done === true, text: typeof data.text === "string" ? data.text : "", score };
  }
  function parseDraw(item) {
    const data = readJSON(item.body);
    const amount = data && Number(data.amount);
    if (!data || !Number.isFinite(amount) || amount <= 0) return null;
    const multiplier = Number(data.multiplier) > 0 ? Number(data.multiplier) : 1;
    const base = Number(data.base) > 0 ? Number(data.base) : money(amount / multiplier);
    return { id: item.id, day: item.day, created: item.created, base, amount, multiplier,
      lucky: data.lucky === true, at: typeof data.at === "string" ? data.at : item.created };
  }
  function parseTopup(item) {
    const data = readJSON(item.body);
    const amount = data && Number(data.amount);
    if (!data || !Number.isFinite(amount) || amount <= 0) return null;
    return { id: item.id, day: item.day, created: item.created, amount,
      platform: typeof data.platform === "string" && data.platform ? data.platform : "未注明",
      at: typeof data.at === "string" ? data.at : item.created };
  }

  // 同一天如果因为两台设备同时写入出现多条，统一以最早的一条为准。
  function collect(items) {
    const oldest = [...items].sort((a, b) =>
      (Date.parse(a.created) - Date.parse(b.created)) || String(a.id).localeCompare(String(b.id)));
    const checkins = new Map(), draws = new Map(), topups = [];
    for (const item of oldest) {
      if (!item || !/^\d{4}-\d{2}-\d{2}$/.test(item.day || "")) continue;
      if (item.kind === "checkin" && !checkins.has(item.day)) checkins.set(item.day, parseCheckin(item));
      else if (item.kind === "draw" && !draws.has(item.day)) {
        const draw = parseDraw(item);
        if (draw) draws.set(item.day, draw);
      } else if (item.kind === "topup") {
        const topup = parseTopup(item);
        if (topup) topups.push(topup);
      }
    }
    topups.reverse();
    return { checkins, draws, topups };
  }

  // 今天还没打卡时，连续天数从昨天往回数，不会因为“今天还没到”而清零。
  function streak(checkins, today) {
    const done = day => checkins.has(day) && checkins.get(day).done;
    let day = done(today) ? today : shiftDay(today, -1);
    let count = 0;
    while (done(day)) { count++; day = shiftDay(day, -1); }
    return count;
  }

  function summarize(state, config, today = dayKey()) {
    const draws = [...state.draws.values()];
    const drawn = money(draws.reduce((sum, draw) => sum + draw.amount, 0));
    const charged = money(state.topups.reduce((sum, topup) => sum + topup.amount, 0));
    const counts = new Map(config.prizes.map(prize => [prize.amount, 0]));
    for (const draw of draws) counts.set(draw.base, (counts.get(draw.base) || 0) + 1);
    const tiers = [...counts].map(([amount, count]) => {
      const prize = config.prizes.find(row => row.amount === amount);
      return { amount, count, share: prize ? prize.share : null };
    }).sort((a, b) => a.amount - b.amount);
    return {
      drawn, charged, pending: Math.max(0, money(drawn - charged)),
      doneDays: [...state.checkins.values()].filter(checkin => checkin.done).length,
      streak: streak(state.checkins, today),
      drawCount: draws.length,
      luckyCount: draws.filter(draw => draw.lucky).length,
      tiers
    };
  }

  function monthCells(year, month) {
    const first = new Date(year, month, 1, 12);
    const count = new Date(year, month + 1, 0, 12).getDate();
    const offset = (first.getDay() + 6) % 7;
    return [...Array.from({ length: offset }, () => null),
      ...Array.from({ length: count }, (_, index) => dayKey(new Date(year, month, index + 1, 12)))];
  }

  const model = Object.freeze({ DEFAULTS, TEXT_LIMIT, dayKey, shiftDay, checkinDay, money, normalizeConfig, drawPrize, secureRandom,
    parseCheckin, parseDraw, parseTopup, collect, streak, summarize, monthCells });
  if (typeof module !== "undefined" && module.exports) module.exports = model;
  else root.LITTLE_DAYS_CHECKIN_MODEL = model;
})(typeof window === "undefined" ? globalThis : window);
