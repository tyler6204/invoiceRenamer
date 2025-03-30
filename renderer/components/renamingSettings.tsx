// option to toggle backup
// option to company (Acustuct or Delta)
//should talk to the processFile route in drag and drop to pass in the settings

import { useState, useEffect } from 'react';
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

export interface RenamingSettings {
  backup: boolean;
  company: 'Acustuct' | 'Delta';
}

// Default settings if nothing is saved
const defaultSettings: RenamingSettings = {
  backup: false,
  company: 'Acustuct'
};

interface RenamingSettingsProps {
  settings: RenamingSettings;
  onSettingsChange: (settings: RenamingSettings) => void;
}

export default function RenamingSettings({ settings, onSettingsChange }: RenamingSettingsProps) {
  const { backup, company } = settings;
  
  // Load saved settings from localStorage on mount
  useEffect(() => {
    try {
      const savedSettings = localStorage.getItem('renamingSettings');
      if (savedSettings) {
        const parsedSettings = JSON.parse(savedSettings) as RenamingSettings;
        // Validate the saved company value
        if (parsedSettings.company !== 'Acustuct' && parsedSettings.company !== 'Delta') {
          parsedSettings.company = defaultSettings.company;
        }
        
        // Only update if the values are actually different
        if (parsedSettings.company !== settings.company || 
            parsedSettings.backup !== settings.backup) {
          onSettingsChange(parsedSettings);
        }
      }
    } catch (error) {
      console.error('Error loading saved settings:', error);
    }
  // Run this effect only once when the component mounts
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  
  // Save settings to localStorage when they change
  const handleSettingsChange = (newSettings: RenamingSettings) => {
    localStorage.setItem('renamingSettings', JSON.stringify(newSettings));
    onSettingsChange(newSettings);
  };
  
  return (
    <div className="space-y-6 p-4 border rounded-lg">
       <div className="flex items-center justify-between">
        <Label>Company</Label>
        <Select 
          value={company}
          onValueChange={(value: 'Acustuct' | 'Delta') => 
            handleSettingsChange({ ...settings, company: value })
          }
        >
          <SelectTrigger className="w-auto">
            <SelectValue placeholder="Select company" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="Acustuct">Acustuct</SelectItem>
            <SelectItem value="Delta">Delta</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between">
        <Label>Backup</Label>

        <Switch
          checked={backup}
          onCheckedChange={(checked) => 
            handleSettingsChange({ ...settings, backup: checked })
          }
        />
      </div>
      
    </div>
  );
}