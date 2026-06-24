import React, { useState } from 'react';
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
import { type GeneratedRecipe, type MealType } from '@/services/recipeService';
import { getClientLabel } from '@/utils/clientHelpers';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import type { GeneratedDietPlan, GeneratedTrainingPlan } from './ingredient-manager/types';
import { CATEGORIES, useFilteredIngredients } from './ingredient-manager/ingredientFilterUtils';
import { useRestrictionManager } from './ingredient-manager/restrictionManager';
import { useMacroSummary } from './ingredient-manager/macroSummarizer';
import { useIngredientExporter } from './ingredient-manager/ingredientExporter';
import { useRecipeActionHandler } from './ingredient-manager/recipeActionHandler';

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
  const [generatedDietPlan, setGeneratedDietPlan] = useState<GeneratedDietPlan | null>(null);
  const [generatedTrainingPlan, setGeneratedTrainingPlan] = useState<GeneratedTrainingPlan | null>(null);
  const [generatedRecipe, setGeneratedRecipe] = useState<GeneratedRecipe | null>(null);
  const [selectedMealType, setSelectedMealType] = useState<MealType>('lunch');
  const { toast } = useToast();

  const categories = CATEGORIES;

  const filteredIngredients = useFilteredIngredients({ searchTerm, selectedCategory });

  // Get client restriction for current active client + toggle/status/matrix
  // updates. Extracted to restrictionManager; same signatures, same behavior.
  const {
    getClientRestriction,
    toggleIngredientStatus,
    getIngredientStatus,
    updateSubstitutionMatrix,
  } = useRestrictionManager({
    activeClientId,
    activeClient,
    clientRestrictions,
    setClientRestrictions,
    setSubstitutionMatrix,
    autoSubstitute,
    onRestrictionsUpdate,
  });

  // Compute currentRestriction once for the rest of the component.
  // The early-return at the top of the render ensures we never hit
  // the JSX without a real activeClientId, so the non-null assertion
  // is safe.
  const currentRestriction = activeClientId
    ? getClientRestriction(activeClientId)
    : null;
  const calculateTotalMacros = useMacroSummary(currentRestriction);

  // Persistence- and plan-dispatch side effects live in dedicated
  // hooks so the component below stays focused on rendering. Same
  // function names, same behavior, just relocated.
  const {
    exportRestrictions,
    importRestrictions,
    handlePrintPlan,
    handleExportPDF,
    handleSendWhatsApp,
  } = useIngredientExporter({
    clientRestrictions,
    setClientRestrictions,
    onRestrictionsUpdate,
    toast,
    activeClient,
    generatedDietPlan,
    generatedTrainingPlan,
  });

  const { handleGenerateRecipe, generateAIPlan } = useRecipeActionHandler({
    activeClientId,
    activeClient,
    getClientRestriction,
    selectedMealType,
    setIsGeneratingRecipe,
    setGeneratedRecipe,
    setIsGeneratingPlan,
    setGeneratedDietPlan,
    setGeneratedTrainingPlan,
    toast,
  });

  // Guard: if no client is selected, don't render
  if (!activeClientId || !activeClient) {
    return (
      <Card className="p-8 shadow-card">
        <div className="text-center py-12 text-muted-foreground">
          <p className="text-lg">No client selected</p>
          <p className="text-sm mt-2">Select a client in the Client tab to manage their ingredients</p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="bg-card shadow-card border-border">
        <CardHeader className="border-b border-border">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-2xl font-bold text-foreground">Ingredient Manager</CardTitle>
              <p className="text-sm text-muted-foreground mt-1">
                Client: <span className="font-medium text-foreground">{getClientLabel(activeClient)}</span>
              </p>
            </div>
            <div className="flex gap-2">
              <Button variant="outline" size="icon" onClick={exportRestrictions} title="Export">
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
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Weight</p>
              <p className="text-2xl font-bold text-primary">{activeClient.weight}kg</p>
            </div>
            <div className="bg-gradient-card p-4 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Goal</p>
              <p className="text-sm font-semibold text-accent">{activeClient.primaryGoal}</p>
            </div>
            <div className="bg-gradient-card p-4 rounded-lg border border-border">
              <p className="text-xs text-muted-foreground uppercase tracking-wide">Activity</p>
              <p className="text-sm font-semibold text-info">{activeClient.activityLevel}</p>
            </div>
          </div>

          {/* Search & Filters */}
          <div className="space-y-4">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
              <Input
                placeholder="Search ingredient..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10 bg-background border-border text-foreground"
              />
            </div>

            <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
              <TabsList className="grid grid-cols-7 w-full bg-muted">
                {categories.map(cat => (
                  <TabsTrigger key={cat} value={cat} className="text-xs">
                    {cat === 'all' ? 'All' : cat}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>

            {/* Auto-Substitute Toggle */}
            <div className="flex items-center justify-between p-4 bg-gradient-card rounded-lg border border-border">
              <div className="flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-accent" />
                <Label htmlFor="auto-sub" className="text-foreground font-medium cursor-pointer">
                  Auto Substitutions
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
                <Badge variant="destructive">Blocked</Badge>
                <span className="text-muted-foreground">Excluded from recipes</span>
              </div>
              <div className="flex items-center gap-2">
                <Badge className="bg-success text-success-foreground">Preferred</Badge>
                <span className="text-muted-foreground">Priority</span>
              </div>
            </div>
          </div>

          {/* Macro Summary Donut */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Card className="bg-gradient-card border-border p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">Total Macros (Selected Ingredients)</h3>
              <MacroDonutChart macros={calculateTotalMacros} />
            </Card>

            <Card className="bg-gradient-card border-border p-6">
              <h3 className="text-lg font-bold text-foreground mb-4">Summary</h3>
              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Blocked ingredients</span>
                  <Badge variant="destructive">{currentRestriction.blockedIngredients.length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Preferred ingredients</span>
                  <Badge className="bg-success text-success-foreground">{currentRestriction.preferredIngredients.length}</Badge>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-muted-foreground">Total available</span>
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
                        <p className="text-xs font-semibold text-muted-foreground mb-2">Suggested substitutions:</p>
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
              <Label className="text-foreground whitespace-nowrap">Meal type:</Label>
              <Select value={selectedMealType} onValueChange={(v) => setSelectedMealType(v as MealType)}>
                <SelectTrigger className="w-40 bg-background">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-background border border-border z-50">
                  <SelectItem value="breakfast">Breakfast</SelectItem>
                  <SelectItem value="lunch">Lunch</SelectItem>
                  <SelectItem value="dinner">Dinner</SelectItem>
                  <SelectItem value="snack">Snack</SelectItem>
                </SelectContent>
              </Select>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-4">
              <Button
                onClick={handleGenerateRecipe}
                disabled={isGeneratingRecipe || isGeneratingPlan}
                className="flex-1"
              >
                {isGeneratingRecipe ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate Recipe
              </Button>
              <Button
                onClick={() => generateAIPlan('full')}
                disabled={isGeneratingPlan || isGeneratingRecipe}
                variant="secondary"
                className="flex-1"
              >
                {isGeneratingPlan ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
                Generate Full Plan
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
                    {selectedMealType === 'breakfast' ? 'Breakfast' : 
                     selectedMealType === 'lunch' ? 'Lunch' : 
                     selectedMealType === 'dinner' ? 'Dinner' : 'Snack'}
                  </Badge>
                </div>
                <div className="flex items-center gap-4 text-sm text-muted-foreground mt-2">
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Prep: {generatedRecipe.prepTime}min
                  </span>
                  <span className="flex items-center gap-1">
                    <Clock className="h-4 w-4" />
                    Cook: {generatedRecipe.cookTime}min
                  </span>
                  <Badge variant="outline" className="capitalize">{generatedRecipe.difficulty}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-4">
                {/* Macros Display */}
                <div className="grid grid-cols-4 gap-3">
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <Flame className="h-4 w-4 mx-auto mb-1 text-warning" />
                    <p className="text-lg font-bold text-foreground">{generatedRecipe.macrosPerServing.calories}</p>
                    <p className="text-xs text-muted-foreground">kcal</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-lg font-bold text-primary">{generatedRecipe.macrosPerServing.protein}g</p>
                    <p className="text-xs text-muted-foreground">Protein</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-lg font-bold text-warning">{generatedRecipe.macrosPerServing.carbs}g</p>
                    <p className="text-xs text-muted-foreground">Carbs</p>
                  </div>
                  <div className="bg-background/50 rounded-lg p-3 text-center border border-border">
                    <p className="text-lg font-bold text-secondary">{generatedRecipe.macrosPerServing.fat}g</p>
                    <p className="text-xs text-muted-foreground">Fat</p>
                  </div>
                </div>

                <Separator />

                {/* Ingredients */}
                <div>
                  <h4 className="font-semibold text-foreground mb-2">Ingredients</h4>
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
                        Allergens: {generatedRecipe.allergens.join(', ')}
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
                <CardTitle className="text-xl font-bold text-foreground">Generated Plans</CardTitle>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" onClick={handlePrintPlan}>
                    <Printer className="mr-2 h-4 w-4" />
                    Print
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
