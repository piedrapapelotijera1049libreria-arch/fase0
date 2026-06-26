/*
  Piedra, Papel o Tijera Librería
  Sitio 100% frontend: los productos se administran desde productos.json.
*/

// EDITABLE: datos del negocio y número de WhatsApp en formato Argentina.
const CONFIG = {
  whatsappNumber: "5491152627005",
  whatsappDisplay: "11-5262-7005",
  businessName: "Piedra, Papel o Tijera Librería",
  maxQuantityPerProduct: 99,
  orderCooldownMs: 60 * 1000,
};

const PRODUCTS_URL = "productos.json";
const FALLBACK_IMAGE = "img/producto-sin-imagen.svg";
const CAROUSEL_INTERVAL_MS = 10000;
let productos = [];
let catalogReady = false;
let catalogItemIndex = new Map();

const STORAGE_KEYS = {
  cart: "pptLibreriaCart",
  lastOrderAt: "pptLibreriaLastOrderAt",
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
  cartPanel: document.querySelector("#cartPanel"),
  cartDrawer: document.querySelector(".cart-drawer"),
  closeCart: document.querySelector("#closeCart"),
  cartItems: document.querySelector("#cartItems"),
  cartTotalItems: document.querySelector("#cartTotalItems"),
  cartTotalPrice: document.querySelector("#cartTotalPrice"),
  cartPriceNote: document.querySelector("#cartPriceNote"),
  clearCartButton: document.querySelector("#clearCartButton"),
  sendWhatsAppButton: document.querySelector("#sendWhatsAppButton"),
  cartMessage: document.querySelector("#cartMessage"),
  toast: document.querySelector("#toast"),
};

const pageLockTargets = [
  document.querySelector(".site-header"),
  document.querySelector("main"),
  document.querySelector(".floating-whatsapp"),
].filter(Boolean);

let toastTimer = null;
let cartBumpTimer = null;
let revealObserver = null;
let animationEngineReady = false;
let smoothScroll = null;
let searchRenderFrame = null;
let cooldownTimer = null;
let cartReturnFocus = null;
let carouselTimers = [];

init();

