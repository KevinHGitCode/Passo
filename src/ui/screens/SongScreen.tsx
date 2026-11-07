import { useEffect, useSyncExternalStore } from 'react';
import type { SongService, SongSnapshot } from '@/core/application/song-service';
import { noteLabel } from '@/core/domain/instrument';
import type { NotationMode } from '@/core/domain/note';
import { PACE_MARK, SPEEDS, findSong, formatSeconds, stepMs, summarize } from '@/core/domain/songs';
import type { Song, SongStep } from '@/core/domain/songs';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { GameButton, GameLink } from '../game/GameButton';
import { useInputStatus, useMonitor } from '../practice/hooks';
import { hrefOf, CANCIONES } from '../router/routes';
import './songs.css';

/** Una tablatura mínima: las seis cuerdas (la 1 arriba) con el traste en la cuerda que toca. */
function Tab({ string, fret }: { readonly string: number; readonly fret: number }) {
  const y = (s: number) => 8 + (s - 1) * 14;
  return (
    <svg
      className="song__tab"
      viewBox="0 0 120 86"
      role="img"
      aria-label={`Cuerda ${string}, traste ${fret}`}
    >
      {[1, 2, 3, 4, 5, 6].map((s) => (
        <line key={s} x1="6" x2="114" y1={y(s)} y2={y(s)} className="song__tab-line" />
      ))}
      <circle cx="60" cy={y(string)} r="9" className="song__tab-dot" />
      <text x="60" y={y(string) + 4} textAnchor="middle" className="song__tab-fret">
        {fret}
      </text>
    </svg>
  );
}

function StepCard({
  step,
  notation,
}: {
  readonly step: SongStep;
  readonly notation: NotationMode;
}) {
  if (step.kind === 'nota') {
    return (
      <div className="song__now" data-kind="nota" data-testid="song-now">
        {step.lyric ? <p className="song__lyric">{step.lyric}</p> : null}
        <p className="song__big">{noteLabel(step.midi, notation, 'guitarra')}</p>
        <p className="song__how">
          Cuerda {step.string} · {step.fret === 0 ? 'al aire' : `traste ${step.fret}`}
        </p>
        <Tab string={step.string} fret={step.fret} />
      </div>
    );
  }
  return (
    <div className="song__now" data-kind="acorde" data-testid="song-now">
      <p className="song__lyric">{step.lyric}</p>
      <p className="song__big">{step.chord}</p>
      <p className="song__strum">
        Rasguea: <b>{step.strum}</b>
      </p>
      <p className="song__how">{step.shape}</p>
    </div>
  );
}

/** «Escuchar la canción»: la hace sonar entera a la velocidad elegida (no mientras se toca). */
function PreviewButton({
  songs,
  snapshot,
}: {
  readonly songs: SongService;
  readonly snapshot: SongSnapshot;
}) {
  if (!songs.canPreview() || snapshot.phase === 'tocando') return null;
  return (
    <GameButton
      variant="secondary"
      onClick={() => (snapshot.previewing ? songs.stopPreview() : songs.preview())}
      data-testid="song-preview"
      data-playing={snapshot.previewing}
    >
      {snapshot.previewing ? 'Detener' : 'Escuchar la canción'}
    </GameButton>
  );
}

