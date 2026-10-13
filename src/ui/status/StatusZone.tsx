import { useSyncExternalStore } from 'react';
import type { AudioControl } from '@/core/ports/audio-control';
import type { NoteInput } from '@/core/ports/note-input';
import { describeAudioStatus, describeInputStatus } from './describe-status';
import type { StatusView } from './describe-status';

export interface StatusZoneProps {
  readonly inputs: readonly NoteInput[];
  readonly audio: AudioControl;
}

/**
 * Los estados normales son "chips" compactos de una línea (no mueven la pantalla);
 * solo los avisos importantes (desconexión, permiso, sin soporte) se expanden en una fila.
 */
function StatusItem({
  view,
  onAction,
  testId,
}: {
  readonly view: StatusView;
  readonly onAction: () => void;
  readonly testId: string;
}) {
  if (view.tone === 'warn') {
    return (
      <div className="status status--warn" data-testid={testId} data-tone="warn" role="alert">
        <span className="status__dot" aria-hidden="true" />
        <p className="status__text">
          <strong>{view.title}</strong> · {view.text}
        </p>
        {view.action && (
          <button type="button" className="button" onClick={onAction}>
            {view.action.label}
          </button>
        )}
      </div>
    );
  }
  return (
    <div
      className={`chip chip--${view.tone}`}
      data-testid={testId}
      data-tone={view.tone}
      title={view.text}
    >
      <span className="status__dot" aria-hidden="true" />
      <span>{view.short}</span>
      {view.action && (
        <button type="button" className="chip__action" onClick={onAction}>
          {view.action.label}
        </button>
      )}
    </div>
  );
}

function InputStatusItem({ input }: { readonly input: NoteInput }) {
  const status = useSyncExternalStore(
    (onChange) => input.subscribeStatus(onChange),
    () => input.getStatus(),
  );
  return (
    <StatusItem
      view={describeInputStatus(input.source, status)}
      testId={`status-${input.source}`}
      onAction={() => void input.start()}
    />
  );
}

function AudioStatusItem({ audio }: { readonly audio: AudioControl }) {
  const status = useSyncExternalStore(
    (onChange) => audio.subscribeStatus(onChange),
    () => audio.getStatus(),
  );
  return (
    <StatusItem
      view={describeAudioStatus(status)}
      testId="status-audio"
      onAction={() => void audio.unlock()}
    />
  );
}

/** Zona de estado fija bajo la cabecera: entradas conectadas y sonido. No es modal. */
export function StatusZone({ inputs, audio }: StatusZoneProps) {
  return (
    <div className="status-zone" role="region" aria-label="Estado de conexión">
      {inputs.map((input) => (
        <InputStatusItem key={input.source} input={input} />
      ))}
      <AudioStatusItem audio={audio} />
    </div>
  );
}
