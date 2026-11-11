import type { MessageSender } from '../domain/message';

/**
 * Public operations for the conversation fork (A12a, conversations context).
 * Writes to the `messages` table stay inside this context. Callers have already
 * authorized and locked the source conversation; all calls run in the caller's
 * transaction.
 */
export interface ForkMessageSource {
  /** A live message of that conversation, or null. */
  findMessage(
    conversationId: string,
    messageId: string,
  ): Promise<{ sequence: number; sender: MessageSender } | null>;
  /** Live messages with sequence ≤ throughSequence: how many, and their size in bytes. */
  prefixSize(
    conversationId: string,
    throughSequence: number,
  ): Promise<{ count: number; bytes: number }>;
  /**
   * Copies those live messages into `childId` with new ids and sequences 1..n
   * (original order, timestamps and metadata kept). Returns n.
   */
  copyPrefix(
    sourceId: string,
    childId: string,
    throughSequence: number,
  ): Promise<number>;
}
export const FORK_MESSAGE_SOURCE = Symbol('FORK_MESSAGE_SOURCE');
