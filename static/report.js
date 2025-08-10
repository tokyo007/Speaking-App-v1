'use strict';

/* ---------- Utilities ---------- */
function byId(id){ return document.getElementById(id); }
function setText(id, val){ const el = byId(id); if(el) el.textContent = val; }
function setHTML(id, val){ const el = byId(id); if(el) el.innerHTML = val; }

/* ---------- UI helpers ---------- */
function badge(label,val){
  if(typeof val!=='number') return '';
  const cls = val>=80?'good':val>=60?'warn':'bad';
  return `<span class="badge ${cls}">${label}: ${Math.round(val)}</span>`;
}
function rubricNote(overall){
  if(overall>=85) return {level:'good', text:'Excellent pronunciation control and consistency.'};
  if(overall>=75) return {level:'good', text:'Strong overall. Minor issues with specific sounds or rhythm.'};
  if(overall>=65) return {level:'warn', text:'Fair. Work on clarity, stress, and pacing for consistency.'};
  if(overall>=55) return {level:'warn', text:'Needs improvement. Practice core sounds and sentence rhythm.'};
  return {level:'bad', text:'Focus on foundational sounds and slow, clear delivery.'};
}
function estimateIELTS(overall){
  if(overall>=85) return '≈ IELTS 7.0–7.5 (pronunciation component)';
  if(overall>=75) return '≈ IELTS 6.5–7.0 (pronunciation component)';
  if(overall>=65) return '≈ IELTS 6.0–6.5 (pronunciation component)';
  if(overall>=55) return '≈ IELTS 5.5–6.0 (pronunciation component)';
  return '≈ IELTS ≤5.0–5.5 (pronunciation component)';
}
function estimateEIKEN(overall){
  if(overall>=85) return '≈ EIKEN Pre-1 range (pronunciation)';
  if(overall>=75) return '≈ EIKEN 2–Pre-1 (pronunciation)';
  if(overall>=65) return '≈ EIKEN 2 (pronunciation)';
  if(overall>=55) return '≈ EIKEN Pre-2–2 (pronunciation)';
  return '≈ EIKEN 3–Pre-2 (pronunciation)';
}
function extractWords(detail){
  try{
    const nbest = detail?.NBest?.[0] || detail?.nBest?.[0];
    const words = nbest?.Words || nbest?.words || [];
    return Array.isArray(words)? words : [];
  }catch{ return []; }
}
function progress(label,val){
  const pct = Math.max(0, Math.min(100, Math.round(val||0)));
  const color = pct>=80?'#16a34a':pct>=60?'#f59e0b':'#dc2626';
  return `
    <div class="bar">
      <label>${label} <span class="muted">(${pct})</span></label>
      <div class="track"><div class="fill" style="width:${pct}%; background:${color}"></div></div>
    </div>`;
}

/* ---------- Storage helpers ---------- */
function getResult(){
  try{
    const raw = localStorage.getItem('lastResult') || localStorage.getItem('__ASSESSMENT__');
    return raw? JSON.parse(raw) : null;
  }catch{ return null; }
}

function downloadJSON(){
  const data = getResult(); if(!data){ alert('No report data.'); return; }
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'speaking_report.json'; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
}

/* ---------- Metrics rendering (shows WPM) ---------- */
function renderMetrics(r){
  const m = r.metrics || {};
  const block = `
    <ul class="kvs">
      <li><span>Duration</span><strong>${m.duration_mmss ?? '--:--'}</strong></li>
      <li><span>Total Words</span><strong>${m.word_count ?? '-'}</strong></li>
      <li><span>WPM</span><strong>${m.wpm ?? '-'}</strong></li>
      <li><span>Filler Words</span><strong>${m.fillers_total ?? '-'}</strong></li>
    </ul>`;
  setHTML('metrics', block);
  setHTML('metricsTop', block); // duplicate to top card so it’s prominent
}

/* ---------- Page render ---------- */
window.addEventListener('DOMContentLoaded', ()=>{
  const r = getResult();
  if(!r){
    document.body.innerHTML = '<div class="wrap"><h2>No report data</h2><p class="muted">Please submit a recording first.</p><p><a href="/">← Back</a></p></div>';
    return;
  }

  // Meta
  const now = new Date().toLocaleString();
  const mode = r.transcriptUsedAsReference ? 'Prompt Response' : 'Phrase Practice';
  setText('meta', `${mode} • ${now}`);

  // Scores & badges
  const s = r.scores || {};
  const badges = [
    badge('Overall', Number(s.pronunciation||0)),
    badge('Accuracy', Number(s.accuracy||0)),
    badge('Fluency', Number(s.fluency||0)),
    badge('Completeness', Number(s.completeness||0))
  ].join(' ');
  setHTML('badges', `<div class="lead">${badges}</div>`);

  // Estimates + coaching note
  const overall = Number(s.pronunciation||0);
  setHTML('estimates', `<strong>Estimates:</strong> ${estimateIELTS(overall)}; ${estimateEIKEN(overall)} <span class="muted">— based on pronunciation only</span>`);
  const rnote = rubricNote(overall);
  const border = rnote.level==='good' ? '#16a34a' : rnote.level==='warn' ? '#f59e0b' : '#dc2626';
  const rub = byId('rubric'); if(rub){ rub.style.borderLeft = `5px solid ${border}`; rub.textContent = rnote.text; }

  // Reference + recognized text
  setHTML('recognized', `
    <div><strong>Recognized:</strong> ${r.recognizedText || '(empty)'}</div>
    ${r.referenceText ? `<div><strong>Reference:</strong> ${r.referenceText}</div>` : ''}
    ${r.transcriptUsedAsReference ? `<div><strong>Reference (auto‑transcript):</strong> ${r.transcriptUsedAsReference}</div>` : ''}
  `);

  // Pills
  const refPreview = (r.referenceText || r.transcriptUsedAsReference || '');
  setText('refTextPill', refPreview ? `Ref: ${refPreview.slice(0,60)}${refPreview.length>60?'…':''}` : 'Ref: (none)');
  setText('langPill', `Lang: ${r.language || 'en-US'}`);

  // Bars
  const barsHtml = [ progress('Accuracy', s.accuracy), progress('Fluency', s.fluency), progress('Completeness', s.completeness) ].join('');
  setHTML('bars', barsHtml);

  // Words table
  const words = extractWords(r.detail || {});
  setText('wlNote','Rows in pink indicate likely
