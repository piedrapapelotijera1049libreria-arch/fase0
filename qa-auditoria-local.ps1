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

  $variantAndCart = Eval-Js @"
(async () => {
  const variantCard = [...document.querySelectorAll('.product-card')].find(card => card.querySelectorAll('.variant-swatch').length > 1);
  const swatches = variantCard ? [...variantCard.querySelectorAll('.variant-swatch')] : [];
  if (swatches[1]) swatches[1].click();
  await new Promise(resolve => setTimeout(resolve, 150));
  const activeSwatches = variantCard ? variantCard.querySelectorAll('.variant-swatch.is-active').length : 0;
  const addButton = document.querySelector('.product-card__action');
  addButton.click();
  await new Promise(resolve => setTimeout(resolve, 250));
  document.querySelector('#cartButton').click();
  await new Promise(resolve => setTimeout(resolve, 250));
  return {
    activeSwatches,
    cartCount: document.querySelector('#cartCount')?.textContent || '',
    cartOpen: document.querySelector('#cartPanel')?.classList.contains('is-open') || false,
    sendDisabled: document.querySelector('#sendWhatsAppButton')?.disabled || false,
    cartItems: document.querySelectorAll('.cart-item').length
  };
})()
"@
  Add-Check "Variantes y carrito" ($variantAndCart.activeSwatches -eq 1 -and $variantAndCart.cartCount -eq "1" -and $variantAndCart.cartOpen -and -not $variantAndCart.sendDisabled -and $variantAndCart.cartItems -eq 1) ($variantAndCart | ConvertTo-Json -Compress)

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
  Add-Check "Tilt desactivado en touch" (-not $mobile.pointerFine) "pointerFine=$($mobile.pointerFine)"

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
