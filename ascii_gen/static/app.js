import { runs, exportHtml, fitCells, frameScheduler, paintImage, imageDimensions } from './render.js';

const $ = id => document.getElementById(id);
const downloads = ['txt', 'html', 'json', 'copy', 'export-text', 'export-image', 'png'];
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
  return { color: $('color').value, background: $('art-background').value, strength: Number($('strength').value),
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
  const visible = $('compare').checked;
  $('original-pane').hidden = !visible;
  $('viewports').classList.toggle('comparing', visible);
  fit();
}

function changeSource(next) {
  if (sourceUrl) URL.revokeObjectURL(sourceUrl);
  sourceUrl = next ? URL.createObjectURL(next) : undefined;
  file = next;
  resetPreview();
  $('original').src = sourceUrl || '/static/orbital.png';
  $('original').alt = next ? 'Original uploaded image' : 'Original orbital demo image';
  $('original-caption').textContent = next ? 'Original · local preview' : 'Original · orbital demo';
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
$('color').addEventListener('input', () => $('art-stack').style.color = $('color').value);
$('bold').addEventListener('change', fit);
$('txt').addEventListener('click', () => save(selected.text, 'charloom-' + selected.columns + '.txt', 'text/plain;charset=utf-8'));
$('json').addEventListener('click', () => save(JSON.stringify({ ...result,
  options: { ...result.options, widths: [...variants.keys()] }, variants: [...variants.values()],
}, null, 2), 'charloom.json', 'application/json'));
$('html').addEventListener('click', () => save(exportHtml(selected, settings()), 'charloom-' + selected.columns + '.html', 'text/html;charset=utf-8'));
$('copy').addEventListener('click', async () => {
  try { await navigator.clipboard.writeText(selected.text); $('text-export-status').textContent = 'Text copied.'; }
  catch { $('text-export-status').textContent = 'Clipboard unavailable. Use TXT instead.'; }
});
new ResizeObserver(fit).observe($('art-stack').parentElement);
document.fonts.ready.then(fit);
weave();

$('open-prompt').addEventListener('click', () => {
  $('prompt-status').textContent = '';
  $('prompt-dialog').showModal();
});
$('close-prompt').addEventListener('click', () => $('prompt-dialog').close());
$('copy-prompt').addEventListener('click', async () => {
  try {
    await navigator.clipboard.writeText($('redraw-prompt').value);
    $('prompt-status').textContent = 'Prompt copied. Ready for your image editor.';
  } catch {
    $('redraw-prompt').focus();
    $('redraw-prompt').select();
    $('prompt-status').textContent = 'Select and copy the prompt manually.';
  }
});

$('art-background').addEventListener('input', () => {
  $('art-stack').parentElement.style.backgroundColor = $('art-background').value;
});
for (const kind of ['text', 'image']) {
  $('export-' + kind).addEventListener('click', () => {
    $(kind + '-export-status').textContent = '';
    if (kind === 'image') updateImageSize();
    $(kind + '-dialog').showModal();
  });
  $('close-' + kind).addEventListener('click', () => $(kind + '-dialog').close());
}
$('png').addEventListener('click', async () => {
  if (!selected) return;
  if (!updateImageSize()) return;
  const variant = selected, config = { ...settings(), ...imageSize(), transparent: $('transparent').checked };
  $('png').disabled = true;
  try {
    await document.fonts.ready;
    const canvas = document.createElement('canvas');
    paintImage(canvas, variant, config);
    const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('PNG export failed. Try fewer columns.');
    save(blob, 'charloom-' + canvas.width + 'x' + canvas.height + '.png', 'image/png');
    $('image-export-status').textContent = 'PNG ready. Check your downloads.';
  } catch (error) {
    $('image-export-status').textContent = error.message || 'PNG export failed.';
  } finally { $('png').disabled = false; }
});

function imageSize() {
  const custom = $('image-size').value === 'custom';
  return { edge: Number(custom ? $('image-edge').value : $('image-size').value),
    axis: custom ? $('image-axis').value : 'longest' };
}
function updateImageSize() {
  $('custom-image-size').hidden = $('image-size').value !== 'custom';
  if (!selected) return false;
  try {
    const {edge, axis} = imageSize();
    const {width, height} = imageDimensions(selected, result.options.character_aspect, edge, axis);
    $('image-dimensions').textContent = `PNG · ${width} × ${height} px`;
    $('png').disabled = false;
    return true;
  } catch (error) {
    $('image-dimensions').textContent = error.message;
    $('png').disabled = true;
    return false;
  }
}
for (const id of ['image-size', 'image-axis', 'image-edge'])
  $(id).addEventListener('input', updateImageSize);

let previewTimer, previewBusy = false, previewRevision = 0, processedUrl;
function resetPreview() {
  clearTimeout(previewTimer);
  previewRevision++;
  if (processedUrl) URL.revokeObjectURL(processedUrl);
  processedUrl = undefined;
  $('preview-toggle').hidden = true;
  $('preview-mode').value = 'original';
}
function showPreview() {
  const processed = $('preview-mode').value === 'processed';
  $('original').src = processed && processedUrl ? processedUrl : sourceUrl || '/static/orbital.png';
  $('original').alt = processed && processedUrl ? 'Processed tonal preview' : 'Original image';
  $('original-caption').textContent = processed ? (processedUrl ? 'Live tonal preview' : 'Updating preview…') : (file ? 'Original · local preview' : 'Original · orbital demo');
}
function schedulePreview() {
  previewRevision++;
  $('preview-toggle').hidden = false;
  $('preview-mode').value = 'processed';
  $('compare').checked = true;
  $('original-caption').textContent = 'Updating preview…';
  compare();
  clearTimeout(previewTimer);
  previewTimer = setTimeout(refreshPreview, 500);
}
async function refreshPreview() {
  if (previewBusy) return;
  previewBusy = true;
  const revision = previewRevision;
  $('original-caption').textContent = 'Updating preview…';
  try {
    const url = '/api/' + (file ? 'convert' : 'demo') + '?preview=true&options=' +
      encodeURIComponent(JSON.stringify({...options(), widths: [120]}));
    const response = await fetch(url, {method: file ? 'POST' : 'GET', body: file, signal: AbortSignal.timeout(25000)});
    if (!response.ok) throw new Error('Preview unavailable. Adjust a setting to retry.');
    const blob = await response.blob();
    if (revision !== previewRevision) return;
    if (processedUrl) URL.revokeObjectURL(processedUrl);
    processedUrl = URL.createObjectURL(blob);
    showPreview();
  } catch (error) {
    if (revision === previewRevision) $('original-caption').textContent = error.message;
  } finally {
    previewBusy = false;
    if (revision !== previewRevision && !$('preview-toggle').hidden) {
      clearTimeout(previewTimer);
      previewTimer = setTimeout(refreshPreview, 500);
    }
  }
}
for (const name of ['contrast', 'gamma', 'edge', 'background', 'invert'])
  $(name).addEventListener('change', schedulePreview);
for (const name of ['contrast', 'gamma', 'edge']) {
  const updateValue = $(name + '-value');
  $(name).addEventListener('input', () => {
    updateValue.textContent = Number($(name).value).toFixed(2);
    schedulePreview();
  });
}
$('preview-mode').addEventListener('change', showPreview);
