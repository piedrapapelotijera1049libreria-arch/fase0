$ErrorActionPreference = "Stop"

function Get-ChromePath {
  $paths = @(
    "$env:ProgramFiles\Google\Chrome\Application\chrome.exe",
    "${env:ProgramFiles(x86)}\Google\Chrome\Application\chrome.exe",
    "$env:LocalAppData\Google\Chrome\Application\chrome.exe",
    "$env:ProgramFiles\Microsoft\Edge\Application\msedge.exe",
    "${env:ProgramFiles(x86)}\Microsoft\Edge\Application\msedge.exe"
  )

  foreach ($path in $paths) {
    if (Test-Path $path) {
      return $path
    }
  }

  throw "No se encontro Chrome ni Edge para ejecutar QA local."
}

function Receive-CdpMessage($ws) {
  $buffer = New-Object byte[] 131072
  $stream = [System.IO.MemoryStream]::new()

  do {
    $segment = [ArraySegment[byte]]::new($buffer)
    $result = $ws.ReceiveAsync($segment, [Threading.CancellationToken]::None).Result
    if ($result.Count -gt 0) {
      $stream.Write($buffer, 0, $result.Count)
    }
  } until ($result.EndOfMessage)

  $text = [Text.Encoding]::UTF8.GetString($stream.ToArray())
  $stream.Dispose()
  return $text | ConvertFrom-Json
}

function Invoke-Cdp([string]$method, [hashtable]$params = @{}) {
  $script:cdpId += 1
  $payload = @{
    id = $script:cdpId
    method = $method
    params = $params
  } | ConvertTo-Json -Depth 50 -Compress

  $bytes = [Text.Encoding]::UTF8.GetBytes($payload)
  $script:ws.SendAsync(
    [ArraySegment[byte]]::new($bytes),
    [System.Net.WebSockets.WebSocketMessageType]::Text,
    $true,
    [Threading.CancellationToken]::None
  ).Wait()

  while ($true) {
    $message = Receive-CdpMessage $script:ws
    if ($message.id -eq $script:cdpId) {
      if ($message.error) {
        throw ($message.error | ConvertTo-Json -Depth 10)
      }
      return $message
    }
  }
}

function Eval-Js([string]$expression) {
  $response = Invoke-Cdp "Runtime.evaluate" @{
    expression = $expression
    awaitPromise = $true
    returnByValue = $true
  }

  if ($response.result.exceptionDetails) {
    throw ($response.result.exceptionDetails | ConvertTo-Json -Depth 10)
  }

  return $response.result.result.value
}

function Wait-ForPageReady {
  for ($i = 0; $i -lt 40; $i++) {
    $ready = Eval-Js "document.readyState"
    $cards = [int](Eval-Js "document.querySelectorAll('.product-card').length")
    if ($ready -eq "complete" -and $cards -gt 0) {
      return
    }
    Start-Sleep -Milliseconds 250
  }

  throw "La pagina no termino de renderizar productos a tiempo."
}

function Add-Check([string]$name, [bool]$ok, [string]$details = "") {
  $script:results.Add([pscustomobject]@{
    Check = $name
    OK = $ok
    Details = $details
  }) | Out-Null

  if (-not $ok) {
    $script:failed += 1
  }
}

$root = (Resolve-Path $PSScriptRoot).Path
$profile = Join-Path $root ".qa-chrome-profile"

if (Test-Path $profile) {
  $resolvedProfile = (Resolve-Path $profile).Path
  if (-not $resolvedProfile.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
    throw "Ruta de perfil QA fuera del proyecto."
  }
  Remove-Item -LiteralPath $resolvedProfile -Recurse -Force
}

New-Item -ItemType Directory -Path $profile | Out-Null

$chrome = Get-ChromePath
$port = Get-Random -Minimum 9300 -Maximum 9800
$indexUrl = ([Uri](Resolve-Path "index.html").Path).AbsoluteUri
$cartUrl = ([Uri](Resolve-Path "carrito.html").Path).AbsoluteUri
$conditionsUrl = ([Uri](Resolve-Path "condiciones-compra.html").Path).AbsoluteUri

