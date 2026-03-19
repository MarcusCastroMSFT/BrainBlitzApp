// ─── Brain Blitz — Application Resources ─────────────────────────────────────
// Resource-group-scoped module containing all Azure resources for the
// Brain Blitz quiz platform.
//
// Naming convention (per AZD rules):
//   az{prefix}{resourceToken}   — max 32 characters, alphanumeric only
//   resourceToken = uniqueString(subscription, resourceGroup, location, env)

// ─── Parameters ──────────────────────────────────────────────────────────────

@description('Name of the AZD environment')
param environmentName string

@description('Primary location for all resources')
param location string = resourceGroup().location

@description('Location for Cosmos DB (may differ from primary if region has capacity issues)')
param cosmosLocation string = location

@description('Entra ID application (client) ID — leave empty to skip auth')
param entraClientId string = ''

@description('Entra ID tenant ID')
param entraTenantId string = ''

@secure()
@description('Entra ID client secret')
param entraClientSecret string = ''

// ─── Variables ───────────────────────────────────────────────────────────────

var resourceToken = uniqueString(subscription().id, resourceGroup().id, location, environmentName)
var enableAuth = !empty(entraClientId) && !empty(entraTenantId)

// ═══════════════════════════════════════════════════════════════════════════════
//  MONITORING
// ═══════════════════════════════════════════════════════════════════════════════

resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2023-09-01' = {
  name: 'azla${resourceToken}'
  location: location
  properties: {
    sku: { name: 'PerGB2018' }
    retentionInDays: 30
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTAINER REGISTRY
// ═══════════════════════════════════════════════════════════════════════════════

resource containerRegistry 'Microsoft.ContainerRegistry/registries@2023-07-01' = {
  name: 'azacr${resourceToken}'
  location: location
  sku: { name: 'Basic' }
  properties: {
    adminUserEnabled: false
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  MANAGED IDENTITY + ROLE ASSIGNMENTS
// ═══════════════════════════════════════════════════════════════════════════════

resource managedIdentity 'Microsoft.ManagedIdentity/userAssignedIdentities@2023-01-31' = {
  name: 'azid${resourceToken}'
  location: location
}

// AcrPull role (7f951dda-4ed3-4680-a7ca-43fe172d538d) lets container apps pull images
var acrPullRoleId = '7f951dda-4ed3-4680-a7ca-43fe172d538d'

resource acrPullRoleAssignment 'Microsoft.Authorization/roleAssignments@2022-04-01' = {
  name: guid(containerRegistry.id, managedIdentity.id, acrPullRoleId)
  scope: containerRegistry
  properties: {
    roleDefinitionId: subscriptionResourceId('Microsoft.Authorization/roleDefinitions', acrPullRoleId)
    principalId: managedIdentity.properties.principalId
    principalType: 'ServicePrincipal'
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  COSMOS DB (NoSQL — serverless)
// ═══════════════════════════════════════════════════════════════════════════════
// Single database + single container. Partition key = /id (quiz ID).
// Serverless capacity mode — pay-per-request, perfect for dev/hobby workload.
// Local auth (keys) is disabled; access is via Entra RBAC only.

resource cosmosAccount 'Microsoft.DocumentDB/databaseAccounts@2024-05-15' = {
  name: 'azcos${resourceToken}'
  location: cosmosLocation
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    locations: [
      {
        locationName: cosmosLocation
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    capabilities: [
      { name: 'EnableServerless' }
    ]
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    disableLocalAuth: true            // Managed Identity only — no keys
  }
}

resource cosmosDatabase 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2024-05-15' = {
  parent: cosmosAccount
  name: 'brain-blitz'
  properties: {
    resource: { id: 'brain-blitz' }
  }
}

resource cosmosContainer 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2024-05-15' = {
  parent: cosmosDatabase
  name: 'quizzes'
  properties: {
    resource: {
      id: 'quizzes'
      partitionKey: {
        paths: [ '/id' ]
        kind: 'Hash'
        version: 2
      }
    }
  }
}

// Cosmos DB Built-in Data Contributor role (read + write)
// Role definition ID: 00000000-0000-0000-0000-000000000002
resource cosmosDataContributorRole 'Microsoft.DocumentDB/databaseAccounts/sqlRoleAssignments@2024-05-15' = {
  parent: cosmosAccount
  name: guid(cosmosAccount.id, managedIdentity.id, 'cosmos-data-contributor')
  properties: {
    roleDefinitionId: '${cosmosAccount.id}/sqlRoleDefinitions/00000000-0000-0000-0000-000000000002'
    principalId: managedIdentity.properties.principalId
    scope: cosmosAccount.id
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  STORAGE ACCOUNT (Azure Files for uploaded images)
// ═══════════════════════════════════════════════════════════════════════════════
// NOTE: allowSharedKeyAccess is enabled because Azure Container Apps managed
// environment storage mounts currently require storage account keys.
// Public blob access is disabled — we only use Azure Files.

resource storageAccount 'Microsoft.Storage/storageAccounts@2023-05-01' = {
  name: 'azst${resourceToken}'
  location: location
  sku: { name: 'Standard_LRS' }
  kind: 'StorageV2'
  properties: {
    allowSharedKeyAccess: true        // Required for ACA Azure Files mounts
    allowBlobPublicAccess: false      // No public blob access needed
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
  }
}

resource fileService 'Microsoft.Storage/storageAccounts/fileServices@2023-05-01' = {
  parent: storageAccount
  name: 'default'
}

// Uploaded quiz images file share (5 GB)
resource uploadsShare 'Microsoft.Storage/storageAccounts/fileServices/shares@2023-05-01' = {
  parent: fileService
  name: 'brainblitz-uploads'
  properties: {
    shareQuota: 5
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTAINER APPS ENVIRONMENT
// ═══════════════════════════════════════════════════════════════════════════════

resource containerAppsEnv 'Microsoft.App/managedEnvironments@2024-03-01' = {
  name: 'azce${resourceToken}'
  location: location
  properties: {
    appLogsConfiguration: {
      destination: 'log-analytics'
      logAnalyticsConfiguration: {
        customerId: logAnalytics.properties.customerId
        sharedKey: logAnalytics.listKeys().primarySharedKey
      }
    }
  }
}

// Mount Azure Files shares into the environment so container apps can reference them
resource uploadsStorageMount 'Microsoft.App/managedEnvironments/storages@2024-03-01' = {
  parent: containerAppsEnv
  name: 'uploads-storage'
  properties: {
    azureFile: {
      accountName: storageAccount.name
      accountKey: storageAccount.listKeys().keys[0].value
      shareName: uploadsShare.name
      accessMode: 'ReadWrite'
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTAINER APP — GAME SERVER
// ═══════════════════════════════════════════════════════════════════════════════
// Hosts: Express.js REST API, Socket.io real-time game engine, React SPA (prod).
// Sticky sessions are enabled for WebSocket affinity.

resource serverApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'azcas${resourceToken}'
  location: location
  tags: {
    'azd-service-name': 'server'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      secrets: enableAuth ? [
        {
          name: 'microsoft-provider-authentication-secret'
          value: entraClientSecret
        }
      ] : []
      ingress: {
        external: true
        targetPort: 3001
        transport: 'http'
        stickySessions: {
          affinity: 'sticky'           // Required for Socket.io WebSocket connections
        }
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'server'
          // AZD replaces this placeholder image after building the Dockerfile
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.5')
            memory: '1Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'PORT', value: '3001' }
            { name: 'COSMOS_ENDPOINT', value: cosmosAccount.properties.documentEndpoint }
            { name: 'AZURE_CLIENT_ID', value: managedIdentity.properties.clientId }
          ]
          volumeMounts: [
            { volumeName: 'uploads-vol', mountPath: '/app/server/uploads' }
          ]
        }
      ]
      scale: {
        minReplicas: 1            // Keep at least 1 replica to preserve in-memory game sessions
        maxReplicas: 3
        rules: [
          {
            name: 'http-scaling'
            http: {
              metadata: {
                concurrentRequests: '50'
              }
            }
          }
        ]
      }
      volumes: [
        { name: 'uploads-vol', storageName: uploadsStorageMount.name, storageType: 'AzureFile' }
      ]
    }
  }
  dependsOn: [acrPullRoleAssignment]
}

// ═══════════════════════════════════════════════════════════════════════════════
//  CONTAINER APP — MCP SERVER
// ═══════════════════════════════════════════════════════════════════════════════
// Model Context Protocol server for AI assistant integrations.
// Proxies Socket.io traffic to the game server so widgets in iframes work
// through a single URL.

resource mcpApp 'Microsoft.App/containerApps@2024-03-01' = {
  name: 'azcam${resourceToken}'
  location: location
  tags: {
    'azd-service-name': 'mcp-server'
  }
  identity: {
    type: 'UserAssigned'
    userAssignedIdentities: {
      '${managedIdentity.id}': {}
    }
  }
  properties: {
    managedEnvironmentId: containerAppsEnv.id
    configuration: {
      activeRevisionsMode: 'Single'
      ingress: {
        external: true
        targetPort: 3002
        transport: 'http'
        corsPolicy: {
          allowedOrigins: ['*']
          allowedMethods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
          allowedHeaders: ['*']
        }
      }
      registries: [
        {
          server: containerRegistry.properties.loginServer
          identity: managedIdentity.id
        }
      ]
    }
    template: {
      containers: [
        {
          name: 'mcp-server'
          image: 'mcr.microsoft.com/azuredocs/containerapps-helloworld:latest'
          resources: {
            cpu: json('0.25')
            memory: '0.5Gi'
          }
          env: [
            { name: 'NODE_ENV', value: 'production' }
            { name: 'MCP_PORT', value: '3002' }
            { name: 'GAME_PORT', value: '3001' }
            // Within the same ACA environment, proxy Socket.io to the game server's FQDN
            { name: 'GAME_SERVER_PROXY_TARGET', value: 'https://${serverApp.properties.configuration.ingress.fqdn}' }
            { name: 'COSMOS_ENDPOINT', value: cosmosAccount.properties.documentEndpoint }
            { name: 'AZURE_CLIENT_ID', value: managedIdentity.properties.clientId }
            // GAME_SERVER_URL and APP_BASE_URL are set post-provisioning by the
            // postprovision hook (hooks/postprovision.ps1) because the MCP app
            // cannot reference its own FQDN during Bicep deployment.
            // GAME_SERVER_URL → https://<mcp-fqdn>  (widgets connect here for Socket.io)
            // APP_BASE_URL   → https://<server-fqdn> (links to the React SPA)
          ]
        }
      ]
      scale: {
        minReplicas: 1
        maxReplicas: 2
      }
    }
  }
  dependsOn: [acrPullRoleAssignment]
}

// ═══════════════════════════════════════════════════════════════════════════════
//  ENTRA ID AUTHENTICATION (Easy Auth) — OPTIONAL
// ═══════════════════════════════════════════════════════════════════════════════
// Deployed only when entraClientId is provided. Enables Microsoft Entra ID
// sign-in on the game server. The MCP server uses API-level auth (bearer tokens)
// and is not covered by Easy Auth.

resource serverAuthConfig 'Microsoft.App/containerApps/authConfigs@2024-03-01' = if (enableAuth) {
  parent: serverApp
  name: 'current'
  properties: {
    platform: {
      enabled: true
    }
    globalValidation: {
      unauthenticatedClientAction: 'RedirectToLoginPage'
    }
    identityProviders: {
      azureActiveDirectory: {
        registration: {
          clientId: entraClientId
          clientSecretSettingName: 'microsoft-provider-authentication-secret'
          openIdIssuer: '${environment().authentication.loginEndpoint}${entraTenantId}/v2.0'
        }
        validation: {
          allowedAudiences: [
            'api://${entraClientId}'
          ]
        }
      }
    }
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
//  OUTPUTS
// ═══════════════════════════════════════════════════════════════════════════════

output containerRegistryEndpoint string = containerRegistry.properties.loginServer
output serverFqdn string = serverApp.properties.configuration.ingress.fqdn
output mcpFqdn string = mcpApp.properties.configuration.ingress.fqdn
output mcpAppName string = mcpApp.name
output serverAppName string = serverApp.name
output environmentName string = containerAppsEnv.name
output managedIdentityName string = managedIdentity.name
output storageAccountName string = storageAccount.name
output cosmosEndpoint string = cosmosAccount.properties.documentEndpoint
