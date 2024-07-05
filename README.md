# Deno Webhook Server

Deno Webhook Server is a real-time server application built using Deno. It supports WebSocket connections for real-time updates it includes endpoints for triggering reloads and retrieving messages.  

## Features

- **WebSocket Support**: Real-time communication with clients.
- **Message Handling**: send and receive messages with validation.
- **Reload Trigger**: Notifies all connected clients to reload.
- **Authentication**: Secure endpoints with API key validation For Send and Reload Messages.
- **Environment Configuration**: Uses `.env` file for Store API Key.

## Prerequisites

- **Deno**: Ensure you have Deno installed. You can install it following the [official guide](https://deno.land/#installation).

## Setup

- clone the repository or Download

```sh
git clone https://github.com/sanwebinfo/deno-webhook-server.git
cd deno-webhook-server
```

- Create the `.env` File

```env
AUTH_KEY=your_secret_api_key
```

- Install Dependencies

```sh
deno cache server.ts
```

- Start the server using the following command

```sh

deno run --allow-net --allow-env --allow-read --allow-write server.ts

or

deno task start

```

## API Endpoints

### WebSocket Endpoint

URL: `/ws`
Method: WebSocket Upgrade
Description: Establish a WebSocket connection to receive real-time updates and message

### Reload Endpoint

- URL: `/reload`
- Method: GET
- Description: Triggers a reload notification to all connected WebSocket clients.
- Headers: Authorization: Bearer <AUTH_KEY>

### Send Message Endpoint

- URL: `/send-message`
- Method: POST
- Description: Sends a message to all connected WebSocket clients.
- Request Body:

```json
{
  "message": "Your message here"
}
```

- Headers: Authorization: Bearer <AUTH_KEY>

## Example curl Commands

```sh

## Send Message
curl -X POST http://localhost:8000/send-message \
     -H "Authorization: Bearer your_secret_api_key" \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello, WebSocket!"}'
```

```sh

## Reload page
curl -X GET http://localhost:8000/reload \
     -H "Authorization: Bearer your_secret_api_key"
```

```sh

# Retrieve all stored messages
curl -X GET http://localhost:8000/messages

```

## Static Page

- open `http://localhost:8000` on Browser and check the WebSocket Activities

## Hosting

- Deno Deploy: <https://deno.com/deploy>

## LICENSE

MIT
