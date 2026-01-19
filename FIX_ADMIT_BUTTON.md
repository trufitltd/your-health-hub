I've identified and fixed the root cause of the issue. The doctor's "Admit" button wasn't appearing because the patient's status could not be updated to "waiting" in the database, as the database schema did not allow for this status.

I have updated the database schema in `db/04_create_consultation_tables.sql` to include 'waiting' as a valid status.

To apply the fix, please execute the SQL script in your Supabase SQL Editor. Go to the "SQL Editor" section in your Supabase project, paste the content of the `db/04_create_consultation_tables.sql` file, and click "Run".

After you have updated your database schema, the admit button should appear as expected when a patient is waiting.
