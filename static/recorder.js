const TEST_BANK = {
    IELTS: {
        1: ["Describe a memorable trip you took", "Talk about your favorite book"],
        2: ["What is your opinion on climate change?", "Describe a time you helped someone"]
    },
    EIKEN: {
        1: ["Do you like sports?", "What is your favorite season?"],
        2: ["Describe your hometown", "What do you want to be in the future?"]
    }
};

function initSelectors() {
    const testTypeSel = document.getElementById('testType');
    const groupSel = document.getElementById('groupId');
    const questionSel = document.getElementById('questionId');
    const promptEl = document.getElementById('promptText');

    Object.keys(TEST_BANK).forEach(test => {
        const opt = document.createElement('option');
        opt.value = test;
        opt.textContent = test;
        testTypeSel.appendChild(opt);
    });

    testTypeSel.addEventListener('change', () => {
        groupSel.innerHTML = '';
        Object.keys(TEST_BANK[testTypeSel.value]).forEach(group => {
            const opt = document.createElement('option');
            opt.value = group;
            opt.textContent = "Group " + group;
            groupSel.appendChild(opt);
        });
        groupSel.dispatchEvent(new Event('change'));
    });

    groupSel.addEventListener('change', () => {
        questionSel.innerHTML = '';
        TEST_BANK[testTypeSel.value][groupSel.value].forEach((q, i) => {
            const opt = document.createElement('option');
            opt.value = i;
            opt.textContent = "Q" + (i + 1);
            questionSel.appendChild(opt);
        });
        questionSel.dispatchEvent(new Event('change'));
    });

    questionSel.addEventListener('change', () => {
        promptEl.textContent = TEST_BANK[testTypeSel.value][groupSel.value][questionSel.value];
    });

    testTypeSel.dispatchEvent(new Event('change'));
}

document.getElementById('recordBtn').addEventListener('click', () => {
    document.getElementById('status').textContent = "Recording...";
});
