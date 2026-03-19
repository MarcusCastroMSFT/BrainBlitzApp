#!/usr/bin/env pwsh
# ─── Post-Provision Hook ──────────────────────────────────────────────────────
# Called automatically by `azd provision` after the Bicep template deploys.
# Sets GAME_SERVER_URL and APP_BASE_URL on the MCP Container App — these
# cannot be set in Bicep because the MCP app can't reference its own FQDN
# during creation (circular dependency).
#
# AZD exposes all Bicep outputs as environment variables prefixed with AZURE_
# or as-is if they match known conventions.

$ErrorActionPreference = "Stop"

# AZD populates these from Bicep outputs
$rgName       = $env:RESOURCE_GROUP_NAME
$mcpAppName   = $env:MCP_APP_NAME
$serverUrl    = $env:SERVER_URL     # https://<server-fqdn>
$mcpUrl       = $env:MCP_URL        # https://<mcp-fqdn>

if (-not $rgName -or -not $mcpAppName) {
    Write-Host "[SKIP] Skipping postprovision hook -- RESOURCE_GROUP_NAME or MCP_APP_NAME not set."
    Write-Host "    Run manually after first deploy:"
    Write-Host '    az containerapp update -n <mcp-app> -g <rg> --set-env-vars "GAME_SERVER_URL=https://<mcp-fqdn>" "APP_BASE_URL=https://<server-fqdn>"'
    exit 0
}

Write-Host "[INFO] Setting GAME_SERVER_URL=$mcpUrl and APP_BASE_URL=$serverUrl on $mcpAppName..."

az containerapp update `
    --name $mcpAppName `
    --resource-group $rgName `
    --set-env-vars "GAME_SERVER_URL=$mcpUrl" "APP_BASE_URL=$serverUrl" `
    --output none

if ($LASTEXITCODE -ne 0) {
    Write-Error "Failed to update MCP Container App environment variables."
    exit 1
}

Write-Host "[OK] MCP server environment variables updated successfully."
Write-Host "   GAME_SERVER_URL = $mcpUrl"
Write-Host "   APP_BASE_URL    = $serverUrl"
