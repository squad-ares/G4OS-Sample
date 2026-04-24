import type { ContentBlock as ChatBlock, Message as ChatMessage } from '@g4os/features/chat';
import type { ContentBlock as KernelBlock, Message as KernelMessage } from '@g4os/kernel/types';

function mapBlock(block: KernelBlock): ChatBlock {
  switch (block.type) {
    case 'text':
      return block;
    case 'thinking':
      return { type: 'thinking', thinking: block.text };
    case 'tool_use':
      return { type: 'tool_use', id: block.toolUseId, name: block.toolName, input: block.input };
    case 'tool_result':
      return {
        type: 'tool_result',
        toolUseId: block.toolUseId,
        content: block.content,
        isError: block.isError,
      };
  }
}

export function kernelMessageToChat(msg: KernelMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role === 'tool' ? 'system' : msg.role,
    content: msg.content.map(mapBlock),
    createdAt: msg.createdAt,
  };
}
