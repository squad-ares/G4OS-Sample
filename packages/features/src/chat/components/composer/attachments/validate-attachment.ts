import type { Attachment } from '../../../types.ts';

const MAX_FILE_SIZE = 20 * 1024 * 1024;
const MAX_TOTAL_SIZE = 40 * 1024 * 1024;
const MAX_FILES = 10;

export function validateAttachments(
  incoming: ReadonlyArray<File>,
  existing: ReadonlyArray<Attachment>,
): string | null {
  if (existing.length + incoming.length > MAX_FILES) {
    return `Maximum ${MAX_FILES} files allowed.`;
  }
  for (const file of incoming) {
    if (file.size > MAX_FILE_SIZE) {
      return `"${file.name}" exceeds the 20 MB limit.`;
    }
  }
  const existingTotal = existing.reduce((sum, a) => sum + a.size, 0);
  const incomingTotal = incoming.reduce((sum, f) => sum + f.size, 0);
  if (existingTotal + incomingTotal > MAX_TOTAL_SIZE) {
    return 'Total attachment size exceeds 40 MB.';
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
