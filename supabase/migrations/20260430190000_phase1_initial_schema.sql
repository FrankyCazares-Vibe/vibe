-- P1-005 — Phase 1 schema per DOCS/PHASE_1.md
-- Apply via Supabase Dashboard → SQL Editor (single run), or: supabase db push
--
-- Prerequisites: no existing conflicting objects in public (especially public.users).
-- public.users.id references auth.users(id).

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

CREATE TABLE public.users (
  id uuid PRIMARY KEY REFERENCES auth.users (id) ON DELETE CASCADE,
  email text NOT NULL UNIQUE,
  school text NOT NULL DEFAULT '',
  school_email text UNIQUE,
  school_verified boolean NOT NULL DEFAULT false,
  name text NOT NULL DEFAULT '',
  handle text NOT NULL UNIQUE,
  year integer,
  major text NOT NULL DEFAULT '',
  department text NOT NULL DEFAULT '',
  bio text NOT NULL DEFAULT '',
  avatar_url text,
  banner_url text,
  resume_url text,
  interests text[] NOT NULL DEFAULT '{}',
  skills text[] NOT NULL DEFAULT '{}',
  looking_for text[] NOT NULL DEFAULT '{}',
  otto_answers jsonb NOT NULL DEFAULT '{}',
  voice_samples jsonb NOT NULL DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now(),
  last_active_at timestamptz
);

CREATE TABLE public.orgs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  handle text NOT NULL UNIQUE,
  name text NOT NULL,
  school text NOT NULL DEFAULT '',
  description text NOT NULL DEFAULT '',
  logo_url text,
  banner_url text,
  tags text[] NOT NULL DEFAULT '{}',
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  org_id uuid REFERENCES public.orgs (id) ON DELETE SET NULL,
  type text NOT NULL CHECK (type IN ('post', 'clip')),
  content text NOT NULL DEFAULT '',
  media_url text,
  media_thumbnail_url text,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE public.bookmark_collections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  post_id uuid NOT NULL REFERENCES public.posts (id) ON DELETE CASCADE,
  collection_id uuid REFERENCES public.bookmark_collections (id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (user_id, post_id)
);

CREATE TABLE public.connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  follower_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  following_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now (),
  CHECK (follower_id <> following_id),
  UNIQUE (follower_id, following_id)
);

CREATE TABLE public.org_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  org_id uuid NOT NULL REFERENCES public.orgs (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('officer', 'member', 'pledge')),
  joined_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (org_id, user_id)
);

