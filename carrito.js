const CART_CONFIG = {
  whatsappNumber: "5491152627005",
  businessName: "Piedra, Papel o Tijera Librería",
  maxQuantityPerProduct: 99,
  orderCooldownMs: 60 * 1000,
};

const CART_STORAGE_KEYS = {
  cart: "pptLibreriaCart",
  lastOrderAt: "pptLibreriaLastOrderAt",
};

const CART_PRODUCTS_URL = "productos.json";
const CART_FALLBACK_IMAGE = "img/producto-sin-imagen.svg";

const cartElements = {
  items: document.querySelector("#cartItems"),
  lineCount: document.querySelector("#cartLineCount"),
  totalItems: document.querySelector("#cartTotalItems"),
  clearButton: document.querySelector("#clearCartButton"),
  sendButton: document.querySelector("#sendWhatsAppButton"),
  sendLabel: document.querySelector("#sendWhatsAppLabel"),
  message: document.querySelector("#cartMessage"),
  toast: document.querySelector("#toast"),
};

const cartState = {
  cart: loadCart(),
  catalog: new Map(),
  ready: false,
};

let cartCooldownTimer = null;
let cartToastTimer = null;

initCartPage();

async function initCartPage() {
  bindCartEvents();
  renderCartPage();

  try {
    const products = await loadCartProducts();
    cartState.catalog = buildCartCatalogIndex(products);
    if (cartState.catalog.size === 0) throw new Error("El catálogo no contiene productos válidos.");
    cartState.ready = true;
    pruneMissingCartItems();
    renderCartPage();
  } catch (error) {
    console.error(error);
    setCartPageMessage("No pudimos cargar el catálogo. Volvé a la página principal e intentá nuevamente.");
    updateCartSendButton();
  }
}

function bindCartEvents() {
  cartElements.clearButton.addEventListener("click", clearCartPage);
  cartElements.sendButton.addEventListener("click", sendCartToWhatsApp);
  window.addEventListener("storage", (event) => {
    if (event.key !== CART_STORAGE_KEYS.cart) return;
    cartState.cart = loadCart();
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
    const productId = String(rawProduct.id ?? "").trim();
    const productName = String(rawProduct.nombre ?? "").trim();
    const category = String(rawProduct.categoria ?? "").trim();
    if (!productId || !productName || !category) return;

    const variants = Array.isArray(rawProduct.variantes) && rawProduct.variantes.length > 0
      ? rawProduct.variantes
      : [{ id: productId, nombre: "", imagen: rawProduct.imagen }];

    variants.forEach((rawVariant) => {
      if (!rawVariant || typeof rawVariant !== "object" || Array.isArray(rawVariant)) return;
      const id = String(rawVariant.id ?? "").trim();
      if (!id || index.has(id)) return;
      const variantName = String(rawVariant.nombre ?? "").trim();
      const image = String(rawVariant.imagen ?? rawProduct.imagen ?? "").trim() || CART_FALLBACK_IMAGE;
      index.set(id, {
        id,
        nombre: variantName ? `${productName} - ${variantName}` : productName,
        categoria: category,
        variante: variantName,
        imagen: image,
      });
    });
  });

  return index;
}

function renderCartPage() {
  const items = getCartPageItems();
  const totalQuantity = items.reduce((total, item) => total + item.cantidad, 0);
  cartElements.items.textContent = "";

  if (items.length === 0) {
    cartElements.items.append(createCartEmptyState());
  } else {
    const fragment = document.createDocumentFragment();
    items.forEach((item) => fragment.append(createCartPageItem(item)));
    cartElements.items.append(fragment);
  }

  cartElements.lineCount.textContent = `${items.length} producto${items.length === 1 ? "" : "s"}`;
  cartElements.totalItems.textContent = String(totalQuantity);
  cartElements.clearButton.disabled = items.length === 0;
  updateCartSendButton();
}

function createCartEmptyState() {
  const empty = document.createElement("div");
  empty.className = "cart-page-empty";

  const title = document.createElement("h2");
  title.textContent = "Tu lista está vacía";
  const copy = document.createElement("p");
  copy.textContent = "Agregá productos desde el catálogo para preparar una consulta.";
  const link = document.createElement("a");
  link.className = "button";
  link.href = "index.html#catalogo";
  link.textContent = "Explorar catálogo";

  empty.append(title, copy, link);
  return empty;
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
    if (!image.src.endsWith(CART_FALLBACK_IMAGE)) image.src = CART_FALLBACK_IMAGE;
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
  price.textContent = "Consultar precio";
  content.append(category, title, price);

  const actions = document.createElement("div");
  actions.className = "cart-page-item__actions";
  const quantity = document.createElement("div");
  quantity.className = "quantity-control";
  quantity.setAttribute("aria-label", `Cantidad de ${item.product.nombre}`);

  const decrease = document.createElement("button");
  decrease.type = "button";
  decrease.textContent = "−";
  decrease.setAttribute("aria-label", `Disminuir ${item.product.nombre}`);
  decrease.addEventListener("click", () => updateCartQuantity(item.product.id, item.cantidad - 1));
  const amount = document.createElement("span");
  amount.textContent = String(item.cantidad);
  amount.setAttribute("aria-live", "polite");
  const increase = document.createElement("button");
  increase.type = "button";
  increase.textContent = "+";
  increase.setAttribute("aria-label", `Aumentar ${item.product.nombre}`);
  increase.addEventListener("click", () => updateCartQuantity(item.product.id, item.cantidad + 1));
  quantity.append(decrease, amount, increase);

  const remove = document.createElement("button");
  remove.className = "remove-button";
  remove.type = "button";
  remove.textContent = "Quitar";
  remove.addEventListener("click", () => removeCartItem(item.product.id));
  actions.append(quantity, remove);

  article.append(imageWrap, content, actions);
  return article;
}

