import {
  CAMINO,
  PRACTICA,
  PROGRESO,
  hrefOf,
  lessonRoute,
  parseRoute,
  routeKey,
  routeTitle,
} from '@/ui/router/routes';

describe('rutas', () => {
  it('sin hash, con # o con #/ es el camino', () => {
    expect(parseRoute('')).toEqual(CAMINO);
    expect(parseRoute('#')).toEqual(CAMINO);
    expect(parseRoute('#/')).toEqual(CAMINO);
  });

  it('reconoce progreso y práctica libre', () => {
    expect(parseRoute('#/progreso')).toEqual(PROGRESO);
    expect(parseRoute('#/practica')).toEqual(PRACTICA);
    expect(parseRoute('#/practica/')).toEqual(PRACTICA);
  });

  it('una lección lleva su identificador', () => {
    expect(parseRoute('#/leccion/u2-3')).toEqual({ name: 'leccion', lessonId: 'u2-3' });
  });

  it('una lección sin identificador, o una ruta desconocida, lleva al camino', () => {
    expect(parseRoute('#/leccion')).toEqual(CAMINO);
    expect(parseRoute('#/leccion/')).toEqual(CAMINO);
    expect(parseRoute('#/resultado')).toEqual(CAMINO);
    expect(parseRoute('#/nada/raro/aqui')).toEqual(CAMINO);
  });

  it('ignora lo que venga tras un signo de pregunta y decodifica el identificador', () => {
    expect(parseRoute('#/progreso?x=1')).toEqual(PROGRESO);
    expect(parseRoute('#/leccion/u%201')).toEqual({ name: 'leccion', lessonId: 'u 1' });
  });

  it('un porcentaje mal formado no rompe nada', () => {
    expect(parseRoute('#/leccion/%E0%A4%A')).toEqual({ name: 'leccion', lessonId: '%E0%A4%A' });
  });

  it('hrefOf y parseRoute son inversos', () => {
    for (const route of [CAMINO, PROGRESO, PRACTICA, lessonRoute('u6-8'), lessonRoute('a b/c')]) {
      expect(parseRoute(hrefOf(route))).toEqual(route);
    }
    expect(hrefOf(CAMINO)).toBe('#/');
    expect(hrefOf(lessonRoute('u1-1'))).toBe('#/leccion/u1-1');
  });

  it('la clave distingue lecciones; el título, pantallas', () => {
    expect(routeKey(lessonRoute('u1-1'))).not.toBe(routeKey(lessonRoute('u1-2')));
    expect(routeKey(CAMINO)).toBe('camino');
    expect(routeTitle(CAMINO)).toBe('Aprender');
    expect(routeTitle(PRACTICA)).toBe('Práctica libre');
    expect(routeTitle(lessonRoute('u1-1'))).toBe('Lección');
    expect(routeTitle(PROGRESO)).toBe('Progreso');
  });
});
