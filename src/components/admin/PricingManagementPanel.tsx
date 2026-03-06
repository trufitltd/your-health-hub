import { useCallback, useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PricingService } from '@/services/PricingService';
import {
  DEFAULT_BOOKING_DURATION_MINUTES,
  DEFAULT_CONSULTATION_TYPE,
  DEFAULT_PRICING_FEATURE_FLAGS,
} from '@/config/marketplaceDefaults';
import { AlertTriangle, X } from 'lucide-react';
import type {
  FeatureFlagName,
  PricingRuleType,
  PricingConditionType,
  PricingAction,
  PricingProfile,
  PricingRule,
  DoctorTier,
  AppointmentDurationOption,
  PlatformFeeRule,
  ConsultationType,
} from '@/services/marketplaceTypes';

const DEFAULT_RULE_FORM: RuleFormState = {
  rule_type: '' as PricingRuleType | '',
  condition_type: '' as PricingConditionType | '',
  condition_value: '',
  price_action: 'set' as PricingAction,
  amount: '',
  priority: '',
};

const featureLabels: Record<FeatureFlagName, string> = {
  duration_pricing: 'Duration Pricing',
  tier_pricing: 'Tier Pricing',
  consultation_type_pricing: 'Consultation Type Pricing',
};

const featureBehaviorNotes: Record<FeatureFlagName, string> = {
  duration_pricing: `When off, booking keeps fixed ${DEFAULT_BOOKING_DURATION_MINUTES} min and still requires manual slot selection.`,
  tier_pricing: 'When off, tier modifiers are ignored in final price calculation.',
  consultation_type_pricing: `When off, consultation mode defaults to ${DEFAULT_CONSULTATION_TYPE} and mode modifiers are ignored.`,
};

const DEFAULT_PROFILE_EDIT_FORM = {
  name: '',
  country_code: 'NG',
  currency: 'NGN',
};

const DEFAULT_TIER_EDIT_FORM = {
  name: '',
  experience_min: '0',
  experience_max: '',
};

const DEFAULT_DURATION_OPTIONS = [15, DEFAULT_BOOKING_DURATION_MINUTES, 45, 60];
const DEFAULT_CONSULTATION_TYPES = ['chat', 'voice', 'video'];
const MIN_ALLOWED_DURATION_MINUTES = 5;
const MAX_ALLOWED_DURATION_MINUTES = 240;
const VALID_DOCTOR_TYPES = ['gp', 'specialist'];

type RuleValidationLevel = 'warning' | 'error';

type RuleValidationIssue = {
  level: RuleValidationLevel;
  message: string;
};

type RuleFormState = {
  rule_type: PricingRuleType | '';
  condition_type: PricingConditionType | '';
  condition_value: string;
  price_action: PricingAction;
  amount: string;
  priority: string;
};

const normalizeRuleValue = (value?: string | null) => (value || '').trim().toLowerCase();

const parseDurationMinutes = (value: string): number | null => {
  const parsed = Number(value.trim());
  if (!Number.isInteger(parsed)) return null;
  if (parsed < MIN_ALLOWED_DURATION_MINUTES || parsed > MAX_ALLOWED_DURATION_MINUTES) return null;
  return parsed;
};

const getDurationOptionDisplayName = (option: AppointmentDurationOption) => {
  const fallbackName = `${option.value_minutes} min`;
  if (!option.name.trim()) return fallbackName;
  return option.name.trim();
};