CREATE TABLE public.channels (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  org_id uuid REFERENCES public.orgs (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN ('dm', 'group', 'org_channel', 'org_subchannel')
  ),
  parent_channel_id uuid REFERENCES public.channels (id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE public.channel_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  channel_id uuid NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  role text NOT NULL CHECK (role IN ('admin', 'member')),
  created_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (channel_id, user_id)
);

CREATE TABLE public.messages (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  channel_id uuid NOT NULL REFERENCES public.channels (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  content text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now ()
);

CREATE TABLE public.events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  org_id uuid REFERENCES public.orgs (id) ON DELETE SET NULL,
  creator_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  title text NOT NULL,
  description text NOT NULL DEFAULT '',
  starts_at timestamptz NOT NULL,
  ends_at timestamptz NOT NULL,
  location text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now (),
  CHECK (ends_at >= starts_at)
);

CREATE TABLE public.rsvps (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  event_id uuid NOT NULL REFERENCES public.events (id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  status text NOT NULL CHECK (status IN ('going', 'maybe', 'no')),
  created_at timestamptz NOT NULL DEFAULT now (),
  UNIQUE (event_id, user_id)
);

CREATE TABLE public.reminders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid (),
  user_id uuid NOT NULL REFERENCES public.users (id) ON DELETE CASCADE,
  type text NOT NULL CHECK (
    type IN ('event_reminder', 'deadline', 'custom')
  ),
  ref_id uuid NOT NULL,
  fires_at timestamptz NOT NULL,
  fired boolean NOT NULL DEFAULT false,
  message text NOT NULL DEFAULT ''
);

-- ---------------------------------------------------------------------------
-- Indexes (common lookup paths)
-- ---------------------------------------------------------------------------

CREATE INDEX idx_posts_user_created ON public.posts (user_id, created_at DESC);

CREATE INDEX idx_posts_org_created ON public.posts (org_id, created_at DESC)
WHERE
  org_id IS NOT NULL;

CREATE INDEX idx_connections_follower ON public.connections (follower_id);

CREATE INDEX idx_connections_following ON public.connections (following_id);

CREATE INDEX idx_bookmarks_user ON public.bookmarks (user_id);

CREATE INDEX idx_messages_channel_created ON public.messages (
  channel_id,
  created_at DESC
);

CREATE INDEX idx_events_starts ON public.events (starts_at);

CREATE INDEX idx_rsvps_event ON public.rsvps (event_id);

CREATE INDEX idx_reminders_user_fires ON public.reminders (user_id, fires_at)
WHERE
  fired = false;

-- ---------------------------------------------------------------------------
-- Auth: new user → public.users row (P1-006 may extend metadata mapping)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.handle_new_user ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  base_email text;
  derived_handle text;
BEGIN
  base_email := COALESCE(NEW.email, '');
  derived_handle := 'u' || REPLACE(NEW.id::text, '-', '');

  INSERT INTO public.users (
    id,
    email,
    handle,
    name
  )
  VALUES (
    NEW.id,
    base_email,
    derived_handle,
    COALESCE(
      NEW.raw_user_meta_data ->> 'full_name',
      NEW.raw_user_meta_data ->> 'name',
      split_part(base_email, '@', 1),
      'Member'
    )
  );

  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE PROCEDURE public.handle_new_user ();

-- ---------------------------------------------------------------------------
-- Row Level Security (refine in P1-006+; server routes may use service role)
-- ---------------------------------------------------------------------------

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.posts ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookmark_collections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.connections ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.orgs ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.org_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.channels ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.channel_members ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.events ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.rsvps ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.reminders ENABLE ROW LEVEL SECURITY;

-- Profiles: campus directory reads; users edit only their row.
CREATE POLICY "users_select_authenticated"
  ON public.users FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "users_insert_self"
  ON public.users FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = id);

CREATE POLICY "users_update_self"
  ON public.users FOR UPDATE TO authenticated
  USING (auth.uid () = id)
  WITH CHECK (auth.uid () = id);

CREATE POLICY "users_delete_self"
  ON public.users FOR DELETE TO authenticated
  USING (auth.uid () = id);

-- Posts: authenticated read/write; author/org flows tightened later.
CREATE POLICY "posts_select_authenticated"
  ON public.posts FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "posts_insert_authenticated"
  ON public.posts FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = user_id);

CREATE POLICY "posts_update_own"
  ON public.posts FOR UPDATE TO authenticated
  USING (auth.uid () = user_id)
  WITH CHECK (auth.uid () = user_id);

CREATE POLICY "posts_delete_own"
  ON public.posts FOR DELETE TO authenticated
  USING (auth.uid () = user_id);

-- Bookmarks & collections
CREATE POLICY "bookmark_collections_all_own"
  ON public.bookmark_collections FOR ALL TO authenticated
  USING (auth.uid () = user_id)
  WITH CHECK (auth.uid () = user_id);

CREATE POLICY "bookmarks_all_own"
  ON public.bookmarks FOR ALL TO authenticated
  USING (auth.uid () = user_id)
  WITH CHECK (auth.uid () = user_id);

-- Follow graph
CREATE POLICY "connections_select_authenticated"
  ON public.connections FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "connections_insert_follower"
  ON public.connections FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = follower_id);

CREATE POLICY "connections_delete_follower"
  ON public.connections FOR DELETE TO authenticated
  USING (auth.uid () = follower_id);

-- Orgs (public listing when is_public)
CREATE POLICY "orgs_select_visible"
  ON public.orgs FOR SELECT TO authenticated
  USING (is_public = true OR EXISTS (
    SELECT 1 FROM public.org_members m
    WHERE m.org_id = orgs.id AND m.user_id = auth.uid ()
  ));

CREATE POLICY "orgs_insert_authenticated"
  ON public.orgs FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "orgs_update_officer"
  ON public.orgs FOR UPDATE TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = orgs.id
        AND m.user_id = auth.uid ()
        AND m.role = 'officer'
    )
  );

