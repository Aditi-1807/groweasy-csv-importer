"use client";

import React, { useState, useEffect, useRef } from 'react';
import { 
  Upload, FileText, CheckCircle, AlertTriangle, Play, RefreshCw, 
  Trash2, ArrowRight, ArrowLeft, Sun, Moon, Database, HelpCircle,
  Mail, Phone, FileSpreadsheet, PlusCircle, LayoutDashboard, 
  Users, Key, Settings, Sparkles, Filter, Download, Search, Info
} from 'lucide-react';

export default function Home() {
  // Theme State
  const [theme, setTheme] = useState<'light' | 'dark'>('light');

  // Multi-step Wizard States
  const [step, setStep] = useState<number>(1);
  const [file, setFile] = useState<File | null>(null);
  const [rawRows, setRawRows] = useState<any[]>([]);
  const [mappedResults, setMappedResults] = useState<any[]>([]); // Array of { status, skip_reason, data }
  
  // Loading & Processing States
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const [isProcessing, setIsProcessing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string>('');
  
  // Progress states
  const [processedCount, setProcessedCount] = useState<number>(0);
  const [successCount, setSuccessCount] = useState<number>(0);
  const [skippedCount, setSkippedCount] = useState<number>(0);
  const [importLogs, setImportLogs] = useState<string[]>([]);
  const [failedBatches, setFailedBatches] = useState<number[]>([]);
  
  // Table Configuration (Pagination & Filtering)
  const [previewPage, setPreviewPage] = useState<number>(1);
  const [resultsPage, setResultsPage] = useState<number>(1);
  const [pageSize, setPageSize] = useState<number>(10);
  const [resultsFilter, setResultsFilter] = useState<'all' | 'success' | 'skipped'>('all');
  const [searchQuery, setSearchQuery] = useState<string>('');
  
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragCounterRef = useRef<number>(0);
  const [isDragActive, setIsDragActive] = useState<boolean>(false);
  const logsEndRef = useRef<HTMLDivElement>(null);

  // Constants
  const BATCH_SIZE = 15;
  const BACKEND_URL = typeof window !== 'undefined' && window.location.port === '3000'
    ? 'http://localhost:5000'
    : '';

  // Toggle Theme
  useEffect(() => {
    const root = window.document.documentElement;
    if (theme === 'dark') {
      root.setAttribute('data-theme', 'dark');
    } else {
      root.removeAttribute('data-theme');
    }
  }, [theme]);

  // Auto scroll logs to bottom
  useEffect(() => {
    if (logsEndRef.current) {
      logsEndRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [importLogs]);

  // Handle Drag Events
  const handleDragEnter = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current++;
    if (e.dataTransfer.items && e.dataTransfer.items.length > 0) {
      setIsDragActive(true);
    }
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounterRef.current--;
    if (dragCounterRef.current === 0) {
      setIsDragActive(false);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    dragCounterRef.current = 0;

    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      const droppedFile = e.dataTransfer.files[0];
      if (droppedFile.name.endsWith('.csv')) {
        setFile(droppedFile);
        setErrorMsg('');
      } else {
        setErrorMsg('Invalid file format. Please drop a valid .csv file.');
      }
    }
  };

  const selectFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setFile(e.target.files[0]);
      setErrorMsg('');
    }
  };

  const removeFile = () => {
    setFile(null);
    setRawRows([]);
    setErrorMsg('');
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  // Upload file and parse it (Step 1 -> Step 2)
  const handleParseCsv = async () => {
    if (!file) return;

    setIsUploading(true);
    setErrorMsg('');

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch(`${BACKEND_URL}/api/parse`, {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to parse CSV');
      }

      setRawRows(data.rows);
      setPreviewPage(1);
      setStep(2); // Go to Preview Table
      addLog(`CSV parsed successfully. Found ${data.count} records.`);
    } catch (err: any) {
      console.error(err);
      setErrorMsg(err.message || 'Error uploading file to server. Make sure the backend is running.');
    } finally {
      setIsUploading(false);
    }
  };

  // Logging utility
  const addLog = (message: string, type: 'info' | 'success' | 'error' = 'info') => {
    const timestamp = new Date().toLocaleTimeString();
    let prefix = `[${timestamp}] `;
    if (type === 'success') prefix += '✅ ';
    if (type === 'error') prefix += '❌ ';
    setImportLogs(prev => [...prev, `${prefix}${message}`]);
  };

  // Chunk array into batches
  const getBatches = (array: any[], size: number) => {
    const batches = [];
    for (let i = 0; i < array.length; i += size) {
      batches.push({
        startIndex: i,
        data: array.slice(i, i + size)
      });
    }
    return batches;
  };

  // Batch AI Import Runner (Step 2 -> Step 3)
  const handleStartImport = async (batchesToProcess?: { startIndex: number; data: any[] }[]) => {
    setStep(3);
    setIsProcessing(true);
    setErrorMsg('');

    const batches = batchesToProcess || getBatches(rawRows, BATCH_SIZE);
    
    // If it's a full run (not a selective retry), initialize results array
    let updatedResults = batchesToProcess ? [...mappedResults] : new Array(rawRows.length).fill(null);
    if (!batchesToProcess) {
      setProcessedCount(0);
      setSuccessCount(0);
      setSkippedCount(0);
      setFailedBatches([]);
      setImportLogs([]);
      addLog(`Starting AI extraction on ${rawRows.length} leads in ${batches.length} batches...`);
    } else {
      addLog(`Retrying ${batches.length} failed batches...`);
      // Clear failed batches list of the ones we are retrying
      const retryIndices = batches.map(b => b.startIndex);
      setFailedBatches(prev => prev.filter(idx => !retryIndices.includes(idx)));
    }

    let localProcessed = processedCount;
    let localSuccess = successCount;
    let localSkipped = skippedCount;
    const failures: number[] = [];

    for (let i = 0; i < batches.length; i++) {
      const batch = batches[i];
      addLog(`Processing batch ${i + 1}/${batches.length} (rows ${batch.startIndex + 1} to ${Math.min(batch.startIndex + BATCH_SIZE, rawRows.length)})...`);

      try {
        const res = await fetch(`${BACKEND_URL}/api/extract`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ rows: batch.data })
        });

        const data = await res.json();

        if (!res.ok || !data.success) {
          throw new Error(data.error || 'Server returned error status');
        }

        // Insert results into the mapped array
        // data.results contains { status, skip_reason, data }
        data.results.forEach((item: any, idx: number) => {
          updatedResults[batch.startIndex + idx] = item;
          if (item.status === 'success') {
            localSuccess++;
          } else {
            localSkipped++;
          }
        });

        localProcessed += batch.data.length;
        
        setProcessedCount(localProcessed);
        setSuccessCount(localSuccess);
        setSkippedCount(localSkipped);
        setMappedResults([...updatedResults]);
        
        const batchSuccessCount = data.results.filter((r: any) => r.status === 'success').length;
        const batchSkippedCount = data.results.filter((r: any) => r.status === 'skipped').length;
        addLog(`Batch ${i + 1} completed: ${batchSuccessCount} mapped, ${batchSkippedCount} skipped. Mode: ${data.mode}`, 'success');

      } catch (err: any) {
        console.error('Batch failed:', err);
        addLog(`Batch starting at row ${batch.startIndex + 1} failed: ${err.message || 'Network error'}`, 'error');
        failures.push(batch.startIndex);
        setFailedBatches(prev => [...prev, batch.startIndex]);
      }

      // Add a small pause between batches to prevent API rate limits (cool down)
      await new Promise(resolve => setTimeout(resolve, 800));
    }

    setIsProcessing(false);

    if (failures.length > 0) {
      addLog(`Process completed with errors. ${failures.length} batches failed to import. You can retry them.`, 'error');
    } else {
      addLog(`All batches processed successfully! Total leads parsed: ${rawRows.length}`, 'success');
      // Auto advance to results page after a brief delay if no failures
      setTimeout(() => {
        setResultsPage(1);
        setStep(4);
      }, 1500);
    }
  };

  const handleRetryFailed = () => {
    const batches = getBatches(rawRows, BATCH_SIZE);
    const retryBatches = batches.filter(b => failedBatches.includes(b.startIndex));
    handleStartImport(retryBatches);
  };

  // Reset importer wizard
  const resetWizard = () => {
    removeFile();
    setMappedResults([]);
    setStep(1);
  };

  // Downloader for processed data
  const downloadMappedData = (format: 'json' | 'csv') => {
    // Filter out null records (failed batches)
    const validRecords = mappedResults.filter(r => r !== null);
    
    if (format === 'json') {
      const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(validRecords, null, 2));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", dataStr);
      downloadAnchor.setAttribute("download", `groweasy_crm_leads_${Date.now()}.json`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    } else {
      // Build CSV
      const headers = [
        'created_at', 'name', 'email', 'country_code', 'mobile_without_country_code',
        'company', 'city', 'state', 'country', 'lead_owner', 'crm_status',
        'crm_note', 'data_source', 'possession_time', 'description', 'import_status', 'skip_reason'
      ];
      
      const csvRows = [headers.join(',')];
      
      validRecords.forEach(record => {
        const status = record.status;
        const reason = record.skip_reason || '';
        const d = record.data || {};
        
        const values = [
          d.created_at || '',
          d.name || '',
          d.email || '',
          d.country_code || '',
          d.mobile_without_country_code || '',
          d.company || '',
          d.city || '',
          d.state || '',
          d.country || '',
          d.lead_owner || '',
          d.crm_status || '',
          d.crm_note || '',
          d.data_source || '',
          d.possession_time || '',
          d.description || '',
          status,
          reason
        ].map(val => {
          // Escape quotes and commas
          const cleaned = String(val).replace(/"/g, '""');
          return cleaned.includes(',') || cleaned.includes('"') || cleaned.includes('\n') ? `"${cleaned}"` : cleaned;
        });
        
        csvRows.push(values.join(','));
      });
      
      const csvContent = "data:text/csv;charset=utf-8," + encodeURIComponent(csvRows.join('\n'));
      const downloadAnchor = document.createElement('a');
      downloadAnchor.setAttribute("href", csvContent);
      downloadAnchor.setAttribute("download", `groweasy_crm_leads_${Date.now()}.csv`);
      document.body.appendChild(downloadAnchor);
      downloadAnchor.click();
      downloadAnchor.remove();
    }
  };

  // Pagination helper
  const getPagedData = (data: any[], page: number, size: number) => {
    const startIndex = (page - 1) * size;
    return data.slice(startIndex, startIndex + size);
  };

  // Results Filter & Search logic
  const getFilteredResults = () => {
    return mappedResults.filter((record) => {
      if (record === null) return false;
      
      // Filter status
      if (resultsFilter === 'success' && record.status !== 'success') return false;
      if (resultsFilter === 'skipped' && record.status !== 'skipped') return false;
      
      // Search Query
      if (searchQuery.trim() !== '') {
        const query = searchQuery.toLowerCase();
        const d = record.data || {};
        const nameMatch = (d.name || '').toLowerCase().includes(query);
        const emailMatch = (d.email || '').toLowerCase().includes(query);
        const phoneMatch = (d.mobile_without_country_code || '').toLowerCase().includes(query);
        const reasonMatch = (record.skip_reason || '').toLowerCase().includes(query);
        
        return nameMatch || emailMatch || phoneMatch || reasonMatch;
      }
      
      return true;
    });
  };

  const filteredResults = getFilteredResults();
  const totalResultsPages = Math.ceil(filteredResults.length / pageSize);
  const pagedResults = getPagedData(filteredResults, resultsPage, pageSize);

  const previewHeaders = rawRows.length > 0 ? Object.keys(rawRows[0]) : [];
  const totalPreviewPages = Math.ceil(rawRows.length / pageSize);
  const pagedPreviewRows = getPagedData(rawRows, previewPage, pageSize);

  return (
    <div className="app-container">
      {/* Sidebar navigation */}
      <aside className="sidebar">
        <div className="logo-container">
          <div className="logo-icon">
            <Database size={18} />
          </div>
          <span>GrowEasy</span>
        </div>

        <div className="account-info">
          <div className="account-avatar">VK</div>
          <div className="account-details">
            <span className="account-name">VK Test</span>
            <span className="account-role">OWNER</span>
          </div>
        </div>

        <nav className="nav-section">
          <span className="nav-title">Main</span>
          <a href="#" className="nav-link"><LayoutDashboard size={16} /> Dashboard</a>
          <a href="#" className="nav-link"><Sparkles size={16} /> Generate Leads</a>
          <a href="#" className="nav-link"><Users size={16} /> Manage Leads</a>
          
          <span className="nav-title">Control Center</span>
          <a href="#" className="nav-link active"><Database size={16} /> Lead Sources</a>
          <a href="#" className="nav-link"><Key size={16} /> API Center</a>
          <a href="#" className="nav-link"><Settings size={16} /> Settings</a>
        </nav>
      </aside>

      {/* Main Workspace */}
      <main className="main-workspace">
        <header className="workspace-header">
          <div className="workspace-title-section">
            <h1 className="workspace-title">Lead Sources</h1>
            <p className="workspace-subtitle">Connect, manage, and control all your lead channels from one dashboard.</p>
          </div>
          <button 
            className="theme-toggle-btn" 
            onClick={() => setTheme(theme === 'light' ? 'dark' : 'light')}
            aria-label="Toggle Theme"
          >
            {theme === 'light' ? <Moon size={20} /> : <Sun size={20} />}
          </button>
        </header>

        {/* Wizard Progress Nodes */}
        <div className="steps-indicator">
          <div className="steps-line">
            <div 
              className="steps-line-fill" 
              style={{ width: `${((step - 1) / 3) * 100}%` }}
            ></div>
          </div>
          <div className={`step-node ${step >= 1 ? 'completed' : ''} ${step === 1 ? 'active' : ''}`}>
            1
            <span className="step-label">Upload CSV</span>
          </div>
          <div className={`step-node ${step >= 2 ? 'completed' : ''} ${step === 2 ? 'active' : ''}`}>
            2
            <span className="step-label">Preview Data</span>
          </div>
          <div className={`step-node ${step >= 3 ? 'completed' : ''} ${step === 3 ? 'active' : ''}`}>
            3
            <span className="step-label">Processing</span>
          </div>
          <div className={`step-node ${step >= 4 ? 'completed' : ''} ${step === 4 ? 'active' : ''}`}>
            4
            <span className="step-label">Results</span>
          </div>
        </div>

        {/* Main interactive importer card */}
        <div className="importer-card">
          
          {/* STEP 1: UPLOAD FILE */}
          {step === 1 && (
            <div className="step-content">
              <h2 className="workspace-title" style={{ fontSize: '1.25rem', marginBottom: '8px' }}>Import Leads via CSV</h2>
              <p className="workspace-subtitle" style={{ marginBottom: '24px' }}>Upload a CSV file to bulk import leads into your system. AI will automatically map standard values.</p>

              {errorMsg && (
                <div className="alert alert-error">
                  <AlertTriangle className="alert-icon" size={18} />
                  <div>{errorMsg}</div>
                </div>
              )}

              {!file ? (
                <div 
                  className={`dropzone-container ${isDragActive ? 'active' : ''}`}
                  onDragEnter={handleDragEnter}
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input 
                    type="file" 
                    ref={fileInputRef} 
                    onChange={selectFile} 
                    accept=".csv" 
                    style={{ display: 'none' }} 
                  />
                  <div className="dropzone-icon-container">
                    <Upload size={28} />
                  </div>
                  <h3 className="dropzone-title">Drop your CSV file here</h3>
                  <p className="dropzone-subtitle">or click to browse files</p>
                  <div className="dropzone-rules-text">
                    Supported file: <strong>.csv (max 5MB)</strong>. <br />
                    Required headers: AI will intelligently map layout, but for optimal parsing, each record must have either an <strong>email</strong> or <strong>phone number</strong>.
                  </div>
                  
                  <a 
                    href="/sample_leads.csv" 
                    download
                    onClick={(e) => e.stopPropagation()} 
                    className="btn btn-secondary"
                    style={{ padding: '8px 16px', fontSize: '0.8125rem' }}
                  >
                    <Download size={14} /> Download Sample CSV Template
                  </a>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', margin: '24px 0' }}>
                  <div className="file-badge">
                    <div className="file-badge-info">
                      <FileSpreadsheet className="file-badge-icon" size={24} />
                      <div className="file-badge-details">
                        <span className="file-badge-name">{file.name}</span>
                        <span className="file-badge-size">{(file.size / 1024).toFixed(2)} KB</span>
                      </div>
                    </div>
                    <button className="file-badge-remove" onClick={removeFile} aria-label="Remove File">
                      <Trash2 size={18} />
                    </button>
                  </div>
                  
                  <div style={{ display: 'flex', gap: '12px', marginTop: '16px' }}>
                    <button className="btn btn-secondary" onClick={removeFile}>Cancel</button>
                    <button 
                      className="btn btn-primary" 
                      onClick={handleParseCsv}
                      disabled={isUploading}
                    >
                      {isUploading ? (
                        <>
                          <div className="spinner"></div> Parsing File...
                        </>
                      ) : (
                        <>
                          Upload File <ArrowRight size={16} />
                        </>
                      )}
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* STEP 2: PREVIEW RAW CSV DATA */}
          {step === 2 && (
            <div className="step-content" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h2 className="workspace-title" style={{ fontSize: '1.25rem', marginBottom: '4px' }}>Preview CSV Data</h2>
                  <p className="workspace-subtitle">Review the raw rows below before initiating AI import. No AI extraction has run yet.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={() => setStep(1)}><ArrowLeft size={16} /> Back</button>
                  <button className="btn btn-primary" onClick={() => handleStartImport()}>Confirm Import <Play size={16} /></button>
                </div>
              </div>

              {/* Alert box clarifying Heuristic vs AI fallbacks */}
              <div className="alert alert-warning">
                <Info className="alert-icon" size={20} style={{ flexShrink: 0 }} />
                <div>
                  <strong>AI Configuration Status</strong>: The backend is listening. If `GEMINI_API_KEY` is set in the backend environment, we will run full Gemini mapping. Otherwise, the server automatically defaults to high-accuracy regex-based Heuristics for seamless local testing.
                </div>
              </div>

              <div className="table-wrapper">
                <table className="data-table">
                  <thead>
                    <tr>
                      <th style={{ width: '50px' }}>#</th>
                      {previewHeaders.map((header, idx) => (
                        <th key={idx}>{header}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {pagedPreviewRows.map((row, rowIdx) => {
                      const absoluteIndex = (previewPage - 1) * pageSize + rowIdx + 1;
                      return (
                        <tr key={rowIdx}>
                          <td style={{ fontWeight: 600, color: 'var(--text-muted)' }}>{absoluteIndex}</td>
                          {previewHeaders.map((header, colIdx) => (
                            <td key={colIdx} title={String(row[header] || '')}>
                              {String(row[header] || '—')}
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              {/* Table pagination and page controls */}
              <div className="table-footer-controls">
                <span className="table-stats-text">
                  Showing {Math.min(rawRows.length, (previewPage - 1) * pageSize + 1)} to {Math.min(rawRows.length, previewPage * pageSize)} of {rawRows.length} rows
                </span>
                
                <div className="table-pagination-controls">
                  <select 
                    value={pageSize} 
                    onChange={(e) => {
                      setPageSize(Number(e.target.value));
                      setPreviewPage(1);
                    }}
                    className="btn btn-secondary"
                    style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                  >
                    <option value={10}>10 rows/page</option>
                    <option value={25}>25 rows/page</option>
                    <option value={50}>50 rows/page</option>
                  </select>

                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setPreviewPage(prev => Math.max(prev - 1, 1))}
                    disabled={previewPage === 1}
                    style={{ padding: '6px 12px' }}
                  >
                    Prev
                  </button>
                  <span className="table-stats-text" style={{ padding: '0 8px' }}>
                    Page {previewPage} of {totalPreviewPages}
                  </span>
                  <button 
                    className="btn btn-secondary" 
                    onClick={() => setPreviewPage(prev => Math.min(prev + 1, totalPreviewPages))}
                    disabled={previewPage === totalPreviewPages}
                    style={{ padding: '6px 12px' }}
                  >
                    Next
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 3: PROCESSING SCREEN */}
          {step === 3 && (
            <div className="step-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              <div>
                <h2 className="workspace-title" style={{ fontSize: '1.25rem', marginBottom: '4px' }}>AI Lead Extraction Process</h2>
                <p className="workspace-subtitle">Leads are being analyzed and mapped into GrowEasy CRM format in batches.</p>
              </div>

              {/* Progress visual card */}
              <div className="progress-card">
                <div className="progress-header">
                  <span className="progress-title">
                    {isProcessing ? 'Processing batches...' : 'Processing paused.'}
                  </span>
                  <span className="progress-percentage">
                    {Math.round((processedCount / rawRows.length) * 100)}%
                  </span>
                </div>
                
                <div className="progress-bar-bg">
                  <div 
                    className="progress-bar-fill"
                    style={{ width: `${(processedCount / rawRows.length) * 100}%` }}
                  ></div>
                </div>

                <div className="progress-details">
                  <span>Processed: <strong>{processedCount}</strong> / {rawRows.length} rows</span>
                  <span>Success: <strong style={{ color: 'var(--brand-success)' }}>{successCount}</strong> | Skipped: <strong style={{ color: 'var(--brand-gray)' }}>{skippedCount}</strong></span>
                </div>
              </div>

              {/* Log window */}
              <div>
                <h4 style={{ fontSize: '0.875rem', fontWeight: 700, marginBottom: '8px', color: 'var(--text-secondary)' }}>Log Output</h4>
                <div className="batch-log">
                  {importLogs.map((log, idx) => {
                    let logClass = '';
                    if (log.includes('✅')) logClass = 'success';
                    if (log.includes('❌')) logClass = 'error';
                    return (
                      <div key={idx} className={`batch-log-item ${logClass}`}>
                        {log}
                      </div>
                    );
                  })}
                  {isProcessing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '6px', color: 'var(--brand-primary)' }}>
                      <div className="spinner"></div> Mating with AI model...
                    </div>
                  )}
                  <div ref={logsEndRef} />
                </div>
              </div>

              {/* Actions panel */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid var(--border-color)', paddingTop: '16px' }}>
                <div>
                  {failedBatches.length > 0 && !isProcessing && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                      <span className="badge badge-danger">
                        {failedBatches.length} batches failed
                      </span>
                      <button className="btn btn-primary" onClick={handleRetryFailed}>
                        <RefreshCw size={14} /> Retry Failed Batches
                      </button>
                    </div>
                  )}
                </div>
                
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={resetWizard} disabled={isProcessing}>
                    Cancel Import
                  </button>
                  <button 
                    className="btn btn-primary" 
                    onClick={() => setStep(4)} 
                    disabled={isProcessing || processedCount === 0}
                  >
                    View Results <ArrowRight size={16} />
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* STEP 4: RESULTS DASHBOARD */}
          {step === 4 && (
            <div className="step-content" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
              
              {/* Header section with download button and refresh */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: '16px' }}>
                <div>
                  <h2 className="workspace-title" style={{ fontSize: '1.25rem', marginBottom: '4px' }}>Import Completed!</h2>
                  <p className="workspace-subtitle">Review the AI-extracted CRM records. You can download the sanitized data.</p>
                </div>
                <div style={{ display: 'flex', gap: '10px' }}>
                  <button className="btn btn-secondary" onClick={resetWizard}>
                    <PlusCircle size={16} /> Import New File
                  </button>
                  
                  {/* Download dropdown actions */}
                  <button className="btn btn-primary" onClick={() => downloadMappedData('csv')}>
                    <Download size={16} /> Export Mapped CSV
                  </button>
                  <button className="btn btn-secondary" onClick={() => downloadMappedData('json')}>
                    Export JSON
                  </button>
                </div>
              </div>

              {/* Stats widgets */}
              <div className="summary-cards-container">
                <div className="summary-card">
                  <div className="summary-card-icon-container" style={{ backgroundColor: 'var(--brand-light)', color: 'var(--brand-primary)' }}>
                    <FileSpreadsheet size={22} />
                  </div>
                  <div className="summary-card-details">
                    <span className="summary-card-title">Total Rows</span>
                    <span className="summary-card-value">{mappedResults.filter(r => r !== null).length}</span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-card-icon-container" style={{ backgroundColor: 'var(--brand-success-light)', color: 'var(--brand-success)' }}>
                    <CheckCircle size={22} />
                  </div>
                  <div className="summary-card-details">
                    <span className="summary-card-title">Imported Leads</span>
                    <span className="summary-card-value">{mappedResults.filter(r => r && r.status === 'success').length}</span>
                  </div>
                </div>

                <div className="summary-card">
                  <div className="summary-card-icon-container" style={{ backgroundColor: 'var(--brand-gray-light)', color: 'var(--brand-gray)' }}>
                    <AlertTriangle size={22} />
                  </div>
                  <div className="summary-card-details">
                    <span className="summary-card-title">Skipped Rows</span>
                    <span className="summary-card-value">{mappedResults.filter(r => r && r.status === 'skipped').length}</span>
                  </div>
                </div>
              </div>

              {/* Filters toolbar */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '12px' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button 
                    className={`btn ${resultsFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setResultsFilter('all'); setResultsPage(1); }}
                    style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
                  >
                    Show All
                  </button>
                  <button 
                    className={`btn ${resultsFilter === 'success' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setResultsFilter('success'); setResultsPage(1); }}
                    style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
                  >
                    Successfully Mapped
                  </button>
                  <button 
                    className={`btn ${resultsFilter === 'skipped' ? 'btn-primary' : 'btn-secondary'}`}
                    onClick={() => { setResultsFilter('skipped'); setResultsPage(1); }}
                    style={{ padding: '6px 14px', fontSize: '0.8125rem' }}
                  >
                    Skipped Records
                  </button>
                </div>

                {/* Local search box */}
                <div style={{ position: 'relative', width: '100%', maxWidth: '280px' }}>
                  <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-muted)' }} />
                  <input 
                    type="text" 
                    placeholder="Search name, email, contact..." 
                    value={searchQuery}
                    onChange={(e) => { setSearchQuery(e.target.value); setResultsPage(1); }}
                    style={{
                      width: '100%',
                      padding: '8px 12px 8px 36px',
                      borderRadius: 'var(--border-radius-md)',
                      border: '1px solid var(--border-color)',
                      backgroundColor: 'var(--bg-card)',
                      color: 'var(--text-primary)',
                      fontSize: '0.875rem'
                    }}
                  />
                </div>
              </div>

              {/* Clean Output CRM Table */}
              {pagedResults.length > 0 ? (
                <div className="table-wrapper">
                  <table className="data-table">
                    <thead>
                      <tr>
                        <th>Status</th>
                        <th>Lead Name</th>
                        <th>Email Address</th>
                        <th>Contact No</th>
                        <th>Date Created</th>
                        <th>Company Name</th>
                        <th>CRM Status</th>
                        <th>Data Source</th>
                        <th>Description / Skipped Reason</th>
                      </tr>
                    </thead>
                    <tbody>
                      {pagedResults.map((record, idx) => {
                        const isSuccess = record.status === 'success';
                        const d = record.data || {};
                        
                        return (
                          <tr key={idx} style={{ opacity: isSuccess ? 1 : 0.75 }}>
                            <td>
                              <span className={`badge ${isSuccess ? 'badge-success' : 'badge-danger'}`}>
                                {record.status}
                              </span>
                            </td>
                            <td style={{ fontWeight: 600 }}>{isSuccess ? d.name : '—'}</td>
                            <td>{isSuccess ? (d.email || '—') : '—'}</td>
                            <td>
                              {isSuccess && d.mobile_without_country_code ? (
                                <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px' }}>
                                  <span style={{ color: 'var(--text-muted)', fontSize: '0.8125rem' }}>{d.country_code}</span> 
                                  {d.mobile_without_country_code}
                                </span>
                              ) : '—'}
                            </td>
                            <td>{isSuccess ? (d.created_at || '—') : '—'}</td>
                            <td>{isSuccess ? (d.company || '—') : '—'}</td>
                            <td>
                              {isSuccess ? (
                                <span className={`badge ${
                                  d.crm_status === 'SALE_DONE' ? 'badge-blue' :
                                  d.crm_status === 'GOOD_LEAD_FOLLOW_UP' ? 'badge-success' :
                                  d.crm_status === 'DID_NOT_CONNECT' ? 'badge-gray' :
                                  'badge-danger' // BAD_LEAD
                                }`}>
                                  {d.crm_status.replace(/_/g, ' ')}
                                </span>
                              ) : '—'}
                            </td>
                            <td>
                              {isSuccess ? (
                                <span className="badge badge-gray" style={{ textTransform: 'none' }}>
                                  {d.data_source || 'default'}
                                </span>
                              ) : '—'}
                            </td>
                            <td 
                              style={{ 
                                color: isSuccess ? 'var(--text-secondary)' : 'var(--brand-red)', 
                                fontStyle: isSuccess ? 'normal' : 'italic' 
                              }}
                              title={isSuccess ? (d.description || d.crm_note) : record.skip_reason}
                            >
                              {isSuccess ? (d.description || d.crm_note || '—') : record.skip_reason}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px', border: '1px dashed var(--border-color)', borderRadius: 'var(--border-radius-md)', color: 'var(--text-muted)' }}>
                  <AlertTriangle size={32} style={{ marginBottom: '12px' }} />
                  <span>No results match the current filters.</span>
                </div>
              )}

              {/* Table pagination and footer */}
              {filteredResults.length > 0 && (
                <div className="table-footer-controls">
                  <span className="table-stats-text">
                    Showing {Math.min(filteredResults.length, (resultsPage - 1) * pageSize + 1)} to {Math.min(filteredResults.length, resultsPage * pageSize)} of {filteredResults.length} records
                  </span>
                  
                  <div className="table-pagination-controls">
                    <select 
                      value={pageSize} 
                      onChange={(e) => {
                        setPageSize(Number(e.target.value));
                        setResultsPage(1);
                      }}
                      className="btn btn-secondary"
                      style={{ padding: '6px 12px', fontSize: '0.8125rem' }}
                    >
                      <option value={10}>10 rows/page</option>
                      <option value={25}>25 rows/page</option>
                      <option value={50}>50 rows/page</option>
                    </select>

                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setResultsPage(prev => Math.max(prev - 1, 1))}
                      disabled={resultsPage === 1}
                      style={{ padding: '6px 12px' }}
                    >
                      Prev
                    </button>
                    <span className="table-stats-text" style={{ padding: '0 8px' }}>
                      Page {resultsPage} of {totalResultsPages}
                    </span>
                    <button 
                      className="btn btn-secondary" 
                      onClick={() => setResultsPage(prev => Math.min(prev + 1, totalResultsPages))}
                      disabled={resultsPage === totalResultsPages}
                      style={{ padding: '6px 12px' }}
                    >
                      Next
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

        </div>
      </main>
    </div>
  );
}
