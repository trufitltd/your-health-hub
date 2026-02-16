import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Stethoscope, Search, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';

/* ---------------- MOCK DATA (Later Replace with DB) ---------------- */

const COMMON_DIAGNOSES = [
  'Malaria',
  'Upper Respiratory Tract Infection',
  'Hypertension',
  'Type 2 Diabetes Mellitus',
  'Gastroenteritis',
  'Migraine',
];

const COMMON_MEDICATIONS = [
  'Paracetamol',
  'Amoxicillin',
  'Artemether/Lumefantrine',
  'Metformin',
  'Amlodipine',
];

/* ---------------- COMPONENT ---------------- */

export function ClerkingPanel({ isOpen, onClose, sessionId, patientId, doctorId }) {

  const storageKey = `clerking-${sessionId}`;

  const [subjective, setSubjective] = useState('');
  const [objective, setObjective] = useState('');
  const [assessment, setAssessment] = useState('');
  const [plan, setPlan] = useState('');

  const [diagnosisSearch, setDiagnosisSearch] = useState('');
  const [medicationSearch, setMedicationSearch] = useState('');
  const [selectedMedications, setSelectedMedications] = useState<string[]>([]);

  const [vitals, setVitals] = useState({
    bp: '',
    pulse: '',
    temp: '',
    spo2: ''
  });

  const [isSaving, setIsSaving] = useState(false);

  /* ---------------- AUTO SAVE ---------------- */

  useEffect(() => {
    const saved = localStorage.getItem(storageKey);
    if (saved) {
      const parsed = JSON.parse(saved);
      setSubjective(parsed.subjective || '');
      setObjective(parsed.objective || '');
      setAssessment(parsed.assessment || '');
      setPlan(parsed.plan || '');
      setSelectedMedications(parsed.medications || []);
      setVitals(parsed.vitals || vitals);
    }
  }, []);

  useEffect(() => {
    localStorage.setItem(storageKey, JSON.stringify({
      subjective,
      objective,
      assessment,
      plan,
      medications: selectedMedications,
      vitals
    }));
  }, [subjective, objective, assessment, plan, selectedMedications, vitals]);

  /* ---------------- HELPERS ---------------- */

  const filteredDiagnoses = COMMON_DIAGNOSES.filter(d =>
    d.toLowerCase().includes(diagnosisSearch.toLowerCase())
  );

  const filteredMeds = COMMON_MEDICATIONS.filter(m =>
    m.toLowerCase().includes(medicationSearch.toLowerCase())
  );

  const addMedication = (med: string) => {
    if (!selectedMedications.includes(med)) {
      setSelectedMedications(prev => [...prev, med]);
    }
  };

  const removeMedication = (med: string) => {
    setSelectedMedications(prev => prev.filter(m => m !== med));
  };

  const insertNormalExam = () => {
    if (!objective) {
      setObjective('Patient appears well. No acute distress. Systemic examination within normal limits.');
    }
  };

  /* ---------------- SAVE ---------------- */

  const handleSave = async () => {

    if (!subjective && !objective && !assessment && !plan) {
      toast({ title: 'Empty Clerking', variant: 'destructive' });
      return;
    }

    const composedNote = `
VITALS:
BP: ${vitals.bp}
Pulse: ${vitals.pulse}
Temp: ${vitals.temp}
SpO₂: ${vitals.spo2}

SUBJECTIVE:
${subjective}

OBJECTIVE:
${objective}

ASSESSMENT:
${assessment}

PLAN:
${plan}

MEDICATIONS:
${selectedMedications.join(', ')}
`;

    setIsSaving(true);

    try {
      await supabase.from('doctor_consultation_notes').insert({
        session_id: sessionId,
        patient_id: patientId,
        doctor_id: doctorId,
        diagnosis: assessment || null,
        treatment_plan: plan || null,
        prescriptions: selectedMedications.join(', ') || null,
        follow_up_notes: composedNote
      });

      await supabase.rpc('doctor_append_to_patient_folder', {
        p_patient_id: patientId,
        p_note_text: composedNote
      });

      localStorage.removeItem(storageKey);

      toast({ title: 'Clerking Saved ✅' });

    } catch (err) {
      toast({ title: 'Save Failed', variant: 'destructive' });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <AnimatePresence>
      {isOpen && (
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: 'auto' }}
          exit={{ width: 0 }}
          className="w-full sm:w-96 h-full flex flex-col bg-[#252542]"
        >
          {/* Header */}
          <div className="flex justify-between p-4 border-b border-white/10">
            <h3 className="text-white flex gap-2">
              <Stethoscope className="w-4 h-4" />
              Clerking
            </h3>
            <Button variant="ghost" size="icon" onClick={onClose}>
              <X className="w-4 h-4" />
            </Button>
          </div>

          <ScrollArea className="flex-1 p-4 space-y-6">

            {/* Vitals */}
            <div className="grid grid-cols-2 gap-2">
              <Input placeholder="BP" onChange={e => setVitals({...vitals, bp: e.target.value})} />
              <Input placeholder="Pulse" onChange={e => setVitals({...vitals, pulse: e.target.value})} />
              <Input placeholder="Temp" onChange={e => setVitals({...vitals, temp: e.target.value})} />
              <Input placeholder="SpO₂" onChange={e => setVitals({...vitals, spo2: e.target.value})} />
            </div>

            <Separator />

            {/* SOAP */}
            <Textarea placeholder="Subjective..." value={subjective} onChange={e => setSubjective(e.target.value)} />
            <Textarea placeholder="Objective..." value={objective} onChange={e => setObjective(e.target.value)} />

            <Button size="sm" variant="outline" onClick={insertNormalExam}>
              Normal Exam
            </Button>

            {/* Diagnosis Autocomplete */}
            <div>
              <Input
                placeholder="Search Diagnosis..."
                value={diagnosisSearch}
                onChange={e => setDiagnosisSearch(e.target.value)}
              />
              <div className="space-y-1 mt-2">
                {filteredDiagnoses.map(d => (
                  <div key={d} onClick={() => setAssessment(d)} className="cursor-pointer text-sm text-slate-300 hover:text-white">
                    {d}
                  </div>
                ))}
              </div>
            </div>

            <Textarea placeholder="Plan..." value={plan} onChange={e => setPlan(e.target.value)} />

            {/* Medication Picker */}
            <div>
              <Input
                placeholder="Search Medication..."
                value={medicationSearch}
                onChange={e => setMedicationSearch(e.target.value)}
              />

              <div className="flex flex-wrap gap-2 mt-2">
                {selectedMedications.map(med => (
                  <Badge key={med} onClick={() => removeMedication(med)} className="cursor-pointer">
                    {med} ✕
                  </Badge>
                ))}
              </div>

              <div className="space-y-1 mt-2">
                {filteredMeds.map(m => (
                  <div key={m} onClick={() => addMedication(m)} className="cursor-pointer text-sm text-slate-300 hover:text-white">
                    {m}
                  </div>
                ))}
              </div>
            </div>

          </ScrollArea>

          {/* Footer */}
          <div className="p-4 border-t border-white/10">
            <Button onClick={handleSave} disabled={isSaving} className="w-full bg-green-600">
              <Save className="w-4 h-4 mr-2" />
              Save Clerking
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
