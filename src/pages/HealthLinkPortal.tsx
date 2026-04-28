import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";

type DashboardMetrics = {
  successfulConsultations: number;
  newEnrollmentsThisMonth: number;
  consultationsThisWeek: number;
  weeklyConsultationTargetReached: boolean;
  previousMonthEnrollments: number;
  growthPercent: number;
  growthTargetReached: boolean;
  monthRevenue: number;
  monthRevenueTarget: number;
  revenueTargetReached: boolean;
  monthNumberSinceLaunch: number;
};

const WEEKLY_MIN_CONSULTATIONS = 15;
const GROWTH_TARGET_PERCENT = 20;
const DEFAULT_LAUNCH_DATE = "2026-04-01T00:00:00Z";

const explicitRevenueTargetsByMonthIndex: Record<number, number> = {
  1: 105000,
  2: 165000,
  3: 240000,
};

const getStartOfMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
const getStartOfNextMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
const getStartOfPreviousMonth = (date: Date) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1));
const getStartOfWeekUtc = (date: Date) => {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const day = d.getUTCDay();
  const diffToMonday = (day + 6) % 7;
  d.setUTCDate(d.getUTCDate() - diffToMonday);
  d.setUTCHours(0, 0, 0, 0);
  return d;
};

const getMonthIndexSinceLaunch = (now: Date, launchDate: Date) => {
  const yearDiff = now.getUTCFullYear() - launchDate.getUTCFullYear();
  const monthDiff = now.getUTCMonth() - launchDate.getUTCMonth();
  return Math.max(1, yearDiff * 12 + monthDiff + 1);
};

const getRevenueTargetForMonth = (monthIndex: number) => {
  if (explicitRevenueTargetsByMonthIndex[monthIndex]) {
    return explicitRevenueTargetsByMonthIndex[monthIndex];
  }
  const highestExplicitMonth = Math.max(...Object.keys(explicitRevenueTargetsByMonthIndex).map(Number));
  const highestExplicitValue = explicitRevenueTargetsByMonthIndex[highestExplicitMonth];
  const extraMonths = monthIndex - highestExplicitMonth;
  return highestExplicitValue + extraMonths * 75000;
};

const isPaidPaymentStatus = (value: string | null | undefined) => {
  const normalized = String(value || "").trim().toLowerCase();
  return ["success", "successful", "succeeded", "paid", "completed"].includes(normalized);
};

