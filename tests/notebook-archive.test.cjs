const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const model = require('../notebook-model.js');

function descendants(node) {
  if (!node || typeof node !== 'object') return [];
  return [node, ...node.children.flatMap(descendants)];
}

function hasClass(node, name) {
  return (node.props.className || '').split(/\s+/).includes(name);
}

function textContent(node) {
  if (node == null || typeof node === 'boolean') return '';
  if (typeof node !== 'object') return String(node);
  return node.children.map(textContent).join('');
}

// Execute the real components with persistent hooks and committed DOM refs.
// This deliberately leaves unrelated child components shallow, so no browser
// dependency or production-only export is needed to exercise archive behavior.
function mount(name, initialProps, initialWidth = 1000) {
  const slots = [], listeners = new Map(), observers = [], frames = [];
  const refNodes = new WeakMap();
  let cursor = 0, pending = false, effects = [], props = initialProps, tree, width = initialWidth;
  const document = {
    activeElement: null,
    getElementById() { return {}; },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type).add(fn);
    },
    removeEventListener(type, fn) { listeners.get(type)?.delete(fn); }
  };
  function effect(fn, deps) {
    const index = cursor++;
    const previous = slots[index];
    if (!previous || !deps || deps.some((value, i) => !Object.is(value, previous.deps[i]))) {
      slots[index] = {deps, cleanup: previous?.cleanup};
      effects.push(() => {
        slots[index].cleanup?.();
        slots[index].cleanup = fn();
      });
    }
  }
  const React = {
    createElement(type, elementProps, ...children) {
      const flattened = children.flat(Infinity).filter(child => child != null && typeof child !== 'boolean');
      return {type, props: {...elementProps, children: flattened}, children: flattened};
    },
    useState(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = {value: typeof initial === 'function' ? initial() : initial};
      return [slots[index].value, next => {
        const value = typeof next === 'function' ? next(slots[index].value) : next;
        if (!Object.is(value, slots[index].value)) {
          slots[index].value = value;
          pending = true;
        }
      }];
    },
    useRef(initial) {
      const index = cursor++;
      if (!slots[index]) slots[index] = {current: initial};
      return slots[index];
    },
    useEffect: effect,
    useLayoutEffect: effect
  };
  class ResizeObserver {
    constructor(fn) { this.fn = fn; observers.push(this); }
    observe(node) { this.node = node; }
    disconnect() { this.disconnected = true; }
  }
  const window = {LITTLE_DAYS_RUNTIME: {React, createRoot: () => ({render() {}})}, LITTLE_DAYS_MODEL: model};
  const source = fs.readFileSync(require.resolve('../notebook-ui.js'), 'utf8')
    .replace(/\}\)\(\);\s*$/, 'window.__archiveTest = {ArchiveDates, Archive};\n})();');
  vm.runInNewContext(source, {
    window, document, Date, console, ResizeObserver,
    requestAnimationFrame(fn) { frames.push(fn); return frames.length; }
  });
  assert.equal(typeof window.__archiveTest?.[name], 'function');

  function commit(node) {
    if (!node || typeof node !== 'object') return node;
    const ref = node.props.ref;
    let committed = node;
    if (ref && typeof ref === 'object') {
      committed = refNodes.get(ref) || node;
      refNodes.set(ref, committed);
      Object.assign(committed, node);
    }
    committed.children = node.children.map(commit);
    committed.props.children = committed.children;
    Object.defineProperty(committed, 'clientWidth', {configurable: true, get: () => width});
    committed.focus = () => { document.activeElement = committed; };
    committed.contains = target => descendants(committed).includes(target);
    committed.querySelector = selector => descendants(committed).slice(1).find(candidate => {
      if (selector === '[aria-pressed="true"]') return candidate.props['aria-pressed'] === true;
      return selector.startsWith('.') && selector.slice(1).split('.').every(token => hasClass(candidate, token));
    });
    committed.scrollCalls ||= [];
    committed.scrollIntoView = options => { committed.scrollCalls.push(options); };
    if (typeof ref === 'function') ref(committed);
    else if (ref) ref.current = committed;
    return committed;
  }
  const harness = {
    render(nextProps = props) {
      props = nextProps;
      let passes = 0;
      do {
        assert.ok(++passes < 20, 'hooks should settle without a render loop');
        pending = false;
        cursor = 0;
        effects = [];
        tree = commit(window.__archiveTest[name](props));
        effects.forEach(run => run());
      } while (pending);
      return tree;
    },
    nodes(predicate) { return descendants(tree).filter(predicate); },
    one(predicate) {
      const matches = this.nodes(predicate);
      assert.equal(matches.length, 1, 'expected exactly one matching element');
      return matches[0];
    },
    byClass(className) { return this.nodes(node => hasClass(node, className)); },
    button(label) { return this.one(node => node.type === 'button' && node.props['aria-label'] === label); },
    click(node) { node.props.onClick(); this.render(); },
    resize(nextWidth) {
      width = nextWidth;
      observers.filter(observer => !observer.disconnected).forEach(observer => observer.fn());
      this.render();
    },
    dispatch(type, event) {
      [...(listeners.get(type) || [])].forEach(fn => fn(event));
      this.render();
    },
    flushFrames() { frames.splice(0).forEach(fn => fn()); },
    unmount() { slots.forEach(slot => slot.cleanup?.()); },
    get activeElement() { return document.activeElement; },
    get listeners() { return listeners; },
    get observers() { return observers; }
  };
  harness.render();
  return harness;
}

