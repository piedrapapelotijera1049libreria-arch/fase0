/*
  Piedra, Papel o Tijera Librería
  Sitio 100% frontend: los productos se administran desde data/productos.json.
*/

// Configuración compartida y validada por las páginas de catálogo y carrito.
const DEFAULT_MAX_QUANTITY_PER_PRODUCT = 99;
const MAX_CART_LINES = 250;
const MAX_CART_STORED_ENTRIES = MAX_CART_LINES * 4;
const storeConfig = window.PPT_STORE_CONFIG && typeof window.PPT_STORE_CONFIG === "object"
  ? window.PPT_STORE_CONFIG
  : {};
const configuredMaxQuantity = storeConfig.maxQuantityPerProduct;
const CONFIG = Object.freeze({
  maxQuantityPerProduct: Number.isSafeInteger(configuredMaxQuantity)
    && configuredMaxQuantity >= 1
    && configuredMaxQuantity <= 999
    ? configuredMaxQuantity
    : DEFAULT_MAX_QUANTITY_PER_PRODUCT,
});

const ARS_PRICE_FORMATTER = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 0,
  maximumFractionDigits: 2,
});

const PRODUCTS_URL = "data/productos.json";
const FALLBACK_IMAGE = "img/producto-sin-imagen.svg";
let productos = [];
let catalogReady = false;
let catalogItemIndex = new Map();
let catalogByCategoryIndex = new Map();

const STORAGE_KEYS = {
  cart: "pptLibreriaCart",
};

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex='-1'])",
].join(",");

const state = {
  cart: loadCart(),
  activeCategory: "Todos",
  search: "",
  selectedVariants: {},
};

const elements = {
  header: document.querySelector("[data-header]"),
  productGrid: document.querySelector("#productGrid"),
  searchInput: document.querySelector("#searchInput"),
  clearSearchButton: document.querySelector("#clearSearchButton"),
  categoryFilters: document.querySelector("#categoryFilters"),
  resultCount: document.querySelector("#resultCount"),
  emptyState: document.querySelector("#emptyState"),
  cartButton: document.querySelector("#cartButton"),
  cartCount: document.querySelector("#cartCount"),
  productDialog: document.querySelector("#productDialog"),
  productDialogPanel: document.querySelector("#productDialogPanel"),
  closeProductDialog: document.querySelector("#closeProductDialog"),
  productDialogCategory: document.querySelector("#productDialogCategory"),
  productDialogImage: document.querySelector("#productDialogImage"),
  productDialogImageStatus: document.querySelector("#productDialogImageStatus"),
  productDialogTitle: document.querySelector("#productDialogTitle"),
  productDialogPrice: document.querySelector("#productDialogPrice"),
  productDialogDescription: document.querySelector("#productDialogDescription"),
  productDialogVariantGroup: document.querySelector("#productDialogVariantGroup"),
  productDialogOptionLabel: document.querySelector("#productDialogOptionLabel"),
  productDialogVariants: document.querySelector("#productDialogVariants"),
  productDialogSelection: document.querySelector("#productDialogSelection"),
  productDialogAdd: document.querySelector("#productDialogAdd"),
  toast: document.querySelector("#toast"),
  footerYear: document.querySelector("#footerYear"),
  mobileMenuToggle: document.querySelector("#mobileMenuToggle"),
  primaryNavigation: document.querySelector("#primaryNavigation"),
  mobileNavBackdrop: document.querySelector(".mobile-nav-backdrop[data-mobile-nav-close]"),
  categoryNav: document.querySelector(".category-nav"),
  categoryNavInner: document.querySelector(".category-nav__inner"),
  sectionNavLinks: Array.from(document.querySelectorAll(
    ".category-nav a[href^='#']:not([data-category-filter]):not([data-category-shortcut])",
  )),
};

const pageLockTargets = [
  document.querySelector(".skip-link"),
  document.querySelector(".site-header"),
  document.querySelector("main"),
  document.querySelector(".site-footer"),
  document.querySelector(".floating-whatsapp"),
].filter(Boolean);

const mobileMenuLockTargets = [
  document.querySelector(".skip-link"),
  document.querySelector(".utility-bar"),
  document.querySelector(".commerce-header > .brand"),
  document.querySelector(".header-search"),
  document.querySelector(".header-actions"),
  document.querySelector("main"),
  document.querySelector(".site-footer"),
  document.querySelector(".floating-whatsapp"),
].filter(Boolean);

let toastTimer = null;
let cartBumpTimer = null;
let revealObserver = null;
let animationEngineReady = false;
let smoothScroll = null;
let searchRenderFrame = null;
let productDialogReturnFocus = null;
let currentDialogVariant = null;
let mobileMenuReturnFocus = null;
let pendingCategoryShortcut = null;

init();

async function init() {
  setFooterYear();
  bindEvents();
  setupCategoryNavOverflow();
  setupHeaderBehavior();
  setupRevealAnimations();
  scheduleAnimationEnhancements();
  setCatalogLoading();

  try {
    const catalog = await loadProducts();
    productos = catalog.products;
    catalogItemIndex = buildCatalogIndex(productos);
    catalogByCategoryIndex = buildCategoryIndex(productos);
    catalogReady = true;
    pruneMissingCatalogItems();

    if (pendingCategoryShortcut) {
      const pendingCategory = pendingCategoryShortcut;
      pendingCategoryShortcut = null;
      if (pendingCategory === "Todos" || catalogByCategoryIndex.has(pendingCategory)) {
        state.activeCategory = pendingCategory;
        clearSearchState();
      }
    }

    renderCategoryFilters();
    renderProducts();
    renderCartBadge();

    if (catalog.invalidCount > 0) {
      showToast(`Se omitieron ${catalog.invalidCount} producto${catalog.invalidCount === 1 ? "" : "s"} con datos incompletos.`);
    }
  } catch (error) {
    showCatalogError(error);
    renderCartBadge();
  }
}

