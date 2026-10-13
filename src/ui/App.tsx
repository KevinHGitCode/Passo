import { noteName, pitchName } from '@/core/domain/note';
import type { Midi } from '@/core/domain/note';
import { PianoKeyboard } from './keyboard/piano-keyboard';
import type { KeyVisual } from './keyboard/piano-keyboard';
import { useTheme } from './theme/use-theme';

const RANGE_FROM = 48; // Do3
const RANGE_TO = 84; // Do6

const DEMO: ReadonlyMap<Midi, KeyVisual> = new Map([[64, { target: true }]]);

function label(midi: Midi): string {
  return midi % 12 === 0 ? noteName(midi, 'latina') : pitchName(midi, 'latina');
}

export function App() {
  const [theme, cycleTheme] = useTheme();
  return (
    <main style={{ maxWidth: 1100, margin: '0 auto', padding: 16 }}>
      <h1>Passo</h1>
      <button type="button" onClick={cycleTheme}>
        Tema: {theme}
      </button>
      <PianoKeyboard
        from={RANGE_FROM}
        to={RANGE_TO}
        visuals={DEMO}
        labelFor={label}
        ariaLabel="Teclado de piano de Do3 a Do6"
      />
    </main>
  );
}
