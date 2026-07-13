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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Loader2, AlertCircle, Plus, Save, CheckCircle, Download, FileJson, UserPlus, Copy, ExternalLink, Trash2 } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useAppLayout } from '@/hooks/useAppLayout';
import { NoClientGuard } from '@/components/NoClientGuard';
import { getClientLabel, calculateAgeFromBirthDate } from '@/utils/clientHelpers';
import { generatePersonalizedPlan } from '@/services/planService';
import { generateCompletePlanPDF, downloadPDF, exportPlanAsJSON, downloadJSON } from '@/utils/pdfExport';
import { createClientInvitation } from '@/services/clientInvitationService';
import { saveTrainingPlan } from '@/services/supabaseTrainingPlanService';
import type { Client, CompletePlan, Recipe } from '@/types';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ClientPage() {
  const {
    clients,
    activeClientId,
    activeClient,
    isLoadingClients,
    clientError,
    handleCreateClient,
    handleDeleteClient: deleteClientFromHook,
    createNewClientDraft,
    clientRestrictions,
    generatedPlan,
    setGeneratedPlan,
  } = useAppLayout();

  const [draftClient, setDraftClient] = useState<Client | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [emailError, setEmailError] = useState<string | null>(null);
  const { toast } = useToast();

  // Invitation state
  const [isCreatingInvite, setIsCreatingInvite] = useState(false);
  const [inviteDialogOpen, setInviteDialogOpen] = useState(false);
  const [inviteLink, setInviteLink] = useState<string | null>(null);

  // Delete state
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);

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
  const handleCancelNewClient = () => {
    setDraftClient(null);
    setEmailError(null);
  };

  const validateEmail = (email: string): boolean => {
    if (!email.trim()) return true; // email is optional during creation
    if (!EMAIL_REGEX.test(email.trim())) {
      setEmailError('Please enter a valid email address');
      return false;
    }
    setEmailError(null);
    return true;
  };

  const handleSaveClient = async () => {
    if (!draftClient) return;

    // Validate email if provided
    if (!validateEmail(draftClient.email)) return;

    const result = await handleCreateClient(draftClient);
    if (result.success && result.client) {
      setDraftClient(null);
      setEmailError(null);
      toast({ title: "Client saved", description: "Client has been saved to the database." });
    } else {
      toast({ title: "Error", description: result.error || "Unable to save client", variant: "destructive" });
    }
  };

  const handleInviteClient = async () => {
    if (!activeClientId) return;
    setIsCreatingInvite(true);
    try {
      const result = await createClientInvitation({
        clientId: activeClientId,
        invitedEmail: activeClient?.email || null,
      });
      if (result.error || !result.inviteUrl) {
        toast({ title: "Invitation failed", description: result.error || "Unable to create invitation", variant: "destructive" });
      } else {
        setInviteLink(result.inviteUrl);
        setInviteDialogOpen(true);
        toast({ title: "Invitation created", description: "Invite link has been generated." });
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to create invitation";
      toast({ title: "Invitation error", description: msg, variant: "destructive" });
    } finally {
      setIsCreatingInvite(false);
    }
  };

  const handleCopyInviteLink = () => {
    if (!inviteLink) return;
    navigator.clipboard.writeText(inviteLink).then(() => {
      toast({ title: "Copied", description: "Invite link copied to clipboard." });
    }).catch(() => {
      toast({ title: "Copy failed", description: "Unable to copy to clipboard, please select and copy manually.", variant: "destructive" });
    });
  };

  const handleOpenInviteLink = () => {
    if (!inviteLink) return;
    window.open(inviteLink, '_blank', 'noopener,noreferrer');
  };

  const handleConfirmDelete = async () => {
    if (!activeClientId) return;
    setIsDeleting(true);
    try {
      const result = await deleteClientFromHook(activeClientId);
      setDeleteDialogOpen(false);
      if (result.success) {
        toast({
          title: 'Client deleted',
          description: `${activeClient ? getClientLabel(activeClient) : 'Client'} has been removed from your list.`,
        });
      } else {
        toast({
          title: 'Delete failed',
          description: result.error || 'Unable to delete client',
          variant: 'destructive',
        });
      }
    } finally {
      setIsDeleting(false);
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

      // Persist the training plan to the database so the client portal can
      // read it. The nutrition plan is persisted separately on lock.
      const trainingResult = await saveTrainingPlan(activeClientId, plan.trainingPlan);
      if (!trainingResult.success) {
        toast({
          title: "Training plan not saved",
          description: trainingResult.error || "Client portal will not show the training plan until this is resolved.",
          variant: "destructive",
        });
      }

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
          <Button onClick={handleStartNewClient}>
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

      {/* Invitation success dialog */}
      <Dialog open={inviteDialogOpen} onOpenChange={setInviteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <CheckCircle className="h-5 w-5 text-green-500" />
              Invitation created
            </DialogTitle>
            <DialogDescription>
              Share this link with {activeClient?.firstName || 'the client'} to give them access to their client portal.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="bg-muted p-3 rounded-md break-all text-sm font-mono">
              {inviteLink}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleCopyInviteLink} className="flex-1">
                <Copy className="mr-2 h-4 w-4" />
                Copy Invite Link
              </Button>
              <Button variant="outline" onClick={handleOpenInviteLink} className="flex-1">
                <ExternalLink className="mr-2 h-4 w-4" />
                Open Invite Link
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation dialog */}
      <Dialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Delete client
            </DialogTitle>
            <DialogDescription>
              This will archive {activeClient ? getClientLabel(activeClient) : 'this client'} and revoke any
              pending invitations. Their plan history and progress entries are preserved. This cannot
              be undone from the coach UI.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteDialogOpen(false)} disabled={isDeleting}>
              Cancel
            </Button>
            <Button variant="destructive" onClick={handleConfirmDelete} disabled={isDeleting}>
              {isDeleting ? (
                <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Deleting...</>
              ) : (
                <><Trash2 className="mr-2 h-4 w-4" />Delete client</>
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="p-6 shadow-card">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <h2 className="text-2xl font-bold text-primary">
              {isCreatingNewClient ? 'New Client' : `Client: ${activeClient ? getClientLabel(activeClient) : ''}`}
            </h2>
            {!isCreatingNewClient && hasActiveClient && (
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-sm border border-primary/40 text-primary text-[10px] font-semibold font-display uppercase tracking-[0.08em]">
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
            {!isCreatingNewClient && hasActiveClient && (
              <Button variant="outline" onClick={handleInviteClient} disabled={isCreatingInvite}>
                {isCreatingInvite ? (
                  <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Creating...</>
                ) : (
                  <><UserPlus className="mr-2 h-4 w-4" />Invite Client</>
                )}
              </Button>
            )}
            {!isCreatingNewClient && hasActiveClient && (
              <Button
                variant="outline"
                onClick={() => setDeleteDialogOpen(true)}
                className="text-destructive border-destructive/40 hover:bg-destructive/10 hover:text-destructive"
              >
                <Trash2 className="mr-2 h-4 w-4" />
                Delete
              </Button>
            )}
            {isCreatingNewClient && (
              <>
                <Button variant="outline" onClick={handleCancelNewClient}>Cancel</Button>
                <Button onClick={handleSaveClient}>
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
            <Label htmlFor="email">Email</Label>
            <Input id="email" type="email" value={editingClient?.email || ''} onChange={e => { handleInputChange('email', e.target.value); if (emailError) setEmailError(null); }} className="mt-1" disabled={!isCreatingNewClient} placeholder="client@example.com" />
            {emailError && <p className="text-xs text-destructive mt-1">{emailError}</p>}
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
            <Button onClick={handleGeneratePlan} disabled={isGenerating}>
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