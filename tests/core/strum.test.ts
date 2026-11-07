import { describe, expect, it } from 'vitest';
import { strumDirection } from '@/core/domain/strum';
import { SAMPLE_RATE, concat, silence, samplesFor } from '../support/synth';
import { strum } from '../support/strum';

const CHORDS = {
  G: [43, 47, 50, 55, 59, 67],
  C: [48, 52, 55, 60, 64],
  D7: [50, 57, 60, 66],
  Em: [40, 47, 52, 55, 59, 64],
  Am: [45, 52, 57, 60, 64],
} as const;

/** 20 ms de silencio y luego el golpe. */
function stroke(notes: readonly number[], down: boolean, spacingMs: number) {
  const ordered = down ? notes : [...notes].reverse();
  const signal = concat(silence(20), strum(ordered, { spacingMs, ms: 500 }));
  return { signal, onset: samplesFor(20) };
}

describe('hacia dónde va un rasgueo', () => {
  for (const [name, notes] of Object.entries(CHORDS)) {
    for (const spacing of [6, 10, 14]) {
      it(`${name}: hacia abajo y hacia arriba (cuerdas cada ${spacing} ms)`, () => {
        const down = stroke(notes, true, spacing);
        const up = stroke(notes, false, spacing);
        const downVerdict = strumDirection(down.signal, SAMPLE_RATE, down.onset);
        const upVerdict = strumDirection(up.signal, SAMPLE_RATE, up.onset);
        expect(downVerdict.direction, `abajo ${downVerdict.lagMs}`).toBe('abajo');
        expect(upVerdict.direction, `arriba ${upVerdict.lagMs}`).toBe('arriba');
      });
    }
  }

  it('un golpe sin energía no se decide', () => {
    expect(strumDirection(silence(200), SAMPLE_RATE, 100).direction).toBeNull();
  });
});
