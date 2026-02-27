SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename IN ('patient_wallet', 'patient_wallet_transactions', 'appointments');
