# Deno Webhook Server

Deno Webhook Server is a real-time server application built using Deno. It supports WebSocket connections for real-time updates it includes endpoints for triggering reloads and retrieving messages.  

## Features

- **WebSocket Support**: Real-time communication with clients.
- **Message Handling**: send and receive messages with validation.
- **Reload Trigger**: Notifies all connected clients to reload.  

## Prerequisites

- **Deno**: Ensure you have Deno installed. You can install it following the [official guide](https://deno.land/#installation).

## Setup

- clone the repository or Download

```sh
git clone https://github.com/sanwebinfo/deno-webhook-server.git
cd deno-webhook-server
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

## Example curl Commands

```sh

## Send Message
curl -X POST http://localhost:8000/send-message \
     -H "Content-Type: application/json" \
     -d '{"message": "Hello, WebSocket!"}'
```

```sh

## Reload page
curl -X GET http://localhost:8000/reload
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
