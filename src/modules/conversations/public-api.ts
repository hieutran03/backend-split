/**
 * Public surface of the conversations context. Next: CONV-02 (delete + outbox),
 * MSG-01 will need a read port for conversation ownership.
 */
export { ConversationsModule } from './conversations.module';
export { ConversationRecord } from './infrastructure/conversation.record';
