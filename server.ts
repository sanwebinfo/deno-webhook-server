import { serveFile } from "@std/http/file-server";
import { ensureDir } from "@std/fs";
import { join } from "@std/path";

// HTTP Status Codes
const HTTP_STATUS = {
  OK: 200,
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  NOT_FOUND: 404,
  INTERNAL_SERVER_ERROR: 500,
} as const;

// Server configuration
const SERVER_CONFIG = {
  PORT: 8000,
  STATIC_DIR: "./public",
  MESSAGE_LIMITS: {
    MAX_LENGTH: 600,
    MIN_LENGTH: 2
  }
};

// Initialize server directories
await ensureDir(SERVER_CONFIG.STATIC_DIR);

// WebSocket and message state
const clients = new Set<WebSocket>();
const messages: string[] = [];

// Security headers configuration
const SECURITY_HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-XSS-Protection": "1; mode=block",
  "X-Robots-Tag": "noindex, nofollow",
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

/**
 * Creates a standardized HTTP response
 */
function createResponse(
  body: unknown,
  status: number = HTTP_STATUS.OK,
  headers?: HeadersInit,
): Response {
  const responseHeaders = new Headers({
    ...SECURITY_HEADERS,
    ...headers,
    "Content-Type": "application/json",
  });

  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: responseHeaders,
  });
}

/**
 * Sanitizes user input to prevent XSS attacks
 */
