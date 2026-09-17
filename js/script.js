(() => {
  'use strict';
  const $ = (selector) => document.querySelector(selector);
  const FALLBACK = 'img/producto-sin-imagen.svg';
  const CART_KEY = 'pptLibreriaCart';
  const SAVED_KEY = 'pptLibreriaSaved';
  const PAGE_SIZE = 12;
  const MAX_QUANTITY = window.PPT_STORE_CONFIG.maxQuantityPerProduct;
  const money = new Intl.NumberFormat('es-AR', { style: 'currency', currency: 'ARS' });
  const state = { products: [], index: new Map(), categories: new Map(), cart: [], saved: new Set(), category: 'Todos', search: '', sort: 'featured', photos: false, favorites: false, limit: PAGE_SIZE };
  let currentProduct = null;
  let currentVariant = null;
  let productTrigger = null;
  let searchTimer;
  let toastTimer;
  const dialog = $('#productDialog');
  const menu = $('#mobileNavigation');
  const mobile = window.matchMedia('(max-width: 800px)');
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)');

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function icon(name) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const use = document.createElementNS(svg.namespaceURI, 'use');
    svg.setAttribute('class', 'icon'); svg.setAttribute('aria-hidden', 'true');
    use.setAttribute('href', `#i-${name}`); svg.append(use); return svg;
  }
  function normalized(value) { return String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
  function price(value) { return Number.isFinite(value) && value >= 0 ? money.format(value) : 'Precio a consultar'; }
  function readStorage(key) {
    try { const raw = localStorage.getItem(key); return raw && raw.length < 180000 ? JSON.parse(raw) : []; } catch { return []; }
  }
  function writeStorage(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); return true; } catch { notify('El navegador no permitió guardar el cambio. Revisá sus permisos.', false); return false; }
  }
  function normalizeCart(entries) {
    const quantities = new Map();
    if (!Array.isArray(entries)) return [];
    entries.slice(0, 1000).forEach(item => {
      if (!item || typeof item !== 'object' || !state.index.has(item.id)) return;
      const quantity = Number(item.cantidad);
      if (!Number.isSafeInteger(quantity) || quantity <= 0) return;
      quantities.set(item.id, Math.min(MAX_QUANTITY, (quantities.get(item.id) || 0) + quantity));
    });
    return Array.from(quantities, ([id, cantidad]) => ({ id, cantidad }));
  }
  function imagePath(path) { return typeof path === 'string' && /^img\/[a-zA-Z0-9_./-]+$/.test(path) && !path.includes('..') ? path : FALLBACK; }
  function hasPhoto(product) { return product.variantes.some(v => v.imagen !== FALLBACK); }
  function productImage(product) { return product.variantes.find(v => v.imagen !== FALLBACK)?.imagen || FALLBACK; }

  async function init() {
    bindEvents();
    $('#footerYear').textContent = new Date().getFullYear();
    syncFilterLayout();
    try {
      let catalog = window.PRODUCTOS_CATALOGO;
      if (!Array.isArray(catalog)) {
        const response = await fetch('data/productos.json');
        if (!response.ok) throw new Error('No se pudo leer el catálogo.');
        catalog = await response.json();
      }
      if (!Array.isArray(catalog)) throw new Error('Catálogo inválido.');
      const ids = new Set();
      state.products = catalog.filter(p => p && p.id && p.nombre && p.categoria).map(p => {
        const rawVariants = Array.isArray(p.variantes) && p.variantes.length ? p.variantes : [{ id: p.id, nombre: '', imagen: p.imagen, precio: p.precio }];
        const variantes = rawVariants.filter(v => v && v.id && !ids.has(String(v.id))).map(v => {
          const id = String(v.id); ids.add(id);
          const raw = v.precio ?? p.precio;
          const value = raw === null || raw === undefined || raw === '' ? null : Number(raw);
          return { ...v, id, nombre: String(v.nombre || ''), imagen: imagePath(v.imagen || p.imagen), precio: Number.isFinite(value) && value >= 0 ? value : null };
        });
        return { ...p, variantes, searchText: normalized([p.nombre, p.descripcion, p.categoria, ...variantes.map(v => v.nombre)].join(' ')) };
      }).filter(p => p.variantes.length);
      if (!state.products.length) throw new Error('No hay productos válidos.');
      state.products.forEach(p => {
        state.categories.set(p.categoria, (state.categories.get(p.categoria) || 0) + 1);
        p.variantes.forEach(v => state.index.set(v.id, { product: p, variant: v }));
      });
      state.cart = normalizeCart(readStorage(CART_KEY));
      const saved = readStorage(SAVED_KEY);
      state.saved = new Set(Array.isArray(saved) ? saved.slice(0, 250).filter(id => state.products.some(p => p.id === id)) : []);
      const params = new URLSearchParams(location.search);
      if (state.categories.has(params.get('categoria'))) state.category = params.get('categoria');
      state.search = (params.get('q') || '').slice(0, 120);
      $('#searchInput').value = state.search;
      renderFilters(); renderFeatured(); renderProducts(); renderCartBadge();
      if (params.get('producto')) {
        const product = state.products.find(p => p.id === params.get('producto'));
        if (product) openProduct(product, null);
      }
    } catch (error) {
      $('#resultCount').textContent = 'No pudimos cargar el catálogo. Podés consultarnos por WhatsApp.';
      $('#productGrid').setAttribute('aria-busy', 'false');
      $('#featuredGrid').setAttribute('aria-busy', 'false');
      $('#emptyState').hidden = false;
      console.error(error);
    }
  }

  function bindEvents() {
    $('#searchForm').addEventListener('submit', event => { event.preventDefault(); clearTimeout(searchTimer); state.search = $('#searchInput').value; state.limit = PAGE_SIZE; renderProducts(); goToCatalog(); });
    $('#searchInput').addEventListener('input', () => {
      clearTimeout(searchTimer); $('#clearSearchButton').hidden = !$('#searchInput').value;
      searchTimer = setTimeout(() => { state.search = $('#searchInput').value; state.limit = PAGE_SIZE; renderProducts(); if (state.search.trim()) goToCatalog(false); }, 180);
    });
    $('#clearSearchButton').addEventListener('click', () => { clearTimeout(searchTimer); state.search = ''; $('#searchInput').value = ''; state.limit = PAGE_SIZE; renderProducts(); $('#searchInput').focus(); });
    $('#photosOnly').addEventListener('change', event => { state.photos = event.target.checked; state.limit = PAGE_SIZE; renderProducts(); });
    $('#sortProducts').addEventListener('change', event => { state.sort = event.target.value; state.limit = PAGE_SIZE; renderProducts(); });
    $('#resetFilters').addEventListener('click', resetFilters);
    $('#emptyReset').addEventListener('click', resetFilters);
    ['#favoritesButton', '#favoritesFilterButton', '#mobileFavoritesButton'].forEach(selector => $(selector).addEventListener('click', () => {
      state.favorites = !state.favorites; state.category = 'Todos'; state.photos = false; state.search = ''; $('#searchInput').value = ''; state.limit = PAGE_SIZE;
      clearTimeout(searchTimer); closeMenu(); renderProducts(); goToCatalog();
    }));
    $('#loadMoreButton').addEventListener('click', () => {
      const previous = state.limit; state.limit += PAGE_SIZE; renderProducts({ append: true, from: previous });
      $('#productGrid').children[previous]?.querySelector('.product-card__title')?.focus({ preventScroll: true });
    });
    document.addEventListener('click', event => {
      const link = event.target.closest('[data-category-shortcut]');
      if (!link) return;
      event.preventDefault();
      const category = link.dataset.categoryShortcut;
      if (category !== 'Todos' && !state.categories.has(category)) return;
      state.category = category; state.search = ''; state.favorites = false; state.photos = false; state.limit = PAGE_SIZE;
      $('#searchInput').value = ''; clearTimeout(searchTimer); closeMenu(); renderProducts({ animate: true }); goToCatalog();
    });
    $('#productDialogAdd').addEventListener('click', () => {
      const input = $('#dialogQuantity');
      if (!input.reportValidity()) return;
      if (addToCart(currentVariant.id, Number(input.value))) { closeProduct(); }
    });
    $('#closeProductDialog').addEventListener('click', closeProduct);
    dialog.addEventListener('close', () => { document.body.classList.remove('dialog-open'); if (productTrigger?.isConnected) productTrigger.focus({ preventScroll: true }); currentProduct = null; });
    dialog.addEventListener('click', event => { if (event.target === dialog) { const r = dialog.getBoundingClientRect(); if (event.clientX < r.left || event.clientX > r.right || event.clientY < r.top || event.clientY > r.bottom) closeProduct(); } });
    $('#productDialogImage').addEventListener('error', event => { if (!event.target.src.endsWith(FALLBACK)) event.target.src = FALLBACK; $('#productDialogImageStatus').hidden = false; });
    $('#mobileMenuToggle').addEventListener('click', () => { menu.showModal(); document.body.classList.add('dialog-open'); });
    $('#closeMobileNavigation').addEventListener('click', closeMenu);
    menu.addEventListener('close', () => document.body.classList.remove('dialog-open'));
    menu.addEventListener('click', event => {
      const link = event.target.closest('a[href^="#"]');
      if (!link) return;
      closeMenu();
      const target = document.querySelector(link.getAttribute('href'));
      if (target) requestAnimationFrame(() => { target.setAttribute('tabindex', '-1'); target.focus({ preventScroll: true }); });
    });
    mobile.addEventListener('change', () => { syncFilterLayout(); if (!mobile.matches) closeMenu(); });
    window.addEventListener('storage', event => {
      if (event.key === CART_KEY || event.key === null) { state.cart = normalizeCart(readStorage(CART_KEY)); renderCartBadge(); }
      if (event.key === SAVED_KEY || event.key === null) { const saved = readStorage(SAVED_KEY); state.saved = new Set(Array.isArray(saved) ? saved.slice(0,250).filter(id => state.products.some(p => p.id === id)) : []); syncSavedButtons(); if (state.favorites) renderProducts(); }
    });
  }
  function closeMenu() { if (menu.open) menu.close(); }
  function syncFilterLayout() { $('#filterDetails').open = !mobile.matches; }
  function goToCatalog(smooth = true) {
    const target = $('#catalogo');
    const top = target.getBoundingClientRect().top + scrollY - document.querySelector('.site-header').offsetHeight - 16;
    window.scrollTo({ top, behavior: smooth && !reducedMotion.matches ? 'smooth' : 'instant' });
  }
  function resetFilters() {
    clearTimeout(searchTimer); state.category = 'Todos'; state.search = ''; state.photos = false; state.favorites = false; state.limit = PAGE_SIZE; state.sort = 'featured'; $('#searchInput').value = ''; renderProducts();
  }
  function renderFilters() {
    const fragment = document.createDocumentFragment();
    const categories = [['Todos', state.products.length], ...state.categories];
    categories.forEach(([category, count]) => {
      const button = el('button', 'category-filter'); button.type = 'button'; button.dataset.category = category;
      button.append(el('span', '', category === 'Todos' ? 'Todos los productos' : category), el('span', 'category-count', String(count)));
      button.addEventListener('click', () => { state.category = category; state.limit = PAGE_SIZE; renderProducts({ animate: true }); if (mobile.matches) { $('#filterDetails').open = false; goToCatalog(false); } });
      fragment.append(button);
    });
    $('#categoryFilters').replaceChildren(fragment);
  }
  function filteredProducts() {
    const tokens = normalized(state.search).split(/\s+/).filter(Boolean);
    const list = state.products.filter(p => (state.category === 'Todos' || p.categoria === state.category) && tokens.every(token => p.searchText.includes(token)) && (!state.photos || hasPhoto(p)) && (!state.favorites || state.saved.has(p.id)));
    if (state.sort === 'az') list.sort((a,b) => a.nombre.localeCompare(b.nombre, 'es'));
    else if (state.sort === 'za') list.sort((a,b) => b.nombre.localeCompare(a.nombre, 'es'));
    else list.sort((a,b) => Number(hasPhoto(b)) - Number(hasPhoto(a)));
    return list;
  }
  function renderProducts(options = {}) {
    const products = filteredProducts();
    const start = options.append ? options.from : 0;
    const fragment = document.createDocumentFragment();
    products.slice(start, state.limit).forEach(p => fragment.append(createCard(p, options.animate || options.append)));
    if (options.append) $('#productGrid').append(fragment); else $('#productGrid').replaceChildren(fragment);
    $('#productGrid').setAttribute('aria-busy', 'false');
    $('#resultCount').textContent = `${products.length} ${products.length === 1 ? 'producto' : 'productos'}${state.category !== 'Todos' ? ` en ${state.category}` : ''}`;
    $('#emptyState').hidden = products.length > 0;
    $('#loadMoreArea').hidden = products.length <= state.limit;
    $('#visibleCount').textContent = `Estás viendo ${Math.min(products.length, state.limit)} de ${products.length} productos`;
    $('#clearSearchButton').hidden = !state.search;
    $('#photosOnly').checked = state.photos;
    $('#sortProducts').value = state.sort;
    ['#favoritesButton', '#favoritesFilterButton', '#mobileFavoritesButton'].forEach(selector => $(selector).setAttribute('aria-pressed', String(state.favorites)));
    $('#categoryFilters').querySelectorAll('button').forEach(button => { const active = button.dataset.category === state.category; button.classList.toggle('is-active', active); button.setAttribute('aria-pressed', String(active)); });
    const filters = [];
    if (state.search.trim()) filters.push([`Búsqueda: ${state.search}`, () => { state.search = ''; $('#searchInput').value = ''; }]);
    if (state.category !== 'Todos') filters.push([state.category, () => state.category = 'Todos']);
    if (state.favorites) filters.push(['Mis guardados', () => state.favorites = false]);
    if (state.photos) filters.push(['Con foto', () => state.photos = false]);
    $('#activeFilters').replaceChildren(...filters.map(([label, clear]) => {
      const button = el('button', 'filter-chip', label); button.type = 'button'; button.setAttribute('aria-label', `Quitar filtro ${label}`); button.append(icon('close'));
      button.addEventListener('click', () => { clear(); state.limit = PAGE_SIZE; renderProducts(); $('#catalogo').focus({ preventScroll: true }); }); return button;
    }));
  }
  function renderFeatured() {
    const pick = ['filgo-pinto-colores', 'filgo-roliart-6', 'filgo-tnt-marker-studio-24', 'jul16-filgo-resaltador-chato'];
    const chosen = [];
    for (const prefix of pick) { const product = state.products.find(p => p.id.startsWith(prefix) && hasPhoto(p) && !chosen.includes(p)); if (product) chosen.push(product); }
    for (const p of state.products) { if (chosen.length === 4) break; if (hasPhoto(p) && !chosen.includes(p)) chosen.push(p); }
    $('#featuredGrid').replaceChildren(...chosen.map(p => createCard(p))); $('#featuredGrid').setAttribute('aria-busy', 'false');
  }
  function createCard(product, animate = false) {
    const card = el('article', `product-card${animate ? ' product-card--enter' : ''}`); card.dataset.productId = product.id;
    const media = el('div', 'product-card__media');
    const imageButton = el('button', 'product-card__image-button'); imageButton.type = 'button'; imageButton.tabIndex = -1; imageButton.setAttribute('aria-hidden', 'true');
    const image = el('img'); image.src = productImage(product); image.alt = product.nombre; image.width = 360; image.height = 360; image.loading = 'lazy'; image.decoding = 'async';
    image.addEventListener('error', () => { if (!image.src.endsWith(FALLBACK)) image.src = FALLBACK; });
    imageButton.append(image); imageButton.addEventListener('click', () => openProduct(product, card.querySelector('.product-card__title')));
    const saved = el('button', 'save-product'); saved.type = 'button'; saved.dataset.saveId = product.id; saved.setAttribute('aria-label', `Guardar ${product.nombre}`); saved.setAttribute('aria-pressed', String(state.saved.has(product.id))); saved.append(icon('heart'));
    saved.addEventListener('click', () => toggleSaved(product, saved));
    media.append(imageButton, saved);
    const body = el('div', 'product-card__body'); body.append(el('p', 'product-card__category', product.categoria));
    const heading = el('h3'); const title = el('button', 'product-card__title', product.nombre); title.type = 'button'; title.addEventListener('click', () => openProduct(product, title)); heading.append(title);
    const variants = el('p', 'product-card__variants', product.variantes.length > 1 ? `${product.variantes.length} opciones para elegir` : 'Presentación única');
    const prices = product.variantes.map(v=>v.precio).filter(v=>Number.isFinite(v));
    const priceLabel = prices.length === product.variantes.length ? `${new Set(prices).size > 1 ? 'Desde ' : ''}${price(Math.min(...prices))}` : 'Precio a consultar';
    const footer = el('div', 'product-card__footer');
    const add = el('button', 'product-card__add', product.variantes.length > 1 ? 'Elegir opciones' : 'Agregar al pedido'); add.type = 'button'; add.append(icon(product.variantes.length > 1 ? 'arrow' : 'bag'));
    add.addEventListener('click', () => { if (product.variantes.length > 1) openProduct(product, add); else addToCart(product.variantes[0].id, 1); });
    footer.append(el('p', 'product-card__price', priceLabel), add); body.append(heading, variants, footer); card.append(media, body); return card;
  }
  function toggleSaved(product, trigger) {
    const next = new Set(state.saved); const removing = next.has(product.id);
    if (removing) next.delete(product.id); else next.add(product.id);
    if (!writeStorage(SAVED_KEY, [...next])) return;
    state.saved = next; syncSavedButtons();
    if (state.favorites && removing) { renderProducts(); $('#catalogo').focus({ preventScroll: true }); }
    notify(removing ? 'Producto quitado de tus guardados.' : 'Producto guardado para volver a verlo.', false);
  }
  function syncSavedButtons() { document.querySelectorAll('[data-save-id]').forEach(button => button.setAttribute('aria-pressed', String(state.saved.has(button.dataset.saveId)))); }
  function openProduct(product, trigger) {
    currentProduct = product; productTrigger = trigger;
    $('#productDialogTitle').textContent = product.nombre;
    $('#productDialogCategory').textContent = product.categoria;
    $('#productDialogDescription').textContent = product.descripcion || 'Consultanos por las características de este producto.';
    $('#dialogQuantity').value = '1';
    $('#productDialogOptionLabel').textContent = product.opcion || 'Presentación';
    $('#productDialogVariantGroup').hidden = product.variantes.length === 1;
    $('#productDialogVariants').replaceChildren(...product.variantes.map((variant, i) => {
      const label = el('label', 'variant-option'); const input = el('input'); input.type = 'radio'; input.name = 'productVariant'; input.value = variant.id; input.checked = i === 0;
      input.addEventListener('change', () => selectVariant(variant)); label.append(input, el('span', '', variant.nombre || 'Única')); return label;
    }));
    selectVariant(product.variantes[0]);
    document.body.classList.add('dialog-open'); dialog.showModal(); $('#closeProductDialog').focus({ preventScroll: true });
  }
  function selectVariant(variant) {
    currentVariant = variant;
    $('#productDialogImage').src = variant.imagen;
    $('#productDialogImage').alt = `${currentProduct.nombre}${variant.nombre ? `, ${variant.nombre}` : ''}`;
    $('#productDialogImageStatus').hidden = variant.imagen !== FALLBACK;
    $('#productDialogPrice').textContent = price(variant.precio);
    $('#productDialogSelection').textContent = variant.nombre ? `${currentProduct.opcion || 'Opción'}: ${variant.nombre}` : '';
    const message = `Hola, quisiera consultar precio y disponibilidad de ${currentProduct.nombre}${variant.nombre ? ` — ${variant.nombre}` : ''}.`;
    $('#productDialogAsk').href = `https://wa.me/${window.PPT_STORE_CONFIG.whatsappNumber}?text=${encodeURIComponent(message)}`;
  }
  function closeProduct() { if (dialog.open) dialog.close(); }
  function addToCart(id, quantity) {
    if (!state.index.has(id) || !Number.isInteger(quantity) || quantity < 1 || quantity > MAX_QUANTITY) return false;
    state.cart = normalizeCart(readStorage(CART_KEY));
    const next = state.cart.map(item => ({ ...item })); const existing = next.find(item => item.id === id);
    if ((existing?.cantidad || 0) + quantity > MAX_QUANTITY) { notify(`El máximo es ${MAX_QUANTITY} unidades de esta opción.`, false); return false; }
    if (existing) existing.cantidad += quantity; else next.push({ id, cantidad: quantity });
    if (!writeStorage(CART_KEY, next)) return false;
    state.cart = next; renderCartBadge(); notify(`${state.index.get(id).product.nombre} agregado al pedido.`); return true;
  }
  function renderCartBadge() {
    const count = state.cart.reduce((sum, item) => sum + item.cantidad, 0);
    $('#cartCount').textContent = count; $('#mobileCartCount').textContent = count;
    $('#cartButton').setAttribute('aria-label', `Mi pedido, ${count} unidades`);
    $('#mobileOrderBar').hidden = count === 0;
    document.body.classList.toggle('has-order', count > 0);
  }
  function notify(message, withLink = true) {
    clearTimeout(toastTimer); $('#toastMessage').textContent = message; $('#toast a').hidden = !withLink; $('#toast').classList.add('is-visible');
    toastTimer = setTimeout(() => $('#toast').classList.remove('is-visible'), 4200);
  }
  init();
})();
