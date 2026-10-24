import {
  formatPrice,
  safeHref,
  isValidProduct,
  isValidCategory,
} from "./utils.js";
import { addToCart, initCart } from "./cart.js";
import { api, ApiError, watchConnectivity } from "./GetItemItemGet.js";
import {
  renderError,
  renderEmpty,
  renderSkeletonProducts,
  renderSkeletonCategories,
  showOfflineBanner,
  hideOfflineBanner,
  showRetryToast,
} from "./states.js";

const SVG_NS = "http://www.w3.org/2000/svg";

function el(tag, props = {}, ...children) {
  const node = document.createElement(tag);
  applyProps(node, props);
  appendChildren(node, children);
  return node;
}

function svg(tag, props = {}, ...children) {
  const node = document.createElementNS(SVG_NS, tag);
  applyProps(node, props, true);
  appendChildren(node, children);
  return node;
}

function applyProps(node, props, isSvg = false) {
  for (const [k, v] of Object.entries(props)) {
    if (v == null || v === false) continue;

    if (k === "class" || k === "className") {
      node.className = Array.isArray(v)
        ? v.filter(Boolean).join(" ")
        : String(v);
      continue;
    }
    if (k === "text") {
      node.textContent = String(v);
      continue;
    }
    if (k === "style" && typeof v === "object") {
      for (const [sk, sv] of Object.entries(v)) {
        if (sk.startsWith("--")) node.style.setProperty(sk, String(sv));
        else node.style[sk] = String(sv);
      }
      continue;
    }
    if (k === "dataset" && typeof v === "object") {
      for (const [dk, dv] of Object.entries(v)) {
        if (dv == null) continue;
        node.dataset[dk] = String(dv);
      }
      continue;
    }
    if (!isSvg && k.startsWith("on") && typeof v === "function") {
      node.addEventListener(k.slice(2).toLowerCase(), v);
      continue;
    }
    if (v === true) node.setAttribute(k, "");
    else node.setAttribute(k, String(v));
  }
}

function appendChildren(node, children) {
  for (const c of children) {
    if (c == null || c === false || c === "") continue;
    if (Array.isArray(c)) appendChildren(node, c);
    else if (c.nodeType) node.append(c);
    else node.append(document.createTextNode(String(c)));
  }
}

function clear(node) {
  if (node) node.replaceChildren();
}

function setMultilineText(node, text, maxLen = 200, sep = "،") {
  if (!node) return;
  node.replaceChildren();
  const parts = String(text).slice(0, maxLen).split(sep);
  parts.forEach((part, i) => {
    if (i > 0) node.append(document.createElement("br"));
    node.append(document.createTextNode(part.trim()));
  });
}

function createArrowSvg() {
  return svg(
    "svg",
    {
      viewBox: "0 0 24 24",
      width: 14,
      height: 14,
      "aria-hidden": "true",
    },
    svg("path", {
      d: "M5 12h14M13 6l6 6-6 6",
      fill: "none",
      stroke: "currentColor",
      "stroke-width": 2.5,
      "stroke-linecap": "round",
      "stroke-linejoin": "round",
    }),
  );
}

const filterState = {
  categoryId: "all",
  stock: "all",
  discount: "all",
  sort: "default",
};

let allProductsData = [];
let allOffersData = [];
let allStockItems = {};
let allCategoriesData = [];

let lastLoadError = null;
let isLoading = false;

