export function isStaleActionError(msg: string): boolean {
  return /Failed to find Server Action|older or newer deployment/i.test(msg);
}