function scheduleAnimationEnhancements() {
  const startAnimations = () => {
    setupAnimationLibrary();
    refreshAnimationLibrary();
  };

  if (document.readyState === "complete") {
    startAnimations();
  } else {
    window.addEventListener("load", startAnimations, { once: true });
  }
}

function setFooterYear() {
  if (!elements.footerYear) return;
  elements.footerYear.textContent = String(new Date().getFullYear());
}

function setupCategoryNavOverflow() {
  const nav = elements.categoryNav;
  const scroller = elements.categoryNavInner;
  if (!nav || !scroller) return;

  const updateScrollState = () => {
    const atEnd = scroller.scrollLeft + scroller.clientWidth >= scroller.scrollWidth - 2;
    nav.classList.toggle("is-scroll-end", atEnd);
  };

  updateScrollState();
  scroller.addEventListener("scroll", updateScrollState, { passive: true });
  window.addEventListener("resize", updateScrollState);
}

async function loadProducts() {
  let data = window.PRODUCTOS_CATALOGO;

  if (!Array.isArray(data)) {
    const response = await fetch(PRODUCTS_URL);
    if (!response.ok) {
      throw new Error(`No se pudo leer ${PRODUCTS_URL} (${response.status}).`);
    }
    data = await response.json();
  }

  if (!Array.isArray(data)) {
    throw new Error(`${PRODUCTS_URL} debe contener una lista de productos.`);
  }

  const usedProductIds = new Set();
  const usedVariantIds = new Set();
  let invalidCount = 0;
  const products = data.flatMap((rawProduct, index) => {
    try {
      return [normalizeProduct(rawProduct, index, usedProductIds, usedVariantIds)];
    } catch (error) {
      invalidCount += 1;
      console.warn(error.message);
      return [];
    }
  });

  if (products.length === 0) {
    throw new Error(`${PRODUCTS_URL} no contiene productos válidos.`);
  }

  return { products, invalidCount };
}

function normalizeProduct(rawProduct, index, usedProductIds, usedVariantIds) {
  if (!rawProduct || typeof rawProduct !== "object" || Array.isArray(rawProduct)) {
    throw new Error(`Producto ${index + 1}: el registro no es válido.`);
  }

  const id = String(rawProduct.id ?? "").trim();
  const nombre = String(rawProduct.nombre ?? "").trim();
  const categoria = String(rawProduct.categoria ?? "").trim();
  const descripcion = String(rawProduct.descripcion ?? "").trim();
  const opcion = String(rawProduct.opcion ?? "Variante").trim() || "Variante";

  if (!id) throw new Error(`Producto ${index + 1}: falta el id.`);
  if (usedProductIds.has(id)) throw new Error(`Producto ${index + 1}: el id "${id}" está repetido.`);
  if (!nombre) throw new Error(`Producto ${index + 1}: falta el nombre.`);
  if (!categoria) throw new Error(`Producto ${index + 1}: falta la categoría.`);

  usedProductIds.add(id);

  const rawVariants = Array.isArray(rawProduct.variantes) && rawProduct.variantes.length > 0
    ? rawProduct.variantes
    : [{
        id,
        nombre: "",
        color: "",
        precio: rawProduct.precio,
        imagen: rawProduct.imagen,
      }];

  const variantes = rawVariants.map((rawVariant, variantIndex) => (
    normalizeVariant(rawVariant, index, variantIndex, rawProduct.imagen, usedVariantIds)
  ));
  const normalizedDescription = descripcion || "Consultá disponibilidad y variantes.";
  const searchableText = buildProductSearchText(nombre, normalizedDescription, categoria, variantes);

  return {
    id,
    nombre,
    descripcion: normalizedDescription,
    categoria,
    opcion,
    variantes,
    searchableText,
  };
}

function normalizeVariant(rawVariant, productIndex, variantIndex, fallbackImage, usedVariantIds) {
  if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) {
    throw new Error(`Producto ${productIndex + 1}, variante ${variantIndex + 1}: el registro no es válido.`);
  }

  const id = String(rawVariant.id ?? "").trim();
  const nombre = String(rawVariant.nombre ?? "").trim();
  const color = String(rawVariant.color ?? "").trim();
  const imagen = String(rawVariant.imagen ?? fallbackImage ?? "").trim() || FALLBACK_IMAGE;
  let precio;

  try {
    precio = normalizePrice(rawVariant.precio);
  } catch (error) {
    throw new Error(`Producto ${productIndex + 1}, variante ${variantIndex + 1}: ${error.message}`);
  }

  if (!id) throw new Error(`Producto ${productIndex + 1}, variante ${variantIndex + 1}: falta el id.`);
  if (usedVariantIds.has(id)) {
    throw new Error(`Producto ${productIndex + 1}: el id de variante "${id}" está repetido.`);
  }

  usedVariantIds.add(id);
  return { id, nombre, color, precio, imagen };
}

function normalizePrice(value) {
  if (value === null || value === undefined || value === "") return null;
  const price = Number(value);
  if (!Number.isFinite(price) || price < 0) {
    throw new Error(`El precio "${value}" no es válido.`);
  }
  return price;
}

function setCatalogLoading() {
  elements.resultCount.hidden = false;
  elements.resultCount.textContent = "Cargando productos...";
  elements.productGrid.setAttribute("aria-busy", "true");
  elements.searchInput.disabled = true;
}

function showCatalogError(error) {
  console.error(error);
  elements.productGrid.removeAttribute("aria-busy");
  elements.resultCount.hidden = false;
  elements.resultCount.textContent = "Catálogo no disponible.";
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = "No pudimos cargar los productos. Revisá data/productos.json y data/productos-data.js.";
}

