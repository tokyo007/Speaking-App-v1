import os, re, uuid, json
from pathlib import Path
from flask import Flask, request, jsonify, render_template
from openai import OpenAI
from werkzeug.middleware.proxy_fix import ProxyFix

BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
UPLOAD_DIR.mkdir(exist_ok=True)

app = Flask(__name__, template_folder="templates", static_folder="static")
app.wsgi_app = ProxyFix(app.wsgi_app)

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")
TRANSCRIBE = os.getenv("TRANSCRIBE", "false").lower() in ("1","true","yes","y")

client = OpenAI(api_key=OPENAI_API_KEY) if OPENAI_API_KEY else None

FILLERS = {"um","uh","er","ah","like","you know","sort of","kind of"}

def words_per_minute(text: str, duration_sec: float):
    words = re.findall(r"\b[\w’'-]+\b", text, flags=re.UNICODE)
    wpm = 0.0 if duration_sec <= 0 else (len(words) / (duration_sec / 60.0))
    return round(wpm, 1), len(words)

def count_fillers(text: str):
    t = text.lower()
    return {f: len(re.findall(rf"\b{re.escape(f)}\b", t)) for f in FILLERS}

def normalize_rubric(rubric_raw):
    out = []
    if isinstance(rubric_raw, list):
        for item in rubric_raw:
            if isinstance(item, dict):
                cat = (item.get("category") or "").strip() or "Uncategorized"
                desc = (item.get("description") or "").strip()
                out.append({"category": cat, "description": desc})
            else:
                out.append({"category": str(item), "description": ""})
    return out

def normalize_phrases(phrases_raw):
    if isinstance(phrases_raw, list):
        return [str(p).strip() for p in phrases_raw if str(p).strip()]
    return []

def build_course_context(phrases, rubric):
    parts = []
    if phrases:
        parts.append("Target Phrases (Course A):\n- " + "\n- ".join(phrases[:100]))
    if rubric:
        r_lines = [f"- {r['category']}: {r['description']}".strip() for r in rubric[:50]]
        parts.append("Rubric Categories:\n" + "\n".join(r_lines))
    return "\n\n".join(parts).strip()

SYSTEM_PROMPT = (
    "You are an ESL speaking coach for intermediate learners.\n"
    "You receive a transcript, speaking stats, and Course A context (target phrases + rubric).\n\n"
    "Your job: produce concise, actionable feedback that explicitly references the Course A rubric "
    "and checks for correct usage of the target phrases.\n\n"
    "Structure your response in Markdown with these sections:\n"
    "1) Summary (2–3 lines)\n"
    "2) Rubric Scores: For each rubric category, give a score 1–5 and 1–2 sentences why. "
    "If a category is not applicable, write 'N/A'.\n"
    "3) Phrase Usage: List which target phrases were used correctly, used but awkwardly (with a better revision), "
    "and not used (suggest 1–2 natural spots to insert).\n"
    "4) Language Fixes: Bullet list of concrete grammar/pronunciation/word-choice corrections with short examples.\n"
    "5) Practice Next: 2–3 targeted drills tied to the lowest rubric areas and missing phrases.\n\n"
    "Tone: supportive, specific, and compact (180–240 words)."
)

# ---------- Routes ----------

@app.get("/")
def index():
    # Load Course A data for template
    course_path = BASE_DIR / "course_a.json"
    if course_path.exists():
        with open(course_path, "r", encoding="utf-8") as f:
            course_a = json.load(f)
    else:
        course_a = {"phrases": [], "rubric": []}
    return render_template("index.html", course_a=course_a)

@app.get("/report")
def report_page():
    return render_template("report.html")

@app.post("/upload")
def upload():
    # Accept audio upload; optionally transcribe with OpenAI
    if "audio" not in request.files:
        return jsonify(ok=False, error="Missing 'audio' file"), 400

    f = request.files["audio"]
    duration = float(request.form.get("duration", "0") or "0")
    if not f.filename:
        return jsonify(ok=False, error="Empty filename"), 400

    ext = (Path(f.filename).suffix or ".webm").lower()
    if ext not in (".webm",".wav",".mp3",".m4a",".ogg"):
        return jsonify(ok=False, error="Unsupported file type"), 400

    file_id = f"{uuid.uuid4().hex}{ext}"
    save_path = UPLOAD_DIR / file_id
    f.save(save_path)

    out = {"ok": True, "file_id": file_id, "duration_sec": int(duration)}

    # Optional server-side transcription
    if TRANSCRIBE and client:
        try:
            with open(save_path, "rb") as audio:
                tr = client.audio.transcriptions.create(
                    model="gpt-4o-transcribe",
                    file=audio
                )
            out["transcript"] = tr.text
        except Exception as e:
            out["transcript_error"] = str(e)

    return jsonify(out), 200

@app.post("/analyze")
def analyze():
    # Compute basic stats from provided transcript & duration
    transcript = (request.form.get("transcript") or "").strip()
    duration = float(request.form.get("duration", "0") or "0")
    if not transcript:
        return jsonify(ok=False, error="Missing 'transcript'"), 400
    if duration <= 0:
        return jsonify(ok=False, error="Missing or invalid 'duration'"), 400

    wpm, word_count = words_per_minute(transcript, duration)
    filler_count = sum(count_fillers(transcript).values())

    return jsonify(ok=True, word_count=word_count, duration_sec=int(duration), wpm=wpm, filler_count=filler_count), 200

@app.post("/api/feedback")
def api_feedback():
    data = request.get_json(force=True) or {}
    transcript = (data.get("transcript") or "").strip()
    duration_sec = float(data.get("durationSec") or 0)

    if not transcript:
        return jsonify(error="Missing 'transcript'"), 400
    if duration_sec <= 0:
        return jsonify(error="Missing or invalid 'durationSec' (seconds)"), 400

    phrases = normalize_phrases(data.get("phrases"))
    rubric = normalize_rubric(data.get("rubric"))
    course_context = build_course_context(phrases, rubric)

    wpm, word_count = words_per_minute(transcript, duration_sec)
    fillers = count_fillers(transcript)

    user_text = [
        f"Transcript:\n{transcript}",
        "Stats:",
        f"- Duration: {duration_sec:.1f}s",
        f"- Words: {word_count}",
        f"- WPM: {wpm}",
        f"- Fillers: {fillers}",
    ]
    if course_context:
        user_text.append("\nCourse A Context:\n" + course_context)

    try:
        if not client:
            return jsonify(error="OPENAI_API_KEY not configured on server"), 500

        resp = client.responses.create(
            model=OPENAI_MODEL,
            instructions=SYSTEM_PROMPT,
            input=[{"role": "user", "content": [{"type": "input_text", "text": "\n".join(user_text)}]}],
        )
        feedback_text = resp.output_text
    except Exception as e:
        return jsonify(error=str(e)), 500

    return jsonify(
        wpm=wpm,
        word_count=word_count,
        duration_sec=duration_sec,
        fillers=fillers,
        model=OPENAI_MODEL,
        feedback=feedback_text,
    ), 200

@app.get("/healthz")
def healthz():
    return "ok", 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT","8080")), debug=False)
