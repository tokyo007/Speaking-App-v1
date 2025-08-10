# MVP Speaking App (Azure Pronunciation + Report) — MakoStars Brand

## Deploy on Render
- Build Command: `pip install -r requirements.txt`
- Start Command: `gunicorn app:app`
- Environment:
  - `SPEECH_KEY` (Azure key)
  - `SPEECH_REGION` (e.g., `japaneast`)
- `apt.txt` installs ffmpeg for WebM→WAV conversion

## Use
- Course A: fixed phrase scoring
- Course B: prompt → STT → assess using transcript
- Auto-redirects to `/report` after scoring; last result is stored in `localStorage`.
