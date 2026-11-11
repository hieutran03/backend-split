import { createHash } from 'node:crypto';

import type { ForkMessageSource } from '@modules/messages/public-api';
import type { ForkFingerprint, ForkMessages } from '../application/ports';

/**
 * sha256(sourceId, messageId, requested title) — the three inputs named by the
 * spec (S8). The exact Python serialization is not in the spec (TC-53): here the
 * JSON array `[sourceId, messageId, title|null]`, hex encoded (64 chars, fits
 * fork_request_fingerprint VARCHAR(64)).
 */
export class Sha256ForkFingerprint implements ForkFingerprint {
  public of(input: {
    sourceConversationId: string;
    messageId: string;
    title: string | null;
  }): string {
    return createHash('sha256')
      .update(
        JSON.stringify([
          input.sourceConversationId.toLowerCase(),
          input.messageId.toLowerCase(),
          input.title,
        ]),
      )
      .digest('hex');
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
