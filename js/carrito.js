const CART_MAX_QUANTITY = 99;
const CART_MAX_LINES = 250;
const CART_MAX_STORED_ENTRIES = CART_MAX_LINES * 4;
const CART_PRODUCTS_URL = "data/productos.json";
const CART_FALLBACK_IMAGE = "img/producto-sin-imagen.svg";

const CART_STORAGE_KEYS = {
  cart: "pptLibreriaCart",
};

const CART_CONFIG = readCartStoreConfig(window.PPT_STORE_CONFIG);
const CART_PRICE_FORMATTER = new Intl.NumberFormat("es-AR", {
  style: "currency",
  currency: "ARS",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const cartElements = {
  items: document.querySelector("#cartItems"),
  lineCount: document.querySelector("#cartLineCount"),
  totalItems: document.querySelector("#cartTotalItems"),
  totalAmount: document.querySelector("#cartTotalAmount"),
  clearButton: document.querySelector("#clearCartButton"),
  sendButton: document.querySelector("#sendWhatsAppButton"),
  sendLabel: document.querySelector("#sendWhatsAppLabel"),
  customerName: document.querySelector("#customerName"),
  customerNotes: document.querySelector("#customerNotes"),
  clearDialog: document.querySelector("#clearCartDialog"),
  cancelClearButton: document.querySelector("#cancelClearCartButton"),
  confirmClearButton: document.querySelector("#confirmClearCartButton"),
  message: document.querySelector("#cartMessage"),
  toast: document.querySelector("#toast"),
};

const cartState = {
  cart: loadCart(),
  catalog: new Map(),
  status: "loading",
  loadError: null,
};

let cartToastTimer = null;
let clearDialogReturnFocus = null;

initCartPage();

async function initCartPage() {
  if (!hasRequiredCartElements()) {
    console.error("No se pudo iniciar el carrito porque faltan elementos esenciales de la página.");
    return;
  }

  bindCartEvents();
  renderCartPage();
  saveCart();

  try {
    const products = await loadCartProducts();
    cartState.catalog = buildCartCatalogIndex(products);
    if (cartState.catalog.size === 0) {
      throw new Error("El catálogo no contiene productos válidos.");
    }

    cartState.status = "ready";
    cartState.loadError = null;
    pruneMissingCartItems();
    renderCartPage();

    if (!CART_CONFIG.isValid) {
      setCartPageMessage("La configuración de WhatsApp no es válida. Contactá a la librería desde la página principal.");
    }
  } catch (error) {
    cartState.status = "error";
    cartState.loadError = error;
    console.error(error);
    renderCartPage();
    setCartPageMessage("No pudimos cargar el catálogo. Volvé a la página principal e intentá nuevamente.");
  }
}

function hasRequiredCartElements() {
  return Boolean(
    cartElements.items
    && cartElements.lineCount
    && cartElements.totalItems
    && cartElements.clearButton
    && cartElements.sendButton
    && cartElements.sendLabel,
  );
}

function bindCartEvents() {
  cartElements.clearButton.addEventListener("click", requestClearCartPage);
  cartElements.sendButton.addEventListener("click", sendCartToWhatsApp);

  cartElements.cancelClearButton?.addEventListener("click", (event) => {
    event.preventDefault();
    closeClearCartDialog(true);
  });

  cartElements.confirmClearButton?.addEventListener("click", (event) => {
    event.preventDefault();
    confirmClearCartPage();
  });

  cartElements.clearDialog?.addEventListener("cancel", (event) => {
    event.preventDefault();
    closeClearCartDialog(true);
  });

  window.addEventListener("storage", (event) => {
    if (event.key !== CART_STORAGE_KEYS.cart) return;
    cartState.cart = loadCart();
    if (cartState.status === "ready") pruneMissingCartItems();
    renderCartPage();
  });
}

async function loadCartProducts() {
  if (Array.isArray(window.PRODUCTOS_CATALOGO)) return window.PRODUCTOS_CATALOGO;

  const response = await fetch(CART_PRODUCTS_URL);
  if (!response.ok) throw new Error(`No se pudo leer ${CART_PRODUCTS_URL} (${response.status}).`);
  const data = await response.json();
  if (!Array.isArray(data)) throw new Error(`${CART_PRODUCTS_URL} debe contener una lista.`);
  return data;
}

function buildCartCatalogIndex(products) {
  const index = new Map();

  products.forEach((rawProduct) => {
    if (!rawProduct || typeof rawProduct !== "object" || Array.isArray(rawProduct)) return;

    const productId = normalizeCartId(rawProduct.id);
    const productName = cleanCartText(rawProduct.nombre, 160);
    const category = cleanCartText(rawProduct.categoria, 100);
    if (!productId || !productName || !category) return;

    const variants = Array.isArray(rawProduct.variantes) && rawProduct.variantes.length > 0
      ? rawProduct.variantes
      : [{
          id: productId,
          nombre: "",
          precio: rawProduct.precio,
          imagen: rawProduct.imagen,
        }];

    variants.forEach((rawVariant) => {
      if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) return;

      const id = normalizeCartId(rawVariant.id);
      if (!id || index.has(id)) return;

      const variantName = cleanCartText(rawVariant.nombre, 120);
      const image = normalizeCartImagePath(rawVariant.imagen ?? rawProduct.imagen);
      const rawPrice = isMissingCartPrice(rawVariant.precio)
        ? rawProduct.precio
        : rawVariant.precio;

      index.set(id, {
        id,
        nombre: variantName ? `${productName} - ${variantName}` : productName,
        categoria: category,
        variante: variantName,
        imagen: image,
        precio: normalizeCartPrice(rawPrice),
      });
    });
  });

  return index;
}

function normalizeCartPrice(value) {
  if (isMissingCartPrice(value)) return null;
  const price = Number(value);
  return Number.isFinite(price) && price >= 0 ? price : null;
}

function isMissingCartPrice(value) {
  return value === null
    || value === undefined
    || (typeof value === "string" && value.trim() === "");
}

function normalizeCartImagePath(value) {
  const path = String(value ?? "").trim();
  if (!path || /^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(path)) return CART_FALLBACK_IMAGE;
  return path;
}

function renderCartPage(options = {}) {
  const items = getCartPageItems();
  const totals = getCartTotals(items);
  const isLoading = cartState.status === "loading";
  const hasError = cartState.status === "error";

  cartElements.items.textContent = "";
  cartElements.items.setAttribute("aria-busy", String(isLoading));

  if (isLoading) {
    cartElements.items.append(createCartLoadingState());
  } else if (hasError) {
    cartElements.items.append(createCartErrorState());
  } else if (items.length === 0) {
    cartElements.items.append(createCartEmptyState());
  } else {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(createCartPageItem(item)));
    cartElements.items.append(fragment);
  }

  cartElements.lineCount.textContent = isLoading
    ? "Cargando productos"
    : `${items.length} producto${items.length === 1 ? "" : "s"}`;
  cartElements.totalItems.textContent = String(totals.quantity);
  cartElements.clearButton.disabled = cartState.status !== "ready" || items.length === 0;

  if (cartElements.totalAmount) {
    cartElements.totalAmount.textContent = getCartTotalLabel(items, totals);
  }

  updateCartSendButton();

  if (options.focusTarget) {
    restoreCartControlFocus(options.focusTarget.productId, options.focusTarget.action);
  }
}

