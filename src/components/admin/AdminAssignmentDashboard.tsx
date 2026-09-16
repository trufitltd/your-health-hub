import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { supabase } from '@/integrations/supabase/client';

interface AssignmentEntry {
  id: string;
  appointment_id: string;
  organisation_id: string;
  service_name: string;
  preferred_date: string;
  preferred_time: string;
  preferred_duration_minutes: number;
  status: string;
  assigned_doctor_id: string | null;
  assigned_at: string | null;
  failure_reason: string | null;
  created_at: string;
  // Joined data
  patient_name?: string;
  doctor_name?: string;
  org_name?: string;
}

interface Organisation {
  id: string;
  name: string;
  slug: string;
}

interface AdminAssignmentDashboardProps {
  userRole: string;
  userId: string;
}

export function AdminAssignmentDashboard({ userRole, userId }: AdminAssignmentDashboardProps) {
  const [assignments, setAssignments] = useState<AssignmentEntry[]>([]);
  const [organisations, setOrganisations] = useState<Organisation[]>([]);
  const [selectedOrg, setSelectedOrg] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [retrying, setRetrying] = useState<string | null>(null);

  const isSuperAdmin = userRole === 'platform_superadmin';

  const fetchOrganisations = useCallback(async () => {
    if (!isSuperAdmin) return;

    const { data, error: fetchError } = await supabase
      .from('organisations')
      .select('id, name, slug')
      .eq('active', true)
      .order('name');

    if (!fetchError && data) {
      setOrganisations(data);
    }
  }, [isSuperAdmin]);

  const fetchAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      let query = supabase
        .from('assign_clinician_queue')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (selectedOrg !== 'all') {
        query = query.eq('organisation_id', selectedOrg);
      }

      if (statusFilter !== 'all') {
        query = query.eq('status', statusFilter);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) {
        setError(fetchError.message);
        return;
      }

      // Enrich with patient and doctor names
      const enriched: AssignmentEntry[] = [];

      for (const entry of data || []) {
        const entryTyped = entry as any;

        // Get patient name from appointment
        let patientName = 'Unknown';
        if (entryTyped.appointment_id) {
          const { data: apt } = await supabase
            .from('appointments')
            .select('patient_id')
            .eq('id', entryTyped.appointment_id)
            .maybeSingle();

          if (apt) {
            const { data: profile } = await supabase
              .from('profiles')
              .select('full_name')
              .eq('id', (apt as any).patient_id)
              .maybeSingle();
            patientName = (profile as any)?.full_name || 'Unknown';
          }
        }

        // Get doctor name
        let doctorName = 'Unassigned';
        if (entryTyped.assigned_doctor_id) {
          const { data: reg } = await supabase
            .from('doctor_registrations')
            .select('full_name')
            .eq('user_id', entryTyped.assigned_doctor_id)
            .maybeSingle();
          doctorName = (reg as any)?.full_name || 'Doctor';
        }

        // Get org name
        let orgName = 'Unknown';
        if (entryTyped.organisation_id) {
          const { data: org } = await supabase
            .from('organisations')
            .select('name')
            .eq('id', entryTyped.organisation_id)
            .maybeSingle();
          orgName = (org as any)?.name || 'Unknown';
        }

        enriched.push({
          ...entryTyped,
          patient_name: patientName,
          doctor_name: doctorName,
          org_name: orgName,
        });
      }

      setAssignments(enriched);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assignments');
    } finally {
      setLoading(false);
    }
  }, [selectedOrg, statusFilter]);

  useEffect(() => {
    fetchOrganisations();
  }, [fetchOrganisations]);

  useEffect(() => {
    fetchAssignments();
  }, [fetchAssignments]);

  const handleManualAssign = async (appointmentId: string, doctorId: string) => {
    setRetrying(appointmentId);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('assign-clinician', {
        body: { appointmentId, doctorId },
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw new Error(response.error.message);

      await fetchAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to assign clinician');
    } finally {
      setRetrying(null);
    }
  };

  const handleRetryAll = async () => {
    setLoading(true);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) throw new Error('Not authenticated');

      const response = await supabase.functions.invoke('retry-assignments', {
        headers: { Authorization: `Bearer ${session.access_token}` },
      });

      if (response.error) throw new Error(response.error.message);

      await fetchAssignments();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to retry assignments');
    } finally {
      setLoading(false);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'assigned':
        return <Badge className="bg-green-100 text-green-800">Assigned</Badge>;
      case 'pending':
        return <Badge className="bg-yellow-100 text-yellow-800">Pending</Badge>;
      case 'failed':
        return <Badge className="bg-red-100 text-red-800">Failed</Badge>;
      default:
        return <Badge>{status}</Badge>;
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>Clinician Assignment Queue</CardTitle>
          <div className="flex gap-2">
            {isSuperAdmin && (
              <Select value={selectedOrg} onValueChange={setSelectedOrg}>
                <SelectTrigger className="w-[200px]">
                  <SelectValue placeholder="All Organisations" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Organisations</SelectItem>
                  {organisations.map((org) => (
                    <SelectItem key={org.id} value={org.id}>{org.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            )}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="All Statuses" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Statuses</SelectItem>
                <SelectItem value="pending">Pending</SelectItem>
                <SelectItem value="assigned">Assigned</SelectItem>
                <SelectItem value="failed">Failed</SelectItem>
              </SelectContent>
            </Select>
            <Button onClick={handleRetryAll} variant="outline" disabled={loading}>
              Retry All Pending
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent>
        {error && (
          <Alert className="mb-4">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {loading ? (
          <div className="text-center py-8 text-muted-foreground">Loading assignments...</div>
        ) : assignments.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">No assignments found</div>
        ) : (
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Patient</TableHead>
                  <TableHead>Service</TableHead>
                  <TableHead>Date & Time</TableHead>
                  <TableHead>Duration</TableHead>
                  <TableHead>Organisation</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Assigned Doctor</TableHead>
                  <TableHead>Failure Reason</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {assignments.map((entry) => (
                  <TableRow key={entry.id}>
                    <TableCell className="font-medium">{entry.patient_name}</TableCell>
                    <TableCell>{entry.service_name}</TableCell>
                    <TableCell>{entry.preferred_date} {entry.preferred_time}</TableCell>
                    <TableCell>{entry.preferred_duration_minutes} min</TableCell>
                    <TableCell>{entry.org_name}</TableCell>
                    <TableCell>{getStatusBadge(entry.status)}</TableCell>
                    <TableCell>{entry.doctor_name}</TableCell>
                    <TableCell className="text-red-600 text-sm max-w-[200px] truncate">
                      {entry.failure_reason || '-'}
                    </TableCell>
                    <TableCell>
                      {entry.status === 'failed' && (
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleRetryAll()}
                          disabled={retrying === entry.appointment_id}
                        >
                          {retrying === entry.appointment_id ? 'Retrying...' : 'Retry'}
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
