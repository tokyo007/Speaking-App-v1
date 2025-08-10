import os, json, tempfile, shlex, subprocess
from dotenv import load_dotenv
from flask import Flask, render_template, request, jsonify
from werkzeug.utils import secure_filename
import azure.cognitiveservices.speech as speechsdk

load_dotenv()

SPEECH_KEY    = os.getenv("SPEECH_KEY")
SPEECH_REGION = os.getenv("SPEECH_REGION", "japaneast")

app = Flask(__name__)
app.config["MAX_CONTENT_LENGTH"] = 30 * 1024 * 1024  # 30 MB uploads

# ---------------- Utilities ----------------
def run_cmd(cmd: str):
    p = subprocess.run(shlex.split(cmd), stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    return p.returncode, p.stdout.decode(errors="ignore"), p.stderr.decode(errors="ignore")

def to_wav_16k_mono(src_path: str, dst_path: str):
    cmd = f'ffmpeg -y -i "{src_path}" -ac 1 -ar 16000 -c:a pcm_s16le -f wav "{dst_path}"'
    code, out, err = run_cmd(cmd)
    if code != 0:
        raise RuntimeError(f"ffmpeg failed (code {code}): {err[:4000]}")
    if not os.path.exists(dst_path):
        raise RuntimeError("ffmpeg did not create output file")
    size = os.path.getsize(dst_path)
    if size < 1000:
        raise RuntimeError(f"wav too small: {size} bytes; ffmpeg: {err[:4000]}")
    with open(dst_path, "rb") as f:
        header = f.read(12)
    if not (len(header) >= 12 and header[0:4] == b"RIFF" and header[8:12] == b"WAVE"):
        raise RuntimeError("Invalid WAV header (not RIFF/WAVE)")
    return dst_path

def ensure_azure():
    if not SPEECH_KEY or not SPEECH_REGION:
        raise RuntimeError("Azure SPEECH_KEY/REGION not set")

def stt_once(wav_path: str, language: str = "en-US"):
    ensure_azure()
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_recognition_language = language
    audio_cfg = speechsdk.audio.AudioConfig(filename=wav_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_cfg)
    result = recognizer.recognize_once()
    if result.reason != speechsdk.ResultReason.RecognizedSpeech:
        return {"status": "error", "message": f"STT failed: {result.reason}"}
    return {"status": "ok", "text": result.text}

def run_pronunciation_assessment(wav_path: str, reference_text: str, language: str = "en-US"):
    ensure_azure()
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_recognition_language = language
    audio_cfg = speechsdk.audio.AudioConfig(filename=wav_path)
    pa_cfg = speechsdk.PronunciationAssessmentConfig(
        reference_text=reference_text,
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=True
    )
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_cfg)
    pa_cfg.apply_to(recognizer)
    result = recognizer.recognize_once()
    if result.reason != speechsdk.ResultReason.RecognizedSpeech:
        return {"status": "error", "message": f"Recognition failed: {result.reason}"}
    pa = speechsdk.PronunciationAssessmentResult(result)
    detail = {}
    try:
        jr = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult)
        if jr:
            detail = json.loads(jr)
    except Exception:
        detail = {}
    return {
        "status": "ok",
        "referenceText": reference_text,
        "recognizedText": result.text,
        "scores": {
            "pronunciation": pa.pronunciation_score,
            "accuracy":      pa.accuracy_score,
            "fluency":       pa.fluency_score,
            "completeness":  pa.completeness_score,
        },
        "detail": detail
    }

# ---------------- Routes ----------------
@app.get("/")
def index():
    return render_template("index.html")

@app.get("/report")
def report():
    return render_template("report.html")

@app.get("/health")
def health():
    return jsonify({"ok": True, "commit": os.getenv("RENDER_GIT_COMMIT", "")}), 200

@app.post("/assess_phrase")
def assess_phrase():
    try:
        phrase   = (request.form.get("phrase") or "").strip()
        language = (request.form.get("language") or "en-US").strip()
        f = request.files.get("audio")
        if not phrase:
            return jsonify({"status": "error", "message": "Missing 'phrase'"}), 400
        if not f:
            return jsonify({"status": "error", "message": "Missing 'audio' file"}), 400
        with tempfile.TemporaryDirectory() as td:
            src_path = os.path.join(td, secure_filename(f.filename or "audio.webm"))
            f.save(src_path)
            wav_path = os.path.join(td, "audio.wav")
            try:
                to_wav_16k_mono(src_path, wav_path)
            except Exception as e:
                return jsonify({"status": "error", "message": "Audio conversion failed", "raw": str(e)}), 400
            result = run_pronunciation_assessment(wav_path, phrase, language=language)
            return jsonify(result), (200 if result.get("status") == "ok" else 400)
    except Exception as e:
        return jsonify({"status": "error", "message": "Server error", "raw": str(e)}), 500

@app.post("/assess_prompt")
def assess_prompt():
    try:
        language = (request.form.get("language") or "en-US").strip()
        meta = {
            "testType":   request.form.get("testType")   or "",
            "groupId":    request.form.get("groupId")    or "",
            "questionId": request.form.get("questionId") or "",
            "promptText": request.form.get("promptText") or "",
        }
        f = request.files.get("audio")
        if not f:
            return jsonify({"status": "error", "message": "Missing 'audio' file"}), 400
        with tempfile.TemporaryDirectory() as td:
            src_path = os.path.join(td, secure_filename(f.filename or "audio.webm"))
            f.save(src_path)
            wav_path = os.path.join(td, "audio.wav")
            try:
                to_wav_16k_mono(src_path, wav_path)
            except Exception as e:
                return jsonify({"status": "error", "message": "Audio conversion failed", "raw": str(e)}), 400
            stt = stt_once(wav_path, language=language)
            if stt.get("status") != "ok":
                return jsonify(stt), 400
            transcript = stt["text"] or "(no speech detected)"
            pa = run_pronunciation_assessment(wav_path, transcript, language=language)
            if pa.get("status") != "ok":
                return jsonify(pa), 400
            pa["transcriptUsedAsReference"] = transcript
            pa["meta"] = meta
            return jsonify(pa), 200
    except Exception as e:
        return jsonify({"status": "error", "message": "Server error", "raw": str(e)}), 500

# ---------------- Entrypoint ----------------
if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT","5000")), debug=False)
