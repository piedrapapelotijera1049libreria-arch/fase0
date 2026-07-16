/*
  Piedra, Papel o Tijera Librería
  Sitio 100% frontend: los productos se administran desde productos.json.
*/

// EDITABLE: datos del negocio y número de WhatsApp en formato Argentina.
const CONFIG = {
  maxQuantityPerProduct: 99,
};

const PRODUCTS_URL = "productos.json";
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
  resultCount: document.querySelector("#resultCount"),
  emptyState: document.querySelector("#emptyState"),
  cartButton: document.querySelector("#cartButton"),
  cartCount: document.querySelector("#cartCount"),
  productDialog: document.querySelector("#productDialog"),
  productDialogPanel: document.querySelector("#productDialogPanel"),
  closeProductDialog: document.querySelector("#closeProductDialog"),
  productDialogCategory: document.querySelector("#productDialogCategory"),
  productDialogImage: document.querySelector("#productDialogImage"),
  productDialogTitle: document.querySelector("#productDialogTitle"),
  productDialogDescription: document.querySelector("#productDialogDescription"),
  productDialogVariantGroup: document.querySelector("#productDialogVariantGroup"),
  productDialogOptionLabel: document.querySelector("#productDialogOptionLabel"),
  productDialogVariants: document.querySelector("#productDialogVariants"),
  productDialogSelection: document.querySelector("#productDialogSelection"),
  productDialogAdd: document.querySelector("#productDialogAdd"),
  toast: document.querySelector("#toast"),
  footerYear: document.querySelector("#footerYear"),
  categoryNav: document.querySelector(".category-nav"),
  categoryNavInner: document.querySelector(".category-nav__inner"),
  categoryFilterLinks: Array.from(document.querySelectorAll("[data-category-filter]")),
  sectionNavLinks: Array.from(document.querySelectorAll(".category-nav a[href^='#']:not([data-category-filter])")),
};

const pageLockTargets = [
  document.querySelector(".site-header"),
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
let carouselTimers = [];

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
  elements.resultCount.textContent = "Cargando productos...";
  elements.productGrid.setAttribute("aria-busy", "true");
  elements.searchInput.disabled = true;
}

function showCatalogError(error) {
  console.error(error);
  stopCategoryCarousels();
  elements.productGrid.removeAttribute("aria-busy");
  elements.resultCount.textContent = "Catálogo no disponible.";
  elements.emptyState.hidden = false;
  elements.emptyState.textContent = "No pudimos cargar los productos. Revisá productos.json y productos-data.js.";
}

function bindEvents() {
  elements.searchInput.addEventListener("input", handleSearchInput);
  elements.searchInput.addEventListener("search", handleSearchInput);

  elements.clearSearchButton.addEventListener("click", () => {
    clearSearchState();
    renderProducts();
    elements.searchInput.focus();
  });

  elements.categoryFilterLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.activeCategory = link.dataset.categoryFilter;
      clearSearchState();
      renderCategoryFilters();
      renderProducts();
      scrollToCatalogResults();
    });
  });

  elements.sectionNavLinks.forEach((link) => {
    link.addEventListener("click", (event) => {
      const targetSelector = link.getAttribute("href");
      const target = targetSelector ? document.querySelector(targetSelector) : null;
      if (!target) return;

      event.preventDefault();
      state.activeCategory = "Todos";
      clearSearchState();
      renderCategoryFilters();
      renderProducts();
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
    if (!elements.productDialogImage.src.endsWith(FALLBACK_IMAGE)) {
      elements.productDialogImage.src = FALLBACK_IMAGE;
    }
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== STORAGE_KEYS.cart) return;
    state.cart = loadCart();
    renderCartBadge();
  });

  document.addEventListener("keydown", (event) => {
    if (!isProductDialogOpen()) return;

    if (event.key === "Escape") {
      closeProductDialog();
      return;
    }

    if (event.key === "Tab") {
      trapProductDialogFocus(event);
    }
  });
}

