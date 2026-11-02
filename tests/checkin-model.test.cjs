const {test} = require('node:test');
const assert = require('node:assert/strict');
const m = require('../checkin-model.js');

const config = m.normalizeConfig({
  prizes: [{amount:10,chance:40},{amount:20,chance:28},{amount:30,chance:14},{amount:50,chance:10},{amount:80,chance:5},{amount:100,chance:3}],
  luckyChance: 40, luckyMultiplier: 2, platforms: ['网易','苹果']
});
const row = (kind, day, body, created) => ({id: `${kind}-${day}-${created || ''}`, kind, day, body: JSON.stringify(body), created: created || `${day}T10:00:00Z`});

test('config keeps the given odds, normalises weights and reports the expected value', () => {
  assert.equal(config.total, 100);
  assert.deepEqual(config.prizes.map(p => p.amount), [10,20,30,50,80,100]);
  assert.equal(config.expected, 36.12);
  const odd = m.normalizeConfig({prizes:[{amount:5,chance:1},{amount:15,chance:3}], luckyChance: 0});
  assert.equal(odd.prizes[1].share, 0.75);
  assert.equal(odd.expected, 12.5);
  assert.equal(m.normalizeConfig(null).prizes.length, 6, 'Falls back to the default table');
});

test('draws follow the cumulative odds and lucky doubling independently', () => {
  const seq = values => () => values.shift();
  assert.deepEqual(m.drawPrize(config, seq([0, 0.99])), {base:10,lucky:false,multiplier:1,amount:10});
  assert.deepEqual(m.drawPrize(config, seq([0.399, 0.5])), {base:10,lucky:false,multiplier:1,amount:10});
  assert.deepEqual(m.drawPrize(config, seq([0.40, 0.1])), {base:20,lucky:true,multiplier:2,amount:40});
  assert.deepEqual(m.drawPrize(config, seq([0.975, 0.39])), {base:100,lucky:true,multiplier:2,amount:200});
  assert.deepEqual(m.drawPrize(config, seq([0.9999, 0.40])), {base:100,lucky:false,multiplier:1,amount:100});
  // Large sample stays near the configured odds.
  const counts = new Map(); let lucky = 0; const n = 60000;
  for (let i = 0; i < n; i++) { const p = m.drawPrize(config); counts.set(p.base, (counts.get(p.base) || 0) + 1); if (p.lucky) lucky++; }
  for (const prize of config.prizes) assert.ok(Math.abs(counts.get(prize.amount) / n - prize.share) < 0.012, `${prize.amount} odds`);
  assert.ok(Math.abs(lucky / n - 0.4) < 0.012);
});

test('duplicates from two devices resolve to the earliest row; malformed rows are ignored', () => {
  const items = [
    row('checkin','2026-11-01',{done:true,text:'第一条',score:7},'2026-11-01T08:00:00Z'),
    row('checkin','2026-11-01',{done:false,text:'后来的重复',score:2},'2026-11-01T09:00:00Z'),
    row('draw','2026-11-01',{base:20,lucky:false,multiplier:1,amount:20},'2026-11-01T08:01:00Z'),
    row('draw','2026-11-01',{base:100,lucky:true,multiplier:2,amount:200},'2026-11-01T08:02:00Z'),
    {id:'bad', kind:'draw', day:'2026-11-02', body:'not json', created:'2026-11-02T08:00:00Z'},
    row('topup','2026-11-01',{amount:15,platform:'苹果'}),
    {id:'paper', kind:'diary', day:'2026-11-01', body:'小纸条', created:'2026-11-01T07:00:00Z'}
  ];
  const state = m.collect(items);
  assert.equal(state.checkins.get('2026-11-01').text, '第一条');
  assert.equal(state.draws.get('2026-11-01').amount, 20);
  assert.equal(state.draws.has('2026-11-02'), false);
  assert.equal(state.topups.length, 1);
  const summary = m.summarize(state, config, '2026-11-01');
  assert.equal(summary.drawn, 20); assert.equal(summary.charged, 15); assert.equal(summary.pending, 5);
  assert.equal(summary.drawCount, 1);
});

test('streak counts back from today, or from yesterday while today is still open', () => {
  const items = ['2026-10-29','2026-10-30','2026-10-31'].map(day => row('checkin', day, {done:true}))
    .concat([row('checkin','2026-10-28',{done:false}), row('checkin','2026-10-27',{done:true})]);
  const state = m.collect(items);
  assert.equal(m.streak(state.checkins, '2026-10-31'), 3);
  assert.equal(m.streak(state.checkins, '2026-11-01'), 3, 'Today not yet checked in keeps the streak');
  assert.equal(m.streak(state.checkins, '2026-11-02'), 0, 'A missed day breaks it');
  assert.equal(m.summarize(state, config, '2026-11-01').doneDays, 4);
  // Across a month and leap day.
  const leap = m.collect(['2024-02-28','2024-02-29','2024-03-01'].map(day => row('checkin', day, {done:true})));
  assert.equal(m.streak(leap.checkins, '2024-03-01'), 3);
});

test('tier counts use the base amount, keep configured order and list retired tiers', () => {
  const items = [
    row('draw','2026-10-01',{base:10,lucky:true,multiplier:2,amount:20}),
    row('draw','2026-10-02',{base:10,lucky:false,multiplier:1,amount:10}),
    row('draw','2026-10-03',{base:50,lucky:false,multiplier:1,amount:50}),
    row('draw','2026-10-04',{base:5,lucky:false,multiplier:1,amount:5})
  ];
  const summary = m.summarize(m.collect(items), config, '2026-10-04');
  assert.deepEqual(summary.tiers.map(t => [t.amount, t.count]), [[5,1],[10,2],[20,0],[30,0],[50,1],[80,0],[100,0]]);
  assert.equal(summary.tiers[0].share, null);
  assert.equal(summary.luckyCount, 1);
  assert.equal(summary.drawn, 85);
});

test('month cells start on Monday and include every day', () => {
  const cells = m.monthCells(2026, 10); // November 2026 starts on a Sunday
  assert.equal(cells.indexOf('2026-11-01'), 6);
  assert.equal(cells.filter(Boolean).length, 30);
  assert.equal(m.monthCells(2024, 1).filter(Boolean).pop(), '2024-02-29');
  assert.equal(m.shiftDay('2026-01-01', -1), '2025-12-31');
});

test('half-point scores such as 6.5 are kept; other fractions are dropped', () => {
  const day = '2026-10-26';
  assert.equal(m.parseCheckin({id:'a', day, body: JSON.stringify({done:true, score:6.5})}).score, 6.5);
  assert.equal(m.parseCheckin({id:'b', day, body: JSON.stringify({done:true, score:6.3})}).score, null);
  assert.equal(m.parseCheckin({id:'c', day, body: JSON.stringify({done:true, score:11})}).score, null);
});
