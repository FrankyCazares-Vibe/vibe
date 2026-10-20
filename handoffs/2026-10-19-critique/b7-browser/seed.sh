#!/usr/bin/env bash
# B7 (Oct 19, 2026): the named LOCAL test rows the browser scripts delete. Run from /Users/franciscocazares/vibe
# against the local dev server only. Afterwards: delete every row whose content starts "B7 test:" or that is a note
#   docker exec -i supabase_db_vibe psql -U postgres -d postgres -c "delete from public.messages where content like 'B7 test:%' or deleted_at is not null;"
# (notes hold no words, so the second half catches the rows the scripts turned into notes; check the count first).
set -euo pipefail
cd /Users/franciscocazares/vibe
B=$(node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs blake); A=$(node handoffs/chat-redesign/wave-1-build/tools/cookie.mjs avery)
post() { curl -s -X POST -H "Cookie: $1" -H "content-type: application/json" -H "origin: http://localhost:3000" "http://localhost:3000/api/me/threads/$2/messages" -d "$3" | python3 -c "import sys,json; d=json.load(sys.stdin); print((d.get('message') or {}).get('id'))"; }
DM=c1fd3fec-a59c-402f-8a90-5d9c36137bba; GR=98fb9cd2-8630-4c3d-88f2-c3e91182e32f; LO=3ea7db07-0b86-46f4-b7e2-b267b0461c04; EV=bed10830-5563-41a8-b875-625e12eb0dde; BO=d3c31eb8-01af-4654-9b47-034ddaea8b3f
D1=$(post "$B" $DM '{"content":"B7 test: dinner at 7?"}')
post "$A" $DM "{\"content\":\"B7 test: yes, 7 works\",\"parent_message_id\":\"$D1\"}"
post "$B" $GR '{"content":"B7 test: group hello from Blake"}'
post "$B" $LO '{"content":"B7 test: lounge hello from Blake"}'
post "$B" $EV '{"content":"B7 test: see you at game night"}'
P1=$(post "$A" $BO '{"content":"B7 test: Board announcement from Avery"}')
post "$B" $BO "{\"content\":\"B7 test: reply from Blake\",\"thread_root_id\":\"$P1\"}"
post "$B" $BO "{\"content\":\"B7 test: second reply from Blake\",\"thread_root_id\":\"$P1\"}"
post "$B" $DM '{"content":"B7 test: this one I will delete on desktop"}'
post "$B" $GR '{"content":"B7 test: group line for desktop delete"}'
post "$B" $LO '{"content":"B7 test: lounge line for desktop"}'
echo "interact.mjs needs its own rows (cancel/back, escape, two other-side checks): post them and put their ids in the script."