$chromeProcess = Start-Process -FilePath $chrome -WindowStyle Hidden -PassThru -ArgumentList @(
  "--headless=new",
  "--disable-gpu",
  "--no-first-run",
  "--no-default-browser-check",
  "--remote-debugging-port=$port",
  "--user-data-dir=$profile",
  "about:blank"
)

$script:ws = $null
$script:cdpId = 0
$script:results = [System.Collections.Generic.List[object]]::new()
$script:failed = 0

try {
  $targets = $null
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $targets = Invoke-RestMethod "http://127.0.0.1:$port/json/list"
      if ($targets.Count -gt 0) { break }
    } catch {
      Start-Sleep -Milliseconds 250
    }
  }

  if (-not $targets) {
    throw "Chrome no abrio el puerto de depuracion."
  }

  $page = @($targets | Where-Object { $_.type -eq "page" })[0]
  $script:ws = [System.Net.WebSockets.ClientWebSocket]::new()
  $script:ws.ConnectAsync([Uri]$page.webSocketDebuggerUrl, [Threading.CancellationToken]::None).Wait()

  Invoke-Cdp "Runtime.enable" | Out-Null
  Invoke-Cdp "Page.enable" | Out-Null
  Invoke-Cdp "Page.addScriptToEvaluateOnNewDocument" @{
    source = "window.__qaErrors=[];window.addEventListener('error',e=>window.__qaErrors.push(e.message));window.addEventListener('unhandledrejection',e=>window.__qaErrors.push(String(e.reason)));"
  } | Out-Null

  Invoke-Cdp "Page.navigate" @{ url = $indexUrl } | Out-Null
  Wait-ForPageReady

  $initial = Eval-Js @"
(() => ({
  title: document.title,
  cards: document.querySelectorAll('.product-card').length,
  sections: document.querySelectorAll('.product-category').length,
  sectionNames: [...document.querySelectorAll('.product-category__title h4')].map(node => node.textContent.trim()),
  footerYear: document.querySelector('#footerYear')?.textContent || '',
  hasFooter: !!document.querySelector('.site-footer'),
  productH3: document.querySelectorAll('.product-card h3').length,
  productH4: document.querySelectorAll('.product-card h4').length,
  brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).length,
  hasJsonLd: !!document.querySelector('script[type="application/ld+json"]'),
  hasManifest: !!document.querySelector('link[rel="manifest"]'),
  hasOgImage: !!document.querySelector('meta[property="og:image"]'),
  hasCanonical: !!document.querySelector('link[rel="canonical"]'),
  addressIsMap: document.querySelector('.contact-grid a[href*="maps.google.com"]') !== null,
  categoryArrowVisible: getComputedStyle(document.querySelector('.category-nav'), '::after').opacity
}))()
"@

  Add-Check "Carga inicial con productos" ($initial.cards -gt 0 -and $initial.sections -gt 0) "cards=$($initial.cards), sections=$($initial.sections)"
  $newSectionsOk = @("Juegos", "Pizarras", "Calculadoras") |
    ForEach-Object { $initial.sectionNames -contains $_ } |
    Where-Object { -not $_ } |
    Measure-Object |
    Select-Object -ExpandProperty Count
  Add-Check "Secciones nuevas renderizadas" ($newSectionsOk -eq 0) ($initial.sectionNames -join ", ")
  Add-Check "Footer y anio dinamico" ($initial.hasFooter -and $initial.footerYear -eq (Get-Date).Year.ToString()) "footerYear=$($initial.footerYear)"
  Add-Check "Titulos de producto h4" ($initial.productH3 -eq 0 -and $initial.productH4 -gt 0) "h3=$($initial.productH3), h4=$($initial.productH4)"
  $seoOk = $initial.hasJsonLd -and
    $initial.hasManifest -and
    $initial.hasOgImage -and
    $initial.hasCanonical -and
    ($initial.title -match "Jos.+Paz")
  Add-Check "SEO local basico" $seoOk $initial.title
  Add-Check "Direccion abre Maps" $initial.addressIsMap ""
  Add-Check "Imagenes visibles sin roturas" ($initial.brokenImages -eq 0) "broken=$($initial.brokenImages)"

  $search = Eval-Js @"
