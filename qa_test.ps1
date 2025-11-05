$ErrorActionPreference = 'Stop'
$start = Get-Date
$base = 'http://localhost:5000'

function GetApi($path, $token) {
  $headers = @{}
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  try {
    $resp = Invoke-WebRequest -Method GET -Uri ($base + $path) -Headers $headers -UseBasicParsing
    return @{ status = [int]$resp.StatusCode; body = if ($resp.Content) { try { $resp.Content | ConvertFrom-Json } catch { $null } } else { $null } }
  } catch {
    $status = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    return @{ status = $status; body = $null; err = $_.Exception.Message }
  }
}
function PostApi($path, $bodyObj, $token) {
  $headers = @{ 'Content-Type'='application/json' }
  if ($token) { $headers['Authorization'] = "Bearer $token" }
  $body = ($bodyObj | ConvertTo-Json -Depth 7)
  try {
    $resp = Invoke-WebRequest -Method POST -Uri ($base + $path) -Headers $headers -Body $body -UseBasicParsing
    return @{ status = [int]$resp.StatusCode; body = if ($resp.Content) { try { $resp.Content | ConvertFrom-Json } catch { $null } } else { $null } }
  } catch {
    $status = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    return @{ status = $status; body = $null; err = $_.Exception.Message }
  }
}

$results = @()

# Health
$r = GetApi '/health' $null; $results += [pscustomobject]@{Step='GET /health'; Status=$r.status; Pass=($r.status -eq 200 -and $r.body.status -eq 'ok'); Notes=($r.err)}

# Signups
$ts = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
$ptEmail = "pt_$ts@1.com"; $drEmail = "dr_$ts@1.com"; $pwd='test1234'
$sp = PostApi '/signup' @{ name='QA Patient'; email=$ptEmail; password=$pwd; role='patient' } $null; $results += [pscustomobject]@{Step='POST /signup (patient)'; Status=$sp.status; Pass=($sp.status -in 200,201 -and $sp.body.token); Notes=$sp.err}
$sd = PostApi '/signup' @{ name='QA Doctor'; email=$drEmail; password=$pwd; role='doctor' } $null; $results += [pscustomobject]@{Step='POST /signup (doctor)'; Status=$sd.status; Pass=($sd.status -in 200,201 -and $sd.body.token); Notes=$sd.err}

# Logins
$lp = PostApi '/login' @{ email=$ptEmail; password=$pwd } $null; $ptTok = $lp.body.token; $results += [pscustomobject]@{Step='POST /login (patient)'; Status=$lp.status; Pass=($lp.status -eq 200 -and $ptTok); Notes=$lp.err}
$ld = PostApi '/login' @{ email=$drEmail; password=$pwd } $null; $drTok = $ld.body.token; $drId = $ld.body.user.id; $results += [pscustomobject]@{Step='POST /login (doctor)'; Status=$ld.status; Pass=($ld.status -eq 200 -and $drTok -and $ld.body.user.role -eq 'doctor'); Notes=$ld.err}

# Doctor billing
$gbd = GetApi ("/billing/doctor/$drId") $drTok; $results += [pscustomobject]@{Step='GET /billing/doctor/:id (doctor)'; Status=$gbd.status; Pass=($gbd.status -eq 200); Notes=$gbd.err}
$today = (Get-Date).ToString('yyyy-MM-dd')
$ab = PostApi '/billing/add' @{ doctor_id=$drId; patient_id=1; amount=1; date=$today } $drTok; $results += [pscustomobject]@{Step='POST /billing/add (doctor)'; Status=$ab.status; Pass=($ab.status -in 200,201 -and $ab.body.id); Notes=$ab.err}
$bs = GetApi '/billing/summary' $drTok; $results += [pscustomobject]@{Step='GET /billing/summary (doctor)'; Status=$bs.status; Pass=($bs.status -eq 200); Notes=$bs.err}

# Forbidden for patient
$p403 = GetApi ("/billing/doctor/$drId") $ptTok; $results += [pscustomobject]@{Step='GET /billing/doctor/:id (patient forbidden)'; Status=$p403.status; Pass=($p403.status -eq 403); Notes=$p403.err}

# Invalid token should 401
$inv = GetApi '/patients' 'Bearer.INVALID.TOKEN'; $results += [pscustomobject]@{Step='GET /patients (invalid token)'; Status=$inv.status; Pass=($inv.status -eq 401); Notes=$inv.err}

# Patients CRUD (auth any)
$pc = PostApi '/patients' @{ name='Test P'; age=28; gender='Other'; contact='N/A' } $ptTok; $results += [pscustomobject]@{Step='POST /patients (auth)'; Status=$pc.status; Pass=($pc.status -in 200,201 -and $pc.body.id); Notes=$pc.err}
$pl = GetApi '/patients' $ptTok; $results += [pscustomobject]@{Step='GET /patients (auth)'; Status=$pl.status; Pass=($pl.status -eq 200); Notes=$pl.err}

# Doctors CRUD (doctor only)
$dc = PostApi '/doctors' @{ name='Test D'; specialization='General'; contact='N/A' } $drTok; $results += [pscustomobject]@{Step='POST /doctors (doctor)'; Status=$dc.status; Pass=($dc.status -in 200,201 -and $dc.body.id); Notes=$dc.err}
$dl = GetApi '/doctors' $drTok; $results += [pscustomobject]@{Step='GET /doctors (doctor)'; Status=$dl.status; Pass=($dl.status -eq 200); Notes=$dl.err}

$end = Get-Date; $elapsed = [int]($end - $start).TotalSeconds
$passAll = -not ($results | Where-Object { -not $_.Pass })

$results | ForEach-Object { Write-Host ("$($_.Step)`t$($_.Status)`t$($_.Pass)`t$($_.Notes)") }
Write-Host ("RUNTIME_SEC`t$elapsed")
if ($passAll) { exit 0 } else { exit 2 }
