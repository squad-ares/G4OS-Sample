export { composeCatalogs } from './composite-catalog.ts';
export {
  type ActivateSourcesDeps,
  createActivateSourcesHandler,
  listDirHandler,
  readFileHandler,
  runBashHandler,
  type SessionMetadataStore,
  type SessionMountState,
  type SourceCatalogReader,
  writeFileHandler,
} from './handlers/index.ts';
export { createToolRegistry, ToolRegistry } from './registry.ts';
export type {
  ToolCatalog,
  ToolContext,
  ToolFailure,
  ToolHandler,
  ToolHandlerResult,
  ToolSuccess,
} from './types.ts';
