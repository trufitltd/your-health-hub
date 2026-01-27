import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, FileText, User, Calendar, AlertTriangle, Pill } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Badge } from '@/components/ui/badge';

interface PatientFolder {
  id: string;
  patient_type: 'new' | 'returning';
  medical_history: string | null;
  allergies: string | null;
  current_medications: string | null;
  previous_diagnoses: string | null;
  created_at: string;
  updated_at: string;
}

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
  const [patientFolder, setPatientFolder] = useState<PatientFolder | null>(null);
  const [isLoadingFolder, setIsLoadingFolder] = useState(true);

  // Load patient folder on mount
  useEffect(() => {
    const loadPatientFolder = async () => {
      if (!isOpen || !patientId) return;
      
      setIsLoadingFolder(true);
      try {
        const { data, error } = await supabase
          .from('patient_folders')
          .select('*')
          .eq('patient_id', patientId)
          .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = no rows returned
          console.error('Error loading patient folder:', error);
        } else {
          setPatientFolder(data);
        }
      } catch (err) {
        console.error('Error loading patient folder:', err);
      } finally {
        setIsLoadingFolder(false);
      }
    };

    loadPatientFolder();
  }, [isOpen, patientId]);

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
          className="w-full sm:w-80 md:w-96 h-full max-h-screen flex flex-col bg-[#252542] border-r border-white/10 overflow-hidden"
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
          <ScrollArea className="flex-1 p-4">
            <div className="space-y-6">
              {/* Patient Medical History Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <User className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-white">Patient Medical History</h4>
                  {patientFolder && (
                    <Badge variant={patientFolder.patient_type === 'new' ? 'default' : 'secondary'} className="text-xs">
                      {patientFolder.patient_type === 'new' ? 'New Patient' : 'Returning Patient'}
                    </Badge>
                  )}
                </div>
                
                {isLoadingFolder ? (
                  <div className="text-slate-400 text-sm">Loading patient information...</div>
                ) : patientFolder ? (
                  <div className="space-y-3 text-sm">
                    {patientFolder.medical_history && (
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <FileText className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-300 font-medium">Medical History:</span>
                        </div>
                        <p className="text-slate-400 bg-[#1a1a2e] p-2 rounded text-xs">
                          {patientFolder.medical_history}
                        </p>
                      </div>
                    )}
                    
                    {patientFolder.allergies && (
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <AlertTriangle className="w-3 h-3 text-red-400" />
                          <span className="text-slate-300 font-medium">Allergies:</span>
                        </div>
                        <p className="text-red-200 bg-red-900/20 p-2 rounded text-xs">
                          {patientFolder.allergies}
                        </p>
                      </div>
                    )}
                    
                    {patientFolder.current_medications && (
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <Pill className="w-3 h-3 text-blue-400" />
                          <span className="text-slate-300 font-medium">Current Medications:</span>
                        </div>
                        <p className="text-blue-200 bg-blue-900/20 p-2 rounded text-xs">
                          {patientFolder.current_medications}
                        </p>
                      </div>
                    )}
                    
                    {patientFolder.previous_diagnoses && (
                      <div>
                        <div className="flex items-center gap-1 mb-1">
                          <Calendar className="w-3 h-3 text-slate-400" />
                          <span className="text-slate-300 font-medium">Previous Diagnoses:</span>
                        </div>
                        <p className="text-slate-400 bg-[#1a1a2e] p-2 rounded text-xs">
                          {patientFolder.previous_diagnoses}
                        </p>
                      </div>
                    )}
                    
                    {!patientFolder.medical_history && !patientFolder.allergies && 
                     !patientFolder.current_medications && !patientFolder.previous_diagnoses && (
                      <p className="text-slate-500 text-xs italic">No medical history available</p>
                    )}
                  </div>
                ) : (
                  <p className="text-slate-500 text-xs italic">No patient folder found</p>
                )}
              </div>
              
              <Separator className="bg-white/10" />
              
              {/* Consultation Notes Section */}
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <FileText className="w-4 h-4 text-primary" />
                  <h4 className="font-medium text-white">Consultation Notes</h4>
                </div>
                
                <div className="space-y-4">
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
              </div>
            </div>
          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t border-white/10 space-y-2 flex-shrink-0 bg-[#252542]">
            <Button
              onClick={handleSaveNotes}
              disabled={isSaving}
              className="w-full bg-green-600 hover:bg-green-700 text-white gap-2 min-h-[48px] touch-manipulation"
            >
              <Save className="w-4 h-4" />
              {isSaving ? 'Saving...' : 'Save Notes'}
            </Button>
            <Button
              onClick={onClose}
              variant="outline"
              className="w-full border-slate-600 text-slate-300 hover:bg-slate-800 min-h-[48px] touch-manipulation"
            >
              Close
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
