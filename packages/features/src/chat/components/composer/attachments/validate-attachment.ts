/**
 * Validação de arquivos antes de adicionar ao composer.
 *
 * CR-37 F-CR37-2: retorna union discriminada em vez de string hardcoded em inglês.
 * O caller faz `t(result.key, result.params)` para exibir mensagem traduzida.
 */

import type { Attachment } from '../../../types.ts';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 40 * 1024 * 1024;
const MAX_FILES = 10;

export type AttachmentValidationError =
  | {
      readonly code: 'too-many-files';
      readonly key: 'chat.composer.attachment.tooManyFiles';
      readonly params: { readonly max: number };
    }
  | {
      readonly code: 'file-too-large';
      readonly key: 'chat.composer.attachment.fileTooLarge';
      readonly params: { readonly name: string };
    }
  | {
      readonly code: 'total-too-large';
      readonly key: 'chat.composer.attachment.totalTooLarge';
      readonly params: Record<string, never>;
    };

export function validateAttachments(
  incoming: ReadonlyArray<File>,
  existing: ReadonlyArray<Attachment>,
): AttachmentValidationError | null {
  if (existing.length + incoming.length > MAX_FILES) {
    return {
      code: 'too-many-files',
      key: 'chat.composer.attachment.tooManyFiles',
      params: { max: MAX_FILES },
    };
  }
  for (const file of incoming) {
    if (file.size > MAX_FILE_SIZE) {
      return {
        code: 'file-too-large',
        key: 'chat.composer.attachment.fileTooLarge',
        params: { name: file.name },
      };
    }
  }
  const existingTotal = existing.reduce((sum, a) => sum + a.size, 0);
  const incomingTotal = incoming.reduce((sum, f) => sum + f.size, 0);
  if (existingTotal + incomingTotal > MAX_TOTAL_SIZE) {
    return { code: 'total-too-large', key: 'chat.composer.attachment.totalTooLarge', params: {} };
  }
  return null;
}

export async function filesToAttachments(files: FileList | File[]): Promise<Attachment[]> {
  const result: Attachment[] = [];
  for (const file of files) {
    const buffer = await file.arrayBuffer();
    result.push({
      id: crypto.randomUUID(),
      name: file.name,
      mimeType: file.type || 'application/octet-stream',
      size: file.size,
      data: new Uint8Array(buffer),
    });
  }
  return result;
}
