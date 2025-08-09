/* static/recorder.js */
'use strict';

// ===== Config =====
// If your backend uses the two-endpoint version (recommended), keep these:
const ENDPOINT_PHRASE = '/assess_phrase';
const ENDPOINT_PROMPT = '/assess_prompt';

// If your backend uses a single endpoint named /assess instead,
// change both fetch() calls below to use '/assess' and align field names.

// ===== State =====
let mediaRecorder1 = null, mediaRecorder2 = null;
let chunks1 = [], chunks2 = [];
let blob1 = null, blob2 = null;

// ===== UI helpers =====
function scoreBadge(label, val) {
  if (typeof val !== 'number') return '';
  const cls = val >= 80 ? 'good' : val >= 60 ? 'warn' : 'bad';
  return `<span class="badge ${cls}">${label}: ${Math.round(val)}</span>`;
}

function rubricNote(overall) {
  if (overall >= 85) return { level: 'good', text: 'Excellent pronunciation control and consistency.' };
  if (overall >= 75) return { level: 'good', text: 'Strong overall. Minor issues with specific sounds or rhythm.' };
  if (overall >= 65) return { level: 'warn', text: 'Fair. Work on clarity, stress, and pacing for consistency.' };
  if (overall >= 55) return { level: 'warn', text: 'Needs improvement. Practice core sounds and sentence rhythm.' };
  return { level: 'bad', text: 'Weak. Focus on foundational sounds and slow, clear delivery.' };
}

function estimateIELTS(overall) {
  if (overall >= 85) return '≈ IELTS 7.0–7.5 (pronunciation component)';
  if (overall >= 75) return '≈ IELTS 6.5–7.0 (pronunciation component)';
  if (overall >= 65) return '≈ IELTS 6.0–6.5 (pronunciation component)';
  if (overall >= 55) return '≈ IELTS 5.5–6.0 (pronunciation component)';
  return '≈ IELTS ≤5.0–5.5 (pronunciation component)';
}

function estimateEIKEN(overall) {
  if (overall >= 85) return '≈ EIKEN Pre-1 range (pronunciation)';
  if (overall >= 75) return '≈ EIKEN 2–Pre-1 (pronunciation)';
  if (overall >= 65) return '≈ EIKEN 2 (pronunciation)';
  if (overall >= 55) return '≈ EIKEN Pre-2–2 (pronunciation)';
  return '≈ EIKEN 3–Pre-2 (pronunciation)';
}

function renderRubric(noteContainerId, overallScore) {
  const el = document.getElementById(noteContainerId);
  if (!el) return;
  if (typeof overallScore !== 'number') {
    el.innerHTML = '<span class="muted">No overall score.</span>';
    return;
  }
  const r = rubricNote(overallScore);
  const ielts = estimateIELTS(overallScore);
  const eiken = estimateEIKEN(overallScore);
  const border = r.level === 'good' ? '#2e7d32' : (r.level === 'warn' ? '#f9a825' : '#c62828');
  el.innerHTML = `
    <div style="border-left:4px solid ${border}; padding-left:10px;">
      <div><strong>Rubric:</strong> ${r.text}</div>
      <div><strong>Estimates:</strong> ${ielts}; ${eiken}</div>
      <div class="muted" style="font-size:0.85em;margin-top:4px;">
        * Estimates are based on pronunciation score only and are not official conversions.
      </div>
    </div>`;
}

function extractWords(detail) {
  try {
    const nbest = detail?.NBest?.[0] || detail?.nBest?.[0];
    const words = nbest?.Words || nbest?.words || [];
    return Array.isArray(words) ? words : [];
  } catch {
    return [];
  }
}

