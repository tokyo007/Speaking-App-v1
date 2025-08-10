
import os, json, tempfile, uuid, re, math, datetime
from pathlib import Path
from dotenv import load_dotenv
from flask import Flask, request, jsonify, render_template, send_file, url_for
from flask_cors import CORS
import ffmpeg
import azure.cognitiveservices.speech as speechsdk
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import getSampleStyleSheet
from reportlab.lib import colors
from reportlab.platypus import SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle

load_dotenv()

SPEECH_KEY = os.getenv("SPEECH_KEY")
SPEECH_REGION = os.getenv("SPEECH_REGION", "japaneast")

BASE_DIR = Path(__file__).resolve().parent
RESULT_DIR = BASE_DIR / "results"
RESULT_DIR.mkdir(exist_ok=True)

app = Flask(__name__)
CORS(app)

ALLOWED_EXT = {".webm",".wav",".mp3",".ogg",".m4a"}
FILLERS = {"um","uh","er","ah","like","you know","sort of","kind of"}

def to_wav_16k_mono(input_path, output_path):
    (
        ffmpeg
        .input(input_path)
        .output(output_path, acodec='pcm_s16le', ac=1, ar='16000', loglevel="error")
        .overwrite_output()
        .run()
    )

def probe_duration_seconds(path):
    try:
        info = ffmpeg.probe(path)
        for s in info.get('streams', []):
            if s.get('codec_type') == 'audio' and s.get('duration'):
                return float(s['duration'])
        if info.get('format', {}).get('duration'):
            return float(info['format']['duration'])
    except Exception:
        pass
    return 0.0

def speech_to_text(wav_path, language="en-US"):
    if not (SPEECH_KEY and SPEECH_REGION):
        return {"status":"error","message":"Azure speech not configured"}
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_recognition_language = language
    audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)
    result = recognizer.recognize_once()
    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        return {"status":"ok","text":result.text}
    elif result.reason == speechsdk.ResultReason.NoMatch:
        return {"status":"ok","text":""}
    else:
        return {"status":"error","message":str(result.reason)}

def run_pronunciation_assessment(wav_path, reference_text, language="en-US"):
    if not (SPEECH_KEY and SPEECH_REGION):
        return {"status":"error","message":"Azure speech not configured"}
    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    speech_config.speech_recognition_language = language
    audio_config = speechsdk.audio.AudioConfig(filename=wav_path)
    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_config)

    pa_config = speechsdk.PronunciationAssessmentConfig(
        reference_text=reference_text,
        grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
        granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
        enable_miscue=True
    )
    pa_config.apply_to(recognizer)
    result = recognizer.recognize_once()

    out = {"status":"ok","language":language,"referenceText":reference_text}
    if result.reason != speechsdk.ResultReason.RecognizedSpeech:
        out["status"] = "error"
        out["message"] = str(result.reason)
        return out

    detail = result.properties.get(speechsdk.PropertyId.SpeechServiceResponse_JsonResult, "{}")
    try:
        detail_json = json.loads(detail)
    except Exception:
        detail_json = {}
    out["detail"] = detail_json

    pron = speechsdk.PronunciationAssessmentResult(result)
    out["scores"] = {
        "accuracy": pron.accuracy_score,
        "fluency": pron.fluency_score,
        "completeness": pron.completeness_score,
        "pronunciation": pron.pronunciation_score
    }
    out["recognizedText"] = result.text
    return out

def format_mmss(seconds):
    s = int(round(seconds))
    mm = s // 60
    ss = s % 60
    return f"{mm:02d}:{ss:02d}"

def count_fillers(text):
    t = (text or "").lower()
    counts = {w: len(re.findall(rf"\\b{re.escape(w)}\\b", t)) for w in FILLERS}
    total = sum(counts.values())
    return counts, total

