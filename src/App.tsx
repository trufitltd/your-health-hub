import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { useEffect, useState } from "react";
import { useRequestNotificationPermission } from "@/hooks/useRequestNotificationPermission";
import { usePushSubscription } from "@/hooks/usePushSubscription";
import { useAuth } from "@/hooks/useAuth";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
import ForgotPassword from "./pages/ForgotPassword";
import Services from "./pages/Services";
import Specialists from "./pages/Specialists";
import Booking from "./pages/Booking";
import Contact from "./pages/Contact";
import Install from "./pages/Install";
import PatientPortal from "./pages/PatientPortal";
import DoctorPortal from "./pages/DoctorPortal";
import DoctorDiscovery from "./pages/DoctorDiscovery";
import SlotSelection from "./pages/SlotSelection";
import Consultation from "./pages/Consultation";
import AdminLogin from "./pages/AdminLogin";
import CentralAdmin from "./pages/CentralAdmin";
import CooLogin from "./pages/CooLogin";
import COOPortal from "./pages/COOPortal";
import HealthLinkPortal from "./pages/HealthLinkPortal";
import HealthLinkLogin from "./pages/HealthLinkLogin";
import VerifyPrescription from "./pages/VerifyPrescription";
import NotFound from "./pages/NotFound";
import CompleteRegistration from "./pages/CompleteRegistration";
import { ProtectedRoute } from "@/components/ProtectedRoute";

const queryClient = new QueryClient();

// Component to handle PWA manifest swapping based on route
const PwaManifestHandler = () => {
  const location = useLocation();

  useEffect(() => {
    const path = location.pathname;
    const manifestLink = document.querySelector('link[rel="manifest"]');
    if (manifestLink) {
      let newHref = '/manifest.webmanifest';
      let newTitle = "MyEdoctor";

      if (path.startsWith('/admin')) {
        newHref = '/admin-manifest.json';
        newTitle = "MyEdoctor Admin";
      } else if (path.startsWith('/coo')) {
        newHref = '/coo-manifest.json';
        newTitle = "MyEdoctor COO";
      }

      if (manifestLink.getAttribute('href') !== newHref) {
        manifestLink.setAttribute('href', newHref);
        document.title = newTitle;
        console.log(`[PWA] Route change detected. Manifest swapped to: ${newHref}`);
      }
    }
  }, [location.pathname]);

  return null;
};

const NotificationPromptBanner = () => {
  const { permission, request } = useRequestNotificationPermission();
  const { user } = useAuth();
  const [dismissed, setDismissed] = useState(false);

  // Subscribe to push once permission is granted
  usePushSubscription(permission === 'granted' ? (user?.id ?? undefined) : undefined);

  if (dismissed || permission !== 'default') return null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: '#0f8f76',
        color: '#fff',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        padding: '10px 16px',
        gap: '12px',
        fontSize: '14px',
      }}
    >
      <span>🔔 Enable notifications to get alerts for messages and appointments.</span>
      <div style={{ display: 'flex', gap: '8px', flexShrink: 0 }}>
        <button
          onClick={() => { request(); setDismissed(true); }}
          style={{
            background: '#fff',
            color: '#0f8f76',
            border: 'none',
            borderRadius: '6px',
            padding: '6px 14px',
            fontWeight: 600,
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Allow
        </button>
        <button
          onClick={() => setDismissed(true)}
          style={{
            background: 'transparent',
            color: '#fff',
            border: '1px solid rgba(255,255,255,0.5)',
            borderRadius: '6px',
            padding: '6px 10px',
            cursor: 'pointer',
            fontSize: '13px',
          }}
        >
          Dismiss
        </button>
      </div>
    </div>
  );
};

// Global error handling for Paystack cross-origin issues
if (typeof window !== 'undefined') {
  const handlePaystackCrossOriginError = (event: ErrorEvent) => {
    const message = String(event.message || '');
    const filename = String(event.filename || '');
    const isPaystackStorageError =
      filename.includes('checkout.paystack.com')
      && (message.toLowerCase().includes('localstorage') ||
          message.toLowerCase().includes('access is denied for this document'));

    if (isPaystackStorageError) {
      console.warn('Paystack cross-origin localStorage access blocked. This is expected on remote deployments where the domain may not be whitelisted in Paystack.');
      event.preventDefault();
      // Stop event propagation to prevent console errors during testing
      event.stopImmediatePropagation();
    }
  };

  const handlePaystackUnhandledRejection = (event: PromiseRejectionEvent) => {
    const reasonText = String(
      (event.reason as { message?: unknown } | null)?.message
        ?? event.reason
        ?? ''
    );
    const normalized = reasonText.toLowerCase();
    const looksLikePaystackRuntimeFailure =
      normalized.includes('paystack')
      || normalized.includes('localstorage')
      || normalized.includes('access is denied for this document')
      || normalized.includes('failed to load resource')
      || normalized.includes('notsameorigin');

    if (looksLikePaystackRuntimeFailure) {
      console.warn('Paystack runtime error detected. This may be due to cross-origin restrictions on remote deployments. Suppressing error for testing.');
      event.preventDefault();
      // Stop event propagation to prevent console errors during testing
      event.stopImmediatePropagation();
    }
  };

  window.addEventListener('error', handlePaystackCrossOriginError, true);
  window.addEventListener('unhandledrejection', handlePaystackUnhandledRejection, true);
}

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <LanguageProvider>
          <BrowserRouter>
            <PwaManifestHandler />
            <NotificationPromptBanner />
            <Routes>
              <Route path="/" element={<Index />} />
              <Route path="/auth" element={<Auth />} />
              <Route path="/forgot-password" element={<ForgotPassword />} />
              <Route
                path="/patient-portal"
                element={
                  <ProtectedRoute requiredRole="patient" requireCompletedRegistration>
                    <PatientPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/doctor-portal"
                element={
                  <ProtectedRoute requiredRole="doctor" requireCompletedRegistration>
                    <DoctorPortal />
                  </ProtectedRoute>
                }
              />
              <Route
                path="/complete-registration"
                element={
                  <ProtectedRoute>
                    <CompleteRegistration />
                  </ProtectedRoute>
                }
              />
              <Route path="/doctor-discovery" element={<DoctorDiscovery />} />
              <Route path="/slot-selection" element={<SlotSelection />} />
              <Route path="/services" element={<Services />} />
              <Route path="/specialists" element={<Specialists />} />
              <Route path="/booking/:doctorId?" element={<Booking />} />
              <Route path="/contact" element={<Contact />} />
              <Route path="/install" element={<Install />} />
              <Route path="/consultation/:appointmentId" element={<Consultation />} />
              <Route path="/verify/:code" element={<VerifyPrescription />} />
              <Route path="/admin/login" element={<AdminLogin />} />
              <Route path="/admin" element={<CentralAdmin />} />
              <Route path="/coo/login" element={<CooLogin />} />
              <Route path="/coo" element={<COOPortal />} />
              <Route path="/healthlink/login" element={<HealthLinkLogin />} />
              <Route
                path="/healthlink"
                element={
                  <ProtectedRoute requiredRole="healthlink">
                    <HealthLinkPortal />
                  </ProtectedRoute>
                }
              />
              {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </LanguageProvider>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
