// MathLive Handler - the answer boxes students type into, and their on-screen keyboards.
//
// Students can type straight into a box with the computer keyboard
// (/ makes a fraction, ^ makes a power, "sqrt" makes a square root),
// or press the "Maths keyboard" button for buttons on screen.

class MathLiveHandler {
    constructor() {
        this.fields = new Map();          // question index -> { boxes: [math-field], working }
    }

    /* ---------- keyboards ---------- */

    // Letters used in the question (ignoring words inside \text{…})
    lettersIn(latex) {
        const plain = String(latex || '').replace(/\\text\{[^}]*\}/g, ' ').replace(/\\[a-zA-Z]+/g, ' ');
        return [...new Set(plain.match(/[a-zA-Z]/g) || [])].slice(0, 5);
    }

    numberRows() {
        return [
            ['[7]', '[8]', '[9]', { latex: '\\times', label: '×' }, { latex: '\\div', label: '÷' }],
            ['[4]', '[5]', '[6]', '[+]', '[-]'],
            ['[1]', '[2]', '[3]', { class: 'small', latex: '\\left(#0\\right)', label: '( )' }, '[backspace]'],
            ['[0]', '[.]', '[left]', '[right]', { class: 'action', label: 'Clear', command: ['deleteAll'] }],
        ];
    }

    algebraKeyboard(letters) {
        const letterKeys = (letters.length ? letters : ['x', 'y']).map(l => ({ class: 'small', latex: l }));
        return {
            label: 'Algebra',
            tooltip: 'Letters, fractions and powers',
            rows: [
                [...letterKeys, { class: 'small', latex: '\\frac{#@}{#0}', label: '□/□' }, { class: 'small', latex: '#@^{2}', label: '□²' },
                 { class: 'small', latex: '#@^{#0}', label: '□ⁿ' }].slice(0, 8),
                ...this.numberRows(),
            ],
        };
    }

    numbersKeyboard() {
        return {
            label: 'Numbers',
            tooltip: 'Numbers, fractions and roots',
            rows: [
                [{ class: 'small', latex: '\\frac{#@}{#0}', label: '□/□' }, { class: 'small', latex: '#@^{#0}', label: '□ⁿ' },
                 { class: 'small', latex: '\\sqrt{#0}', label: '√□' }, { class: 'small', latex: '\\pi', label: 'π' }],
                ...this.numberRows(),
            ],
        };
    }

    // For quadratics: numbers, fractions and roots for the answer boxes, and
    // the quadratic formula as one key for the working box.
    quadraticKeyboard() {
        return {
            label: 'Quadratic',
            tooltip: 'Quadratic formula and roots',
            rows: [
                [{ class: 'small', latex: 'x=\\frac{-b\\pm\\sqrt{b^{2}-4ac}}{2a}', label: 'formula', width: 2 },
                 { class: 'small', latex: '\\pm', label: '±' }, { class: 'small', latex: '\\sqrt{#0}', label: '√□' },
                 { class: 'small', latex: '\\frac{#@}{#0}', label: '□/□' }, { class: 'small', latex: '#@^{2}', label: '□²' }],
                ...this.numberRows(),
            ],
        };
    }

    keyboardsFor(question) {
        if (question.marking.method === 'solution_set') return [this.quadraticKeyboard()];
        const letters = this.lettersIn(question.prompt_latex);
        return letters.length ? [this.algebraKeyboard(letters), this.numbersKeyboard()] : [this.numbersKeyboard()];
    }

    /* ---------- boxes ---------- */

    makeBox(id, label, question, onEnter) {
        const box = document.createElement('math-field');
        box.id = id;
        box.className = 'answer-box';
        box.setAttribute('aria-label', label);
        box.mathVirtualKeyboardPolicy = 'manual';
        box.smartMode = false;
        box.removeExtraneousParentheses = false;
        box.defaultMode = 'math';
        // Each question gets its own keyboard; set it when the box is used
        box.addEventListener('focusin', () => {
            if (window.mathVirtualKeyboard) window.mathVirtualKeyboard.layouts = this.keyboardsFor(question);
        });
        box.addEventListener('keydown', e => {
            if (e.key === 'Enter') { e.preventDefault(); onEnter(); }
        });
        return box;
    }

    keyboardButton(getBox, question) {
        const button = document.createElement('button');
        button.type = 'button';
        button.className = 'keyboard-btn';
        button.innerHTML = '<span aria-hidden="true">⌨️</span> Maths keyboard';
        button.addEventListener('click', () => {
            const kb = window.mathVirtualKeyboard;
            if (!kb) return;
            const box = getBox();
            kb.layouts = this.keyboardsFor(question);
            if (kb.visible && document.activeElement === box) { kb.hide(); return; }
            this.watchKeyboard();
            box.focus();
            kb.show();
            setTimeout(() => box.scrollIntoView({ behavior: 'smooth', block: 'center' }), 350);
        });
        return button;
    }

    // The on-screen keyboard covers the bottom of the page: leave room for it
    watchKeyboard() {
        if (this.watching || !window.mathVirtualKeyboard) return;
        this.watching = true;
        window.mathVirtualKeyboard.addEventListener('geometrychange', () => {
            const kb = window.mathVirtualKeyboard;
            document.body.style.paddingBottom = kb.visible ? `${Math.ceil(kb.boundingRect.height)}px` : '';
        });
    }

    /**
     * Build the answer area for one question inside `container`.
     * Returns nothing; read answers back with getAnswer(index).
     */
    createQuestionFields(container, index, question, onCheck) {
        const isSolve = question.marking.method === 'solution_set';
        const area = document.createElement('div');
        area.className = 'answer-area';

        const label = document.createElement('div');
        label.className = 'answer-label';
        label.textContent = isSolve ? 'Your solutions' : 'Your answer';
        area.appendChild(label);

        const row = document.createElement('div');
        row.className = 'answer-row';
        const boxes = [];
        let lastFocused = null;

        if (isSolve) {
            ['x₁ =', 'x₂ ='].forEach((name, k) => {
                const wrap = document.createElement('label');
                wrap.className = 'root-box';
                const tag = document.createElement('span');
                tag.className = 'root-label';
                tag.textContent = name;
                const box = this.makeBox(`answer-${index}-${k}`, `Solution ${k + 1}`, question, onCheck);
                box.addEventListener('focusin', () => { lastFocused = box; });
                wrap.append(tag, box);
                row.appendChild(wrap);
                boxes.push(box);
            });
        } else {
            const box = this.makeBox(`answer-${index}`, 'Your answer', question, onCheck);
            row.appendChild(box);
            boxes.push(box);
        }
        row.appendChild(this.keyboardButton(() => lastFocused || boxes[0], question));
        area.appendChild(row);

        let noneBox = null;
        if (isSolve) {
            const none = document.createElement('label');
            none.className = 'no-solutions';
            noneBox = document.createElement('input');
            noneBox.type = 'checkbox';
            noneBox.addEventListener('change', () => boxes.forEach(b => {
                b.readOnly = noneBox.checked;
                if (noneBox.checked) b.value = '';
                b.classList.toggle('muted', noneBox.checked);
            }));
            none.append(noneBox, document.createTextNode(' There are no real solutions'));
            area.appendChild(none);
        }

        // Optional working: a bigger box, folded away until wanted
        const working = document.createElement('details');
        working.className = 'working';
        const summary = document.createElement('summary');
        summary.textContent = 'Show my working (optional)';
        const workBox = this.makeBox(`working-${index}`, 'Working', question, () => {});
        workBox.classList.add('working-box');
        working.append(summary, workBox);
        area.appendChild(working);

        container.appendChild(area);
        this.fields.set(index, { boxes, noneBox, workBox });
    }

    /* The answer as the checker wants it: LaTeX, an array of boxes, or "none" */
    getAnswer(index) {
        const data = this.fields.get(index);
        if (!data) return '';
        if (data.noneBox && data.noneBox.checked) return 'none';
        const values = data.boxes.map(b => b.value.trim());
        return values.length > 1 ? values : values[0];
    }

    setState(index, state) {           // 'correct' | 'incorrect' | 'nearly' | null
        const data = this.fields.get(index);
        if (!data) return;
        data.boxes.forEach(b => {
            b.classList.remove('correct', 'incorrect', 'nearly');
            if (state) b.classList.add(state);
        });
    }

    lock(index) {
        const data = this.fields.get(index);
        if (!data) return;
        data.boxes.forEach(b => { b.readOnly = true; });
        if (data.noneBox) data.noneBox.disabled = true;
    }

    focus(index) {
        const data = this.fields.get(index);
        if (data) data.boxes[0].focus();
    }
}

// Global instance
const mathLiveHandler = new MathLiveHandler();
