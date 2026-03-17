import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "@/hooks/useAuth";
import AppLayout from "@/components/AppLayout";
import ClientPage from "@/pages/ClientPage";
import IngredientsPage from "@/pages/IngredientsPage";
import NutritionPage from "@/pages/NutritionPage";
import TrainingPage from "@/pages/TrainingPage";
import ProgressPage from "@/pages/ProgressPage";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <AuthProvider>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <Routes>
            <Route element={<AppLayout />}>
              {/* Default route redirects to client page */}
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