function bindEvents() {
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.searchInput.addEventListener("search", handleSearchInput);

  elements.mobileMenuToggle?.addEventListener("click", () => {
    if (isProductDialogOpen()) return;

    if (isMobileMenuOpen()) {
      closeMobileMenu();
    } else {
      openMobileMenu();
    }
  });

  elements.mobileNavBackdrop?.addEventListener("click", () => closeMobileMenu());
  elements.primaryNavigation?.addEventListener("click", (event) => {
    const link = event.target instanceof Element ? event.target.closest("a[href]") : null;
    if (!link) return;

    const targetSelector = link.getAttribute("href");
    const internalTarget = targetSelector?.startsWith("#")
      ? document.querySelector(targetSelector)
      : null;
    closeMobileMenu({ returnFocus: false });

    if (internalTarget instanceof HTMLElement) {
      window.setTimeout(() => focusSectionTarget(internalTarget), 0);
    }
  });

  elements.clearSearchButton.addEventListener("click", () => {
    clearSearchState();
    renderProducts();
    elements.searchInput.focus();
  });

  elements.categoryFilters?.addEventListener("click", (event) => {
    const button = event.target instanceof Element
      ? event.target.closest("button[data-category-filter]")
      : null;
    if (!button || !elements.categoryFilters.contains(button)) return;

    const category = button.dataset.categoryFilter;
    if (category !== "Todos" && !catalogByCategoryIndex.has(category)) return;

    state.activeCategory = category;
    renderCategoryFilters();
    renderProducts();
    scrollToCatalogResults();
  });

  document.addEventListener("click", (event) => {
    const shortcut = event.target instanceof Element
      ? event.target.closest("[data-category-shortcut]")
      : null;
    if (!shortcut) return;

    const category = String(shortcut.dataset.categoryShortcut || "").trim();
    if (!category) return;

    event.preventDefault();
    closeMobileMenu({ returnFocus: false });
    applyCategoryShortcut(category);
  });

  elements.productGrid.addEventListener("click", (event) => {
    const arrow = event.target instanceof Element
      ? event.target.closest(".product-category__arrow[data-rail-direction]")
      : null;
    if (!arrow || !elements.productGrid.contains(arrow) || arrow.disabled) return;

    const section = arrow.closest(".product-category");
    const grid = section?.querySelector(".product-category__grid");
    if (!grid) return;

    const isPrevious = arrow.dataset.railDirection === "previous";
    const distance = Math.max(grid.clientWidth * 0.8, 240);
    grid.scrollBy({
      left: isPrevious ? -distance : distance,
      behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
    });
  });

  window.addEventListener("resize", () => {
    updateAllProductRailControls();
    if (window.innerWidth > 980 && isMobileMenuOpen()) {
      closeMobileMenu({ returnFocus: false });
    }
  });

  elements.sectionNavLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetSelector = link.getAttribute("href");
      const target = targetSelector ? document.querySelector(targetSelector) : null;
      if (!target) return;

      event.preventDefault();
      scrollToSection(targetSelector);
    });
  });

  elements.closeProductDialog.addEventListener("click", closeProductDialog);
  elements.productDialog.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-product]")) closeProductDialog();
  });
  elements.productDialogAdd.addEventListener("click", () => {
    if (!currentDialogVariant) return;
    addToCart(currentDialogVariant.id);
  });
  elements.productDialogImage.addEventListener("error", () => {
    showUnavailableImage(elements.productDialogImage, elements.productDialogImageStatus);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEYS.cart) return;
    state.cart = loadCart();
    renderCartBadge();
  });

  document.addEventListener("keydown", (event) => {
    if (isProductDialogOpen()) {
      if (event.key === "Escape") {
        closeProductDialog();
        return;
      }

      if (event.key === "Tab") {
        trapProductDialogFocus(event);
      }
      return;
    }

    if (isMobileMenuOpen()) {
      if (event.key === "Escape") {
        closeMobileMenu();
        return;
      }

      if (event.key === "Tab") {
        trapMobileMenuFocus(event);
      }
    }
  });
}

function isMobileMenuOpen() {
  return document.body.classList.contains("mobile-menu-open");
}

function openMobileMenu() {
  if (!elements.mobileMenuToggle || !elements.primaryNavigation || isMobileMenuOpen()) return;

  mobileMenuReturnFocus = document.activeElement instanceof HTMLElement
    ? document.activeElement
    : elements.mobileMenuToggle;
  document.body.classList.add("mobile-menu-open");
  elements.mobileMenuToggle.setAttribute("aria-expanded", "true");
  elements.mobileMenuToggle.setAttribute("aria-label", "Cerrar menú");
  lockPageBehindMobileMenu(true);

  window.requestAnimationFrame(() => {
    const firstFocusable = elements.primaryNavigation.querySelector(FOCUSABLE_SELECTOR);
    firstFocusable?.focus({ preventScroll: true });
  });
}

function closeMobileMenu(options = {}) {
  const { returnFocus = true } = options;
  if (!elements.mobileMenuToggle) return;

  const wasOpen = isMobileMenuOpen();
  document.body.classList.remove("mobile-menu-open");
  elements.mobileMenuToggle.setAttribute("aria-expanded", "false");
  elements.mobileMenuToggle.setAttribute("aria-label", "Abrir menú");
  lockPageBehindMobileMenu(false);

  const focusTarget = mobileMenuReturnFocus && document.contains(mobileMenuReturnFocus)
    ? mobileMenuReturnFocus
    : elements.mobileMenuToggle;
  mobileMenuReturnFocus = null;

  if (wasOpen && returnFocus && !isProductDialogOpen()) {
    window.requestAnimationFrame(() => focusTarget.focus({ preventScroll: true }));
  }
}