function createCartLoadingState() {
  const loading = document.createElement("div");
  loading.className = "cart-page-empty cart-page-loading";
  loading.setAttribute("role", "status");

  const title = document.createElement("h2");
  title.textContent = "Cargando tu lista";
  const copy = document.createElement("p");
  copy.textContent = "Estamos comprobando los productos y sus precios.";

  loading.append(title, copy);
  return loading;
}

function createCartErrorState() {
  const error = document.createElement("div");
  error.className = "cart-page-empty cart-page-error";

  const title = document.createElement("h2");
  title.textContent = "No pudimos cargar tu lista";
  const copy = document.createElement("p");
  copy.textContent = "Volvé al catálogo e intentá nuevamente.";
  const link = createCatalogLink("Volver al catálogo");

  error.append(title, copy, link);
  return error;
}

function createCartEmptyState() {
  const empty = document.createElement("div");
  empty.className = "cart-page-empty";

  const title = document.createElement("h2");
  title.textContent = "Tu lista está vacía";
  const copy = document.createElement("p");
  copy.textContent = "Agregá productos desde el catálogo para preparar una consulta.";
  const link = createCatalogLink("Explorar catálogo");

  empty.append(title, copy, link);
  return empty;
}

function createCatalogLink(label) {
  const link = document.createElement("a");
  link.className = "button";
  link.href = "index.html#catalogo";
  link.textContent = label;
  return link;
}

