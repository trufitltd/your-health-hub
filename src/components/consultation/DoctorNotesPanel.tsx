import { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { X, Save, Stethoscope, FolderOpen } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { ScrollArea } from '@/components/ui/scroll-area';
import { useLocaleFormatter } from '@/lib/locale';
import { useLanguage, type AppLanguage } from '@/contexts/LanguageContext';
import { fetchDoctorConsultationNotesForFolder } from '@/lib/doctorConsultationNotes';

interface ClerkingPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sessionId: string;
  patientId: string;
  doctorId: string;
  initialView?: 'clerking' | 'folder';
  onClerkingSaved?: () => void;
}

type ClerkingPanelText = {
  panelTitle: string;
  addClerking: string;
  viewPatientFolder: string;
  saveClerking: string;
  saving: string;
  loadingPatientFolder: string;
  noPatientFolder: string;
  recentEntries: string;
  noEntries: string;
  notRecorded: string;
  fullClerkingNote: string;
  fields: {
    presenting_complaint: { label: string; placeholder: string };
    history_of_presenting_complaint: { label: string; placeholder: string };
    past_medical_history: { label: string; placeholder: string };
    past_drug_history: { label: string; placeholder: string };
    allergies: { label: string; placeholder: string };
    family_social_history: { label: string; placeholder: string };
    clinical_examination: { label: string; placeholder: string };
    assessment: { label: string; placeholder: string };
    treatment_plan: { label: string; placeholder: string };
    investigations: { label: string; placeholder: string };
    e_prescription: { label: string; placeholder: string };
    patient_type: { label: string };
    medical_history: { label: string };
    current_medications: { label: string };
    previous_diagnoses: { label: string };
  };
};

