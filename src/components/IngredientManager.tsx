import React, { useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Search, Check, X, Filter, Download, Upload } from 'lucide-react';
import { coreIngredients, type IngredientData } from '@/data/ingredientDatabase';
import { Client } from '@/types';

interface ClientIngredientRestrictions {
  clientId: string;
  clientName: string;
  blockedIngredients: string[];
  preferredIngredients: string[];
  substitutionRules: {
    [ingredientId: string]: string[]; // Alternative ingredient IDs
  };
}

interface IngredientManagerProps {
  clients: Client[];
  onRestrictionsUpdate: (restrictions: ClientIngredientRestrictions[]) => void;
}

export default function IngredientManager({ clients, onRestrictionsUpdate }: IngredientManagerProps) {
  const [selectedClient, setSelectedClient] = useState<string>('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [clientRestrictions, setClientRestrictions] = useState<ClientIngredientRestrictions[]>([]);

  const categories = ['all', 'protein', 'carbohydrate', 'fat', 'fruit', 'vegetable', 'misc'];

  const filteredIngredients = coreIngredients.filter(ingredient => {
    const matchesSearch = ingredient.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
                          ingredient.tags.some(tag => tag.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || ingredient.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  const getClientRestriction = (clientId: string) => {
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

    // Remove from all lists first
    newRestriction.blockedIngredients = newRestriction.blockedIngredients.filter(id => id !== ingredientId);
    newRestriction.preferredIngredients = newRestriction.preferredIngredients.filter(id => id !== ingredientId);

    // Add to appropriate list
    if (status === 'blocked') {
      newRestriction.blockedIngredients.push(ingredientId);
    } else if (status === 'preferred') {
      newRestriction.preferredIngredients.push(ingredientId);
    }

    const newRestrictions = clientRestrictions.filter(r => r.clientId !== selectedClient);
    newRestrictions.push(newRestriction);
    setClientRestrictions(newRestrictions);
    onRestrictionsUpdate(newRestrictions);
  };

  const getIngredientStatus = (ingredientId: string): 'blocked' | 'preferred' | 'neutral' => {
    if (!selectedClient) return 'neutral';
    const restriction = getClientRestriction(selectedClient);
    if (restriction.blockedIngredients.includes(ingredientId)) return 'blocked';
    if (restriction.preferredIngredients.includes(ingredientId)) return 'preferred';
    return 'neutral';
  };

  const exportRestrictions = () => {
    const dataStr = JSON.stringify(clientRestrictions, null, 2);
    const dataUri = 'data:application/json;charset=utf-8,'+ encodeURIComponent(dataStr);
    const exportFileDefaultName = 'client_ingredient_restrictions.json';
    const linkElement = document.createElement('a');
    linkElement.setAttribute('href', dataUri);
    linkElement.setAttribute('download', exportFileDefaultName);
    linkElement.click();
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
        } catch (error) {
          console.error('Import error:', error);
        }
      };
      reader.readAsText(file);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <CardTitle>Gestion des Ingrédients par Client</CardTitle>
        <div className="flex gap-4 mt-4">
          <select
            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
            value={selectedClient}
            onChange={(e) => setSelectedClient(e.target.value)}
          >
            <option value="">Sélectionner un client</option>
            {clients.map(client => (
              <option key={client.id} value={client.id}>
                {client.firstName} {client.lastName}
              </option>
            ))}
          </select>
          <Button
            variant="outline"
            size="icon"
            onClick={exportRestrictions}
            title="Exporter les restrictions"
          >
            <Download className="h-4 w-4" />
          </Button>
          <Label htmlFor="import-file" className="cursor-pointer">
            <Button variant="outline" size="icon" asChild>
              <span>
                <Upload className="h-4 w-4" />
              </span>
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
      </CardHeader>
      <CardContent>
        {selectedClient ? (
          <>
            <div className="mb-4 space-y-4">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                <Input
                  placeholder="Rechercher un ingrédient..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="pl-10"
                />
              </div>
              
              <Tabs value={selectedCategory} onValueChange={setSelectedCategory}>
                <TabsList className="grid grid-cols-7 w-full">
                  {categories.map(cat => (
                    <TabsTrigger key={cat} value={cat}>
                      {cat === 'all' ? 'Tous' : cat.charAt(0).toUpperCase() + cat.slice(1)}
                    </TabsTrigger>
                  ))}
                </TabsList>
              </Tabs>

              <div className="grid grid-cols-2 gap-4 text-sm">
                <div className="flex items-center gap-2">
                  <Badge variant="destructive">Bloqué</Badge>
                  <span className="text-muted-foreground">Ne sera pas utilisé dans les recettes</span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge className="bg-green-500">Préféré</Badge>
                  <span className="text-muted-foreground">Prioritaire dans les suggestions</span>
                </div>
              </div>
            </div>

            <ScrollArea className="h-[400px] pr-4">
              <div className="space-y-2">
                {filteredIngredients.map(ingredient => {
                  const status = getIngredientStatus(ingredient.id);
                  return (
                    <div
                      key={ingredient.id}
                      className={`p-3 rounded-lg border ${
                        status === 'blocked' ? 'border-destructive bg-destructive/10' :
                        status === 'preferred' ? 'border-green-500 bg-green-500/10' :
                        'border-border'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex-1">
                          <div className="font-medium">{ingredient.name}</div>
                          <div className="text-sm text-muted-foreground">
                            {ingredient.macros.protein.toFixed(1)}g P | {ingredient.macros.carbs.toFixed(1)}g C | {ingredient.macros.fat.toFixed(1)}g F | {Math.round(ingredient.macros.calories)} kcal
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
                            className={status === 'preferred' ? 'bg-green-500 hover:bg-green-600' : ''}
                            onClick={() => toggleIngredientStatus(ingredient.id, status === 'preferred' ? 'neutral' : 'preferred')}
                          >
                            <Check className="h-3 w-3" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </ScrollArea>

            {selectedClient && (
              <div className="mt-4 p-3 bg-muted rounded-lg">
                <div className="text-sm">
                  <div className="font-medium mb-2">Résumé pour ce client:</div>
                  <div className="grid grid-cols-2 gap-2">
                    <div>Ingrédients bloqués: {getClientRestriction(selectedClient).blockedIngredients.length}</div>
                    <div>Ingrédients préférés: {getClientRestriction(selectedClient).preferredIngredients.length}</div>
                  </div>
                </div>
              </div>
            )}
          </>
        ) : (
          <div className="text-center py-8 text-muted-foreground">
            Sélectionnez un client pour gérer ses restrictions alimentaires
          </div>
        )}
      </CardContent>
    </Card>
  );
}