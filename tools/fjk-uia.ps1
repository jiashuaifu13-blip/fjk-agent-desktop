<#
.SYNOPSIS
  fjk-uia —— 基于 Windows 自带 .NET UIAutomation 的元素级桌面操作（只读优先）

.DESCRIPTION
  调用系统自带的 UIAutomationClient / UIAutomationTypes，不依赖任何第三方包。
  由 agent 通过 exec 调用，因此天然走 FJK 的策略、审批卡与审计。

  子命令：
    list       --pid 123 [--max 60]              列出窗口内的可交互元素
    find       --pid 123 --name "保存" [--type Button] [--max 10]
    invoke     --pid 123 --name "保存"           调用 Invoke/Select/Toggle 模式
    get-text   --pid 123 [--name "xxx"]          读取文本（Value/Text 模式）
    set-value  --pid 123 --name "文件名" --text "abc"
    windows    [--title "记事本"]                 列出顶层窗口（pid/标题/类名/矩形）

  输出统一为单行 JSON，便于 agent 解析。
#>

[CmdletBinding()]
param(
  [Parameter(Position = 0)]
  [string]$Command,

  [Alias('pid')]
  [int]$ProcessId,
  [string]$Name,
  [string]$Type,
  [string]$Text,
  [string]$Title,
  [string]$AutomationId,
  [int]$Max = 60,
  [int]$Index = 0,
  [switch]$Interactive
)

$ErrorActionPreference = 'Stop'
$ProgressPreference = 'SilentlyContinue'

# 统一 UTF-8，避免中文乱码
try {
  [Console]::OutputEncoding = [System.Text.Encoding]::UTF8
  $OutputEncoding = [System.Text.Encoding]::UTF8
} catch {
  # 忽略编码设置失败
}

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$AE = [System.Windows.Automation.AutomationElement]
$TS = [System.Windows.Automation.TreeScope]

function Write-Json($object) {
  $object | ConvertTo-Json -Depth 6 -Compress
}

function Get-Rect($element) {
  try {
    $rect = $element.Current.BoundingRectangle

    if ($rect.IsEmpty) {
      return $null
    }

    if ([double]::IsInfinity($rect.Width) -or [double]::IsInfinity($rect.Height)) {
      return $null
    }

    return [pscustomobject]@{
      x      = [int]$rect.X
      y      = [int]$rect.Y
      width  = [int]$rect.Width
      height = [int]$rect.Height
      centerX = [int]($rect.X + $rect.Width / 2)
      centerY = [int]($rect.Y + $rect.Height / 2)
    }
  } catch {
    return $null
  }
}

function Get-Patterns($element) {
  $names = @()

  foreach ($pair in @(
      @{ Id = [System.Windows.Automation.InvokePattern]::Pattern; Label = 'invoke' },
      @{ Id = [System.Windows.Automation.SelectionItemPattern]::Pattern; Label = 'select' },
      @{ Id = [System.Windows.Automation.TogglePattern]::Pattern; Label = 'toggle' },
      @{ Id = [System.Windows.Automation.ValuePattern]::Pattern; Label = 'value' },
      @{ Id = [System.Windows.Automation.ExpandCollapsePattern]::Pattern; Label = 'expand' }
    )) {
    try {
      $object = $null
      if ($element.TryGetCurrentPattern($pair.Id, [ref]$object) -and $object) {
        $names += $pair.Label
      }
    } catch {
      # 忽略不支持的模式
    }
  }

  return $names
}

function Get-WindowElement {
  param([int]$ProcessId, [string]$WindowTitle)

  $root = $AE::RootElement
  $found = $null

  if ($ProcessId -gt 0) {
    $condition = New-Object System.Windows.Automation.PropertyCondition($AE::ProcessIdProperty, $ProcessId)
    $found = $root.FindFirst($TS::Children, $condition)
  }

  if ($WindowTitle) {
    foreach ($child in $root.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
      try {
        $childTitle = $child.Current.Name

        if ($childTitle -and $childTitle.ToLower().Contains($WindowTitle.ToLower())) {
          $found = $child
          break
        }
      } catch {
        # 忽略已失效元素
      }
    }
  }

  if (-not $found) {
    return $null
  }

  # UWP / ApplicationFrameWindow：真实内容在内层 CoreWindow 里
  try {
    if ($found.Current.ClassName -eq 'ApplicationFrameWindow') {
      foreach ($inner in $found.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)) {
        $innerClass = $inner.Current.ClassName

        if ($innerClass -and ($innerClass.Contains('CoreWindow') -or $innerClass.Contains('ApplicationView'))) {
          return $inner
        }
      }
    }
  } catch {
    # 忽略
  }

  return $found
}

