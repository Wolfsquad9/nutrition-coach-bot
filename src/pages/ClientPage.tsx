/**
 * Client tab — client creation, selection, and form display.
 * Extracted from the former Index.tsx client tab.
 */

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, AlertCircle, Plus, Save, CheckCircle, Download, FileJson } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppLayout } from '@/hooks/useAppLayout';
import { NoClientGuard } from '@/components/NoClientGuard';
import { getClientLabel, calculateAgeFromBirthDate } from '@/utils/clientHelpers';
import { generatePersonalizedPlan } from '@/services/planService';
import { generateCompletePlanPDF, downloadPDF, exportPlanAsJSON, downloadJSON } from '@/utils/pdfExport';
import type { Client, CompletePlan, Recipe } from '@/types';

export default function ClientPage() {
  const {
    clients,
    activeClientId,
    activeClient,
    isLoadingClients,
    clientError,
    handleCreateClient,
    createNewClientDraft,
    clientRestrictions,
  } = useAppLayout();

  const [draftClient, setDraftClient] = useState<Client | null>(null);
  const [generatedPlan, setGeneratedPlan] = useState<CompletePlan | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast } = useToast();

  const editingClient = draftClient || activeClient;
  const hasActiveClient = !!activeClientId && !!activeClient;
  const isCreatingNewClient = !!draftClient;

  const getLikedFoods = (): string[] => {
    if (!activeClientId) return [];
    const restriction = clientRestrictions.find(r => r.clientId === activeClientId);
    return restriction?.preferredIngredients || [];
  };

  const handleInputChange = (field: keyof Client, value: Client[keyof Client]) => {
    if (draftClient) {
      setDraftClient({ ...draftClient, [field]: value });
    }
  };

  const handleStartNewClient = () => setDraftClient(createNewClientDraft());
  const handleCancelNewClient = () => setDraftClient(null);

  const handleSaveClient = async () => {
    if (!draftClient) return;
    const result = await handleCreateClient(draftClient);
    if (result.success && result.client) {
      setDraftClient(null);
      toast({ title: "Client saved", description: "Client has been saved to the database." });
    } else {
      toast({ title: "Error", description: result.error || "Unable to save client", variant: "destructive" });
    }
  };

  const handleGeneratePlan = async () => {
    if (!activeClientId || !activeClient) {
      toast({ title: "No client selected", description: "Select or create a client first.", variant: "destructive" });
      return;
    }
    setIsGenerating(true);
    setError(null);
    try {
      const likedFoods = getLikedFoods();
      if (likedFoods.length < 5) {
        toast({ title: "Tip", description: "Select at least 5 liked foods in the Ingredients tab for a personalized meal plan." });
      }
      const plan = await generatePersonalizedPlan(activeClient, likedFoods);
      setGeneratedPlan(plan);
      toast({ title: "Plan generated!", description: `Personalized plan: ${plan.nutritionPlan.metrics.targetCalories} kcal/day` });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Unable to generate plan, please try again later";
      setError(msg);
      toast({ title: "Generation error", description: msg, variant: "destructive" });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleDownloadPDF = () => {
    if (!generatedPlan || !activeClient) return;
    const label = getClientLabel(activeClient);
    downloadPDF(generateCompletePlanPDF(generatedPlan), `${label.replace(/\s+/g, '-')}-plan.pdf`);
    toast({ title: "PDF Downloaded", description: "The complete plan has been downloaded as PDF." });
  };

  const handleDownloadJSON = () => {
    if (!generatedPlan || !activeClient) return;
    const label = getClientLabel(activeClient);
    downloadJSON(exportPlanAsJSON(generatedPlan), `${label.replace(/\s+/g, '-')}-plan.json`);
    toast({ title: "JSON Downloaded", description: "The complete plan has been downloaded as JSON." });
  };

  if (isLoadingClients) {
    return (
      <Card className="p-6 shadow-card flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">Loading clients...</span>
      </Card>
    );
  }

  if (!hasActiveClient && !isCreatingNewClient) {
    return (
      <Card className="p-6 shadow-card">
        {clientError && (
          <Alert variant="destructive" className="mb-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>Supabase error: {clientError}</AlertDescription>
          </Alert>
        )}
        <div className="text-center py-8">
          <h2 className="text-2xl font-bold mb-4 text-primary">No clients</h2>
          <p className="text-muted-foreground mb-6">
            The database contains no clients. Create your first client to get started.
          </p>
          <Button onClick={handleStartNewClient} className="bg-gradient-primary text-white">
            <Plus className="mr-2 h-4 w-4" />
            Create new client
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      {clientError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>Supabase error: {clientError}</AlertDescription>
        </Alert>
      )}

      <Card className="p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-primary">
              {isCreatingNewClient ? 'New Client' : `Client: ${activeClient ? getClientLabel(activeClient) : ''}`}
            </h2>
            {!isCreatingNewClient && hasActiveClient && (
              <span className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-green-100 text-green-800 text-xs font-medium">
                <CheckCircle className="h-3 w-3" />
                Loaded
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {!isCreatingNewClient && clients.length > 0 && (
              <Button variant="outline" onClick={handleStartNewClient}>
                <Plus className="mr-2 h-4 w-4" />
                New
              </Button>
            )}
            {isCreatingNewClient && (
              <>
                <Button variant="outline" onClick={handleCancelNewClient}>Cancel</Button>
                <Button onClick={handleSaveClient} className="bg-gradient-primary text-white">
                  <Save className="mr-2 h-4 w-4" />
                  Save
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <Label htmlFor="firstName">First Name <span className="text-destructive">*</span></Label>
            <Input id="firstName" value={editingClient?.firstName || ''} onChange={e => handleInputChange('firstName', e.target.value)} className="mt-1" disabled={!isCreatingNewClient} placeholder="First name required" />
          </div>
          <div>
            <Label htmlFor="lastName">Last Name <span className="text-destructive">*</span></Label>
            <Input id="lastName" value={editingClient?.lastName || ''} onChange={e => handleInputChange('lastName', e.target.value)} className="mt-1" disabled={!isCreatingNewClient} placeholder="Last name required" />
          </div>
          <div>
            <Label htmlFor="birthDate">Date of Birth <span className="text-destructive">*</span></Label>
            <Input id="birthDate" type="date" value={editingClient?.birthDate || ''} onChange={e => handleInputChange('birthDate', e.target.value)} className="mt-1" disabled={!isCreatingNewClient} />
            {editingClient?.birthDate && (
              <p className="text-xs text-muted-foreground mt-1">
                Age: {calculateAgeFromBirthDate(editingClient.birthDate)} years
              </p>
            )}
          </div>
          <div>
            <Label htmlFor="gender">Gender</Label>
            <Select value={editingClient?.gender || 'male'} onValueChange={v => handleInputChange('gender', v)} disabled={!isCreatingNewClient}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="male">Male</SelectItem>
                <SelectItem value="female">Female</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="weight">Weight (kg)</Label>
            <Input id="weight" type="number" value={editingClient?.weight || ''} onChange={e => handleInputChange('weight', parseFloat(e.target.value) || 0)} className="mt-1" disabled={!isCreatingNewClient} />
          </div>
          <div>
            <Label htmlFor="height">Height (cm)</Label>
            <Input id="height" type="number" value={editingClient?.height || ''} onChange={e => handleInputChange('height', parseFloat(e.target.value) || 0)} className="mt-1" disabled={!isCreatingNewClient} />
          </div>
          <div>
            <Label htmlFor="goal">Primary Goal</Label>
            <Select value={editingClient?.primaryGoal || 'maintenance'} onValueChange={v => handleInputChange('primaryGoal', v)} disabled={!isCreatingNewClient}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="fat_loss">Fat Loss</SelectItem>
                <SelectItem value="muscle_gain">Muscle Gain</SelectItem>
                <SelectItem value="recomposition">Body Recomposition</SelectItem>
                <SelectItem value="maintenance">Maintenance</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="activity">Activity Level</Label>
            <Select value={editingClient?.activityLevel || 'moderately_active'} onValueChange={v => handleInputChange('activityLevel', v)} disabled={!isCreatingNewClient}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="sedentary">Sedentary</SelectItem>
                <SelectItem value="lightly_active">Lightly Active</SelectItem>
                <SelectItem value="moderately_active">Moderately Active</SelectItem>
                <SelectItem value="very_active">Very Active</SelectItem>
                <SelectItem value="extra_active">Extremely Active</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <Label htmlFor="trainingDays">Training Days / Week</Label>
            <Input id="trainingDays" type="number" min="1" max="7" value={editingClient?.trainingDaysPerWeek || ''} onChange={e => handleInputChange('trainingDaysPerWeek', parseInt(e.target.value) || 1)} className="mt-1" disabled={!isCreatingNewClient} />
          </div>
          <div>
            <Label htmlFor="experience">Training Experience</Label>
            <Select value={editingClient?.trainingExperience || 'intermediate'} onValueChange={v => handleInputChange('trainingExperience', v)} disabled={!isCreatingNewClient}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent className="bg-background border border-border z-50">
                <SelectItem value="beginner">Beginner</SelectItem>
                <SelectItem value="intermediate">Intermediate</SelectItem>
                <SelectItem value="advanced">Advanced</SelectItem>
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

        {hasActiveClient && !isCreatingNewClient && (
          <div className="mt-6 flex gap-2">
            <Button onClick={handleGeneratePlan} disabled={isGenerating} className="bg-gradient-primary text-white shadow-glow hover:shadow-xl">
              {isGenerating ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Generating plan...</>
              ) : (
                'Generate complete plan'
              )}
            </Button>
            {generatedPlan && (
              <>
                <Button variant="outline" onClick={handleDownloadPDF}>
                  <Download className="mr-2 h-4 w-4" />PDF
                </Button>
                <Button variant="outline" onClick={handleDownloadJSON}>
                  <FileJson className="mr-2 h-4 w-4" />JSON
                </Button>
              </>
            )}
          </div>
        )}
      </Card>
    </div>
  );
}
