import { useSyncExternalStore } from 'react';
import { Icon } from '../game/icons';
import { dismissToast, getToast, subscribeToast } from './toast';
import './toast.css';

/**
 * Donde aparecen los avisos breves: abajo, centrados, por encima de todo. La región está siempre en la página
 * (vacía) para que el lector de pantalla anuncie el aviso cuando llega.
 */
export function Toaster() {
  const toast = useSyncExternalStore(subscribeToast, getToast, () => null);
  return (
    <div className="toaster" role="status" aria-live="polite" data-testid="toaster">
      {toast === null ? null : (
        <div key={toast.id} className="toast" data-tone={toast.tone} data-testid="toast">
          <span className="toast__icon" aria-hidden="true">
            <Icon name="check" size={18} />
          </span>
          <span className="toast__text">{toast.text}</span>
          {toast.action === undefined ? null : (
            <button
              type="button"
              className="toast__action"
              onClick={() => {
                toast.action?.run();
                dismissToast();
              }}
              data-testid="toast-action"
            >
              {toast.action.label}
            </button>
          )}
          <button
            type="button"
            className="toast__close"
            aria-label="Cerrar el aviso"
            onClick={dismissToast}
          >
            <Icon name="cross" size={16} />
          </button>
        </div>
      )}
    </div>
  );
}
