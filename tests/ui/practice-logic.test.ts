import type { Attempt } from '@/core/domain/exercise';
import type { SessionFeedback } from '@/core/application/practice-session';
import { describeSemitones, feedbackMessage, formatSeconds } from '@/ui/practice/feedback-message';
import { buildKeyVisuals } from '@/ui/practice/key-visuals';

function attempt(target: number, played: number, reactionMs = 640): Attempt {
  return {
    targetMidi: target,
    playedMidi: played,
    isCorrect: target === played,
    shownAt: 0,
    playedAt: reactionMs,
    reactionMs,
    attemptIndexForTarget: 1,
    firstTryCorrect: target === played,
    inputSource: 'teclado-pc',
    noteNameMode: 'latina',
    level: 1,
    velocity: 96,
  };
}

const wrong: SessionFeedback = {
  id: 1,
  outcome: { kind: 'error', attempt: attempt(62, 64), semitones: 2 },
};
const right: SessionFeedback = { id: 2, outcome: { kind: 'acierto', attempt: attempt(62, 62) } };

describe('formatSeconds y describeSemitones', () => {
  it('usa coma decimal y concuerda en singular y plural', () => {
    expect(formatSeconds(640)).toBe('0,6 s');
    expect(formatSeconds(2000)).toBe('2,0 s');
    expect(describeSemitones(1)).toBe('1 semitono más agudo');
    expect(describeSemitones(-3)).toBe('3 semitonos más grave');
  });
});

describe('feedbackMessage', () => {
  it('acierto: tono ok con nota y tiempo', () => {
    expect(feedbackMessage(right.outcome, 'latina')).toEqual({
      tone: 'ok',
      title: '¡Correcto!',
      detail: 'Re4 · 0,6 s',
    });
  });

  it('error: dice qué era, qué se tocó y la distancia, en la notación elegida', () => {
    const message = feedbackMessage(wrong.outcome, 'americana');
    expect(message.tone).toBe('error');
    expect(message.title).toBe('Incorrecto');
    expect(message.detail).toBe('Era D4, tocaste E4 · 2 semitonos más agudo');
  });
});

describe('buildKeyVisuals', () => {
  it('con ayuda ilumina la nota objetivo; sin ayuda no', () => {
    const base = { target: 62, pressed: [], feedback: null };
    expect(buildKeyVisuals({ ...base, help: true }).get(62)).toEqual({ target: true });
    expect(buildKeyVisuals({ ...base, help: false }).size).toBe(0);
  });

  it('en un error marca la tocada como errónea y revela la correcta, aunque no haya ayuda', () => {
    const visuals = buildKeyVisuals({ target: 62, help: false, pressed: [64], feedback: wrong });
    expect(visuals.get(64)).toEqual({ feedback: 'wrong', pressed: true });
    expect(visuals.get(62)).toEqual({ feedback: 'expected' });
  });

  it('en un acierto marca la tecla como correcta', () => {
    const visuals = buildKeyVisuals({ target: 64, help: true, pressed: [], feedback: right });
    expect(visuals.get(62)).toEqual({ feedback: 'correct' });
    expect(visuals.get(64)).toEqual({ target: true });
  });

  it('combina estados en la misma tecla (objetivo + pulsada)', () => {
    const visuals = buildKeyVisuals({ target: 62, help: true, pressed: [62], feedback: null });
    expect(visuals.get(62)).toEqual({ target: true, pressed: true });
  });
});
