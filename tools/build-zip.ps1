param(
  [string]$Entry = "index.html",
  [string]$OutZip = "dist\\newgrounds.zip",
  [string]$PackageRoot = "",
  [bool]$Cautious = $true,
  [switch]$Clean
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Resolve-RelPath([string]$Path) {
  $p = $Path.Trim()
  if ([string]::IsNullOrWhiteSpace($p)) { return $null }

  # Strip query/hash
  $p = $p -replace "[?#].*$", ""

  # Ignore external/data
  if ($p -match '^(?i)(https?:)?//') { return $null }
  if ($p -match '^(?i)data:') { return $null }
  if ($p -match '^(?i)mailto:') { return $null }

  # Normalize leading ./
  if ($p.StartsWith("./")) { $p = $p.Substring(2) }
  if ($p.StartsWith("/"))  { $p = $p.Substring(1) }

  if ([string]::IsNullOrWhiteSpace($p)) { return $null }
  return $p
}

function Add-IfExists([hashtable]$Set, [string]$Rel) {
  if (-not $Rel) { return }
  $Rel = $Rel -replace "\\", "/"
  if ($Rel.StartsWith("../")) { return }
  if ($Rel -match '^\.' ) { return }

  $full = Join-Path $PSScriptRoot ".." | Join-Path -ChildPath $Rel
  $full = [System.IO.Path]::GetFullPath($full)
  $root = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))

  if (-not $full.StartsWith($root, [System.StringComparison]::OrdinalIgnoreCase)) { return }
  if (Test-Path -LiteralPath $full -PathType Leaf) {
    $Set[$Rel] = $true
  }
}

function Normalize-Slash([string]$p) {
  if (-not $p) { return $p }
  return ($p -replace "\\", "/")
}

function Trim-TrailingSlash([string]$p) {
  if (-not $p) { return $p }
  return ($p -replace "/+$", "")
}

function Compute-PackageRoot([string]$EntryRel, [string]$Override) {
  $overrideRel = Resolve-RelPath $Override
  $overrideRel = Normalize-Slash $overrideRel
  $overrideRel = Trim-TrailingSlash $overrideRel
  if ($overrideRel) { return $overrideRel }

  $e = Normalize-Slash $EntryRel
  if ($e -match "/") {
    return ([regex]::Replace($e, "/[^/]+$", ""))
  }
  return ""
}

function To-DestRel([string]$SrcRel, [string]$PkgRootRel) {
  $src = Normalize-Slash $SrcRel
  $pkg = Normalize-Slash $PkgRootRel
  $pkg = Trim-TrailingSlash $pkg
  if ([string]::IsNullOrWhiteSpace($pkg)) { return $src }

  $prefix = $pkg + "/"
  if ($src.StartsWith($prefix, [System.StringComparison]::OrdinalIgnoreCase)) {
    return $src.Substring($prefix.Length)
  }
  return $src
}

function Add-File([hashtable]$Map, [string]$SrcRel, [string]$DestRel, [string]$RootDir) {
  if (-not $SrcRel -or -not $DestRel) { return $false }

  $srcRelN = Normalize-Slash $SrcRel
  $destRelN = Normalize-Slash $DestRel
  if ($srcRelN.StartsWith("../")) { return $false }
  if ($srcRelN -match '^\.' ) { return $false }
  if ($destRelN.StartsWith("../")) { return $false }
  if ($destRelN -match '^\.' ) { return $false }

  $srcFull = Join-Path $RootDir $srcRelN
  if (-not (Test-Path -LiteralPath $srcFull -PathType Leaf)) { return $false }

  if (-not $Map.ContainsKey($destRelN)) {
    $Map[$destRelN] = $srcRelN
    return $true
  }
  return $false
}

function Extract-RefsFromHtml([string]$Text) {
  $refs = New-Object System.Collections.Generic.List[string]

  foreach ($m in [regex]::Matches($Text, '(?is)\b(?:src|href)\s*=\s*["'']([^"'']+)["'']')) {
    $refs.Add($m.Groups[1].Value)
  }

  # Inline style url(...)
  foreach ($m in [regex]::Matches($Text, '(?is)url\(\s*(["'']?)([^"'')]+)\1\s*\)')) {
    $refs.Add($m.Groups[2].Value)
  }

  # Inline <script> bodies can reference assets too (Audio, fetch, img.src, etc.)
  foreach ($m in [regex]::Matches($Text, '(?is)<script\b[^>]*>(.*?)</script>')) {
    $body = $m.Groups[1].Value
    if (-not [string]::IsNullOrWhiteSpace($body)) {
      foreach ($r in (Extract-RefsFromJs $body)) {
        $refs.Add($r)
      }
    }
  }

  return $refs
}

