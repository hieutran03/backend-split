/**
 * Message — `messages` table (§6). Read-only in this context: messages are
 * written by the generations context (W4), which advances
 * conversations.next_message_sequence under a row lock (§11).
 *
 * S4: the DB keeps `sender` as an integer while the table is shared with Python
 * (1 = user, 2 = assistant); the API exposes the string.
 */
export type MessageSender = 'user' | 'assistant';

const SENDER_BY_CODE: Readonly<Record<number, MessageSender>> = {
  1: 'user',
  2: 'assistant',
};

export function senderFromCode(code: number): MessageSender {
  const sender = SENDER_BY_CODE[code];
  if (!sender) throw new Error(`Unknown messages.sender code: ${code}`);
  return sender;
}

export function senderToCode(sender: MessageSender): number {
  return sender === 'user' ? 1 : 2;
}

export interface MessageProps {
  readonly id: string;
  readonly conversationId: string;
  readonly sender: MessageSender;
  readonly content: string;
  readonly metadata: Record<string, unknown> | null;
  readonly sequence: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
  readonly deletedAt: Date | null;
}

export class Message {
  private constructor(private readonly props: MessageProps) {}

  public static restore(props: MessageProps): Message {
    return new Message({ ...props });
  }

  public get id(): string {
    return this.props.id;
  }

  public snapshot(): Readonly<MessageProps> {
    return { ...this.props };
  }
}
