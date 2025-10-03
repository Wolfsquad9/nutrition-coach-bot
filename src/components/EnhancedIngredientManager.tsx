import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Check, X, Download, Upload, FileJson, Printer, Send, Loader2, Sparkles } from 'lucide-react';
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

interface EnhancedIngredientManagerProps {
  clients: Client[];
  onRestrictionsUpdate: (restrictions: ClientIngredientRestrictions[]) => void;
}

export default function EnhancedIngredientManager({ 
  clients, 
  onRestrictionsUpdate 
}: EnhancedIngredientManagerProps) {
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [clientRestrictions, setClientRestrictions] = useState<ClientIngredientRestrictions[]>([]);
  const [autoSubstitute, setAutoSubstitute] = useState(false);
  const [substitutionMatrix, setSubstitutionMatrix] = useState<Map<string, SubstitutionRule[]>>(new Map());
  const [isGeneratingPlan, setIsGeneratingPlan] = useState(false);
  const [generatedDietPlan, setGeneratedDietPlan] = useState<any>(null);
  const [generatedTrainingPlan, setGeneratedTrainingPlan] = useState<any>(null);
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

  const selectedClient_obj = useMemo(() => 
    clients.find(c => c.id === selectedClient),
    [clients, selectedClient]
  );

  const getClientRestriction = (clientId: string): ClientIngredientRestrictions => {
    return clientRestrictions.find(r => r.clientId === clientId) || {
      clientId,
      clientName: clients.find(c => c.id === clientId)?.firstName || '',
      blockedIngredients: [],
      preferredIngredients: [],
      substitutionRules: {}
    };
  };

  const toggleIngredientStatus = (ingredientId: string, status: 'blocked' | 'preferred' | 'neutral') => {
    if (!selectedClient) return;

    const currentRestriction = getClientRestriction(selectedClient);
    const newRestriction = { ...currentRestriction };

    newRestriction.blockedIngredients = newRestriction.blockedIngredients.filter(id => id !== ingredientId);
    newRestriction.preferredIngredients = newRestriction.preferredIngredients.filter(id => id !== ingredientId);

    if (status === 'blocked') {
      newRestriction.blockedIngredients.push(ingredientId);
    } else if (status === 'preferred') {
      newRestriction.preferredIngredients.push(ingredientId);
    }

    const newRestrictions = clientRestrictions.filter(r => r.clientId !== selectedClient);
    newRestrictions.push(newRestriction);
    setClientRestrictions(newRestrictions);
    onRestrictionsUpdate(newRestrictions);

    if (autoSubstitute && status === 'blocked') {
      updateSubstitutionMatrix(newRestriction);
    }
  };

  const getIngredientStatus = (ingredientId: string): 'blocked' | 'preferred' | 'neutral' => {
    if (!selectedClient) return 'neutral';
    const restriction = getClientRestriction(selectedClient);
    if (restriction.blockedIngredients.includes(ingredientId)) return 'blocked';
    if (restriction.preferredIngredients.includes(ingredientId)) return 'preferred';
    return 'neutral';
  };

  const updateSubstitutionMatrix = (restriction: ClientIngredientRestrictions) => {
    const matrix = generateSubstitutionMatrix(restriction.blockedIngredients, restriction);
    setSubstitutionMatrix(matrix);
  };

  const calculateTotalMacros = useMemo(() => {
    if (!selectedClient) return { calories: 0, protein: 0, carbs: 0, fat: 0 };
    
    const restriction = getClientRestriction(selectedClient);
    const allowedIngredients = coreIngredients.filter(ing => 
      !restriction.blockedIngredients.includes(ing.id)
    );

    const total = allowedIngredients.reduce((acc, ing) => ({
      calories: acc.calories + ing.macros_per_100g.kcal,
      protein: acc.protein + ing.macros_per_100g.protein,
      carbs: acc.carbs + ing.macros_per_100g.carbs,
      fat: acc.fat + ing.macros_per_100g.fat,
    }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

    return total;
  }, [selectedClient, clientRestrictions]);

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

  const generateAIPlan = async (planType: 'recipe' | 'full') => {
    if (!selectedClient_obj) {
      toast({
        title: "Sélectionnez un client",
        description: "Veuillez d'abord sélectionner un client",
        variant: "destructive",
      });
      return;
    }

    setIsGeneratingPlan(true);

    try {
      const restriction = getClientRestriction(selectedClient);
      const allowedIngredients = coreIngredients.filter(ing => 
        !restriction.blockedIngredients.includes(ing.id)
      );

      const prompt = planType === 'recipe' 
        ? `Generate a single optimized recipe for ${selectedClient_obj.firstName} ${selectedClient_obj.lastName}.
           Client stats: Weight ${selectedClient_obj.weight}kg, Goal: ${selectedClient_obj.primaryGoal}, Activity: ${selectedClient_obj.activityLevel}
           Available ingredients: ${allowedIngredients.map(i => i.name).join(', ')}
           Preferred ingredients: ${restriction.preferredIngredients.map(id => coreIngredients.find(i => i.id === id)?.name).join(', ')}
           Return a detailed recipe with macros breakdown.`
        : `Generate a complete 7-day diet and training plan for ${selectedClient_obj.firstName} ${selectedClient_obj.lastName}.
           Client profile: Age ${selectedClient_obj.age}, Weight ${selectedClient_obj.weight}kg, Height ${selectedClient_obj.height}cm
           Goal: ${selectedClient_obj.primaryGoal}, Activity: ${selectedClient_obj.activityLevel}
           Training: ${selectedClient_obj.trainingDaysPerWeek} days/week, Experience: ${selectedClient_obj.trainingExperience}
           Available ingredients: ${allowedIngredients.slice(0, 30).map(i => i.name).join(', ')}
           Preferred ingredients: ${restriction.preferredIngredients.map(id => coreIngredients.find(i => i.id === id)?.name).join(', ')}
           
           Generate:
           1. Complete meal plan (7 days) with recipes and macros
           2. Shopping list organized by category
           3. Training program (${selectedClient_obj.trainingDaysPerWeek} workouts)
           4. Weekly schedule overview
           
           Return as structured JSON with: dietPlan, trainingPlan, shoppingList, weeklyOverview`;

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
          sessions: selectedClient_obj.trainingDaysPerWeek,
          workouts: Array(selectedClient_obj.trainingDaysPerWeek).fill(null).map((_, i) => ({
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

      if (planType === 'full') {
        setGeneratedDietPlan(mockResponse.dietPlan);
        setGeneratedTrainingPlan(mockResponse.trainingPlan);
      }

      toast({
        title: "Plan généré !",
        description: planType === 'recipe' ? "Recette créée avec succès" : "Plan complet généré avec succès",
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

  const handleSendWhatsApp = () => {
    if (!selectedClient_obj) return;
    
    const message = `Bonjour ${selectedClient_obj.firstName}, votre plan nutrition et entraînement personnalisé est prêt !`;
    const phoneNumber = selectedClient_obj.phone?.replace(/\D/g, '');
    window.open(`https://wa.me/${phoneNumber}?text=${encodeURIComponent(message)}`, '_blank');
    
    toast({
      title: "WhatsApp ouvert",
      description: "Envoyez le plan à votre client",
    });
  };

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-card border-border">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <CardTitle className="text-2xl font-bold text-foreground">Gestionnaire d'Ingrédients Avancé</CardTitle>
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
          {/* Client Selector & Summary */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="md:col-span-1">
              <Label className="text-foreground mb-2 block">Sélectionner un client</Label>
              <select
                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground"
                value={selectedClient}
                onChange={(e) => setSelectedClient(e.target.value)}
              >
                <option value="">-- Choisir --</option>
                {clients.map(client => (
                  <option key={client.id} value={client.id}>
                    {client.firstName} {client.lastName}
                  </option>
                ))}
              </select>
            </div>

            {selectedClient_obj && (
              <div className="md:col-span-2 grid grid-cols-3 gap-4">
                <div className="bg-gradient-card p-4 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Poids</p>
                  <p className="text-2xl font-bold text-primary">{selectedClient_obj.weight}kg</p>
                </div>
                <div className="bg-gradient-card p-4 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Objectif</p>
                  <p className="text-sm font-semibold text-accent">{selectedClient_obj.primaryGoal}</p>
                </div>
                <div className="bg-gradient-card p-4 rounded-lg border border-border">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">Activité</p>
                  <p className="text-sm font-semibold text-info">{selectedClient_obj.activityLevel}</p>
                </div>
              </div>
            )}
          </div>

          {selectedClient && (
            <>
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
                        updateSubstitutionMatrix(getClientRestriction(selectedClient));
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
                      <Badge variant="destructive">{getClientRestriction(selectedClient).blockedIngredients.length}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Ingrédients préférés</span>
                      <Badge className="bg-success text-success-foreground">{getClientRestriction(selectedClient).preferredIngredients.length}</Badge>
                    </div>
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">Total disponibles</span>
                      <Badge variant="secondary">
                        {coreIngredients.length - getClientRestriction(selectedClient).blockedIngredients.length}
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
                                {ingredient.macros_per_100g.protein}g P | {ingredient.macros_per_100g.carbs}g C | {ingredient.macros_per_100g.fat}g F | {ingredient.macros_per_100g.kcal} kcal
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

              {/* Action Buttons */}
              <div className="flex gap-4">
                <Button
                  onClick={() => generateAIPlan('recipe')}
                  disabled={isGeneratingPlan}
                  className="flex-1 bg-gradient-primary text-white shadow-glow"
                >
                  {isGeneratingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Générer une Recette
                </Button>
                <Button
                  onClick={() => generateAIPlan('full')}
                  disabled={isGeneratingPlan}
                  className="flex-1 bg-gradient-accent text-white shadow-glow"
                >
                  {isGeneratingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                  Générer Plan Complet
                </Button>
              </div>
            </>
          )}

          {!selectedClient && (
            <div className="text-center py-12 text-muted-foreground">
              <p className="text-lg">Sélectionnez un client pour gérer ses ingrédients</p>
            </div>
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
