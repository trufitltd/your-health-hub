import { useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "@/components/ui/use-toast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const defaultValues = {
  gender: "male",
  age: "30",
  city: "Lagos",
  state: "Lagos",
  country: "Nigeria",
  maritalStatus: "single",
  emergencyContactName: "Emergency Contact",
  emergencyContactPhone: "+2348111111111",
  identificationType: "nin",
  identificationNumber: "",
};

export default function AdminTestPatient() {
  const { user, isLoading } = useAuth();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [formValues, setFormValues] = useState(defaultValues);

  const adminEmails = useMemo(() => {
    const raw = import.meta.env.VITE_ADMIN_EMAILS as string | undefined;
    return raw ? raw.split(",").map((value) => value.trim().toLowerCase()) : [];
  }, []);

  const adminEmail = (user?.email || user?.user_metadata?.email || '').toLowerCase();
  const isAdmin = !!adminEmail && adminEmails.includes(adminEmail);

  if (isLoading) {
    return <div className="p-6">Loading...</div>;
  }

  if (!user) {
    return <div className="p-6">Please sign in to continue.</div>;
  }

  if (!isAdmin) {
    return (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Admin Access Required</h1>
        <p className="text-sm text-muted-foreground">
          Your account is not in `VITE_ADMIN_EMAILS`.
        </p>
      </div>
    );
  }

  const handleChange = (key: keyof typeof defaultValues, value: string) => {
    setFormValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);

    try {
      const { data: sessionData } = await supabase.auth.getSession();
      console.log("session_json:", JSON.stringify(sessionData?.session ?? null));
      console.log("user_json:", JSON.stringify(sessionData?.session?.user ?? null));
      console.log(
        "user_metadata_json:",
        JSON.stringify(sessionData?.session?.user?.user_metadata ?? null),
      );
      const accessToken = sessionData?.session?.access_token;
      if (!accessToken) {
        throw new Error("No active session. Please sign in again.");
      }

      const payload = {
        accessToken,
        phone,
        password,
        name,
        email: email || null,
        gender: formValues.gender,
        age: Number.parseInt(formValues.age || "30", 10),
        city: formValues.city,
        state: formValues.state,
        country: formValues.country,
        maritalStatus: formValues.maritalStatus,
        emergencyContactName: formValues.emergencyContactName,
        emergencyContactPhone: formValues.emergencyContactPhone,
        identificationType: formValues.identificationType,
        identificationNumber: formValues.identificationNumber || undefined,
      };

      console.log("Invoking create-test-patient with token length:", accessToken.length);
      const functionUrl = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/create-test-patient`;
      const response = await fetch(functionUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });

      const rawText = await response.text();
      console.log("Edge function raw response:", rawText);
      const parsed = rawText ? (JSON.parse(rawText) as Record<string, unknown>) : null;

      if (!response.ok) {
        console.error("Edge function response data:", parsed);
        throw new Error((parsed?.error as string | undefined) || "Failed to create patient");
      }

      if (!parsed?.success) {
        console.error("Edge function response data:", parsed);
        throw new Error((parsed?.error as string | undefined) || "Failed to create patient");
      }

      toast({
        title: "Patient created",
        description: `User ID: ${parsed.userId as string}`,
      });

      setPhone("");
      setPassword("");
      setName("");
      setEmail("");
      setFormValues(defaultValues);
    } catch (err: unknown) {
      const message =
        err && typeof err === "object" && "message" in err
          ? (err as { message?: string }).message
          : "Failed to create patient";
      toast({ title: "Error", description: message });
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="max-w-2xl mx-auto p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-semibold">Create Test Patient</h1>
          <p className="text-sm text-muted-foreground">
            This uses `supabase.auth.admin.createUser` via an Edge Function.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="grid grid-cols-1 gap-4">
            <div>
              <Label htmlFor="name">Full Name</Label>
              <Input
                id="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="Test Patient"
                required
              />
            </div>
            <div>
              <Label htmlFor="phone">Phone</Label>
              <Input
                id="phone"
                value={phone}
                onChange={(event) => setPhone(event.target.value)}
                placeholder="+2348106733459"
                required
              />
            </div>
            <div>
              <Label htmlFor="password">Password</Label>
              <Input
                id="password"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                placeholder="password123"
                required
              />
            </div>
            <div>
              <Label htmlFor="email">Email (optional)</Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                placeholder="testpatient@example.com"
              />
            </div>
          </div>

          <div className="pt-4 border-t border-border space-y-4">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="gender">Gender</Label>
                <Input
                  id="gender"
                  value={formValues.gender}
                  onChange={(event) => handleChange("gender", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="age">Age</Label>
                <Input
                  id="age"
                  type="number"
                  value={formValues.age}
                  onChange={(event) => handleChange("age", event.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="city">City</Label>
                <Input
                  id="city"
                  value={formValues.city}
                  onChange={(event) => handleChange("city", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="state">State</Label>
                <Input
                  id="state"
                  value={formValues.state}
                  onChange={(event) => handleChange("state", event.target.value)}
                />
              </div>
            </div>

            <div>
              <Label htmlFor="country">Country</Label>
              <Input
                id="country"
                value={formValues.country}
                onChange={(event) => handleChange("country", event.target.value)}
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="maritalStatus">Marital Status</Label>
                <Input
                  id="maritalStatus"
                  value={formValues.maritalStatus}
                  onChange={(event) => handleChange("maritalStatus", event.target.value)}
                />
              </div>
              <div>
                <Label htmlFor="emergencyContactName">Emergency Contact Name</Label>
                <Input
                  id="emergencyContactName"
                  value={formValues.emergencyContactName}
                  onChange={(event) =>
                    handleChange("emergencyContactName", event.target.value)
                  }
                />
              </div>
            </div>

            <div>
              <Label htmlFor="emergencyContactPhone">Emergency Contact Phone</Label>
              <Input
                id="emergencyContactPhone"
                value={formValues.emergencyContactPhone}
                onChange={(event) =>
                  handleChange("emergencyContactPhone", event.target.value)
                }
              />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="identificationType">Identification Type</Label>
                <Input
                  id="identificationType"
                  value={formValues.identificationType}
                  onChange={(event) =>
                    handleChange("identificationType", event.target.value)
                  }
                />
              </div>
              <div>
                <Label htmlFor="identificationNumber">Identification Number</Label>
                <Input
                  id="identificationNumber"
                  value={formValues.identificationNumber}
                  onChange={(event) =>
                    handleChange("identificationNumber", event.target.value)
                  }
                  placeholder="Optional"
                />
              </div>
            </div>
          </div>

          <Button type="submit" disabled={isSubmitting}>
            {isSubmitting ? "Creating..." : "Create Test Patient"}
          </Button>
        </form>
      </div>
    </div>
  );
}
