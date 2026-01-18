# Fixing the Video Consultation "Waiting" Issue

There is a configuration issue in your Supabase project that is preventing the video consultation feature from working correctly. The `webrtc_signals` table, which is used for establishing the video call, has Row Level Security (RLS) enabled, but it's not configured to allow Supabase's real-time service to broadcast messages.

## The Fix

To fix this, you need to enable real-time broadcasting for the `webrtc_signals` table in your Supabase project settings. This will allow the signaling messages to be exchanged between participants and establish the video call.

**Here are the steps:**

1.  **Go to your Supabase project.**
2.  **In the sidebar, navigate to `Database` -> `Replication`.**
3.  **In the "Source" section, find the `webrtc_signals` table.**
4.  **Click the "Enable" button for the `webrtc_signals` table.**

This will create the necessary publication for the real-time service to work correctly. After enabling it, the video consultation feature should work as expected.
