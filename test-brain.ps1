$token = $env:GITHUB_TOKEN
$body = Get-Content 'body.json' -Raw

$headers = @{
    'Content-Type'  = 'application/json'
    'Authorization' = "Bearer $token"
}

try {
    $response = Invoke-WebRequest `
        -Method POST `
        -Uri 'https://models.inference.ai.azure.com/chat/completions' `
        -Headers $headers `
        -Body $body `
        -ErrorAction Stop

    $json = $response.Content | ConvertFrom-Json
    $raw = $json.choices[0].message.content
    Write-Host ""
    Write-Host "=== BRAIN DECISION ==="
    Write-Host $raw
    Write-Host ""
    Write-Host "Model: $($json.model)"
    Write-Host "Tokens used: $($json.usage.total_tokens)"
} catch {
    Write-Host "ERROR: $($_.Exception.Message)"
    if ($_.Exception.Response) {
        $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
        $respBody = $reader.ReadToEnd()
        Write-Host "Response Body: $respBody"
    }
}
