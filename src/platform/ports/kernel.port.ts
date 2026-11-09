/**
 * Port kỹ thuật mà application được phép dùng (thuần interface + token).
 * Implementation nằm ở src/platform/kernel/.
 */
export interface Clock {
  now(): Date;
}
export const CLOCK = Symbol('CLOCK');

export interface IdGenerator {
  /** UUID v4 — PK sinh ở app (§6.2) để đặt trước assistantMessageId. */
  uuid(): string;
}
export const ID_GENERATOR = Symbol('ID_GENERATOR');