function updateCartQuantity(productId, nextQuantity) {
  const item = cartState.cart.find((cartItem) => cartItem.id === productId);
  if (!item) return;
  if (nextQuantity <= 0) {
    removeCartItem(productId);
    return;
  }

  item.cantidad = Math.min(CART_CONFIG.maxQuantityPerProduct, Math.max(1, nextQuantity));
  saveCart();
  renderCartPage();
}

function removeCartItem(productId) {
  cartState.cart = cartState.cart.filter((item) => item.id !== productId);
  saveCart();
  renderCartPage();
  showCartToast("Producto quitado de la lista.");
}

function clearCartPage() {
  if (cartState.cart.length === 0) return;
  cartState.cart = [];
  saveCart();
  setCartPageMessage("");
  renderCartPage();
  showCartToast("Lista de consulta vacía.");
}

function pruneMissingCartItems() {
  const validItems = cartState.cart.filter((item) => cartState.catalog.has(item.id));
  if (validItems.length === cartState.cart.length) return;
  cartState.cart = validItems;
  saveCart();
}

function getCartPageItems() {
  if (!cartState.ready) return [];
  return cartState.cart
    .map((item) => ({ product: cartState.catalog.get(item.id), cantidad: item.cantidad }))
    .filter((item) => item.product);
}

function sendCartToWhatsApp() {
  const items = getCartPageItems();
  if (items.length === 0) {
    setCartPageMessage("Agregá productos antes de enviar la consulta.");
    return;
  }

  const remainingCooldown = getCartRemainingCooldown();
  if (remainingCooldown > 0) {
    setCartPageMessage("Esperá unos segundos antes de enviar otra consulta.");
    return;
  }

  const message = buildCartWhatsAppMessage(items);
  const url = `https://wa.me/${CART_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  safeCartStorageSet(CART_STORAGE_KEYS.lastOrderAt, String(Date.now()));
  updateCartSendButton();
  const openedWindow = window.open(url, "_blank", "noopener,noreferrer");
  setCartPageMessage(openedWindow
    ? "Consulta preparada en WhatsApp."
    : "No pudimos abrir WhatsApp. Permití ventanas emergentes e intentá nuevamente.");
}

function buildCartWhatsAppMessage(items) {
  const totalQuantity = items.reduce((total, item) => total + item.cantidad, 0);
  const lines = [`Consulta desde la web de ${cleanCartText(CART_CONFIG.businessName)}:`, ""];
  items.forEach((item) => lines.push(`- ${cleanCartText(item.product.nombre)} x${item.cantidad}`));
  lines.push("", `Total de productos: ${totalQuantity}`, "Precio: a consultar", "");
  lines.push("Hola, quiero consultar precio y disponibilidad de estos productos.");
  return lines.join("\n");
}

function updateCartSendButton() {
  window.clearTimeout(cartCooldownTimer);
  cartCooldownTimer = null;
  const items = getCartPageItems();
  const remainingCooldown = getCartRemainingCooldown();

  if (!cartState.ready) {
    cartElements.sendButton.disabled = true;
    cartElements.sendLabel.textContent = "Cargando catálogo";
    return;
  }

  if (remainingCooldown > 0) {
    const seconds = Math.ceil(remainingCooldown / 1000);
    cartElements.sendButton.disabled = true;
    cartElements.sendLabel.textContent = `Esperá ${seconds}s`;
    cartCooldownTimer = window.setTimeout(updateCartSendButton, Math.min(1000, remainingCooldown + 20));
    return;
  }

  cartElements.sendButton.disabled = items.length === 0;
  cartElements.sendLabel.textContent = "Enviar consulta por WhatsApp";
}

function getCartRemainingCooldown() {
  const lastOrderAt = Number(safeCartStorageGet(CART_STORAGE_KEYS.lastOrderAt) || 0);
  if (!Number.isFinite(lastOrderAt) || lastOrderAt <= 0) return 0;
  return Math.max(0, CART_CONFIG.orderCooldownMs - Math.max(0, Date.now() - lastOrderAt));
}

function loadCart() {
  try {
    const saved = JSON.parse(safeCartStorageGet(CART_STORAGE_KEYS.cart) || "[]");
    if (!Array.isArray(saved)) return [];
    return saved
      .map((item) => ({
        id: String(item.id ?? "").trim(),
        cantidad: Math.min(Number(item.cantidad), CART_CONFIG.maxQuantityPerProduct),
      }))
      .filter((item) => item.id && Number.isInteger(item.cantidad) && item.cantidad > 0);
  } catch {
    return [];
  }
}

function saveCart() {
  safeCartStorageSet(CART_STORAGE_KEYS.cart, JSON.stringify(cartState.cart));
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

function cleanCartText(value) {
  return String(value)
    .replace(/[\u0000-\u001f\u007f]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function setCartPageMessage(message) {
  cartElements.message.textContent = message;
}

function showCartToast(message) {
  cartElements.toast.textContent = message;
  cartElements.toast.classList.add("is-visible");
  window.clearTimeout(cartToastTimer);
  cartToastTimer = window.setTimeout(() => cartElements.toast.classList.remove("is-visible"), 2200);
}
