# 🧠 Brain Blitz

A real-time multiplayer quiz game platform with an AI-powered MCP (Model Context Protocol) server that lets AI assistants create, manage, and play quiz games.

## Architecture

```
┌──────────────────┐     ┌──────────────────┐     ┌──────────────────┐
│   React Client   │────▶│   Game Server    │────▶│   Cosmos DB      │
│   (Vite + React) │     │ (Express+Socket) │     │  (NoSQL/Serverless)
└──────────────────┘     └──────────────────┘     └──────────────────┘
                                ▲
                                │ Socket.io proxy
                         ┌──────────────────┐
                         │   MCP Server     │
                         │ (AI integration) │
                         └──────────────────┘
```

| Component | Description | Port |
|-----------|-------------|------|
| **client/** | React SPA with Tailwind CSS — quiz creation, hosting, and gameplay UI | 5173 (dev) |
| **server/** | Express REST API + Socket.io — quiz CRUD, real-time game engine | 3001 |
| **mcp-server/** | MCP protocol server — exposes quiz tools to AI assistants (e.g., GitHub Copilot) | 3002 |

Data is stored in **Azure Cosmos DB** (NoSQL, serverless). Uploaded quiz images are stored on the local filesystem (dev) or Azure Files (production).

## Prerequisites

- [Node.js](https://nodejs.org/) v20+
- [Azure Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/local-emulator) (for local dev) **or** an Azure Cosmos DB account
- [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/install-azd) (for deployment only)

## Getting Started

### 1. Install dependencies

From the root of the project:

```bash
npm install
```

This installs dependencies for all three workspaces (`server`, `client`, `mcp-server`) via npm workspaces.

### 2. Configure environment variables

```bash
cp .env.example .env
```

Edit `.env` and set:

| Variable | Required | Description |
|----------|----------|-------------|
| `COSMOS_ENDPOINT` | **Yes** | Cosmos DB endpoint (e.g., `https://localhost:8081` for emulator) |
| `COSMOS_KEY` | **Yes** (local) | Cosmos DB key. Not needed in Azure (uses managed identity). |
| `PORT` | No | Game server port (default: `3001`) |
| `MCP_PORT` | No | MCP server port (default: `3002`) |
| `GAME_SERVER_URL` | No | Public URL for Socket.io. Set to your ngrok/devtunnel URL for remote dev. |
| `APP_BASE_URL` | No | Public URL of the React SPA (default: `http://localhost:5173`) |

> **Tip:** If you're using the [Azure Cosmos DB Emulator](https://learn.microsoft.com/azure/cosmos-db/local-emulator), the default endpoint is `https://localhost:8081` and the key is available from the emulator's UI.

### 3. Start the development servers

Run the game server and client together:

```bash
npm run dev
```

This starts:
- **Game server** at `http://localhost:3001` (Express + Socket.io)
- **React client** at `http://localhost:5173` (Vite dev server with hot reload)

The Vite dev server proxies `/api`, `/uploads`, and `/socket.io` requests to the game server automatically.

### 4. Start the MCP server (optional)

In a separate terminal:

```bash
npm run dev:mcp
```

Or run all three services at once:

```bash
npm run dev:all
```

### 5. Connect an AI assistant to the MCP server

The MCP server exposes tools over Streamable HTTP at `http://localhost:3002/mcp`. You can connect it to any MCP-compatible client (e.g., VS Code with GitHub Copilot).

**Available MCP tools:**

| Tool | Description |
|------|-------------|
| `show_quizzes` | Browse and manage all quizzes (interactive widget) |
| `get_quiz` | Get full details of a specific quiz |
| `create_quiz` | Create a new quiz with questions |
| `add_questions` | Add questions to an existing quiz |
| `delete_quiz` | Delete a quiz |
| `play_game` | Join and play a live game by PIN |
| `search` | Search quizzes and questions by keyword |
| `fetch` | Fetch details for a search result |

## Remote Development (ngrok / Dev Tunnels)

If you need the MCP server's widgets to work from a remote AI client:

1. Start an ngrok tunnel pointing to the MCP server port:
   ```bash
   ngrok http 3002
   ```
2. Set `GAME_SERVER_URL` in `.env` to the ngrok HTTPS URL.
3. Restart the MCP server.

## Scripts

| Script | Description |
|--------|-------------|
| `npm run dev` | Start game server + client (concurrent) |
| `npm run dev:mcp` | Start MCP server only |
| `npm run dev:all` | Start all three services (concurrent) |
| `npm run build` | Build all workspaces for production |
| `npm start` | Start the production game server |

---

## Deploying to Azure

Brain Blitz deploys to **Azure Container Apps** using the [Azure Developer CLI (azd)](https://learn.microsoft.com/azure/developer/azure-developer-cli/).

### What gets provisioned

- **Azure Container Apps Environment** — hosts both services
- **Container App: server** — Express + Socket.io + React SPA
- **Container App: mcp-server** — MCP protocol server with Socket.io proxy
- **Azure Container Registry** — private Docker image store
- **Azure Cosmos DB** (NoSQL, serverless) — quiz data with managed-identity RBAC
- **Azure Storage Account** (Azure Files) — persistent storage for uploaded images
- **Log Analytics Workspace** — centralized logging
- **User-Assigned Managed Identity** — used for Cosmos DB and ACR access (no keys)

### Deploy

1. **Log in** to Azure and azd:
   ```bash
   azd auth login
   ```

2. **Provision and deploy** everything:
   ```bash
   azd up
   ```

   You'll be prompted for:
   - **Environment name** — a unique name for your deployment (e.g., `brainblitz-dev`)
   - **Azure region** — where to create resources
   - **Entra ID settings** (optional) — leave blank to skip authentication

   `azd up` will:
   - Create the resource group and all Azure resources (Bicep)
   - Build Docker images for `server` and `mcp-server`
   - Push images to Azure Container Registry
   - Deploy to Container Apps
   - Run the post-provision hook to configure MCP server URLs

3. **View your app:**

   After deployment, `azd` outputs the live URLs:
   - `SERVER_URL` — the game app (React SPA)
   - `MCP_URL` — the MCP server endpoint

### Update after code changes

```bash
azd deploy
```

### Tear down

To delete all Azure resources:

```bash
azd down
```

### Optional: Enable Entra ID authentication

To protect the game server with Microsoft Entra ID sign-in, pass these parameters during `azd up` or set them as azd environment variables:

```bash
azd env set ENTRA_CLIENT_ID <your-app-client-id>
azd env set ENTRA_TENANT_ID <your-tenant-id>
azd env set ENTRA_CLIENT_SECRET <your-client-secret>
azd up
```

---

## Project Structure

```
brain-blitz/
├── client/                 # React SPA (Vite + Tailwind + Radix UI)
│   └── src/
│       ├── pages/          # Route pages (Home, Create, Edit, Host, Play)
│       ├── components/     # UI components (Leaderboard, Podium, Timer, etc.)
│       └── lib/            # Socket.io client, utilities
├── server/                 # Express game server
│   └── src/
│       ├── routes/         # REST API routes (quiz CRUD)
│       ├── socket/         # Socket.io event handlers (game engine)
│       ├── db.ts           # Cosmos DB client
│       └── schema.ts       # Data models
├── mcp-server/             # MCP protocol server
│   ├── src/
│   │   ├── tools/          # MCP tools (quiz CRUD, game, search)
│   │   ├── resources/      # MCP resources (widget HTML)
│   │   ├── server.ts       # MCP server factory
│   │   ├── config.ts       # Environment config
│   │   └── db.ts           # Cosmos DB client (shared)
│   └── widgets-src/        # Widget source (React components → inline HTML)
├── infra/                  # Azure Bicep templates
│   ├── main.bicep          # Subscription-scoped entry point
│   └── resources.bicep     # All Azure resources
├── hooks/
│   └── postprovision.ps1   # Post-deploy URL configuration
├── azure.yaml              # AZD project definition
└── .env.example            # Environment variable template
```

## License

This project is provided as-is for educational and demonstration purposes.
