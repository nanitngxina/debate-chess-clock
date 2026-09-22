param(
  [string]$BaseUrl = 'http://127.0.0.1:8787'
)

# 账号系统端到端冒烟测试
#
# 用法（先确保 Worker 已经跑起来）：
#   powershell -File scripts/smoke-test-auth.ps1
#   powershell -File scripts/smoke-test-auth.ps1 -BaseUrl https://你的域名
#
# 会用「开发模式」返回的验证码跑完整个流程，因此需要 .dev.vars 里有
# ENABLE_DEV_OUTBOX=true（线上跑这个脚本时不会有 devCode，验证步骤会失败）。

$ErrorActionPreference = 'Stop'
$base = $BaseUrl.TrimEnd('/')
$script:pass = 0
$script:fail = 0

function Read-ResponseText($resp) {
  $stream = $resp.RawContentStream
  $stream.Position = 0
  $reader = New-Object System.IO.StreamReader($stream, [System.Text.Encoding]::UTF8)
  return $reader.ReadToEnd()
}

function Call-Api {
  param(
    [string]$Method,
    [string]$Path,
    $Body,
    [string]$Token
  )

  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }
  # 用独立的来源 IP 隔离限流桶，避免多轮测试互相干扰
  if ($script:clientIp) { $headers['X-Forwarded-For'] = $script:clientIp }

  $params = @{
    Uri             = "$base$Path"
    Method          = $Method
    Headers         = $headers
    UseBasicParsing = $true
  }

  if ($null -ne $Body) {
    $json = $Body | ConvertTo-Json -Compress
    $params['Body'] = [System.Text.Encoding]::UTF8.GetBytes($json)
    $params['ContentType'] = 'application/json; charset=utf-8'
  }

  try {
    $resp = Invoke-WebRequest @params
    $text = Read-ResponseText $resp
    return [pscustomobject]@{
      Status = [int]$resp.StatusCode
      Text   = $text
      Data   = if ($text) { $text | ConvertFrom-Json } else { $null }
    }
  } catch {
    $r = $_.Exception.Response
    if (-not $r) { throw }
    $status = [int]$r.StatusCode
    $text = $_.ErrorDetails.Message
    if (-not $text) {
      $sr = New-Object System.IO.StreamReader($r.GetResponseStream(), [System.Text.Encoding]::UTF8)
      $text = $sr.ReadToEnd()
    }
    return [pscustomobject]@{
      Status = $status
      Text   = $text
      Data   = if ($text) { $text | ConvertFrom-Json } else { $null }
    }
  }
}

function Check {
  param([string]$Name, [bool]$Ok, [string]$Detail = '')
  if ($Ok) {
    $script:pass++
    Write-Output ("PASS  {0}" -f $Name)
  } else {
    $script:fail++
    Write-Output ("FAIL  {0}  {1}" -f $Name, $Detail)
  }
}

$stamp = [DateTime]::Now.ToString('HHmmss')
$script:clientIp = "203.0.113.$((Get-Random -Minimum 2 -Maximum 250))"
$email = "tester$stamp@example.com"
$password = 'Debate12345'
$newPassword = 'Debate67890'

Write-Output "=== 1. register ($email) ==="
$reg = Call-Api -Method POST -Path '/api/auth/register' -Body @{
  email       = $email
  password    = $password
  displayName = '测试选手'
}
Write-Output ("  status={0}" -f $reg.Status)
Check 'register returns 200' ($reg.Status -eq 200) $reg.Text
Check 'register issues token' ([bool]$reg.Data.token)
Check 'register returns devCode (dev email mode)' ([bool]$reg.Data.devCode)
Check 'displayName round-trips' ($reg.Data.account.displayName -eq '测试选手') $reg.Data.account.displayName
Check 'emailVerified starts false' ($reg.Data.account.emailVerified -eq $false)

$token = $reg.Data.token
$devCode = $reg.Data.devCode

Write-Output "=== 2. duplicate register should be 409 ==="
$dup = Call-Api -Method POST -Path '/api/auth/register' -Body @{
  email       = $email
  password    = $password
  displayName = 'duplicate'
}
Write-Output ("  status={0} body={1}" -f $dup.Status, $dup.Text)
Check 'duplicate email rejected with 409' ($dup.Status -eq 409) $dup.Text

Write-Output "=== 3. verify email with wrong code ==="
$badCode = Call-Api -Method POST -Path '/api/auth/email/verify' -Token $token -Body @{ code = '000000' }
Write-Output ("  status={0} body={1}" -f $badCode.Status, $badCode.Text)
Check 'wrong code rejected' ($badCode.Status -eq 400) $badCode.Text

Write-Output "=== 4. verify email with real code ==="
$verify = Call-Api -Method POST -Path '/api/auth/email/verify' -Token $token -Body @{ code = $devCode }
Write-Output ("  status={0}" -f $verify.Status)
Check 'verify succeeds' ($verify.Status -eq 200) $verify.Text
Check 'emailVerified now true' ($verify.Data.account.emailVerified -eq $true)

Write-Output "=== 5. me ==="
$me = Call-Api -Method GET -Path '/api/auth/me' -Token $token
Check 'me returns account' ($me.Status -eq 200 -and $me.Data.account.email -eq $email) $me.Text