(async () => {
  const input = document.querySelector('#searchInput');
  input.value = 'olami';
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'olami', inputType: 'insertText' }));
  await new Promise(resolve => setTimeout(resolve, 550));
  return {
    value: input.value,
    cards: document.querySelectorAll('.product-card').length,
    names: [...document.querySelectorAll('.product-card h4')].slice(0, 5).map(node => node.textContent.trim())
  };
})()
"@
  Add-Check "Buscador filtra por texto sin tilde" ($search.value -eq "olami" -and $search.cards -gt 0 -and (($search.names -join " ") -match "Olam")) "cards=$($search.cards), names=$($search.names -join ', ')"

  $newProductSearch = Eval-Js @"
(async () => {
  const input = document.querySelector('#searchInput');
  input.value = 'silicona liquida';
  input.dispatchEvent(new InputEvent('input', { bubbles: true, data: 'silicona liquida', inputType: 'insertText' }));
  await new Promise(resolve => setTimeout(resolve, 550));
  return {
    cards: document.querySelectorAll('.product-card').length,
    names: [...document.querySelectorAll('.product-card h4')].map(node => node.textContent.trim()),
    brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).length
  };
})()
"@
  $newProductOk = $newProductSearch.cards -gt 0 -and
    (($newProductSearch.names -join " ") -match "Silicona") -and
    $newProductSearch.brokenImages -eq 0
  Add-Check "Buscador encuentra tanda nueva" $newProductOk "cards=$($newProductSearch.cards), names=$($newProductSearch.names -join ', ')"

  $clearSearch = Eval-Js @"
(async () => {
  document.querySelector('#clearSearchButton').click();
  await new Promise(resolve => setTimeout(resolve, 300));
  return {
    value: document.querySelector('#searchInput').value,
    cards: document.querySelectorAll('.product-card').length
  };
})()
"@
  Add-Check "Boton limpiar busqueda restaura catalogo" ($clearSearch.value -eq "" -and $clearSearch.cards -ge $initial.cards) "cards=$($clearSearch.cards)"

  $lapiceras = Eval-Js @"
(async () => {
  const link = [...document.querySelectorAll('[data-category-filter]')].find(a => a.dataset.categoryFilter === 'Lapiceras');
  link.click();
  await new Promise(resolve => setTimeout(resolve, 450));
  return {
    active: document.querySelector('[data-category-filter].is-active')?.dataset.categoryFilter || '',
    cards: document.querySelectorAll('.product-card').length,
    categories: [...new Set([...document.querySelectorAll('.product-card__category')].map(node => node.textContent.trim()))]
  };
})()
"@
  Add-Check "Filtro categoria Lapiceras" ($lapiceras.active -eq "Lapiceras" -and $lapiceras.cards -gt 0 -and $lapiceras.categories.Count -eq 1 -and $lapiceras.categories[0] -eq "Lapiceras") "cards=$($lapiceras.cards), categories=$($lapiceras.categories -join ', ')"

  $papeles = Eval-Js @"
(async () => {
  const link = [...document.querySelectorAll('[data-category-filter]')].find(a => a.dataset.categoryFilter === 'Papeles');
  link.click();
  await new Promise(resolve => setTimeout(resolve, 450));
  return {
    active: document.querySelector('[data-category-filter].is-active')?.dataset.categoryFilter || '',
    cards: document.querySelectorAll('.product-card').length,
    categories: [...new Set([...document.querySelectorAll('.product-card__category')].map(node => node.textContent.trim()))]
  };
})()
"@
  Add-Check "Filtro categoria Papeles" ($papeles.active -eq "Papeles" -and $papeles.cards -gt 0 -and $papeles.categories.Count -eq 1 -and $papeles.categories[0] -eq "Papeles") "cards=$($papeles.cards), categories=$($papeles.categories -join ', ')"

  $productDetail = Eval-Js @"