function createProductCard(product, offer = null, quantity = null) {
  if (!isValidProduct(product)) return null;

  const id = product.id;
  const isOut = quantity === 0;

  const card = el("li", {
    class: ["product-card", isOut && "product-card--unavailable"],
    dataset: { id: String(id) },
  });

  if (isOut) {
    card.append(el("span", { class: "badge badge--danger", text: "ناموجود" }));
  } else if (offer && Number.isFinite(offer.percent)) {
    const pct = Math.min(Math.max(Number(offer.percent), 0), 99);
    card.append(el("span", { class: "badge", text: `${pct}٪` }));
  }

  const media = el(
    "div",
    { class: "product-card__media" },
    el("span", {
      class: "product-card__emoji",
      "aria-hidden": "true",
      text: product.emoji || "📦",
    }),
  );

  const title = el("h3", { class: "product-card__title", text: product.name });
  const meta = el("p", { class: "product-card__meta", text: product.unit });

  const priceBox = el("div", { class: "product-card__price" });
  if (offer && !isOut && Number.isFinite(offer.percent)) {
    const pct = Math.min(Math.max(Number(offer.percent), 0), 99);
    const finalPrice = Math.round(product.price * (1 - pct / 100));
    priceBox.append(
      el("del", { text: formatPrice(product.price) }),
      el("ins", { text: formatPrice(finalPrice) }),
    );
  } else {
    priceBox.append(el("ins", { text: formatPrice(product.price) }));
  }

  const addBtn = el("button", {
    type: "button",
    class: "btn-add",
    dataset: { id: String(id) },
    "aria-label": isOut ? "ناموجود" : `افزودن ${product.name} به سبد`,
    disabled: isOut,
    text: "+",
  });

  if (!isOut) {
    addBtn.addEventListener("click", (e) => {
      e.stopPropagation();
      addToCart(product);
      addBtn.classList.add("btn-add--added");
      addBtn.textContent = "✓";
      setTimeout(() => {
        addBtn.classList.remove("btn-add--added");
        addBtn.textContent = "+";
      }, 800);
    });
  }

  card.append(
    media,
    title,
    meta,
    el("div", { class: "product-card__footer" }, priceBox, addBtn),
  );

  return card;
}

function renderFilteredProducts() {
  const track = document.getElementById("all-track");
  const countEl = document.getElementById("all-count");
  if (!track) return;
  if (allProductsData.length === 0) return;

  let result = [...allProductsData];

  if (filterState.categoryId !== "all") {
    result = result.filter(
      (p) => p.categoryId === Number(filterState.categoryId),
    );
  }
  if (filterState.stock === "in") {
    result = result.filter((p) => (allStockItems[p.id] ?? 0) > 0);
  } else if (filterState.stock === "out") {
    result = result.filter((p) => (allStockItems[p.id] ?? 0) === 0);
  }
  if (filterState.discount === "yes") {
    result = result.filter((p) =>
      allOffersData.some((o) => o.productId === p.id),
    );
  }

  if (filterState.sort === "price-asc") {
    result.sort((a, b) => a.price - b.price);
  } else if (filterState.sort === "price-desc") {
    result.sort((a, b) => b.price - a.price);
  } else if (filterState.sort === "name") {
    result.sort((a, b) => a.name.localeCompare(b.name, "fa"));
  }

  clear(track);

  if (result.length === 0) {
    track.append(
      el(
        "li",
        { class: "products-empty" },
        el("span", { class: "products-empty__icon", text: "🔍" }),
        el("p", { class: "products-empty__text", text: "محصولی پیدا نشد" }),
        el("p", {
          class: "products-empty__hint",
          text: "فیلترها را تغییر دهید",
        }),
      ),
    );
  } else {
    const frag = document.createDocumentFragment();
    for (const p of result) {
      const offer = allOffersData.find((o) => o.productId === p.id);
      const card = createProductCard(p, offer, allStockItems[p.id]);
      if (card) frag.append(card);
    }
    track.append(frag);
  }

  if (countEl) {
    countEl.textContent = `${result.length.toLocaleString("fa-IR")} کالا`;
  }

  const activeCount = [
    filterState.categoryId !== "all",
    filterState.stock !== "all",
    filterState.discount !== "all",
    filterState.sort !== "default",
  ].filter(Boolean).length;

  const badge = document.getElementById("filter-badge");
  if (badge) {
    if (activeCount > 0) {
      badge.hidden = false;
      badge.textContent = activeCount.toLocaleString("fa-IR");
    } else {
      badge.hidden = true;
    }
  }
}

