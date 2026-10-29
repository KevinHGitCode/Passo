import { trackerConfigFor } from '@/core/domain/listening-profile';
import { analyzeFrame } from '@/core/domain/frame-analysis';
import { DEFAULT_TRACKER_CONFIG, NoteTracker } from '@/core/domain/note-tracker';
import { onsOf, runPipeline } from '../support/pipeline';
import {
  SAMPLE_RATE,
  concat,
  guitarNote,
  highpass,
  pianoNote,
  silence,
  streamFrames,
} from '../support/synth';

describe('perfil de escucha por instrumento', () => {
  it('el de piano deja la configuración de siempre', () => {
    expect(trackerConfigFor('piano')).toEqual({});
  });

  it('el de guitarra amplía el rango y vuelve más exigente el ataque', () => {
    const guitar = trackerConfigFor('guitarra');
    expect(guitar.minMidi).toBe(38);
    expect(guitar.maxMidi).toBe(79);
    expect(guitar.sameNoteRetriggerMs).toBe(1200);
    expect(guitar.onsetRatio).toBe(1.8);
    expect(guitar.refractoryMs).toBe(250);
    expect(guitar.learnTuning).toBe(false);
    // Todos son campos que el rastreador conoce.
    for (const key of Object.keys(guitar)) expect(DEFAULT_TRACKER_CONFIG).toHaveProperty(key);
  });

  it('abarca de Mi2 a Sol4 con margen', () => {
    const { minMidi = 0, maxMidi = 0 } = trackerConfigFor('guitarra');
    expect(minMidi).toBeLessThanOrEqual(40);
    expect(maxMidi).toBeGreaterThanOrEqual(67);
  });
});

describe('por qué la guitarra tiene su propio perfil', () => {
  const signal = concat(
    silence(1200),
    highpass(guitarNote(45, { loss: 0.12, t60: 4 }), 130),
    silence(1000),
  );

  it('con la configuración de piano (solo ampliando el rango), La2 rebota en varios ataques', () => {
    const ons = onsOf(runPipeline(signal, { minMidi: 38 }));
    expect(ons.length).toBeGreaterThan(1);
  });

  it('con el perfil de guitarra, una pulsación es un solo ataque', () => {
    const ons = onsOf(runPipeline(signal, trackerConfigFor('guitarra')));
    expect(ons.map((item) => item.event.note)).toEqual([45]);
  });
});

/** Pasa una señal por un rastreador ya creado y devuelve las notas que abrió. */
function feed(tracker: NoteTracker, signal: Float32Array, startAtMs: number): number[] {
  const notes: number[] = [];
  streamFrames(
    signal,
    (window, newSamples, endAt) => {
      for (const event of tracker.push(analyzeFrame(window, newSamples, SAMPLE_RATE, endAt))) {
        if (event.type === 'on') notes.push(event.note);
      }
    },
    { startAtMs },
  );
  return notes;
}

describe('NoteTracker.reconfigure (cambio de instrumento en caliente)', () => {
  const lengthMs = (signal: Float32Array) => (signal.length / SAMPLE_RATE) * 1000;

  it('conserva la calibración: no vuelve a medir el ruido', () => {
    const tracker = new NoteTracker();
    const calibration = silence(1500);
    feed(tracker, calibration, 0);
    const before = tracker.getState();
    expect(before.phase).toBe('escuchando');
    tracker.reconfigure(trackerConfigFor('guitarra'), lengthMs(calibration));
    const after = tracker.getState();
    expect(after.phase).toBe('escuchando');
    expect(after.noiseFloor).toBe(before.noiseFloor);
  });

  it('suelta la nota que sonaba y avisa con un off', () => {
    const tracker = new NoteTracker();
    const warmUp = concat(silence(1300), pianoNote(64, { ms: 400 }));
    expect(feed(tracker, warmUp, 0)).toEqual([64]);
    expect(tracker.getState().heard?.midi).toBe(64);
    const events = tracker.reconfigure(trackerConfigFor('guitarra'), lengthMs(warmUp));
    expect(events).toEqual([expect.objectContaining({ type: 'off', note: 64 })]);
    expect(tracker.getState().heard).toBeNull();
  });

  it('olvida la afinación aprendida y no aprende otra con el perfil de guitarra', () => {
    const tracker = new NoteTracker();
    // Seis notas 30 cents altas: el piano «aprende» que el teclado está subido.
    const notes = [60, 62, 64, 65, 67, 69].map((midi) =>
      concat(pianoNote(midi, { ms: 600, cents: 30 }), silence(500)),
    );
    const signal = concat(silence(1300), ...notes);
    feed(tracker, signal, 0);
    expect(tracker.getState().tuningOffsetCents).not.toBeNull();

    tracker.reconfigure(trackerConfigFor('guitarra'), lengthMs(signal));
    expect(tracker.getState().tuningOffsetCents).toBeNull();

    const more = concat(
      ...[60, 62, 64, 65, 67, 69].map((midi) =>
        concat(pianoNote(midi, { ms: 600, cents: 30 }), silence(1400)),
      ),
    );
    feed(tracker, more, lengthMs(signal));
    expect(tracker.getState().tuningOffsetCents).toBeNull();
  });

  it('con el perfil nuevo oye lo que antes quedaba fuera de rango', () => {
    const tracker = new NoteTracker();
    const calibration = silence(1500);
    feed(tracker, calibration, 0);
    const low = concat(guitarNote(40), silence(900));
    expect(feed(tracker, low, lengthMs(calibration))).toEqual([]);

    const t = lengthMs(calibration) + lengthMs(low);
    tracker.reconfigure(trackerConfigFor('guitarra'), t);
    // Tras un reinicio el primer bloque no puede ser un ataque: antes de la nota hay un poco de silencio.
    expect(feed(tracker, concat(silence(300), low), t)).toEqual([40]);
  });

  it('volver a piano restablece la configuración de siempre', () => {
    const tracker = new NoteTracker();
    feed(tracker, silence(1500), 0);
    tracker.reconfigure(trackerConfigFor('guitarra'), 1500);
    tracker.reconfigure(trackerConfigFor('piano'), 1600);
    const low = concat(guitarNote(40), silence(900));
    expect(feed(tracker, low, 1600)).toEqual([]);
  });
});
