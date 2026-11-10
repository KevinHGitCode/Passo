import { useEffect, useState, useSyncExternalStore } from 'react';
import type { ChordMode, ChordsService, ChordsSnapshot } from '@/core/application/chords-service';
import {
  DETUNED_CENTS,
  chordClasses,
  chordSpanish,
  chordSymbol,
  pitchClassName,
} from '@/core/domain/chords';
import type { ChordMatch, NoteDiagnosis } from '@/core/domain/chords';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { GameButton } from '../game/GameButton';
import { useInputStatus, useMonitor } from '../practice/hooks';
import './chords.css';
import { PageHeader } from '../shell/PageHeader';

const classNames = (classes: readonly number[]): string =>
  classes.map((pc) => pitchClassName(pc)).join(', ');

/** Cuánto se parece lo que suena al acorde, dicho con palabras. */
function confidenceOf(score: number): { label: string; level: 'alta' | 'media' | 'baja' } {
  if (score >= 0.85) return { label: 'Seguro', level: 'alta' };
  if (score >= 0.65) return { label: 'Parece', level: 'media' };
  return { label: 'Dudoso', level: 'baja' };
}

function MatchCard({
  match,
  others,
}: {
  readonly match: ChordMatch;
  readonly others: readonly ChordMatch[];
}) {
  const confidence = confidenceOf(match.score);
  return (
    <section className="chords__result" data-level={confidence.level} data-testid="chord-result">
      <p className="chords__confidence">{confidence.label}</p>
      <p className="chords__symbol" data-testid="chord-symbol">
        {chordSymbol(match.chord)}
      </p>
      <p className="chords__name" data-testid="chord-name">
        {chordSpanish(match.chord)}
      </p>
      <p className="chords__tones">Notas del acorde: {classNames(chordClasses(match.chord))}</p>
      {match.missing.length > 0 ? (
        <p className="chords__warn" data-testid="chord-missing">
          No oigo: {classNames(match.missing)}
        </p>
      ) : null}
      {match.extra.length > 0 ? (
        <p className="chords__warn" data-testid="chord-extra">
          Suena de más: {classNames(match.extra)} (¿una cuerda mal puesta o desafinada?)
        </p>
      ) : null}
      {others.length > 0 ? (
        <p className="chords__also">
          También podría ser: {others.map((item) => chordSymbol(item.chord)).join(' · ')}
        </p>
      ) : null}
    </section>
  );
}

const ARROW = { abajo: '↓', arriba: '↑' } as const;

function Strokes({ snapshot }: { readonly snapshot: ChordsSnapshot }) {
  const down = snapshot.strokes.filter((stroke) => stroke.direction === 'abajo').length;
  const up = snapshot.strokes.filter((stroke) => stroke.direction === 'arriba').length;
  return (
    <section className="chords__strokes" aria-label="Golpes del rasgueo">
      <p className="chords__label">Tus golpes</p>
      <ol className="chords__arrows" data-testid="chord-strokes">
        {snapshot.strokes.length === 0 ? (
          <li className="chords__muted">Rasguea el acorde: aquí verás cada golpe.</li>
        ) : (
          snapshot.strokes.map((stroke) => (
            <li key={stroke.id} data-direction={stroke.direction ?? 'incierto'}>
              <span aria-hidden="true">{stroke.direction ? ARROW[stroke.direction] : '·'}</span>
              <span className="sr-only">
                {stroke.direction === 'abajo'
                  ? 'hacia abajo'
                  : stroke.direction === 'arriba'
                    ? 'hacia arriba'
                    : 'dirección dudosa'}
              </span>
            </li>
          ))
        )}
      </ol>
      {snapshot.strokes.length > 0 ? (
        <p className="chords__muted">
          {snapshot.strokes.length} golpes: ↓ {down} · ↑ {up}
        </p>
      ) : null}
    </section>
  );
}

