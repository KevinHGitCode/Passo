import { useEffect, useState, useSyncExternalStore } from 'react';
import { PIANO_SPEEDS } from '@/core/application/piano-song-service';
import type { PianoMode, PianoSongService } from '@/core/application/piano-song-service';
import { isBlackKey, noteName } from '@/core/domain/note';
import type { Midi, NotationMode } from '@/core/domain/note';
import { findPianoSong, songRange } from '@/core/domain/piano-songs';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { GameButton, GameLink } from '../game/GameButton';
import { FALL_HEIGHT, FallingNotes } from '../keyboard/falling-notes';
import { PianoKeyboard } from '../keyboard/piano-keyboard';
import type { KeyVisual } from '../keyboard/piano-keyboard';
import { useInputStatus, useMonitor } from '../practice/hooks';
import { CANCIONES, hrefOf } from '../router/routes';
import './songs.css';
import { PageHeader } from '../shell/PageHeader';

/** La tecla blanca más cercana (hacia abajo o hacia arriba) para que el teclado empiece y acabe en una. */
const whiteBelow = (midi: Midi): Midi => (isBlackKey(midi) ? midi - 1 : midi);
const whiteAbove = (midi: Midi): Midi => (isBlackKey(midi) ? midi + 1 : midi);

/** Una canción de piano: las notas caen sobre el teclado y se tocan esperando o a tempo. */
export function PianoSongScreen({
  songId,
  piano,
  microphone,
  needsMicrophone,
  notation,
}: {
  readonly songId: string;
  readonly piano: PianoSongService;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
  /** El micrófono es la única entrada: hay que activarlo antes de tocar. */
  readonly needsMicrophone: boolean;
  readonly notation: NotationMode;
}) {
  const song = findPianoSong(songId);
  const snapshot = useSyncExternalStore(piano.subscribe, piano.getSnapshot);
  const status = useInputStatus(microphone);
  const monitor = useMonitor(microphone);
  const [playhead, setPlayhead] = useState(0);

  useEffect(() => {
    if (!song) return;
    piano.open(song);
    return () => piano.close();
  }, [piano, song]);

  // El cabezal se mueve a cada fotograma (las notas caen con suavidad); fuera de la pantalla se para solo.
  useEffect(() => {
    let frame = 0;
    const loop = () => {
      piano.tick();
      setPlayhead(piano.playhead());
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [piano]);

  if (!song) {
    return (
      <div className="songs">
        <h1 tabIndex={-1} data-route-heading>
          Canción no encontrada
        </h1>
        <GameLink href={hrefOf(CANCIONES)}>Ver canciones</GameLink>
      </div>
    );
  }
  const heading = (
    <PageHeader
      id="cancion-titulo"
      title={song.title}
      actions={
        <a className="button button--ghost page-head__back" href={hrefOf(CANCIONES)}>
          ← Canciones
        </a>
      }
    />
  );

  if (
    needsMicrophone &&
    microphone !== undefined &&
    (status === null || status.kind !== 'conectado')
  ) {
    return (
      <div className="songs song" data-testid="song">
        {heading}
        <section className="songs__card song__mic" data-testid="song-mic" role="status">
          <p>
            {status?.kind === 'permiso-denegado'
              ? 'El navegador bloqueó el micrófono.'
              : status?.kind === 'iniciando'
                ? 'Esperando tu permiso…'
                : 'Activa el micrófono para que te oiga tocar.'}
          </p>
          <GameButton onClick={() => void microphone.start()} data-testid="song-activate">
            Activar micrófono
          </GameButton>
        </section>
      </div>
    );
  }

  const range = songRange(song);
  const from = whiteBelow(range.low - 1);
  const to = whiteAbove(range.high + 1);
  const step = song.steps[snapshot.index];
  const finished = snapshot.phase === 'terminada';
  const targets = new Set<Midi>(snapshot.phase === 'terminada' ? [] : (step?.notes ?? []));
  const visuals = new Map<Midi, KeyVisual>();
  for (const midi of targets) {
    const done = snapshot.doneNotes.includes(midi);
    visuals.set(midi, done ? { feedback: 'correct' } : { target: true });
  }
  for (const midi of snapshot.pressed) {
    visuals.set(midi, { ...visuals.get(midi), pressed: true });
  }
  const hits = snapshot.states.filter((state) => state === 'bien').length;
  const errors = snapshot.errors.flatMap((error) => (error === null ? [] : [error]));
  const meanError =
    errors.length === 0 ? 0 : errors.reduce((sum, value) => sum + value, 0) / errors.length;
  const countdown = snapshot.mode === 'tempo' && snapshot.phase === 'tocando' && playhead < 0;

  const setMode = (mode: PianoMode) => piano.setMode(mode);

  return (
    <div
      className="songs song piano-song"
      data-testid="song"
      data-phase={snapshot.phase}
      data-mode={snapshot.mode}
    >
      {heading}
      <p className="songs__lead">
        {finished
          ? 'Se acabó la canción.'
          : snapshot.phase === 'listo'
            ? snapshot.mode === 'espera'
              ? 'Toca la primera nota: las notas caen y esperan a que las toques.'
              : 'Pulsa «Empezar» y toca cada nota cuando llegue a su tecla.'
            : countdown
              ? `Empieza en ${Math.ceil(-playhead / 1000)}…`
              : step
                ? `Toca: ${step.notes.map((midi) => noteName(midi, notation)).join(' · ')}`
                : ''}
      </p>

      {microphone !== undefined && needsMicrophone && monitor.phase !== 'escuchando' ? (
        <p className="song__calibrating" role="status" data-testid="song-calibrating">
          Guarda silencio un momento: el micrófono mide el ruido de la sala…
        </p>
      ) : null}

      <div className="song__speed" role="radiogroup" aria-label="Cómo se toca">
        {(
          [
            ['espera', 'Esperar a que toques'],
            ['tempo', 'A tempo'],
          ] as const
        ).map(([id, label]) => (
          <label key={id} className="song__speed-option">
            <input
              type="radio"
              name="modo-piano"
              value={id}
              checked={snapshot.mode === id}
              onChange={() => setMode(id)}
              data-testid={`piano-mode-${id}`}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>
      {snapshot.phase === 'listo' ? (
        <div className="song__speed" role="radiogroup" aria-label="Velocidad">
          {PIANO_SPEEDS.map((speed) => (
            <label key={speed.id} className="song__speed-option">
              <input
                type="radio"
                name="velocidad-piano"
                value={speed.id}
                checked={snapshot.speed === speed.id}
                onChange={() => piano.setSpeed(speed.id)}
                data-testid={`piano-speed-${speed.id}`}
              />
              <span>
                {speed.label} ({Math.round(song.bpm * speed.factor)} pulsos/min)
              </span>
            </label>
          ))}
        </div>
      ) : null}

      <div className="keyboard-wrap piano-song__board">
        <PianoKeyboard
          from={from}
          to={to}
          visuals={visuals}
          labelFor={(midi) => (isBlackKey(midi) ? undefined : noteName(midi, notation))}
          fall={{
            height: FALL_HEIGHT,
            render: (layout) => (
              <FallingNotes
                layout={layout}
                song={song}
                speed={snapshot.speed}
                playhead={playhead}
                states={snapshot.states}
                current={snapshot.index}
                notation={notation}
              />
            ),
          }}
          ariaLabel={`Notas de ${song.title} cayendo sobre el teclado`}
        />
      </div>

      {snapshot.wrong !== null ? (
        <p className="song__wrong" role="status" data-testid="song-wrong">
          Oí {noteName(snapshot.wrong, notation)}.
        </p>
      ) : null}

      {snapshot.mode === 'tempo' && snapshot.phase === 'listo' ? (
        <div className="song__actions">
          <GameButton onClick={() => piano.start()} data-testid="piano-start">
            Empezar
          </GameButton>
        </div>
      ) : null}

      {finished ? (
        <section
          className="song__summary"
          data-testid="song-summary"
          aria-labelledby="song-summary-title"
        >
          <h2 id="song-summary-title" className="song__summary-title">
            ¡Terminaste la canción!
          </h2>
          <p>
            {hits} de {song.steps.length} pasos bien
            {snapshot.mode === 'tempo' && errors.length > 0
              ? ` · de media ${meanError < 0 ? 'te adelantas' : 'llegas'} ${Math.abs(Math.round(meanError))} ms ${meanError < 0 ? '' : 'tarde'}`.trimEnd()
              : ''}
            .
          </p>
          <div className="song__actions">
            <GameButton onClick={() => piano.restart()} data-testid="song-again">
              Tocar de nuevo
            </GameButton>
            <GameLink variant="secondary" href={hrefOf(CANCIONES)} data-testid="song-back">
              Ver canciones
            </GameLink>
          </div>
        </section>
      ) : null}
    </div>
  );
}
