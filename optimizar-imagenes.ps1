$ErrorActionPreference = "Stop"

$python = Get-Command py -ErrorAction SilentlyContinue
if (-not $python) {
  throw "No se encontró Python. Instalalo antes de optimizar las imágenes."
}

py -c "import PIL" 2>$null
if ($LASTEXITCODE -ne 0) {
  throw "Falta Pillow. Instalalo con: py -m pip install --user Pillow"
}

py (Join-Path $PSScriptRoot "optimizar-imagenes-webp.py") `
  --source (Join-Path $PSScriptRoot "img\productos") `
  --output (Join-Path $PSScriptRoot "img\productos") `
  --max-side 900 `
  --quality 80 `
  --delete-source

if ($LASTEXITCODE -ne 0) {
  throw "No se pudieron optimizar las imágenes del catálogo."
}

Write-Host "Catálogo convertido a WebP." -ForegroundColor Green
