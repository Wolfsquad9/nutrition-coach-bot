import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import ProtectedRoute from "@/components/ProtectedRoute";
import AppLayout from "@/components/AppLayout";
import ClientPage from "@/pages/ClientPage";
import IngredientsPage from "@/pages/IngredientsPage";
import NutritionPage from "@/pages/NutritionPage";
import TrainingPage from "@/pages/TrainingPage";
import ProgressPage from "@/pages/ProgressPage";
import LoginPage from "@/pages/LoginPage";
import SignupPage from "@/pages/SignupPage";
import NotFound from "./pages/NotFound";
import PlanViewerPage from "./pages/PlanViewerPage";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
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

            {/* Protected routes */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route index element={<ClientPage />} />
              <Route path="clients/:clientId" element={<ClientPage />} />
              <Route path="clients/:clientId/ingredients" element={<IngredientsPage />} />
              <Route path="clients/:clientId/nutrition" element={<NutritionPage />} />
              <Route path="clients/:clientId/training" element={<TrainingPage />} />
              <Route path="clients/:clientId/progress" element={<ProgressPage />} />
            </Route>

            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </AuthProvider>
  </QueryClientProvider>
);

export default App;