(async () => {
  const variantCard = [...document.querySelectorAll('.product-card')]
    .find(card => card.querySelector('.product-card__detail')?.textContent.includes('opciones'));
  if (!variantCard) return { error: 'No se encontro una tarjeta con variantes' };
  const cardImageWidth = variantCard.querySelector('img').getBoundingClientRect().width;
  variantCard.querySelector('.product-card__detail').click();
  await new Promise(resolve => setTimeout(resolve, 250));
  const dialog = document.querySelector('#productDialog');
  const variantButtons = [...document.querySelectorAll('.product-variant-option')];
  if (variantButtons[1]) variantButtons[1].click();
  await new Promise(resolve => setTimeout(resolve, 120));
  const activeVariants = document.querySelectorAll('.product-variant-option.is-active').length;
  document.querySelector('#productDialogAdd').click();
  await new Promise(resolve => setTimeout(resolve, 180));
  return {
    open: dialog.classList.contains('is-open') && dialog.getAttribute('aria-hidden') === 'false',
    title: document.querySelector('#productDialogTitle')?.textContent.trim() || '',
    variantButtons: variantButtons.length,
    activeVariants,
    imageWidth: document.querySelector('#productDialogImage').getBoundingClientRect().width,
    cardImageWidth,
    cartCount: document.querySelector('#cartCount')?.textContent || '',
    cartHref: document.querySelector('#cartButton')?.getAttribute('href') || '',
    hasOldCartPanel: !!document.querySelector('#cartPanel')
  };
})()
"@
  $detailOk = $productDetail.open -and
    $productDetail.title.Length -gt 0 -and
    $productDetail.variantButtons -gt 1 -and
    $productDetail.activeVariants -eq 1 -and
    $productDetail.imageWidth -gt $productDetail.cardImageWidth -and
    $productDetail.cartCount -eq "1" -and
    $productDetail.cartHref -eq "carrito.html" -and
    -not $productDetail.hasOldCartPanel
  Add-Check "Detalle ampliado, variantes y agregado" $detailOk ($productDetail | ConvertTo-Json -Compress)

  $dialogKeyboard = Eval-Js @"
(() => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  return {
    closed: !document.querySelector('#productDialog').classList.contains('is-open'),
    hidden: document.querySelector('#productDialog').getAttribute('aria-hidden'),
    bodyUnlocked: !document.body.classList.contains('dialog-open')
  };
})()
"@
  Add-Check "Detalle cierra con Escape" ($dialogKeyboard.closed -and $dialogKeyboard.hidden -eq "true" -and $dialogKeyboard.bodyUnlocked) ($dialogKeyboard | ConvertTo-Json -Compress)

  $allProductDetails = Eval-Js @"
(async () => {
  const allLink = [...document.querySelectorAll('[data-category-filter]')]
    .find(link => link.dataset.categoryFilter === 'Todos');
  allLink.click();
  await new Promise(resolve => setTimeout(resolve, 350));
  const rawProducts = new Map(window.PRODUCTOS_CATALOGO.map(product => [String(product.id), product]));
  const cards = [...document.querySelectorAll('.product-card')];
  const failures = [];
  let variantClicks = 0;

  for (const card of cards) {
    const product = rawProducts.get(card.dataset.productId);
    const expectedTitle = card.querySelector('h4')?.textContent.trim() || '';
    card.querySelector('.product-card__detail').click();
    const dialog = document.querySelector('#productDialog');
    const title = document.querySelector('#productDialogTitle')?.textContent.trim() || '';
    const image = document.querySelector('#productDialogImage');
    const buttons = [...document.querySelectorAll('.product-variant-option')];
    const expectedVariants = Array.isArray(product?.variantes) && product.variantes.length > 1
      ? product.variantes.length
      : 0;

    if (!dialog.classList.contains('is-open') || title !== expectedTitle || !image.getAttribute('src') || !image.alt) {
      failures.push(card.dataset.productId + ': detalle incompleto');
    }
    if (buttons.length !== expectedVariants) {
      failures.push(card.dataset.productId + ': variantes ' + buttons.length + '/' + expectedVariants);
    }

    for (const button of buttons) {
      button.click();
      variantClicks += 1;
      const active = document.querySelectorAll('.product-variant-option.is-active').length;
      if (active !== 1 || button.getAttribute('aria-pressed') !== 'true') {
        failures.push(card.dataset.productId + ': seleccion de variante');
        break;
      }
    }
    document.querySelector('#closeProductDialog').click();
  }

  return {
    cardsChecked: cards.length,
    variantClicks,
    failures: failures.slice(0, 10),
    dialogClosed: !document.querySelector('#productDialog').classList.contains('is-open')
  };
})()
"@
  $allDetailsOk = $allProductDetails.cardsChecked -eq $initial.cards -and
    $allProductDetails.variantClicks -gt 0 -and
    $allProductDetails.failures.Count -eq 0 -and
    $allProductDetails.dialogClosed
  Add-Check "Todas las tarjetas y variantes abren correctamente" $allDetailsOk ($allProductDetails | ConvertTo-Json -Compress)

  $cardBodyDialog = Eval-Js @"
