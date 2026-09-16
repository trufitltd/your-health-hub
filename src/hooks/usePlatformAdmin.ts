import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// ── Types ──────────────────────────────────────────────────────────────────

export interface Organisation {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  logo_url: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  country_code: string;
  currency: string;
  active: boolean;
  created_at: string;
  updated_at: string;
}

export interface OrganisationConfig {
  id: string;
  organisation_id: string;
  config_key: string;
  config_value: string;
  created_at: string;
  updated_at: string;
}

export interface MemberProfile {
  full_name: string | null;
  email: string | null;
}

export interface OrganisationMember {
  id: string;
  organisation_id: string;
  user_id: string;
  role: string;
  active: boolean;
  created_at: string;
  updated_at: string;
  profiles?: MemberProfile | null;
}

export interface OrganisationService {
  id: string;
  organisation_id: string;
  name: string;
  description: string;
  default_duration_minutes: number;
  consultation_mode: string;
  base_price: number;
  currency: string;
  required_specialties: string[];
  active: boolean;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface PlatformMetrics {
  totalOrganisations: number;
  activeOrganisations: number;
  inactiveOrganisations: number;
  totalOrgAdmins: number;
  recentOrganisations: Organisation[];
}

export interface CreateOrganisationInput {
  name: string;
  slug: string;
  description?: string;
  contact_email?: string;
  contact_phone?: string;
  country_code?: string;
  currency?: string;
  config?: Record<string, string>;
}

export interface UpdateOrganisationInput {
  id: string;
  name?: string;
  slug?: string;
  description?: string;
  contact_email?: string;
  contact_phone?: string;
  country_code?: string;
  currency?: string;
  active?: boolean;
  logo_url?: string;
}

// ── Queries ────────────────────────────────────────────────────────────────

export function usePlatformMetrics() {
  return useQuery({
    queryKey: ['platform-metrics'],
    queryFn: async (): Promise<PlatformMetrics> => {
      const [orgsResult, adminsResult] = await Promise.all([
        supabase.from('organisations').select('*'),
        supabase.from('organisation_members').select('id, role').eq('role', 'org_admin').eq('active', true),
      ]);

      const orgs = orgsResult.data || [];
      const admins = adminsResult.data || [];

      const active = orgs.filter((o) => o.active);
      const inactive = orgs.filter((o) => !o.active);
      const recent = [...orgs].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()).slice(0, 5);

      return {
        totalOrganisations: orgs.length,
        activeOrganisations: active.length,
        inactiveOrganisations: inactive.length,
        totalOrgAdmins: admins.length,
        recentOrganisations: recent,
      };
    },
    staleTime: 30_000,
  });
}

