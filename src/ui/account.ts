import { randomUUID } from '../util/uuid';
import { accountToCode } from '../net/socialProtocol';

const ACCOUNT_KEY = 'wildreach.accountId';

export function getAccountId(): string {
  try {
    const existing = localStorage.getItem(ACCOUNT_KEY)?.trim();
    if (existing && existing.length >= 8) return existing;
  } catch {
    /* ignore */
  }
  const id = randomUUID();
  try {
    localStorage.setItem(ACCOUNT_KEY, id);
  } catch {
    /* ignore */
  }
  return id;
}

export function getFriendCode(): string {
  return accountToCode(getAccountId());
}
