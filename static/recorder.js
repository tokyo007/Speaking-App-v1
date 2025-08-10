'use strict';

/**
 * This file:
 * - Populates Test → Group → Question selectors from TEST_BANK
 * - Records audio with MediaRecorder
 * - Uploads to /assess_prompt with metadata (testType, groupId, questionId, promptText, language)
 * - Saves JSON to localStorage.lastResult and redirects to /report
 */

// --- Minimal test bank (add as many groups/questions as you like) ---
const TEST_BANK = {
  IELTS: {
    1: [
      'What do you usually do in your free time?',
      'Do you prefer to spend your free time alone or with others? Why?'
    ],
    2: [
      'Describe a memorable trip you took. Say where you went, who you went with, and why it was memorable.'
    ],
    3: [
      'How has tourism changed in your country over the last 20 years?'
    ]
  },
  EIKEN: {
    1: [
      'What is your favorite subject at school? Please tell me why.',
      'Do you prefer studying alone or with friends? Please explain.'
    ],
    2: [
      'Do you think students should use smartphones in class? Why or why not?'
    ],
    3: [
      'What are some ways to protect the environment in your community?'
    ]
  },
  TOEFL: {
    1: [
      'Some people prefer studying in the morning, others at night. Which do you prefer and why?'
    ],
    2: [
      'Summarize an announcement from a university and give your opinion.'
    ]
  },
  DET: {
    1: [
      'Describe a photo of a busy city street to someone who cannot see it.'
    ],
    2: [
      'Do you agree or disagree that social media has improved communication? Explain your reasons.'
    ]
  }
};

// --- DOM refs (assigned after DOMContentLoaded) ---
let testSel, groupSel, qSel, promptEl, randBtn, statusEl, langSel, recBtn, stopBtn, playback;

// --- MediaRecorder state ---
let mediaRecorder = null;
let chunks = [];
let blob = null;

// --------------- UI helpers ---------------
function setStatus(msg) {
  if (statusEl) statusEl.textContent = msg || '';
}
function ensureMediaSupport() {
  if (!navigator.mediaDevices?.getUserMedia) {
    alert('Your browser does not support microphone access. Use Chrome/Edge.');
    return false;
  }
  if (typeof MediaRecorder === 'undefined') {
    alert('MediaRecorder is not available. Use Chrome/Edge.');
    return false;
  }
  return true;
}

// --------------- Selectors logic ---------------
function fillTests() {
  const tests = Object.keys(TEST_BANK);
  testSel.innerHTML = tests.map(t => `<option value="${t}">${t}</option>`).join('');
}
function fillGroups() {
  const groups = TEST_BANK[testSel.value] || {};
  const keys = Object.keys(groups);
  groupSel.innerHTML = keys.map(k => `<option value="${k}">Group ${k}</option>`).join('');
}
function fillQuestions() {
  const qs = (TEST_BANK[testSel.value] || {})[groupSel.value] || [];
  qSel.innerHTML = qs.map((q, i) => `<option value="${i}">Q${i + 1}</option>`).join('');
}
function setPromptFromSelection() {
  const qs = (TEST_BANK[testSel.value] || {})[groupSel.value] || [];
  const q = qs[parseInt(qSel.value || '0', 10)] || '';
  promptEl.textContent = q;
  // remember choices
  localStorage.setItem('lastTestSel', testSel.value);
  localStorage.setItem('lastGroupSel', groupSel.value);
  localStorage.setItem('lastQSel', qSel.value);
}
function randomizeQuestion() {
  const groups = TEST_BANK[testSel.value] || {};
  const gKeys = Object.keys(groups);
  if (!gKeys.length) return;
  const gKey = gKeys[Math.floor(Math.random() * gKeys.length)];
  const qs = groups[gKey];
  const idx = Math.floor(Math.random() * qs.length);

  groupSel.value = gKey;
  fillQuestions();
  qSel.value = String(idx);
  setPromptFromSelection();
}