function Get-Descendants($window) {
  return $window.FindAll($TS::Descendants, [System.Windows.Automation.Condition]::TrueCondition)
}

function Format-Element($element) {
  try {
    $current = $element.Current
  } catch {
    return $null
  }

  $rect = Get-Rect $element

  # 名称可能大段文本（如编辑器正文），截断以控制输出体积
  $displayName = $current.Name
  if ($displayName -and $displayName.Length -gt 200) {
    $displayName = $displayName.Substring(0, 200) + '…'
  }

  return [pscustomobject]@{
    type         = $current.ControlType.ProgrammaticName -replace '^ControlType\.', ''
    name         = $displayName
    automationId = $current.AutomationId
    className    = $current.ClassName
    enabled      = [bool]$current.IsEnabled
    offscreen    = [bool]$current.IsOffscreen
    rect         = $rect
    patterns     = @(Get-Patterns $element)
  }
}

function Test-Match($element, $wantedName, $wantedType, $wantedId) {
  try {
    $current = $element.Current

    if ($wantedId -and $current.AutomationId -ne $wantedId) {
      return $false
    }

    if ($wantedType) {
      $typeName = $current.ControlType.ProgrammaticName -replace '^ControlType\.', ''

      if ($typeName -ne $wantedType) {
        return $false
      }
    }

    if ($wantedName) {
      $actual = $current.Name

      if (-not $actual) {
        return $false
      }

      if (-not $actual.ToLower().Contains($wantedName.ToLower())) {
        return $false
      }
    }

    return $true
  } catch {
    return $false
  }
}

function Invoke-Element($element) {
  $patterns = Get-Patterns $element

  if ($patterns -contains 'invoke') {
    $object = $null
    $element.TryGetCurrentPattern([System.Windows.Automation.InvokePattern]::Pattern, [ref]$object) | Out-Null
    ([System.Windows.Automation.InvokePattern]$object).Invoke()
    return 'invoke'
  }

  if ($patterns -contains 'select') {
    $object = $null
    $element.TryGetCurrentPattern([System.Windows.Automation.SelectionItemPattern]::Pattern, [ref]$object) | Out-Null
    ([System.Windows.Automation.SelectionItemPattern]$object).Select()
    return 'select'
  }

  if ($patterns -contains 'toggle') {
    $object = $null
    $element.TryGetCurrentPattern([System.Windows.Automation.TogglePattern]::Pattern, [ref]$object) | Out-Null
    ([System.Windows.Automation.TogglePattern]$object).Toggle()
    return 'toggle'
  }

  return $null
}

if (-not $Command) {
  Write-Json @{
    ok    = $false
    error = '缺少子命令：list | find | invoke | get-text | set-value | windows'
  }
  exit 2
}

