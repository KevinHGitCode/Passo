import { useMemo, useSyncExternalStore } from 'react';
import type { InputManager } from '@/core/application/input-manager';
import type { PreferencesService } from '@/core/application/preferences-service';
import type { PlayContext } from '@/core/domain/lessons';
import type { NoteInput } from '@/core/ports/note-input';
import { useInputSelection } from '../practice/hooks';

/**
 * Con qué se puede tocar ahora: la entrada elegida (en modo de desarrollo, todas las pedidas) y si la
 * beta de varias notas del micrófono está activa. Decide qué lecciones se pueden empezar.
 */
export function usePlayContext(
  preferences: PreferencesService,
  inputManager: InputManager | undefined,
  inputs: readonly NoteInput[],
): PlayContext {
  const selected = useInputSelection(inputManager);
  const { polyphonicMic } = useSyncExternalStore(preferences.subscribe, preferences.getSnapshot);
  return useMemo(
    () => ({
      sources: selected === null ? inputs.map((input) => input.source) : [selected],
      polyphonicMic,
    }),
    [selected, inputs, polyphonicMic],
  );
}