function handleSearchInput(event) {
  state.search = event.target.value;
  elements.clearSearchButton.hidden = state.search.length === 0;

  if (state.search.trim().length > 0) {
    state.activeCategory = "Todos";
    renderCategoryFilters();
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
  scrollToSection(".catalog-results", { instant: true });
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
  elements.categoryFilterLinks.forEach((link) => {
    const isActive = link.dataset.categoryFilter === state.activeCategory;
    link.classList.toggle("is-active", isActive);
    link.setAttribute("aria-current", isActive ? "page" : "false");
  });
}

function renderProducts() {
  const filteredProducts = getFilteredProducts();
  const groupedProducts = groupProductsByCategory(filteredProducts);
  stopCategoryCarousels();
  elements.productGrid.removeAttribute("aria-busy");
  elements.searchInput.disabled = false;
  elements.productGrid.textContent = "";
  elements.emptyState.hidden = filteredProducts.length > 0;
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
  setupCategoryCarousels();
  refreshAnimationLibrary();
}

function revealCatalogElements() {
  elements.productGrid.querySelectorAll("[data-reveal]").forEach((element) => {
    element.classList.add("is-visible");
  });
}

function getResultSummary(productCount, categoryCount) {
  const productLabel = `${productCount} modelo${productCount === 1 ? "" : "s"} disponible${productCount === 1 ? "" : "s"}`;
  if (productCount === 0) return `${productLabel}.`;
  const categoryLabel = `${categoryCount} categoría${categoryCount === 1 ? "" : "s"}`;
  return `${productLabel} en ${categoryLabel}.`;
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
  const trackId = `${sectionId}-track`;
  section.className = "product-category";
  section.setAttribute("aria-labelledby", sectionId);
  section.setAttribute("data-reveal", "");

  const header = document.createElement("div");
  header.className = "product-category__head";

  const titleWrap = document.createElement("div");
  titleWrap.className = "product-category__title";

  const eyebrow = document.createElement("span");
  eyebrow.textContent = "Categoría";

  const title = document.createElement("h4");
  title.id = sectionId;
  title.textContent = category;

  const count = document.createElement("p");
  count.textContent = `${categoryProducts.length} producto${categoryProducts.length === 1 ? "" : "s"}`;

  const controls = document.createElement("div");
  controls.className = "product-category__controls";
  controls.hidden = categoryProducts.length < 2;

  const previousButton = createCarouselButton("anterior", "‹");
  const nextButton = createCarouselButton("siguiente", "›");
  previousButton.setAttribute("aria-controls", trackId);
  nextButton.setAttribute("aria-controls", trackId);

  const track = document.createElement("div");
  track.id = trackId;
  track.className = "product-carousel__track";
  track.setAttribute("role", "list");
  track.setAttribute("tabindex", "0");
  track.setAttribute("aria-label", `Productos de ${category}`);

  previousButton.addEventListener("click", () => scrollCategoryTrack(track, -1));
  nextButton.addEventListener("click", () => scrollCategoryTrack(track, 1));

  categoryProducts.forEach((product, productIndex) => {
    track.append(createProductCard(product, productIndex));
  });

  const carousel = document.createElement("div");
  carousel.className = "product-carousel";
  carousel.append(track);

  titleWrap.append(eyebrow, title, count);
  controls.append(previousButton, nextButton);
  header.append(titleWrap, controls);
  section.append(header, carousel);

  return section;
}

function createCarouselButton(direction, symbol) {
  const button = document.createElement("button");
  button.type = "button";
  button.className = "carousel-button";
  button.setAttribute("aria-label", `Ver producto ${direction}`);
  button.innerHTML = `<span aria-hidden="true">${symbol}</span>`;
  return button;
}

function setupCategoryCarousels() {
  elements.productGrid.querySelectorAll(".product-carousel__track").forEach((track) => {
    const isScrollable = isTrackScrollable(track);
    const controls = track.closest(".product-category")?.querySelector(".product-category__controls");
    if (controls) controls.hidden = !isScrollable;
  });
}

function stopCategoryCarousels() {
  carouselTimers.forEach((timer) => window.clearInterval(timer));
  carouselTimers = [];
}

function scrollCategoryTrack(track, direction) {
  const maxScroll = Math.max(0, track.scrollWidth - track.clientWidth);
  if (maxScroll <= 1) return;

  const step = getCarouselStep(track);
  const currentLeft = track.scrollLeft;
  const atStart = currentLeft <= 2;
  const atEnd = currentLeft >= maxScroll - 2;
  let nextLeft;

  if (direction > 0) {
    nextLeft = atEnd || currentLeft + step >= maxScroll ? 0 : Math.min(currentLeft + step, maxScroll);
  } else {
    nextLeft = atStart ? maxScroll : Math.max(currentLeft - step, 0);
  }

  track.scrollTo({
    left: nextLeft,
    behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
  });
}

function getCarouselStep(track) {
  const card = track.querySelector(".product-card");
  if (!card) return track.clientWidth;

  const styles = window.getComputedStyle(track);
  const gap = Number.parseFloat(styles.columnGap || styles.gap) || 0;
  return card.getBoundingClientRect().width + gap;
}

function isTrackScrollable(track) {
  return track.scrollWidth > track.clientWidth + 4;
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
  article.setAttribute("data-reveal", "");
  article.style.setProperty("--reveal-delay", `${Math.min(index * 45, 300)}ms`);
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
  image.height = 450;
  image.addEventListener("error", () => {
    if (!image.src.endsWith(FALLBACK_IMAGE)) image.src = FALLBACK_IMAGE;
  });

  const body = document.createElement("div");
  body.className = "product-card__body";

  const meta = document.createElement("div");
  meta.className = "product-card__meta";

  const category = document.createElement("span");
  category.className = "product-card__category";
  category.textContent = product.categoria;

  const price = document.createElement("strong");
  price.className = "product-card__price";
  price.textContent = formatPrice(selectedVariant.precio);

  const title = document.createElement("h4");
  title.textContent = product.nombre;

  const description = document.createElement("p");
  description.textContent = product.descripcion;

  const footer = document.createElement("div");
  footer.className = "product-card__footer";

  const detailButton = document.createElement("button");
  detailButton.className = "product-card__detail";
  detailButton.type = "button";
  detailButton.textContent = product.variantes.length > 1
    ? `Ver ${product.variantes.length} opciones`
    : "Ver detalle";
  detailButton.setAttribute("aria-haspopup", "dialog");
  detailButton.setAttribute("aria-label", `Ver detalle de ${product.nombre}`);
  detailButton.addEventListener("click", () => openProductDialog(product, detailButton));

  imageWrap.append(image);
  meta.append(category, price);
  body.append(meta, title, description);

  footer.append(detailButton);
  if (product.variantes.length === 1) {
    const addButton = document.createElement("button");
    addButton.className = "product-card__action";
    addButton.type = "button";
    addButton.textContent = "Agregar";
    addButton.setAttribute("aria-label", `Agregar ${product.nombre} a la lista de consulta`);
    addButton.addEventListener("click", () => addToCart(selectedVariant.id));
    footer.append(addButton);
  }

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

function openProductDialog(product, trigger) {
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
  window.requestAnimationFrame(() => elements.closeProductDialog.focus());
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
  elements.productDialogSelection.textContent = variant.nombre
    ? `${product.opcion} seleccionada: ${variant.nombre}`
    : "Presentación única";
  elements.productDialogAdd.setAttribute(
    "aria-label",
    `Agregar ${getVariantDisplayName(product, variant)} a la lista de consulta`,
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
        y: 30,
        scale: 0.985,
        filter: "blur(10px)",
      },
      {
        autoAlpha: 1,
        y: 0,
        scale: 1,
        filter: "blur(0px)",
        duration: 0.8,
        delay: Math.min(index * 0.035, 0.18),
        ease: "power3.out",
        clearProps: "filter,transform,opacity,visibility",
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

  if (!productCards.length || !window.gsap) return;

  window.gsap.fromTo(
    productCards,
    {
      autoAlpha: 0,
      y: 26,
      scale: 0.97,
      filter: "blur(8px)",
    },
    {
      autoAlpha: 1,
      y: 0,
      scale: 1,
      filter: "blur(0px)",
      duration: 0.55,
      ease: "power3.out",
      stagger: 0.045,
      clearProps: "filter,transform,opacity,visibility",
    },
  );
}

function addToCart(productId) {
  const item = state.cart.find((cartItem) => cartItem.id === productId);
  const product = findProduct(productId);

  if (!product) return;

  if (item) {
    if (item.cantidad >= CONFIG.maxQuantityPerProduct) {
      showToast(`Máximo ${CONFIG.maxQuantityPerProduct} unidades por producto.`);
      return;
    }
    item.cantidad += 1;
  } else {
    state.cart.push({ id: productId, cantidad: 1 });
  }

  saveCart();
  renderCartBadge();
  bumpCartButton();
  showToast(`${product.nombre} agregado a la consulta.`);
}

function renderCartBadge() {
  const items = getCartItems();
  const totals = getCartTotals(items);
  elements.cartCount.textContent = String(totals.quantity);
  elements.cartButton.setAttribute(
    "aria-label",
    `Abrir lista de consulta (${totals.quantity} producto${totals.quantity === 1 ? "" : "s"})`,
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

    return savedCart
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        cantidad: Math.min(Number(item.cantidad), CONFIG.maxQuantityPerProduct),
      }))
      .filter((item) => item.id && Number.isInteger(item.cantidad) && item.cantidad > 0);
  } catch {
    return [];
  }
}

function saveCart() {
  safeStorageSet(STORAGE_KEYS.cart, JSON.stringify(state.cart));
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
  } catch (error) {
    console.warn(`No se pudo guardar ${key} en localStorage.`, error);
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

function formatPrice() {
  return "Consultar precio";
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
  void elements.cartButton.offsetWidth;
  elements.cartButton.classList.add("is-bumped");
  cartBumpTimer = window.setTimeout(() => {
    elements.cartButton.classList.remove("is-bumped");
  }, 420);
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