function createCartPageItem(item) {
  const article = document.createElement("article");
  article.className = "cart-page-item";
  article.dataset.cartId = item.product.id;

  const imageWrap = document.createElement("div");
  imageWrap.className = "cart-page-item__media";
  const image = document.createElement("img");
  image.src = item.product.imagen;
  image.alt = item.product.nombre;
  image.loading = "lazy";
  image.decoding = "async";
  image.width = 140;
  image.height = 140;
  image.addEventListener("error", () => {
    if (image.dataset.fallbackApplied === "true") return;
    image.dataset.fallbackApplied = "true";
    image.src = CART_FALLBACK_IMAGE;
  });
  imageWrap.append(image);

  const content = document.createElement("div");
  content.className = "cart-page-item__content";
  const category = document.createElement("p");
  category.className = "cart-page-item__category";
  category.textContent = item.product.categoria;
  const title = document.createElement("h2");
  title.textContent = item.product.nombre;
  const price = document.createElement("p");
  price.className = "cart-page-item__price";
  price.textContent = hasCartPrice(item.product.precio)
    ? `Precio unitario: ${formatCartPrice(item.product.precio)}`
    : "Precio a confirmar";
  const subtotal = document.createElement("p");
  subtotal.className = "cart-page-item__subtotal";
  subtotal.textContent = hasCartPrice(item.product.precio)
    ? `Subtotal: ${formatCartPrice(item.product.precio * item.cantidad)}`
    : "Subtotal a confirmar";
  content.append(category, title, price, subtotal);

  const actions = document.createElement("div");
  actions.className = "cart-page-item__actions";
  const quantity = document.createElement("div");
  quantity.className = "quantity-control";
  quantity.setAttribute("role", "group");
  quantity.setAttribute("aria-label", `Cantidad de ${item.product.nombre}`);

  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.textContent = "−";
  decrease.dataset.quantityAction = "decrease";
  decrease.disabled = item.cantidad <= 1;
  decrease.setAttribute("aria-label", `Disminuir ${item.product.nombre}`);
  decrease.addEventListener("click", () => {
    updateCartQuantity(item.product.id, item.cantidad - 1, "decrease");
  });

  const amount = document.createElement("span");
  amount.textContent = String(item.cantidad);

  const increase = document.createElement("button");
  increase.type = "button";
  increase.textContent = "+";
  increase.dataset.quantityAction = "increase";
  increase.disabled = item.cantidad >= CART_CONFIG.maxQuantityPerProduct;
  increase.setAttribute("aria-label", `Aumentar ${item.product.nombre}`);
  increase.addEventListener("click", () => {
    updateCartQuantity(item.product.id, item.cantidad + 1, "increase");
  });
  quantity.append(decrease, amount, increase);

  const remove = document.createElement("button");
  remove.className = "remove-button";
  remove.type = "button";
  remove.textContent = "Quitar";
  remove.setAttribute("aria-label", `Quitar ${item.product.nombre} de la lista`);
  remove.addEventListener("click", () => removeCartItem(item.product.id));
  actions.append(quantity, remove);

  article.append(imageWrap, content, actions);
  return article;
}

function updateCartQuantity(productId, nextQuantity, action) {
  if (!Number.isFinite(nextQuantity) || !Number.isInteger(nextQuantity)) {
    setCartPageMessage("La cantidad debe ser un número entero válido.");
    return;
  }

  if (nextQuantity < 1) {
    setCartPageMessage("La cantidad mínima es 1. Usá “Quitar” para eliminar el producto.");
    return;
  }

  const item = cartState.cart.find((cartItem) => cartItem.id === productId);
  if (!item) return;

  const quantity = Math.min(CART_CONFIG.maxQuantityPerProduct, nextQuantity);
  if (quantity === item.cantidad) {
    restoreCartControlFocus(productId, action);
    return;
  }

  const previousCart = cartState.cart.map((cartItem) => ({ ...cartItem }));
  item.cantidad = quantity;
  if (!saveCart()) {
    cartState.cart = previousCart;
    renderCartPage({ focusTarget: { productId, action } });
    setCartPageMessage("No pudimos guardar el cambio en este navegador.");
    return;
  }
  setCartPageMessage(`Cantidad actualizada: ${quantity}.`);
  renderCartPage({ focusTarget: { productId, action } });
}