function groupsForDays(count = 25) {
  return Array.from({length: count}, (_, index) => ({
    day: model.dayKey(new Date(2026, 9, 25 - index)), entries: [{id: String(index)}]
  }));
}

function mountDates(overrides = {}, width) {
  const groups = groupsForDays();
  const props = {groups, activeDay: groups[0].day, kind: 'log', onSelect() {}, ...overrides};
  return {harness: mount('ArchiveDates', props, width), props};
}

function openCalendar(harness, kind = 'log') {
  harness.click(harness.button(`更多${kind === 'log' ? '流水账' : '小纸条'}日期`));
}

function calendarDay(harness, day) {
  return harness.one(node => hasClass(node, 'archive-calendar-day') && node.props.key === day);
}

test('date shortcuts cap at ten, shrink on narrow screens, and keep the selected older date visible', () => {
  const {harness, props} = mountDates();
  assert.equal(harness.byClass('archive-date').length, 10);
  assert.equal(harness.byClass('archive-calendar-toggle').length, 1);
  assert.ok(harness.byClass('archive-date').some(node => node.props['aria-pressed']));

  const older = {...props, activeDay: props.groups[22].day};
  harness.render(older);
  assert.equal(harness.byClass('archive-date').length, 10);
  assert.equal(harness.byClass('archive-date').filter(node => node.props['aria-pressed']).length, 1);
  harness.resize(360);
  assert.equal(harness.byClass('archive-date').length, 3);
  assert.ok(harness.byClass('archive-date').some(node => node.props['aria-pressed']));
  harness.resize(800);
  assert.equal(harness.byClass('archive-date').length, 8);
  harness.resize(2000);
  assert.equal(harness.byClass('archive-date').length, 10);
  harness.unmount();
  assert.ok(harness.observers.every(observer => observer.disconnected));
});

test('calendar paging crosses year boundaries and renders leap-day correctly', () => {
  const {harness} = mountDates({activeDay: '2023-12-15'});
  openCalendar(harness);
  assert.ok(textContent(harness.byClass('archive-calendar-heading')[0]).includes('2023 年 12 月'));
  harness.click(harness.button('下个月'));
  assert.ok(textContent(harness.byClass('archive-calendar-heading')[0]).includes('2024 年 1 月'));
  harness.click(harness.button('下个月'));
  assert.equal(harness.byClass('archive-calendar-day').length, 29);
  assert.ok(calendarDay(harness, '2024-02-29'));
  harness.click(harness.button('上个月'));
  harness.click(harness.button('上个月'));
  assert.ok(textContent(harness.byClass('archive-calendar-heading')[0]).includes('2023 年 12 月'));
});

test('recorded days update their emphasis and accessible labels when groups change', () => {
  const props = {activeDay: '2026-10-17', groups: [{day: '2026-10-17', entries: [{}]}], kind: 'diary', onSelect() {}};
  const harness = mount('ArchiveDates', props);
  openCalendar(harness, 'diary');
  assert.ok(hasClass(calendarDay(harness, '2026-10-17'), 'has'));
  assert.match(calendarDay(harness, '2026-10-17').props['aria-label'], /有小纸条/);
  assert.equal(hasClass(calendarDay(harness, '2026-10-18'), 'has'), false);
  harness.render({...props, groups: [{day: '2026-10-18', entries: [{}]}]});
  assert.equal(hasClass(calendarDay(harness, '2026-10-17'), 'has'), false);
  assert.match(calendarDay(harness, '2026-10-17').props['aria-label'], /无记录/);
  assert.ok(hasClass(calendarDay(harness, '2026-10-18'), 'has'));
  assert.match(calendarDay(harness, '2026-10-18').props['aria-label'], /有小纸条/);
});