function Extract-RefsFromCss([string]$Text) {
  $refs = New-Object System.Collections.Generic.List[string]
  foreach ($m in [regex]::Matches($Text, '(?is)url\(\s*(["'']?)([^"'')]+)\1\s*\)')) {
    $refs.Add($m.Groups[2].Value)
  }
  return $refs
}

function Extract-RefsFromJs([string]$Text) {
  $refs = New-Object System.Collections.Generic.List[string]

  foreach ($m in [regex]::Matches($Text, '(?is)\b(?:new\s+Audio|fetch)\s*\(\s*["'']([^"'']+)["'']')) {
    $refs.Add($m.Groups[1].Value)
  }

  foreach ($m in [regex]::Matches($Text, '(?is)\b(?:src)\s*=\s*["'']([^"'']+)["'']')) {
    $refs.Add($m.Groups[1].Value)
  }

  return $refs
}

$rootDir = [System.IO.Path]::GetFullPath((Join-Path $PSScriptRoot ".."))
$entryRel = Resolve-RelPath $Entry
if (-not $entryRel) { throw "Entry is empty." }
$entryRel = Normalize-Slash $entryRel
$entryFull = Join-Path $rootDir $entryRel
if (-not (Test-Path -LiteralPath $entryFull -PathType Leaf)) { throw "Entry not found: $entryFull" }

$pkgRootRel = Compute-PackageRoot $entryRel $PackageRoot

$outZipRel = Resolve-RelPath $OutZip
if (-not $outZipRel) { throw "OutZip is empty." }
$outZipFull = Join-Path $rootDir $outZipRel

$distDir = Split-Path -Parent $outZipFull
$stageDir = Join-Path $rootDir "dist\\_stage"

