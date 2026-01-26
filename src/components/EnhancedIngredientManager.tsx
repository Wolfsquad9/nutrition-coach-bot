import React, { useState, useMemo, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Search, Check, X, Download, Upload, FileJson, Printer, Send, Loader2, Sparkles, Clock, Utensils, Flame } from 'lucide-react';
import { coreIngredients, type IngredientData } from '@/data/ingredientDatabase';
import { Client } from '@/types';
import { 
  findBestSubstitute, 
  generateSubstitutionMatrix,
  type ClientIngredientRestrictions,
  type SubstitutionRule 
} from '@/utils/ingredientSubstitution';
import { useToast } from '@/hooks/use-toast';
import { MacroDonutChart } from './MacroDonutChart';
import { DietPlanDisplay } from './DietPlanDisplay';
import { TrainingPlanDisplay } from './TrainingPlanDisplay';
import { formatMacro, formatCalories } from '@/utils/formatters';
import { generateCompletePlanPDF, downloadPDF } from '@/utils/pdfExport';
import { supabase } from '@/integrations/supabase/client';
import { generateRecipe, type GeneratedRecipe, type MealType } from '@/services/recipeService';
import { getClientLabel } from '@/utils/clientHelpers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface EnhancedIngredientManagerProps {
  activeClientId: string | null;
  activeClient: Client | null;
  onRestrictionsUpdate: (restrictions: ClientIngredientRestrictions[]) => void;
}

