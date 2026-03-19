// Global types for the OpenAI Apps SDK and Socket.io CDN.

interface OpenAIWidgetHelpers {
  toolOutput?: Record<string, unknown>;
  widgetState?: Record<string, unknown>;
  callTool?: (name: string, args: Record<string, unknown>) => Promise<unknown>;
  openExternal?: (opts: { href: string }) => void;
  sendFollowUpMessage?: (opts: { prompt: string }) => void;
  setWidgetState?: (state: Record<string, unknown>) => void;
}

declare global {
  interface Window {
    openai?: OpenAIWidgetHelpers;
    // Socket.io loaded from CDN in game-play widget
    io?: (url: string, opts?: Record<string, unknown>) => SocketIO.Socket;
  }
}

// Minimal Socket.io types used in game-play
declare namespace SocketIO {
  interface Socket {
    id: string;
    connected: boolean;
    once(event: string, fn: (...args: unknown[]) => void): this;
    on(event: string, fn: (...args: unknown[]) => void): this;
    emit(event: string, ...args: unknown[]): this;
    disconnect(): this;
  }
}

export {};
