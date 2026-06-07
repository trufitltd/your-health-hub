-- Create a SECURITY DEFINER RPC so admins can create consultation_sessions regardless of RLS
create or replace function public.admin_create_consultation_session(
  p_appointment_id uuid,
  p_patient_id uuid,
  p_doctor_id uuid,
  p_consultation_type text
) returns uuid
language plpgsql
security definer
as $$
declare
  new_id uuid;
begin
  insert into consultation_sessions (
    appointment_id, patient_id, doctor_id, consultation_type, status, started_at, ended_at, duration_seconds
  ) values (
    p_appointment_id, p_patient_id, p_doctor_id, p_consultation_type, 'ended', now(), now(), 0
  ) returning id into new_id;

  return new_id;
end;
$$;

grant execute on function public.admin_create_consultation_session(uuid, uuid, uuid, text) to authenticated;
