# Luvio Collaboration Backend

Production-oriented NestJS modular monolith for the Luvio realtime collaboration platform.

## Implemented foundation

- Validated environment configuration and fail-fast startup
- Structured JSON logging with request IDs and sensitive-field redaction
- Helmet, CORS allowlist, DTO validation, payload whitelisting, and rate limiting
- MongoDB/Mongoose schemas with tenant and message-query indexes
- Redis service and Socket.IO Redis adapter for horizontal realtime scaling
- Argon2id registration/login
- Short-lived JWT access tokens
- Hashed, revocable, rotating refresh-token sessions
- Workspace creation/listing and centralized role-permission mapping
- Public/private channels and channel membership
- Generic conversations supporting channel, DM, group DM, and meeting types
- Cursor-paginated, idempotent, durable messages
- Authenticated Socket.IO conversation rooms and `message.created` broadcasts
- Liveness/readiness endpoints
- Docker development services for MongoDB, Redis, LiveKit, and the API

## Local setup

```bash
cp .env.example .env
docker compose up -d mongodb redis livekit
pnpm install
pnpm start:dev
```

The API listens on `http://localhost:4000/api/v1`. Socket.IO uses the `/realtime` namespace on the same server.

## Initial REST API

```text
GET    /api/v1/health/live
GET    /api/v1/health/ready

POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout
POST   /api/v1/auth/logout-all
GET    /api/v1/auth/me

POST   /api/v1/workspaces
GET    /api/v1/workspaces

POST   /api/v1/workspaces/:workspaceId/channels
GET    /api/v1/workspaces/:workspaceId/channels
POST   /api/v1/workspaces/:workspaceId/channels/:channelId/join

POST   /api/v1/workspaces/:workspaceId/conversations/:conversationId/messages
GET    /api/v1/workspaces/:workspaceId/conversations/:conversationId/messages
```

Protected REST routes require `Authorization: Bearer <accessToken>`.

## Initial realtime API

Connect using a Socket.IO auth payload:

```ts
io(`${API_URL}/realtime`, {
  transports: ['websocket'],
  auth: { token: accessToken },
});
```

Client commands:

- `conversation.join` — authorizes access before joining a private room
- `message.send` — persists first, then emits `message.created`

Important commands return Socket.IO acknowledgement payloads using the same `{ data, meta }` shape as REST.

## Validation

```bash
pnpm typecheck
pnpm lint
pnpm test --runInBand
pnpm build
```

## Next modules

The next delivery slice should add workspace invitations, DMs/group DMs, reactions, durable notifications, Redis presence heartbeats/typing expiry, S3 signed uploads, then Calls/Meetings with backend-issued LiveKit tokens and BullMQ timeouts/reminders.
