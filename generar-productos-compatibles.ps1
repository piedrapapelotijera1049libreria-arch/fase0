$ErrorActionPreference = "Stop"

$jsonPath = Join-Path $PSScriptRoot "productos.json"
$dataPath = Join-Path $PSScriptRoot "productos-data.js"
$json = Get-Content -Raw -Encoding UTF8 $jsonPath
$trimmedJson = $json.Trim()

if (-not $trimmedJson.StartsWith("[")) {
  throw "productos.json debe contener una lista de productos."
}

$catalog = $trimmedJson | ConvertFrom-Json
if (@($catalog).Count -eq 0) {
  throw "productos.json esta vacio."
}

$header = @"
/*
  Archivo generado automaticamente desde productos.json.
  No editar manualmente: ejecuta generar-productos-compatibles.ps1.
*/
window.PRODUCTOS_CATALOGO =
"@

$content = $header + $trimmedJson + ";`r`n"
$utf8WithoutBom = [System.Text.UTF8Encoding]::new($false)
[System.IO.File]::WriteAllText($dataPath, $content, $utf8WithoutBom)

Write-Host "Catalogo compatible generado: productos-data.js" -ForegroundColor Green
