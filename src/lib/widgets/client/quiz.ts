// Widget "Trivia": preguntas de opción múltiple, una a la vez. Sin estado
// persistente ni envío de respuestas: todo vive en memoria mientras se lee.

import type { WidgetProps } from '../schema';
import { add, h } from './dom';

type Props = Extract<WidgetProps, { type: 'quiz' }>;

export function mount(el: HTMLElement, props: Props): () => void {
  const { quiz } = props;
  const total = quiz.questions.length;
  let index = 0;
  let score = 0;

  const root = h('div', { class: 'wg wg-quiz' });
  el.replaceChildren(root);

  function renderQuestion() {
    const item = quiz.questions[index];
    let answered = false;

    const progress = h('div', { class: 'wg-progress', role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(total), 'aria-valuenow': String(index) },
      h('span', { style: `width:${(index / total) * 100}%` }));
    const meta = h('p', { class: 'wg-quiz-meta' }, quiz.title ? `${quiz.title} · ` : '', `Pregunta ${index + 1} de ${total}`);
    const question = h('p', { class: 'wg-quiz-q', id: `wq-${index}` }, item.q);
    const feedback = h('div', { class: 'wg-quiz-feedback', 'aria-live': 'polite' });
    const nextBtn = h('button', { type: 'button', class: 'wg-btn wg-btn-primary wg-quiz-next', hidden: '' }, index + 1 < total ? 'Siguiente pregunta' : 'Ver resultado');

    const options = h('div', { class: 'wg-quiz-options', role: 'group', 'aria-labelledby': `wq-${index}` });
    const buttons = item.options.map((text, i) => {
      const b = h('button', { type: 'button', class: 'wg-opt' },
        h('span', { class: 'wg-opt-key', 'aria-hidden': 'true' }, String.fromCharCode(65 + i)),
        h('span', { class: 'wg-opt-text' }, text));
      b.addEventListener('click', () => {
        if (answered) return;
        answered = true;
        const correct = i === item.answer;
        if (correct) score++;
        buttons.forEach((other, j) => {
          other.disabled = true;
          if (j === item.answer) other.classList.add('is-correct');
          else if (j === i) other.classList.add('is-wrong');
        });
        feedback.dataset.tone = correct ? 'ok' : 'bad';
        feedback.replaceChildren();
        add(
          feedback,
          h('strong', {}, correct ? '¡Correcto!' : `No. La respuesta es ${String.fromCharCode(65 + item.answer)}.`),
          item.explain ? h('span', {}, ` ${item.explain}`) : null
        );
        nextBtn.hidden = false;
        nextBtn.focus();
      });
      return b;
    });
    add(options, ...buttons);

    nextBtn.addEventListener('click', () => {
      index++;
      if (index < total) renderQuestion();
      else renderResult();
    });

    root.replaceChildren(progress, meta, question, options, feedback, nextBtn);
  }

  function renderResult() {
    const ratio = score / total;
    const message = ratio === 1 ? '¡Perfecto!' : ratio >= 0.6 ? 'Muy bien.' : 'Sigue practicando.';
    const again = h('button', { type: 'button', class: 'wg-btn wg-btn-primary' }, 'Volver a intentar');
    again.addEventListener('click', () => {
      index = 0;
      score = 0;
      renderQuestion();
    });
    root.replaceChildren(
      h('p', { class: 'wg-quiz-score' }, `${score} de ${total}`),
      h('p', { class: 'wg-quiz-verdict', 'aria-live': 'polite' }, message),
      again
    );
  }

  renderQuestion();
  return () => root.replaceChildren();
}
