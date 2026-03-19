// ─── Quiz browser widget resources ───────────────────────────────────────────
// Registers the current versioned URI plus legacy aliases v1–v7 so that any
// ChatGPT connector with a cached tool list pointing at an old URI still works.

import type { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { TEMPLATE_URI, MIME_TYPE } from "../config.js";
import { WIDGET_HTML } from "../widgets.js";

const LEGACY_URIS = [
  "ui://widget/brain-blitz-v1.html",
  "ui://widget/brain-blitz-v2.html",
  "ui://widget/brain-blitz-v3.html",
  "ui://widget/brain-blitz-v4.html",
  "ui://widget/brain-blitz-v5.html",
  "ui://widget/brain-blitz-v6.html",
  "ui://widget/brain-blitz-v7.html",
];

const makeWidgetResource = (uri: string) =>
  async () => ({
    contents: [
      {
        uri,
        mimeType: MIME_TYPE,
        text: WIDGET_HTML,
        _meta: {
          "openai/outputTemplate": TEMPLATE_URI,
          "openai/toolInvocation/invoking": "Opening Brain Blitz\u2026",
          "openai/toolInvocation/invoked": "Brain Blitz ready.",
          "openai/widgetAccessible": true,
        },
      },
    ],
  });

export function registerQuizWidgetResources(server: McpServer) {
  server.registerResource(
    "brain-blitz-widget",
    TEMPLATE_URI,
    { title: "Brain Blitz Widget", description: "Interactive Brain Blitz quiz browser rendered inside ChatGPT", mimeType: MIME_TYPE },
    makeWidgetResource(TEMPLATE_URI)
  );

  LEGACY_URIS.forEach((legacyUri, i) => {
    server.registerResource(
      `brain-blitz-widget-legacy-${i + 1}`,
      legacyUri,
      { title: "Brain Blitz Widget (legacy)", description: "Legacy alias — redirects to current widget", mimeType: MIME_TYPE },
      makeWidgetResource(legacyUri)
    );
  });
}
