import { formatPrice } from "./utils.js";
import { addToCart, openModal } from "./cart.js";

export function openProductDetail(product) {
  const modal = document.getElementById("product-modal");
  if (!modal) return;

  const body = modal.querySelector(".modal__body");
  if (!body) return;

  const wrap = document.createElement("div");
  wrap.className = "product-detail";

  const media = document.createElement("div");
  media.className = "product-detail__media";

  const emoji = document.createElement("span");
  emoji.className = "product-detail__emoji";
  emoji.textContent = product.emoji || "📦";
  media.append(emoji);

  const info = document.createElement("div");
  info.className = "product-detail__info";

  const title = document.createElement("h2");
  title.className = "product-detail__title";
  title.textContent = product.name;

  const unit = document.createElement("p");
  unit.className = "product-detail__unit";
  unit.textContent = product.unit;

  const desc = document.createElement("p");
  desc.className = "product-detail__desc";
  desc.textContent =
    "محصول تازه و با کیفیت از فروشگاه سبزکاله. ارسال سریع به سراسر شهر.";

  const priceWrap = document.createElement("div");
  priceWrap.className = "product-detail__price";

  const priceValue = document.createElement("span");
  priceValue.className = "product-detail__price-value";
  priceValue.textContent = formatPrice(product.price);
  priceWrap.append(priceValue);

  const addBtn = document.createElement("button");
  addBtn.type = "button";
  addBtn.className = "btn btn--primary product-detail__add";
  addBtn.dataset.id = String(product.id);

  const cartIcon = document.createElement("span");
  cartIcon.setAttribute("aria-hidden", "true");
  cartIcon.textContent = "🛒";
  addBtn.append(cartIcon, " افزودن به سبد خرید");

  addBtn.addEventListener("click", () => {
    addToCart(product);

    addBtn.replaceChildren("✓ اضافه شد");
    addBtn.classList.add("btn--success");

    setTimeout(() => {
      const icon = document.createElement("span");
      icon.setAttribute("aria-hidden", "true");
      icon.textContent = "🛒";
      addBtn.replaceChildren(icon, " افزودن به سبد خرید");
      addBtn.classList.remove("btn--success");
    }, 1500);
  });

  info.append(title, unit, desc, priceWrap, addBtn);
  wrap.append(media, info);
  body.replaceChildren(wrap);

  openModal("product-modal");
}
