#!/bin/bash
# Fix WebRTC admission issue

FILE="/Users/mri/myedoctor/your-health-hub/src/components/consultation/ConsultationRoom.tsx"

# Create backup
cp "$FILE" "$FILE.backup"

# Replace the problematic section
sed -i '' '180,191s/setShouldInitializeWebRTC(true);/if (!webrtcInitializedRef.current) {\n                  setShouldInitializeWebRTC(true);\n                }/' "$FILE"

echo "Fix applied successfully"
