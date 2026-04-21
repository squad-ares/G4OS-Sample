import type { ReactNode } from 'react';
import { createContext, useContext } from 'react';

export interface PlatformAPI {
  readFileAsDataUrl(path: string): Promise<string>;
  openExternal(url: string): Promise<void>;
  copyToClipboard(text: string): Promise<void>;
  showItemInFolder(path: string): Promise<void>;
  onDeepLink(handler: (url: string) => void): () => void;
}

const PlatformContext = createContext<PlatformAPI | null>(null);

export function PlatformProvider({
  api,
  children,
}: {
  readonly api: PlatformAPI;
  readonly children: ReactNode;
}) {
  return <PlatformContext.Provider value={api}>{children}</PlatformContext.Provider>;
}

export function usePlatform(): PlatformAPI {
  const ctx = useContext(PlatformContext);
  if (!ctx) throw new Error('usePlatform must be used within PlatformProvider');
  return ctx;
}
