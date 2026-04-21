export {
  AttachmentList,
  AttachmentPreview,
  DropZone,
  filesToAttachments,
  PaperclipButton,
  validateAttachments,
} from './components/composer/attachments/index.ts';
export {
  Composer,
  type ComposerProps,
  type ComposerSendPayload,
  type ComposerSubmitMode,
  ComposerTextarea,
  type ComposerTextareaProps,
  type ComposerTextareaRef,
  type DraftStore,
  localStorageDraftStore,
  SendButton,
  type SendButtonProps,
  shouldInsertNewline,
  shouldSubmit,
  VoiceButton,
  type VoiceButtonProps,
  Waveform,
} from './components/composer/index.ts';
export {
  ConfirmDestructiveDialog,
  type ConfirmDestructiveDialogProps,
} from './components/confirm-destructive-dialog.tsx';
export { ModelSelector } from './components/model-selector.tsx';
export { ThinkingLevelSelector } from './components/thinking-level.tsx';
export {
  BranchButton,
  CopyButton,
  MessageCard,
  type MessageCardCallbacks,
  type MessageCardProps,
  RetryButton,
  SearchBar,
  type SearchBarProps,
  TranscriptView,
  type TranscriptViewProps,
} from './components/transcript/index.ts';
export { useAutoScroll } from './hooks/use-auto-scroll.ts';
export { type ComposerState, useComposerState } from './hooks/use-composer-state.ts';
export { useScrollToMatch } from './hooks/use-scroll-to-match.ts';
export {
  type SearchFn,
  type UseSearchMatchesOptions,
  type UseSearchMatchesResult,
  useSearchMatches,
} from './hooks/use-search-matches.ts';
export {
  type SessionShortcutHandlers,
  useSessionShortcuts,
} from './hooks/use-session-shortcuts.ts';
export {
  useVoiceRecorder,
  type VoiceRecorderResult,
  type VoiceRecorderState,
} from './hooks/use-voice-recorder.ts';
export {
  findModel,
  formatContextWindow,
  MODELS,
  type ModelProvider,
  type ModelSpec,
  type ThinkingLevel,
} from './model-catalog.ts';
export {
  type PermissionDecision,
  PermissionModal,
  PermissionProvider,
  type PermissionRequest,
  type PermissionScope,
  requestPermission,
} from './permissions/index.ts';
export {
  CollapsibleResult,
  FallbackRenderer,
  registerToolRenderer,
  resolveToolRenderer,
  type ToolRenderer,
  type ToolRendererComponent,
  ToolResultDispatcher,
} from './tool-renderers/index.ts';
export type { Attachment, ContentBlock, Message, MessageRole } from './types.ts';
