import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';

interface DoctorNotesPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  patientId: string;
  doctorId: string;
}

export function DoctorNotesPanel({
  isOpen,
  onClose,
  sessionId,
  patientId,
  doctorId
}: DoctorNotesPanelProps) {
  const [diagnosis, setDiagnosis] = useState('');
  const [prescriptions, setPrescriptions] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [followUpNotes, setFollowUpNotes] = useState('');
  const [isSaving, setIsSaving] = useState(false);

  const handleSaveNotes = async () => {
    if (!diagnosis.trim() && !prescriptions.trim() && !treatmentPlan.trim()) {
      toast({
        title: 'Empty Notes',
        description: 'Please add at least one note before saving.',
        variant: 'destructive'
      });
      return;
    }

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from('doctor_consultation_notes')
        .insert({
          session_id: sessionId,
          patient_id: patientId,
          doctor_id: doctorId,
          diagnosis: diagnosis.trim() || null,
          prescriptions: prescriptions.trim() || null,
          treatment_plan: treatmentPlan.trim() || null,
          follow_up_notes: followUpNotes.trim() || null
        });

      if (error) throw error;

      toast({
        title: 'Notes Saved',
        description: 'Consultation notes have been saved successfully.',
        duration: 3000
      });

      // Clear form
      setDiagnosis('');
      setPrescriptions('');
      setTreatmentPlan('');
      setFollowUpNotes('');
    } catch (err) {
      console.error('Error saving notes:', err);
      toast({
        title: 'Error',
        description: 'Failed to save consultation notes.',
        variant: 'destructive'
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: 'auto', opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2 }}
          className="w-80 sm:w-96 flex flex-col bg-[#252542] border-r border-white/10 overflow-hidden"
        >
          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <FileText className="w-4 h-4" />
              Consultation Notes
            </h3>
            <Button 
              variant="ghost" 
              size="icon" 
              className="w-8 h-8 text-white/70 hover:text-white"
              onClick={onClose}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* Content */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {/* Diagnosis */}
            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Diagnosis
              </label>
              <Textarea
                placeholder="Enter patient diagnosis..."
                value={diagnosis}
                onChange={(e) => setDiagnosis(e.target.value)}
                className="bg-[#1a1a2e] border-white/10 text-white placeholder-slate-500 focus:ring-primary resize-none h-20"
              />
            </div>

            {/* Prescriptions */}
            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Prescriptions
              </label>
              <Textarea
                placeholder="Enter prescriptions..."
                value={prescriptions}
                onChange={(e) => setPrescriptions(e.target.value)}
                className="bg-[#1a1a2e] border-white/10 text-white placeholder-slate-500 focus:ring-primary resize-none h-20"
              />
            </div>

            {/* Treatment Plan */}
            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Treatment Plan
              </label>
              <Textarea
                placeholder="Enter treatment plan..."
                value={treatmentPlan}
                onChange={(e) => setTreatmentPlan(e.target.value)}
                className="bg-[#1a1a2e] border-white/10 text-white placeholder-slate-500 focus:ring-primary resize-none h-20"
              />
            </div>

            {/* Follow-up Notes */}
            <div>
              <label className="text-sm font-medium text-white mb-2 block">
                Follow-up Notes
              </label>
              <Textarea
                placeholder="Enter follow-up instructions..."
                value={followUpNotes}
                onChange={(e) => setFollowUpNotes(e.target.value)}
                className="bg-[#1a1a2e] border-white/10 text-white placeholder-slate-500 focus:ring-primary resize-none h-20"
              />
            </div>
          </div>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 space-y-2">
            <Button
              onClick={handleSaveNotes}
              disabled={isSaving}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Notes'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-800"
            >
              Close
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
