/** Pass sign bundles editor → sign.html without URL query strings (avoids 414 on large txs). */
export const SIGN_BUNDLE_STORAGE_KEY = 'samizdat-pending-sign-bundle';

export function stashSignBundle(bundleJson: string): void {
  sessionStorage.setItem(SIGN_BUNDLE_STORAGE_KEY, bundleJson);
}

export function takeStashedSignBundle(): string | null {
  const value = sessionStorage.getItem(SIGN_BUNDLE_STORAGE_KEY);
  if (value !== null) sessionStorage.removeItem(SIGN_BUNDLE_STORAGE_KEY);
  return value;
}
