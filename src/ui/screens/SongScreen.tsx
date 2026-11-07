import { useEffect, useState, useSyncExternalStore } from 'react';
import type { SongService, SongSnapshot } from '@/core/application/song-service';
import { noteLabel } from '@/core/domain/instrument';
import { noteValueOf, noteValueText } from '@/core/domain/score';
import type { NotationMode } from '@/core/domain/note';
import {
  PACE_MARK,
  SPEEDS,
  expectedStrokes,
  findSong,
  formatSeconds,
  stepMs,
  summarize,
} from '@/core/domain/songs';
import type { Song, SongStep } from '@/core/domain/songs';
import type { InputMonitor } from '@/core/ports/input-monitor';
import type { NoteInput } from '@/core/ports/note-input';
import { GameButton, GameLink } from '../game/GameButton';
import { useInputStatus, useMonitor } from '../practice/hooks';
import { hrefOf, CANCIONES } from '../router/routes';
import { Score } from './Score';
import './songs.css';

type View = 'sencilla' | 'partitura';

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
  showValue,
}: {
  readonly step: SongStep;
  readonly notation: NotationMode;
  readonly showValue: boolean;
}) {
  const value = showValue ? (
    <p className="song__value" data-testid="song-value">
      {noteValueText(noteValueOf(step.beats))}
    </p>
  ) : null;
  if (step.kind === 'nota') {
    return (
      <div className="song__now" data-kind="nota" data-testid="song-now">
        {step.lyric ? <p className="song__lyric">{step.lyric}</p> : null}
        <p className="song__big">{noteLabel(step.midi, notation, 'guitarra')}</p>
        <p className="song__how">
          Cuerda {step.string} · {step.fret === 0 ? 'al aire' : `traste ${step.fret}`}
        </p>
        {value}
        {showValue ? null : <Tab string={step.string} fret={step.fret} />}
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
      {value}
      <p className="song__how">{step.shape}</p>
    </div>
  );
}

/**
 * Los golpes del rasgueo de este compás: cada flecha que toca, y debajo cómo va lo que tocas (✓ en su sitio,
 * ✗ si la dirección no era, un punto si aún no llega).
 */
function StrokeRow({
  song,
  step,
  snapshot,
}: {
  readonly song: Song;
  readonly step: Extract<SongStep, { kind: 'acorde' }>;
  readonly snapshot: SongSnapshot;
}) {
  const expected = expectedStrokes(step, stepMs(song, step, snapshot.speed));
  const played = snapshot.live?.strokes ?? [];
  return (
    <ol className="song__strokes" aria-label="Golpes del rasgueo" data-testid="song-strokes">
      {expected.map((stroke, index) => {
        const got = played[index];
        const state = !got
          ? 'pendiente'
          : got.direction === null || got.direction === stroke.direction
            ? 'bien'
            : 'mal';
        return (
          <li key={index} data-state={state}>
            <span className="song__stroke-want">{stroke.direction === 'abajo' ? '↓' : '↑'}</span>
            <span className="song__stroke-got" aria-hidden="true">
              {!got ? '·' : state === 'bien' ? '✓' : '✗'}
            </span>
            <span className="sr-only">
              {state === 'pendiente' ? 'falta' : state === 'bien' ? 'bien' : 'dirección distinta'}
            </span>
          </li>
        );
      })}
    </ol>
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
            {snapshot.bars[index] ? (
              <span className="song__chip-bar" data-testid={`song-bar-${index}`}>
                {snapshot.bars[index]?.judgement.ok}/{snapshot.bars[index]?.judgement.total}{' '}
                {snapshot.bars[index]?.chord?.status === 'bien' ? '✓' : '✗'}
              </span>
            ) : null}
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
  const reports = snapshot.bars.flatMap((report) => (report ? [report] : []));
  const rasgueo = {
    bars: reports.length,
    strokes: reports.reduce((sum, report) => sum + report.judgement.total, 0),
    strokesOk: reports.reduce((sum, report) => sum + report.judgement.ok, 0),
    chordsOk: reports.filter((report) => report.chord?.status === 'bien').length,
  };
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
      {rasgueo.bars > 0 ? (
        <p data-testid="song-rasgueo-summary">
          Rasgueo: {rasgueo.strokesOk} de {rasgueo.strokes} golpes bien · acorde correcto en{' '}
          {rasgueo.chordsOk} de {rasgueo.bars} compases.
        </p>
      ) : null}
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
  const [view, setView] = useState<View>('sencilla');
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

      <div className="song__speed" role="radiogroup" aria-label="Vista">
        {(
          [
            ['sencilla', 'Vista sencilla'],
            ['partitura', 'Partitura y tablatura'],
          ] as const
        ).map(([id, label]) => (
          <label key={id} className="song__speed-option">
            <input
              type="radio"
              name="vista"
              value={id}
              checked={view === id}
              onChange={() => setView(id)}
              data-testid={`song-view-${id}`}
            />
            <span>{label}</span>
          </label>
        ))}
      </div>

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
          <StepCard step={step} notation={notation} showValue={view === 'partitura'} />
          {step.kind === 'acorde' ? (
            <StrokeRow song={song} step={step} snapshot={snapshot} />
          ) : null}
          {view === 'partitura' ? (
            <>
              <Score song={song} current={snapshot.previewIndex ?? snapshot.index} />
              <details className="song__howto">
                <summary>Cómo leer la partitura</summary>
                <p>
                  Arriba va el <b>pentagrama</b> (cinco líneas) con la clave de Sol y los{' '}
                  <b>compases</b> separados por rayas. La nota más abajo suena más grave. Cuanto más
                  corta la figura, más «adornos»: la <b>redonda</b> es hueca y sin palito (4
                  pulsos), la <b>blanca</b> hueca con palito (2), la <b>negra</b> llena (1), la{' '}
                  <b>corchea</b> lleva un corchete (½) y la <b>semicorchea</b> dos (¼). Un punto a
                  su lado suma la mitad.
                </p>
                <p>
                  Abajo va la <b>tablatura</b>: cada línea es una cuerda (la de arriba, la 1) y el
                  número es el traste. La guitarra se escribe una octava más aguda de como suena.
                </p>
              </details>
            </>
          ) : null}
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
