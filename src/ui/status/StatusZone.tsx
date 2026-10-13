import { useSyncExternalStore } from 'react';
import type { AudioControl } from '@/core/ports/audio-control';
import type { NoteInput } from '@/core/ports/note-input';
import { describeAudioStatus, describeInputStatus } from './describe-status';
import type { StatusView } from './describe-status';

export interface StatusZoneProps {
  readonly inputs: readonly NoteInput[];
  readonly audio: AudioControl;
}

function StatusRow({
  view,
  onAction,
  testId,
}: {
  readonly view: StatusView;
  readonly onAction?: () => void;
  readonly testId: string;
}) {
  return (
    <div className={`status status--${view.tone}`} data-testid={testId} data-tone={view.tone}>
      <span className="status__dot" aria-hidden="true" />
      <p className="status__text">
        <strong>{view.title}</strong> · {view.text}
      </p>
      {view.action && onAction && (
        <button type="button" className="button" onClick={onAction}>
          {view.action.label}
        </button>
      )}
    </div>
  );
}

function InputStatusRow({ input }: { readonly input: NoteInput }) {
  const status = useSyncExternalStore(
    (onChange) => input.subscribeStatus(onChange),
    () => input.getStatus(),
  );
  const view = describeInputStatus(input.source, status);
  return (
    <StatusRow view={view} testId={`status-${input.source}`} onAction={() => void input.start()} />
  );
}

function AudioStatusRow({ audio }: { readonly audio: AudioControl }) {
  const status = useSyncExternalStore(
    (onChange) => audio.subscribeStatus(onChange),
    () => audio.getStatus(),
  );
  return (
    <StatusRow
      view={describeAudioStatus(status)}
      testId="status-audio"
      onAction={() => void audio.unlock()}
    />
  );
}

/** Zona de estado fija bajo la cabecera: entradas conectadas y sonido. No es modal. */
export function StatusZone({ inputs, audio }: StatusZoneProps) {
  return (
    <div className="status-zone" role="region" aria-label="Estado de conexión" aria-live="polite">
      {inputs.map((input) => (
        <InputStatusRow key={input.source} input={input} />
      ))}
      <AudioStatusRow audio={audio} />
    </div>
  );
}
