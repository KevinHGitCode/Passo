import type { ListeningProfile } from '@/core/domain/listening-profile';
import type { ListeningProfileSink } from '@/core/ports/listening-profile-sink';

export class FakeListeningSink implements ListeningProfileSink {
  readonly profiles: ListeningProfile[] = [];

  setProfile(profile: ListeningProfile): void {
    this.profiles.push(profile);
  }
}