Write-Output "=== 6. wrong password login ==="
$badLogin = Call-Api -Method POST -Path '/api/auth/login' -Body @{ email = $email; password = 'WrongPass123' }
Write-Output ("  status={0} body={1}" -f $badLogin.Status, $badLogin.Text)
Check 'wrong password rejected with 401' ($badLogin.Status -eq 401) $badLogin.Text

Write-Output "=== 7. unknown email login (should not leak) ==="
$ghost = Call-Api -Method POST -Path '/api/auth/login' -Body @{ email = "nobody$stamp@example.com"; password = $password }
Write-Output ("  status={0} body={1}" -f $ghost.Status, $ghost.Text)
Check 'unknown email rejected with same 401' ($ghost.Status -eq 401) $ghost.Text

Write-Output "=== 8. correct login ==="
$login = Call-Api -Method POST -Path '/api/auth/login' -Body @{ email = $email; password = $password }
Check 'login succeeds' ($login.Status -eq 200 -and [bool]$login.Data.token) $login.Text
$token2 = $login.Data.token

Write-Output "=== 9. update profile ==="
$profile = Call-Api -Method PATCH -Path '/api/auth/profile' -Token $token2 -Body @{
  displayName = '改名后的选手'
  avatarUrl   = ''
}
Check 'profile updated' ($profile.Status -eq 200 -and $profile.Data.account.displayName -eq '改名后的选手') $profile.Text

Write-Output "=== 10. change password (should revoke OTHER sessions) ==="
$change = Call-Api -Method POST -Path '/api/auth/password' -Token $token2 -Body @{
  currentPassword = $password
  newPassword     = $newPassword
}
Check 'password changed' ($change.Status -eq 200) $change.Text

$oldSession = Call-Api -Method GET -Path '/api/auth/me' -Token $token
Check 'previous session revoked' ($oldSession.Status -eq 401) $oldSession.Text

$keptSession = Call-Api -Method GET -Path '/api/auth/me' -Token $token2
Check 'current session still valid' ($keptSession.Status -eq 200) $keptSession.Text

Write-Output "=== 11. login with new password ==="
$login2 = Call-Api -Method POST -Path '/api/auth/login' -Body @{ email = $email; password = $newPassword }
Check 'login with new password works' ($login2.Status -eq 200) $login2.Text

Write-Output "=== 12. forgot password ==="
$forgot = Call-Api -Method POST -Path '/api/auth/password/forgot' -Body @{ email = $email }
Write-Output ("  status={0}" -f $forgot.Status)
Check 'forgot returns generic ok' ($forgot.Status -eq 200 -and $forgot.Data.ok -eq $true) $forgot.Text
Check 'forgot returns devCode' ([bool]$forgot.Data.devCode)

$forgotGhost = Call-Api -Method POST -Path '/api/auth/password/forgot' -Body @{ email = "nobody$stamp@example.com" }
Check 'forgot does not leak unknown email' ($forgotGhost.Status -eq 200 -and -not $forgotGhost.Data.devCode) $forgotGhost.Text

Write-Output "=== 13. reset password ==="
$resetPassword = 'Debate24680'
$reset = Call-Api -Method POST -Path '/api/auth/password/reset' -Body @{
  email       = $email
  code        = $forgot.Data.devCode
  newPassword = $resetPassword
}
Check 'reset succeeds' ($reset.Status -eq 200) $reset.Text

$login3 = Call-Api -Method POST -Path '/api/auth/login' -Body @{ email = $email; password = $resetPassword }
Check 'login with reset password works' ($login3.Status -eq 200) $login3.Text

$loginOld = Call-Api -Method POST -Path '/api/auth/login' -Body @{ email = $email; password = $newPassword }
Check 'old password no longer works' ($loginOld.Status -eq 401) $loginOld.Text

Write-Output "=== 14. logout ==="
$token3 = $login3.Data.token
$logout = Call-Api -Method POST -Path '/api/auth/logout' -Token $token3
Check 'logout returns ok' ($logout.Status -eq 200) $logout.Text
$afterLogout = Call-Api -Method GET -Path '/api/auth/me' -Token $token3
Check 'logout really revokes token' ($afterLogout.Status -eq 401) $afterLogout.Text

Write-Output "=== 15. weak password rejected ==="
$weak = Call-Api -Method POST -Path '/api/auth/register' -Body @{
  email       = "weak$stamp@example.com"
  password    = 'abc'
  displayName = 'weak'
}
Check 'weak password rejected' ($weak.Status -eq 400) $weak.Text

Write-Output "=== 16. invalid email rejected ==="
$badMail = Call-Api -Method POST -Path '/api/auth/register' -Body @{
  email       = 'not-an-email'
  password    = $password
  displayName = 'x'
}
Check 'invalid email rejected' ($badMail.Status -eq 400) $badMail.Text

Write-Output "=== 17. dev outbox ==="
$outbox = Call-Api -Method GET -Path '/api/dev/outbox'
Check 'dev outbox readable locally' ($outbox.Status -eq 200) $outbox.Text
if ($outbox.Status -eq 200) {
  Check 'outbox has our emails' ($outbox.Data.emails.Count -ge 3) ([string]$outbox.Data.emails.Count)
}

Write-Output ''
Write-Output ("===== PASS {0} / FAIL {1} =====" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 }
