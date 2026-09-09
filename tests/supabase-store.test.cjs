const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const root = path.join(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'supabase-store.js'), 'utf8');

// Simulate Supabase's HTTP contract, with independent visitors sharing a server.
function visitor(remote = new Map(), options = {}) {
  const calls = [];
  const window = {};
  const context = vm.createContext({ window, URL, URLSearchParams, AbortController,
    setTimeout, clearTimeout, console: { error() {} }, fetch: async (address, init) => {
      const url = new URL(address);
      calls.push({ url, ...init });
      assert.equal(url.origin, 'https://wgabwfewcexgcicdqmjd.supabase.co');
      assert.equal(url.pathname, '/rest/v1/little_days_items');
      assert.equal(init.headers.apikey, 'sb_publishable_test');
      assert.equal(init.headers.Authorization, undefined);
      assert.equal(init.credentials, 'omit');
      assert.equal(init.cache, 'no-store');
      assert.ok(init.signal);
      if (options.error) return new Response(JSON.stringify(options.error), { status: options.status || 403 });
      if (options.malformed) return new Response('not JSON');
      const filter = url.searchParams.get('id');
      if (init.method === 'GET') {
        assert.equal(url.searchParams.get('order'), 'id.asc');
        const cursor = filter ? filter.slice(3) : '';
        if (filter) assert.ok(filter.startsWith('gt.'));
        const data = [...remote.values()].filter(row => row.id > cursor)
          .sort((a,b) => a.id.localeCompare(b.id))
          .slice(0, Math.min(Number(url.searchParams.get('limit')), options.cap || 100));
        return Response.json(data);
      }
      assert.equal(init.headers.Prefer, 'return=representation');
      if (init.method === 'POST') {
        const input = JSON.parse(init.body);
        assert.ok(!('id' in input));
        assert.ok(!('created' in input));
        const row = { id: randomUUID(), created: new Date().toISOString(),
          title: '', body: '', day: null, done: false, ...input };
        remote.set(row.id, row);
        return Response.json([row], { status: 201 });
      }
      assert.ok(filter.startsWith('eq.'), 'Every update/delete must target one ID');
      const id = filter.slice(3);
      const row = remote.get(id);
      if (init.method === 'PATCH') {
        if (!row) return Response.json([]);
        const input = JSON.parse(init.body);
        if ('done' in input) assert.equal(typeof input.done, 'boolean');
        const next = { ...row, ...input };
        remote.set(id, next);
        return Response.json([next]);
      }
      assert.equal(init.method, 'DELETE');
      remote.delete(id);
      return Response.json(row ? [{ id }] : []);
    } });
  vm.runInContext(fs.readFileSync(path.join(root, 'config.js'), 'utf8'), context);
  window.LITTLE_DAYS_SUPABASE = { ...window.LITTLE_DAYS_SUPABASE,
    publishableKey: options.missingKey ? '' : 'sb_publishable_test' };
  vm.runInContext(source, context);
  return { store: window.LITTLE_DAYS_STORE, calls };
}

test('two visitors share todo, note and diary CRUD without login', async () => {
  const remote = new Map();
  const a = visitor(remote), b = visitor(remote);
  const todo = await a.store.mutate('POST', { kind:'todo', title:'买菜' });
  const note = await a.store.mutate('POST', { kind:'note', title:'项目', body:'初稿' });
  const diary = await a.store.mutate('POST', { kind:'diary', day:'2026-09-09', body:'今天很好' });
  assert.equal((await b.store.list()).length, 3);
  assert.equal(diary.day, '2026-09-09');
  assert.equal(todo.day, '');
  assert.ok(Number.isFinite(Date.parse(diary.created)));
  await b.store.mutate('PATCH', { id:todo.id, done:1 });
  await b.store.mutate('PATCH', { id:note.id, title:'项目', body:'二稿', created:'forged' });
  const loaded = await a.store.list();
  assert.equal(loaded.find(row => row.id === todo.id).done, 1);
  assert.equal(loaded.find(row => row.id === note.id).body, '二稿');
  assert.equal(remote.get(note.id).created, note.created);
  await b.store.mutate('DELETE', { id:diary.id });
  assert.equal((await a.store.list()).length, 2);
});

