import os
from flask import Flask, render_template, request, jsonify, send_from_directory
from werkzeug.utils import secure_filename
import time, uuid, json

# Optional OpenAI imports — only used if OPENAI_API_KEY present
OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
try:
    if OPENAI_API_KEY:
        from openai import OpenAI
        openai_client = OpenAI(api_key=OPENAI_API_KEY)
    else:
        openai_client = None
except Exception:
    openai_client = None

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
UPLOAD_DIR = os.path.join(BASE_DIR, "uploads")
COURSE_A_PATH = os.path.join(BASE_DIR, "course_a.json")

os.makedirs(UPLOAD_DIR, exist_ok=True)

app = Flask(__name__)

def load_course_a():
    try:
        with open(COURSE_A_PATH, "r", encoding="utf-8") as f:
            return json.load(f)
    except Exception:
        return {"title":"Course A","phrases":[],"rubric":[]}

@app.route("/")
def index():
    course_a = load_course_a()
    return render_template("index.html", course_a=course_a, has_openai=bool(openai_client))

@app.route("/static/<path:path>")
def send_static(path):
    return send_from_directory(os.path.join(BASE_DIR, "static"), path)

@app.route("/upload", methods=["POST"])
def upload():
    """
    Accepts audio Blob under 'audio' field. Returns file_id and (optional) transcript using Whisper.
    Client also sends 'duration' (seconds) captured during recording.
    """
    if "audio" not in request.files:
        return jsonify({"ok": False, "error": "No audio file"}), 400

    file = request.files["audio"]
    filename = secure_filename(file.filename) or f"recording-{uuid.uuid4().hex}.webm"
    save_path = os.path.join(UPLOAD_DIR, filename)
    file.save(save_path)

    duration = float(request.form.get("duration", "0"))
    result = {"ok": True, "file_id": filename, "duration": duration}

    # If OpenAI is configured, try Whisper transcription
    if openai_client:
        try:
            with open(save_path, "rb") as af:
                transcription = openai_client.audio.transcriptions.create(
                    model="whisper-1",
                    file=af,
                    response_format="text"
                )
            result["transcript"] = transcription
        except Exception as e:
            result["transcript_error"] = str(e)

    return jsonify(result), 200

@app.route("/ai-feedback", methods=["POST"])
def ai_feedback():
    """
    Provide AI feedback using GPT, referencing the rubric, transcript, and WPM stats.
    """
    if not openai_client:
        return jsonify({"ok": False, "error": "OPENAI_API_KEY not set"}), 400

    data = request.get_json(force=True)
    transcript = data.get("transcript", "").strip()
    rubric = data.get("rubric", [])
    wpm = data.get("wpm", 0)
    target_phrases = data.get("phrases", [])

    prompt = (
        "You are an ESL speaking evaluator. Score and comment concisely using the rubric. "
        "Return JSON with fields: overall_comments, strengths[], areas_to_improve[], "
        "scores (dict of category->1-5), and phrase_hits (phrases the student used). "
        f"\nRubric: {json.dumps(rubric, ensure_ascii=False)}"
        f"\nTarget phrases: {json.dumps(target_phrases, ensure_ascii=False)}"
        f"\nWPM: {wpm}"
        f"\nTranscript: {transcript}\n"
    )

    try:
        completion = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{"role": "user", "content": prompt}],
            temperature=0.3,
        )
        content = completion.choices[0].message.content
        try:
            parsed = json.loads(content)
        except Exception:
            parsed = {"overall_comments": content, "raw": content}
        return jsonify({"ok": True, "feedback": parsed})
    except Exception as e:
        return jsonify({"ok": False, "error": str(e)}), 500

@app.route("/uploads/<path:fname>")
def get_upload(fname):
    return send_from_directory(UPLOAD_DIR, fname)

@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Accept text transcript + duration, compute WPM, basic stats.
    """
    text = request.form.get("transcript", "").strip()
    duration = float(request.form.get("duration", "0"))  # seconds

    words = [w for w in text.replace("\n"," ").split(" ") if w.strip()]
    word_count = len(words)
    minutes = duration / 60.0 if duration > 0 else 0.000001
    wpm = word_count / minutes

    filler_words = ["um","uh","like","you know","er","ah"]
    filler_count = sum(text.lower().count(fw) for fw in filler_words)

    return jsonify({
        "ok": True,
        "word_count": word_count,
        "duration_sec": duration,
        "wpm": round(wpm, 1),
        "filler_count": filler_count
    })