async function init() {
  bindEvents();
  setupHeaderBehavior();
  setupRevealAnimations();
  scheduleAnimationEnhancements();
  setCatalogLoading();

  try {
    const catalog = await loadProducts();
    productos = catalog.products;
    catalogItemIndex = buildCatalogIndex(productos);
    catalogReady = true;
    renderCategoryFilters();
    renderProducts();
    renderCart();

    if (catalog.invalidCount > 0) {
      showToast(`Se omitieron ${catalog.invalidCount} producto${catalog.invalidCount === 1 ? "" : "s"} con datos incompletos.`);
    }
  } catch (error) {
    showCatalogError(error);
    renderCart();
  }

  updateSendButtonState();
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

  return {
    id,
    nombre,
    descripcion: descripcion || "Consultá disponibilidad y variantes.",
    categoria,
    opcion,
    variantes,
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
  elements.searchInput.addEventListener("input", (event) => {
    state.search = event.target.value;
    elements.clearSearchButton.hidden = state.search.length === 0;
    scheduleProductRender();
  });

  elements.clearSearchButton.addEventListener("click", () => {
    state.search = "";
    elements.searchInput.value = "";
    elements.clearSearchButton.hidden = true;
    renderProducts();
    elements.searchInput.focus();
  });

  document.querySelectorAll("[data-category-filter]").forEach((link) => {
    link.addEventListener("click", (event) => {
      event.preventDefault();
      state.activeCategory = link.dataset.categoryFilter;
      renderCategoryFilters();
      renderProducts();
      document.querySelector("#catalogo").scrollIntoView({ behavior: "smooth" });
    });
  });

  elements.cartButton.addEventListener("click", openCart);
  elements.closeCart.addEventListener("click", closeCart);
  elements.cartPanel.addEventListener("click", (event) => {
    if (event.target.matches("[data-close-cart]")) {
      closeCart();
    }
  });

  elements.clearCartButton.addEventListener("click", () => {
    state.cart = [];
    saveCart();
    renderCart();
    showToast("Lista de consulta vacía.");
  });

  elements.sendWhatsAppButton.addEventListener("click", sendOrderToWhatsApp);

  document.addEventListener("keydown", (event) => {
    if (!isCartOpen()) return;

    if (event.key === "Escape") {
      closeCart();
      return;
    }

    if (event.key === "Tab") {
      trapCartFocus(event);
    }
  });
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
  document.querySelectorAll("[data-category-filter]").forEach((link) => {
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

  if (animationEngineReady) {
    animateProductCards();
  } else {
    observeRevealElements(elements.productGrid);
  }
  setupCategoryCarousels();
  refreshAnimationLibrary();
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

  const title = document.createElement("h3");
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
  const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const scrollableTracks = [];

  elements.productGrid.querySelectorAll(".product-carousel__track").forEach((track) => {
    const isScrollable = isTrackScrollable(track);
    const controls = track.closest(".product-category")?.querySelector(".product-category__controls");
    if (controls) controls.hidden = !isScrollable;
    if (!isScrollable || prefersReducedMotion) return;

    const setPaused = (isPaused) => {
      track.dataset.paused = String(isPaused);
    };

    let resumeTimer = null;
    const pauseTemporarily = () => {
      setPaused(true);
      window.clearTimeout(resumeTimer);
      resumeTimer = window.setTimeout(() => setPaused(false), CAROUSEL_INTERVAL_MS);
    };

    track.addEventListener("pointerenter", () => setPaused(true));
    track.addEventListener("pointerleave", () => setPaused(false));
    track.addEventListener("focusin", () => setPaused(true));
    track.addEventListener("focusout", () => setPaused(false));
    track.addEventListener("pointerdown", pauseTemporarily);
    track.addEventListener("wheel", pauseTemporarily, { passive: true });
    scrollableTracks.push(track);
  });

  if (scrollableTracks.length > 0) {
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      scrollableTracks.forEach((track) => {
        if (track.dataset.paused === "true") return;
        const rect = track.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > window.innerHeight) return;
        scrollCategoryTrack(track, 1);
      });
    }, CAROUSEL_INTERVAL_MS);

    carouselTimers.push(timer);
  }
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
  let selectedVariant = getSelectedVariant(product);
  state.selectedVariants[product.id] = selectedVariant.id;

  const article = document.createElement("article");
  article.className = "product-card";
  article.setAttribute("role", "listitem");
  article.setAttribute("data-reveal", "");
  article.style.setProperty("--reveal-delay", `${Math.min(index * 45, 300)}ms`);
  bindProductCardMotion(article);

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

  const title = document.createElement("h3");
  title.textContent = product.nombre;

  const description = document.createElement("p");
  description.textContent = product.descripcion;

  const footer = document.createElement("div");
  footer.className = "product-card__footer";

  const addButton = document.createElement("button");
  addButton.className = "product-card__action";
  addButton.type = "button";
  addButton.textContent = "Sumar a consulta";
  addButton.setAttribute("aria-label", `Agregar ${getVariantDisplayName(product, selectedVariant)} a la lista de consulta`);
  addButton.addEventListener("click", () => addToCart(selectedVariant.id));

  imageWrap.append(image);
  meta.append(category, price);
  footer.append(addButton);
  body.append(meta, title, description);

  if (product.variantes.length > 1) {
    const variantPicker = document.createElement("div");
    variantPicker.className = "product-card__variants";

    const variantHeading = document.createElement("div");
    variantHeading.className = "product-card__variant-heading";

    const variantLabel = document.createElement("span");
    variantLabel.textContent = `${product.opcion}:`;

    const variantName = document.createElement("strong");
    variantName.textContent = selectedVariant.nombre;

    const variantOptions = document.createElement("div");
    variantOptions.className = "product-card__variant-options";
    variantOptions.setAttribute("role", "group");
    variantOptions.setAttribute("aria-label", `${product.opcion} de ${product.nombre}`);

    const variantButtons = product.variantes.map((variant) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "variant-swatch";
      button.title = variant.nombre;
      button.setAttribute("aria-label", `${product.opcion} ${variant.nombre}`);
      button.setAttribute("aria-pressed", String(variant.id === selectedVariant.id));
      button.style.setProperty("--swatch-color", variant.color || "#d7d2c8");

      button.addEventListener("click", () => {
        selectedVariant = variant;
        state.selectedVariants[product.id] = variant.id;
        variantName.textContent = variant.nombre;
        price.textContent = formatPrice(variant.precio);
        image.src = variant.imagen;
        image.alt = getVariantDisplayName(product, variant);
        addButton.setAttribute("aria-label", `Agregar ${getVariantDisplayName(product, variant)} a la lista de consulta`);

        variantButtons.forEach((variantButton, buttonIndex) => {
          const isSelected = product.variantes[buttonIndex].id === variant.id;
          variantButton.classList.toggle("is-active", isSelected);
          variantButton.setAttribute("aria-pressed", String(isSelected));
        });
      });

      button.classList.toggle("is-active", variant.id === selectedVariant.id);
      return button;
    });

    variantHeading.append(variantLabel, variantName);
    variantOptions.append(...variantButtons);
    variantPicker.append(variantHeading, variantOptions);
    body.append(variantPicker);
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

function getFilteredProducts() {
  const query = normalizeText(state.search);
  return productos.filter((product) => {
    const matchesCategory = state.activeCategory === "Todos" || product.categoria === state.activeCategory;
    const variantNames = product.variantes.map((variant) => variant.nombre).join(" ");
    const searchableText = normalizeText(`${product.nombre} ${product.descripcion} ${product.categoria} ${variantNames}`);
    const matchesSearch = !query || searchableText.includes(query);
    return matchesCategory && matchesSearch;
  });
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

function bindProductCardMotion(card) {
  if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;

  let motionFrame = null;
  let pointerX = 0;
  let pointerY = 0;

  card.addEventListener("pointermove", (event) => {
    pointerX = event.clientX;
    pointerY = event.clientY;
    if (motionFrame !== null) return;

    motionFrame = window.requestAnimationFrame(() => {
      motionFrame = null;
      const rect = card.getBoundingClientRect();
      const x = (pointerX - rect.left) / rect.width;
      const y = (pointerY - rect.top) / rect.height;
      const rotateY = (x - 0.5) * 7;
      const rotateX = (0.5 - y) * 5;

      card.style.setProperty("--tilt-x", `${rotateX.toFixed(2)}deg`);
      card.style.setProperty("--tilt-y", `${rotateY.toFixed(2)}deg`);
      card.style.setProperty("--glow-x", `${(x * 100).toFixed(1)}%`);
      card.style.setProperty("--glow-y", `${(y * 100).toFixed(1)}%`);
    });
  });

  card.addEventListener("pointerleave", () => {
    if (motionFrame !== null) {
      window.cancelAnimationFrame(motionFrame);
      motionFrame = null;
    }
    card.style.setProperty("--tilt-x", "0deg");
    card.style.setProperty("--tilt-y", "0deg");
    card.style.setProperty("--glow-x", "50%");
    card.style.setProperty("--glow-y", "0%");
  });
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
  renderCart();
  bumpCartButton();
  showToast(`${product.nombre} agregado a la consulta.`);
}

function renderCart() {
  const items = getCartItems();
  const totals = getCartTotals(items);
  elements.cartItems.textContent = "";

  if (items.length === 0) {
    const empty = document.createElement("p");
    empty.className = "cart-empty";
    empty.textContent = "Todavía no agregaste productos a la consulta.";
    elements.cartItems.append(empty);
  } else {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(createCartItem(item)));
    elements.cartItems.append(fragment);
  }

  elements.cartCount.textContent = String(totals.quantity);
  elements.cartButton.setAttribute("aria-label", `Abrir lista de consulta (${totals.quantity} producto${totals.quantity === 1 ? "" : "s"})`);
  elements.cartTotalItems.textContent = String(totals.quantity);
  elements.cartTotalPrice.textContent = items.length > 0 ? "A consultar" : "—";
  elements.clearCartButton.disabled = items.length === 0;
  elements.cartPriceNote.textContent = items.length > 0
    ? "Confirmamos precio y disponibilidad por WhatsApp."
    : "";
  updateSendButtonState();
}

function createCartItem(item) {
  const wrapper = document.createElement("article");
  wrapper.className = "cart-item";

  const image = document.createElement("img");
  image.src = item.product.imagen;
  image.alt = item.product.nombre;
  image.loading = "lazy";
  image.decoding = "async";
  image.width = 74;
  image.height = 74;
  image.addEventListener("error", () => {
    if (!image.src.endsWith(FALLBACK_IMAGE)) image.src = FALLBACK_IMAGE;
  });

  const content = document.createElement("div");

  const title = document.createElement("h3");
  title.textContent = item.product.nombre;

  const price = document.createElement("p");
  price.textContent = "Consultar precio";

  const controls = document.createElement("div");
  controls.className = "cart-item__controls";

  const quantity = document.createElement("div");
  quantity.className = "quantity-control";
  quantity.setAttribute("aria-label", `Cantidad de ${item.product.nombre}`);

  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.textContent = "−";
  decrease.setAttribute("aria-label", `Disminuir ${item.product.nombre}`);
  decrease.addEventListener("click", () => updateQuantity(item.product.id, item.cantidad - 1));

  const amount = document.createElement("span");
  amount.textContent = String(item.cantidad);

  const increase = document.createElement("button");
  increase.type = "button";
  increase.textContent = "+";
  increase.setAttribute("aria-label", `Aumentar ${item.product.nombre}`);
  increase.addEventListener("click", () => updateQuantity(item.product.id, item.cantidad + 1));

  const remove = document.createElement("button");
  remove.className = "remove-button";
  remove.type = "button";
  remove.textContent = "Quitar";
  remove.addEventListener("click", () => removeFromCart(item.product.id));

  quantity.append(decrease, amount, increase);
  controls.append(quantity, remove);
  content.append(title, price, controls);
  wrapper.append(image, content);

  return wrapper;
}

function updateQuantity(productId, nextQuantity) {
  const item = state.cart.find((cartItem) => cartItem.id === productId);
  if (!item) return;

  if (nextQuantity <= 0) {
    removeFromCart(productId);
    return;
  }

  item.cantidad = Math.min(CONFIG.maxQuantityPerProduct, nextQuantity);
  saveCart();
  renderCart();
  bumpCartButton();
}

function removeFromCart(productId) {
  state.cart = state.cart.filter((item) => item.id !== productId);
  saveCart();
  renderCart();
  bumpCartButton();
}

function sendOrderToWhatsApp() {
  const items = getCartItems();
  if (items.length === 0) {
    setCartMessage("Agregá productos antes de enviar la consulta.");
    return;
  }

  const remainingCooldown = getRemainingCooldown();
  if (remainingCooldown > 0) {
    setCartMessage("Esperá unos segundos antes de enviar otra consulta.");
    return;
  }

  const message = buildWhatsAppMessage(items);
  const url = `https://wa.me/${CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;

  safeStorageSet(STORAGE_KEYS.lastOrderAt, String(Date.now()));
  updateSendButtonState();
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  if (openedWindow) {
    setCartMessage("Consulta preparada en WhatsApp.");
  } else {
    setCartMessage("No pudimos abrir WhatsApp automaticamente. Permití ventanas emergentes o usá el botón flotante.");
  }
}

function buildWhatsAppMessage(items) {
  const totals = getCartTotals(items);
  const lines = [
    `Consulta desde la web de ${cleanText(CONFIG.businessName)}:`,
    "",
  ];

  items.forEach((item) => {
    lines.push(`- ${cleanText(item.product.nombre)} x${item.cantidad}`);
  });

  lines.push("");
  lines.push(`Total de productos: ${totals.quantity}`);
  lines.push("Precio: a consultar");

  lines.push("");
  lines.push("Hola, quiero consultar precio y disponibilidad de estos productos.");

  return lines.join("\n");
}

function updateSendButtonState() {
  window.clearTimeout(cooldownTimer);
  cooldownTimer = null;
  const remainingCooldown = getRemainingCooldown();
  const cartIsEmpty = getCartItems().length === 0;

  if (!catalogReady) {
    elements.sendWhatsAppButton.disabled = true;
    elements.sendWhatsAppButton.textContent = "Catálogo no disponible";
    return;
  }

  if (remainingCooldown > 0) {
    const seconds = Math.ceil(remainingCooldown / 1000);
    elements.sendWhatsAppButton.disabled = true;
    elements.sendWhatsAppButton.textContent = `Esperá ${seconds}s`;
    cooldownTimer = window.setTimeout(updateSendButtonState, Math.min(1000, remainingCooldown + 20));
    return;
  }

  elements.sendWhatsAppButton.disabled = cartIsEmpty;
  elements.sendWhatsAppButton.textContent = "Enviar consulta";
}

function getRemainingCooldown() {
  const lastOrderAt = Number(safeStorageGet(STORAGE_KEYS.lastOrderAt) || 0);
  if (!Number.isFinite(lastOrderAt) || lastOrderAt <= 0) return 0;

  const elapsed = Math.max(0, Date.now() - lastOrderAt);
  return Math.max(0, CONFIG.orderCooldownMs - elapsed);
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

function cleanText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
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

function openCart() {
  cartReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : elements.cartButton;
  elements.cartPanel.classList.add("is-open");
  elements.cartPanel.setAttribute("aria-hidden", "false");
  elements.cartButton.setAttribute("aria-expanded", "true");
  lockPageBehindCart(true);
  document.body.classList.add("cart-open");

  if (animationEngineReady && window.gsap) {
    window.gsap.fromTo(
      ".cart-drawer",
      { xPercent: 100 },
      { xPercent: 0, duration: 0.45, ease: "power3.out", clearProps: "transform" },
    );
    window.gsap.fromTo(
      ".cart-item",
      { autoAlpha: 0, x: 18 },
      { autoAlpha: 1, x: 0, duration: 0.32, ease: "power2.out", stagger: 0.04 },
    );
  }

  window.requestAnimationFrame(() => elements.closeCart.focus());
}

function closeCart() {
  if (animationEngineReady && window.gsap && elements.cartPanel.classList.contains("is-open")) {
    window.gsap.to(".cart-drawer", {
      xPercent: 100,
      duration: 0.28,
      ease: "power2.in",
      onComplete: finishCloseCart,
    });
    return;
  }

  finishCloseCart();
}

function finishCloseCart() {
  elements.cartPanel.classList.remove("is-open");
  elements.cartPanel.setAttribute("aria-hidden", "true");
  elements.cartButton.setAttribute("aria-expanded", "false");
  lockPageBehindCart(false);
  document.body.classList.remove("cart-open");
  window.gsap?.set?.(".cart-drawer", { clearProps: "transform" });
  const focusTarget = cartReturnFocus && document.contains(cartReturnFocus) ? cartReturnFocus : elements.cartButton;
  cartReturnFocus = null;
  focusTarget.focus();
}

function isCartOpen() {
  return elements.cartPanel.classList.contains("is-open");
}

function trapCartFocus(event) {
  const focusableElements = Array.from(elements.cartDrawer.querySelectorAll(FOCUSABLE_SELECTOR))
    .filter((element) => element.offsetParent !== null);

  if (focusableElements.length === 0) {
    event.preventDefault();
    elements.closeCart.focus();
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

function lockPageBehindCart(shouldLock) {
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

function setCartMessage(message) {
  elements.cartMessage.textContent = message;
}

function showToast(message) {
  elements.toast.textContent = message;
  elements.toast.classList.add("is-visible");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => {
    elements.toast.classList.remove("is-visible");
  }, 2400);
}
