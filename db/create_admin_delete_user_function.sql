-- Create admin function to delete users
-- This function can only be called by admins and will delete a user and all related data

CREATE OR REPLACE FUNCTION admin_delete_user(user_id_to_delete UUID)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  result JSON;
BEGIN
  -- Delete from related tables (cascading will handle most, but we'll be explicit)
  DELETE FROM doctor_registrations WHERE user_id = user_id_to_delete;
  DELETE FROM patient_registrations WHERE user_id = user_id_to_delete;
  DELETE FROM doctors WHERE id = user_id_to_delete;
  DELETE FROM appointments WHERE patient_id = user_id_to_delete OR doctor_id = user_id_to_delete;
  DELETE FROM health_records WHERE patient_id = user_id_to_delete;
  DELETE FROM consultation_sessions WHERE patient_id = user_id_to_delete OR doctor_id = user_id_to_delete;
  DELETE FROM doctor_consultation_notes WHERE patient_id = user_id_to_delete OR doctor_id = user_id_to_delete;
  DELETE FROM patient_folders WHERE patient_id = user_id_to_delete;
  
  -- Delete from auth.users (this is the critical part that requires SECURITY DEFINER)
  DELETE FROM auth.users WHERE id = user_id_to_delete;
  
  result := json_build_object(
    'success', true,
    'message', 'User deleted successfully'
  );
  
  RETURN result;
EXCEPTION
  WHEN OTHERS THEN
    result := json_build_object(
      'success', false,
      'message', SQLERRM
    );
    RETURN result;
END;
$$;

-- Grant execute permission to authenticated users (admin check will be in RLS or app logic)
GRANT EXECUTE ON FUNCTION admin_delete_user(UUID) TO authenticated;
