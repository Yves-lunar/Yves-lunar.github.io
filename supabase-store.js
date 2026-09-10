/* Supabase PostgreSQL / PostgREST storage; no login screen or SDK required. */
(function () {
  "use strict";

  const columns = "id,kind,title,body,day,done,created";
  // The deployed schema already accepts diary rows. An otherwise unused diary
  // title stores this subtype, so existing installations need no SQL migration.
  const logTitle = "__little_days_daily_log_v1__";

  function settings() {
    const config = window.LITTLE_DAYS_SUPABASE;
    if (!config || !/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(config.url || "") ||
        !/^[a-z_][a-z0-9_]*$/.test(config.table || "")) {
      throw { code: "CONFIG_MISSING" };
    }
    if (typeof config.publishableKey !== "string" || !config.publishableKey.trim()) {
      throw { code: "PUBLISHABLE_KEY_MISSING" };
    }
    if (!config.publishableKey.startsWith("sb_publishable_")) throw { code: "INVALID_PUBLIC_KEY" };
    return config;
  }

  async function request(method, params, body) {
    const config = settings();
    const url = new URL(`${config.url}/rest/v1/${config.table}`);
    url.search = new URLSearchParams(params).toString();
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 20000);
    try {
      const headers = {
        apikey: config.publishableKey.trim(),
        Accept: "application/json"
      };
      if (method !== "GET") headers.Prefer = "return=representation";
      if (body !== undefined) headers["Content-Type"] = "application/json";
      const response = await fetch(url.toString(), {
        method, headers, signal: controller.signal, credentials: "omit",
        cache: "no-store", body: body === undefined ? undefined : JSON.stringify(body)
      });
      const text = await response.text();
      let data;
      try { data = text ? JSON.parse(text) : null; } catch {
        throw { code: "INVALID_RESPONSE", status: response.status };
      }
      if (!response.ok) {
        throw { code: data && data.code || `HTTP_${response.status}`,
          message: data && data.message || "", status: response.status };
      }
      if (!Array.isArray(data)) throw { code: "INVALID_RESPONSE" };
      return data;
    } finally {
      clearTimeout(timeout);
    }
  }

  function toItem(row) {
    const isLog = row.kind === "diary" && row.title === logTitle;
    const project = row.kind === "note" && /^<!--little-days-project-updated:(\d{4}-\d{2}-\d{2}T[\d:.]+Z)-->\n/.exec(row.body || "");
    return {
      id: row.id, kind: isLog ? "log" : row.kind, title: isLog ? "" : row.title || "", body: project ? row.body.slice(project[0].length) : row.body || "",
      updated: project ? project[1] : row.created,
      day: row.day || "", done: row.done ? 1 : 0, created: row.created
    };
  }

  async function list() {
    const rows = [];
    let cursor;
    for (;;) {
      const params = { select: columns, order: "id.asc", limit: "100" };
      if (cursor) params.id = `gt.${cursor}`;
      const page = await request("GET", params);
      if (!page.length) break;
      const next = page[page.length - 1].id;
      if (typeof next !== "string" || !next || next === cursor) throw { code: "INVALID_RESPONSE" };
      rows.push(...page);
      cursor = next;
      // Continue until an empty page, even if the gateway caps pages below 100.
    }
    return rows.map(toItem).sort((a, b) =>
      (Date.parse(a.created) - Date.parse(b.created)) || a.id.localeCompare(b.id));
  }

  function fields(input) {
    const result = {};
    for (const key of ["title", "body"]) {
      if (input[key] !== undefined) {
        const max = key === "body" ? 50000 : 300;
        if (typeof input[key] !== "string" || input[key].length > max) throw { code: "INVALID_INPUT" };
        result[key] = input[key];
      }
    }
    if (input.day !== undefined) {
      if (input.day !== "" && !/^\d{4}-\d{2}-\d{2}$/.test(input.day)) throw { code: "INVALID_INPUT" };
      result.day = input.day || null;
    }
    if (input.done !== undefined) result.done = !!input.done;
    // Keep the edit timestamp with project text, compatible with existing tables.
    if (input.kind === "note" && typeof result.body === "string") {
      result.body = `<!--little-days-project-updated:${new Date().toISOString()}-->\n${result.body}`;
      if (result.body.length > 50000) throw { code: "INVALID_INPUT" };
    }
    return result;
  }

  async function mutate(method, input) {
    if (method === "POST") {
      if (!["todo", "note", "diary", "log"].includes(input.kind)) throw { code: "INVALID_INPUT" };
      // IDs and creation timestamps come from PostgreSQL defaults.
      const data = { ...fields(input), kind: input.kind === "log" ? "diary" : input.kind };
      if (input.kind === "log") data.title = logTitle;
      const rows = await request("POST", { select: columns }, data);
      if (rows.length !== 1 || !rows[0].id) throw { code: "INVALID_RESPONSE" };
      return toItem(rows[0]);
    }
    if (typeof input.id !== "string" || !/^[0-9a-f-]{36}$/i.test(input.id)) throw { code: "INVALID_INPUT" };
    if (method === "PATCH") {
      // PATCH with an ID filter never recreates another visitor's deleted row.
      const rows = await request("PATCH", { id: `eq.${input.id}`, select: columns }, fields(input));
      if (!rows.length) throw { code: "ITEM_MISSING" };
      if (rows.length !== 1) throw { code: "INVALID_RESPONSE" };
      return toItem(rows[0]);
    }
    if (method === "DELETE") {
      await request("DELETE", { id: `eq.${input.id}`, select: "id" });
      return { id: input.id };
    }
    throw { code: "INVALID_INPUT" };
  }

  function errorMessage(error) {
    const code = String(error && error.code || "");
    console.error("Supabase notebook request failed:", code || "NETWORK_ERROR");
    if (code === "PUBLISHABLE_KEY_MISSING") return "云端访问密钥尚未配置。";
    if (code === "INVALID_PUBLIC_KEY") return "请使用前端 Publishable Key 配置云端连接。";
    if (code === "CONFIG_MISSING") return "云端连接尚未配置完成。";
    if (code === "ITEM_MISSING") return "这条记录已被删除或无法修改，请刷新后查看。";
    if (code === "42P01" || code === "PGRST205") return "云端数据表尚未创建，请完成初始化后刷新。";
    if (code === "42501") return "云端数据表访问权限尚未配置完成。";
    if (error && error.status === 403) return "云端拒绝访问，请检查访问密钥和数据表权限。";
    if (error && error.status === 401) return "云端访问密钥无效，请检查配置。";
    if (code === "23514" || code === "22001" || code === "22007" || code === "22008" || code === "INVALID_INPUT") {
      return "内容格式或长度不符合要求，请检查后重试。";
    }
    return "连接云端失败，请检查网络及云端配置后重试。";
  }

  window.LITTLE_DAYS_STORE = Object.freeze({ list, mutate, errorMessage });
})();
