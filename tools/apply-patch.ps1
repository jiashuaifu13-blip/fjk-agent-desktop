# apply-patch.ps1 — 网页 AI 补丁的统一执行器（PowerShell 5.1 兼容）
#
# 用法（所有参数均为 ASCII，base64 为 UTF-8 内容）：
#   局部替换：
#     powershell -NoProfile -File D:\pet-desp\tools\apply-patch.ps1 `
#       -Path 'apps\desktop\src\foo.ts' -OldB64 '<base64>' -NewB64 '<base64>' [-DryRun]
#   新文件 / 整文件写入：
#     powershell -NoProfile -File D:\pet-desp\tools\apply-patch.ps1 `
#       -Path 'apps\desktop\src\new.ts' -NewB64 '<base64>' -WholeFile [-DryRun]
#
# 输出（最后一行）：PATCH_OK ... / PATCH_DRYRUN ... / PATCH_FAIL ...:原因
# 退出码：0 成功；2 OLD 未找到；3 OLD 不唯一；4 未产生变化；5 参数/路径错误

param(
  [Parameter(Mandatory = $true)][string]$Path,
  [string]$OldB64 = '',
  [string]$NewB64 = '',
  [string]$Tag = '',
  [switch]$WholeFile,
  [switch]$DryRun,
  [switch]$AllowMulti
)

$ErrorActionPreference = 'Stop'
$root = 'D:\pet-desp'
$tagPrefix = if ([string]::IsNullOrWhiteSpace($Tag)) { '' } else { "tag=$Tag " }

function Fail([string]$code, [string]$detail) {
  Write-Output ("{0}PATCH_FAIL {1}: {2}" -f $tagPrefix, $code, $detail)
  exit $code
}

$full = [System.IO.Path]::GetFullPath((Join-Path $root $Path))
$rootFull = [System.IO.Path]::GetFullPath($root)
if (-not $full.StartsWith($rootFull, [System.StringComparison]::OrdinalIgnoreCase)) {
  Fail 5 "path outside repo: $full"
}

function Normalize([string]$s) {
  return ($s -replace "`r`n", "`n")
}

function FromB64([string]$b64) {
  if ([string]::IsNullOrEmpty($b64)) { return '' }
  try { return [System.Text.Encoding]::UTF8.GetString([System.Convert]::FromBase64String($b64)) }
  catch { Fail 5 "invalid base64: $($_.Exception.Message)" }
}

$new = Normalize (FromB64 $NewB64)
if ([string]::IsNullOrEmpty($new)) { Fail 5 'NewB64 is empty' }

$exists = Test-Path -LiteralPath $full

if ($WholeFile) {
  if ($DryRun) { Write-Output ("{0}PATCH_DRYRUN mode=whole-file path={1} exists={2} bytes={3}" -f $tagPrefix, $Path, $exists, $new.Length); exit 0 }
  $dir = Split-Path -Parent $full
  if (-not (Test-Path -LiteralPath $dir)) { New-Item -ItemType Directory -Path $dir -Force | Out-Null }
  [System.IO.File]::WriteAllText($full, $new, (New-Object System.Text.UTF8Encoding($false)))
} else {
  if (-not $exists) { Fail 2 "file not found: $Path" }
  $rawBytes = [System.IO.File]::ReadAllBytes($full)
  $hadBom = ($rawBytes.Length -ge 3 -and $rawBytes[0] -eq 239 -and $rawBytes[1] -eq 187 -and $rawBytes[2] -eq 191)
  $raw = [System.IO.File]::ReadAllText($full)
  $eol = if ($raw.Contains("`r`n")) { "`r`n" } else { "`n" }

  $text = Normalize $raw
  $old = Normalize (FromB64 $OldB64)
  if ([string]::IsNullOrEmpty($old)) { Fail 5 'OldB64 is required for replace mode' }

  $hits = ([regex]::Matches($text, [regex]::Escape($old))).Count
  if ($hits -eq 0) {
    # idempotent: if NEW already present, treat as success (already applied)
    if ($text.Contains($new)) {
      Write-Output ("{0}PATCH_SKIP path={1} reason=already-applied" -f $tagPrefix, $Path)
      exit 0
    }
    Fail 2 "OLD_NOT_FOUND path=$Path"
  }
  if ($hits -gt 1 -and -not $AllowMulti) { Fail 3 "OLD_NOT_UNIQUE hits=$hits path=$Path" }

  $lines = @()
  if ($hits -ge 1) {
    $idx = $text.IndexOf($old)
    $lineNo = 1 + ([regex]::Matches($text.Substring(0, $idx), "`n")).Count
    $lines += $lineNo
  }

  if ($DryRun) {
    Write-Output ("{0}PATCH_DRYRUN mode=replace path={1} hits={2} firstLine={3} eol={4} bytes={5}" -f $tagPrefix, $Path, $hits, ($lines -join ','), ($eol -replace "`r", '\r' -replace "`n", '\n'), $text.Length)
    exit 0
  }

  $after = $text.Replace($old, $new)
  if ($after -eq $text) { Fail 4 'REPLACE_NOT_APPLIED' }

  if ($eol -eq "`r`n") { $after = $after -replace "`n", "`r`n" }
  [System.IO.File]::WriteAllText($full, $after, (New-Object System.Text.UTF8Encoding($false)))

  # 自检
  $checkBytes = [System.IO.File]::ReadAllBytes($full)
  $nul = ($checkBytes | Where-Object { $_ -eq 0 }).Count
  $bom = ($checkBytes.Length -ge 3 -and $checkBytes[0] -eq 239 -and $checkBytes[1] -eq 187 -and $checkBytes[2] -eq 191)
  $checkText = [System.IO.File]::ReadAllText($full)
  $qqq = ([regex]::Matches($checkText, [regex]::Escape('???'))).Count
  $sig = $new.Split("`n")[0]
  if ($sig.Length -gt 40) { $sig = $sig.Substring(0, 40) }
  $pos = $checkText.IndexOf($sig)
  $newLine = if ($pos -ge 0) { 1 + ([regex]::Matches($checkText.Substring(0, $pos), "`n")).Count } else { -1 }

  Write-Output ("{0}PATCH_OK path={1} hits={2} eol={3} NUL={4} BOM={5} ???={6} newLine={7} bytes={8}" -f $tagPrefix, `
    $Path, $hits, ($(if ($eol -eq "`r`n") { 'CRLF' } else { 'LF' })), $nul, $bom, $qqq, $newLine, $checkBytes.Length)
  if ($nul -ne 0 -or $bom -or $qqq -ne 0 -or $newLine -lt 0) { exit 6 }
  exit 0
}

$checkBytes = [System.IO.File]::ReadAllBytes($full)
$nul = ($checkBytes | Where-Object { $_ -eq 0 }).Count
$bom = ($checkBytes.Length -ge 3 -and $checkBytes[0] -eq 239 -and $checkBytes[1] -eq 187 -and $checkBytes[2] -eq 191)
Write-Output ("{0}PATCH_OK path={1} mode=whole-file exists={2} NUL={3} BOM={4} bytes={5}" -f $tagPrefix, $Path, $exists, $nul, $bom, $checkBytes.Length)
if ($nul -ne 0 -or $bom) { exit 6 }
exit 0
