/**
 * Los avisos breves de la app («Ajustes restablecidos · Deshacer»). Hay uno a la vez: el nuevo sustituye al
 * anterior. Cualquier pantalla lo pide con `showToast`; lo dibuja `Toaster`, montado una sola vez en el marco.
 */
export interface ToastAction {
  readonly label: string;
  readonly run: () => void;
}

export interface Toast {
  readonly id: number;
  readonly text: string;
  readonly tone: 'ok' | 'info';
  readonly action?: ToastAction | undefined;
}

/** Cuánto se queda a la vista (más si trae una acción: hay que alcanzar a pulsarla). */
export const TOAST_MS = 4000;
export const TOAST_WITH_ACTION_MS = 7000;

let current: Toast | null = null;
let nextId = 1;
let timer: number | undefined;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of listeners) listener();
}

export function subscribeToast(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToast(): Toast | null {
  return current;
}

export function dismissToast(): void {
  if (current === null) return;
  window.clearTimeout(timer);
  current = null;
  emit();
}

export function showToast(
  text: string,
  options: { readonly tone?: Toast['tone']; readonly action?: ToastAction } = {},
): void {
  window.clearTimeout(timer);
  current = { id: nextId++, text, tone: options.tone ?? 'ok', action: options.action };
  timer = window.setTimeout(dismissToast, options.action ? TOAST_WITH_ACTION_MS : TOAST_MS);
  emit();
}
