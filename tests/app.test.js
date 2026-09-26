import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

test('reweaving preserves the selected width and falls back when unavailable', async () => {
  const elements = new Map();
  const element = () => ({
    value: '1', checked: false, children: [], dataset: {}, style: {}, listeners: {},
    classList: { toggle() {} }, parentElement: { clientWidth: 800, clientHeight: 600 },
    addEventListener(name, handler) { this.listeners[name] = handler; },
    setAttribute(name, value) { this[name] = value; },
    replaceChildren() {}, getBoundingClientRect() { return { width: 600 }; },
  });
  const get = id => { if (!elements.has(id)) elements.set(id, element()); return elements.get(id); };
  const buttons = [40,72,120,180].map(width => Object.assign(element(), { dataset: { width } }));
  let widths = [40,72,120,180];
  const context = vm.createContext({
    document: {
      getElementById: get, querySelectorAll: () => buttons,
      createDocumentFragment: () => ({ append() {} }),
      fonts: { ready: Promise.resolve() },
    },
    window: { matchMedia: () => ({ matches: true }) },
    ResizeObserver: class { observe() {} }, AbortController,
    fetch: async () => ({ ok: true, json: async () => ({
      options: { character_aspect: .5 }, variants: widths.map(columns => ({ columns, rows: 1 })),
    }) }),
    runs: () => [], opacity: () => 1,
  });
  const source = await readFile(new URL('../ascii_gen/static/app.js', import.meta.url), 'utf8');
  vm.runInContext(source.replace(/^import .*\n/, ''), context);
  await new Promise(setImmediate);
  assert.equal(get('dimensions').textContent, '120 × 1 CHARACTERS');
  for (const width of [40,72,180]) {
    buttons.find(button => button.dataset.width === width).listeners.click();
    get('settings').listeners.submit({ preventDefault() {} });
    await new Promise(setImmediate);
    assert.equal(get('dimensions').textContent, `${width} × 1 CHARACTERS`);
  }
  widths = [40,72];
  get('settings').listeners.submit({ preventDefault() {} });
  await new Promise(setImmediate);
  assert.equal(get('dimensions').textContent, '40 × 1 CHARACTERS');
});
