from flask import Flask, render_template, request, jsonify
import azure.cognitiveservices.speech as speechsdk
import os
import tempfile

app = Flask(__name__)

SPEECH_KEY = os.environ.get("SPEECH_KEY")
SPEECH_REGION = os.environ.get("SPEECH_REGION")

@app.route("/")
def index():
    return render_template("index.html")

@app.route("/assess", methods=["POST"])
def assess():
    try:
        lang = request.form.get("language", "en-US")
        reference_text = request.form.get("referenceText", "").strip()
        audio_file = request.files["audio_data"]
        with tempfile.NamedTemporaryFile(delete=False, suffix=".wav") as tmp:
            audio_file.save(tmp.name)
            audio_path = tmp.name

        speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
        audio_config = speechsdk.audio.AudioConfig(filename=audio_path)

        pron_config = speechsdk.PronunciationAssessmentConfig(
            reference_text=reference_text,
            grading_system=speechsdk.PronunciationAssessmentGradingSystem.HundredMark,
            granularity=speechsdk.PronunciationAssessmentGranularity.Phoneme,
            enable_miscue=True
        )
        recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, language=lang, audio_config=audio_config)
        pron_config.apply_to(recognizer)
        result = recognizer.recognize_once()

        if result.reason == speechsdk.ResultReason.RecognizedSpeech:
            assessment_result = speechsdk.PronunciationAssessmentResult(result)
            data = {
                "status": "success",
                "recognized": result.text,
                "overall": assessment_result.pronunciation_score,
                "accuracy": assessment_result.accuracy_score,
                "fluency": assessment_result.fluency_score,
                "completeness": assessment_result.completeness_score,
                "words": [{"word": w.word, "accuracy": w.accuracy_score} for w in assessment_result.words]
            }
            return jsonify(data)
        else:
            return jsonify({"status": "error", "message": f"Recognition failed: {result.reason}", "raw": str(result)})
    except Exception as e:
        return jsonify({"status": "error", "message": str(e)})

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000)
