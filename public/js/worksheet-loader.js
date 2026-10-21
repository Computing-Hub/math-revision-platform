// Worksheet Loader - lists worksheets on the home page, and plays one on worksheet.html.
//
// How a question works for a student:
//   type the answer -> press Check (or Enter) -> feedback.
//   Up to 3 tries. Points: 3 for the first try, 2 for the second, 1 for the third.
//   "Nearly" answers (right value, wrong form) don't use up a try.
//   After 3 wrong tries the answer is shown, so nobody gets stuck.

// Every worksheet in worksheets/ must be listed here to appear on the home page
const WORKSHEETS = [
    'sample',
    'algebraic-fractions-ks3-easy-001',
    'quadratic-equations-demo',
    'quadratic-equations-compute-demo',
];
const MAX_TRIES = 3;
const POINTS = [3, 2, 1];

let currentWorksheet = null;
const progress = {};                       // index -> { tries, done, points, revealed }

/* ---------- home page ---------- */

async function loadWorksheetList() {
    const container = document.getElementById('worksheet-list');
    container.innerHTML = '';
    for (const id of WORKSHEETS) {
        try {
            const worksheet = await (await fetch(`worksheets/${id}.json`)).json();
            container.appendChild(createWorksheetCard(worksheet));
        } catch (error) {
            console.error(`Could not load worksheet ${id}:`, error);
        }
    }
}

function createWorksheetCard(worksheet) {
    const card = document.createElement('a');
    card.className = 'worksheet-card';
    card.href = `worksheet.html?id=${encodeURIComponent(worksheet.id)}`;
    const best = bestScore(worksheet.id);
    card.innerHTML = `
        <h3></h3>
        <div class="card-tags"><span class="badge badge-${worksheet.difficulty}"></span><span class="badge badge-grade"></span></div>
        <p class="card-topic"></p>
        <p class="card-meta">${worksheet.questions.length} questions • about ${worksheet.estimatedTime} min</p>
        ${best ? `<p class="card-best">⭐ Your best: ${best.points} / ${best.max}</p>` : ''}
    `;
    card.querySelector('h3').textContent = worksheet.title;
    card.querySelector('.badge-' + worksheet.difficulty).textContent = worksheet.difficulty;
    card.querySelector('.badge-grade').textContent = worksheet.grade;
    card.querySelector('.card-topic').textContent = worksheet.topic;
    return card;
}

function bestScore(id) {
    try { return JSON.parse(localStorage.getItem(`arcade-best:${id}`) || 'null'); } catch (e) { return null; }
}
function saveBest(id, points, max) {
    try {
        const best = bestScore(id);
        if (!best || points > best.points) localStorage.setItem(`arcade-best:${id}`, JSON.stringify({ points, max }));
    } catch (e) { /* storage unavailable */ }
}

/* ---------- worksheet page ---------- */

async function loadWorksheet(worksheetId) {
    try {
        const response = await fetch(`worksheets/${worksheetId}.json`);
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        currentWorksheet = await response.json();
    } catch (error) {
        document.getElementById('worksheet-title').textContent = 'Worksheet not found';
        document.getElementById('questions-container').innerHTML =
            '<p class="load-error">This worksheet could not be loaded. <a href="index.html">Go back to the arcade</a>.</p>';
        return;
    }

    document.title = `${currentWorksheet.title} - Maths Arcade`;
    document.getElementById('worksheet-title').textContent = currentWorksheet.title;
    document.getElementById('worksheet-meta').textContent =
        `${currentWorksheet.topic} • ${currentWorksheet.grade} • ${currentWorksheet.difficulty} • about ${currentWorksheet.estimatedTime} min`;

    const container = document.getElementById('questions-container');
    const ready = await Promise.race([
        customElements.whenDefined('math-field').then(() => true),
        new Promise(resolve => setTimeout(() => resolve(false), 10000)),
    ]);
    if (!ready) {
        container.innerHTML = '<p class="load-error">The answer boxes could not load. Check the internet connection and reload the page.</p>';
        return;
    }

    container.innerHTML = '';
    currentWorksheet.questions.forEach((question, index) => {
        progress[index] = { tries: 0, done: false, points: 0, revealed: false };
        container.appendChild(createQuestionCard(question, index));
    });
    document.getElementById('finish-btn').addEventListener('click', finishWorksheet);
    document.getElementById('retry-btn').addEventListener('click', () => location.reload());
    updateScore();
}

function createQuestionCard(question, index) {
    const card = document.createElement('section');
    card.className = 'panel question-card';
    card.id = `question-${index}`;

    card.innerHTML = `
        <div class="question-head">
            <h3>Question ${index + 1}</h3>
            <span class="status-badge" id="status-${index}">Not answered</span>
        </div>
        <div class="question-prompt" id="prompt-${index}"></div>
        <div id="input-${index}"></div>
        <div class="question-actions">
            <button type="button" class="btn-check" id="check-${index}">Check</button>
            <span class="tries" id="tries-${index}">You have ${MAX_TRIES} tries</span>
        </div>
        <div class="feedback hidden" id="feedback-${index}" role="status" aria-live="polite"></div>
    `;
    renderLatex(question.prompt_latex, card.querySelector(`#prompt-${index}`), true);
    mathLiveHandler.createQuestionFields(card.querySelector(`#input-${index}`), index, question, () => checkAnswer(index));
    card.querySelector(`#check-${index}`).addEventListener('click', () => checkAnswer(index));
    return card;
}

