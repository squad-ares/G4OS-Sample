import type { Message, TextBlock } from '../../../types.ts';

interface UserMessageProps {
  readonly message: Message;
}

function extractText(message: Message): string {
  return message.content
    .filter((b): b is TextBlock => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
}

export function UserMessage({ message }: UserMessageProps) {
  const text = extractText(message);

  return (
    <div className="flex justify-end px-4 py-1">
      <div className="max-w-[80%] rounded-2xl bg-foreground/10 px-3.5 py-2.5 text-sm leading-relaxed text-foreground">
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}
