// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach } from 'vitest';
import { PreferencesService } from '@/core/application/preferences-service';
import { initTheme, useTheme } from '@/ui/theme/use-theme';
import { FakePreferencesStore } from '../fakes/fake-preferences-store';

afterEach(() => {
  cleanup();
  document.documentElement.removeAttribute('data-theme');
});

describe('tema', () => {
  it('initTheme aplica el tema guardado antes de pintar', () => {
    initTheme('oscuro');
    expect(document.documentElement.getAttribute('data-theme')).toBe('oscuro');
    initTheme('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
  });

  it('useTheme parte del tema guardado y lo aplica', () => {
    const preferences = new PreferencesService(
      new FakePreferencesStore({ version: 1, theme: 'claro' }),
    );
    const { result } = renderHook(() => useTheme(preferences));
    expect(result.current[0]).toBe('claro');
    expect(document.documentElement.getAttribute('data-theme')).toBe('claro');
  });

  it('cambiar de tema recorre auto → claro → oscuro, lo aplica y lo guarda', () => {
    const store = new FakePreferencesStore();
    const preferences = new PreferencesService(store);
    const { result } = renderHook(() => useTheme(preferences));
    expect(result.current[0]).toBe('auto');

    act(() => result.current[1]());
    expect(result.current[0]).toBe('claro');
    act(() => result.current[1]());
    expect(result.current[0]).toBe('oscuro');
    expect(document.documentElement.getAttribute('data-theme')).toBe('oscuro');
    act(() => result.current[1]());
    expect(result.current[0]).toBe('auto');
    expect(document.documentElement.hasAttribute('data-theme')).toBe(false);
    expect(store.saves.map((saved) => saved.theme)).toEqual(['claro', 'oscuro', 'auto']);
  });

  it('si otra parte cambia el tema en las preferencias, el hook lo sigue', () => {
    const preferences = new PreferencesService(new FakePreferencesStore());
    const { result } = renderHook(() => useTheme(preferences));
    act(() => preferences.update({ theme: 'oscuro' }));
    expect(result.current[0]).toBe('oscuro');
  });
});
