export function isAllowedPaydunyaApiBaseUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'app.paydunya.com'
      && (url.pathname === '/api/v1' || url.pathname === '/sandbox-api/v1')
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

export function isPaydunyaCheckoutUrl(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  try {
    const url = new URL(value);
    return url.protocol === 'https:'
      && url.hostname === 'app.paydunya.com'
      && /^\/(?:sandbox-)?checkout\/invoice\/[A-Za-z0-9_-]+$/.test(url.pathname)
      && !url.search
      && !url.hash;
  } catch {
    return false;
  }
}

function constantTimeEqual(left: string, right: string): boolean {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

export async function verifyPaydunyaNotificationHash(
  masterKey: string,
  receivedHash: unknown
): Promise<boolean> {
  if (typeof receivedHash !== 'string' || !/^[a-f0-9]{128}$/i.test(receivedHash)) {
    return false;
  }
  const digest = await crypto.subtle.digest('SHA-512', new TextEncoder().encode(masterKey));
  const expectedHash = Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0')
  ).join('');
  return constantTimeEqual(expectedHash.toLowerCase(), receivedHash.toLowerCase());
}
