import os, re, math
from flask import Flask, request, jsonify
from openai import OpenAI
from werkzeug.middleware.proxy_fix import ProxyFix

app = Flask(__name__)
app.wsgi_app = ProxyFix(app.wsgi_app)

OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")  # fast & cost-effective
client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))

FILLERS = {"um","uh","er","ah","like","you know","sort of","kind of"}

def words_per_minute(text: str, duration_sec: float):
    words = re.findall(r"\b[\w’'-]+\b", text, flags=re.UNICODE)
    wpm = 0.0 if duration_sec <= 0 else (len(words) / (duration_sec / 60.0))
    return round(wpm, 1), len(words)

def count_fillers(text: str):
    t = text.lower()
    return {f: len(re.findall(rf"\b{re.escape(f)}\b", t)) for f in FILLERS}

SYSTEM_PROMPT = (
    "You are an ESL speaking coach for intermediate learners. "
    "Given a speech transcript, provide concise, actionable feedback with:\n"
    "1) Fluency (pace, pauses), 2) Pronunciation highlights, "
    "3) Grammar/Vocabulary fixes with better alternatives, "
    "4) 2-3 targeted practice tips.\n"
    "Keep it supportive and specific. 150-220 words."
)

@app.post("/api/feedback")
def feedback():
    data = request.get_json(force=True)
    transcript = (data or {}).get("transcript", "").strip()
    duration_sec = float((data or {}).get("durationSec", 0))

    if not transcript:
        return jsonify(error="Missing 'transcript'"), 400
    if duration_sec <= 0:
        return jsonify(error="Missing or invalid 'durationSec' (seconds)"), 400

    wpm, word_count = words_per_minute(transcript, duration_sec)
    fillers = count_fillers(transcript)

    # Build the model input (Responses API)
    resp = client.responses.create(
        model=OPENAI_MODEL,
        instructions=SYSTEM_PROMPT,
        input=[
            {
                "role": "user",
                "content": [
                    {"type": "input_text",
                     "text": f"Transcript:\n{transcript}\n\n"
                             f"Stats:\n- Duration: {duration_sec:.1f}s\n- Words: {word_count}\n- WPM: {wpm}\n"
                             f"- Fillers: {fillers}\n"}
                ],
            }
        ],
    )

    feedback_text = resp.output_text  # convenient helper on SDK
    return jsonify(
        wpm=wpm,
        word_count=word_count,
        duration_sec=duration_sec,
        fillers=fillers,
        model=OPENAI_MODEL,
        feedback=feedback_text,
    )
