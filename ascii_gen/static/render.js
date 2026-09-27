/** Tone bytes are independent of the chosen ink color. Zero marks masked background. */
export function opacity(tone, strength) {
  return tone === 0 ? 0 : 1 - strength / 100 * (1 - tone / 255);
}

export function fitCells(width, height, columns, rows, aspect) {
  const cellWidth = Math.max(0, Math.min(width / columns, height * aspect / rows));
  return { cellWidth, lineHeight: cellWidth / aspect };
}

export function frameScheduler(apply, requestFrame = requestAnimationFrame) {
  let pending = false, latest;
  return value => {
    latest = value;
    if (pending) return;
    pending = true;
    requestFrame(() => { pending = false; apply(latest); });
  };
}

export function runs(variant) {
  const lines = variant.text.replace(/\n$/, '').split('\n');
  return lines.map((line, y) => {
    const row = [];
    for (let x = 0; x < variant.columns;) {
      const start = x, tone = variant.tones[y][x];
      while (x < variant.columns && variant.tones[y][x] === tone) x++;
      row.push({ text: line.slice(start, x), tone });
    }
    return row;
  });
}

export function exportHtml(variant, { color, strength, bold, aspect }) {
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ink = /^#[\da-f]{6}$/i.test(color) ? color : '#69efb2';
  const body = runs(variant).map(row => row.map(run => `<span style="opacity:${opacity(run.tone,strength).toFixed(3)}">${escape(run.text)}</span>`).join('')).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Charloom text art</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:#07110e}pre{color:${ink};font-family:'Courier New',monospace;font-weight:${bold?'bold':'normal'};font-size:clamp(2px,calc(95vw / ${variant.columns} / .6),12px);line-height:${1/aspect}ch;white-space:pre;letter-spacing:0;margin:16px;font-variant-ligatures:none}</style><pre role="img" aria-label="ASCII artwork generated with Charloom">${body}</pre></html>`;
}