test('calendar selection calls back once, closes the popup, and returns focus to more dates', () => {
  const selected = [];
  const {harness, props} = mountDates({onSelect: day => selected.push(day)});
  openCalendar(harness);
  assert.equal(harness.activeElement.props.key, props.activeDay);
  const toggle = harness.button('更多流水账日期');
  harness.click(calendarDay(harness, '2026-10-02'));
  assert.deepEqual(selected, ['2026-10-02']);
  assert.equal(harness.byClass('archive-calendar').length, 0);
  assert.equal(toggle.props['aria-expanded'], false);
  assert.equal(harness.activeElement, toggle);
  assert.equal(harness.listeners.get('pointerdown').size, 0);

  openCalendar(harness);
  const shortcut = harness.byClass('archive-date')[1];
  const shortcutDay = shortcut.props.key;
  harness.click(shortcut);
  assert.deepEqual(selected, ['2026-10-02', shortcutDay]);
  assert.equal(harness.byClass('archive-calendar').length, 0);
  assert.equal(toggle.props['aria-expanded'], false);
  assert.equal(harness.listeners.get('pointerdown').size, 0);

  harness.render({...props, activeDay: '2024-02-29'});
  openCalendar(harness);
  assert.equal(harness.byClass('archive-calendar-day').length, 29);
  assert.equal(calendarDay(harness, '2024-02-29').props['aria-pressed'], true);
});

test('Escape closes only the small calendar and outside pointer events dismiss it', () => {
  const {harness} = mountDates();
  openCalendar(harness);
  let prevented = 0, stopped = 0, outerClosed = 0;
  const event = {key: 'Escape', preventDefault() { prevented++; }, stopPropagation() { stopped++; }};
  harness.byClass('archive-date-picker')[0].props.onKeyDown(event);
  if (!stopped) outerClosed++;
  harness.render();
  assert.equal(prevented, 1);
  assert.equal(stopped, 1);
  assert.equal(outerClosed, 0);
  assert.equal(harness.byClass('archive-calendar').length, 0);
  assert.equal(harness.activeElement, harness.button('更多流水账日期'));

  openCalendar(harness);
  harness.dispatch('pointerdown', {target: calendarDay(harness, '2026-10-10')});
  assert.equal(harness.byClass('archive-calendar').length, 1);
  harness.dispatch('pointerdown', {target: {}});
  assert.equal(harness.byClass('archive-calendar').length, 0);
  openCalendar(harness);
  harness.unmount();
  assert.equal(harness.listeners.get('pointerdown').size, 0);
});

test('an unrecorded calendar day shows a dated empty message and scrolls to it', () => {
  const item = {id: 'one', kind: 'log', day: '2026-10-17', created: '2026-10-17T12:00:00', body: '记录'};
  const harness = mount('Archive', {kind: 'log', items: [item], save() {}, onClose() {}});
  const dates = () => harness.one(node => typeof node.type === 'function' && node.type.name === 'ArchiveDates');
  assert.equal(dates().props.activeDay, '2026-10-17');
  dates().props.onSelect('2026-10-05');
  harness.render();
  harness.flushFrames();
  const empty = harness.byClass('archive-selected-empty')[0];
  assert.ok(empty);
  assert.equal(empty.props.role, 'status');
  assert.match(textContent(empty), /2026年10月5日/);
  assert.match(textContent(empty), /0 条这一天还没有记录。/);
  assert.equal(empty.scrollCalls.length, 1);
  assert.equal(empty.scrollCalls[0].block, 'start');
  dates().props.onSelect('2026-10-17');
  harness.render();
  harness.flushFrames();
  assert.equal(harness.byClass('archive-selected-empty').length, 0);
  assert.equal(harness.byClass('archive-day')[0].scrollCalls.length, 1);
});

test('an archive without records still offers calendar dates and the first-record guidance', () => {
  const selected = [];
  const {harness} = mountDates({groups: [], activeDay: '2026-10-17', onSelect: day => selected.push(day)});
  assert.equal(harness.byClass('archive-date').length, 0);
  openCalendar(harness);
  assert.equal(harness.byClass('archive-calendar-day').length, 31);
  assert.equal(harness.byClass('archive-calendar-day').filter(node => hasClass(node, 'has')).length, 0);
  harness.click(calendarDay(harness, '2026-10-05'));
  assert.deepEqual(selected, ['2026-10-05']);

  for (const kind of ['log', 'diary']) {
    const archive = mount('Archive', {kind, items: [], save() {}, onClose() {}});
    assert.equal(archive.byClass('archive-empty').length, 1);
    assert.match(textContent(archive.byClass('archive-empty')[0]), /这里，等着你的第一段记录/);
    assert.equal(archive.byClass('archive-selected-empty').length, 0);
  }
});
