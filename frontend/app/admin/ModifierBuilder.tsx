'use client';
import React, { useEffect } from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export interface SimpleModifier {
  name: string;
  price: number;
}

interface ModifierBuilderProps {
  groups: any[];
  onChange: (modifiers: SimpleModifier[]) => void;
}

export default function ModifierBuilder({ groups, onChange }: ModifierBuilderProps) {
  // Normalize old complex groups into simple tags if needed
  useEffect(() => {
    if (groups.length > 0 && groups[0].options !== undefined) {
      const flat: SimpleModifier[] = [];
      groups.forEach((g: any) => {
        g.options?.forEach((o: any) => {
          flat.push({ name: o.name, price: o.price });
        });
      });
      onChange(flat);
    }
  }, [groups, onChange]);

  const modifiers: SimpleModifier[] = (groups.length > 0 && groups[0].options !== undefined) ? [] : groups;

  const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj));

  const addModifier = () => {
    onChange([...modifiers, { name: '', price: 0 }]);
  };

  const updateModifier = (idx: number, field: keyof SimpleModifier, value: any) => {
    const newMods = deepClone(modifiers);
    newMods[idx][field] = value;
    onChange(newMods);
  };

  const removeModifier = (idx: number) => {
    onChange(modifiers.filter((_, i) => i !== idx));
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="font-bold text-gray-800 text-sm">Dish Customizations</h4>
          <p className="text-xs text-gray-500">e.g., No Onion, Extra Cheese</p>
        </div>
        <button
          type="button"
          onClick={addModifier}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors"
        >
          <Plus size={16} /> Add Option
        </button>
      </div>

      {modifiers.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
          No customizations added. Click "Add Option" to create tags like "No Garlic" or "Pan Base".
        </div>
      )}

      {modifiers.length > 0 && (
        <div className="bg-white border border-gray-200 rounded-lg p-3 space-y-2">
          {modifiers.map((mod, idx) => (
            <div key={idx} className="flex items-center gap-3">
              <GripVertical size={16} className="text-gray-300 cursor-grab" />
              <input
                type="text"
                value={mod.name}
                onChange={(e) => updateModifier(idx, 'name', e.target.value)}
                placeholder="Option Name (e.g. No Onion)"
                className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                required
              />
              <div className="relative w-28">
                <span className="absolute left-3 top-1.5 text-gray-500 text-sm">$</span>
                <input
                  type="number" step="0.01" min="0"
                  value={mod.price}
                  onChange={(e) => updateModifier(idx, 'price', parseFloat(e.target.value) || 0)}
                  className="w-full pl-6 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                />
              </div>
              <button
                type="button"
                onClick={() => removeModifier(idx)}
                className="p-1.5 rounded-md text-gray-400 hover:bg-red-50 hover:text-red-500 transition-colors"
              >
                <Trash2 size={16} />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