(() => {
  const card = document.querySelector('.product-card');
  const expectedFocus = card.querySelector('.product-card__detail');
  card.querySelector('.product-card__image-wrap').click();
  const opened = document.querySelector('#productDialog').classList.contains('is-open');
  document.querySelector('[data-close-product]').click();
  return {
    opened,
    closed: !document.querySelector('#productDialog').classList.contains('is-open'),
    focusReturned: document.activeElement === expectedFocus
  };
})()
"@
  Add-Check "Click completo y retorno de foco" ($cardBodyDialog.opened -and $cardBodyDialog.closed -and $cardBodyDialog.focusReturned) ($cardBodyDialog | ConvertTo-Json -Compress)

  Invoke-Cdp "Page.navigate" @{ url = $cartUrl } | Out-Null
  Start-Sleep -Milliseconds 700
  $cartInitial = Eval-Js @"
(() => ({
  title: document.querySelector('h1')?.textContent.trim() || '',
  items: document.querySelectorAll('.cart-page-item').length,
  quantity: document.querySelector('.quantity-control span')?.textContent || '',
  total: document.querySelector('#cartTotalItems')?.textContent || '',
  sendDisabled: document.querySelector('#sendWhatsAppButton')?.disabled ?? true,
  hasBack: document.querySelector('a[href="index.html#catalogo"]') !== null,
  brokenImages: [...document.images].filter(img => img.complete && img.naturalWidth === 0).length,
  errors: window.__qaErrors || []
}))()
"@
  $cartInitialOk = $cartInitial.items -eq 1 -and
    $cartInitial.quantity -eq "1" -and
    $cartInitial.total -eq "1" -and
    -not $cartInitial.sendDisabled -and
    $cartInitial.hasBack -and
    $cartInitial.brokenImages -eq 0 -and
    $cartInitial.errors.Count -eq 0
  Add-Check "Carrito separado conserva la consulta" $cartInitialOk ($cartInitial | ConvertTo-Json -Compress)

  $cartControls = Eval-Js @"
(async () => {
  const controls = document.querySelector('.quantity-control');
  controls.querySelector('button:last-child').click();
  await new Promise(resolve => setTimeout(resolve, 100));
  const afterIncrease = document.querySelector('.quantity-control span').textContent;
  document.querySelector('.quantity-control button:first-child').click();
  await new Promise(resolve => setTimeout(resolve, 100));
  const afterDecrease = document.querySelector('.quantity-control span').textContent;
  document.querySelector('.remove-button').click();
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    afterIncrease,
    afterDecrease,
    empty: document.querySelectorAll('.cart-page-item').length === 0 && !!document.querySelector('.cart-page-empty'),
    total: document.querySelector('#cartTotalItems').textContent,
    sendDisabled: document.querySelector('#sendWhatsAppButton').disabled
  };
})()
"@
  $cartControlsOk = $cartControls.afterIncrease -eq "2" -and
    $cartControls.afterDecrease -eq "1" -and
    $cartControls.empty -and
    $cartControls.total -eq "0" -and
    $cartControls.sendDisabled
  Add-Check "Cantidades, quitar y estado vacio" $cartControlsOk ($cartControls | ConvertTo-Json -Compress)

  Eval-Js @"
(() => {
  const ids = window.PRODUCTOS_CATALOGO
    .flatMap(product => Array.isArray(product.variantes) && product.variantes.length > 0 ? product.variantes : [product])
    .map(item => String(item.id || '').trim())
    .filter(Boolean)
    .slice(0, 2);
  localStorage.setItem('pptLibreriaCart', JSON.stringify(ids.map(id => ({ id, cantidad: 1 }))));
  return ids.length;
})()
"@ | Out-Null
  Invoke-Cdp "Page.reload" | Out-Null
  Start-Sleep -Milliseconds 700
  $clearCart = Eval-Js @"
