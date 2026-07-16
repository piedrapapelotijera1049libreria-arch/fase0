# Documentación del código

Esta web es un catálogo estático: muestra productos, abre un detalle con variantes, guarda una lista de consulta y prepara el pedido para WhatsApp desde una página de carrito separada.

Nota simple sobre Big O: O(1) hace una tarea directa, O(N) recorre una lista una vez y O(N²) repite una lista dentro de otra. En las tareas frecuentes se usan mapas y recorridos lineales para evitar trabajo innecesario.

## Archivos principales

- `index.html`: contiene la cabecera, el catálogo, los servicios y el diálogo de producto.
- `carrito.html`: contiene la página independiente donde se revisa la consulta.
- `styles.css`: define el diseño común, responsive, tarjetas, diálogo y carrito.
- `script.js`: controla catálogo, búsqueda, categorías, variantes, detalle y contador del carrito.
- `carrito.js`: controla cantidades, borrado, almacenamiento y envío a WhatsApp.
- `productos.json`: es la fuente editable del catálogo.
- `productos-data.js`: copia compatible para abrir los HTML directamente sin servidor.
- `vendor/`: contiene las librerías locales de animación.

## Funciones de `script.js`

| Función | Explicación simple | Costo |
|---|---|---|
| `init` | Enciende la página, carga los productos y dibuja el catálogo. | O(N + V) |
| `scheduleAnimationEnhancements` | Espera la carga completa para encender animaciones. | O(1) |
| `setFooterYear` | Escribe el año actual en el pie. | O(1) |
| `setupCategoryNavOverflow` | Detecta si la barra de categorías llegó al final. | O(1) por evento |
| `loadProducts` | Lee y valida el catálogo local. | O(N + V) |
| `normalizeProduct` | Convierte un producto en un dato seguro y completo. | O(V) |
| `normalizeVariant` | Limpia una variante, como color o presentación. | O(1) |
| `normalizePrice` | Acepta precio nulo o un número válido. | O(1) |
| `setCatalogLoading` | Muestra que el catálogo está cargando. | O(1) |
| `showCatalogError` | Muestra un aviso si faltan datos del catálogo. | O(1) |
| `bindEvents` | Conecta búsqueda, navegación, diálogo y teclado. | O(B) |
| `handleSearchInput` | Guarda lo buscado y pide un nuevo render. | O(1) |
| `clearSearchState` | Vacía el buscador. | O(1) |
| `scrollToCatalogResults` | Lleva la vista a los resultados. | O(1) |
| `scrollToSection` | Desplaza la página sin esconder el destino bajo el header. | O(1) |
| `scheduleProductRender` | Evita redibujar dos veces dentro del mismo cuadro. | O(1) |
| `setupHeaderBehavior` | Cambia la sombra del header al desplazarse. | O(1) por evento |
| `observeRevealElements` | Observa elementos para mostrarlos cuando aparecen. | O(E) |
| `renderCategoryFilters` | Marca la categoría activa. | O(C) |
| `renderProducts` | Filtra, agrupa y dibuja los productos visibles. | O(N + R) |
| `revealCatalogElements` | Hace visibles los resultados recién dibujados. | O(R) |
| `getResultSummary` | Escribe cuántos modelos y categorías hay. | O(1) |
| `groupProductsByCategory` | Junta productos por categoría. | O(R) |
| `createCategorySection` | Crea un carrusel horizontal de una categoría. | O(P) |
| `createCarouselButton` | Crea una flecha de carrusel. | O(1) |
| `setupCategoryCarousels` | Activa controles solo cuando hay desborde. | O(K) |
| `stopCategoryCarousels` | Detiene temporizadores anteriores. | O(T) |
| `scrollCategoryTrack` | Mueve un carrusel una tarjeta. | O(1) |
| `getCarouselStep` | Calcula el ancho de un paso del carrusel. | O(1) |
| `isTrackScrollable` | Comprueba si el carrusel puede moverse. | O(1) |
| `toDomId` | Convierte texto en un id válido. | O(L) |
| `createProductCard` | Crea una tarjeta compacta con sus acciones. | O(1) |
| `getSelectedVariant` | Busca la variante elegida o usa la primera. | O(V) |
| `getVariantDisplayName` | Une el producto y su variante en un nombre. | O(1) |
| `openProductDialog` | Abre el detalle grande y prepara sus datos. | O(V) |
| `renderProductDialogVariants` | Crea las opciones visibles del detalle. | O(V) |
| `selectProductDialogVariant` | Marca una variante y cambia la imagen. | O(V) |
| `buildProductSearchText` | Prepara una vez el texto usado por búsqueda. | O(V + L) |
| `getFilteredProducts` | Filtra por categoría y texto. | O(1), O(M) u O(N) |
| `setupAnimationLibrary` | Enciende Lenis y GSAP cuando están disponibles. | O(1) |
| `refreshAnimationLibrary` | Actualiza posiciones de ScrollTrigger. | O(1) |
| `setupRevealAnimations` | Elige la animación disponible. | O(E) |
| `setupGsapRevealAnimations` | Configura apariciones con GSAP. | O(E) |
| `animateProductCards` | Anima las tarjetas recién dibujadas. | O(R) |
| `addToCart` | Agrega una variante o aumenta su cantidad. | O(Q) |
| `renderCartBadge` | Actualiza el número del enlace al carrito. | O(Q) |
| `getCartItems` | Convierte ids guardados en productos reales. | O(Q) |
| `getCartTotals` | Suma las cantidades. | O(Q) |
| `loadCart` | Lee y limpia la lista guardada. | O(Q) |
| `saveCart` | Guarda la lista actual. | O(Q) |
| `safeStorageGet` | Lee `localStorage` sin romper la página. | O(1) |
| `safeStorageSet` | Escribe `localStorage` sin romper la página. | O(1) |
| `buildCatalogIndex` | Crea un mapa rápido de variantes por id. | O(V) |
| `buildCategoryIndex` | Crea un mapa rápido de categorías. | O(N) |
| `findProduct` | Encuentra una variante por id. | O(1) |
| `formatPrice` | Devuelve el texto de consulta de precio. | O(1) |
| `normalizeText` | Pasa texto a minúsculas y sin acentos. | O(L) |
| `bumpCartButton` | Anima el contador después de agregar. | O(1) |
| `closeProductDialog` | Cierra el detalle y devuelve el foco. | O(1) |
| `isProductDialogOpen` | Dice si el detalle está abierto. | O(1) |
| `trapProductDialogFocus` | Mantiene el teclado dentro del diálogo. | O(F) |
| `lockPageBehindDialog` | Bloquea el fondo mientras el diálogo está abierto. | O(A) |
| `showToast` | Muestra un aviso corto. | O(1) |

