🇬🇧 English · 🇪🇸 [Español](README.es.md)

<h1 align="center">Passo</h1>

<p align="center">
  <strong>Learn piano and guitar with instant feedback.</strong><br />
  Play, and Passo listens through your microphone and tells you right away what went well and what didn't.<br />
  <em>Step by step: you don't move on until you've mastered it.</em>
</p>

<p align="center">
  <a href="https://github.com/KevinHGitCode/Passo/actions/workflows/ci.yml"><img src="https://github.com/KevinHGitCode/Passo/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
</p>

<p align="center">
  <img src="docs/img/camino.png" alt="The piano learning path: units with lessons, stars, streak, daily goal and weak spots" width="880" />
</p>

<p align="center">
  React 19 · TypeScript · Vite · Clean Architecture · Vitest · Playwright<br />
  No accounts, no cloud, no ads: everything runs and is stored in your browser.
</p>

---

## Contents

- [What it is](#what-it-is)
- [Tour with screenshots](#tour-with-screenshots)
- [What you can do today](#what-you-can-do-today)
- [Getting started](#getting-started)
- [How you play: microphone, MIDI or PC keyboard](#how-you-play-microphone-midi-or-pc-keyboard)
- [Guitar](#guitar)
- [URLs and parameters](#urls-and-parameters)
- [How it works inside](#how-it-works-inside)
- [Project structure](#project-structure)
- [Quality and testing](#quality-and-testing)
- [Status and roadmap](#status-and-roadmap)
- [Documentation](#documentation)

## What it is

People who learn from videos and courses end up playing what they already know, and nobody corrects them in the moment.
Passo does the opposite: **it shows you what to play, listens, and corrects you instantly**, and takes you
to practice exactly what you find hardest.

- **Instant feedback.** Each note is evaluated as it sounds: a hit, a miss (with "it was Sol, you played Fa,
  one key to the left"), or a microphone doubt, which doesn't count as a mistake.
- **Works with the instrument you already have.** The laptop microphone is the main input:
  you don't need a piano with USB-MIDI. Audio is analyzed on your device; **it is never recorded or sent anywhere**.
- **A game, not an exam.** A path of units and short lessons (2–4 minutes), stars,
  experience points, a daily streak and a daily goal.
- **Two instruments in one app.** Piano and guitar share streak and experience, but each
  has its own path, its own stars and its own weakest notes.

## Tour with screenshots

### The path and the lesson window

The path opens centered on your current lesson. Tapping a node opens a window showing what you'll play,
how much you need to get right and the stars you have so far; you don't get thrown straight in.

<table>
  <tr>
    <td width="50%"><img src="docs/img/camino-claro.png" alt="The path in the light theme" /></td>
    <td width="50%"><img src="docs/img/ventana-leccion.png" alt="The window that opens when you tap a lesson: type, title, stars, goal and the Start button" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Light, dark or system theme.</sub></td>
    <td align="center"><sub>"Start" or "Not now"; Esc also closes it.</sub></td>
  </tr>
</table>

### The lesson: instant feedback

Each target shows **the note, the hand and the finger**, the next two notes **falling** onto the
keyboard and the **ghost hand** below. If you miss, Passo tells you which note it was and which way you
drifted; the correct key stays highlighted.

<table>
  <tr>
    <td width="50%"><img src="docs/img/leccion.png" alt="A lesson with the PC keyboard: target note, a waterfall of the next notes and a ghost hand with fingers" /></td>
    <td width="50%"><img src="docs/img/leccion-error.png" alt="A mistake: the key played is marked with a cross and a message says «It was Sol3, you played Fa3 · one key to the left»" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Note, hand, finger, waterfall and live rhythm.</sub></td>
    <td align="center"><sub>"It was Sol3, you played Fa3 · one key to the left".</sub></td>
  </tr>
</table>

### Listening through the microphone

Passo hears your piano or guitar, measures the room noise, follows the note that is sounding and compares it
with the one requested. The bar shows the level and what it hears ("I hear: Re4").

<p align="center">
  <img src="docs/img/leccion-microfono.png" alt="A microphone lesson: listening bar with «I hear: Re4» and the message Correct!" width="760" />
</p>

### Result, stars and progress

Each lesson awards up to **3 stars**. With ≥ 70 % accuracy you pass; the third star requires at most one
mistake and the marked rhythm. At the end you see what gave you the most trouble. **Progress** shows your level, averages,
the accuracy curve and your **keyboard map**: which keys you hit first time and which you don't.

<table>
  <tr>
    <td width="50%"><img src="docs/img/resultado.png" alt="Lesson result: three stars, accuracy, rhythm, time, experience and what was hardest" /></td>
    <td width="50%"><img src="docs/img/progreso.png" alt="Progress: level, average accuracy, keyboard heat map and accuracy curve per lesson" /></td>
  </tr>
</table>

### Thirds and chords

Beyond single notes there are thirds and three-note chords, with the hand and fingers 1-3-5 shown on
each one. With a microphone they need the **beta "Hear several notes at once"**; with a MIDI piano or the PC
keyboard they always work.

<p align="center">
  <img src="docs/img/acordes.png" alt="Chord practice: G major with the right hand, fingers 1-3-5 and the waterfall of the next chords" width="760" />
</p>

### Guitar

The **"You're learning"** chip opens the **My instruments** list (designed so more can fit). The
guitar has its own path, a **fretboard** that shows string, fret and finger, and a full **tuner**.
The accent color switches to violet so you always know which instrument you're on.

<table>
  <tr>
    <td width="50%"><img src="docs/img/guitarra-camino.png" alt="The guitar path with a violet accent and the «Tune before you start» card" /></td>
    <td width="50%"><img src="docs/img/instrumentos.png" alt="The «My instruments» list with piano and guitar and their progress" /></td>
  </tr>
  <tr>
    <td width="50%"><img src="docs/img/guitarra-leccion.png" alt="A guitar lesson: the fretboard with the current note (string 1, fret 3, finger 3) and the next one" /></td>
    <td width="50%"><img src="docs/img/afinador.png" alt="The tuner: the headstock with the low string 6 and the meter showing the note Mi, −17 cents and the hint «Tighten the peg a little»" /></td>
  </tr>
</table>

#### The tuner

Designed like the ones in professional apps: a **headstock diagram** (the outline of the guitar head with its
six tuning pegs) that **remembers which strings are already in tune**, a **meter** with a green zone (±5 cents) and
an "almost" zone (±15), the **reference note** so you can hear what you're aiming for, the guided **"Tune all 6"** mode (from 6 to
1, it moves from one string to the next on its own) and an adjustable **A₄** (430 to 450 Hz).

<table>
  <tr>
    <td width="50%"><img src="docs/img/afinador-guia.png" alt="Guided mode: step 2 of 6 with the A string in the «almost» zone (−11 cents), string 6 already checked ✓ and string 4 marked as next" /></td>
    <td width="50%" align="center"><img src="docs/img/movil-afinador.png" alt="The tuner on mobile: compact headstock and the meter for string 4" width="250" /></td>
  </tr>
  <tr>
    <td align="center"><sub>Guided mode: it advances on its own once the string is in tune.</sub></td>
    <td align="center"><sub>On mobile, the meter is visible without scrolling far.</sub></td>
  </tr>
</table>

### On mobile

It fits a 320 px screen with no horizontal scrolling: a bottom bar, a header with the instrument selector
and the lesson window as a sheet that slides up from the bottom.

<table>
  <tr>
    <td align="center"><img src="docs/img/movil-camino.png" alt="Piano path on mobile" width="190" /></td>
    <td align="center"><img src="docs/img/movil-ventana.png" alt="Lesson window as a bottom sheet on mobile" width="190" /></td>
    <td align="center"><img src="docs/img/movil-leccion.png" alt="A microphone lesson on mobile" width="190" /></td>
    <td align="center"><img src="docs/img/movil-guitarra.png" alt="Guitar path on mobile" width="190" /></td>
  </tr>
</table>

> The screenshots come from the app itself and are produced by a test (`tests/e2e/readme.spec.ts`) with a
> **simulated** microphone: they can be regenerated with one command, see [Quality and testing](#quality-and-testing).

## What you can do today

| | |
|---|---|
| **Piano path** | 6 units and 32 lessons: right hand (Do to Sol), left hand, moving the hand, chord notes, both hands and, optionally, thirds and chords |
| **Guitar path** | 3 units and 14 lessons: open strings, first notes and all strings up to fret 3 (17 natural notes, from Mi2 to Sol4) |
| **Lessons** | New, review and test; up to 3 stars; "skip with a test" (≥ 2 stars unlocks the whole unit) |
| **Weak-spot review** | "Practice 3 min" builds a lesson on the spot with the notes you struggle with most |
| **Game** | Experience, levels, a daily streak (with one rest day per week) and a 5-minute daily goal |
| **Progress** | Keyboard heat map, accuracy curve, the notes that give you the most trouble per instrument |
| **Guitar tuner** | Automatic (detects the string you play and tells you whether to tighten or loosen; the needle doesn't vanish when you stop playing), headstock diagram with the state of all six strings, meter (Low / High / Almost / In tune, cents and Hz), reference note, guided "Tune all 6" mode and adjustable A₄ |
| **Piano settings** (formerly "My piano") | How many keys your piano has (5 octaves = 61), what it calls middle C (Do4 or Do3, as Yamaha does) and a microphone test that detects whether it reads any note an octave off and corrects it |
| **Guitar chords** | Recognizes the chord you play, from a full strum (with each stroke and its direction) or string by string, and flags the out-of-tune string |
| **Piano songs** | "Golden Brown" with the notes falling onto the keyboard: waiting for you to play or in tempo (with ✓ and ✕ as each note passes). Sheet music will come later |
| **Guitar songs** | Happy Birthday, Mi corazón encantado (Dragon Ball GT), Estrellita and a strumming pattern (De colores): they show you the note or chord of each step and tell you whether you're on time, slow or fast, also on the chord change; with "Listen to the song" you hear it in full before playing it, plus a **sheet music view (staff, bars and note values) with tablature** to help you learn to read music |
| **Free practice** | The classic screen: notes, thirds or chords, at your level and with the help you choose |
| **Settings** | Input (microphone, MIDI or PC keyboard), exercise and level, Do Re Mi or C D E notation, help and theme. They are remembered |
| **Accessibility** | AA contrast verified by tests, nothing depends on color alone, keyboard navigation, screen reader announcements and respect for "reduce motion" |

## Getting started

You need **Node ≥ 22.13** and a modern browser (Edge or Chrome; the microphone requires `localhost` or HTTPS).

```bash
npm install
npm run dev
```

Open the address the terminal shows (normally <http://localhost:5173>). The first time:

1. Choose how you'll play in **Settings → How I play** (the default is the microphone).
2. Tap a lesson on the path and press **Start**.
3. With a microphone, press **Enable microphone**: the browser asks for permission, Passo measures the room
   noise and, once it says it's listening, you can begin. The microphone **never turns on by itself** and turns off when you leave.

**With a desktop icon (Windows):** run once
`powershell -ExecutionPolicy Bypass -File scripts\crear_icono_escritorio.ps1` and **Passo** appears
next to your other shortcuts. One click starts the server if needed (it stays in a minimized window:
closing it stops the server) and opens the app at <http://localhost:5173>. The icon is generated by
`scripts/generar_icono.py`.

With no piano at hand, try the PC keyboard: open <http://localhost:5173/?pc#/practica> and play with
the keys `A S D F G H J K L ;` (right hand, Do4 to Mi5) or `Z X C V B N M` (left hand, Do3 to Si3).

## How you play: microphone, MIDI or PC keyboard

| Input | What it's for | Notes |
|---|---|---|
| **Microphone** | The main one: acoustic piano, keyboards without USB and guitar | One note at a time. Thirds and chords only with the beta "Hear several notes at once" |
| **MIDI piano** | If your piano has USB-MIDI | Exact, with velocity and full chords. Web MIDI does not exist in Safari |
| **PC keyboard** | Trying it out without an instrument and for development | Acts as a piano; there is no keyboard guitar |

The microphone is **active listening**: it measures the room noise, detects the attack of each note, computes
its pitch (own McLeod detection), learns how far your instrument drifts and reports how confident it
was in what it heard. A doubtful note never counts as a mistake. The details and what was measured are in
[docs/fases/fase-1.md](docs/fases/fase-1.md) and [docs/convenciones.md](docs/convenciones.md).

## Guitar

- **The note name is judged, not the octave.** Guitar is written an octave higher than it sounds and the
  microphone often misreads the low strings; so the Mi on string 6 and the one on string 1 count
  the same. The fretboard tells you where to play it (string, fret and finger).
- **Tune first.** With a slack string every note would come out as a mistake; the path reminds you and
  the tuner is one tap away. You pick the string on the headstock diagram (or let the guide go from 6 to 1) and it says
  "In tune" at ±5 cents held for 600 ms. It doesn't yet detect which string you play on its own (Auto mode): that is the
  riskiest part with a laptop microphone and is left until it can be validated with a real guitar.
- **Microphone only**, in standard tuning and natural notes up to fret 3.
- **Coming soon:** arpeggios and chords, tablature and the song "Mi corazón encantado" bar by bar (see the
  [roadmap](#status-and-roadmap)).

> **Honesty about what has been tested:** all the audio in the tests is **synthetic** (a Karplus-Strong
> guitar and piano tones from oscillators). The thresholds for the tuner and the low strings
> come from simulations and still need to be confirmed with a real guitar and piano:
> [docs/validacion-microfono.md](docs/validacion-microfono.md).

## URLs and parameters

Navigation goes through the URL *hash*, and **the instrument is part of it**:

| URL | Screen |
|---|---|
| `#/piano`, `#/guitarra` | The path for that instrument (`#/` and the empty address complete themselves) |
| `#/piano/progreso`, `#/guitarra/progreso` | Your progress on that instrument |
| `#/leccion/<id>` | A full-screen lesson (`u2-1` on piano, `g1-1` on guitar, `repaso-debiles`) |
| `#/practica` | Free practice (piano) |
| `#/afinador` | The tuner (guitar) |
| `#/acordes` | Recognize the chord you play (guitar) |
| `#/piano/ajustes`, `#/guitarra/ajustes` | The settings for each instrument (Piano and Guitar tabs); `#/ajustes` shows those of the selected one and `#/mi-piano` takes you to the piano's. A page, not a side panel; `Ctrl+,` opens it |
| `#/canciones`, `#/cancion/<id>` | The songs (piano or guitar depending on the instrument): the list and a single song |

URL parameters for development and testing (they are not saved):

| Parameter | Effect |
|---|---|
| `?pc` · `?midi` · `?mic=off` | Development mode: only the requested inputs (`?pc` PC keyboard as piano, `?midi` MIDI piano) and `?mic=off` removes the microphone |
| `?seed=N` | Reproducible notes |
| `?debug` | Latency and chord measurements |
| `?modo=notas\|terceras\|acordes&nivel=N` | Fixes the exercise for that visit (use it with `?pc` or `?midi`) |
| `?instrumento=guitarra` | Fixes the instrument for that visit |

## How it works inside

Passo follows **Clean Architecture** and enforces it with tools (`dependency-cruiser` and ESLint
reject imports that break the layers):

```
 Microphone ─┐
 MIDI piano ─┼─▶ NoteInput ─▶ PracticeSession ─▶ evaluate() ─▶ React screens
 PC keyboard ┘   (port)        (use case)        (domain, pure)
                                   │
        LessonFlow ─▶ score ─▶ ProgressService ─▶ storage (localStorage)
```

| Layer | What's in it | Rule |
|---|---|---|
| **Domain** (`src/core/domain`) | Notes, targets, instrument, lessons and catalogs, attempt evaluation, scoring and stars, streak, review, note tracker, pitch detection, chord checker, tuner | Pure TypeScript: no DOM, no clock, no randomness of its own |
| **Application** (`src/core/application`) | `PracticeSession`, `LessonFlow`, `ProgressService`, `TunerService`, sync with preferences | Orchestrates the domain and the ports |
| **Ports** (`src/core/ports`) | `NoteInput`, `AudioOutput`, `Clock`, `ProgressStore`, `PitchMonitor`… | Interfaces only |
| **Adapters** (`src/adapters`) | `MicrophoneInput`, `MidiInput`, `ComputerKeyboardInput`, `WebAudioOutput`, `localStorage` | Interchangeable; fakes are used in tests |
| **UI** (`src/ui`) | React: path, lesson, progress, tuner, keyboard, fretboard, settings | Only presents and delegates |

The microphone goes through this pipeline: *capture → frame analysis (energy and attack) → McLeod pitch
detection → note tracker (confirmation, octave, learned tuning) → note event*. With the
guitar it switches **listening profile** on the fly (a different range, a different debounce time) without recalibrating.

Decisions worth knowing about:

- **The note is what gets judged.** The rest (hand, finger, string, fret) is on-screen guidance.
- **Progress is derived.** Which lessons are unlocked comes from the stars; it isn't stored.
- **Local, versioned data.** `passo.progreso` and `passo.preferencias` in `localStorage`; damaged data
  or data from a newer version never breaks the app and is never overwritten.
- **No runtime dependencies** except React and the Nunito typeface (self-hosted).

## Project structure

```
src/
  core/        domain, application and ports (no DOM)
  adapters/    microphone, MIDI, PC keyboard, audio, storage
  ui/          React screens (path, lesson, progress, tuner, settings…)
  compose.ts   wires everything together (and reads the URL parameters)
tests/
  core/ adapters/ integration/ ui/   Vitest (+ jsdom)
  e2e/                               Playwright in Edge, with video and screenshots
  support/ fakes/                    synthetic microphone, Karplus-Strong guitar, fakes
docs/
  fases/       plan, decisions and results of each phase
  img/         screenshots for this README
evidencias/    videos and screenshots of each closed phase, with its report
```

## Quality and testing

| Command | What it does |
|---|---|
| `npm run dev` | Development server |
| `npm run check` | **Everything together:** lint, layer rules, formatting, tests and build |
| `npm test` · `npm run test:watch` | Vitest (unit, integration and UI tests) |
| `npm run e2e` | Functional tests in **Edge** with video and screenshots (see [docs/metodo.md](docs/metodo.md) for the video's `ffmpeg`) |
| `E2E_VIDEO=off npm run e2e` | The same without recording video |
| `npm run build` · `npm run preview` | Production build and preview |

`npm run check` passes with **1715 tests** in 96 files and the e2e suite has **85 tests in Edge**.
Each closed phase leaves its report, video and screenshots in [`evidencias/`](evidencias/).

To regenerate this README's screenshots (they use a simulated microphone and don't run with
`npm run e2e`):

```bash
# Git Bash / macOS / Linux
README_SHOTS=1 npx playwright test tests/e2e/readme.spec.ts

# PowerShell
$env:README_SHOTS=1; npx playwright test tests/e2e/readme.spec.ts
```

## Status and roadmap

The project is built **one phase at a time**: plan, review by three experts (music and acoustics,
interface and experience, architecture and infrastructure), construction with small commits,
verification with tests and evidence, final review and closure ([method](docs/metodo.md)). The repository
is **local only**.

| Phase | Deliverable | Status |
|---|---|---|
| 0 | Prototype: on-screen keyboard, MIDI and "play this note" | Done |
| 1 | **Active listening** through the microphone | Done (still to validate with a real piano) |
| 2 | Settings, thirds and chords, hands and fingers, falling notes | Done |
| 3 | **Passo as a game:** path, stars, experience, streak and saved progress | Done (still to validate with a real piano) |
| G1 | **Guitar, stage 1:** instrument, fretboard, tuner and three units of notes | Done (still to validate with a real guitar) |
| A | **Pro guitar tuner:** headstock diagram, meter, reference note, guided mode and A₄ (Auto is kept separate) | Done (still to validate with a real guitar) |
| C | **Guitar songs** with timing cues (melodies and a strumming pattern) | Done (still to validate with a real guitar; see [docs/fases/canciones.md](docs/fases/canciones.md)) |
| G2 | Guitar: arpeggios and open chords | In design (plan in [docs/fases/guitarra-2.md](docs/fases/guitarra-2.md)) |
| G3 · G4 | Guitar: tablature · songs bar by bar ("Mi corazón encantado") | Pending |
| 4 | Wait and strict modes, levels with quarter notes | Pending |
| 5 | Ear training: note and interval recognition by ear | Pending |
| 6 | Rhythm: metronome and timing scoring | Pending |
| 7 | Songs: MusicXML and MIDI, sheet music | Pending |
| 8 | **Adaptive engine:** practice by sections, progressive joining and tempo increase | Pending |
| 9 | Polish: achievements, swappable sober theme, accounts and cloud | Pending |

The core idea of the product —practicing **only what doesn't go well** and joining the sections little by little—
is in [docs/vision.md](docs/vision.md). What was shelved on purpose (full keyboard on mobile, microphone
selector…) is in [docs/archivado.md](docs/archivado.md).

## Documentation

| Document | Contents |
|---|---|
| [docs/case-study.md](docs/case-study.md) | Case study: problem, technical decisions, outcome and what's missing |
| [docs/vision.md](docs/vision.md) | Problem, core idea, practice modes and visual design |
| [docs/metodo.md](docs/metodo.md) | How the work is done: phases, experts, tests and evidence |
| [docs/convenciones.md](docs/convenciones.md) | Domain rules: notes, attempts, microphone, lessons, instruments and routes |
| [docs/fases/](docs/fases/) | Plan, decisions, results and debt of each phase |
| [docs/validacion-microfono.md](docs/validacion-microfono.md) | Steps to validate with your real piano and guitar |
| [docs/validacion-piano.md](docs/validacion-piano.md) | Validation with a MIDI piano |
| [docs/archivado.md](docs/archivado.md) | What was paused on purpose and how to resume it |

---

<p align="center"><sub>A personal project by Kevin Díaz. © 2026, all rights reserved: the code is published to be viewed, not to be reused or commercialized (see <a href="LICENSE">LICENSE</a>).</sub></p>
