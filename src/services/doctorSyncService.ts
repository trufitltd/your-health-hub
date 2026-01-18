import { supabase } from '@/integrations/supabase/client';

/**
 * Service for syncing doctor data between auth and doctors table
 */
export const doctorSyncService = {
  /**
   * Manually sync a doctor from auth.users to doctors table
   * Called automatically on signup, but can be used manually if needed
   */
  async syncDoctorProfile(userId: string): Promise<boolean> {
    try {
      // Get user data from auth
      const { data: { user }, error: userError } = await supabase.auth.admin.getUserById(userId);
      
      if (userError || !user) {
        console.error('User not found:', userError);
        return false;
      }

      // Check if user is a doctor
      const role = user.user_metadata?.role;
      if (role !== 'doctor') {
        console.warn('User is not a doctor, skipping sync');
        return false;
      }

      // Insert or update doctor profile
      const { error } = await supabase
        .from('doctors')
        .upsert({
          id: user.id,
          name: user.user_metadata?.full_name || user.email || 'Doctor',
          email: user.email,
          is_active: true,
        }, {
          onConflict: 'id',
        });

      if (error) {
        console.error('Error syncing doctor profile:', error);
        return false;
      }

      console.log('Doctor profile synced successfully:', user.id);
      return true;
    } catch (error) {
      console.error('Error in syncDoctorProfile:', error);
      return false;
    }
  },

  /**
   * Sync all doctors from auth to doctors table
   * Useful for initial setup or recovery
   */
  async syncAllDoctors(): Promise<{ success: number; failed: number }> {
    try {
      // Get all doctor users from auth
      const { data: { users }, error: usersError } = await supabase.auth.admin.listUsers();

      if (usersError || !users) {
        console.error('Error fetching users:', usersError);
        return { success: 0, failed: 0 };
      }

      // Filter doctors
      const doctors = users.filter(u => u.user_metadata?.role === 'doctor');

      let success = 0;
      let failed = 0;

      // Sync each doctor
      for (const doctor of doctors) {
        const synced = await this.syncDoctorProfile(doctor.id);
        if (synced) {
          success++;
        } else {
          failed++;
        }
      }

      console.log(`Sync complete: ${success} success, ${failed} failed`);
      return { success, failed };
    } catch (error) {
      console.error('Error in syncAllDoctors:', error);
      return { success: 0, failed: 0 };
    }
  },

  /**
   * Get all synced doctors
   */
  async getAllDoctors() {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching doctors:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Get a specific doctor's profile
   */
  async getDoctorProfile(doctorId: string) {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('id', doctorId)
      .single();

    if (error) {
      console.error('Error fetching doctor profile:', error);
      return null;
    }

    return data;
  },

  /**
   * Update doctor profile
   */
  async updateDoctorProfile(doctorId: string, updates: any) {
    const { data, error } = await supabase
      .from('doctors')
      .update({
        ...updates,
        updated_at: new Date().toISOString(),
      })
      .eq('id', doctorId)
      .select()
      .single();

    if (error) {
      console.error('Error updating doctor profile:', error);
      return null;
    }

    return data;
  },

  /**
   * Activate/deactivate a doctor
   */
  async setDoctorActive(doctorId: string, isActive: boolean) {
    return this.updateDoctorProfile(doctorId, { is_active: isActive });
  },

  /**
   * Set doctor specialty
   */
  async setDoctorSpecialty(doctorId: string, specialty: string) {
    return this.updateDoctorProfile(doctorId, { specialty });
  },

  /**
   * Set doctor bio
   */
  async setDoctorBio(doctorId: string, bio: string) {
    return this.updateDoctorProfile(doctorId, { bio });
  },

  /**
   * Get doctors by specialty
   */
  async getDoctorsBySpecialty(specialty: string) {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .eq('specialty', specialty)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error fetching doctors by specialty:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Search doctors by name
   */
  async searchDoctors(query: string) {
    const { data, error } = await supabase
      .from('doctors')
      .select('*')
      .ilike('name', `%${query}%`)
      .eq('is_active', true)
      .order('name');

    if (error) {
      console.error('Error searching doctors:', error);
      return [];
    }

    return data || [];
  },

  /**
   * Check if a doctor profile exists
   */
  async doctorProfileExists(doctorId: string): Promise<boolean> {
    const { data, error } = await supabase
      .from('doctors')
      .select('id')
      .eq('id', doctorId)
      .single();

    if (error && error.code === 'PGRST116') {
      // Not found
      return false;
    }

    return !!data;
  },
};
