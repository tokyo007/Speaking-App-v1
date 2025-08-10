# MVP Speaking App — Course A Merge (Phrases & Rubric)

This package merges the MVP recorder/report app with a **Course A** page that includes **target phrases** and a **scoring rubric**. 
It adds **Words Per Minute (WPM)** and optional **AI-generated feedback** via the OpenAI API.

## Features
- Browser-based audio recording (Web Audio API + MediaRecorder)
- Upload endpoint saves WEBM/MP3/WAV (depends on browser) to `uploads/`
- Optional **automatic transcription** using OpenAI Whisper (if `OPENAI_API_KEY` is set)
- Calculates **WPM** = total words / minutes (based on audio duration captured client-side)
- Clean **report** page with stats, errors, and rubric-based scoring
- **Course A** section with phrases + rubric (editable in `course_a.json`)
- Optional **AI feedback** (GPT) referencing rubric and transcript

## Quick Start
```bash
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
export FLASK_APP=app.py
export FLASK_ENV=development
# Optional: set OpenAI key to enable Whisper + AI feedback
export OPENAI_API_KEY=sk-...

flask run  # http://127.0.0.1:5000
```

## Files
- `app.py` — Flask backend
- `templates/index.html` — UI with recording, Course A phrases, rubric, report
- `static/recorder.js` — recording + upload + report logic
- `static/styles.css` — minimal styling
- `course_a.json` — phrases & rubric you can edit (or localize)
- `requirements.txt` — Python deps
- `sample.env` — env variable examples

## Notes
- If you **don't** set `OPENAI_API_KEY`, you'll still get a manual transcript box and computed WPM. 
- If you **do** set it, uploads will be sent to Whisper for transcription and you can request GPT feedback.
- To deploy on Render/Fly/Heroku, set `OPENAI_API_KEY` in environment, and ensure persistent storage for `uploads/` if needed.
