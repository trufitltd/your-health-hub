// Simple SMS Test - Run this in browser console
// This bypasses the Supabase client and tests the Edge Function directly

async function testSMSDirectly() {
  console.log('🧪 Testing SMS Edge Function directly...');
  
  const url = 'https://bulvfrbnhaqsybrpsudy.supabase.co/functions/v1/send-sms';
  const anonKey = 'sb_publishable_HOCqyn9-VLdtKYmSrIU7jA_vUuiPxlY';
  
  const payload = {
    phoneNumber: '+254712345678',
    fullName: 'Test User',
    messageType: 'welcome'
  };
  
  try {
    console.log('📤 Sending request to:', url);
    console.log('📦 Payload:', payload);
    
    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${anonKey}`,
        'apikey': anonKey
      },
      body: JSON.stringify(payload)
    });
    
    console.log('📥 Response status:', response.status, response.statusText);
    
    const result = await response.text();
    console.log('📄 Raw response:', result);
    
    try {
      const jsonResult = JSON.parse(result);
      console.log('📊 Parsed response:', jsonResult);
      
      if (response.ok && jsonResult.success) {
        console.log('✅ SMS sent successfully!');
        return true;
      } else {
        console.log('❌ SMS failed:', jsonResult);
        return false;
      }
    } catch (parseError) {
      console.log('⚠️ Could not parse response as JSON:', parseError);
      console.log('Raw response was:', result);
      return false;
    }
    
  } catch (error) {
    console.error('💥 Request failed:', error);
    return false;
  }
}

// Test CORS preflight
async function testCORS() {
  console.log('🔍 Testing CORS...');
  
  try {
    const response = await fetch('https://bulvfrbnhaqsybrpsudy.supabase.co/functions/v1/send-sms', {
      method: 'OPTIONS'
    });
    
    console.log('CORS response:', response.status, response.statusText);
    console.log('CORS headers:', Object.fromEntries(response.headers.entries()));
    
    return response.ok;
  } catch (error) {
    console.error('CORS test failed:', error);
    return false;
  }
}

// Run both tests
async function runTests() {
  console.log('🚀 Starting SMS tests...');
  console.log('========================');
  
  const corsTest = await testCORS();
  console.log('CORS Test:', corsTest ? '✅ PASS' : '❌ FAIL');
  console.log('');
  
  const smsTest = await testSMSDirectly();
  console.log('SMS Test:', smsTest ? '✅ PASS' : '❌ FAIL');
  
  console.log('');
  console.log('📋 Summary:');
  console.log('===========');
  if (corsTest && smsTest) {
    console.log('🎉 All tests passed! SMS service is working.');
  } else {
    console.log('🔧 Some tests failed. Check the logs above.');
    if (!corsTest) {
      console.log('- CORS issue: Check Edge Function CORS headers');
    }
    if (!smsTest) {
      console.log('- SMS issue: Check Edge Function code and environment variables');
    }
  }
}

// Auto-run the tests
runTests();