// --------------- Recording ---------------
async function startRecording() {
  if (!ensureMediaSupport()) return;
  chunks = [];
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    const mimeType = MediaRecorder.isTypeSupported('audio/webm') ? { mimeType: 'audio/webm' } : undefined;
    mediaRecorder = new MediaRecorder(stream, mimeType);
    mediaRecorder.ondataavailable = e => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    mediaRecorder.onstop = () => {
      blob = new Blob(chunks, { type: 'audio/webm' });
      // preview
      const url = URL.createObjectURL(blob);
      if (playback) playback.src = url;
      // auto-upload after recording stops
      uploadRecording().catch(err => {
        console.error(err);
        setStatus('Upload/scoring failed: ' + err.message);
      });
    };
    mediaRecorder.start();
    setStatus('Recording… (auto-stops ~65s)');
    recBtn.disabled = true;
    stopBtn.disabled = false;

    // safety auto-stop
    setTimeout(() => {
      try {
        if (mediaRecorder && mediaRecorder.state !== 'inactive') {
          mediaRecorder.stop();
          setStatus('Auto-stopped. Uploading…');
          recBtn.disabled = false;
          stopBtn.disabled = true;
        }
      } catch {}
    }, 65000);
  } catch (e) {
    console.error('Mic error:', e);
    setStatus('Microphone blocked. Please allow access in the address bar.');
    alert('Please allow microphone access.');
  }
}

function stopRecording() {
  try {
    if (mediaRecorder && mediaRecorder.state !== 'inactive') {
      mediaRecorder.stop();
      setStatus('Stopped. Uploading…');
    }
  } finally {
    recBtn.disabled = false;
    stopBtn.disabled = true;
  }
}

// --------------- Upload ---------------
async function uploadRecording() {
  if (!blob) {
    setStatus('No audio captured. Try again.');
    return;
  }
  const fd = new FormData();
  fd.append('language', (langSel?.value || 'en-US'));
  fd.append('audio', blob, 'audio.webm');
  fd.append('testType', testSel?.value || '');
  fd.append('groupId', groupSel?.value || '');
  fd.append('questionId', qSel?.value || '');
  fd.append('promptText', promptEl?.textContent || '');

  const res = await fetch('/assess_prompt', { method: 'POST', body: fd });
  let json;
  try { json = await res.json(); } catch { throw new Error(`Non-JSON response (${res.status})`); }
  if (!res.ok || json?.status === 'error') {
    throw new Error(json?.message || `Request failed (${res.status})`);
  }
  localStorage.setItem('lastResult', JSON.stringify(json));
  window.location.href = '/report';
}

// --------------- Boot ---------------
document.addEventListener('DOMContentLoaded', () => {
  // Grab elements
  testSel   = document.getElementById('testType');
  groupSel  = document.getElementById('groupId');
  qSel      = document.getElementById('questionId');
  promptEl  = document.getElementById('promptText');
  randBtn   = document.getElementById('randQ');
  statusEl  = document.getElementById('status');
  langSel   = document.getElementById('lang');
  recBtn    = document.getElementById('recordBtn');
  stopBtn   = document.getElementById('stopBtn');
  playback  = document.getElementById('playback');

  if (!testSel || !groupSel || !qSel || !promptEl || !recBtn || !stopBtn) {
    console.error('Missing required DOM elements. Check IDs.');
    return;
  }

  // Populate selects
  fillTests();
  // Restore last selection if available
  const lastTest  = localStorage.getItem('lastTestSel');
  if (lastTest && TEST_BANK[lastTest]) testSel.value = lastTest;
  fillGroups();
  const lastGroup = localStorage.getItem('lastGroupSel');
  if (lastGroup && (TEST_BANK[testSel.value] || {})[lastGroup]) groupSel.value = lastGroup;
  fillQuestions();
  const lastQ     = localStorage.getItem('lastQSel');
  if (lastQ) qSel.value = lastQ;
  setPromptFromSelection();

  // Wire events
  testSel.addEventListener('change', () => { fillGroups(); fillQuestions(); setPromptFromSelection(); });
  groupSel.addEventListener('change', () => { fillQuestions(); setPromptFromSelection(); });
  qSel.addEventListener('change', setPromptFromSelection);
  if (randBtn) randBtn.addEventListener('click', randomizeQuestion);
  recBtn.addEventListener('click', startRecording);
  stopBtn.addEventListener('click', stopRecording);

  console.log('recorder.js wired:', typeof startRecording, typeof stopRecording);
});
