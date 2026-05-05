-- Group chats can have a member-uploaded photo. Stored as an R2 key in
-- channels.photo_url; the messages page renders it as the group avatar.
-- Anyone in the channel can change it (no admin gate for v1).

ALTER TABLE public.channels
  ADD COLUMN IF NOT EXISTS photo_url text;