function restoreCartControlFocus(productId, action) {
  if (action !== "decrease" && action !== "increase" && action !== "remove") return;

  const article = Array.from(cartElements.items.querySelectorAll("[data-cart-id]"))
    .find((element) => element.dataset.cartId === productId);
  if (action === "remove") {
    article?.querySelector(".remove-button")?.focus({ preventScroll: true });
    return;
  }

  const requestedControl = article?.querySelector(`[data-quantity-action="${action}"]`);
  const fallbackAction = action === "increase" ? "decrease" : "increase";
  const fallbackControl = article?.querySelector(`[data-quantity-action="${fallbackAction}"]`);
  const control = requestedControl && !requestedControl.disabled
    ? requestedControl
    : fallbackControl && !fallbackControl.disabled
      ? fallbackControl
      : article?.querySelector(".remove-button");
  if (!control) return;

  try {
    control.focus({ preventScroll: true });
  } catch {
    control.focus();
  }
}

function removeCartItem(productId) {
  const currentItems = getCartPageItems();
  const removedIndex = currentItems.findIndex((item) => item.product.id === productId);
  const previousCart = cartState.cart.map((item) => ({ ...item }));
  cartState.cart = cartState.cart.filter((item) => item.id !== productId);
  if (!saveCart()) {
    cartState.cart = previousCart;
    setCartPageMessage("No pudimos guardar el cambio en este navegador.");
    return;
  }
  setCartPageMessage("Producto quitado de la lista.");
  const remainingItems = getCartPageItems();
  const nextItem = remainingItems[Math.min(Math.max(removedIndex, 0), remainingItems.length - 1)];
  renderCartPage(nextItem
    ? { focusTarget: { productId: nextItem.product.id, action: "remove" } }
    : {});
  showCartToast("Producto quitado de la lista.");

  if (remainingItems.length === 0) {
    window.requestAnimationFrame(() => cartElements.items.querySelector("a[href]")?.focus());
  }
}

function requestClearCartPage() {
  if (getCartPageItems().length === 0) return;

  if (cartElements.clearDialog && typeof cartElements.clearDialog.showModal === "function") {
    clearDialogReturnFocus = document.activeElement;
    if (!cartElements.clearDialog.open) cartElements.clearDialog.showModal();
    window.requestAnimationFrame(() => cartElements.cancelClearButton?.focus());
    return;
  }

  if (window.confirm("¿Querés vaciar toda la lista de consulta?")) {
    clearCartPage();
  }
}

function confirmClearCartPage() {
  closeClearCartDialog(false);
  clearCartPage();
}

function closeClearCartDialog(restoreFocus) {
  if (cartElements.clearDialog?.open) cartElements.clearDialog.close();

  const focusTarget = clearDialogReturnFocus;
  clearDialogReturnFocus = null;
  if (restoreFocus && focusTarget instanceof HTMLElement && document.contains(focusTarget)) {
    focusTarget.focus();
  }
}

function clearCartPage() {
  if (cartState.cart.length === 0) return;
  const previousCart = cartState.cart.map((item) => ({ ...item }));
  cartState.cart = [];
  if (!saveCart()) {
    cartState.cart = previousCart;
    renderCartPage();
    setCartPageMessage("No pudimos vaciar el pedido en este navegador.");
    return;
  }
  setCartPageMessage("Pedido vaciado.");
  renderCartPage();
  showCartToast("Lista de consulta vacía.");

  window.requestAnimationFrame(() => {
    cartElements.items.querySelector("a[href]")?.focus();
  });
}

function pruneMissingCartItems() {
  const validItems = cartState.cart.filter((item) => cartState.catalog.has(item.id));
  if (validItems.length === cartState.cart.length) return;
  cartState.cart = validItems;
  saveCart();
}

