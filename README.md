# Piedra, Papel o Tijera Librería

Proyecto web estático para catálogo con lista de consulta por WhatsApp.

## Cómo abrirlo

Abrí `index.html` directamente con Chrome, Edge o Firefox. No necesita servidor local, archivo `.bat`, backend, base de datos, login ni instalación.

## Editar productos

La única fuente editable de los productos es `productos.json`. Cada objeto de la lista representa un modelo:

```json
{
  "id": "1",
  "nombre": "Cuaderno tapa dura",
  "descripcion": "Cuaderno escolar práctico.",
  "precio": null,
  "categoria": "Librería",
  "imagen": "img/cuaderno.svg"
}
```

El `id` debe ser único y no debe cambiar una vez publicado. El catálogo actual trabaja únicamente con consulta de precios, por lo que todos los productos y variantes usan `"precio": null`. Si no se indica una imagen, la web usa automáticamente `img/producto-sin-imagen.svg`.

Cuando un mismo modelo existe en varios colores o presentaciones, usá `variantes` para mostrar una sola tarjeta:

```json
{
  "id": "lapicera-modelo",
  "nombre": "Lapicera Modelo",
  "descripcion": "Punta media de 1,0 mm.",
  "categoria": "Escritura",
  "opcion": "Color",
  "variantes": [
    {
      "id": "lapicera-modelo-azul",
      "nombre": "Azul",
      "color": "#2463b5",
      "precio": null,
      "imagen": "img/productos/lapicera-modelo-azul.jpg"
    }
  ]
}
```

Cada variante necesita un `id` único. Puede tener su propia imagen; el precio se deja en `null` porque la web confirma importes por WhatsApp. El campo `color` controla el tono de la muestra circular y `opcion` puede cambiarse por “Tamaño”, “Presentación” u otra variable.

Los campos recomendados para el Excel son: `id`, `nombre`, `descripcion`, `precio`, `categoria` e `imagen`. Aunque el Excel tenga precio interno, en la web pública se mantiene como consulta.

`productos-data.js` es una copia generada para permitir la apertura directa del HTML; no se edita manualmente. Cada vez que actualicemos `productos.json`, el archivo `generar-productos-compatibles.ps1` vuelve a crear esa copia antes de entregar el catálogo.

## Completar el catálogo real

Abrí `cuestionario-productos.csv` con Excel. Marcá `SI` en los productos que vendés, agregá variantes o productos que no estén en la lista y, si usás precios internos, después se transforman a `null` para que la web siga funcionando como consulta.

## Cambiar WhatsApp

En `carrito.js`, editá:

```js
const CART_CONFIG = {
  whatsappNumber: "5491152627005"
};
```

Después reemplazá el número visible y los enlaces `wa.me` de `index.html` y `condiciones-compra.html`. El número para `wa.me` debe ir con país y prefijo móvil. Para Argentina se usa `549` + característica + número.

## Cambiar colores

Los colores principales están al inicio de `styles.css`, en `:root`.

## Diseño actual

La versión actual evita el estilo de landing genérica: el catálogo aparece en el primer recorrido, los filtros quedan visibles y los productos se agrupan por categoría en carruseles horizontales con avance automático.

Cada tarjeta abre un detalle grande con imagen, descripción y variantes nombradas. La lista de consulta se administra en `carrito.html`, una página separada que comparte el estado guardado con `index.html` y funciona también al abrir los archivos directamente.

El hero principal usa una foto real del frente del local:

- `img/local-exterior.jpg`: fachada optimizada para web, usada en el bloque inicial de la página.
- GSAP `3.15`: animaciones principales y secuencias.
- GSAP ScrollTrigger: entradas conectadas al scroll.
- Lenis `1.3.15`: scroll suave.
- `[data-reveal]`: aparición suave al hacer scroll.
- `.cart-button.is-bumped`: reacción de la lista de consulta al agregar productos.

Las librerías de animación están guardadas en `vendor/` para evitar depender de CDNs al abrir `index.html` o al publicar.

## Cambiar imágenes

Guardá las imágenes nuevas dentro de `img/productos` y actualizá la propiedad `imagen` del producto o de su variante en `productos.json`.

Para cambiar la foto del hero, reemplazá `img/local-exterior.jpg` por otra foto horizontal optimizada.

Las páginas oficiales usadas para las imágenes actuales están documentadas en `FUENTES-IMAGENES.md`.

## Publicar en Netlify

1. Entrá a Netlify.
2. Elegí “Add new site” y luego “Deploy manually”.
3. Arrastrá la carpeta completa `piedra-papel-tijera-web`.
4. Netlify publicará el sitio con `index.html` como página principal.

## Publicar en GitHub Pages

1. Subí estos archivos a un repositorio de GitHub.
2. Entrá a Settings > Pages.
3. En “Build and deployment”, elegí “Deploy from a branch”.
4. Seleccioná la rama principal y la carpeta raíz.
5. Guardá los cambios y esperá a que GitHub publique la URL.

## Seguridad en producción

El HTML incluye una política CSP básica compatible con apertura directa. Si lo publicás con un hosting que permita headers, conviene agregar también `frame-ancestors 'none'`, HTTPS forzado y HSTS desde la configuración del servidor.

## Limitación importante

Como es un sitio 100% frontend, las medidas anti-spam solo funcionan en el navegador del visitante. Para bloqueo real de abuso, validaciones fuertes o registro de consultas haría falta un backend.
