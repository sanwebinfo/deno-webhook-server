import { config } from "https://deno.land/x/dotenv@v3.2.2/mod.ts";
import { serveFile } from "https://deno.land/std@0.224.0/http/file_server.ts";
import { ensureDir } from "https://deno.land/std@0.224.0/fs/ensure_dir.ts";

const AUTH_KEY = config()['AUTH_KEY'];

const port = 8000;
const staticDir = "./public";

await ensureDir(staticDir);

const clients = new Set<WebSocket>();
const messages: string[] = [];

const headers = new Headers({
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "DENY",
  "Strict-Transport-Security": "max-age=63072000; includeSubDomains; preload",
  "X-XSS-Protection": "1; mode=block",
});

function sanitizeMessage(message: string): string {
  return message.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function handleWebSocket(req: Request): Promise<Response> {
  if (req.headers.get("Upgrade") !== "websocket") {
    return new Response("Request isn't trying to upgrade to WebSocket.", {
      status: 400,
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

async function handler(req: Request): Promise<Response> {
  const { pathname } = new URL(req.url);

  // Check authentication header for sensitive routes
  const authHeader = req.headers.get("Authorization");
  if (pathname === "/reload" || pathname === "/send-message") {
    if (authHeader !== `Bearer ${AUTH_KEY}`) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 403,
        headers,
      });
    }
  }

  // WebSocket upgrade request
  if (pathname === "/ws") {
    return handleWebSocket(req);
  }

  // Reload request
  if (req.method === "GET" && pathname === "/reload") {
    clients.forEach((client) => {
      client.send(JSON.stringify({ type: "reload" }));
    });
    return new Response(JSON.stringify({ message: "Reload triggered" }), {
      status: 200,
      headers,
    });
  }

  // Send message request
  if (req.method === "POST" && pathname === "/send-message") {
    try {
      const body = await req.json();
      if (typeof body.message === "string" && body.message.trim() !== "") {
        const sanitizedMessage = sanitizeMessage(body.message);
        if (sanitizedMessage.length >= 2 && sanitizedMessage.length <= 600) {
          messages.push(sanitizedMessage);
          clients.forEach((client) => {
            client.send(
              JSON.stringify({ type: "message", data: sanitizedMessage }),
            );
          });
          return new Response(JSON.stringify({ message: "Message received" }), {
            status: 200,
            headers,
          });
        } else {
          return new Response(
            JSON.stringify({
              error: "Message must be between 2 and 600 characters",
            }),
            {
              status: 400,
              headers,
            },
          );
        }
      } else {
        return new Response(
          JSON.stringify({ error: "Invalid message format" }),
          {
            status: 400,
            headers,
          },
        );
      }
    } catch (error) {
      console.error("Error parsing JSON:", error);
      return new Response(JSON.stringify({ error: "Invalid JSON format" }), {
        status: 400,
        headers,
      });
    }
  }

  // Get messages request
  if (req.method === "GET" && pathname === "/messages") {
    if (messages.length === 0) {
      return new Response(
        JSON.stringify({ message: "No messages available" }),
        {
          status: 200,
          headers,
        },
      );
    }
    return new Response(JSON.stringify(messages), {
      status: 200,
      headers,
    });
  }

  // Serve static files
  try {
    const filePath = `${staticDir}${
      pathname === "/" ? "/index.html" : pathname
    }`;
    return await serveFile(req, filePath);
  } catch (error) {
    console.error("File serving error:", error);
    return new Response(JSON.stringify({ error: "Not Found" }), {
      status: 404,
      headers,
    });
  }
}

// Start the server with the handler function
console.log(`HTTP server is running on ${port}`);
Deno.serve(handler, { port });