function sanitizeMessage(message: string): string {
  const escapeMap: Record<string, string> = {
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    '"': "&quot;",
    "'": "&#x27;",
    "/": "&#x2F;",
  };
  return message.replace(/[&<>"'/]/g, (match) => escapeMap[match]);
}

/**
 * Handles WebSocket connections
 */
function handleWebSocket(req: Request): Response {
  if (req.headers.get("Upgrade") !== "websocket") {
    return createResponse(
      { 
        success: false,
        error: "WebSocket upgrade required",
        details: "Request must include 'Upgrade: websocket' header"
      },
      HTTP_STATUS.BAD_REQUEST,
    );
  }

  try {
    const { socket, response } = Deno.upgradeWebSocket(req);

    socket.onopen = () => {
      console.log("WebSocket connection established");
      socket.send(JSON.stringify({
        type: "connection",
        status: "connected",
        timestamp: new Date().toISOString()
      }));
    };

    socket.onmessage = (event) => {
      console.log("Received WebSocket message:", event.data);
    };

    socket.onclose = () => {
      clients.delete(socket);
      console.log("WebSocket connection closed");
    };

    socket.onerror = (error: Event) => {
      console.error("WebSocket error:", error);
    };

    clients.add(socket);
    return response;
  } catch (error) {
    console.error("WebSocket upgrade failed:", error);
    return createResponse(
      { 
        success: false,
        error: "WebSocket upgrade failed",
        details: error instanceof Error ? error.message : "Unknown error occurred"
      }, 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Handles reload requests and notifies connected clients
 */
async function handleReload(): Promise<Response> {
  const activeClients = Array.from(clients).filter(
    (client) => client.readyState === WebSocket.OPEN
  );

  const sendPromises = activeClients.map((client) => {
    try {
      return client.send(JSON.stringify({ 
        type: "reload",
        timestamp: new Date().toISOString()
      }));
    } catch (error) {
      console.error("Failed to send reload message:", error);
      return Promise.resolve();
    }
  });

  await Promise.all(sendPromises);
  
  return createResponse({
    success: true,
    message: "Reload notification sent",
    clientsNotified: activeClients.length,
    timestamp: new Date().toISOString()
  });
}

/**
 * Handles incoming messages, validates and broadcasts them
 */
async function handleSendMessage(req: Request): Promise<Response> {
  if (req.headers.get("Content-Type") !== "application/json") {
    return createResponse(
      { 
        success: false,
        error: "Invalid content type",
        details: "Content-Type must be application/json"
      },
      HTTP_STATUS.BAD_REQUEST
    );
  }

  try {
    const body = await req.json();
    
    if (typeof body.message !== "string" || body.message.trim() === "") {
      return createResponse(
        { 
          success: false,
          error: "Invalid message format",
          details: "Message must be a non-empty string"
        }, 
        HTTP_STATUS.BAD_REQUEST
      );
    }

    const sanitizedMessage = sanitizeMessage(body.message.trim());
    const messageLength = sanitizedMessage.length;

    if (messageLength < SERVER_CONFIG.MESSAGE_LIMITS.MIN_LENGTH || 
        messageLength > SERVER_CONFIG.MESSAGE_LIMITS.MAX_LENGTH) {
      return createResponse(
        { 
          success: false,
          error: "Invalid message length",
          details: `Message must be between ${SERVER_CONFIG.MESSAGE_LIMITS.MIN_LENGTH} and ${SERVER_CONFIG.MESSAGE_LIMITS.MAX_LENGTH} characters`,
          minLength: SERVER_CONFIG.MESSAGE_LIMITS.MIN_LENGTH,
          maxLength: SERVER_CONFIG.MESSAGE_LIMITS.MAX_LENGTH,
          actualLength: messageLength
        },
        HTTP_STATUS.BAD_REQUEST,
      );
    }

    messages.push(sanitizedMessage);

    const activeClients = Array.from(clients).filter(
      (client) => client.readyState === WebSocket.OPEN
    );

    const sendPromises = activeClients.map((client) => {
      try {
        return client.send(JSON.stringify({ 
          type: "message", 
          data: sanitizedMessage,
          timestamp: new Date().toISOString()
        }));
      } catch (error) {
        console.error("Failed to send message:", error);
        return Promise.resolve();
      }
    });

    await Promise.all(sendPromises);
    
    return createResponse({
      success: true,
      message: "Message processed successfully",
      content: sanitizedMessage,
      recipients: activeClients.length,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error("Error processing message:", error);
    return createResponse(
      { 
        success: false,
        error: "Invalid request",
        details: error instanceof Error ? error.message : "Unknown error occurred"
      }, 
      HTTP_STATUS.BAD_REQUEST
    );
  }
}

/**
 * Returns all stored messages
 */
function handleGetMessages(): Response {
  return createResponse({
    success: true,
    count: messages.length,
    messages,
    timestamp: new Date().toISOString()
  });
}

/**
 * Serves static files from the public directory
 */
async function serveStaticFile(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const filePath = join(SERVER_CONFIG.STATIC_DIR, pathname === "/" ? "index.html" : pathname);

  try {
    const file = await serveFile(req, filePath);
    const headers = new Headers(file.headers);

    Object.entries(SECURITY_HEADERS).forEach(([key, value]) => {
      headers.set(key, value);
    });

    if (filePath.endsWith(".html")) {
      headers.set("Content-Type", "text/html; charset=utf-8");
    }

    return new Response(file.body, {
      status: file.status,
      headers,
    });
  } catch (error) {
    if (error instanceof Deno.errors.NotFound) {
      return createResponse(
        { 
          success: false,
          error: "Resource not found",
          path: pathname,
          timestamp: new Date().toISOString()
        }, 
        HTTP_STATUS.NOT_FOUND
      );
    }
    console.error("File serving error:", error);
    return createResponse(
      { 
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString()
      }, 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

/**
 * Main request handler that routes requests to appropriate functions
 */
async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  try {
    if (pathname === "/ws") {
      return handleWebSocket(req);
    }

    switch (true) {
      case req.method === "GET" && pathname === "/reload":
        return await handleReload();
      case req.method === "POST" && pathname === "/send-message":
        return await handleSendMessage(req);
      case req.method === "GET" && pathname === "/messages":
        return handleGetMessages();
      default:
        return await serveStaticFile(req);
    }
  } catch (error) {
    console.error("Request handling error:", error);
    return createResponse(
      { 
        success: false,
        error: "Internal server error",
        details: error instanceof Error ? error.message : "Unknown error occurred",
        timestamp: new Date().toISOString()
      }, 
      HTTP_STATUS.INTERNAL_SERVER_ERROR
    );
  }
}

// Start the server
console.log(`Starting server on port ${SERVER_CONFIG.PORT}`);
Deno.serve(
  { 
    port: SERVER_CONFIG.PORT,
    onListen: ({ port, hostname }) => {
      console.log(`Server started at http://${hostname}:${port}`);
    },
  }, 
  handler,
);
