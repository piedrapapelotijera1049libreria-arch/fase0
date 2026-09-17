# Piedra, Papel o Tijera — rediseño estático

## Entrega

El archivo `piedra-papel-tijera-publicable.zip` contiene únicamente las páginas, estilos, scripts, catálogo, imágenes utilizadas, tipografías y sus licencias. No incluye herramientas, pruebas, capturas, documentación, dependencias de desarrollo ni carpetas de agentes. El ZIP original recibido no se modifica.

Descomprimí el ZIP y subí su contenido a la raíz del alojamiento estático, manteniendo las carpetas. `index.html` debe quedar en esa raíz, no dentro de otra carpeta adicional. No requiere compilación, instalación, backend ni base de datos. Se puede abrir `index.html` directamente para una revisión local; para publicar usá HTTPS.

La web no fue publicada automáticamente. Conserva las URL canónicas del sitio existente en GitHub Pages; si cambiás de dominio, actualizá los enlaces canónicos y las URL sociales de las páginas.

## Qué cambió

- Identidad visual en verde profundo, papel cálido, acentos terracota, tipografías DM Sans y Fraunces alojadas localmente.
- Portada editorial, categorías visuales, selección de productos, lista escolar, servicios, pasos de compra, local y preguntas frecuentes.
- Catálogo en grilla sin carrusel automático. Entrada breve al cambiar de categoría, respetando movimiento reducido. La búsqueda no reinicia animaciones.
- Búsqueda por palabras sin depender de acentos, categorías, orden alfabético, filtro con foto, favoritos y carga progresiva de productos.
- Diálogo de producto con variantes, cantidad y consulta específica. Pedido persistente por navegador y sincronizado entre pestañas.
- Carrito con cantidades, confirmación para vaciar, nombre y notas opcionales, vista previa del mensaje, copia y enlace alternativo a WhatsApp.
- Diseño adaptable a móvil y tablet, foco visible, diálogos nativos, regiones de estado, carga diferida de imágenes y política de seguridad de contenido.

## Datos comerciales

Se conservan los 131 productos originales, sus 227 variantes, las 15 categorías, el número de WhatsApp, dirección, horarios, identidad y condiciones de compra. Los archivos del catálogo permanecen sin modificaciones respecto del ZIP recibido.

Los precios ausentes se muestran como consulta, no como $0 ni descuentos. Las variantes sin fotografía conservan un marcador explícito. No se inventaron existencias, reseñas, ventas, promociones ni plazos de entrega. Las fotografías de catálogo y del local son las originales.

WhatsApp: `5491152627005`, configurable en `js/store-config.js`. El pedido es una consulta: no cobra, no reserva stock ni confirma una compra. El usuario debe enviar el mensaje en WhatsApp. Para pedidos muy extensos se ofrece copiar el mensaje completo.

Favoritos y pedido se almacenan localmente en el navegador. El nombre y las observaciones solo completan el mensaje; no se envían a ningún servidor desde la web. No hay cuentas, analítica ni formularios conectados a terceros.

## Mantenimiento

- Catálogo: `data/productos.json` y `data/productos-data.js` deben conservar el mismo contenido. El segundo permite abrir el HTML sin servidor.
- Fotos: guardar en `img/productos/` y usar rutas relativas. Conservar identificadores de productos/variantes para no invalidar pedidos guardados.
- Contacto: editar `js/store-config.js`. Si cambian dirección u horarios, actualizar también el HTML y los datos estructurados del mismo script.
- No agregar claves privadas o credenciales: todos los archivos de una web estática son públicos.

## Referencias

