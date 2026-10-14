import type { InputSource } from '@/core/domain/note-event';
import type { AudioStatus } from '@/core/ports/audio-control';
import type { InputStatus } from '@/core/ports/note-input';

export type StatusTone = 'ok' | 'info' | 'warn';

export interface StatusView {
  readonly tone: StatusTone;
  /** Texto corto para el "chip" compacto. */
  readonly short: string;
  readonly title: string;
  readonly text: string;
  /** Se muestra siempre como chip de una línea (nunca como fila ancha que mueva la pantalla). */
  readonly compact?: boolean;
  /** Acción que ofrece el estado, si la hay. */
  readonly action?: {
    readonly kind: 'retry' | 'start' | 'stop' | 'unlock';
    readonly label: string;
  };
}

function describeMicrophone(status: InputStatus): StatusView {
  const base = { compact: true, title: 'Micrófono' } as const;
  switch (status.kind) {
    case 'inactivo':
      return {
        ...base,
        tone: 'info',
        short: 'Micrófono apagado',
        text: 'Passo oye tu piano con el micrófono. El audio se analiza aquí: no se graba ni se envía.',
        action: { kind: 'start', label: 'Activar' },
      };
    case 'iniciando':
      return {
        ...base,
        tone: 'info',
        short: 'Esperando tu permiso…',
        text: 'Elige «Permitir» cuando el navegador pregunte.',
      };
    case 'conectado':
      return {
        ...base,
        tone: 'ok',
        short: 'Te escucho',
        text: `Micrófono: ${status.deviceName}`,
        action: { kind: 'stop', label: 'Apagar' },
      };
    case 'sin-dispositivo':
      return {
        ...base,
        tone: 'warn',
        short: status.reason === 'ocupado' ? 'Micrófono ocupado' : 'No encuentro micrófono',
        text:
          status.reason === 'ocupado'
            ? 'Otra aplicación usa el micrófono. Ciérrala y reintenta.'
            : 'Conecta un micrófono o revisa «Sonido» en Windows.',
        action: { kind: 'retry', label: 'Buscar de nuevo' },
      };
    case 'desconectado':
      return {
        ...base,
        tone: 'warn',
        short: 'Micrófono perdido',
        text: `Se perdió ${status.deviceName}. Reactívalo para seguir.`,
        action: { kind: 'start', label: 'Reactivar' },
      };
    case 'permiso-denegado':
      return {
        ...base,
        tone: 'warn',
        short: 'Micrófono bloqueado',
        text: 'El navegador bloqueó el micrófono. Pulsa el candado de la barra de direcciones y permite «Micrófono».',
        action: { kind: 'retry', label: 'Reintentar' },
      };
    case 'sin-soporte':
      return {
        ...base,
        tone: 'warn',
        short: 'Micrófono no disponible',
        text: 'Este navegador no permite usar el micrófono. Usa Chrome o Edge.',
      };
  }
}

export function describeInputStatus(source: InputSource, status: InputStatus): StatusView {
  if (source === 'microfono') return describeMicrophone(status);
  if (source === 'teclado-pc') {
    return {
      tone: 'ok',
      short: 'Teclado del PC',
      title: 'Teclado del PC',
      text: 'Activo para pruebas (A S D F G…).',
    };
  }
  switch (status.kind) {
    case 'inactivo':
      return {
        tone: 'info',
        short: 'Piano MIDI apagado',
        title: 'Piano MIDI',
        text: 'La entrada MIDI no está activa.',
      };
    case 'iniciando':
      return {
        tone: 'info',
        short: 'Buscando piano…',
        title: 'Piano MIDI',
        text: 'Buscando… si el navegador pregunta, permite el acceso.',
      };
    case 'conectado':
      return {
        tone: 'ok',
        short: `Piano: ${status.deviceName}`,
        title: 'Piano MIDI',
        text: `Conectado: ${status.deviceName}`,
      };
    case 'sin-dispositivo':
      return {
        tone: 'info',
        short: 'Piano MIDI: sin conectar',
        title: 'Piano MIDI',
        text: 'No hay ningún piano conectado. Conéctalo por USB o usa el teclado del PC.',
      };
    case 'desconectado':
      return {
        tone: 'warn',
        short: `Piano desconectado: ${status.deviceName}`,
        title: `Piano desconectado: ${status.deviceName}`,
        text: 'Vuelve a conectarlo para seguir tocando con él.',
      };
    case 'permiso-denegado':
      return {
        tone: 'warn',
        short: 'Piano MIDI bloqueado',
        title: 'El navegador bloqueó el piano MIDI',
        text: 'Pulsa el candado de la barra de direcciones, permite «Dispositivos MIDI» y reintenta.',
        action: { kind: 'retry', label: 'Reintentar' },
      };
    case 'sin-soporte':
      return {
        tone: 'warn',
        short: 'Piano MIDI no disponible',
        title: 'Este navegador no admite piano MIDI',
        text: 'Usa Chrome o Edge. El teclado del PC sigue funcionando.',
      };
  }
}

export function describeAudioStatus(status: AudioStatus): StatusView {
  switch (status) {
    case 'listo':
      return { tone: 'ok', short: 'Sonido activado', title: 'Sonido', text: 'Activado.' };
    case 'bloqueado':
      return {
        tone: 'info',
        short: 'Sonido desactivado',
        title: 'Sonido desactivado',
        text: 'El navegador necesita un clic o una tecla para activarlo.',
        action: { kind: 'unlock', label: 'Activar sonido' },
      };
    case 'sin-soporte':
      return {
        tone: 'warn',
        short: 'Sin sonido',
        title: 'Sin sonido',
        text: 'Este navegador no permite generar audio. Puedes practicar igualmente.',
      };
  }
}
