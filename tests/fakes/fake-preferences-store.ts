import type { Preferences } from '@/core/domain/preferences';
import type { PreferencesStore } from '@/core/ports/preferences-store';

export class FakePreferencesStore implements PreferencesStore {
  stored: unknown;
  readonly saves: Preferences[] = [];

  constructor(stored: unknown = null) {
    this.stored = stored;
  }

  load(): unknown {
    return this.stored;
  }

  save(preferences: Preferences): void {
    this.stored = preferences;
    this.saves.push(preferences);
  }
}
