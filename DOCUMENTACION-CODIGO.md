# Documentacion del codigo

Esta web es un catalogo frontend: lee productos, los muestra, arma una lista de consulta y prepara un mensaje de WhatsApp.

Nota simple sobre Big O: O(1) es muy rapido, O(N) recorre una lista una vez, O(N log N) suele seguir siendo bueno, y O(N^2) normalmente es peor porque compara muchas cosas contra muchas cosas. Por eso las partes pesadas se dejaron en O(N) cuando se pudo.

## Archivos

- `index.html`: arma la estructura visible de la pagina.
- `styles.css`: pinta la pagina, acomoda responsive, botones, tarjetas, carrito y animaciones.
- `script.js`: hace funcionar catalogo, busqueda, categorias, variantes, carrito y WhatsApp.
- `productos.json`: datos editables del catalogo.
- `productos-data.js`: copia compatible del catalogo para que el HTML funcione directo sin servidor.
- `vendor/`: librerias locales de animacion.

## Funciones de `script.js`

| Funcion | Explicacion simple | Costo |
|---|---|---|
| `init` | Prende la pagina, carga productos y dibuja todo por primera vez. | O(N + V) |
| `scheduleAnimationEnhancements` | Espera a que cargue la pagina para activar animaciones suaves. | O(1) |
| `loadProducts` | Busca los productos desde `productos-data.js` o `productos.json` y valida cada uno. | O(N + V) |
| `normalizeProduct` | Limpia un producto para que siempre tenga datos usables. | O(V) |
| `normalizeVariant` | Limpia una variante, por ejemplo un color o presentacion. | O(1) |
| `normalizePrice` | Acepta precio nulo o numero valido y rechaza datos raros. | O(1) |
| `setCatalogLoading` | Marca el catalogo como cargando y bloquea la busqueda un momento. | O(1) |
| `showCatalogError` | Muestra un mensaje si el catalogo no se pudo cargar. | O(1) |
| `bindEvents` | Conecta botones, busqueda, categorias, carrito y teclado con sus acciones. | O(B) |
| `handleSearchInput` | Hace que buscar sea global, visible y actualice resultados. | O(1) antes de render |
| `clearSearchState` | Borra la busqueda como si apretaras limpiar. | O(1) |
| `scrollToCatalogResults` | Lleva la pantalla directo a los productos. | O(1) |
| `scrollToSection` | Mueve la pantalla a una seccion sin taparla con el header. | O(1) |
| `scheduleProductRender` | Agrupa renders de busqueda para no redibujar de mas. | O(1) |
| `setupHeaderBehavior` | Cambia el header cuando haces scroll. | O(1) |
| `observeRevealElements` | Observa elementos para mostrarlos con animacion al aparecer. | O(E) |
| `renderCategoryFilters` | Marca en amarillo la categoria activa. | O(C) |
| `renderProducts` | Filtra, agrupa y dibuja las tarjetas visibles. | O(N + R) |
| `revealCatalogElements` | Hace visibles las secciones nuevas del catalogo despues de redibujar. | O(R) |
| `getResultSummary` | Escribe el texto de cuantos productos hay. | O(1) |
| `groupProductsByCategory` | Junta productos por categoria para mostrar carruseles. | O(R) |
| `createCategorySection` | Crea una seccion horizontal para una categoria. | O(P) |
| `createCarouselButton` | Crea un boton de flecha para mover un carrusel. | O(1) |
| `setupCategoryCarousels` | Prepara el auto-desplazamiento de carruseles visibles. | O(K) |
| `stopCategoryCarousels` | Apaga temporizadores viejos de carruseles. | O(T) |
| `scrollCategoryTrack` | Mueve un carrusel una tarjeta adelante o atras. | O(1) |
| `getCarouselStep` | Calcula cuanto debe moverse un carrusel. | O(1) |
| `isTrackScrollable` | Revisa si un carrusel tiene contenido para desplazar. | O(1) |
| `toDomId` | Convierte un texto en un id seguro para HTML. | O(L) |
| `createProductCard` | Crea una tarjeta con imagen, variantes y boton de consulta. | O(V) |
| `getSelectedVariant` | Devuelve la variante elegida o la primera. | O(V) |
| `getVariantDisplayName` | Une nombre de producto y variante en un texto lindo. | O(1) |
| `buildProductSearchText` | Prepara una sola vez el texto que usa el buscador. | O(V + L) |
| `getFilteredProducts` | Devuelve productos segun categoria y busqueda. | O(1), O(M) o O(N) |
| `setupAnimationLibrary` | Inicia Lenis y GSAP si estan disponibles. | O(1) |
| `refreshAnimationLibrary` | Pide a ScrollTrigger recalcular posiciones. | O(1) |
| `setupRevealAnimations` | Decide como mostrar animaciones de entrada. | O(E) |
| `setupGsapRevealAnimations` | Anima elementos con GSAP si la libreria esta lista. | O(E) |
| `animateProductCards` | Anima las tarjetas despues de renderizar productos. | O(R) |
| `bindProductCardMotion` | Agrega efecto suave de movimiento a una tarjeta. | O(1) |
| `addToCart` | Agrega un producto al carrito o sube cantidad. | O(Q) |
| `renderCart` | Dibuja lo que hay en la lista de consulta. | O(Q) |
| `createCartItem` | Crea una fila del carrito con cantidad y quitar. | O(1) |
| `updateQuantity` | Cambia cantidad y elimina si llega a cero. | O(Q) |
| `removeFromCart` | Saca un producto del carrito. | O(Q) |
| `sendOrderToWhatsApp` | Arma el link de WhatsApp y abre la consulta. | O(Q) |
| `buildWhatsAppMessage` | Convierte el carrito en texto para enviar. | O(Q) |
| `updateSendButtonState` | Activa, bloquea o cuenta cooldown del boton enviar. | O(Q) |
| `getRemainingCooldown` | Calcula si falta esperar para reenviar. | O(1) |
| `getCartItems` | Convierte ids del carrito en productos reales. | O(Q) |
| `getCartTotals` | Suma cantidades del carrito. | O(Q) |
| `loadCart` | Lee el carrito guardado y descarta datos rotos. | O(Q) |
| `saveCart` | Guarda el carrito actual. | O(Q) |
| `safeStorageGet` | Lee `localStorage` sin romper la pagina si falla. | O(1) |
| `safeStorageSet` | Guarda en `localStorage` sin romper la pagina si falla. | O(1) |
| `buildCatalogIndex` | Crea un mapa rapido de variantes por id. | O(V) |
| `buildCategoryIndex` | Crea un mapa rapido de productos por categoria. | O(N) |
| `findProduct` | Encuentra un producto del carrito por id de variante. | O(1) |
| `formatPrice` | Muestra siempre que el precio es a consultar. | O(1) |
| `normalizeText` | Baja texto a minusculas y sin acentos para buscar mejor. | O(L) |
| `cleanText` | Limpia saltos y espacios raros para WhatsApp. | O(L) |
| `bumpCartButton` | Hace el pequeño golpe visual del boton de carrito. | O(1) |
| `openCart` | Abre el panel del carrito y bloquea el fondo. | O(Q) |
| `closeCart` | Cierra el carrito con animacion si existe. | O(1) |
| `finishCloseCart` | Termina el cierre, desbloquea el fondo y devuelve el foco. | O(1) |
| `isCartOpen` | Pregunta si el carrito esta abierto. | O(1) |
| `trapCartFocus` | Mantiene el foco del teclado dentro del carrito. | O(F) |
| `lockPageBehindCart` | Oculta el fondo a teclado y lectores cuando el carrito abre. | O(A) |
| `setCartMessage` | Cambia el mensaje del carrito. | O(1) |
| `showToast` | Muestra un aviso corto abajo. | O(1) |

## Hot paths optimizados

- Busqueda: antes normalizaba texto de cada producto en cada tecla; ahora usa `searchableText` ya preparado. Queda O(N).
- Categoria sin busqueda: ahora usa `catalogByCategoryIndex`, asi no recorre todo el catalogo. Queda casi O(1) para traer la lista.
- Render: usa `DocumentFragment` para agregar muchas tarjetas con menos trabajo del navegador.
- Carrito: usa mapas de id para encontrar variantes rapido.
- Carruseles: usa un solo temporizador global para todas las secciones visibles.
