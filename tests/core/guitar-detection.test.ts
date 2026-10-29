import { trackerConfigFor } from '@/core/domain/listening-profile';
import { pitchClass } from '@/core/domain/note';
import { onsOf, runPipeline } from '../support/pipeline';
import { concat, guitarNote, highpass, silence } from '../support/synth';

/** Las 17 notas naturales de las lecciones: de Mi2 a Sol4. */
const NOTES = [40, 41, 43, 45, 47, 48, 50, 52, 53, 55, 57, 59, 60, 62, 64, 65, 67];

const TIMBRES: readonly { name: string; make: (midi: number) => Float32Array }[] = [
  { name: 'acero', make: (midi) => guitarNote(midi, { loss: 0.12, t60: 4 }) },
  { name: 'nailon', make: (midi) => guitarNote(midi, { loss: 0.45, t60: 1.6, amplitude: 0.2 }) },
  {
    name: 'acústica con un micrófono que recorta los graves',
    make: (midi) => highpass(guitarNote(midi, { loss: 0.12, t60: 4 }), 130),
  },
];

function hear(signal: Float32Array, profile: 'piano' | 'guitarra') {
  return onsOf(
    runPipeline(concat(silence(1200), signal, silence(1000)), trackerConfigFor(profile)),
  ).map((item) => item.event);
}

describe('la guitarra sintética es una guitarra razonable', () => {
  it('suena a la altura pedida (la nota que se oye es la que se tocó)', () => {
    // Con el perfil de guitarra, una cuerda de acero limpia se lee en su octava.
    for (const midi of [40, 45, 50, 55, 59, 64]) {
      const events = hear(guitarNote(midi), 'guitarra');
      expect(
        events.map((event) => event.note),
        `MIDI ${midi}`,
      ).toEqual([midi]);
    }
  });
});

describe('una pulsación, un solo ataque (perfil de guitarra)', () => {
  for (const timbre of TIMBRES) {
    it(`${timbre.name}: las 17 notas dan exactamente un ataque con el nombre correcto`, () => {
      const problems: string[] = [];
      for (const midi of NOTES) {
        const events = hear(timbre.make(midi), 'guitarra');
        if (events.length !== 1) {
          problems.push(`MIDI ${midi}: ${events.length} ataques (${events.map((e) => e.note)})`);
          continue;
        }
        const heard = events[0]?.note ?? -1;
        if (pitchClass(heard) !== pitchClass(midi)) problems.push(`MIDI ${midi}: oído ${heard}`);
      }
      expect(problems).toEqual([]);
    });
  }
});

describe('con el perfil de piano, la guitarra grave rebota (por eso hay un perfil propio)', () => {
  it('Mi2 con la configuración de piano ni siquiera entra en el rango', () => {
    const events = hear(guitarNote(40), 'piano');
    expect(events.filter((event) => event.note === 40)).toHaveLength(0);
  });
});