-- Org members
CREATE POLICY "org_members_select_authenticated"
  ON public.org_members FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "org_members_insert_officer"
  ON public.org_members FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = org_members.org_id
        AND m.user_id = auth.uid ()
        AND m.role = 'officer'
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.org_members m2 WHERE m2.org_id = org_members.org_id
    )
  );

CREATE POLICY "org_members_delete_self_or_officer"
  ON public.org_members FOR DELETE TO authenticated
  USING (
    user_id = auth.uid ()
    OR EXISTS (
      SELECT 1 FROM public.org_members m
      WHERE m.org_id = org_members.org_id
        AND m.user_id = auth.uid ()
        AND m.role = 'officer'
    )
  );

-- Messaging (membership-based read/write)
CREATE POLICY "channels_insert_authenticated"
  ON public.channels FOR INSERT TO authenticated
  WITH CHECK (true);

CREATE POLICY "channels_select_member"
  ON public.channels FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = channels.id AND cm.user_id = auth.uid ()
    )
  );

CREATE POLICY "channel_members_select_member"
  ON public.channel_members FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = channel_members.channel_id
        AND cm.user_id = auth.uid ()
    )
  );

-- First member on empty channel; admins add others; DM allows second participant.
CREATE POLICY "channel_members_insert_bootstrap_or_admin"
  ON public.channel_members FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid ()
    AND (
      NOT EXISTS (
        SELECT 1 FROM public.channel_members x
        WHERE x.channel_id = channel_members.channel_id
      )
      OR EXISTS (
        SELECT 1 FROM public.channel_members cm
        WHERE cm.channel_id = channel_members.channel_id
          AND cm.user_id = auth.uid ()
          AND cm.role = 'admin'
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.channels ch
          WHERE ch.id = channel_members.channel_id AND ch.type = 'dm'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.channel_members self
          WHERE self.channel_id = channel_members.channel_id
            AND self.user_id = auth.uid ()
        )
        AND (
          SELECT COUNT(*)::int FROM public.channel_members m
          WHERE m.channel_id = channel_members.channel_id
        ) = 1
      )
      OR (
        EXISTS (
          SELECT 1 FROM public.channels ch
          WHERE ch.id = channel_members.channel_id AND ch.type = 'group'
        )
        AND NOT EXISTS (
          SELECT 1 FROM public.channel_members self
          WHERE self.channel_id = channel_members.channel_id
            AND self.user_id = auth.uid ()
        )
      )
    )
  );

CREATE POLICY "messages_select_member"
  ON public.messages FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = messages.channel_id
        AND cm.user_id = auth.uid ()
    )
  );

CREATE POLICY "messages_insert_member"
  ON public.messages FOR INSERT TO authenticated
  WITH CHECK (
    auth.uid () = user_id
    AND EXISTS (
      SELECT 1 FROM public.channel_members cm
      WHERE cm.channel_id = messages.channel_id
        AND cm.user_id = auth.uid ()
    )
  );

-- Events & RSVPs
CREATE POLICY "events_select_authenticated"
  ON public.events FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "events_insert_authenticated"
  ON public.events FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = creator_id);

CREATE POLICY "events_update_creator"
  ON public.events FOR UPDATE TO authenticated
  USING (auth.uid () = creator_id)
  WITH CHECK (auth.uid () = creator_id);

CREATE POLICY "events_delete_creator"
  ON public.events FOR DELETE TO authenticated
  USING (auth.uid () = creator_id);

CREATE POLICY "rsvps_select_authenticated"
  ON public.rsvps FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "rsvps_insert_own"
  ON public.rsvps FOR INSERT TO authenticated
  WITH CHECK (auth.uid () = user_id);

CREATE POLICY "rsvps_update_own"
  ON public.rsvps FOR UPDATE TO authenticated
  USING (auth.uid () = user_id)
  WITH CHECK (auth.uid () = user_id);

CREATE POLICY "rsvps_delete_own"
  ON public.rsvps FOR DELETE TO authenticated
  USING (auth.uid () = user_id);

-- Reminders
CREATE POLICY "reminders_all_own"
  ON public.reminders FOR ALL TO authenticated
  USING (auth.uid () = user_id)
  WITH CHECK (auth.uid () = user_id);
