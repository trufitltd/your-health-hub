import { useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { toast } from '@/components/ui/use-toast';
import { Search, Plus, Minus, Wallet, ArrowLeft, RefreshCw } from 'lucide-react';

type WalletRow = {
  patient_id: string;
  full_name: string;
  email: string;
  available_balance: number;
  total_credited: number;
  total_debited: number;
  last_transaction_at: string | null;
};

type WalletDetail = {
  patient_id: string;
  full_name: string;
  email: string;
  available_balance: number;
  transactions: {
    id: string;
    amount: number;
    direction: 'credit' | 'debit';
    transaction_type: string;
    status: string;
    narration: string;
    created_at: string;
    appointment_id: string | null;
  }[];
};

const formatCurrency = (amount: number) =>
  `₦${Number(amount || 0).toLocaleString('en-NG', { minimumFractionDigits: 2 })}`;

const formatDate = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString() : '—';

export default function AdminPatientWalletPanel() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [selectedPatientId, setSelectedPatientId] = useState<string | null>(null);
  const [adjustAmount, setAdjustAmount] = useState('');
  const [adjustReason, setAdjustReason] = useState('');
  const [adjusting, setAdjusting] = useState(false);

  const { data: wallets = [], isLoading, refetch } = useQuery<WalletRow[]>({
    queryKey: ['admin-patient-wallets', search],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_list_patient_wallets', {
        p_search: search || null,
        p_limit: 100,
        p_offset: 0,
      });
      if (error) throw error;
      return (data || []) as WalletRow[];
    },
  });

  const { data: detail, isLoading: detailLoading, refetch: refetchDetail } = useQuery<WalletDetail>({
    queryKey: ['admin-patient-wallet-detail', selectedPatientId],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('admin_get_patient_wallet_detail', {
        p_patient_id: selectedPatientId,
      });
      if (error) throw error;
      return data as WalletDetail;
    },
    enabled: !!selectedPatientId,
  });

  const handleAdjust = async (direction: 'credit' | 'debit') => {
    const amount = parseFloat(adjustAmount.replace(/,/g, ''));
    if (!amount || amount <= 0) {
      toast({ title: 'Invalid amount', description: 'Please enter a valid amount greater than zero.', variant: 'destructive' });
      return;
    }
    if (!adjustReason.trim()) {
      toast({ title: 'Reason required', description: 'Please provide a reason for this adjustment.', variant: 'destructive' });
      return;
    }

    setAdjusting(true);
    try {
      const { data, error } = await supabase.rpc('admin_adjust_patient_wallet', {
        p_patient_id: selectedPatientId,
        p_amount: amount,
        p_direction: direction,
        p_reason: adjustReason.trim(),
      });
      if (error) throw error;

      const result = data as { balance_before: number; balance_after: number };
      toast({
        title: `Wallet ${direction === 'credit' ? 'credited' : 'debited'} successfully`,
        description: `Balance: ${formatCurrency(result.balance_before)} → ${formatCurrency(result.balance_after)}`,
      });
      setAdjustAmount('');
      setAdjustReason('');
      refetchDetail();
      queryClient.invalidateQueries({ queryKey: ['admin-patient-wallets'] });
    } catch (err: any) {
      toast({ title: 'Adjustment failed', description: err?.message || 'Please try again.', variant: 'destructive' });
    } finally {
      setAdjusting(false);
    }
  };

  if (selectedPatientId && detail) {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => setSelectedPatientId(null)}>
            <ArrowLeft className="w-4 h-4 mr-1" /> Back
          </Button>
          <div>
            <h2 className="text-lg font-semibold">{detail.full_name}</h2>
            <p className="text-sm text-muted-foreground">{detail.email}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <Card>
            <CardContent className="pt-6">
              <p className="text-sm text-muted-foreground">Available Balance</p>
              <p className="text-2xl font-bold text-primary">{formatCurrency(detail.available_balance)}</p>
            </CardContent>
          </Card>
        </div>

        {/* Adjustment Form */}
        <Card>
          <CardHeader><CardTitle className="text-base">Adjust Wallet Balance</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="adjustAmount">Amount (₦)</Label>
                <Input
                  id="adjustAmount"
                  placeholder="e.g. 5000"
                  value={adjustAmount}
                  onChange={(e) => setAdjustAmount(e.target.value.replace(/[^0-9.,]/g, ''))}
                  className="mt-1.5"
                />
              </div>
              <div>
                <Label htmlFor="adjustReason">Reason</Label>
                <Input
                  id="adjustReason"
                  placeholder="e.g. Overpayment correction"
                  value={adjustReason}
                  onChange={(e) => setAdjustReason(e.target.value)}
                  className="mt-1.5"
                />
              </div>
            </div>
            <div className="flex gap-3">
              <Button
                onClick={() => handleAdjust('credit')}
                disabled={adjusting}
                className="bg-green-600 hover:bg-green-700 text-white"
              >
                <Plus className="w-4 h-4 mr-1" /> Add Money
              </Button>
              <Button
                onClick={() => handleAdjust('debit')}
                disabled={adjusting}
                variant="destructive"
              >
                <Minus className="w-4 h-4 mr-1" /> Remove Money
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Transaction History */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Transaction History</CardTitle>
              <Button variant="ghost" size="sm" onClick={() => refetchDetail()}>
                <RefreshCw className="w-4 h-4" />
              </Button>
            </div>
          </CardHeader>
          <CardContent>
            {detail.transactions.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No transactions yet.</p>
            ) : (
              <div className="space-y-2 max-h-96 overflow-y-auto">
                {detail.transactions.map((tx) => (
                  <div key={tx.id} className="flex items-center justify-between p-3 rounded-lg border text-sm">
                    <div>
                      <p className="font-medium">{tx.narration || tx.transaction_type}</p>
                      <p className="text-xs text-muted-foreground">{formatDate(tx.created_at)}</p>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${tx.direction === 'credit' ? 'text-green-600' : 'text-destructive'}`}>
                        {tx.direction === 'credit' ? '+' : '-'}{formatCurrency(tx.amount)}
                      </p>
                      <Badge variant={tx.status === 'completed' ? 'outline' : 'secondary'} className="text-xs">
                        {tx.status}
                      </Badge>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9"
          />
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
      ) : wallets.length === 0 ? (
        <div className="text-center py-12">
          <Wallet className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No patient wallets found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {wallets.map((w) => (
            <div
              key={w.patient_id}
              className="flex items-center justify-between p-4 rounded-xl border hover:border-primary/40 cursor-pointer transition-colors"
              onClick={() => setSelectedPatientId(w.patient_id)}
            >
              <div>
                <p className="font-semibold">{w.full_name}</p>
                <p className="text-sm text-muted-foreground">{w.email}</p>
                {w.last_transaction_at && (
                  <p className="text-xs text-muted-foreground">Last activity: {formatDate(w.last_transaction_at)}</p>
                )}
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-primary">{formatCurrency(w.available_balance)}</p>
                <p className="text-xs text-muted-foreground">
                  +{formatCurrency(w.total_credited)} / -{formatCurrency(w.total_debited)}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
