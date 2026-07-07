$ErrorActionPreference = "Stop"
Add-Type -AssemblyName System.Drawing

function Save-JpegOptimized([string]$path, [int]$maxSide, [long]$quality) {
  $full = (Resolve-Path $path).Path
  $originalLength = (Get-Item $full).Length
  $temp = "$full.tmp.jpg"

  $img = [System.Drawing.Image]::FromFile($full)
  try {
    $longest = [double][Math]::Max($img.Width, $img.Height)
    $scale = [Math]::Min(1.0, [double]$maxSide / $longest)
    $newWidth = [Math]::Max(1, [int][Math]::Round($img.Width * $scale))
    $newHeight = [Math]::Max(1, [int][Math]::Round($img.Height * $scale))

    $bmp = [System.Drawing.Bitmap]::new($newWidth, $newHeight)
    try {
      $graphics = [System.Drawing.Graphics]::FromImage($bmp)
      try {
        $graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.DrawImage($img, 0, 0, $newWidth, $newHeight)
      } finally {
        $graphics.Dispose()
      }

      $codec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() |
        Where-Object { $_.MimeType -eq "image/jpeg" } |
        Select-Object -First 1
      $encoderParams = [System.Drawing.Imaging.EncoderParameters]::new(1)
      $encoderParams.Param[0] = [System.Drawing.Imaging.EncoderParameter]::new(
        [System.Drawing.Imaging.Encoder]::Quality,
        $quality
      )
      $bmp.Save($temp, $codec, $encoderParams)
    } finally {
      $bmp.Dispose()
    }
  } finally {
    $img.Dispose()
  }

  if ((Get-Item $temp).Length -lt $originalLength) {
    [System.IO.File]::Copy($temp, $full, $true)
    Remove-Item -LiteralPath $temp -Force
    return $true
  }

  Remove-Item -LiteralPath $temp -Force
  return $false
}

$changed = 0

foreach ($file in Get-ChildItem -Recurse -File img\productos | Where-Object { $_.Extension -match "^\.(jpg|jpeg)$" }) {
  if (Save-JpegOptimized $file.FullName 800 82) {
    $changed++
  }
}

if (Test-Path "img\local-exterior.jpg") {
  if (Save-JpegOptimized "img\local-exterior.jpg" 1400 55) {
    $changed++
  }
}

Write-Host "Imagenes optimizadas: $changed"
