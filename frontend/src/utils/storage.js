const memoryStore = new Map();

/**
 * Safe storage wrapper that works identically in normal mode and incognito/private browsing mode.
 * If localStorage is blocked or throws a SecurityError/QuotaExceededError in private browsing,
 * it seamlessly falls back to memory storage without throwing exceptions.
 */
export const safeStorage = {
  getItem(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        return window.localStorage.getItem(key);
      }
    } catch {
      // Incognito mode fallback
    }
    return memoryStore.get(key) || null;
  },

  setItem(key, value) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.setItem(key, value);
      }
    } catch {
      // Incognito mode fallback
    }
    memoryStore.set(key, String(value));
  },

  removeItem(key) {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Incognito mode fallback
    }
    memoryStore.delete(key);
  },

  clear() {
    try {
      if (typeof window !== "undefined" && window.localStorage) {
        window.localStorage.clear();
      }
    } catch {
      // Incognito mode fallback
    }
    memoryStore.clear();
  },
};

export default safeStorage;

