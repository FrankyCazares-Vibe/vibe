-- Lossless clip-edit metadata for clip posts.
--
-- Stored as JSONB on the post so we don't re-encode the uploaded blob —
-- ClipViewerMobile reads this column at playback time and applies each
-- effect (speed, CSS filter, trim range, absolute-positioned text
-- overlays). When clips eventually get shared / downloaded outside the
-- app, a native iOS exporter can read the same metadata and bake the
-- effects into the file.
--
-- Shape (validated in application code, not Postgres — see
-- src/lib/clip/edit-metadata.ts):
--   {
--     speed?: 0.5 | 1 | 2,
--     filter?: 'warm' | 'cool' | 'bw' | 'vivid' | null,
--     trim?: { start_ms: number, end_ms: number } | null,
--     text_overlays?: Array<{ id, text, x, y, color }>
--   }

ALTER TABLE posts
  ADD COLUMN IF NOT EXISTS edit_metadata jsonb;