export const CLERKING_PANEL_TEXT: Record<AppLanguage, ClerkingPanelText> = {
  en: {
    panelTitle: 'Clerking',
    addClerking: 'Clinical Notes',
    viewPatientFolder: 'View Patient Folder',
    saveClerking: 'Save Clerking',
    saving: 'Saving...',
    loadingPatientFolder: 'Loading patient folder...',
    noPatientFolder: 'No patient folder found yet.',
    recentEntries: 'Recent Clerking Entries',
    noEntries: 'No clerking entries yet.',
    notRecorded: 'Not recorded',
    fullClerkingNote: 'Full Clerking Note',
    fields: {
      presenting_complaint: { label: 'Presenting Complaint', placeholder: 'Enter presenting complaint...' },
      history_of_presenting_complaint: { label: 'History of Presenting Complaint', placeholder: 'Enter history of presenting complaint...' },
      past_medical_history: { label: 'Past Medical History', placeholder: 'Enter past medical history...' },
      past_drug_history: { label: 'Past Drug History', placeholder: 'Enter past drug history...' },
      allergies: { label: 'Allergies', placeholder: 'Enter allergies...' },
      family_social_history: { label: 'Family and Social History', placeholder: 'Enter family and social history...' },
      clinical_examination: { label: 'Clinical Examination', placeholder: 'Enter clinical examination...' },
      assessment: { label: 'Assessment', placeholder: 'Enter assessment...' },
      treatment_plan: { label: 'Treatment Plan', placeholder: 'Enter treatment plan...' },
      investigations: { label: 'Investigations', placeholder: 'Enter investigations...' },
      e_prescription: { label: 'E-Prescription', placeholder: 'Enter e-prescription...' },
      patient_type: { label: 'Patient Type' },
      medical_history: { label: 'Medical History' },
      current_medications: { label: 'Current Medications' },
      previous_diagnoses: { label: 'Previous Diagnoses' },
    },
  },
  ha: {
    panelTitle: 'Bayanan Jinya',
    addClerking: 'Ƙara Bayanan Jinya',
    viewPatientFolder: 'Duba Jakar Majiyyaci',
    saveClerking: 'Ajiye Bayanan Jinya',
    saving: 'Ana adanawa...',
    loadingPatientFolder: 'Ana loda jakar majiyyaci...',
    noPatientFolder: 'Ba a sami jakar majiyyaci ba tukuna.',
    recentEntries: 'Shigarwar Bayanan Jinya na Kwanan Nan',
    noEntries: 'Babu shigarwar bayanan jinya tukuna.',
    notRecorded: 'Ba a rubuta ba',
    fullClerkingNote: 'Cikakken Bayanin Jinya',
    fields: {
      presenting_complaint: { label: 'Korafin da Ya Gabatar', placeholder: 'Shigar da korafin da ya gabatar...' },
      history_of_presenting_complaint: { label: 'Tarihin Korafin da Ya Gabatar', placeholder: 'Shigar da tarihin korafin da ya gabatar...' },
      past_medical_history: { label: 'Tarihin Lafiya na Baya', placeholder: 'Shigar da tarihin lafiya na baya...' },
      past_drug_history: { label: 'Tarihin Magunguna na Baya', placeholder: 'Shigar da tarihin magunguna na baya...' },
      allergies: { label: 'Allergy', placeholder: 'Shigar da allergy...' },
      family_social_history: { label: 'Tarihin Iyali da Zamantakewa', placeholder: 'Shigar da tarihin iyali da zamantakewa...' },
      clinical_examination: { label: 'Binciken Asibiti', placeholder: 'Shigar da binciken asibiti...' },
      assessment: { label: 'Kimantawa', placeholder: 'Shigar da kimantawa...' },
      treatment_plan: { label: 'Shirin Magani', placeholder: 'Shigar da shirin magani...' },
      investigations: { label: 'Gwaje-gwaje', placeholder: 'Shigar da gwaje-gwaje...' },
      e_prescription: { label: 'Takardar Magani ta Lantarki', placeholder: 'Shigar da takardar magani ta lantarki...' },
      patient_type: { label: 'Nau’in Majiyyaci' },
      medical_history: { label: 'Tarihin Lafiya' },
      current_medications: { label: 'Magungunan Yanzu' },
      previous_diagnoses: { label: 'Ganowa na Baya' },
    },
  },
  ig: {
    panelTitle: 'Nkọwa Nlekọta',
    addClerking: 'Tinye Nkọwa Nlekọta',
    viewPatientFolder: 'Lelee Folda Onye Ọrịa',
    saveClerking: 'Chekwaa Nkọwa Nlekọta',
    saving: 'Na-echekwa...',
    loadingPatientFolder: 'Na-ebunye folda onye ọrịa...',
    noPatientFolder: 'Enweghị folda onye ọrịa ugbu a.',
    recentEntries: 'Ndekọ Nlekọta Kacha Ọhụrụ',
    noEntries: 'Enweghị ndekọ nlekọta ugbu a.',
    notRecorded: 'Edebeghị',
    fullClerkingNote: 'Nkọwa Nlekọta Zuru Ezu',
    fields: {
      presenting_complaint: { label: 'Mkpesa Onye Ọrịa', placeholder: 'Tinye mkpesa onye ọrịa...' },
      history_of_presenting_complaint: { label: 'Akụkọ Mkpesa Onye Ọrịa', placeholder: 'Tinye akụkọ mkpesa onye ọrịa...' },
      past_medical_history: { label: 'Akụkọ Ahụike Gara Aga', placeholder: 'Tinye akụkọ ahụike gara aga...' },
      past_drug_history: { label: 'Akụkọ Ọgwụ Gara Aga', placeholder: 'Tinye akụkọ ọgwụ gara aga...' },
      allergies: { label: 'Ndị na-akpata Ahụhụ', placeholder: 'Tinye allergy...' },
      family_social_history: { label: 'Akụkọ Ezinụlọ na Ọha', placeholder: 'Tinye akụkọ ezinụlọ na ọha...' },
      clinical_examination: { label: 'Nnyocha Klinik', placeholder: 'Tinye nyocha klinik...' },
      assessment: { label: 'Nyocha', placeholder: 'Tinye nyocha...' },
      treatment_plan: { label: 'Atụmatụ Ọgwụgwọ', placeholder: 'Tinye atụmatụ ọgwụgwọ...' },
      investigations: { label: 'Nnyocha Lab', placeholder: 'Tinye nyocha lab...' },
      e_prescription: { label: 'Prescription Elektrọnik', placeholder: 'Tinye prescription elektrọnik...' },
      patient_type: { label: 'Ụdị Onye Ọrịa' },
      medical_history: { label: 'Akụkọ Ahụike' },
      current_medications: { label: 'Ọgwụ Ugbu A' },
      previous_diagnoses: { label: 'Nchọpụta Gara Aga' },
    },
  },
  yo: {
    panelTitle: 'Akọsilẹ Iwosan',
    addClerking: 'Fikun Akọsilẹ Iwosan',
    viewPatientFolder: 'Wo Fọ́ldà Aláìsàn',
    saveClerking: 'Fipamọ́ Akọsilẹ Iwosan',
    saving: 'Ń fipamọ́...',
    loadingPatientFolder: 'Ń gba fọ́ldà aláìsàn wọlé...',
    noPatientFolder: 'Kò sí fọ́ldà aláìsàn ní báyìí.',
    recentEntries: 'Àwọn Akọsilẹ Iwosan Tuntun',
    noEntries: 'Kò sí akọsilẹ iwosan síbẹ̀.',
    notRecorded: 'Kò tíì jẹ́ kó wà',
    fullClerkingNote: 'Akọsilẹ Iwosan Kíkún',
    fields: {
      presenting_complaint: { label: 'Ẹdun Tí Aláìsàn Mu Wá', placeholder: 'Tẹ ẹdun tí aláìsàn mu wá...' },
      history_of_presenting_complaint: { label: 'Ìtàn Ẹdun Tí Aláìsàn Mu Wá', placeholder: 'Tẹ ìtàn ẹdun tí aláìsàn mu wá...' },
      past_medical_history: { label: 'Ìtàn Ìlera Tẹ́lẹ̀', placeholder: 'Tẹ ìtàn ìlera tẹ́lẹ̀...' },
      past_drug_history: { label: 'Ìtàn Oògùn Tẹ́lẹ̀', placeholder: 'Tẹ ìtàn oògùn tẹ́lẹ̀...' },
      allergies: { label: 'Àìfaradà Oògùn/Ounjẹ', placeholder: 'Tẹ àìfaradà...' },
      family_social_history: { label: 'Ìtàn Ẹbí àti Awujọ', placeholder: 'Tẹ ìtàn ẹbí àti awujọ...' },
      clinical_examination: { label: 'Àyẹ̀wò Klinik', placeholder: 'Tẹ àyẹ̀wò klinik...' },
      assessment: { label: 'Ìṣàkíyèsí', placeholder: 'Tẹ ìṣàkíyèsí...' },
      treatment_plan: { label: 'Ètò Ìtọju', placeholder: 'Tẹ ètò ìtọju...' },
      investigations: { label: 'Àwọn Ìdánwò', placeholder: 'Tẹ àwọn ìdánwò...' },
      e_prescription: { label: 'Òògùn Eletiriki', placeholder: 'Tẹ òògùn eletiriki...' },
      patient_type: { label: 'Irú Aláìsàn' },
      medical_history: { label: 'Ìtàn Ìlera' },
      current_medications: { label: 'Àwọn Oògùn Tó ń Lò' },
      previous_diagnoses: { label: 'Àwọn Àyẹ̀wò Tẹ́lẹ̀' },
    },
  },
  sw: {
    panelTitle: 'Kumbukumbu za Kliniki',
    addClerking: 'Ongeza Kumbukumbu',
    viewPatientFolder: 'Tazama Folda ya Mgonjwa',
    saveClerking: 'Hifadhi Kumbukumbu',
    saving: 'Inahifadhi...',
    loadingPatientFolder: 'Inapakia folda ya mgonjwa...',
    noPatientFolder: 'Hakuna folda ya mgonjwa bado.',
    recentEntries: 'Kumbukumbu za Hivi Karibuni',
    noEntries: 'Hakuna kumbukumbu bado.',
    notRecorded: 'Haijaandikwa',
    fullClerkingNote: 'Kumbukumbu Kamili',
    fields: {
      presenting_complaint: { label: 'Malalamiko Makuu', placeholder: 'Weka malalamiko makuu...' },
      history_of_presenting_complaint: { label: 'Historia ya Malalamiko', placeholder: 'Weka historia ya malalamiko...' },
      past_medical_history: { label: 'Historia ya Matibabu ya Awali', placeholder: 'Weka historia ya matibabu ya awali...' },
      past_drug_history: { label: 'Historia ya Dawa za Awali', placeholder: 'Weka historia ya dawa za awali...' },
      allergies: { label: 'Aleji', placeholder: 'Weka aleji...' },
      family_social_history: { label: 'Historia ya Familia na Jamii', placeholder: 'Weka historia ya familia na jamii...' },
      clinical_examination: { label: 'Uchunguzi wa Kliniki', placeholder: 'Weka uchunguzi wa kliniki...' },
      assessment: { label: 'Tathmini', placeholder: 'Weka tathmini...' },
      treatment_plan: { label: 'Mpango wa Matibabu', placeholder: 'Weka mpango wa matibabu...' },
      investigations: { label: 'Vipimo', placeholder: 'Weka vipimo...' },
      e_prescription: { label: 'Dawa ya Kielektroniki', placeholder: 'Weka dawa ya kielektroniki...' },
      patient_type: { label: 'Aina ya Mgonjwa' },
      medical_history: { label: 'Historia ya Matibabu' },
      current_medications: { label: 'Dawa za Sasa' },
      previous_diagnoses: { label: 'Utambuzi wa Awali' },
    },
  },
  ar: {
    panelTitle: 'ملاحظات العيادة',
    addClerking: 'إضافة ملاحظات',
    viewPatientFolder: 'عرض ملف المريض',
    saveClerking: 'حفظ الملاحظات',
    saving: 'جارٍ الحفظ...',
    loadingPatientFolder: 'جارٍ تحميل ملف المريض...',
    noPatientFolder: 'لا يوجد ملف مريض بعد.',
    recentEntries: 'أحدث الملاحظات',
    noEntries: 'لا توجد ملاحظات بعد.',
    notRecorded: 'غير مسجل',
    fullClerkingNote: 'الملاحظة الكاملة',
    fields: {
      presenting_complaint: { label: 'الشكوى الرئيسية', placeholder: 'أدخل الشكوى الرئيسية...' },
      history_of_presenting_complaint: { label: 'تاريخ الشكوى الحالية', placeholder: 'أدخل تاريخ الشكوى الحالية...' },
      past_medical_history: { label: 'التاريخ الطبي السابق', placeholder: 'أدخل التاريخ الطبي السابق...' },
      past_drug_history: { label: 'تاريخ الأدوية السابق', placeholder: 'أدخل تاريخ الأدوية السابق...' },
      allergies: { label: 'الحساسية', placeholder: 'أدخل الحساسية...' },
      family_social_history: { label: 'التاريخ العائلي والاجتماعي', placeholder: 'أدخل التاريخ العائلي والاجتماعي...' },
      clinical_examination: { label: 'الفحص السريري', placeholder: 'أدخل الفحص السريري...' },
      assessment: { label: 'التقييم', placeholder: 'أدخل التقييم...' },
      treatment_plan: { label: 'خطة العلاج', placeholder: 'أدخل خطة العلاج...' },
      investigations: { label: 'الفحوصات', placeholder: 'أدخل الفحوصات...' },
      e_prescription: { label: 'الوصفة الإلكترونية', placeholder: 'أدخل الوصفة الإلكترونية...' },
      patient_type: { label: 'نوع المريض' },
      medical_history: { label: 'التاريخ الطبي' },
      current_medications: { label: 'الأدوية الحالية' },
      previous_diagnoses: { label: 'التشخيصات السابقة' },
    },
  },
  fr: {
    panelTitle: 'Notes Cliniques',
    addClerking: 'Ajouter des Notes',
    viewPatientFolder: 'Voir le Dossier Patient',
    saveClerking: 'Enregistrer les Notes',
    saving: 'Enregistrement...',
    loadingPatientFolder: 'Chargement du dossier patient...',
    noPatientFolder: 'Aucun dossier patient pour le moment.',
    recentEntries: 'Notes Récentes',
    noEntries: 'Aucune note pour le moment.',
    notRecorded: 'Non renseigné',
    fullClerkingNote: 'Note Clinique Complète',
    fields: {
      presenting_complaint: { label: 'Motif de Consultation', placeholder: 'Saisir le motif de consultation...' },
      history_of_presenting_complaint: { label: 'Histoire de la Maladie Actuelle', placeholder: 'Saisir l’histoire de la maladie actuelle...' },
      past_medical_history: { label: 'Antécédents Médicaux', placeholder: 'Saisir les antécédents médicaux...' },
      past_drug_history: { label: 'Antécédents Médicamenteux', placeholder: 'Saisir les antécédents médicamenteux...' },
      allergies: { label: 'Allergies', placeholder: 'Saisir les allergies...' },
      family_social_history: { label: 'Antécédents Familiaux et Sociaux', placeholder: 'Saisir les antécédents familiaux et sociaux...' },
      clinical_examination: { label: 'Examen Clinique', placeholder: 'Saisir l’examen clinique...' },
      assessment: { label: 'Évaluation', placeholder: 'Saisir l’évaluation...' },
      treatment_plan: { label: 'Plan de Traitement', placeholder: 'Saisir le plan de traitement...' },
      investigations: { label: 'Investigations', placeholder: 'Saisir les investigations...' },
      e_prescription: { label: 'Ordonnance Électronique', placeholder: 'Saisir l’ordonnance électronique...' },
      patient_type: { label: 'Type de Patient' },
      medical_history: { label: 'Historique Médical' },
      current_medications: { label: 'Médicaments Actuels' },
      previous_diagnoses: { label: 'Diagnostics Précédents' },
    },
  },
  es: {
    panelTitle: 'Notas Clínicas',
    addClerking: 'Agregar Notas',
    viewPatientFolder: 'Ver Carpeta del Paciente',
    saveClerking: 'Guardar Notas',
    saving: 'Guardando...',
    loadingPatientFolder: 'Cargando expediente del paciente...',
    noPatientFolder: 'No hay carpeta del paciente todavía.',
    recentEntries: 'Entradas Clínicas Recientes',
    noEntries: 'No hay notas clínicas todavía.',
    notRecorded: 'No registrado',
    fullClerkingNote: 'Nota Clínica Completa',
    fields: {
      presenting_complaint: { label: 'Motivo de Consulta', placeholder: 'Ingrese el motivo de consulta...' },
      history_of_presenting_complaint: { label: 'Historia del Padecimiento Actual', placeholder: 'Ingrese la historia del padecimiento actual...' },
      past_medical_history: { label: 'Antecedentes Médicos', placeholder: 'Ingrese antecedentes médicos...' },
      past_drug_history: { label: 'Antecedentes de Medicación', placeholder: 'Ingrese antecedentes de medicación...' },
      allergies: { label: 'Alergias', placeholder: 'Ingrese alergias...' },
      family_social_history: { label: 'Historia Familiar y Social', placeholder: 'Ingrese historia familiar y social...' },
      clinical_examination: { label: 'Examen Clínico', placeholder: 'Ingrese examen clínico...' },
      assessment: { label: 'Evaluación', placeholder: 'Ingrese evaluación...' },
      treatment_plan: { label: 'Plan de Tratamiento', placeholder: 'Ingrese plan de tratamiento...' },
      investigations: { label: 'Investigaciones', placeholder: 'Ingrese investigaciones...' },
      e_prescription: { label: 'Receta Electrónica', placeholder: 'Ingrese receta electrónica...' },
      patient_type: { label: 'Tipo de Paciente' },
      medical_history: { label: 'Historial Médico' },
      current_medications: { label: 'Medicamentos Actuales' },
      previous_diagnoses: { label: 'Diagnósticos Previos' },
    },
  },
  pt: {
    panelTitle: 'Notas Clínicas',
    addClerking: 'Adicionar Notas',
    viewPatientFolder: 'Ver Prontuário do Paciente',
    saveClerking: 'Salvar Notas',
    saving: 'Salvando...',
    loadingPatientFolder: 'Carregando prontuário do paciente...',
    noPatientFolder: 'Nenhum prontuário do paciente ainda.',
    recentEntries: 'Entradas Clínicas Recentes',
    noEntries: 'Nenhuma entrada clínica ainda.',
    notRecorded: 'Não registrado',
    fullClerkingNote: 'Nota Clínica Completa',
    fields: {
      presenting_complaint: { label: 'Queixa Principal', placeholder: 'Digite a queixa principal...' },
      history_of_presenting_complaint: { label: 'História da Doença Atual', placeholder: 'Digite a história da doença atual...' },
      past_medical_history: { label: 'Histórico Médico Anterior', placeholder: 'Digite o histórico médico anterior...' },
      past_drug_history: { label: 'Histórico de Medicamentos', placeholder: 'Digite o histórico de medicamentos...' },
      allergies: { label: 'Alergias', placeholder: 'Digite alergias...' },
      family_social_history: { label: 'Histórico Familiar e Social', placeholder: 'Digite histórico familiar e social...' },
      clinical_examination: { label: 'Exame Clínico', placeholder: 'Digite o exame clínico...' },
      assessment: { label: 'Avaliação', placeholder: 'Digite a avaliação...' },
      treatment_plan: { label: 'Plano de Tratamento', placeholder: 'Digite o plano de tratamento...' },
      investigations: { label: 'Exames', placeholder: 'Digite os exames...' },
      e_prescription: { label: 'Prescrição Eletrônica', placeholder: 'Digite a prescrição eletrônica...' },
      patient_type: { label: 'Tipo de Paciente' },
      medical_history: { label: 'Histórico Médico' },
      current_medications: { label: 'Medicamentos Atuais' },
      previous_diagnoses: { label: 'Diagnósticos Anteriores' },
    },
  },
  nl: {
    panelTitle: 'Klinische Notities',
    addClerking: 'Notities Toevoegen',
    viewPatientFolder: 'Patiëntdossier Bekijken',
    saveClerking: 'Notities Opslaan',
    saving: 'Opslaan...',
    loadingPatientFolder: 'Patiëntdossier laden...',
    noPatientFolder: 'Nog geen patiëntdossier gevonden.',
    recentEntries: 'Recente Klinische Notities',
    noEntries: 'Nog geen klinische notities.',
    notRecorded: 'Niet vastgelegd',
    fullClerkingNote: 'Volledige Klinische Notitie',
    fields: {
      presenting_complaint: { label: 'Hoofdklacht', placeholder: 'Voer hoofdklacht in...' },
      history_of_presenting_complaint: { label: 'Anamnese van Huidige Klacht', placeholder: 'Voer anamnese van huidige klacht in...' },
      past_medical_history: { label: 'Medische Voorgeschiedenis', placeholder: 'Voer medische voorgeschiedenis in...' },
      past_drug_history: { label: 'Medicatiegeschiedenis', placeholder: 'Voer medicatiegeschiedenis in...' },
      allergies: { label: 'Allergieën', placeholder: 'Voer allergieën in...' },
      family_social_history: { label: 'Familie- en Sociale Anamnese', placeholder: 'Voer familie- en sociale anamnese in...' },
      clinical_examination: { label: 'Klinisch Onderzoek', placeholder: 'Voer klinisch onderzoek in...' },
      assessment: { label: 'Beoordeling', placeholder: 'Voer beoordeling in...' },
      treatment_plan: { label: 'Behandelplan', placeholder: 'Voer behandelplan in...' },
      investigations: { label: 'Onderzoeken', placeholder: 'Voer onderzoeken in...' },
      e_prescription: { label: 'E-voorschrift', placeholder: 'Voer e-voorschrift in...' },
      patient_type: { label: 'Patiënttype' },
      medical_history: { label: 'Medische Geschiedenis' },
      current_medications: { label: 'Huidige Medicatie' },
      previous_diagnoses: { label: 'Eerdere Diagnoses' },
    },
  },
  zh: {
    panelTitle: '临床记录',
    addClerking: '添加记录',
    viewPatientFolder: '查看患者档案',
    saveClerking: '保存记录',
    saving: '正在保存...',
    loadingPatientFolder: '正在加载患者档案...',
    noPatientFolder: '尚未找到患者档案。',
    recentEntries: '近期临床记录',
    noEntries: '暂无临床记录。',
    notRecorded: '未记录',
    fullClerkingNote: '完整临床记录',
    fields: {
      presenting_complaint: { label: '主诉', placeholder: '请输入主诉...' },
      history_of_presenting_complaint: { label: '现病史', placeholder: '请输入现病史...' },
      past_medical_history: { label: '既往病史', placeholder: '请输入既往病史...' },
      past_drug_history: { label: '既往用药史', placeholder: '请输入既往用药史...' },
      allergies: { label: '过敏史', placeholder: '请输入过敏史...' },
      family_social_history: { label: '家族与社会史', placeholder: '请输入家族与社会史...' },
      clinical_examination: { label: '体格检查', placeholder: '请输入体格检查...' },
      assessment: { label: '评估', placeholder: '请输入评估...' },
      treatment_plan: { label: '治疗计划', placeholder: '请输入治疗计划...' },
      investigations: { label: '检查项目', placeholder: '请输入检查项目...' },
      e_prescription: { label: '电子处方', placeholder: '请输入电子处方...' },
      patient_type: { label: '患者类型' },
      medical_history: { label: '病史' },
      current_medications: { label: '当前用药' },
      previous_diagnoses: { label: '既往诊断' },
    },
  },
  de: {
    panelTitle: 'Klinische Notizen',
    addClerking: 'Notiz Hinzufügen',
    viewPatientFolder: 'Patientenakte Anzeigen',
    saveClerking: 'Notiz Speichern',
    saving: 'Wird gespeichert...',
    loadingPatientFolder: 'Patientenakte wird geladen...',
    noPatientFolder: 'Noch keine Patientenakte vorhanden.',
    recentEntries: 'Letzte Klinische Einträge',
    noEntries: 'Noch keine klinischen Einträge.',
    notRecorded: 'Nicht erfasst',
    fullClerkingNote: 'Vollständige Klinische Notiz',
    fields: {
      presenting_complaint: { label: 'Leitsymptom', placeholder: 'Leitsymptom eingeben...' },
      history_of_presenting_complaint: { label: 'Aktuelle Krankengeschichte', placeholder: 'Aktuelle Krankengeschichte eingeben...' },
      past_medical_history: { label: 'Frühere Krankengeschichte', placeholder: 'Frühere Krankengeschichte eingeben...' },
      past_drug_history: { label: 'Frühere Medikation', placeholder: 'Frühere Medikation eingeben...' },
      allergies: { label: 'Allergien', placeholder: 'Allergien eingeben...' },
      family_social_history: { label: 'Familien- und Sozialanamnese', placeholder: 'Familien- und Sozialanamnese eingeben...' },
      clinical_examination: { label: 'Klinische Untersuchung', placeholder: 'Klinische Untersuchung eingeben...' },
      assessment: { label: 'Beurteilung', placeholder: 'Beurteilung eingeben...' },
      treatment_plan: { label: 'Behandlungsplan', placeholder: 'Behandlungsplan eingeben...' },
      investigations: { label: 'Untersuchungen', placeholder: 'Untersuchungen eingeben...' },
      e_prescription: { label: 'E-Rezept', placeholder: 'E-Rezept eingeben...' },
      patient_type: { label: 'Patiententyp' },
      medical_history: { label: 'Anamnese' },
      current_medications: { label: 'Aktuelle Medikation' },
      previous_diagnoses: { label: 'Frühere Diagnosen' },
    },
  },
};

