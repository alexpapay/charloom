import test from 'node:test';
import assert from 'node:assert/strict';
import { opacity, exportHtml, fitCells, frameScheduler } from '../ascii_gen/static/render.js';
test('art fits width and height while preserving physical proportions', () => {
  for (const [width,height] of [[300,200],[1200,350],[140,600]]) {
    const {cellWidth,lineHeight}=fitCells(width,height,360,180,.5);
    assert.ok(cellWidth*360 <= width);
    assert.ok(lineHeight*180 <= height);
    assert.equal(cellWidth/lineHeight,.5);
  }
});
test('rapid shadow input applies only the newest value once per frame', () => {
  const frames=[], values=[];
  const schedule=frameScheduler(value=>values.push(value), callback=>frames.push(callback));
  for(let value=0;value<=100;value++)schedule(value);
  assert.equal(frames.length,1);
  frames.shift()();
  assert.deepEqual(values,[100]);
  schedule(30);frames.shift()();assert.deepEqual(values,[100,30]);
});
test('opacity has a neutral setting and bounded masked shadows',()=>{
  assert.equal(opacity(51,0),1); assert.equal(opacity(0,70),0);
  assert.equal(opacity(255,100),1); assert.ok(opacity(80,70)<opacity(180,70));
});
test('HTML export escapes characters and carries physical cell proportions',()=>{
  const html=exportHtml({columns:3,rows:1,text:'<&>\n',tones:[[100,200,255]]}, {color:'#69efb2',strength:70,bold:true,aspect:.5});
  assert.ok(html.includes('&lt;')); assert.ok(html.includes('&amp;')); assert.ok(html.includes('&gt;'));
  assert.ok(html.includes('line-height:2ch')); assert.ok(!html.includes('<script'));
});


test('PNG painting preserves proportions, masks and background choice', async () => {
  const { paintImage } = await import('../ascii_gen/static/render.js');
  const fills = [], glyphs = [];
  const ctx = { measureText: () => ({width:60}), fillRect: (...args) => fills.push(args),
    fillText(char,x,y) { glyphs.push({char,x,y,alpha:this.globalAlpha,color:this.fillStyle}); } };
  const canvas = {getContext: () => ctx};
  const variant = {columns:2, rows:1, text:'AB', tones:[[0,128]]};
  const config = {color:'#123456',background:'#abcdef',strength:100,bold:true,aspect:.5,transparent:true};
  paintImage(canvas,variant,config);
  assert.equal(canvas.width,2048);
  assert.equal(canvas.height,2048);
  assert.equal(fills.length,0);
  assert.equal(glyphs.length,1);
  assert.equal(glyphs[0].char,'B');
  assert.equal(glyphs[0].color,'#123456');
  assert.equal(glyphs[0].alpha,128/255);
  paintImage(canvas,variant,{...config,transparent:false});
  assert.equal(fills.length,1);
});

test('PNG sizes support presets, custom axes and bounded rounding', async () => {
  const {imageDimensions} = await import('../ascii_gen/static/render.js');
  const wide = {columns:120,rows:30};
  assert.deepEqual(imageDimensions(wide,.5,1024),{width:1024,height:512});
  assert.deepEqual(imageDimensions(wide,.5,4096),{width:4096,height:2048});
  assert.deepEqual(imageDimensions(wide,.5,800,'height'),{width:1600,height:800});
  assert.deepEqual(imageDimensions(wide,.5,777,'width'),{width:777,height:389});
  assert.deepEqual(imageDimensions({columns:40,rows:80},.5,2048),{width:512,height:2048});
  for (const edge of [0,4097,NaN,2.5]) assert.throws(()=>imageDimensions(wide,.5,edge));
  assert.throws(()=>imageDimensions(wide,.5,3000,'height'));
});
