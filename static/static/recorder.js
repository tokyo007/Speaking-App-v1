'use strict';

const ENDPOINT_PHRASE = '/assess_phrase';
const ENDPOINT_PROMPT = '/assess_prompt';

let mediaRecorder1=null, mediaRecorder2=null;
let chunks1=[], chunks2=[];
let blob1=null, blob2=null;

function setStatus(which, text) {
  const id = which === 1 ? 'status1' : 'status2';
  const el = document.getElementById(id);
  if (el) el.textContent = text;
}

function ensureMediaSupport() {
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) { alert('Your browser does not support microphone access. Use Chrome/Edge desktop.'); return false; }
  if (typeof MediaRecorder === 'undefined') { alert('MediaRecorder not available. Use Chrome/Edge desktop.'); return false; }
  return true;
}
function getStream() { return navigator.mediaDevices.getUserMedia({ audio: true }); }

function setupRecorder(stream, which) {
  const mime = MediaRecorder.isTypeSupported('audio/webm') ? 'audio/webm' : '';
  const mr = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
  const chunks = which === 1 ? chunks1 : chunks2;
  mr.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
  mr.onstop = () => {
    const blob = new Blob(chunks, { type: mime || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    if (which === 1) {
      blob1 = blob; const a1 = document.getElementById('audio1'); if (a1) a1.src = url;
      const s1 = document.getElementById('send1'); if (s1) s1.disabled = false;
    } else {
      blob2 = blob; const a2 = document.getElementById('audio2'); if (a2) a2.src = url;
      const s2 = document.getElementById('send2'); if (s2) s2.disabled = false;
    }
  };
  return mr;
}

async function postForm(url, formData) {
  const res = await fetch(url, { method: 'POST', body: formData });
  let json; try { json = await res.json(); } catch { throw new Error(`Non-JSON response (status ${res.status})`); }
  if (!res.ok || json.status === 'error') {
    const msg = json?.message || `Request failed (${res.status})`; const raw = json?.raw ? `\nRaw: ${json.raw}` : '';
    throw new Error(`${msg}${raw}`);
  }
  return json;
}

window.addEventListener('DOMContentLoaded', () => {
  console.log('recorder.js loaded');

  const rec1 = document.getElementById('rec1'); const stop1 = document.getElementById('stop1'); const send1 = document.getElementById('send1');
  const rec2 = document.getElementById('rec2'); const stop2 = document.getElementById('stop2'); const send2 = document.getElementById('send2');
  if (!rec1 || !stop1 || !send1 || !rec2 || !stop2 || !send2) { console.error('Missing controls in index.html'); return; }

  // Course A
  rec1.onclick = async () => {
    if (!ensureMediaSupport()) return;
    chunks1 = [];
    try {
      const s = await getStream();
      mediaRecorder1 = setupRecorder(s, 1);
      mediaRecorder1.start();
      setStatus(1, 'recording...');
      rec1.disabled = true; stop1.disabled = false;
    } catch (e) { console.error(e); setStatus(1,'mic blocked'); alert('Allow microphone in the address bar.'); }
  };
  stop1.onclick = () => {
    try { if (mediaRecorder1 && mediaRecorder1.state !== 'inactive') { mediaRecorder1.stop(); setStatus(1,'recorded'); } }
    finally { rec1.disabled = false; stop1.disabled = true; }
  };
  send1.onclick = async () => {
    if (!blob1) return alert('Please record first.');
    const phrase = (document.getElementById('phrase')?.value || '').trim();
    const lang = document.getElementById('lang1')?.value || 'en-US';
    const fd = new FormData(); fd.append('phrase', phrase); fd.append('language', lang); fd.append('audio', blob1, 'audio.webm');
    setStatus(1,'uploading...');
    try {
      const json = await postForm(ENDPOINT_PHRASE, fd);
      localStorage.setItem('lastResult', JSON.stringify(json));
      window.location.href = '/report'; // auto-redirect
    } catch (e) { console.error(e); setStatus(1,'error'); alert(`Scoring failed:\n${e.message}`); }
  };

  // Course B
  rec2.onclick = async () => {
    if (!ensureMediaSupport()) return;
    chunks2 = [];
    try {
      const s = await getStream();
      mediaRecorder2 = setupRecorder(s, 2);
      mediaRecorder2.start();
      setStatus(2, 'recording (max ~60s)...');
      rec2.disabled = true; stop2.disabled = false;
      setTimeout(() => { try { if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') { mediaRecorder2.stop(); setStatus(2,'auto-stopped'); rec2.disabled=false; stop2.disabled=true; } } catch {} }, 65000);
    } catch (e) { console.error(e); setStatus(2,'mic blocked'); alert('Allow microphone in the address bar.'); }
  };
  stop2.onclick = () => {
    try { if (mediaRecorder2 && mediaRecorder2.state !== 'inactive') { mediaRecorder2.stop(); setStatus(2,'recorded'); } }
    finally { rec2.disabled = false; stop2.disabled = true; }
  };
  send2.onclick = async () => {
    if (!blob2) return alert('Please record first.');
    const lang = document.getElementById('lang2')?.value || 'en-US';
    const fd = new FormData(); fd.append('language', lang); fd.append('audio', blob2, 'audio.webm');
    setStatus(2,'uploading...');
    try {
      const json = await postForm(ENDPOINT_PROMPT, fd);
      localStorage.setItem('lastResult', JSON.stringify(json));
      window.location.href = '/report'; // auto-redirect
    } catch (e) { console.error(e); setStatus(2,'error'); alert(`Upload/scoring failed:\n${e.message}`); }
  };
});
