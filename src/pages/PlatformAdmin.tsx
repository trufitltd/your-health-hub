import { useEffect, useMemo, useState } from 'react';
import { Navigate, useNavigate, useSearchParams } from 'react-router-dom';
import {
  Building2, Users, Settings, Shield, Plus, Search, ChevronRight, ChevronLeft,
  Loader2, CheckCircle2, XCircle, Power, PowerOff, Trash2, ArrowLeft,
  Globe, Mail, Phone, MapPin, Clock, AlertTriangle, Eye, Pencil,
  LayoutDashboard, List, UserPlus, X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useAuth } from '@/hooks/useAuth';
import { toast } from '@/components/ui/use-toast';
import {
  usePlatformMetrics,
  useOrganisations,
  useOrganisation,
  useOrganisationConfig,
  useOrganisationAdmins,
  useOrganisationServicesList,
  useAllOrganisationMembers,
  useCreateOrganisation,
  useUpdateOrganisation,
  useToggleOrganisationActive,
  useUpdateOrganisationConfig,
  useAssignOrgAdmin,
  useRemoveOrgAdmin,
  useSearchUsersForAssignment,
  type Organisation,
  type OrganisationConfig,
  type MemberProfile,
} from '@/hooks/usePlatformAdmin';

// ── Constants ──────────────────────────────────────────────────────────────

const COUNTRIES = [
  { code: 'NG', name: 'Nigeria' },
  { code: 'GH', name: 'Ghana' },
  { code: 'KE', name: 'Kenya' },
  { code: 'ZA', name: 'South Africa' },
  { code: 'US', name: 'United States' },
  { code: 'GB', name: 'United Kingdom' },
] as const;

const CURRENCIES = ['NGN', 'GHS', 'KES', 'ZAR', 'USD', 'GBP'] as const;

const BOOKING_CONFIG_KEYS = [
  'clinician_selection_mode',
  'show_doctor_directory',
  'show_ratings',
  'show_reviews',
  'enable_service_types',
] as const;

const BRAND_CONFIG_KEYS = [
  'brand_name',
  'brand_email',
  'support_email',
  'sms_signature',
  'vapid_subject',
] as const;

// ── Utility ────────────────────────────────────────────────────────────────

function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}

function formatDate(d: string): string {
  return new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function getConfigValue(configs: OrganisationConfig[], key: string, fallback = ''): string {
  return configs.find((c) => c.config_key === key)?.config_value || fallback;
}

function getConfigBool(configs: OrganisationConfig[], key: string, defaultValue = true): boolean {
  const val = getConfigValue(configs, key);
  if (val === '') return defaultValue;
  return val !== 'false';
}

// ── Platform Admin Layout ──────────────────────────────────────────────────

type View = 'dashboard' | 'list' | 'create' | 'detail';

function PlatformAdminLayout({ children }: { children: React.ReactNode }) {
  const { user, role, effectivePermissions, signOut } = useAuth();
  const navigate = useNavigate();

  if (!user) return <Navigate to="/platform-admin/login" replace />;
  if (!effectivePermissions.has('platform_superadmin')) return <Navigate to="/" replace />;

  return (
    <div className="min-h-screen bg-muted/30">
      {/* Top bar */}
      <header className="sticky top-0 z-50 border-b bg-card shadow-sm">
        <div className="flex h-14 items-center justify-between px-4 md:px-6">
          <div className="flex items-center gap-3">
            <Shield className="h-5 w-5 text-primary" />
            <span className="text-sm font-semibold">Platform Administration</span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-xs text-muted-foreground hidden sm:inline">
              {user.email}
            </span>
            <Badge variant="outline" className="text-xs">
              <Shield className="mr-1 h-3 w-3" />
              Super Admin
            </Badge>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => navigate('/')}
              className="text-xs"
            >
              MyE-Doctor
            </Button>
            <Button variant="ghost" size="sm" onClick={signOut}>
              Sign out
            </Button>
          </div>
        </div>
      </header>

      {/* Content */}
      <main className="mx-auto max-w-7xl px-4 py-6 md:px-6">{children}</main>
    </div>
  );
}

// ── Dashboard View ─────────────────────────────────────────────────────────

