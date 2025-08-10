let mediaRecorder, chunks = [], startTime = 0, stopTime = 0, timerInterval = null, lastDurationSec = 0;

const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const timer = document.getElementById('timer');
const player = document.getElementById('player');
const uploadStatus = document.getElementById('uploadStatus');
const transcriptEl = document.getElementById('transcript');
const reportEl = document.getElementById('report');
const fileIdEl = document.getElementById('fileId');
const btnAnalyze = document.getElementById('btnAnalyze');
const btnAI = document.getElementById('btnAI');
const aiOut = document.getElementById('aiOut');

(function renderCourse() {
  const phrasesUl = document.getElementById('phrases');
  const rubricDiv = document.getElementById('rubric');
  const data = window.COURSE_A || { phrases: [], rubric: [] };

  if (phrasesUl) {
    phrasesUl.innerHTML = '';
    data.phrases.forEach(p => {
      const li = document.createElement('li');
      li.textContent = p;
      phrasesUl.appendChild(li);
    });
  }

  if (rubricDiv) {
    rubricDiv.innerHTML = '';
    data.rubric.forEach(r => {
      const d = document.createElement('div');
      d.className = 'rubric-item';
      const h = document.createElement('h4'); h.textContent = r.category;
      const p = document.createElement('p'); p.textContent = r.description;
      d.appendChild(h); d.appendChild(p);
      rubricDiv.appendChild(d);
    });
  }
})();

btnStart?.addEventListener('click', async () => {
  try {
    chunks = [];
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(stream);
    mediaRecorder.ondataavailable = e => chunks.push(e.data);
    mediaRecorder.onstop = onStopRecording;
    mediaRecorder.start();
    startTimer();
    btnStart.disabled = true;
    btnStop.disabled = false;
    uploadStatus.textContent = '';
    aiOut && (aiOut.textContent = '');
    reportEl.textContent = '';
  } catch (err) {
    console.error(err);
    alert('Microphone access failed.');
  }
});

btnStop?.addEventListener('click', () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  stopTimer();
  btnStart.disabled = false;
  btnStop.disabled = true;
});

function startTimer() {
  startTime = Date.now();
  stopTime = 0;
  timerInterval = setInterval(() => {
    const s = Math.floor((Date.now() - startTime) / 1000);
    const mm = String(Math.floor(s / 60)).padStart(2, '0');
    const ss = String(s % 60).padStart(2, '0');
    timer.textContent = `${mm}:${ss}`;
  }, 200);
}

function stopTimer() {
  clearInterval(timerInterval);
  stopTime = Date.now();
  lastDurationSec = Math.max(1, Math.floor((stopTime - startTime) / 1000));
}

async function onStopRecording() {
  try {
    const blob = new Blob(chunks, { type: 'audio/webm' });
    player.src = URL.createObjectURL(blob);
    uploadStatus.textContent = 'Uploading...';

    const form = new FormData();
    form.append('audio', blob, `recording-${Date.now()}.webm`);
    form.append('duration', String(lastDurationSec || parseTimerToSeconds()));

    const resp = await fetch('/upload', { method: 'POST', body: form });
    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      uploadStatus.textContent = 'Upload failed: ' + (data.error || resp.statusText || 'Unknown error');
      return;
    }

    uploadStatus.textContent = `Uploaded: ${data.file_id} (${data.duration_sec || lastDurationSec}s)`;
    fileIdEl.value = data.file_id;

    if (data.transcript) {
      transcriptEl.value = data.transcript;
    } else if (data.transcript_error) {
      console.warn('Transcription error:', data.transcript_error);
    }
  } catch (err) {
    console.error(err);
    uploadStatus.textContent = 'Upload failed.';
  }
}

btnAnalyze?.addEventListener('click', async () => {
  try {
    const durationSec = getDurationSec();
    const form = new FormData();
    form.append('transcript', transcriptEl.value || '');
    form.append('duration', String(durationSec));

    const resp = await fetch('/analyze', { method: 'POST', body: form });
    const data = await resp.json();

    if (!resp.ok || !data.ok) {
      reportEl.textContent = 'Analyze failed: ' + (data.error || resp.statusText || 'Unknown');
      return;
    }

    const lines = [
      `Words: ${data.word_count}`,
      `Duration: ${data.duration_sec}s`,
      `WPM: ${data.wpm}`,
      `Filler words: ${data.filler_count}`
    ];
    reportEl.textContent = lines.join('\n');
  } catch (err) {
    console.error(err);
    reportEl.textContent = 'Analyze failed.';
  }
});

btnAI?.addEventListener('click', async () => {
  try {
    const transcript = (transcriptEl.value || '').trim();
    const durationSec = getDurationSec();
    if (!transcript) {
      aiOut.textContent = 'Please generate or paste a transcript first.';
      return;
    }
    if (!durationSec || durationSec <= 0) {
      aiOut.textContent = 'Recording duration is missing or invalid.';
      return;
    }

    aiOut.textContent = 'Getting AI feedback...';

    const payload = {
      transcript,
      durationSec,
      phrases: (window.COURSE_A && window.COURSE_A.phrases) || [],
      rubric: (window.COURSE_A && window.COURSE_A.rubric) || []
    };

    const resp = await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const data = await resp.json();
    if (!resp.ok) {
      aiOut.textContent = 'AI error: ' + (data.error || resp.statusText || 'Unknown');
      return;
    }

    const stats = [
      `Model: ${data.model}`,
      `Words: ${data.word_count}`,
      `Duration: ${data.duration_sec}s`,
      `WPM: ${data.wpm}`,
      `Fillers: ${formatFillers(data.fillers)}`
    ].join('\n');

    aiOut.textContent = `${stats}\n\n=== Feedback ===\n${data.feedback}`;
  } catch (err) {
    console.error(err);
    aiOut.textContent = 'AI error: ' + err.message;
  }
});

function parseTimerToSeconds() {
  const parts = (timer.textContent || '').split(':').map(Number);
  if (parts.length === 2 && !Number.isNaN(parts[0]) && !Number.isNaN(parts[1])) {
    return (parts[0] * 60 + parts[1]) || 0;
  }
  return 0;
}

function getDurationSec() {
  return lastDurationSec || parseTimerToSeconds() || 0;
}

function formatFillers(obj) {
  if (!obj || typeof obj !== 'object') return 'n/a';
  const entries = Object.entries(obj).filter(([, v]) => v > 0);
  if (!entries.length) return 'none';
  return entries.map(([k, v]) => `${k}:${v}`).join(', ');
}
