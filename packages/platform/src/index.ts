export * from './install-meta.ts';
export * from './keychain/interface.ts';
export * from './paths.ts';
export * from './platform-info.ts';
// CR-20 F-P20-1: re-export explícito (não `export *`) para omitir
// `_resetForTestingInternal` do barrel público — o helper é test-only
// e o JSDoc afirma "NÃO usar em código de aplicação". Test importa
// diretamente de `'../runtime-paths.ts'` (já é o pattern canônico).
//
// CR-43 F-CR43-2: `runtime` removido do barrel público — zero consumers
// externos confirmados (grep 0 matches). `validateRuntimeIntegrity` usa
// `runtime` internamente; expor o objeto cru induziria consumers a usá-lo
// como caminho sem validação de hash (que é o papel de `loadInstallMeta` +
// `verifyRuntimeHashes`).
export { initRuntimePaths, validateRuntimeIntegrity } from './runtime-paths.ts';
