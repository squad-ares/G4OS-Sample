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

  // Largura cap close ao V1 (~34rem em telas grandes) — texto >80% viewport
  // fica difícil de ler em monitor wide. V1: 30rem sm, 34rem lg.
  return (
    <div className="flex justify-end px-4 py-1">
      <div className="ml-auto w-fit max-w-[calc(100vw-5.5rem)] rounded-2xl bg-foreground/10 px-3.5 py-2.5 text-sm leading-relaxed text-foreground sm:max-w-[30rem] lg:max-w-[34rem]">
        <p className="whitespace-pre-wrap">{text}</p>
      </div>
    </div>
  );
}