export function DoctorNotesPanel({
  isOpen,
  onClose,
  sessionId,
  patientId,
  doctorId,
  initialView = 'clerking',
  onClerkingSaved
}: ClerkingPanelProps) {
  const { formatDateTime } = useLocaleFormatter();
  const { language } = useLanguage();
  const panelText = CLERKING_PANEL_TEXT[language] ?? CLERKING_PANEL_TEXT.en;

  const isMissingTranslationColumnsError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    const normalizedMessage = typeof message === 'string' ? message.toLowerCase() : '';

    return (
      (
        code === '42703' &&
        normalizedMessage.includes('_translations') &&
        normalizedMessage.includes('does not exist')
      ) ||
      (
        code === 'PGRST204' &&
        normalizedMessage.includes('_translations') &&
        normalizedMessage.includes('schema cache')
      )
    );
  };

  const isLegacyPatientFolderRpcSignatureError = (error: unknown): boolean => {
    if (!error || typeof error !== 'object') return false;
    const code = (error as { code?: unknown }).code;
    const message = (error as { message?: unknown }).message;
    if (typeof message !== 'string') return false;

    return (
      (code === 'PGRST202' || code === '42883') &&
      message.includes('doctor_append_to_patient_folder')
    );
  };

  const toTranslationPayload = (value: string): Record<string, string> => {
    const normalized = value.trim();
    if (!normalized) return {};
    return { [language]: normalized };
  };

  const getLocalizedText = (
    rawValue: unknown,
    rawTranslations: unknown,
    currentLanguage: AppLanguage
  ) => {
    const base = typeof rawValue === 'string' ? rawValue.trim() : '';
    if (!rawTranslations || typeof rawTranslations !== 'object') return base;

    const translations = rawTranslations as Record<string, unknown>;
    const localized = translations[currentLanguage];
    if (typeof localized === 'string' && localized.trim()) return localized.trim();

    const english = translations.en;
    if (typeof english === 'string' && english.trim()) return english.trim();

    return base;
  };

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
  const lastSavedSignatureRef = useRef<string | null>(null);
  const [isFolderLoading, setIsFolderLoading] = useState(false);
  const [folderData, setFolderData] = useState<Record<string, any> | null>(null);
  const [folderNotes, setFolderNotes] = useState<Array<{
    id: string;
    created_at: string;
    diagnosis: string | null;
    treatment_plan: string | null;
    follow_up_notes: string | null;
    diagnosis_translations?: Record<string, string> | null;
    treatment_plan_translations?: Record<string, string> | null;
    follow_up_notes_translations?: Record<string, string> | null;
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
    panelText.fields[field as keyof ClerkingPanelText['fields']]?.label ||
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
        const [{ data: folder, error: folderError }, notesResult] = await Promise.all([
          supabase
            .from('patient_folders')
            .select('*')
            .eq('patient_id', patientId)
            .maybeSingle(),
          fetchDoctorConsultationNotesForFolder(patientId, doctorId, 10)
        ]);

        if (folderError) throw folderError;
        if (notesResult.error) throw notesResult.error;
        if (notesResult.missingTranslationColumns) {
          console.warn(
            'doctor_consultation_notes translation columns are missing. Falling back to legacy note fields.'
          );
        }

        setFolderData((folder as Record<string, any> | null) ?? null);
        setFolderNotes(
          notesResult.data.map((note) => ({
            id: note.id as string,
            created_at: note.created_at as string,
            diagnosis: (note.diagnosis as string | null) ?? null,
            treatment_plan: (note.treatment_plan as string | null) ?? null,
            follow_up_notes: (note.follow_up_notes as string | null) ?? null,
            diagnosis_translations: (note.diagnosis_translations as Record<string, string> | null) ?? null,
            treatment_plan_translations: (note.treatment_plan_translations as Record<string, string> | null) ?? null,
            follow_up_notes_translations: (note.follow_up_notes_translations as Record<string, string> | null) ?? null
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
    if (isSaving) return;

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
${panelText.fields.presenting_complaint.label}:
${presentingComplaint}

${panelText.fields.history_of_presenting_complaint.label}:
${historyOfPresentingComplaint}

${panelText.fields.past_medical_history.label}:
${pastMedicalHistory}

${panelText.fields.past_drug_history.label}:
${pastDrugHistory}

${panelText.fields.allergies.label}:
${allergies}

${panelText.fields.family_social_history.label}:
${familyAndSocialHistory}

${panelText.fields.clinical_examination.label}:
${clinicalExamination}

${panelText.fields.assessment.label}:
${assessment}

${panelText.fields.treatment_plan.label}:
${treatmentPlan}

${panelText.fields.investigations.label}:
${investigations}

${panelText.fields.e_prescription.label}:
${ePrescription}
`;
    const payloadSignature = JSON.stringify({
      sessionId,
      patientId,
      doctorId,
      presentingComplaint: presentingComplaint.trim(),
      historyOfPresentingComplaint: historyOfPresentingComplaint.trim(),
      pastMedicalHistory: pastMedicalHistory.trim(),
      pastDrugHistory: pastDrugHistory.trim(),
      allergies: allergies.trim(),
      familyAndSocialHistory: familyAndSocialHistory.trim(),
      clinicalExamination: clinicalExamination.trim(),
      assessment: assessment.trim(),
      treatmentPlan: treatmentPlan.trim(),
      investigations: investigations.trim(),
      ePrescription: ePrescription.trim()
    });

    if (payloadSignature === lastSavedSignatureRef.current) {
      toast({
        title: 'Already Saved',
        description: 'These clinical notes were just saved.'
      });
      return;
    }

    setIsSaving(true);

    try {
      const insertPayloadWithTranslations = {
        session_id: sessionId,
        patient_id: patientId,
        doctor_id: doctorId,
        diagnosis: assessment.trim() || null,
        diagnosis_translations: toTranslationPayload(assessment),
        treatment_plan: treatmentPlan.trim() || null,
        treatment_plan_translations: toTranslationPayload(treatmentPlan),
        prescriptions: ePrescription.trim() || null,
        prescriptions_translations: toTranslationPayload(ePrescription),
        follow_up_notes_translations: toTranslationPayload(composedNote),
        follow_up_notes: composedNote
      };

      const insertPayloadLegacy = {
        session_id: sessionId,
        patient_id: patientId,
        doctor_id: doctorId,
        diagnosis: assessment.trim() || null,
        treatment_plan: treatmentPlan.trim() || null,
        prescriptions: ePrescription.trim() || null,
        follow_up_notes: composedNote
      };

      const insertWithTranslationsResult = await supabase
        .from('doctor_consultation_notes')
        .insert(insertPayloadWithTranslations);

      if (insertWithTranslationsResult.error) {
        if (!isMissingTranslationColumnsError(insertWithTranslationsResult.error)) {
          throw insertWithTranslationsResult.error;
        }

        const legacyInsertResult = await supabase
          .from('doctor_consultation_notes')
          .insert(insertPayloadLegacy);

        if (legacyInsertResult.error) throw legacyInsertResult.error;
        console.warn(
          'doctor_consultation_notes translation columns are missing. Saved clerking note using legacy columns.'
        );
      }

      const rpcPayloadWithTranslations = {
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
        p_e_prescription: ePrescription.trim() || null,
        p_medical_history_translations: toTranslationPayload(composedNote),
        p_presenting_complaint_translations: toTranslationPayload(presentingComplaint),
        p_history_of_presenting_complaint_translations: toTranslationPayload(historyOfPresentingComplaint),
        p_past_medical_history_translations: toTranslationPayload(pastMedicalHistory),
        p_past_drug_history_translations: toTranslationPayload(pastDrugHistory),
        p_allergies_translations: toTranslationPayload(allergies),
        p_family_social_history_translations: toTranslationPayload(familyAndSocialHistory),
        p_clinical_examination_translations: toTranslationPayload(clinicalExamination),
        p_assessment_translations: toTranslationPayload(assessment),
        p_treatment_plan_translations: toTranslationPayload(treatmentPlan),
        p_investigations_translations: toTranslationPayload(investigations),
        p_e_prescription_translations: toTranslationPayload(ePrescription)
      };
      const rpcPayloadLegacy = {
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
        p_e_prescription: ePrescription.trim() || null,
      };

      const rpcWithTranslationsResult = await supabase.rpc(
        'doctor_append_to_patient_folder',
        rpcPayloadWithTranslations
      );

      if (rpcWithTranslationsResult.error) {
        if (!isLegacyPatientFolderRpcSignatureError(rpcWithTranslationsResult.error)) {
          throw rpcWithTranslationsResult.error;
        }

        const legacyRpcResult = await supabase.rpc('doctor_append_to_patient_folder', rpcPayloadLegacy);
        if (legacyRpcResult.error) throw legacyRpcResult.error;
        console.warn(
          'doctor_append_to_patient_folder translation params are missing in DB function. Saved using legacy RPC signature.'
        );
      }
      lastSavedSignatureRef.current = payloadSignature;

      localStorage.removeItem(storageKey);

      toast({
        title: 'Clinical Notes Saved',
        description: 'Clinical notes recorded successfully.'
      });
      onClerkingSaved?.();

    } catch (err) {
      lastSavedSignatureRef.current = null;
      console.error(err);
      toast({
        title: 'Error',
        description: 'Failed to save clinical notes.',
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
              {panelText.panelTitle}
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
              {panelText.addClerking}
            </Button>
            <Button
              size="sm"
              variant={activeView === 'folder' ? 'default' : 'outline'}
              onClick={() => setActiveView('folder')}
              className="flex-1"
            >
              <FolderOpen className="w-3 h-3 mr-1" />
              {panelText.viewPatientFolder}
            </Button>
          </div>

          {activeView === 'clerking' ? (
            <>
              <ScrollArea className="flex-1 p-4">
                <div className="space-y-4">

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.presenting_complaint.label}</label>
                    <Textarea
                      placeholder={panelText.fields.presenting_complaint.placeholder}
                      value={presentingComplaint}
                      onChange={(e) => setPresentingComplaint(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.history_of_presenting_complaint.label}</label>
                    <Textarea
                      placeholder={panelText.fields.history_of_presenting_complaint.placeholder}
                      value={historyOfPresentingComplaint}
                      onChange={(e) => setHistoryOfPresentingComplaint(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.past_medical_history.label}</label>
                    <Textarea
                      placeholder={panelText.fields.past_medical_history.placeholder}
                      value={pastMedicalHistory}
                      onChange={(e) => setPastMedicalHistory(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.past_drug_history.label}</label>
                    <Textarea
                      placeholder={panelText.fields.past_drug_history.placeholder}
                      value={pastDrugHistory}
                      onChange={(e) => setPastDrugHistory(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.allergies.label}</label>
                    <Textarea
                      placeholder={panelText.fields.allergies.placeholder}
                      value={allergies}
                      onChange={(e) => setAllergies(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.family_social_history.label}</label>
                    <Textarea
                      placeholder={panelText.fields.family_social_history.placeholder}
                      value={familyAndSocialHistory}
                      onChange={(e) => setFamilyAndSocialHistory(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.clinical_examination.label}</label>
                    <Textarea
                      placeholder={panelText.fields.clinical_examination.placeholder}
                      value={clinicalExamination}
                      onChange={(e) => setClinicalExamination(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.assessment.label}</label>
                    <Textarea
                      placeholder={panelText.fields.assessment.placeholder}
                      value={assessment}
                      onChange={(e) => setAssessment(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.treatment_plan.label}</label>
                    <Textarea
                      placeholder={panelText.fields.treatment_plan.placeholder}
                      value={treatmentPlan}
                      onChange={(e) => setTreatmentPlan(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.investigations.label}</label>
                    <Textarea
                      placeholder={panelText.fields.investigations.placeholder}
                      value={investigations}
                      onChange={(e) => setInvestigations(e.target.value)}
                      className="bg-[#1a1a2e] text-white mt-1"
                    />
                  </div>

                  <div>
                    <label className="text-xs text-slate-400">{panelText.fields.e_prescription.label}</label>
                    <Textarea
                      placeholder={panelText.fields.e_prescription.placeholder}
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
                  {isSaving ? panelText.saving : panelText.saveClerking}
                </Button>
              </div>
            </>
          ) : (
            <ScrollArea className="flex-1 p-4">
              {isFolderLoading ? (
                <p className="text-sm text-slate-400">{panelText.loadingPatientFolder}</p>
              ) : (
                <div className="space-y-5">
                  {folderData ? (
                    <div className="space-y-3">
                      {folderFieldOrder.map((field) => (
                        <div key={field}>
                          <h4 className="text-sm font-semibold text-white mb-2">{formatFolderFieldLabel(field)}</h4>
                          <div className="rounded-md border border-white/10 bg-[#1a1a2e] p-3 text-sm text-slate-200 whitespace-pre-wrap">
                            {getLocalizedText(
                              folderData[field],
                              folderData[`${field}_translations`],
                              language
                            ) || `${panelText.notRecorded}.`}
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <p className="text-sm text-slate-400">{panelText.noPatientFolder}</p>
                  )}

                  <div>
                    <h4 className="text-sm font-semibold text-white mb-2">{panelText.recentEntries}</h4>
                    {folderNotes.length === 0 ? (
                      <p className="text-sm text-slate-400">{panelText.noEntries}</p>
                    ) : (
                      <div className="space-y-3">
                        {folderNotes.map((note) => (
                          <div key={note.id} className="rounded-md border border-white/10 bg-[#1a1a2e] p-3">
                            <p className="text-[11px] text-slate-400 mb-2">
                              {formatDateTime(note.created_at)}
                            </p>
                            <p className="text-xs text-slate-300">
                              <span className="text-slate-400">{panelText.fields.assessment.label}: </span>
                              {getLocalizedText(note.diagnosis, note.diagnosis_translations, language) || panelText.notRecorded}
                            </p>
                            <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">
                              <span className="text-slate-400">{panelText.fields.treatment_plan.label}: </span>
                              {getLocalizedText(note.treatment_plan, note.treatment_plan_translations, language) || panelText.notRecorded}
                            </p>
                            <p className="text-xs text-slate-300 mt-1 whitespace-pre-wrap">
                              <span className="text-slate-400">{panelText.fullClerkingNote}: </span>
                              {getLocalizedText(note.follow_up_notes, note.follow_up_notes_translations, language) || panelText.notRecorded}
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
