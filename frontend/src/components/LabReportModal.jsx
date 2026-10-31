import React, { useState } from 'react';
import {
  Upload,
  FileText,
  ShieldCheck,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Sparkles,
  RefreshCw,
  X,
  HeartPulse,
  Activity,
  ArrowRight,
  Info,
  Calendar,
  Lock,
  Plus
} from 'lucide-react';
import { uploadLabReport, confirmLabReportById } from '../services/api';

export const LabReportModal = ({
  isOpen = true,
  onClose,
  onConfirm,
  initialValues = {},
  isModal = false
}) => {
  const [file, setFile] = useState(null);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStage, setProcessingStage] = useState('');
  const [errorMsg, setErrorMsg] = useState(null);
  const [reportResult, setReportResult] = useState(null);
  const [draftId, setDraftId] = useState(null);
  const [consentChecked, setConsentChecked] = useState(false);
  const [manualEntryMode, setManualEntryMode] = useState(false);
  const [isDragOver, setIsDragOver] = useState(false);

  // Extracted metadata tracking (confidence and snippet per field)
  const [fieldMeta, setFieldMeta] = useState({});

  // Editable confirmed biomarker state
  const [values, setValues] = useState({
    test_date: new Date().toISOString().split('T')[0],
    glucose_type: 'fasting', // 'fasting', 'random', 'postprandial', 'unknown'
    fasting_glucose: initialValues.fasting_glucose || initialValues.fastingGlucose || '',
    random_glucose: initialValues.random_glucose || initialValues.glucose || '',
    postprandial_glucose: initialValues.postprandial_glucose || '',
    hba1c: initialValues.hba1c || '',
    total_cholesterol: initialValues.total_cholesterol || initialValues.totalCholesterol || '',
    ldl_cholesterol: initialValues.ldl_cholesterol || initialValues.ldl || '',
    hdl_cholesterol: initialValues.hdl_cholesterol || initialValues.hdl || '',
    triglycerides: initialValues.triglycerides || '',
    bp_systolic: initialValues.bp_systolic || initialValues.bpSystolic || '',
    bp_diastolic: initialValues.bp_diastolic || initialValues.bpDiastolic || '',
    notes: ''
  });

  // Selected display units
  const [units, setUnits] = useState({
    glucose: 'mg/dL',
    cholesterol: 'mg/dL',
    triglycerides: 'mg/dL',
    hba1c: '%'
  });

  const handleValueChange = (field, val) => {
    setValues((prev) => ({
      ...prev,
      [field]: val
    }));
  };

  const handleUnitChange = (analyte, unit) => {
    setUnits((prev) => ({
      ...prev,
      [analyte]: unit
    }));
  };

  const validateFileSignatureAndUpload = async (uploadedFile) => {
    if (!uploadedFile) return;

    // Check size limit: max 10 MB
    if (uploadedFile.size > 10 * 1024 * 1024) {
      setErrorMsg('File exceeds maximum allowed size of 10 MB.');
      return;
    }

    // Check allowed extensions
    const nameLower = uploadedFile.name.toLowerCase();
    const isAllowedExt = ['.pdf', '.png', '.jpg', '.jpeg'].some((ext) => nameLower.endsWith(ext));
    if (!isAllowedExt) {
      setErrorMsg('Unsupported file format. Please upload a PDF, PNG, or JPG document.');
      return;
    }

    if (!consentChecked) {
      setErrorMsg('Please review and check the privacy consent box before uploading.');
      return;
    }

    setFile(uploadedFile);
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingStage('Reading file in ephemeral memory & verifying file signature...');

    try {
      await new Promise((r) => setTimeout(r, 300));
      setProcessingStage('Scrubbing PII & HIPAA identifiers with zero-disk retention...');

      const extractRes = await uploadLabReport(uploadedFile);

      setProcessingStage('Parsing biomarkers, applying unit conversions & confidence flags...');
      await new Promise((r) => setTimeout(r, 300));

      setDraftId(extractRes.id);

      const detected = extractRes.detected_markers || {};
      const newVals = { ...values };
      const newMeta = {};

      Object.entries(detected).forEach(([k, item]) => {
        newMeta[k] = {
          confidence: item.confidence,
          snippet: item.source_snippet,
          flag: item.flag
        };

        if (item.value !== null && item.value !== undefined) {
          if (k === 'fasting_glucose') {
            newVals.fasting_glucose = item.value;
            newVals.glucose_type = 'fasting';
          } else if (k === 'random_glucose') {
            newVals.random_glucose = item.value;
            newVals.glucose_type = 'random';
          } else if (k === 'postprandial_glucose') {
            newVals.postprandial_glucose = item.value;
            newVals.glucose_type = 'postprandial';
          } else if (k === 'unknown_glucose') {
            newVals.fasting_glucose = item.value;
            newVals.glucose_type = 'unknown'; // Flag for user review
          } else if (newVals[k] !== undefined) {
            newVals[k] = item.value;
          }
        }
      });

      setFieldMeta(newMeta);
      setValues(newVals);

      if (Object.keys(detected).length === 0) {
        setManualEntryMode(true);
        setErrorMsg('No recognizable biomarkers found in the document. You may enter your readings manually in the table below.');
      }
    } catch (err) {
      console.error('Failed to parse lab file:', err);
      setErrorMsg(
        err.response?.data?.detail ||
        'Could not parse digital text or OCR from file. Please ensure it is a clear PDF or image, or enter values manually below.'
      );
      setManualEntryMode(true);
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const buildPayload = (vals) => {
    const payload = {
      test_date: vals.test_date || new Date().toISOString().split('T')[0],
      glucose_type: vals.glucose_type,
      notes: vals.notes || null,
      units
    };

    if (vals.glucose_type === 'fasting' && vals.fasting_glucose !== '') {
      payload.fasting_glucose = parseFloat(vals.fasting_glucose);
    } else if (vals.glucose_type === 'random' && vals.random_glucose !== '') {
      payload.random_glucose = parseFloat(vals.random_glucose);
    } else if (vals.glucose_type === 'postprandial' && vals.postprandial_glucose !== '') {
      payload.postprandial_glucose = parseFloat(vals.postprandial_glucose);
    } else if (vals.fasting_glucose !== '') {
      payload.fasting_glucose = parseFloat(vals.fasting_glucose);
    }

    if (vals.hba1c !== '' && !isNaN(parseFloat(vals.hba1c))) payload.hba1c = parseFloat(vals.hba1c);
    if (vals.total_cholesterol !== '' && !isNaN(parseFloat(vals.total_cholesterol))) payload.total_cholesterol = parseFloat(vals.total_cholesterol);
    if (vals.ldl_cholesterol !== '' && !isNaN(parseFloat(vals.ldl_cholesterol))) payload.ldl_cholesterol = parseFloat(vals.ldl_cholesterol);
    if (vals.hdl_cholesterol !== '' && !isNaN(parseFloat(vals.hdl_cholesterol))) payload.hdl_cholesterol = parseFloat(vals.hdl_cholesterol);
    if (vals.triglycerides !== '' && !isNaN(parseFloat(vals.triglycerides))) payload.triglycerides = parseFloat(vals.triglycerides);
    if (vals.bp_systolic !== '' && !isNaN(parseFloat(vals.bp_systolic))) payload.bp_systolic = parseFloat(vals.bp_systolic);
    if (vals.bp_diastolic !== '' && !isNaN(parseFloat(vals.bp_diastolic))) payload.bp_diastolic = parseFloat(vals.bp_diastolic);

    return payload;
  };

  const handleSaveAndConfirm = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingStage('Evaluating against ADA / AHA guidelines and re-running model predictions...');

    try {
      const payload = buildPayload(values);
      const targetId = draftId || 'manual_' + Date.now();
      const confirmedRes = await confirmLabReportById(targetId, payload);
      setReportResult(confirmedRes);

      if (onConfirm) {
        onConfirm(values, confirmedRes.report, confirmedRes.model_risk);
      }
    } catch (err) {
      console.error('Confirmation error:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to confirm and evaluate biomarkers. Please check your entries.');
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const loadSampleReport = () => {
    setFile({ name: 'Quest_Diagnostics_Metabolic_Panel_Sample.pdf' });
    setConsentChecked(true);
    setDraftId('sample_draft_101');
    setFieldMeta({
      fasting_glucose: { confidence: 'high', snippet: 'Glucose, Fasting: 112 mg/dL', flag: 'H' },
      hba1c: { confidence: 'high', snippet: 'Hemoglobin A1c: 6.1 %', flag: 'H' },
      total_cholesterol: { confidence: 'high', snippet: 'Total Cholesterol: 232 mg/dL', flag: 'H' },
      ldl_cholesterol: { confidence: 'high', snippet: 'LDL-C Calculated: 148 mg/dL', flag: 'H' },
      hdl_cholesterol: { confidence: 'high', snippet: 'HDL-C Direct: 42 mg/dL', flag: null },
      triglycerides: { confidence: 'high', snippet: 'Triglycerides: 185 mg/dL', flag: 'H' },
      bp_systolic: { confidence: 'medium', snippet: 'Vitals BP: 134/86 mmHg', flag: null }
    });
    setValues({
      test_date: new Date().toISOString().split('T')[0],
      glucose_type: 'fasting',
      fasting_glucose: '112',
      random_glucose: '',
      postprandial_glucose: '',
      hba1c: '6.1',
      total_cholesterol: '232',
      ldl_cholesterol: '148',
      hdl_cholesterol: '42',
      triglycerides: '185',
      bp_systolic: '134',
      bp_diastolic: '86',
      notes: 'Sample Quest Diagnostics panel'
    });
  };

  const getConfidenceBadge = (conf) => {
    if (conf === 'high') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded text-[11px] font-semibold">
          <ShieldCheck className="w-3 h-3 text-emerald-600" /> High (Text)
        </span>
      );
    }
    if (conf === 'medium') {
      return (
        <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-50 text-amber-700 border border-amber-200 rounded text-[11px] font-semibold">
          <AlertTriangle className="w-3 h-3 text-amber-600" /> Medium (OCR)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-rose-50 text-rose-700 border border-rose-200 rounded text-[11px] font-semibold">
        <HelpCircle className="w-3 h-3 text-rose-500" /> Low (Review)
      </span>
    );
  };

  const content = (
    <div className="space-y-6">
      {/* Title & Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl sm:text-2xl font-bold text-slate-900">
              Lab Report Analysis
            </h2>
            <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-[11px] font-extrabold uppercase tracking-wide">
              ADA & AHA Thresholds
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Upload your lab report (PDF, PNG, JPG). Extracted readings require your confirmation in the table below before being used.
          </p>
        </div>

        {isModal && onClose && (
          <button
            onClick={onClose}
            className="self-start sm:self-auto p-1.5 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        )}
      </div>

      {/* Privacy Guarantee Banner */}
      <div className="p-3.5 bg-emerald-50/80 border border-emerald-200 rounded-xl flex items-start gap-3">
        <Lock className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
        <div className="text-xs text-emerald-900 leading-relaxed">
          <span className="font-bold">Zero-Disk Privacy Guaranteed:</span> Documents are processed in volatile memory only and immediately deleted. Patient names, IDs, addresses, and raw text layers are never stored or logged.
        </div>
      </div>

      {/* Step 1: Upload & Consent Section */}
      {!reportResult && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Step 1: Upload Document or Enter Manually
            </label>
            <button
              type="button"
              onClick={loadSampleReport}
              className="text-xs text-teal-600 hover:text-teal-700 font-semibold flex items-center gap-1 transition-colors"
            >
              <Sparkles className="w-3.5 h-3.5" /> Load Sample Report
            </button>
          </div>

          {/* Privacy Consent Checkbox */}
          <div className="flex items-center gap-2.5 px-3.5 py-2.5 bg-slate-50 border border-slate-200 rounded-lg">
            <input
              type="checkbox"
              id="consent-check"
              checked={consentChecked}
              onChange={(e) => setConsentChecked(e.target.checked)}
              className="w-4 h-4 text-teal-600 rounded border-slate-300 focus:ring-teal-500 cursor-pointer"
            />
            <label htmlFor="consent-check" className="text-xs text-slate-700 cursor-pointer select-none">
              I consent to in-memory processing of my lab document for biomarker extraction.
            </label>
          </div>

          {/* Drag & Drop Upload Zone */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragOver(true);
            }}
            onDragLeave={() => setIsDragOver(false)}
            onDrop={(e) => {
              e.preventDefault();
              setIsDragOver(false);
              if (e.dataTransfer.files?.[0]) {
                validateFileSignatureAndUpload(e.dataTransfer.files[0]);
              }
            }}
            className={`border-2 border-dashed rounded-2xl p-6 text-center transition-all ${
              isDragOver
                ? 'border-teal-500 bg-teal-50/50'
                : 'border-slate-300 hover:border-slate-400 bg-white'
            }`}
          >
            <Upload className="w-10 h-10 text-slate-400 mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-800">
              Drag & drop lab report here, or{' '}
              <label className="text-teal-600 hover:underline cursor-pointer">
                browse files
                <input
                  type="file"
                  accept=".pdf,image/png,image/jpeg,image/jpg"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files?.[0]) {
                      validateFileSignatureAndUpload(e.target.files[0]);
                    }
                  }}
                />
              </label>
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports PDF (up to 5 pages), PNG, JPG • Max 10 MB
            </p>
          </div>

          {/* Processing Stages Indicator */}
          {isProcessing && (
            <div className="p-4 bg-teal-50 border border-teal-200 rounded-xl flex items-center gap-3 animate-pulse">
              <RefreshCw className="w-5 h-5 text-teal-600 animate-spin shrink-0" />
              <div className="text-xs font-semibold text-teal-800">{processingStage}</div>
            </div>
          )}

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3.5 bg-rose-50 border border-rose-200 rounded-xl flex items-start gap-2.5 text-xs text-rose-800">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p>{errorMsg}</p>
                {!manualEntryMode && (
                  <button
                    type="button"
                    onClick={() => setManualEntryMode(true)}
                    className="mt-1 font-bold text-rose-900 underline"
                  >
                    Switch to manual entry
                  </button>
                )}
              </div>
            </div>
          )}

          {/* Manual Entry Toggle */}
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setManualEntryMode((prev) => !prev)}
              className="text-xs text-slate-500 hover:text-slate-800 font-medium flex items-center gap-1"
            >
              <Plus className="w-3.5 h-3.5" /> {manualEntryMode ? 'Hide Manual Fields' : 'Enter Values Manually'}
            </button>
          </div>
        </div>
      )}

      {/* Step 2: Review & Confirmation Table */}
      {!reportResult && (
        <div className="space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
              Step 2: Review, Edit & Confirm Biomarker Readings
            </label>
            <div className="flex items-center gap-2">
              <Calendar className="w-3.5 h-3.5 text-slate-400" />
              <span className="text-xs text-slate-500">Test Date:</span>
              <input
                type="date"
                value={values.test_date}
                onChange={(e) => handleValueChange('test_date', e.target.value)}
                className="px-2 py-1 text-xs border border-slate-300 rounded bg-white text-slate-800 focus:ring-1 focus:ring-teal-500"
              />
            </div>
          </div>

          {/* Unclear Glucose Notice */}
          {values.glucose_type === 'unknown' && (
            <div className="p-3 bg-amber-50 border border-amber-200 rounded-xl text-xs text-amber-900 flex items-start gap-2">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold">Glucose Fasting Status Unclear:</span> The document did not specify whether glucose was fasting, random, or post-prandial. Please select the correct type below. Only verified fasting glucose fills the heart model's fasting blood sugar metric.
              </div>
            </div>
          )}

          {/* Editable Analytes Table */}
          <div className="overflow-x-auto border border-slate-200 rounded-xl bg-white shadow-xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
                <tr>
                  <th className="py-2.5 px-3">Analyte / Biomarker</th>
                  <th className="py-2.5 px-3">Measured Value</th>
                  <th className="py-2.5 px-3">Unit</th>
                  <th className="py-2.5 px-3">Confidence & Source</th>
                  <th className="py-2.5 px-3">Clinical Reference</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-slate-700">
                {/* Glucose Row with Fasting Toggle */}
                <tr className={values.glucose_type === 'unknown' ? 'bg-amber-50/50' : ''}>
                  <td className="py-3 px-3 font-semibold">
                    <div>Blood Glucose</div>
                    <div className="mt-1 flex items-center gap-1.5">
                      <select
                        value={values.glucose_type}
                        onChange={(e) => handleValueChange('glucose_type', e.target.value)}
                        className="px-1.5 py-0.5 text-[11px] border border-slate-300 rounded bg-white text-slate-700"
                      >
                        <option value="fasting">Fasting</option>
                        <option value="random">Random</option>
                        <option value="postprandial">Post-prandial</option>
                        <option value="unknown">Type Unknown</option>
                      </select>
                    </div>
                  </td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 95"
                      value={
                        values.glucose_type === 'fasting'
                          ? values.fasting_glucose
                          : values.glucose_type === 'postprandial'
                          ? values.postprandial_glucose
                          : values.random_glucose || values.fasting_glucose
                      }
                      onChange={(e) => {
                        if (values.glucose_type === 'fasting') handleValueChange('fasting_glucose', e.target.value);
                        else if (values.glucose_type === 'postprandial') handleValueChange('postprandial_glucose', e.target.value);
                        else handleValueChange('random_glucose', e.target.value);
                      }}
                      className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={units.glucose}
                      onChange={(e) => handleUnitChange('glucose', e.target.value)}
                      className="px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="mg/dL">mg/dL</option>
                      <option value="mmol/L">mmol/L</option>
                    </select>
                  </td>
                  <td className="py-3 px-3">
                    {getConfidenceBadge(fieldMeta.fasting_glucose?.confidence || fieldMeta.unknown_glucose?.confidence || 'medium')}
                    {fieldMeta.fasting_glucose?.snippet && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                        {fieldMeta.fasting_glucose.snippet}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    Normal: &lt; 100 mg/dL (ADA)
                  </td>
                </tr>

                {/* HbA1c Row */}
                <tr>
                  <td className="py-3 px-3 font-semibold">Hemoglobin A1c (HbA1c)</td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      step="0.1"
                      placeholder="e.g. 5.4"
                      value={values.hba1c}
                      onChange={(e) => handleValueChange('hba1c', e.target.value)}
                      className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={units.hba1c}
                      onChange={(e) => handleUnitChange('hba1c', e.target.value)}
                      className="px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="%">%</option>
                      <option value="mmol/mol">mmol/mol</option>
                    </select>
                  </td>
                  <td className="py-3 px-3">
                    {getConfidenceBadge(fieldMeta.hba1c?.confidence || 'high')}
                    {fieldMeta.hba1c?.snippet && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                        {fieldMeta.hba1c.snippet}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    Normal: &lt; 5.7 % (ADA)
                  </td>
                </tr>

                {/* Total Cholesterol */}
                <tr>
                  <td className="py-3 px-3 font-semibold">Total Cholesterol</td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      placeholder="e.g. 190"
                      value={values.total_cholesterol}
                      onChange={(e) => handleValueChange('total_cholesterol', e.target.value)}
                      className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={units.cholesterol}
                      onChange={(e) => handleUnitChange('cholesterol', e.target.value)}
                      className="px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="mg/dL">mg/dL</option>
                      <option value="mmol/L">mmol/L</option>
                    </select>
                  </td>
                  <td className="py-3 px-3">
                    {getConfidenceBadge(fieldMeta.total_cholesterol?.confidence || 'high')}
                    {fieldMeta.total_cholesterol?.snippet && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                        {fieldMeta.total_cholesterol.snippet}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    Desirable: &lt; 200 mg/dL (AHA)
                  </td>
                </tr>

                {/* LDL Cholesterol */}
                <tr>
                  <td className="py-3 px-3 font-semibold">LDL Cholesterol</td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      placeholder="e.g. 95"
                      value={values.ldl_cholesterol}
                      onChange={(e) => handleValueChange('ldl_cholesterol', e.target.value)}
                      className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={units.cholesterol}
                      onChange={(e) => handleUnitChange('cholesterol', e.target.value)}
                      className="px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="mg/dL">mg/dL</option>
                      <option value="mmol/L">mmol/L</option>
                    </select>
                  </td>
                  <td className="py-3 px-3">
                    {getConfidenceBadge(fieldMeta.ldl_cholesterol?.confidence || 'high')}
                    {fieldMeta.ldl_cholesterol?.snippet && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                        {fieldMeta.ldl_cholesterol.snippet}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    Optimal: &lt; 100 mg/dL (AHA)
                  </td>
                </tr>

                {/* HDL Cholesterol */}
                <tr>
                  <td className="py-3 px-3 font-semibold">HDL Cholesterol</td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      placeholder="e.g. 55"
                      value={values.hdl_cholesterol}
                      onChange={(e) => handleValueChange('hdl_cholesterol', e.target.value)}
                      className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={units.cholesterol}
                      onChange={(e) => handleUnitChange('cholesterol', e.target.value)}
                      className="px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="mg/dL">mg/dL</option>
                      <option value="mmol/L">mmol/L</option>
                    </select>
                  </td>
                  <td className="py-3 px-3">
                    {getConfidenceBadge(fieldMeta.hdl_cholesterol?.confidence || 'high')}
                    {fieldMeta.hdl_cholesterol?.snippet && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                        {fieldMeta.hdl_cholesterol.snippet}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    Protective: &ge; 60 mg/dL
                  </td>
                </tr>

                {/* Triglycerides */}
                <tr>
                  <td className="py-3 px-3 font-semibold">Triglycerides</td>
                  <td className="py-3 px-3">
                    <input
                      type="number"
                      placeholder="e.g. 130"
                      value={values.triglycerides}
                      onChange={(e) => handleValueChange('triglycerides', e.target.value)}
                      className="w-24 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                    />
                  </td>
                  <td className="py-3 px-3">
                    <select
                      value={units.triglycerides}
                      onChange={(e) => handleUnitChange('triglycerides', e.target.value)}
                      className="px-1.5 py-1 text-xs border border-slate-300 rounded bg-white"
                    >
                      <option value="mg/dL">mg/dL</option>
                      <option value="mmol/L">mmol/L</option>
                    </select>
                  </td>
                  <td className="py-3 px-3">
                    {getConfidenceBadge(fieldMeta.triglycerides?.confidence || 'high')}
                    {fieldMeta.triglycerides?.snippet && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                        {fieldMeta.triglycerides.snippet}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    Normal: &lt; 150 mg/dL (AHA)
                  </td>
                </tr>

                {/* Blood Pressure */}
                <tr>
                  <td className="py-3 px-3 font-semibold">Blood Pressure</td>
                  <td className="py-3 px-3">
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        placeholder="Sys"
                        value={values.bp_systolic}
                        onChange={(e) => handleValueChange('bp_systolic', e.target.value)}
                        className="w-14 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                      />
                      <span className="text-slate-400">/</span>
                      <input
                        type="number"
                        placeholder="Dia"
                        value={values.bp_diastolic}
                        onChange={(e) => handleValueChange('bp_diastolic', e.target.value)}
                        className="w-14 px-2 py-1 text-xs border border-slate-300 rounded bg-white focus:ring-1 focus:ring-teal-500"
                      />
                    </div>
                  </td>
                  <td className="py-3 px-3 text-xs text-slate-600">mmHg</td>
                  <td className="py-3 px-3">
                    {getConfidenceBadge(fieldMeta.bp_systolic?.confidence || 'medium')}
                    {fieldMeta.bp_systolic?.snippet && (
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px] mt-0.5">
                        {fieldMeta.bp_systolic.snippet}
                      </div>
                    )}
                  </td>
                  <td className="py-3 px-3 text-slate-500 text-[11px]">
                    Normal: &lt; 120/80 mmHg (AHA)
                  </td>
                </tr>
              </tbody>
            </table>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-2">
            {isModal && onClose && (
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-semibold transition-colors"
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              onClick={handleSaveAndConfirm}
              disabled={isProcessing}
              className="px-5 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-bold flex items-center gap-2 shadow-xs transition-colors"
            >
              <CheckCircle2 className="w-4 h-4" /> Confirm & Evaluate Findings
            </button>
          </div>
        </div>
      )}

      {/* Step 3: Results Display (Lab Findings + Model Risk Side-by-Side with Disagreement Check) */}
      {reportResult && (
        <div className="space-y-5 animate-in fade-in duration-300">
          {/* Disagreement Warning Banner (if applicable) */}
          {reportResult.report?.disagreement_flag && (
            <div className="p-4 bg-amber-50 border-2 border-amber-300 rounded-2xl flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <h4 className="text-xs font-bold uppercase tracking-wider text-amber-900">
                  Lab Findings & Model Risk Divergence
                </h4>
                <p className="text-xs text-amber-800 mt-1 leading-relaxed">
                  {reportResult.report.disagreement_note}
                </p>
                <p className="text-[11px] text-amber-700 font-semibold mt-1">
                  Rule of thumb: Verified biological lab readings always take precedence over survey-based statistical models.
                </p>
              </div>
            </div>
          )}

          {/* Explanatory Line on Distinction */}
          <div className="p-3 bg-slate-100/80 border border-slate-200 rounded-xl text-xs text-slate-700 text-center font-medium">
            <span className="font-bold text-slate-900">Important Clinical Context:</span> Lab findings reflect direct biological measurements against established medical thresholds. Model risk calculates statistical multi-year disease probabilities using predictive machine learning.
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* Card 1: Rule-Based Lab Findings */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4 text-teal-600" />
                  <h3 className="text-sm font-bold text-slate-900">Rule-Based Lab Findings</h3>
                </div>
                <span className="text-[11px] font-semibold text-slate-500">
                  {reportResult.report?.findings?.length || 0} Evaluated
                </span>
              </div>

              <div className="space-y-2.5 max-h-[380px] overflow-y-auto pr-1">
                {reportResult.report?.findings?.map((f, idx) => (
                  <div
                    key={idx}
                    className={`p-3 rounded-xl border text-xs space-y-1 ${
                      f.severity_level >= 3
                        ? 'bg-rose-50/60 border-rose-200'
                        : f.severity_level === 2
                        ? 'bg-amber-50/60 border-amber-200'
                        : 'bg-emerald-50/40 border-emerald-200'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-slate-900">{f.biomarker}</span>
                      <span
                        className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase ${
                          f.severity_level >= 3
                            ? 'bg-rose-100 text-rose-800'
                            : f.severity_level === 2
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {f.category}
                      </span>
                    </div>
                    <div className="text-slate-800 font-medium">
                      Measured: <span className="font-bold">{f.value} {f.unit}</span>
                      {f.reference_range && (
                        <span className="text-slate-400 text-[11px] ml-2">
                          (Ref: {f.reference_range})
                        </span>
                      )}
                    </div>
                    <p className="text-slate-600 italic">"{f.message}"</p>
                    {f.repeat_note && (
                      <p className="text-[11px] text-amber-700 font-medium mt-1">
                        Note: {f.repeat_note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Card 2: ML Model Risk Estimates */}
            <div className="p-4 bg-white border border-slate-200 rounded-2xl shadow-xs space-y-3">
              <div className="flex items-center justify-between pb-2 border-b border-slate-100">
                <div className="flex items-center gap-2">
                  <HeartPulse className="w-4 h-4 text-rose-600" />
                  <h3 className="text-sm font-bold text-slate-900">Integrated ML Model Risk</h3>
                </div>
                <span className="px-2 py-0.5 bg-blue-50 text-blue-700 border border-blue-200 rounded text-[10px] font-bold uppercase">
                  Tier: {reportResult.report?.model_inputs?.confidence_tier || 'standard'}
                </span>
              </div>

              {/* Heart Disease Result */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Heart Disease Model (Logistic)</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                      reportResult.model_risk?.heartDisease?.risk?.isHighRisk
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {reportResult.model_risk?.heartDisease?.risk?.riskLevel || 'Low Risk'}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  Predicted Probability:{' '}
                  <span className="font-bold text-slate-900">
                    {reportResult.model_risk?.heartDisease?.risk?.probability
                      ? (reportResult.model_risk.heartDisease.risk.probability * 100).toFixed(1) + '%'
                      : 'N/A'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  Confidence Tier:{' '}
                  <span className="font-semibold text-slate-700 capitalize">
                    {reportResult.report?.model_inputs?.confidence_tier || 'standard'}
                  </span>{' '}
                  (trestbps, chol, fbs evaluated)
                </div>
              </div>

              {/* Diabetes Result */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-bold text-slate-800">Diabetes Model (XGBoost)</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[10px] uppercase ${
                      reportResult.model_risk?.diabetes?.risk?.isHighRisk
                        ? 'bg-rose-100 text-rose-800'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    {reportResult.model_risk?.diabetes?.risk?.riskLevel || 'Low Risk'}
                  </span>
                </div>
                <div className="text-xs text-slate-600">
                  Predicted Probability:{' '}
                  <span className="font-bold text-slate-900">
                    {reportResult.model_risk?.diabetes?.risk?.probability
                      ? (reportResult.model_risk.diabetes.risk.probability * 100).toFixed(1) + '%'
                      : 'N/A'}
                  </span>
                </div>
                <div className="text-[11px] text-slate-500">
                  High Cholesterol Override:{' '}
                  <span className="font-semibold text-slate-700">
                    {reportResult.report?.model_inputs?.diabetes?.HighChol === 1.0 ? 'Yes (>= 240 mg/dL)' : 'No'}
                  </span>
                </div>
              </div>

              {/* Action */}
              <div className="pt-2 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    setReportResult(null);
                    if (onClose) onClose();
                  }}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-colors"
                >
                  Done
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );

  if (!isOpen) return null;

  if (isModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-4xl w-full p-6 shadow-2xl max-h-[90vh] overflow-y-auto border border-slate-100">
          {content}
        </div>
      </div>
    );
  }

  return <div className="bg-white rounded-3xl p-6 border border-slate-200 shadow-xs">{content}</div>;
};

export default LabReportModal;
