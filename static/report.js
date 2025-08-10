
function progress(label, value) {
  const v = Math.max(0, Math.min(100, Number(value) || 0));
  return `<div class="bar"><div class="barLabel">${label}</div><div class="barTrack"><div class="barFill" style="width:${v}%"></div></div><div class="barVal">${v}</div></div>`;
}

function wordsTable(words){
  if(!Array.isArray(words) || words.length===0){ return '<div class="muted">No word-level details.</div>'; }
  const rows = words.map(w => {
    const word = w.Word || w.word || '';
    const pa = w.PronunciationAssessment || w.pronunciationAssessment || {};
    const acc = pa.AccuracyScore || pa.accuracyScore || '';
    const err = pa.ErrorType || pa.errorType || '';
    const bad = (String(err).toLowerCase() !== 'none') || (Number(acc) < 70);
    return `<tr class="${bad?'bad':''}"><td>${word}</td><td>${acc}</td><td>${err}</td><td>${w.Offset||w.offset||''}</td><td>${w.Duration||w.duration||''}</td></tr>`;
  }).join('');
  return `<table class="grid"><thead><tr><th>Word</th><th>Acc</th><th>Error</th><th>Offset</th><th>Dur</th></tr></thead><tbody>${rows}</tbody></table>`;
}

function renderReport(r){
  const s = r.scores || {};
  const m = r.metrics || {};
  document.getElementById('overall').textContent = Math.round(Number(s.pronunciation||0));
  document.getElementById('summary').textContent = (r.recognizedText || '').slice(0, 160) || '(no recognized text)';

  const bars = document.getElementById('bars');
  bars.innerHTML = [ progress('Accuracy', s.accuracy), progress('Fluency', s.fluency), progress('Completeness', s.completeness) ].join('');

  document.getElementById('metrics').innerHTML = `
    <ul class="kvs">
      <li><span>Duration</span><strong>${m.duration_mmss || '--:--'}</strong></li>
      <li><span>Total Words</span><strong>${m.word_count ?? '-'}</strong></li>
      <li><span>WPM</span><strong>${m.wpm ?? '-'}</strong></li>
      <li><span>Filler Words</span><strong>${m.fillers_total ?? '-'}</strong></li>
    </ul>
  `;

  document.getElementById('refTextPill').textContent = (r.referenceText || r.transcriptUsedAsReference) ?
    `Ref: ${(r.referenceText || r.transcriptUsedAsReference).slice(0, 60)}${(r.referenceText || r.transcriptUsedAsReference).length>60?'…':''}`
    : 'Ref: (none)';
  document.getElementById('langPill').textContent = `Lang: ${r.language || 'en-US'}`;

  const detail = r.detail || {};
  const words = (detail.NBest?.[0]?.Words) || (detail.nBest?.[0]?.words) || [];
  document.getElementById('wlNote').textContent = 'Rows in pink indicate likely issues (error or low accuracy).';
  document.getElementById('wordsTable').innerHTML = wordsTable(words);

  const pdfBtn = document.getElementById('btnPdf');
  if (pdfBtn && r.result_id) {
    pdfBtn.onclick = () => window.open(`/report_pdf/${r.result_id}`, '_blank');
    pdfBtn.disabled = false;
  }
}

function downloadJSON(){
  const r = JSON.parse(localStorage.getItem('__ASSESSMENT__') || '{}');
  const blob = new Blob([JSON.stringify(r, null, 2)], {type:'application/json'});
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'assessment.json';
  a.click();
}

window.addEventListener('DOMContentLoaded', () => {
  const r = JSON.parse(localStorage.getItem('__ASSESSMENT__') || '{}');
  if (!r || !r.status) {
    document.getElementById('summary').textContent = 'No report data. Please run an assessment first.';
    return;
  }
  renderReport(r);
});
