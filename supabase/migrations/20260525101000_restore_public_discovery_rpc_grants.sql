-- Restore public access for discovery RPCs used by Specialists page.
-- These were unintentionally revoked when anon execute was removed broadly.

REVOKE ALL ON FUNCTION public.list_public_doctors(INTEGER, INTEGER) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.list_public_doctors(INTEGER, INTEGER) TO anon, authenticated;

REVOKE ALL ON FUNCTION public.public_get_active_promotion() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.public_get_active_promotion() TO anon, authenticated;
