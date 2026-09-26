import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, ArrowLeft, Check, Sparkles, Upload, Watch, Lock, AlertCircle } from 'lucide-react';
import api from '../services/api';

export const AssessmentPage: React.FC = () => {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Clean real user input form data
  const [formData, setFormData] = useState({
    // Step 1: Basic Profile
    age: '',
    gender: 'female',
    height: '',
    weight: '',
    // Step 2: Lifestyle
    exercise: 'moderate',
    diet: 'average',
    sleepHours: '7.0',
    smoking: 'never',
    alcohol: 'none',
    stressLevel: '5',
    // Step 3: Medical History
    hypertension: false,
    highCholesterol: false,
    previousHeartCondition: false,
    gestationalDiabetes: false,
    preDiabetes: false,
    // Step 4: Family History
    fatherDiabetes: false,
    fatherHeartDisease: false,
    motherDiabetes: false,
    motherHeartDisease: false,
    siblingDiabetes: false,
    // Step 5: Symptoms
    chestPainType: 'none',
    exerciseAngina: false,
    shortnessOfBreath: false,
    frequentUrination: false,
    unexplainedFatigue: false,
    increasedThirst: false,
    // Step 6: Vitals
    glucose: '',
    bpSystolic: '',
    bpDiastolic: '',
    heartRate: '',
    fastingGlucose: '',
    totalCholesterol: '',
    // Step 7: Lab OCR
    labReportUploaded: false,
    // Step 8: Mental Wellness
    mentalStress: '5',
    sleepQuality: 'fair',
    // Step 9: Wearable Data
    wearableSynced: false,
    dailySteps: '6000',
    restingHeartRate: '72',
  });

  // Dynamic BMI Calculation
  const heightM = parseFloat(formData.height) / 100 || 0;
  const weightKg = parseFloat(formData.weight) || 0;
  const bmi = heightM > 0 && weightKg > 0 ? (weightKg / (heightM * heightM)).toFixed(1) : '—';

  const getBmiCategory = (valStr: string) => {
    const val = parseFloat(valStr);
    if (!val || isNaN(val)) return { label: 'Enter Height & Weight', color: 'text-slate-500 bg-slate-100' };
    if (val < 18.5) return { label: 'Underweight Zone', color: 'text-amber-600 bg-amber-50' };
    if (val < 25) return { label: 'Healthy Weight Zone', color: 'text-emerald-600 bg-emerald-50' };
    if (val < 30) return { label: 'Overweight Zone', color: 'text-amber-600 bg-amber-50' };
    return { label: 'Obese Zone', color: 'text-rose-600 bg-rose-50' };
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const handleNext = () => {
    if (currentStep < 10) {
      setCurrentStep((prev) => prev + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    } else {
      handleSubmitAssessment();
    }
  };

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep((prev) => prev - 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleSubmitAssessment = async () => {
    setIsSubmitting(true);
    setErrorMsg(null);
    setLoadingStage('Connecting to RiskLens Backend API...');

    try {
      await new Promise((r) => setTimeout(r, 400));
      setLoadingStage('Evaluating Diabetes XGBoost Model & Heart Disease Logistic Model...');

      const cpMap: { [key: string]: number } = {
        none: 0,
        atypical: 1,
        typical: 2,
        'non-anginal': 3
      };

      const payload = {
        // Shared parameters
        Sex: formData.gender === 'male' ? 1 : 0,
        sex: formData.gender === 'male' ? 1 : 0,
        Age: parseFloat(formData.age) || 45,
        age: parseFloat(formData.age) || 45,
        BMI: bmi !== '—' ? parseFloat(bmi) : 25,

        // Diabetes parameters (16 features)
        HighBP: formData.hypertension || (parseFloat(formData.bpSystolic) >= 130) ? 1 : 0,
        HighChol: formData.highCholesterol || (parseFloat(formData.totalCholesterol) >= 200) ? 1 : 0,
        Smoker: formData.smoking !== 'never' ? 1 : 0,
        PhysActivity: formData.exercise !== 'low' ? 1 : 0,
        Fruits: formData.diet === 'healthy' || formData.diet === 'average' ? 1 : 0,
        Veggies: formData.diet === 'healthy' || formData.diet === 'average' ? 1 : 0,
        HvyAlcoholConsump: formData.alcohol === 'regular' ? 1 : 0,
        Stroke: formData.previousHeartCondition ? 1 : 0,
        HeartDiseaseorAttack: formData.previousHeartCondition || formData.fatherHeartDisease || formData.motherHeartDisease ? 1 : 0,
        DiffWalk: formData.exercise === 'low' || formData.shortnessOfBreath ? 1 : 0,
        GenHlth: formData.diet === 'healthy' ? 2 : formData.diet === 'average' ? 3 : 4,
        MentHlth: parseFloat(formData.mentalStress) || 5,
        PhysHlth: formData.exercise === 'high' ? 0 : 2,

        // Heart Disease parameters (7 raw fields)
        trestbps: parseFloat(formData.bpSystolic) || 120,
        chol: parseFloat(formData.totalCholesterol) || 200,
        fbs: (parseFloat(formData.glucose) > 120 || parseFloat(formData.fastingGlucose) > 120) ? 1 : 0,
        exang: formData.exerciseAngina ? 1 : 0,
        cp: cpMap[formData.chestPainType] ?? 0
      };

      setLoadingStage('Computing Per-Feature SHAP Contribution Vectors...');
      const res = await api.post('/predict', payload);
      const predictionResults = res.data;

      const fullRecord = {
        timestamp: new Date().toISOString(),
        input_payload: payload,
        results: predictionResults,
        diabetes: predictionResults.diabetes,
        heartDisease: predictionResults.heartDisease
      };

      localStorage.setItem('risklens_latest_prediction', JSON.stringify(fullRecord));
      navigate('/dashboard');
    } catch (err: any) {
      console.error('Failed to submit prediction:', err);
      setErrorMsg(err.response?.data?.detail || 'Failed to submit health assessment to backend API. Ensure backend server is running on http://localhost:8000.');
    } finally {
      setIsSubmitting(false);
    }
  };

  const stepsList = [
    'Basic Profile',
    'Lifestyle',
    'Medical History',
    'Family History',
    'Symptoms',
    'Vitals',
    'Lab Report',
    'Mental Wellness',
    'Wearables',
    'Review & Submit'
  ];

  return (
    <div className="min-h-screen bg-slate-50 py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto">
        {/* Header Branding */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-slate-900 flex items-center justify-center text-teal-400 font-bold">
              <Activity className="w-5 h-5 text-teal-400" />
            </div>
            <div>
              <h1 className="font-heading text-xl font-extrabold text-slate-900 tracking-tight">
                risk<span className="text-teal-600">Lens</span> Assessment
              </h1>
              <p className="text-xs text-slate-500 font-medium">
                Step {currentStep} of 10 — {stepsList[currentStep - 1]}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs font-semibold text-slate-500 bg-white border border-slate-200 px-3 py-1.5 rounded-lg shadow-xs flex items-center gap-1.5">
              <Lock className="w-3.5 h-3.5 text-teal-600" />
              Private & Encrypted
            </span>
          </div>
        </div>

        {/* Progress Bar */}
        <div className="mb-8">
          <div className="flex justify-between items-center mb-2">
            <span className="text-xs font-bold uppercase tracking-wider text-teal-700">
              Assessment Progress
            </span>
            <span className="text-xs font-extrabold text-slate-700">{currentStep * 10}%</span>
          </div>
          <div className="w-full bg-slate-200 h-2.5 rounded-full overflow-hidden">
            <div
              className="bg-gradient-to-r from-teal-500 via-blue-600 to-indigo-600 h-full transition-all duration-500 rounded-full"
              style={{ width: `${currentStep * 10}%` }}
            ></div>
          </div>
        </div>

        {/* Form Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/40 p-6 sm:p-10 relative">
          {errorMsg && (
            <div className="mb-6 p-4 bg-red-50 border border-red-200 text-red-700 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Step 1: Basic Profile */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Basic Profile</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Enter your physical parameters for accurate BMI and disease risk calculations.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Age (Years)
                  </label>
                  <input
                    type="number"
                    value={formData.age}
                    onChange={(e) => handleInputChange('age', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 45"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Biological Gender
                  </label>
                  <select
                    value={formData.gender}
                    onChange={(e) => handleInputChange('gender', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="female">Female</option>
                    <option value="male">Male</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Height (cm)
                  </label>
                  <input
                    type="number"
                    value={formData.height}
                    onChange={(e) => handleInputChange('height', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 168"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Weight (kg)
                  </label>
                  <input
                    type="number"
                    value={formData.weight}
                    onChange={(e) => handleInputChange('weight', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 70"
                  />
                </div>
              </div>

              {/* Calculated BMI Badge */}
              <div className="p-4 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                <div>
                  <div className="text-xs text-slate-500 font-semibold uppercase tracking-wider">
                    Calculated Body Mass Index (BMI)
                  </div>
                  <div className="text-2xl font-extrabold text-slate-900 mt-0.5">
                    {bmi} <span className="text-xs text-slate-400 font-normal">kg/m²</span>
                  </div>
                </div>
                <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${getBmiCategory(bmi).color}`}>
                  {getBmiCategory(bmi).label}
                </span>
              </div>
            </div>
          )}

          {/* Step 2: Lifestyle */}
          {currentStep === 2 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Lifestyle & Habits</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Lifestyle variables inform machine learning parameters and personalized advice.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Physical Activity Level
                  </label>
                  <select
                    value={formData.exercise}
                    onChange={(e) => handleInputChange('exercise', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="low">Low / Sedentary</option>
                    <option value="moderate">Moderate (1-3 days/week)</option>
                    <option value="high">Active (4+ days/week)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Diet Quality
                  </label>
                  <select
                    value={formData.diet}
                    onChange={(e) => handleInputChange('diet', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="poor">High processed foods</option>
                    <option value="average">Balanced diet</option>
                    <option value="healthy">Plant-rich / Mediterranean</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Average Nightly Sleep (Hours)
                  </label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.sleepHours}
                    onChange={(e) => handleInputChange('sleepHours', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Smoking History
                  </label>
                  <select
                    value={formData.smoking}
                    onChange={(e) => handleInputChange('smoking', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                  >
                    <option value="never">Never smoked</option>
                    <option value="former">Former smoker</option>
                    <option value="current">Current smoker</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Step 3: Medical History */}
          {currentStep === 3 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Medical History</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Select any pre-existing medical diagnoses.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'hypertension', label: 'Hypertension (High Blood Pressure)', desc: 'BP ≥ 130/80 mmHg' },
                  { key: 'highCholesterol', label: 'High Cholesterol (Hyperlipidemia)', desc: 'Total cholesterol ≥ 200 mg/dL' },
                  { key: 'preDiabetes', label: 'Pre-Diabetes / Borderline Glucose', desc: 'Glucose 100-125 mg/dL' },
                  { key: 'previousHeartCondition', label: 'Previous Cardiovascular Event', desc: 'Prior stroke, angina, or cardiac intervention' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-start p-4 rounded-xl border transition-all cursor-pointer ${
                      (formData as any)[item.key]
                        ? 'border-teal-500 bg-teal-50/40 text-slate-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(formData as any)[item.key]}
                      onChange={(e) => handleInputChange(item.key, e.target.checked)}
                      className="mt-1 w-4 h-4 text-teal-600 rounded-md focus:ring-teal-500"
                    />
                    <div className="ml-3">
                      <span className="text-sm block">{item.label}</span>
                      <span className="text-xs text-slate-500 block mt-0.5">{item.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 4: Family History */}
          {currentStep === 4 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Family History</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Family health history indicators.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'fatherDiabetes', label: 'Father has Type 2 Diabetes' },
                  { key: 'fatherHeartDisease', label: 'Father has Heart Disease / Stroke' },
                  { key: 'motherDiabetes', label: 'Mother has Type 2 Diabetes' },
                  { key: 'motherHeartDisease', label: 'Mother has Heart Disease / Stroke' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-center p-4 rounded-xl border transition-all cursor-pointer ${
                      (formData as any)[item.key]
                        ? 'border-teal-500 bg-teal-50/40 text-slate-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(formData as any)[item.key]}
                      onChange={(e) => handleInputChange(item.key, e.target.checked)}
                      className="w-4 h-4 text-teal-600 rounded-md focus:ring-teal-500"
                    />
                    <span className="ml-3 text-sm">{item.label}</span>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 5: Symptoms */}
          {currentStep === 5 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Current Symptoms</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Maps chest pain and exercise angina to Heart Disease model parameters.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Chest Pain / Discomfort Type
                </label>
                <select
                  value={formData.chestPainType}
                  onChange={(e) => handleInputChange('chestPainType', e.target.value)}
                  className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                >
                  <option value="none">None — No chest tightness or pain</option>
                  <option value="atypical">Atypical Angina — Occasional tightness</option>
                  <option value="typical">Typical Angina — Pressure during physical stress</option>
                  <option value="non-anginal">Non-Anginal Pain — Sharp brief pain</option>
                </select>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { key: 'exerciseAngina', label: 'Exercise-Induced Angina', desc: 'Chest tightness when walking or exercising' },
                  { key: 'shortnessOfBreath', label: 'Shortness of Breath', desc: 'Difficulty breathing during moderate activity' },
                  { key: 'frequentUrination', label: 'Frequent Urination', desc: 'Increased urge, especially at night' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-start p-4 rounded-xl border transition-all cursor-pointer ${
                      (formData as any)[item.key]
                        ? 'border-teal-500 bg-teal-50/40 text-slate-900 font-semibold'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={(formData as any)[item.key]}
                      onChange={(e) => handleInputChange(item.key, e.target.checked)}
                      className="mt-1 w-4 h-4 text-teal-600 rounded-md focus:ring-teal-500"
                    />
                    <div className="ml-3">
                      <span className="text-sm block">{item.label}</span>
                      <span className="text-xs text-slate-500 block mt-0.5">{item.desc}</span>
                    </div>
                  </label>
                ))}
              </div>
            </div>
          )}

          {/* Step 6: Vitals */}
          {currentStep === 6 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Clinical Vitals</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Quantitative inputs evaluated by XGBoost & Logistic Regression models.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Blood Glucose (mg/dL)
                  </label>
                  <input
                    type="number"
                    value={formData.glucose}
                    onChange={(e) => handleInputChange('glucose', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 115"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Total Cholesterol (mg/dL)
                  </label>
                  <input
                    type="number"
                    value={formData.totalCholesterol}
                    onChange={(e) => handleInputChange('totalCholesterol', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 210"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Systolic Blood Pressure (mmHg)
                  </label>
                  <input
                    type="number"
                    value={formData.bpSystolic}
                    onChange={(e) => handleInputChange('bpSystolic', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 130"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                    Diastolic Blood Pressure (mmHg)
                  </label>
                  <input
                    type="number"
                    value={formData.bpDiastolic}
                    onChange={(e) => handleInputChange('bpDiastolic', e.target.value)}
                    className="w-full px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-slate-900 font-semibold focus:ring-2 focus:ring-teal-500 focus:outline-none"
                    placeholder="e.g. 85"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Optional Lab Report */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Lab Report Integration</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Optional: Upload blood panel report to import glucose & cholesterol automatically.
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-200 hover:border-teal-400 rounded-2xl p-8 text-center bg-slate-50/50 transition-colors">
                <Upload className="w-10 h-10 text-teal-600 mx-auto mb-3" />
                <h3 className="font-semibold text-slate-800 text-sm">Upload Blood Panel PDF or Image</h3>
                <p className="text-xs text-slate-400 mt-1">Supports standard lab reports (PDF, PNG, JPG)</p>
              </div>
            </div>
          )}

          {/* Step 8: Mental Wellness */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Mental Wellness & Stress</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Perceived stress rating (1 = Low, 10 = High).
                </p>
              </div>

              <div>
                <input
                  type="range"
                  min="1"
                  max="10"
                  value={formData.mentalStress}
                  onChange={(e) => handleInputChange('mentalStress', e.target.value)}
                  className="w-full accent-teal-600"
                />
                <div className="flex justify-between text-xs text-slate-500 font-semibold mt-1">
                  <span>1 (Low)</span>
                  <span className="text-teal-600 font-extrabold text-sm">Rating: {formData.mentalStress}/10</span>
                  <span>10 (High)</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 9: Wearables */}
          {currentStep === 9 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Wearable Devices</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Connect Apple Health, Fitbit, or Garmin for activity streaming.
                </p>
              </div>

              <div className="p-6 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                    <Watch className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Apple Health / Fitbit Sync</h3>
                    <p className="text-xs text-slate-400">Stream resting heart rate and step counts</p>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Step 10: Review & Submit */}
          {currentStep === 10 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 text-teal-700 font-bold mb-3">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Ready to Submit Assessment</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Your inputs will be sent to the RiskLens FastAPI Backend ML pipeline.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Age</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.age || '—'} yrs</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">BMI</div>
                  <div className="text-lg font-extrabold text-slate-900">{bmi} kg/m²</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">BP Systolic</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.bpSystolic || '—'} mmHg</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Glucose</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.glucose || '—'} mg/dL</div>
                </div>
              </div>
            </div>
          )}

          {/* Nav Footer Buttons */}
          <div className="mt-10 pt-6 border-t border-slate-100 flex items-center justify-between">
            <button
              type="button"
              onClick={handlePrev}
              disabled={currentStep === 1 || isSubmitting}
              className="px-5 py-2.5 border border-slate-200 rounded-xl text-slate-700 font-semibold text-sm hover:bg-slate-50 disabled:opacity-30 disabled:cursor-not-allowed transition-all flex items-center gap-2 cursor-pointer"
            >
              <ArrowLeft className="w-4 h-4" />
              <span>Back</span>
            </button>

            <button
              type="button"
              onClick={handleNext}
              disabled={isSubmitting}
              className="px-6 py-3 bg-gradient-to-r from-slate-900 via-blue-900 to-teal-700 text-white font-bold text-sm rounded-xl shadow-lg shadow-teal-900/15 hover:shadow-teal-900/25 hover:from-slate-800 hover:to-teal-600 transition-all flex items-center gap-2 cursor-pointer"
            >
              {currentStep === 10 ? (
                <>
                  <span>Submit to Backend ML API</span>
                  <Sparkles className="w-4 h-4 text-teal-300" />
                </>
              ) : (
                <>
                  <span>Continue</span>
                  <ArrowRight className="w-4 h-4" />
                </>
              )}
            </button>
          </div>
        </div>
      </div>

      {/* Full-Screen Loading Overlay when running ML Models */}
      {isSubmitting && (
        <div className="fixed inset-0 bg-slate-950/80 backdrop-blur-md z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-8 max-w-md w-full text-center shadow-2xl space-y-6">
            <div className="relative w-20 h-20 mx-auto">
              <div className="w-20 h-20 rounded-full border-4 border-teal-100 border-t-teal-600 animate-spin"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <Activity className="w-8 h-8 text-teal-600 animate-pulse" />
              </div>
            </div>
            <div>
              <h3 className="font-heading text-xl font-bold text-slate-900">Evaluating RiskLens Backend API</h3>
              <p className="text-xs text-teal-700 font-semibold mt-2 animate-pulse">{loadingStage}</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
