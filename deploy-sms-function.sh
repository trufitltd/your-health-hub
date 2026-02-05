#!/usr/bin/env bash

# Manual SMS Edge Function Deployment
echo "🚀 Manually deploying SMS Edge Function..."

# Your project details
PROJECT_REF="bulvfrbnhaqsybrpsudy"
SUPABASE_URL="https://bulvfrbnhaqsybrpsudy.supabase.co"

echo "📋 Project: $PROJECT_REF"
echo "🌐 URL: $SUPABASE_URL"

# Try to deploy the function
echo "📦 Deploying send-sms function..."

# Method 1: Try with project ref
supabase functions deploy send-sms --project-ref $PROJECT_REF

if [ $? -eq 0 ]; then
    echo "✅ Function deployed successfully!"
else
    echo "❌ Deployment failed. Trying alternative method..."
    
    # Method 2: Try linking first
    echo "🔗 Attempting to link project..."
    supabase login
    supabase link --project-ref $PROJECT_REF
    
    if [ $? -eq 0 ]; then
        echo "✅ Project linked successfully!"
        echo "📦 Retrying function deployment..."
        supabase functions deploy send-sms
        
        if [ $? -eq 0 ]; then
            echo "✅ Function deployed successfully after linking!"
        else
            echo "❌ Function deployment still failed."
            echo "📝 Manual steps required:"
            echo "1. Go to https://supabase.com/dashboard/project/$PROJECT_REF/functions"
            echo "2. Create a new function called 'send-sms'"
            echo "3. Copy the contents of supabase/functions/send-sms/index.ts"
            echo "4. Set environment variables in the Supabase dashboard:"
            echo "   - AFRICASTALKING_API_KEY"
            echo "   - AFRICASTALKING_USERNAME"
            echo "   - AFRICASTALKING_FROM"
        fi
    else
        echo "❌ Project linking failed."
        echo "📝 Please deploy manually via Supabase dashboard:"
        echo "1. Go to https://supabase.com/dashboard/project/$PROJECT_REF/functions"
        echo "2. Create a new function called 'send-sms'"
        echo "3. Copy the contents of supabase/functions/send-sms/index.ts"
    fi
fi

echo ""
echo "🧪 After deployment, test with:"
echo "node sms-browser-test.js"
echo "or copy the contents of sms-browser-test.js into your browser console"