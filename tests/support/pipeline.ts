import { analyzeFrame } from '@/core/domain/frame-analysis';
import type { NoteEvent } from '@/core/domain/note-event';
import { NoteTracker } from '@/core/domain/note-tracker';
import type { TrackerConfig, TrackerHint, TrackerState } from '@/core/domain/note-tracker';
import { SAMPLE_RATE, streamFrames } from './synth';

export interface PipelineResult {
  /** Eventos con el instante (ms) del fotograma en el que se emitieron. */
  readonly events: readonly { event: NoteEvent; emittedAt: number }[];
  readonly hints: readonly TrackerHint[];
  readonly state: TrackerState;
  readonly tracker: NoteTracker;
}

/** Pasa una señal completa por análisis + seguimiento, como haría el micrófono. */
export function runPipeline(
  signal: Float32Array,
  config: Partial<TrackerConfig> = {},
  sampleRate = SAMPLE_RATE,
): PipelineResult {
  const tracker = new NoteTracker(config);
  const events: { event: NoteEvent; emittedAt: number }[] = [];
  const hints: TrackerHint[] = [];
  streamFrames(
    signal,
    (window, newSamples, endAt) => {
      for (const event of tracker.push(analyzeFrame(window, newSamples, sampleRate, endAt))) {
        events.push({ event, emittedAt: endAt });
      }
      const hint = tracker.getState().hint;
      if (hint && hints[hints.length - 1] !== hint) hints.push(hint);
    },
    { sampleRate },
  );
  return { events, hints, state: tracker.getState(), tracker };
}

export function onsOf(result: PipelineResult) {
  return result.events.filter((item) => item.event.type === 'on');
}
