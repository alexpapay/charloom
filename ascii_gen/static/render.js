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

export function exportHtml(variant, { color, background = "#000000", strength, bold, aspect }) {
  const escape = text => text.replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const ink = /^#[\da-f]{6}$/i.test(color) ? color : '#69efb2';
  const paper = /^#[\da-f]{6}$/i.test(background) ? background : '#000000';
  const body = runs(variant).map(row => row.map(run => `<span style="opacity:${opacity(run.tone,strength).toFixed(3)}">${escape(run.text)}</span>`).join('')).join('\n');
  return `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Charloom text art</title><style>body{margin:0;min-height:100vh;display:grid;place-items:center;background:${paper}}pre{color:${ink};font-family:'Courier New',monospace;font-weight:${bold?'bold':'normal'};font-size:clamp(2px,calc(95vw / ${variant.columns} / .6),12px);line-height:${1/aspect}ch;white-space:pre;letter-spacing:0;margin:16px;font-variant-ligatures:none}</style><pre role="img" aria-label="ASCII artwork generated with Charloom">${body}</pre></html>`;
}

/** Paint the same glyph grid and tone opacity without scaling a screenshot. */
export function paintImage(canvas, variant, { color, background, strength, bold, aspect, transparent }) {
  const ratio = variant.columns * aspect / variant.rows;
  canvas.width = Math.round(ratio >= 1 ? 2048 : 2048 * ratio);
  canvas.height = Math.round(ratio >= 1 ? 2048 / ratio : 2048);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image export is unavailable in this browser.');
  if (!transparent) {
    context.fillStyle = background;
    context.fillRect(0, 0, canvas.width, canvas.height);
  }
  const cellWidth = canvas.width / variant.columns;
  const cellHeight = canvas.height / variant.rows;
  const weight = bold ? 'bold' : 'normal';
  context.font = `${weight} 100px "Courier New", monospace`;
  const size = 100 * cellWidth / context.measureText('0').width;
  context.font = `${weight} ${size}px "Courier New", monospace`;
  context.textBaseline = 'middle';
  context.fillStyle = color;
  runs(variant).forEach((row, y) => {
    let x = 0;
    for (const run of row) {
      context.globalAlpha = opacity(run.tone, strength);
      for (const char of run.text) {
        if (char !== ' ' && context.globalAlpha > 0)
          context.fillText(char, x * cellWidth, (y + .5) * cellHeight);
        x++;
      }
    }
  });
  context.globalAlpha = 1;
}
