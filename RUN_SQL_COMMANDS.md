The `db/07_create_webrtc_signals.sql` file has been modified to disable Row Level Security on the `webrtc_signals` table. This is to fix the issue where the video consultation gets stuck in a "waiting" state.

You need to apply this change to your database. You can do this by running the content of the `db/07_create_webrtc_signals.sql` file in your Supabase SQL editor.

**Note:** This change disables a security feature. Please read the comments in the SQL file for more information.
