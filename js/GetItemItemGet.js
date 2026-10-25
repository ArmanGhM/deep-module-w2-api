const API_BASE = "./js/api";
const DEFAULT_TIMEOUT = 8000;
const MAX_RETRIES = 3; // ۳ retry بعد از تلاش اول → مجموعاً ۴ بار
const CACHE_PREFIX = "shop_cache_";
const CACHE_TTL = 1000 * 60 * 30;

export class ApiError extends Error {
  constructor(message, { type = "unknown", status = null, url = null } = {}) {
    super(message);
    this.name = "ApiError";
    this.type = type;
    this.status = status;
    this.url = url;
  }

  get userMessage() {
    switch (this.type) {
      case "offline":
        return "اتصال اینترنت را بررسی کنید";
      case "timeout":
        return "پاسخی از سرور دریافت نشد";
      case "network":
        return "ارتباط با سرور برقرار نشد";
      case "http":
        if (this.status === 404) return "اطلاعات مورد نظر یافت نشد";
        if (this.status >= 500) return "سرور با مشکل مواجه است";
        return `خطای سرور (${this.status})`;
      case "parse":
        return "پاسخ سرور نامعتبر بود";
      default:
        return "خطای نامشخصی رخ داد";
    }
  }
}

async function fetchWithTimeout(
  url,
  { timeout = DEFAULT_TIMEOUT, signal } = {},
) {
  const controller = new AbortController();
  let timedOut = false;

  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeout);

  const onAbort = () => controller.abort();
  if (signal) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", onAbort, { once: true });
  }

  try {
    return await fetch(url, { signal: controller.signal });
  } catch (err) {
    if (err.name === "AbortError") {
      if (timedOut)
        throw new ApiError("درخواست منقضی شد", { type: "timeout", url });
      throw new ApiError("درخواست لغو شد", { type: "abort", url });
    }
    if (!navigator.onLine) {
      throw new ApiError("دستگاه آفلاین است", { type: "offline", url });
    }
    throw new ApiError("خطای شبکه", { type: "network", url });
  } finally {
    clearTimeout(timer);
    if (signal) signal.removeEventListener("abort", onAbort);
  }
}

// delay قابل لغو — اگر abort شد، بلافاصله resolve می‌شود
function delay(ms, signal) {
  return new Promise((resolve) => {
    if (signal?.aborted) return resolve();
    const id = setTimeout(() => {
      signal?.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(id);
      resolve();
    };
    signal?.addEventListener("abort", onAbort, { once: true });
  });
}

function cacheKey(url) {
  return CACHE_PREFIX + url.replace(/[^\w]/g, "_");
}

// بازگشت { hit, data } تا miss از داده‌ی falsy تفکیک شود
function readCache(url) {
  try {
    const raw = localStorage.getItem(cacheKey(url));
    if (!raw) return { hit: false, data: null };
    const { data, time } = JSON.parse(raw);
    if (Date.now() - time > CACHE_TTL) {
      localStorage.removeItem(cacheKey(url));
      return { hit: false, data: null };
    }
    return { hit: true, data };
  } catch {
    return { hit: false, data: null };
  }
}

function writeCache(url, data) {
  try {
    localStorage.setItem(
      cacheKey(url),
      JSON.stringify({ data, time: Date.now() }),
    );
  } catch {
    /* ignore quota errors */
  }
}

export function clearCache() {
  Object.keys(localStorage)
    .filter((k) => k.startsWith(CACHE_PREFIX))
    .forEach((k) => localStorage.removeItem(k));
}

export async function getJSON(path, options = {}) {
  const url = `${API_BASE}/${path}`;
  const {
    timeout = DEFAULT_TIMEOUT,
    retries = MAX_RETRIES,
    signal,
    useCache = true,
    onRetry = null,
  } = options;

  const maxAttempts = Math.max(1, (Number(retries) | 0) + 1);

  // آفلاین → فقط کش
  if (!navigator.onLine) {
    if (useCache) {
      const { hit, data } = readCache(url);
      if (hit) return data;
    }
    throw new ApiError("دستگاه آفلاین است", { type: "offline", url });
  }

  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    if (signal?.aborted) break;

    try {
      const res = await fetchWithTimeout(url, { timeout, signal });

      if (!res.ok) {
        throw new ApiError(`HTTP ${res.status}`, {
          type: "http",
          status: res.status,
          url,
        });
      }

      let data;
      try {
        data = await res.json();
      } catch {
        throw new ApiError("پاسخ سرور نامعتبر بود", { type: "parse", url });
      }

      if (useCache) writeCache(url, data);
      return data;
    } catch (err) {
      lastError =
        err instanceof ApiError ? err : new ApiError("خطای نامشخص", { url });

      const shouldRetry =
        lastError.type === "network" ||
        lastError.type === "timeout" ||
        (lastError.type === "http" && lastError.status >= 500);

      if (!shouldRetry || attempt === maxAttempts - 1 || signal?.aborted) break;

      const waitMs = Math.min(500 * Math.pow(2, attempt), 3000);
      if (onRetry) onRetry({ attempt: attempt + 1, waitMs, error: lastError });

      await delay(waitMs, signal);
    }
  }

  // Fallback به کش
  if (useCache) {
    const { hit, data } = readCache(url);
    if (hit) {
      console.warn(`📦 استفاده از کش برای: ${path}`);
      return data;
    }
  }

  throw lastError ?? new ApiError("خطای نامشخص", { url });
}

export const api = {
  products: (opts) => getJSON("products.json", opts),
  categories: (opts) => getJSON("categories.json", opts),
  shop: (opts) => getJSON("shop.json", opts),
  home: (opts) => getJSON("home.json", opts),
  offers: (opts) => getJSON("offers.json", opts),
  stock: (opts) => getJSON("stock.json", opts),
};

export function watchConnectivity({ onOnline, onOffline } = {}) {
  const online = () => onOnline?.();
  const offline = () => onOffline?.();
  window.addEventListener("online", online);
  window.addEventListener("offline", offline);
  return () => {
    window.removeEventListener("online", online);
    window.removeEventListener("offline", offline);
  };
}
