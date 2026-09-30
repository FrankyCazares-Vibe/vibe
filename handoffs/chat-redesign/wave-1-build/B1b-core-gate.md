# B1b-core gate (Sept 29, after repair round 1)

Read-only gate. The only file this gate wrote is this one.

**Result: PASS.** Two things for the orchestrator at the bottom; neither fails the gate.

## The batch's files

- `src/lib/chat/rooms.ts` (B0's stub filled)
- `src/lib/messages/channel-access.ts` (`ensureMember` only)

## Checks

| check | command | result |
|---|---|---|
| typecheck, repo-wide | `npm run typecheck` | exit 0, no error in any file |
| tests | `npm test` | exit 0: 1374 tests, 1374 pass, 0 fail, 0 skipped |
| lint, `rooms.ts` | `npx eslint src/lib/chat/rooms.ts` | exit 0, 0 errors, 0 warnings (at HEAD: 0 / 0) |
| lint, `channel-access.ts` | `npx eslint src/lib/messages/channel-access.ts` | exit 0, 0 errors, 0 warnings (at HEAD: 0 / 0) |
| files under `public/html` | none in this batch | `node --check` not needed |
| files changed | `git status --short` | the two files of the batch and nothing else |

`git status --short` in full:

```
 M src/lib/chat/rooms.ts
 M src/lib/messages/channel-access.ts
```

No untracked file, no file that belongs to another batch or to nobody. `git diff --stat`: `rooms.ts` 320 lines changed, `channel-access.ts` 36; 325 insertions, 31 deletions.

No typecheck error in another batch's file either, so there was nothing to wait for and re-run.

## Scope, read from the diff

- `rooms.ts`: the four signatures of contract 14.4 are kept as typed:
  - `loadRoom(channelId: string): Promise<Room | null>` (line 130)
  - `canPost(client, channelId, userId, rootId: string | null): Promise<boolean>` (line 260)
  - `filterRoomReaders(channelId: string, userIds: string[]): Promise<string[]>` (line 281)
  - `clubRole(orgId: string, userId: string): Promise<ClubRole | null>` (line 327)
- `channel-access.ts`: two import lines added at the top, and the body of `ensureMember`. The `ChannelAccess` type, the dm / group branch and the media helpers are as they were at HEAD.
- Nothing imports `rooms.ts` yet, so nothing else can be broken by it today.
- Five files import `channel-access.ts` (the messages route, the media route, users search, the upload-url route, `message-read.ts`). All still typecheck.

## For the orchestrator (not failures)

1. **Two exports beyond the contract's four.** `rooms.ts` also exports `canPostAnswer` (line 219) and the type `CanPostAnswer` (line 189), added in repair round 1 so that a route can tell a refusal from a failed read and answer 503 `try_again` (14.4). The name is not in contract section 8. The repair notes ask for a yes or a no; on a no the export is deleted and the 503 sentence in 14.4 cannot be produced from `canPost` alone.
2. **No closed event room in the local data** (repair finding 8): the seed is B1a's. One local-only data step is needed before the integration pass so `room_closed` can be read over HTTP.

## What this gate did not do

It ran the four checks it was given. It did not repeat the builder's HTTP cases or the direct-call harness, and it made no request that writes.
