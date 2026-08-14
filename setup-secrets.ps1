# Helper: setup-secrets.ps1
# Usage: run this in PowerShell to set env vars for the current session (development only)

$secretsPath = Join-Path $PSScriptRoot 'secrets\firebase-admin.json'
if (Test-Path $secretsPath) {
  Write-Host "Using Firebase key at: $secretsPath"
  $env:FIREBASE_KEY_PATH = $secretsPath
} else {
  Write-Warning "Firebase admin JSON not found at $secretsPath. Place your service-account JSON there or set FIREBASE_KEY_PATH manually."
}

Write-Host "Set your LiveKit and Gemini keys in this session (do NOT paste long-lived secrets into source files)."
Write-Host "Example (replace placeholders):"
Write-Host "  $env:LIVEKIT_API_KEY = 'your_livekit_key'"
Write-Host "  $env:LIVEKIT_API_SECRET = 'your_livekit_secret'"
Write-Host "  $env:LIVEKIT_URL = 'ws://localhost:7880'"
Write-Host "  $env:GEMINI_API_KEY = 'your_gemini_api_key'"

Write-Host "To persist these for your user (dev only), use setx commands."
