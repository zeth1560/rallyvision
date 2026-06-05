$repoRoot = Resolve-Path (Join-Path $PSScriptRoot '..')
$envFile = Join-Path $repoRoot '.env.local'
if (-not (Test-Path $envFile)) {
    Write-Error "Missing .env.local file at $envFile"
    exit 1
}
$lines = Get-Content $envFile | Where-Object { $_ -and $_ -notmatch '^#' }
$map = @{}
foreach ($line in $lines) {
    $parts = $line -split '=', 2
    if ($parts.Count -eq 2) {
        $map[$parts[0]] = $parts[1]
    }
}
$map['NEXT_PUBLIC_BASE_URL'] = 'https://www.replaytrove.com'
$keys = @(
    'NEXT_PUBLIC_SUPABASE_URL',
    'NEXT_PUBLIC_SUPABASE_ANON_KEY',
    'SUPABASE_SERVICE_ROLE_KEY',
    'STRIPE_SECRET_KEY',
    'STRIPE_WEBHOOK_SECRET',
    'AWS_ACCESS_KEY_ID',
    'AWS_SECRET_ACCESS_KEY',
    'AWS_REGION',
    'AWS_S3_BUCKET',
    'NEXT_PUBLIC_BASE_URL',
    'RESEND_API_KEY',
    'EMAIL_FROM',
    'PLAYERTROVE_TOKEN_SECRET'
)
foreach ($name in $keys) {
    if ($map.ContainsKey($name) -and $map[$name]) {
        $map[$name] | npx vercel env add $name production --yes
    }
}