function trapMobileMenuFocus(event) {
  const navigationLinks = Array.from(
    elements.primaryNavigation?.querySelectorAll(FOCUSABLE_SELECTOR) || [],
  ).filter((element) => element.getClientRects().length > 0);
  const focusableElements = [elements.mobileMenuToggle, ...navigationLinks].filter(Boolean);

  if (focusableElements.length === 0) {
    event.preventDefault();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function lockPageBehindMobileMenu(shouldLock) {
  mobileMenuLockTargets.forEach((target) => {
    if (shouldLock) {
      if (target.dataset.mobileMenuPreviousAriaHidden !== undefined) return;

      const previousAriaHidden = target.getAttribute("aria-hidden");
      target.dataset.mobileMenuPreviousAriaHidden = previousAriaHidden === null
        ? "__missing__"
        : previousAriaHidden;
      target.dataset.mobileMenuPreviousInert = target.inert ? "true" : "false";
      target.setAttribute("aria-hidden", "true");
      target.inert = true;
      return;
    }

    const previousAriaHidden = target.dataset.mobileMenuPreviousAriaHidden;
    if (previousAriaHidden === undefined) return;

    if (previousAriaHidden === "__missing__") {
      target.removeAttribute("aria-hidden");
    } else {
      target.setAttribute("aria-hidden", previousAriaHidden);
    }
    target.inert = target.dataset.mobileMenuPreviousInert === "true";
    delete target.dataset.mobileMenuPreviousAriaHidden;
    delete target.dataset.mobileMenuPreviousInert;
  });
}

function focusSectionTarget(target) {
  const hadTabIndex = target.hasAttribute("tabindex");
  const previousTabIndex = target.getAttribute("tabindex");
  target.setAttribute("tabindex", "-1");
  target.focus({ preventScroll: true });

  target.addEventListener("blur", () => {
    if (!hadTabIndex) {
      target.removeAttribute("tabindex");
    } else if (previousTabIndex !== null) {
      target.setAttribute("tabindex", previousTabIndex);
    }
  }, { once: true });
}

function applyCategoryShortcut(category) {
  if (!catalogReady) {
    pendingCategoryShortcut = category;
    scrollToSection("#catalogo", { instant: false });
    return;
  }

  if (category !== "Todos" && !catalogByCategoryIndex.has(category)) return;

  state.activeCategory = category;
  clearSearchState();
  renderCategoryFilters();
  renderProducts();
  scrollToSection("#catalogo", { instant: false });
}

function handleSearchInput(event) {
  state.search = event.target.value;
  elements.clearSearchButton.hidden = state.search.length === 0;

  if (state.search.trim().length > 0) {
    scrollToCatalogResults();
  }

  scheduleProductRender();
}

function clearSearchState() {
  state.search = "";
  elements.searchInput.value = "";
  elements.clearSearchButton.hidden = true;
}

function scrollToCatalogResults() {
  scrollToSection(".catalog-toolbar", { instant: true });
}

function scrollToSection(selector, options = {}) {
  const target = document.querySelector(selector);
  if (!target) return;

  const instant = options.instant !== false;
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const headerOffset = Math.ceil(elements.header?.getBoundingClientRect().height || 0) + 8;

  const runScroll = () => {
    const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerOffset);

    if (smoothScroll && typeof smoothScroll.scrollTo === "function") {
      smoothScroll.scrollTo(top, {
        immediate: instant || prefersReducedMotion,
        duration: instant || prefersReducedMotion ? 0 : 0.45,
      });
      return;
    }

    window.scrollTo({
      top,
      behavior: instant || prefersReducedMotion ? "auto" : "smooth",
    });
  };

  window.requestAnimationFrame(runScroll);
  window.setTimeout(() => {
    const currentTop = Math.abs(target.getBoundingClientRect().top - headerOffset);
    if (currentTop > 80) {
      const top = Math.max(0, window.scrollY + target.getBoundingClientRect().top - headerOffset);
      window.scrollTo({ top, behavior: "auto" });
    }
  }, instant ? 90 : 380);
}

function scheduleProductRender() {
  if (searchRenderFrame !== null) {
    window.cancelAnimationFrame(searchRenderFrame);
  }

  searchRenderFrame = window.requestAnimationFrame(() => {
    searchRenderFrame = null;
    renderProducts();
  });
}

function setupHeaderBehavior() {
  const updateHeader = () => {
    elements.header.classList.toggle("is-scrolled", window.scrollY > 8);
  };

  updateHeader();
  window.addEventListener("scroll", updateHeader, { passive: true });
}

function observeRevealElements(root = document) {
  const revealElements = root.querySelectorAll("[data-reveal]:not(.is-visible)");

  if (!revealObserver) {
    revealElements.forEach((element) => element.classList.add("is-visible"));
    return;
  }

  revealElements.forEach((element) => revealObserver.observe(element));
}

function renderCategoryFilters() {
  if (!elements.categoryFilters) return;

  const categories = ["Todos", ...catalogByCategoryIndex.keys()];
  if (state.activeCategory !== "Todos" && !catalogByCategoryIndex.has(state.activeCategory)) {
    state.activeCategory = "Todos";
  }

  const currentButtons = Array.from(
    elements.categoryFilters.querySelectorAll("button[data-category-filter]"),
  );
  const shouldRebuild = currentButtons.length !== categories.length
    || currentButtons.some((button, index) => button.dataset.categoryFilter !== categories[index]);

  if (shouldRebuild) {
    const fragment = document.createDocumentFragment();
    categories.forEach((category) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "category-filter";
      button.dataset.categoryFilter = category;
      button.textContent = category;
      button.setAttribute("aria-controls", "productGrid");
      fragment.append(button);
    });
    elements.categoryFilters.textContent = "";
    elements.categoryFilters.append(fragment);
  }

  elements.categoryFilters.querySelectorAll("button[data-category-filter]").forEach((button) => {
    const isActive = button.dataset.categoryFilter === state.activeCategory;
    button.classList.toggle("is-active", isActive);
    button.setAttribute("aria-pressed", String(isActive));
  });
}

