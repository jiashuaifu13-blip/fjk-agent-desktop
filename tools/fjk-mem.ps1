<#
.SYNOPSIS
  fjk-mem —— 只允许写 OpenClaw 长期记忆文件的受控入口

.DESCRIPTION
  路径在脚本内硬编码，不接受任何路径参数：
    USER.md                 稳定偏好（bootstrap 自动加载）
    MEMORY.md               长期事实/决定（bootstrap 自动加载）
    memory\YYYY-MM-DD.md    每日笔记（可被 memory_search 检索）

  设计目的：文件工具被 workspaceOnly 限制在项目目录内，无法写 workspace；
  这个脚本作为 exec 命令运行，通过 FJK 策略放行，只写上述三个文件。

  用法：
    fjk-mem.ps1 user   --text "以后别叫我老板，叫我 X"
    fjk-mem.ps1 memory --text "结论：..."
    fjk-mem.ps1 daily  --text "..."
    fjk-mem.ps1 diary  --mood happy --text "今天的日记（≤50字）"
    fjk-mem.ps1 show   --file user|memory|daily
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Command,

  [string]$Text,
  [string]$File,
  [string]$Mood
)

$ErrorActionPreference = 'Stop'

try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
  # 忽略
}

$Workspace = Join-Path ([Environment]::GetFolderPath('UserProfile')) '.openclaw\workspace'
$Utf8NoBom = New-Object System.Text.UTF8Encoding($false)

function Write-Json($object) {
  $object | ConvertTo-Json -Depth 4 -Compress
}

function Get-TargetPath([string]$kind) {
  switch ($kind) {
    'user'   { return (Join-Path $Workspace 'USER.md') }
    'memory' { return (Join-Path $Workspace 'MEMORY.md') }
    'daily'  { return (Join-Path $Workspace ('memory\' + (Get-Date -Format 'yyyy-MM-dd') + '.md')) }
    default  { throw "不支持的记忆类型：$kind（只允许 user / memory / daily）" }
  }
}

function Get-SafeText([string]$value) {
  if ([string]::IsNullOrWhiteSpace($value)) {
    throw '缺少 --text'
  }

  $clean = $value -replace "`r`n", ' / ' -replace "`n", ' / ' -replace "`r", ' / '
  $clean = $clean.Trim()

  if ($clean.Length -gt 1000) {
    $clean = $clean.Substring(0, 1000) + '…'
  }

  return $clean
}

function Initialize-File([string]$path, [string]$kind) {
  if (Test-Path $path) {
    return
  }

  $dir = Split-Path $path -Parent

  if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Force -Path $dir | Out-Null
  }

  $header = switch ($kind) {
    'user'   { "# USER.md`n`n稳定偏好与用户画像（由 fjk-mem 维护）。`n" }
    'memory' { "# MEMORY.md`n`n长期事实与决定（由 fjk-mem 维护）。`n" }
    default  { "# $((Get-Date -Format 'yyyy-MM-dd'))`n`n每日笔记。`n" }
  }

  [System.IO.File]::WriteAllText($path, $header, $Utf8NoBom)
}

if (-not $Command) {
  Write-Json @{ ok = $false; error = '缺少子命令：user | memory | daily | show' }
  exit 2
}

try {
  if ($Command -eq 'show') {
    $kind = if ($File) { $File.ToLower() } else { 'user' }
    $path = Get-TargetPath $kind

    if (-not (Test-Path $path)) {
      Write-Json @{ ok = $true; exists = $false; kind = $kind; path = $path; content = $null }
      exit 0
    }

    $rawText = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $content = [string]$rawText

    if ($content.Length -gt 4000) {
      $content = $content.Substring(0, 4000) + '…'
    }

    Write-Json @{ ok = $true; exists = $true; kind = $kind; path = [string]$path; content = [string]$content }
    exit 0
  }

  $kind = $Command.ToLower()

  if (@('user', 'memory', 'daily', 'diary') -notcontains $kind) {
    Write-Json @{ ok = $false; error = "未知子命令：$Command" }
    exit 2
  }

  if ($kind -eq 'diary') {
    $cleanMood = 'neutral'

    if (-not [string]::IsNullOrWhiteSpace($Mood)) {
      $cleanMood = $Mood.ToLower()
    }
    $allowed = @('neutral','happy','joy','excited','proud','shy','surprised','angry','sad','wronged')

    if ($allowed -notcontains $cleanMood) {
      $cleanMood = 'neutral'
    }

    $rawText = ''

    if (-not [string]::IsNullOrWhiteSpace($Text)) {
      $rawText = $Text
    }

    $body = $rawText.Trim() -replace "`r?`n", ' '

    if ($body.Length -gt 50) {
      $body = $body.Substring(0, 50) + '…'
    }

    if ([string]::IsNullOrWhiteSpace($body)) {
      Write-Json @{ ok = $false; error = '缺少 --text' }
      exit 2
    }

    $diaryPath = Get-TargetPath 'daily'
    Initialize-File $diaryPath 'daily'

    $existing = [string][System.IO.File]::ReadAllText($diaryPath, [System.Text.Encoding]::UTF8)

    if ($existing.Contains($body)) {
      Write-Json @{ ok = $true; appended = $false; duplicate = $true; kind = 'diary'; path = $diaryPath }
      exit 0
    }

    $stamp = Get-Date -Format 'HH:mm'
    $entry = "`n## $stamp · 心情 $cleanMood`n`n$body`n`n[[mood:$cleanMood]]`n"

    [System.IO.File]::AppendAllText($diaryPath, $entry, $Utf8NoBom)

    Write-Json @{ ok = $true; appended = $true; kind = 'diary'; mood = $cleanMood; path = $diaryPath }
    exit 0
  }

  $safe = Get-SafeText $Text
  $path = Get-TargetPath $kind
  Initialize-File $path $kind

  $existing = if (Test-Path $path) { [string][System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8) } else { '' }

  if ($existing -and $existing.Contains($safe)) {
    Write-Json @{ ok = $true; appended = $false; duplicate = $true; kind = $kind; path = $path }
    exit 0
  }

  $stamp = if ($kind -eq 'daily') { Get-Date -Format 'HH:mm' } else { Get-Date -Format 'yyyy-MM-dd' }

  if ($kind -eq 'user') {
    # USER.md 按 OpenClaw 约定：指令块放在 "## Directives" 下面
    $block = "<!-- observed: $stamp | status: active -->`n`n- $safe`n`n"
    $current = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)
    $heading = '## Directives'
    $index = $current.IndexOf($heading)

    if ($index -ge 0) {
      $insertAt = $index + $heading.Length
      $updated = $current.Substring(0, $insertAt) + "`n`n" + $block + $current.Substring($insertAt).TrimStart("`r", "`n")
    } else {
      $updated = $current.TrimEnd() + "`n`n## Directives`n`n" + $block
    }

    [System.IO.File]::WriteAllText($path, $updated, $Utf8NoBom)
    $line = "- $safe"
  } else {
    $line = "- [$stamp] $safe`n"
    [System.IO.File]::AppendAllText($path, $line, $Utf8NoBom)
  }

  Write-Json @{ ok = $true; appended = $true; duplicate = $false; kind = $kind; path = $path; line = $line.Trim() }
  exit 0
} catch {
  Write-Json @{ ok = $false; error = $_.Exception.Message }
  exit 1
}