function checkAnswer(index) {
    const state = progress[index];
    if (state.done) return;
    const question = currentWorksheet.questions[index];
    const answer = mathLiveHandler.getAnswer(index);

    const empty = Array.isArray(answer) ? answer.every(a => !a) : !answer;
    if (empty) { showFeedback(index, 'info', 'Type your answer in the box first.'); return; }

    const result = AnswerChecker.check(answer, question.answer, question.marking.method,
                                       question.marking.tolerance, question.marking.form);

    if (result.correct) {
        state.points = POINTS[state.tries] || 1;
        state.tries++;
        state.done = true;
        mathLiveHandler.setState(index, 'correct');
        mathLiveHandler.lock(index);
        setStatus(index, 'correct', `Correct • +${state.points} ⭐`);
        showFeedback(index, 'correct', `${result.message} You earned ${state.points} ⭐.`);
        finishQuestion(index);
    } else if (result.nearly) {
        // Right idea, wrong form: doesn't cost a try
        mathLiveHandler.setState(index, 'nearly');
        showFeedback(index, 'nearly', result.message);
    } else {
        state.tries++;
        mathLiveHandler.setState(index, 'incorrect');
        const left = MAX_TRIES - state.tries;
        if (left > 0) {
            setStatus(index, 'trying', 'Try again');
            showFeedback(index, 'incorrect', `${result.message} (${left} ${left === 1 ? 'try' : 'tries'} left)`);
            document.getElementById(`tries-${index}`).textContent = `${left} ${left === 1 ? 'try' : 'tries'} left`;
        } else {
            state.done = true;
            state.revealed = true;
            mathLiveHandler.lock(index);
            setStatus(index, 'revealed', 'Answer shown');
            showFeedback(index, 'incorrect', 'No tries left. Here is the answer, so you can see how it should look:', AnswerChecker.modelAnswer(question));
            finishQuestion(index);
        }
    }
    updateScore();
}

function finishQuestion(index) {
    document.getElementById(`check-${index}`).disabled = true;
    document.getElementById(`tries-${index}`).textContent = '';
    if (Object.values(progress).every(p => p.done)) {
        finishWorksheet();
        return;
    }
    // Move on to the next unfinished question
    const next = Object.keys(progress).map(Number).find(i => i > index && !progress[i].done);
    if (next !== undefined) {
        setTimeout(() => {
            document.getElementById(`question-${next}`).scrollIntoView({ behavior: 'smooth', block: 'start' });
            mathLiveHandler.focus(next);
        }, 900);
    }
}

function setStatus(index, kind, text) {
    const badge = document.getElementById(`status-${index}`);
    badge.className = `status-badge ${kind}`;
    badge.textContent = text;
    document.getElementById(`question-${index}`).dataset.state = kind;
}

function showFeedback(index, kind, message, latex) {
    const box = document.getElementById(`feedback-${index}`);
    const icon = { correct: '✅', incorrect: '❌', nearly: '🟡', info: 'ℹ️' }[kind] || '';
    box.className = `feedback ${kind}`;
    box.innerHTML = `<span class="feedback-icon" aria-hidden="true">${icon}</span><span class="feedback-text"></span>`;
    box.querySelector('.feedback-text').textContent = message;
    if (latex) {
        const model = document.createElement('div');
        model.className = 'model-answer';
        renderLatex(latex, model, true);
        box.appendChild(model);
    }
}

function totals() {
    const max = currentWorksheet.questions.length * POINTS[0];
    const points = Object.values(progress).reduce((sum, p) => sum + p.points, 0);
    const done = Object.values(progress).filter(p => p.done).length;
    return { points, max, done, total: currentWorksheet.questions.length };
}

function updateScore() {
    const { points, max, done, total } = totals();
    document.getElementById('score').textContent = `⭐ ${points} / ${max}`;
    document.getElementById('progress-text').textContent = `${done} of ${total} questions done`;
    document.getElementById('progress-fill').style.width = `${(done / total) * 100}%`;
}

function finishWorksheet() {
    const { points, max, done, total } = totals();
    saveBest(currentWorksheet.id, points, max);
    const firstTry = Object.values(progress).filter(p => p.points === POINTS[0]).length;
    const shown = Object.values(progress).filter(p => p.revealed).length;
    const percent = max ? Math.round((points / max) * 100) : 0;
    const results = document.getElementById('results');
    results.querySelector('#results-score').textContent = `⭐ ${points} out of ${max}`;
    results.querySelector('#results-details').textContent =
        `${done} of ${total} questions done • ${firstTry} right first time` + (shown ? ` • ${shown} answer${shown === 1 ? '' : 's'} shown` : '');
    results.querySelector('#results-message').textContent =
        percent >= 80 ? '🌟 Excellent work!' : percent >= 50 ? '👍 Good effort! Try again to beat your score.' : '💪 Keep practising. Try it again!';
    results.classList.remove('hidden');
    results.scrollIntoView({ behavior: 'smooth' });
}