function renderProducts() {
  const filteredProducts = getFilteredProducts();
  const groupedProducts = groupProductsByCategory(filteredProducts);
  elements.productGrid.removeAttribute("aria-busy");
  elements.searchInput.disabled = false;
  elements.productGrid.textContent = "";
  elements.emptyState.hidden = filteredProducts.length > 0;
  elements.resultCount.hidden = false;
  elements.resultCount.textContent = getResultSummary(filteredProducts.length, groupedProducts.length);

  const fragment = document.createDocumentFragment();
  groupedProducts.forEach(([category, categoryProducts], categoryIndex) => {
    fragment.append(createCategorySection(category, categoryProducts, categoryIndex));
  });
  elements.productGrid.append(fragment);
  revealCatalogElements();

  if (animationEngineReady) {
    animateProductCards();
  } else {
    observeRevealElements(elements.productGrid);
  }
  refreshAnimationLibrary();
}

function revealCatalogElements() {
  elements.productGrid.querySelectorAll("[data-reveal]").forEach((element) => {
    element.classList.add("is-visible");
  });
  elements.productGrid.querySelectorAll(".product-card").forEach((card) => {
    card.classList.add("is-visible");
    card.style.removeProperty("opacity");
    card.style.removeProperty("visibility");
  });
}

function getResultSummary(productCount, categoryCount) {
  const productLabel = `${productCount} modelo${productCount === 1 ? "" : "s"}`;
  if (productCount === 0) return `${productLabel} en catálogo.`;
  const categoryLabel = `${categoryCount} categoría${categoryCount === 1 ? "" : "s"}`;
  return `${productLabel} en catálogo · ${categoryLabel}.`;
}

function groupProductsByCategory(productList) {
  const groups = new Map();

  productList.forEach((product) => {
    if (!groups.has(product.categoria)) groups.set(product.categoria, []);
    groups.get(product.categoria).push(product);
  });

  return Array.from(groups.entries());
}

function createCategorySection(category, categoryProducts, categoryIndex) {
  const section = document.createElement("section");
  const sectionId = `catalog-${toDomId(category)}-${categoryIndex}`;
  section.className = "product-category";
  section.setAttribute("aria-labelledby", sectionId);
  section.setAttribute("data-reveal", "");

  const header = document.createElement("div");
  header.className = "product-category__head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "product-category__title";

  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Categoría";

  const title = document.createElement("h3");
  title.id = sectionId;
  title.textContent = category;

  const count = document.createElement("p");
  count.textContent = `${categoryProducts.length} producto${categoryProducts.length === 1 ? "" : "s"}`;

  const grid = document.createElement("div");
  grid.id = `${sectionId}-rail`;
  grid.className = "product-category__grid";
  grid.setAttribute("role", "list");
  grid.setAttribute("aria-label", `Productos de ${category}`);

  const controls = document.createElement("div");
  controls.className = "product-category__controls";
  controls.setAttribute("aria-label", `Desplazar productos de ${category}`);

  const previousButton = createProductRailArrow(
    "previous",
    `Ver productos anteriores de ${category}`,
    grid.id,
  );
  const nextButton = createProductRailArrow(
    "next",
    `Ver productos siguientes de ${category}`,
    grid.id,
  );
  controls.append(previousButton, nextButton);

  categoryProducts.forEach((product, productIndex) => {
    grid.append(createProductCard(product, productIndex));
  });

  grid.addEventListener("scroll", () => updateProductRailControls(section), { passive: true });

  titleWrap.append(eyebrow, title, count);
  header.append(titleWrap, controls);
  section.append(header, grid);

  window.requestAnimationFrame(() => updateProductRailControls(section));

  return section;
}

function createProductRailArrow(direction, label, controlsId) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = `product-category__arrow product-category__arrow--${direction}`;
  button.dataset.railDirection = direction;
  button.setAttribute("aria-label", label);
  button.setAttribute("aria-controls", controlsId);
  button.textContent = direction === "previous" ? "←" : "→";
  return button;
}

function updateProductRailControls(section) {
  if (!section) return;

  const grid = section.querySelector(".product-category__grid");
  const previousButton = section.querySelector(
    ".product-category__arrow[data-rail-direction='previous']",
  );
  const nextButton = section.querySelector(
    ".product-category__arrow[data-rail-direction='next']",
  );
  if (!grid || !previousButton || !nextButton) return;

  const maxScrollLeft = Math.max(0, grid.scrollWidth - grid.clientWidth);
  previousButton.disabled = grid.scrollLeft <= 2;
  nextButton.disabled = maxScrollLeft <= 2 || grid.scrollLeft >= maxScrollLeft - 2;
}

function updateAllProductRailControls() {
  elements.productGrid.querySelectorAll(".product-category").forEach(updateProductRailControls);
}

function toDomId(value) {
  return normalizeText(value)
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "") || "categoria";
}

