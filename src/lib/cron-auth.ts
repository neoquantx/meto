export function isCronAuthorized(
  authorization: string | null,
  secret: string | undefined,
) {
  if (!secret) return false;
  return authorization === `Bearer ${secret}`;
}
