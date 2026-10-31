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
  Info
} from 'lucide-react';
import { extractLabReport, interpretBiomarkers, confirmLabReport } from '../services/api';

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

  // Editable confirmed biomarker state
  const [values, setValues] = useState({
    bp_systolic: initialValues.bp_systolic || initialValues.bpSystolic || '',
    bp_diastolic: initialValues.bp_diastolic || initialValues.bpDiastolic || '',
    total_cholesterol: initialValues.total_cholesterol || initialValues.totalCholesterol || '',
    hdl_cholesterol: initialValues.hdl_cholesterol || initialValues.hdl || '',
    ldl_cholesterol: initialValues.ldl_cholesterol || initialValues.ldl || '',
    triglycerides: initialValues.triglycerides || '',
    fasting_glucose: initialValues.fasting_glucose || initialValues.fastingGlucose || initialValues.glucose || '',
    hba1c: initialValues.hba1c || '',
    report_date: new Date().toISOString().split('T')[0]
  });

  const handleValueChange = (field, val) => {
    setValues((prev) => ({
      ...prev,
      [field]: val
    }));
  };

  const handleFileUpload = async (uploadedFile) => {
    if (!uploadedFile) return;
    setFile(uploadedFile);
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingStage('Securely loading document into memory...');

    try {
      await new Promise((r) => setTimeout(r, 400));
      setProcessingStage('Scrubbing PII & HIPAA patient identifiers...');

      const extractRes = await extractLabReport(uploadedFile);

      setProcessingStage('Extracting biomarkers & normalizing units (mg/dL)...');
      await new Promise((r) => setTimeout(r, 350));

      const detected = extractRes.detected_markers || {};
      const newVals = { ...values };

      if (detected.bp_systolic?.value) newVals.bp_systolic = detected.bp_systolic.value;
      if (detected.bp_diastolic?.value) newVals.bp_diastolic = detected.bp_diastolic.value;
      if (detected.total_cholesterol?.value) newVals.total_cholesterol = detected.total_cholesterol.value;
      if (detected.hdl_cholesterol?.value) newVals.hdl_cholesterol = detected.hdl_cholesterol.value;
      if (detected.ldl_cholesterol?.value) newVals.ldl_cholesterol = detected.ldl_cholesterol.value;
      if (detected.triglycerides?.value) newVals.triglycerides = detected.triglycerides.value;
      if (detected.fasting_glucose?.value) newVals.fasting_glucose = detected.fasting_glucose.value;
      if (detected.hba1c?.value) newVals.hba1c = detected.hba1c.value;

      setValues(newVals);

      setProcessingStage('Evaluating against AHA / ACC / ADA clinical guidelines...');
      const cleanPayload = buildPayload(newVals);
      const interpretRes = await interpretBiomarkers(cleanPayload);
      setReportResult(interpretRes);
    } catch (err) {
      console.error('Failed to parse lab file:', err);
      setErrorMsg(
        err.response?.data?.detail ||
        'Could not parse digital text from file. Please ensure it is a clear PDF or image, or enter values manually below.'
      );
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const buildPayload = (vals) => {
    const payload = {};
    if (vals.bp_systolic !== '' && !isNaN(parseFloat(vals.bp_systolic))) payload.bp_systolic = parseFloat(vals.bp_systolic);
    if (vals.bp_diastolic !== '' && !isNaN(parseFloat(vals.bp_diastolic))) payload.bp_diastolic = parseFloat(vals.bp_diastolic);
    if (vals.total_cholesterol !== '' && !isNaN(parseFloat(vals.total_cholesterol))) payload.total_cholesterol = parseFloat(vals.total_cholesterol);
    if (vals.hdl_cholesterol !== '' && !isNaN(parseFloat(vals.hdl_cholesterol))) payload.hdl_cholesterol = parseFloat(vals.hdl_cholesterol);
    if (vals.ldl_cholesterol !== '' && !isNaN(parseFloat(vals.ldl_cholesterol))) payload.ldl_cholesterol = parseFloat(vals.ldl_cholesterol);
    if (vals.triglycerides !== '' && !isNaN(parseFloat(vals.triglycerides))) payload.triglycerides = parseFloat(vals.triglycerides);
    if (vals.fasting_glucose !== '' && !isNaN(parseFloat(vals.fasting_glucose))) payload.fasting_glucose = parseFloat(vals.fasting_glucose);
    if (vals.hba1c !== '' && !isNaN(parseFloat(vals.hba1c))) payload.hba1c = parseFloat(vals.hba1c);
    payload.report_date = vals.report_date;
    return payload;
  };

  const handleRecalculateFindings = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const payload = buildPayload(values);
      const res = await interpretBiomarkers(payload);
      setReportResult(res);
    } catch (err) {
      console.error('Failed to interpret biomarkers:', err);
      setErrorMsg('Failed to evaluate biomarkers. Please verify the entered numbers.');
    } finally {
      setIsProcessing(false);
    }
  };

  const loadSampleReport = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    setProcessingStage('Loading sample Quest Diagnostics lipid & metabolic panel...');

    const sample = {
      bp_systolic: 134,
      bp_diastolic: 86,
      total_cholesterol: 232,
      hdl_cholesterol: 42,
      ldl_cholesterol: 148,
      triglycerides: 185,
      fasting_glucose: 112,
      hba1c: 6.1,
      report_date: new Date().toISOString().split('T')[0]
    };

    setFile({ name: 'Quest_Diagnostics_Comprehensive_Metabolic_Panel.pdf' });
    setValues(sample);

    try {
      const payload = buildPayload(sample);
      const res = await interpretBiomarkers(payload);
      setReportResult(res);
    } catch (err) {
      console.error('Failed to interpret sample:', err);
    } finally {
      setIsProcessing(false);
      setProcessingStage('');
    }
  };

  const handleSaveAndConfirm = async () => {
    setIsProcessing(true);
    setErrorMsg(null);
    try {
      const payload = buildPayload(values);
      let confirmedRes = reportResult;

      // Try saving to backend database if token is present
      const token = localStorage.getItem('token');
      if (token) {
        try {
          confirmedRes = await confirmLabReport(payload);
        } catch (saveErr) {
          console.warn('Backend MongoDB persistence skipped or failed, using local interpretation:', saveErr);
          if (!confirmedRes) {
            confirmedRes = await interpretBiomarkers(payload);
          }
        }
      } else if (!confirmedRes) {
        confirmedRes = await interpretBiomarkers(payload);
      }

      if (onConfirm) {
        onConfirm(values, confirmedRes);
      }
      if (onClose) {
        onClose();
      }
    } catch (err) {
      console.error('Confirmation error:', err);
      setErrorMsg('Failed to confirm and apply biomarkers.');
    } finally {
      setIsProcessing(false);
    }
  };

  const getTierBadge = (tier) => {
    if (tier === 'high') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-full text-xs font-bold shadow-xs">
          <ShieldCheck className="w-4 h-4 text-emerald-600" />
          Verified Clinical Lab (High Confidence)
        </span>
      );
    }
    if (tier === 'partial') {
      return (
        <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-amber-50 text-amber-700 border border-amber-200 rounded-full text-xs font-bold shadow-xs">
          <AlertTriangle className="w-4 h-4 text-amber-600" />
          Partial Lab Values (Moderate Confidence)
        </span>
      );
    }
    return (
      <span className="inline-flex items-center gap-1.5 px-3 py-1 bg-slate-100 text-slate-700 border border-slate-300 rounded-full text-xs font-bold shadow-xs">
        <HelpCircle className="w-4 h-4 text-slate-500" />
        Screening Baseline (Values Imputed)
      </span>
    );
  };

  const getStatusBadge = (status) => {
    switch (status) {
      case 'optimal':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-emerald-100 text-emerald-800">Optimal</span>;
      case 'normal':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-blue-100 text-blue-800">Normal</span>;
      case 'borderline':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-amber-100 text-amber-800">Borderline</span>;
      case 'elevated':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-rose-100 text-rose-800">Elevated</span>;
      case 'critical':
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-red-600 text-white animate-pulse">Critical</span>;
      default:
        return <span className="px-2 py-0.5 text-[10px] font-bold uppercase rounded-md bg-slate-100 text-slate-700">{status}</span>;
    }
  };

  const content = (
    <div className="space-y-6">
      {/* Title & Privacy Guarantees */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="font-heading text-xl sm:text-2xl font-bold text-slate-900">
              Clinical Lab Report Integration
            </h2>
            <span className="px-2.5 py-0.5 bg-teal-50 text-teal-700 border border-teal-200 rounded-full text-[11px] font-extrabold uppercase tracking-wide">
              AHA / ADA Aligned
            </span>
          </div>
          <p className="text-xs sm:text-sm text-slate-500 mt-1">
            Upload your blood panel PDF or image to extract and verify clinical biomarkers with zero-disk retention.
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

      {/* HIPAA & Zero-Disk Privacy Banner */}
      <div className="flex items-start gap-3 p-3.5 bg-teal-50/70 border border-teal-200 rounded-2xl text-xs text-teal-900">
        <ShieldCheck className="w-5 h-5 text-teal-600 shrink-0 mt-0.5" />
        <div className="space-y-0.5">
          <p className="font-bold">Zero-Disk Retention &amp; Automatic PII Scrubbing</p>
          <p className="text-teal-800 font-medium leading-relaxed">
            Uploaded files are parsed entirely in RAM. Patient identifying information (Name, SSN, MRN, Address, Phone) is automatically scrubbed, and raw file bytes are discarded immediately after biomarker extraction.
          </p>
        </div>
      </div>

      {/* Upload Zone */}
      <div className="relative border-2 border-dashed border-slate-300 hover:border-teal-500 rounded-2xl p-6 sm:p-8 text-center bg-slate-50/70 hover:bg-teal-50/20 transition-all group">
        <input
          type="file"
          accept=".pdf,.png,.jpg,.jpeg,.webp"
          onChange={(e) => handleFileUpload(e.target.files?.[0])}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer z-10"
          disabled={isProcessing}
        />
        <div className="flex flex-col items-center justify-center space-y-3 pointer-events-none">
          <div className="w-12 h-12 rounded-2xl bg-teal-100 text-teal-600 flex items-center justify-center group-hover:scale-105 transition-transform">
            <Upload className="w-6 h-6" />
          </div>
          <div>
            <p className="text-sm font-bold text-slate-800">
              {file ? file.name : 'Drag & drop your lab report here, or click to browse'}
            </p>
            <p className="text-xs text-slate-400 mt-1">
              Supports Quest, LabCorp, or hospital blood panels (PDF, PNG, JPG, WEBP — up to 10 MB)
            </p>
          </div>
        </div>

        {/* Demo Fast-Track Button */}
        <div className="mt-4 pt-4 border-t border-slate-200/80 flex flex-wrap items-center justify-center gap-3 relative z-20">
          <button
            type="button"
            onClick={loadSampleReport}
            disabled={isProcessing}
            className="px-3 py-1.5 bg-white border border-slate-200 hover:border-teal-400 rounded-xl text-xs font-bold text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer shadow-xs flex items-center gap-1.5"
          >
            <Sparkles className="w-3.5 h-3.5 text-teal-600" />
            Load Sample Quest Lipid &amp; Glucose Panel
          </button>
        </div>
      </div>

      {/* Processing State */}
      {isProcessing && (
        <div className="flex items-center justify-center gap-3 p-4 bg-teal-50 border border-teal-200 rounded-xl text-teal-800 text-xs font-semibold animate-pulse">
          <RefreshCw className="w-4 h-4 text-teal-600 animate-spin" />
          <span>{processingStage || 'Processing lab report...'}</span>
        </div>
      )}

      {/* Error Message */}
      {errorMsg && (
        <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800">
          <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
          <div className="flex-1 font-medium">{errorMsg}</div>
        </div>
      )}

      {/* Biomarker Review & Edit Grid */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-heading text-sm font-bold text-slate-900 flex items-center gap-2">
            <Activity className="w-4 h-4 text-teal-600" />
            Extracted Clinical Biomarkers (Review &amp; Edit)
          </h3>
          <button
            type="button"
            onClick={handleRecalculateFindings}
            disabled={isProcessing}
            className="text-xs font-semibold text-teal-700 hover:underline flex items-center gap-1 cursor-pointer"
          >
            <RefreshCw className="w-3 h-3" />
            Recalculate Findings
          </button>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {/* BP Systolic */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Systolic BP (mmHg)
            </label>
            <input
              type="number"
              placeholder="e.g. 120"
              value={values.bp_systolic}
              onChange={(e) => handleValueChange('bp_systolic', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Optimal: &lt; 120 mmHg</span>
          </div>

          {/* BP Diastolic */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Diastolic BP (mmHg)
            </label>
            <input
              type="number"
              placeholder="e.g. 80"
              value={values.bp_diastolic}
              onChange={(e) => handleValueChange('bp_diastolic', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Optimal: &lt; 80 mmHg</span>
          </div>

          {/* Total Cholesterol */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Total Cholesterol (mg/dL)
            </label>
            <input
              type="number"
              placeholder="e.g. 195"
              value={values.total_cholesterol}
              onChange={(e) => handleValueChange('total_cholesterol', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Desirable: &lt; 200 mg/dL</span>
          </div>

          {/* HDL Cholesterol */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              HDL Cholesterol (mg/dL)
            </label>
            <input
              type="number"
              placeholder="e.g. 55"
              value={values.hdl_cholesterol}
              onChange={(e) => handleValueChange('hdl_cholesterol', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Optimal: ≥ 50 mg/dL</span>
          </div>

          {/* LDL Cholesterol */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              LDL Cholesterol (mg/dL)
            </label>
            <input
              type="number"
              placeholder="e.g. 95"
              value={values.ldl_cholesterol}
              onChange={(e) => handleValueChange('ldl_cholesterol', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Optimal: &lt; 100 mg/dL</span>
          </div>

          {/* Triglycerides */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Triglycerides (mg/dL)
            </label>
            <input
              type="number"
              placeholder="e.g. 130"
              value={values.triglycerides}
              onChange={(e) => handleValueChange('triglycerides', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Normal: &lt; 150 mg/dL</span>
          </div>

          {/* Fasting Glucose */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Fasting Glucose (mg/dL)
            </label>
            <input
              type="number"
              placeholder="e.g. 92"
              value={values.fasting_glucose}
              onChange={(e) => handleValueChange('fasting_glucose', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Normal: 70 - 99 mg/dL</span>
          </div>

          {/* Hemoglobin A1c */}
          <div className="p-3 bg-white border border-slate-200 rounded-xl space-y-1.5 hover:border-teal-300 transition-colors">
            <label className="text-[11px] font-bold text-slate-600 uppercase tracking-wider block">
              Hemoglobin A1c (%)
            </label>
            <input
              type="number"
              step="0.1"
              placeholder="e.g. 5.4"
              value={values.hba1c}
              onChange={(e) => handleValueChange('hba1c', e.target.value)}
              className="w-full px-2.5 py-1.5 text-sm font-bold text-slate-900 bg-slate-50 border border-slate-200 rounded-lg focus:outline-teal-600 focus:bg-white"
            />
            <span className="text-[10px] text-slate-400 block">Normal: &lt; 5.7 %</span>
          </div>
        </div>
      </div>

      {/* Clinical Findings & Tiered Confidence Report */}
      {reportResult && (
        <div className="space-y-4 pt-2">
          {/* Header Summary & Confidence Tier */}
          <div className="p-4 bg-slate-900 text-white rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-md">
            <div>
              <span className="text-[10px] font-extrabold uppercase tracking-wider text-teal-400">
                AHA / ACC / ADA Clinical Finding Summary
              </span>
              <div className="flex items-center gap-3 mt-1">
                <span className="font-heading text-lg font-bold">
                  Status: {reportResult.summary_status.toUpperCase()}
                </span>
                <span className="text-xs text-slate-300">
                  ({reportResult.total_markers_evaluated} biomarkers evaluated)
                </span>
              </div>
            </div>

            <div>
              {getTierBadge(reportResult.model_inputs?.confidence_tier)}
            </div>
          </div>

          {/* Findings Cards Table */}
          <div className="space-y-2.5">
            {reportResult.findings?.map((f, idx) => (
              <div
                key={idx}
                className="p-3.5 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-3 hover:border-slate-300 transition-colors shadow-2xs"
              >
                <div className="space-y-1 max-w-xl">
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-sm font-bold text-slate-900">
                      {f.biomarker}
                    </span>
                    {getStatusBadge(f.status)}
                    <span className="text-xs font-semibold text-slate-500">
                      Ref: {f.reference_range}
                    </span>
                  </div>
                  <p className="text-xs text-slate-700 leading-relaxed font-medium">
                    {f.clinical_finding}
                  </p>
                  <p className="text-[11px] text-teal-700 font-semibold">
                    💡 Guideline Recommendation: {f.recommendation}
                  </p>
                </div>

                <div className="text-right shrink-0">
                  <span className="text-base font-extrabold text-slate-900">
                    {f.value}
                  </span>
                  <span className="text-xs text-slate-500 ml-1">{f.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Confirmation & Save CTA */}
      <div className="pt-4 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-3">
        <p className="text-xs text-slate-500">
          Confirmed lab biomarkers will update your health profile and power clinical-grade ML disease prediction.
        </p>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          {isModal && onClose && (
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-none px-4 py-2.5 border border-slate-200 text-slate-700 hover:bg-slate-100 rounded-xl text-xs font-bold transition-colors cursor-pointer"
            >
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={handleSaveAndConfirm}
            disabled={isProcessing}
            className="flex-1 sm:flex-none px-6 py-2.5 bg-teal-600 hover:bg-teal-700 text-white rounded-xl text-xs font-extrabold shadow-md hover:shadow-lg transition-all cursor-pointer flex items-center justify-center gap-2"
          >
            <CheckCircle2 className="w-4 h-4" />
            Confirm &amp; Apply Biomarkers
          </button>
        </div>
      </div>
    </div>
  );

  if (isModal) {
    if (!isOpen) return null;
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
        <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] overflow-y-auto my-8">
          {content}
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white border border-slate-200 rounded-3xl p-6 sm:p-8 shadow-xs">
      {content}
    </div>
  );
};

export default LabReportModal;
