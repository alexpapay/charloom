import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { runs, fitCells, frameScheduler } from '../ascii_gen/static/render.js';

async function playground() {
  const elements = new Map(), frames = [], requests = [], revoked = [];
  let objectId = 0;
  const element = () => ({
    value: '1', checked: false, children: [], dataset: {}, listeners: {},
    style: { writes: [], setProperty(name, value) { this.writes.push([name, value]); } },
    classList: { toggle() {} }, parentElement: { clientWidth: 800, clientHeight: 600 },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute(name, value) { this[name] = value; },
    replaceChildren(fragment) { this.children = fragment?.children ?? []; },
    getBoundingClientRect() { return { width: 600 }; },
    reportValidity() { return Number.isInteger(Number(this.value)) && this.value >= 2 && this.value <= 400; },
    removeAttribute(name) { delete this[name]; },
  });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const buttons = [40,72,120,180,240,300,360].map(width => Object.assign(element(), { dataset: { width } }));
  const context = vm.createContext({
    document: {
      getElementById: get, querySelectorAll: () => buttons,
      createDocumentFragment: () => ({ children: [], append(child) { this.children.push(child); } }),
      createElement: element, createTextNode: text => ({ textContent: text }),
      fonts: { ready: Promise.resolve() },
    },
    ResizeObserver: class { observe() {} }, AbortController,
    URL: { createObjectURL: () => 'blob:test-' + ++objectId, revokeObjectURL: url => revoked.push(url) },
    fetch: async url => {
      const options = JSON.parse(new URL(url, 'http://test').searchParams.get('options'));
      requests.push(options);
      return { ok: true, json: async () => ({
        options: { ...options, character_aspect: .5 },
        variants: options.widths.map(columns => ({ columns, rows: 1, text: 'x'.repeat(columns),
          tones: [Array.from({length: columns}, (_,x) => x%256)] })),
      }) };
    },
    runs, fitCells, frameScheduler: apply => frameScheduler(apply, callback => frames.push(callback)),
  });
  const source = await readFile(new URL('../ascii_gen/static/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*\n/, ''), context);
  await new Promise(setImmediate);
  const flush = () => { while(frames.length) frames.shift()(); };
  flush();
  return {get, buttons, requests, frames, flush, revoked};
}

test('new sizes load on demand, cache results and survive reweaving', async () => {
  const {get, buttons, requests} = await playground();
  assert.equal(get('dimensions').textContent, '120 × 1 CHARACTERS');
  assert.deepEqual(requests[0].widths, [120]);
  for (const width of [40,72,180,240,300,360]) {
    await buttons.find(button => button.dataset.width === width).listeners.click();
    assert.equal(get('dimensions').textContent, width + ' × 1 CHARACTERS');
  }
  const count=requests.length;
  await buttons.find(button => button.dataset.width === 120).listeners.click();
  assert.equal(requests.length,count);
  await buttons.find(button => button.dataset.width === 360).listeners.click();
  get('settings').listeners.submit({preventDefault() {}});
  await new Promise(setImmediate);
  assert.equal(get('dimensions').textContent,'360 × 1 CHARACTERS');
  assert.deepEqual(requests.at(-1).widths,[360]);
});

test('custom size is validated and changed settings invalidate cached sizes', async () => {
  const {get, buttons, requests} = await playground();
  get('custom-width').value='337';
  get('apply-width').listeners.click();
  await new Promise(setImmediate);
  assert.equal(get('dimensions').textContent,'337 × 1 CHARACTERS');
  const count=requests.length;
  get('custom-width').value='401';
  get('apply-width').listeners.click();
  assert.equal(requests.length,count);
  get('contrast').value='1.5';
  await buttons.find(button=>button.dataset.width===120).listeners.click();
  assert.equal(requests.length,count+1);
  assert.equal(requests.at(-1).contrast,1.5);
});

test('shadow changes retain text nodes and avoid per-run style writes', async () => {
  const {get, frames, flush}=await playground();
  const art=get('art'), children=art.children;
  const writes=children.map(child=>child.style?.writes.length);
  const tones=children.map(child=>child.style?.opacity);
  for(let i=0;i<=100;i++) {
    get('strength').value=String(i);
    get('strength').listeners.input();
  }
  assert.equal(frames.length,1);
  flush();
  assert.equal(art.children,children);
  assert.deepEqual(children.map(child=>child.style?.writes.length),writes);
  assert.deepEqual(children.map(child=>child.style?.opacity),tones);
  assert.equal(art.style.opacity,1);
  assert.equal(get('plain').style.opacity,0);
  get('strength').value='0';get('strength').listeners.input();flush();
  assert.equal(art.style.opacity,0);
  assert.equal(get('plain').style.opacity,1);
  assert.equal(get('plain').textContent[0],' ');
});

test('source comparison is local, clears stale artwork and revokes replaced previews', async () => {
  const {get, requests, revoked}=await playground();
  get('source').files=[{name:'first.png',size:100}];
  get('source').listeners.change();
  assert.equal(get('art').children.length,0);
  assert.equal(get('original').src,'blob:test-1');
  get('compare').checked=true;
  get('compare').listeners.change();
  assert.equal(get('original-pane').hidden,false);
  await new Promise(setImmediate);
  get('source').files=[{name:'second.png',size:100}];
  get('source').listeners.change();
  await new Promise(setImmediate);
  assert.deepEqual(revoked,['blob:test-1']);
  assert.equal(requests.length,3);
  get('demo').listeners.click();
  await new Promise(setImmediate);
  assert.deepEqual(revoked,['blob:test-1','blob:test-2']);
  assert.equal(get('original').src,'/static/orbital.png');
  assert.equal(get('original-pane').hidden,false);
  get('compare').checked=false;
  get('compare').listeners.change();
  assert.equal(get('original-pane').hidden,true);
});
