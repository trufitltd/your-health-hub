import { useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { AlertCircle, CheckCircle2, ChevronsUpDown, Clock3, CreditCard, RefreshCw, Wallet, XCircle } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from '@/components/ui/use-toast';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { formatAppointmentStatusLabel } from '@/services/marketplaceTypes';

type PaymentRow = {
  id: string;
  appointment_id: string | null;
  patient_id: string | null;
  amount: number;
  status: string | null;
  provider: string | null;
  payment_method: string | null;
  payment_reference: string | null;
  provider_reference: string | null;
  created_at: string;
  verified_at: string | null;
  metadata?: Record<string, unknown> | null;
};

type WalletTransactionRow = {
  id: string;
  patient_id: string;
  appointment_id: string | null;
  amount: number;
  direction: 'credit' | 'debit';
  transaction_type: 'refund' | 'booking_wallet_use' | 'adjustment';
  status: string;
  narration: string | null;
  created_at: string;
};

type WithdrawalRequestRow = {
  id: string;
  patient_id: string;
  patient_name: string | null;
  patient_email: string | null;
  patient_phone: string | null;
  amount: number;
  status: 'pending' | 'processing' | 'completed' | 'rejected' | 'cancelled';
  narration: string | null;
  created_at: string;
  updated_at: string;
  sla_due_at: string;
  processed_by: string | null;
  processed_at: string | null;
  completed_at: string | null;
  admin_note: string | null;
  payout_reference: string | null;
  wallet_reversed_at: string | null;
};

type AppointmentLookupRow = {
  id: string;
  status: string | null;
};

type PatientLookupRow = {
  user_id: string;
  full_name: string | null;
  email: string | null;
};

type PatientOption = {
  id: string;
  label: string;
  email: string | null;
};

type DateFilterMode = 'current_month' | 'date_range' | 'as_at' | 'all';

type DateFilterBounds = {
  fromMs: number | null;
  toMs: number | null;
};

type WithdrawalActionStatus = 'processing' | 'completed' | 'rejected' | 'cancelled';

const isSuccessfulPaymentStatus = (status: string | null | undefined) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['completed', 'success', 'paid', 'succeeded'].includes(normalized);
};

const isFailedPaymentStatus = (status: string | null | undefined) => {
  const normalized = String(status || '').trim().toLowerCase();
  return ['failed', 'error', 'abandoned'].includes(normalized);
};

const formatDateTime = (value?: string | null) => {
  if (!value) return 'N/A';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'N/A';
  return date.toLocaleString();
};

const toDateInputValue = (date: Date) => {
  const local = new Date(date);
  local.setMinutes(local.getMinutes() - local.getTimezoneOffset());
  return local.toISOString().slice(0, 10);
};

