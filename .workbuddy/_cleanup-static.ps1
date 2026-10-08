$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName Microsoft.VisualBasic

$root = 'E:\3_WorkSpace\MiniProgram\static'

$targets = @(
  'avatar1.png',
  'bg_navbar.png',
  'bg_navbar2.png',
  'icon_doc.png',
  'icon_map.png',
  'icon_qq.png',
  'icon_td.png',
  'icon_wx.png',
  'image1.png',
  'image2.png',
  'img_td.png',
  'chat\avatar.png',
  'chat\avatar-Andrew.png',
  'chat\avatar-Kingdom.png',
  'chat\avatar-Mollymolly.png',
  'chat\avatar-Paige.png',
  'chat\avatar-Sean.png',
  'home\card0.png',
  'home\card1.png',
  'home\card2.png',
  'home\card3.png',
  'home\card4.png'
)

$log = @()
$log += "=== 移入回收站 ==="
$ok = 0
$fail = 0

foreach ($t in $targets) {
  $p = Join-Path $root $t
  if (Test-Path -LiteralPath $p) {
    try {
      [Microsoft.VisualBasic.FileIO.FileSystem]::DeleteFile(
        $p,
        [Microsoft.VisualBasic.FileIO.UIOption]::OnlyErrorDialogs,
        [Microsoft.VisualBasic.FileIO.RecycleOption]::SendToRecycleBin
      )
      $log += "OK   $t"
      $ok++
    } catch {
      $log += "FAIL $t :: $($_.Exception.Message)"
      $fail++
    }
  } else {
    $log += "SKIP $t (不存在)"
  }
}

$log += ""
$log += "成功 $ok / 失败 $fail"

# 空目录检查
foreach ($d in @('chat', 'home')) {
  $dp = Join-Path $root $d
  if (Test-Path -LiteralPath $dp) {
    $rest = Get-ChildItem -LiteralPath $dp -Force
    $log += "目录 static\$d 剩余 $($rest.Count) 个文件"
    foreach ($r in $rest) { $log += "  剩余: $d\$($r.Name)" }
  }
}

$log += ""
$log += "=== static 剩余内容 ==="
Get-ChildItem -LiteralPath $root -Recurse -Force | ForEach-Object {
  $rel = $_.FullName.Replace($root, '')
  $log += "$rel  ($($_.Length) bytes)"
}

$out = 'E:\3_WorkSpace\MiniProgram\.workbuddy\_cleanup-log.txt'
$log -join "`r`n" | Set-Content -LiteralPath $out -Encoding UTF8
Write-Output "DONE ok=$ok fail=$fail"
