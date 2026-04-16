import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/sonner';
import { usePatientRegistration } from '@/hooks/usePatientRegistration';
import { smsService } from '@/services/smsService';
import { useQueryClient } from '@tanstack/react-query';

interface PatientRegistrationData {
  profilePicture?: File;
  fullName: string;
  gender: string;
  age: number;
  phoneNumber: string;
  email?: string;
  city: string;
  state: string;
  country: string;
  maritalStatus: string;
  emergencyContactName: string;
  emergencyContactPhone: string;
  identificationType: string;
  identificationNumber: string;
}

const clearPlaceholder = (value: string | null | undefined) => {
  const v = String(value || '').trim();
  const lowerV = v.toLowerCase();
  const placeholders = [
    'unknown', 'not provided', 'not-provided', 'n/a', 'na', 
    'pending update', '(pending update)', 'user', 'other', 
    'single', 'hospital_id', 'nin'
  ];
  return placeholders.includes(lowerV) ? '' : v;
};

export const PatientRegistration: React.FC = () => {
  const { data: existingRegistration, isLoading } = usePatientRegistration();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState<PatientRegistrationData>({
    fullName: '',
    gender: '',
    age: 0,
    phoneNumber: '',
    email: '',
    city: '',
    state: '',
    country: '',
    maritalStatus: '',
    emergencyContactName: '',
    emergencyContactPhone: '',
    identificationType: '',
    identificationNumber: ''
  });
  const [profilePicture, setProfilePicture] = useState<File | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    const loadUserData = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      
      if (existingRegistration) {
        // Load existing registration data
        setFormData({
          fullName: clearPlaceholder(existingRegistration.full_name),
          gender: clearPlaceholder(existingRegistration.gender),
          age: existingRegistration.age === 18 ? 0 : existingRegistration.age,
          phoneNumber: clearPlaceholder(existingRegistration.phone_number),
          email: existingRegistration.email || '',
          city: clearPlaceholder(existingRegistration.city),
          state: clearPlaceholder(existingRegistration.state),
          country: clearPlaceholder(existingRegistration.country),
          maritalStatus: clearPlaceholder(existingRegistration.marital_status),
          emergencyContactName: clearPlaceholder(existingRegistration.emergency_contact_name),
          emergencyContactPhone: clearPlaceholder(existingRegistration.emergency_contact_phone),
          identificationType: clearPlaceholder(existingRegistration.identification_type),
          identificationNumber: existingRegistration.identification_number === user.id ? '' : clearPlaceholder(existingRegistration.identification_number)
        });
      } else if (user?.user_metadata?.full_name) {
        // Load from user metadata if no registration exists
        setFormData(prev => ({
          ...prev,
          fullName: user.user_metadata.full_name,
          email: user.email || ''
        }));
      }
    };
    
    if (!isLoading) {
      loadUserData();
    }
  }, [existingRegistration, isLoading]);

  if (isLoading) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground">Loading registration data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (!existingRegistration) {
    return (
      <Card>
        <CardContent className="p-6">
          <div className="text-center py-8">
            <p className="text-muted-foreground">No registration data found. Registration is completed during sign-up.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const handleInputChange = (field: keyof PatientRegistrationData, value: string | number) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      setProfilePicture(e.target.files[0]);
    }
  };

  const uploadProfilePicture = async (file: File, userId: string): Promise<string | null> => {
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${userId}.${fileExt}`;
      const filePath = `${userId}/profile-pictures/${fileName}`;

      console.log('Uploading file:', { fileName, filePath, fileSize: file.size, fileType: file.type });

      const { data, error } = await supabase.storage
        .from('patient-files')
        .upload(filePath, file, { upsert: true });

      if (error) {
        console.error('Storage upload error:', error);
        toast.error(`Upload failed: ${error.message}`);
        return null;
      }

      console.log('Upload successful:', data);

      const { data: urlData } = supabase.storage
        .from('patient-files')
        .getPublicUrl(filePath);

      console.log('Public URL:', urlData.publicUrl);
      return urlData.publicUrl;
    } catch (err) {
      console.error('Upload error:', err);
      toast.error('Failed to upload profile picture');
      return null;
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);

    try {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        toast.error('Please log in to register');
        return;
      }

      let profilePictureUrl = null;
      if (profilePicture) {
        console.log('Attempting to upload profile picture:', profilePicture.name);
        profilePictureUrl = await uploadProfilePicture(profilePicture, user.id);
        console.log('Upload result:', profilePictureUrl);
        if (!profilePictureUrl) {
          toast.error('Profile picture upload failed, but registration will continue');
        }
      }

      // Insert or update patient registration data
      const payload = {
        user_id: user.id,
        profile_picture_url: profilePictureUrl,
        full_name: formData.fullName,
        gender: formData.gender,
        age: formData.age,
        phone_number: formData.phoneNumber,
        email: formData.email,
        city: formData.city,
        state: formData.state,
        country: formData.country,
        marital_status: formData.maritalStatus,
        emergency_contact_name: formData.emergencyContactName,
        emergency_contact_phone: formData.emergencyContactPhone,
        identification_type: formData.identificationType,
        identification_number: formData.identificationNumber
      };

      const { error } = await supabase.from('patient_registrations').update(payload).eq('user_id', user.id);

      if (error) throw error;

      toast.success('Registration updated successfully!');
      
      // Invalidate queries to refresh data
      queryClient.invalidateQueries({ queryKey: ['patient-registration'] });
      
      // Send update SMS
      try {
        console.log('📱 Attempting to send update SMS to:', formData.phoneNumber, 'for:', formData.fullName);
        const smsSuccess = await smsService.sendWelcomeSMS(formData.phoneNumber, formData.fullName);
        if (smsSuccess) {
          toast.success('Update notification sent to your phone!');
        }
      } catch (smsError) {
        console.error('SMS sending failed:', smsError);
      }

    } catch (error) {
      console.error('Registration error:', error);
      toast.error('Registration failed. Please try again.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Update Registration Information</CardTitle>
        <CardDescription>Edit your patient registration details</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4 sm:space-y-6">
        {/* Profile Picture */}
        <div className="space-y-2">
          <Label htmlFor="profilePicture" className="text-sm font-medium">Profile Picture (Optional)</Label>
          <Input
            id="profilePicture"
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            className="w-full"
          />
        </div>

        {/* Full Name */}
        <div className="space-y-2">
          <Label htmlFor="fullName" className="text-sm font-medium">Full Name *</Label>
          <Input
            id="fullName"
            value={formData.fullName}
            onChange={(e) => handleInputChange('fullName', e.target.value)}
            required
            className="w-full"
            placeholder="Your full name from signup will appear here"
          />
        </div>

        {/* Gender & Age */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label className="text-sm font-medium">Gender *</Label>
            <Select value={formData.gender} onValueChange={(value) => handleInputChange('gender', value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select gender" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
                <SelectItem value="other">Other</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="age" className="text-sm font-medium">Age *</Label>
            <Input
              id="age"
              type="number"
              value={formData.age || ''}
              onChange={(e) => handleInputChange('age', parseInt(e.target.value) || 0)}
              required
              className="w-full"
            />
          </div>
        </div>

        {/* Phone & Email */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div className="space-y-2">
            <Label htmlFor="phoneNumber" className="text-sm font-medium">Phone Number *</Label>
            <Input
              id="phoneNumber"
              type="tel"
              value={formData.phoneNumber}
              onChange={(e) => handleInputChange('phoneNumber', e.target.value)}
              required
              className="w-full"
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="email" className="text-sm font-medium">Email Address (Optional)</Label>
            <Input
              id="email"
              type="email"
              value={formData.email}
              onChange={(e) => handleInputChange('email', e.target.value)}
              className="w-full"
            />
          </div>
        </div>

        {/* Location */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Residential Location *</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            <div className="space-y-2">
              <Label htmlFor="city" className="text-xs text-muted-foreground">City</Label>
              <Input
                id="city"
                value={formData.city}
                onChange={(e) => handleInputChange('city', e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="state" className="text-xs text-muted-foreground">State</Label>
              <Input
                id="state"
                value={formData.state}
                onChange={(e) => handleInputChange('state', e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="country" className="text-xs text-muted-foreground">Country</Label>
              <Input
                id="country"
                value={formData.country}
                onChange={(e) => handleInputChange('country', e.target.value)}
                required
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Marital Status */}
        <div className="space-y-2">
          <Label className="text-sm font-medium">Marital Status *</Label>
          <Select value={formData.maritalStatus} onValueChange={(value) => handleInputChange('maritalStatus', value)}>
            <SelectTrigger className="w-full">
              <SelectValue placeholder="Select marital status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="single">Single</SelectItem>
              <SelectItem value="married">Married</SelectItem>
              <SelectItem value="divorced">Divorced</SelectItem>
              <SelectItem value="widowed">Widowed</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Emergency Contact */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Emergency Contact *</Label>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="emergencyContactName" className="text-xs text-muted-foreground">Contact Name</Label>
              <Input
                id="emergencyContactName"
                value={formData.emergencyContactName}
                onChange={(e) => handleInputChange('emergencyContactName', e.target.value)}
                required
                className="w-full"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="emergencyContactPhone" className="text-xs text-muted-foreground">Contact Phone</Label>
              <Input
                id="emergencyContactPhone"
                type="tel"
                value={formData.emergencyContactPhone}
                onChange={(e) => handleInputChange('emergencyContactPhone', e.target.value)}
                required
                className="w-full"
              />
            </div>
          </div>
        </div>

        {/* Identification */}
        <div className="space-y-4">
          <Label className="text-sm font-medium">Means of Identification *</Label>
          <div className="space-y-4">
            <Select value={formData.identificationType} onValueChange={(value) => handleInputChange('identificationType', value)}>
              <SelectTrigger className="w-full">
                <SelectValue placeholder="Select identification type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="nin">National Identification Number (NIN)</SelectItem>
                <SelectItem value="student_id">Student ID Card</SelectItem>
                <SelectItem value="passport">International Passport</SelectItem>
                <SelectItem value="drivers_license">National Driver's License</SelectItem>
                <SelectItem value="voters_card">Voter's Card</SelectItem>
                <SelectItem value="hospital_id">Hospital / HMO ID Card</SelectItem>
              </SelectContent>
            </Select>
            <div className="space-y-2">
              <Label htmlFor="identificationNumber" className="text-xs text-muted-foreground">Identification Number</Label>
              <Input
                id="identificationNumber"
                value={formData.identificationNumber}
                onChange={(e) => handleInputChange('identificationNumber', e.target.value)}
                required
                className="w-full"
              />
            </div>
          </div>
        </div>

          <Button type="submit" disabled={isSubmitting} className="w-full mt-6">
            {isSubmitting ? 'Updating...' : 'Update Registration'}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
};