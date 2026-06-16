'use client';
import React from 'react';
import { Plus, Trash2, GripVertical } from 'lucide-react';

export interface ModifierOption {
  name: string;
  price: number;
}

export interface ModifierGroup {
  name: string;
  isRequired: boolean;
  min: number;
  max: number;
  options: ModifierOption[];
}

interface ModifierBuilderProps {
  groups: ModifierGroup[];
  onChange: (groups: ModifierGroup[]) => void;
}

export default function ModifierBuilder({ groups, onChange }: ModifierBuilderProps) {
  const deepClone = (obj: any) => JSON.parse(JSON.stringify(obj));

  const addGroup = () => {
    onChange([
      ...groups,
      { name: '', isRequired: false, min: 0, max: 1, options: [{ name: '', price: 0 }] }
    ]);
  };

  const updateGroup = (idx: number, field: keyof ModifierGroup, value: any) => {
    const newGroups = deepClone(groups);
    newGroups[idx][field] = value;
    // Auto-adjust min/max based on isRequired
    if (field === 'isRequired') {
      if (value === true && newGroups[idx].min === 0) newGroups[idx].min = 1;
      if (value === false) newGroups[idx].min = 0;
    }
    onChange(newGroups);
  };

  const removeGroup = (idx: number) => {
    onChange(groups.filter((_, i) => i !== idx));
  };

  const addOption = (groupIdx: number) => {
    const newGroups = deepClone(groups);
    newGroups[groupIdx].options.push({ name: '', price: 0 });
    onChange(newGroups);
  };

  const updateOption = (groupIdx: number, optionIdx: number, field: keyof ModifierOption, value: any) => {
    const newGroups = deepClone(groups);
    newGroups[groupIdx].options[optionIdx][field] = value;
    onChange(newGroups);
  };

  const removeOption = (groupIdx: number, optionIdx: number) => {
    const newGroups = deepClone(groups);
    newGroups[groupIdx].options = newGroups[groupIdx].options.filter((_: any, i: number) => i !== optionIdx);
    onChange(newGroups);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between mb-2">
        <div>
          <h4 className="font-bold text-gray-800 text-sm">Modifier Groups (Optional)</h4>
          <p className="text-xs text-gray-500">Add crusts, toppings, or dietary options</p>
        </div>
        <button
          type="button"
          onClick={addGroup}
          className="flex items-center gap-1 px-3 py-1.5 bg-indigo-50 text-indigo-600 rounded-lg text-sm font-semibold hover:bg-indigo-100 transition-colors"
        >
          <Plus size={16} /> Add Group
        </button>
      </div>

      {groups.length === 0 && (
        <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-xl text-gray-400 text-sm">
          No modifiers added. Click "Add Group" to create options like "Crust Type" or "Add-ons".
        </div>
      )}

      {groups.map((group, gIdx) => (
        <div key={gIdx} className="bg-gray-50 border border-gray-200 rounded-xl p-4 relative">
          <div className="absolute top-4 right-4">
            <button
              type="button"
              onClick={() => removeGroup(gIdx)}
              className="text-gray-400 hover:text-red-500 transition-colors"
            >
              <Trash2 size={18} />
            </button>
          </div>

          <div className="grid grid-cols-12 gap-3 mb-4 pr-8">
            <div className="col-span-12 md:col-span-6">
              <label className="text-xs font-bold text-gray-500 uppercase">Group Name</label>
              <input
                type="text"
                value={group.name}
                onChange={(e) => updateGroup(gIdx, 'name', e.target.value)}
                placeholder="e.g. Crust Type, Add-ons"
                className="w-full mt-1 px-3 py-2 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                required
              />
            </div>
            
            <div className="col-span-6 md:col-span-3 flex items-center mt-6">
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={group.isRequired}
                  onChange={(e) => updateGroup(gIdx, 'isRequired', e.target.checked)}
                  className="w-4 h-4 text-indigo-600 rounded border-gray-300 focus:ring-indigo-500"
                />
                <span className="text-sm font-semibold text-gray-700">Required</span>
              </label>
            </div>

            <div className="col-span-6 md:col-span-3 flex items-center gap-2 mt-6">
               <span className="text-xs font-bold text-gray-500 uppercase">Max Picks:</span>
               <input
                 type="number" min="1"
                 value={group.max}
                 onChange={(e) => updateGroup(gIdx, 'max', parseInt(e.target.value) || 1)}
                 className="w-16 px-2 py-1 border border-gray-300 rounded text-sm text-center"
               />
            </div>
          </div>

          <div className="bg-white border border-gray-200 rounded-lg p-3">
            <h5 className="text-xs font-bold text-gray-500 uppercase mb-2">Options</h5>
            {group.options.map((option, oIdx) => (
              <div key={oIdx} className="flex items-center gap-3 mb-2">
                <GripVertical size={16} className="text-gray-300 cursor-grab" />
                <input
                  type="text"
                  value={option.name}
                  onChange={(e) => updateOption(gIdx, oIdx, 'name', e.target.value)}
                  placeholder="Option Name (e.g. Pan Base)"
                  className="flex-1 px-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                  required
                />
                <div className="relative w-28">
                  <span className="absolute left-3 top-1.5 text-gray-500 text-sm">$</span>
                  <input
                    type="number" step="0.01" min="0"
                    value={option.price}
                    onChange={(e) => updateOption(gIdx, oIdx, 'price', parseFloat(e.target.value) || 0)}
                    className="w-full pl-6 pr-3 py-1.5 border border-gray-300 rounded-lg text-sm focus:outline-none focus:border-indigo-500"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => removeOption(gIdx, oIdx)}
                  disabled={group.options.length === 1}
                  className={`p-1.5 rounded-md ${group.options.length === 1 ? 'text-gray-200' : 'text-gray-400 hover:bg-red-50 hover:text-red-500'} transition-colors`}
                >
                  <Trash2 size={16} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={() => addOption(gIdx)}
              className="mt-1 text-xs font-bold text-indigo-600 hover:text-indigo-800 flex items-center gap-1 p-1"
            >
              <Plus size={12} /> Add another option
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
