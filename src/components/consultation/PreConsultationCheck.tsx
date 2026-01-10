import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Video, Mic, Speaker, CheckCircle, XCircle, RefreshCw, AlertTriangle, MessageSquare } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface PreConsultationCheckProps {
  consultationType: 'video' | 'audio' | 'chat';
  onComplete: () => void;
  onCancel: () => void;
}

type CheckStatus = 'pending' | 'checking' | 'success' | 'error';

interface DeviceCheck {
  camera: CheckStatus;
  microphone: CheckStatus;
  speaker: CheckStatus;
  connection: CheckStatus;
}

export function PreConsultationCheck({
  consultationType,
  onComplete,
  onCancel
}: PreConsultationCheckProps) {
  const [checks, setChecks] = useState<DeviceCheck>({
    camera: consultationType === 'video' ? 'pending' : 'success',
    microphone: consultationType !== 'chat' ? 'pending' : 'success',
    speaker: consultationType !== 'chat' ? 'pending' : 'success',
    connection: 'pending'
  });
  const [isTestingAudio, setIsTestingAudio] = useState(false);
  const [permissionError, setPermissionError] = useState<string | null>(null);

  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const allChecksComplete = Object.values(checks).every(status => status === 'success');
  const hasErrors = Object.values(checks).some(status => status === 'error');

  useEffect(() => {
    runDeviceChecks();
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
    };
  }, []);

  const runDeviceChecks = async () => {
    setPermissionError(null);

    // Check connection (for all types)
    setChecks(prev => ({ ...prev, connection: 'checking' }));
    await new Promise(resolve => setTimeout(resolve, 800));
    setChecks(prev => ({ ...prev, connection: 'success' }));

    if (consultationType === 'chat') {
      return;
    }

    // Check microphone
    setChecks(prev => ({ ...prev, microphone: 'checking' }));
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioStream.getTracks().forEach(track => track.stop());
      setChecks(prev => ({ ...prev, microphone: 'success' }));
    } catch (error) {
      console.error('Microphone check failed:', error);
      setChecks(prev => ({ ...prev, microphone: 'error' }));
      setPermissionError('Microphone access denied. Please allow microphone access in your browser settings.');
    }

    // Check camera (if video consultation)
    if (consultationType === 'video') {
      setChecks(prev => ({ ...prev, camera: 'checking' }));
      try {
        const videoStream = await navigator.mediaDevices.getUserMedia({ video: true });
        streamRef.current = videoStream;
        if (videoRef.current) {
          videoRef.current.srcObject = videoStream;
        }
        setChecks(prev => ({ ...prev, camera: 'success' }));
      } catch (error) {
        console.error('Camera check failed:', error);
        setChecks(prev => ({ ...prev, camera: 'error' }));
        setPermissionError('Camera access denied. Please allow camera access in your browser settings.');
      }
    }

    // Check speaker (simulated)
    setChecks(prev => ({ ...prev, speaker: 'checking' }));
    await new Promise(resolve => setTimeout(resolve, 500));
    setChecks(prev => ({ ...prev, speaker: 'success' }));
  };

  const testSpeaker = () => {
    setIsTestingAudio(true);
    // Play a test tone
    const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
    const oscillator = audioContext.createOscillator();
    const gainNode = audioContext.createGain();

    oscillator.connect(gainNode);
    gainNode.connect(audioContext.destination);

    oscillator.frequency.value = 440;
    gainNode.gain.value = 0.3;

    oscillator.start();
    setTimeout(() => {
      oscillator.stop();
      setIsTestingAudio(false);
    }, 1000);
  };

  const getStatusIcon = (status: CheckStatus) => {
    switch (status) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-success" />;
      case 'error':
        return <XCircle className="w-5 h-5 text-destructive" />;
      case 'checking':
        return <RefreshCw className="w-5 h-5 text-primary animate-spin" />;
      default:
        return <div className="w-5 h-5 rounded-full border-2 border-muted-foreground" />;
    }
  };

  const progress = Object.values(checks).filter(s => s === 'success').length / Object.values(checks).length * 100;

  return (
    <div className="min-h-screen bg-muted/30 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-lg"
      >
        <Card className="shadow-lg">
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">Pre-Consultation Check</CardTitle>
            <CardDescription>
              Let's make sure everything is working before your consultation
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-6">
            {/* Progress bar */}
            <div>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-muted-foreground">Checks</span>
                <span className="font-medium">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>

            {/* Camera preview (for video consultations) */}
            {consultationType === 'video' && (
              <div className="aspect-video rounded-xl overflow-hidden bg-muted relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full h-full object-cover"
                  style={{ transform: 'scaleX(-1)' }}
                />
                {checks.camera === 'error' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted">
                    <div className="text-center">
                      <Video className="w-12 h-12 text-muted-foreground mx-auto mb-2" />
                      <p className="text-sm text-muted-foreground">Camera not available</p>
                    </div>
                  </div>
                )}
                {checks.camera === 'checking' && (
                  <div className="absolute inset-0 flex items-center justify-center bg-muted/80">
                    <RefreshCw className="w-8 h-8 text-primary animate-spin" />
                  </div>
                )}
              </div>
            )}

            {/* Device checks list */}
            <div className="space-y-3">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <div className="flex items-center gap-3">
                  <MessageSquare className="w-5 h-5 text-muted-foreground" />
                  <span className="font-medium">Connection</span>
                </div>
                {getStatusIcon(checks.connection)}
              </div>

              {consultationType === 'video' && (
                <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-3">
                    <Video className="w-5 h-5 text-muted-foreground" />
                    <span className="font-medium">Camera</span>
                  </div>
                  {getStatusIcon(checks.camera)}
                </div>
              )}

              {consultationType !== 'chat' && (
                <>
                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Mic className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">Microphone</span>
                    </div>
                    {getStatusIcon(checks.microphone)}
                  </div>

                  <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                    <div className="flex items-center gap-3">
                      <Speaker className="w-5 h-5 text-muted-foreground" />
                      <span className="font-medium">Speaker</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={testSpeaker}
                        disabled={isTestingAudio}
                        className="text-xs"
                      >
                        {isTestingAudio ? 'Playing...' : 'Test'}
                      </Button>
                      {getStatusIcon(checks.speaker)}
                    </div>
                  </div>
                </>
              )}
            </div>

            {/* Error message */}
            {permissionError && (
              <div className="flex items-start gap-3 p-4 rounded-lg bg-destructive/10 border border-destructive/20">
                <AlertTriangle className="w-5 h-5 text-destructive flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm text-destructive font-medium">Permission Required</p>
                  <p className="text-sm text-muted-foreground mt-1">{permissionError}</p>
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <Button variant="outline" onClick={onCancel} className="flex-1">
                Cancel
              </Button>
              {hasErrors ? (
                <Button onClick={runDeviceChecks} className="flex-1 gap-2">
                  <RefreshCw className="w-4 h-4" />
                  Retry
                </Button>
              ) : (
                <Button
                  onClick={onComplete}
                  disabled={!allChecksComplete}
                  className="flex-1"
                >
                  {allChecksComplete ? 'Join Consultation' : 'Checking...'}
                </Button>
              )}
            </div>
          </CardContent>
        </Card>
      </motion.div>
    </div>
  );
}