function getCartPageItems() {
  if (cartState.status !== "ready") return [];
  return cartState.cart
    .map((item) => ({ product: cartState.catalog.get(item.id), cantidad: item.cantidad }))
    .filter((item) => item.product);
}

function getCartTotals(items) {
  const quantity = items.reduce((total, item) => total + item.cantidad, 0);
  const allPriced = items.length > 0 && items.every((item) => hasCartPrice(item.product.precio));
  const amount = allPriced
    ? items.reduce((total, item) => total + (item.product.precio * item.cantidad), 0)
    : null;

  return { quantity, amount, allPriced };
}

function getCartTotalLabel(items, totals = getCartTotals(items)) {
  if (cartState.status === "loading") return "Cargando…";
  if (cartState.status === "error") return "No disponible";
  if (items.length === 0) return formatCartPrice(0);
  return totals.allPriced ? formatCartPrice(totals.amount) : "A confirmar";
}

function hasCartPrice(value) {
  return Number.isFinite(value) && value >= 0;
}

function formatCartPrice(value) {
  return CART_PRICE_FORMATTER.format(value);
}

function sendCartToWhatsApp() {
  const items = getCartPageItems();
  if (items.length === 0) {
    setCartPageMessage("Agregá productos antes de preparar la consulta.");
    return;
  }

  if (!CART_CONFIG.isValid) {
    setCartPageMessage("La configuración de WhatsApp no es válida. Contactá a la librería desde la página principal.");
    return;
  }

  const customerName = cleanCartText(cartElements.customerName?.value, 80);
  const customerNotes = cleanCartText(cartElements.customerNotes?.value, 300);
  const message = buildCartWhatsAppMessage(items, customerName, customerNotes);
  const url = `https://wa.me/${CART_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;

  try {
    const openedWindow = window.open(url, "_blank");
    if (!openedWindow) {
      setCartPageMessage("No pudimos abrir WhatsApp. Permití las ventanas emergentes e intentá nuevamente.");
      return;
    }
    openedWindow.opener = null;
    setCartPageMessage("Revisá el mensaje antes de enviarlo. La disponibilidad y el total se confirman por WhatsApp.");
  } catch (error) {
    console.error("No se pudo abrir WhatsApp.", error);
    setCartPageMessage("No pudimos abrir WhatsApp. Revisá los permisos del navegador e intentá nuevamente.");
  }
}

function buildCartWhatsAppMessage(items, customerName = "", customerNotes = "") {
  const totals = getCartTotals(items);
  const lines = ["Hola, quiero consultar por el siguiente pedido:", ""];

  items.forEach((item) => {
    const productName = cleanCartText(item.product.nombre, 160);
    const unitPrice = hasCartPrice(item.product.precio)
      ? formatCartPrice(item.product.precio)
      : "Precio a confirmar";
    const subtotal = hasCartPrice(item.product.precio)
      ? formatCartPrice(item.product.precio * item.cantidad)
      : "Subtotal a confirmar";
    lines.push(`• ${productName} — ${item.cantidad} × ${unitPrice} = ${subtotal}`);
  });

  lines.push("", `Total estimado: ${totals.allPriced ? formatCartPrice(totals.amount) : "A confirmar"}`);

  if (customerName || customerNotes) {
    lines.push("");
    if (customerName) lines.push(`Nombre: ${customerName}`);
    if (customerNotes) lines.push(`Observaciones: ${customerNotes}`);
  }

  lines.push("", "Entiendo que el pedido queda sujeto a confirmación por WhatsApp.");
  return lines.join("\n");
}

function updateCartSendButton() {
  const items = getCartPageItems();
  cartElements.sendButton.removeAttribute("aria-busy");

  if (cartState.status === "loading") {
    cartElements.sendButton.disabled = true;
    cartElements.sendButton.setAttribute("aria-busy", "true");
    cartElements.sendLabel.textContent = "Cargando catálogo";
    return;
  }

  if (cartState.status === "error") {
    cartElements.sendButton.disabled = true;
    cartElements.sendLabel.textContent = "Catálogo no disponible";
    return;
  }

  if (!CART_CONFIG.isValid) {
    cartElements.sendButton.disabled = true;
    cartElements.sendLabel.textContent = "WhatsApp no disponible";
    return;
  }

  cartElements.sendButton.disabled = items.length === 0;
  cartElements.sendLabel.textContent = "Continuar en WhatsApp";
  cartElements.sendButton.setAttribute(
    "aria-label",
    `Enviar consulta a ${CART_CONFIG.businessName} por WhatsApp`,
  );
}

function loadCart() {
  try {
    const saved = JSON.parse(safeCartStorageGet(CART_STORAGE_KEYS.cart) || "[]");
    if (!Array.isArray(saved)) return [];
    return normalizeCartEntries(saved);
  } catch {
    return [];
  }
}

function normalizeCartEntries(entries) {
  const quantitiesById = new Map();
  let inspectedEntries = 0;

  for (const entry of entries) {
    inspectedEntries += 1;
    if (inspectedEntries > CART_MAX_STORED_ENTRIES) break;
    if (!entry || typeof entry !== "object" || Array.isArray(entry)) continue;

    const id = normalizeCartId(entry.id);
    const quantity = Number(entry.cantidad);
    if (!id || !Number.isFinite(quantity) || !Number.isInteger(quantity) || quantity <= 0) continue;

    const normalizedQuantity = Math.min(quantity, CART_CONFIG.maxQuantityPerProduct);
    if (quantitiesById.has(id)) {
      quantitiesById.set(
        id,
        Math.min(
          CART_CONFIG.maxQuantityPerProduct,
          quantitiesById.get(id) + normalizedQuantity,
        ),
      );
      continue;
    }

    if (quantitiesById.size >= CART_MAX_LINES) continue;
    quantitiesById.set(id, normalizedQuantity);
  }

  return Array.from(quantitiesById, ([id, cantidad]) => ({ id, cantidad }));
}

function normalizeCartId(value) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .trim()
    .slice(0, 160);
}

function saveCart() {
  cartState.cart = normalizeCartEntries(cartState.cart);
  return safeCartStorageSet(CART_STORAGE_KEYS.cart, JSON.stringify(cartState.cart));
}

function safeCartStorageGet(key) {
  try {
    return window.localStorage.getItem(key);
  } catch (error) {
    console.warn(`No se pudo leer ${key} de localStorage.`, error);
    return null;
  }
}

function safeCartStorageSet(key, value) {
  try {
    window.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    console.warn(`No se pudo guardar ${key} en localStorage.`, error);
    setCartPageMessage("El navegador no permitió guardar la lista.");
    return false;
  }
}

function readCartStoreConfig(rawConfig) {
  const isObject = rawConfig && typeof rawConfig === "object" && !Array.isArray(rawConfig);
  const whatsappNumber = isObject ? String(rawConfig.whatsappNumber ?? "").trim() : "";
  const businessName = isObject && typeof rawConfig.businessName === "string"
    ? cleanCartText(rawConfig.businessName, 120)
    : "";
  const configuredMaximum = isObject
    ? Number(rawConfig.maxQuantityPerProduct ?? rawConfig.maxQuantity)
    : Number.NaN;

  const hasValidNumber = /^\d{8,15}$/.test(whatsappNumber);
  const hasValidBusinessName = businessName.length > 0;
  const hasValidMaximum = Number.isInteger(configuredMaximum)
    && configuredMaximum === CART_MAX_QUANTITY;
  const isValid = Boolean(isObject && hasValidNumber && hasValidBusinessName && hasValidMaximum);

  if (!isValid) {
    console.error("window.PPT_STORE_CONFIG debe incluir whatsappNumber, businessName y maxQuantityPerProduct: 99 válidos.");
  }

  return Object.freeze({
    whatsappNumber: hasValidNumber ? whatsappNumber : "",
    businessName: hasValidBusinessName ? businessName : "",
    maxQuantityPerProduct: CART_MAX_QUANTITY,
    isValid,
  });
}

function cleanCartText(value, maxLength = 500) {
  return String(value ?? "")
    .replace(/[\u0000-\u001f\u007f]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

function setCartPageMessage(message) {
  if (cartElements.message) cartElements.message.textContent = message;
}

function showCartToast(message) {
  if (!cartElements.toast) return;
  cartElements.toast.textContent = message;
  cartElements.toast.classList.add("is-visible");
  window.clearTimeout(cartToastTimer);
  cartToastTimer = window.setTimeout(() => cartElements.toast.classList.remove("is-visible"), 2200);
}