function DashboardView({ onNavigate }: { onNavigate: (view: View, id?: string) => void }) {
  const { data: metrics, isLoading } = usePlatformMetrics();

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const stats = [
    { label: 'Total Organisations', value: metrics?.totalOrganisations ?? 0, icon: Building2, color: 'text-primary' },
    { label: 'Active', value: metrics?.activeOrganisations ?? 0, icon: CheckCircle2, color: 'text-success' },
    { label: 'Inactive', value: metrics?.inactiveOrganisations ?? 0, icon: XCircle, color: 'text-muted-foreground' },
    { label: 'Org Administrators', value: metrics?.totalOrgAdmins ?? 0, icon: Users, color: 'text-primary' },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Dashboard</h1>
          <p className="text-sm text-muted-foreground">Platform-wide overview</p>
        </div>
        <Button onClick={() => onNavigate('create')} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New Organisation
        </Button>
      </div>

      {/* Metrics */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat) => (
          <Card key={stat.label}>
            <CardContent className="p-4">
              <div className="flex items-center justify-between">
                <p className="text-xs font-medium text-muted-foreground">{stat.label}</p>
                <stat.icon className={`h-4 w-4 ${stat.color}`} />
              </div>
              <p className="mt-2 text-2xl font-bold">{stat.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Recent Organisations */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recently Created</CardTitle>
            <Button variant="ghost" size="sm" onClick={() => onNavigate('list')}>
              View all
              <ChevronRight className="ml-1 h-4 w-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {metrics?.recentOrganisations && metrics.recentOrganisations.length > 0 ? (
            <div className="space-y-2">
              {metrics.recentOrganisations.map((org) => (
                <div
                  key={org.id}
                  className="flex items-center justify-between rounded-lg border p-3 hover:bg-muted/50 cursor-pointer transition-colors"
                  onClick={() => onNavigate('detail', org.id)}
                >
                  <div className="flex items-center gap-3">
                    <Building2 className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium">{org.name}</p>
                      <p className="text-xs text-muted-foreground">{org.slug} · {org.country_code}</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant={org.active ? 'default' : 'secondary'} className="text-xs">
                      {org.active ? 'Active' : 'Inactive'}
                    </Badge>
                    <span className="text-xs text-muted-foreground">{formatDate(org.created_at)}</span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground text-center py-4">No organisations yet</p>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

// ── Organisations List View ────────────────────────────────────────────────

function OrganisationsListView({ onNavigate }: { onNavigate: (view: View, id?: string) => void }) {
  const [search, setSearch] = useState('');
  const [filterActive, setFilterActive] = useState<boolean | null>(null);
  const { data: organisations, isLoading } = useOrganisations({ search: search || undefined, active: filterActive });

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('dashboard')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Dashboard
          </Button>
          <h1 className="text-2xl font-bold">Organisations</h1>
        </div>
        <Button onClick={() => onNavigate('create')} size="sm">
          <Plus className="mr-2 h-4 w-4" />
          New
        </Button>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="relative flex-1 min-w-[200px] max-w-md">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            placeholder="Search by name, slug, or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-1">
          <Button
            variant={filterActive === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterActive(null)}
          >
            All
          </Button>
          <Button
            variant={filterActive === true ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterActive(true)}
          >
            Active
          </Button>
          <Button
            variant={filterActive === false ? 'default' : 'outline'}
            size="sm"
            onClick={() => setFilterActive(false)}
          >
            Inactive
          </Button>
        </div>
      </div>

      {/* Table */}
      {isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : organisations && organisations.length > 0 ? (
        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/50">
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Name</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Slug</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Country</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden md:table-cell">Currency</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground">Status</th>
                  <th className="px-4 py-3 text-left font-medium text-muted-foreground hidden lg:table-cell">Created</th>
                  <th className="px-4 py-3 text-right font-medium text-muted-foreground">Actions</th>
                </tr>
              </thead>
              <tbody>
                {organisations.map((org) => (
                  <tr key={org.id} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="px-4 py-3">
                      <button
                        className="font-medium text-primary hover:underline text-left"
                        onClick={() => onNavigate('detail', org.id)}
                      >
                        {org.name}
                      </button>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground font-mono text-xs">{org.slug}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{org.country_code}</td>
                    <td className="px-4 py-3 hidden md:table-cell">{org.currency}</td>
                    <td className="px-4 py-3">
                      <Badge variant={org.active ? 'default' : 'secondary'} className="text-xs">
                        {org.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground text-xs hidden lg:table-cell">{formatDate(org.created_at)}</td>
                    <td className="px-4 py-3 text-right">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onNavigate('detail', org.id)}
                      >
                        <Eye className="h-4 w-4" />
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      ) : (
        <Card>
          <CardContent className="py-12 text-center">
            <Building2 className="mx-auto h-8 w-8 text-muted-foreground/40" />
            <p className="mt-3 text-sm text-muted-foreground">
              {search ? 'No organisations match your search' : 'No organisations found'}
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}

// ── Create Organisation View ───────────────────────────────────────────────

function CreateOrganisationView({ onNavigate }: { onNavigate: (view: View, id?: string) => void }) {
  const createOrganisation = useCreateOrganisation();
  const [form, setForm] = useState({
    name: '',
    slug: '',
    description: '',
    contact_email: '',
    contact_phone: '',
    country_code: 'NG',
    currency: 'NGN',
  });
  const [config, setConfig] = useState({
    clinician_selection_mode: 'internal_assign',
    show_doctor_directory: false,
    show_ratings: false,
    show_reviews: false,
    enable_service_types: true,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [tenantType, setTenantType] = useState<string>('custom');

  const autoSlug = useMemo(() => slugify(form.name), [form.name]);

  // Tenant type presets
  const tenantPresets: Record<string, { config: typeof config; description: string }> = {
    telemedicine: {
      config: {
        clinician_selection_mode: 'internal_assign',
        show_doctor_directory: false,
        show_ratings: false,
        show_reviews: false,
        enable_service_types: true,
      },
      description: 'Internal clinician assignment, service-based booking, no public directory',
    },
    marketplace: {
      config: {
        clinician_selection_mode: 'patient_select',
        show_doctor_directory: true,
        show_ratings: true,
        show_reviews: true,
        enable_service_types: false,
      },
      description: 'Patient selects clinician, public directory with ratings and reviews',
    },
    clinic: {
      config: {
        clinician_selection_mode: 'internal_assign',
        show_doctor_directory: true,
        show_ratings: false,
        show_reviews: false,
        enable_service_types: true,
      },
      description: 'Internal assignment with visible clinician directory',
    },
    custom: {
      config: {
        clinician_selection_mode: 'internal_assign',
        show_doctor_directory: false,
        show_ratings: false,
        show_reviews: false,
        enable_service_types: true,
      },
      description: 'Configure manually',
    },
  };

  const applyPreset = (type: string) => {
    setTenantType(type);
    if (tenantPresets[type]) {
      setConfig(tenantPresets[type].config);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!form.name.trim()) errs.name = 'Name is required';
    const slug = form.slug.trim() || autoSlug;
    if (!slug) errs.slug = 'Slug is required';
    else if (!/^[a-z0-9-]+$/.test(slug)) errs.slug = 'Slug must contain only lowercase letters, numbers, and hyphens';
    if (form.contact_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.contact_email)) {
      errs.contact_email = 'Invalid email format';
    }
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async () => {
    if (!validate()) return;
    try {
      const result = await createOrganisation.mutateAsync({
        name: form.name.trim(),
        slug: (form.slug.trim() || autoSlug).trim(),
        description: form.description.trim(),
        contact_email: form.contact_email.trim() || undefined,
        contact_phone: form.contact_phone.trim() || undefined,
        country_code: form.country_code,
        currency: form.currency,
        config: {
          clinician_selection_mode: config.clinician_selection_mode,
          show_doctor_directory: String(config.show_doctor_directory),
          show_ratings: String(config.show_ratings),
          show_reviews: String(config.show_reviews),
          enable_service_types: String(config.enable_service_types),
        },
      });
      toast({ title: 'Organisation created', description: `${result.name} has been created successfully.` });
      onNavigate('detail', result.id);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to create organisation';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="sm" onClick={() => onNavigate('list')}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <h1 className="text-2xl font-bold">Create Organisation</h1>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Form */}
        <div className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organisation Details</CardTitle>
              <CardDescription>Basic information about the organisation</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Tenant Type</Label>
                <div className="mt-1.5 grid grid-cols-2 gap-2">
                  {Object.entries(tenantPresets).map(([key, preset]) => (
                    <button
                      key={key}
                      type="button"
                      onClick={() => applyPreset(key)}
                      className={`rounded-lg border p-3 text-left text-sm transition-colors ${
                        tenantType === key
                          ? 'border-primary bg-primary/5 text-foreground'
                          : 'border-border text-muted-foreground hover:border-primary/50'
                      }`}
                    >
                      <span className="font-medium capitalize">{key}</span>
                      <p className="mt-0.5 text-xs opacity-70">{preset.description}</p>
                    </button>
                  ))}
                </div>
              </div>
              <div>
                <Label htmlFor="org-name">Name *</Label>
                <Input
                  id="org-name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  placeholder="e.g. CIBA Wellness"
                  className={errors.name ? 'border-destructive' : ''}
                />
                {errors.name && <p className="mt-1 text-xs text-destructive">{errors.name}</p>}
              </div>
              <div>
                <Label htmlFor="org-slug">Slug *</Label>
                <Input
                  id="org-slug"
                  value={form.slug}
                  onChange={(e) => setForm({ ...form, slug: e.target.value })}
                  placeholder={autoSlug || 'e.g. ciba'}
                  className={errors.slug ? 'border-destructive' : ''}
                />
                <div className="mt-1 flex items-center gap-2">
                  <p className="text-xs text-muted-foreground">
                    Resolved: <span className="font-mono">/{form.slug.trim() || autoSlug || '...'}</span>
                  </p>
                  {autoSlug && form.slug.trim() && form.slug.trim() !== autoSlug && (
                    <p className="text-xs text-amber-600">
                      (differs from auto-generated: {autoSlug})
                    </p>
                  )}
                </div>
                {errors.slug && <p className="mt-1 text-xs text-destructive">{errors.slug}</p>}
              </div>
              <div>
                <Label htmlFor="org-desc">Description</Label>
                <Textarea
                  id="org-desc"
                  value={form.description}
                  onChange={(e) => setForm({ ...form, description: e.target.value })}
                  rows={3}
                  placeholder="Brief description..."
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label htmlFor="org-email">Contact Email</Label>
                  <Input
                    id="org-email"
                    type="email"
                    value={form.contact_email}
                    onChange={(e) => setForm({ ...form, contact_email: e.target.value })}
                    placeholder="admin@example.com"
                    className={errors.contact_email ? 'border-destructive' : ''}
                  />
                  {errors.contact_email && <p className="mt-1 text-xs text-destructive">{errors.contact_email}</p>}
                </div>
                <div>
                  <Label htmlFor="org-phone">Contact Phone</Label>
                  <Input
                    id="org-phone"
                    value={form.contact_phone}
                    onChange={(e) => setForm({ ...form, contact_phone: e.target.value })}
                    placeholder="+234..."
                  />
                </div>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div>
                  <Label>Country</Label>
                  <Select value={form.country_code} onValueChange={(v) => setForm({ ...form, country_code: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {COUNTRIES.map((c) => (
                        <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Currency</Label>
                  <Select value={form.currency} onValueChange={(v) => setForm({ ...form, currency: v })}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {CURRENCIES.map((c) => (
                        <SelectItem key={c} value={c}>{c}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Booking Configuration</CardTitle>
              <CardDescription>How this organisation handles clinician assignment</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Clinician Selection Mode</Label>
                <Select
                  value={config.clinician_selection_mode}
                  onValueChange={(v) => setConfig({ ...config, clinician_selection_mode: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patient_select">Patient selects clinician</SelectItem>
                    <SelectItem value="internal_assign">Internal assignment (org assigns clinician)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Doctor Directory</Label>
                    <p className="text-xs text-muted-foreground">Patients can browse and select specific clinicians</p>
                  </div>
                  <Switch
                    checked={config.show_doctor_directory}
                    onCheckedChange={(v) => setConfig({ ...config, show_doctor_directory: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Ratings</Label>
                    <p className="text-xs text-muted-foreground">Display clinician ratings to patients</p>
                  </div>
                  <Switch
                    checked={config.show_ratings}
                    onCheckedChange={(v) => setConfig({ ...config, show_ratings: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Show Reviews</Label>
                    <p className="text-xs text-muted-foreground">Display patient reviews</p>
                  </div>
                  <Switch
                    checked={config.show_reviews}
                    onCheckedChange={(v) => setConfig({ ...config, show_reviews: v })}
                  />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <Label>Enable Service Types</Label>
                    <p className="text-xs text-muted-foreground">Allow service-based booking (for internal assignment)</p>
                  </div>
                  <Switch
                    checked={config.enable_service_types}
                    onCheckedChange={(v) => setConfig({ ...config, enable_service_types: v })}
                  />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Preview */}
        <div className="space-y-4 lg:sticky lg:top-20 lg:self-start">
          <Card>
            <CardHeader className="pb-3">
              <CardTitle className="text-sm">Preview</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <Badge variant="outline" className="text-xs capitalize">{tenantType}</Badge>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Name</span>
                <span className="font-medium">{form.name || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Slug</span>
                <span className="font-mono text-xs">{form.slug || autoSlug || '—'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Country</span>
                <span>{COUNTRIES.find((c) => c.code === form.country_code)?.name}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Currency</span>
                <span>{form.currency}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Selection Mode</span>
                <Badge variant="outline" className="text-xs">
                  {config.clinician_selection_mode === 'internal_assign' ? 'Internal' : 'Patient'}
                </Badge>
              </div>
            </CardContent>
          </Card>

          <Button onClick={handleSubmit} disabled={createOrganisation.isPending} className="w-full">
            {createOrganisation.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Plus className="mr-2 h-4 w-4" />
            )}
            Create Organisation
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Organisation Detail View ───────────────────────────────────────────────

function OrganisationDetailView({
  orgId,
  onNavigate,
}: {
  orgId: string;
  onNavigate: (view: View, id?: string) => void;
}) {
  const { data: org, isLoading: orgLoading } = useOrganisation(orgId);
  const { data: configs, isLoading: configsLoading } = useOrganisationConfig(orgId);
  const { data: admins, isLoading: adminsLoading } = useOrganisationAdmins(orgId);
  const { data: services, isLoading: servicesLoading } = useOrganisationServicesList(orgId);
  const { data: allMembers, isLoading: membersLoading } = useAllOrganisationMembers(orgId);
  const updateOrganisation = useUpdateOrganisation();
  const toggleActive = useToggleOrganisationActive();
  const updateConfig = useUpdateOrganisationConfig();
  const assignAdmin = useAssignOrgAdmin();
  const removeAdmin = useRemoveOrgAdmin();

  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});
  const [configEditing, setConfigEditing] = useState<Record<string, string>>({});
  const [deactivateDialog, setDeactivateDialog] = useState(false);
  const [activateDialog, setActivateDialog] = useState(false);
  const [assignDialog, setAssignDialog] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [removeDialog, setRemoveDialog] = useState<string | null>(null);

  useEffect(() => {
    if (org) {
      setEditForm({
        name: org.name,
        slug: org.slug,
        description: org.description || '',
        contact_email: org.contact_email || '',
        contact_phone: org.contact_phone || '',
        country_code: org.country_code,
        currency: org.currency,
      });
    }
  }, [org]);

  useEffect(() => {
    if (configs) {
      const map: Record<string, string> = {};
      configs.forEach((c) => { map[c.config_key] = c.config_value; });
      setConfigEditing(map);
    }
  }, [configs]);

  if (orgLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!org) {
    return (
      <div className="py-20 text-center">
        <p className="text-muted-foreground">Organisation not found</p>
        <Button variant="ghost" size="sm" onClick={() => onNavigate('list')} className="mt-4">
          <ArrowLeft className="mr-1 h-4 w-4" /> Back to list
        </Button>
      </div>
    );
  }

  const handleSaveOrg = async () => {
    try {
      await updateOrganisation.mutateAsync({
        id: org.id,
        name: editForm.name,
        slug: editForm.slug,
        description: editForm.description,
        contact_email: editForm.contact_email || undefined,
        contact_phone: editForm.contact_phone || undefined,
        country_code: editForm.country_code,
        currency: editForm.currency,
      });
      setEditing(false);
      toast({ title: 'Updated', description: 'Organisation details saved.' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Update failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const handleToggleActive = async (active: boolean) => {
    try {
      await toggleActive.mutateAsync({ id: org.id, active });
      setDeactivateDialog(false);
      setActivateDialog(false);
      toast({
        title: active ? 'Activated' : 'Deactivated',
        description: `${org.name} is now ${active ? 'active' : 'inactive'}.`,
      });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Toggle failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const handleSaveConfig = async () => {
    try {
      await updateConfig.mutateAsync({ orgId: org.id, configs: configEditing });
      toast({ title: 'Configuration updated' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Config update failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const handleAssignAdmin = async (userId: string) => {
    try {
      await assignAdmin.mutateAsync({ orgId: org.id, userId });
      setAssignDialog(false);
      setAssignSearch('');
      toast({ title: 'Administrator assigned' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Assignment failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  const handleRemoveAdmin = async (memberId: string) => {
    try {
      await removeAdmin.mutateAsync({ memberId });
      setRemoveDialog(null);
      toast({ title: 'Administrator removed' });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Removal failed';
      toast({ title: 'Error', description: message, variant: 'destructive' });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => onNavigate('list')}>
            <ArrowLeft className="mr-1 h-4 w-4" />
            Organisations
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{org.name}</h1>
              <Badge variant={org.active ? 'default' : 'secondary'}>
                {org.active ? 'Active' : 'Inactive'}
              </Badge>
            </div>
            <p className="text-sm text-muted-foreground font-mono">{org.slug}</p>
          </div>
        </div>
        <div className="flex gap-2">
          {org.active ? (
            <Button variant="outline" size="sm" onClick={() => setDeactivateDialog(true)}>
              <PowerOff className="mr-2 h-4 w-4" />
              Deactivate
            </Button>
          ) : (
            <Button variant="outline" size="sm" onClick={() => setActivateDialog(true)}>
              <Power className="mr-2 h-4 w-4" />
              Activate
            </Button>
          )}
        </div>
      </div>

      {/* Tabs */}
      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="config">Configuration</TabsTrigger>
          <TabsTrigger value="admins">Administrators</TabsTrigger>
          <TabsTrigger value="services">Services</TabsTrigger>
        </TabsList>

        {/* Overview Tab */}
        <TabsContent value="overview" className="space-y-4">
          {editing ? (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Edit Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <Label>Name</Label>
                    <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
                  </div>
                  <div>
                    <Label>Slug</Label>
                    <Input value={editForm.slug} onChange={(e) => setEditForm({ ...editForm, slug: e.target.value })} />
                  </div>
                  <div>
                    <Label>Contact Email</Label>
                    <Input value={editForm.contact_email} onChange={(e) => setEditForm({ ...editForm, contact_email: e.target.value })} />
                  </div>
                  <div>
                    <Label>Contact Phone</Label>
                    <Input value={editForm.contact_phone} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
                  </div>
                  <div>
                    <Label>Country</Label>
                    <Select value={editForm.country_code} onValueChange={(v) => setEditForm({ ...editForm, country_code: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {COUNTRIES.map((c) => <SelectItem key={c.code} value={c.code}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label>Currency</Label>
                    <Select value={editForm.currency} onValueChange={(v) => setEditForm({ ...editForm, currency: v })}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {CURRENCIES.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                <div>
                  <Label>Description</Label>
                  <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
                </div>
                <div className="flex gap-2">
                  <Button size="sm" onClick={handleSaveOrg} disabled={updateOrganisation.isPending}>
                    {updateOrganisation.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    Save
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => setEditing(false)}>Cancel</Button>
                </div>
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Organisation Details</CardTitle>
                  <Button variant="ghost" size="sm" onClick={() => setEditing(true)}>
                    <Pencil className="mr-1 h-4 w-4" />
                    Edit
                  </Button>
                </div>
              </CardHeader>
              <CardContent>
                <dl className="grid gap-4 sm:grid-cols-2">
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Name</dt>
                    <dd className="mt-1 text-sm font-medium">{org.name}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Slug</dt>
                    <dd className="mt-1 text-sm font-mono">{org.slug}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Description</dt>
                    <dd className="mt-1 text-sm">{org.description || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Contact Email</dt>
                    <dd className="mt-1 text-sm">{org.contact_email || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Contact Phone</dt>
                    <dd className="mt-1 text-sm">{org.contact_phone || '—'}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Country</dt>
                    <dd className="mt-1 text-sm">{COUNTRIES.find((c) => c.code === org.country_code)?.name || org.country_code}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Currency</dt>
                    <dd className="mt-1 text-sm">{org.currency}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Status</dt>
                    <dd className="mt-1">
                      <Badge variant={org.active ? 'default' : 'secondary'}>{org.active ? 'Active' : 'Inactive'}</Badge>
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Created</dt>
                    <dd className="mt-1 text-sm">{formatDate(org.created_at)}</dd>
                  </div>
                  <div>
                    <dt className="text-xs font-medium text-muted-foreground">Last Updated</dt>
                    <dd className="mt-1 text-sm">{formatDate(org.updated_at)}</dd>
                  </div>
                </dl>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Configuration Tab */}
        <TabsContent value="config" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Feature Flags</CardTitle>
                  <CardDescription>Control booking behaviour and UI features</CardDescription>
                </div>
                <Button size="sm" onClick={handleSaveConfig} disabled={updateConfig.isPending}>
                  {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  Save Changes
                </Button>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Clinician Selection Mode</Label>
                <Select
                  value={configEditing.clinician_selection_mode || 'patient_select'}
                  onValueChange={(v) => setConfigEditing({ ...configEditing, clinician_selection_mode: v })}
                >
                  <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="patient_select">Patient selects clinician</SelectItem>
                    <SelectItem value="internal_assign">Internal assignment</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {[
                { key: 'show_doctor_directory', label: 'Show Doctor Directory', desc: 'Patients can browse clinicians' },
                { key: 'show_ratings', label: 'Show Ratings', desc: 'Display clinician ratings' },
                { key: 'show_reviews', label: 'Show Reviews', desc: 'Display patient reviews' },
                { key: 'enable_service_types', label: 'Enable Service Types', desc: 'Service-based booking' },
              ].map((item) => (
                <div key={item.key} className="flex items-center justify-between">
                  <div>
                    <Label>{item.label}</Label>
                    <p className="text-xs text-muted-foreground">{item.desc}</p>
                  </div>
                  <Switch
                    checked={configEditing[item.key] !== 'false'}
                    onCheckedChange={(v) => setConfigEditing({ ...configEditing, [item.key]: String(v) })}
                  />
                </div>
              ))}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-base">Brand Settings</CardTitle>
              <CardDescription>Organisation-specific branding (used in SMS, email, push)</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {BRAND_CONFIG_KEYS.map((key) => (
                <div key={key}>
                  <Label className="capitalize">{key.replace(/_/g, ' ')}</Label>
                  <Input
                    value={configEditing[key] || ''}
                    onChange={(e) => setConfigEditing({ ...configEditing, [key]: e.target.value })}
                    placeholder={`e.g. ${key === 'brand_name' ? org.name : ''}`}
                  />
                </div>
              ))}
              <Button size="sm" onClick={handleSaveConfig} disabled={updateConfig.isPending}>
                {updateConfig.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                Save Brand Settings
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Administrators Tab */}
        <TabsContent value="admins" className="space-y-4">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Organisation Administrators</CardTitle>
                  <CardDescription>
                    {admins ? `${admins.length} administrator${admins.length !== 1 ? 's' : ''}` : 'Loading...'}
                  </CardDescription>
                </div>
                <Button size="sm" onClick={() => setAssignDialog(true)}>
                  <UserPlus className="mr-2 h-4 w-4" />
                  Assign Admin
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {adminsLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : admins && admins.length > 0 ? (
                <div className="space-y-2">
                  {admins.map((admin) => (
                    <div key={admin.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{(admin.profiles as MemberProfile)?.full_name || 'Unknown'}</p>
                        <p className="text-xs text-muted-foreground">{(admin.profiles as MemberProfile)?.email || admin.user_id}</p>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRemoveDialog(admin.id)}
                      >
                        <Trash2 className="h-4 w-4 text-destructive" />
                      </Button>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">No administrators assigned</p>
              )}
            </CardContent>
          </Card>

          {allMembers && allMembers.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">All Members</CardTitle>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {allMembers.map((m) => (
                    <div key={m.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div className="flex items-center gap-3">
                        <div>
                          <p className="text-sm font-medium">{(m.profiles as MemberProfile)?.full_name || 'Unknown'}</p>
                          <p className="text-xs text-muted-foreground">{(m.profiles as MemberProfile)?.email}</p>
                        </div>
                      </div>
                      <Badge variant="outline" className="text-xs">{m.role}</Badge>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* Services Tab */}
        <TabsContent value="services" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">Organisation Services</CardTitle>
              <CardDescription>Service offerings for this organisation</CardDescription>
            </CardHeader>
            <CardContent>
              {servicesLoading ? (
                <div className="flex justify-center py-8">
                  <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                </div>
              ) : services && services.length > 0 ? (
                <div className="space-y-2">
                  {services.map((svc) => (
                    <div key={svc.id} className="flex items-center justify-between rounded-lg border p-3">
                      <div>
                        <p className="text-sm font-medium">{svc.name}</p>
                        <p className="text-xs text-muted-foreground">
                          {svc.default_duration_minutes} min · {svc.consultation_mode} · {svc.currency} {svc.base_price}
                        </p>
                      </div>
                      <Badge variant={svc.active ? 'default' : 'secondary'} className="text-xs">
                        {svc.active ? 'Active' : 'Inactive'}
                      </Badge>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  No services defined. Services can be added through the organisation admin portal.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* Deactivate Dialog */}
      <AlertDialog open={deactivateDialog} onOpenChange={setDeactivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Deactivate Organisation</AlertDialogTitle>
            <AlertDialogDescription>
              This will deactivate <strong>{org.name}</strong>. The organisation will be hidden from public listings
              and its members will lose access. Organisation data will be preserved.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => handleToggleActive(false)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Deactivate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Activate Dialog */}
      <AlertDialog open={activateDialog} onOpenChange={setActivateDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Activate Organisation</AlertDialogTitle>
            <AlertDialogDescription>
              This will reactivate <strong>{org.name}</strong>. Members will regain access.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={() => handleToggleActive(true)}>
              Activate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Assign Admin Dialog */}
      <Dialog open={assignDialog} onOpenChange={(open) => { setAssignDialog(open); setAssignSearch(''); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Assign Administrator</DialogTitle>
            <DialogDescription>Search for a user to assign as organisation administrator.</DialogDescription>
          </DialogHeader>
          <AssignAdminForm
            search={assignSearch}
            onSearchChange={setAssignSearch}
            orgId={org.id}
            onAssign={handleAssignAdmin}
            isPending={assignAdmin.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Remove Admin Dialog */}
      <AlertDialog open={!!removeDialog} onOpenChange={() => setRemoveDialog(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Remove Administrator</AlertDialogTitle>
            <AlertDialogDescription>
              This will remove the administrator role for this user from <strong>{org.name}</strong>.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => removeDialog && handleRemoveAdmin(removeDialog)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Remove
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

// ── Assign Admin Sub-Form ──────────────────────────────────────────────────

function AssignAdminForm({
  search,
  onSearchChange,
  orgId,
  onAssign,
  isPending,
}: {
  search: string;
  onSearchChange: (v: string) => void;
  orgId: string;
  onAssign: (userId: string) => void;
  isPending: boolean;
}) {
  const { data: users, isLoading } = useSearchUsersForAssignment(search);

  return (
    <div className="space-y-4">
      <Input
        placeholder="Search by name or email..."
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
      />
      {isLoading && (
        <div className="flex justify-center py-4">
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        </div>
      )}
      {users && users.length > 0 && (
        <div className="space-y-2 max-h-60 overflow-y-auto">
          {users.map((user) => (
            <div key={user.id} className="flex items-center justify-between rounded-lg border p-3">
              <div>
                <p className="text-sm font-medium">{user.full_name || 'Unknown'}</p>
                <p className="text-xs text-muted-foreground">{user.email}</p>
              </div>
              <Button
                size="sm"
                variant="outline"
                onClick={() => onAssign(user.id)}
                disabled={isPending || user.role === 'platform_superadmin'}
              >
                {isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Assign'}
              </Button>
            </div>
          ))}
        </div>
      )}
      {search.length >= 2 && users && users.length === 0 && !isLoading && (
        <p className="text-center text-sm text-muted-foreground py-4">No users found</p>
      )}
      {search.length < 2 && (
        <p className="text-center text-sm text-muted-foreground py-4">Type at least 2 characters to search</p>
      )}
    </div>
  );
}

// ── Main Platform Admin Component ──────────────────────────────────────────

export default function PlatformAdmin() {
  const [searchParams, setSearchParams] = useSearchParams();

  const viewParam = searchParams.get('view') || 'dashboard';
  const orgParam = searchParams.get('org');

  const [view, setView] = useState<View>((viewParam as View) || 'dashboard');
  const [selectedOrgId, setSelectedOrgId] = useState<string | null>(orgParam);

  const navigate = (newView: View, orgId?: string) => {
    setView(newView);
    if (orgId) setSelectedOrgId(orgId);

    const params = new URLSearchParams();
    params.set('view', newView);
    if (orgId) params.set('org', orgId);
    setSearchParams(params, { replace: true });
  };

  return (
    <PlatformAdminLayout>
      {view === 'dashboard' && <DashboardView onNavigate={navigate} />}
      {view === 'list' && <OrganisationsListView onNavigate={navigate} />}
      {view === 'create' && <CreateOrganisationView onNavigate={navigate} />}
      {view === 'detail' && selectedOrgId && (
        <OrganisationDetailView orgId={selectedOrgId} onNavigate={navigate} />
      )}
    </PlatformAdminLayout>
  );
}
