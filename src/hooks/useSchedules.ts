import { useState, useEffect, useCallback, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  getDoctorSchedules,
  getFormattedSchedule,
  upsertSchedule,
  deleteSchedule,
  toggleDayAvailability,
  createDefaultSchedule,
  DoctorSchedule,
  ScheduleInput,
} from '@/services/scheduleService';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { AppLanguage, useLanguage } from '@/contexts/LanguageContext';
import { localeForLanguage } from '@/lib/locale';

/**
 * Hook to fetch and manage doctor schedules
 */
export const useSchedules = (doctorId: string | undefined) => {
  const queryClient = useQueryClient();
  const autoSeedAttemptedRef = useRef<Set<string>>(new Set());
  const { t, language } = useLanguage();

  // Real-time subscription for schedule changes
  useEffect(() => {
    if (!doctorId) return;

    const channel = supabase
      .channel(`doctor-schedules-${doctorId}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'doctor_schedules',
          filter: `doctor_id=eq.${doctorId}`
        },
        () => {
          queryClient.invalidateQueries({ queryKey: ['schedules', doctorId] });
          queryClient.invalidateQueries({ queryKey: ['schedules-formatted', doctorId] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [doctorId, queryClient]);

  // Fetch raw schedules
  const schedulesQuery = useQuery({
    queryKey: ['schedules', doctorId],
    queryFn: () => getDoctorSchedules(doctorId!),
    enabled: !!doctorId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Fetch formatted schedule for display
  const formattedQuery = useQuery({
    queryKey: ['schedules-formatted', doctorId],
    queryFn: () => getFormattedSchedule(doctorId!),
    enabled: !!doctorId,
    staleTime: 5 * 60 * 1000,
  });

  // Backfill defaults for existing doctors who have never configured availability.
  useEffect(() => {
    if (!doctorId || !schedulesQuery.isSuccess) return;
    if ((schedulesQuery.data || []).length > 0) return;
    if (autoSeedAttemptedRef.current.has(doctorId)) return;
    autoSeedAttemptedRef.current.add(doctorId);

    createDefaultSchedule(doctorId)
      .then(() => {
        queryClient.invalidateQueries({ queryKey: ['schedules', doctorId] });
        queryClient.invalidateQueries({ queryKey: ['schedules-formatted', doctorId] });
        queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      })
      .catch((error) => {
        console.error('Error auto-seeding default schedule:', error);
      });
  }, [doctorId, schedulesQuery.data, schedulesQuery.isSuccess, queryClient]);

  // Mutation for upserting schedule
  const upsertMutation = useMutation({
    mutationFn: (schedule: ScheduleInput) =>
      upsertSchedule(doctorId!, schedule),
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['schedules', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['schedules-formatted', doctorId] });
      // Also invalidate available-slots for patients to see updated availability
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('scheduleEditor.toast.updatedForDay', 'Schedule updated for {day}').replace('{day}', getDayName(data.day_of_week, language)),
      });
    },
    onError: (error) => {
      console.error('Error updating schedule:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('scheduleEditor.toast.failedUpdate', 'Failed to update schedule'),
        variant: 'destructive',
      });
    },
  });

  // Mutation for deleting schedule
  const deleteMutation = useMutation({
    mutationFn: (scheduleId: string) =>
      deleteSchedule(doctorId!, scheduleId),
    onSuccess: (_, scheduleId) => {
      queryClient.invalidateQueries({ queryKey: ['schedules', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['schedules-formatted', doctorId] });
      // Also invalidate available-slots for patients to see updated availability
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('scheduleEditor.toast.removed', 'Schedule removed'),
      });
    },
    onError: (error) => {
      console.error('Error deleting schedule:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('scheduleEditor.toast.failedRemove', 'Failed to delete schedule'),
        variant: 'destructive',
      });
    },
  });

  // Mutation for toggling availability
  const toggleMutation = useMutation({
    mutationFn: ({ dayOfWeek, isAvailable }: { dayOfWeek: number; isAvailable: boolean }) =>
      toggleDayAvailability(doctorId!, dayOfWeek, isAvailable),
    onSuccess: (data, { dayOfWeek, isAvailable }) => {
      // Invalidate doctor's schedules cache
      queryClient.invalidateQueries({ queryKey: ['schedules', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['schedules-formatted', doctorId] });
      
      // IMPORTANT: Also invalidate the available-slots cache used by patients
      // This ensures patients see the updated availability immediately
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      
      toast({
        title: t('common.success', 'Success'),
        description: t('scheduleEditor.toast.availabilityMarked', '{day} marked as {status}')
          .replace('{day}', getDayName(dayOfWeek, language))
          .replace('{status}', isAvailable ? t('scheduleEditor.toast.available', 'available') : t('scheduleEditor.toast.unavailable', 'unavailable')),
      });
    },
    onError: (error) => {
      console.error('Error toggling availability:', error);
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      toast({
        title: t('common.error', 'Error'),
        description: `${t('scheduleEditor.toast.failedAvailabilityPrefix', 'Failed to update availability')}: ${errorMsg}`,
        variant: 'destructive',
      });
    },
  });

  // Mutation for creating default schedule
  const createDefaultMutation = useMutation({
    mutationFn: () => createDefaultSchedule(doctorId!),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['schedules', doctorId] });
      queryClient.invalidateQueries({ queryKey: ['schedules-formatted', doctorId] });
      // Also invalidate available-slots for patients to see updated availability
      queryClient.invalidateQueries({ queryKey: ['available-slots'] });
      toast({
        title: t('common.success', 'Success'),
        description: t('scheduleEditor.toast.defaultCreated', 'Default schedule created (9 AM - 11 PM)'),
      });
    },
    onError: (error) => {
      console.error('Error creating default schedule:', error);
      toast({
        title: t('common.error', 'Error'),
        description: t('scheduleEditor.toast.failedDefaultCreate', 'Failed to create default schedule'),
        variant: 'destructive',
      });
    },
  });

  return {
    // Queries
    schedules: schedulesQuery.data || [],
    formattedSchedule: formattedQuery.data || [],
    isLoading: schedulesQuery.isLoading || formattedQuery.isLoading,
    error: schedulesQuery.error || formattedQuery.error,

    // Mutations (async variants where appropriate)
    upsertSchedule: upsertMutation.mutateAsync,
    deleteSchedule: deleteMutation.mutateAsync,
    toggleAvailability: toggleMutation.mutate,
    createDefaultSchedule: createDefaultMutation.mutate,

    // Mutation states
    isUpdating: upsertMutation.isPending,
    isDeleting: deleteMutation.isPending,
    isToggling: toggleMutation.isPending,
    isCreatingDefault: createDefaultMutation.isPending,
  };
};

// Helper function to get day name
const getDayName = (dayOfWeek: number, language: AppLanguage): string => {
  const safeDay = Number.isInteger(dayOfWeek) ? Math.min(Math.max(dayOfWeek, 0), 6) : 0;
  const utcDate = new Date(Date.UTC(2023, 0, 1 + safeDay));
  return new Intl.DateTimeFormat(localeForLanguage(language), { weekday: 'long' }).format(utcDate);
};
