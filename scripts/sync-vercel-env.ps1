$targets = @('development', 'preview', 'production')
$lines = Get-Content .env.local
$vars = @()

foreach ($line in $lines) {
  $trim = $line.Trim()
  if ($trim -eq '' -or $trim.StartsWith('#')) { continue }

  $idx = $trim.IndexOf('=')
  if ($idx -le 0) { continue }

  $key = $trim.Substring(0, $idx).Trim()
  $value = $trim.Substring($idx + 1)

  if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
    $value = $value.Substring(1, $value.Length - 2)
  }

  $vars += [pscustomobject]@{ Key = $key; Value = $value }
}

foreach ($var in $vars) {
  foreach ($target in $targets) {
    $tmp = [System.IO.Path]::GetTempFileName()
    [System.IO.File]::WriteAllText($tmp, $var.Value)

    try {
      Get-Content $tmp -Raw | vercel env add $($var.Key) $target --force | Out-Null
      if ($LASTEXITCODE -eq 0) {
        Write-Output "OK $($var.Key) -> $target"
      } else {
        Write-Output "FAILED $($var.Key) -> $target"
      }
    } finally {
      Remove-Item $tmp -ErrorAction SilentlyContinue
    }
  }
}

Write-Output "SYNC_DONE $($vars.Count) variables"