try {
  switch ($Command.ToLower()) {
    'windows' {
      $root = $AE::RootElement
      $items = @()
      $index = 0

      foreach ($child in $root.FindAll($TS::Children, [System.Windows.Automation.Condition]::TrueCondition)) {
        if ($index -ge $Max) { break }

        $current = $null
        try { $current = $child.Current } catch { continue }

        if ($Title -and (-not $current.Name -or -not $current.Name.ToLower().Contains($Title.ToLower()))) {
          continue
        }

        $items += [pscustomobject]@{
          pid       = $current.ProcessId
          name      = $current.Name
          className = $current.ClassName
          rect      = Get-Rect $child
        }

        $index += 1
      }

      Write-Json @{ ok = $true; count = $items.Count; windows = $items }
      exit 0
    }

    default {
      if ($ProcessId -le 0 -and -not $Title) {
        Write-Json @{ ok = $false; error = '需要 --pid 或 --title 指定窗口' }
        exit 2
      }

      $window = Get-WindowElement -ProcessId $ProcessId -WindowTitle $Title

      if (-not $window) {
        Write-Json @{ ok = $false; error = '未找到目标窗口'; pid = $ProcessId; title = $Title }
        exit 1
      }

      $windowInfo = [pscustomobject]@{
        pid   = $window.Current.ProcessId
        name  = $window.Current.Name
        class = $window.Current.ClassName
      }

      switch ($Command.ToLower()) {
        'list' {
          $items = @()
          $count = 0

          foreach ($element in (Get-Descendants $window)) {
            $formatted = Format-Element $element

            if (-not $formatted) { continue }
            if (-not $formatted.name -and -not $formatted.automationId) { continue }
            if ($formatted.offscreen) { continue }
            if ($Interactive -and (@($formatted.patterns).Count -eq 0 -or -not $formatted.rect)) { continue }

            $items += $formatted
            $count += 1

            if ($count -ge $Max) { break }
          }

          Write-Json @{ ok = $true; window = $windowInfo; count = $items.Count; elements = $items }
          exit 0
        }

        'find' {
          $matches = @()
          $seen = 0

          foreach ($element in (Get-Descendants $window)) {
            if (-not (Test-Match $element $Name $Type $AutomationId)) { continue }

            $seen += 1

            if ($seen -le $Index) { continue }

            $formatted = Format-Element $element

            if ($formatted -and $Interactive -and (@($formatted.patterns).Count -eq 0 -or -not $formatted.rect)) {
              continue
            }

            if ($formatted) { $matches += $formatted }
            if ($matches.Count -ge $Max) { break }
          }

          Write-Json @{
            ok        = $true
            window    = $windowInfo
            matched   = $matches.Count
            elements  = $matches
          }
          exit 0
        }

        'invoke' {
          $target = $null

          foreach ($element in (Get-Descendants $window)) {
            if (Test-Match $element $Name $Type $AutomationId) {
              $target = $element
              break
            }
          }

          if (-not $target) {
            Write-Json @{ ok = $false; error = '未找到匹配元素'; name = $Name; type = $Type }
            exit 1
          }

          $pattern = Invoke-Element $target

          if (-not $pattern) {
            $formatted = Format-Element $target
            Write-Json @{
              ok       = $false
              error    = '该元素不支持 Invoke/Select/Toggle，请改用坐标点击（fjkctl click）'
              element  = $formatted
            }
            exit 1
          }

          Write-Json @{ ok = $true; action = $pattern; element = (Format-Element $target) }
          exit 0
        }

        'get-text' {
          $target = $null

          foreach ($element in (Get-Descendants $window)) {
            if (Test-Match $element $Name $Type $AutomationId) {
              $target = $element
              break
            }
          }

          if (-not $target) {
            $target = $window
          }

          $message = $null
          $value = $null

          try {
            $object = $null
            if ($target.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$object) -and $object) {
              $value = ([System.Windows.Automation.ValuePattern]$object).Current.Value
            }
          } catch {
            # 忽略
          }

          if (-not $value) {
            try {
              $object = $null
              if ($target.TryGetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern, [ref]$object) -and $object) {
                $value = ([System.Windows.Automation.TextPattern]$object).DocumentRange.GetText(4000)
              }
            } catch {
              # 忽略
            }
          }

          if (-not $value) {
            $value = $target.Current.Name
          }

          Write-Json @{ ok = $true; text = $value; element = (Format-Element $target) }
          exit 0
        }

        'set-value' {
          if ($null -eq $Text) {
            Write-Json @{ ok = $false; error = '缺少 --text' }
            exit 2
          }

          $target = $null

          foreach ($element in (Get-Descendants $window)) {
            if (Test-Match $element $Name $Type $AutomationId) {
              $target = $element
              break
            }
          }

          if (-not $target) {
            Write-Json @{ ok = $false; error = '未找到匹配元素'; name = $Name }
            exit 1
          }

          try {
            $object = $null
            if (-not ($target.TryGetCurrentPattern([System.Windows.Automation.ValuePattern]::Pattern, [ref]$object) -and $object)) {
              Write-Json @{ ok = $false; error = '该元素不支持 ValuePattern' }
              exit 1
            }

            ([System.Windows.Automation.ValuePattern]$object).SetValue($Text)
            Write-Json @{ ok = $true; action = 'set-value'; text = $Text; element = (Format-Element $target) }
            exit 0
          } catch {
            Write-Json @{ ok = $false; error = ('设置失败：' + $_.Exception.Message) }
            exit 1
          }
        }

        default {
          Write-Json @{ ok = $false; error = ('未知子命令：' + $Command) }
          exit 2
        }
      }
    }
  }
} catch {
  Write-Json @{ ok = $false; error = ('UIA 调用失败：' + $_.Exception.Message) }
  exit 1
}
