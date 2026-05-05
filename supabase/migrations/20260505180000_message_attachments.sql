-- Message attachments — share posts/clips into a DM or group.
-- One pair of columns covers both kinds (clips are posts with type='clip'),
-- so attachment_kind is a small CHECK and attachment_id references posts.id.
--
-- ON DELETE SET NULL on the post — if the original post is deleted the
-- shared bubble keeps the message text but the attachment renders as
-- "Post unavailable" rather than 500-ing the thread.

ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS attachment_kind text,
  ADD COLUMN IF NOT EXISTS attachment_id uuid;

ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_kind_check;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_attachment_kind_check
    CHECK (attachment_kind IS NULL OR attachment_kind IN ('post', 'clip'));

-- Add the FK as a separate ALTER so we can reuse IF NOT EXISTS semantics
-- via DROP CONSTRAINT first; ON DELETE SET NULL preserves the message row.
ALTER TABLE public.messages
  DROP CONSTRAINT IF EXISTS messages_attachment_id_fkey;
ALTER TABLE public.messages
  ADD CONSTRAINT messages_attachment_id_fkey
    FOREIGN KEY (attachment_id) REFERENCES public.posts (id) ON DELETE SET NULL;

-- Cheap "all messages with attachments" lookup if we ever want to count.
CREATE INDEX IF NOT EXISTS idx_messages_attachment
  ON public.messages (attachment_id)
  WHERE attachment_id IS NOT NULL;

-- Relaxed content NOT NULL? No — keep messages.content NOT NULL, but allow
-- empty string when attaching only. Existing DEFAULT '' behavior on text
-- columns isn't set, so the API must always provide content (even if '').
