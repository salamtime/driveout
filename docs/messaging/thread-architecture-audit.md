# Messaging Architecture Audit

## Scope

This audit covers the production messaging and workflow timeline stack currently spread across:

- `public.shared_message_threads`
- `public.shared_messages`
- `public.app_booking_requests`
- `public.app_booking_messages`
- `public.verification_requests`
- `public.verification_events`
- `public.rental_events`

It also covers the service and UI layers that read, synthesize, and backfill threads:

- `api/messages.js`
- `api/_lib/messages.js`
- `api/_lib/publicBookingHandler.js`
- `api/verifications.js`
- `src/services/MessageService.js`
- `src/services/MessageCenterService.js`
- `src/components/messages/*`

## Executive Summary

The current production system is not one unified thread architecture. It is a compatibility stack made of overlapping systems:

1. Marketplace request tables and request-local messages
2. Shared inbox tables (`shared_message_threads`, `shared_messages`)
3. Verification request/event tables
4. Rental lifecycle event tables
5. Frontend-synthesized threads where the backend does not provide a canonical context thread

The main structural problem is that `shared_messages` is serving three jobs at once:

- human chat
- workflow event timeline
- thread grouping source

That makes the system hard to reason about, causes duplicated logic, and forces the frontend to invent “thread-like” experiences when the database does not provide a real context thread.

## Current System Map

### 1. `shared_message_threads`

Purpose today:

- Stores inbox/thread state
- Stores sender/recipient endpoints
- Stores some workflow hints like `priority`, `waiting_on`, `resolved_at`

Current reality:

- Built around `thread_key` and direct participants
- Not originally modeled around canonical business context
- Context information is partial and inferred from `family`, `thread_type`, `entity_type`, and `entity_id`

Observed issues:

- Sender/recipient centric model does not scale to multi-participant or system-owned threads
- Context identity is not enforced
- Duplicate threads can exist for the same real-world request or verification journey

### 2. `shared_messages`

Purpose today:

- Shared message stream for inbox UI
- Chat history between participants
- Storage for many system workflow events

Current reality:

- Stores event-like messages such as:
  - `submission_event`
  - `approval_event`
  - `rejection_event`
  - `system_event`
- API thread grouping still starts from this table

Observed issues:

- Human chat and system timeline are mixed together
- Event semantics are embedded in message metadata instead of a dedicated event model
- Thread existence often depends on whether messages exist, not whether the real-world context exists

### 3. `app_booking_requests`

Purpose today:

- Real marketplace request context
- Correct domain object for owner/renter journey

Observed issues:

- `request_reference`, `thread_key`, and `thread_id` were added later
- Earlier flows created requests without reliable thread linkage
- Request history can live in both `app_booking_messages` and `shared_messages`

### 4. `app_booking_messages`

Purpose today:

- Legacy marketplace request-local message log

Observed issues:

- Duplicates `shared_messages` for the same business context
- Exists as compatibility storage, not a clean long-term architecture

### 5. `verification_requests`

Purpose today:

- Document-level verification submissions

Observed issues:

- Correct at document granularity, but not the right thread granularity
- One user or vehicle verification journey spans multiple rows

### 6. `verification_events`

Purpose today:

- Correct verification status change event table

Observed issues:

- Good event model exists, but inbox UI still depends heavily on `shared_messages`
- Verification state is duplicated between `verification_events` and `shared_messages`

### 7. `rental_events`

Purpose today:

- Correct rental lifecycle event table

Observed issues:

- Not fully unified into the thread experience
- Rental threads are still often synthesized in the frontend

## Service Layer Findings

### `api/messages.js`

Current behavior:

- Reads raw `shared_messages`
- Groups them into threads in code
- Optionally merges state from `shared_message_threads`
- Adds “state-only” threads when thread state exists but messages do not

Impact:

- Messages are still the primary source of truth
- Thread state is secondary
- Context is inferred after the fact

### `api/_lib/publicBookingHandler.js`

Current behavior:

- Creates marketplace requests
- Tries to create canonical shared thread state
- Tries to sync participants
- Writes opening submission event to shared messages
- Falls back to `app_booking_messages` when needed

Impact:

- New marketplace requests are healthier than before
- But the flow is still compatibility-heavy and depends on optional schema availability

### `api/verifications.js`

Current behavior:

- Creates `verification_requests`
- Writes to `verification_events`
- Also writes verification timeline entries into `shared_messages`

Impact:

- Verification already has a real event system
- But the inbox still doubles it into the message table

### `src/services/MessageCenterService.js`

Current behavior:

- Builds synthetic threads for:
  - rentals
  - tours
  - verification summary
  - marketplace owner/customer views

Impact:

- UI can look coherent even when DB thread architecture is incomplete
- But the product is no longer showing only real threads

## Brutal Problem List

1. There is no single canonical thread model in production.
2. `shared_messages` is overloaded as chat, event store, and thread grouping source.
3. `shared_message_threads` is not truly context-first.
4. Marketplace uses both `app_booking_messages` and `shared_messages`.
5. Verification uses both `verification_events` and `shared_messages`.
6. Rental lifecycle events exist, but rental messaging is not canonically thread-based yet.
7. Frontend still fabricates threads when canonical ones are missing.
8. Duplicate thread cleanup exists as repair logic, proving duplication has already happened in production.
9. Event semantics are hidden in message metadata rather than represented in a dedicated thread timeline model.
10. Participant modeling is incomplete and not yet a guaranteed foundation everywhere.

## Target Model

Each thread should represent one real-world context:

- `request`
- `verification`
- `rental`

Each thread should expose:

- `id`
- `thread_key`
- `context_type`
- `context_id`
- `participants`
- `workflow_status`
- `visibility_scope`
- `timeline`

The timeline should be composed of:

- `thread_events` for system/state history
- `shared_messages` for human chat

## Safe Refactor Direction

### Phase 1

Non-destructively evolve `shared_message_threads` into a canonical context table:

- add context fields
- keep `thread_key`
- keep sender/recipient fields temporarily

### Phase 2

Create a first-class `shared_message_participants` table:

- backfill from sender/recipient
- enrich from domain ownership tables

### Phase 3

Introduce `thread_events`:

- do not replace `shared_messages`
- use events for system updates
- keep messages for human chat

### Phase 4

Normalize one active thread per context:

- marketplace request -> one thread
- verification case -> one thread
- rental -> one thread

### Phase 5

Remove frontend thread fabrication once backend canonical threads exist for all supported contexts.

## Step 1 Conclusion

The system should not be rebuilt from scratch.

It should be normalized in place by:

1. making thread context explicit
2. separating events from messages
3. backfilling canonical thread ownership
4. removing synthetic frontend thread creation over time
