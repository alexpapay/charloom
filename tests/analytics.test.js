import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

async function setup(consent, hostname = 'charloom.popovich.one') {
  const nodes = new Map(), scripts = [];
  const get = id => { if (!nodes.has(id)) nodes.set(id, {hidden: true, addEventListener(event, fn) {this[event] = fn;}}); return nodes.get(id); };
  const storage = new Map(consent ? [['charloom-analytics-consent', consent]] : []);
  const window = {};
  vm.runInNewContext(await readFile(new URL('../ascii_gen/static/analytics.js', import.meta.url), 'utf8'), {
    window, document: { getElementById: get, createElement: () => ({}), head: {append: value => scripts.push(value)} },
    location: {hostname, origin: 'https://' + hostname, pathname: '/', reload() {}},
    localStorage: {getItem: key => storage.get(key), setItem: (key,value) => storage.set(key,value), removeItem: key => storage.delete(key)},
  });
  return {get, scripts, window, storage};
}

test('analytics requires consent and decline sends no requests', async () => {
  const {get, scripts} = await setup();
  assert.equal(get('analytics-choice').hidden, false);
  assert.equal(scripts.length, 0);
  get('analytics-decline').click();
  assert.equal(scripts.length, 0);
  assert.equal(get('analytics-choice').hidden, true);
});

test('accept loads the supplied property with advertising disabled', async () => {
  const {get, scripts, window} = await setup();
  get('analytics-accept').click();
  assert.match(scripts[0].src, /G-YLDL8WREEW/);
  assert.equal(window.dataLayer[2][2].allow_google_signals, false);
  assert.equal(window.dataLayer[0][2].ad_storage, 'denied');
});

test('saved consent is respected and local installs never load Google', async () => {
  assert.equal((await setup('granted')).scripts.length, 1);
  assert.equal((await setup('denied')).scripts.length, 0);
  assert.equal((await setup('granted', 'localhost')).scripts.length, 0);
});