(async () => {
  const before = document.querySelectorAll('.cart-page-item').length;
  document.querySelector('#clearCartButton').click();
  await new Promise(resolve => setTimeout(resolve, 100));
  return {
    before,
    after: document.querySelectorAll('.cart-page-item').length,
    empty: !!document.querySelector('.cart-page-empty'),
    stored: localStorage.getItem('pptLibreriaCart'),
    disabled: document.querySelector('#clearCartButton').disabled
  };
})()
"@
  $clearCartOk = $clearCart.before -eq 2 -and
    $clearCart.after -eq 0 -and
    $clearCart.empty -and
    $clearCart.stored -eq "[]" -and
    $clearCart.disabled
  Add-Check "Vaciar carrito elimina y persiste el estado" $clearCartOk ($clearCart | ConvertTo-Json -Compress)

  Invoke-Cdp "Emulation.setDeviceMetricsOverride" @{
    width = 390
    height = 844
    deviceScaleFactor = 3
    mobile = $true
  } | Out-Null
  Invoke-Cdp "Emulation.setTouchEmulationEnabled" @{ enabled = $true } | Out-Null
  Invoke-Cdp "Page.navigate" @{ url = $indexUrl } | Out-Null
  Wait-ForPageReady

  $mobile = Eval-Js @"
(async () => {
  const nav = document.querySelector('.category-nav');
  const scroller = document.querySelector('.category-nav__inner');
  const startOpacity = getComputedStyle(nav, '::after').opacity;
  scroller.scrollLeft = scroller.scrollWidth;
  scroller.dispatchEvent(new Event('scroll'));
  await new Promise(resolve => setTimeout(resolve, 250));
  const endOpacity = getComputedStyle(nav, '::after').opacity;
  return {
    width: window.innerWidth,
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    pointerFine: matchMedia('(pointer: fine)').matches,
    arrowAtStart: startOpacity,
    arrowAtEnd: endOpacity,
    navHasEndClass: nav.classList.contains('is-scroll-end'),
    contactColumns: getComputedStyle(document.querySelector('.contact-grid')).gridTemplateColumns.split(' ').length,
    cards: document.querySelectorAll('.product-card').length
  };
})()
"@
  Add-Check "Responsive mobile sin overflow horizontal" (-not $mobile.overflowX -and $mobile.width -eq 390 -and $mobile.cards -gt 0) ($mobile | ConvertTo-Json -Compress)
  Add-Check "Flecha mobile se oculta al final" ($mobile.navHasEndClass -and [double]$mobile.arrowAtEnd -lt [double]$mobile.arrowAtStart) "start=$($mobile.arrowAtStart), end=$($mobile.arrowAtEnd)"

  $mobileDialog = Eval-Js @"
(async () => {
  document.querySelector('.product-card__detail').click();
  await new Promise(resolve => setTimeout(resolve, 220));
  const dialog = document.querySelector('#productDialog');
  const panel = document.querySelector('#productDialogPanel').getBoundingClientRect();
  const media = document.querySelector('.product-dialog__media').getBoundingClientRect();
  const result = {
    open: dialog.classList.contains('is-open'),
    panelWidth: Math.round(panel.width),
    panelHeight: Math.round(panel.height),
    mediaWidth: Math.round(media.width),
    overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
    closeVisible: document.querySelector('#closeProductDialog').getBoundingClientRect().width > 0
  };
  document.querySelector('#closeProductDialog').click();
  return result;
})()
"@
  $mobileDialogOk = $mobileDialog.open -and
    $mobileDialog.panelWidth -eq 390 -and
    $mobileDialog.panelHeight -eq 844 -and
    $mobileDialog.mediaWidth -le 390 -and
    -not $mobileDialog.overflowX -and
    $mobileDialog.closeVisible
  Add-Check "Detalle de producto adaptable en mobile" $mobileDialogOk ($mobileDialog | ConvertTo-Json -Compress)

  Eval-Js @"