function createProductCard(product, index) {
  const selectedVariant = getSelectedVariant(product);
  state.selectedVariants[product.id] = selectedVariant.id;

  const article = document.createElement("article");
  article.className = "product-card";
  article.setAttribute("role", "listitem");
  article.dataset.productId = product.id;
  article.classList.add("is-visible");
  if (!window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    article.style.setProperty("--reveal-delay", `${Math.min(index * 30, 180)}ms`);
  }
  article.addEventListener("click", (event) => {
    if (event.target.closest("button, a")) return;
    openProductDialog(product, article);
  });

  const imageWrap = document.createElement("div");
  imageWrap.className = "product-card__image-wrap";

  const image = document.createElement("img");
  image.className = "product-card__image";
  image.src = selectedVariant.imagen;
  image.alt = getVariantDisplayName(product, selectedVariant);
  image.loading = "lazy";
  image.decoding = "async";
  image.width = 600;
  image.height = 600;

  const imageStatus = document.createElement("span");
  imageStatus.className = "product-card__image-status";
  imageStatus.textContent = "Imagen no disponible";
  updateImageAvailability(image, imageStatus, selectedVariant.imagen);
  image.addEventListener("error", () => showUnavailableImage(image, imageStatus));

  const body = document.createElement("div");
  body.className = "product-card__body";

  const price = document.createElement("strong");
  price.className = "product-card__price";
  price.textContent = formatPrice(selectedVariant.precio);

  const title = document.createElement("h4");
  title.textContent = product.nombre;

  const variantSummary = document.createElement("p");
  variantSummary.className = "product-card__variant-summary";
  variantSummary.textContent = product.variantes.length > 1
    ? `${product.variantes.length} opciones`
    : "Presentación única";

  const footer = document.createElement("div");
  footer.className = "product-card__footer";

  const addButton = document.createElement("button");
  addButton.className = "product-card__add";
  addButton.type = "button";

  if (product.variantes.length === 1) {
    addButton.textContent = "Agregar";
    addButton.setAttribute("aria-label", `Agregar ${product.nombre} al pedido`);
    addButton.addEventListener("click", () => addToCart(selectedVariant.id));
  } else {
    addButton.textContent = "Elegir opción";
    addButton.setAttribute("aria-haspopup", "dialog");
    addButton.setAttribute("aria-label", `Elegir una opción de ${product.nombre}`);
    addButton.addEventListener("click", () => openProductDialog(product, addButton));
  }

  const detailButton = document.createElement("button");
  detailButton.className = "product-card__detail";
  detailButton.type = "button";
  detailButton.textContent = "Ver";
  detailButton.setAttribute("aria-haspopup", "dialog");
  detailButton.setAttribute("aria-label", `Ver detalle de ${product.nombre}`);
  detailButton.addEventListener("click", () => openProductDialog(product, detailButton));

  imageWrap.append(image, imageStatus);
  body.append(title, variantSummary, price);
  footer.append(addButton, detailButton);

  body.append(footer);
  article.append(imageWrap, body);

  return article;
}

function getSelectedVariant(product) {
  const selectedId = state.selectedVariants[product.id];
  return product.variantes.find((variant) => variant.id === selectedId) || product.variantes[0];
}

function getVariantDisplayName(product, variant) {
  return variant.nombre ? `${product.nombre} - ${variant.nombre}` : product.nombre;
}

function isFallbackImageSource(source) {
  if (!source) return true;

  try {
    return new URL(source, document.baseURI).href === new URL(FALLBACK_IMAGE, document.baseURI).href;
  } catch {
    return source === FALLBACK_IMAGE;
  }
}

function updateImageAvailability(image, status, source) {
  const isUnavailable = isFallbackImageSource(source);
  image.classList.toggle("is-placeholder", isUnavailable);
  if (!status) return;
  status.textContent = "Imagen no disponible";
  status.hidden = !isUnavailable;
  status.classList.toggle("is-visible", isUnavailable);
  if (isUnavailable) status.classList.remove("visually-hidden");
}

function showUnavailableImage(image, status) {
  if (!isFallbackImageSource(image.currentSrc || image.src)) {
    image.src = FALLBACK_IMAGE;
  }
  image.classList.add("is-placeholder");
  if (!status) return;
  status.textContent = "Imagen no disponible";
  status.hidden = false;
  status.classList.add("is-visible");
  status.classList.remove("visually-hidden");
}

function openProductDialog(product, trigger) {
  closeMobileMenu({ returnFocus: false });
  const selectedVariant = getSelectedVariant(product);
  const focusableTrigger = trigger instanceof HTMLElement && trigger.matches(FOCUSABLE_SELECTOR)
    ? trigger
    : trigger instanceof HTMLElement
      ? trigger.querySelector(".product-card__detail")
      : null;
  productDialogReturnFocus = focusableTrigger || document.activeElement;

  elements.productDialogCategory.textContent = product.categoria;
  elements.productDialogTitle.textContent = product.nombre;
  elements.productDialogDescription.textContent = product.descripcion;
  elements.productDialogOptionLabel.textContent = product.opcion;
  renderProductDialogVariants(product);
  selectProductDialogVariant(product, selectedVariant);

  elements.productDialogPanel.scrollTop = 0;
  elements.productDialog.classList.add("is-open");
  elements.productDialog.setAttribute("aria-hidden", "false");
  document.body.classList.add("dialog-open");
  lockPageBehindDialog(true);
  window.setTimeout(() => elements.closeProductDialog.focus({ preventScroll: true }), 0);
  window.setTimeout(() => {
    if (isProductDialogOpen() && !elements.productDialogPanel.contains(document.activeElement)) {
      elements.closeProductDialog.focus({ preventScroll: true });
    }
  }, 80);
}

function renderProductDialogVariants(product) {
  elements.productDialogVariants.textContent = "";
  elements.productDialogVariantGroup.hidden = product.variantes.length <= 1;
  if (product.variantes.length <= 1) return;

  const fragment = document.createDocumentFragment();
  product.variantes.forEach((variant) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "product-variant-option";
    button.dataset.variantId = variant.id;
    button.setAttribute("aria-pressed", "false");
    button.setAttribute("aria-label", `${product.opcion}: ${variant.nombre}`);

    if (variant.color) {
      const swatch = document.createElement("span");
      swatch.className = "product-variant-option__swatch";
      swatch.style.setProperty("--swatch-color", variant.color);
      swatch.setAttribute("aria-hidden", "true");
      button.append(swatch);
    }

    const label = document.createElement("span");
    label.textContent = variant.nombre || "Única";
    button.append(label);
    button.addEventListener("click", () => selectProductDialogVariant(product, variant));
    fragment.append(button);
  });
  elements.productDialogVariants.append(fragment);
}