export function useOrganisations(filters?: { search?: string; active?: boolean | null }) {
  return useQuery({
    queryKey: ['platform-organisations', filters],
    queryFn: async (): Promise<Organisation[]> => {
      let query = supabase.from('organisations').select('*').order('created_at', { ascending: false });

      if (filters?.search) {
        const term = filters.search.trim();
        query = query.or(`name.ilike.%${term}%,slug.ilike.%${term}%,contact_email.ilike.%${term}%`);
      }

      if (filters?.active !== null && filters?.active !== undefined) {
        query = query.eq('active', filters.active);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data || [];
    },
    staleTime: 15_000,
  });
}

export function useOrganisation(orgId: string | null) {
  return useQuery({
    queryKey: ['platform-organisation', orgId],
    queryFn: async (): Promise<Organisation | null> => {
      if (!orgId) return null;
      const { data, error } = await supabase.from('organisations').select('*').eq('id', orgId).maybeSingle();
      if (error) throw error;
      return data;
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });
}

export function useOrganisationConfig(orgId: string | null) {
  return useQuery({
    queryKey: ['platform-org-config', orgId],
    queryFn: async (): Promise<OrganisationConfig[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('organisation_config')
        .select('*')
        .eq('organisation_id', orgId)
        .order('config_key');
      if (error) throw error;
      return data || [];
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });
}

export function useOrganisationAdmins(orgId: string | null) {
  return useQuery({
    queryKey: ['platform-org-admins', orgId],
    queryFn: async (): Promise<OrganisationMember[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('organisation_members')
        .select('*, profiles!inner(full_name, email)')
        .eq('organisation_id', orgId)
        .eq('role', 'org_admin')
        .order('created_at');
      if (error) throw error;
      return (data || []) as OrganisationMember[];
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });
}

export function useOrganisationServicesList(orgId: string | null) {
  return useQuery({
    queryKey: ['platform-org-services', orgId],
    queryFn: async (): Promise<OrganisationService[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('organisation_services')
        .select('*')
        .eq('organisation_id', orgId)
        .order('sort_order')
        .order('name');
      if (error) throw error;
      return (data || []) as OrganisationService[];
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });
}

export function useAllOrganisationMembers(orgId: string | null) {
  return useQuery({
    queryKey: ['platform-org-members', orgId],
    queryFn: async (): Promise<OrganisationMember[]> => {
      if (!orgId) return [];
      const { data, error } = await supabase
        .from('organisation_members')
        .select('*, profiles!inner(full_name, email)')
        .eq('organisation_id', orgId)
        .order('created_at');
      if (error) throw error;
      return (data || []) as OrganisationMember[];
    },
    enabled: !!orgId,
    staleTime: 15_000,
  });
}

// ── Mutations ──────────────────────────────────────────────────────────────

export function useCreateOrganisation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateOrganisationInput) => {
      // Check duplicate slug
      const { data: existingSlug } = await supabase
        .from('organisations')
        .select('id')
        .eq('slug', input.slug)
        .maybeSingle();
      if (existingSlug) throw new Error(`An organisation with slug "${input.slug}" already exists`);

      // Check duplicate name (case-insensitive)
      const { data: existingName } = await supabase
        .from('organisations')
        .select('id, name')
        .ilike('name', input.name.trim())
        .maybeSingle();
      if (existingName) throw new Error(`An organisation named "${existingName.name}" already exists`);

      // Check similar slug (warn about potential duplicate)
      const { data: similarSlugs } = await supabase
        .from('organisations')
        .select('id, slug, name')
        .like('slug', `%${input.slug.split('-')[0]}%`);
      if (similarSlugs && similarSlugs.length > 0) {
        const similar = similarSlugs.map((s) => `"${s.name}" (slug: ${s.slug})`).join(', ');
        console.warn(`Similar organisations exist: ${similar}. Proceeding with creation.`);
      }

      // Check duplicate domain (contact_email used as proxy for domain uniqueness in org config)
      if (input.contact_email) {
        const domain = input.contact_email.split('@')[1];
        if (domain) {
          const { data: allOrgs } = await supabase.from('organisations').select('id, contact_email');
          const duplicate = (allOrgs || []).find((o) => o.contact_email && o.contact_email.split('@')[1] === domain);
          if (duplicate) throw new Error(`An organisation with domain "${domain}" already exists`);
        }
      }

      // Create organisation
      const { data: org, error: orgError } = await supabase
        .from('organisations')
        .insert({
          name: input.name,
          slug: input.slug,
          description: input.description || '',
          contact_email: input.contact_email || null,
          contact_phone: input.contact_phone || null,
          country_code: input.country_code || 'NG',
          currency: input.currency || 'NGN',
          active: true,
        })
        .select()
        .single();
      if (orgError) throw orgError;

      // Insert config if provided
      if (input.config && Object.keys(input.config).length > 0) {
        const configRows = Object.entries(input.config).map(([key, value]) => ({
          organisation_id: org.id,
          config_key: key,
          config_value: value,
        }));
        const { error: configError } = await supabase.from('organisation_config').insert(configRows);
        if (configError) throw configError;
      }

      return org;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-organisations'] });
      qc.invalidateQueries({ queryKey: ['platform-metrics'] });
    },
  });
}

export function useUpdateOrganisation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: UpdateOrganisationInput) => {
      const { id, ...updates } = input;

      // Check slug uniqueness if changing
      if (updates.slug) {
        const { data: existing } = await supabase
          .from('organisations')
          .select('id')
          .eq('slug', updates.slug)
          .neq('id', id)
          .maybeSingle();
        if (existing) throw new Error(`An organisation with slug "${updates.slug}" already exists`);
      }

      // Check name uniqueness if changing
      if (updates.name) {
        const { data: existingName } = await supabase
          .from('organisations')
          .select('id, name')
          .ilike('name', updates.name.trim())
          .neq('id', id)
          .maybeSingle();
        if (existingName) throw new Error(`An organisation named "${existingName.name}" already exists`);
      }

      // Check domain uniqueness if changing contact_email
      if (updates.contact_email) {
        const domain = updates.contact_email.split('@')[1];
        if (domain) {
          const { data: allOrgs } = await supabase.from('organisations').select('id, contact_email');
          const duplicate = (allOrgs || []).find(
            (o) => o.id !== id && o.contact_email && o.contact_email.split('@')[1] === domain,
          );
          if (duplicate) throw new Error(`A organisation with domain "${domain}" already exists`);
        }
      }

      const { error } = await supabase.from('organisations').update(updates).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-organisations'] });
      qc.invalidateQueries({ queryKey: ['platform-organisation'] });
      qc.invalidateQueries({ queryKey: ['platform-metrics'] });
    },
  });
}