function PlayedNotes({ played }: { readonly played: readonly NoteDiagnosis[] }) {
  if (played.length === 0) {
    return (
      <p className="chords__muted" data-testid="chord-played-empty">
        Toca una cuerda y déjala sonar. Luego la siguiente, de la 6 a la 1.
      </p>
    );
  }
  return (
    <ol className="chords__played" data-testid="chord-played">
      {played.map((item, index) => {
        const cents = Math.round(item.note.cents);
        const text =
          item.status === 'bien'
            ? '✓ bien'
            : item.status === 'desafinada'
              ? cents < 0
                ? `↓ baja (${cents} cents): sube la cuerda`
                : `↑ alta (+${cents} cents): baja la cuerda`
              : item.maybe === null
                ? '✗ no es del acorde'
                : `✗ no es del acorde: ¿es ${pitchClassName(item.maybe)} desafinada?`;
        return (
          <li key={index} data-status={item.status}>
            <span className="chords__pitch">{pitchClassName(item.note.midi)}</span>
            <span className="chords__cents">
              {cents > 0 ? '+' : ''}
              {cents} cents
            </span>
            <span className="chords__status">{text}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Reconocer el acorde que se toca: de un rasgueo completo o cuerda por cuerda. */
export function ChordsScreen({
  chords,
  microphone,
}: {
  readonly chords: ChordsService;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
}) {
  const snapshot = useSyncExternalStore(chords.subscribe, chords.getSnapshot);
  const status = useInputStatus(microphone);
  const monitor = useMonitor(microphone);
  const [mode, setMode] = useState<ChordMode>('rasgueo');

  useEffect(() => {
    chords.open(mode);
    return () => chords.close();
    // El modo se cambia con `setMode` (sin reabrir), así que aquí solo cuenta abrir y cerrar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chords]);

  const heading = (
    <PageHeader
      id="acordes-titulo"
      title="Acordes"
      lead="Toca un acorde y te digo cuál es. Elige cómo lo vas a tocar:"
    />
  );

  // El micrófono nunca arranca solo: sin él no hay nada que oír, así que solo se ofrece activarlo.
  if (microphone !== undefined && (status === null || status.kind !== 'conectado')) {
    return (
      <div className="chords" data-testid="chords">
        {heading}
        <section className="chords__card chords__mic" data-testid="chords-mic" role="status">
          <p>
            {status?.kind === 'permiso-denegado'
              ? 'El navegador bloqueó el micrófono.'
              : status?.kind === 'iniciando'
                ? 'Esperando tu permiso…'
                : 'Activa el micrófono para que te oiga tocar.'}
          </p>
          <GameButton onClick={() => void microphone.start()} data-testid="chords-activate">
            Activar micrófono
          </GameButton>
        </section>
      </div>
    );
  }

  const top = snapshot.matches[0];
  const choose = (next: ChordMode) => {
    setMode(next);
    chords.setMode(next);
  };

  return (
    <div className="chords" data-testid="chords" data-mode={snapshot.mode}>
      {heading}
      <div className="chords__modes" role="radiogroup" aria-label="Cómo tocas el acorde">
        {(
          [
            ['rasgueo', 'Rasgueo completo', 'Todas las cuerdas de un golpe'],
            ['cuerda', 'Cuerda por cuerda', 'Una a una, para ver si alguna está desafinada'],
          ] as const
        ).map(([id, label, help]) => (
          <label key={id} className="chords__mode">
            <input
              type="radio"
              name="modo-acorde"
              value={id}
              checked={mode === id}
              onChange={() => choose(id)}
              data-testid={`chords-mode-${id}`}
            />
            <span>
              <b>{label}</b>
              <small>{help}</small>
            </span>
          </label>
        ))}
      </div>

      {monitor.phase !== 'escuchando' && microphone !== undefined ? (
        <p className="chords__calibrating" role="status" data-testid="chords-calibrating">
          Guarda silencio un momento: el micrófono mide el ruido de la sala…
        </p>
      ) : null}

      {top ? (
        <MatchCard match={top} others={snapshot.matches.slice(1)} />
      ) : (
        <section className="chords__result chords__result--empty" data-testid="chord-empty">
          <p className="chords__symbol">—</p>
          <p className="chords__name">
            {snapshot.mode === 'rasgueo'
              ? 'Rasguea el acorde de arriba abajo y déjalo sonar.'
              : 'Toca al menos dos cuerdas para que pueda emparejarlas.'}
          </p>
        </section>
      )}

      {snapshot.muddy ? (
        <p className="chords__muted" role="status">
          Ese golpe se mezcló con otro: para saber el acorde, rasguea y déjalo sonar un momento.
        </p>
      ) : null}

      {snapshot.mode === 'rasgueo' ? (
        <>
          <Strokes snapshot={snapshot} />
          {snapshot.heard.length > 0 ? (
            <p className="chords__heard" data-testid="chord-heard">
              Oigo:{' '}
              {classNames([...new Set(snapshot.heard.map((note) => ((note.midi % 12) + 12) % 12))])}
            </p>
          ) : null}
        </>
      ) : (
        <section aria-label="Notas tocadas">
          <p className="chords__label">Tus cuerdas (más de {DETUNED_CENTS} cents = desafinada)</p>
          <PlayedNotes played={snapshot.played} />
        </section>
      )}

      <div className="chords__actions">
        <GameButton variant="secondary" onClick={() => chords.clear()} data-testid="chords-clear">
          Borrar y empezar otro
        </GameButton>
      </div>
      <p className="chords__note">
        Reconozco acordes mayores, menores, de séptima, suspendidos y disminuidos. Con el micrófono
        de un portátil las cuerdas graves pueden llegar flojas: si el acorde no sale, prueba más
        cerca y sin ruido.
      </p>
    </div>
  );
}
