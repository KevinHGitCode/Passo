import { useEffect, useState, useSyncExternalStore } from 'react';
import type { PianoSetupService } from '@/core/application/piano-setup-service';
import type { PreferencesService } from '@/core/application/preferences-service';
import { isBlackKey, noteName, pitchClass } from '@/core/domain/note';
import type { Midi } from '@/core/domain/note';
import type { NotationMode } from '@/core/domain/note';
import {
  KEYBOARD_SIZES,
  MIC_RANGE,
  keyboardRange,
  keysOutsideMic,
  octaveCount,
  probeKind,
  probeSummary,
} from '@/core/domain/piano-setup';
import type { OctaveNaming, ProbeKind } from '@/core/domain/piano-setup';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { GameButton } from '../game/GameButton';
import { PianoKeyboard } from '../keyboard/piano-keyboard';
import type { KeyVisual } from '../keyboard/piano-keyboard';
import { useInputStatus, useMonitor } from '../practice/hooks';
import './mi-piano.css';

const KIND_TEXT: Readonly<Record<ProbeKind, string>> = {
  bien: '✓ bien',
  'octava-arriba': '↑ una octava más aguda',
  'octava-abajo': '↓ una octava más grave',
  otra: '✗ otra nota',
};

/** El Do central (MIDI 60): el punto de referencia para saber cómo llama el piano a sus notas. */
const MIDDLE_C = 60;
/** Si en tantos segundos no se oye la nota pedida, se avisa de que puede estar fuera del rango. */
const SILENCE_HINT_MS = 6000;

const whiteBelow = (midi: Midi): Midi => (isBlackKey(midi) ? midi - 1 : midi);
const whiteAbove = (midi: Midi): Midi => (isBlackKey(midi) ? midi + 1 : midi);

