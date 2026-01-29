import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateNutritionMetrics } from '@/utils/calculations';
import { Client, CompletePlan, Recipe } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/hooks/useAuth';
import { generatePersonalizedPlan } from '@/services/planService';
import { generateFullDayMealPlan, generateWeeklyMealPlan, type FullDayMealPlanResult, type WeeklyMealPlanResult } from '@/services/recipeService';
import { generateCompletePlanPDF, downloadPDF, exportPlanAsJSON, downloadJSON } from '@/utils/pdfExport';
import { Download, FileJson, FileText, Loader2, AlertCircle, TrendingUp, Video, Bell, CalendarDays, Calendar, Save, Plus, CheckCircle } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProgressTracker } from '@/components/ProgressTracker';
import { MealSwapper } from '@/components/MealSwapper';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { NotificationCenter } from '@/components/NotificationCenter';
import EnhancedIngredientManager from '@/components/EnhancedIngredientManager';
import { DailyMealPlanDisplay } from '@/components/DailyMealPlanDisplay';
import { WeeklyMealPlanDisplay } from '@/components/WeeklyMealPlanDisplay';
import { DataSourceIndicator, PlanLockIndicator, EmptyState } from '@/components/DataSourceIndicator';
import { useSupabaseClients } from '@/hooks/useSupabaseClients';
import { useNutritionPlan } from '@/hooks/useNutritionPlan';
import { ClientSelector } from '@/components/ClientSelector';
import { NoClientGuard } from '@/components/NoClientGuard';
import { getClientLabel, calculateAgeFromBirthDate } from '@/utils/clientHelpers';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

