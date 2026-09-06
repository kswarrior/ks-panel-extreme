import React from 'react';
import IconColorPicker from '@/shared/components/ui/IconColorPicker';
import { Label, Text } from '@/theme/studioControls';

interface ThemeTabProps {
  name: string;
  description: string;
  icon: string;
  color: string;
  onNameChange: (v: string) => void;
  onDescriptionChange: (v: string) => void;
  onIconChange: (v: string) => void;
  onColorChange: (v: string) => void;
}

// ThemeTab — the theme's identity section (previously an always-visible
// header card above the tab content). Holds Name + note + the Themes-grid
// card icon & colour so all non-visual theme metadata lives in one tab,
// matching the Node / Instance / Template "General" pattern.
export const ThemeTab: React.FC<ThemeTabProps> = ({
  name,
  description,
  icon,
  color,
  onNameChange,
  onDescriptionChange,
  onIconChange,
  onColorChange,
}) => {
  return (
    <div className="space-y-4">
      <div className="ks-form-card rounded-lg space-y-4">
        <Label label="Theme" hint="Name and note shown on the Themes grid. The name is required to save." />
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <Text
            label="Name"
            value={name}
            onChange={onNameChange}
            placeholder="My Theme"
          />
          <Text
            label="Note"
            value={description}
            onChange={onDescriptionChange}
            placeholder="A short note about this theme."
          />
        </div>
      </div>

      <div className="ks-form-card rounded-lg space-y-3">
        <Label
          label="Card icon & colour"
          hint="Shown on the Themes grid (same tile as nodes / instances)."
        />
        <IconColorPicker
          icon={icon}
          color={color}
          onIconChange={onIconChange}
          onColorChange={onColorChange}
          previewName={name || 'Theme'}
        />
      </div>
    </div>
  );
};
