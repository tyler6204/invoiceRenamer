'use client'

import React, { useState, useEffect } from "react";
import Head from "next/head";
import Header from "@/components/header";
import DragAndDrop from "@/components/dragAndDrop";
import ResultsComponent from "@/components/results";
import RenamingSettings, { RenamingSettings as RenamingSettingsType } from "@/components/renamingSettings";
import AuthCheck from "@/components/authCheck";
import { Results } from "@/functions/processFile/route";
import { models } from "@/lib/models";
import { UpdateNotification } from "@/components/updateNotification";
// App state interface to centralize state management
interface AppState {
    results: Results | null;
    isProcessing: boolean;
    processingFiles: File[];
    selectedModel: string;
    renamingSettings: RenamingSettingsType;
    error: string | null;  // Add error state
}

export default function HomePage() {
    // Use a single state object instead of multiple useState calls
    const [appState, setAppState] = useState<AppState>({
        results: null,
        isProcessing: false,
        processingFiles: [],
        selectedModel: models[0].apiName,
        renamingSettings: {
            backup: false,
            company: 'Acustuct'
        },
        error: null
    });
    
    // Add error boundary effect
    useEffect(() => {
        // Log component mount to help debug rendering issues
        console.log('HomePage component mounted');
        
        // Log to both console and our custom logger if available
        const log = (message: string) => {
            console.log(message);
            if (window.ipc?.log) {
                window.ipc.log(message);
            }
        }
        
        log('Renderer process started');
        log(`Environment: ${process.env.NODE_ENV}`);
        
        // Setup global error handler
        const errorHandler = (event: ErrorEvent) => {
            const errorMsg = `Runtime error: ${event.message} at ${event.filename}:${event.lineno}`;
            log(errorMsg);
            setAppState(prev => ({ ...prev, error: errorMsg }));
            event.preventDefault();
        };
        
        window.addEventListener('error', errorHandler);
        
        // Test IPC is working
        if (window.ipc) {
            log('IPC is available');
        } else {
            log('IPC is NOT available - this indicates preload script issues');
        }
        
        return () => {
            window.removeEventListener('error', errorHandler);
        };
    }, []);

    // Utility functions to update specific parts of the state
    const updateResults = (results: Results) => {
        setAppState(prev => ({ ...prev, results }));
    };

    const updateIsProcessing = (isProcessing: boolean) => {
        setAppState(prev => ({ ...prev, isProcessing }));
    };

    const updateProcessingFiles = (processingFiles: File[]) => {
        setAppState(prev => ({ ...prev, processingFiles }));
    };

    const updateSelectedModel = (selectedModel: string) => {
        setAppState(prev => ({ ...prev, selectedModel }));
    };

    const updateRenamingSettings = (renamingSettings: RenamingSettingsType) => {
        setAppState(prev => ({ ...prev, renamingSettings }));
    };

    const { results, isProcessing, processingFiles, selectedModel, renamingSettings, error } = appState;

    // If we have an error, show it prominently
    if (error) {
        return (
            <div className="flex flex-col items-center justify-center h-screen p-4 bg-red-50">
                <div className="bg-white p-6 rounded-lg shadow-lg max-w-md w-full">
                    <h1 className="text-xl font-bold text-red-600 mb-4">Application Error</h1>
                    <p className="text-gray-800 mb-4">{error}</p>
                    <button 
                        className="bg-blue-500 text-white px-4 py-2 rounded hover:bg-blue-600"
                        onClick={() => setAppState(prev => ({ ...prev, error: null }))}
                    >
                        Try Again
                    </button>
                </div>
            </div>
        );
    }

    return (
        <AuthCheck>
            <React.Fragment>
                <Head>
                    <title>Invoice Renamer</title>
                </Head>

                <div className="flex flex-col h-screen gap-4 ">
                    <Header 
                        selectedModel={selectedModel}
                        setSelectedModel={updateSelectedModel}
                    />

                    <main className="flex-grow px-4 flex flex-col gap-6">
                        <div className="grid grid-cols-1 gap-6">
                            <div className="md:col-span-2">
                                {/* Drag and drop area */}
                                <DragAndDrop 
                                    results={results} 
                                    setResults={updateResults} 
                                    isProcessing={isProcessing} 
                                    setIsProcessing={updateIsProcessing}
                                    selectedModel={selectedModel}
                                    renamingSettings={renamingSettings}
                                    setProcessingFiles={updateProcessingFiles}
                                />
                            </div>
                            {/* Renaming settings */}
                            <RenamingSettings 
                                settings={renamingSettings}
                                onSettingsChange={updateRenamingSettings}
                            />
                        </div>

                        {/* Results area (handles both processing and completed states) */}
                        <ResultsComponent 
                            results={results} 
                            isProcessing={isProcessing}
                            processingCount={processingFiles.length}
                        />
                    </main>
                </div>
            </React.Fragment>
            <UpdateNotification />
        </AuthCheck>
    );
}
