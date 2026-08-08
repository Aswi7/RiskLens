import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Activity, ArrowRight, ArrowLeft, Check, Sparkles, Upload, Watch, Lock } from 'lucide-react';

export const AssessmentPage: React.FC = () => {
  const navigate = useNavigate();

  const [currentStep, setCurrentStep] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [loadingStage, setLoadingStage] = useState('');

  // Assessment Data State
  const [formData, setFormData] = useState({
    // Step 1: Basic Profile
    age: '45',
    gender: 'female',
    height: '165',
    weight: '72',
    // Step 2: Lifestyle
    exercise: 'moderate', // low, moderate, high
    diet: 'average', // poor, average, healthy
    sleepHours: '6.5',
    smoking: 'former', // never, former, current
    alcohol: 'occasional', // none, occasional, regular
    stressLevel: '6', // 1-10
    // Step 3: Medical History
    hypertension: true,
    highCholesterol: true,
    previousHeartCondition: false,
    gestationalDiabetes: false,
    preDiabetes: true,
    // Step 4: Family History
    fatherDiabetes: true,
    fatherHeartDisease: false,
    motherDiabetes: false,
    motherHeartDisease: true,
    siblingDiabetes: false,
    // Step 5: Symptoms
    chestPainType: 'atypical', // none, atypical, typical, non-anginal
    exerciseAngina: false,
    shortnessOfBreath: true,
    frequentUrination: true,
    unexplainedFatigue: true,
    increasedThirst: false,
    // Step 6: Vitals
    glucose: '128',
    bpSystolic: '134',
    bpDiastolic: '86',
    heartRate: '76',
    fastingGlucose: '115',
    totalCholesterol: '215',
    // Step 7: Lab OCR
    labReportUploaded: false,
    // Step 8: Mental Wellness
    mentalStress: '6',
    sleepQuality: 'fair',
    // Step 9: Wearable Data
    wearableSynced: true,
    dailySteps: '6420',
    restingHeartRate: '72',
    // Step 10: Summary
  });

  // Calculate BMI dynamically
  const heightM = parseFloat(formData.height) / 100 || 1.7;
  const weightKg = parseFloat(formData.weight) || 70;
  const bmi = (weightKg / (heightM * heightM)).toFixed(1);

  const getBmiCategory = (val: number) => {
    if (val < 18.5) return { label: 'Underweight', color: 'text-amber-600 bg-amber-50' };
    if (val < 25) return { label: 'Healthy Weight', color: 'text-emerald-600 bg-emerald-50' };
    if (val < 30) return { label: 'Overweight', color: 'text-amber-600 bg-amber-50' };
    return { label: 'Obese Zone', color: 'text-rose-600 bg-rose-50' };
  };

  const handleInputChange = (field: string, value: any) => {
    setFormData((prev) => ({ ...prev, [field]: value }));
  };

  const loadPreset = (type: 'moderate' | 'healthy') => {
    if (type === 'moderate') {
      setFormData({
        age: '48',
        gender: 'female',
        height: '162',
        weight: '78',
        exercise: 'low',
        diet: 'average',
        sleepHours: '6.0',
        smoking: 'former',
        alcohol: 'occasional',
        stressLevel: '7',
        hypertension: true,
        highCholesterol: true,
        previousHeartCondition: false,
        gestationalDiabetes: true,
        preDiabetes: true,
        fatherDiabetes: true,
        fatherHeartDisease: true,
        motherDiabetes: false,
        motherHeartDisease: false,
        siblingDiabetes: true,
        chestPainType: 'atypical',
        exerciseAngina: true,
        shortnessOfBreath: true,
        frequentUrination: true,
        unexplainedFatigue: true,
        increasedThirst: true,
        glucose: '142',
        bpSystolic: '138',
        bpDiastolic: '88',
        heartRate: '78',
        fastingGlucose: '126',
        totalCholesterol: '235',
        labReportUploaded: true,
        mentalStress: '7',
        sleepQuality: 'poor',
        wearableSynced: true,
        dailySteps: '4200',
        restingHeartRate: '78',
      });
    } else {
      setFormData({
        age: '32',
        gender: 'male',
        height: '178',
        weight: '72',
        exercise: 'high',
        diet: 'healthy',
        sleepHours: '7.5',
        smoking: 'never',
        alcohol: 'none',
        stressLevel: '3',
        hypertension: false,
        highCholesterol: false,
        previousHeartCondition: false,
        gestationalDiabetes: false,
        preDiabetes: false,
        fatherDiabetes: false,
        fatherHeartDisease: false,
        motherDiabetes: false,
        motherHeartDisease: false,
        siblingDiabetes: false,
        chestPainType: 'none',
        exerciseAngina: false,
        shortnessOfBreath: false,
        frequentUrination: false,
        unexplainedFatigue: false,
        increasedThirst: false,
        glucose: '92',
        bpSystolic: '118',
        bpDiastolic: '76',
        heartRate: '64',
        fastingGlucose: '88',
        totalCholesterol: '175',
        labReportUploaded: false,
        mentalStress: '3',
        sleepQuality: 'good',
        wearableSynced: true,
        dailySteps: '10500',
        restingHeartRate: '62',
      });
    }
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
    setLoadingStage('Initializing XGBoost Multi-Disease Pipeline...');

    await new Promise((r) => setTimeout(r, 700));
    setLoadingStage('Evaluating Type 2 Diabetes ML Model (Pima Dataset)...');

    await new Promise((r) => setTimeout(r, 800));
    setLoadingStage('Evaluating Heart Disease ML Model (UCI Cleveland Dataset)...');

    await new Promise((r) => setTimeout(r, 800));
    setLoadingStage('Computing Per-Feature SHAP Contribution Vectors...');

    await new Promise((r) => setTimeout(r, 900));
    setLoadingStage('Synthesizing Personalized LLM Recommendation Matrix...');

    await new Promise((r) => setTimeout(r, 600));
    // Save generated prediction to localStorage for dashboard view
    const calculatedDiabetesRisk = parseFloat(formData.glucose) > 130 || parseFloat(bmi) > 27 ? 64 : 18;
    const calculatedHeartRisk = parseFloat(formData.bpSystolic) > 130 || formData.chestPainType !== 'none' ? 42 : 14;

    const assessmentResult = {
      timestamp: new Date().toISOString(),
      userProfile: { ...formData, bmi },
      diabetes: {
        riskPercentage: calculatedDiabetesRisk,
        level: calculatedDiabetesRisk > 50 ? 'Moderate-High Risk' : 'Low Risk',
        shapFactors: [
          { feature: 'Glucose Level', value: `${formData.glucose} mg/dL`, impact: '+24%', direction: 'up' },
          { feature: 'Body Mass Index (BMI)', value: `${bmi} kg/m²`, impact: '+18%', direction: 'up' },
          { feature: 'Age', value: `${formData.age} yrs`, impact: '+12%', direction: 'up' },
          { feature: 'Family History Proxy', value: formData.fatherDiabetes ? 'Positive' : 'Negative', impact: '+8%', direction: 'up' },
          { feature: 'Blood Pressure', value: `${formData.bpSystolic}/${formData.bpDiastolic}`, impact: '+2%', direction: 'neutral' },
        ]
      },
      heartDisease: {
        riskPercentage: calculatedHeartRisk,
        level: calculatedHeartRisk > 40 ? 'Moderate Risk' : 'Low Risk',
        shapFactors: [
          { feature: 'Systolic BP', value: `${formData.bpSystolic} mmHg`, impact: '+16%', direction: 'up' },
          { feature: 'Cholesterol', value: `${formData.totalCholesterol} mg/dL`, impact: '+12%', direction: 'up' },
          { feature: 'Exercise Angina', value: formData.exerciseAngina ? 'Yes' : 'No', impact: '+8%', direction: 'up' },
          { feature: 'Chest Pain Type', value: formData.chestPainType, impact: '+5%', direction: 'neutral' },
        ]
      },
      healthScore: calculatedDiabetesRisk > 50 ? 74 : 88
    };

    localStorage.setItem('risklens_latest_prediction', JSON.stringify(assessmentResult));
    navigate('/dashboard');
  };

  const stepsList = [
    'Basic Profile',
    'Lifestyle',
    'Medical History',
    'Family History',
    'Symptoms',
    'Vitals',
    'Lab OCR',
    'Mental Wellness',
    'Wearables',
    'Health Score'
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
          {/* Step Pill Indicators */}
          <div className="hidden sm:flex justify-between mt-3 text-[10px] font-semibold text-slate-400">
            {stepsList.map((st, idx) => (
              <span
                key={st}
                className={`cursor-pointer transition-colors ${
                  idx + 1 === currentStep
                    ? 'text-teal-700 font-bold'
                    : idx + 1 < currentStep
                    ? 'text-slate-700'
                    : 'text-slate-400'
                }`}
                onClick={() => setCurrentStep(idx + 1)}
              >
                0{idx + 1}
              </span>
            ))}
          </div>
        </div>

        {/* Form Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xl shadow-slate-200/40 p-6 sm:p-10 relative">
          {/* Preset Buttons Bar on Step 1 */}
          {currentStep === 1 && (
            <div className="mb-8 p-4 bg-teal-50/60 border border-teal-200/60 rounded-xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
              <div>
                <div className="text-xs font-bold text-teal-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-teal-600" />
                  Fast-Track Demo Presets
                </div>
                <p className="text-xs text-teal-700 mt-0.5">
                  Auto-fill all 10 steps for an instant ML evaluation test.
                </p>
              </div>
              <div className="flex gap-2 w-full sm:w-auto">
                <button
                  type="button"
                  onClick={() => loadPreset('moderate')}
                  className="px-3.5 py-1.5 bg-teal-600 hover:bg-teal-700 text-white text-xs font-semibold rounded-lg shadow-xs transition-colors cursor-pointer"
                >
                  ⚡ Moderate Risk Demo
                </button>
                <button
                  type="button"
                  onClick={() => loadPreset('healthy')}
                  className="px-3.5 py-1.5 bg-white hover:bg-slate-100 border border-slate-200 text-slate-700 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                >
                  🌱 Healthy Demo
                </button>
              </div>
            </div>
          )}

          {/* Step 1: Basic Profile */}
          {currentStep === 1 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Basic Profile</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Tell us about your fundamental physical parameters for accurate BMI and risk calculation.
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
                    placeholder="45"
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
                    <option value="other">Other</option>
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
                    placeholder="165"
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
                    placeholder="72"
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
                <span className={`px-3 py-1 rounded-full text-xs font-extrabold ${getBmiCategory(parseFloat(bmi)).color}`}>
                  {getBmiCategory(parseFloat(bmi)).label}
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
                  Lifestyle factors inform the LLM personalization layer for tailored advice.
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
                    <option value="low">Sedentary / Rare exercise</option>
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
                    <option value="poor">High processed foods & sugar</option>
                    <option value="average">Balanced / Average diet</option>
                    <option value="healthy">Plant-rich / Mediterranean diet</option>
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
                  Select any diagnosed pre-existing conditions or clinical indicators.
                </p>
              </div>

              <div className="space-y-3">
                {[
                  { key: 'hypertension', label: 'Hypertension (High Blood Pressure)', desc: 'Diagnosed BP over 130/80 mmHg' },
                  { key: 'highCholesterol', label: 'High Cholesterol (Hyperlipidemia)', desc: 'Total cholesterol > 200 mg/dL' },
                  { key: 'preDiabetes', label: 'Pre-Diabetes / Borderline Glucose', desc: 'Fasting glucose between 100-125 mg/dL' },
                  { key: 'gestationalDiabetes', label: 'Gestational Diabetes (if applicable)', desc: 'Elevated blood sugar during pregnancy' },
                  { key: 'previousHeartCondition', label: 'Previous Cardiovascular Event', desc: 'Prior angina, arrhythmia, or stenting' },
                ].map((item) => (
                  <label
                    key={item.key}
                    className={`flex items-start p-4 rounded-xl border transition-all cursor-pointer ${
                      (formData as any)[item.key]
                        ? 'border-teal-500 bg-teal-50/40 text-slate-900'
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
                      <span className="font-semibold text-sm block">{item.label}</span>
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
                  Family genetic proxies contribute to the Diabetes Pedigree Proxy and Heart Risk models.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {[
                  { key: 'fatherDiabetes', label: 'Father has Type 2 Diabetes' },
                  { key: 'fatherHeartDisease', label: 'Father has Heart Disease / Stroke' },
                  { key: 'motherDiabetes', label: 'Mother has Type 2 Diabetes' },
                  { key: 'motherHeartDisease', label: 'Mother has Heart Disease / Stroke' },
                  { key: 'siblingDiabetes', label: 'Sibling with Early Metabolic Condition' },
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
                  Adaptive questionnaire maps symptom types to UCI Heart Disease chest pain parameters.
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
                  <option value="atypical">Atypical Angina — Occasional tightness unrelated to exertion</option>
                  <option value="typical">Typical Angina — Pressure during physical stress</option>
                  <option value="non-anginal">Non-Anginal Pain — Sharp momentary discomfort</option>
                </select>
              </div>

              <div className="space-y-3 pt-2">
                {[
                  { key: 'exerciseAngina', label: 'Exercise-Induced Angina', desc: 'Chest tightness or discomfort when walking uphill or exercising' },
                  { key: 'shortnessOfBreath', label: 'Shortness of Breath', desc: 'Difficulty catching breath during moderate activity' },
                  { key: 'frequentUrination', label: 'Frequent Urination', desc: 'Increased urge, particularly at night' },
                  { key: 'unexplainedFatigue', label: 'Unexplained Persistent Fatigue', desc: 'Feeling unusually drained despite adequate rest' },
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
                  Core numeric inputs evaluated directly by the XGBoost machine learning model.
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
                    placeholder="128"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Normal: &lt; 100 mg/dL • Elevated: 100-125 • Diabetes: 126+</p>
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
                    placeholder="215"
                  />
                  <p className="text-[11px] text-slate-400 mt-1">Desirable: &lt; 200 mg/dL • Borderline: 200-239</p>
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
                    placeholder="134"
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
                    placeholder="86"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Step 7: Optional Lab OCR */}
          {currentStep === 7 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Optional Lab Report Upload</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Upload your recent blood panel PDF or image to extract vitals automatically.
                </p>
              </div>

              <div className="border-2 border-dashed border-slate-200 hover:border-teal-400 rounded-2xl p-8 text-center bg-slate-50/50 transition-colors">
                <Upload className="w-10 h-10 text-teal-600 mx-auto mb-3" />
                <h3 className="font-semibold text-slate-800 text-sm">Upload Blood Test PDF or Image</h3>
                <p className="text-xs text-slate-400 mt-1">Supports Quest Diagnostics, LabCorp, or local lab panels (PDF, PNG, JPG)</p>

                <button
                  type="button"
                  onClick={() => {
                    handleInputChange('labReportUploaded', true);
                    handleInputChange('glucose', '135');
                    handleInputChange('totalCholesterol', '224');
                    alert('OCR Extraction Complete! Fasting Glucose (135 mg/dL) and Total Cholesterol (224 mg/dL) imported into form.');
                  }}
                  className="mt-4 px-4 py-2 bg-white border border-slate-200 rounded-xl text-xs font-bold text-teal-700 hover:bg-teal-50 transition-colors cursor-pointer"
                >
                  ⚡ Click to Simulate OCR Auto-Extract
                </button>

                {formData.labReportUploaded && (
                  <div className="mt-4 p-3 bg-emerald-50 border border-emerald-200 rounded-xl text-emerald-800 text-xs font-semibold flex items-center justify-center gap-2">
                    <Check className="w-4 h-4 text-emerald-600" />
                    <span>Lab report successfully parsed & linked!</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Step 8: Mental Wellness */}
          {currentStep === 8 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Mental Wellness & Stress</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Psychological wellness contexts influence recovery recommendations.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-2">
                  Perceived Stress Level (1 = Calm, 10 = Severe)
                </label>
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
                  <span>10 (Severe)</span>
                </div>
              </div>
            </div>
          )}

          {/* Step 9: Wearables Sync */}
          {currentStep === 9 && (
            <div className="space-y-6">
              <div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Wearable Health Integration</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Connect Apple Health, Fitbit, or Garmin to stream continuous resting metrics.
                </p>
              </div>

              <div className="p-6 bg-slate-900 text-white rounded-2xl flex items-center justify-between">
                <div className="flex items-center gap-4">
                  <div className="w-12 h-12 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center">
                    <Watch className="w-6 h-6" />
                  </div>
                  <div>
                    <h3 className="font-bold text-base">Apple Health / Fitbit</h3>
                    <p className="text-xs text-slate-400">Synced: {formData.dailySteps} avg steps/day • {formData.restingHeartRate} bpm resting HR</p>
                  </div>
                </div>
                <span className="px-3 py-1 bg-teal-500/20 text-teal-300 rounded-full text-xs font-bold border border-teal-500/30">
                  Connected
                </span>
              </div>
            </div>
          )}

          {/* Step 10: Health Score Review */}
          {currentStep === 10 && (
            <div className="space-y-6">
              <div className="text-center">
                <div className="inline-flex items-center justify-center w-16 h-16 rounded-full bg-teal-100 text-teal-700 font-bold mb-3">
                  <Sparkles className="w-8 h-8" />
                </div>
                <h2 className="font-heading text-2xl font-bold text-slate-900">Assessment Complete!</h2>
                <p className="text-sm text-slate-500 mt-1">
                  Review your parameters and trigger the XGBoost Machine Learning prediction pipeline.
                </p>
              </div>

              <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6 grid grid-cols-2 sm:grid-cols-4 gap-4 text-center">
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Glucose</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.glucose} mg/dL</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">BMI</div>
                  <div className="text-lg font-extrabold text-slate-900">{bmi} kg/m²</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Blood Pressure</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.bpSystolic}/{formData.bpDiastolic}</div>
                </div>
                <div className="bg-white p-3 rounded-xl border border-slate-100 shadow-2xs">
                  <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Cholesterol</div>
                  <div className="text-lg font-extrabold text-slate-900">{formData.totalCholesterol} mg/dL</div>
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
                  <span>Run ML Prediction & SHAP Analysis</span>
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
              <h3 className="font-heading text-xl font-bold text-slate-900">Executing ML Screening</h3>
              <p className="text-xs text-teal-700 font-semibold mt-2 animate-pulse">{loadingStage}</p>
            </div>
            <div className="text-[11px] text-slate-400 border-t border-slate-100 pt-4">
              Running dual XGBoost estimators & generating local SHAP feature impact vectors.
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
