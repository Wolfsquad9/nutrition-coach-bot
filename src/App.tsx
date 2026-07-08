import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import ErrorBoundary from "@/components/ErrorBoundary";
import AppLayout from "@/components/AppLayout";
import ClientLayout from "@/layouts/ClientLayout";
import ClientPage from "@/pages/ClientPage";
import IngredientsPage from "@/pages/IngredientsPage";
import NutritionPage from "@/pages/NutritionPage";
import TrainingPage from "@/pages/TrainingPage";
import ProgressPage from "@/pages/ProgressPage";
import CheckinPage from "@/pages/CheckinPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import NotFound from "./pages/NotFound";
import PlanViewerPage from "./pages/PlanViewerPage";
import ClientMyPlanPage from "./pages/ClientMyPlanPage";
import ClientProgressPage from "./pages/ClientProgressPage";
import ClientAlertsPage from "./pages/ClientAlertsPage";
import ClientCheckinPage from "./pages/ClientCheckinPage";
import ClientMessagesPage from "./pages/ClientMessagesPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <ErrorBoundary section="App">
      <AuthProvider>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <Routes>
              {/* Public routes */}
              <Route path="/login" element={<LoginPage />} />
              <Route path="/signup" element={<SignupPage />} />
              <Route path="/plan/:shareId" element={<PlanViewerPage />} />

              {/* Coach-facing protected routes — coach only */}
              <Route element={<ProtectedRoute role="coach"><AppLayout /></ProtectedRoute>}>
                <Route index element={<ClientPage />} />
                <Route path="clients/:clientId" element={<ClientPage />} />
                <Route path="clients/:clientId/ingredients" element={<IngredientsPage />} />
                <Route path="clients/:clientId/checkin" element={<CheckinPage />} />
                <Route path="clients/:clientId/nutrition" element={<NutritionPage />} />
                <Route path="clients/:clientId/training" element={<TrainingPage />} />
                <Route path="clients/:clientId/progress" element={<ProgressPage />} />
              </Route>

              {/* Client-facing protected routes — client only */}
              <Route element={<ProtectedRoute role="client"><ClientLayout /></ProtectedRoute>}>
                <Route path="my-plan" element={<ClientMyPlanPage />} />
                <Route path="checkin" element={<ClientCheckinPage />} />
                <Route path="progress" element={<ClientProgressPage />} />
                <Route path="alerts" element={<ClientAlertsPage />} />
                <Route path="messages" element={<ClientMessagesPage />} />
              </Route>

              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </AuthProvider>
    </ErrorBoundary>
  </QueryClientProvider>
);

export default App;