def metrics_from_transcript(transcript, duration_sec):
    words = re.findall(r"\\b[\\w’'-]+\\b", transcript or "", flags=re.UNICODE)
    word_count = len(words)
    wpm = 0.0 if duration_sec <= 0 else word_count / (duration_sec / 60.0)
    fillers, filler_total = count_fillers(transcript or "")
    return {
        "duration_sec": round(float(duration_sec), 2),
        "duration_mmss": format_mmss(duration_sec),
        "word_count": word_count,
        "wpm": round(wpm, 1),
        "fillers": fillers,
        "fillers_total": filler_total
    }

BASE_DIR = Path(__file__).resolve().parent
RESULT_DIR = BASE_DIR / "results"
RESULT_DIR.mkdir(exist_ok=True)

def persist_result(payload):
    rid = uuid.uuid4().hex
    path = RESULT_DIR / f"{rid}.json"
    payload["result_id"] = rid
    payload["saved_at"] = datetime.datetime.utcnow().isoformat() + "Z"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False, indent=2)
    return rid

def load_result(result_id):
    path = RESULT_DIR / f"{result_id}.json"
    if not path.exists():
        return None
    return json.loads(path.read_text(encoding="utf-8"))

@app.get("/")
def index():
    return render_template("index.html")

@app.get("/report")
def report_page():
    return render_template("report.html")

@app.post("/assess_phrase")
def assess_phrase():
    language = (request.form.get("language") or "en-US").strip()
    phrase = (request.form.get("phrase") or "").strip()
    f = request.files.get("audio")
    if not phrase:
        return jsonify({"status":"error","message":"Missing 'phrase'"}), 400
    if not f:
        return jsonify({"status":"error","message":"Missing 'audio' file"}), 400
    ext = Path(f.filename or "audio.webm").suffix.lower()
    if ext not in {".webm",".wav",".mp3",".ogg",".m4a"}:
        return jsonify({"status":"error","message":"Unsupported audio type"}), 400

    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, f.filename or "audio.webm")
        f.save(src)
        wav = os.path.join(td, "audio.wav")
        to_wav_16k_mono(src, wav)
        dur = probe_duration_seconds(wav)
        result = run_pronunciation_assessment(wav, phrase, language=language)

        transcript = result.get("recognizedText") or ""
        m = metrics_from_transcript(transcript or phrase, dur)
        result["metrics"] = m
        rid = persist_result({"mode":"phrase","language":language,"referenceText":phrase,"result":result})
        result["result_id"] = rid
        result["pdf_url"] = url_for("report_pdf", result_id=rid, _external=False)
        return jsonify(result), (200 if result.get("status")=="ok" else 400)

@app.post("/assess_prompt")
def assess_prompt():
    language = (request.form.get("language") or "en-US").strip()
    f = request.files.get("audio")
    if not f:
        return jsonify({"status":"error","message":"Missing 'audio' file"}), 400
    ext = Path(f.filename or "audio.webm").suffix.lower()
    if ext not in {".webm",".wav",".mp3",".ogg",".m4a"}:
        return jsonify({"status":"error","message":"Unsupported audio type"}), 400

    with tempfile.TemporaryDirectory() as td:
        src = os.path.join(td, f.filename or "audio.webm")
        f.save(src)
        wav = os.path.join(td, "audio.wav")
        to_wav_16k_mono(src, wav)
        dur = probe_duration_seconds(wav)

        stt = speech_to_text(wav, language=language)
        if stt.get("status") != "ok":
            return jsonify(stt), 400
        transcript = stt.get("text") or ""

        pa = run_pronunciation_assessment(wav, transcript or "(no speech)", language=language)
        pa["transcriptUsedAsReference"] = transcript

        m = metrics_from_transcript(transcript, dur)
        pa["metrics"] = m
        rid = persist_result({"mode":"prompt","language":language,"result":pa})
        pa["result_id"] = rid
        pa["pdf_url"] = url_for("report_pdf", result_id=rid, _external=False)
        return jsonify(pa), (200 if pa.get("status")=="ok" else 400)

