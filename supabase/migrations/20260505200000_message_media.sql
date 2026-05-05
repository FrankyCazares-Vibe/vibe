-- Direct image/video uploads in DMs (paperclip in the composer).
-- Distinct from messages.attachment_id (which references a shared post or
-- clip from the user's library) — media_url is an ad-hoc upload made for
-- this specific message. Stored as an R2 object key, signed at read time.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS media_url text,
  ADD COLUMN IF NOT EXISTS media_kind text;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_media_kind_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_media_kind_check
    CHECK (media_kind IS NULL OR media_kind IN ('image', 'video'));
