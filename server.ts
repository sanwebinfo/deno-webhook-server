import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

// Load environment variables from .env file
const AUTH_KEY = Deno.env.get("AUTH_KEY") || config()['AUTH_KEY'];
if (!AUTH_KEY) {
  throw new Error("AUTH_KEY is not set in the environment");
}

const port = 8000;
const staticDir = "./public";

await ensureDir(staticDir);

const clients = new Set<WebSocket>();
const messages: string[] = [];

const securityHeaders = new Headers({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-XSS-Protection": "1; mode=block",
  "X-Robots-Tag": "noindex, nofollow"
});

function sanitizeMessage(message: string): string {
  const map: { [key: string]: string } = {
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#x27;',
    '/': '&#x2F;',
  };
  return message.replace(/[&<>"'/]/g, (match) => map[match]);
}

function handleWebSocket(req: Request): Response {
  if (req.headers.get("Upgrade") !== "websocket") {
    return new Response("Request isn't trying to upgrade to WebSocket.", {
      status: 400,
      headers: securityHeaders,
    });
  }

  const { socket, response } = Deno.upgradeWebSocket(req);

  socket.onmessage = (event) => {
    console.log("Received message:", event.data);
  };

  socket.onclose = () => {
    clients.delete(socket);
  };

  socket.onerror = (err) => {
    console.error(`WebSocket error: ${err}`);
  };

  clients.add(socket);
  return response;
}

async function handleReload(req: Request): Promise<Response> {
  clients.forEach((client) => {
    client.send(JSON.stringify({ type: "reload" }));
  });
  return new Response(JSON.stringify({ message: "Reload triggered" }), {
    status: 200,
    headers: securityHeaders,
  });
}

async function handleSendMessage(req: Request): Promise<Response> {
  try {
    const body = await req.json();
    if (typeof body.message === "string" && body.message.trim() !== "") {
      const sanitizedMessage = sanitizeMessage(body.message);
      if (sanitizedMessage.length >= 2 && sanitizedMessage.length <= 600) {
        messages.push(sanitizedMessage);
        clients.forEach((client) => {
          client.send(JSON.stringify({ type: "message", data: sanitizedMessage }));
        });
        return new Response(JSON.stringify({ message: "Message received" }), {
          status: 200,
          headers: securityHeaders,
        });
      } else {
        return new Response(JSON.stringify({ error: "Message must be between 2 and 600 characters" }), {
          status: 400,
          headers: securityHeaders,
        });
      }
    } else {
      return new Response(JSON.stringify({ error: "Invalid message format" }), {
        status: 400,
        headers: securityHeaders,
      });
    }
  } catch (error) {
    console.error("Error parsing JSON:", error);
    return new Response(JSON.stringify({ error: "Invalid JSON format" }), {
      status: 400,
      headers: securityHeaders,
    });
  }
}

async function handleGetMessages(req: Request): Promise<Response> {
  if (messages.length === 0) {
    return new Response(JSON.stringify({ message: "No messages available" }), {
      status: 200,
      headers: securityHeaders,
    });
  }
  return new Response(JSON.stringify(messages), {
    status: 200,
    headers: securityHeaders,
  });
}

async function serveStaticFiles(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);
  const filePath = `${staticDir}${pathname === "/" ? "/index.html" : pathname}`;
  
  try {
    const fileResponse = await serveFile(req, filePath);
    const responseHeaders = new Headers(fileResponse.headers);
    securityHeaders.forEach((value, key) => {
      responseHeaders.set(key, value);
    });
    return new Response(fileResponse.body, {
      status: fileResponse.status,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error("File serving error:", error);
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers: securityHeaders,
    });
  }
}

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  if (pathname === "/ws") {
    return handleWebSocket(req);
  }

  const authHeader = req.headers.get("Authorization");
  if ((pathname === "/reload" || pathname === "/send-message") && authHeader !== `Bearer ${AUTH_KEY}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 403,
      headers: securityHeaders,
    });
  }

  if (req.method === "GET" && pathname === "/reload") {
    return handleReload(req);
  }

  if (req.method === "POST" && pathname === "/send-message") {
    return handleSendMessage(req);
  }

  if (req.method === "GET" && pathname === "/messages") {
    return handleGetMessages(req);
  }

  return serveStaticFiles(req);
}

// Start the server with the handler function
console.log(`HTTP server is running on ${port}`);
Deno.serve(handler, { port });
