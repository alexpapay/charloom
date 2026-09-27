import { runs, exportHtml, fitCells, frameScheduler } from './render.js';

const $ = id => document.getElementById(id);
const downloads = ['txt', 'html', 'json', 'copy'];
const controls = ['source', 'demo', 'weave', 'apply-width', 'custom-width'];
let result, selected, file, sourceUrl, controller, cacheKey;
let desiredWidth = 120, requestId = 0;
const variants = new Map();

function status(message, error = false) {
  $('status').textContent = message;
  $('status').classList.toggle('error', error);
}

function options() {
  return { charset: $('palette').value, contrast: Number($('contrast').value),
    gamma: Number($('gamma').value), edge_weight: Number($('edge').value),
    background: $('background').value, invert: $('invert').checked };
}

function settings() {
  return { color: $('color').value, strength: Number($('strength').value),
    bold: $('bold').checked, aspect: result.options.character_aspect };
}

const shade = frameScheduler(strength => {
  $('strength-value').textContent = strength + '%';
  $('art').style.opacity = strength / 100;
  $('plain').style.opacity = 1 - strength / 100;
});

function fit() {
  if (!selected) return;
  const weight = $('bold').checked ? 'bold' : 'normal';
  $('art-stack').style.fontWeight = weight;
  $('measure').style.fontWeight = weight;
  const viewport = $('art-stack').parentElement;
  const { cellWidth, lineHeight } = fitCells(
    Math.max(0, viewport.clientWidth - 16), Math.max(0, viewport.clientHeight - 16),
    selected.columns, selected.rows, result.options.character_aspect,
  );
  const measured = $('measure').getBoundingClientRect().width / 10;
  $('art-stack').style.fontSize = (100 * cellWidth / measured) + 'px';
  $('art-stack').style.lineHeight = lineHeight + 'px';
}

function draw(variant) {
  selected = variant;
  desiredWidth = selected.columns;
  const fragment = document.createDocumentFragment();
  const rows = runs(selected);
  rows.forEach((row, index) => {
    for (const run of row) {
      const span = document.createElement('span');
      span.textContent = run.text;
      span.style.opacity = run.tone / 255;
      fragment.append(span);
    }
    if (index < selected.rows - 1) fragment.append(document.createTextNode('\n'));
  });
  $('art').replaceChildren(fragment);
  $('plain').textContent = rows.map(row => row.map(run =>
    run.tone === 0 ? ' '.repeat(run.text.length) : run.text).join('')).join('\n');
  $('empty').hidden = true;
  $('dimensions').textContent = selected.columns + ' × ' + selected.rows + ' CHARACTERS';
  $('custom-width').value = selected.columns;
  document.querySelectorAll('[data-width]').forEach(button => {
    button.setAttribute('aria-pressed', String(Number(button.dataset.width) === selected.columns));
  });
  shade(Number($('strength').value));
  fit();
  downloads.forEach(id => $(id).disabled = false);
}

async function weave(width = desiredWidth, force = false) {
  controller?.abort();
  controller = new AbortController();
  const id = ++requestId;
  const currentOptions = options();
  const key = JSON.stringify(currentOptions);
  if (!force && cacheKey === key && variants.has(width)) {
    draw(variants.get(width));
    return;
  }
  controls.forEach(name => $(name).disabled = true);
  document.querySelectorAll('[data-width]').forEach(button => button.disabled = true);
  downloads.forEach(name => $(name).disabled = true);
  $('preview').setAttribute('aria-busy', 'true');
  status('Weaving ' + width + ' columns…');
  $('weave').textContent = 'Weaving…';
  const url = '/api/' + (file ? 'convert' : 'demo') + '?options=' +
    encodeURIComponent(JSON.stringify({ ...currentOptions, widths: [width] }));
  try {
    const response = await fetch(url, { method: file ? 'POST' : 'GET', body: file, signal: controller.signal });
    const body = await response.json();
    if (!response.ok) throw new Error(typeof body.detail === 'string' ? body.detail : 'Could not convert this image.');
    if (id !== requestId) return;
    if (force || cacheKey !== key) variants.clear();
    cacheKey = key;
    result = body;
    for (const variant of body.variants) variants.set(variant.columns, variant);
    // Bound the browser cache when experimenting with many custom sizes.
    while (variants.size > 8) variants.delete(variants.keys().next().value);
    draw(body.variants.find(variant => variant.columns === width) || body.variants[0]);
    status(body.warnings?.length ? body.warnings.join(' ') : 'Ready. Color, shadow and weight update live.');
  } catch (error) {
    if (error.name !== 'AbortError' && id === requestId) status(error.message || 'Connection failed. Try again.', true);
  } finally {
    if (id === requestId) {
      controls.forEach(name => $(name).disabled = false);
      document.querySelectorAll('[data-width]').forEach(button => button.disabled = false);
      downloads.forEach(name => $(name).disabled = !selected);
      $('weave').textContent = 'Weave image ↵';
      $('preview').setAttribute('aria-busy', 'false');
    }
  }
}

