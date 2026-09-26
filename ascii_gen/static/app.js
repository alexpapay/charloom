import { opacity, runs, exportHtml } from './render.js';

const $ = id => document.getElementById(id);
let result, selected, file, requestId = 0, controller;
const controls = ['source','demo','weave'];
const downloads = ['txt','html','json','copy'];
function status(message, error = false) { $('status').textContent = message; $('status').classList.toggle('error',error); }
function options() { return { widths:[40,72,120,180],charset:$('palette').value,contrast:Number($('contrast').value),gamma:Number($('gamma').value),edge_weight:Number($('edge').value),background:$('background').value,invert:$('invert').checked }; }
function settings() { return { color:$('color').value,strength:Number($('strength').value),bold:$('bold').checked,aspect:result.options.character_aspect }; }
function shade() { const strength=Number($('strength').value); $('strength-value').textContent=`${strength}%`; for (const span of $('art').children) span.style.opacity=opacity(Number(span.dataset.tone),strength); }
function fit() {
  if (!selected) return;
  const weight=$('bold').checked?'bold':'normal'; $('art').style.fontWeight=weight; $('measure').style.fontWeight=weight;
  const width=$('art').parentElement.clientWidth;
  const availableHeight=window.matchMedia("(min-width:801px)").matches?Math.max(80,$("art").parentElement.clientHeight-50):560;
  const cell=Math.min(width/selected.columns,availableHeight*result.options.character_aspect/selected.rows);
  const measured=$('measure').getBoundingClientRect().width/10;
  $('art').style.fontSize=`${100*cell/measured}px`;
  $('art').style.lineHeight=`${cell/result.options.character_aspect}px`;
}
function draw(width=120) {
  selected=result.variants.find(v=>v.columns===width) || result.variants[0];
  const fragment=document.createDocumentFragment();
  runs(selected).forEach((row,index)=>{for(const run of row){const span=document.createElement('span');span.textContent=run.text;span.dataset.tone=run.tone;fragment.append(span);}if(index<selected.rows-1)fragment.append(document.createTextNode('\n'));});
  $('art').replaceChildren(fragment); $('empty').hidden=true;
  $('dimensions').textContent=`${selected.columns} × ${selected.rows} CHARACTERS`;
  document.querySelectorAll('[data-width]').forEach(b=>{b.setAttribute('aria-pressed',String(Number(b.dataset.width)===selected.columns));b.disabled=!result.variants.some(v=>v.columns===Number(b.dataset.width));});
  shade();fit();downloads.forEach(id=>$(id).disabled=false);
}
async function weave() {
  controller?.abort();controller=new AbortController();const id=++requestId;
  controls.forEach(name=>$(name).disabled=true);downloads.forEach(name=>$(name).disabled=true);
  status(file?'Weaving your image…':'Weaving the orbital demo…');$('weave').textContent='Weaving…';
  const url=`/api/${file?'convert':'demo'}?options=${encodeURIComponent(JSON.stringify(options()))}`;
  try {
    const response=await fetch(url,{method:file?'POST':'GET',body:file,signal:controller.signal});
    const body=await response.json();
    if(!response.ok)throw new Error(typeof body.detail==='string'?body.detail:'Could not convert this image.');
    if(id!==requestId)return;
    result=body;draw();status(body.warnings?.length?body.warnings.join(' '):'Ready. Choose a size, tune the ink, make it yours.');
  } catch(error) {if(error.name!=='AbortError'&&id===requestId){status(error.message||'Connection failed. Try again.',true);}}
  finally {if(id===requestId){controls.forEach(name=>$(name).disabled=false);$('weave').textContent='Weave image ↵';}}
}
function save(contents,name,type) {
  const url=URL.createObjectURL(new Blob([contents],{type}));const a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
$('settings').addEventListener('submit',event=>{event.preventDefault();weave();});
$('source').addEventListener('change',()=>{const next=$('source').files[0];if(!next)return;if(next.size>8*1024*1024){$('source').value='';status('Image exceeds 8 MB. Please resize it first.',true);return;}file=next;$('filename').textContent=next.name;weave();});
$('demo').addEventListener('click',()=>{file=undefined;$('source').value='';$('filename').textContent='Orbital demo / generated mathematically';weave();});
for(const name of ['contrast','gamma','edge']) $(name).addEventListener('input',()=>$(name+'-value').textContent=Number($(name).value).toFixed(2));
document.querySelectorAll('[data-width]').forEach(b=>b.addEventListener('click',()=>{if(result)draw(Number(b.dataset.width));}));
$('strength').addEventListener('input',shade);$('color').addEventListener('input',()=>document.documentElement.style.setProperty('--ink',$('color').value));$('bold').addEventListener('change',fit);
$('txt').addEventListener('click',()=>save(selected.text,`charloom-${selected.columns}.txt`,'text/plain;charset=utf-8'));
$('json').addEventListener('click',()=>save(JSON.stringify(result,null,2),'charloom.json','application/json'));
$('html').addEventListener('click',()=>save(exportHtml(selected,settings()),`charloom-${selected.columns}.html`,'text/html;charset=utf-8'));
$('copy').addEventListener('click',async()=>{try{await navigator.clipboard.writeText(selected.text);status('Text copied.');}catch{status('Clipboard unavailable. Use the TXT download instead.',true);}});
new ResizeObserver(fit).observe($('art').parentElement);document.fonts.ready.then(fit);weave();
