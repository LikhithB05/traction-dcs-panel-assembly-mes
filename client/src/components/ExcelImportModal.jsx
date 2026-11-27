import React, { useState, useRef } from 'react';
import {
  X, UploadCloud, FileSpreadsheet, AlertCircle, CheckCircle2,
  Download, AlertTriangle, ArrowRight, RefreshCw, FileText
} from 'lucide-react';
import * as XLSX from 'xlsx';
import { api } from '../utils/api.js';

export default function ExcelImportModal({ isOpen, onClose, onImportSuccess }) {
  const fileInputRef = useRef(null);
  const [file, setFile] = useState(null);
  const [parsedRows, setParsedRows] = useState([]);
  const [validatedRows, setValidatedRows] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [error, setError] = useState('');
  const [filterView, setFilterView] = useState('all'); // 'all', 'valid', 'invalid'

  if (!isOpen) return null;

  // Reset state
  const handleReset = () => {
    setFile(null);
    setParsedRows([]);
    setValidatedRows([]);
    setSummary(null);
    setError('');
    setFilterView('all');
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  // Generate and download sample Excel template
  const downloadTemplate = () => {
    const today = new Date();
    const d1 = new Date(today);
    const d2 = new Date(today);
    d1.setDate(d1.getDate() + 14);
    d2.setDate(d2.getDate() + 21);

    const templateData = [
      {
        'Panel ID': 'TR-201',
        'Type': 'Traction',
        'Project Name': 'WAG-9 Freight Locomotive Batch 4',
        'Priority': 'High',
        'Start Date': today.toISOString().slice(0, 10),
        'Due Date': d1.toISOString().slice(0, 10)
      },
      {
        'Panel ID': 'TR-202',
        'Type': 'Traction',
        'Project Name': 'Vande Bharat Express Trainset 12',
        'Priority': 'Medium',
        'Start Date': today.toISOString().slice(0, 10),
        'Due Date': d2.toISOString().slice(0, 10)
      },
      {
        'Panel ID': 'DCS-201',
        'Type': 'DCS',
        'Project Name': 'DCS Control Cubicle Unit 8',
        'Priority': 'Low',
        'Start Date': today.toISOString().slice(0, 10),
        'Due Date': d1.toISOString().slice(0, 10)
      }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    // Set column widths
    ws['!cols'] = [
      { wch: 14 }, // Panel ID
      { wch: 12 }, // Type
      { wch: 36 }, // Project Name
      { wch: 12 }, // Priority
      { wch: 14 }, // Start Date
      { wch: 14 }  // Due Date
    ];

    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Production Plan');
    XLSX.writeFile(wb, 'BHEL_Panel_Execution_Plan_Template.xlsx');
  };

  // Parse uploaded file
  const handleFileUpload = (e) => {
    const uploadedFile = e.target.files?.[0];
    if (!uploadedFile) return;

    setError('');
    setSummary(null);
    setFile(uploadedFile);
    setLoading(true);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const data = new Uint8Array(evt.target.result);
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        
        // Convert to JSON
        const rawJson = XLSX.utils.sheet_to_json(worksheet, { defval: '', raw: false });

        if (!rawJson || rawJson.length === 0) {
          setError('The uploaded spreadsheet contains no data rows.');
          setLoading(false);
          return;
        }

        processAndValidateRows(rawJson);
      } catch (err) {
        console.error('File parse error:', err);
        setError('Failed to read spreadsheet: ' + err.message);
      } finally {
        setLoading(false);
      }
    };

    reader.onerror = () => {
      setError('Error reading file from disk.');
      setLoading(false);
    };

    reader.readAsArrayBuffer(uploadedFile);
  };

  // Normalize and validate rows on client before submission
  const processAndValidateRows = (rawRows) => {
    const today = new Date().toISOString().slice(0, 10);
    const seenIds = new Set();
    const validated = [];

    rawRows.forEach((row, idx) => {
      const rowNum = idx + 2; // Accounting for 1-based header
      // Match flexible headers
      const id = (row['Panel ID'] || row['panelId'] || row['ID'] || row['Panel Id'] || row['id'] || '').toString().trim().toUpperCase();
      const type = (row['Type'] || row['panelType'] || row['Panel Type'] || row['type'] || '').toString().trim();
      const project = (row['Project Name'] || row['project'] || row['Project'] || row['Name'] || row['Description'] || '').toString().trim();
      const priority = (row['Priority'] || row['priority'] || 'Medium').toString().trim();
      
      let startDate = (row['Start Date'] || row['startDate'] || row['start_date'] || '').toString().trim();
      let dueDate = (row['Due Date'] || row['dueDate'] || row['due_date'] || '').toString().trim();

      // Normalize date strings if parsed from Excel (e.g. MM/DD/YYYY or DD-MM-YYYY)
      const normalizeDate = (dStr) => {
        if (!dStr) return '';
        // If already YYYY-MM-DD
        if (/^\d{4}-\d{2}-\d{2}$/.test(dStr)) return dStr;
        const parsed = new Date(dStr);
        if (!isNaN(parsed.getTime())) {
          return parsed.toISOString().slice(0, 10);
        }
        return dStr;
      };

      startDate = normalizeDate(startDate) || today;
      dueDate = normalizeDate(dueDate);

      const errors = [];

      if (!id) {
        errors.push('Missing Panel ID');
      } else if (seenIds.has(id)) {
        errors.push(`Duplicate ID '${id}' in sheet`);
      } else {
        seenIds.add(id);
      }

      if (!type) {
        errors.push('Missing Type');
      } else if (!['Traction', 'DCS'].includes(type)) {
        errors.push(`Invalid Type '${type}' (must be Traction or DCS)`);
      }

      if (!project) {
        errors.push('Missing Project Name');
      }

      const validPriority = ['High', 'Medium', 'Low'].includes(priority) ? priority : 'Medium';

      if (!dueDate) {
        errors.push('Missing Due Date');
      } else if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
        errors.push(`Invalid Due Date format ('${dueDate}')`);
      }

      if (startDate && !/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
        errors.push(`Invalid Start Date format ('${startDate}')`);
      }

      if (startDate && dueDate && startDate > dueDate) {
        errors.push(`Start Date (${startDate}) cannot be after Due Date (${dueDate})`);
      }

      validated.push({
        rowNum,
        id,
        type,
        project,
        priority: validPriority,
        startDate,
        dueDate,
        isValid: errors.length === 0,
        errors
      });
    });

    setValidatedRows(validated);
  };

  // Submit valid rows to backend
  const handleConfirmImport = async () => {
    const validRows = validatedRows.filter(r => r.isValid);
    if (validRows.length === 0) {
      setError('There are no valid rows to import.');
      return;
    }

    try {
      setImporting(true);
      setError('');

      const payload = {
        panels: validRows.map(r => ({
          id: r.id,
          type: r.type,
          project: r.project,
          priority: r.priority,
          startDate: r.startDate,
          dueDate: r.dueDate
        }))
      };

      const res = await api.post('/panels/bulk-import', payload);
      setSummary(res);
      if (onImportSuccess) {
        onImportSuccess();
      }
    } catch (err) {
      console.error('Import failed:', err);
      if (err.data && err.data.errors) {
        setSummary({
          message: err.message || 'Import completed with row errors',
          totalRows: err.data.totalRows || validRows.length,
          createdCount: err.data.createdCount || 0,
          failedCount: err.data.failedCount || err.data.errors.length,
          errors: err.data.errors
        });
      } else {
        setError(err.message || 'Bulk import failed. Please verify the data.');
      }
    } finally {
      setImporting(false);
    }
  };

  // Download error report as CSV
  const downloadErrorReport = () => {
    if (!summary?.errors?.length && !invalidCount) return;

    const reportRows = summary?.errors?.length ? summary.errors : validatedRows.filter(r => !r.isValid);
    const csvContent = [
      ['Row Number', 'Panel ID', 'Error Details'].join(','),
      ...reportRows.map(r => [
        r.row || r.rowNum || '',
        `"${(r.panelId || r.id || '').replace(/"/g, '""')}"`,
        `"${(r.error || (r.errors ? r.errors.join('; ') : '')).replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `BHEL_Import_Errors_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const validCount = validatedRows.filter(r => r.isValid).length;
  const invalidCount = validatedRows.filter(r => !r.isValid).length;
  const displayedRows = validatedRows.filter(r => {
    if (filterView === 'valid') return r.isValid;
    if (filterView === 'invalid') return !r.isValid;
    return true;
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4">
      <div className="bg-white rounded-xl shadow-2xl border border-slate-300 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">
        {/* Header */}
        <div className="bg-emerald-800 text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
          <div className="flex items-center space-x-2">
            <FileSpreadsheet className="w-5 h-5" />
            <div>
              <h2 className="text-base font-bold">Bulk Execution Panel Import from Excel</h2>
              <p className="text-[11px] text-emerald-200">
                Upload manufacturing plan spreadsheet (.xlsx, .xls, .csv) to generate execution panel records
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-emerald-200 hover:text-white transition">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-5 flex-1 text-xs">
          {error && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-700 rounded-lg flex items-center space-x-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Import Summary Banner (if finished) */}
          {summary && (
            <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <CheckCircle2 className="w-5 h-5 text-emerald-600 flex-shrink-0" />
                  <span className="font-bold text-sm text-emerald-900">{summary.message}</span>
                </div>
                {summary.failedCount > 0 && (
                  <button
                    onClick={downloadErrorReport}
                    className="text-xs bg-red-100 hover:bg-red-200 text-red-800 font-bold px-3 py-1.5 rounded-lg flex items-center space-x-1 transition"
                  >
                    <Download className="w-3.5 h-3.5" />
                    <span>Download Error Report</span>
                  </button>
                )}
              </div>

              <div className="grid grid-cols-3 gap-3 text-center">
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <div className="text-[11px] text-slate-500 uppercase font-semibold">Total Rows Processed</div>
                  <div className="text-lg font-bold text-slate-800">{summary.totalRows}</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <div className="text-[11px] text-emerald-600 uppercase font-semibold">Successfully Created</div>
                  <div className="text-lg font-bold text-emerald-700">{summary.createdCount}</div>
                </div>
                <div className="bg-white p-2.5 rounded-lg border border-emerald-100">
                  <div className="text-[11px] text-amber-600 uppercase font-semibold">Failed / Skipped</div>
                  <div className="text-lg font-bold text-amber-700">{summary.failedCount}</div>
                </div>
              </div>

              {summary.errors && summary.errors.length > 0 && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 max-h-32 overflow-y-auto">
                  <div className="font-bold mb-1 flex items-center space-x-1">
                    <AlertTriangle className="w-3.5 h-3.5 text-red-600" />
                    <span>Detailed Row Failures:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px]">
                    {summary.errors.map((err, i) => (
                      <li key={i}>
                        Row {err.row || '?'}: {err.error}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}

          {/* Action Row: Download Template & File Upload */}
          {!summary && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Step 1: Template Download */}
              <div className="border border-slate-200 rounded-xl p-4 bg-slate-50/50 flex flex-col justify-between space-y-3">
                <div>
                  <div className="font-bold text-slate-800 flex items-center space-x-1.5 text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-bold text-[11px]">1</span>
                    <span>Download Excel Planning Template</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Use our verified template with pre-configured headers: Panel ID, Type (Traction/DCS), Project Name, Priority, Start Date, Due Date.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={downloadTemplate}
                  className="bg-white hover:bg-slate-100 border border-slate-300 text-slate-700 font-bold px-3.5 py-2 rounded-lg shadow-2xs transition flex items-center justify-center space-x-2 text-xs"
                >
                  <Download className="w-4 h-4 text-emerald-600" />
                  <span>Download Excel Template (.xlsx)</span>
                </button>
              </div>

              {/* Step 2: Upload File */}
              <div className="border border-dashed border-emerald-300 rounded-xl p-4 bg-emerald-50/30 flex flex-col justify-between space-y-3">
                <div>
                  <div className="font-bold text-slate-800 flex items-center space-x-1.5 text-xs uppercase tracking-wider">
                    <span className="w-5 h-5 rounded-full bg-emerald-100 text-emerald-700 flex items-center justify-center font-bold text-[11px]">2</span>
                    <span>Upload Completed Plan</span>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Select your Excel (.xlsx, .xls) or CSV plan file from your computer.
                  </p>
                </div>
                <div className="flex items-center space-x-2">
                  <input
                    type="file"
                    ref={fileInputRef}
                    onChange={handleFileUpload}
                    accept=".xlsx,.xls,.csv"
                    className="block w-full text-xs text-slate-500 file:mr-3 file:py-1.5 file:px-3 file:rounded-lg file:border-0 file:text-xs file:font-semibold file:bg-emerald-600 file:text-white hover:file:bg-emerald-700 cursor-pointer"
                  />
                  {file && (
                    <button
                      type="button"
                      onClick={handleReset}
                      className="text-slate-400 hover:text-red-500 p-1"
                      title="Clear File"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Preview and Validation Table */}
          {validatedRows.length > 0 && !summary && (
            <div className="space-y-3 pt-2">
              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-slate-200 pb-2">
                <div className="flex items-center space-x-3">
                  <span className="font-bold text-slate-800 text-xs uppercase tracking-wider">
                    Parsed Rows ({validatedRows.length})
                  </span>
                  <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-100 text-emerald-800">
                    {validCount} Valid
                  </span>
                  {invalidCount > 0 && (
                    <span className="px-2 py-0.5 rounded-full text-[11px] font-bold bg-red-100 text-red-800">
                      {invalidCount} Invalid
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-2 text-[11px]">
                  <span className="text-slate-400 font-medium">Filter Preview:</span>
                  <button
                    type="button"
                    onClick={() => setFilterView('all')}
                    className={`px-2 py-1 rounded font-semibold ${filterView === 'all' ? 'bg-slate-800 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    All ({validatedRows.length})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterView('valid')}
                    className={`px-2 py-1 rounded font-semibold ${filterView === 'valid' ? 'bg-emerald-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    Valid Only ({validCount})
                  </button>
                  <button
                    type="button"
                    onClick={() => setFilterView('invalid')}
                    className={`px-2 py-1 rounded font-semibold ${filterView === 'invalid' ? 'bg-red-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                  >
                    Invalid Only ({invalidCount})
                  </button>
                </div>
              </div>

              {/* Table Container */}
              <div className="border border-slate-200 rounded-lg overflow-hidden max-h-60 overflow-y-auto">
                <table className="min-w-full divide-y divide-slate-200 text-[11px]">
                  <thead className="bg-slate-50 font-bold text-slate-700 sticky top-0">
                    <tr>
                      <th className="py-2 px-2.5 text-center w-12">Row</th>
                      <th className="py-2 px-3 text-left">Panel ID</th>
                      <th className="py-2 px-2.5 text-left">Type</th>
                      <th className="py-2 px-3 text-left">Project Description</th>
                      <th className="py-2 px-2 text-center">Priority</th>
                      <th className="py-2 px-2.5 text-left">Start Date</th>
                      <th className="py-2 px-2.5 text-left">Due Date</th>
                      <th className="py-2 px-3 text-left">Validation Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 bg-white">
                    {displayedRows.map((r, i) => (
                      <tr key={i} className={r.isValid ? 'hover:bg-slate-50' : 'bg-red-50/40 hover:bg-red-50/60'}>
                        <td className="py-2 px-2.5 text-center font-mono text-slate-500">{r.rowNum}</td>
                        <td className="py-2 px-3 font-mono font-bold text-slate-800">{r.id || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="py-2 px-2.5 font-medium">{r.type || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="py-2 px-3 text-slate-700 truncate max-w-xs">{r.project || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="py-2 px-2 text-center">
                          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            r.priority === 'High' ? 'bg-red-100 text-red-800' :
                            r.priority === 'Low' ? 'bg-slate-100 text-slate-700' :
                            'bg-blue-100 text-blue-800'
                          }`}>
                            {r.priority}
                          </span>
                        </td>
                        <td className="py-2 px-2.5 font-mono text-slate-600">{r.startDate}</td>
                        <td className="py-2 px-2.5 font-mono text-slate-600">{r.dueDate || <span className="text-red-400 italic">empty</span>}</td>
                        <td className="py-2 px-3">
                          {r.isValid ? (
                            <span className="inline-flex items-center text-emerald-700 font-bold space-x-1">
                              <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 flex-shrink-0" />
                              <span>Ready</span>
                            </span>
                          ) : (
                            <div className="text-red-700 text-[10px] space-y-0.5">
                              {r.errors.map((err, eIdx) => (
                                <div key={eIdx} className="flex items-center space-x-1">
                                  <AlertCircle className="w-3 h-3 text-red-500 flex-shrink-0" />
                                  <span>{err}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="bg-slate-50 px-6 py-3.5 border-t border-slate-200 flex items-center justify-between flex-shrink-0">
          <div>
            {file && !summary && (
              <span className="text-xs text-slate-500 font-mono">
                {file.name} ({Math.round(file.size / 1024)} KB)
              </span>
            )}
          </div>

          <div className="flex items-center space-x-2">
            <button
              type="button"
              onClick={handleClose}
              className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-lg transition font-medium text-xs"
            >
              {summary ? 'Close' : 'Cancel'}
            </button>

            {!summary && (
              <button
                type="button"
                onClick={handleConfirmImport}
                disabled={importing || validCount === 0}
                className="px-5 py-2 bg-emerald-700 hover:bg-emerald-800 text-white font-bold rounded-lg shadow-xs transition flex items-center space-x-2 text-xs disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {importing ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>Importing Plan Records...</span>
                  </>
                ) : (
                  <>
                    <ArrowRight className="w-4 h-4" />
                    <span>Confirm Import ({validCount} Valid Panels)</span>
                  </>
                )}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
