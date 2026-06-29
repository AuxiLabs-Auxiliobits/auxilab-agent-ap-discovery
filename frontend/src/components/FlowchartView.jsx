import React, { useEffect, useRef, useState } from 'react';
import BpmnModeler from 'bpmn-js/lib/Modeler';
import 'bpmn-js/dist/assets/diagram-js.css';
import 'bpmn-js/dist/assets/bpmn-font/css/bpmn.css';
import { Workflow, Loader2, Download, Upload, Send, Sparkles } from 'lucide-react';

export default function FlowchartView({ scoredSteps, initialXml, assessmentId, onSaveXml }) {
  const containerRef = useRef(null);
  const modelerRef = useRef(null);
  const fileInputRef = useRef(null);
  const isImportingRef = useRef(false);
  const onSaveXmlRef = useRef(onSaveXml);

  const [isLoading, setIsLoading] = useState(false);
  const [isModifying, setIsModifying] = useState(false);
  const [error, setError] = useState(null);
  const [xmlData, setXmlData] = useState(initialXml);
  const [promptText, setPromptText] = useState("");

  // Sync onSaveXml callback ref
  useEffect(() => {
    onSaveXmlRef.current = onSaveXml;
  }, [onSaveXml]);

  // Reset xmlData when assessment changes, or sync if initialXml becomes available
  const lastAssessmentIdRef = useRef(assessmentId);
  useEffect(() => {
    if (lastAssessmentIdRef.current !== assessmentId) {
      lastAssessmentIdRef.current = assessmentId;
      setXmlData(initialXml);
    } else if (initialXml && !xmlData) {
      setXmlData(initialXml);
    }
  }, [assessmentId, initialXml]);

  // Initialize the BPMN Modeler and listen to manual visual edits
  useEffect(() => {
    if (containerRef.current && !modelerRef.current) {
      modelerRef.current = new BpmnModeler({
        container: containerRef.current
      });

      // Auto-save changes with a debounce of 1.5 seconds when manual edits are made
      let debounceTimeout;
      const handleModelerChange = () => {
        if (isImportingRef.current) return;

        clearTimeout(debounceTimeout);
        debounceTimeout = setTimeout(async () => {
          if (!modelerRef.current) return;
          try {
            const { xml } = await modelerRef.current.saveXML({ format: true });
            onSaveXmlRef.current?.(xml);
          } catch (err) {
            console.error("Auto-save failed:", err);
          }
        }, 1500);
      };

      modelerRef.current.on('commandStack.changed', handleModelerChange);
    }

    return () => {
      if (modelerRef.current) {
        modelerRef.current.destroy();
        modelerRef.current = null;
      }
    };
  }, []);

  // Import XML whenever xmlData changes
  useEffect(() => {
    async function renderXml() {
      if (modelerRef.current && xmlData) {
        try {
          isImportingRef.current = true;
          await modelerRef.current.importXML(xmlData);
          isImportingRef.current = false;
          setError(null); // Clear any previous error on successful import

          // Safely zoom to fit-viewport after a short delay to allow DOM/animation to complete
          setTimeout(() => {
            try {
              if (modelerRef.current) {
                const canvas = modelerRef.current.get('canvas');
                if (canvas) {
                  canvas.zoom('fit-viewport');
                }
              }
            } catch (zoomErr) {
              console.warn("Could not zoom canvas to fit-viewport:", zoomErr);
            }
          }, 150);

        } catch (err) {
          isImportingRef.current = false;
          console.error("Could not render BPMN XML", err);
          setError("Failed to render the BPMN diagram. The generated XML might be invalid. Try regenerating.");
        }
      }
    }
    renderXml();
  }, [xmlData]);

  const generateFlowchart = async () => {
    if (!scoredSteps || scoredSteps.length === 0) return;
    
    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch('/api/flowchart/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scored_steps: scoredSteps })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to generate BPMN');

      if (data.status === 'success' && data.data.xml) {
        setXmlData(data.data.xml);
        onSaveXmlRef.current?.(data.data.xml);
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsLoading(false);
    }
  };

  const handleModifyDiagram = async (e) => {
    e.preventDefault();
    if (!promptText.trim() || !modelerRef.current) return;
    
    setIsModifying(true);
    setError(null);

    try {
      // Grab current state of the diagram
      const { xml: currentXml } = await modelerRef.current.saveXML({ format: true });
      
      const res = await fetch('/api/flowchart/modify', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ xml: currentXml, prompt: promptText })
      });

      const data = await res.json();
      if (!res.ok) throw new Error(data.detail || 'Failed to modify BPMN');

      if (data.status === 'success' && data.data.xml) {
        setXmlData(data.data.xml);
        setPromptText("");
        onSaveXmlRef.current?.(data.data.xml);
      } else {
        throw new Error("Invalid response format from server");
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setIsModifying(false);
    }
  };

  const handleDownload = async () => {
    if (!modelerRef.current) return;
    
    try {
      const { xml } = await modelerRef.current.saveXML({ format: true });
      const blob = new Blob([xml], { type: 'application/bpmn20-xml;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      
      const link = document.createElement('a');
      link.href = url;
      link.download = 'process-diagram.bpmn';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error("Could not save BPMN XML", err);
      setError("Failed to export the BPMN diagram.");
    }
  };

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      const xmlStr = evt.target.result;
      setXmlData(xmlStr);
      onSaveXmlRef.current?.(xmlStr);
    };
    reader.onerror = () => {
      setError("Failed to read the uploaded file.");
    };
    reader.readAsText(file);
    
    // Reset input so the same file can be selected again if needed
    if (fileInputRef.current) fileInputRef.current.value = null;
  };

  return (
    <div className="flex flex-col h-[750px] bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-lg relative" style={{ animation: 'fade-in-up 0.5s ease-out 0.2s both' }}>
      {/* Header Bar */}
      <div className="min-h-[4rem] border-b border-slate-200 bg-slate-50 flex flex-col sm:flex-row items-center justify-between px-4 sm:px-6 py-4 sm:py-0 gap-4 z-10 shrink-0">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-indigo-100 flex items-center justify-center">
            <Workflow size={16} className="text-indigo-600" />
          </div>
          <h3 className="text-base font-bold text-slate-800">BPMN Process Diagram</h3>
        </div>

        <div className="flex flex-wrap justify-center items-center gap-2 sm:gap-3">
          <input 
            type="file" 
            ref={fileInputRef} 
            accept=".bpmn,.xml" 
            className="hidden" 
            onChange={handleFileUpload} 
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
          >
            <Upload size={14} />
            Upload .bpmn
          </button>

          {xmlData && (
            <button
              onClick={handleDownload}
              className="flex items-center gap-2 px-4 py-2 rounded-lg bg-white border border-slate-300 text-slate-700 text-sm font-semibold hover:bg-slate-50 transition-colors shadow-sm"
            >
              <Download size={14} />
              Download .bpmn
            </button>
          )}

          <button
            onClick={generateFlowchart}
            disabled={isLoading || scoredSteps.length === 0}
            className="flex items-center gap-2 px-4 py-2 rounded-lg bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 transition-colors disabled:opacity-50 shadow-sm"
          >
            {isLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Workflow size={14} />
            )}
            {isLoading ? 'Generating...' : 'Generate from Process'}
          </button>
        </div>
      </div>

      {/* Error Message */}
      {error && (
        <div className="absolute top-20 left-6 right-6 z-20 p-4 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm font-medium shadow-md flex justify-between items-center">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="text-red-500 hover:text-red-700 font-bold px-2">✕</button>
        </div>
      )}


      {/* AI Prompt Bar */}
      {xmlData && (
        <div className="border-b border-slate-200 bg-slate-50 p-4 shrink-0 z-10">
          <form onSubmit={handleModifyDiagram} className="max-w-4xl mx-auto flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <Sparkles size={16} className="text-indigo-400" />
              </div>
              <input
                type="text"
                value={promptText}
                onChange={(e) => setPromptText(e.target.value)}
                placeholder="Ask AI to modify diagram (e.g. 'Add an approval gateway before step 3')"
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500/50 focus:border-indigo-500 text-slate-800 placeholder-slate-400 shadow-sm transition-all"
                disabled={isModifying}
              />
            </div>
            <button
              type="submit"
              disabled={isModifying || !promptText.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 transition-colors disabled:opacity-50 disabled:cursor-not-allowed shadow-sm"
            >
              {isModifying ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  Updating...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Update
                </>
              )}
            </button>
          </form>
        </div>
      )}

      {/* BPMN Container */}
      <div className="flex-1 relative bg-white">
        {!xmlData && !isLoading && (
          <div className="absolute inset-0 flex flex-col items-center justify-center text-slate-400 bg-slate-50/50">
            <Workflow size={48} className="mb-4 opacity-20" />
            <p className="font-medium text-slate-500">No diagram generated yet.</p>
            <p className="text-sm mt-1">Generate one from your process, or upload an existing .bpmn file.</p>
          </div>
        )}
        
        {/* The bpmn-js canvas attaches here */}
        <div ref={containerRef} className="w-full h-full" />
      </div>


      {/* bpmn-js injects some global styles that might conflict with dark mode, 
          so we force this container to be light themed. */}
      <style dangerouslySetInnerHTML={{__html: `
        .bjs-powered-by { display: none !important; }
      `}} />
    </div>
  );
}
