export * from './install-meta.ts';
export * from './keychain/interface.ts';
export * from './paths.ts';
export * from './platform-info.ts';
export * from './process-types.ts';
// CR-20 F-P20-1: re-export explícito (não `export *`) para omitir
// `_resetForTestingInternal` do barrel público — o helper é test-only
// e o JSDoc afirma "NÃO usar em código de aplicação". Test importa
// diretamente de `'../runtime-paths.ts'` (já é o pattern canônico).
export {
  initRuntimePaths,
  runtime,
  validateRuntimeIntegrity,
} from './runtime-paths.ts';
export * from './spawn/interface.ts';
