param(
  [string]$BaseUrl = 'http://127.0.0.1:8787'
)

# End-to-end smoke test for the account system
#
# Usage (start the Worker first):
#   powershell -File scripts/smoke-test-auth.ps1
#   powershell -File scripts/smoke-test-auth.ps1 -BaseUrl https://your-domain
#
# Drives the whole flow using codes from dev email mode, so .dev.vars must have
# ENABLE_DEV_OUTBOX=true. Production has no devCode, so the verify steps fail.
#
# NOTE: keep every comment in this file ASCII-only, and keep the UTF-8 BOM.
# Windows PowerShell 5.1 reads a BOM-less file as ANSI, and an odd-length run of
# Chinese bytes can swallow the following newline -- turning the next statement
# into comment text and silently disabling it. That is not hypothetical: it is
# exactly what broke the avatar assertions during development. The guard below
# warns if the BOM ever goes missing again.

$ErrorActionPreference = 'Stop'

if ($PSVersionTable.PSVersion.Major -lt 6 -and $MyInvocation.MyCommand.Path) {
  $scriptBytes = [System.IO.File]::ReadAllBytes($MyInvocation.MyCommand.Path)
  $hasBom = $scriptBytes.Length -ge 3 -and
    $scriptBytes[0] -eq 0xEF -and $scriptBytes[1] -eq 0xBB -and $scriptBytes[2] -eq 0xBF
  if (-not $hasBom) {
    Write-Warning ('{0} is missing its UTF-8 BOM; Chinese test data may be mis-decoded.' -f (Split-Path $MyInvocation.MyCommand.Path -Leaf))
  }
}

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
  # Use a distinct source IP so repeated runs do not share rate limit buckets
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

function Call-Upload {
  param(
    [string]$Path,
    [byte[]]$Bytes,
    [string]$FileName,
    [string]$ContentType,
    [string]$Token
  )

  # PowerShell 5.1 has no -Form, so build the multipart body by hand
  $boundary = [Guid]::NewGuid().ToString()
  $stream = New-Object System.IO.MemoryStream
  $head = [System.Text.Encoding]::UTF8.GetBytes(
    "--$boundary`r`nContent-Disposition: form-data; name=`"file`"; filename=`"$FileName`"`r`nContent-Type: $ContentType`r`n`r`n"
  )
  $stream.Write($head, 0, $head.Length)
  $stream.Write($Bytes, 0, $Bytes.Length)
  $tail = [System.Text.Encoding]::UTF8.GetBytes("`r`n--$boundary--`r`n")
  $stream.Write($tail, 0, $tail.Length)

  $headers = @{}
  if ($Token) { $headers['Authorization'] = "Bearer $Token" }

  try {
    $resp = Invoke-WebRequest -Uri "$base$Path" -Method POST -Body $stream.ToArray() `
      -ContentType "multipart/form-data; boundary=$boundary" -Headers $headers -UseBasicParsing
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
    return [pscustomobject]@{
      Status = $status
      Text   = $text
      Data   = if ($text) { $text | ConvertFrom-Json } else { $null }
    }
  }
}

function Get-Raw {
  param([string]$Path)

  try {
    $resp = Invoke-WebRequest -Uri "$base$Path" -UseBasicParsing
    return [pscustomobject]@{
      Status      = [int]$resp.StatusCode
      ContentType = [string]$resp.Headers['Content-Type']
      Length      = [int]$resp.RawContentLength
    }
  } catch {
    $r = $_.Exception.Response
    if (-not $r) { throw }
    return [pscustomobject]@{ Status = [int]$r.StatusCode; ContentType = ''; Length = 0 }
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

Write-Output "=== 18. avatar upload / serve / cleanup ==="
$login4 = Call-Api -Method POST -Path '/api/auth/login' -Body @{ email = $email; password = $resetPassword }
Check 'login for avatar tests' ($login4.Status -eq 200) $login4.Text
$token4 = $login4.Data.token

# A minimal valid 1x1 PNG
$png = [Convert]::FromBase64String('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==')

$upload = Call-Upload -Path '/api/auth/avatar' -Bytes $png -FileName 'a.png' -ContentType 'image/png' -Token $token4
Write-Output ("  status={0} body={1}" -f $upload.Status, $upload.Text)
Check 'avatar upload returns 200' ($upload.Status -eq 200) $upload.Text

$avatarUrl = $upload.Data.avatarUrl
Check 'avatar stored as a short R2 path' ([bool]($avatarUrl -like '/api/avatars/*')) $avatarUrl
Check 'avatar url is short, not a data url' ($avatarUrl.Length -lt 200 -and -not ($avatarUrl -like 'data:*')) $avatarUrl

$served = Get-Raw -Path $avatarUrl
Check 'uploaded avatar is served' ($served.Status -eq 200) ([string]$served.Status)
Check 'avatar served as image/png' ($served.ContentType -like '*image/png*') $served.ContentType

$saved = Call-Api -Method PATCH -Path '/api/auth/profile' -Token $token4 -Body @{
  displayName = '头像测试'
  avatarUrl   = $avatarUrl
}
Check 'profile keeps the R2 avatar url' ($saved.Data.account.avatarUrl -eq $avatarUrl) $saved.Text
Check 'account no longer stores a data url' (-not ($saved.Data.account.avatarUrl -like 'data:*')) $saved.Data.account.avatarUrl

# A former frontend bug submitted the local preview data URL as the avatar. It is
# over the inline limit: it must now be rejected outright, not silently cleared.
$hugeInline = 'data:image/jpeg;base64,' + ('A' * 8000)
$badAvatar = Call-Api -Method PATCH -Path '/api/auth/profile' -Token $token4 -Body @{
  displayName = '头像测试'
  avatarUrl   = $hugeInline
}
Write-Output ("  status={0} body={1}" -f $badAvatar.Status, $badAvatar.Text)
Check 'oversized inline avatar rejected, not silently cleared' ($badAvatar.Status -eq 400) $badAvatar.Text

$stillThere = Call-Api -Method GET -Path '/api/auth/me' -Token $token4
Check 'existing avatar survives the rejected update' ($stillThere.Data.account.avatarUrl -eq $avatarUrl) $stillThere.Text

# Non-image content must be rejected: the server sniffs magic bytes, not Content-Type.
$fake = [System.Text.Encoding]::UTF8.GetBytes('this is definitely not an image')
$rejected = Call-Upload -Path '/api/auth/avatar' -Bytes $fake -FileName 'fake.png' -ContentType 'image/png' -Token $token4
Write-Output ("  status={0} body={1}" -f $rejected.Status, $rejected.Text)
Check 'non-image rejected by magic bytes' ($rejected.Status -eq 400) $rejected.Text

$anon = Call-Upload -Path '/api/auth/avatar' -Bytes $png -FileName 'a.png' -ContentType 'image/png' -Token ''
Check 'anonymous upload rejected' ($anon.Status -eq 401) $anon.Text

# After clearing the avatar, the old R2 object should be gone
$cleared = Call-Api -Method PATCH -Path '/api/auth/profile' -Token $token4 -Body @{
  displayName = '头像测试'
  avatarUrl   = ''
}
Check 'avatar can be cleared' ($cleared.Status -eq 200 -and $cleared.Data.account.avatarUrl -eq '') $cleared.Text

$gone = Get-Raw -Path $avatarUrl
Check 'old avatar object deleted after change' ($gone.Status -eq 404) ([string]$gone.Status)

Write-Output ''
Write-Output ("===== PASS {0} / FAIL {1} =====" -f $script:pass, $script:fail)
if ($script:fail -gt 0) { exit 1 }
