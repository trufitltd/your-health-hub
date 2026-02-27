import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { toast } from '@/components/ui/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { PricingService } from '@/services/PricingService';
import type {
  FeatureFlagName,
  PricingRuleType,
  PricingConditionType,
  PricingAction,
  PricingProfile,
  PricingRule,
  DoctorTier,
  PlatformFeeRule,
  ConsultationType,
} from '@/services/marketplaceTypes';

const DEFAULT_RULE_FORM = {
  rule_type: 'base' as PricingRuleType,
  condition_type: 'doctor_type' as PricingConditionType,
  condition_value: 'GP',
  price_action: 'set' as PricingAction,
  amount: '5000',
  priority: '100',
};

const featureLabels: Record<FeatureFlagName, string> = {
  duration_pricing: 'Duration Pricing',
  tier_pricing: 'Tier Pricing',
  consultation_type_pricing: 'Consultation Type Pricing',
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
  const [ruleForm, setRuleForm] = useState(DEFAULT_RULE_FORM);
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

  const { data: featureFlags = [] } = useQuery({
    queryKey: ['pricing-flags-admin'],
    queryFn: () => PricingService.listFeatureFlags(),
  });

  const { data: consultationTypes = [] } = useQuery({
    queryKey: ['consultation-types-admin'],
    queryFn: () => PricingService.listConsultationTypes(),
  });

  const { data: doctorTiers = [] } = useQuery({
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
    queryClient.invalidateQueries({ queryKey: ['platform-fee-rules-admin'] });
  };

  useEffect(() => {
    setEditingRuleId(null);
    setRuleForm(DEFAULT_RULE_FORM);
  }, [currentProfileId]);

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
    mutationFn: async () => {
      if (!currentProfileId) throw new Error('Select a pricing profile first');
      return PricingService.upsertRule({
        id: editingRule?.id,
        pricing_profile_id: currentProfileId,
        rule_type: ruleForm.rule_type,
        condition_type: ruleForm.condition_type,
        condition_value: ruleForm.condition_value.trim(),
        price_action: ruleForm.price_action,
        amount: Number(ruleForm.amount || 0),
        priority: Number(ruleForm.priority || 100),
        active: editingRule?.active ?? true,
      });
    },
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
                  <p className="text-xs text-muted-foreground">{flag.feature_name}</p>
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

      <Card>
        <CardHeader>
          <CardTitle>Pricing Rules</CardTitle>
          <CardDescription>Base and modifier rules for doctor type, duration, tier, and consultation mode.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!currentProfileId && (
            <p className="text-sm text-muted-foreground">Create and select a pricing profile to add rules.</p>
          )}

          <div className="grid md:grid-cols-6 gap-2">
            <select
              value={ruleForm.rule_type}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, rule_type: event.target.value as PricingRuleType }))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
              <option value="base">base</option>
              <option value="modifier">modifier</option>
            </select>

            <select
              value={ruleForm.condition_type}
              onChange={(event) => setRuleForm((prev) => ({ ...prev, condition_type: event.target.value as PricingConditionType }))}
              className="rounded-md border border-input bg-background px-3 py-2 text-sm"
            >
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
                onClick={() => upsertRuleMutation.mutate()}
                disabled={upsertRuleMutation.isPending || !currentProfileId || !ruleForm.condition_value.trim()}
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

          <div className="space-y-2">
            {rules.length === 0 ? (
              <p className="text-sm text-muted-foreground">No pricing rules for this profile yet.</p>
            ) : (
              rules.map((rule: PricingRule) => (
                <div key={rule.id} className="rounded-lg border p-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="text-sm">
                    <span className="font-medium">[{rule.priority}]</span>{' '}
                    <span>{rule.rule_type}</span>{' '}
                    <span>{rule.condition_type}:{rule.condition_value}</span>{' '}
                    <span>{rule.price_action} {rule.amount}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={rule.active ? 'default' : 'secondary'}>{rule.active ? 'Active' : 'Disabled'}</Badge>
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
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle>Consultation Types</CardTitle>
            <CardDescription>Enable/disable modes and optional flat-rate override.</CardDescription>
          </CardHeader>
          <CardContent className="space-y-2">
            {consultationTypes.map((type: ConsultationType) => (
              <div key={type.id} className="rounded-lg border p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium capitalize">{type.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Flat rate: {type.flat_rate ? `₦${Number(type.flat_rate).toLocaleString()}` : 'none'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    className="w-28"
                    defaultValue={type.flat_rate ?? ''}
                    placeholder="Flat rate"
                    onBlur={(event) => {
                      const value = event.target.value.trim();
                      updateConsultationTypeMutation.mutate({
                        id: type.id,
                        name: type.name,
                        flat_rate: value ? Number(value) : null,
                        active: type.active,
                      });
                    }}
                  />
                  <Switch
                    checked={!!type.active}
                    onCheckedChange={(checked) =>
                      updateConsultationTypeMutation.mutate({
                        id: type.id,
                        name: type.name,
                        flat_rate: type.flat_rate,
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
          <CardTitle>Platform Fee Rules</CardTitle>
          <CardDescription>Set fee rules by doctor type (GP vs Specialist).</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {platformFeeRules.map((rule: PlatformFeeRule) => {
            const isEditing = editingFeeId === rule.id;

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

                  <Badge variant={rule.active ? 'default' : 'secondary'}>{rule.active ? 'Active' : 'Disabled'}</Badge>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => updateFeeMutation.mutate({ ...rule, active: !rule.active })}
                  >
                    {rule.active ? 'Disable' : 'Enable'}
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