test('loads 250 records even when gateway caps responses below requested page size', async () => {
  const remote = new Map();
  for(let i=0;i<250;i++) {
    const id = randomUUID();
    remote.set(id, { id, kind:'todo', title:String(i), created:'2026-09-09T00:00:00Z' });
  }
  const a = visitor(remote, { cap:37 });
  const rows = await a.store.list();
  assert.equal(rows.length, 250);
  assert.equal(new Set(rows.map(row => row.id)).size, 250);
  assert.equal(a.calls.length, 8);
});

test('missing Publishable Key blocks requests with actionable error', async () => {
  const a = visitor(new Map(), { missingKey:true });
  await assert.rejects(a.store.list(), error => error.code === 'PUBLISHABLE_KEY_MISSING');
  assert.equal(a.calls.length, 0);
});

test('permission failures never report reads or writes as successful', async () => {
  const a = visitor(new Map(), { error:{ code:'42501', message:'permission denied' } });
  await assert.rejects(a.store.list(), error => error.code === '42501');
  await assert.rejects(a.store.mutate('POST', { kind:'todo', title:'保留输入' }), error => error.status === 403);
  await assert.rejects(a.store.mutate('PATCH', { id:randomUUID(), done:1 }), error => error.status === 403);
  await assert.rejects(a.store.mutate('DELETE', { id:randomUUID() }), error => error.status === 403);
});

test('stale edits never recreate deleted rows; repeated delete is harmless', async () => {
  const remote = new Map();
  const a = visitor(remote);
  const note = await a.store.mutate('POST', { kind:'note', title:'项目' });
  await a.store.mutate('DELETE', { id:note.id });
  await assert.rejects(a.store.mutate('PATCH', { id:note.id, title:'旧修改' }), error => error.code === 'ITEM_MISSING');
  assert.equal(remote.size, 0);
  await a.store.mutate('DELETE', { id:note.id });
});

test('input validation stops malformed or broad mutations before sending', async () => {
  const a = visitor();
  await assert.rejects(a.store.mutate('POST', { kind:'note', body:'x'.repeat(50001) }), error => error.code === 'INVALID_INPUT');
  await assert.rejects(a.store.mutate('DELETE', { id:'*' }), error => error.code === 'INVALID_INPUT');
  assert.equal(a.calls.length, 0);
});

test('non-JSON responses do not become empty notebooks', async () => {
  const a = visitor(new Map(), { malformed:true });
  await assert.rejects(a.store.list(), error => error.code === 'INVALID_RESPONSE');
});

test('page loads storage, runtime and model before UI without document SDK', () => {
  const html = fs.readFileSync(path.join(root,'index.html'),'utf8');
  assert.ok(html.indexOf('./config.js') < html.indexOf('./supabase-store.js'));
  assert.ok(html.indexOf('./supabase-store.js') < html.indexOf('./app.js'));
  assert.ok(html.indexOf('./app.js') < html.indexOf('./notebook-ui.js'));
  assert.ok(html.indexOf('./notebook-model.js') < html.indexOf('./notebook-ui.js'));
  assert.ok(!html.includes('cloudbase.full.js'));
  const ui = fs.readFileSync(path.join(root,'notebook-ui.js'),'utf8');
  assert.ok(ui.includes('store.mutate(method, input)'));
  assert.ok(ui.includes('store.list()'));
});

test('daily logs round-trip through the existing schema without mixing with old diaries', async () => {
  const remote = new Map();
  const a = visitor(remote), b = visitor(remote);
  const diary = await a.store.mutate('POST', {kind:'diary',day:'2026-09-09',body:'原来的小纸条'});
  const log = await a.store.mutate('POST', {kind:'log',day:'2026-09-09',body:'今天做了三件事'});
  assert.equal(remote.get(log.id).kind, 'diary', 'Must satisfy the deployed kind CHECK constraint');
  assert.equal(remote.get(log.id).title, '__little_days_daily_log_v1__');
  assert.equal(log.kind, 'log');
  assert.equal(log.title, '');
  const loaded = await b.store.list();
  assert.equal(loaded.find(row=>row.id===diary.id).kind, 'diary');
  assert.equal(loaded.find(row=>row.id===log.id).kind, 'log');
  assert.equal(loaded.find(row=>row.id===log.id).body, '今天做了三件事');
  await b.store.mutate('DELETE', {id:log.id});
  assert.equal((await a.store.list()).length, 1);
  assert.equal((await a.store.list())[0].kind, 'diary');
});
