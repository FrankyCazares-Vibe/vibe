-- Add a fourth notification type: 'connection' (mutual follow formed).
--
-- 'follow' fires every time someone follows you (one-way). 'connection'
-- fires when the new follow makes the relationship mutual — both parties
-- get a row so each side sees "you're now connected" in their feed.
--
-- The mutual case is detected by checking if the REVERSE row already
-- exists at INSERT time. If so, we know the new INSERT just completed
-- the mutual.

ALTER TABLE public.notifications
  DROP CONSTRAINT IF EXISTS notifications_type_check;

ALTER TABLE public.notifications
  ADD CONSTRAINT notifications_type_check
  CHECK (type IN ('follow', 'connection', 'like', 'comment'));

CREATE OR REPLACE FUNCTION public.notify_on_connection_insert ()
  RETURNS TRIGGER
  LANGUAGE plpgsql
  SECURITY DEFINER
  SET search_path = public
AS $$
DECLARE
  reverse_exists boolean;
BEGIN
  -- Defensive: schema CHECK already prevents follower=following, but
  -- guard anyway so an upstream change can't accidentally self-notify.
  IF NEW.follower_id = NEW.following_id THEN
    RETURN NEW;
  END IF;

  -- Always surface the one-way follow to the followee.
  INSERT INTO public.notifications (user_id, actor_id, type)
  VALUES (NEW.following_id, NEW.follower_id, 'follow');

  -- Did this INSERT complete a mutual? Reverse row = followee→follower.
  SELECT EXISTS (
    SELECT 1 FROM public.connections
    WHERE follower_id  = NEW.following_id
      AND following_id = NEW.follower_id
  ) INTO reverse_exists;

  IF reverse_exists THEN
    -- Notify both parties — this is the moment the connection forms.
    INSERT INTO public.notifications (user_id, actor_id, type)
    VALUES
      (NEW.follower_id,  NEW.following_id, 'connection'),
      (NEW.following_id, NEW.follower_id,  'connection');
  END IF;

  RETURN NEW;
END;
$$;
