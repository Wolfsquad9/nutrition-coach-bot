/**
 * Reusable client selector dropdown with human-readable labels
 */

import { Client } from '@/types';
import { Label } from '@/components/ui/label';
import { 
  Select, 
  SelectContent, 
  SelectItem, 
  SelectTrigger, 
  SelectValue 
} from '@/components/ui/select';
import { getClientLabel } from '@/utils/clientHelpers';

interface ClientSelectorProps {
  clients: Client[];
  activeClientId: string | null;
  onClientChange: (clientId: string) => void;
  label?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ClientSelector({
  clients,
  activeClientId,
  onClientChange,
  label = 'Sélectionner un client',
  placeholder = 'Choisir un client',
  disabled = false,
  className = '',
}: ClientSelectorProps) {
  if (clients.length === 0) {
    return null;
  }

  return (
    <div className={className}>
      {label && <Label className="mb-2 block">{label}</Label>}
      <Select 
        value={activeClientId || ''} 
        onValueChange={onClientChange}
        disabled={disabled}
      >
        <SelectTrigger className="mt-1 bg-background">
          <SelectValue placeholder={placeholder} />
        </SelectTrigger>
        <SelectContent className="bg-background border border-border z-50">
          {clients.map(client => (
            <SelectItem 
              key={client.id} 
              value={client.id}
              className="hover:bg-muted"
            >
              {getClientLabel(client)}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
