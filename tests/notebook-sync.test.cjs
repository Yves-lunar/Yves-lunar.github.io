const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../notebook-model.js');

test('restored pages and network recovery reload data, hidden pages wait, cleanup removes listeners', async () => {
  const effects = [], states = [], listeners = new Map(), timers = new Map();
  let root, reads = 0;
  const events = prefix => ({
    addEventListener(name, fn) { listeners.set(prefix + name, fn); },
    removeEventListener(name) { listeners.delete(prefix + name); }
  });
  const document = {...events('document:'), visibilityState: 'visible', getElementById() { return {}; }};
  const React = {
    createElement(type, props, ...children) { return {type, props, children}; },
    useRef(value) { return {current: value}; },
    useState(value) {
      const state = {value: typeof value === 'function' ? value() : value};
      states.push(state);
      return [state.value, next => { state.value = typeof next === 'function' ? next(state.value) : next; }];
    },
    useEffect(fn) { effects.push(fn); }, useLayoutEffect() {}
  };
  const window = {...events('window:'), LITTLE_DAYS_RUNTIME: {React, createRoot: () => ({render(node) { root = node; }})},
    LITTLE_DAYS_MODEL: model, LITTLE_DAYS_STORE: {
      async list() { reads++; return [{id: `fresh-${reads}`, kind: 'todo'}]; },
      errorMessage() { return '同步失败'; }
    }};
  vm.runInNewContext(fs.readFileSync(require.resolve('../notebook-ui.js'), 'utf8'), {
    window, document, console, Date,
    setInterval(fn, ms) { timers.set(ms, fn); return ms; }, clearInterval(id) { timers.delete(id); }
  });
  root.type();
  const effect = effects.find(fn => fn.toString().includes('"pageshow"'));
  assert.ok(effect);
  const cleanup = effect();
  const settle = () => new Promise(resolve => setImmediate(resolve));
  await settle();
  assert.equal(reads, 1);
  listeners.get('window:pageshow')();
  await settle();
  assert.equal(reads, 2);
  document.visibilityState = 'hidden';
  listeners.get('document:visibilitychange')();
  await settle();
  assert.equal(reads, 2);
  document.visibilityState = 'visible';
  listeners.get('document:visibilitychange')();
  await settle();
  assert.equal(reads, 3);
  listeners.get('window:online')();
  await settle();
  assert.equal(reads, 4);
  assert.ok(states.some(state => Array.isArray(state.value) && state.value[0]?.id === 'fresh-4'));
  cleanup();
  assert.equal(listeners.size, 0);
  assert.equal(timers.size, 0);
});
