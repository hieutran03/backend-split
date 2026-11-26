import type { Scenario } from '../context';
import {
  conversationListScenario,
  conversationsScenario,
  deleteConversationScenario,
  forkScenario,
} from './conversations';
import { authGuardScenario, authScenario } from './identity';
import { feedbackScenario, messagesScenario } from './messages';
import { engineMockScenario, healthScenario, outboxScenario } from './platform';
import { projectMembershipScenario, projectsScenario } from './projects';
import { taskPlansScenario } from './task-plans';

/** Run order. `outbox` comes last but one: it lists the events the others wrote. */
export const SCENARIOS: readonly Scenario[] = [
  healthScenario,
  authScenario,
  authGuardScenario,
  projectsScenario,
  conversationsScenario,
  conversationListScenario,
  messagesScenario,
  feedbackScenario,
  taskPlansScenario,
  forkScenario,
  projectMembershipScenario,
  deleteConversationScenario,
  outboxScenario,
  engineMockScenario,
];
