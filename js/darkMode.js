const THEME_BTN_SELECTOR = "#theme-btn";
const ICON_SELECTOR = ".theme-btn__icon";

const SVG_NS = "http://www.w3.org/2000/svg";

// آیکون خورشید (نمایش در دارک — کلیک → لایت)
const SVG_SUN = `
<svg class="svg_theme" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
     viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <circle cx="12" cy="12" r="4"></circle>
  <path d="M12 2v2"></path>
  <path d="M12 20v2"></path>
  <path d="m4.93 4.93 1.41 1.41"></path>
  <path d="m17.66 17.66 1.41 1.41"></path>
  <path d="M2 12h2"></path>
  <path d="M20 12h2"></path>
  <path d="m6.34 17.66-1.41 1.41"></path>
  <path d="m19.07 4.93-1.41 1.41"></path>
</svg>`;

// آیکون ماه (نمایش در لایت — کلیک → دارک)
const SVG_MOON = `
<svg class="svg_theme" xmlns="http://www.w3.org/2000/svg" width="24" height="24"
     viewBox="0 0 24 24" fill="none" stroke="currentColor"
     stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
  <path d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z"></path>
</svg>`;

// تبدیل رشته‌ی SVG به عنصر، با guard در برابر parsererror
function createSvgElement(svgString) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(svgString.trim(), "image/svg+xml");
  const root = doc.documentElement;

  const isSvg =
    root &&
    root.namespaceURI === SVG_NS &&
    root.tagName.toLowerCase() === "svg";
  const hasError = doc.querySelector("parsererror");

  if (!isSvg || hasError) {
    console.warn("⚠️ SVG نامعتبر بود، آیکون خالی استفاده می‌شود");
    const fallback = document.createElementNS(SVG_NS, "svg");
    fallback.setAttribute("class", "svg_theme");
    fallback.setAttribute("width", "24");
    fallback.setAttribute("height", "24");
    return fallback;
  }

  return root;
}

// کش — هر آیکون فقط یک بار پارس می‌شود
const ICONS = {
  sun: createSvgElement(SVG_SUN),
  moon: createSvgElement(SVG_MOON),
};

function getTheme() {
  try {
    return localStorage.getItem("theme") || "auto";
  } catch {
    return "auto";
  }
}

function setTheme(theme) {
  const html = document.documentElement;
  const icon = document.querySelector(ICON_SELECTOR);

  html.classList.remove("dark-theme", "light-theme");

  let iconKey = null;

  if (theme === "dark") {
    html.classList.add("dark-theme");
    iconKey = "sun";
  } else if (theme === "light") {
    html.classList.add("light-theme");
    iconKey = "moon";
  } else {
    if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
      html.classList.add("dark-theme");
      iconKey = "sun";
    } else {
      iconKey = "moon";
    }
  }

  if (icon && iconKey) {
    // cloneNode لازم است چون replaceChildren نود را move می‌کند
    icon.replaceChildren(ICONS[iconKey].cloneNode(true));
  }

  try {
    localStorage.setItem("theme", theme);
  } catch {}
}

// اعمال اولیه
setTheme(getTheme());

// حالت auto — واکنش به تغییر تم سیستم
window
  .matchMedia("(prefers-color-scheme: dark)")
  .addEventListener("change", () => {
    if (getTheme() === "auto") {
      setTheme("auto");
    }
  });

// کلیک — delegation
document.addEventListener("click", (e) => {
  const btn = e.target.closest(THEME_BTN_SELECTOR);
  if (!btn) return;

  const isDark = document.documentElement.classList.contains("dark-theme");
  setTheme(isDark ? "light" : "dark");
});
