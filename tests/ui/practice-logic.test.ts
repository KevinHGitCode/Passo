import type { Attempt } from '@/core/domain/exercise';
import type { SessionFeedback } from '@/core/application/practice-session';
import {
  describeMistake,
  describeSemitones,
  feedbackMessage,
  formatSeconds,
} from '@/ui/practice/feedback-message';
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
    helpOn: true,
    targetIndex: 0,
    detectionConfidence: null,
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
    expect(describeSemitones(1)).toBe('1 semitono más agudo');
    expect(describeSemitones(-3)).toBe('3 semitonos más grave');
  });
});

describe('feedbackMessage', () => {
  it('acierto: tono ok con nota y tiempo', () => {
    expect(feedbackMessage(right.outcome, 'latina')).toEqual({
      tone: 'ok',
      title: '¡Correcto!',
      detail: 'Re4',
    });
  });

  it('error: dice qué era, qué se tocó y la distancia, en la notación elegida', () => {
    const message = feedbackMessage(wrong.outcome, 'americana');
    expect(message.tone).toBe('error');
    expect(message.title).toBe('Incorrecto');
    expect(message.detail).toBe('Era D4, tocaste E4 · una tecla a la derecha');
  });
});

describe('feedbackMessage · entrada por micrófono', () => {
  it('dice «oí» en lugar de «tocaste» cuando la nota se infiere del micrófono', () => {
    const heard: SessionFeedback = {
      id: 3,
      outcome: {
        kind: 'error',
        attempt: { ...attempt(62, 64), inputSource: 'microfono' },
        semitones: 2,
      },
    };
    expect(feedbackMessage(heard.outcome, 'latina').detail).toContain('oí Mi4');
    expect(feedbackMessage(heard.outcome, 'latina').detail).not.toContain('tocaste');
  });

  it('una nota dudosa es neutra y pide tocar una sola tecla', () => {
    const message = feedbackMessage(
      { kind: 'dudoso', heardMidi: 64, targetMidi: 62, reason: 'poca-confianza' },
      'latina',
    );
    expect(message.tone).toBe('neutral');
    expect(message.detail).toContain('Mi4');
    expect(message.detail).toContain('No cuenta como error');
  });

  it('si se oyó otra octava lo explica y dice que no cuenta como error', () => {
    const message = feedbackMessage(
      { kind: 'dudoso', heardMidi: 74, targetMidi: 62, reason: 'octava' },
      'latina',
    );
    expect(message.detail).toContain('Oí Re5');
    expect(message.detail).toContain('una octava más arriba');
    expect(message.detail).toContain('No cuenta como error');
  });

  it('un sonido que no encaja pide tocar solo la tecla pedida', () => {
    const message = feedbackMessage(
      { kind: 'dudoso', heardMidi: 40, targetMidi: 62, reason: 'lejana' },
      'latina',
    );
    expect(message.detail).toContain('solo la tecla pedida');
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

  it('la nota oída del micrófono se marca aparte de «pulsada»', () => {
    const visuals = buildKeyVisuals({
      target: 62,
      help: true,
      pressed: [],
      feedback: null,
      heard: 64,
    });
    expect(visuals.get(64)).toEqual({ heard: true });
  });

  it('combina estados en la misma tecla (objetivo + pulsada)', () => {
    const visuals = buildKeyVisuals({ target: 62, help: true, pressed: [62], feedback: null });
    expect(visuals.get(62)).toEqual({ target: true, pressed: true });
  });
});

describe('describeMistake', () => {
  it('misma nota en otra octava: lo dice con palabras', () => {
    expect(describeMistake(60, 72, 'latina')).toBe('Es Do, pero una octava más arriba');
    expect(describeMistake(60, 48, 'americana')).toBe('Es C, pero una octava más abajo');
    expect(describeMistake(60, 84, 'latina')).toBe('Es Do, pero 2 octavas más arriba');
  });

  it('dos teclas blancas: cuenta teclas a la derecha o a la izquierda', () => {
    expect(describeMistake(60, 62, 'latina')).toBe('una tecla a la derecha');
    expect(describeMistake(64, 62, 'latina')).toBe('una tecla a la izquierda');
    expect(describeMistake(60, 67, 'latina')).toBe('4 teclas a la derecha');
    expect(describeMistake(67, 60, 'latina')).toBe('4 teclas a la izquierda');
  });

  it('Mi→Fa (1 semitono) y Do→Re (2 semitonos) son ambos "una tecla"', () => {
    expect(describeMistake(64, 65, 'latina')).toBe('una tecla a la derecha');
    expect(describeMistake(60, 62, 'latina')).toBe('una tecla a la derecha');
  });

  it('si interviene una tecla negra usa semitonos', () => {
    expect(describeMistake(60, 61, 'latina')).toBe('1 semitono más agudo');
    expect(describeMistake(62, 61, 'latina')).toBe('1 semitono más grave');
  });
});
