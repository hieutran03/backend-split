/** Public surface of the messages context. */
export { MessagesModule } from './messages.module';
export { MessageRecord } from './infrastructure/message.record';
export {
  CONVERSATION_MESSAGE_DIGEST,
  type ConversationMessageDigest,
} from './application/message-digest';
export type { MessageView } from './application/message.view';
export {
  MESSAGE_OWNERSHIP,
  type MessageOwnership,
} from './application/message-ownership';
