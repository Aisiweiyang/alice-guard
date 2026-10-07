[CmdletBinding()]
param()

$ErrorActionPreference = 'Stop'
$guardRoot = Split-Path $PSScriptRoot -Parent
Push-Location $guardRoot
try {
    $guardStatus = @(& git status --porcelain)
    if ($LASTEXITCODE -ne 0 -or $guardStatus.Count -ne 0) {
        throw 'Commit or preserve local changes before building a delivery from HEAD.'
    }
    $guardCommit = (& git rev-parse HEAD).Trim()
    if ($LASTEXITCODE -ne 0 -or $guardCommit -notmatch '^[0-9a-f]{40}$') { throw 'Cannot identify source commit.' }
    $guardFiles = @(& git ls-tree -r --name-only HEAD)
    if ($LASTEXITCODE -ne 0) { throw 'Cannot inventory committed source.' }
    foreach ($guardFile in $guardFiles) {
        if (($guardFile -match '(^|/)\.env($|\.)' -and $guardFile -ne '.env.example') -or
            $guardFile -match '^(node_modules|demo-output|delivery|data|\.git)/' -or
            $guardFile -match '\.(sqlite|db)(-|$)') {
            throw 'Committed source contains a file outside the delivery boundary.'
        }
    }

    $guardId = $guardCommit.Substring(0, 8) + '-' + [DateTime]::UtcNow.ToString('yyyyMMddTHHmmssZ')
    $guardLogs = Join-Path $guardRoot ('demo-output/delivery-' + $guardId)
    New-Item -ItemType Directory -Path $guardLogs | Out-Null

    function Invoke-OfflineCommand([string]$Name, [string[]]$Arguments) {
        Write-Host ('Running ' + $Name + ' ...')
        $guardOutput = @(& npm.cmd @Arguments 2>&1)
        $guardExit = $LASTEXITCODE
        $guardText = ($guardOutput | ForEach-Object { $_.ToString() }) -join "`n"
        [IO.File]::WriteAllText((Join-Path $guardLogs ($Name + '.log')), $guardText, [Text.UTF8Encoding]::new($false))
        if ($guardExit -ne 0) { throw ($Name + ' failed; inspect its local log. No delivery was produced.') }
        Write-Host ($Name + ' passed.')
        return $guardText
    }

    function Read-CommandJson([string]$Text) {
        $guardStart = $Text.IndexOf('{')
        if ($guardStart -lt 0) { throw 'Expected structured command output.' }
        return ($Text.Substring($guardStart) | ConvertFrom-Json)
    }

    $null = Invoke-OfflineCommand 'typecheck' @('run', 'check')
    $null = & node --check src/ui/app.js
    if ($LASTEXITCODE -ne 0) { throw 'Browser JavaScript syntax check failed.' }
    $guardTests = Invoke-OfflineCommand 'tests' @('test')
    $guardTestMatch = [regex]::Match($guardTests, 'Test Files\s+(\d+) passed \((\d+)\).*?Tests\s+(\d+) passed \((\d+)\)', 'Singleline')
    if (-not $guardTestMatch.Success -or $guardTestMatch.Groups[1].Value -ne $guardTestMatch.Groups[2].Value -or
        $guardTestMatch.Groups[3].Value -ne $guardTestMatch.Groups[4].Value) { throw 'Cannot confirm complete test results.' }

    $guardAttack = Read-CommandJson (Invoke-OfflineCommand 'attacks' @('run', 'test:attacks'))
    if (-not $guardAttack.allPassed -or $guardAttack.falseAllowCount -ne 0 -or $guardAttack.falseDenyCount -ne 0 -or
        $guardAttack.repeatCount -ne 100 -or $guardAttack.deterministicMatchCount -ne $guardAttack.deterministicComparisonCount) {
        throw 'Attack regression acceptance failed.'
    }
    $guardExport = Read-CommandJson (Invoke-OfflineCommand 'export' @('run', 'evidence:judge'))
    if ($guardExport.status -ne 'EXPORTED' -or $guardExport.selfCheck -ne 'VERIFIED') { throw 'Evidence export failed.' }
    $guardEvidencePath = [IO.Path]::GetFullPath($guardExport.outputPath)
    $guardOutputPrefix = [IO.Path]::GetFullPath((Join-Path $guardRoot 'demo-output')) + [IO.Path]::DirectorySeparatorChar
    if (-not $guardEvidencePath.StartsWith($guardOutputPrefix, [StringComparison]::OrdinalIgnoreCase)) { throw 'Evidence path is outside demo-output.' }
    $guardVerify = Read-CommandJson (Invoke-OfflineCommand 'verify' @('run', 'evidence:judge:verify', '--', $guardEvidencePath))
    if ($guardVerify.status -ne 'VERIFIED' -or $guardVerify.executionAuthorized -ne $false) { throw 'Evidence verification failed.' }
    if (@(& git status --porcelain).Count -ne 0 -or (& git rev-parse HEAD).Trim() -ne $guardCommit) {
        throw 'Source changed while validating; rebuild from a stable commit.'
    }

    $guardDeliveryRoot = Join-Path $guardRoot 'delivery'
    $guardFolder = Join-Path $guardDeliveryRoot ('alice-guard-' + $guardId)
    New-Item -ItemType Directory -Path $guardFolder -Force | Out-Null
    $guardSourceZip = Join-Path $guardFolder 'source.zip'
    & git archive --format=zip ('--output=' + $guardSourceZip) HEAD
    if ($LASTEXITCODE -ne 0) { throw 'Source archive failed.' }
    Copy-Item -LiteralPath $guardEvidencePath -Destination (Join-Path $guardFolder 'judge-evidence.json')
    $guardAttack | ConvertTo-Json -Depth 30 | Set-Content -LiteralPath (Join-Path $guardFolder 'attack-regression.json') -Encoding utf8
    $guardValidation = [ordered]@{
        schemaVersion = 'alice-guard.delivery.v1'
        sourceCommit = $guardCommit
        createdAtUtc = [DateTime]::UtcNow.ToString('o')
        nodeVersion = (& node --version).Trim()
        typeScript = 'PASS'
        browserJavaScriptSyntax = 'PASS'
        tests = @{files = [int]$guardTestMatch.Groups[1].Value; passed = [int]$guardTestMatch.Groups[3].Value; exitCode = 0}
        attackRegression = ($guardAttack | Select-Object caseCount, repeatCount, deterministicComparisonCount, deterministicMatchCount, falseAllowCount, falseDenyCount, allPassed)
        judgeEvidence = $guardVerify
        attestation = 'UNATTESTED'
        scope = 'OFFLINE_FIXTURE'
        walletExecutionPerformed = $false
        publicDeploymentVerified = $false
        contestSubmissionVerified = $false
    }
    $guardValidation | ConvertTo-Json -Depth 12 | Set-Content -LiteralPath (Join-Path $guardFolder 'VALIDATION.json') -Encoding utf8
    @"
Alice Guard offline competition delivery
Source commit: $guardCommit

1. Extract source.zip into a new folder. Install Node.js 22.5+ (validated with $($guardValidation.nodeVersion)).
2. Run: npx.cmd -y pnpm@11.19.0 install --frozen-lockfile
3. Run: npm.cmd run evidence:judge:verify -- "<absolute path to judge-evidence.json>"
4. Run: npm.cmd run demo:web
5. Open http://127.0.0.1:4187. Windows users can also double-click start-demo.cmd.

See source/docs/26-delivery-and-updates.md in the extracted source for updates and rollback.
The source archive contains committed files only. Credentials, databases, session history and node_modules are excluded.
All evidence is synthetic/offline and UNATTESTED. No signing, broadcast, funding or real trade is performed.
SHA256SUMS.txt detects file changes; it is not a publisher signature or security certification.
Online deployment, video and final contest submission remain separate deliverables.
"@ | Set-Content -LiteralPath (Join-Path $guardFolder 'DELIVERY.txt') -Encoding utf8
    $guardChecksums = foreach ($guardFile in Get-ChildItem -LiteralPath $guardFolder -File | Sort-Object Name) {
        (Get-FileHash -LiteralPath $guardFile.FullName -Algorithm SHA256).Hash.ToLowerInvariant() + '  ' + $guardFile.Name
    }
    $guardChecksums | Set-Content -LiteralPath (Join-Path $guardFolder 'SHA256SUMS.txt') -Encoding ascii
    $guardZip = $guardFolder + '.zip'
    Compress-Archive -LiteralPath $guardFolder -DestinationPath $guardZip
    Write-Host ('Delivery ready: ' + $guardZip)
    Write-Host ('SHA256: ' + (Get-FileHash -LiteralPath $guardZip -Algorithm SHA256).Hash.ToLowerInvariant())
} finally {
    Pop-Location
}
