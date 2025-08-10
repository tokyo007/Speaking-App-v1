document.addEventListener('DOMContentLoaded', () => {
    const reportData = {
        testType: "IELTS",
        groupId: 1,
        questionId: 0,
        promptText: "Describe a memorable trip you took",
        recognizedText: "I went to Kyoto last year...",
        score: 85
    };
    document.getElementById('reportContent').innerHTML = `
        <p><strong>Test:</strong> ${reportData.testType}</p>
        <p><strong>Group:</strong> ${reportData.groupId}</p>
        <p><strong>Question:</strong> ${reportData.questionId + 1}</p>
        <p><strong>Prompt:</strong> ${reportData.promptText}</p>
        <p><strong>Your Answer:</strong> ${reportData.recognizedText}</p>
        <p><strong>Score:</strong> ${reportData.score}</p>
    `;
});
