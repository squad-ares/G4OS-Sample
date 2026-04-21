import type { PlatformAPI } from '@g4os/ui/platform';
import { trpc } from '../ipc/trpc-client.ts';

export const electronPlatform: PlatformAPI = {
  readFileAsDataUrl(path: string) {
    return trpc.platform.readFileAsDataUrl.query({ path });
  },
  async openExternal(url: string) {
    await trpc.platform.openExternal.mutate({ url });
  },
  async copyToClipboard(text: string) {
    await trpc.platform.copyToClipboard.mutate({ text });
  },
  async showItemInFolder(path: string) {
    await trpc.platform.showItemInFolder.mutate({ path });
  },
  onDeepLink(_handler: (url: string) => void) {
    return () => undefined;
  },
};
