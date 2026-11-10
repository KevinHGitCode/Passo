import type { ReactNode, Ref } from 'react';

/**
 * La cabecera de una pantalla: el título, una línea que la explica y, a la derecha, sus acciones. Todas las
 * pantallas del marco la usan, así el título está siempre en el mismo sitio y con el mismo tamaño.
 */
export function PageHeader({
  id,
  title,
  lead,
  leadTestId,
  actions,
  headingRef,
}: {
  /** El `id` del título (lo usa `aria-labelledby` y el foco al cambiar de pantalla). */
  readonly id: string;
  readonly title: ReactNode;
  readonly lead?: ReactNode;
  readonly leadTestId?: string;
  readonly actions?: ReactNode;
  readonly headingRef?: Ref<HTMLHeadingElement>;
}) {
  return (
    <header className="page-head">
      <div className="page-head__text">
        <h1 id={id} tabIndex={-1} data-route-heading ref={headingRef}>
          {title}
        </h1>
        {lead === undefined ? null : (
          <p className="page-head__lead" data-testid={leadTestId}>
            {lead}
          </p>
        )}
      </div>
      {actions === undefined ? null : <div className="page-head__actions">{actions}</div>}
    </header>
  );
}
