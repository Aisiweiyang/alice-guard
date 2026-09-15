[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Read-RequiredPublicValue {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][string]$ErrorCode
  )

  $value = (Read-Host -Prompt $Prompt).Trim()
  if ($value -notmatch $Pattern) {
    throw $ErrorCode
  }
  return $value
}

function Read-RequiredSecretValue {
  param(
    [Parameter(Mandatory = $true)][string]$Prompt,
    [Parameter(Mandatory = $true)][string]$Pattern,
    [Parameter(Mandatory = $true)][int]$MinimumLength,
    [Parameter(Mandatory = $true)][string]$ErrorCode
  )

  $secureValue = Read-Host -Prompt $Prompt -AsSecureString
  $pointer = [Runtime.InteropServices.Marshal]::SecureStringToBSTR($secureValue)
  try {
    $value = [Runtime.InteropServices.Marshal]::PtrToStringBSTR($pointer)
    if ($null -eq $value -or $value.Length -lt $MinimumLength -or $value -notmatch $Pattern) {
      throw $ErrorCode
    }
    return $value
  }
  finally {
    [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($pointer)
  }
}

$projectRoot = Split-Path -Parent $PSScriptRoot
$targetPath = Join-Path $projectRoot ".env.local"
$temporaryPath = "$targetPath.$([Guid]::NewGuid().ToString('N')).tmp"

if (Test-Path -LiteralPath $targetPath) {
  $confirmation = Read-Host -Prompt "Local Privy configuration already exists. Type OVERWRITE to replace it"
  if ($confirmation -cne "OVERWRITE") {
    Write-Host "Configuration unchanged."
    exit 0
  }
}

try {
  $appId = Read-RequiredPublicValue -Prompt "Privy App ID" -Pattern '^[A-Za-z0-9_-]{1,256}$' -ErrorCode "PRIVY_APP_ID_REJECTED"
  $authorizationKeyId = Read-RequiredPublicValue -Prompt "Privy Authorization Key ID" -Pattern '^[A-Za-z0-9]{24}$' -ErrorCode "PRIVY_AUTHORIZATION_KEY_ID_REJECTED"
  $appSecret = Read-RequiredSecretValue -Prompt "Privy App Secret (hidden)" -Pattern '^[A-Za-z0-9._~+/=:-]+$' -MinimumLength 16 -ErrorCode "PRIVY_APP_SECRET_REJECTED"
  $authorizationPrivateKey = Read-RequiredSecretValue -Prompt "Privy Authorization Private Key, base64 PKCS8 (hidden)" -Pattern '^[A-Za-z0-9+/]+={0,2}$' -MinimumLength 32 -ErrorCode "PRIVY_AUTHORIZATION_PRIVATE_KEY_REJECTED"

  $lines = @(
    "# Alice Guard local-only Privy configuration. Never commit or share this file."
    "ALICE_GUARD_WALLET_MODE=disabled"
    "PRIVY_APP_ID=$appId"
    "PRIVY_APP_SECRET=$appSecret"
    "PRIVY_AUTHORIZATION_KEY_ID=$authorizationKeyId"
    "PRIVY_AUTHORIZATION_PRIVATE_KEY=$authorizationPrivateKey"
  )
  [IO.File]::WriteAllLines($temporaryPath, $lines, [Text.UTF8Encoding]::new($false))

  $identity = [Security.Principal.WindowsIdentity]::GetCurrent().Name
  $acl = Get-Acl -LiteralPath $temporaryPath
  $acl.SetAccessRuleProtection($true, $false)
  $rule = [Security.AccessControl.FileSystemAccessRule]::new($identity, "FullControl", "Allow")
  $acl.SetAccessRule($rule)
  Set-Acl -LiteralPath $temporaryPath -AclObject $acl
  Move-Item -LiteralPath $temporaryPath -Destination $targetPath -Force

  Write-Host "Privy configuration saved locally with wallet mode disabled."
  Write-Host "No secret value was printed. Run: pnpm privy:wallet:plan"
}
catch {
  if (Test-Path -LiteralPath $temporaryPath) {
    Remove-Item -LiteralPath $temporaryPath -Force -ErrorAction SilentlyContinue
  }
  Write-Error "Privy local configuration failed safely. No secret value was printed."
  exit 1
}
finally {
  $appSecret = $null
  $authorizationPrivateKey = $null
}
