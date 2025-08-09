let mediaRecorder;
let audioChunks = [];
let currentCourse = "A"; // default to Course A

function startRecording(course) {
    currentCourse = course;
    audioChunks = [];
    document.getElementById("status").textContent = "Recording...";
    navigator.mediaDevices.getUserMedia({ audio: true })
        .then(stream => {
            mediaRecorder = new MediaRecorder(stream);
            mediaRecorder.start();

            mediaRecorder.addEventListener("dataavailable", event => {
                audioChunks.push(event.data);
            });

            mediaRecorder.addEventListener("stop", () => {
                const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
                uploadAudio(audioBlob, currentCourse);
            });
        })
        .catch(err => {
            console.error("Mic access error:", err);
            document.getElementById("status").textContent = "Microphone access denied.";
        });
}

function stopRecording() {
    document.getElementById("status").textContent = "Processing...";
    if (mediaRecorder && mediaRecorder.state !== "inactive") {
        mediaRecorder.stop();
    }
}

function uploadAudio(audioBlob, course) {
    const formData = new FormData();
    formData.append("audio_data", audioBlob, "recording.webm");

    let endpoint = (course === "A") ? "/assess_phrase" : "/assess_prompt";

    fetch(endpoint, {
        method: "POST",
        body: formData
    })
    .then(response => response.json())
    .then(data => {
        console.log("Server response:", data);

        if (data.status === "success") {
            localStorage.setItem("lastResult", JSON.stringify(data));
            // Auto-redirect to report page
            window.location.href = "/report";
        } else {
            document.getElementById("status").textContent = "Error: " + data.message;
        }
    })
    .catch(error => {
        console.error("Upload error:", error);
        document.getElementById("status").textContent = "Upload failed.";
    });
}

// Debugging helpers
console.log('recorder.js loaded', typeof startRecording, typeof stopRecording);
