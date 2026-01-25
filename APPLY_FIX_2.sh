#!/bin/bash
# Quick fix for WebRTC connection timeout issue
# File: src/services/webrtcService.ts
# Line: ~175

# This script shows the exact change needed to fix the connection stuck issue

echo "=== WebRTC Connection Timeout Fix ==="
echo ""
echo "Location: src/services/webrtcService.ts, line ~175"
echo ""
echo "CHANGE THIS:"
echo "============"
cat << 'EOF'
this.connectionTimeoutId = setTimeout(() => {
  if (this.peerConnection && 
      this.peerConnection.connectionState === 'connecting' && 
      this.iceRestartCount < this.maxIceRestarts) {
    console.warn('⚠️ Connection timeout - restarting ICE (attempt', this.iceRestartCount + 1, ')');
    this.iceRestartCount++;
    this.peerConnection.restartIce?.();
  }
}, 20000);
EOF

echo ""
echo "TO THIS:"
echo "========"
cat << 'EOF'
this.connectionTimeoutId = setTimeout(() => {
  if (this.peerConnection && 
      this.peerConnection.connectionState === 'connecting' &&
      this.peerConnection.iceConnectionState === 'failed' &&
      this.iceRestartCount < this.maxIceRestarts) {
    console.warn('⚠️ Connection timeout - restarting ICE (attempt', this.iceRestartCount + 1, ')');
    this.iceRestartCount++;
    this.peerConnection.restartIce?.();
  }
}, 20000);
EOF

echo ""
echo "KEY CHANGE: Add this condition:"
echo "  && this.peerConnection.iceConnectionState === 'failed'"
echo ""
echo "This ensures ICE restart only happens if ICE actually failed,"
echo "not just because connection is still in 'connecting' state."
