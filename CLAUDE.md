# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Maths Arcade: practice worksheets for UK KS3/KS4 students. A static site (vanilla JavaScript,
KaTeX for showing maths, MathLive for typing it). No build step. Published on GitHub Pages at
https://education.coderra.je/math-revision-platform/.

**Student pages** (use `css/student.css`):
- `index.html`: how to play + the list of worksheets (and each worksheet's best score on this device)
- `worksheet.html?id=<worksheet-id>`: plays one worksheet (`id` = JSON filename without `.json`)
- `guide.html`: How to play: typing maths, tries and stars, how answers are checked

**Other pages** (older arcade theme, `css/arcade-theme.css`): `prompt-builder.html` (for teachers:
writes an AI prompt that turns a worksheet into worksheet JSON), `quadratic-demo.html` (graph plotter),
`arcade.html`, `debug-test.html`, `test-keyboard.html`.

## How a question works

1. The student types in a MathLive answer box (or uses the "Maths keyboard" button).
   `/` makes a fraction, `^` a power, `sqrt` a root. Enter or **Check** marks it.
2. `AnswerChecker.check()` marks it (see below).
3. 3 tries per question. Points: 3 / 2 / 1 for the first / second / third try.
   A "nearly" result (right value, wrong form) does not use a try.
   After 3 wrong tries the model answer is shown (`AnswerChecker.modelAnswer`).
4. "Finish" (or answering the last question) shows the score; the best score is saved in localStorage.

## Answer checking (`js/answer-checker.js`)

`LatexMath` parses the LaTeX MathLive produces (including brace-less `\frac23`, `\sqrt5`,
`\left( \right)`, implicit multiplication like `7x` and `2(x+1)`) into a tree and evaluates it.

| `marking.method` | Checks |
|---|---|
| `fraction_equivalence`, `numeric_equal`, `equivalent` | Same value as `answer.exact_latex` (or any `answer.alt`). Letters are tested by substituting several numbers, so `7/10` or `7y/10` never pass for `7x/10`. |
| `solution_set` | Two boxes (x₁, x₂) in any order; each must be a number. `answer.roots: []` means "no real solutions" (the student ticks a box). A repeated root can be typed once. Optional `answer.roots_latex` for the model answer (e.g. `\frac{2}{3}`). |
| `solution_pair` | `x=a, y=b` |
| `exact` | Text match (avoid: prefer the value-based methods) |

Optional `marking.form`:
- `simplified_fraction`: must be one fraction with nothing that cancels ("Simplify fully", "single fraction")
- `single_fraction`: must be one fraction
- `simplified`: a fraction answer must not cancel (e.g. 3/3 for 1)

Test the checker without a browser: it exports `{ AnswerChecker, LatexMath }` under Node.

## Worksheet JSON (`worksheets/<id>.json`)

```json
{
  "id": "same-as-filename",
  "title": "…", "topic": "…", "grade": "KS3", "difficulty": "easy|medium|difficult", "estimatedTime": 15,
  "questions": [
    {
      "prompt_latex": "\\text{Simplify fully: } \\frac{x}{5} + \\frac{x}{2}",
      "answer": { "exact_latex": "\\frac{7x}{10}" },
      "marking": { "method": "fraction_equivalence", "form": "simplified_fraction" }
    }
  ]
}
```

**To add a worksheet:** add the JSON file, then add its id to `WORKSHEETS` at the top of
`js/worksheet-loader.js` (GitHub Pages can't list a folder, so the list is written out).

## Files

- `js/worksheet-loader.js`: worksheet list, question cards, tries/points, score, results
- `js/mathlive-handler.js`: answer boxes, on-screen keyboards (built per question: the question's own
  letters, fractions, powers; quadratics get the formula key), keyboard spacing
- `js/answer-checker.js`: marking (above)
- `js/katex-renderer.js`: `renderLatex(latex, element, displayMode)`
- `public/`: mirror of the student files for the DigitalOcean config (`.do/`); keep it in sync

## Dependencies (CDN, pinned)

- KaTeX 0.16.9
- MathLive 0.111.0 (`https://unpkg.com/mathlive@0.111.0/mathlive.min.js`: files are at the package
  root, not `dist/`). Use properties (`mf.mathVirtualKeyboardPolicy = 'manual'`), not `setOptions()`.
