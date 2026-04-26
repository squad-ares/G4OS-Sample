import type { Message as ChatMessage } from '@g4os/features/chat';
import type { Message as KernelMessage } from '@g4os/kernel/types';

/**
 * Mapper de mensagens do kernel (`@g4os/kernel`) para o shape consumido pela
 * package `@g4os/features/chat`. Os shapes foram alinhados — este mapper é
 * agora pass-through para os blocos de conteúdo, com normalização leve do
 * envelope da mensagem (filter de campos extras como attachments/metadata
 * que o renderer não usa).
 */
export function kernelMessageToChat(msg: KernelMessage): ChatMessage {
  return {
    id: msg.id,
    role: msg.role,
    content: msg.content,
    createdAt: msg.createdAt,
  };
}