(() => {
  const product = window.PRODUCTOS_CATALOGO.find(item => Array.isArray(item.variantes) && item.variantes.length > 0);
  localStorage.setItem('pptLibreriaCart', JSON.stringify([{ id: product.variantes[0].id, cantidad: 1 }]));
  localStorage.removeItem('pptLibreriaLastOrderAt');
  return true;
})()
"@ | Out-Null
  Invoke-Cdp "Page.navigate" @{ url = $cartUrl } | Out-Null
  Start-Sleep -Milliseconds 700
  $mobileCart = Eval-Js @"
(() => ({
  width: window.innerWidth,
  items: document.querySelectorAll('.cart-page-item').length,
  overflowX: document.documentElement.scrollWidth > window.innerWidth + 2,
  layoutColumns: getComputedStyle(document.querySelector('.cart-page-layout')).gridTemplateColumns.split(' ').length,
  itemWidth: Math.round(document.querySelector('.cart-page-item').getBoundingClientRect().width),
  summaryWidth: Math.round(document.querySelector('.cart-page-summary').getBoundingClientRect().width),
  errors: window.__qaErrors || []
}))()
"@
  $mobileCartOk = $mobileCart.width -eq 390 -and
    $mobileCart.items -eq 1 -and
    -not $mobileCart.overflowX -and
    $mobileCart.layoutColumns -eq 1 -and
    $mobileCart.itemWidth -le 366 -and
    $mobileCart.summaryWidth -le 366 -and
    $mobileCart.errors.Count -eq 0
  Add-Check "Carrito separado adaptable en mobile" $mobileCartOk ($mobileCart | ConvertTo-Json -Compress)

  Invoke-Cdp "Page.navigate" @{ url = $conditionsUrl } | Out-Null
  Start-Sleep -Milliseconds 600
  $conditions = Eval-Js @"
(() => {
  const step = document.querySelector('.purchase-step');
  const stepStyle = getComputedStyle(step);
  return {
    title: document.querySelector('h1')?.textContent.trim() || '',
    steps: document.querySelectorAll('.purchase-step').length,
    notices: document.querySelectorAll('.purchase-notice').length,
    hasBack: [...document.querySelectorAll('a')].some(a => a.getAttribute('href') === 'index.html'),
    hasOgImage: !!document.querySelector('meta[property="og:image"]'),
    background: stepStyle.backgroundColor,
    color: stepStyle.color,
    text: document.body.textContent
  };
})()
"@
  $badWords = @(
    "\bLibreria\b",
    "pagina principal",
    "preparacion",
    "confirmacion",
    "\bimpresion\b",
    "tamano",
    "\bJose\b",
    "\bComo\b",
    "\bAsi\b",
    "queres",
    "segun",
    "atencion",
    "esta preparado"
  )
  $hasBadWords = $false
  foreach ($word in $badWords) {
    if ($conditions.text -match $word) { $hasBadWords = $true }
  }
  Add-Check "Condiciones conserva tema oscuro" ($conditions.steps -ge 6 -and $conditions.notices -ge 2 -and $conditions.hasBack -and $conditions.hasOgImage -and -not ($conditions.background -match "218|236|249|255, 255, 255")) "bg=$($conditions.background)"
  Add-Check "Condiciones con tildes principales" (-not $hasBadWords -and ($conditions.title -match "compra")) $conditions.title
} finally {
  if ($script:ws) {
    try {
      $script:ws.CloseAsync(
        [System.Net.WebSockets.WebSocketCloseStatus]::NormalClosure,
        "done",
        [Threading.CancellationToken]::None
      ).Wait(1000) | Out-Null
    } catch {}
    $script:ws.Dispose()
  }

  if ($chromeProcess -and -not $chromeProcess.HasExited) {
    $chromeProcess.Kill()
    $chromeProcess.WaitForExit()
  }

  if (Test-Path $profile) {
    $resolvedProfile = (Resolve-Path $profile).Path
    if ($resolvedProfile.StartsWith($root, [StringComparison]::OrdinalIgnoreCase)) {
      Remove-Item -LiteralPath $resolvedProfile -Recurse -Force
    }
  }
}

$script:results | Format-Table -AutoSize

if ($script:failed -gt 0) {
  throw "$script:failed checks de QA fallaron."
}

Write-Host "QA local OK: $($script:results.Count) checks pasaron."
