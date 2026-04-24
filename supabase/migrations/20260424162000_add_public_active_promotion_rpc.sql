-- Public-safe promotion visibility RPC for unauthenticated pages.
-- Returns only non-sensitive fields needed for banner/countdown rendering.

DROP FUNCTION IF EXISTS public.public_get_active_promotion();

CREATE FUNCTION public.public_get_active_promotion()
RETURNS TABLE(
  promotion_first_n_free_limit INTEGER,
  promotion_ends_at TIMESTAMPTZ
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(ps.promotion_first_n_free_limit, 126)::INTEGER AS promotion_first_n_free_limit,
    ps.promotion_ends_at::TIMESTAMPTZ AS promotion_ends_at
  FROM public.platform_settings ps
  ORDER BY ps.updated_at DESC NULLS LAST
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.public_get_active_promotion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_active_promotion() TO anon, authenticated;

