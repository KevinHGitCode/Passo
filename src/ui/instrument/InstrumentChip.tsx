import { useCallback, useEffect, useId, useRef, useState, useSyncExternalStore } from 'react';
import type { KeyboardEvent as ReactKeyboardEvent, ReactNode } from 'react';
import { createPortal } from 'react-dom';
import type { PreferencesService } from '@/core/application/preferences-service';
import type { ProgressService } from '@/core/application/progress-service';
import { INSTRUMENTS, INSTRUMENT_LABELS } from '@/core/domain/instrument';
import type { Instrument } from '@/core/domain/instrument';
import { lessonsFor } from '@/core/domain/lessons';
import { starsOf } from '@/core/domain/progress';
import { Icon } from '../game/icons';
import { useIsNarrow } from '../practice/hooks';
import './instrument.css';

const NARROW_MAX_WIDTH = 899;

export interface InstrumentChipProps {
  /** El instrumento que se está viendo. */
  readonly instrument: Instrument;
  readonly preferences: PreferencesService;
  readonly progress: ProgressService;
  /** Se llama tras elegir otro instrumento (p. ej. para salir del afinador, que es de guitarra). */
  readonly onChosen?: (() => void) | undefined;
}

/**
 * En pantallas estrechas la hoja sale a `document.body`: el encabezado fijo crea su propia capa y, dentro de
 * ella, la hoja quedaría por debajo de la barra inferior.
 */
function Overlay({ portal, children }: { readonly portal: boolean; readonly children: ReactNode }) {
  return portal ? createPortal(children, document.body) : <>{children}</>;
}

/**
 * El instrumento actual en un solo chip que abre la lista de «Mis instrumentos». Sirve igual para dos que
 * para diez: solo crece la lista. En pantallas estrechas la lista es una hoja desde abajo (con el foco
 * atrapado); en las anchas, un menú junto al chip.
 */
export function InstrumentChip({
  instrument,
  preferences,
  progress,
  onChosen,
}: InstrumentChipProps) {
  const [open, setOpen] = useState(false);
  const [announcement, setAnnouncement] = useState('');
  const buttonRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listId = useId();
  const narrow = useIsNarrow(NARROW_MAX_WIDTH);
  const { state } = useSyncExternalStore(progress.subscribe, progress.getSnapshot);
  const stars = starsOf(state);

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) buttonRef.current?.focus({ preventScroll: true });
  }, []);

  // Al abrir, el foco va al instrumento actual.
  useEffect(() => {
    if (!open) return;
    listRef.current?.querySelector<HTMLElement>('[aria-current="true"]')?.focus();
  }, [open]);

  // Esc cierra y devuelve el foco al chip; no sigue hacia otros oyentes (ajustes, diálogos…).
  useEffect(() => {
    if (!open) return undefined;
    const onKey = (event: globalThis.KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      event.stopPropagation();
      event.preventDefault();
      close(true);
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [open, close]);

  const trapTab = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if (!narrow || event.key !== 'Tab') return;
    const focusable = Array.from(listRef.current?.querySelectorAll<HTMLElement>('button') ?? []);
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (!first || !last) return;
    if (event.shiftKey && document.activeElement === first) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
      event.preventDefault();
      first.focus();
    }
  };

  const choose = (next: Instrument) => {
    if (next !== instrument) {
      preferences.update({ instrument: next });
      setAnnouncement(`Ahora aprendes ${INSTRUMENT_LABELS[next]}`);
      onChosen?.();
    }
    close(true);
  };

  const label = INSTRUMENT_LABELS[instrument];
  return (
    <div className="inst" data-open={open}>
      <button
        type="button"
        ref={buttonRef}
        className="inst__button"
        aria-expanded={open}
        aria-controls={open ? listId : undefined}
        aria-label={`Instrumento: ${label}. Cambiar`}
        onClick={() => setOpen((value) => !value)}
        data-testid="instrument-chip"
      >
        <span className="inst__tile" aria-hidden="true">
          <Icon name={instrument === 'guitarra' ? 'guitar' : 'piano'} size={24} />
        </span>
        <span className="inst__text" aria-hidden="true">
          <span className="inst__kicker">Estás aprendiendo</span>
          <span className="inst__name">{label}</span>
        </span>
        <span className="inst__chevron" aria-hidden="true">
          <Icon name="chevron" size={20} />
        </span>
      </button>
      {open ? (
        <Overlay portal={narrow}>
          <div className="inst__backdrop" onClick={() => close(true)} aria-hidden="true" />
          <div
            id={listId}
            ref={listRef}
            className="inst__list"
            role={narrow ? 'dialog' : 'group'}
            aria-modal={narrow ? true : undefined}
            aria-label="Mis instrumentos"
            onKeyDown={trapTab}
            data-testid="instrument-list"
          >
            <h2 className="inst__title">Mis instrumentos</h2>
            {INSTRUMENTS.map((item) => {
              const lessons = lessonsFor(item);
              const done = lessons.filter((lesson) => stars(lesson.id) >= 1).length;
              const active = item === instrument;
              return (
                <button
                  key={item}
                  type="button"
                  className="inst__item"
                  data-instrument={item}
                  aria-current={active ? 'true' : undefined}
                  onClick={() => choose(item)}
                  data-testid={`instrument-${item}`}
                >
                  <span className="inst__tile" aria-hidden="true">
                    <Icon name={item === 'guitarra' ? 'guitar' : 'piano'} size={24} />
                  </span>
                  <span className="inst__text">
                    <span className="inst__name">
                      {INSTRUMENT_LABELS[item]}
                      {active ? <span className="inst__current"> · actual</span> : null}
                    </span>
                    <span className="inst__sub">
                      {done === 0 ? 'Recién empiezas' : `${done} de ${lessons.length} lecciones`}
                    </span>
                    <span className="inst__bar" aria-hidden="true">
                      <span
                        className="inst__fill"
                        style={{ width: `${Math.max(2, (done / lessons.length) * 100)}%` }}
                      />
                    </span>
                  </span>
                  {active ? (
                    <span className="inst__check" aria-hidden="true">
                      <Icon name="check" size={16} />
                    </span>
                  ) : null}
                </button>
              );
            })}
            {narrow ? (
              <button type="button" className="inst__close" onClick={() => close(true)}>
                Cerrar
              </button>
            ) : null}
          </div>
        </Overlay>
      ) : null}
      <div className="sr-only" role="status" aria-live="polite" data-testid="instrument-live">
        {announcement}
      </div>
    </div>
  );
}
