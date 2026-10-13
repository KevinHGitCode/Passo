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