function renderWordTable(words) {
  if (!words.length) return '<div class="muted">No word-level details.</div>';
  const rows = words.map(w => {
    const word = w.Word ?? w.word ?? '';
    const err = w.ErrorType ?? w.errorType ?? 'None';
    const pa = w.PronunciationAssessment ?? w.pronunciationAssessment ?? {};
    const acc = pa.AccuracyScore ?? pa.accuracyScore ?? null;
    const cls = (err && err !== 'None') || (acc !== null && acc < 60) ? 'word-bad' : '';
    return `<tr class="${cls}">
      <td>${word}</td>
      <td>${acc !== null ? Math.round(acc) : '-'}</td>
      <td>${err}</td>
    </tr>`;
  }).join('');
  return `
    <table class="table">
      <thead><tr><th>Word</th><th>Accuracy</th><th>Error</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function renderScores(containerId, scores) {
  const el = document.getElementById(containerId);
  if (!el) return;
  if (!scores) {
    el.innerHTML = '<span class="muted">No scores.</span>';
    return;
  }
  el.innerHTML = [
    scoreBadge('Overall', scores.pronunciation),
    scoreBadge('Accuracy', scores.accuracy),
    scoreBadge('Fluency', scores.fluency),
    scoreBadge('Completeness', scores.completeness),
  ].join(' ');
}

function setStatus(which, text) {
  const id = which === 1 ? 'status1' : 'status2';
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

// ===== Media helpers =====
function ensureMediaSupport() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    alert('Your browser does not support microphone access (getUserMedia). Try Chrome or Edge on desktop.');
    return false;
  }
  if (typeof MediaRecorder === 'undefined') {
    alert('MediaRecorder is not available in this browser. Try Chrome or Edge on desktop.');
    return false;
  }
  return true;
}

function getStream() {
  return navigator.mediaDevices.getUserMedia({ audio: true });
}

function setupRecorder(stream, which) {
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = which === 1 ? chunks1 : chunks2;

  mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };

  mr.onstop = () => {
    const blob = new Blob(chunks, { type: mime || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    if (which === 1) {
      blob1 = blob;
      const a1 = document.getElementById('audio1');
      if (a1) a1.src = url;
      const send1 = document.getElementById('send1');
      if (send1) send1.disabled = false;
    } else {
      blob2 = blob;
      const a2 = document.getElementById('audio2');
      if (a2) a2.src = url;
      const send2 = document.getElementById('send2');
      if (send2) send2.disabled = false;
    }
  };

  return mr;
}

// ===== Network helper =====
async function postForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  // Try to parse JSON safely
  let json;
  try {
    json = await res.json();
  } catch {
    throw new Error(`Server returned non-JSON (status ${res.status})`);
  }
  if (!res.ok || json.status === 'error') {
    const msg = json?.message || `Request failed with status ${res.status}`;
    const raw = json?.raw ? `\nRaw: ${json.raw}` : '';
    throw new Error(`${msg}${raw}`);
  }
  return json;
}

// ===== Main wiring =====
window.addEventListener('DOMContentLoaded', () => {
  // Sanity: confirm script loaded
  console.log('recorder.js loaded');

  // Buttons & elements
  const rec1 = document.getElementById('rec1');
  const stop1 = document.getElementById('stop1');
  const send1 = document.getElementById('send1');

  const rec2 = document.getElementById('rec2');
  const stop2 = document.getElementById('stop2');
  const send2 = document.getElementById('send2');

  // Guard: elements must exist
  if (!rec1 || !stop1 || !send1 || !rec2 || !stop2 || !send2) {
    console.error('One or more buttons are missing. Check IDs in index.html.');
    return;
  }

  // ---- Course A (Phrase Practice) ----
  rec1.onclick = async () => {
    if (!ensureMediaSupport()) return;
    chunks1 = [];
    try {
      const s = await getStream();
      mediaRecorder1 = setupRecorder(s, 1);
      mediaRecorder1.start();
      setStatus(1, 'recording...');
      rec1.disabled = true;
      stop1.disabled = false;
    } catch (e) {
      console.error(e);
      setStatus(1, 'mic blocked');
      alert('Microphone permission blocked. Click the lock icon in the address bar and allow Microphone.');
    }
  };

  stop1.onclick = () => {
    try {
      if (mediaRecorder1 && mediaRecorder1.state !== 'inactive') {
        mediaRecorder1.stop();
        setStatus(1, 'recorded');
      }
    } finally {
      rec1.disabled = false;
      stop1.disabled = true;
    }
  };

  send1.onclick = async () => {
    if (!blob1) {
      alert('Please record first.');
      return;
    }
    const phrase = (document.getElementById('phrase')?.value || '').trim();
    const lang = document.getElementById('lang1')?.value || 'en-US';
    const fd = new FormData();
    fd.append('phrase', phrase);         // matches /assess_phrase backend
    fd.append('language', lang);
    fd.append('audio', blob1, 'audio.webm');

    setStatus(1, 'uploading...');
    try {
      const json = await postForm(ENDPOINT_PHRASE, fd);

      renderScores('scores1', json.scores);
      renderRubric('scores1_note', json?.scores?.pronunciation);

      const recOut = document.getElementById('recognized1');
      if (recOut) {
        recOut.innerHTML = `
          <div><strong>Recognized:</strong> ${json.recognizedText || '(empty)'}</div>
          <div><strong>Reference:</strong> ${json.referenceText || '(none)'}</div>`;
      }

      const words = extractWords(json.detail || {});
      const w1 = document.getElementById('words1');
      if (w1) w1.innerHTML = renderWordTable(words);

      setStatus(1, 'done');
    } catch (e) {
      console.error(e);
      setStatus(1, 'error');
      alert(`Scoring failed:\n${e.message}`);
    }
  };

  // ---- Course B (Prompt Response) ----
  rec2.onclick = async () => {
    if (!ensureMediaSupport()) return;
    chunks2 = [];
    try {
      const s = await getStream();
      mediaRecorder2 = setupRecorder(s, 2);
      mediaRecorder2.start();
      setStatus(2, 'recording (max ~60s)...');
      rec2.disabled = true;
      stop2.disabled = false;

      // Auto-stop after ~65s as a safety
      setTimeout(() => {
        try {
          if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') {
            mediaRecorder2.stop();
            setStatus(2, 'auto-stopped');
            rec2.disabled = false;
            stop2.disabled = true;
          }
        } catch {}
      }, 65000);
    } catch (e) {
      console.error(e);
      setStatus(2, 'mic blocked');
      alert('Microphone permission blocked. Click the lock icon in the address bar and allow Microphone.');
    }
  };

  stop2.onclick = () => {
    try {
      if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') {
        mediaRecorder2.stop();
        setStatus(2, 'recorded');
      }
    } finally {
      rec2.disabled = false;
      stop2.disabled = true;
    }
  };

  send2.onclick = async () => {
    if (!blob2) {
      alert('Please record first.');
      return;
    }
    const lang = document.getElementById('lang2')?.value || 'en-US';
    const fd = new FormData();
    fd.append('language', lang);
    fd.append('audio', blob2, 'audio.webm'); // backend will STT then assess using transcript

    setStatus(2, 'uploading...');
    try {
      const json = await postForm(ENDPOINT_PROMPT, fd);

      renderScores('scores2', json.scores);
      renderRubric('scores2_note', json?.scores?.pronunciation);

      const recOut = document.getElementById('recognized2');
      if (recOut) recOut.innerHTML = `<div><strong>Recognized:</strong> ${json.recognizedText || '(empty)'}</div>`;

      const trOut = document.getElementById('transcript2');
      if (trOut) trOut.innerHTML = `<div><strong>Transcript (used as reference):</strong> ${json.transcriptUsedAsReference || '(none)'}</div>`;

      const words = extractWords(json.detail || {});
      const w2 = document.getElementById('words2');
      if (w2) w2.innerHTML = renderWordTable(words);

      setStatus(2, 'done');
    } catch (e) {
      console.error(e);
      setStatus(2, 'error');
      alert(`Upload or scoring failed:\n${e.message}`);
    }
  };
});

// Small console breadcrumb so you can verify load:
console.log('recorder bootstrap OK');
