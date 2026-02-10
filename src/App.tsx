import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/contexts/AuthContext";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import Index from "./pages/Index";
import Auth from "./pages/Auth";
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
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Toaster />
      <Sonner />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Index />} />
            <Route path="/auth" element={<Auth />} />
            <Route path="/patient-portal" element={<ProtectedRoute><PatientPortal /></ProtectedRoute>} />
            <Route path="/doctor-portal" element={<ProtectedRoute><DoctorPortal /></ProtectedRoute>} />
            <Route path="/doctor-discovery" element={<ProtectedRoute><DoctorDiscovery /></ProtectedRoute>} />
            <Route path="/slot-selection" element={<ProtectedRoute><SlotSelection /></ProtectedRoute>} />
            <Route path="/services" element={<Services />} />
            <Route path="/specialists" element={<Specialists />} />
            <Route path="/booking" element={<Booking />} />
            <Route path="/contact" element={<Contact />} />
            <Route path="/install" element={<Install />} />
            <Route path="/consultation/:appointmentId" element={<ProtectedRoute><Consultation /></ProtectedRoute>} />
            <Route path="/admin/login" element={<AdminLogin />} />
            <Route path="/admin" element={<ProtectedRoute><CentralAdmin /></ProtectedRoute>} />
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