export function useToggleOrganisationActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { error } = await supabase.from('organisations').update({ active }).eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-organisations'] });
      qc.invalidateQueries({ queryKey: ['platform-organisation'] });
      qc.invalidateQueries({ queryKey: ['platform-metrics'] });
    },
  });
}

export function useUpdateOrganisationConfig() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, configs }: { orgId: string; configs: Record<string, string> }) => {
      const rows = Object.entries(configs).map(([config_key, config_value]) => ({
        organisation_id: orgId,
        config_key,
        config_value,
      }));

      // Upsert each config key
      for (const row of rows) {
        const { error } = await supabase
          .from('organisation_config')
          .upsert(row, { onConflict: 'organisation_id,config_key' });
        if (error) throw error;
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-org-config'] });
    },
  });
}

export function useAssignOrgAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ orgId, userId }: { orgId: string; userId: string }) => {
      // Verify user is not platform_superadmin
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .maybeSingle();
      if (profile?.role === 'platform_superadmin') {
        throw new Error('Cannot assign platform_superadmin as organisation_admin');
      }

      // Check not already admin of this org
      const { data: existing } = await supabase
        .from('organisation_members')
        .select('id')
        .eq('organisation_id', orgId)
        .eq('user_id', userId)
        .eq('role', 'org_admin')
        .maybeSingle();
      if (existing) throw new Error('User is already an administrator of this organisation');

      const { error } = await supabase.from('organisation_members').upsert(
        {
          organisation_id: orgId,
          user_id: userId,
          role: 'org_admin',
          active: true,
        },
        { onConflict: 'organisation_id,user_id,role' },
      );
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-org-admins'] });
      qc.invalidateQueries({ queryKey: ['platform-org-members'] });
    },
  });
}

export function useRemoveOrgAdmin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ memberId }: { memberId: string }) => {
      const { error } = await supabase.from('organisation_members').delete().eq('id', memberId);
      if (error) throw error;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['platform-org-admins'] });
      qc.invalidateQueries({ queryKey: ['platform-org-members'] });
    },
  });
}

export function useSearchUsersForAssignment(term: string) {
  return useQuery({
    queryKey: ['search-users-assignment', term],
    queryFn: async () => {
      if (!term || term.length < 2) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email, role')
        .or(`full_name.ilike.%${term}%,email.ilike.%${term}%`)
        .limit(10);
      if (error) throw error;
      return (data || []) as Array<{ id: string; full_name: string | null; email: string | null; role: string | null }>;
    },
    enabled: term.length >= 2,
    staleTime: 5_000,
  });
}
