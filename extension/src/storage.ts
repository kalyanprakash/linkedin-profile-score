/**
 * Cross-browser storage, in the smallest form that actually works.
 *
 * Chrome MV3's `chrome.storage.local` returns promises. Firefox exposes the same
 * API twice: `browser.storage.local` is promise-based, while its `chrome.*` alias
 * is callback-only and returns undefined. Awaiting that alias silently yields
 * undefined, so the persona choice would quietly stop persisting in Firefox
 * without anything appearing to be broken.
 *
 * Everything is best-effort: the panel works with no storage at all, it just
 * forgets the selected goal between page loads.
 */
type Bag = Record<string, unknown>;

interface RawArea {
  get(key: string, cb?: (v: Bag) => void): Promise<Bag> | undefined;
  set(items: Bag, cb?: () => void): Promise<void> | undefined;
}

function area(): RawArea | null {
  const g = globalThis as Record<string, any>;
  return g.browser?.storage?.local ?? g.chrome?.storage?.local ?? null;
}

/** Resolves whether the underlying call is promise-based or callback-based. */
function either<T>(invoke: (cb: (v: T) => void) => Promise<T> | undefined, fallback: T): Promise<T> {
  return new Promise<T>((resolve) => {
    let settled = false;
    const done = (v: T) => { if (!settled) { settled = true; resolve(v ?? fallback); } };
    try {
      const maybe = invoke(done);
      if (maybe && typeof (maybe as Promise<T>).then === 'function') {
        (maybe as Promise<T>).then(done, () => done(fallback));
      }
    } catch {
      done(fallback);
    }
    // Neither path fired: no storage permission, or a stubbed API.
    setTimeout(() => done(fallback), 200);
  });
}

export async function readKey(key: string): Promise<string | undefined> {
  const a = area();
  if (!a) return undefined;
  const bag = await either<Bag>((cb) => a.get(key, cb), {});
  const value = bag?.[key];
  return typeof value === 'string' ? value : undefined;
}

export async function writeKey(key: string, value: string): Promise<void> {
  const a = area();
  if (!a) return;
  await either<void>((cb) => a.set({ [key]: value }, cb), undefined);
}
