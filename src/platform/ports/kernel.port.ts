/**
 * Technical ports the application layer may use (pure interfaces + tokens).
 * Implementations live in src/platform/kernel/.
 */
export interface Clock {
  now(): Date;
}
export const CLOCK = Symbol('CLOCK');

export interface IdGenerator {
  /** UUID v4 — PK generated in the app (§6.2) so assistantMessageId can be reserved up front. */
  uuid(): string;
}
export const ID_GENERATOR = Symbol('ID_GENERATOR');
