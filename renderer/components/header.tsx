import React, { useEffect } from 'react';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"; // Assuming shadcn select is setup here
import { models } from "@/lib/models";
import Image from "next/image";

interface HeaderProps {
    selectedModel: string;
    setSelectedModel: (model: string) => void;
}

export default function Header({ selectedModel, setSelectedModel }: HeaderProps) {
    // Load saved model preference from localStorage on mount
    useEffect(() => {
        const savedModel = localStorage.getItem('selectedModel');
        if (savedModel && savedModel !== selectedModel) {
            // Verify the saved model is still in our available models list
            const isValidModel = models.some(model => model.apiName === savedModel);
            if (isValidModel) {
                setSelectedModel(savedModel);
            }
        }
    // Run this effect only once when the component mounts
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Save model preference to localStorage when it changes
    const handleModelChange = (value: string) => {
        localStorage.setItem('selectedModel', value);
        setSelectedModel(value);
    };

    return (
        <header className="flex items-center justify-between p-4 border-b">
            <div className="flex items-center space-x-2">   
                <Image src="/images/logo.png" alt="Invoice Renamer" width={32} height={32} />
                <h1 className="text-2xl font-semibold">Invoice Renamer</h1>
            </div>
            <div className="flex items-center space-x-2">
                 <Select
                    onValueChange={handleModelChange}
                    value={selectedModel}
                 >
                     <SelectTrigger >
                         <SelectValue placeholder="Select a model"/>
                     </SelectTrigger>
                     <SelectContent>
                         {models.map((model) => (
                             <SelectItem key={model.apiName} value={model.apiName}>
                                 {model.displayName}
                             </SelectItem>
                         ))}
                     </SelectContent>
                 </Select>
            </div>
        </header>
    );
}
