import test from 'node:test';
import assert from 'node:assert/strict';
import { opacity, exportHtml } from '../ascii_gen/static/render.js';
test('opacity has a neutral setting and bounded masked shadows',()=>{
  assert.equal(opacity(51,0),1); assert.equal(opacity(0,70),0);
  assert.equal(opacity(255,100),1); assert.ok(opacity(80,70)<opacity(180,70));
});
test('HTML export escapes characters and carries physical cell proportions',()=>{
  const html=exportHtml({columns:3,rows:1,text:'<&>\n',tones:[[100,200,255]]}, {color:'#69efb2',strength:70,bold:true,aspect:.5});
  assert.ok(html.includes('&lt;')); assert.ok(html.includes('&amp;')); assert.ok(html.includes('&gt;'));
  assert.ok(html.includes('line-height:2ch')); assert.ok(!html.includes('<script'));
});
