/** Reglas de dependencias entre capas (ver docs/metodo.md y README.md). */
module.exports = {
  forbidden: [
    {
      name: 'no-circular',
      severity: 'error',
      comment: 'No se permiten dependencias circulares.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'core-sin-dependencias-externas',
      severity: 'error',
      comment: 'core es TypeScript puro: no importa paquetes ni APIs de plataforma.',
      from: { path: '^src/core' },
      to: { dependencyTypesNot: ['local', 'aliased', 'type-only'], pathNot: '^src/core' },
    },
    {
      name: 'core-solo-importa-core',
      severity: 'error',
      comment: 'core no depende de adapters ni de ui.',
      from: { path: '^src/core' },
      to: { path: '^src/(adapters|ui)' },
    },
    {
      name: 'adapters-solo-importan-core',
      severity: 'error',
      comment: 'adapters solo conocen core (los puertos).',
      from: { path: '^src/adapters' },
      to: { path: '^src/ui' },
    },
    {
      name: 'ui-no-importa-adapters',
      severity: 'error',
      comment: 'ui no conoce adapters: la composición ocurre solo en src/main.tsx.',
      from: { path: '^src/ui' },
      to: { path: '^src/adapters' },
    },
    {
      name: 'adapters-aislados-entre-si',
      severity: 'error',
      comment:
        'Cada adaptador (micrófono, MIDI, teclado, audio) es independiente: no se importan entre sí.',
      from: { path: '^src/adapters/([^/]+)/' },
      to: { path: '^src/adapters/', pathNot: '^src/adapters/$1/' },
    },
    {
      name: 'composicion-solo-desde-main',
      severity: 'error',
      comment: 'compose.ts es la raíz de composición: solo main.tsx puede importarla.',
      from: { path: '^src', pathNot: '^src/main\\.tsx$' },
      to: { path: '^src/(compose|main)\\.tsx?$' },
    },
  ],
  options: {
    doNotFollow: { path: 'node_modules' },
    tsConfig: { fileName: 'tsconfig.json' },
    tsPreCompilationDeps: true,
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
    },
  },
};
