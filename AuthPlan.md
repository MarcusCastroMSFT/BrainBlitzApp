# Brain Blitz — Entra ID Multi-Tenant Authentication Plan

> **Goal**: Secure Brain Blitz so that only authenticated Microsoft Entra ID users can create quizzes, add questions, and play games — with full tenant isolation in Cosmos DB so no company can ever see another company's data.

---

## Table of Contents

1. [Current State Assessment](#1-current-state-assessment)
2. [Target Architecture](#2-target-architecture)
3. [Entra ID App Registration (Multi-Tenant)](#3-entra-id-app-registration-multi-tenant)
4. [Client-Side Authentication (MSAL.js + React)](#4-client-side-authentication-msaljs--react)
5. [Server-Side JWT Validation (Express Middleware)](#5-server-side-jwt-validation-express-middleware)
6. [Socket.io Authentication](#6-socketio-authentication)
7. [Cosmos DB Tenant Isolation](#7-cosmos-db-tenant-isolation)
8. [MCP Server Authentication](#8-mcp-server-authentication)
9. [Infrastructure Changes (Bicep)](#9-infrastructure-changes-bicep)
10. [Migration Strategy](#10-migration-strategy)
11. [File-by-File Change Summary](#11-file-by-file-change-summary)
12. [Security Checklist](#12-security-checklist)

---

## 1. Current State Assessment

| Area | Current State | Risk |
|---|---|---|
| **Authentication** | None — all endpoints are open | Anyone with the URL can create/delete quizzes |
| **Authorization** | None | No concept of ownership or tenancy |
| **Data Model** | `QuizDoc { id, title, theme, … }` — no tenant field | All quizzes shared globally |
| **Cosmos DB Partition Key** | `/id` (quiz ID) | Efficient for point reads, but no tenant grouping |
| **API Routes** | No auth middleware on `/api/quizzes/*` | Full CRUD open to unauthenticated requests |
| **Socket.io** | No auth on connection handshake | Anyone can host/join games |
| **MCP Server** | Stateless, no user context | Tools operate on global data |
| **Bicep (infra)** | Easy Auth params exist but are optional/unused | Auth infrastructure is scaffolded but dormant |
| **Managed Identity** | ✅ Already used for Cosmos DB + ACR | Good foundation — extend, don't replace |

---

## 2. Target Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                        Microsoft Entra ID                           │
│                    (Multi-Tenant App Registration)                  │
│         signInAudience: "AzureADMultipleOrgs"                      │
└────────────┬──────────────────────────────┬─────────────────────────┘
             │ OIDC / OAuth 2.0 + PKCE      │
             ▼                              ▼
┌────────────────────────┐    ┌──────────────────────────────────────┐
│   React SPA (client)   │    │         MCP Server (Container App)   │
│   @azure/msal-react    │    │   Bearer token from AI platform or   │
│   @azure/msal-browser  │    │   on-behalf-of flow                  │
│   acquireTokenSilent() │    │   Validates JWT → extracts tenantId  │
└──────────┬─────────────┘    └──────────────┬───────────────────────┘
           │ Bearer token                    │ Bearer token
           ▼                                 ▼
┌──────────────────────────────────────────────────────────────────────┐
│                Game Server (Container App)                           │
│   Express middleware: validate JWT, extract tid + oid                │
│   Socket.io: validate token on connection handshake                 │
│   Every DB operation scoped by tenantId                             │
└──────────────────────────────┬───────────────────────────────────────┘
                               │ Managed Identity (DefaultAzureCredential)
                               ▼
┌──────────────────────────────────────────────────────────────────────┐
│              Cosmos DB (NoSQL, serverless)                           │
│   Partition key: /tenantId                                          │
│   QuizDoc { id, tenantId, createdBy, title, … }                    │
│   All queries include WHERE c.tenantId = @tid                       │
└──────────────────────────────────────────────────────────────────────┘
```

**Key Principles:**
- **Zero keys in application code** — Managed identity for Azure services, PKCE for user auth (no client secret in the SPA)
- **Tenant isolation by design** — `tenantId` on every document, enforced at middleware level
- **Defense in depth** — Even if middleware fails, Cosmos DB queries are always scoped

---

## 3. Entra ID App Registration (Multi-Tenant)

### 3.1 Registration Settings

| Setting | Value |
|---|---|
| **Name** | `Brain Blitz` |
| **Supported account types** | Accounts in any organizational directory (Multi-tenant) |
| **signInAudience** | `AzureADMultipleOrgs` |
| **Platform** | Single-page application (SPA) |
| **Redirect URIs** | `https://<server-fqdn>/` (production), `http://localhost:5173` (dev) |
| **Front-channel logout URL** | `https://<server-fqdn>` |
| **ID tokens** | ✅ Enabled (for OIDC sign-in) |
| **Access tokens** | ✅ Enabled (for API calls) |

### 3.2 API Permissions

| API | Permission | Type | Purpose |
|---|---|---|---|
| Microsoft Graph | `User.Read` | Delegated | Read user profile (name, email) |
| Microsoft Graph | `openid` | Delegated | OIDC sign-in |
| Microsoft Graph | `profile` | Delegated | User display name |

### 3.3 Expose an API

| Setting | Value |
|---|---|
| **Application ID URI** | `api://<client-id>` |
| **Scope** | `api://<client-id>/Quiz.ReadWrite` |
| **Scope description** | Create, read, update, and delete quizzes |
| **Who can consent** | Admins and users |

### 3.4 No Client Secret for SPA

The React SPA is a **public client** — it uses PKCE (Proof Key for Code Exchange) and does **not** need a client secret. This is the recommended approach for SPAs as of 2025.

> **Note**: The existing `entraClientSecret` Bicep parameter can be removed. It was needed for Easy Auth's server-side flow, which we're replacing with MSAL.js.

### 3.6 Continuous Access Evaluation (CAE)

Enable **CAE** on the app registration so that tokens are near-instantly revoked when a user's session is terminated, password changes, or Conditional Access policies change. This is a critical best practice for enterprise multi-tenant apps:

- Entra ID issues CAE-capable tokens with a `xms_cc` claim
- MSAL.js v4 supports CAE natively — set `clientCapabilities: ["CP1"]` in the MSAL config
- On the server, when JWT validation fails with a `401 insufficient_claims` response, MSAL automatically triggers a claims challenge to get a fresh token

```typescript
// In msalConfig.ts — enable CAE
export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: "https://login.microsoftonline.com/common",
    redirectUri: window.location.origin,
    clientCapabilities: ["CP1"], // ← Enable CAE
  },
  // ...
};
```

### 3.5 Optional: Automation via CLI

```bash
az ad app create \
  --display-name "Brain Blitz" \
  --sign-in-audience AzureADMultipleOrgs \
  --web-redirect-uris "https://<server-fqdn>/.auth/login/aad/callback" \
  --enable-id-token-issuance true \
  --enable-access-token-issuance true
```

---

## 4. Client-Side Authentication (MSAL.js + React)

### 4.1 New Dependencies

```bash
npm install @azure/msal-browser @azure/msal-react --workspace=client
```

| Package | Version | Purpose |
|---|---|---|
| `@azure/msal-browser` | ^4.x | Core MSAL library with PKCE support |
| `@azure/msal-react` | ^2.x | React hooks and components (`MsalProvider`, `useMsal`, `AuthenticatedTemplate`) |

### 4.2 MSAL Configuration

Create **`client/src/auth/msalConfig.ts`**:

```typescript
import { Configuration, LogLevel } from "@azure/msal-browser";

export const msalConfig: Configuration = {
  auth: {
    clientId: import.meta.env.VITE_ENTRA_CLIENT_ID,
    authority: "https://login.microsoftonline.com/common", // multi-tenant
    redirectUri: window.location.origin,
    postLogoutRedirectUri: window.location.origin,
  },
  cache: {
    cacheLocation: "sessionStorage", // avoid persistence across browser sessions
    storeAuthStateInCookie: false,
  },
  system: {
    loggerOptions: {
      logLevel: LogLevel.Warning,
    },
  },
};

export const loginRequest = {
  scopes: ["openid", "profile", "api://<client-id>/Quiz.ReadWrite"],
};

export const apiTokenRequest = {
  scopes: ["api://<client-id>/Quiz.ReadWrite"],
};
```

### 4.3 Wrap App with MsalProvider

Update **`client/src/main.tsx`**:

```tsx
import { PublicClientApplication } from "@azure/msal-browser";
import { MsalProvider } from "@azure/msal-react";
import { msalConfig } from "./auth/msalConfig";

const msalInstance = new PublicClientApplication(msalConfig);

// In the render:
<MsalProvider instance={msalInstance}>
  <BrowserRouter>
    <App />
  </BrowserRouter>
</MsalProvider>
```

### 4.4 Protect Routes

Update **`client/src/App.tsx`** to use `AuthenticatedTemplate` and `UnauthenticatedTemplate`:

```tsx
import { AuthenticatedTemplate, UnauthenticatedTemplate } from "@azure/msal-react";

// Protected routes wrapped in AuthenticatedTemplate
// Login page shown for UnauthenticatedTemplate
```

### 4.5 Auth Helper — API Calls with Bearer Token

Create **`client/src/auth/useApiToken.ts`**:

```typescript
import { useMsal } from "@azure/msal-react";
import { apiTokenRequest } from "./msalConfig";

export function useAuthFetch() {
  const { instance, accounts } = useMsal();

  return async (url: string, options: RequestInit = {}) => {
    const account = accounts[0];
    if (!account) throw new Error("Not authenticated");

    const response = await instance.acquireTokenSilent({
      ...apiTokenRequest,
      account,
    });

    return fetch(url, {
      ...options,
      headers: {
        ...options.headers,
        Authorization: `Bearer ${response.accessToken}`,
      },
    });
  };
}
```

### 4.6 UI Changes

| Page | Change |
|---|---|
| **Home** | Show user name + Sign Out button in header; "Sign In" button for unauthenticated |
| **CreatePage** | Already protected by route guard — no extra changes |
| **EditQuizPage** | Already protected by route guard — no extra changes |
| **HostPage** | Already protected by route guard — no extra changes |
| **PlayPage** | Require auth to join; pass user name from profile (optional override) |

### 4.7 New Login Page

Create **`client/src/pages/LoginPage.tsx`**:
- Brain Blitz branding
- "Sign in with Microsoft" button
- Uses `instance.loginRedirect(loginRequest)`
- Shown when user is not authenticated and tries to access any protected route

---

## 5. Server-Side JWT Validation (Express Middleware)

### 5.1 New Dependencies

```bash
npm install jose --workspace=server
```

| Package | Purpose |
|---|---|
| `jose` | Fast, standards-compliant JWT/JWK/JWKS validation. No native dependencies. Preferred over `jsonwebtoken` + `jwks-rsa`. `createRemoteJWKSet()` automatically caches and rotates JWKS keys — no custom caching needed. |

### 5.2 Auth Middleware

Create **`server/src/middleware/auth.ts`**:

```typescript
import { createRemoteJWKSet, jwtVerify, JWTPayload } from "jose";
import { Request, Response, NextFunction } from "express";

const ENTRA_CLIENT_ID = process.env.ENTRA_CLIENT_ID!;

// Multi-tenant JWKS endpoint — Entra rotates keys automatically
const JWKS = createRemoteJWKSet(
  new URL("https://login.microsoftonline.com/common/discovery/v2.0/keys")
);

export interface AuthUser {
  oid: string;      // User object ID (unique per user per tenant)
  tid: string;      // Tenant ID (the company's Entra directory)
  name: string;     // Display name
  email: string;    // Preferred username / email
}

declare global {
  namespace Express {
    interface Request {
      user?: AuthUser;
    }
  }
}

export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader?.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Missing or invalid Authorization header" });
  }

  try {
    const token = authHeader.slice(7);
    const { payload } = await jwtVerify(token, JWKS, {
      audience: `api://${ENTRA_CLIENT_ID}`,
      // Multi-tenant: accept any Entra tenant issuer
      issuer: (iss) => iss.startsWith("https://login.microsoftonline.com/")
                    && iss.endsWith("/v2.0"),
    });

    req.user = {
      oid: payload.oid as string,
      tid: payload.tid as string,
      name: (payload.name as string) ?? "Unknown",
      email: (payload.preferred_username as string) ?? "",
    };

    next();
  } catch (err) {
    return res.status(401).json({ error: "Invalid or expired token" });
  }
}
```

### 5.3 Apply Middleware

Update **`server/src/index.ts`**:

```typescript
import { requireAuth } from "./middleware/auth";

// Public routes (no auth needed)
app.get("/health", (_req, res) => res.json({ ok: true }));

// Protected routes
app.use("/api/quizzes", requireAuth, quizRouter);
```

### 5.4 Route Handler Changes

All route handlers in `quizzes.ts` will use `req.user!.tid` (tenant ID) to scope operations:

```typescript
// Example: List quizzes → only for the user's tenant
quizRouter.get("/", async (req, res) => {
  const { resources } = await quizContainer.items
    .query({
      query: "SELECT ... FROM c WHERE c.tenantId = @tid ORDER BY c.createdAt DESC",
      parameters: [{ name: "@tid", value: req.user!.tid }],
    })
    .fetchAll();
  res.json(resources);
});
```

---

## 6. Socket.io Authentication

### 6.1 Client: Pass Token on Connect

Update **`client/src/lib/socket.ts`**:

```typescript
import { io, Socket } from "socket.io-client";

export function createAuthenticatedSocket(accessToken: string): Socket {
  return io(URL, {
    autoConnect: false,
    auth: { token: accessToken },
  });
}
```

### 6.2 Server: Validate Token in Middleware

Update **`server/src/socket/index.ts`**:

```typescript
import { jwtVerify, createRemoteJWKSet } from "jose";

// Socket.io middleware — runs on every connection
io.use(async (socket, next) => {
  const token = socket.handshake.auth?.token;
  if (!token) return next(new Error("Authentication required"));

  try {
    const { payload } = await jwtVerify(token, JWKS, { /* same config */ });
    socket.data.user = {
      oid: payload.oid,
      tid: payload.tid,
      name: payload.name,
    };
    next();
  } catch {
    next(new Error("Invalid token"));
  }
});
```

### 6.3 Game Session Scoping

- `GameSession` gains a `tenantId` field
- Host creates session → `tenantId` comes from their JWT
- Players joining must have the same `tenantId` (enforced server-side)
- **Cross-tenant play**: For cross-company game events, we can add an opt-in "public game" flag later — default is tenant-restricted

---

## 7. Cosmos DB Tenant Isolation

This is the most critical section. **No company must ever see another company's quizzes.**

### 7.1 Data Model Changes

```typescript
// BEFORE
export interface QuizDoc {
  id: string;          // partition key
  title: string;
  theme: string;
  createdAt: number;
  questions: QuestionDoc[];
}

// AFTER
export interface QuizDoc {
  id: string;
  tenantId: string;    // ← NEW — Entra tenant ID (GUID from JWT 'tid' claim)
  createdBy: string;   // ← NEW — Entra user object ID (from JWT 'oid' claim)
  createdByName: string; // ← NEW — display name for UI
  title: string;
  theme: string;
  createdAt: number;
  questions: QuestionDoc[];
}
```

### 7.2 Partition Key Strategy

**Change partition key from `/id` to `/tenantId`**.

| Aspect | Before (`/id`) | After (`/tenantId`) |
|---|---|---|
| **Point read** | `item(quizId, quizId)` | `item(quizId, tenantId)` |
| **List all tenant quizzes** | Cross-partition query (expensive) | Single-partition query (fast + cheap) |
| **Tenant isolation** | Filter in WHERE clause only | Physical partition boundary + WHERE clause |
| **Data co-location** | Each quiz isolates alone | All company quizzes co-located |

Why `/tenantId` over hierarchical partition key:
- Simpler — one level of partitioning is sufficient for this workload
- Each tenant's quizzes are physically co-located in the same logical partition
- List queries (`SELECT * FROM c WHERE c.tenantId = @tid`) hit exactly one partition
- The SDK's `item(id, partitionKey)` efficiently reads a single document within the partition

### 7.3 Query Patterns (All Scoped by Tenant)

```typescript
// LIST: Single-partition query — fast and cheap
query: "SELECT c.id, c.title, c.theme, c.createdAt, c.createdByName FROM c WHERE c.tenantId = @tid ORDER BY c.createdAt DESC"
parameters: [{ name: "@tid", value: tenantId }]

// POINT READ: item(quizId, tenantId) — 1 RU
container.item(quizId, tenantId).read()

// CREATE: tenantId set from JWT, becomes partition key
container.items.create({ id: nanoid(8), tenantId, createdBy: oid, ... })

// DELETE: Must know tenantId — prevents cross-tenant deletion
container.item(quizId, tenantId).delete()
```

### 7.4 Defense in Depth

Even if a bug bypasses middleware, Cosmos DB queries are structurally safe:

1. **Partition key scoping**: Point reads require the correct `tenantId` as partition key value — you can't read tenant A's data with tenant B's key
2. **WHERE clause**: All queries include `WHERE c.tenantId = @tid` using parameterized values from the validated JWT
3. **No cross-partition queries for user data**: The list endpoint only does single-partition queries
4. **Index policy**: Exclude `/questions` from indexing (already embedded) to save RUs; index `/tenantId` and `/createdAt`

### 7.5 Cosmos DB Container Recreation

Changing the partition key from `/id` to `/tenantId` requires **recreating the container**:

```bicep
resource cosmosContainer '...' = {
  parent: cosmosDatabase
  name: 'quizzes'
  properties: {
    resource: {
      id: 'quizzes'
      partitionKey: {
        paths: [ '/tenantId' ]   // ← Changed from /id
        kind: 'Hash'
        version: 2
      }
    }
  }
}
```

**Migration**: Since this is a dev/preview app, the simplest approach is to delete and recreate the container. For production, you'd create a new container and migrate documents with a script.

---

## 8. MCP Server Authentication

The MCP server has a unique challenge: it's called by AI assistants (GitHub Copilot, ChatGPT), not directly by end users.

### 8.1 Authentication Strategy

| Approach | When to Use |
|---|---|
| **OAuth 2.0 Bearer token pass-through** | AI platform supports user-delegated auth (Copilot extensions with auth) |
| **API key per tenant** | Simple integration, tenant identified by key |
| **On-behalf-of (OBO) flow** | AI platform passes user token, MCP exchanges for downstream access |

**Recommended**: Start with **Bearer token pass-through** with a fallback to **tenant context in tool parameters**.

### 8.2 MCP Auth Middleware

```typescript
// In mcp-server/src/index.ts — validate Bearer token on POST /mcp
app.post("/mcp", async (req, res) => {
  // Extract and validate Bearer token (same jose logic as game server)
  const user = await validateBearerToken(req);
  
  // Pass tenant context to the MCP server instance
  const server = createServer(user); // user = { tid, oid, name }
  // ...
});
```

### 8.3 Tenant-Scoped MCP Tools

All data tools receive the tenant context from the authenticated user:

```typescript
// create_quiz tool — uses tenant from auth context
async ({ title, theme }) => {
  const doc: QuizDoc = {
    id: nanoid(8),
    tenantId: user.tid,    // from JWT
    createdBy: user.oid,   // from JWT
    // ...
  };
}
```

### 8.4 MCP Protocol Auth Header

The MCP SDK's `StreamableHTTPServerTransport` can inspect the incoming HTTP request. The AI platform sends the user's Bearer token in the `Authorization` header. If the platform doesn't provide one, the MCP tools should return an error asking the user to authenticate.

### 8.5 Fallback for Unauthenticated MCP Clients

For AI platforms that don't support auth pass-through:
- Add an optional `tenant_id` parameter to tools (hidden from users)
- Require an API key in a custom header (`X-API-Key`)
- Map API keys to tenants in a config/secrets store
- **This is a Phase 2 concern** — focus on authenticated flow first

---

## 9. Infrastructure Changes (Bicep)

### 9.1 App Registration Output

Add new outputs to pass the Entra Client ID to the containers:

```bicep
// Add to server container env vars
{ name: 'ENTRA_CLIENT_ID', value: entraClientId }

// Add to mcp-server container env vars
{ name: 'ENTRA_CLIENT_ID', value: entraClientId }
```

### 9.2 Remove Client Secret (No Longer Needed)

The SPA uses PKCE — no client secret. Remove:
- `entraClientSecret` parameter from `main.bicep` and `resources.bicep`
- `microsoft-provider-authentication-secret` from server app secrets
- The Easy Auth `authConfigs` resource (replaced by MSAL.js + JWT middleware)

### 9.3 Remove Easy Auth Resource

Delete the `serverAuthConfig` resource from `resources.bicep`. We're replacing Container Apps Easy Auth with:
- MSAL.js in the SPA (client-side auth)
- JWT validation middleware in Express (server-side validation)

This gives us more control over tenant extraction and data isolation.

### 9.4 Update Cosmos Container Partition Key

```bicep
resource cosmosContainer '...' = {
  properties: {
    resource: {
      id: 'quizzes'
      partitionKey: {
        paths: [ '/tenantId' ]   // Changed from /id
        kind: 'Hash'
        version: 2
      }
    }
  }
}
```

### 9.5 Environment Variables Summary

| Variable | Container | Purpose |
|---|---|---|
| `ENTRA_CLIENT_ID` | server, mcp-server | Audience validation for JWT |
| `COSMOS_ENDPOINT` | server, mcp-server | Already exists |
| `AZURE_CLIENT_ID` | server, mcp-server | Managed identity — already exists |
| `VITE_ENTRA_CLIENT_ID` | client (build-time) | MSAL config |

---

## 10. Migration Strategy

### Phase 1 — Foundation (Estimated: 1 day)

| Step | Description |
|---|---|
| 1.1 | Register Entra ID app (multi-tenant, SPA platform, expose API scope) |
| 1.2 | Install `@azure/msal-browser` + `@azure/msal-react` in client |
| 1.3 | Create `msalConfig.ts`, wrap `App` in `MsalProvider` |
| 1.4 | Create `LoginPage.tsx` with "Sign in with Microsoft" button |
| 1.5 | Protect routes with `AuthenticatedTemplate` |
| 1.6 | Create `useAuthFetch()` hook to attach Bearer tokens to API calls |
| 1.7 | Test: User can sign in, pages are protected, tokens are sent |

### Phase 2 — Server Protection (Estimated: 1 day)

| Step | Description |
|---|---|
| 2.1 | Install `jose` in server |
| 2.2 | Create `server/src/middleware/auth.ts` with JWT validation |
| 2.3 | Apply `requireAuth` to all `/api/quizzes` routes |
| 2.4 | Update Socket.io to validate token on connection handshake |
| 2.5 | Test: Unauthenticated API calls return 401 |

### Phase 3 — Tenant Isolation (Estimated: 1 day)

| Step | Description |
|---|---|
| 3.1 | Update `QuizDoc` schema: add `tenantId`, `createdBy`, `createdByName` |
| 3.2 | Change Cosmos container partition key from `/id` to `/tenantId` (recreate container) |
| 3.3 | Update all quiz routes to scope by `req.user.tid` |
| 3.4 | Update all Cosmos operations: `item(id, tenantId)` instead of `item(id, id)` |
| 3.5 | Update Socket.io game sessions to include `tenantId` |
| 3.6 | Test: Tenant A cannot see Tenant B's quizzes |

### Phase 4 — MCP Server Auth (Estimated: 0.5 days)

| Step | Description |
|---|---|
| 4.1 | Add JWT validation to `POST /mcp` endpoint |
| 4.2 | Pass tenant context through to MCP tool handlers |
| 4.3 | Update all MCP data tools to scope queries by tenantId |
| 4.4 | Test: MCP tools respect tenant boundaries |

### Phase 5 — Infrastructure & Deploy (Estimated: 0.5 days)

| Step | Description |
|---|---|
| 5.1 | Update Bicep: remove Easy Auth, remove client secret, add `ENTRA_CLIENT_ID` env var |
| 5.2 | Update Bicep: change Cosmos container partition key |
| 5.3 | Add `VITE_ENTRA_CLIENT_ID` to client build (via `.env.production` or build arg) |
| 5.4 | Update `postprovision.ps1` to set `ENTRA_CLIENT_ID` on both container apps |
| 5.5 | Deploy with `azd up` and validate end-to-end |

---

## 11. File-by-File Change Summary

### New Files

| File | Purpose |
|---|---|
| `client/src/auth/msalConfig.ts` | MSAL configuration (clientId, authority, scopes) |
| `client/src/auth/useAuthFetch.ts` | Hook: acquireTokenSilent + fetch with Bearer header |
| `client/src/auth/AuthGuard.tsx` | Component: wraps protected routes, redirects to login |
| `client/src/pages/LoginPage.tsx` | Sign-in page with "Sign in with Microsoft" button |
| `server/src/middleware/auth.ts` | Express middleware: JWT validation + tenant extraction |

### Modified Files

| File | Changes |
|---|---|
| **`client/package.json`** | Add `@azure/msal-browser`, `@azure/msal-react` |
| **`client/src/main.tsx`** | Wrap app in `MsalProvider` |
| **`client/src/App.tsx`** | Add `AuthGuard` wrapper, add `/login` route, show user info in nav |
| **`client/src/lib/socket.ts`** | Pass Bearer token in `auth` handshake |
| **`client/src/pages/Home.tsx`** | Use `useAuthFetch()` for API calls, show "Signed in as" |
| **`client/src/pages/CreatePage.tsx`** | Use `useAuthFetch()` for POST |
| **`client/src/pages/EditQuizPage.tsx`** | Use `useAuthFetch()` for all API calls |
| **`client/src/pages/HostPage.tsx`** | Pass token to Socket.io |
| **`client/src/pages/PlayPage.tsx`** | Pass token to Socket.io |
| **`server/package.json`** | Add `jose` |
| **`server/src/index.ts`** | Apply `requireAuth` middleware to API routes |
| **`server/src/schema.ts`** | Add `tenantId`, `createdBy`, `createdByName` to `QuizDoc` |
| **`server/src/db.ts`** | No changes (Cosmos client already uses managed identity) |
| **`server/src/routes/quizzes.ts`** | All handlers scoped by `req.user.tid` + updated point reads |
| **`server/src/socket/index.ts`** | Add auth middleware, tenant-scoped game sessions |
| **`server/src/types.ts`** | Add `tenantId` to `GameSession` |
| **`mcp-server/src/index.ts`** | Add JWT validation to `POST /mcp`, pass user to `createServer()` |
| **`mcp-server/src/server.ts`** | Accept user context param, pass to tool registrations |
| **`mcp-server/src/db.ts`** | Add `tenantId`, `createdBy`, `createdByName` to `QuizDoc` |
| **`mcp-server/src/tools/quiz-data.ts`** | All tools scoped by tenantId from auth context |
| **`mcp-server/src/tools/quiz-render.ts`** | `show_quizzes` scoped by tenantId |
| **`mcp-server/src/tools/search.ts`** | Search/fetch scoped by tenantId |
| **`infra/resources.bicep`** | Remove Easy Auth, remove client secret, change partition key, add env vars |
| **`infra/main.bicep`** | Remove `entraClientSecret` param |
| **`hooks/postprovision.ps1`** | Set `ENTRA_CLIENT_ID` on container apps |

---

## 12. Security Checklist

| # | Check | Status |
|---|---|---|
| 1 | No client secret in SPA code (PKCE only) | 🔲 |
| 2 | JWT validated on every API request (Express middleware) | 🔲 |
| 3 | JWT validated on Socket.io connection handshake | 🔲 |
| 4 | `tenantId` extracted from validated JWT `tid` claim (not user input) | 🔲 |
| 5 | Every Cosmos query includes `WHERE c.tenantId = @tid` | 🔲 |
| 6 | Every Cosmos point read uses `item(quizId, tenantId)` | 🔲 |
| 7 | Cosmos partition key is `/tenantId` (physical isolation) | 🔲 |
| 8 | Token audience validated against registered app ID | 🔲 |
| 9 | Token issuer validated (multi-tenant pattern) | 🔲 |
| 10 | Managed identity used for Cosmos DB access (no keys) | ✅ Already |
| 11 | Managed identity used for ACR pulls (no admin user) | ✅ Already |
| 12 | `disableLocalAuth: true` on Cosmos account (no keys possible) | ✅ Already |
| 13 | MCP server validates Bearer token before processing tools | 🔲 |
| 14 | Session storage for MSAL cache (not localStorage) | 🔲 |
| 15 | CORS restricted to known origins (post-deployment) | 🔲 |
| 16 | Easy Auth removed (replaced by MSAL.js + middleware) | 🔲 |
| 17 | Cross-tenant game join blocked by default | 🔲 |

---

## Appendix A: Token Claims Reference

When a user authenticates via Entra ID, the JWT access token includes:

| Claim | Example | Usage |
|---|---|---|
| `tid` | `72f988bf-86f1-41af-91ab-2d7cd011db47` | **Tenant ID** — used as partition key + query filter |
| `oid` | `abcdef12-3456-7890-abcd-ef1234567890` | **User Object ID** — stored as `createdBy` |
| `name` | `John Doe` | **Display name** — shown in UI |
| `preferred_username` | `john@contoso.com` | **Email** — shown in UI |
| `aud` | `api://<client-id>` | **Audience** — validated by middleware |
| `iss` | `https://login.microsoftonline.com/{tid}/v2.0` | **Issuer** — validated by middleware |
| `scp` | `Quiz.ReadWrite` | **Scopes** — can be used for fine-grained authz |

## Appendix B: Local Development

For local development without Azure:

1. Register a second redirect URI: `http://localhost:5173`
2. Set `VITE_ENTRA_CLIENT_ID` in `client/.env.local`
3. Set `ENTRA_CLIENT_ID` in server `.env`
4. Cosmos DB Emulator works with key-based auth (existing `IS_PRODUCTION` guard)
5. MSAL.js works locally — it redirects to `login.microsoftonline.com` and back

## Appendix C: Future Enhancements

| Enhancement | Description |
|---|---|
| **Role-based access** | Admin vs. Player roles via Entra App Roles |
| **Cross-tenant games** | Opt-in "public game" flag for inter-company events |
| **Conditional Access** | Require MFA, compliant devices, etc. via Entra policies |
| **Proof of Possession (PoP) tokens** | Replace Bearer tokens with PoP tokens for hardware-bound proof of sender identity |
| **Audit logging** | Log tenant + user for all mutations |
| **Rate limiting** | Per-tenant rate limits on API endpoints |