function compare() {
  const visible = Boolean(file && $('compare').checked);
  $('original-pane').hidden = !visible;
  $('viewports').classList.toggle('comparing', visible);
  fit();
}

function changeSource(next) {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = next ? URL.createObjectURL(next) : undefined;
  file = next;
  if (sourceUrl) $('original').src = sourceUrl;
  else $('original').removeAttribute('src');
  $('compare').disabled = !next;
  variants.clear(); cacheKey = undefined; selected = undefined;
  $('art').replaceChildren();
  $('plain').textContent = '';
  $('empty').hidden = false;
  compare();
  weave(desiredWidth, true);
}

function save(contents, name, type) {
  const url = URL.createObjectURL(new Blob([contents], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name;
  document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

$('settings').addEventListener('submit', event => { event.preventDefault(); weave(desiredWidth, true); });
$('source').addEventListener('change', () => {
  const next = $('source').files[0];
  if (!next) return;
  if (next.size > 8 * 1024 * 1024) { $('source').value = ''; status('Image exceeds 8 MB. Please resize it first.', true); return; }
  $('filename').textContent = next.name;
  changeSource(next);
});
$('demo').addEventListener('click', () => {
  $('source').value = ''; $('filename').textContent = 'Orbital demo / generated mathematically';
  changeSource(undefined);
});
for (const name of ['contrast', 'gamma', 'edge']) {
  $(name).addEventListener('input', () => $(name + '-value').textContent = Number($(name).value).toFixed(2));
}
document.querySelectorAll('[data-width]').forEach(button => {
  button.addEventListener('click', () => weave(Number(button.dataset.width)));
});
function customWidth() {
  if ($('custom-width').reportValidity()) weave(Number($('custom-width').value));
}
$('apply-width').addEventListener('click', customWidth);
$('custom-width').addEventListener('keydown', event => {
  if (event.key === 'Enter') { event.preventDefault(); customWidth(); }
});
$('compare').addEventListener('change', compare);
$('strength').addEventListener('input', () => shade(Number($('strength').value)));
$('color').addEventListener('input', () => document.documentElement.style.setProperty('--ink', $('color').value));
$('bold').addEventListener('change', fit);
$('txt').addEventListener('click', () => save(selected.text, 'charloom-' + selected.columns + '.txt', 'text/plain;charset=utf-8'));
$('json').addEventListener('click', () => save(JSON.stringify({ ...result,
  options: { ...result.options, widths: [...variants.keys()] }, variants: [...variants.values()],
}, null, 2), 'charloom.json', 'application/json'));
$('html').addEventListener('click', () => save(exportHtml(selected, settings()), 'charloom-' + selected.columns + '.html', 'text/html;charset=utf-8'));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(selected.text); status('Text copied.'); }
  catch { status('Clipboard unavailable. Use the TXT download instead.', true); }
});
new ResizeObserver(fit).observe($('art-stack').parentElement);
document.fonts.ready.then(fit);
weave();
