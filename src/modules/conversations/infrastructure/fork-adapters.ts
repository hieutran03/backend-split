import { createHash } from 'node:crypto';

import type { ForkMessageSource } from '@modules/messages/public-api';
import type { ForkFingerprint, ForkMessages } from '../application/ports';

/**
 * Port of Python `fork_request_fingerprint` (services/conversation_fork_service.py),
 * so a retry of a fork Python created is recognized (TC-53):
 *
 *   sha256(json.dumps({"source_conversation_id", "message_id", "title"},
 *          sort_keys=True, separators=(",", ":"), ensure_ascii=False)).hexdigest()
 *
 * JSON.stringify of an object whose keys are inserted in sorted order produces
 * the same bytes: no spaces, non-ASCII kept as is, the same escapes for quotes,
 * backslash and control characters. UUIDs are lowercase (Python `str(UUID)`);
 * `title` is the REQUESTED value (null when absent), never the default.
 */
export class Sha256ForkFingerprint implements ForkFingerprint {
  public of(input: {
    sourceConversationId: string;
    messageId: string;
    title: string | null;
  }): string {
    const canonical = JSON.stringify({
      message_id: input.messageId.toLowerCase(),
      source_conversation_id: input.sourceConversationId.toLowerCase(),
      title: input.title,
    });
    return createHash('sha256').update(canonical, 'utf8').digest('hex');
  }
}

/** ForkMessages (this context's port) ⇒ messages context public operations. */
export class ForkMessageSourceAdapter implements ForkMessages {
  public constructor(private readonly source: ForkMessageSource) {}

  public findMessage(conversationId: string, messageId: string) {
    return this.source.findMessage(conversationId, messageId);
  }

  public prefixSize(conversationId: string, throughSequence: number) {
    return this.source.prefixSize(conversationId, throughSequence);
  }

  public copyPrefix(
    sourceId: string,
    childId: string,
    throughSequence: number,
  ) {
    return this.source.copyPrefix(sourceId, childId, throughSequence);
  }
}
