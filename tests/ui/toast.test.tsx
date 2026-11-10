// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, vi } from 'vitest';
import { Toaster } from '@/ui/toast/Toaster';
import { TOAST_MS, TOAST_WITH_ACTION_MS, dismissToast, showToast } from '@/ui/toast/toast';

beforeEach(() => {
  vi.useFakeTimers();
});
afterEach(() => {
  act(() => dismissToast());
  cleanup();
  vi.useRealTimers();
});

describe('avisos breves', () => {
  it('la región existe vacía y anuncia el aviso cuando llega', () => {
    render(<Toaster />);
    const region = screen.getByTestId('toaster');
    expect(region.getAttribute('role')).toBe('status');
    expect(screen.queryByTestId('toast')).toBeNull();
    act(() => showToast('Ajustes restablecidos'));
    expect(screen.getByTestId('toast').textContent).toContain('Ajustes restablecidos');
  });

  it('se va solo al rato; con una acción dura más', () => {
    render(<Toaster />);
    act(() => showToast('Guardado'));
    act(() => void vi.advanceTimersByTime(TOAST_MS + 10));
    expect(screen.queryByTestId('toast')).toBeNull();
    act(() => showToast('Quitado', { action: { label: 'Deshacer', run: () => undefined } }));
    act(() => void vi.advanceTimersByTime(TOAST_MS + 10));
    expect(screen.getByTestId('toast')).toBeTruthy();
    act(() => void vi.advanceTimersByTime(TOAST_WITH_ACTION_MS));
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('la acción se ejecuta una vez y cierra el aviso; un aviso nuevo sustituye al anterior', () => {
    render(<Toaster />);
    const run = vi.fn();
    act(() => showToast('Uno'));
    act(() => showToast('Dos', { action: { label: 'Deshacer', run } }));
    expect(screen.getAllByTestId('toast')).toHaveLength(1);
    expect(screen.getByTestId('toast').textContent).toContain('Dos');
    fireEvent.click(screen.getByTestId('toast-action'));
    expect(run).toHaveBeenCalledTimes(1);
    expect(screen.queryByTestId('toast')).toBeNull();
  });

  it('se puede cerrar a mano', () => {
    render(<Toaster />);
    act(() => showToast('Hola'));
    fireEvent.click(screen.getByRole('button', { name: 'Cerrar el aviso' }));
    expect(screen.queryByTestId('toast')).toBeNull();
  });
});