function selectProductDialogVariant(product, variant) {
  currentDialogVariant = variant;
  state.selectedVariants[product.id] = variant.id;
  elements.productDialogImage.src = variant.imagen;
  elements.productDialogImage.alt = getVariantDisplayName(product, variant);
  updateImageAvailability(
    elements.productDialogImage,
    elements.productDialogImageStatus,
    variant.imagen,
  );
  elements.productDialogPrice.textContent = formatPrice(variant.precio);
  elements.productDialogSelection.textContent = variant.nombre
    ? `${product.opcion}: ${variant.nombre}`
    : "Presentación única";
  elements.productDialogAdd.textContent = "Agregar al pedido";
  elements.productDialogAdd.setAttribute(
    "aria-label",
    `Agregar ${getVariantDisplayName(product, variant)} al pedido`,
  );

  elements.productDialogVariants.querySelectorAll(".product-variant-option").forEach((button) => {
    const isSelected = button.dataset.variantId === variant.id;
    button.classList.toggle("is-active", isSelected);
    button.setAttribute("aria-pressed", String(isSelected));
  });
}

function buildProductSearchText(nombre, descripcion, categoria, variantes) {
  const variantNames = variantes.map((variant) => variant.nombre).join(" ");
  return normalizeText(`${nombre} ${descripcion} ${categoria} ${variantNames}`);
}

function getFilteredProducts() {
  const query = normalizeText(state.search);

  if (!query && state.activeCategory === "Todos") {
    return productos;
  }

  const candidates = state.activeCategory === "Todos"
    ? productos
    : (catalogByCategoryIndex.get(state.activeCategory) || []);

  if (!query) {
    return candidates;
  }

  return candidates.filter((product) => product.searchableText.includes(query));
}

function setupAnimationLibrary() {
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  if (window.Lenis && !prefersReducedMotion) {
    smoothScroll = new window.Lenis({
      duration: 1.15,
      easing: (time) => Math.min(1, 1.001 - Math.pow(2, -10 * time)),
      smoothWheel: true,
      wheelMultiplier: 0.9,
    });
  }

  if (!window.gsap || prefersReducedMotion) {
    document.body.classList.add("motion-fallback");
    if (smoothScroll) {
      const raf = (time) => {
        smoothScroll.raf(time);
        requestAnimationFrame(raf);
      };
      requestAnimationFrame(raf);
    }
    return;
  }

  if (window.ScrollTrigger) {
    window.gsap.registerPlugin(window.ScrollTrigger);
  }

  if (smoothScroll) {
    smoothScroll.on("scroll", () => window.ScrollTrigger?.update());
    window.gsap.ticker.add((time) => smoothScroll.raf(time * 1000));
    window.gsap.ticker.lagSmoothing(0);
  }

  animationEngineReady = true;
  document.body.classList.add("motion-ready");
}

function refreshAnimationLibrary() {
  if (animationEngineReady && window.ScrollTrigger) {
    window.ScrollTrigger.refresh();
  }
}

function setupRevealAnimations() {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
    document.body.classList.add("motion-fallback");
    document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
    return;
  }

  if (animationEngineReady) {
    setupGsapRevealAnimations();
    return;
  }

  if (!("IntersectionObserver" in window)) {
    document.querySelectorAll("[data-reveal]").forEach((element) => element.classList.add("is-visible"));
    return;
  }

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) {
          entry.target.classList.add("is-visible");
          revealObserver.unobserve(entry.target);
        }
      });
    },
    { threshold: 0.14, rootMargin: "0px 0px -8% 0px" },
  );

  observeRevealElements();
}

function setupGsapRevealAnimations() {
  const revealElements = document.querySelectorAll("[data-reveal]");
  revealElements.forEach((element, index) => {
    element.classList.add("is-visible");
    window.gsap.fromTo(
      element,
      {
        autoAlpha: 0,
        y: 16,
      },
      {
        autoAlpha: 1,
        y: 0,
        duration: 0.36,
        delay: Math.min(index * 0.025, 0.1),
        ease: "power2.out",
        clearProps: "transform,opacity,visibility",
        scrollTrigger: window.ScrollTrigger
          ? {
              trigger: element,
              start: "top 86%",
              once: true,
            }
          : undefined,
      },
    );
  });

}

function animateProductCards() {
  const productCards = elements.productGrid.querySelectorAll(".product-card");
  productCards.forEach((card) => card.classList.add("is-visible"));

  if (
    !productCards.length
    || !window.gsap
    || window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) return;

  window.gsap.fromTo(
    productCards,
    {
      y: 12,
    },
    {
      y: 0,
      duration: 0.28,
      ease: "power2.out",
      stagger: 0.025,
      clearProps: "transform",
    },
  );
}

function addToCart(productId) {
  const product = findProduct(productId);
  if (!product) return;

  const previousCart = state.cart.map((cartItem) => ({ ...cartItem }));
  const item = state.cart.find((cartItem) => cartItem.id === productId);

  if (item) {
    if (item.cantidad >= CONFIG.maxQuantityPerProduct) {
      showToast(`Máximo ${CONFIG.maxQuantityPerProduct} unidades por producto.`);
      return;
    }
    item.cantidad += 1;
  } else {
    if (state.cart.length >= MAX_CART_LINES) {
      showToast("Alcanzaste el máximo de productos distintos por pedido.");
      return;
    }
    state.cart.push({ id: productId, cantidad: 1 });
  }

  if (!saveCart()) {
    state.cart = previousCart;
    renderCartBadge();
    showToast("No pudimos guardar el pedido en este navegador.");
    return;
  }

  renderCartBadge();
  bumpCartButton();
  showToast(`${product.nombre} agregado al pedido.`);
}

