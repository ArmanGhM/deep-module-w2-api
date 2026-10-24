export function renderError(container, options = {}) {
  if (!container) return;
  const {
    title = "خطا در دریافت اطلاعات",
    text = "ارتباط با سرور برقرار نشد. لطفاً دوباره تلاش کنید.",
    retryLabel = "تلاش مجدد",
    onRetry = null,
    errorType = "unknown",
  } = options;

  const icons = {
    offline: "📡",
    timeout: "⏱️",
    network: "🌐",
    http: "🚫",
    parse: "🧩",
    unknown: "⚠️",
  };
  const icon = icons[errorType] || "⚠️";

  const li = document.createElement("li");
  li.className = "state-error";
  li.setAttribute("role", "alert");
  li.dataset.errorType = errorType;

  const iconEl = document.createElement("div");
  iconEl.className = "state-error__icon";
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.textContent = icon;

  const titleEl = document.createElement("h3");
  titleEl.className = "state-error__title";
  titleEl.textContent = title;

  const textEl = document.createElement("p");
  textEl.className = "state-error__text";
  textEl.textContent = text;

  li.append(iconEl, titleEl, textEl);

  if (onRetry) {
    const actions = document.createElement("div");
    actions.className = "state-error__actions";

    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "btn-retry";
    btn.dataset.retry = "";

    const btnIcon = document.createElement("span");
    btnIcon.className = "btn-retry__icon";
    btnIcon.setAttribute("aria-hidden", "true");
    btnIcon.textContent = "🔄";

    const btnLabel = document.createElement("span");
    btnLabel.className = "btn-retry__label";
    btnLabel.textContent = retryLabel;

    btn.append(btnIcon, btnLabel);
    actions.append(btn);
    li.append(actions);

    btn.addEventListener("click", async () => {
      btn.classList.add("btn-retry--loading");
      btn.disabled = true;
      btnLabel.textContent = "در حال تلاش...";
      btnIcon.textContent = "⏳";
      try {
        await onRetry();
      } finally {
        if (btn.isConnected) {
          btn.classList.remove("btn-retry--loading");
          btn.disabled = false;
          btnLabel.textContent = retryLabel;
          btnIcon.textContent = "🔄";
        }
      }
    });
  }

  container.replaceChildren(li);
}

export function renderEmpty(container, options = {}) {
  if (!container) return;
  const {
    title = "چیزی برای نمایش نیست",
    text = "به‌زودی محصولات جدید اضافه می‌شود.",
    icon = "📭",
  } = options;

  const li = document.createElement("li");
  li.className = "state-empty";

  const iconEl = document.createElement("div");
  iconEl.className = "state-empty__icon";
  iconEl.setAttribute("aria-hidden", "true");
  iconEl.textContent = icon;

  const titleEl = document.createElement("h3");
  titleEl.className = "state-empty__title";
  titleEl.textContent = title;

  const textEl = document.createElement("p");
  textEl.className = "state-empty__text";
  textEl.textContent = text;

  li.append(iconEl, titleEl, textEl);
  container.replaceChildren(li);
}

export function renderSkeletonProducts(container, count = 4) {
  if (!container) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const li = document.createElement("li");
    li.className = "skeleton-card";
    li.setAttribute("aria-hidden", "true");

    const media = document.createElement("div");
    media.className = "skeleton skeleton-card__media";

    const title = document.createElement("div");
    title.className = "skeleton skeleton-card__title";

    const meta = document.createElement("div");
    meta.className = "skeleton skeleton-card__meta";

    const price = document.createElement("div");
    price.className = "skeleton skeleton-card__price";

    li.append(media, title, meta, price);
    frag.append(li);
  }

  container.replaceChildren(frag);
}

export function renderSkeletonCategories(container, count = 7) {
  if (!container) return;

  const frag = document.createDocumentFragment();
  for (let i = 0; i < count; i++) {
    const li = document.createElement("li");
    li.className = "skeleton-category";
    li.setAttribute("aria-hidden", "true");

    const icon = document.createElement("div");
    icon.className = "skeleton skeleton-category__icon";

    const title = document.createElement("div");
    title.className = "skeleton skeleton-category__title";

    li.append(icon, title);
    frag.append(li);
  }

  container.replaceChildren(frag);
}

let offlineBannerEl = null;

export function showOfflineBanner() {
  if (offlineBannerEl) return;

  const banner = document.createElement("div");
  banner.className = "offline-banner";
  banner.setAttribute("role", "alert");

  const icon = document.createElement("span");
  icon.className = "offline-banner__icon";
  icon.setAttribute("aria-hidden", "true");
  icon.textContent = "📡";

  const text = document.createElement("span");
  text.className = "offline-banner__text";
  text.textContent =
    "اتصال اینترنت شما قطع شد — از داده‌های ذخیره‌شده استفاده می‌شود";

  banner.append(icon, text);
  document.body.prepend(banner);

  requestAnimationFrame(() => banner.classList.add("offline-banner--visible"));

  offlineBannerEl = banner;
}

export function hideOfflineBanner() {
  if (!offlineBannerEl) return;

  const el = offlineBannerEl;
  offlineBannerEl = null;
  el.classList.remove("offline-banner--visible");
  setTimeout(() => el.remove(), 300);
}

let retryToastTimer = null;

export function showRetryToast({ attempt, total, waitMs }) {
  let toast = document.querySelector(".retry-toast");
  if (!toast) {
    toast = document.createElement("div");
    toast.className = "retry-toast";
    toast.setAttribute("role", "status");
    document.body.appendChild(toast);
  }

  const spinner = document.createElement("span");
  spinner.className = "retry-toast__spinner";
  spinner.setAttribute("aria-hidden", "true");

  const msg = document.createElement("span");
  msg.textContent = `تلاش مجدد (${attempt}/${total}) — ${Math.ceil(waitMs / 1000)} ثانیه...`;

  toast.replaceChildren(spinner, msg);
  requestAnimationFrame(() => toast.classList.add("retry-toast--visible"));

  clearTimeout(retryToastTimer);
  retryToastTimer = setTimeout(() => {
    toast.classList.remove("retry-toast--visible");
    setTimeout(() => toast.remove(), 300);
  }, waitMs + 500);
}
