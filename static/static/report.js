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
  return {level:'bad', text:'Weak. Focus on foundational sounds and slow, clear delivery.'};
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
function wordsTable(words){
  if(!words.length) return '<div class="muted">No word-level details.</div>';
  const rows = words.map(w=>{
    const word = w.Word ?? w.word ?? '';
    const err  = w.ErrorType ?? w.errorType ?? 'None';
    const pa   = w.PronunciationAssessment ?? w.pronunciationAssessment ?? {};
    const acc  = pa.AccuracyScore ?? pa.accuracyScore ?? null;
    const bad  = (err && err!=='None') || (acc!==null && acc<60);
    return `<tr class="${bad?'bad':''}"><td>${word}</td><td>${acc!==null?Math.round(acc):'-'}</td><td>${err}</td></tr>`;
  }).join('');
  return `<table><thead><tr><th>Word</th><th>Accuracy</th><th>Error</th></tr></thead><tbody>${rows}</tbody></table>`;
}
function getResult(){
  try{ const raw = localStorage.getItem('lastResult'); return raw? JSON.parse(raw) : null; }catch{ return null; }
}
function downloadJSON(){
  const data = getResult(); if(!data){ alert('No report data.'); return; }
  const blob = new Blob([JSON.stringify(data,null,2)], {type:'application/json'});
  const url = URL.createObjectURL(blob); const a = document.createElement('a');
  a.href = url; a.download = 'speaking_report.json'; document.body.appendChild(a); a.click(); URL.revokeObjectURL(url); a.remove();
}

/* ---------- Render ---------- */
function renderMetrics(r){
  const m = r.metrics || {};
  const html = `
    <ul class="kvs">
      <li><span>Duration</span><strong>${m.duration_mmss ?? '--:--'}</strong></li>
      <li><span>Total Words</span><strong>${m.word_count ?? '-'}</strong></li>
      <li><span>WPM</span><strong>${m.wpm ?? '-'}</strong></li>
      <li><span>Filler Words</span><strong>${m.fillers_total ?? '-'}</strong></li>
    </ul>
  `;
  setHTML('metrics', html);
}

function wirePdf(r){
  const btn = byId('btnPdf');
  if(btn && r.result_id){
    btn.disabled = false;
    btn.onclick = ()=> window.open(`/report_pdf/${r.result_id}`, '_blank');
  }
}

window.addEventListener('DOMContentLoaded', ()=>{
  const r = getResult();
  if(!r){
    document.body.innerHTML = '<div class="wrap"><h2>No report data</h2><p class="muted">Go back and submit a recording first.</p><p><a href="/">← Back</a></p></div>';
    return;
  }
  const now = new Date().toLocaleString();
  const mode = r.transcriptUsedAsReference ? 'Prompt Response' : 'Phrase Practice';
  setText('meta', `${mode} • ${now}`);

  const s = r.scores || {};
  const allBadges = ['Overall','Accuracy','Fluency','Completeness'].map((label,i)=>{
    const val = i===0? s.pronunciation : i===1? s.accuracy : i===2? s.fluency : s.completeness;
    return badge(label, Number(val||0));
  }).join(' ');
  setHTML('badges', allBadges);

  const overall = Number(s.pronunciation||0);
  setHTML('estimates', `<strong>Estimates:</strong> ${estimateIELTS(overall)}; ${estimateEIKEN(overall)} <span class="muted">— pronunciation only</span>`);

  const rnote = rubricNote(overall);
  const border = rnote.level==='good' ? '#16a34a' : rnote.level==='warn' ? '#f59e0b' : '#dc2626';
  const rub = byId('rubric'); if(rub){ rub.style.borderLeft = `4px solid ${border}`; rub.textContent = rnote.text; }

  setHTML('recognized', `
    <div><strong>Recognized:</strong> ${r.recognizedText || '(empty)'}</div>
    ${r.referenceText ? `<div><strong>Reference:</strong> ${r.referenceText}</div>` : ''}
    ${r.transcriptUsedAsReference ? `<div><strong>Reference (auto‑transcript):</strong> ${r.transcriptUsedAsReference}</div>` : ''}
  `);

  setText('refTextPill', (r.referenceText || r.transcriptUsedAsReference) ?
    `Ref: ${(r.referenceText || r.transcriptUsedAsReference).slice(0,60)}${(r.referenceText || r.transcriptUsedAsReference).length>60?'…':''}`
    : 'Ref: (none)');
  setText('langPill', `Lang: ${r.language || 'en-US'}`);

  const barsHtml = [ progress('Accuracy', s.accuracy), progress('Fluency', s.fluency), progress('Completeness', s.completeness) ].join('');
  setHTML('bars', barsHtml);

  const words = extractWords(r.detail || {});
  setText('wlNote','Rows in pink indicate likely issues (error or low accuracy).');
  setHTML('wordsTable', wordsTable(words));

  renderMetrics(r);
  wirePdf(r);
});

// Expose for button
window.downloadJSON = downloadJSON;