function Strip({ song, snapshot }: { readonly song: Song; readonly snapshot: SongSnapshot }) {
  return (
    <ol className="song__strip" aria-label="Los pasos de la canción">
      {song.steps.map((step, index) => {
        const result = snapshot.results[index];
        const state =
          snapshot.phase === 'terminada' || index < snapshot.index
            ? 'hecho'
            : index === snapshot.index
              ? 'actual'
              : 'pendiente';
        return (
          <li
            key={index}
            className="song__chip"
            data-state={state}
            data-playing={snapshot.previewIndex === index}
            data-pace={result?.pace ?? 'ninguno'}
            aria-current={state === 'actual' ? 'step' : undefined}
          >
            <span className="song__chip-name">
              {step.kind === 'nota' ? noteLabel(step.midi, 'latina', 'guitarra') : step.chord}
            </span>
            {result ? <span className="song__chip-mark">{PACE_MARK[result.pace]}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

function Summary({
  song,
  snapshot,
  songs,
}: {
  readonly song: Song;
  readonly snapshot: SongSnapshot;
  readonly songs: SongService;
}) {
  const summary = summarize(snapshot.results);
  const name = (index: number): string => {
    const step = song.steps[index];
    if (!step) return '';
    const previous = song.steps[index - 1];
    return step.kind === 'acorde'
      ? `${previous?.kind === 'acorde' ? `${previous.chord} → ` : ''}${step.chord}`
      : `${step.lyric.trim() || noteLabel(step.midi, 'latina', 'guitarra')}`;
  };
  return (
    <section
      className="song__summary"
      data-testid="song-summary"
      aria-labelledby="song-summary-title"
    >
      <h2 id="song-summary-title" className="song__summary-title">
        {summary.suggestSlower ? 'Terminaste: ve más despacio' : '¡Terminaste la canción!'}
      </h2>
      <p>
        {summary.onTime} de {summary.total} pasos a tiempo · {summary.slow} lentos · {summary.fast}{' '}
        rápidos.
      </p>
      {summary.slowest.length > 0 ? (
        <>
          <p>Lo que más te costó:</p>
          <ul>
            {summary.slowest.map((item) => (
              <li key={item.index}>
                {name(item.index)}: {formatSeconds(item.deltaMs)} más de lo esperado
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {summary.suggestSlower ? (
        <p>Prueba con una velocidad más lenta y ve subiéndola cuando salgan a tiempo.</p>
      ) : null}
      <div className="song__actions">
        <GameButton onClick={() => songs.restart()} data-testid="song-again">
          Tocar de nuevo
        </GameButton>
        <GameLink variant="secondary" href={hrefOf(CANCIONES)} data-testid="song-back">
          Ver canciones
        </GameLink>
      </div>
    </section>
  );
}

/** Una canción: lo que toca ahora, cuánto debería tardar y cómo vas de tiempo. */
export function SongScreen({
  songId,
  songs,
  microphone,
  notation,
}: {
  readonly songId: string;
  readonly songs: SongService;
  readonly microphone: (NoteInput & InputMonitor) | undefined;
  readonly notation: NotationMode;
}) {
  const song = findSong(songId);
  const snapshot = useSyncExternalStore(songs.subscribe, songs.getSnapshot);
  const status = useInputStatus(microphone);
  const monitor = useMonitor(microphone);

  useEffect(() => {
    if (!song) return;
    songs.open(song);
    return () => songs.close();
  }, [songs, song]);

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
    <h1 id="cancion-titulo" tabIndex={-1} data-route-heading>
      {song.title}
    </h1>
  );

  // El micrófono nunca arranca solo: sin él no hay nada que seguir, así que solo se ofrece activarlo.
  if (microphone !== undefined && (status === null || status.kind !== 'conectado')) {
    const denied = status?.kind === 'permiso-denegado';
    return (
      <div className="songs song" data-testid="song">
        {heading}
        <section className="songs__card song__mic" data-testid="song-mic" role="status">
          <p>
            {denied
              ? 'El navegador bloqueó el micrófono.'
              : status?.kind === 'iniciando'
                ? 'Esperando tu permiso…'
                : 'Activa el micrófono para que te oiga tocar.'}
          </p>
          <GameButton onClick={() => void microphone.start()} data-testid="song-activate">
            Activar micrófono
          </GameButton>
        </section>
        <section className="songs__card song__mic" aria-label="Escuchar la canción">
          <p>¿Quieres oír cómo suena antes de tocarla?</p>
          <PreviewButton songs={songs} snapshot={snapshot} />
          {snapshot.previewing ? (
            <p className="song__previewing" role="status">
              Escuchando… paso {(snapshot.previewIndex ?? 0) + 1} de {song.steps.length}
            </p>
          ) : null}
        </section>
      </div>
    );
  }

  // Al escuchar la canción, la tarjeta sigue el paso que suena.
  const step = song.steps[snapshot.previewIndex ?? snapshot.index];
  const total = song.steps.length;
  const finished = snapshot.phase === 'terminada';
  const previous = song.steps[snapshot.index - 1];
  const upcoming = song.steps[snapshot.index + 1];

  return (
    <div className="songs song" data-testid="song" data-phase={snapshot.phase}>
      {heading}
      {microphone !== undefined && monitor.phase !== 'escuchando' ? (
        <p className="song__calibrating" role="status" data-testid="song-calibrating">
          Guarda silencio un momento: el micrófono mide el ruido de la sala…
        </p>
      ) : null}
      <p className="songs__lead">
        {snapshot.previewing
          ? `Escuchando la canción… paso ${(snapshot.previewIndex ?? 0) + 1} de ${total}`
          : snapshot.phase === 'listo'
            ? 'Toca el primer paso cuando quieras: el tiempo empieza a contar desde ahí.'
            : finished
              ? 'Se acabó la canción.'
              : `Paso ${snapshot.index + 1} de ${total}`}
      </p>

      {snapshot.phase === 'listo' ? (
        <div className="song__speed" role="radiogroup" aria-label="Velocidad">
          {SPEEDS.map((speed) => (
            <label key={speed.id} className="song__speed-option">
              <input
                type="radio"
                name="velocidad"
                value={speed.id}
                checked={snapshot.speed === speed.id}
                onChange={() => songs.setSpeed(speed.id)}
                data-testid={`song-speed-${speed.id}`}
              />
              <span>
                {speed.label} ({Math.round(song.bpm * speed.factor)} pulsos/min)
              </span>
            </label>
          ))}
        </div>
      ) : null}

      {finished && !snapshot.previewing ? (
        <Summary song={song} snapshot={snapshot} songs={songs} />
      ) : step ? (
        <>
          <StepCard step={step} notation={notation} />
          {snapshot.idealMs !== null && previous && !snapshot.previewing ? (
            <div className="song__ideal" data-testid="song-ideal">
              <span className="song__ideal-label">
                Tiempo ideal: {formatSeconds(stepMs(song, previous, snapshot.speed))}
              </span>
              <span
                key={snapshot.turn}
                className="song__ideal-bar"
                style={{ '--ideal': `${snapshot.idealMs}ms` } as React.CSSProperties}
                aria-hidden="true"
              />
            </div>
          ) : null}
          {snapshot.wrong !== null ? (
            <p className="song__wrong" role="status" data-testid="song-wrong">
              Oí {noteLabel(snapshot.wrong, notation, 'guitarra')} y buscaba{' '}
              {step.kind === 'nota' ? noteLabel(step.midi, notation, 'guitarra') : step.chord}.
            </p>
          ) : null}
          {upcoming ? (
            <p className="song__next">
              Sigue:{' '}
              <b>
                {upcoming.kind === 'nota'
                  ? noteLabel(upcoming.midi, notation, 'guitarra')
                  : upcoming.chord}
              </b>
            </p>
          ) : null}
        </>
      ) : null}

      <p
        className="song__feedback"
        data-pace={snapshot.feedback?.pace ?? 'ninguno'}
        data-testid="song-feedback"
        role="status"
      >
        {snapshot.feedback ? snapshot.feedback.text : ''}
      </p>

      <PreviewButton songs={songs} snapshot={snapshot} />
      <Strip song={song} snapshot={snapshot} />
    </div>
  );
}
