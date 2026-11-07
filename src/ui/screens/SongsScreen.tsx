import { SONGS, STYLE_LABELS } from '@/core/domain/songs';
import type { Song } from '@/core/domain/songs';
import { hrefOf, songRoute } from '../router/routes';
import './songs.css';

/** Lo que dura la canción entera a velocidad normal, en minutos y segundos aproximados. */
function durationText(song: Song): string {
  const beats = song.steps.reduce((sum, step) => sum + step.beats, 0);
  const seconds = Math.round((beats * 60) / song.bpm);
  return seconds < 60 ? `${seconds} s` : `${Math.floor(seconds / 60)} min ${seconds % 60} s`;
}

/** La lista de canciones de guitarra: melodías (notas sueltas) y rasgueos (acordes). */
export function SongsScreen() {
  return (
    <div className="songs" data-testid="songs">
      <h1 id="canciones-titulo" tabIndex={-1} data-route-heading>
        Canciones
      </h1>
      <p className="songs__lead">
        Toca la canción paso a paso: la app espera a cada nota o acorde y te dice si vas a tiempo,
        lento o rápido.
      </p>
      <ul className="songs__list">
        {SONGS.map((song) => (
          <li key={song.id} className="songs__card" data-style={song.style}>
            <p className="songs__style">{STYLE_LABELS[song.style]}</p>
            <h2 className="songs__title">{song.title}</h2>
            <p className="songs__summary">{song.summary}</p>
            <p className="songs__meta">
              {song.steps.length} {song.style === 'melodia' ? 'notas' : 'acordes'} · {song.bpm}{' '}
              pulsos por minuto · {durationText(song)}
            </p>
            <a
              className="songs__play"
              href={hrefOf(songRoute(song.id))}
              data-testid={`song-${song.id}`}
            >
              Tocar
            </a>
          </li>
        ))}
      </ul>
      <p className="songs__note">
        Los rasgueos miden el tiempo del cambio de acorde; todavía no comprueban que el acorde sea
        el correcto.
      </p>
    </div>
  );
}
