/** Accept only the configured native PKCE callback. Tokens and other actions have no route here. */
export function callbackCode(url: string, expected: string): string | null {
  try {
    const actual = new URL(url);
    const callback = new URL(expected);
    if (actual.protocol !== callback.protocol || actual.host !== callback.host ||
        actual.pathname !== callback.pathname || actual.username || actual.password || actual.hash) return null;
    const codes = actual.searchParams.getAll("code");
    if (codes.length !== 1 || !/^[A-Za-z0-9_-]{10,256}$/.test(codes[0])) return null;
    return codes[0];
  } catch {
    return null;
  }
}