export default function HealthLinkPortal() {
  const { signOut } = useAuth();

  const now = useMemo(() => new Date(), []);
  const monthStart = useMemo(() => getStartOfMonth(now), [now]);
  const nextMonthStart = useMemo(() => getStartOfNextMonth(now), [now]);
  const previousMonthStart = useMemo(() => getStartOfPreviousMonth(now), [now]);
  const weekStart = useMemo(() => getStartOfWeekUtc(now), [now]);
  const launchDate = useMemo(() => new Date(import.meta.env.VITE_HEALTHLINK_LAUNCH_DATE || DEFAULT_LAUNCH_DATE), []);
  const monthNumberSinceLaunch = useMemo(() => getMonthIndexSinceLaunch(now, launchDate), [launchDate, now]);
  const revenueTarget = useMemo(() => getRevenueTargetForMonth(monthNumberSinceLaunch), [monthNumberSinceLaunch]);

  const metricsQuery = useQuery({
    queryKey: ["healthlink-dashboard-metrics", monthStart.toISOString(), weekStart.toISOString()],
    queryFn: async (): Promise<DashboardMetrics> => {
      const [
        appointmentsResult,
        weeklyConsultationsResult,
        enrollmentsCurrentResult,
        enrollmentsPreviousResult,
        paymentsResult,
      ] = await Promise.all([
        supabase
          .from("appointments")
          .select("id, status", { count: "exact", head: false })
          .eq("status", "completed"),
        supabase
          .from("appointments")
          .select("id", { count: "exact", head: false })
          .eq("status", "completed")
          .gte("created_at", weekStart.toISOString()),
        supabase
          .from("patient_registrations")
          .select("id", { count: "exact", head: false })
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", nextMonthStart.toISOString()),
        supabase
          .from("patient_registrations")
          .select("id", { count: "exact", head: false })
          .gte("created_at", previousMonthStart.toISOString())
          .lt("created_at", monthStart.toISOString()),
        supabase
          .from("payments")
          .select("amount, status, verified_at, created_at")
          .gte("created_at", monthStart.toISOString())
          .lt("created_at", nextMonthStart.toISOString()),
      ]);

      if (appointmentsResult.error) throw appointmentsResult.error;
      if (weeklyConsultationsResult.error) throw weeklyConsultationsResult.error;
      if (enrollmentsCurrentResult.error) throw enrollmentsCurrentResult.error;
      if (enrollmentsPreviousResult.error) throw enrollmentsPreviousResult.error;
      if (paymentsResult.error) throw paymentsResult.error;

      const successfulConsultations = appointmentsResult.count ?? 0;
      const consultationsThisWeek = weeklyConsultationsResult.count ?? 0;
      const newEnrollmentsThisMonth = enrollmentsCurrentResult.count ?? 0;
      const previousMonthEnrollments = enrollmentsPreviousResult.count ?? 0;

      const growthPercent = previousMonthEnrollments > 0
        ? ((newEnrollmentsThisMonth - previousMonthEnrollments) / previousMonthEnrollments) * 100
        : (newEnrollmentsThisMonth > 0 ? 100 : 0);

      const monthRevenue = (paymentsResult.data || []).reduce((sum, payment) => {
        if (isPaidPaymentStatus(payment.status) || payment.verified_at) {
          return sum + Number(payment.amount || 0);
        }
        return sum;
      }, 0);

      return {
        successfulConsultations,
        newEnrollmentsThisMonth,
        consultationsThisWeek,
        weeklyConsultationTargetReached: consultationsThisWeek >= WEEKLY_MIN_CONSULTATIONS,
        previousMonthEnrollments,
        growthPercent,
        growthTargetReached: growthPercent >= GROWTH_TARGET_PERCENT,
        monthRevenue,
        monthRevenueTarget: revenueTarget,
        revenueTargetReached: monthRevenue >= revenueTarget,
        monthNumberSinceLaunch,
      };
    },
    refetchInterval: 60000,
  });

  const m = metricsQuery.data;

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="mb-6 flex items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold tracking-tight">HealthLink Performance Portal</h1>
            <p className="text-muted-foreground">
              Dedicated operations dashboard for the MyEdoctor program.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Button variant="outline" onClick={() => metricsQuery.refetch()} disabled={metricsQuery.isFetching}>
              {metricsQuery.isFetching ? "Refreshing..." : "Refresh"}
            </Button>
            <Button variant="destructive" onClick={() => signOut()}>
              Sign out
            </Button>
          </div>
        </div>

        {metricsQuery.isLoading && (
          <Card>
            <CardContent className="pt-6 text-muted-foreground">Loading HealthLink metrics...</CardContent>
          </Card>
        )}

        {metricsQuery.error && (
          <Card className="border-destructive/30">
            <CardHeader>
              <CardTitle className="text-destructive">Unable to load dashboard metrics</CardTitle>
              <CardDescription>
                Please check connectivity and permissions, then refresh.
              </CardDescription>
            </CardHeader>
          </Card>
        )}

        {m && (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            <Card>
              <CardHeader>
                <CardTitle>Successful Consultations</CardTitle>
                <CardDescription>Total consultations with completed status.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{m.successfulConsultations}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>New Enrollments</CardTitle>
                <CardDescription>Patient registrations this month.</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-4xl font-bold">{m.newEnrollmentsThisMonth}</p>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Weekly Consultation Minimum</CardTitle>
                <CardDescription>Target: at least {WEEKLY_MIN_CONSULTATIONS} per week.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-3xl font-bold">{m.consultationsThisWeek}</p>
                <Badge variant={m.weeklyConsultationTargetReached ? "default" : "destructive"}>
                  {m.weeklyConsultationTargetReached ? "Reached" : "Not reached"}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Patient Growth Target</CardTitle>
                <CardDescription>Target: {GROWTH_TARGET_PERCENT}% month-on-month growth.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-3xl font-bold">{m.growthPercent.toFixed(1)}%</p>
                <p className="text-sm text-muted-foreground">
                  Previous month: {m.previousMonthEnrollments} | Current month: {m.newEnrollmentsThisMonth}
                </p>
                <Badge variant={m.growthTargetReached ? "default" : "destructive"}>
                  {m.growthTargetReached ? "Reached" : "Not reached"}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Target (Month {m.monthNumberSinceLaunch})</CardTitle>
                <CardDescription>
                  Target: ₦{m.monthRevenueTarget.toLocaleString()} | Actual: ₦{m.monthRevenue.toLocaleString()}
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-2">
                <p className="text-3xl font-bold">₦{m.monthRevenue.toLocaleString()}</p>
                <Badge variant={m.revenueTargetReached ? "default" : "destructive"}>
                  {m.revenueTargetReached ? "Reached" : "Not reached"}
                </Badge>
              </CardContent>
            </Card>

            <Card>
              <CardHeader>
                <CardTitle>Revenue Plan Reference</CardTitle>
                <CardDescription>Configured milestones for first three months.</CardDescription>
              </CardHeader>
              <CardContent className="space-y-1 text-sm">
                <p>Month 1: ₦105,000</p>
                <p>Month 2: ₦165,000</p>
                <p>Month 3: ₦240,000</p>
              </CardContent>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
