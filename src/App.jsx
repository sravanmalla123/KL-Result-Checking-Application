import React, { useState, useEffect, useRef } from 'react';
import { 
  UploadCloud, 
  FileText, 
  Settings as SettingsIcon, 
  History as HistoryIcon, 
  Sparkles, 
  Play, 
  Pause, 
  Square, 
  Mic, 
  Trash2, 
  CheckCircle2, 
  AlertTriangle, 
  X, 
  Search, 
  Download, 
  RefreshCw, 
  Eye,
  Info
} from 'lucide-react';
import { parseDocument } from './utils/documentParser';
import { evaluateReport } from './utils/geminiEvaluator';

export default function App() {
  // Navigation
  const [activeTab, setActiveTab] = useState('dashboard');
  
  // Settings & Keys
  const [apiKey, setApiKey] = useState(() => localStorage.getItem('veri_gemini_key') || '');
  const [openaiApiKey, setOpenaiApiKey] = useState(() => localStorage.getItem('veri_openai_key') || '');
  const [anthropicApiKey, setAnthropicApiKey] = useState(() => localStorage.getItem('veri_anthropic_key') || '');
  const [blackboxApiKey, setBlackboxApiKey] = useState(() => localStorage.getItem('veri_blackbox_key') || '');
  const [activeEngine, setActiveEngine] = useState(() => localStorage.getItem('veri_active_engine') || 'gemini');
  
  const [showKey, setShowKey] = useState(false);
  const [showOpenaiKey, setShowOpenaiKey] = useState(false);
  const [showAnthropicKey, setShowAnthropicKey] = useState(false);
  const [showBlackboxKey, setShowBlackboxKey] = useState(false);
  
  const [simulationScenario, setSimulationScenario] = useState('valid');
  const [selectedComparisonTab, setSelectedComparisonTab] = useState('gemini');

  // File States
  const [isDragActive, setIsDragActive] = useState(false);
  const [isParsing, setIsParsing] = useState(false);
  const [isEvaluating, setIsEvaluating] = useState(false);
  
  const [parsedData, setParsedData] = useState(null);
  const [evaluationResult, setEvaluationResult] = useState(null);
  
  // History
  const [history, setHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem('veri_history') || '[]');
    } catch {
      return [];
    }
  });
  const [historySearch, setHistorySearch] = useState('');
  const [activeHistoryItem, setActiveHistoryItem] = useState(null);

  // Audio Comments Recording
  const [isRecording, setIsRecording] = useState(false);
  const [recordingState, setRecordingState] = useState('idle'); // idle, recording, stopped
  const [recordedAudioUrl, setRecordedAudioUrl] = useState(null);
  const [base64Audio, setBase64Audio] = useState(null);
  const mediaRecorderRef = useRef(null);
  const audioChunksRef = useRef([]);

  // TTS Speech Synthesis
  const [isPlayingSpeech, setIsPlayingSpeech] = useState(false);
  const speechUtteranceRef = useRef(null);

  // Modals / Image expansion
  const [expandedImage, setExpandedImage] = useState(null);

  // Save keys to local storage
  const handleSaveGeminiKey = (key) => {
    setApiKey(key);
    localStorage.setItem('veri_gemini_key', key);
  };
  const handleSaveOpenaiKey = (key) => {
    setOpenaiApiKey(key);
    localStorage.setItem('veri_openai_key', key);
  };
  const handleSaveAnthropicKey = (key) => {
    setAnthropicApiKey(key);
    localStorage.setItem('veri_anthropic_key', key);
  };
  const handleSaveBlackboxKey = (key) => {
    setBlackboxApiKey(key);
    localStorage.setItem('veri_blackbox_key', key);
  };

  // Drag and drop handlers
  const handleDrag = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === "dragenter" || e.type === "dragover") {
      setIsDragActive(true);
    } else if (e.type === "dragleave") {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processUploadedFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileChange = async (e) => {
    if (e.target.files && e.target.files[0]) {
      await processUploadedFile(e.target.files[0]);
    }
  };

  // File parsing pipeline
  const processUploadedFile = async (file) => {
    setIsParsing(true);
    setEvaluationResult(null);
    setRecordedAudioUrl(null);
    setBase64Audio(null);
    setRecordingState('idle');
    try {
      const data = await parseDocument(file);
      setParsedData(data);
    } catch (err) {
      alert(`Error parsing document: ${err.message}`);
    } finally {
      setIsParsing(false);
    }
  };

  // Run AI grading evaluation
  const runEvaluation = async () => {
    if (!parsedData) return;
    setIsEvaluating(true);
    
    try {
      const result = await evaluateReport({
        filename: parsedData.filename,
        text: parsedData.text,
        images: parsedData.images,
        geminiApiKey: apiKey,
        openaiApiKey,
        anthropicApiKey,
        blackboxApiKey,
        engine: activeEngine,
        simulationScenario
      });

      setEvaluationResult(result);

      // Create history record
      const historyItem = {
        id: Date.now().toString(),
        filename: parsedData.filename,
        date: new Date().toLocaleDateString() + ' ' + new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        text: parsedData.text,
        images: parsedData.images,
        pages: parsedData.pages,
        evaluation: result,
        audioComment: null // populated if they record
      };

      const updatedHistory = [historyItem, ...history];
      setHistory(updatedHistory);
      localStorage.setItem('veri_history', JSON.stringify(updatedHistory));
    } catch (err) {
      alert(`Evaluation failed: ${err.message}`);
    } finally {
      setIsEvaluating(false);
    }
  };

  // Audio Recording (MediaRecorder API)
  const startRecording = async () => {
    audioChunksRef.current = [];
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mediaRecorder = new MediaRecorder(stream);
      mediaRecorderRef.current = mediaRecorder;

      mediaRecorder.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      mediaRecorder.onstop = () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        const audioUrl = URL.createObjectURL(audioBlob);
        setRecordedAudioUrl(audioUrl);
        setRecordingState('stopped');

        // Convert blob to base64 for persistent localstorage save
        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = () => {
          setBase64Audio(reader.result);
        };
      };

      mediaRecorder.start();
      setIsRecording(true);
      setRecordingState('recording');
    } catch (err) {
      alert(`Cannot access microphone: ${err.message}`);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      // Stop all tracks on the stream to release the mic
      mediaRecorderRef.current.stream.getTracks().forEach(track => track.stop());
      setIsRecording(false);
    }
  };

  // Save the voice commentary to the current active record
  const saveVoiceCommentary = () => {
    if (!base64Audio || history.length === 0) return;
    
    // Find the latest history item matching the current evaluation and update it
    const updatedHistory = history.map((item, idx) => {
      // Check if it matches the current evaluation timestamp or is the newest
      if (idx === 0) {
        return {
          ...item,
          audioComment: base64Audio
        };
      }
      return item;
    });

    setHistory(updatedHistory);
    localStorage.setItem('veri_history', JSON.stringify(updatedHistory));
    alert("Voice commentary successfully saved to this report record!");
  };

  // TTS Narrator
  const speakReport = () => {
    if (isPlayingSpeech) {
      window.speechSynthesis.cancel();
      setIsPlayingSpeech(false);
      return;
    }

    if (!evaluationResult) return;

    const speechText = `Evaluation report for ${parsedData.filename}. 
    Score awarded: ${activeResult.score ?? 0} marks. 
    Summary breakdown: ${activeResult.summary ?? ''}. 
    Data verification findings: ${activeResult.dataAssessment ?? ''}.
    Examiner remarks: ${activeResult.remarks ?? ''}`;

    const utterance = new SpeechSynthesisUtterance(speechText);
    speechUtteranceRef.current = utterance;
    
    utterance.onend = () => {
      setIsPlayingSpeech(false);
    };

    utterance.onerror = () => {
      setIsPlayingSpeech(false);
    };

    setIsPlayingSpeech(true);
    window.speechSynthesis.speak(utterance);
  };

  useEffect(() => {
    // Cleanup speech on unmount
    return () => {
      window.speechSynthesis.cancel();
    };
  }, []);

  // History operations
  const handleDeleteHistory = (id, e) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    setHistory(updated);
    localStorage.setItem('veri_history', JSON.stringify(updated));
    if (activeHistoryItem && activeHistoryItem.id === id) {
      setActiveHistoryItem(null);
    }
  };

  const handleSelectHistoryItem = (item) => {
    setActiveHistoryItem(item);
    // Render the history view into workspace state for review
    setParsedData({
      filename: item.filename,
      text: item.text,
      images: item.images,
      pages: item.pages || []
    });
    setEvaluationResult(item.evaluation);
    if (item.evaluation && item.evaluation.engine) {
      setActiveEngine(item.evaluation.engine);
    }
    setRecordedAudioUrl(item.audioComment || null);
    setBase64Audio(item.audioComment || null);
    setRecordingState(item.audioComment ? 'stopped' : 'idle');
    setActiveTab('dashboard');
  };

  // Reset the grading dashboard for next file
  const handleReset = () => {
    setParsedData(null);
    setEvaluationResult(null);
    setRecordedAudioUrl(null);
    setBase64Audio(null);
    setRecordingState('idle');
    if (isPlayingSpeech) {
      window.speechSynthesis.cancel();
      setIsPlayingSpeech(false);
    }
  };

  // Download printable report
  const downloadGradingSheet = () => {
    if (!evaluationResult || !parsedData) return;

    let content = `================================================
VERIREPORT AI EVALUATION SHEET
================================================
Report: ${parsedData.filename}
Evaluation Date: ${new Date().toLocaleDateString()}
------------------------------------------------\n`;

    if (evaluationResult.comparison) {
      content += `MULTI-ENGINE AI ASSESSMENT REPORT\n`;
      ['gemini', 'chatgpt', 'claude', 'blackbox'].forEach(model => {
        const modelData = evaluationResult.comparison?.[model] || {};
        content += `\n------------------------------------------------
AI ENGINE: ${model.toUpperCase()}
FINAL SCORE: ${modelData.score ?? 0} / 100 Marks — ${(modelData.score ?? 0) >= 60 ? 'PASS' : 'FAIL'}
------------------------------------------------
GRADING SUMMARY:
${modelData.summary ?? 'N/A'}

DATA & SUBMISSION VALIDATION:
${modelData.dataAssessment ?? 'N/A'}

EXAMINER REMARKS:
${modelData.remarks ?? 'N/A'}

IMAGES ANALYSIS:
${(modelData.images || []).map((img, idx) => `
- Image ${idx + 1}:
  Status: ${(img.status || 'unknown').toUpperCase()}
  Is AI-Generated: ${img.isAI ? 'YES' : 'NO'}
  Is Household Photo: ${img.isHousehold ? 'YES' : 'NO'}
  Details: ${img.assessment ?? ''}
`).join('\n')}
`;
      });
    } else {
      content += `AI ENGINE: ${(evaluationResult.engine || 'gemini').toUpperCase()}
FINAL SCORE: ${evaluationResult.score} / 100 Marks — ${evaluationResult.score >= 60 ? 'PASS' : 'FAIL'}
------------------------------------------------
GRADING SUMMARY:
${evaluationResult.summary}

DATA & SUBMISSION VALIDATION:
${evaluationResult.dataAssessment}

EXAMINER REMARKS:
${evaluationResult.remarks || 'No remarks provided.'}

IMAGES ANALYSIS SUMMARY:
${(evaluationResult.images || []).map((img, idx) => `
- Image ${idx + 1}:
  Status: ${(img.status || 'unknown').toUpperCase()}
  Is AI-Generated: ${img.isAI ? 'YES' : 'NO'}
  Is Household Photo: ${img.isHousehold ? 'YES' : 'NO'}
  Details: ${img.assessment ?? ''}
`).join('\n')}
`;
    }
    content += `\n================================================`;

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `veri_grade_${parsedData.filename.replace(/\.[^/.]+$/, "")}.txt`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const activeResult = evaluationResult && (evaluationResult.comparison 
    ? (evaluationResult.comparison[selectedComparisonTab] || {}) 
    : evaluationResult);

  // Circle stroke offset calculations (score out of 100)
  const r = 70;
  const circ = 2 * Math.PI * r;
  const scoreOffset = activeResult 
    ? circ - ((activeResult.score ?? 0) / 100) * circ 
    : circ;

  // PASS / FAIL threshold
  const isPassing = (score) => score >= 60;

  // Filter history
  const filteredHistory = history.filter(item => 
    item.filename.toLowerCase().includes(historySearch.toLowerCase())
  );

  // Stats for sidebar
  const totalReports = history.length;
  const avgScore = totalReports > 0 
    ? (history.reduce((acc, curr) => {
        if (curr.evaluation.comparison) {
          const comparisonList = Object.values(curr.evaluation.comparison);
          const anyPass = comparisonList.some(res => (res.score ?? 0) >= 60);
          if (anyPass) {
            const passingScores = comparisonList.filter(res => (res.score ?? 0) >= 60).map(res => res.score);
            const geminiRes = curr.evaluation.comparison.gemini;
            const score = (geminiRes && geminiRes.score >= 60) ? geminiRes.score : Math.max(...passingScores);
            return acc + score;
          } else {
            const geminiScore = curr.evaluation.comparison.gemini?.score;
            if (geminiScore !== undefined) return acc + geminiScore;
            const scores = comparisonList.map(res => res.score ?? 0);
            return acc + (scores.length > 0 ? Math.max(...scores) : 0);
          }
        }
        return acc + (curr.evaluation.score ?? 0);
      }, 0) / totalReports).toFixed(0)
    : '0';
  const totalFlagged = history.filter(item => {
    if (item.evaluation.comparison) {
      const comparisonList = Object.values(item.evaluation.comparison);
      const anyPass = comparisonList.some(res => (res.score ?? 0) >= 60);
      const anyFlagged = comparisonList.some(res => res.score === 0);
      return !anyPass && anyFlagged;
    }
    return item.evaluation.score === 0;
  }).length;

  return (
    <div className="app-wrapper">
      {/* Top Header Bar */}
      <header className="top-header">
        <div className="header-brand" style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <div className="header-logo">V</div>
          <span className="header-title">VeriReport</span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <span style={{ fontSize: '0.85rem', color: 'rgba(255, 255, 255, 0.85)', fontWeight: '500' }}>
            Document AI Evaluator & Grader
          </span>
          <span style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', color: '#ffffff' }}>
            <span style={{ display: 'inline-block', width: '8px', height: '8px', borderRadius: '50%', background: apiKey ? '#00e676' : '#ff9100' }}></span>
            {apiKey ? 'API Connected' : 'Simulation Mode'}
          </span>
        </div>
      </header>

      <div className="app-container">
        {/* Sidebar Navigation */}
        <aside className="sidebar">

        <nav className="sidebar-nav">
          <button 
            id="nav-btn-dashboard"
            className={`nav-item btn ${activeTab === 'dashboard' ? 'active' : ''}`}
            onClick={() => setActiveTab('dashboard')}
          >
            <Sparkles size={18} />
            Grading Workspace
          </button>
          
          <button 
            id="nav-btn-history"
            className={`nav-item btn ${activeTab === 'history' ? 'active' : ''}`}
            onClick={() => setActiveTab('history')}
          >
            <HistoryIcon size={18} />
            Evaluation Logs ({totalReports})
          </button>
          
          <button 
            id="nav-btn-settings"
            className={`nav-item btn ${activeTab === 'settings' ? 'active' : ''}`}
            onClick={() => setActiveTab('settings')}
          >
            <SettingsIcon size={18} />
            API Configurations
          </button>
        </nav>

        {/* Sidebar Dashboard Metrics */}
        <div className="glass-panel" style={{ padding: '16px', marginTop: 'auto', border: '1px solid rgba(255, 255, 255, 0.05)' }}>
          <h4 style={{ fontSize: '0.8rem', textTransform: 'uppercase', color: 'var(--color-text-muted)', marginBottom: '12px', letterSpacing: '0.5px' }}>Workspace Analytics</h4>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Graded Files:</span>
              <span style={{ fontWeight: '600' }}>{totalReports}</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Average Score:</span>
              <span style={{ fontWeight: '600', color: parseFloat(avgScore) >= 60 ? 'var(--color-success)' : 'var(--color-warning)' }}>{avgScore}/100</span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem' }}>
              <span style={{ color: 'var(--color-text-muted)' }}>Flagged (0 Marks):</span>
              <span style={{ fontWeight: '600', color: 'var(--color-danger)' }}>{totalFlagged}</span>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Panel Content */}
      <main className="main-content">
        
        {/* Tab 1: Dashboard Workspace */}
        {activeTab === 'dashboard' && (
          <div className="fade-in">
            {/* Header */}
            <header style={{ marginBottom: '32px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                AI Document Authenticator & Grader
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }}>
                Upload reports in PDF or DOCX formats to scan data coherence and identify AI-generated or household imagery.
              </p>
            </header>

            {/* No File Uploaded - Show Upload Zone */}
            {!parsedData && !isParsing && (
              <div style={{ maxWidth: '800px', margin: '0 auto' }}>
                
                {/* Upload drag-n-drop area */}
                <div 
                  className={`upload-container ${isDragActive ? 'drag-active' : ''}`}
                  onDragEnter={handleDrag}
                  onDragOver={handleDrag}
                  onDragLeave={handleDrag}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById('file-upload-input').click()}
                >
                  <input 
                    id="file-upload-input"
                    type="file" 
                    accept=".pdf,.docx" 
                    onChange={handleFileChange} 
                    style={{ display: 'none' }} 
                  />
                  <div className="upload-icon">
                    <UploadCloud size={32} />
                  </div>
                  <h3 className="upload-text">Drag & drop your report document</h3>
                  <p className="upload-subtext">Supports PDF or Microsoft Word DOCX formats (Max 15MB)</p>
                  <button className="btn btn-primary">Choose Document</button>
                </div>

                {/* Quick Simulation Options */}
                <div className="glass-panel" style={{ padding: '24px', marginTop: '32px', textAlign: 'left' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '16px' }}>
                    <Info size={18} style={{ color: 'var(--color-secondary)' }} />
                    <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: '600' }}>Demo Simulation Scenarios</h3>
                  </div>
                  <p style={{ fontSize: '0.9rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                    If you don't have a Gemini API key configured, the evaluator runs in simulation mode. Choose a scenario below to test how the grading flags operate:
                  </p>
                  
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '16px' }}>
                    <label 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        padding: '16px', 
                        borderRadius: 'var(--radius-md)', 
                        border: `2px solid ${simulationScenario === 'valid' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        background: simulationScenario === 'valid' ? 'rgba(143, 0, 255, 0.05)' : 'rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSimulationScenario('valid')}
                    >
                      <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-success)' }}></span>
                        Scenario A: Authentic
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Valid report with real charts. Grades: 84/100 (PASS).
                      </span>
                    </label>

                    <label 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        padding: '16px', 
                        borderRadius: 'var(--radius-md)', 
                        border: `2px solid ${simulationScenario === 'ai' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        background: simulationScenario === 'ai' ? 'rgba(143, 0, 255, 0.05)' : 'rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSimulationScenario('ai')}
                    >
                      <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-danger)' }}></span>
                        Scenario B: AI Image
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Flags synthetic diagram. Grades: 0/100 (FAIL).
                      </span>
                    </label>

                    <label 
                      style={{ 
                        display: 'flex', 
                        flexDirection: 'column', 
                        padding: '16px', 
                        borderRadius: 'var(--radius-md)', 
                        border: `2px solid ${simulationScenario === 'household' ? 'var(--color-primary)' : 'var(--border-color)'}`,
                        background: simulationScenario === 'household' ? 'rgba(143, 0, 255, 0.05)' : 'rgba(0,0,0,0.1)',
                        cursor: 'pointer',
                        transition: 'all 0.2s'
                      }}
                      onClick={() => setSimulationScenario('household')}
                    >
                      <span style={{ fontWeight: '700', fontSize: '0.95rem', color: '#fff', display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ width: '8px', height: '8px', borderRadius: '50%', background: 'var(--color-danger)' }}></span>
                        Scenario C: Family Image
                      </span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Flags private household/pet photo. Grades: 0/100 (FAIL).
                      </span>
                    </label>
                  </div>
                  
                  <div style={{ marginTop: '16px', fontSize: '0.8rem', color: 'var(--color-text-muted)', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ display: 'inline-block', width: '6px', height: '6px', borderRadius: '50%', background: apiKey ? 'var(--color-success)' : 'var(--color-warning)' }}></span>
                    {apiKey ? "Using active Gemini API calls." : "Running in simulation fallback mode. You can configure your Gemini API Key in the Settings tab."}
                  </div>
                </div>
              </div>
            )}

            {/* Parsing File Loader */}
            {isParsing && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ display: 'inline-block', position: 'relative', marginBottom: '24px' }}>
                  <RefreshCw size={48} className="shimmer" style={{ animation: 'spin 2s linear infinite', color: 'var(--color-primary)' }} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '8px' }}>Parsing Document Structure</h3>
                <p style={{ color: 'var(--color-text-muted)' }}>Decoding page layouts, text logs, and extracting raster image layers...</p>
              </div>
            )}

            {/* Workspace: File Parsed but not Graded yet */}
            {parsedData && !evaluationResult && !isEvaluating && (
              <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', maxWidth: '700px', margin: '0 auto' }}>
                <div style={{ width: '56px', height: '56px', borderRadius: '50%', background: 'rgba(0, 242, 254, 0.1)', display: 'flex', alignItems: 'center', justifySelf: 'center', justifyContent: 'center', color: 'var(--color-secondary)', marginBottom: '20px' }}>
                  <FileText size={28} />
                </div>
                <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.5rem', marginBottom: '6px' }}>{parsedData.filename}</h2>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginBottom: '24px' }}>
                  Ready for evaluation. Extracted <strong style={{ color: '#fff' }}>{parsedData.text.split(' ').length}</strong> words and <strong style={{ color: '#fff' }}>{parsedData.images.length}</strong> image(s).
                </p>

                <div style={{ marginBottom: '24px', textAlign: 'left', maxWidth: '400px', margin: '0 auto 24px' }}>
                  <label htmlFor="engine-select" style={{ display: 'block', fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '6px', fontWeight: '600' }}>Select AI Evaluation Engine</label>
                  <select 
                    id="engine-select"
                    className="form-input" 
                    value={activeEngine}
                    onChange={(e) => {
                      setActiveEngine(e.target.value);
                      localStorage.setItem('veri_active_engine', e.target.value);
                    }}
                    style={{ width: '100%', padding: '10px 14px', background: 'rgba(0,0,0,0.3)', color: '#fff', border: '1px solid var(--border-color)', borderRadius: 'var(--radius-md)' }}
                  >
                    <option value="gemini">Google Gemini 3.5 Flash</option>
                    <option value="chatgpt">OpenAI ChatGPT-4o-mini</option>
                    <option value="claude">Anthropic Claude 3.5 Sonnet</option>
                    <option value="blackbox">Blackbox AI Multimodal</option>
                    <option value="compare">Compare All Engines (Side-by-Side)</option>
                  </select>
                </div>

                <div style={{ display: 'flex', gap: '12px', justifyContent: 'center' }}>
                  <button className="btn btn-secondary" onClick={handleReset}>Cancel / Upload Different File</button>
                  <button className="btn btn-primary" onClick={runEvaluation}>
                    <Sparkles size={16} />
                    Run AI Evaluation
                  </button>
                </div>
              </div>
            )}

            {/* Evaluation Loading Spinner */}
            {isEvaluating && (
              <div style={{ textAlign: 'center', padding: '60px 0' }}>
                <div style={{ display: 'inline-block', position: 'relative', marginBottom: '24px' }}>
                  <div style={{ width: '48px', height: '48px', borderRadius: '50%', border: '4px solid rgba(143, 0, 255, 0.1)', borderTopColor: 'var(--color-primary)', animation: 'spin 1s linear infinite' }} />
                </div>
                <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', marginBottom: '8px' }}>Evaluating Report Credentials</h3>
                <p style={{ color: 'var(--color-text-muted)' }}>
                  Calling Gemini vision neural checks. Reviewing text accuracy, checking for AI image artifacts, and identifying household context...
                </p>
              </div>
            )}

            {/* Evaluation Workspace Result Screen */}
            {parsedData && evaluationResult && (
              <div className="fade-in">
                {/* Comparison Matrix (Full Width) */}
                {evaluationResult.comparison && (
                  <div className="glass-panel" style={{ padding: '24px', marginBottom: '24px' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px', flexWrap: 'wrap', gap: '12px' }}>
                      <div>
                        <h2 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.3rem', fontWeight: '700' }}>Multi-AI Grading & Vision Analysis Matrix</h2>
                        <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                          Comparative results across Google Gemini, OpenAI ChatGPT, Anthropic Claude, and Blackbox AI.
                        </p>
                      </div>
                      
                      {/* Active tabs selector for looking at details */}
                      <div style={{ display: 'flex', gap: '6px', background: 'rgba(0,0,0,0.2)', padding: '4px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                        {['gemini', 'chatgpt', 'claude', 'blackbox'].map(model => {
                          const modelLabels = { gemini: 'Gemini', chatgpt: 'ChatGPT', claude: 'Claude', blackbox: 'Blackbox' };
                          return (
                            <button
                              key={model}
                              type="button"
                              className={`btn comparison-tab-btn ${selectedComparisonTab === model ? 'active ' + model + '-tab' : ''}`}
                              onClick={() => setSelectedComparisonTab(model)}
                              style={{ padding: '6px 12px', fontSize: '0.75rem', borderRadius: 'var(--radius-sm)' }}
                            >
                              {modelLabels[model]} Details
                            </button>
                          );
                        })}
                      </div>
                    </div>

                    <div style={{ overflowX: 'auto' }}>
                      <table className="comparison-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                        <thead>
                          <tr style={{ borderBottom: '1px solid var(--border-color)', color: 'var(--color-text-muted)', fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                            <th style={{ padding: '12px' }}>AI Model Engine</th>
                            <th style={{ padding: '12px' }}>Score</th>
                            <th style={{ padding: '12px' }}>Verification Status</th>
                            <th style={{ padding: '12px' }}>AI-Gen Image Detection</th>
                            <th style={{ padding: '12px' }}>Household Photo Detection</th>
                            <th style={{ padding: '12px' }}>Academic Coherence</th>
                          </tr>
                        </thead>
                        <tbody>
                          {['gemini', 'chatgpt', 'claude', 'blackbox'].map(model => {
                            const modelData = evaluationResult.comparison?.[model] || {};
                            const score = modelData.score ?? 0.0;
                            const isAI = modelData.images?.some(img => img.isAI) ?? false;
                            const isHousehold = modelData.images?.some(img => img.isHousehold) ?? false;
                            
                            const modelNames = {
                              gemini: "Google Gemini 3.5 Flash",
                              chatgpt: "OpenAI ChatGPT-4o-mini",
                              claude: "Anthropic Claude 3.5 Sonnet",
                              blackbox: "Blackbox AI Multimodal"
                            };
                            const modelClasses = {
                              gemini: "gemini-badge",
                              chatgpt: "chatgpt-badge",
                              claude: "claude-badge",
                              blackbox: "blackbox-badge"
                            };

                            let statusText = "Verified Authentic";
                            let statusClass = "badge-purple";
                            if (score === 0.0) {
                              statusText = "Flagged Violation";
                              statusClass = "badge-danger";
                            }

                            return (
                              <tr key={model} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', background: selectedComparisonTab === model ? 'rgba(255,255,255,0.02)' : 'transparent' }}>
                                <td style={{ padding: '12px', fontWeight: '600' }}>
                                  <span className={`engine-dot-badge ${modelClasses[model]}`}>
                                    {modelNames[model]}
                                  </span>
                                </td>
                                <td style={{ padding: '12px', fontWeight: '700', fontSize: '1.1rem', color: score === 0 ? 'var(--color-danger)' : (score >= 60 ? 'var(--color-success)' : 'var(--color-warning)') }}>
                                  {score} / 100 <span style={{ fontSize: '0.7rem', fontWeight: '600', marginLeft: '6px', padding: '2px 6px', borderRadius: '4px', background: score >= 60 && score > 0 ? 'rgba(0,230,118,0.15)' : 'rgba(255,23,68,0.15)', color: score >= 60 && score > 0 ? 'var(--color-success)' : 'var(--color-danger)' }}>{score >= 60 && score > 0 ? 'PASS' : 'FAIL'}</span>
                                </td>
                                <td style={{ padding: '12px' }}>
                                  <span className={`badge ${statusClass}`}>
                                    {statusText}
                                  </span>
                                </td>
                                <td style={{ padding: '12px', color: isAI ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: '600', fontSize: '0.85rem' }}>
                                  {isAI ? "❌ Flagged AI Gen" : "✅ Valid Diagram"}
                                </td>
                                <td style={{ padding: '12px', color: isHousehold ? 'var(--color-danger)' : 'var(--color-success)', fontWeight: '600', fontSize: '0.85rem' }}>
                                  {isHousehold ? "❌ Flagged Household" : "✅ Valid Diagram"}
                                </td>
                                <td style={{ padding: '12px', color: 'var(--color-text-muted)', fontSize: '0.85rem' }}>
                                  {modelData.dataAssessment ? (modelData.dataAssessment.length > 50 ? modelData.dataAssessment.substring(0, 50) + "..." : modelData.dataAssessment) : "No checks run."}
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                <div className="workspace-grid">
                  {/* Left Panel: Extracted assets */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Extracted Images panel */}
                    <div className="glass-panel" style={{ padding: '24px' }}>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        Extracted Images Scan ({parsedData.images.length})
                      </h3>
                      <p style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '16px' }}>
                        Hover over any image to read the AI validation log. Click to enlarge.
                      </p>

                      {parsedData.images.length === 0 ? (
                        <div style={{ textAlign: 'center', padding: '40px 0', border: '1px dashed var(--border-color)', borderRadius: 'var(--radius-md)' }}>
                          <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem' }}>No image files found embedded in this document.</p>
                        </div>
                      ) : (
                        <div className="image-list-grid">
                          {parsedData.images.map((imgUrl, index) => {
                            const assessment = activeResult.images?.find(item => item.index === index) || {
                              status: 'pending',
                              assessment: 'No assessment log found.'
                            };
                            
                            let borderClass = 'status-pending';
                            let badgeClass = 'badge-pending';
                            let badgeText = 'Checking';
                            
                            if (assessment.status === 'valid') {
                              borderClass = 'status-valid';
                              badgeClass = 'badge-valid';
                              badgeText = 'Authentic';
                            } else if (assessment.status === 'flagged_ai') {
                              borderClass = 'status-ai';
                              badgeClass = 'badge-ai';
                              badgeText = 'AI Generated';
                            } else if (assessment.status === 'flagged_household') {
                              borderClass = 'status-household';
                              badgeClass = 'badge-household';
                              badgeText = 'Household';
                            }

                            return (
                              <div 
                                key={index} 
                                className={`image-card ${borderClass}`}
                                onClick={() => setExpandedImage({ src: imgUrl, title: `Image ${index + 1}`, assessment: assessment.assessment })}
                                style={{ cursor: 'pointer' }}
                              >
                                <div className={`image-badge ${badgeClass}`}>
                                  {badgeText}
                                </div>
                                <img src={imgUrl} alt={`Extracted asset ${index + 1}`} />
                                <div className="image-card-caption">
                                  <span style={{ fontWeight: '600', display: 'block', fontSize: '0.85rem' }}>Image {index + 1} Log</span>
                                  <span style={{ display: 'inline-block', whiteSpace: 'nowrap', textOverflow: 'ellipsis', overflow: 'hidden', width: '100%' }}>
                                    {assessment.assessment}
                                  </span>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Document Text Content Preview */}
                    <div className="glass-panel" style={{ padding: '24px' }}>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: '600', marginBottom: '12px' }}>
                        Document Text Data Snippet
                      </h3>
                      <div 
                        className="custom-scroll" 
                        style={{ 
                          background: 'rgba(0,0,0,0.15)', 
                          padding: '16px', 
                          borderRadius: 'var(--radius-md)', 
                          fontSize: '0.85rem', 
                          fontFamily: 'monospace', 
                          lineHeight: '1.5',
                          border: '1px solid var(--border-color)',
                          color: 'rgba(255,255,255,0.75)'
                        }}
                      >
                        {parsedData.text || "No text could be processed in this document."}
                      </div>
                    </div>

                    {/* PDF Layout Pages Preview (if PDF has renders) */}
                    {parsedData.pages && parsedData.pages.length > 0 && (
                      <div className="glass-panel" style={{ padding: '24px' }}>
                        <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.2rem', fontWeight: '600', marginBottom: '12px' }}>
                          Document Page Layout Renders
                        </h3>
                        <div style={{ display: 'flex', gap: '16px', overflowX: 'auto', paddingBottom: '12px' }}>
                          {parsedData.pages.map((pageUrl, idx) => (
                            <div 
                              key={idx} 
                              style={{ 
                                flexShrink: 0, 
                                width: '120px', 
                                border: '1px solid var(--border-color)', 
                                borderRadius: '4px', 
                                overflow: 'hidden',
                                background: '#fff',
                                cursor: 'pointer'
                              }}
                              onClick={() => setExpandedImage({ src: pageUrl, title: `Page ${idx + 1} Layout`, assessment: "Visual page representation." })}
                            >
                              <img src={pageUrl} alt={`Page ${idx + 1}`} style={{ width: '100%', display: 'block' }} />
                              <div style={{ background: '#000', color: '#fff', padding: '4px', fontSize: '0.7rem', textAlign: 'center' }}>
                                Page {idx + 1}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Right Panel: Grading Results Dashboard */}
                  <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
                    
                    {/* Grading score card */}
                    <div className="glass-panel score-hero">
                      <div style={{ marginBottom: '12px', fontSize: '0.8rem', color: 'var(--color-text-muted)', fontWeight: '600', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                        {evaluationResult.comparison ? `${selectedComparisonTab.toUpperCase()} Grading Score` : 'Evaluation Score'}
                      </div>
                      <div className="score-circle-container">
                        <svg width="180" height="180">
                          <circle className="score-circle-bg" cx="90" cy="90" r={r} />
                          <circle 
                            className="score-circle-progress" 
                            cx="90" 
                            cy="90" 
                            r={r} 
                            strokeDasharray={circ}
                            strokeDashoffset={scoreOffset}
                            stroke={activeResult.score === 0 ? 'var(--color-danger)' : (isPassing(activeResult.score) ? 'var(--color-success)' : 'var(--color-warning)')}
                          />
                        </svg>
                        <div className="score-text-overlay">
                          <span className="score-big-num">{activeResult.score ?? 0}</span>
                          <span className="score-total">/ 100</span>
                        </div>
                      </div>

                      <div style={{ textAlign: 'center' }}>
                        {activeResult.score === 0 ? (
                          <div className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px' }}>
                            <AlertTriangle size={14} />
                            FAIL — Flagged Violation (0/100)
                          </div>
                        ) : isPassing(activeResult.score) ? (
                          <div className="badge badge-purple" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(0,230,118,0.15)', color: 'var(--color-success)', border: '1px solid rgba(0,230,118,0.3)' }}>
                            <CheckCircle2 size={14} />
                            PASS — Submission Verified
                          </div>
                        ) : (
                          <div className="badge badge-danger" style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', fontSize: '0.8rem', padding: '6px 12px', background: 'rgba(255,152,0,0.15)', color: 'var(--color-warning)', border: '1px solid rgba(255,152,0,0.3)' }}>
                            <AlertTriangle size={14} />
                            FAIL — Score Below 60
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Summary & Assessment Feedback */}
                    <div className="glass-panel" style={{ padding: '24px', textAlign: 'left' }}>
                      <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.1rem', fontWeight: '600', marginBottom: '12px', color: 'var(--color-text-main)' }}>
                        AI Grade Log ({(evaluationResult.comparison ? selectedComparisonTab : (evaluationResult.engine || 'gemini')).toUpperCase()})
                      </h3>
                      
                      <div style={{ marginBottom: '18px' }}>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Summary Feedback</h4>
                        <p style={{ fontSize: '0.9rem', lineHeight: '1.45', color: '#fff' }}>
                          {activeResult.summary}
                        </p>
                      </div>

                      <div style={{ marginBottom: '18px' }}>
                        <h4 style={{ fontSize: '0.85rem', color: 'var(--color-text-muted)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>Data Accuracy Check</h4>
                        <p style={{ fontSize: '0.9rem', lineHeight: '1.45', color: '#fff' }}>
                          {activeResult.dataAssessment}
                        </p>
                      </div>

                      {activeResult.score === 0 ? (
                        <div 
                          style={{ 
                            marginTop: '16px',
                            padding: '16px', 
                            borderRadius: 'var(--radius-md)', 
                            background: 'linear-gradient(135deg, #d32f2f 0%, #b71c1c 100%)',
                            border: '1px solid #ff1744',
                            boxShadow: '0 4px 15px rgba(211, 47, 47, 0.25)',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          <h4 style={{ fontSize: '0.85rem', color: '#ffcdd2', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Examiner Remarks (Violation Flagged)</h4>
                          <p style={{ fontSize: '0.9rem', lineHeight: '1.5', color: '#ffffff', fontWeight: '500' }}>
                            {activeResult.remarks || "No remarks provided."}
                          </p>
                        </div>
                      ) : activeResult.score < 60 ? (
                        <div 
                          style={{ 
                            marginTop: '16px',
                            padding: '16px', 
                            borderRadius: 'var(--radius-md)', 
                            background: 'linear-gradient(135deg, #ff9800 0%, #f57c00 100%)',
                            border: '1px solid #ffb74d',
                            boxShadow: '0 4px 15px rgba(255, 152, 0, 0.25)',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          <h4 style={{ fontSize: '0.85rem', color: '#ffe0b2', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Examiner Remarks (Revision Required)</h4>
                          <p style={{ fontSize: '0.9rem', lineHeight: '1.5', color: '#ffffff', fontWeight: '500' }}>
                            {activeResult.remarks || "No remarks provided."}
                          </p>
                        </div>
                      ) : (
                        <div 
                          style={{ 
                            marginTop: '16px',
                            padding: '16px', 
                            borderRadius: 'var(--radius-md)', 
                            background: 'linear-gradient(135deg, #ffffff 0%, #f5f5f5 100%)',
                            border: '1px solid #e0e0e0',
                            boxShadow: '0 4px 15px rgba(0, 0, 0, 0.1)',
                            transition: 'all 0.3s ease'
                          }}
                        >
                          <h4 style={{ fontSize: '0.85rem', color: 'var(--color-primary)', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '0.5px', fontWeight: '700' }}>Examiner Remarks (Approved)</h4>
                          <p style={{ fontSize: '0.9rem', lineHeight: '1.5', color: '#2d3748', fontWeight: '500' }}>
                            {activeResult.remarks || "No remarks provided."}
                          </p>
                        </div>
                      )}
                    </div>

                    {/* Narrative Playback (TTS) */}
                    <div className="glass-panel" style={{ padding: '20px 24px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', justifyBetween: 'space-between', width: '100%' }}>
                        <div style={{ textAlign: 'left' }}>
                          <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: '600' }}>Voice Report Narration</h4>
                          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '2px' }}>Listen to the digital reading of the AI evaluation sheet.</p>
                        </div>
                        
                        <button 
                          className={`btn ${isPlayingSpeech ? 'btn-danger' : 'btn-primary'} btn-icon-only`}
                          onClick={speakReport}
                          style={{ marginLeft: 'auto' }}
                        >
                          {isPlayingSpeech ? <Square size={16} /> : <Play size={16} />}
                        </button>
                      </div>
                    </div>

                    {/* Examiner Voice Feedback Recording */}
                    <div className="glass-panel audio-card" style={{ textAlign: 'left' }}>
                      <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '1rem', fontWeight: '600' }}>Voice Commentary Recording</h4>
                      <p style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
                        Record your own verbal grading feedback and save it to the history archive.
                      </p>

                      <div className="audio-controls">
                        {recordingState === 'idle' && (
                          <button className="btn btn-primary" onClick={startRecording}>
                            <Mic size={16} />
                            Record Comments
                          </button>
                        )}

                        {recordingState === 'recording' && (
                          <button className="btn btn-danger" onClick={stopRecording}>
                            <Square size={16} />
                            Stop Recording
                          </button>
                        )}

                        {recordingState === 'stopped' && (
                          <div style={{ display: 'flex', gap: '8px', width: '100%', alignItems: 'center' }}>
                            <button className="btn btn-secondary" onClick={startRecording}>
                              <RefreshCw size={14} />
                              Re-record
                            </button>
                            
                            {/* Playback capability for user */}
                            <audio src={recordedAudioUrl} controls style={{ height: '38px', flexGrow: '1' }} />
                            
                            <button className="btn btn-primary" onClick={saveVoiceCommentary}>
                              Save
                            </button>
                          </div>
                        )}
                        
                        {recordingState === 'recording' && (
                          <div className="waveform-container">
                            {Array.from({ length: 16 }).map((_, idx) => (
                              <div 
                                key={idx} 
                                className="wave-bar recording" 
                                style={{ 
                                  height: `${Math.random() * 26 + 4}px`,
                                  animation: 'pulseWave 0.6s infinite alternate',
                                  animationDelay: `${idx * 0.05}s`
                                }} 
                              />
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Action Commands */}
                    <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
                      <button className="btn btn-secondary" style={{ flexGrow: '1' }} onClick={downloadGradingSheet}>
                        <Download size={16} />
                        Export Text Sheet
                      </button>
                      
                      <button className="btn btn-danger btn-icon-only" onClick={handleReset} title="Clear workspace">
                        <Trash2 size={16} />
                      </button>
                    </div>

                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: History Archives */}
        {activeTab === 'history' && (
          <div className="fade-in" style={{ maxWidth: '900px', margin: '0 auto' }}>
            <header style={{ marginBottom: '32px', textAlign: 'left' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                Evaluation History Log
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }}>
                Review past evaluated documents, download their reports, and listen to recorded voice commentaries.
              </p>
            </header>

            {/* Search Filter */}
            <div style={{ position: 'relative', marginBottom: '24px' }}>
              <Search 
                size={18} 
                style={{ 
                  position: 'absolute', 
                  left: '16px', 
                  top: '50%', 
                  transform: 'translateY(-50%)', 
                  color: 'var(--color-text-muted)' 
                }} 
              />
              <input 
                type="text"
                placeholder="Search file reports..."
                className="form-input"
                value={historySearch}
                onChange={(e) => setHistorySearch(e.target.value)}
                style={{ width: '100%', paddingLeft: '48px' }}
              />
            </div>

            {/* History Table / List */}
            {filteredHistory.length === 0 ? (
              <div className="glass-panel" style={{ padding: '60px 40px', textAlign: 'center' }}>
                <FileText size={40} style={{ color: 'var(--color-text-muted)', marginBottom: '16px', opacity: '0.5' }} />
                <h3>No report archives found</h3>
                <p style={{ color: 'var(--color-text-muted)', fontSize: '0.9rem', marginTop: '4px' }}>
                  Evaluate files inside the Grading Workspace to record them here.
                </p>
              </div>
            ) : (
              <div className="history-section">
                {filteredHistory.map((item) => {
                  let itemScore = item.evaluation.score;
                  let isPass = itemScore >= 60;
                  let hasViolation = itemScore === 0;

                  if (item.evaluation.comparison) {
                    const comparisonList = Object.values(item.evaluation.comparison);
                    const geminiRes = item.evaluation.comparison.gemini;
                    const anyPass = comparisonList.some(res => (res.score ?? 0) >= 60);
                    isPass = anyPass;
                    
                    if (isPass) {
                      const passingScores = comparisonList.filter(res => (res.score ?? 0) >= 60).map(res => res.score);
                      itemScore = (geminiRes && geminiRes.score >= 60) ? geminiRes.score : Math.max(...passingScores);
                    } else {
                      itemScore = geminiRes ? geminiRes.score : (comparisonList.length > 0 ? Math.max(...comparisonList.map(res => res.score ?? 0)) : 0);
                    }
                    hasViolation = !isPass && (comparisonList.some(res => res.score === 0));
                  }
                  
                  return (
                    <div 
                      key={item.id} 
                      className="glass-panel history-item"
                      onClick={() => handleSelectHistoryItem(item)}
                    >
                      <div className="history-meta" style={{ textAlign: 'left' }}>
                        <h4 className="history-title">{item.filename}</h4>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <span className="history-sub">{item.date}</span>
                          <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--color-text-muted)' }}></span>
                          <span className="history-sub">{item.images.length} Image(s)</span>
                          {item.audioComment && (
                            <>
                              <span style={{ width: '3px', height: '3px', borderRadius: '50%', background: 'var(--color-text-muted)' }}></span>
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize: '0.75rem', color: 'var(--color-secondary)', fontWeight: '600' }}>
                                <Mic size={10} /> Voice Note Attached
                              </span>
                            </>
                          )}
                        </div>
                      </div>

                      <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                        <div className={`history-score-badge ${hasViolation ? 'flagged' : (isPass ? 'valid' : 'warn')}`}>
                          {itemScore} / 100
                          <span style={{ fontSize: '0.7rem', marginLeft: '6px', fontWeight: '700' }}>{isPass ? 'PASS' : 'FAIL'}</span>
                        </div>

                        <button 
                          className="btn btn-secondary btn-icon-only" 
                          onClick={(e) => handleDeleteHistory(item.id, e)}
                          title="Delete record"
                          style={{ borderColor: 'rgba(255,23,68,0.15)', background: 'rgba(255,23,68,0.02)' }}
                        >
                          <Trash2 size={14} style={{ color: 'var(--color-danger)' }} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Tab 3: API Configurations */}
        {activeTab === 'settings' && (
          <div className="fade-in" style={{ maxWidth: '650px', margin: '0 auto', textAlign: 'left' }}>
            <header style={{ marginBottom: '32px' }}>
              <h1 style={{ fontFamily: 'var(--font-heading)', fontSize: '2.5rem', fontWeight: '700', marginBottom: '8px', letterSpacing: '-0.5px' }}>
                API Configuration Hub
              </h1>
              <p style={{ color: 'var(--color-text-muted)', fontSize: '1rem' }}>
                Manage API secret keys and testing environments.
              </p>
            </header>

            <div className="glass-panel" style={{ padding: '32px' }}>
              <div className="settings-grid" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
                
                {/* Gemini API Key */}
                <div className="form-group">
                  <label htmlFor="gemini-api-key">Google Gemini API Key</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      id="gemini-api-key"
                      type={showKey ? "text" : "password"} 
                      className="form-input" 
                      placeholder="Enter Gemini API Key (AIzaSy...)" 
                      value={apiKey}
                      onChange={(e) => handleSaveGeminiKey(e.target.value)}
                      style={{ flexGrow: '1' }}
                    />
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={() => setShowKey(!showKey)}
                    >
                      {showKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* OpenAI API Key */}
                <div className="form-group">
                  <label htmlFor="openai-api-key">OpenAI ChatGPT API Key</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      id="openai-api-key"
                      type={showOpenaiKey ? "text" : "password"} 
                      className="form-input" 
                      placeholder="Enter OpenAI API Key (sk-...)" 
                      value={openaiApiKey}
                      onChange={(e) => handleSaveOpenaiKey(e.target.value)}
                      style={{ flexGrow: '1' }}
                    />
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={() => setShowOpenaiKey(!showOpenaiKey)}
                    >
                      {showOpenaiKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* Anthropic API Key */}
                <div className="form-group">
                  <label htmlFor="anthropic-api-key">Anthropic Claude API Key</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      id="anthropic-api-key"
                      type={showAnthropicKey ? "text" : "password"} 
                      className="form-input" 
                      placeholder="Enter Anthropic API Key (sk-ant-...)" 
                      value={anthropicApiKey}
                      onChange={(e) => handleSaveAnthropicKey(e.target.value)}
                      style={{ flexGrow: '1' }}
                    />
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={() => setShowAnthropicKey(!showAnthropicKey)}
                    >
                      {showAnthropicKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                {/* Blackbox API Key */}
                <div className="form-group">
                  <label htmlFor="blackbox-api-key">Blackbox AI API Key</label>
                  <div style={{ display: 'flex', gap: '8px' }}>
                    <input 
                      id="blackbox-api-key"
                      type={showBlackboxKey ? "text" : "password"} 
                      className="form-input" 
                      placeholder="Enter Blackbox API Key..." 
                      value={blackboxApiKey}
                      onChange={(e) => handleSaveBlackboxKey(e.target.value)}
                      style={{ flexGrow: '1' }}
                    />
                    <button 
                      type="button"
                      className="btn btn-secondary" 
                      onClick={() => setShowBlackboxKey(!showBlackboxKey)}
                    >
                      {showBlackboxKey ? "Hide" : "Show"}
                    </button>
                  </div>
                </div>

                <div style={{ height: '1px', background: 'var(--border-color)', margin: '12px 0' }} />

                {/* Scenario details info */}
                <div style={{ background: 'rgba(0,0,0,0.15)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-color)' }}>
                  <h4 style={{ fontFamily: 'var(--font-heading)', fontSize: '0.95rem', fontWeight: '600', marginBottom: '8px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Info size={16} style={{ color: 'var(--color-secondary)' }} />
                    Evaluation Integrity Rules
                  </h4>
                  <ul style={{ fontSize: '0.8rem', color: 'var(--color-text-muted)', paddingLeft: '18px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                    <li><strong>AI Image Flagging:</strong> If any model detects synthetic renderings, smooth airbrushed gradients, or unaligned text labels in an image, the report receives <strong>0 marks (FAIL)</strong>.</li>
                    <li><strong>Household Image Flagging:</strong> If images contain residential environments, home decorations, family group photos, selfies, or house pets, they are flagged as domestic assets, receiving <strong>0 marks (FAIL)</strong>.</li>
                    <li><strong>Academic Score (PASS/FAIL):</strong> In the absence of flags, the report text coherence, data accuracy, tables, and correct visual evidence are evaluated out of <strong>100 marks</strong>. A score of <strong>60 or above is PASS</strong>; below 60 is <strong>FAIL</strong>.</li>
                    <li><strong>Grace Band:</strong> Scores between <strong>55 and 59</strong> are automatically rounded up to <strong>60 (PASS)</strong>. Scores of 54 and below remain a FAIL.</li>
                  </ul>
                </div>

              </div>
            </div>
          </div>
        )}

      </main>

      {/* Modal: Enlarged Image View */}
      {expandedImage && (
        <div 
          style={{ 
            position: 'fixed', 
            top: 0, 
            left: 0, 
            right: 0, 
            bottom: 0, 
            background: 'rgba(0,0,0,0.92)', 
            display: 'flex', 
            alignItems: 'center', 
            justifyContent: 'center', 
            zIndex: 1000, 
            padding: '24px',
            backdropFilter: 'blur(10px)'
          }}
          onClick={() => setExpandedImage(null)}
        >
          <div 
            className="glass-panel" 
            style={{ 
              maxWidth: '800px', 
              width: '100%', 
              background: 'var(--bg-surface)', 
              borderRadius: 'var(--radius-lg)', 
              overflow: 'hidden',
              position: 'relative'
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <button 
              onClick={() => setExpandedImage(null)}
              style={{ 
                position: 'absolute', 
                top: '16px', 
                right: '16px', 
                background: 'rgba(0,0,0,0.5)', 
                border: 'none', 
                color: '#fff', 
                padding: '8px', 
                borderRadius: '50%', 
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center'
              }}
            >
              <X size={18} />
            </button>

            <img 
              src={expandedImage.src} 
              alt={expandedImage.title} 
              style={{ width: '100%', maxHeight: '55vh', objectFit: 'contain', background: '#000', display: 'block' }} 
            />

            <div style={{ padding: '24px', textAlign: 'left' }}>
              <h3 style={{ fontFamily: 'var(--font-heading)', fontSize: '1.25rem', fontWeight: '600', marginBottom: '8px' }}>
                {expandedImage.title}
              </h3>
              <p style={{ fontSize: '0.9rem', color: 'rgba(255,255,255,0.85)', lineHeight: '1.45' }}>
                {expandedImage.assessment}
              </p>
            </div>
          </div>
        </div>
      )}
      </div> {/* Close app-container */}

      {/* Footer Bar */}
      <footer className="app-footer">
        <div>© 2026 VeriReport. All Rights Reserved.</div>
        <div>AI Document Authenticator & Grader</div>
      </footer>
    </div>
  );
}