@app.get("/report_pdf/<result_id>")
def report_pdf(result_id):
    data = load_result(result_id)
    if not data:
        return "Not found", 404

    tmp_pdf = Path(tempfile.gettempdir()) / f"report-{result_id}.pdf"
    doc = SimpleDocTemplate(str(tmp_pdf), pagesize=A4, leftMargin=36, rightMargin=36, topMargin=36, bottomMargin=36)
    styles = getSampleStyleSheet()
    story = []
    story.append(Paragraph("<b>Speaking Assessment Report</b>", styles["Title"]))
    story.append(Paragraph(f"Result ID: {result_id}", styles["Normal"]))
    story.append(Paragraph(f"Generated: {datetime.datetime.utcnow().isoformat()}Z", styles["Normal"]))
    story.append(Spacer(1, 12))

    r = data.get("result", {})
    language = data.get("language", "en-US")
    story.append(Paragraph(f"Language: {language}", styles["Normal"]))

    ref = r.get("referenceText") or r.get("transcriptUsedAsReference") or "(none)"
    story.append(Paragraph(f"Reference Text: {ref}", styles["Normal"]))
    rec = r.get("recognizedText") or ""
    story.append(Paragraph(f"Recognized Text: {rec}", styles["Normal"]))
    story.append(Spacer(1, 12))

    scores = r.get("scores", {})
    score_rows = [["Metric","Score"], ["Accuracy", scores.get("accuracy","-")], ["Fluency", scores.get("fluency","-")], ["Completeness", scores.get("completeness","-")], ["Pronunciation", scores.get("pronunciation","-")]]
    tbl = Table(score_rows, hAlign='LEFT')
    tbl.setStyle(TableStyle([("BOX",(0,0),(-1,-1),0.5,colors.black),("GRID",(0,0),(-1,-1),0.25,colors.grey),("BACKGROUND",(0,0),(-1,0),colors.lightgrey)]))
    story.append(tbl)
    story.append(Spacer(1, 12))

    m = r.get("metrics", {})
    met_rows = [["Metric","Value"],
                ["Duration", m.get("duration_mmss","--:--")],
                ["Total Words", m.get("word_count","-")],
                ["Words Per Minute", m.get("wpm","-")],
                ["Filler Words (total)", m.get("fillers_total","-")]]
    story.append(Table(met_rows, hAlign='LEFT', style=TableStyle([("BOX",(0,0),(-1,-1),0.5,colors.black),("GRID",(0,0),(-1,-1),0.25,colors.grey),("BACKGROUND",(0,0),(-1,0),colors.lightgrey)])))
    story.append(Spacer(1, 12))

    words = []
    detail = r.get("detail", {})
    try:
        words = detail.get("NBest",[{}])[0].get("Words", [])
    except Exception:
        words = []
    if not words:
        try:
            words = detail.get("nBest",[{}])[0].get("words", [])
        except Exception:
            words = []

    if words:
        story.append(Paragraph("Word-level Details (first 20)", styles["Heading3"]))
        rows = [["Word","Accuracy","ErrorType","Offset(ms)","Duration(ms)"]]
        for w in words[:20]:
            rows.append([
                str(w.get("Word") or w.get("word") or ""),
                str(w.get("PronunciationAssessment",{}).get("AccuracyScore") or w.get("pronunciationAssessment",{}).get("accuracyScore") or ""),
                str(w.get("PronunciationAssessment",{}).get("ErrorType") or w.get("pronunciationAssessment",{}).get("errorType") or ""),
                str(w.get("Offset") or w.get("offset") or ""),
                str(w.get("Duration") or w.get("duration") or ""),
            ])
        story.append(Table(rows, hAlign='LEFT', style=TableStyle([("BOX",(0,0),(-1,-1),0.5,colors.black),("GRID",(0,0),(-1,-1),0.25,colors.grey),("BACKGROUND",(0,0),(-1,0),colors.lightgrey)])))

    doc.build(story)
    return send_file(str(tmp_pdf), as_attachment=True, download_name=f"speaking-report-{result_id}.pdf", mimetype="application/pdf")

@app.get("/health")
def health():
    return "ok", 200

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.getenv("PORT","5000")), debug=False)