Se estudiaron patrones de navegación por categorías y exposición de catálogo de [Woopy](https://www.woopylibreria.com.ar/) y [Librerías Levalle](https://libreriaslevalle.com/index.php), junto con presentación editorial e inspiración de papelería de [Papier](https://www.papier.com/) y [Notebook Therapy](https://notebooktherapy.com/). El resultado es una composición propia adaptada a ventas por WhatsApp: no reproduce marcas, cuentas ni procesos de pago de esas tiendas.

## Imagen editorial generada

Se utilizó la skill `imagegen` para una imagen de ambiente original. No representa un producto específico disponible ni reemplaza fotografías de productos. El texto alternativo la identifica como composición ilustrativa.

- Modo: generación nueva, sin imágenes de referencia.
- Archivo de publicación: `img/editorial-papeleria.webp`, 1320 × 880, aproximadamente 89 KiB.
- Prompt final:

> Use case: photorealistic-natural. Asset type: editorial hero photograph for an Argentine stationery shop website named Piedra, Papel o Tijera. Create a photorealistic premium stationery still life, horizontal 3:2 landscape photograph. Beautiful deep pine-green and warm ivory stationery flat lay on a warm pale sage desk, an open unbranded ivory sketchbook at a slight angle, matte forest green notebook partially beneath it, a fan of richly colored wooden pencils in terracotta, yellow, sage and blue, one pair of simple steel scissors, subtle lilac pastel highlighter and binder clips. Objects composed naturally yet art-directed, large close-up stationery occupying frame with some quiet space between objects; soft directional morning sun and authentic tactile paper grain, warm shadows, crisp realistic physical materials. Calm independent stationery boutique, editorial magazine quality, refined playful everyday creativity, accessible not luxury gold. The website copy is outside this image, so NO words, no readable text, no logos, no watermarks, no border, no mock UI. Not a product listing photograph: an atmospheric editorial illustration. No people, no electronics, no coffee, no plants. Output one wide photographic image.

## Verificación

Pruebas automatizadas con Playwright en Edge: 46 comprobaciones aprobadas (31 de flujo funcional y 15 de teclado, cantidades, cálculos y manejo de entradas). Los cálculos con precios se comprobaron con datos de prueba en memoria, sin modificar el catálogo original. Revisiones a 1440 × 900, 768 × 1024, 390 × 844 y 360 × 800 sin desbordes horizontales en inicio, carrito y condiciones. Sin errores JavaScript ni imágenes rotas en el recorrido visual. Se inspeccionaron capturas de escritorio, móvil, detalle de producto y carrito lleno.

Se comprobó el armado del enlace y mensaje de WhatsApp sin enviar mensajes reales. No se probó una transacción, un cobro ni la recepción real del mensaje, porque la web no los realiza. Tampoco se verificaron físicamente stock, precios o vigencia de los horarios.

Las herramientas y resultados de pruebas están en `tools/`; no se incluyen en el ZIP publicable. No se promete una puntuación Lighthouse ni certificación de accesibilidad: no se ejecutó esa auditoría.

El ZIP contiene 124 archivos y pesa 3.057.537 bytes (2,92 MiB). Se verificó cada archivo del ZIP contra su fuente con SHA-256. Ambos archivos de catálogo coinciden exactamente con los originales del ZIP recibido. El catálogo tiene 114 variantes sin fotografía propia; permanecen con su marcador original.

Las skills `frontend-app-builder`, `frontend-testing-debugging`, `playwright-interactive` y `security-best-practices` no están disponibles en el proyecto recibido. Se utilizó el navegador automatizado disponible para pruebas y una revisión directa del código, sin afirmar que se ejecutaron esas skills.

## Archivos modificados o agregados

Modificados: `index.html`, `carrito.html`, `condiciones-compra.html`, `css/styles.css`, `js/script.js`, `js/carrito.js`, `js/store-config.js`, `manifest.json`.

Agregados a publicación: `img/editorial-papeleria.webp`, `fonts/dm-sans-latin.woff2`, `fonts/fraunces-latin.woff2`, `fonts/OFL-dmsans.txt`, `fonts/OFL-fraunces.txt`.

Fuera del ZIP: este documento, `tools/preview.cjs`, `tools/visual-qa.cjs`, `tools/functional-qa.cjs`, `tools/edge-cases-qa.cjs`, `tools/verify-release.cjs`, resultados y capturas de prueba. Los archivos originales no utilizados no se borraron del proyecto: simplemente se excluyeron del ZIP.
