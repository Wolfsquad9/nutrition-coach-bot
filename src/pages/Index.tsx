import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { calculateNutritionMetrics } from '@/utils/calculations';
import { sampleClient, sampleRecipes } from '@/data/sampleData';
import { Client, CompletePlan, Recipe } from '@/types';
import { useToast } from '@/hooks/use-toast';
import { generateCompletePlan } from '@/utils/planGenerator';
import { generateCompletePlanPDF, downloadPDF, exportPlanAsJSON, downloadJSON } from '@/utils/pdfExport';
import { Download, FileJson, FileText, Loader2, AlertCircle, TrendingUp, Video, Bell } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ProgressTracker } from '@/components/ProgressTracker';
import { MealSwapper } from '@/components/MealSwapper';
import { ExerciseLibrary } from '@/components/ExerciseLibrary';
import { NotificationCenter } from '@/components/NotificationCenter';
import IngredientManager from '@/components/IngredientManager';
import type { ClientIngredientRestrictions } from '@/utils/ingredientSubstitution';

const Index = () => {
  const [activeClient, setActiveClient] = useState<Client>(sampleClient);
  const [generatedPlan, setGeneratedPlan] = useState<CompletePlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [clientRestrictions, setClientRestrictions] = useState<ClientIngredientRestrictions[]>([]);
  const { toast } = useToast();

  const handleInputChange = (field: keyof Client, value: any) => {
    setActiveClient(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleGeneratePlan = async () => {
    setIsGenerating(true);
    setError(null);
    
    try {
      const plan = await generateCompletePlan(activeClient);
      setGeneratedPlan(plan);
      
      toast({
        title: "Plan généré avec succès !",
        description: `Plan nutrition et entraînement complet prêt pour ${activeClient.firstName} ${activeClient.lastName}`,
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
    if (!generatedPlan) return;
    const pdf = generateCompletePlanPDF(generatedPlan);
    downloadPDF(pdf, `${activeClient.firstName}-${activeClient.lastName}-plan.pdf`);
    toast({
      title: "PDF Downloaded",
      description: "The complete plan has been downloaded as PDF.",
    });
  };

  const handleDownloadJSON = () => {
    if (!generatedPlan) return;
    const json = exportPlanAsJSON(generatedPlan);
    downloadJSON(json, `${activeClient.firstName}-${activeClient.lastName}-plan.json`);
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

          <TabsContent value="client" className="space-y-4">
            <Card className="p-6 shadow-card">
              <h2 className="text-2xl font-bold mb-4 text-primary">Client Information</h2>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label htmlFor="firstName">Prénom</Label>
                  <Input 
                    id="firstName" 
                    value={activeClient.firstName} 
                    onChange={(e) => handleInputChange('firstName', e.target.value)}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label htmlFor="lastName">Nom</Label>
                  <Input 
                    id="lastName" 
                    value={activeClient.lastName} 
                    onChange={(e) => handleInputChange('lastName', e.target.value)}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label htmlFor="age">Âge</Label>
                  <Input 
                    id="age" 
                    type="number" 
                    value={activeClient.age} 
                    onChange={(e) => handleInputChange('age', parseInt(e.target.value))}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label htmlFor="gender">Genre</Label>
                  <Select 
                    value={activeClient.gender} 
                    onValueChange={(value) => handleInputChange('gender', value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    value={activeClient.weight} 
                    onChange={(e) => handleInputChange('weight', parseFloat(e.target.value))}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label htmlFor="height">Taille (cm)</Label>
                  <Input 
                    id="height" 
                    type="number" 
                    value={activeClient.height} 
                    onChange={(e) => handleInputChange('height', parseFloat(e.target.value))}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label htmlFor="goal">Objectif Principal</Label>
                  <Select 
                    value={activeClient.primaryGoal} 
                    onValueChange={(value) => handleInputChange('primaryGoal', value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    value={activeClient.activityLevel} 
                    onValueChange={(value) => handleInputChange('activityLevel', value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
                    value={activeClient.trainingDaysPerWeek} 
                    onChange={(e) => handleInputChange('trainingDaysPerWeek', parseInt(e.target.value))}
                    className="mt-1" 
                  />
                </div>
                <div>
                  <Label htmlFor="experience">Expérience d'entraînement</Label>
                  <Select 
                    value={activeClient.trainingExperience} 
                    onValueChange={(value) => handleInputChange('trainingExperience', value)}
                  >
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
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
            </Card>
          </TabsContent>

          <TabsContent value="nutrition" className="space-y-4">
            {generatedPlan ? (
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
            ) : (
              <Card className="p-6 shadow-card">
                <h2 className="text-2xl font-bold mb-4 text-primary">Nutrition Plan</h2>
                <p className="text-muted-foreground">Generate a plan to see nutrition details and meal plans.</p>
              </Card>
            )}

            <Card className="p-6 shadow-card">
              <h3 className="text-xl font-bold mb-4">Sample Recipes</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {sampleRecipes.slice(0, 4).map(recipe => (
                  <div key={recipe.id} className="border border-border rounded-lg p-4 hover:bg-card-hover transition-all">
                    <h4 className="font-semibold text-primary">{recipe.name}</h4>
                    <p className="text-sm text-muted-foreground">{recipe.category} • {recipe.prepTime + recipe.cookTime} min</p>
                    <div className="flex gap-4 mt-2 text-xs">
                      <span>P: {recipe.macrosPerServing.protein}g</span>
                      <span>C: {recipe.macrosPerServing.carbs}g</span>
                      <span>F: {recipe.macrosPerServing.fat}g</span>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          <TabsContent value="training">
            {generatedPlan ? (
              <Card className="p-6 shadow-card">
                <h2 className="text-2xl font-bold mb-4 text-primary">Training Plan - {generatedPlan.trainingPlan.name}</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                  <div className="bg-gradient-card p-4 rounded-lg">
                    <p className="text-muted-foreground text-sm">Frequency</p>
                    <p className="text-xl font-bold">{generatedPlan.trainingPlan.frequency} days/week</p>
                  </div>
                  <div className="bg-gradient-card p-4 rounded-lg">
                    <p className="text-muted-foreground text-sm">Split</p>
                    <p className="text-xl font-bold">{generatedPlan.trainingPlan.split.replace('_', ' ')}</p>
                  </div>
                </div>
                
                <div className="space-y-4">
                  {generatedPlan.trainingPlan.workouts.map((workout) => (
                    <div key={workout.dayNumber} className="border border-border rounded-lg p-4">
                      <h4 className="font-semibold text-primary mb-2">Day {workout.dayNumber}: {workout.name}</h4>
                      <p className="text-sm text-muted-foreground mb-2">Duration: {workout.duration} minutes</p>
                      <div className="space-y-2">
                        {workout.exercises.slice(0, 3).map((exercise, idx) => (
                          <div key={idx} className="text-sm">
                            <span className="font-medium">{exercise.exercise.name}</span>
                            <span className="text-muted-foreground ml-2">
                              {exercise.sets} × {exercise.reps} @ {exercise.intensity}
                            </span>
                          </div>
                        ))}
                        {workout.exercises.length > 3 && (
                          <p className="text-xs text-muted-foreground">+ {workout.exercises.length - 3} more exercises</p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </Card>
            ) : (
              <Card className="p-6 shadow-card">
                <h2 className="text-2xl font-bold text-primary">Training Plan</h2>
                <p className="text-muted-foreground">Generate a plan to see your personalized workout program.</p>
              </Card>
            )}
          </TabsContent>

          <TabsContent value="export">
            {generatedPlan ? (
              <Card className="p-6 shadow-card">
                <h2 className="text-2xl font-bold mb-4 text-primary">Export Plans</h2>
                <p className="text-muted-foreground mb-6">Download your complete nutrition and training plan in various formats.</p>
                
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Card className="p-4 border border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <FileText className="h-8 w-8 text-primary" />
                      <div>
                        <h3 className="font-semibold">PDF Export</h3>
                        <p className="text-sm text-muted-foreground">Complete formatted plan for clients</p>
                      </div>
                    </div>
                    <Button 
                      onClick={handleDownloadPDF}
                      className="w-full bg-gradient-primary text-white"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download PDF
                    </Button>
                  </Card>
                  
                  <Card className="p-4 border border-border">
                    <div className="flex items-center gap-3 mb-3">
                      <FileJson className="h-8 w-8 text-accent" />
                      <div>
                        <h3 className="font-semibold">JSON Export</h3>
                        <p className="text-sm text-muted-foreground">Raw data for integrations</p>
                      </div>
                    </div>
                    <Button 
                      onClick={handleDownloadJSON}
                      variant="outline"
                      className="w-full"
                    >
                      <Download className="mr-2 h-4 w-4" />
                      Download JSON
                    </Button>
                  </Card>
                </div>
                
                <div className="mt-6 p-4 bg-gradient-card rounded-lg">
                  <h3 className="font-semibold mb-2">Grocery List Included</h3>
                  <p className="text-sm text-muted-foreground">
                    The PDF includes a complete weekly grocery list with quantities organized by category.
                  </p>
                </div>
              </Card>
            ) : (
              <Card className="p-6 shadow-card">
                <h2 className="text-2xl font-bold text-primary">Export Plans</h2>
                <p className="text-muted-foreground">Generate a plan first to enable export options.</p>
              </Card>
            )}
          </TabsContent>
        </Tabs>
      </main>
    </div>
  );
};

export default Index;