import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { smsService } from '@/services/smsService';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';

export const SMSTest: React.FC = () => {
  const [phoneNumber, setPhoneNumber] = useState('+254712345678');
  const [fullName, setFullName] = useState('Test User');
  const [isTesting, setIsTesting] = useState(false);
  const [testResult, setTestResult] = useState<string>('');
  const [session, setSession] = useState<any>(null);

  // Load current user session on mount
  useEffect(() => {
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      console.log('🧪 Current session:', data.session);
    };
    loadSession();
  }, []);

  const testSMS = async () => {
    if (!session) {
      toast.error('User is not logged in! Cannot send SMS.');
      setTestResult('User not logged in');
      return;
    }

    setIsTesting(true);
    setTestResult('Testing SMS...');

    try {
      console.log('Testing SMS with:', { phoneNumber, fullName });

      const result = await smsService.sendWelcomeSMS(phoneNumber, fullName);

      console.log('SMS Test Result:', result);

      if (result) {
        setTestResult('SMS sent successfully!');
        toast.success('SMS sent successfully!');
      } else {
        setTestResult('SMS failed to send');
        toast.error('SMS failed to send');
      }
    } catch (error) {
      console.error('SMS Test Error:', error);
      setTestResult(`Error: ${error}`);
      toast.error('SMS test failed');
    } finally {
      setIsTesting(false);
    }
  };

  return (
    <Card className="w-full max-w-md mx-auto">
      <CardHeader>
        <CardTitle>SMS Service Test</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1">Phone Number</label>
          <Input
            value={phoneNumber}
            onChange={(e) => setPhoneNumber(e.target.value)}
            placeholder="+254712345678"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Full Name</label>
          <Input
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            placeholder="Test User"
          />
        </div>

        <div className="space-y-2">
          <Button
            onClick={testSMS}
            disabled={isTesting}
            className="w-full"
          >
            {isTesting ? 'Testing...' : 'Test SMS Service'}
          </Button>
        </div>

        {testResult && (
          <div className="p-3 bg-gray-100 rounded text-sm">
            {testResult}
          </div>
        )}

        <div className="text-xs text-gray-500">
          Current session: {session ? JSON.stringify(session.user) : 'Not logged in'}
        </div>
      </CardContent>
    </Card>
  );
};