const Index = () => {
  // Auth context - userId is required for all DB writes
  const { userId, isLoading: isAuthLoading, isAuthenticated } = useAuth();

  // Supabase client management - activeClientId is the single source of truth
  const {
    clients,
    activeClientId,
    activeClient,
    isLoading: isLoadingClients,
    error: clientError,
    setActiveClientId,
    handleCreateClient,
    refreshClients,
    createNewClientDraft,
  } = useSupabaseClients();

  // Local draft for new client creation
  const [draftClient, setDraftClient] = useState<Client | null>(null);
  
  // The client being edited (either activeClient from DB or draftClient for new)
  const editingClient = draftClient || activeClient;

  // Supabase plan management
  const {
    currentPlan,
    lockStatus,
    isPersisted: isPlanPersisted,
    isLoading: isLoadingPlan,
    isSaving: isSavingPlan,
    savePlan,
    loadPlan,
    clearPlan,
  } = useNutritionPlan();

  const [generatedPlan, setGeneratedPlan] = useState<CompletePlan | null>(null);
  const [dailyMealPlan, setDailyMealPlan] = useState<FullDayMealPlanResult | null>(null);
  const [weeklyMealPlan, setWeeklyMealPlan] = useState<WeeklyMealPlanResult | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingDailyPlan, setIsGeneratingDailyPlan] = useState(false);
  const [isGeneratingWeeklyPlan, setIsGeneratingWeeklyPlan] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientRestrictions, setClientRestrictions] = useState<ClientIngredientRestrictions[]>([]);
  const { toast } = useToast();

  // Load plan when activeClientId changes
  useEffect(() => {
    if (activeClientId) {
      loadPlan(activeClientId);
      // Clear local plan state when switching clients
      setWeeklyMealPlan(null);
      setDailyMealPlan(null);
      setGeneratedPlan(null);
    } else {
      clearPlan();
      setWeeklyMealPlan(null);
      setDailyMealPlan(null);
      setGeneratedPlan(null);
    }
  }, [activeClientId, loadPlan, clearPlan]);

  // Restore weekly plan from persisted data
  useEffect(() => {
    if (currentPlan?.weeklyPlan) {
      setWeeklyMealPlan(currentPlan.weeklyPlan);
    }
  }, [currentPlan]);

  // Get liked foods from the current client's restrictions
  const getLikedFoods = (): string[] => {
    const clientId = activeClientId;
    if (!clientId) return [];
    const restriction = clientRestrictions.find(r => r.clientId === clientId);
    return restriction?.preferredIngredients || [];
  };

  const handleInputChange = (field: keyof Client, value: any) => {
    if (draftClient) {
      setDraftClient({ ...draftClient, [field]: value });
    }
    // Note: We don't modify activeClient directly - that would require an update operation
  };

  const handleStartNewClient = () => {
    setDraftClient(createNewClientDraft());
  };

  const handleCancelNewClient = () => {
    setDraftClient(null);
  };

  const handleSaveClient = async () => {
    if (!draftClient) return;
    
    const result = await handleCreateClient(draftClient);
    if (result.success && result.client) {
      setDraftClient(null); // Clear draft after successful save
      // activeClientId is automatically set by handleCreateClient
      toast({
        title: "Client sauvegardé",
        description: "Le client a été enregistré dans Supabase.",
      });
    } else {
      toast({
        title: "Erreur",
        description: result.error || "Impossible de sauvegarder le client",
        variant: "destructive",
      });
    }
  };

  const handleClientChange = (clientId: string) => {
    setDraftClient(null); // Clear any draft when switching clients
    setActiveClientId(clientId);
  };

  const handleGeneratePlan = async () => {
    if (!activeClientId || !activeClient) {
      toast({
        title: "Aucun client sélectionné",
        description: "Sélectionnez ou créez un client d'abord.",
        variant: "destructive",
      });
      return;
    }

    setIsGenerating(true);
    setError(null);
    
    try {
      const likedFoods = getLikedFoods();
      
      // Warn if not enough liked foods selected
      if (likedFoods.length < 5) {
        toast({
          title: "Conseil",
          description: "Sélectionnez au moins 5 aliments aimés dans l'onglet Ingrédients pour un plan repas personnalisé.",
        });
      }
      
      const plan = await generatePersonalizedPlan(activeClient, likedFoods);
      setGeneratedPlan(plan);
      
      toast({
        title: "Plan généré avec succès !",
        description: `Plan personnalisé basé sur vos données: ${plan.nutritionPlan.metrics.targetCalories} kcal/jour`,
      });
    } catch (error: any) {
      console.error('Error generating plan:', error);
      
      const errorMessage = error.message || "Impossible de générer le plan, réessayez plus tard";
      setError(errorMessage);
      
      toast({
        title: "Erreur lors de la génération",
        description: errorMessage,
        variant: "destructive",
      });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!generatedPlan || !activeClient) return;
    const clientLabel = getClientLabel(activeClient);
    const pdf = generateCompletePlanPDF(generatedPlan);
    downloadPDF(pdf, `${clientLabel.replace(/\s+/g, '-')}-plan.pdf`);
    toast({
      title: "PDF Downloaded",
      description: "The complete plan has been downloaded as PDF.",
    });
  };

  const handleDownloadJSON = () => {
    if (!generatedPlan || !activeClient) return;
    const clientLabel = getClientLabel(activeClient);
    const json = exportPlanAsJSON(generatedPlan);
    downloadJSON(json, `${clientLabel.replace(/\s+/g, '-')}-plan.json`);
    toast({
      title: "JSON Downloaded",
      description: "The complete plan has been downloaded as JSON.",
    });
  };

  const handleMealSwap = (dayNumber: number, mealIndex: number, newRecipe: Recipe) => {
    if (!generatedPlan) return;
    
    const updatedPlan = { ...generatedPlan };
    const dayPlan = updatedPlan.nutritionPlan.weeklyMealPlan.find(d => d.day === dayNumber);
    if (dayPlan && dayPlan.meals[mealIndex]) {
      dayPlan.meals[mealIndex].recipes = [{
        recipe: newRecipe,
        servings: 1,
        adjustedMacros: newRecipe.macrosPerServing
      }];
      dayPlan.meals[mealIndex].totalMacros = newRecipe.macrosPerServing;
    }
    
    setGeneratedPlan(updatedPlan);
  };

  const handleGenerateDailyMealPlan = () => {
    if (!activeClientId || !activeClient) {
      toast({
        title: "Aucun client sélectionné",
        description: "Sélectionnez ou créez un client d'abord.",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingDailyPlan(true);
    setError(null);

    try {
      const likedFoods = getLikedFoods();

      if (likedFoods.length < 3) {
        toast({
          title: "Ingrédients insuffisants",
          description: "Sélectionnez au moins 3 ingrédients aimés dans l'onglet Ingrédients.",
          variant: "destructive",
        });
        setIsGeneratingDailyPlan(false);
        return;
      }

      // Calculate macro targets based on client data
      const metrics = calculateNutritionMetrics(activeClient);
      const macroTargets = {
        calories: metrics.targetCalories,
        protein: metrics.proteinGrams,
        carbs: metrics.carbsGrams,
        fat: metrics.fatGrams,
      };

      const result = generateFullDayMealPlan(likedFoods, macroTargets);
      setDailyMealPlan(result);
      setWeeklyMealPlan(null);

      toast({
        title: "Plan repas généré !",
        description: `Plan journalier complet: ${result.totalMacros.calories} kcal`,
      });
    } catch (err: any) {
      console.error('Error generating daily meal plan:', err);
      setError(err.message || "Erreur lors de la génération du plan repas");
      toast({
        title: "Erreur",
        description: err.message || "Impossible de générer le plan repas",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingDailyPlan(false);
    }
  };

  const handleGenerateWeeklyMealPlan = async () => {
    if (!activeClientId || !activeClient) {
      toast({
        title: "Aucun client sélectionné",
        description: "Sélectionnez ou créez un client d'abord.",
        variant: "destructive",
      });
      return;
    }

    // Check if plan is locked
    if (lockStatus.isLocked) {
      toast({
        title: "Plan verrouillé",
        description: `Le plan actuel est verrouillé pour ${lockStatus.daysRemaining} jour(s). Utilisez les suggestions pour demander des modifications.`,
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingWeeklyPlan(true);
    setError(null);

    try {
      const likedFoods = getLikedFoods();

      if (likedFoods.length < 5) {
        toast({
          title: "Ingrédients insuffisants",
          description: "Sélectionnez au moins 5 ingrédients aimés pour un plan hebdomadaire varié.",
          variant: "destructive",
        });
        setIsGeneratingWeeklyPlan(false);
        return;
      }

      const metrics = calculateNutritionMetrics(activeClient);
      const macroTargets = {
        calories: metrics.targetCalories,
        protein: metrics.proteinGrams,
        carbs: metrics.carbsGrams,
        fat: metrics.fatGrams,
      };

      const result = generateWeeklyMealPlan(likedFoods, macroTargets);
      setWeeklyMealPlan(result);
      setDailyMealPlan(null);

      // Auto-save to Supabase
      const saveResult = await savePlan(
        activeClientId,
        result,
        macroTargets,
        likedFoods
      );
      if (saveResult.success) {
        toast({
          title: "Plan sauvegardé !",
          description: `Plan hebdomadaire persisté dans Supabase`,
        });
      } else {
        toast({
          title: "Plan généré",
          description: `Plan créé mais erreur de sauvegarde: ${saveResult.error}`,
          variant: "destructive",
        });
      }
    } catch (err: any) {
      console.error('Error generating weekly meal plan:', err);
      setError(err.message || "Erreur lors de la génération du plan hebdomadaire");
      toast({
        title: "Erreur",
        description: err.message || "Impossible de générer le plan hebdomadaire",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingWeeklyPlan(false);
    }
  };

  // Check if we can perform operations that require a client
  const hasActiveClient = !!activeClientId && !!activeClient;
  const isCreatingNewClient = !!draftClient;

  // Show loading while auth is initializing
  if (isAuthLoading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-background to-card-hover flex items-center justify-center">
        <Card className="p-8 shadow-card">
          <div className="flex flex-col items-center gap-4">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
            <p className="text-muted-foreground">Initialisation de l'authentification...</p>
          </div>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-background to-card-hover">
      <header className="bg-gradient-hero text-white py-6 px-4 shadow-xl">
        <div className="container mx-auto">
          <h1 className="text-4xl font-bold">FitPlan Pro</h1>
          <p className="text-white/90 mt-2">Professional Nutrition & Training Planning System</p>
        </div>
      </header>

      <main className="container mx-auto p-6">
        <Tabs defaultValue="client" className="space-y-6">
          <TabsList className="grid w-full grid-cols-7 bg-card shadow-card">
            <TabsTrigger value="client">Client</TabsTrigger>
            <TabsTrigger value="ingredients">Ingrédients</TabsTrigger>
            <TabsTrigger value="nutrition">Nutrition</TabsTrigger>
            <TabsTrigger value="training">Training</TabsTrigger>
            <TabsTrigger value="progress" className="flex items-center gap-1">
              <TrendingUp className="w-4 h-4" />
              Progress
            </TabsTrigger>
            <TabsTrigger value="videos" className="flex items-center gap-1">
              <Video className="w-4 h-4" />
              Videos
            </TabsTrigger>
            <TabsTrigger value="notifications" className="flex items-center gap-1">
              <Bell className="w-4 h-4" />
              Alerts
            </TabsTrigger>
          </TabsList>

          {/* ===== INGREDIENTS TAB ===== */}
          <TabsContent value="ingredients" className="space-y-4">
            {!hasActiveClient && !isCreatingNewClient ? (
              <NoClientGuard message="Sélectionnez ou créez un client dans l'onglet Client pour gérer ses ingrédients." />
            ) : (
              <EnhancedIngredientManager 
                activeClientId={activeClientId}
                activeClient={activeClient}
                onRestrictionsUpdate={setClientRestrictions}
              />
            )}
          </TabsContent>

          {/* ===== CLIENT TAB ===== */}
          <TabsContent value="client" className="space-y-4">
            {/* Error display */}
            {clientError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  Erreur Supabase: {clientError}
                </AlertDescription>
              </Alert>
            )}

            {/* Loading state */}
            {isLoadingClients ? (
              <Card className="p-6 shadow-card flex items-center justify-center">
                <Loader2 className="h-8 w-8 animate-spin text-primary" />
                <span className="ml-2">Chargement des clients...</span>
              </Card>
            ) : !hasActiveClient && !isCreatingNewClient ? (
              /* Empty state - no clients */
              <Card className="p-6 shadow-card">
                <div className="text-center py-8">
                  <h2 className="text-2xl font-bold mb-4 text-primary">Aucun client</h2>
                  <p className="text-muted-foreground mb-6">
                    La base de données ne contient aucun client. Créez votre premier client pour commencer.
                  </p>
                  <Button onClick={handleStartNewClient} className="bg-gradient-primary text-white">
                    <Plus className="mr-2 h-4 w-4" />
                    Créer un nouveau client
                  </Button>
                </div>
              </Card>
            ) : (
              /* Client form */
              <Card className="p-6 shadow-card">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <h2 className="text-2xl font-bold text-primary">
                      {isCreatingNewClient ? 'Nouveau Client' : `Client: ${activeClient ? getClientLabel(activeClient) : ''}`}
                    </h2>
                    {/* Client Loaded Indicator */}
                    {!isCreatingNewClient && hasActiveClient && (
                      <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                        <CheckCircle className="h-3 w-3" />
                        Chargé
                      </span>
                    )}
                  </div>
                  <div className="flex gap-2">
                    {!isCreatingNewClient && clients.length > 0 && (
                      <Button variant="outline" onClick={handleStartNewClient}>
                        <Plus className="mr-2 h-4 w-4" />
                        Nouveau
                      </Button>
                    )}
                    {isCreatingNewClient && (
                      <>
                        <Button variant="outline" onClick={handleCancelNewClient}>
                          Annuler
                        </Button>
                        <Button onClick={handleSaveClient} className="bg-gradient-primary text-white">
                          <Save className="mr-2 h-4 w-4" />
                          Sauvegarder
                        </Button>
                      </>
                    )}
                  </div>
                </div>

                {/* Client selector for existing clients */}
                {!isCreatingNewClient && clients.length > 1 && (
                  <ClientSelector
                    clients={clients}
                    activeClientId={activeClientId}
                    onClientChange={handleClientChange}
                    className="mb-4"
                  />
                )}

                {/* Form fields - only editable for new clients */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label htmlFor="firstName">Prénom <span className="text-destructive">*</span></Label>
                    <Input 
                      id="firstName" 
                      value={editingClient?.firstName || ''} 
                      onChange={(e) => handleInputChange('firstName', e.target.value)}
                      className="mt-1" 
                      disabled={!isCreatingNewClient}
                      placeholder="Prénom requis"
                    />
                  </div>
                  <div>
                    <Label htmlFor="lastName">Nom <span className="text-destructive">*</span></Label>
                    <Input 
                      id="lastName" 
                      value={editingClient?.lastName || ''} 
                      onChange={(e) => handleInputChange('lastName', e.target.value)}
                      className="mt-1" 
                      disabled={!isCreatingNewClient}
                      placeholder="Nom requis"
                    />
                  </div>
                  <div>
                    <Label htmlFor="birthDate">Date de naissance <span className="text-destructive">*</span></Label>
                    <Input 
                      id="birthDate" 
                      type="date" 
                      value={editingClient?.birthDate || ''} 
                      onChange={(e) => handleInputChange('birthDate', e.target.value)}
                      className="mt-1" 
                      disabled={!isCreatingNewClient}
                    />
                    {editingClient?.birthDate && (
                      <p className="text-xs text-muted-foreground mt-1">
                        Âge: {calculateAgeFromBirthDate(editingClient.birthDate)} ans
                      </p>
                    )}
                  </div>
                  <div>
                    <Label htmlFor="gender">Genre</Label>
                    <Select 
                      value={editingClient?.gender || 'male'} 
                      onValueChange={(value) => handleInputChange('gender', value)}
                      disabled={!isCreatingNewClient}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border z-50">
                        <SelectItem value="male">Homme</SelectItem>
                        <SelectItem value="female">Femme</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="weight">Poids (kg)</Label>
                    <Input 
                      id="weight" 
                      type="number" 
                      value={editingClient?.weight || ''} 
                      onChange={(e) => handleInputChange('weight', parseFloat(e.target.value) || 0)}
                      className="mt-1" 
                      disabled={!isCreatingNewClient}
                    />
                  </div>
                  <div>
                    <Label htmlFor="height">Taille (cm)</Label>
                    <Input 
                      id="height" 
                      type="number" 
                      value={editingClient?.height || ''} 
                      onChange={(e) => handleInputChange('height', parseFloat(e.target.value) || 0)}
                      className="mt-1" 
                      disabled={!isCreatingNewClient}
                    />
                  </div>
                  <div>
                    <Label htmlFor="goal">Objectif Principal</Label>
                    <Select 
                      value={editingClient?.primaryGoal || 'maintenance'} 
                      onValueChange={(value) => handleInputChange('primaryGoal', value)}
                      disabled={!isCreatingNewClient}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border z-50">
                        <SelectItem value="fat_loss">Perte de graisse</SelectItem>
                        <SelectItem value="muscle_gain">Prise de muscle</SelectItem>
                        <SelectItem value="recomposition">Recomposition corporelle</SelectItem>
                        <SelectItem value="maintenance">Maintenance</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="activity">Niveau d'activité</Label>
                    <Select 
                      value={editingClient?.activityLevel || 'moderately_active'} 
                      onValueChange={(value) => handleInputChange('activityLevel', value)}
                      disabled={!isCreatingNewClient}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border z-50">
                        <SelectItem value="sedentary">Sédentaire</SelectItem>
                        <SelectItem value="lightly_active">Légèrement actif</SelectItem>
                        <SelectItem value="moderately_active">Modérément actif</SelectItem>
                        <SelectItem value="very_active">Très actif</SelectItem>
                        <SelectItem value="extra_active">Extrêmement actif</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label htmlFor="trainingDays">Jours d'entraînement/semaine</Label>
                    <Input 
                      id="trainingDays" 
                      type="number" 
                      min="1" 
                      max="7"
                      value={editingClient?.trainingDaysPerWeek || ''} 
                      onChange={(e) => handleInputChange('trainingDaysPerWeek', parseInt(e.target.value) || 1)}
                      className="mt-1" 
                      disabled={!isCreatingNewClient}
                    />
                  </div>
                  <div>
                    <Label htmlFor="experience">Expérience d'entraînement</Label>
                    <Select 
                      value={editingClient?.trainingExperience || 'intermediate'} 
                      onValueChange={(value) => handleInputChange('trainingExperience', value)}
                      disabled={!isCreatingNewClient}
                    >
                      <SelectTrigger className="mt-1">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent className="bg-background border border-border z-50">
                        <SelectItem value="beginner">Débutant</SelectItem>
                        <SelectItem value="intermediate">Intermédiaire</SelectItem>
                        <SelectItem value="advanced">Avancé</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                </div>
                
                {error && (
                  <Alert variant="destructive" className="mt-4">
                    <AlertCircle className="h-4 w-4" />
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {/* Generate plan button - only for existing clients */}
                {hasActiveClient && !isCreatingNewClient && (
                  <Button 
                    onClick={handleGeneratePlan}
                    disabled={isGenerating}
                    className="mt-6 bg-gradient-primary text-white shadow-glow hover:shadow-xl"
                  >
                    {isGenerating ? (
                      <>
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                        Plan en cours de génération...
                      </>
                    ) : (
                      'Générer le plan complet'
                    )}
                  </Button>
                )}
              </Card>
            )}
          </TabsContent>

          {/* ===== NUTRITION TAB ===== */}
          <TabsContent value="nutrition" className="space-y-4">
            {!hasActiveClient ? (
              <NoClientGuard message="Sélectionnez ou créez un client dans l'onglet Client pour générer un plan nutritionnel." />
            ) : (
              <>
                {/* Client info header */}
                <Card className="p-4 shadow-card bg-muted/30">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm text-muted-foreground">Client actif:</span>
                      <span className="ml-2 font-semibold text-foreground">
                        {getClientLabel(activeClient)}
                      </span>
                    </div>
                    {isPlanPersisted && (
                      <PlanLockIndicator 
                        isLocked={lockStatus.isLocked} 
                        daysRemaining={lockStatus.daysRemaining}
                      />
                    )}
                  </div>
                </Card>

                {/* Meal Plan Generators */}
                <Card className="p-6 shadow-card">
                  <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                    <div>
                      <h2 className="text-2xl font-bold text-primary flex items-center gap-2">
                        <CalendarDays className="h-6 w-6" />
                        Génération de Plans Repas
                      </h2>
                      <p className="text-sm text-muted-foreground mt-1">
                        Générez un plan journalier ou hebdomadaire basé sur vos ingrédients préférés
                      </p>
                    </div>
                    <div className="flex gap-3">
                      <Button
                        onClick={handleGenerateDailyMealPlan}
                        disabled={isGeneratingDailyPlan || isGeneratingWeeklyPlan}
                        variant="outline"
                      >
                        {isGeneratingDailyPlan ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Génération...
                          </>
                        ) : (
                          <>
                            <CalendarDays className="mr-2 h-4 w-4" />
                            Plan Journalier
                          </>
                        )}
                      </Button>
                      <Button
                        onClick={handleGenerateWeeklyMealPlan}
                        disabled={isGeneratingDailyPlan || isGeneratingWeeklyPlan}
                        className="bg-gradient-primary text-white shadow-glow hover:shadow-xl"
                      >
                        {isGeneratingWeeklyPlan ? (
                          <>
                            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                            Génération...
                          </>
                        ) : (
                          <>
                            <Calendar className="mr-2 h-4 w-4" />
                            Plan Hebdomadaire
                          </>
                        )}
                      </Button>
                    </div>
                  </div>
                </Card>

                {/* Display Weekly Meal Plan if generated or loaded */}
                {weeklyMealPlan && (
                  <WeeklyMealPlanDisplay weeklyPlan={weeklyMealPlan} />
                )}

                {/* Display Daily Meal Plan if generated */}
                {dailyMealPlan && (
                  <DailyMealPlanDisplay
                    dailyPlan={dailyMealPlan.dailyPlan}
                    totalMacros={dailyMealPlan.totalMacros}
                    targetMacros={dailyMealPlan.targetMacros}
                    variance={dailyMealPlan.variance}
                    convergenceInfo={dailyMealPlan.convergenceInfo}
                  />
                )}

                {generatedPlan && (
                  <>
                    <Card className="p-6 shadow-card">
                      <h2 className="text-2xl font-bold mb-4 text-primary">Nutrition Metrics</h2>
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gradient-card p-4 rounded-lg">
                          <p className="text-muted-foreground text-sm">TDEE</p>
                          <p className="text-2xl font-bold text-primary">{generatedPlan.nutritionPlan.metrics.tdee}</p>
                          <p className="text-xs text-muted-foreground">kcal/day</p>
                        </div>
                        <div className="bg-gradient-card p-4 rounded-lg">
                          <p className="text-muted-foreground text-sm">Target</p>
                          <p className="text-2xl font-bold text-accent">{generatedPlan.nutritionPlan.metrics.targetCalories}</p>
                          <p className="text-xs text-muted-foreground">kcal/day</p>
                        </div>
                        <div className="bg-gradient-card p-4 rounded-lg">
                          <p className="text-muted-foreground text-sm">Protein</p>
                          <p className="text-2xl font-bold text-success">{generatedPlan.nutritionPlan.metrics.proteinGrams}g</p>
                        </div>
                        <div className="bg-gradient-card p-4 rounded-lg">
                          <p className="text-muted-foreground text-sm">Carbs</p>
                          <p className="text-2xl font-bold text-info">{generatedPlan.nutritionPlan.metrics.carbsGrams}g</p>
                        </div>
                      </div>
                    </Card>

                    <Card className="p-6 shadow-card">
                      <h3 className="text-xl font-bold mb-4">Weekly Meal Plan</h3>
                      <div className="space-y-4">
                        {generatedPlan.nutritionPlan.weeklyMealPlan.slice(0, 2).map((day) => (
                          <div key={day.day} className="border border-border rounded-lg p-4">
                            <h4 className="font-semibold text-primary mb-2">Day {day.day}</h4>
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                              {day.meals.map((meal, idx) => (
                                <div key={idx} className="text-sm">
                                  <span className="font-medium">{meal.time}</span> - {meal.mealType}
                                  <div className="text-xs text-muted-foreground">
                                    {meal.recipes[0]?.recipe.name}
                                  </div>
                                </div>
                              ))}
                            </div>
                            <div className="mt-2 text-xs text-muted-foreground">
                              Total: {day.totalMacros.calories} kcal | P: {day.totalMacros.protein}g | C: {day.totalMacros.carbs}g | F: {day.totalMacros.fat}g
                            </div>
                          </div>
                        ))}
                      </div>
                    </Card>
                  </>
                )}

                {!weeklyMealPlan && !dailyMealPlan && !generatedPlan && (
                  <Card className="p-6 shadow-card">
                    <h2 className="text-2xl font-bold mb-4 text-primary">Plan Nutritionnel</h2>
                    <p className="text-muted-foreground">
                      Sélectionnez des ingrédients aimés dans l'onglet Ingrédients, puis générez un plan hebdomadaire.
                    </p>
                  </Card>
                )}
              </>
            )}
          </TabsContent>

          {/* ===== TRAINING TAB ===== */}
          <TabsContent value="training">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold text-primary">Training Plan</h2>
              <p className="text-muted-foreground mt-2">
                Cette fonctionnalité n'est pas encore implémentée.
              </p>
            </Card>
          </TabsContent>

          {/* ===== PROGRESS TAB ===== */}
          <TabsContent value="progress">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold text-primary">Suivi de Progression</h2>
              <p className="text-muted-foreground mt-2">
                Cette fonctionnalité n'est pas encore implémentée.
              </p>
            </Card>
          </TabsContent>

          {/* ===== VIDEOS TAB ===== */}
          <TabsContent value="videos">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold text-primary">Vidéos</h2>
              <p className="text-muted-foreground mt-2">
                Cette fonctionnalité n'est pas encore implémentée.
              </p>
            </Card>
          </TabsContent>

          {/* ===== NOTIFICATIONS TAB ===== */}
          <TabsContent value="notifications">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold text-primary">Notifications</h2>
              <p className="text-muted-foreground mt-2">
                Cette fonctionnalité n'est pas encore implémentée.
              </p>
            </Card>
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;
