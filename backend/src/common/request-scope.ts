import { AsyncLocalStorage } from "node:async_hooks";

const storage = new AsyncLocalStorage<Map<string, Promise<unknown>>>();

/**
 * Reads memoized for one HTTP request (H4). A request that needs the same
 * project in several modules (its team, its idea, its submissions) reads it
 * once. Nothing outlives the request, so no user ever sees another request's
 * data; repositories forget their keys when they write, and reads inside a
 * transaction never go through it. Outside a request it just loads.
 */
export const RequestScope = {
  run<T>(work: () => T): T {
    return storage.run(new Map(), work);
  },

  memo<T>(key: string, load: () => Promise<T>): Promise<T> {
    const store = storage.getStore();
    if (!store) return load();
    const known = store.get(key) as Promise<T> | undefined;
    if (known) return known;
    const loading = load();
    store.set(key, loading);
    // A failed read is not remembered: the next caller tries again.
    loading.catch(() => store.delete(key));
    return loading;
  },

  forget(key: string): void {
    storage.getStore()?.delete(key);
  },

  /** Forgets every key that starts with `prefix`. */
  forgetAll(prefix: string): void {
    const store = storage.getStore();
    if (!store) return;
    for (const key of [...store.keys()]) {
      if (key.startsWith(prefix)) store.delete(key);
    }
  },
};