if ($Clean) {
  if (Test-Path -LiteralPath $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
  if (Test-Path -LiteralPath $outZipFull) { Remove-Item -LiteralPath $outZipFull -Force }
}

New-Item -ItemType Directory -Force -Path $distDir | Out-Null
if (Test-Path -LiteralPath $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path $stageDir | Out-Null

$files = @{} # destRel -> srcRel
$queue = New-Object System.Collections.Generic.Queue[string]
$missing = New-Object System.Collections.Generic.List[string]

# Add entry (flattened into package root if entry is under a variant folder)
$entryDest = To-DestRel $entryRel $pkgRootRel
[void](Add-File $files $entryRel $entryDest $rootDir)
$queue.Enqueue($entryRel)

while ($queue.Count -gt 0) {
  $rel = $queue.Dequeue()
  $rel = Normalize-Slash $rel
  $full = Join-Path $rootDir $rel
  if (-not (Test-Path -LiteralPath $full -PathType Leaf)) { continue }

  $ext = [System.IO.Path]::GetExtension($full).ToLowerInvariant()
  $text = $null

  if ($ext -in @(".html", ".css", ".js")) {
    $text = Get-Content -LiteralPath $full -Raw -Encoding UTF8
  }

  $refs = @()
  if ($ext -eq ".html") { $refs = Extract-RefsFromHtml $text }
  elseif ($ext -eq ".css") { $refs = Extract-RefsFromCss $text }
  elseif ($ext -eq ".js") { $refs = Extract-RefsFromJs $text }

  foreach ($r in $refs) {
    $r2 = Resolve-RelPath $r
    if (-not $r2) { continue }
    # Resolve relative to current file's directory
    $baseDir = Split-Path -Parent $rel
    $cand = if ([string]::IsNullOrWhiteSpace($baseDir)) { $r2 } else { (Join-Path $baseDir $r2) }
    $cand = Normalize-Slash $cand
    $candDest = To-DestRel $cand $pkgRootRel
    if ($files.ContainsKey((Normalize-Slash $candDest))) { continue }   # referenced more than once

    $added = Add-File $files $cand $candDest $rootDir
    if ($added) {
      $queue.Enqueue($cand)
      continue
    }

    # If the referenced path doesn't exist in this variant folder, try to pull it from repo root by filename.
    if ($Cautious) {
      $bn = [System.IO.Path]::GetFileName($cand)
      if (-not [string]::IsNullOrWhiteSpace($bn)) {
        $rootCandidate = Normalize-Slash $bn
        $fallbackAdded = Add-File $files $rootCandidate $candDest $rootDir
        if ($fallbackAdded) { continue }
      }
    }

    if (-not $missing.Contains($cand)) { [void]$missing.Add($cand) }
  }

  # Special-case: royal PNG template `${card.rank}${s}.png`
  if ($ext -eq ".js" -and $text -match '\$\{\s*card\.rank\s*\}\$\{\s*s\s*\}\.png') {
    Get-ChildItem -LiteralPath $rootDir -Filter "*.png" -File | ForEach-Object {
      $name = $_.Name
      if ($name -match '^[JQK][SHDC]\.png$') {
        $dest = To-DestRel $name $pkgRootRel
        [void](Add-File $files $name $dest $rootDir)
      }
    }
  }
}

# Card art loaded through runtime-built paths (court/KH.svg, special/SUN.svg,
# special/icon-SUN.svg): include those folders' top-level files. Source art
# under special/art/ is not needed at runtime.
foreach ($dir in @("court", "special", "img")) {
  $dirFull = Join-Path $rootDir $dir
  if (Test-Path -LiteralPath $dirFull) {
    Get-ChildItem -LiteralPath $dirFull -File | Where-Object { $_.Extension -in @(".svg", ".png", ".webp") } | ForEach-Object {
      $rel = "$dir/" + $_.Name
      [void](Add-File $files $rel (To-DestRel $rel $pkgRootRel) $rootDir)
    }
  }
}

# Always include common CSS if present.
# Prefer the variant copy under PackageRoot when building a variant.
foreach ($maybe in @("gw.css")) {
  $tryRel = if ([string]::IsNullOrWhiteSpace($pkgRootRel)) { $maybe } else { (Normalize-Slash (Join-Path $pkgRootRel $maybe)) }
  $tryDest = To-DestRel $tryRel $pkgRootRel
  if (-not (Add-File $files $tryRel $tryDest $rootDir)) {
    $fallbackDest = To-DestRel $maybe $pkgRootRel
    [void](Add-File $files $maybe $fallbackDest $rootDir)
  }
}

# Copy into staging (dest paths are relative to the package root)
foreach ($destRel in ($files.Keys | Sort-Object)) {
  $srcRel = $files[$destRel]
  $src = Join-Path $rootDir $srcRel
  $dst = Join-Path $stageDir $destRel
  $dstDir = Split-Path -Parent $dst
  if (-not (Test-Path -LiteralPath $dstDir)) { New-Item -ItemType Directory -Force -Path $dstDir | Out-Null }
  Copy-Item -LiteralPath $src -Destination $dst -Force
}

# Build zip
if (Test-Path -LiteralPath $outZipFull) { Remove-Item -LiteralPath $outZipFull -Force }
# Write entries with forward slashes (Compress-Archive on Windows PowerShell 5
# uses backslashes, which break folder paths when unzipped on Linux hosts).
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::Open($outZipFull, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($destRel in ($files.Keys | Sort-Object)) {
    $src = Join-Path $stageDir $destRel
    $entryName = Normalize-Slash $destRel
    [void][System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($zip, $src, $entryName, [System.IO.Compression.CompressionLevel]::Optimal)
  }
} finally {
  $zip.Dispose()
}

# Cleanup staging
Remove-Item -LiteralPath $stageDir -Recurse -Force

Write-Host "Built: $outZipRel" -ForegroundColor Green
Write-Host ("Files: {0}" -f $files.Count)

if ($missing.Count -gt 0) {
  Write-Host ("Warnings: {0} referenced paths were not found." -f $missing.Count) -ForegroundColor Yellow
  # Show a few examples (avoid spamming)
  $missing | Select-Object -First 12 | ForEach-Object { Write-Host ("  missing: {0}" -f $_) -ForegroundColor Yellow }
}