function renderCartBadge() {
  const items = getCartItems();
  const totals = getCartTotals(items);
  elements.cartCount.textContent = String(totals.quantity);
  elements.cartButton.setAttribute(
    "aria-label",
    `Abrir mi pedido (${totals.quantity} producto${totals.quantity === 1 ? "" : "s"})`,
  );
}

function getCartItems() {
  return state.cart
    .map((item) => ({
      product: findProduct(item.id),
      cantidad: item.cantidad,
    }))
    .filter((item) => item.product);
}

function getCartTotals(items = getCartItems()) {
  return {
    quantity: items.reduce((total, item) => total + item.cantidad, 0),
  };
}

function loadCart() {
  try {
    const savedCart = JSON.parse(safeStorageGet(STORAGE_KEYS.cart) || "[]");
    if (!Array.isArray(savedCart)) return [];

    const deduplicatedCart = new Map();
    let inspectedEntries = 0;
    for (const item of savedCart) {
      inspectedEntries += 1;
      if (inspectedEntries > MAX_CART_STORED_ENTRIES) break;
      if (!item || typeof item !== "object" || Array.isArray(item)) continue;

      const id = String(item.id ?? "").trim();
      const cantidad = item.cantidad;
      if (
        !id
        || !Number.isSafeInteger(cantidad)
        || cantidad < 1
      ) continue;

      const normalizedQuantity = Math.min(cantidad, CONFIG.maxQuantityPerProduct);
      const existingItem = deduplicatedCart.get(id);
      if (existingItem) {
        existingItem.cantidad = Math.min(
          CONFIG.maxQuantityPerProduct,
          existingItem.cantidad + normalizedQuantity,
        );
        continue;
      }

      if (deduplicatedCart.size >= MAX_CART_LINES) continue;
      deduplicatedCart.set(id, { id, cantidad: normalizedQuantity });
    }

    return Array.from(deduplicatedCart.values());
  } catch (error) {
    console.warn("No se pudo interpretar el carrito guardado.", error);
    return [];
  }
}

function pruneMissingCatalogItems() {
  const validCart = state.cart.filter((item) => catalogItemIndex.has(item.id));
  if (validCart.length === state.cart.length) return;
  state.cart = validCart;
  saveCart();
}

function saveCart() {
  try {
    return safeStorageSet(STORAGE_KEYS.cart, JSON.stringify(state.cart));
  } catch (error) {
    console.warn("No se pudo preparar el carrito para guardarlo.", error);
    return false;
  }
}

function safeStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`No se pudo leer ${key} de localStorage.`, error);
    return null;
  }
}

function safeStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`No se pudo guardar ${key} en localStorage.`, error);
    return false;
  }
}

function buildCatalogIndex(catalog) {
  const index = new Map();

  catalog.forEach((product) => {
    product.variantes.forEach((variant) => {
      index.set(variant.id, {
        id: variant.id,
        nombre: getVariantDisplayName(product, variant),
        descripcion: product.descripcion,
        precio: variant.precio,
        categoria: product.categoria,
        imagen: variant.imagen,
      });
    });
  });

  return index;
}

function buildCategoryIndex(catalog) {
  const index = new Map();

  catalog.forEach((product) => {
    if (!index.has(product.categoria)) index.set(product.categoria, []);
    index.get(product.categoria).push(product);
  });

  return index;
}

function findProduct(productId) {
  return catalogItemIndex.get(String(productId));
}

function formatPrice(value) {
  return Number.isFinite(value)
    ? ARS_PRICE_FORMATTER.format(value)
    : "Precio a confirmar";
}

function normalizeText(value) {
  return String(value)
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase("es-AR")
    .trim();
}

function bumpCartButton() {
  elements.cartButton.classList.remove("is-bumped");
  window.clearTimeout(cartBumpTimer);
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  void elements.cartButton.offsetWidth;
  elements.cartButton.classList.add("is-bumped");
  cartBumpTimer = window.setTimeout(() => {
    elements.cartButton.classList.remove("is-bumped");
  }, 300);
}

function closeProductDialog() {
  if (!isProductDialogOpen()) return;
  elements.productDialog.classList.remove("is-open");
  elements.productDialog.setAttribute("aria-hidden", "true");
  document.body.classList.remove("dialog-open");
  lockPageBehindDialog(false);

  const focusTarget = productDialogReturnFocus && document.contains(productDialogReturnFocus)
    ? productDialogReturnFocus
    : elements.cartButton;
  productDialogReturnFocus = null;
  currentDialogVariant = null;
  focusTarget.focus();
}

function isProductDialogOpen() {
  return elements.productDialog.classList.contains("is-open");
}

function trapProductDialogFocus(event) {
  const focusableElements = Array.from(elements.productDialogPanel.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => element.offsetParent !== null);

  if (focusableElements.length === 0) {
    event.preventDefault();
    elements.closeProductDialog.focus();
    return;
  }

  const firstElement = focusableElements[0];
  const lastElement = focusableElements[focusableElements.length - 1];

  if (event.shiftKey && document.activeElement === firstElement) {
    event.preventDefault();
    lastElement.focus();
    return;
  }

  if (!event.shiftKey && document.activeElement === lastElement) {
    event.preventDefault();
    firstElement.focus();
  }
}

function lockPageBehindDialog(shouldLock) {
  pageLockTargets.forEach((target) => {
    if (shouldLock) {
      target.dataset.previousAriaHidden = target.getAttribute("aria-hidden") || "";
      target.setAttribute("aria-hidden", "true");
      target.inert = true;
      return;
    }

    if (target.dataset.previousAriaHidden) {
      target.setAttribute("aria-hidden", target.dataset.previousAriaHidden);
    } else {
      target.removeAttribute("aria-hidden");
    }
    delete target.dataset.previousAriaHidden;
    target.inert = false;
  });
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2400);
}
