// ─── Brain Blitz — Main Deployment Template ──────────────────────────────────
// Subscription-scoped template that creates the resource group and delegates
// all application resources to the resources.bicep module.
//
// Architecture:
//   • Azure Container Apps Environment  — hosts both services
//   • Container App: server             — Express + Socket.io + React SPA
//   • Container App: mcp-server         — MCP protocol server
//   • Azure Container Registry          — private Docker image store
//   • Azure Cosmos DB (NoSQL, serverless) — quiz data (managed-identity RBAC)
//   • Azure Files (Storage Account)     — persistent storage for uploaded images
//   • Log Analytics Workspace           — centralised logging
//   • Entra ID Easy Auth (optional)     — Microsoft identity provider
//
// Deploy with AZD:  azd up
// Deploy with CLI:  az deployment sub create -l <region> -f infra/main.bicep -p infra/main.parameters.json

targetScope = 'subscription'

// ─── Parameters ──────────────────────────────────────────────────────────────

@description('Name of the AZD environment')
param environmentName string

@description('Primary location for all resources')
@metadata({azd: {type: 'location'}})
param location string

@description('Resource group name (defaults to rg-<environmentName>)')
param resourceGroupName string = ''

@description('Entra ID application (client) ID — leave empty to skip auth configuration')
param entraClientId string = ''

@description('Entra ID tenant ID — required when entraClientId is set')
param entraTenantId string = ''

@secure()
@description('Entra ID client secret — required when entraClientId is set')
param entraClientSecret string = ''

// ─── Variables ───────────────────────────────────────────────────────────────

var effectiveRgName = !empty(resourceGroupName) ? resourceGroupName : 'rg-${environmentName}'

// ─── Resource Group ──────────────────────────────────────────────────────────

resource rg 'Microsoft.Resources/resourceGroups@2024-03-01' = {
  name: effectiveRgName
  location: location
  tags: {
    'azd-env-name': environmentName
  }
}

// ─── All Application Resources ───────────────────────────────────────────────

module resources 'resources.bicep' = {
  scope: rg
  params: {
    environmentName: environmentName
    location: location
    cosmosLocation: 'northeurope'
    entraClientId: entraClientId
    entraTenantId: entraTenantId
    entraClientSecret: entraClientSecret
  }
}

// ─── Outputs (required by AZD) ───────────────────────────────────────────────

output RESOURCE_GROUP_ID string = rg.id
output RESOURCE_GROUP_NAME string = rg.name
output AZURE_CONTAINER_REGISTRY_ENDPOINT string = resources.outputs.containerRegistryEndpoint
output SERVER_URL string = 'https://${resources.outputs.serverFqdn}'
output MCP_URL string = 'https://${resources.outputs.mcpFqdn}'
output MCP_APP_NAME string = resources.outputs.mcpAppName
output SERVER_APP_NAME string = resources.outputs.serverAppName
