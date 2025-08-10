let mediaRecorder, chunks=[], startTime=0, timerInterval=null;
const btnStart = document.getElementById('btnStart');
const btnStop = document.getElementById('btnStop');
const timer = document.getElementById('timer');
const player = document.getElementById('player');
const uploadStatus = document.getElementById('uploadStatus');
const transcriptEl = document.getElementById('transcript');
const reportEl = document.getElementById('report');
const fileIdEl = document.getElementById('fileId');
const btnAnalyze = document.getElementById('btnAnalyze');
const aiBlock = document.getElementById('aiBlock');
const btnAI = document.getElementById('btnAI');

(function renderCourse(){
  const phrasesUl = document.getElementById('phrases');
  const rubricDiv = document.getElementById('rubric');
  const data = window.COURSE_A || {phrases:[], rubric:[]};
  data.phrases.forEach(p => {
    const li = document.createElement('li');
    li.textContent = p;
    phrasesUl.appendChild(li);
  });
  data.rubric.forEach(r => {
    const d = document.createElement('div');
    d.className = 'rubric-item';
    const h = document.createElement('h4'); h.textContent = r.category;
    const p = document.createElement('p'); p.textContent = r.description;
    d.appendChild(h); d.appendChild(p);
    rubricDiv.appendChild(d);
  });
})();

btnStart.onclick = async () => {
  chunks = [];
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  mediaRecorder = new MediaRecorder(stream);
  mediaRecorder.ondataavailable = e => chunks.push(e.data);
  mediaRecorder.onstop = onStopRecording;
  mediaRecorder.start();
  startTimer();
  btnStart.disabled = true;
  btnStop.disabled = false;
};

btnStop.onclick = () => {
  if (mediaRecorder && mediaRecorder.state !== 'inactive') {
    mediaRecorder.stop();
  }
  stopTimer();
  btnStart.disabled = false;
  btnStop.disabled = true;
};

function startTimer(){
  startTime = Date.now();
  timerInterval = setInterval(()=>{
    const s = Math.floor((Date.now()-startTime)/1000);
    const mm = String(Math.floor(s/60)).padStart(2,'0');
    const ss = String(s%60).padStart(2,'0');
    timer.textContent = `${mm}:${ss}`;
  }, 200);
}
function stopTimer(){
  clearInterval(timerInterval);
}

async function onStopRecording(){
  const blob = new Blob(chunks, { type: 'audio/webm' });
  player.src = URL.createObjectURL(blob);
  uploadStatus.textContent = 'Uploading...';
  const form = new FormData();
  form.append('audio', blob, `recording-${Date.now()}.webm`);
  const durationSec = Math.floor((Date.now()-startTime)/1000);
  form.append('duration', String(durationSec));

  const resp = await fetch('/upload', { method:'POST', body: form });
  const data = await resp.json();
  if(!data.ok){
    uploadStatus.textContent = 'Upload failed: '+(data.error||'Unknown error');
    return;
  }
  uploadStatus.textContent = `Uploaded: ${data.file_id} (${durationSec}s)`;
  fileIdEl.value = data.file_id;
  if (data.transcript){
    transcriptEl.value = data.transcript;
  } else if (data.transcript_error){
    console.warn('Transcription error:', data.transcript_error);
  }
}

btnAnalyze.onclick = async () => {
  const durationSec = parseTimerToSeconds();
  const form = new FormData();
  form.append('transcript', transcriptEl.value || '');
  form.append('duration', String(durationSec));
  const resp = await fetch('/analyze', { method:'POST', body: form });
  const data = await resp.json();
  if(!data.ok){
    reportEl.textContent = 'Analyze failed';
    return;
  }
  const lines = [
    `Words: ${data.word_count}`,
    `Duration: ${data.duration_sec}s`,
    `WPM: ${data.wpm}`,
    `Filler words: ${data.filler_count}`
  ];
  reportEl.textContent = lines.join('\n');
};

function parseTimerToSeconds(){
  const [mm, ss] = timer.textContent.split(':').map(Number);
  return (mm*60+ss)||0;
}

if (aiBlock && aiBlock.dataset.hasOpenai==='true'){
  if (btnAI){
    btnAI.onclick = async () => {
      const durationSec = parseTimerToSeconds();
      const minutes = Math.max(durationSec/60, 0.000001);
      const words = (transcriptEl.value||'').split(/\s+/).filter(Boolean).length;
      const wpm = words/minutes;

      const payload = {
        transcript: transcriptEl.value||'',
        rubric: (window.COURSE_A && window.COURSE_A.rubric) || [],
        phrases: (window.COURSE_A && window.COURSE_A.phrases) || [],
        wpm: Number(wpm.toFixed(1))
      };
      const resp = await fetch('/ai-feedback', {
        method:'POST',
        headers:{'Content-Type':'application/json'},
        body: JSON.stringify(payload)
      });
      const data = await resp.json();
      const out = document.getElementById('aiOut');
      if(!data.ok){
        out.textContent = 'AI error: ' + (data.error || 'Unknown');
        return;
      }
      out.textContent = JSON.stringify(data.feedback, null, 2);
    };
  }
}