function setupFilterModal() {
  const filterBtn = document.getElementById("filter-btn");
  const filterModal = document.querySelector("#filter-modal");
  const categoriesBox = document.getElementById("filter-categories");
  const applyBtn = document.getElementById("filter-apply");
  const resetBtn = document.getElementById("filter-reset");

  if (!filterModal) {
    console.warn("مودال فیلتر پیدا نشد");
    return;
  }

  if (categoriesBox && allCategoriesData.length) {
    clear(categoriesBox);
    categoriesBox.append(
      el("button", {
        type: "button",
        class: "filter-chip filter-chip--active",
        dataset: { category: "all" },
        text: "همه",
      }),
      ...allCategoriesData.map((cat) =>
        el(
          "button",
          {
            type: "button",
            class: "filter-chip",
            dataset: { category: String(cat.id) },
          },
          el("span", { class: "filter-chip__emoji", text: cat.emoji || "" }),
          ` ${cat.name}`,
        ),
      ),
    );
  }

  filterBtn?.addEventListener("click", () => {
    filterModal.classList.add("modal--open");
    document.body.style.overflow = "hidden";
  });

  filterModal.addEventListener("click", (e) => {
    const chip = e.target.closest(".filter-chip");
    if (!chip) return;

    const box = chip.parentElement;
    box.querySelectorAll(".filter-chip").forEach((c) => {
      c.classList.remove("filter-chip--active");
    });
    chip.classList.add("filter-chip--active");

    if (chip.dataset.category !== undefined) {
      filterState.categoryId = chip.dataset.category;
    } else if (chip.dataset.stock !== undefined) {
      filterState.stock = chip.dataset.stock;
    } else if (chip.dataset.discount !== undefined) {
      filterState.discount = chip.dataset.discount;
    } else if (chip.dataset.sort !== undefined) {
      filterState.sort = chip.dataset.sort;
    }
  });

  applyBtn?.addEventListener("click", () => {
    renderFilteredProducts();
    filterModal.classList.remove("modal--open");
    document.body.style.overflow = "";
  });

  resetBtn?.addEventListener("click", () => {
    filterState.categoryId = "all";
    filterState.stock = "all";
    filterState.discount = "all";
    filterState.sort = "default";

    filterModal.querySelectorAll(".filter-chips").forEach((box) => {
      const chips = box.querySelectorAll(".filter-chip");
      chips.forEach((c, i) => {
        c.classList.toggle("filter-chip--active", i === 0);
      });
    });
  });

  filterModal.querySelectorAll("[data-close]").forEach((elm) => {
    elm.addEventListener("click", () => {
      filterModal.classList.remove("modal--open");
      document.body.style.overflow = "";
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && filterModal.classList.contains("modal--open")) {
      filterModal.classList.remove("modal--open");
      document.body.style.overflow = "";
    }
  });
}

function renderAll({ products, categories, shop, home, offers, stock }) {
  const stockItems =
    stock?.items && typeof stock.items === "object" ? stock.items : {};

  allProductsData = products;
  allOffersData = offers;
  allStockItems = stockItems;
  allCategoriesData = categories;

  const topbarText = document.getElementById("topbar-text");
  if (topbarText && shop?.notice) {
    topbarText.textContent = String(shop.notice).slice(0, 200);
  }

  const brandName = document.getElementById("brand-name");
  if (brandName && shop?.name) {
    brandName.textContent = String(shop.name).slice(0, 50);
  }

  const brandSlogan = document.getElementById("brand-slogan");
  if (brandSlogan && shop?.slogan) {
    brandSlogan.textContent = String(shop.slogan).slice(0, 100);
  }

  const navLinks = document.getElementById("nav-links");
  if (navLinks && Array.isArray(shop?.menu)) {
    clear(navLinks);
    shop.menu.slice(0, 10).forEach((item) => {
      if (!item || typeof item !== "object") return;
      navLinks.append(
        el(
          "li",
          {},
          el("a", {
            href: safeHref(item.href),
            text: String(item.label || "").slice(0, 50),
          }),
        ),
      );
    });
  }

  const megaList = document.getElementById("mega-list");
  if (megaList && categories.length) {
    clear(megaList);
    categories.forEach((cat) => {
      megaList.append(
        el(
          "li",
          {},
          el(
            "a",
            { href: `#cat-${cat.id}`, role: "menuitem" },
            el("span", { "aria-hidden": "true", text: cat.emoji || "" }),
            ` ${cat.name}`,
          ),
        ),
      );
    });
  }

  if (home?.hero && typeof home.hero === "object") {
    const heroTitle = document.getElementById("hero-title");
    if (heroTitle && typeof home.hero.title === "string") {
      setMultilineText(heroTitle, home.hero.title, 200);
    }

    const heroText = document.querySelector(
      ".hero-card--primary .hero-card__text",
    );
    if (heroText && typeof home.hero.text === "string") {
      heroText.textContent = home.hero.text.slice(0, 300);
    }

    const heroBtn = document.querySelector(
      ".hero-card--primary .hero-card__btn",
    );
    if (heroBtn && home.hero.cta) {
      heroBtn.href = safeHref(home.hero.cta.href);
      const span = heroBtn.querySelector("span:first-child");
      if (span && home.hero.cta.label) {
        span.textContent = String(home.hero.cta.label).slice(0, 50);
      }
    }
  }

  if (home?.side && typeof home.side === "object") {
    const sideTitle = document.querySelector(
      ".hero-card--secondary .hero-card__title",
    );
    if (sideTitle && home.side.title) {
      sideTitle.textContent = String(home.side.title).slice(0, 100);
    }

    const sideText = document.querySelector(
      ".hero-card--secondary .hero-card__text",
    );
    if (sideText && home.side.text) {
      sideText.textContent = String(home.side.text).slice(0, 200);
    }

    const sideBtn = document.querySelector(
      ".hero-card--secondary .hero-card__btn",
    );
    if (sideBtn && home.side.cta) {
      sideBtn.href = safeHref(home.side.cta.href);
      const span = sideBtn.querySelector("span:first-child");
      if (span && home.side.cta.label) {
        span.textContent = String(home.side.cta.label).slice(0, 50);
      }
    }
  }

  const categoriesGrid = document.getElementById("categories-grid");
  if (categoriesGrid) {
    if (categories.length === 0) {
      clear(categoriesGrid);
      renderEmpty(categoriesGrid, {
        icon: "📂",
        title: "دسته‌بندی‌ای موجود نیست",
        text: "به‌زودی دسته‌بندی‌های جدید اضافه می‌شود.",
      });
    } else {
      clear(categoriesGrid);
      categories.forEach((cat, index) => {
        const color = /^#[0-9a-fA-F]{3,8}$/.test(cat.color || "")
          ? cat.color
          : "#f0f9f1";

        categoriesGrid.append(
          el(
            "li",
            { style: { "--i": String(index) } },
            el(
              "a",
              { href: `#cat-${cat.id}`, class: "category-card" },
              el("span", {
                class: "category-card__glow",
                style: { "--c": color },
              }),
              el("span", {
                class: "category-card__icon",
                style: { background: color },
                text: cat.emoji || "",
              }),
              el("span", {
                class: "category-card__title",
                text: cat.name,
              }),
              el(
                "span",
                { class: "category-card__arrow", "aria-hidden": "true" },
                createArrowSvg(),
              ),
            ),
          ),
        );
      });
    }
  }

  const specialTrack = document.getElementById("special-track");
  if (specialTrack) {
    clear(specialTrack);
    if (offers.length === 0) {
      renderEmpty(specialTrack, {
        icon: "🔥",
        title: "پیشنهاد ویژه‌ای موجود نیست",
        text: "به‌زودی پیشنهادهای جدید اضافه می‌شود.",
      });
    } else {
      const frag = document.createDocumentFragment();
      for (const offer of offers) {
        const product = products.find((p) => p.id === offer.productId);
        if (!product) continue;
        const card = createProductCard(product, offer, stockItems[product.id]);
        if (card) frag.append(card);
      }
      specialTrack.append(frag);
    }
  }

  const bannersWrapper = document.getElementById("banners-wrapper");
  if (bannersWrapper) {
    clear(bannersWrapper);
    if (Array.isArray(home?.promos) && home.promos.length > 0) {
      home.promos.slice(0, 10).forEach((promo) => {
        if (!promo || typeof promo !== "object") return;
        bannersWrapper.append(
          el(
            "a",
            { href: safeHref(promo.href), class: "banner" },
            el("span", {
              class: "banner__icon",
              "aria-hidden": "true",
              text: promo.emoji || "",
            }),
            el(
              "div",
              { class: "banner__content" },
              el("strong", { text: promo.text || "" }),
            ),
            el("span", {
              class: "banner__arrow",
              "aria-hidden": "true",
              text: "←",
            }),
          ),
        );
      });
    }
  }

  const categorySections = document.getElementById("category-sections");
  if (categorySections) {
    clear(categorySections);
    if (categories.length && products.length) {
      categories.forEach((cat) => {
        const catProducts = products.filter((p) => p.categoryId === cat.id);
        if (catProducts.length === 0) return;

        const track = el("ul", { class: "carousel__track" });
        catProducts.forEach((p) => {
          const card = createProductCard(p, null, stockItems[p.id]);
          if (card) track.append(card);
        });

        categorySections.append(
          el(
            "section",
            { id: `cat-${cat.id}`, class: "carousel-section" },
            el(
              "div",
              { class: "carousel-section__head" },
              el(
                "h2",
                { class: "section-head__title" },
                el("span", { "aria-hidden": "true", text: cat.emoji || "" }),
                ` ${cat.name}`,
              ),
              el("span", {
                class: "section-head__count",
                text: `${catProducts.length.toLocaleString("fa-IR")} کالا`,
              }),
            ),
            el(
              "div",
              {
                class: "carousel",
                role: "region",
                "aria-label": `کاروسل ${cat.name}`,
                tabindex: "0",
              },
              track,
            ),
          ),
        );
      });
    }
  }

  setupFilterModal();
  renderFilteredProducts();

  if (shop && typeof shop === "object") {
    const footerName = document.getElementById("footer-name");
    if (footerName && shop.name) {
      footerName.textContent = String(shop.name).slice(0, 50);
    }

    const footerAbout = document.getElementById("footer-about");
    if (footerAbout && shop.about) {
      footerAbout.textContent = String(shop.about).slice(0, 300);
    }

    const footerPhone = document.getElementById("footer-phone");
    if (footerPhone && shop.phone) {
      const phone = String(shop.phone)
        .replace(/[^\d+\-\s()]/g, "")
        .slice(0, 20);
      footerPhone.textContent = phone;
      footerPhone.href = `tel:${phone.replace(/[^\d+]/g, "")}`;
    }

    const footerLinks = document.getElementById("footer-links");
    if (footerLinks && categories.length) {
      clear(footerLinks);
      categories.slice(0, 5).forEach((cat) => {
        footerLinks.append(
          el("li", {}, el("a", { href: `#cat-${cat.id}`, text: cat.name })),
        );
      });
    }

    const footerHelp = document.getElementById("footer-help");
    if (footerHelp && Array.isArray(shop.help)) {
      clear(footerHelp);
      shop.help.slice(0, 10).forEach((item) => {
        if (!item || typeof item !== "object") return;
        footerHelp.append(
          el(
            "li",
            {},
            el("a", { href: safeHref(item.href), text: item.label || "" }),
          ),
        );
      });
    }

    const footerSchedule = document.getElementById("footer-schedule");
    if (footerSchedule && Array.isArray(shop.schedule)) {
      clear(footerSchedule);
      shop.schedule.slice(0, 7).forEach((item) => {
        if (!item || typeof item !== "object") return;
        footerSchedule.append(
          el(
            "p",
            { class: "footer__text" },
            item.days || "",
            el("br"),
            item.time || "",
          ),
        );
      });
    }

    const footerCopy = document.getElementById("footer-copy");
    if (footerCopy && shop.copyright) {
      footerCopy.textContent = String(shop.copyright).slice(0, 200);
    }
  }
}

function showErrorState(error) {
  const type = error?.type || "unknown";
  const msg = error?.userMessage || "ارتباط با سرور برقرار نشد.";
  const retry = () => loadAndRender();

  const topbar = document.getElementById("topbar-text");
  if (topbar) {
    const map = {
      offline: "📡 اتصال اینترنت قطع است — برخی اطلاعات در دسترس نیست",
      timeout: "⏱️ سرور پاسخ نداد — دوباره تلاش کنید",
      network: "🌐 خطا در ارتباط با سرور",
      http: `🚫 خطای سرور ${error?.status || ""}`.trim(),
      parse: "🧩 پاسخ سرور نامعتبر بود",
      unknown: "⚠️ اختلال موقت در سرویس",
    };
    topbar.textContent = map[type] || map.unknown;
  }

  renderError(document.getElementById("categories-grid"), {
    title: "دسته‌بندی‌ها در دسترس نیست",
    text: msg,
    onRetry: retry,
    errorType: type,
  });

  renderError(document.getElementById("special-track"), {
    title: "پیشنهاد ویژه در دسترس نیست",
    text: msg,
    onRetry: retry,
    errorType: type,
  });

  const banners = document.getElementById("banners-wrapper");
  if (banners) {
    renderError(banners, {
      title: "بنرها در دسترس نیست",
      text: "اطلاعات تبلیغاتی بارگذاری نشد.",
      onRetry: retry,
      errorType: type,
    });
  }

  renderError(document.getElementById("all-track"), {
    title: "خطا در دریافت محصولات",
    text: msg,
    onRetry: retry,
    errorType: type,
  });

  const catSections = document.getElementById("category-sections");
  if (catSections) clear(catSections);

  const footerHelp = document.getElementById("footer-help");
  if (footerHelp) {
    clear(footerHelp);
    footerHelp.append(
      el("li", {
        style: { color: "#94a3b8", fontSize: ".82rem" },
        text: "اطلاعات در دسترس نیست",
      }),
    );
  }
}

function showEmptyState() {
  renderEmpty(document.getElementById("categories-grid"), {
    icon: "📂",
    title: "هنوز دسته‌بندی‌ای اضافه نشده",
    text: "به‌زودی دسته‌بندی‌های جدید اضافه می‌شود.",
  });

  renderEmpty(document.getElementById("special-track"), {
    icon: "🔥",
    title: "پیشنهاد ویژه‌ای موجود نیست",
    text: "به‌زودی پیشنهادهای ویژه اضافه می‌شود.",
  });

  renderEmpty(document.getElementById("all-track"), {
    icon: "📦",
    title: "محصولی برای نمایش نیست",
    text: "به‌زودی محصولات جدید اضافه می‌شود.",
  });

  const banners = document.getElementById("banners-wrapper");
  if (banners) clear(banners);

  const catSections = document.getElementById("category-sections");
  if (catSections) clear(catSections);
}

async function loadAndRender() {
  if (isLoading) return;
  isLoading = true;
  lastLoadError = null;

  renderSkeletonCategories(document.getElementById("categories-grid"), 7);
  renderSkeletonProducts(document.getElementById("special-track"), 4);
  renderSkeletonProducts(document.getElementById("all-track"), 8);

  const retryOptions = {
    onRetry: ({ attempt, waitMs }) =>
      showRetryToast({ attempt, total: 3, waitMs }),
  };

  let data = null;

  try {
    const [products, categories, shop, home, offers, stock] = await Promise.all(
      [
        api.products(retryOptions),
        api.categories(retryOptions),
        api.shop(retryOptions),
        api.home(retryOptions),
        api.offers(retryOptions),
        api.stock(retryOptions),
      ],
    );

    const validProducts = Array.isArray(products)
      ? products.filter(isValidProduct)
      : [];

    const validCategories = Array.isArray(categories)
      ? categories.filter(isValidCategory)
      : [];

    const validOffers = Array.isArray(offers)
      ? offers.filter(
          (o) =>
            o &&
            Number.isInteger(o.productId) &&
            o.productId > 0 &&
            Number.isFinite(o.percent) &&
            o.percent > 0 &&
            o.percent < 100,
        )
      : [];

    data = {
      products: validProducts,
      categories: validCategories,
      shop: shop && typeof shop === "object" ? shop : {},
      home: home && typeof home === "object" ? home : {},
      offers: validOffers,
      stock: stock && typeof stock === "object" ? stock : { items: {} },
    };
  } catch (err) {
    console.error("خطا در لود داده‌ها:", err);
    lastLoadError = err instanceof ApiError ? err : new ApiError("خطای نامشخص");
  }

  isLoading = false;

  if (!data) {
    showErrorState(lastLoadError);
    initCart();
    return;
  }

  if (!data.products.length && !data.categories.length) {
    showEmptyState();
    initCart();
    return;
  }

  renderAll(data);
  initCart();
}

watchConnectivity({
  onOffline: () => {
    showOfflineBanner();
  },
  onOnline: () => {
    hideOfflineBanner();
    if (lastLoadError || allProductsData.length === 0) {
      loadAndRender();
    }
  },
});

if (!navigator.onLine) showOfflineBanner();

loadAndRender();
