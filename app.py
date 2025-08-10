from flask import Flask, render_template, request, jsonify, redirect, url_for
import azure.cognitiveservices.speech as speechsdk
import os

app = Flask(__name__)

SPEECH_KEY = os.getenv("SPEECH_KEY")
SPEECH_REGION = os.getenv("SPEECH_REGION")

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/report')
def report():
    return render_template('report.html')

@app.route('/assess_prompt', methods=['POST'])
def assess_prompt():
    file = request.files['audio']
    test_type = request.form.get('testType')
    group_id = request.form.get('groupId')
    question_id = request.form.get('questionId')
    prompt_text = request.form.get('promptText')

    audio_path = 'temp.wav'
    file.save(audio_path)

    speech_config = speechsdk.SpeechConfig(subscription=SPEECH_KEY, region=SPEECH_REGION)
    audio_input = speechsdk.audio.AudioConfig(filename=audio_path)

    recognizer = speechsdk.SpeechRecognizer(speech_config=speech_config, audio_config=audio_input)
    result = recognizer.recognize_once()

    if result.reason == speechsdk.ResultReason.RecognizedSpeech:
        return jsonify({
            "status": "success",
            "testType": test_type,
            "groupId": group_id,
            "questionId": question_id,
            "promptText": prompt_text,
            "recognizedText": result.text,
            "score": 85  # Placeholder score
        })
    else:
        return jsonify({
            "status": "error",
            "message": "Recognition failed",
            "reason": str(result.reason)
        })

if __name__ == '__main__':
    app.run(host='0.0.0.0', port=10000)
