import type { LessonFlow } from '@/core/application/lesson-flow';

/** Una lección (se construye en la etapa G8). */
export function LessonScreen({
  lessonId,
}: {
  readonly lessonId: string;
  readonly flow: LessonFlow;
}) {
  return (
    <section aria-labelledby="leccion-titulo">
      <h1 id="leccion-titulo" tabIndex={-1} data-route-heading>
        Lección {lessonId}
      </h1>
    </section>
  );
}
