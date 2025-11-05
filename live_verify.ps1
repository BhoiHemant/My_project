param(
  [string]$BACK = 'https://vaidya-ihc9.onrender.com',
  [string]$FRONT = 'https://zippy-faloodeh-005105.netlify.app/'
)

try { [Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12 } catch {}

function GetJson($url, $headers=@{}) {
  try {
    $resp = Invoke-WebRequest -Method GET -Uri $url -Headers $headers -UseBasicParsing -TimeoutSec 30
    $body = $null
    if ($resp.Content) {
      try { $body = $resp.Content | ConvertFrom-Json } catch { $body = $resp.Content }
    }
    return @{ status=[int]$resp.StatusCode; body=$body }
  } catch {
    $st = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    return @{ status=$st; err=$_.Exception.Message }
  }
}
function PostJson($url, $obj, $headers=@{}) {
  try {
    $h = @{ 'Content-Type'='application/json' }
    foreach($k in $headers.Keys){ $h[$k]=$headers[$k] }
    $json = $obj | ConvertTo-Json -Depth 8
    $resp = Invoke-WebRequest -Method POST -Uri $url -Headers $h -Body $json -UseBasicParsing -TimeoutSec 30
    $body = $null
    if ($resp.Content) {
      try { $body = $resp.Content | ConvertFrom-Json } catch { $body = $resp.Content }
    }
    return @{ status=[int]$resp.StatusCode; body=$body }
  } catch {
    $st = try { [int]$_.Exception.Response.StatusCode } catch { 0 }
    return @{ status=$st; err=$_.Exception.Message }
  }
}

$report = [ordered]@{}
$timestamp = [int][double]::Parse((Get-Date -UFormat %s))

# STEP 1 — Health Check
$health = GetJson "$BACK/health"
$report['health_status'] = $health.status
$report['health_body'] = $health.body
$report['health_err'] = $health.err

# STEP 2 — Signup/Login Flow
$patEmail = "patient_live_$timestamp@mail.com"
$docEmail = "doctor_live_$timestamp@mail.com"
$pwd = 'secret123'

$patSignup = PostJson "$BACK/auth/signup" @{ name='Live Patient'; email=$patEmail; password=$pwd; role='patient' }
$docSignup = PostJson "$BACK/auth/signup" @{ name='Live Doctor'; email=$docEmail; password=$pwd; role='doctor' }
$report['patient_signup_status'] = $patSignup.status
$report['doctor_signup_status']  = $docSignup.status
$report['patient_signup_err'] = $patSignup.err
$report['doctor_signup_err']  = $docSignup.err
$patToken = if ($patSignup.body.token) { $patSignup.body.token } else { $null }
$docToken = if ($docSignup.body.token) { $docSignup.body.token } else { $null }
$patUser  = $patSignup.body.user
$docUser  = $docSignup.body.user
$report['patient_role'] = if ($patUser) { $patUser.role } else { $null }
$report['doctor_role']  = if ($docUser) { $docUser.role } else { $null }

# Login to confirm
$patLogin = PostJson "$BACK/auth/login" @{ email=$patEmail; password=$pwd }
$docLogin = PostJson "$BACK/auth/login" @{ email=$docEmail; password=$pwd }
$report['patient_login_status'] = $patLogin.status
$report['doctor_login_status']  = $docLogin.status
$report['patient_login_err'] = $patLogin.err
$report['doctor_login_err']  = $docLogin.err
if (-not $patToken -and $patLogin.body.token) { $patToken = $patLogin.body.token }
if (-not $docToken -and $docLogin.body.token) { $docToken = $docLogin.body.token }

# STEP 3 — CRUD Verification (Billing)
$doctorId = if ($docUser -and $docUser.id) { [int]$docUser.id } else { if ($docLogin.body.user.id) { [int]$docLogin.body.user.id } else { 0 } }
$headersDoc = if ($docToken) { @{ 'Authorization' = "Bearer $docToken" } } else { @{} }
$headersPat = if ($patToken) { @{ 'Authorization' = "Bearer $patToken" } } else { @{} }

$billAdd = PostJson "$BACK/billing/add" @{ doctor_id=$doctorId; patient_name='Live Test'; amount=123.45; notes='Live verification' } $headersDoc
$report['billing_add_status'] = $billAdd.status
$report['billing_add_err'] = $billAdd.err

$billListDoc = GetJson "$BACK/billing/doctor/$doctorId" $headersDoc
$report['billing_list_doc_status'] = $billListDoc.status
$report['billing_list_doc_err'] = $billListDoc.err

$billListPat = GetJson "$BACK/billing/doctor/$doctorId" $headersPat
$report['billing_list_pat_status'] = $billListPat.status
$report['billing_list_pat_err'] = $billListPat.err

# STEP 4 — Frontend Integration Check
$frontHome = GetJson $FRONT
$report['frontend_home_status'] = $frontHome.status
$metaOk = $false
if ($frontHome.status -eq 200 -and ($frontHome.body -is [string])) {
  if ($frontHome.body -match '<meta[^>]*name="api-base"[^>]*content="([^"]+)"') {
    $val = $Matches[1]
    $report['frontend_meta_api_base'] = $val
    if ($val -eq $BACK) { $metaOk = $true }
  }
}
$report['frontend_meta_matches_backend'] = $metaOk

$mainJs = GetJson (("$FRONT".TrimEnd('/')) + '/js/main.js')
$report['frontend_mainjs_status'] = $mainJs.status
$apiBaseInJs = $false
if ($mainJs.status -eq 200 -and ($mainJs.body -is [string])) {
  if ($mainJs.body -match "const\s+API_BASE\s*=.*$BACK") { $apiBaseInJs = $true }
}
$report['frontend_mainjs_api_base_present'] = $apiBaseInJs

# STEP 5 — Deployment Health Report
$okHealth = ($report['health_status'] -eq 200 -and $report['health_body'] -and $report['health_body'].status -eq 'ok')
$okSignup = ($report['patient_signup_status'] -in 200,201) -and ($report['doctor_signup_status'] -in 200,201)
$okLogin  = ($report['patient_login_status'] -eq 200) -and ($report['doctor_login_status'] -eq 200)
$okBilling = ($report['billing_add_status'] -in 200,201) -and ($report['billing_list_doc_status'] -eq 200) -and ($report['billing_list_pat_status'] -eq 403)
$okFront = ($report['frontend_home_status'] -eq 200) -and $report['frontend_meta_matches_backend'] -and $report['frontend_mainjs_api_base_present']
$allOk = $okHealth -and $okSignup -and $okLogin -and $okBilling -and $okFront

$sHealth = if ($okHealth) { 'OK' } else { 'FAIL' }
$sSignup = if ($okSignup) { 'OK' } else { 'FAIL' }
$sLogin  = if ($okLogin)  { 'OK' } else { 'FAIL' }
$sBill   = if ($okBilling){ 'OK' } else { 'FAIL' }
$sFront  = if ($okFront)  { 'OK' } else { 'FAIL' }

Write-Host '--- Live Deployment Verification Report ---'
Write-Host ("Backend Health:          " + $sHealth)
Write-Host ("Signup (patient/doctor): " + $sSignup)
Write-Host ("Login (patient/doctor):  " + $sLogin)
Write-Host ("Billing (CRUD+403):      " + $sBill)
Write-Host ("Frontend (meta+JS):      " + $sFront)
Write-Host ''
Write-Host ('Details: ' + ($report | ConvertTo-Json -Depth 6))
Write-Host ''
if ($allOk) { Write-Host '✅ FULL LIVE DEPLOYMENT SUCCESSFUL' } else { Write-Host '❌ Deployment Needs Fixes (see details above)' }