export default function EnhancedIngredientManager({ 
  activeClientId,
  activeClient,
  onRestrictionsUpdate 
}: EnhancedIngredientManagerProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [clientRestrictions, setClientRestrictions] = useState<ClientIngredientRestrictions[]>([]);
  const [autoSubstitute, setAutoSubstitute] = useState(false);
  const [substitutionMatrix, setSubstitutionMatrix] = useState<Map<string, SubstitutionRule[]>>(new Map());
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [isGeneratingRecipe, setIsGeneratingRecipe] = useState(false);
  const [generatedDietPlan, setGeneratedDietPlan] = useState<any>(null);
  const [generatedTrainingPlan, setGeneratedTrainingPlan] = useState<any>(null);
  const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipe | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('lunch');
  const { toast } = useToast();

  const categories = ['all', 'protein', 'carbohydrate', 'fat', 'fruit', 'vegetable', 'misc'];

  const filteredIngredients = useMemo(() => 
    coreIngredients.filter(ingredient => {
      const matchesSearch = ingredient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                            ingredient.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
      const matchesCategory = selectedCategory === 'all' || ingredient.category === selectedCategory;
      return matchesSearch && matchesCategory;
    }),
    [searchTerm, selectedCategory]
  );

  // Get client restriction for current active client
  const getClientRestriction = (clientId: string | null): ClientIngredientRestrictions => {
    if (!clientId) {
      return {
        clientId: '',
        clientName: '',
        blockedIngredients: [],
        preferredIngredients: [],
        substitutionRules: {}
      };
    }
    return clientRestrictions.find(r => r.clientId === clientId) || {
      clientId,
      clientName: activeClient ? getClientLabel(activeClient) : '',
      blockedIngredients: [],
      preferredIngredients: [],
      substitutionRules: {}
    };
  };

  const toggleIngredientStatus = (ingredientId: string, status: 'blocked' | 'preferred' | 'neutral') => {
    if (!activeClientId) return;

    const currentRestriction = getClientRestriction(activeClientId);
    const newRestriction = { ...currentRestriction };

    newRestriction.blockedIngredients = newRestriction.blockedIngredients.filter(id => id !== ingredientId);
    newRestriction.preferredIngredients = newRestriction.preferredIngredients.filter(id => id !== ingredientId);

    if (status === 'blocked') {
      newRestriction.blockedIngredients.push(ingredientId);
    } else if (status === 'preferred') {
      newRestriction.preferredIngredients.push(ingredientId);
    }

    const newRestrictions = clientRestrictions.filter(r => r.clientId !== activeClientId);
    newRestrictions.push(newRestriction);
    setClientRestrictions(newRestrictions);
    onRestrictionsUpdate(newRestrictions);

    if (autoSubstitute && status === 'blocked') {
      updateSubstitutionMatrix(newRestriction);
    }
  };

  const getIngredientStatus = (ingredientId: string): 'blocked' | 'preferred' | 'neutral' => {
    if (!activeClientId) return 'neutral';
    const restriction = getClientRestriction(activeClientId);
    if (restriction.blockedIngredients.includes(ingredientId)) return 'blocked';
    if (restriction.preferredIngredients.includes(ingredientId)) return 'preferred';
    return 'neutral';
  };

  const updateSubstitutionMatrix = (restriction: ClientIngredientRestrictions) => {
    const matrix = generateSubstitutionMatrix(restriction.blockedIngredients, restriction);
    setSubstitutionMatrix(matrix);
  };

  const calculateTotalMacros = useMemo(() => {
    if (!activeClientId) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    
    const restriction = getClientRestriction(activeClientId);
    const allowedIngredients = coreIngredients.filter(ing => 
      !restriction.blockedIngredients.includes(ing.id)
    );

    const total = allowedIngredients.reduce((acc, ing) => {
      const servingFactor = ing.typical_serving_size_g / 100;
      return {
        calories: acc.calories + (ing.macros.calories * servingFactor),
        protein: acc.protein + (ing.macros.protein * servingFactor),
        carbs: acc.carbs + (ing.macros.carbs * servingFactor),
        fat: acc.fat + (ing.macros.fat * servingFactor),
      };
    }, { calories: 0, protein: 0, carbs: 0, fat: 0 });

    return total;
  }, [activeClientId, clientRestrictions]);

  const exportRestrictions = () => {
    const dataStr = JSON.stringify(clientRestrictions, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', `client_restrictions_${Date.now()}.json`);
    linkElement.click();
    
    toast({
      title: "Export réussi",
      description: "Les restrictions ont été exportées en JSON",
    });
  };

  const importRestrictions = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onload = (e) => {
        try {
          const imported = JSON.parse(e.target?.result as string);
          setClientRestrictions(imported);
          onRestrictionsUpdate(imported);
          toast({
            title: "Import réussi",
            description: "Les restrictions ont été importées",
          });
        } catch (error) {
          toast({
            title: "Erreur d'import",
            description: "Fichier JSON invalide",
            variant: "destructive",
          });
        }
      };
      reader.readAsText(file);
    }
  };

  const handleGenerateRecipe = async () => {
    if (!activeClientId || !activeClient) {
      toast({
        title: "Aucun client sélectionné",
        description: "Le client doit être sélectionné dans l'onglet Client",
        variant: "destructive",
      });
      return;
    }

    const restriction = getClientRestriction(activeClientId);
    const preferredIngredients = restriction.preferredIngredients;

    if (preferredIngredients.length === 0) {
      toast({
        title: "Aucun ingrédient sélectionné",
        description: "Marquez d'abord des ingrédients comme 'aimés' (étoile verte)",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingRecipe(true);

    try {
      // Small delay for UX
      await new Promise(resolve => setTimeout(resolve, 500));
      
      const recipe = generateRecipe(preferredIngredients, selectedMealType);
      setGeneratedRecipe(recipe);

      toast({
        title: "Recette générée !",
        description: `${recipe.name} créée avec succès`,
      });
    } catch (error) {
      console.error('Recipe generation error:', error);
      toast({
        title: "Erreur de génération",
        description: error instanceof Error ? error.message : "Impossible de générer la recette",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingRecipe(false);
    }
  };

  const generateAIPlan = async (planType: 'full') => {
    if (!activeClientId || !activeClient) {
      toast({
        title: "Aucun client sélectionné",
        description: "Le client doit être sélectionné dans l'onglet Client",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPlan(true);

    try {
      const restriction = getClientRestriction(activeClientId);
      const allowedIngredients = coreIngredients.filter(ing => 
        !restriction.blockedIngredients.includes(ing.id)
      );

      // Mock AI response for demo (replace with actual AI endpoint call)
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      const mockResponse = {
        dietPlan: {
          totalCalories: 2200,
          macros: { protein: 165, carbs: 220, fat: 73 },
          meals: Array(7).fill(null).map((_, day) => ({
            day: day + 1,
            meals: [
              { name: 'Breakfast', calories: 550, protein: 40, carbs: 55, fat: 18 },
              { name: 'Lunch', calories: 660, protein: 50, carbs: 66, fat: 22 },
              { name: 'Dinner', calories: 660, protein: 50, carbs: 66, fat: 22 },
              { name: 'Snack', calories: 330, protein: 25, carbs: 33, fat: 11 },
            ]
          }))
        },
        trainingPlan: {
          split: 'Push/Pull/Legs',
          sessions: activeClient.trainingDaysPerWeek,
          workouts: Array(activeClient.trainingDaysPerWeek).fill(null).map((_, i) => ({
            day: i + 1,
            name: ['Push', 'Pull', 'Legs', 'Upper', 'Lower', 'Full Body', 'Active Recovery'][i],
            exercises: [
              { name: 'Exercise 1', sets: 4, reps: '8-10' },
              { name: 'Exercise 2', sets: 3, reps: '10-12' },
              { name: 'Exercise 3', sets: 3, reps: '12-15' },
            ]
          }))
        },
        shoppingList: [
          { category: 'Protein', items: ['Chicken Breast 1.5kg', 'Eggs 24ct', 'Greek Yogurt 1kg'] },
          { category: 'Carbs', items: ['Rice 2kg', 'Oats 1kg', 'Sweet Potatoes 2kg'] },
          { category: 'Fats', items: ['Olive Oil 500ml', 'Avocado 6ct', 'Almonds 500g'] },
          { category: 'Vegetables', items: ['Broccoli 1kg', 'Spinach 500g', 'Bell Peppers 6ct'] },
        ]
      };

      setGeneratedDietPlan(mockResponse.dietPlan);
      setGeneratedTrainingPlan(mockResponse.trainingPlan);

      toast({
        title: "Plan généré !",
        description: "Plan complet généré avec succès",
      });

    } catch (error) {
      console.error('AI generation error:', error);
      toast({
        title: "Erreur de génération",
        description: "Impossible de générer le plan",
        variant: "destructive",
      });
    } finally {
      setIsGeneratingPlan(false);
    }
  };

  const handlePrintPlan = () => {
    window.print();
    toast({
      title: "Impression lancée",
      description: "Le plan est prêt à imprimer",
    });
  };

  const handleExportPDF = async () => {
    if (!activeClient || !generatedDietPlan || !generatedTrainingPlan) {
      toast({
        title: "Données manquantes",
        description: "Générez d'abord un plan complet",
        variant: "destructive",
      });
      return;
    }

    try {
      // Mock CompletePlan structure for PDF export
      const completePlan = {
        client: activeClient,
        nutritionPlan: {
          metrics: {
            tdee: generatedDietPlan.totalCalories,
            targetCalories: generatedDietPlan.totalCalories,
            proteinGrams: generatedDietPlan.macros.protein,
            carbsGrams: generatedDietPlan.macros.carbs,
            fatGrams: generatedDietPlan.macros.fat,
            fiberGrams: 30,
            waterLiters: 3,
          },
          weeklyMealPlan: generatedDietPlan.meals,
          groceryList: generatedDietPlan.shoppingList || [],
        },
        trainingPlan: generatedTrainingPlan,
      };

      const clientLabel = getClientLabel(activeClient);
      const pdf = generateCompletePlanPDF(completePlan as any);
      downloadPDF(pdf, `${clientLabel.replace(/\s+/g, '_')}_plan.pdf`);

      toast({
        title: "PDF exporté",
        description: "Le plan a été téléchargé avec succès",
      });
    } catch (error) {
      console.error('PDF export error:', error);
      toast({
        title: "Erreur d'export",
        description: "Impossible de générer le PDF",
        variant: "destructive",
      });
    }
  };

  const handleSendWhatsApp = async () => {
    if (!activeClient || !generatedDietPlan || !generatedTrainingPlan) {
      toast({
        title: "Données manquantes",
        description: "Générez d'abord un plan complet",
        variant: "destructive",
      });
      return;
    }

    try {
      const { data, error } = await supabase.functions.invoke('send-whatsapp', {
        body: {
          clientPhone: activeClient.phone,
          planData: { diet: generatedDietPlan, training: generatedTrainingPlan },
          planType: 'complete',
        },
      });

      if (error) throw error;

      toast({
        title: "WhatsApp - Prêt",
        description: data.note || "Intégration Twilio/Make.com requise",
      });
    } catch (error) {
      console.error('WhatsApp send error:', error);
      toast({
        title: "Erreur WhatsApp",
        description: "Impossible d'envoyer le plan",
        variant: "destructive",
      });
    }
  };

  // Guard: if no client is selected, don't render
  if (!activeClientId || !activeClient) {
    return (
      <Card className="p-8 shadow-card">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">Aucun client sélectionné</p>
          <p className="text-sm mt-2">Sélectionnez un client dans l'onglet Client pour gérer ses ingrédients</p>
        </div>
      </Card>
    );
  }

  const currentRestriction = getClientRestriction(activeClientId);

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-card border-border">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">Gestionnaire d'Ingrédients</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Client: <span className="font-medium text-foreground">{getClientLabel(activeClient)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={exportRestrictions} title="Exporter">
                <Download className="h-4 w-4" />
              </Button>
              <Label htmlFor="import-file" className="cursor-pointer">
                <Button variant="outline" size="icon" asChild>
                  <span><Upload className="h-4 w-4" /></span>
                </Button>
                <input
                  id="import-file"
                  type="file"
                  accept=".json"
                  className="hidden"
                  onChange={importRestrictions}
                />
              </Label>
            </div>
          </div>
        </CardHeader>

        <CardContent className="p-6 space-y-6">
          {/* Client Summary */}
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-gradient-card p-4 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Poids</p>
              <p className="text-2xl font-bold text-primary">{activeClient.weight}kg</p>
            </div>
            <div className="bg-gradient-card p-4 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Objectif</p>
              <p className="text-sm font-semibold text-accent">{activeClient.primaryGoal}</p>
            </div>
            <div className="bg-gradient-card p-4 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Activité</p>
              <p className="text-sm font-semibold text-info">{activeClient.activityLevel}</p>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Rechercher un ingrédient..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background border-border text-foreground"
              />
            </div>

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList className="grid grid-cols-7 w-full bg-muted">
                {categories.map(cat => (
                  <TabsTrigger key={cat} value={cat} className="text-xs">
                    {cat === 'all' ? 'Tous' : cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Auto-Substitute Toggle */}
            <div className="flex items-center justify-between p-4 bg-gradient-card rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <Label htmlFor="auto-sub" className="text-foreground font-medium cursor-pointer">
                  Substitutions Automatiques
                </Label>
              </div>
              <Switch
                id="auto-sub"
                checked={autoSubstitute}
                onCheckedChange={(checked) => {
                  setAutoSubstitute(checked);
                  if (checked) {
                    updateSubstitutionMatrix(currentRestriction);
                  }
                }}
              />
            </div>

            <div className="grid grid-cols-2 gap-4 text-sm">
              <div className="flex items-center gap-2">
                <Badge variant="destructive">Bloqué</Badge>
                <span className="text-muted-foreground">Exclu des recettes</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-success text-success-foreground">Préféré</Badge>
                <span className="text-muted-foreground">Prioritaire</span>
              </div>
            </div>
          </div>

          {/* Macro Summary Donut */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-gradient-card border-border p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">Macros Totales (Ingrédients Sélectionnés)</h3>
              <MacroDonutChart macros={calculateTotalMacros} />
            </Card>

            <Card className="bg-gradient-card border-border p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">Résumé</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Ingrédients bloqués</span>
                  <Badge variant="destructive">{currentRestriction.blockedIngredients.length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Ingrédients préférés</span>
                  <Badge className="bg-success text-success-foreground">{currentRestriction.preferredIngredients.length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total disponibles</span>
                  <Badge variant="secondary">
                    {coreIngredients.length - currentRestriction.blockedIngredients.length}
                  </Badge>
                </div>
              </div>
            </Card>
          </div>

          {/* Ingredient List */}
          <ScrollArea className="h-[400px] pr-4 border border-border rounded-lg p-4 bg-background">
            <div className="space-y-2">
              {filteredIngredients.map(ingredient => {
                const status = getIngredientStatus(ingredient.id);
                const substitutes = autoSubstitute ? substitutionMatrix.get(ingredient.id) : null;

                return (
                  <div key={ingredient.id} className="space-y-2">
                    <div
                      className={`p-3 rounded-lg border transition-all ${
                        status === 'blocked' ? 'border-destructive bg-destructive/10' :
                        status === 'preferred' ? 'border-success bg-success/10' :
                        'border-border bg-card hover:bg-card-hover'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium text-foreground">{ingredient.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {formatMacro(ingredient.macros.protein)}g P | {formatMacro(ingredient.macros.carbs)}g C | {formatMacro(ingredient.macros.fat)}g F | {formatCalories(ingredient.macros.calories)} kcal
                          </div>
                          <div className="flex gap-1 mt-1">
                            {ingredient.tags.slice(0, 3).map(tag => (
                              <Badge key={tag} variant="secondary" className="text-xs">
                                {tag}
                              </Badge>
                            ))}
                          </div>
                        </div>
                        <div className="flex gap-2">
                          <Button
                            size="sm"
                            variant={status === 'blocked' ? 'destructive' : 'outline'}
                            onClick={() => toggleIngredientStatus(ingredient.id, status === 'blocked' ? 'neutral' : 'blocked')}
                          >
                            <X className="h-3 w-3" />
                          </Button>
                          <Button
                            size="sm"
                            variant={status === 'preferred' ? 'default' : 'outline'}
                            className={status === 'preferred' ? 'bg-success hover:bg-success/90 text-success-foreground' : ''}
                            onClick={() => toggleIngredientStatus(ingredient.id, status === 'preferred' ? 'neutral' : 'preferred')}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>

                    {/* Substitution Suggestions */}
                    {substitutes && substitutes.length > 0 && (
                      <div className="ml-6 p-3 bg-muted/50 rounded-lg border border-border">
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Substitutions suggérées:</p>
                        {substitutes.map((sub, idx) => {
                          const subIngredient = coreIngredients.find(i => i.id === sub.substituteId);
                          return subIngredient ? (
                            <div key={idx} className="text-xs text-foreground flex items-center justify-between mb-1">
                              <span>→ {subIngredient.name}</span>
                              <Badge variant="outline" className="text-xs">
                                {Math.round(sub.macroSimilarity * 100)}% match
                              </Badge>
                            </div>
                          ) : null;
                        })}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </ScrollArea>

          {/* Recipe Generation */}
          <div className="space-y-4">
            <div className="flex items-center gap-4">
              <Label className="text-foreground whitespace-nowrap">Type de repas:</Label>
              <Select value={selectedMealType} onValueChange={(v) => setSelectedMealType(v as MealType)}>
                <SelectTrigger className="w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border z-50">
                  <SelectItem value="breakfast">Petit-déjeuner</SelectItem>
                  <SelectItem value="lunch">Déjeuner</SelectItem>
                  <SelectItem value="dinner">Dîner</SelectItem>
                  <SelectItem value="snack">Collation</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Button
                onClick={handleGenerateRecipe}
                disabled={isGeneratingRecipe || isGeneratingPlan}
                className="flex-1 bg-gradient-primary text-white shadow-glow"
              >
                {isGeneratingRecipe ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Générer une Recette
              </Button>
              <Button
                onClick={() => generateAIPlan('full')}
                disabled={isGeneratingPlan || isGeneratingRecipe}
                className="flex-1 bg-gradient-accent text-white shadow-glow"
              >
                {isGeneratingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Générer Plan Complet
              </Button>
            </div>
          </div>

          {/* Generated Recipe Display */}
          {generatedRecipe && (
            <Card className="bg-gradient-card border-primary/20 shadow-elegant mt-6">
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-xl font-bold text-foreground flex items-center gap-2">
                    <Utensils className="h-5 w-5 text-primary" />
                    {generatedRecipe.name}
                  </CardTitle>
                  <Badge variant="secondary" className="capitalize">
                    {selectedMealType === 'breakfast' ? 'Petit-déjeuner' : 
                     selectedMealType === 'lunch' ? 'Déjeuner' : 
                     selectedMealType === 'dinner' ? 'Dîner' : 'Collation'}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Préparation: {generatedRecipe.prepTime}min
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Cuisson: {generatedRecipe.cookTime}min
                  </span>
                  <Badge variant="outline" className="capitalize">{generatedRecipe.difficulty}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Macros Display */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <Flame className="h-4 w-4 mx-auto mb-1 text-orange-500" />
                    <p className="text-lg font-bold text-foreground">{generatedRecipe.macrosPerServing.calories}</p>
                    <p className="text-xs text-muted-foreground">kcal</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-lg font-bold text-primary">{generatedRecipe.macrosPerServing.protein}g</p>
                    <p className="text-xs text-muted-foreground">Protéines</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-lg font-bold text-amber-500">{generatedRecipe.macrosPerServing.carbs}g</p>
                    <p className="text-xs text-muted-foreground">Glucides</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-lg font-bold text-emerald-500">{generatedRecipe.macrosPerServing.fat}g</p>
                    <p className="text-xs text-muted-foreground">Lipides</p>
                  </div>
                </div>

                <Separator />

                {/* Ingredients */}
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Ingrédients</h4>
                  <ul className="space-y-1">
                    {generatedRecipe.ingredients.map((ing, idx) => (
                      <li key={idx} className="flex items-center justify-between text-sm">
                        <span className="text-foreground">{ing.name}</span>
                        <span className="text-muted-foreground">{ing.amount}{ing.unit}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <Separator />

                {/* Instructions */}
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Instructions</h4>
                  <ol className="space-y-2">
                    {generatedRecipe.instructions.map((step, idx) => (
                      <li key={idx} className="flex gap-3 text-sm">
                        <span className="flex-shrink-0 w-6 h-6 rounded-full bg-primary/20 text-primary text-xs flex items-center justify-center font-medium">
                          {idx + 1}
                        </span>
                        <span className="text-muted-foreground">{step}</span>
                      </li>
                    ))}
                  </ol>
                </div>

                {/* Tags */}
                {generatedRecipe.dietTypes.length > 0 && (
                  <div className="flex flex-wrap gap-2 pt-2">
                    {generatedRecipe.dietTypes.map((diet, idx) => (
                      <Badge key={idx} variant="outline" className="text-xs capitalize">
                        {diet}
                      </Badge>
                    ))}
                    {generatedRecipe.allergens.length > 0 && (
                      <Badge variant="destructive" className="text-xs">
                        Allergènes: {generatedRecipe.allergens.join(', ')}
                      </Badge>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}
        </CardContent>
      </Card>

      {/* Generated Plans Display */}
      {generatedDietPlan && generatedTrainingPlan && (
        <div className="space-y-6">
          <Card className="bg-card shadow-card border-border">
            <CardHeader className="border-b border-border">
              <div className="flex items-center justify-between">
                <CardTitle className="text-xl font-bold text-foreground">Plans Générés</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrintPlan}>
                    <Printer className="mr-2 h-4 w-4" />
                    Imprimer
                  </Button>
                  <Button variant="outline" size="sm" onClick={handleExportPDF}>
                    <Download className="mr-2 h-4 w-4" />
                    Export PDF
                  </Button>
                  <Button variant="outline" size="sm" onClick={exportRestrictions}>
                    <FileJson className="mr-2 h-4 w-4" />
                    Export JSON
                  </Button>
                  <Button variant="default" size="sm" onClick={handleSendWhatsApp} className="bg-success text-success-foreground">
                    <Send className="mr-2 h-4 w-4" />
                    WhatsApp
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-6">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <DietPlanDisplay plan={generatedDietPlan} />
                <TrainingPlanDisplay plan={generatedTrainingPlan} />
              </div>
            </CardContent>
          </Card>
        </div>
      )}
    </div>
  );
}