const getErrorMessage = (error: unknown, fallback: string) => {
  if (typeof error === 'object' && error !== null && 'message' in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
};

export function PricingManagementPanel() {
  const queryClient = useQueryClient();

  const [newProfileName, setNewProfileName] = useState('');
  const [editingProfileId, setEditingProfileId] = useState<string | null>(null);
  const [profileEditForm, setProfileEditForm] = useState(DEFAULT_PROFILE_EDIT_FORM);
  const [selectedProfileId, setSelectedProfileId] = useState<string>('');
  const [newDurationNameInput, setNewDurationNameInput] = useState('');
  const [newDurationInput, setNewDurationInput] = useState('');
  const [editingDurationOptionId, setEditingDurationOptionId] = useState<string | null>(null);
  const [editingDurationNameInput, setEditingDurationNameInput] = useState('');
  const [editingDurationInput, setEditingDurationInput] = useState('');
  const [ruleForm, setRuleForm] = useState<RuleFormState>(DEFAULT_RULE_FORM);
  const [editingRuleId, setEditingRuleId] = useState<string | null>(null);
  const [newTierName, setNewTierName] = useState('');
  const [newTierMin, setNewTierMin] = useState('0');
  const [newTierMax, setNewTierMax] = useState('');
  const [editingTierId, setEditingTierId] = useState<string | null>(null);
  const [tierEditForm, setTierEditForm] = useState(DEFAULT_TIER_EDIT_FORM);
  const [editingFeeId, setEditingFeeId] = useState<string | null>(null);
  const [feeValueDraft, setFeeValueDraft] = useState('');

  const { data: profiles = [] } = useQuery({
    queryKey: ['pricing-profiles-admin'],
    queryFn: () => PricingService.listProfiles(),
  });

  const activeProfile = useMemo(() => {
    if (!profiles.length) return null;
    return profiles.find((profile) => profile.active) || profiles[0];
  }, [profiles]);

  useEffect(() => {
    if (!selectedProfileId && activeProfile?.id) {
      setSelectedProfileId(activeProfile.id);
    }
  }, [activeProfile?.id, selectedProfileId]);

  const currentProfileId = selectedProfileId || activeProfile?.id || '';

  const { data: rules = [] } = useQuery({
    queryKey: ['pricing-rules-admin', currentProfileId],
    queryFn: () => PricingService.listRules(currentProfileId),
    enabled: !!currentProfileId,
  });

  const editingRule = useMemo(
    () => rules.find((rule) => rule.id === editingRuleId) || null,
    [rules, editingRuleId],
  );

  const { data: durationOptions = [], isFetched: durationOptionsLoaded } = useQuery({
    queryKey: ['duration-options-admin'],
    queryFn: () => PricingService.listDurationOptions(),
  });

  const sortedDurationOptions = useMemo(
    () =>
      [...durationOptions].sort((a, b) => {
        if (a.sort_order !== b.sort_order) return a.sort_order - b.sort_order;
        return a.value_minutes - b.value_minutes;
      }),
    [durationOptions],
  );

  const editingDurationOption = useMemo(
    () => sortedDurationOptions.find((option) => option.id === editingDurationOptionId) || null,
    [sortedDurationOptions, editingDurationOptionId],
  );

  const { data: featureFlags = [], isFetched: featureFlagsLoaded } = useQuery({
    queryKey: ['pricing-flags-admin'],
    queryFn: () => PricingService.listFeatureFlags(),
  });

  const { data: consultationTypes = [] } = useQuery({
    queryKey: ['consultation-types-admin'],
    queryFn: () => PricingService.listConsultationTypes(),
  });

  const { data: doctorTiers = [], isFetched: doctorTiersLoaded } = useQuery({
    queryKey: ['doctor-tiers-admin'],
    queryFn: () => PricingService.listDoctorTiers(),
  });

  const { data: platformFeeRules = [] } = useQuery({
    queryKey: ['platform-fee-rules-admin'],
    queryFn: () => PricingService.listPlatformFeeRules(),
  });

  useEffect(() => {
    const channel = supabase
      .channel('admin-pricing-realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_profiles' }, () => {
        queryClient.invalidateQueries({ queryKey: ['pricing-profiles-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_rules' }, () => {
        queryClient.invalidateQueries({ queryKey: ['pricing-rules-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pricing_feature_flags' }, () => {
        queryClient.invalidateQueries({ queryKey: ['pricing-flags-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'consultation_types' }, () => {
        queryClient.invalidateQueries({ queryKey: ['consultation-types-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'doctor_tiers' }, () => {
        queryClient.invalidateQueries({ queryKey: ['doctor-tiers-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'appointment_duration_options' }, () => {
        queryClient.invalidateQueries({ queryKey: ['duration-options-admin'] });
      })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'platform_fee_rules' }, () => {
        queryClient.invalidateQueries({ queryKey: ['platform-fee-rules-admin'] });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const refreshAll = () => {
    queryClient.invalidateQueries({ queryKey: ['pricing-profiles-admin'] });
    queryClient.invalidateQueries({ queryKey: ['pricing-rules-admin'] });
    queryClient.invalidateQueries({ queryKey: ['pricing-flags-admin'] });
    queryClient.invalidateQueries({ queryKey: ['consultation-types-admin'] });
    queryClient.invalidateQueries({ queryKey: ['doctor-tiers-admin'] });
    queryClient.invalidateQueries({ queryKey: ['duration-options-admin'] });
    queryClient.invalidateQueries({ queryKey: ['platform-fee-rules-admin'] });
    queryClient.invalidateQueries({ queryKey: ['allowed-durations-slot-selection'] });
    queryClient.invalidateQueries({ queryKey: ['allowed-durations-slot-selection-modal'] });
  };

  useEffect(() => {
    setEditingRuleId(null);
    setRuleForm(DEFAULT_RULE_FORM);
    setNewDurationNameInput('');
    setNewDurationInput('');
    setEditingDurationOptionId(null);
    setEditingDurationNameInput('');
    setEditingDurationInput('');
  }, [currentProfileId]);

  useEffect(() => {
    if (!editingDurationOptionId) return;
    if (!editingDurationOption) {
      setEditingDurationOptionId(null);
      setEditingDurationNameInput('');
      setEditingDurationInput('');
    }
  }, [editingDurationOption, editingDurationOptionId]);

  const createProfileMutation = useMutation({
    mutationFn: () =>
      PricingService.createProfile({
        name: newProfileName.trim(),
        country_code: 'NG',
        currency: 'NGN',
      }),
    onSuccess: (created) => {
      setNewProfileName('');
      setSelectedProfileId(created.id);
      toast({ title: 'Profile created', description: `${created.name} has been added.` });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to create pricing profile'), variant: 'destructive' });
    },
  });

  const updateProfileMutation = useMutation({
    mutationFn: ({ id, payload }: { id: string; payload: Pick<PricingProfile, 'name' | 'country_code' | 'currency'> }) =>
      PricingService.updateProfile(id, payload),
    onSuccess: () => {
      setEditingProfileId(null);
      setProfileEditForm(DEFAULT_PROFILE_EDIT_FORM);
      toast({ title: 'Profile updated' });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to update pricing profile'), variant: 'destructive' });
    },
  });

  const deleteProfileMutation = useMutation({
    mutationFn: (profileId: string) => PricingService.deleteProfile(profileId),
    onSuccess: (_, profileId) => {
      if (selectedProfileId === profileId) {
        setSelectedProfileId('');
      }
      if (editingProfileId === profileId) {
        setEditingProfileId(null);
        setProfileEditForm(DEFAULT_PROFILE_EDIT_FORM);
      }
      toast({ title: 'Profile removed' });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to remove profile'), variant: 'destructive' });
    },
  });

  const setActiveProfileMutation = useMutation({
    mutationFn: (profileId: string) => PricingService.setActiveProfile(profileId),
    onSuccess: () => {
      toast({ title: 'Active profile updated' });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to activate profile'), variant: 'destructive' });
    },
  });

  const upsertRuleMutation = useMutation({
    mutationFn: (payload: Parameters<typeof PricingService.upsertRule>[0]) => PricingService.upsertRule(payload),
    onSuccess: () => {
      const isEditing = !!editingRuleId;
      setEditingRuleId(null);
      setRuleForm(DEFAULT_RULE_FORM);
      toast({ title: isEditing ? 'Pricing rule updated' : 'Pricing rule added' });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to save pricing rule'), variant: 'destructive' });
    },
  });

  const upsertDurationOptionMutation = useMutation({
    mutationFn: (payload: Parameters<typeof PricingService.upsertDurationOption>[0]) =>
      PricingService.upsertDurationOption(payload),
    onSuccess: () => {
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to save duration option'), variant: 'destructive' });
    },
  });

  const deleteDurationOptionMutation = useMutation({
    mutationFn: (optionId: string) => PricingService.deleteDurationOption(optionId),
    onSuccess: () => {
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to remove duration option'), variant: 'destructive' });
    },
  });

  const deleteRuleMutation = useMutation({
    mutationFn: (ruleId: string) => PricingService.deleteRule(ruleId),
    onSuccess: (_, ruleId) => {
      if (editingRuleId === ruleId) {
        setEditingRuleId(null);
        setRuleForm(DEFAULT_RULE_FORM);
      }
      toast({ title: 'Pricing rule removed' });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to remove pricing rule'), variant: 'destructive' });
    },
  });

  const toggleRuleMutation = useMutation({
    mutationFn: (rule: PricingRule) => PricingService.upsertRule({ ...rule, active: !rule.active }),
    onSuccess: () => refreshAll(),
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to toggle rule'), variant: 'destructive' });
    },
  });

  const toggleFlagMutation = useMutation({
    mutationFn: ({ featureName, enabled }: { featureName: FeatureFlagName; enabled: boolean }) =>
      PricingService.setFeatureFlag(featureName, enabled),
    onSuccess: () => refreshAll(),
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to update feature flag'), variant: 'destructive' });
    },
  });

  const updateConsultationTypeMutation = useMutation({
    mutationFn: (payload: Parameters<typeof PricingService.upsertConsultationType>[0]) =>
      PricingService.upsertConsultationType(payload),
    onSuccess: () => refreshAll(),
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to update consultation type'), variant: 'destructive' });
    },
  });

  const createTierMutation = useMutation({
    mutationFn: () =>
      PricingService.upsertDoctorTier({
        name: newTierName.trim(),
        experience_min: Number(newTierMin || 0),
        experience_max: newTierMax.trim() ? Number(newTierMax) : null,
        active: true,
      }),
    onSuccess: () => {
      setNewTierName('');
      setNewTierMin('0');
      setNewTierMax('');
      toast({ title: 'Tier added' });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to add doctor tier'), variant: 'destructive' });
    },
  });

  const updateTierMutation = useMutation({
    mutationFn: (payload: Parameters<typeof PricingService.upsertDoctorTier>[0]) =>
      PricingService.upsertDoctorTier(payload),
    onSuccess: () => refreshAll(),
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to update tier'), variant: 'destructive' });
    },
  });

  const updateFeeMutation = useMutation({
    mutationFn: (payload: Parameters<typeof PricingService.upsertPlatformFeeRule>[0]) =>
      PricingService.upsertPlatformFeeRule(payload),
    onSuccess: () => refreshAll(),
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to update platform fee rule'), variant: 'destructive' });
    },
  });

  const deleteFeeMutation = useMutation({
    mutationFn: (ruleId: string) => PricingService.deletePlatformFeeRule(ruleId),
    onSuccess: (_, ruleId) => {
      if (editingFeeId === ruleId) {
        setEditingFeeId(null);
        setFeeValueDraft('');
      }
      toast({ title: 'Platform fee rule removed' });
      refreshAll();
    },
    onError: (error: unknown) => {
      toast({ title: 'Error', description: getErrorMessage(error, 'Failed to remove platform fee rule'), variant: 'destructive' });
    },
  });

  const featureFlagLookup = useMemo<Record<FeatureFlagName, boolean>>(() => {
    const defaults: Record<FeatureFlagName, boolean> = { ...DEFAULT_PRICING_FEATURE_FLAGS };

    featureFlags.forEach((flag) => {
      const key = flag.feature_name as FeatureFlagName;
      if (key in defaults) defaults[key] = !!flag.enabled;
    });

    return defaults;
  }, [featureFlags]);

  const platformFeeRuleCountByDoctorType = useMemo<Record<'GP' | 'Specialist', number>>(() => {
    return platformFeeRules.reduce(
      (acc, rule) => {
        acc[rule.doctor_type] += 1;
        return acc;
      },
      { GP: 0, Specialist: 0 },
    );
  }, [platformFeeRules]);

  const canDeletePlatformFeeRule = (rule: PlatformFeeRule) => platformFeeRuleCountByDoctorType[rule.doctor_type] > 1;

  const allTierValues = useMemo(
    () =>
      new Set(
        doctorTiers
          .flatMap((tier) => [normalizeRuleValue(tier.id), normalizeRuleValue(tier.name)])
          .filter(Boolean),
      ),
    [doctorTiers],
  );

  const activeTierValues = useMemo(
    () =>
      new Set(
        doctorTiers
          .filter((tier) => tier.active)
          .flatMap((tier) => [normalizeRuleValue(tier.id), normalizeRuleValue(tier.name)])
          .filter(Boolean),
      ),
    [doctorTiers],
  );

  const allConsultationTypeValues = useMemo(
    () =>
      new Set(
        (consultationTypes.length > 0
          ? consultationTypes.map((type) => normalizeRuleValue(type.name))
          : DEFAULT_CONSULTATION_TYPES
        ).filter(Boolean),
      ),
    [consultationTypes],
  );

  const activeConsultationTypeValues = useMemo(
    () =>
      new Set(
        (consultationTypes.length > 0
          ? consultationTypes
            .filter((type) => type.active)
            .map((type) => normalizeRuleValue(type.name))
          : DEFAULT_CONSULTATION_TYPES
        ).filter(Boolean),
      ),
    [consultationTypes],
  );

  const allDurationValues = useMemo(
    () => new Set(durationOptions.map((option) => option.value_minutes)),
    [durationOptions],
  );

  const activeDurationValues = useMemo(
    () =>
      new Set(
        durationOptions
          .filter((option) => option.active)
          .map((option) => option.value_minutes),
      ),
    [durationOptions],
  );

  const validateRuleApplicability = useCallback(
    (rule: {
      id?: string;
      rule_type: PricingRuleType | '';
      condition_type: PricingConditionType | '';
      condition_value: string;
      active?: boolean;
    }): RuleValidationIssue[] => {
      const issues: RuleValidationIssue[] = [];
      const normalizedValue = normalizeRuleValue(rule.condition_value);

      if (!rule.rule_type) {
        issues.push({ level: 'error', message: 'Rule type is required.' });
      }

      if (!rule.condition_type) {
        issues.push({ level: 'error', message: 'Condition type is required.' });
      }

      if (!normalizedValue) {
        issues.push({ level: 'error', message: 'Condition value is required.' });
      }

      if (!rule.rule_type || !rule.condition_type || !normalizedValue) {
        return issues;
      }

      const duplicateRule = rules.find(
        (existingRule) =>
          existingRule.id !== rule.id &&
          existingRule.rule_type === rule.rule_type &&
          existingRule.condition_type === rule.condition_type &&
          normalizeRuleValue(existingRule.condition_value) === normalizedValue,
      );
      if (duplicateRule) {
        issues.push({
          level: 'error',
          message: `Duplicate rule exists for ${rule.rule_type} ${rule.condition_type}:${rule.condition_value}.`,
        });
      }

      if (rule.rule_type === 'base' && rule.condition_type !== 'doctor_type') {
        issues.push({
          level: 'error',
          message: 'Base rules are only evaluated for doctor_type conditions.',
        });
      }

      if (rule.rule_type === 'modifier' && rule.condition_type === 'doctor_type') {
        issues.push({
          level: 'warning',
          message: 'doctor_type modifier rules are currently not evaluated by the pricing engine.',
        });
      }

      if (rule.condition_type === 'doctor_type') {
        if (!VALID_DOCTOR_TYPES.includes(normalizedValue)) {
          issues.push({
            level: 'error',
            message: `Unknown doctor type "${rule.condition_value}". Use GP or Specialist.`,
          });
        }
      }

      if (rule.condition_type === 'duration') {
        if (rule.rule_type !== 'modifier') {
          issues.push({
            level: 'error',
            message: 'Duration rules only apply when rule_type is modifier.',
          });
        }

        const parsedDuration = parseDurationMinutes(rule.condition_value);
        if (parsedDuration === null) {
          issues.push({
            level: 'error',
            message: `Duration must be a whole number between ${MIN_ALLOWED_DURATION_MINUTES} and ${MAX_ALLOWED_DURATION_MINUTES} minutes.`,
          });
        } else if (durationOptionsLoaded) {
          if (durationOptions.length === 0) {
            issues.push({
              level: 'error',
              message: 'No duration options are configured. Add duration options in Allowed Durations first.',
            });
          } else if (!allDurationValues.has(parsedDuration)) {
            issues.push({
              level: 'error',
              message: `Duration ${parsedDuration} min is not in Allowed Durations.`,
            });
          } else if (!activeDurationValues.has(parsedDuration)) {
            issues.push({
              level: 'warning',
              message: `Duration ${parsedDuration} min exists but is disabled.`,
            });
          }
        }

        if (featureFlagsLoaded && !featureFlagLookup.duration_pricing) {
          issues.push({
            level: 'warning',
            message: `Duration pricing is disabled, so duration modifiers are ignored and booking uses default ${DEFAULT_BOOKING_DURATION_MINUTES} min.`,
          });
        }
      }

      if (rule.condition_type === 'tier') {
        if (rule.rule_type !== 'modifier') {
          issues.push({
            level: 'error',
            message: 'Tier rules only apply when rule_type is modifier.',
          });
        }

        if (doctorTiersLoaded) {
          if (doctorTiers.length === 0) {
            issues.push({
              level: 'warning',
              message: 'No doctor tiers are configured yet.',
            });
          } else if (!allTierValues.has(normalizedValue)) {
            issues.push({
              level: 'error',
              message: `Tier value "${rule.condition_value}" does not match any configured tier id or name.`,
            });
          } else if (!activeTierValues.has(normalizedValue)) {
            issues.push({
              level: 'warning',
              message: 'This tier exists but is disabled.',
            });
          }
        }

        if (featureFlagsLoaded && !featureFlagLookup.tier_pricing) {
          issues.push({
            level: 'warning',
            message: 'Tier pricing is disabled, so tier modifiers will be ignored.',
          });
        }
      }

      if (rule.condition_type === 'consultation_type') {
        if (rule.rule_type !== 'modifier') {
          issues.push({
            level: 'error',
            message: 'Consultation type rules only apply when rule_type is modifier.',
          });
        }

        if (!allConsultationTypeValues.has(normalizedValue)) {
          issues.push({
            level: 'error',
            message: `Consultation type "${rule.condition_value}" is invalid. Use chat, voice, or video.`,
          });
        } else if (!activeConsultationTypeValues.has(normalizedValue)) {
          issues.push({
            level: 'warning',
            message: 'This consultation type is configured but disabled.',
          });
        }

        if (featureFlagsLoaded && !featureFlagLookup.consultation_type_pricing) {
          issues.push({
            level: 'warning',
            message: `Consultation type pricing is disabled, so consultation modifiers are ignored and mode defaults to ${DEFAULT_CONSULTATION_TYPE}.`,
          });
        }
      }

      return issues;
    },
    [
      activeConsultationTypeValues,
      activeDurationValues,
      activeTierValues,
      allConsultationTypeValues,
      allDurationValues,
      allTierValues,
      doctorTiers.length,
      doctorTiersLoaded,
      durationOptions.length,
      durationOptionsLoaded,
      featureFlagLookup,
      featureFlagsLoaded,
      rules,
    ],
  );

  const ruleValidationMap = useMemo(() => {
    const issuesByRuleId = new Map<string, RuleValidationIssue[]>();
    rules.forEach((rule) => {
      const issues = validateRuleApplicability(rule);
      if (issues.length > 0) {
        issuesByRuleId.set(rule.id, issues);
      }
    });
    return issuesByRuleId;
  }, [rules, validateRuleApplicability]);

  const ruleValidationSummary = useMemo(() => {
    let errorCount = 0;
    let warningCount = 0;
    ruleValidationMap.forEach((issues) => {
      issues.forEach((issue) => {
        if (issue.level === 'error') errorCount += 1;
        else warningCount += 1;
      });
    });
    return {
      errorCount,
      warningCount,
      rulesWithIssues: ruleValidationMap.size,
    };
  }, [ruleValidationMap]);

  const draftRuleIssues = useMemo(
    () =>
      validateRuleApplicability({
        id: editingRule?.id,
        rule_type: ruleForm.rule_type,
        condition_type: ruleForm.condition_type,
        condition_value: ruleForm.condition_value,
        active: editingRule?.active ?? true,
      }),
    [editingRule?.active, editingRule?.id, ruleForm.condition_type, ruleForm.condition_value, ruleForm.rule_type, validateRuleApplicability],
  );

  const hasDraftRuleErrors = useMemo(
    () => draftRuleIssues.some((issue) => issue.level === 'error'),
    [draftRuleIssues],
  );

  const isRuleFormPristine = useMemo(
    () =>
      !editingRuleId &&
      !ruleForm.rule_type &&
      !ruleForm.condition_type &&
      !ruleForm.condition_value.trim() &&
      !ruleForm.amount.trim() &&
      !ruleForm.priority.trim(),
    [
      editingRuleId,
      ruleForm.amount,
      ruleForm.condition_type,
      ruleForm.condition_value,
      ruleForm.priority,
      ruleForm.rule_type,
    ],
  );

  const findDurationOptionByMinutes = (minutes: number, excludeOptionId?: string) => {
    const matches = sortedDurationOptions.filter((option) => {
      if (excludeOptionId && option.id === excludeOptionId) return false;
      return option.value_minutes === minutes;
    });
    return matches.find((option) => option.active) || matches[0];
  };

  const handleAddDuration = (minutesRaw: string, customName?: string) => {
    const durationMinutes = parseDurationMinutes(minutesRaw);
    if (durationMinutes === null) {
      toast({
        title: 'Invalid duration',
        description: `Enter a whole number between ${MIN_ALLOWED_DURATION_MINUTES} and ${MAX_ALLOWED_DURATION_MINUTES} minutes.`,
        variant: 'destructive',
      });
      return;
    }

    const existingOption = findDurationOptionByMinutes(durationMinutes);
    const customNameTrimmed = (customName || '').trim();
    const nextName = customNameTrimmed || (existingOption ? getDurationOptionDisplayName(existingOption) : `${durationMinutes} min`);
    if (existingOption?.active) {
      toast({ title: 'Already exists', description: `${durationMinutes} minutes is already active.` });
      return;
    }

    if (existingOption && !existingOption.active) {
      upsertDurationOptionMutation.mutate(
        {
          id: existingOption.id,
          name: nextName || getDurationOptionDisplayName(existingOption),
          value_minutes: durationMinutes,
          active: true,
          sort_order: existingOption.sort_order || durationMinutes,
        },
        {
          onSuccess: () => {
            setNewDurationNameInput('');
            setNewDurationInput('');
            toast({ title: 'Duration enabled', description: `${durationMinutes} minutes is now active.` });
          },
        },
      );
      return;
    }

    upsertDurationOptionMutation.mutate(
      {
        name: nextName,
        value_minutes: durationMinutes,
        active: true,
        sort_order: durationMinutes,
      },
      {
        onSuccess: () => {
          setNewDurationNameInput('');
          setNewDurationInput('');
          toast({ title: 'Duration added', description: `${durationMinutes} minutes is now available.` });
        },
      },
    );
  };

  const handleStartDurationEdit = (option: AppointmentDurationOption) => {
    setEditingDurationOptionId(option.id);
    setEditingDurationNameInput(option.name);
    setEditingDurationInput(String(option.value_minutes));
  };

  const handleSaveDurationEdit = (option: AppointmentDurationOption) => {
    const durationMinutes = parseDurationMinutes(editingDurationInput);
    if (durationMinutes === null) {
      toast({
        title: 'Invalid duration',
        description: `Enter a whole number between ${MIN_ALLOWED_DURATION_MINUTES} and ${MAX_ALLOWED_DURATION_MINUTES} minutes.`,
        variant: 'destructive',
      });
      return;
    }

    const duplicateOption = findDurationOptionByMinutes(durationMinutes, option.id);
    if (duplicateOption) {
      toast({ title: 'Duplicate duration', description: `${durationMinutes} minutes already exists in another duration option.` });
      return;
    }

    const nextName = editingDurationNameInput.trim() || `${durationMinutes} min`;
    upsertDurationOptionMutation.mutate(
      {
        id: option.id,
        name: nextName,
        value_minutes: durationMinutes,
        active: option.active,
        sort_order: option.sort_order || durationMinutes,
      },
      {
        onSuccess: () => {
          setEditingDurationOptionId(null);
          setEditingDurationNameInput('');
          setEditingDurationInput('');
          toast({ title: 'Duration updated', description: `${nextName} saved.` });
        },
      },
    );
  };

  const handleToggleDurationOption = (option: AppointmentDurationOption) => {
    upsertDurationOptionMutation.mutate(
      {
        id: option.id,
        name: option.name,
        value_minutes: option.value_minutes,
        active: !option.active,
        sort_order: option.sort_order,
      },
      {
        onSuccess: () => {
          toast({ title: `Duration ${option.active ? 'disabled' : 'enabled'}` });
        },
      },
    );
  };

  const handleDeleteDurationOption = (option: AppointmentDurationOption) => {
    const durationLabel = `${option.value_minutes} minute`;
    if (!window.confirm(`Delete ${durationLabel} duration option?`)) return;
    deleteDurationOptionMutation.mutate(option.id, {
      onSuccess: () => {
        if (editingDurationOptionId === option.id) {
          setEditingDurationOptionId(null);
          setEditingDurationNameInput('');
          setEditingDurationInput('');
        }
        toast({ title: 'Duration removed', description: `${durationLabel} option has been removed.` });
      },
    });
  };

  const handleSavePricingRule = () => {
    if (!currentProfileId) {
      toast({ title: 'Select profile', description: 'Select a pricing profile first.', variant: 'destructive' });
      return;
    }

    if (!ruleForm.rule_type || !ruleForm.condition_type) {
      toast({ title: 'Missing fields', description: 'Select rule type and condition type first.', variant: 'destructive' });
      return;
    }

    const amount = Number(ruleForm.amount);
    if (ruleForm.amount.trim() === '' || Number.isNaN(amount)) {
      toast({ title: 'Invalid amount', description: 'Enter a valid rule amount.', variant: 'destructive' });
      return;
    }

    const priority = ruleForm.priority.trim() ? Number(ruleForm.priority) : 100;
    if (!Number.isInteger(priority)) {
      toast({ title: 'Invalid priority', description: 'Priority must be a whole number.', variant: 'destructive' });
      return;
    }

    const blockingIssues = draftRuleIssues.filter((issue) => issue.level === 'error');
    if (blockingIssues.length > 0) {
      toast({
        title: 'Rule validation failed',
        description: blockingIssues[0].message,
        variant: 'destructive',
      });
      return;
    }

    const warningIssues = draftRuleIssues.filter((issue) => issue.level === 'warning');
    if (warningIssues.length > 0) {
      toast({
        title: 'Rule has warnings',
        description: warningIssues[0].message,
      });
    }

    upsertRuleMutation.mutate({
      id: editingRule?.id,
      pricing_profile_id: currentProfileId,
      rule_type: ruleForm.rule_type,
      condition_type: ruleForm.condition_type,
      condition_value: ruleForm.condition_value.trim(),
      price_action: ruleForm.price_action,
      amount,
      priority,
      active: editingRule?.active ?? true,
    });
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Pricing Profiles</CardTitle>
          <CardDescription>Set active pricing profile and control feature toggles.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          <div className="grid md:grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium">Active Profile</label>
              <select
                value={currentProfileId}
                onChange={(event) => setSelectedProfileId(event.target.value)}
                className="mt-1 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
              >
                {profiles.map((profile) => (
                  <option key={profile.id} value={profile.id}>
                    {profile.name}{profile.active ? ' (Active)' : ''}
                  </option>
                ))}
              </select>
              <Button
                className="mt-2"
                size="sm"
                onClick={() => {
                  if (currentProfileId) setActiveProfileMutation.mutate(currentProfileId);
                }}
                disabled={!currentProfileId || setActiveProfileMutation.isPending}
              >
                Set Active
              </Button>
            </div>

            <div>
              <label className="text-sm font-medium">Create Profile</label>
              <div className="mt-1 flex gap-2">
                <Input
                  placeholder="Profile name"
                  value={newProfileName}
                  onChange={(event) => setNewProfileName(event.target.value)}
                />
                <Button
                  onClick={() => createProfileMutation.mutate()}
                  disabled={!newProfileName.trim() || createProfileMutation.isPending}
                >
                  Add
                </Button>
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">Manage Profiles</label>
            {profiles.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing profiles yet.</p>
            ) : (
              profiles.map((profile) => {
                const isEditing = editingProfileId === profile.id;
                const canDelete = profiles.length > 1 && !profile.active;

                return (
                  <div key={profile.id} className="rounded-lg border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                    {isEditing ? (
                      <div className="grid flex-1 grid-cols-1 sm:grid-cols-3 gap-2">
                        <Input
                          value={profileEditForm.name}
                          onChange={(event) => setProfileEditForm((prev) => ({ ...prev, name: event.target.value }))}
                          placeholder="Profile name"
                        />
                        <Input
                          value={profileEditForm.country_code}
                          onChange={(event) => setProfileEditForm((prev) => ({ ...prev, country_code: event.target.value }))}
                          placeholder="Country code"
                        />
                        <Input
                          value={profileEditForm.currency}
                          onChange={(event) => setProfileEditForm((prev) => ({ ...prev, currency: event.target.value }))}
                          placeholder="Currency"
                        />
                      </div>
                    ) : (
                      <div className="flex-1">
                        <p className="text-sm font-medium">{profile.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {profile.country_code} • {profile.currency}
                        </p>
                      </div>
                    )}

                    <div className="flex items-center flex-wrap gap-2">
                      <Badge variant={profile.active ? 'default' : 'secondary'}>{profile.active ? 'Active' : 'Inactive'}</Badge>

                      {isEditing ? (
                        <>
                          <Button
                            size="sm"
                            onClick={() =>
                              updateProfileMutation.mutate({
                                id: profile.id,
                                payload: {
                                  name: profileEditForm.name.trim(),
                                  country_code: profileEditForm.country_code.trim().toUpperCase(),
                                  currency: profileEditForm.currency.trim().toUpperCase(),
                                },
                              })
                            }
                            disabled={
                              !profileEditForm.name.trim() ||
                              !profileEditForm.country_code.trim() ||
                              !profileEditForm.currency.trim() ||
                              updateProfileMutation.isPending
                            }
                          >
                            Save
                          </Button>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditingProfileId(null);
                              setProfileEditForm(DEFAULT_PROFILE_EDIT_FORM);
                            }}
                          >
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setEditingProfileId(profile.id);
                            setProfileEditForm({
                              name: profile.name,
                              country_code: profile.country_code,
                              currency: profile.currency,
                            });
                          }}
                        >
                          Edit
                        </Button>
                      )}

                      <Button
                        size="sm"
                        variant="destructive"
                        disabled={!canDelete || deleteProfileMutation.isPending}
                        onClick={() => {
                          if (!canDelete) return;
                          if (!window.confirm(`Remove pricing profile "${profile.name}"? This will also remove its rules.`)) return;
                          deleteProfileMutation.mutate(profile.id);
                        }}
                      >
                        Remove
                      </Button>
                    </div>
                  </div>
                );
              })
            )}
            {profiles.length <= 1 && (
              <p className="text-xs text-muted-foreground">
                Keep at least one profile available. Active profile cannot be removed.
              </p>
            )}
          </div>

          <div className="grid md:grid-cols-3 gap-4">
            {featureFlags.map((flag) => (
              <div key={flag.feature_name} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{featureLabels[flag.feature_name as FeatureFlagName]}</p>
                  <p className="text-xs text-muted-foreground">{featureBehaviorNotes[flag.feature_name as FeatureFlagName]}</p>
                </div>
                <Switch
                  checked={!!flag.enabled}
                  onCheckedChange={(checked) =>
                    toggleFlagMutation.mutate({
                      featureName: flag.feature_name as FeatureFlagName,
                      enabled: checked,
                    })
                  }
                />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Consultation Types</CardTitle>
            <CardDescription>Enable or disable consultation modes used in pricing and booking.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {consultationTypes.map((type: ConsultationType) => (
              <div key={type.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize">{type.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Flat rate override disabled
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Switch
                    checked={!!type.active}
                    onCheckedChange={(checked) =>
                      updateConsultationTypeMutation.mutate({
                        id: type.id,
                        name: type.name,
                        flat_rate: null,
                        active: checked,
                      })
                    }
                  />
                </div>
              </div>
            ))}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Doctor Tiers</CardTitle>
            <CardDescription>Configure experience-based tiers for price modifiers.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="grid grid-cols-4 gap-2">
              <Input value={newTierName} onChange={(e) => setNewTierName(e.target.value)} placeholder="Tier name" />
              <Input value={newTierMin} onChange={(e) => setNewTierMin(e.target.value)} type="number" placeholder="Min exp" />
              <Input value={newTierMax} onChange={(e) => setNewTierMax(e.target.value)} type="number" placeholder="Max exp" />
              <Button onClick={() => createTierMutation.mutate()} disabled={!newTierName.trim()}>Add</Button>
            </div>

            {doctorTiers.map((tier: DoctorTier) => {
              const isEditing = editingTierId === tier.id;

              return (
                <div key={tier.id} className="rounded-lg border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                  {isEditing ? (
                    <div className="grid flex-1 grid-cols-1 sm:grid-cols-3 gap-2">
                      <Input
                        value={tierEditForm.name}
                        onChange={(event) => setTierEditForm((prev) => ({ ...prev, name: event.target.value }))}
                        placeholder="Tier name"
                      />
                      <Input
                        type="number"
                        value={tierEditForm.experience_min}
                        onChange={(event) => setTierEditForm((prev) => ({ ...prev, experience_min: event.target.value }))}
                        placeholder="Min exp"
                      />
                      <Input
                        type="number"
                        value={tierEditForm.experience_max}
                        onChange={(event) => setTierEditForm((prev) => ({ ...prev, experience_max: event.target.value }))}
                        placeholder="Max exp"
                      />
                    </div>
                  ) : (
                    <div>
                      <p className="text-sm font-medium">{tier.name}</p>
                      <p className="text-xs text-muted-foreground">
                        {tier.experience_min} - {tier.experience_max ?? '∞'} years
                      </p>
                    </div>
                  )}

                  <div className="flex items-center flex-wrap gap-2">
                    <Badge variant={tier.active ? 'default' : 'secondary'}>{tier.active ? 'Active' : 'Disabled'}</Badge>

                    {isEditing ? (
                      <>
                        <Button
                          size="sm"
                          onClick={() =>
                            updateTierMutation.mutate(
                              {
                                id: tier.id,
                                name: tierEditForm.name.trim(),
                                experience_min: Number(tierEditForm.experience_min || 0),
                                experience_max: tierEditForm.experience_max.trim() ? Number(tierEditForm.experience_max) : null,
                                active: tier.active,
                              },
                              {
                                onSuccess: () => {
                                  setEditingTierId(null);
                                  setTierEditForm(DEFAULT_TIER_EDIT_FORM);
                                  toast({ title: 'Tier updated' });
                                },
                              },
                            )
                          }
                          disabled={!tierEditForm.name.trim() || updateTierMutation.isPending}
                        >
                          Save
                        </Button>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setEditingTierId(null);
                            setTierEditForm(DEFAULT_TIER_EDIT_FORM);
                          }}
                        >
                          Cancel
                        </Button>
                      </>
                    ) : (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingTierId(tier.id);
                          setTierEditForm({
                            name: tier.name,
                            experience_min: String(tier.experience_min),
                            experience_max: tier.experience_max === null ? '' : String(tier.experience_max),
                          });
                        }}
                      >
                        Edit
                      </Button>
                    )}

                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() =>
                        updateTierMutation.mutate({
                          id: tier.id,
                          name: tier.name,
                          experience_min: tier.experience_min,
                          experience_max: tier.experience_max,
                          active: !tier.active,
                        })
                      }
                    >
                      {tier.active ? 'Disable' : 'Enable'}
                    </Button>
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Allowed Durations</CardTitle>
          <CardDescription>Manage selectable duration options used when Duration Pricing is enabled.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-xs text-muted-foreground">
            When Duration Pricing is off, booking uses a fixed {DEFAULT_BOOKING_DURATION_MINUTES}-minute duration and ignores these options.
          </p>

          <div className="grid gap-2 sm:grid-cols-[1fr_140px_auto]">
            <Input
              className="w-full"
              value={newDurationNameInput}
              onChange={(event) => setNewDurationNameInput(event.target.value)}
              placeholder="Label (optional, e.g. 15 min)"
            />
            <Input
              type="number"
              min={MIN_ALLOWED_DURATION_MINUTES}
              max={MAX_ALLOWED_DURATION_MINUTES}
              step={1}
              className="w-full"
              value={newDurationInput}
              onChange={(event) => setNewDurationInput(event.target.value)}
              placeholder="Duration (min)"
            />
            <Button
              size="sm"
              onClick={() => handleAddDuration(newDurationInput, newDurationNameInput)}
              disabled={!newDurationInput.trim() || upsertDurationOptionMutation.isPending}
            >
              Add Duration
            </Button>
          </div>

          <div className="flex flex-wrap gap-2">
            {DEFAULT_DURATION_OPTIONS.map((minutes) => {
              const existingOption = findDurationOptionByMinutes(minutes);
              return (
                <Button
                  key={`duration-suggestion-${minutes}`}
                  size="sm"
                  variant="outline"
                  disabled={!!existingOption?.active || upsertDurationOptionMutation.isPending}
                  onClick={() => handleAddDuration(String(minutes), `${minutes} min`)}
                >
                  + {minutes} min
                </Button>
              );
            })}
          </div>

          {editingDurationOption && (
            <div className="rounded-md border border-dashed p-3 flex flex-wrap items-center gap-2">
              <span className="text-xs text-muted-foreground">Editing duration</span>
              <Input
                className="h-8 w-40"
                value={editingDurationNameInput}
                onChange={(event) => setEditingDurationNameInput(event.target.value)}
                placeholder="Label"
              />
              <Input
                type="number"
                min={MIN_ALLOWED_DURATION_MINUTES}
                max={MAX_ALLOWED_DURATION_MINUTES}
                step={1}
                className="h-8 w-28"
                value={editingDurationInput}
                onChange={(event) => setEditingDurationInput(event.target.value)}
              />
              <Button
                size="sm"
                onClick={() => handleSaveDurationEdit(editingDurationOption)}
                disabled={!editingDurationInput.trim() || upsertDurationOptionMutation.isPending}
              >
                Save
              </Button>
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  setEditingDurationOptionId(null);
                  setEditingDurationNameInput('');
                  setEditingDurationInput('');
                }}
              >
                Cancel
              </Button>
            </div>
          )}

          <div className="flex flex-wrap gap-2">
            {sortedDurationOptions.length === 0 ? (
              <p className="text-xs text-muted-foreground">
                No duration options yet. Add at least one duration before booking.
              </p>
            ) : (
              sortedDurationOptions.map((option) => {
                const label = getDurationOptionDisplayName(option);

                return (
                  <div
                    key={option.id}
                    className="inline-flex items-center gap-1 rounded-full border bg-background px-2 py-1"
                  >
                    <Badge variant={option.active ? 'default' : 'secondary'} className="rounded-full">
                      {label}
                    </Badge>
                    <span className="px-1 text-[11px] text-muted-foreground">{option.value_minutes} min</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => handleStartDurationEdit(option)}
                      disabled={upsertDurationOptionMutation.isPending}
                    >
                      Edit
                    </Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-[11px]"
                      onClick={() => handleToggleDurationOption(option)}
                      disabled={upsertDurationOptionMutation.isPending}
                    >
                      {option.active ? 'Disable' : 'Enable'}
                    </Button>
                    <Button
                      size="icon"
                      variant="ghost"
                      className="h-6 w-6 text-destructive hover:text-destructive"
                      onClick={() => handleDeleteDurationOption(option)}
                      disabled={deleteDurationOptionMutation.isPending}
                    >
                      <X className="h-3 w-3" />
                      <span className="sr-only">Delete duration option</span>
                    </Button>
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Pricing Rules</CardTitle>
          <CardDescription>Base and modifier rules for doctor type, tier, consultation mode, and advanced overrides.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!currentProfileId && (
            <p className="text-sm text-muted-foreground">Create and select a pricing profile to add rules.</p>
          )}

          {(ruleValidationSummary.errorCount > 0 || ruleValidationSummary.warningCount > 0) && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-sm">
              <div className="flex items-center gap-2 font-medium text-amber-900 dark:text-amber-300">
                <AlertTriangle className="h-4 w-4" />
                <span>Rule Validator</span>
              </div>
              <p className="mt-1 text-xs text-amber-900/90 dark:text-amber-200">
                {ruleValidationSummary.rulesWithIssues} rule(s) need attention: {ruleValidationSummary.errorCount} error(s), {ruleValidationSummary.warningCount} warning(s).
              </p>
            </div>
          )}

          <div className="grid md:grid-cols-6 gap-2">
            <select
              value={ruleForm.rule_type}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_type: event.target.value as RuleFormState['rule_type'] }))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select rule type</option>
              <option value="base">base</option>
              <option value="modifier">modifier</option>
            </select>

            <select
              value={ruleForm.condition_type}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, condition_type: event.target.value as RuleFormState['condition_type'] }))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="">Select condition</option>
              <option value="doctor_type">doctor_type</option>
              <option value="duration">duration</option>
              <option value="tier">tier</option>
              <option value="consultation_type">consultation_type</option>
            </select>

            <Input
              value={ruleForm.condition_value}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, condition_value: event.target.value }))}
              placeholder="Condition value"
            />

            <select
              value={ruleForm.price_action}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, price_action: event.target.value as PricingAction }))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="set">set</option>
              <option value="add">add</option>
              <option value="multiply">multiply</option>
            </select>

            <Input
              type="number"
              value={ruleForm.amount}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, amount: event.target.value }))}
              placeholder="Amount"
            />

            <div className="flex gap-2">
              <Input
                type="number"
                value={ruleForm.priority}
                onChange={(event) => setRuleForm((prev) => ({ ...prev, priority: event.target.value }))}
                placeholder="Priority"
              />
              <Button
                onClick={handleSavePricingRule}
                disabled={
                  upsertRuleMutation.isPending ||
                  !currentProfileId ||
                  !ruleForm.rule_type ||
                  !ruleForm.condition_type ||
                  !ruleForm.condition_value.trim() ||
                  !ruleForm.amount.trim() ||
                  hasDraftRuleErrors
                }
              >
                {editingRuleId ? 'Update' : 'Add'}
              </Button>
              {editingRuleId && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    setEditingRuleId(null);
                    setRuleForm(DEFAULT_RULE_FORM);
                  }}
                >
                  Cancel
                </Button>
              )}
            </div>
          </div>

          {!isRuleFormPristine && draftRuleIssues.length > 0 && (
            <div className="rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs">
              <p className="font-medium text-amber-900 dark:text-amber-300">Draft rule validation</p>
              <div className="mt-1 space-y-1">
                {draftRuleIssues.map((issue, index) => (
                  <p
                    key={`${issue.level}-${index}`}
                    className={issue.level === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-900 dark:text-amber-200'}
                  >
                    {issue.level === 'error' ? 'Error' : 'Warning'}: {issue.message}
                  </p>
                ))}
              </div>
            </div>
          )}

          <div className="space-y-2">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing rules for this profile yet.</p>
            ) : (
              rules.map((rule: PricingRule) => {
                const ruleIssues = ruleValidationMap.get(rule.id) || [];
                const isBaseRule = rule.rule_type === 'base';

                return (
                  <div
                    key={rule.id}
                    className={`rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3 ${
                      isBaseRule
                        ? 'border-l-4 border-l-emerald-500 bg-emerald-50/40 dark:bg-emerald-950/20'
                        : 'border-l-4 border-l-sky-500 bg-sky-50/40 dark:bg-sky-950/20'
                    }`}
                  >
                    <div className="text-sm">
                      <span className="font-medium">[{rule.priority}]</span>{' '}
                      <Badge
                        className={isBaseRule ? 'bg-emerald-600 text-white hover:bg-emerald-600' : 'bg-sky-600 text-white hover:bg-sky-600'}
                      >
                        {isBaseRule ? 'Base Fare' : 'Modifier'}
                      </Badge>{' '}
                      <span>{rule.condition_type}:{rule.condition_value}</span>{' '}
                      <span>{rule.price_action} {rule.amount}</span>
                    </div>
                    <div className="flex items-center flex-wrap gap-2">
                      <Badge variant={rule.active ? 'default' : 'secondary'}>{rule.active ? 'Active' : 'Disabled'}</Badge>
                      {ruleIssues.length > 0 && (
                        <Badge variant="secondary" className="bg-amber-500/15 text-amber-900 dark:text-amber-200">
                          Needs attention
                        </Badge>
                      )}
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => {
                          setEditingRuleId(rule.id);
                          setRuleForm({
                            rule_type: rule.rule_type,
                            condition_type: rule.condition_type,
                            condition_value: rule.condition_value,
                            price_action: rule.price_action,
                            amount: String(rule.amount),
                            priority: String(rule.priority),
                          });
                        }}
                      >
                        Edit
                      </Button>
                      <Button size="sm" variant="outline" onClick={() => toggleRuleMutation.mutate(rule)}>
                        {rule.active ? 'Disable' : 'Enable'}
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => {
                          if (!window.confirm('Delete this pricing rule?')) return;
                          deleteRuleMutation.mutate(rule.id);
                        }}
                      >
                        Delete
                      </Button>
                    </div>
                    {ruleIssues.length > 0 && (
                      <div className="w-full rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs space-y-1">
                        {ruleIssues.map((issue, index) => (
                          <p
                            key={`${rule.id}-issue-${index}`}
                            className={issue.level === 'error' ? 'text-red-700 dark:text-red-300' : 'text-amber-900 dark:text-amber-200'}
                          >
                            {issue.level === 'error' ? 'Error' : 'Warning'}: {issue.message}
                          </p>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Platform Fee Rules</CardTitle>
          <CardDescription>Set fee rules by doctor type (GP vs Specialist).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {platformFeeRules.map((rule: PlatformFeeRule) => {
            const isEditing = editingFeeId === rule.id;
            const isProtectedRule = !canDeletePlatformFeeRule(rule);

            return (
              <div key={rule.id} className="rounded-lg border p-3 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div className="text-sm flex items-center flex-wrap gap-2">
                  <span className="font-medium">{rule.doctor_type}</span>
                  <span>•</span>
                  <span>{rule.fee_type}</span>
                  <span>•</span>
                  {isEditing ? (
                    <Input
                      type="number"
                      className="w-28"
                      value={feeValueDraft}
                      onChange={(event) => setFeeValueDraft(event.target.value)}
                      placeholder="Rate"
                    />
                  ) : (
                    <span>{rule.value}</span>
                  )}
                </div>

                <div className="flex items-center flex-wrap gap-2">
                  <Badge variant={rule.active ? 'default' : 'secondary'}>{rule.active ? 'Active' : 'Disabled'}</Badge>

                  {isEditing ? (
                    <>
                      <Button
                        size="sm"
                        onClick={() =>
                          updateFeeMutation.mutate(
                            { ...rule, value: Number(feeValueDraft || 0) },
                            {
                              onSuccess: () => {
                                setEditingFeeId(null);
                                setFeeValueDraft('');
                                toast({ title: 'Platform fee updated' });
                              },
                            },
                          )
                        }
                        disabled={!feeValueDraft.trim() || updateFeeMutation.isPending}
                      >
                        Save
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          setEditingFeeId(null);
                          setFeeValueDraft('');
                        }}
                      >
                        Cancel
                      </Button>
                    </>
                  ) : (
                    <Button
                      size="sm"
                      variant="outline"
                      onClick={() => {
                        setEditingFeeId(rule.id);
                        setFeeValueDraft(String(rule.value));
                      }}
                    >
                      Edit Rate
                    </Button>
                  )}

                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateFeeMutation.mutate({ ...rule, active: !rule.active })}
                  >
                    {rule.active ? 'Disable' : 'Enable'}
                  </Button>
                  <Button
                    size="sm"
                    variant="destructive"
                    disabled={deleteFeeMutation.isPending || isProtectedRule}
                    title={isProtectedRule ? `At least one ${rule.doctor_type} platform fee rule must remain.` : 'Delete platform fee rule'}
                    onClick={() => {
                      if (isProtectedRule) {
                        toast({
                          title: 'Cannot delete rule',
                          description: `At least one ${rule.doctor_type} platform fee rule must remain.`,
                          variant: 'destructive',
                        });
                        return;
                      }
                      if (!window.confirm(`Delete platform fee rule for ${rule.doctor_type} (${rule.fee_type})?`)) return;
                      deleteFeeMutation.mutate(rule.id);
                    }}
                  >
                    Delete
                  </Button>
                </div>
              </div>
            );
          })}

          <div className="pt-2">
            <Button
              size="sm"
              variant="outline"
              onClick={() =>
                updateFeeMutation.mutate({
                  doctor_type: 'GP',
                  fee_type: 'percentage',
                  value: 10,
                  active: true,
                })
              }
            >
              Add GP Rule
            </Button>
            <Button
              size="sm"
              variant="outline"
              className="ml-2"
              onClick={() =>
                updateFeeMutation.mutate({
                  doctor_type: 'Specialist',
                  fee_type: 'percentage',
                  value: 15,
                  active: true,
                })
              }
            >
              Add Specialist Rule
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
