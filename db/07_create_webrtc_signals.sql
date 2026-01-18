-- Create webrtc_signals table for WebRTC signaling
CREATE TABLE IF NOT EXISTS webrtc_signals (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  session_id UUID NOT NULL REFERENCES consultation_sessions(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL,
  signal_data JSONB NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Create index for efficient querying
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_session_id ON webrtc_signals(session_id);
CREATE INDEX IF NOT EXISTS idx_webrtc_signals_created_at ON webrtc_signals(created_at);

-- Enable RLS
-- ALTER TABLE webrtc_signals ENABLE ROW LEVEL SECURITY;

-- The RLS policies below are too restrictive for Supabase's real-time service to work correctly.
-- This prevents WebRTC signaling and causes the "waiting for participant" issue.
-- RLS has been disabled to fix this.
-- For a more secure long-term solution, please re-enable RLS and
-- configure broadcasting in your Supabase project settings (Database -> Replication).

-- Create RLS policies
/*
CREATE POLICY "Users can insert their own signals" ON webrtc_signals
  FOR INSERT WITH CHECK (auth.uid() = sender_id);

CREATE POLICY "Users can view signals for their sessions" ON webrtc_signals
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM consultation_sessions cs
      WHERE cs.id = session_id
      AND (cs.patient_id = auth.uid() OR cs.doctor_id = auth.uid())
    )
  );
*/