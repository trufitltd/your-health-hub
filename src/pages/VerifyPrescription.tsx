import { useMemo } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import logoImage from '@/assets/MyE-DoctorLogo.png';
import { useLanguage } from '@/contexts/LanguageContext';
import { useLocaleFormatter } from '@/lib/locale';

const VerifyPrescription = () => {
  const { t } = useLanguage();
  const { code } = useParams<{ code: string }>();
  const { formatDateTime } = useLocaleFormatter();
  const normalizedCode = useMemo(() => (code || '').trim().toUpperCase(), [code]);

  const { data, isLoading } = useQuery({
    queryKey: ['verify-prescription', normalizedCode],
    queryFn: async () => {
      if (!normalizedCode) return null;
      const { data, error } = await (supabase as any).rpc('verify_prescription_public', {
        p_code: normalizedCode,
      });
      if (error) throw error;
      return Array.isArray(data) && data.length > 0 ? data[0] : null;
    },
    enabled: !!normalizedCode,
  });

  const status = data?.prescription_status || 'Unknown';
  const statusClass =
    status === 'Active'
      ? 'bg-success/10 text-success border-success/20'
      : status === 'Dispensed'
      ? 'bg-primary/10 text-primary border-primary/20'
      : 'bg-destructive/10 text-destructive border-destructive/20';

  return (
    <div className="min-h-screen bg-muted/30 py-10 px-4">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoImage} alt="MyE-Doctor Logo" className="h-10 w-auto" />
            <span className="text-lg font-bold">Prescription Verification</span>
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to="/">Back Home</Link>
          </Button>
        </div>

        <Card>
          <CardHeader>
            <CardTitle>Verification Result</CardTitle>
            <CardDescription>
              Code: {normalizedCode || t('specialists.defaults.notAvailable', 'N/A')}
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <p className="text-sm text-muted-foreground">Verifying prescription...</p>
            ) : !data ? (
              <div className="space-y-2">
                <p className="font-medium text-destructive">Prescription could not be verified.</p>
                <p className="text-sm text-muted-foreground">The code is invalid or unavailable.</p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <p className="text-sm text-muted-foreground">Prescription Code</p>
                  <Badge variant="outline">{data.code}</Badge>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-sm">
                  <div>
                    <p className="text-muted-foreground">Patient Name</p>
                    <p className="font-medium">{data.patient_name}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Date Issued</p>
                    <p className="font-medium">{formatDateTime(data.date_issued)}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Prescribing Doctor</p>
                    <p className="font-medium">{data.prescribing_doctor}</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Doctor License Status</p>
                    <p className="font-medium">{data.doctor_license_status}</p>
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Drug List</p>
                  <div className="rounded-md border border-border bg-muted/20 p-3 whitespace-pre-wrap text-sm">
                    {data.drug_list}
                  </div>
                </div>
                <div>
                  <p className="text-muted-foreground text-sm mb-1">Prescription Status</p>
                  <Badge className={statusClass}>{status}</Badge>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default VerifyPrescription;
