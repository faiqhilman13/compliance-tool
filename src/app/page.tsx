'use client';

import { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, XCircle, AlertCircle, Loader2, ChevronDown, ChevronRight } from 'lucide-react';
import clsx from 'clsx';

interface Reference {
  id: string;
  name: string;
  isPreloaded: boolean;
  requirementCount: number;
  criticalCount: number;
  createdAt: string;
}

interface EvaluationFile {
  id: string;
  fileName: string;
  score: number | null;
  results: RequirementResult[];
}

interface RequirementResult {
  requirementId: string;
  requirementText: string;
  criticality: string;
  evidenceNeeded: string;
  status: string;
  confidence: number;
  evidence: string | null;
  explanation: string | null;
}

interface EvaluationResult {
  id: string;
  status: string;
  overallScore: number | null;
  summary: string | null;
  reference: { id: string; name: string };
  submittedFiles: EvaluationFile[];
}

export default function Home() {
  const [step, setStep] = useState<'select-reference' | 'upload-files' | 'processing' | 'results'>('select-reference');
  const [references, setReferences] = useState<Reference[]>([]);
  const [selectedReference, setSelectedReference] = useState<Reference | null>(null);
  const [files, setFiles] = useState<File[]>([]);
  const [uploading, setUploading] = useState(false);
  const [evaluationId, setEvaluationId] = useState<string | null>(null);
  const [result, setResult] = useState<EvaluationResult | null>(null);
  const [expandedFiles, setExpandedFiles] = useState<Set<string>>(new Set());
  const [recentEvaluations, setRecentEvaluations] = useState<EvaluationResult[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    loadReferences();
    loadRecentEvaluations();
  }, []);

  useEffect(() => {
    if (step === 'processing' && evaluationId) {
      const pollInterval = setInterval(async () => {
        try {
          const res = await fetch(`/api/evaluation/${evaluationId}`);
          const data = await res.json();
          if (data.status === 'COMPLETED' || data.status === 'FAILED') {
            setResult(data);
            setStep('results');
            clearInterval(pollInterval);
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 3000);

      return () => clearInterval(pollInterval);
    }
  }, [step, evaluationId]);

  const loadReferences = async () => {
    try {
      const res = await fetch('/api/reference');
      const data = await res.json();
      setReferences(data);
    } catch (error) {
      console.error('Failed to load references:', error);
    }
  };

  const loadRecentEvaluations = async () => {
    try {
      const res = await fetch('/api/evaluation');
      const data = await res.json();
      setRecentEvaluations(data);
    } catch (error) {
      console.error('Failed to load evaluations:', error);
    }
  };

  const handleReferenceSelect = (ref: Reference) => {
    setSelectedReference(ref);
    setStep('upload-files');
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const newFiles = Array.from(e.target.files).slice(0, 5 - files.length);
      setFiles(prev => [...prev, ...newFiles].slice(0, 5));
    }
  };

  const handleUploadReference = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const formData = new FormData(e.currentTarget);
    const file = formData.get('file') as File;
    
    if (!file) return;

    setUploading(true);
    try {
      const res = await fetch('/api/reference', {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) throw new Error('Upload failed');

      const data = await res.json();
      await loadReferences();
      
      setSelectedReference({
        id: data.id,
        name: data.name,
        isPreloaded: false,
        requirementCount: data.requirementCount,
        criticalCount: data.requirements?.filter((r: { criticality: string }) => r.criticality === 'CRITICAL').length || 0,
        createdAt: new Date().toISOString(),
      });
      setStep('upload-files');
    } catch (error) {
      console.error('Upload error:', error);
      alert('Failed to upload reference document');
    } finally {
      setUploading(false);
    }
  };

  const handleStartEvaluation = async () => {
    if (!selectedReference || files.length === 0) return;

    setUploading(true);
    try {
      const uploadPromises = files.map(async (file) => {
        const formData = new FormData();
        formData.append('file', file);
        
        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });
        
        if (!res.ok) throw new Error('Upload failed');
        return res.json();
      });

      const uploadedFiles = await Promise.all(uploadPromises);

      const evalRes = await fetch('/api/evaluation', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          referenceId: selectedReference.id,
          fileNames: files.map(f => f.name),
          fileKeys: uploadedFiles.map((f: { key: string }) => f.key),
        }),
      });

      if (!evalRes.ok) throw new Error('Failed to start evaluation');

      const evalData = await evalRes.json();
      setEvaluationId(evalData.id);
      setStep('processing');
    } catch (error) {
      console.error('Evaluation error:', error);
      alert('Failed to start evaluation');
    } finally {
      setUploading(false);
    }
  };

  const getScoreColor = (score: number | null) => {
    if (score === null) return 'text-gray-500';
    if (score >= 80) return 'text-green-700';
    if (score >= 60) return 'text-yellow-700';
    return 'text-red-700';
  };

  const getStatusBadge = (status: string) => {
    const styles = {
      PASS: 'bg-green-200 text-green-900',
      FAIL: 'bg-red-200 text-red-900',
      PARTIAL: 'bg-yellow-200 text-yellow-900',
      NOT_FOUND: 'bg-gray-200 text-gray-800',
    };
    return styles[status as keyof typeof styles] || 'bg-gray-200 text-gray-800';
  };

  const getCriticalityBadge = (criticality: string) => {
    const styles = {
      CRITICAL: 'bg-red-200 text-red-900',
      MAJOR: 'bg-orange-200 text-orange-900',
      MINOR: 'bg-blue-200 text-blue-900',
    };
    return styles[criticality as keyof typeof styles] || 'bg-gray-200 text-gray-800';
  };

  return (
    <div className="space-y-8">
      {step === 'select-reference' && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Upload New Reference Document</h2>
            <form onSubmit={handleUploadReference} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Document Name
                </label>
                <input
                  type="text"
                  name="name"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                  placeholder="e.g., ISO 27001 Compliance Standard"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Reference Document (PDF, DOCX)
                </label>
                <input
                  type="file"
                  name="file"
                  accept=".pdf,.docx,.doc"
                  required
                  className="w-full px-3 py-2 border border-gray-300 rounded-md"
                />
              </div>
              <button
                type="submit"
                disabled={uploading}
                className="flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {uploading ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Processing...
                  </>
                ) : (
                  <>
                    <Upload className="w-4 h-4 mr-2" />
                    Upload & Extract Requirements
                  </>
                )}
              </button>
            </form>
          </div>

          {references.length > 0 && (
            <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
              <h2 className="text-xl font-bold text-gray-900 mb-4">Or Select Existing Reference</h2>
              <div className="space-y-3">
                {references.map(ref => (
                  <button
                    key={ref.id}
                    onClick={() => handleReferenceSelect(ref)}
                    className="w-full flex items-center justify-between p-4 border border-gray-300 rounded-lg hover:border-blue-500 hover:bg-blue-50 transition"
                  >
                    <div className="flex items-center gap-3">
                      <FileText className="w-5 h-5 text-gray-600" />
                      <div className="text-left">
                        <div className="font-medium text-gray-900">{ref.name}</div>
                        <div className="text-sm text-gray-700">
                          {ref.requirementCount} requirements • {ref.criticalCount} critical
                        </div>
                      </div>
                    </div>
                    <ChevronRight className="w-5 h-5 text-gray-600" />
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {step === 'upload-files' && selectedReference && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Selected Reference</h2>
              <button
                onClick={() => setStep('select-reference')}
                className="text-sm text-blue-600 hover:underline"
              >
                Change
              </button>
            </div>
            <div className="flex items-center gap-3 p-3 bg-gray-100 rounded-lg">
              <FileText className="w-5 h-5 text-gray-700" />
              <div>
                <div className="font-medium text-gray-900">{selectedReference.name}</div>
                <div className="text-sm text-gray-700">
                  {selectedReference.requirementCount} requirements
                </div>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <h2 className="text-xl font-bold text-gray-900 mb-4">Upload Files to Evaluate</h2>
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-gray-400 rounded-lg p-8 text-center cursor-pointer hover:border-blue-500 hover:bg-blue-50 transition"
            >
              <Upload className="w-8 h-8 mx-auto text-gray-600 mb-2" />
              <p className="text-gray-700">
                Click to upload files (PDF, DOCX) - max 5 files
              </p>
            </div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".pdf,.docx,.doc"
              multiple
              onChange={handleFileChange}
              className="hidden"
            />

            {files.length > 0 && (
              <div className="mt-4 space-y-2">
                {files.map((file, index) => (
                  <div
                    key={index}
                    className="flex items-center justify-between p-3 bg-gray-100 rounded-lg"
                  >
                    <div className="flex items-center gap-2">
                      <FileText className="w-4 h-4 text-gray-700" />
                      <span className="text-gray-900">{file.name}</span>
                    </div>
                    <button
                      onClick={() => setFiles(files.filter((_, i) => i !== index))}
                      className="text-red-600 hover:text-red-800 font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button
              onClick={handleStartEvaluation}
              disabled={files.length === 0 || uploading}
              className="mt-4 w-full flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
            >
              {uploading ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Uploading & Starting Evaluation...
                </>
              ) : (
                'Start Evaluation'
              )}
            </button>
          </div>
        </div>
      )}

      {step === 'processing' && (
        <div className="bg-white rounded-lg shadow-md border border-gray-200 p-12 text-center">
          <Loader2 className="w-12 h-12 mx-auto text-blue-600 animate-spin mb-4" />
          <h2 className="text-xl font-semibold text-gray-900 mb-2">Evaluating Documents...</h2>
          <p className="text-gray-700">
            This may take 30 seconds to a few minutes depending on document size.
          </p>
        </div>
      )}

      {step === 'results' && result && (
        <div className="space-y-6">
          <div className="bg-white rounded-lg shadow-md border border-gray-200 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900">Evaluation Results</h2>
              <button
                onClick={() => {
                  setStep('select-reference');
                  setFiles([]);
                  setResult(null);
                  setSelectedReference(null);
                }}
                className="text-sm text-blue-600 hover:underline"
              >
                New Evaluation
              </button>
            </div>

            <div className="flex items-center gap-6 p-4 bg-gray-100 rounded-lg mb-6">
              <div className="text-center">
                <div className={clsx('text-4xl font-bold', getScoreColor(result.overallScore))}>
                  {result.overallScore ?? '--'}%
                </div>
                <div className="text-sm text-gray-700 font-medium">Overall Score</div>
              </div>
              <div className="flex-1">
                <div className="text-sm font-semibold text-gray-900 mb-1">Summary</div>
                <div className="text-sm text-gray-700">{result.summary || 'No summary available'}</div>
              </div>
            </div>

            <div className="space-y-4">
              {result.submittedFiles.map(file => (
                <div key={file.id} className="border border-gray-200 rounded-lg overflow-hidden">
                  <button
                    onClick={() => {
                      const newExpanded = new Set(expandedFiles);
                      if (newExpanded.has(file.id)) {
                        newExpanded.delete(file.id);
                      } else {
                        newExpanded.add(file.id);
                      }
                      setExpandedFiles(newExpanded);
                    }}
                    className="w-full flex items-center justify-between p-4 bg-gray-100 hover:bg-gray-200"
                  >
                    <div className="flex items-center gap-3">
                      {expandedFiles.has(file.id) ? (
                        <ChevronDown className="w-5 h-5 text-gray-700" />
                      ) : (
                        <ChevronRight className="w-5 h-5 text-gray-700" />
                      )}
                      <FileText className="w-5 h-5 text-gray-700" />
                      <span className="font-medium text-gray-900">{file.fileName}</span>
                    </div>
                    <div className="flex items-center gap-4">
                      <span className={clsx('font-bold', getScoreColor(file.score))}>
                        {file.score ?? '--'}%
                      </span>
                    </div>
                  </button>

                  {expandedFiles.has(file.id) && (
                    <div className="p-4 space-y-4">
                      {file.results.map((result, idx) => (
                        <div key={idx} className="border-l-4 border-gray-300 pl-4">
                          <div className="flex items-center gap-2 mb-2">
                            <span className={clsx('px-2 py-0.5 text-xs rounded-full font-medium', getStatusBadge(result.status))}>
                              {result.status}
                            </span>
                            <span className={clsx('px-2 py-0.5 text-xs rounded-full font-medium', getCriticalityBadge(result.criticality))}>
                              {result.criticality}
                            </span>
                          </div>
                          <div className="text-sm font-semibold text-gray-900 mb-1">{result.requirementText}</div>
                          <div className="text-sm text-gray-700 mb-2">
                            <span className="font-medium">Evidence Needed:</span> {result.evidenceNeeded}
                          </div>
                          {result.explanation && (
                            <div className="text-sm text-gray-800 bg-gray-100 p-2 rounded">
                              {result.explanation}
                            </div>
                          )}
                          {result.evidence && (
                            <div className="text-sm text-gray-700 mt-2">
                              <span className="font-medium">Evidence found:</span> {result.evidence}
                            </div>
                          )}
                          <div className="text-xs text-gray-600 mt-1 font-medium">
                            Confidence: {Math.round(result.confidence * 100)}%
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