/** Los parámetros del piano: cuántas teclas tiene, cómo llama al Do central y una prueba del micrófono. */
export function MiPianoScreen({
  setup,
  preferences,
  microphone,
  micIsInput,
  notation,
}: {
  readonly setup: PianoSetupService;
  readonly preferences: PreferencesService;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
  /** El micrófono es una de las entradas con las que se toca: solo entonces tiene sentido probarlo. */
  readonly micIsInput: boolean;
  readonly notation: NotationMode;
}) {
  const prefs = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  const probe = useSyncExternalStore(setup.subscribe, setup.getSnapshot);
  const status = useInputStatus(microphone);
  const monitor = useMonitor(microphone);

  // Al salir se deja de escuchar.
  useEffect(() => () => setup.stop(), [setup]);

  const name = (midi: number) => noteName(midi, notation);
  const range = keyboardRange(prefs.pianoKeys);
  const connected = status?.kind === 'conectado' && monitor.phase === 'escuchando';
  const fixes = setup.fixes();
  const summary = probeSummary(probe.results);
  const prompt = probe.notes[probe.index];
  const outside = keysOutsideMic(prefs.pianoKeys);
  const probing = probe.phase === 'probando' && prompt !== undefined;

  // Si pasan unos segundos sin oír la tecla pedida, se dice por qué puede ser y que se puede saltar. Se guarda
  // para qué nota y qué última lectura ya pasó el tiempo (así no hay que reiniciar nada al cambiar).
  const askKey = probing ? `${probe.index}:${probe.lastHeard ?? '-'}` : null;
  const [silentKey, setSilentKey] = useState<string | null>(null);
  useEffect(() => {
    if (askKey === null) return;
    const id = window.setTimeout(() => setSilentKey(askKey), SILENCE_HINT_MS);
    return () => window.clearTimeout(id);
  }, [askKey]);
  const silent = askKey !== null && silentKey === askKey;

  // El teclado de tu piano: sus octavas, el Do central y, en la prueba, la tecla que toca.
  const visuals = new Map<Midi, KeyVisual>();
  if (probing) {
    for (const result of probe.results) {
      if (result.detected === null) continue;
      visuals.set(result.expected, {
        feedback: result.detected === result.expected ? 'correct' : 'wrong',
      });
    }
    visuals.set(prompt, { target: true });
    if (probe.lastHeard !== null) {
      visuals.set(probe.lastHeard, { ...visuals.get(probe.lastHeard), heard: true });
    }
  } else if (probe.phase === 'inactiva') {
    visuals.set(MIDDLE_C, { target: true });
  }
  const labelFor = (midi: Midi): string | undefined => {
    if (isBlackKey(midi)) return undefined;
    // Se rotulan los Do (con su octava) y la tecla que se pide; si no, el teclado sería ilegible.
    return pitchClass(midi) === 0 || (probing && midi === prompt) ? name(midi) : undefined;
  };

  return (
    <div className="mipiano" data-testid="mipiano">
      <h1 id="mi-piano-titulo" tabIndex={-1} data-route-heading>
        Mi piano
      </h1>
      <p className="mipiano__lead">
        Cuéntame cómo es tu piano para que la app lo entienda bien: cuántas teclas tiene, cómo llama
        a sus notas y si el micrófono las lee en la octava correcta.
      </p>

      <section
        className="mipiano__card mipiano__board"
        aria-label="Tu teclado"
        data-testid="mipiano-board"
      >
        <PianoKeyboard
          from={whiteBelow(range.low)}
          to={whiteAbove(range.high)}
          visuals={visuals}
          labelFor={labelFor}
          ariaLabel={`Tu teclado de ${prefs.pianoKeys} teclas, de ${name(range.low)} a ${name(range.high)}`}
        />
        <p className="mipiano__muted" data-testid="mipiano-board-caption">
          {probing
            ? `Toca la tecla marcada: el ${name(prompt)}.`
            : `Tu teclado: ${prefs.pianoKeys} teclas, de ${name(range.low)} a ${name(range.high)}. La tecla marcada es el Do central (${name(MIDDLE_C)}).`}
        </p>
      </section>

      <section className="mipiano__card" aria-labelledby="mipiano-teclas">
        <h2 id="mipiano-teclas" className="mipiano__title">
          1 · Cuántas teclas tiene
        </h2>
        <div className="mipiano__options" role="radiogroup" aria-label="Número de teclas">
          {KEYBOARD_SIZES.map((keys) => (
            <label key={keys} className="mipiano__option">
              <input
                type="radio"
                name="teclas"
                value={keys}
                checked={prefs.pianoKeys === keys}
                onChange={() => preferences.update({ pianoKeys: keys })}
                data-testid={`piano-keys-${keys}`}
              />
              <span>
                {keys} teclas <small>({octaveCount(keys)} octavas)</small>
              </span>
            </label>
          ))}
        </div>
        <p className="mipiano__muted" data-testid="piano-range">
          Tu piano va de <b>{name(range.low)}</b> a <b>{name(range.high)}</b> ({prefs.pianoKeys}{' '}
          teclas, {octaveCount(prefs.pianoKeys)} octavas).
        </p>
      </section>

      <section className="mipiano__card" aria-labelledby="mipiano-do">
        <h2 id="mipiano-do" className="mipiano__title">
          2 · Cómo llama tu piano al Do central
        </h2>
        <p className="mipiano__muted">
          El Do central es el que queda en medio del teclado (en uno de 61 teclas, el tercer Do
          contando desde la izquierda). Unos pianos lo llaman Do4 y otros Do3: solo cambia el número
          que se escribe junto al nombre, el sonido es el mismo.
        </p>
        <div className="mipiano__options" role="radiogroup" aria-label="Nombre del Do central">
          {(
            [
              ['estandar', 'Do4', 'Estándar (la mayoría de pianos y de apps)'],
              ['yamaha', 'Do3', 'Yamaha, Casio y otros'],
            ] as const satisfies readonly (readonly [OctaveNaming, string, string])[]
          ).map(([id, label, help]) => (
            <label key={id} className="mipiano__option">
              <input
                type="radio"
                name="nombre-do"
                value={id}
                checked={prefs.pianoNaming === id}
                onChange={() => preferences.update({ pianoNaming: id })}
                data-testid={`piano-naming-${id}`}
              />
              <span>
                <b>{label}</b> <small>{help}</small>
              </span>
            </label>
          ))}
        </div>
        <p className="mipiano__muted" data-testid="piano-naming-example">
          Así que tu Do central se verá como <b>{name(60)}</b> en la app.
        </p>
      </section>

      <section className="mipiano__card" aria-labelledby="mipiano-prueba">
        <h2 id="mipiano-prueba" className="mipiano__title">
          3 · Probar el micrófono
        </h2>
        {!micIsInput ? (
          <p className="mipiano__muted">
            Estás tocando con MIDI o con el teclado del PC: no hace falta, esas entradas dan la nota
            exacta.
          </p>
        ) : microphone !== undefined && !connected ? (
          <div className="mipiano__mic" data-testid="mipiano-mic" role="status">
            <p>
              {status?.kind === 'permiso-denegado'
                ? 'El navegador bloqueó el micrófono.'
                : status?.kind === 'conectado'
                  ? 'Guarda silencio un momento: el micrófono mide el ruido de la sala…'
                  : 'Activa el micrófono para probar tu piano.'}
            </p>
            {status?.kind === 'conectado' ? null : (
              <GameButton onClick={() => void microphone.start()} data-testid="mipiano-activate">
                Activar micrófono
              </GameButton>
            )}
          </div>
        ) : probe.phase === 'inactiva' ? (
          <>
            <p className="mipiano__muted">
              El micrófono solo oye de {name(MIC_RANGE.low)} a {name(MIC_RANGE.high)}: por debajo,
              el altavoz casi no da graves y por encima el sonido es demasiado agudo.
              {outside.below + outside.above > 0
                ? ` En tu piano hay ${outside.below} teclas más graves y ${outside.above} más agudas que eso: para esas, usa MIDI.`
                : ''}{' '}
              Te pediré tocar varias teclas, una a una. Comparo lo que oye el micrófono con lo que
              pedí: si alguna sale una octava más arriba o abajo (por ejemplo, tocas un Mi3 y oye un
              Mi4), lo corrijo solo.
            </p>
            <div className="mipiano__actions">
              <GameButton onClick={() => setup.start(prefs.pianoKeys)} data-testid="mipiano-start">
                Empezar la prueba
              </GameButton>
            </div>
          </>
        ) : probe.phase === 'probando' && prompt !== undefined ? (
          <div className="mipiano__probe" data-testid="mipiano-probe">
            <p className="mipiano__muted">
              Nota {probe.index + 1} de {probe.notes.length}
            </p>
            <p className="mipiano__ask" data-testid="mipiano-ask">
              Toca el <b>{name(prompt)}</b>
            </p>
            <p className="mipiano__muted">
              {probe.lastHeard === null
                ? 'Pulsa la tecla y déjala sonar un momento.'
                : `Lo último que oí: ${name(probe.lastHeard)}`}
            </p>
            {silent ? (
              <p className="mipiano__warn" role="status" data-testid="mipiano-silent">
                No oigo esa tecla. Prueba a tocarla más fuerte y más cerca del micrófono; si no
                suena (o es de las más graves o agudas), sáltala: así sabremos hasta dónde llega el
                micrófono.
              </p>
            ) : null}
            <div className="mipiano__actions">
              <GameButton
                variant="secondary"
                onClick={() => setup.skip()}
                data-testid="mipiano-skip"
              >
                Saltar esta nota
              </GameButton>
              <GameButton variant="secondary" onClick={() => setup.stop()}>
                Cancelar
              </GameButton>
            </div>
          </div>
        ) : (
          <div data-testid="mipiano-result">
            <p className="mipiano__headline">
              {summary.heard === 0
                ? 'No oí ninguna nota: prueba más cerca del piano y sin ruido.'
                : fixes.length === 0 && summary.ok === summary.heard
                  ? `El micrófono lee bien tu piano (${summary.ok} de ${summary.heard} notas).`
                  : fixes.length > 0
                    ? `${fixes.length} ${fixes.length === 1 ? 'nota sale' : 'notas salen'} en otra octava: se puede corregir.`
                    : `${summary.ok} de ${summary.heard} notas bien; las demás se leen como otra nota.`}
            </p>
            <table className="mipiano__table">
              <thead>
                <tr>
                  <th scope="col">Toqué</th>
                  <th scope="col">Oyó</th>
                  <th scope="col">Resultado</th>
                </tr>
              </thead>
              <tbody>
                {probe.results.map((result) => {
                  const kind =
                    result.detected === null ? null : probeKind(result.expected, result.detected);
                  return (
                    <tr key={result.expected} data-kind={kind ?? 'saltada'}>
                      <td>{name(result.expected)}</td>
                      <td>{result.detected === null ? '—' : name(result.detected)}</td>
                      <td>{kind === null ? 'no se oyó' : KIND_TEXT[kind]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <div className="mipiano__actions">
              {fixes.length > 0 ? (
                <GameButton
                  onClick={() => preferences.update({ micFixes: fixes })}
                  data-testid="mipiano-save"
                >
                  Corregir esas notas
                </GameButton>
              ) : null}
              <GameButton
                variant="secondary"
                onClick={() => setup.start(prefs.pianoKeys)}
                data-testid="mipiano-again"
              >
                Repetir la prueba
              </GameButton>
            </div>
          </div>
        )}
        {prefs.micFixes.length > 0 ? (
          <p className="mipiano__saved" data-testid="mipiano-saved">
            Corrección guardada para {prefs.micFixes.length}{' '}
            {prefs.micFixes.length === 1 ? 'zona' : 'zonas'} del teclado.{' '}
            <button
              type="button"
              className="link-button"
              onClick={() => preferences.update({ micFixes: [] })}
              data-testid="mipiano-clear"
            >
              Quitar la corrección
            </button>
          </p>
        ) : null}
      </section>
    </div>
  );
}
