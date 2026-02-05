#!/usr/bin/env bash

# SMS Service Supabase Setup Script - Twilio Version
echo "🚀 Setting up SMS Service with Twilio..."

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI is not installed. Please install it first:"
    echo "npm install -g supabase"
    exit 1
fi

# Check if .env file exists
if [ ! -f ".env" ]; then
    echo "❌ .env file not found. Please create one with your environment variables."
    exit 1
fi

# Load environment variables
source .env

# Check required environment variables
if [ -z "$VITE_TWILIO_ACCOUNT_SID" ] || [ -z "$VITE_TWILIO_AUTH_TOKEN" ] || [ -z "$VITE_TWILIO_PHONE_NUMBER" ]; then
    echo "❌ Missing required Twilio environment variables:"
    echo "   - VITE_TWILIO_ACCOUNT_SID"
    echo "   - VITE_TWILIO_AUTH_TOKEN"
    echo "   - VITE_TWILIO_PHONE_NUMBER"
    exit 1
fi

echo "✅ Environment variables found"

# Set Supabase secrets for the Edge Function
echo "🔐 Setting Supabase secrets..."

supabase secrets set TWILIO_ACCOUNT_SID="$VITE_TWILIO_ACCOUNT_SID"
supabase secrets set TWILIO_AUTH_TOKEN="$VITE_TWILIO_AUTH_TOKEN"
supabase secrets set TWILIO_PHONE_NUMBER="$VITE_TWILIO_PHONE_NUMBER"

echo "✅ Supabase secrets set successfully"

# Deploy the Edge Function
echo "📦 Deploying SMS Edge Function..."
supabase functions deploy send-sms

if [ $? -eq 0 ]; then
    echo "✅ SMS Edge Function deployed successfully"
else
    echo "❌ Failed to deploy SMS Edge Function"
    exit 1
fi

echo ""
echo "🎉 Twilio SMS Service setup completed successfully!"
echo ""
echo "📋 Summary:"
echo "   ✅ Twilio environment variables configured"
echo "   ✅ Supabase secrets set"
echo "   ✅ SMS Edge Function deployed"
echo ""
echo "📞 SMS Features Available:"
echo "   • Welcome SMS for new patient registrations"
echo "   • Appointment confirmation SMS"
echo "   • Appointment reminder SMS"
echo "   • Custom SMS messages"
echo "   • SMS history tracking"
echo ""