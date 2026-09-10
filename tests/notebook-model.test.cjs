const {test} = require('node:test');
const assert = require('node:assert/strict');
const {dayKey, archiveGroups, recentDiaries} = require('../notebook-model.js');
const {recentProjects, formatSelection} = require('../notebook-model.js');

test('projects sort by latest saved edit with creation fallback without changing other entries', () => {
  const items = [{id:'old',kind:'note',created:'2026-09-01',updated:'2026-09-10'},
    {id:'new',kind:'note',created:'2026-09-09'}, {id:'log',kind:'log',created:'2026-09-11'}];
  assert.deepEqual(recentProjects(items).map(row=>row.id), ['old','new']);
  assert.equal(items.length,3);
});

test('formatting preserves surrounding text and handles multiline selections', () => {
  assert.equal(formatSelection('前正文后',1,3,'bold').text,'前**正文**后');
  assert.equal(formatSelection('正文',0,2,'underline').text,'<u>正文</u>');
  assert.equal(formatSelection('正文',0,2,'strike').text,'~~正文~~');
  assert.equal(formatSelection('甲\n乙\n丙',0,4,'check').text,'- [ ] 甲\n- [ ] 乙\n丙');
  assert.equal(formatSelection('甲\n乙',0,3,'ordered').text,'1. 甲\n2. 乙');
  assert.equal(formatSelection('甲',0,1,'color','#ff0000').text,'<span style="color:#ff0000">甲</span>');
  assert.equal(formatSelection('',0,0,'list').text,'- ');
  assert.equal(formatSelection('\n甲',0,0,'list').text,'- \n甲');
  assert.equal(formatSelection('甲\n乙',0,3,'bold').text,'**甲**\n**乙**');
});

test('recent papers show four newest submissions and exclude daily logs', () => {
  const entries = Array.from({length:7},(_,i)=>({id:String(i),kind:'diary',day:'2026-09-01',created:`2026-09-0${i+1}T10:00:00Z`}));
  entries.push({id:'log',kind:'log',created:'2026-09-09T12:00:00Z'});
  assert.deepEqual(recentDiaries(entries).map(item=>item.id),['6','5','4','3']);
  assert.equal(entries.length,8);
});

test('archives sort by recorded date and sort entries within each date newest first', () => {
  const entries=[
    {id:'a',kind:'log',day:'2026-09-03',created:'2026-09-09T10:00:00Z'},
    {id:'b',kind:'log',day:'2026-09-09',created:'2026-09-09T08:00:00Z'},
    {id:'c',kind:'log',day:'2026-09-09',created:'2026-09-09T12:00:00Z'},
    {id:'d',kind:'diary',day:'2026-09-08',created:'2026-09-08T10:00:00Z'}
  ];
  const groups=archiveGroups(entries,'log');
  assert.deepEqual(groups.map(group=>group.day),['2026-09-09','2026-09-03']);
  assert.deepEqual(groups[0].entries.map(item=>item.id),['c','b']);
  assert.equal(archiveGroups(entries,'diary')[0].entries[0].id,'d');
  assert.deepEqual(archiveGroups([],'log'),[]);
});

test('date keys use local calendar fields without converting to UTC',()=>{
  assert.equal(dayKey(new Date(2026,0,2,0,15)),'2026-01-02');
  assert.equal(dayKey(new Date(2026,8,30)),'2026-09-30');
});