const parseDateInputStart = (value: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T00:00:00`);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
};

const parseDateInputEnd = (value: string) => {
  if (!value) return null;
  const parsed = new Date(`${value}T23:59:59.999`);
  const time = parsed.getTime();
  return Number.isFinite(time) ? time : null;
};

const isWithinDateBounds = (value: string | null | undefined, bounds: DateFilterBounds) => {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (!Number.isFinite(time)) return false;
  if (bounds.fromMs !== null && time < bounds.fromMs) return false;
  if (bounds.toMs !== null && time > bounds.toMs) return false;
  return true;
};

const PaymentStatusBadge = ({ status }: { status: string | null | undefined }) => {
  const normalized = String(status || '').trim().toLowerCase();
  if (isSuccessfulPaymentStatus(normalized)) {
    return <Badge className="bg-success/10 text-success border-success/20">Successful</Badge>;
  }
  if (isFailedPaymentStatus(normalized)) {
    return <Badge className="bg-destructive/10 text-destructive border-destructive/20">Failed</Badge>;
  }
  return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
};

const WithdrawalStatusBadge = ({ status }: { status: WithdrawalRequestRow['status'] }) => {
  if (status === 'completed') {
    return <Badge className="bg-success/10 text-success border-success/20">Completed</Badge>;
  }
  if (status === 'processing') {
    return <Badge className="bg-primary/10 text-primary border-primary/20">Processing</Badge>;
  }
  if (status === 'rejected' || status === 'cancelled') {
    return <Badge className="bg-destructive/10 text-destructive border-destructive/20">{status}</Badge>;
  }
  return <Badge className="bg-warning/10 text-warning border-warning/20">Pending</Badge>;
};

export const PaymentsManagementPanel = () => {
  const queryClient = useQueryClient();

  const [selectedPatientId, setSelectedPatientId] = useState('all');
  const [selectedPatientLabel, setSelectedPatientLabel] = useState('');
  const [patientSearchOpen, setPatientSearchOpen] = useState(false);
  const [patientSearchTerm, setPatientSearchTerm] = useState('');
  const [dateFilterMode, setDateFilterMode] = useState<DateFilterMode>('current_month');
  const [dateRangeFrom, setDateRangeFrom] = useState(() => {
    const now = new Date();
    return toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1));
  });
  const [dateRangeTo, setDateRangeTo] = useState(() => toDateInputValue(new Date()));
  const [asAtDate, setAsAtDate] = useState(() => toDateInputValue(new Date()));
  const [paymentsStatusFilter, setPaymentsStatusFilter] = useState<'all' | 'successful' | 'failed' | 'pending'>('all');
  const [paymentsMethodFilter, setPaymentsMethodFilter] = useState<'all' | 'paystack' | 'wallet'>('all');
  const [withdrawalStatusFilter, setWithdrawalStatusFilter] = useState<'all' | WithdrawalRequestRow['status']>('all');

  const [selectedWithdrawal, setSelectedWithdrawal] = useState<WithdrawalRequestRow | null>(null);
  const [withdrawalActionStatus, setWithdrawalActionStatus] = useState<WithdrawalActionStatus>('processing');
  const [withdrawalAdminNote, setWithdrawalAdminNote] = useState('');
  const [withdrawalPayoutReference, setWithdrawalPayoutReference] = useState('');
  const [isUpdatingWithdrawal, setIsUpdatingWithdrawal] = useState(false);

  const { data: payments = [], isLoading: paymentsLoading, refetch: refetchPayments } = useQuery({
    queryKey: ['admin-payments-table'],
    queryFn: async () => {
      const rpcResult = await supabase.rpc('admin_list_payments', {
        p_status: null,
        p_provider: null,
        p_limit: 400,
        p_offset: 0,
      });

      if (!rpcResult.error) {
        return (rpcResult.data || []) as PaymentRow[];
      }

      // Fallback for environments where admin RPC migration is not yet applied.
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('payments')
        .select('id, appointment_id, patient_id, amount, status, provider, payment_method, payment_reference, provider_reference, created_at, verified_at, metadata')
        .order('created_at', { ascending: false })
        .limit(400);

      if (fallbackError) {
        throw fallbackError;
      }

      return (fallbackData || []) as PaymentRow[];
    },
    refetchInterval: 30000,
  });

  const { data: walletTransactions = [], isLoading: walletLoading, refetch: refetchWallet } = useQuery({
    queryKey: ['admin-patient-wallet-transactions'],
    queryFn: async () => {
      const rpcResult = await supabase.rpc('admin_list_patient_wallet_transactions', {
        p_limit: 400,
        p_offset: 0,
      });

      if (!rpcResult.error) {
        return (rpcResult.data || []) as WalletTransactionRow[];
      }

      // Fallback for environments where admin RPC migration is not yet applied.
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('patient_wallet_transactions')
        .select('id, patient_id, appointment_id, amount, direction, transaction_type, status, narration, created_at')
        .order('created_at', { ascending: false })
        .limit(400);

      if (fallbackError) {
        throw fallbackError;
      }

      return (fallbackData || []) as WalletTransactionRow[];
    },
    refetchInterval: 30000,
  });

  const { data: withdrawalRequests = [], isLoading: withdrawalsLoading, refetch: refetchWithdrawals } = useQuery({
    queryKey: ['admin-patient-wallet-withdrawal-requests'],
    queryFn: async () => {
      const rpcResult = await supabase.rpc('admin_list_patient_wallet_withdrawal_requests', {
        p_status: null,
        p_limit: 400,
        p_offset: 0,
      });

      if (!rpcResult.error) {
        return (rpcResult.data || []) as WithdrawalRequestRow[];
      }

      // Fallback for environments where admin RPC migration is not yet applied.
      const { data: fallbackData, error: fallbackError } = await supabase
        .from('patient_wallet_withdrawal_requests')
        .select('id, patient_id, amount, status, narration, created_at, updated_at')
        .order('created_at', { ascending: false })
        .limit(400);

      if (fallbackError) {
        throw fallbackError;
      }

      return ((fallbackData || []).map((row: any) => ({
        ...row,
        patient_name: null,
        patient_email: null,
        patient_phone: null,
        sla_due_at: row.created_at ? new Date(new Date(row.created_at).getTime() + (48 * 60 * 60 * 1000)).toISOString() : new Date().toISOString(),
        processed_by: null,
        processed_at: null,
        completed_at: null,
        admin_note: null,
        payout_reference: null,
        wallet_reversed_at: null,
      })) as WithdrawalRequestRow[]);
    },
    refetchInterval: 30000,
  });

  const activeDateBounds = useMemo<DateFilterBounds>(() => {
    if (dateFilterMode === 'all') {
      return { fromMs: null, toMs: null };
    }

    if (dateFilterMode === 'current_month') {
      const now = new Date();
      const from = new Date(now.getFullYear(), now.getMonth(), 1).getTime();
      const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999).getTime();
      return { fromMs: from, toMs: to };
    }

    if (dateFilterMode === 'as_at') {
      return {
        fromMs: null,
        toMs: parseDateInputEnd(asAtDate),
      };
    }

    const fromCandidate = parseDateInputStart(dateRangeFrom);
    const toCandidate = parseDateInputEnd(dateRangeTo);

    if (fromCandidate !== null && toCandidate !== null && fromCandidate > toCandidate) {
      return { fromMs: toCandidate, toMs: fromCandidate };
    }

    return { fromMs: fromCandidate, toMs: toCandidate };
  }, [dateFilterMode, dateRangeFrom, dateRangeTo, asAtDate]);

  const activeDateFilterLabel = useMemo(() => {
    if (dateFilterMode === 'all') return 'All time';
    if (dateFilterMode === 'current_month') return 'Current month';
    if (dateFilterMode === 'as_at') return asAtDate ? `As at ${asAtDate}` : 'As at date';
    if (dateRangeFrom && dateRangeTo) return `${dateRangeFrom} to ${dateRangeTo}`;
    if (dateRangeFrom) return `From ${dateRangeFrom}`;
    if (dateRangeTo) return `Until ${dateRangeTo}`;
    return 'Custom date range';
  }, [dateFilterMode, dateRangeFrom, dateRangeTo, asAtDate]);

  const dateFilteredPayments = useMemo(
    () => payments.filter((row) => isWithinDateBounds(row.created_at, activeDateBounds)),
    [payments, activeDateBounds],
  );

  const dateFilteredWalletTransactions = useMemo(
    () => walletTransactions.filter((row) => isWithinDateBounds(row.created_at, activeDateBounds)),
    [walletTransactions, activeDateBounds],
  );

  const dateFilteredWithdrawals = useMemo(
    () => withdrawalRequests.filter((row) => isWithinDateBounds(row.created_at, activeDateBounds)),
    [withdrawalRequests, activeDateBounds],
  );

  const patientIds = useMemo(() => {
    const ids = new Set<string>();
    dateFilteredPayments.forEach((row) => {
      if (row.patient_id) ids.add(row.patient_id);
    });
    dateFilteredWalletTransactions.forEach((row) => {
      if (row.patient_id) ids.add(row.patient_id);
    });
    dateFilteredWithdrawals.forEach((row) => {
      if (row.patient_id) ids.add(row.patient_id);
    });
    return Array.from(ids);
  }, [dateFilteredPayments, dateFilteredWalletTransactions, dateFilteredWithdrawals]);

  const { data: patientRows = [] } = useQuery({
    queryKey: ['admin-payments-patient-lookup', patientIds.join(',')],
    queryFn: async () => {
      if (patientIds.length === 0) return [] as PatientLookupRow[];
      const { data, error } = await supabase
        .from('patient_registrations')
        .select('user_id, full_name, email')
        .in('user_id', patientIds);
      if (error) throw error;
      return (data || []) as PatientLookupRow[];
    },
    enabled: patientIds.length > 0,
    staleTime: 60_000,
  });

  const patientLookup = useMemo(() => {
    const map = new Map<string, { full_name: string | null; email: string | null }>();
    patientRows.forEach((row) => map.set(row.user_id, { full_name: row.full_name, email: row.email }));
    dateFilteredWithdrawals.forEach((row) => {
      if (!row.patient_id) return;
      if (map.has(row.patient_id)) return;
      map.set(row.patient_id, { full_name: row.patient_name || null, email: row.patient_email || null });
    });
    return map;
  }, [patientRows, dateFilteredWithdrawals]);

  const patientOptions = useMemo(() => {
    return Array.from(patientLookup.entries())
      .map(([id, details]) => ({
        id,
        label: details.full_name || details.email || 'Unknown Patient',
        email: details.email || null,
      }))
      .sort((a, b) => a.label.localeCompare(b.label));
  }, [patientLookup]);

  const normalizedPatientSearchTerm = patientSearchTerm.trim();

  const { data: searchedPatients = [], isFetching: searchingPatients } = useQuery({
    queryKey: ['admin-payments-patient-search', normalizedPatientSearchTerm],
    queryFn: async () => {
      const safeSearch = normalizedPatientSearchTerm.replace(/[,%'()]/g, ' ').trim();
      if (safeSearch.length < 2) return [] as PatientLookupRow[];

      const { data, error } = await supabase
        .from('patient_registrations')
        .select('user_id, full_name, email')
        .or(`full_name.ilike.%${safeSearch}%,email.ilike.%${safeSearch}%`)
        .order('full_name', { ascending: true })
        .limit(20);

      if (error) throw error;
      return (data || []) as PatientLookupRow[];
    },
    enabled: normalizedPatientSearchTerm.length >= 2,
    staleTime: 30_000,
  });

  const autocompletePatientOptions = useMemo(() => {
    const map = new Map<string, PatientOption>();
    searchedPatients.forEach((row) => {
      map.set(row.user_id, {
        id: row.user_id,
        label: row.full_name || row.email || 'Unknown Patient',
        email: row.email || null,
      });
    });

    if (selectedPatientId !== 'all' && !map.has(selectedPatientId)) {
      const fromCurrent = patientOptions.find((option) => option.id === selectedPatientId);
      if (fromCurrent) {
        map.set(fromCurrent.id, fromCurrent);
      } else {
        const fallback = patientLookup.get(selectedPatientId);
        if (fallback) {
          map.set(selectedPatientId, {
            id: selectedPatientId,
            label: fallback.full_name || fallback.email || 'Unknown Patient',
            email: fallback.email || null,
          });
        }
      }
    }

    return Array.from(map.values())
      .sort((a, b) => a.label.localeCompare(b.label))
      .slice(0, 30);
  }, [searchedPatients, selectedPatientId, patientOptions, patientLookup]);

  const defaultAutocompleteOptions = useMemo(
    () => patientOptions.slice(0, 10),
    [patientOptions],
  );

  const selectedPatientDisplay = useMemo(() => {
    if (selectedPatientId === 'all') return 'All Patients';
    if (selectedPatientLabel) return selectedPatientLabel;
    const fromOptions = autocompletePatientOptions.find((option) => option.id === selectedPatientId);
    if (fromOptions) {
      return fromOptions.email ? `${fromOptions.label} (${fromOptions.email})` : fromOptions.label;
    }
    const fallback = patientLookup.get(selectedPatientId);
    if (fallback) {
      const fallbackLabel = fallback.full_name || fallback.email || 'Unknown Patient';
      return fallback.email ? `${fallbackLabel} (${fallback.email})` : fallbackLabel;
    }
    return 'Selected Patient';
  }, [selectedPatientId, selectedPatientLabel, autocompletePatientOptions, patientLookup]);

  const visiblePatientAutocompleteOptions = useMemo(
    () => normalizedPatientSearchTerm.length >= 2 ? autocompletePatientOptions : defaultAutocompleteOptions,
    [normalizedPatientSearchTerm.length, autocompletePatientOptions, defaultAutocompleteOptions],
  );

  const globallyFilteredPayments = useMemo(
    () => selectedPatientId === 'all'
      ? dateFilteredPayments
      : dateFilteredPayments.filter((row) => row.patient_id === selectedPatientId),
    [dateFilteredPayments, selectedPatientId],
  );

  const globallyFilteredWalletTransactions = useMemo(
    () => selectedPatientId === 'all'
      ? dateFilteredWalletTransactions
      : dateFilteredWalletTransactions.filter((row) => row.patient_id === selectedPatientId),
    [dateFilteredWalletTransactions, selectedPatientId],
  );

  const globallyFilteredWithdrawals = useMemo(
    () => selectedPatientId === 'all'
      ? dateFilteredWithdrawals
      : dateFilteredWithdrawals.filter((row) => row.patient_id === selectedPatientId),
    [dateFilteredWithdrawals, selectedPatientId],
  );

  const appointmentIds = useMemo(() => {
    const ids = new Set<string>();
    globallyFilteredPayments.forEach((row) => {
      if (row.appointment_id) ids.add(row.appointment_id);
    });
    globallyFilteredWalletTransactions.forEach((row) => {
      if (row.appointment_id) ids.add(row.appointment_id);
    });
    return Array.from(ids);
  }, [globallyFilteredPayments, globallyFilteredWalletTransactions]);

  const { data: appointmentRows = [] } = useQuery({
    queryKey: ['admin-payments-appointments-lookup', appointmentIds.join(',')],
    queryFn: async () => {
      if (appointmentIds.length === 0) return [] as AppointmentLookupRow[];
      const { data, error } = await supabase
        .from('appointments')
        .select('id, status')
        .in('id', appointmentIds);
      if (error) throw error;
      return (data || []) as AppointmentLookupRow[];
    },
    enabled: appointmentIds.length > 0,
    staleTime: 60_000,
  });

  const appointmentStatusLookup = useMemo(() => {
    const map = new Map<string, string | null>();
    appointmentRows.forEach((row) => map.set(row.id, row.status));
    return map;
  }, [appointmentRows]);

  const paymentMetrics = useMemo(() => {
    const successful = globallyFilteredPayments.filter((row) => isSuccessfulPaymentStatus(row.status));
    const failed = globallyFilteredPayments.filter((row) => isFailedPaymentStatus(row.status));
    const pending = globallyFilteredPayments.length - successful.length - failed.length;

    const successfulValue = successful.reduce((sum, row) => sum + Number(row.amount || 0), 0);
    const refundCredits = globallyFilteredWalletTransactions
      .filter((tx) => tx.direction === 'credit' && tx.transaction_type === 'refund' && tx.status === 'completed')
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const recognizedRevenueGross = successful
      .filter((row) => row.appointment_id && String(appointmentStatusLookup.get(row.appointment_id) || '').trim().toLowerCase() === 'completed')
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const recognizedRefunds = globallyFilteredWalletTransactions
      .filter((tx) => {
        if (tx.direction !== 'credit' || tx.transaction_type !== 'refund' || tx.status !== 'completed') return false;
        if (!tx.appointment_id) return false;
        return String(appointmentStatusLookup.get(tx.appointment_id) || '').trim().toLowerCase() === 'completed';
      })
      .reduce((sum, tx) => sum + Number(tx.amount || 0), 0);

    const netRecognizedRevenue = Math.max(recognizedRevenueGross - recognizedRefunds, 0);
    const escrowLiability = Math.max(successfulValue - recognizedRevenueGross, 0);

    const pendingWithdrawals = globallyFilteredWithdrawals.filter((row) => row.status === 'pending' || row.status === 'processing');
    const now = Date.now();
    const overdueWithdrawals = pendingWithdrawals.filter((row) => {
      const due = new Date(row.sla_due_at).getTime();
      return Number.isFinite(due) && due < now;
    });

    return {
      successfulCount: successful.length,
      failedCount: failed.length,
      pendingCount: Math.max(pending, 0),
      successfulValue,
      refundCredits,
      recognizedRevenueGross,
      netRecognizedRevenue,
      escrowLiability,
      pendingWithdrawalsCount: pendingWithdrawals.length,
      overdueWithdrawalsCount: overdueWithdrawals.length,
    };
  }, [
    globallyFilteredPayments,
    globallyFilteredWalletTransactions,
    globallyFilteredWithdrawals,
    appointmentStatusLookup,
  ]);

  const filteredPayments = useMemo(() => {
    return globallyFilteredPayments.filter((row) => {
      const statusMatch = (() => {
        if (paymentsStatusFilter === 'all') return true;
        if (paymentsStatusFilter === 'successful') return isSuccessfulPaymentStatus(row.status);
        if (paymentsStatusFilter === 'failed') return isFailedPaymentStatus(row.status);
        return !isSuccessfulPaymentStatus(row.status) && !isFailedPaymentStatus(row.status);
      })();

      const method = String(row.provider || row.payment_method || '').trim().toLowerCase();
      const methodMatch = paymentsMethodFilter === 'all' ? true : method === paymentsMethodFilter;
      return statusMatch && methodMatch;
    });
  }, [globallyFilteredPayments, paymentsStatusFilter, paymentsMethodFilter]);

  const filteredWalletTransactions = useMemo(
    () => globallyFilteredWalletTransactions,
    [globallyFilteredWalletTransactions],
  );

  const filteredWithdrawals = useMemo(() => {
    return globallyFilteredWithdrawals.filter((row) => {
      if (withdrawalStatusFilter === 'all') return true;
      return row.status === withdrawalStatusFilter;
    });
  }, [globallyFilteredWithdrawals, withdrawalStatusFilter]);

  const resetWithdrawalDialog = () => {
    setSelectedWithdrawal(null);
    setWithdrawalActionStatus('processing');
    setWithdrawalAdminNote('');
    setWithdrawalPayoutReference('');
  };

  const openWithdrawalActionDialog = (request: WithdrawalRequestRow, nextStatus: WithdrawalActionStatus) => {
    setSelectedWithdrawal(request);
    setWithdrawalActionStatus(nextStatus);
    setWithdrawalAdminNote(request.admin_note || '');
    setWithdrawalPayoutReference(nextStatus === 'completed' ? request.payout_reference || '' : '');
  };

  const updateWithdrawalStatus = async () => {
    if (!selectedWithdrawal) return;

    if (withdrawalActionStatus === 'completed' && !withdrawalPayoutReference.trim()) {
      toast({
        title: 'Payout reference required',
        description: 'Enter the bank transfer reference before marking this request as completed.',
        variant: 'destructive',
      });
      return;
    }

    setIsUpdatingWithdrawal(true);
    try {
      const { error } = await supabase.rpc('admin_update_patient_wallet_withdrawal_request', {
        p_request_id: selectedWithdrawal.id,
        p_status: withdrawalActionStatus,
        p_admin_note: withdrawalAdminNote.trim() || null,
        p_payout_reference: withdrawalActionStatus === 'completed' ? withdrawalPayoutReference.trim() || null : null,
      });

      if (error) throw error;

      toast({
        title: 'Withdrawal updated',
        description: `Request has been moved to ${withdrawalActionStatus}.`,
      });

      resetWithdrawalDialog();
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['admin-patient-wallet-withdrawal-requests'] }),
        queryClient.invalidateQueries({ queryKey: ['patient-wallet'] }),
      ]);
      await refetchWithdrawals();
      await refetchWallet();
    } catch (error: any) {
      toast({
        title: 'Update failed',
        description: error?.message || 'Unable to update withdrawal request.',
        variant: 'destructive',
      });
    } finally {
      setIsUpdatingWithdrawal(false);
    }
  };

  const isAnyLoading = paymentsLoading || walletLoading || withdrawalsLoading;

  const handleSelectPatient = (option: PatientOption | null) => {
    if (!option) {
      setSelectedPatientId('all');
      setSelectedPatientLabel('');
      setPatientSearchOpen(false);
      setPatientSearchTerm('');
      return;
    }

    setSelectedPatientId(option.id);
    setSelectedPatientLabel(option.email ? `${option.label} (${option.email})` : option.label);
    setPatientSearchOpen(false);
    setPatientSearchTerm('');
  };

  const handleDateModeChange = (mode: DateFilterMode) => {
    setDateFilterMode(mode);
    if (mode === 'current_month') {
      const now = new Date();
      setDateRangeFrom(toDateInputValue(new Date(now.getFullYear(), now.getMonth(), 1)));
      setDateRangeTo(toDateInputValue(now));
    }
    if (mode === 'as_at' && !asAtDate) {
      setAsAtDate(toDateInputValue(new Date()));
    }
  };

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CreditCard className="w-5 h-5" />
                Payments Operations
              </CardTitle>
              <CardDescription>
                Filter transactions, wallet ledger, withdrawals, and KPI metrics from one panel.
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={async () => {
                await Promise.all([refetchPayments(), refetchWallet(), refetchWithdrawals()]);
              }}
              disabled={isAnyLoading}
            >
              <RefreshCw className="w-4 h-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-3 lg:grid-cols-3">
            <div className="space-y-1">
              <label className="text-sm font-medium">Patient</label>
              <Popover open={patientSearchOpen} onOpenChange={setPatientSearchOpen}>
                <PopoverTrigger asChild>
                  <Button
                    variant="outline"
                    role="combobox"
                    aria-expanded={patientSearchOpen}
                    className="w-full justify-between"
                  >
                    <span className="truncate text-left">{selectedPatientDisplay}</span>
                    <ChevronsUpDown className="w-4 h-4 ml-2 opacity-60" />
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-[380px] p-0" align="start">
                  <Command shouldFilter={false}>
                    <CommandInput
                      placeholder="Type patient name or email..."
                      value={patientSearchTerm}
                      onValueChange={setPatientSearchTerm}
                    />
                    <CommandList>
                      <CommandGroup>
                        <CommandItem
                          value="all-patients"
                          onSelect={() => handleSelectPatient(null)}
                        >
                          All Patients
                        </CommandItem>
                      </CommandGroup>
                      <CommandGroup heading={normalizedPatientSearchTerm.length >= 2 ? 'Search Results' : 'Recent Patients'}>
                        {visiblePatientAutocompleteOptions.map((option) => (
                          <CommandItem
                            key={option.id}
                            value={`${option.label}-${option.email || ''}-${option.id}`}
                            onSelect={() => handleSelectPatient(option)}
                          >
                            <div className="flex flex-col">
                              <span>{option.label}</span>
                              {option.email ? <span className="text-xs text-muted-foreground">{option.email}</span> : null}
                            </div>
                          </CommandItem>
                        ))}
                      </CommandGroup>
                      <CommandEmpty>
                        {normalizedPatientSearchTerm.length < 2
                          ? 'Type at least 2 characters to search patients.'
                          : 'No patients found.'}
                      </CommandEmpty>
                    </CommandList>
                  </Command>
                </PopoverContent>
              </Popover>
              {searchingPatients ? (
                <p className="text-xs text-muted-foreground">Searching patients...</p>
              ) : null}
            </div>

            <div className="space-y-1">
              <label className="text-sm font-medium">Date Filter</label>
              <Select value={dateFilterMode} onValueChange={(value) => handleDateModeChange(value as DateFilterMode)}>
                <SelectTrigger>
                  <SelectValue placeholder="Select date filter" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="current_month">Current Month</SelectItem>
                  <SelectItem value="date_range">Date Range</SelectItem>
                  <SelectItem value="as_at">Date As At</SelectItem>
                  <SelectItem value="all">All Time</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="flex items-end">
              <p className="text-sm text-muted-foreground">
                Active filters: {selectedPatientDisplay} | {activeDateFilterLabel}
              </p>
            </div>
          </div>

          {dateFilterMode === 'date_range' ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1">
                <label className="text-sm font-medium">From</label>
                <Input
                  type="date"
                  value={dateRangeFrom}
                  onChange={(event) => setDateRangeFrom(event.target.value)}
                />
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium">To</label>
                <Input
                  type="date"
                  value={dateRangeTo}
                  onChange={(event) => setDateRangeTo(event.target.value)}
                />
              </div>
            </div>
          ) : null}

          {dateFilterMode === 'as_at' ? (
            <div className="max-w-xs space-y-1">
              <label className="text-sm font-medium">Date As At</label>
              <Input
                type="date"
                value={asAtDate}
                onChange={(event) => setAsAtDate(event.target.value)}
              />
            </div>
          ) : null}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Financial KPIs</CardTitle>
          <CardDescription>Revenue recognition and liabilities based on current global filters.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 bg-success/5 border-success/20">
              <p className="text-xs text-muted-foreground">Successful Payments</p>
              <p className="text-xl font-semibold text-success">{paymentMetrics.successfulCount}</p>
              <p className="text-xs text-muted-foreground">₦{paymentMetrics.successfulValue.toLocaleString()} collected</p>
            </div>
            <div className="rounded-lg border p-3 bg-destructive/5 border-destructive/20">
              <p className="text-xs text-muted-foreground">Failed Payments</p>
              <p className="text-xl font-semibold text-destructive">{paymentMetrics.failedCount}</p>
            </div>
            <div className="rounded-lg border p-3 bg-warning/5 border-warning/20">
              <p className="text-xs text-muted-foreground">Pending Payments</p>
              <p className="text-xl font-semibold text-warning">{paymentMetrics.pendingCount}</p>
            </div>
            <div className="rounded-lg border p-3 bg-primary/5 border-primary/20">
              <p className="text-xs text-muted-foreground">Refund Credits</p>
              <p className="text-xl font-semibold text-primary">₦{paymentMetrics.refundCredits.toLocaleString()}</p>
            </div>
          </div>

          <div className="mt-4 grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-lg border p-3 bg-emerald-50 border-emerald-200">
              <p className="text-xs text-muted-foreground">Recognized Revenue</p>
              <p className="text-xl font-semibold text-emerald-700">₦{paymentMetrics.recognizedRevenueGross.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Completed appointments only</p>
            </div>
            <div className="rounded-lg border p-3 bg-teal-50 border-teal-200">
              <p className="text-xs text-muted-foreground">Net Recognized Revenue</p>
              <p className="text-xl font-semibold text-teal-700">₦{paymentMetrics.netRecognizedRevenue.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Recognized less refunds</p>
            </div>
            <div className="rounded-lg border p-3 bg-amber-50 border-amber-200">
              <p className="text-xs text-muted-foreground">Escrow Liability</p>
              <p className="text-xl font-semibold text-amber-700">₦{paymentMetrics.escrowLiability.toLocaleString()}</p>
              <p className="text-xs text-muted-foreground">Collected but not yet completed</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs text-muted-foreground">Pending Withdrawals</p>
              <p className="text-xl font-semibold">
                {paymentMetrics.pendingWithdrawalsCount}
                <span className="text-sm text-destructive ml-2">({paymentMetrics.overdueWithdrawalsCount} overdue)</span>
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="transactions" className="space-y-4">
        <TabsList className="grid grid-cols-3 w-full">
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="wallet">Wallet Ledger</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
        </TabsList>

        <TabsContent value="transactions" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Paystack and Wallet Transactions</CardTitle>
              <CardDescription>
                Includes successful, pending, and failed payment intents for appointments and reschedules.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'successful', 'failed', 'pending'] as const).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={paymentsStatusFilter === status ? 'default' : 'outline'}
                    onClick={() => setPaymentsStatusFilter(status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>

              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'paystack', 'wallet'] as const).map((method) => (
                  <Button
                    key={method}
                    size="sm"
                    variant={paymentsMethodFilter === method ? 'default' : 'outline'}
                    onClick={() => setPaymentsMethodFilter(method)}
                  >
                    {method}
                  </Button>
                ))}
              </div>

              {paymentsLoading ? (
                <p className="text-sm text-muted-foreground">Loading transactions...</p>
              ) : filteredPayments.length === 0 ? (
                <p className="text-sm text-muted-foreground">No transactions match the selected filters.</p>
              ) : (
                <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                  {filteredPayments.map((payment) => {
                    const patient = payment.patient_id ? patientLookup.get(payment.patient_id) : null;
                    const metadataType = String(payment.metadata?.type || '').trim();
                    const provider = String(payment.provider || payment.payment_method || 'unknown').toLowerCase();
                    return (
                      <div key={payment.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <PaymentStatusBadge status={payment.status} />
                            <Badge variant="outline">{provider}</Badge>
                            {metadataType ? <Badge variant="secondary">{metadataType}</Badge> : null}
                          </div>
                          <p className="text-sm font-semibold">₦{Number(payment.amount || 0).toLocaleString()}</p>
                        </div>

                        <div className="mt-2 grid md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">Patient:</span>{' '}
                            {patient?.full_name || 'Unknown Patient'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Reference:</span>{' '}
                            {payment.provider_reference || payment.payment_reference || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Email:</span> {patient?.email || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Appointment status:</span>{' '}
                            {payment.appointment_id
                              ? formatAppointmentStatusLabel(appointmentStatusLookup.get(payment.appointment_id) || '')
                              : 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Created:</span> {formatDateTime(payment.created_at)}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Verified:</span> {formatDateTime(payment.verified_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="wallet" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Wallet className="w-5 h-5" />
                Patient Wallet Ledger
              </CardTitle>
              <CardDescription>
                Refunds, wallet booking usage, and manual adjustments are tracked here.
              </CardDescription>
            </CardHeader>
            <CardContent>
              {walletLoading ? (
                <p className="text-sm text-muted-foreground">Loading wallet ledger...</p>
              ) : filteredWalletTransactions.length === 0 ? (
                <p className="text-sm text-muted-foreground">No wallet transactions found.</p>
              ) : (
                <div className="space-y-3 max-h-[560px] overflow-y-auto pr-1">
                  {filteredWalletTransactions.map((tx) => {
                    const patient = patientLookup.get(tx.patient_id);
                    const isCredit = tx.direction === 'credit';
                    return (
                      <div key={tx.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <Badge className={isCredit ? 'bg-success/10 text-success border-success/20' : 'bg-warning/10 text-warning border-warning/20'}>
                              {isCredit ? 'credit' : 'debit'}
                            </Badge>
                            <Badge variant="outline">{tx.transaction_type}</Badge>
                            <Badge variant="secondary">{tx.status}</Badge>
                          </div>
                          <p className={`text-sm font-semibold ${isCredit ? 'text-success' : 'text-warning'}`}>
                            {isCredit ? '+' : '-'}₦{Number(tx.amount || 0).toLocaleString()}
                          </p>
                        </div>

                        <div className="mt-2 grid md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">Patient:</span>{' '}
                            {patient?.full_name || 'Unknown Patient'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Appointment:</span>{' '}
                            {tx.appointment_id || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Email:</span> {patient?.email || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Appointment status:</span>{' '}
                            {tx.appointment_id
                              ? formatAppointmentStatusLabel(appointmentStatusLookup.get(tx.appointment_id) || '')
                              : 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Narration:</span>{' '}
                            {tx.narration || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Time:</span> {formatDateTime(tx.created_at)}
                          </p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="withdrawals" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">Withdrawal Requests (48h SLA)</CardTitle>
              <CardDescription>
                Patient requests start as <span className="font-medium">pending</span>, then move to{' '}
                <span className="font-medium">processing</span>, and finally <span className="font-medium">completed</span>{' '}
                after bank transfer.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                {(['all', 'pending', 'processing', 'completed', 'rejected', 'cancelled'] as const).map((status) => (
                  <Button
                    key={status}
                    size="sm"
                    variant={withdrawalStatusFilter === status ? 'default' : 'outline'}
                    onClick={() => setWithdrawalStatusFilter(status)}
                  >
                    {status}
                  </Button>
                ))}
              </div>

              {withdrawalsLoading ? (
                <p className="text-sm text-muted-foreground">Loading withdrawal requests...</p>
              ) : filteredWithdrawals.length === 0 ? (
                <p className="text-sm text-muted-foreground">No withdrawal requests match the selected status.</p>
              ) : (
                <div className="space-y-3 max-h-[620px] overflow-y-auto pr-1">
                  {filteredWithdrawals.map((request) => {
                    const dueTime = new Date(request.sla_due_at).getTime();
                    const isOverdue = (request.status === 'pending' || request.status === 'processing')
                      && Number.isFinite(dueTime)
                      && dueTime < Date.now();

                    return (
                      <div key={request.id} className="rounded-lg border p-3">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2">
                            <WithdrawalStatusBadge status={request.status} />
                            {isOverdue ? (
                              <Badge className="bg-destructive/10 text-destructive border-destructive/20">Overdue</Badge>
                            ) : null}
                          </div>
                          <p className="text-sm font-semibold">₦{Number(request.amount || 0).toLocaleString()}</p>
                        </div>

                        <div className="mt-2 grid md:grid-cols-2 gap-2 text-xs text-muted-foreground">
                          <p>
                            <span className="font-medium text-foreground">Patient:</span>{' '}
                            {request.patient_name || patientLookup.get(request.patient_id)?.full_name || 'Unknown Patient'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Email:</span>{' '}
                            {request.patient_email || patientLookup.get(request.patient_id)?.email || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Created:</span> {formatDateTime(request.created_at)}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">SLA Due:</span> {formatDateTime(request.sla_due_at)}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Payout Ref:</span>{' '}
                            {request.payout_reference || 'N/A'}
                          </p>
                          <p>
                            <span className="font-medium text-foreground">Processed:</span>{' '}
                            {formatDateTime(request.processed_at)}
                          </p>
                        </div>

                        {(request.narration || request.admin_note) ? (
                          <div className="mt-2 rounded-md bg-muted/30 p-2 text-xs text-muted-foreground space-y-1">
                            {request.narration ? (
                              <p>
                                <span className="font-medium text-foreground">Patient note:</span> {request.narration}
                              </p>
                            ) : null}
                            {request.admin_note ? (
                              <p>
                                <span className="font-medium text-foreground">Admin note:</span> {request.admin_note}
                              </p>
                            ) : null}
                          </div>
                        ) : null}

                        {(request.status === 'pending' || request.status === 'processing') ? (
                          <div className="mt-3 flex flex-wrap items-center gap-2">
                            {request.status === 'pending' ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => openWithdrawalActionDialog(request, 'processing')}
                              >
                                <Clock3 className="w-4 h-4 mr-1" />
                                Mark Processing
                              </Button>
                            ) : null}
                            <Button
                              size="sm"
                              onClick={() => openWithdrawalActionDialog(request, 'completed')}
                            >
                              <CheckCircle2 className="w-4 h-4 mr-1" />
                              Mark Completed
                            </Button>
                            <Button
                              size="sm"
                              variant="outline"
                              className="text-destructive border-destructive/30 hover:bg-destructive/10"
                              onClick={() => openWithdrawalActionDialog(request, 'rejected')}
                            >
                              <XCircle className="w-4 h-4 mr-1" />
                              Reject
                            </Button>
                          </div>
                        ) : null}
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={!!selectedWithdrawal} onOpenChange={(open) => !open && resetWithdrawalDialog()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Update Withdrawal Request</DialogTitle>
            <DialogDescription>
              Move this withdrawal request to <span className="font-medium">{withdrawalActionStatus}</span>.
            </DialogDescription>
          </DialogHeader>

          {selectedWithdrawal ? (
            <div className="space-y-3">
              <div className="rounded-md border bg-muted/20 p-3 text-sm">
                <p>
                  <span className="font-medium">Patient:</span>{' '}
                  {selectedWithdrawal.patient_name
                    || patientLookup.get(selectedWithdrawal.patient_id)?.full_name
                    || 'Unknown Patient'}
                </p>
                <p>
                  <span className="font-medium">Email:</span>{' '}
                  {selectedWithdrawal.patient_email
                    || patientLookup.get(selectedWithdrawal.patient_id)?.email
                    || 'N/A'}
                </p>
                <p>
                  <span className="font-medium">Amount:</span> ₦{Number(selectedWithdrawal.amount || 0).toLocaleString()}
                </p>
              </div>

              {withdrawalActionStatus === 'completed' ? (
                <div className="space-y-1">
                  <label className="text-sm font-medium">Bank Transfer Reference</label>
                  <Input
                    value={withdrawalPayoutReference}
                    onChange={(event) => setWithdrawalPayoutReference(event.target.value)}
                    placeholder="e.g., NIP-20260228-001"
                  />
                </div>
              ) : null}

              <div className="space-y-1">
                <label className="text-sm font-medium">Admin Note (optional)</label>
                <Textarea
                  value={withdrawalAdminNote}
                  onChange={(event) => setWithdrawalAdminNote(event.target.value)}
                  rows={3}
                  placeholder="Add processing details for audit trail"
                />
              </div>

              {withdrawalActionStatus === 'rejected' || withdrawalActionStatus === 'cancelled' ? (
                <div className="rounded-md border border-warning/30 bg-warning/5 p-3 text-xs text-warning-foreground flex gap-2">
                  <AlertCircle className="w-4 h-4 mt-0.5 flex-shrink-0" />
                  <p>Rejecting or cancelling will return the reserved amount to the patient wallet automatically.</p>
                </div>
              ) : null}
            </div>
          ) : null}

          <DialogFooter>
            <Button variant="outline" onClick={resetWithdrawalDialog}>Cancel</Button>
            <Button onClick={updateWithdrawalStatus} disabled={isUpdatingWithdrawal}>
              {isUpdatingWithdrawal ? 'Updating...' : 'Save Update'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