## Funciones de `carrito.js`

| Función | Explicación simple | Costo |
|---|---|---|
| `initCartPage` | Carga catálogo y lista al abrir el carrito. | O(N + V + Q) |
| `bindCartEvents` | Conecta vaciar, WhatsApp y cambios entre pestañas. | O(1) |
| `loadCartProducts` | Lee los productos locales. | O(1) antes de validar |
| `buildCartCatalogIndex` | Crea un mapa de variantes para búsquedas rápidas. | O(N + V) |
| `renderCartPage` | Dibuja filas y resumen. | O(Q) |
| `createCartEmptyState` | Crea el mensaje de lista vacía. | O(1) |
| `createCartPageItem` | Crea una fila con imagen, cantidad y quitar. | O(1) |
| `updateCartQuantity` | Cambia la cantidad de una fila. | O(Q) |
| `removeCartItem` | Quita una variante. | O(Q) |
| `clearCartPage` | Vacía toda la consulta. | O(1) |
| `pruneMissingCartItems` | Descarta ids que ya no existen. | O(Q) |
| `getCartPageItems` | Une lista guardada y catálogo. | O(Q) |
| `sendCartToWhatsApp` | Prepara y abre el mensaje de consulta. | O(Q) |
| `buildCartWhatsAppMessage` | Convierte la lista en texto limpio. | O(Q) |
| `updateCartSendButton` | Controla estado vacío y espera anti-repetición. | O(Q) |
| `getCartRemainingCooldown` | Calcula cuánto falta para otro envío. | O(1) |
| `loadCart` | Lee y valida el carrito guardado. | O(Q) |
| `saveCart` | Guarda el carrito. | O(Q) |
| `safeCartStorageGet` | Lee almacenamiento con manejo de error. | O(1) |
| `safeCartStorageSet` | Guarda datos con manejo de error. | O(1) |
| `cleanCartText` | Quita caracteres raros del mensaje. | O(L) |
| `setCartPageMessage` | Cambia el mensaje de estado. | O(1) |
| `showCartToast` | Muestra un aviso temporal. | O(1) |

## Rutas optimizadas

- La búsqueda usa `searchableText`, preparado una sola vez, y recorre solo los candidatos necesarios.
- Las categorías usan `catalogByCategoryIndex`, un mapa que evita recorrer todo el catálogo cuando no hay búsqueda.
- Las tarjetas y filas se insertan con `DocumentFragment` para reducir repintados.
- El catálogo y el carrito usan mapas por id para encontrar variantes en O(1).
- Las imágenes se cargan de forma diferida y tienen reemplazo local si una falla.
