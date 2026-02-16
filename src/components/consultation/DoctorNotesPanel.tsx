import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Stethoscope, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';

interface ClerkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  patientId: string;
  doctorId: string;
  initialView?: 'clerking' | 'folder';
  onClerkingSaved?: () => void;
}

export function DoctorNotesPanel({
  isOpen,
  onClose,
  sessionId,
  patientId,
  doctorId,
  initialView = 'clerking',
  onClerkingSaved
}: ClerkingPanelProps) {

  const storageKey = `clerking-${sessionId}`;
  const [activeView, setActiveView] = useState<'clerking' | 'folder'>('clerking');

  const [presentingComplaint, setPresentingComplaint] = useState('');
  const [historyOfPresentingComplaint, setHistoryOfPresentingComplaint] = useState('');
  const [pastMedicalHistory, setPastMedicalHistory] = useState('');
  const [pastDrugHistory, setPastDrugHistory] = useState('');
  const [allergies, setAllergies] = useState('');
  const [familyAndSocialHistory, setFamilyAndSocialHistory] = useState('');
  const [clinicalExamination, setClinicalExamination] = useState('');
  const [assessment, setAssessment] = useState('');
  const [treatmentPlan, setTreatmentPlan] = useState('');
  const [investigations, setInvestigations] = useState('');
  const [ePrescription, setEPrescription] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [isFolderLoading, setIsFolderLoading] = useState(false);
  const [folderData, setFolderData] = useState<Record<string, any> | null>(null);
  const [folderNotes, setFolderNotes] = useState<Array<{
    id: string;
    created_at: string;
    diagnosis: string | null;
    treatment_plan: string | null;
    follow_up_notes: string | null;
  }>>([]);

  const folderFieldOrder = [
    'patient_type',
    'presenting_complaint',
    'history_of_presenting_complaint',
    'past_medical_history',
    'past_drug_history',
    'allergies',
    'family_social_history',
    'clinical_examination',
    'assessment',
    'treatment_plan',
    'investigations',
    'e_prescription',
    'medical_history',
    'current_medications',
    'previous_diagnoses',
  ];

  const formatFolderFieldLabel = (field: string) =>
    field
      .split('_')
      .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
      .join(' ');

  useEffect(() => {
    if (isOpen) {
      setActiveView(initialView);
    }
  }, [isOpen, initialView]);

  /* ---------------- AUTO SAVE ---------------- */

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      setPresentingComplaint(parsed.presentingComplaint || '');
      setHistoryOfPresentingComplaint(parsed.historyOfPresentingComplaint || '');
      setPastMedicalHistory(parsed.pastMedicalHistory || '');
      setPastDrugHistory(parsed.pastDrugHistory || '');
      setAllergies(parsed.allergies || '');
      setFamilyAndSocialHistory(parsed.familyAndSocialHistory || '');
      setClinicalExamination(parsed.clinicalExamination || '');
      setAssessment(parsed.assessment || '');
      setTreatmentPlan(parsed.treatmentPlan || '');
      setInvestigations(parsed.investigations || '');
      setEPrescription(parsed.ePrescription || '');
    }
  }, [storageKey]);

  useEffect(() => {
    const timeout = setTimeout(() => {
      localStorage.setItem(
        storageKey,
        JSON.stringify({
          presentingComplaint,
          historyOfPresentingComplaint,
          pastMedicalHistory,
          pastDrugHistory,
          allergies,
          familyAndSocialHistory,
          clinicalExamination,
          assessment,
          treatmentPlan,
          investigations,
          ePrescription
        })
      );
    }, 500);

    return () => clearTimeout(timeout);
  }, [
    presentingComplaint,
    historyOfPresentingComplaint,
    pastMedicalHistory,
    pastDrugHistory,
    allergies,
    familyAndSocialHistory,
    clinicalExamination,
    assessment,
    treatmentPlan,
    investigations,
    ePrescription,
    storageKey
  ]);

  useEffect(() => {
    if (!isOpen || activeView !== 'folder') return;

    const loadPatientFolder = async () => {
      setIsFolderLoading(true);
      try {
        const [{ data: folder }, { data: notes }] = await Promise.all([
          supabase
            .from('patient_folders')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle(),
          supabase
            .from('doctor_consultation_notes')
            .select('id, created_at, diagnosis, treatment_plan, follow_up_notes')
            .eq('patient_id', patientId)
            .eq('doctor_id', doctorId)
            .order('created_at', { ascending: false })
            .limit(10)
        ]);

        setFolderData((folder as Record<string, any> | null) ?? null);
        setFolderNotes(
          (notes || []).map((note) => ({
            id: note.id as string,
            created_at: note.created_at as string,
            diagnosis: (note.diagnosis as string | null) ?? null,
            treatment_plan: (note.treatment_plan as string | null) ?? null,
            follow_up_notes: (note.follow_up_notes as string | null) ?? null
          }))
        );
      } catch (err) {
        console.error('Failed to load patient folder:', err);
        toast({
          title: 'Error',
          description: 'Unable to load patient folder.',
          variant: 'destructive'
        });
      } finally {
        setIsFolderLoading(false);
      }
    };

    loadPatientFolder();
  }, [isOpen, activeView, patientId, doctorId]);

  /* ---------------- SAVE ---------------- */

  const handleSaveClerking = async () => {

    if (
      !presentingComplaint.trim() &&
      !historyOfPresentingComplaint.trim() &&
      !pastMedicalHistory.trim() &&
      !pastDrugHistory.trim() &&
      !allergies.trim() &&
      !familyAndSocialHistory.trim() &&
      !clinicalExamination.trim() &&
      !assessment.trim() &&
      !treatmentPlan.trim() &&
      !investigations.trim() &&
      !ePrescription.trim()
    ) {
      toast({
        title: 'Empty Clerking',
        description: 'Please document at least one section.',
        variant: 'destructive'
      });
      return;
    }

    const composedNote = `
Presenting Complaint:
${presentingComplaint}

History of Presenting Complaint:
${historyOfPresentingComplaint}

Past Medical History:
${pastMedicalHistory}

Past Drug History:
${pastDrugHistory}

Allergies:
${allergies}

Family and Social History:
${familyAndSocialHistory}

Clinical Examination:
${clinicalExamination}

Assessment:
${assessment}

Treatment Plan:
${treatmentPlan}

Investigations:
${investigations}

E-Prescription:
${ePrescription}
`;

    setIsSaving(true);

    try {
      const { error } = await supabase
        .from('doctor_consultation_notes')
        .insert({
          session_id: sessionId,
          patient_id: patientId,
          doctor_id: doctorId,
          diagnosis: assessment.trim() || null,
          treatment_plan: treatmentPlan.trim() || null,
          prescriptions: ePrescription.trim() || null,
          follow_up_notes: composedNote
        });

      if (error) throw error;

      await supabase.rpc('doctor_append_to_patient_folder', {
        p_patient_id: patientId,
        p_note_text: composedNote,
        p_presenting_complaint: presentingComplaint.trim() || null,
        p_history_of_presenting_complaint: historyOfPresentingComplaint.trim() || null,
        p_past_medical_history: pastMedicalHistory.trim() || null,
        p_past_drug_history: pastDrugHistory.trim() || null,
        p_allergies: allergies.trim() || null,
        p_family_social_history: familyAndSocialHistory.trim() || null,
        p_clinical_examination: clinicalExamination.trim() || null,
        p_assessment: assessment.trim() || null,
        p_treatment_plan: treatmentPlan.trim() || null,
        p_investigations: investigations.trim() || null,
        p_e_prescription: ePrescription.trim() || null
      });

      localStorage.removeItem(storageKey);

      toast({
        title: 'Clerking Saved',
        description: 'Clinical notes recorded successfully.'
      });
      onClerkingSaved?.();

    } catch (err) {
      console.error(err);
      toast({
        title: 'Error',
        description: 'Failed to save clerking.',
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
          className="relative w-full sm:w-[36rem] md:w-[44rem] h-full flex flex-col bg-[#252542] border-r border-white/10"
        >
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            aria-label="Close sidebar"
            className="absolute top-3 right-3 z-50 sm:hidden text-white bg-black/40 border border-white/20 hover:bg-black/60 hover:text-white"
          >
            <X className="w-4 h-4" />
          </Button>

          {/* Header */}
          <div className="flex items-center justify-between p-4 border-b border-white/10">
            <h3 className="font-semibold text-white flex items-center gap-2">
              <Stethoscope className="w-4 h-4" />
              Clerking
            </h3>

            <Button
              variant="ghost"
              size="icon"
              onClick={onClose}
              aria-label="Close sidebar"
              className="text-white hover:bg-white/10 hover:text-white"
            >
              <X className="w-4 h-4" />
            </Button>
          </div>

          {/* View switcher */}
          <div className="p-3 flex gap-2 border-b border-white/10">
            <Button
              size="sm"
              variant={activeView === 'clerking' ? 'default' : 'outline'}
              onClick={() => setActiveView('clerking')}
              className="flex-1"
            >
              Add Clerking
            </Button>
            <Button
              size="sm"
              variant={activeView === 'folder' ? 'default' : 'outline'}
              onClick={() => setActiveView('folder')}
              className="flex-1"
            >
              <FolderOpen className="w-3 h-3 mr-1" />
              View Patient Folder
            </Button>
          </div>

          {activeView === 'clerking' ? (
            <>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">

                  <div>
                    <label className="text-xs text-slate-400">Presenting Complaint</label>
                    <Textarea
                      placeholder="Enter presenting complaint..."
                      value={presentingComplaint}
                      onChange={(e) => setPresentingComplaint(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">History of Presenting Complaint</label>
                    <Textarea
                      placeholder="Enter history of presenting complaint..."
                      value={historyOfPresentingComplaint}
                      onChange={(e) => setHistoryOfPresentingComplaint(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Past Medical History</label>
                    <Textarea
                      placeholder="Enter past medical history..."
                      value={pastMedicalHistory}
                      onChange={(e) => setPastMedicalHistory(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Past Drug History</label>
                    <Textarea
                      placeholder="Enter past drug history..."
                      value={pastDrugHistory}
                      onChange={(e) => setPastDrugHistory(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Allergies</label>
                    <Textarea
                      placeholder="Enter allergies..."
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Family and Social History</label>
                    <Textarea
                      placeholder="Enter family and social history..."
                      value={familyAndSocialHistory}
                      onChange={(e) => setFamilyAndSocialHistory(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Clinical Examination</label>
                    <Textarea
                      placeholder="Enter clinical examination..."
                      value={clinicalExamination}
                      onChange={(e) => setClinicalExamination(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Assessment</label>
                    <Textarea
                      placeholder="Enter assessment..."
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Treatment Plan</label>
                    <Textarea
                      placeholder="Enter treatment plan..."
                      value={treatmentPlan}
                      onChange={(e) => setTreatmentPlan(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">Investigations</label>
                    <Textarea
                      placeholder="Enter investigations..."
                      value={investigations}
                      onChange={(e) => setInvestigations(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">E-Prescription</label>
                    <Textarea
                      placeholder="Enter e-prescription..."
                      value={ePrescription}
                      onChange={(e) => setEPrescription(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                </div>
              </ScrollArea>

              {/* Footer */}
              <div className="p-4 border-t border-white/10">
                <Button
                  onClick={handleSaveClerking}
                  disabled={isSaving}
                  className="w-full bg-green-600 hover:bg-green-700"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {isSaving ? 'Saving...' : 'Save Clerking'}
                </Button>
              </div>
            </>
          ) : (
            <ScrollArea className="flex-1 p-4">
              {isFolderLoading ? (
                <p className="text-sm text-slate-400">Loading patient folder...</p>
              ) : (
                <div className="space-y-5">
                  {folderData ? (
                    <div className="space-y-3">
                      {folderFieldOrder.map((field) => (
                        <div key={field}>
                          <h4 className="text-sm font-semibold text-white mb-2">{formatFolderFieldLabel(field)}</h4>
                          <div className="rounded-md border border-white/10 bg-[#1a1a2e] p-3 text-sm text-slate-200 whitespace-pre-wrap">
                            {folderData[field] || `No ${formatFolderFieldLabel(field).toLowerCase()} available yet.`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">No patient folder found yet.</p>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-white mb-2">Recent Clerking Entries</h4>
                    {folderNotes.length === 0 ? (
                      <p className="text-sm text-slate-400">No clerking entries yet.</p>
                    ) : (
                      <div className="space-y-3">
                        {folderNotes.map((note) => (
                          <div key={note.id} className="rounded-md border border-white/10 bg-[#1a1a2e] p-3">
                            <p className="text-[11px] text-slate-400 mb-2">
                              {new Date(note.created_at).toLocaleString()}
                            </p>
                            <p className="text-xs text-slate-300">
                              <span className="text-slate-400">Assessment: </span>
                              {note.diagnosis || 'Not recorded'}
                            </p>
                            <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">
                              <span className="text-slate-400">Plan: </span>
                              {note.treatment_plan || 'Not recorded'}
                            </p>
                            <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">
                              <span className="text-slate-400">Full Clerking Note: </span>
                              {note.follow_up_notes || 'Not recorded'}
                            </p>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </ScrollArea>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
