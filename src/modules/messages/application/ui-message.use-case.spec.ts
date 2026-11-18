import { InMemoryMessageRepository } from '@test-support/message-fakes';
import { NotFoundError } from '@shared/errors/app-error';
import {
  GetMessageUseCase,
  ListConversationUiMessagesUseCase,
} from './message.use-cases';

const alice = { userId: 'alice', isAdmin: false };
const bob = { userId: 'bob', isAdmin: false };
const PAGE = { page: 1, limit: 20 };
const RICH = {
  inlineRichResponseV1: true,
  answerVisualsV1: false,
  sourceFiguresV1: false,
};

function setup(serverEnabled = true) {
  const repo = new InMemoryMessageRepository();
  repo.addConversation('c1', 'alice');
  const at = new Date(Date.UTC(2026, 10, 18));
  repo.add({
    id: 'm1',
    conversationId: 'c1',
    sender: 'user',
    content: 'Question',
    metadata: null,
    sequence: 1,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  repo.add({
    id: 'm2',
    conversationId: 'c1',
    sender: 'assistant',
    content: 'See <!--rich:img1-->',
    metadata: {
      rich_items_version: 1,
      rich_items: [
        {
          id: 'img1',
          type: 'image',
          payload: { url: '/chat-images/1', original_image_url: 'https://p' },
        },
      ],
      images_count: 1,
    },
    sequence: 2,
    createdAt: at,
    updatedAt: at,
    deletedAt: null,
  });
  return {
    repo,
    list: new ListConversationUiMessagesUseCase(repo, serverEnabled),
    get: new GetMessageUseCase(repo),
  };
}

describe('A10 format=ui-message (MSG-02)', () => {
  it('same page as A10 (default -sequence), projected to UIMessages', async () => {
    const page = await setup().list.execute(alice, 'c1', PAGE, RICH);
    expect(page.items.map((m) => [m.id, m.role])).toEqual([
      ['m2', 'assistant'],
      ['m1', 'user'],
    ]);
    expect(page.items[0]).toMatchObject({
      content: 'See <!--rich:img1-->',
      parts: [{ type: 'text', text: 'See <!--rich:img1-->' }],
      metadata: {
        rich_items_version: 1,
        rich_items: [
          { id: 'img1', type: 'image', payload: { url: '/chat-images/1' } },
        ],
      },
      createdAt: '2026-11-18T00:00:00.000Z',
    });
    expect(page.meta.total).toBe(2);
  });

  it('server kill switch off ⇒ markers stripped, image as a file part', async () => {
    const page = await setup(false).list.execute(alice, 'c1', PAGE, RICH);
    expect(page.items[0]).toMatchObject({
      content: 'See ',
      parts: [
        { type: 'text', text: 'See ' },
        { type: 'file', url: '/chat-images/1', mediaType: 'image/png' },
      ],
    });
  });

  it('another user ⇒ 404 conversation_not_found', async () => {
    const error = await setup()
      .list.execute(bob, 'c1', PAGE, RICH)
      .catch((e: unknown) => e);
    expect(error).toBeInstanceOf(NotFoundError);
    expect((error as NotFoundError).reason).toBe('conversation_not_found');
  });

  it('A19/A10 views sanitize metadata like Python MessageRead', async () => {
    const view = await setup().get.execute(alice, 'm2');
    expect(JSON.stringify(view.messageMetadata)).not.toContain('https://p');
    expect(view.messageMetadata).toHaveProperty('images_count', 1);
  });
});
